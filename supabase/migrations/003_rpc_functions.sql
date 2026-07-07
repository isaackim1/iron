-- ============================================================================
-- Iron — 003 controlled functions (RPCs)
--
-- Implements docs/supabase-contract.md §6. These operations have multi-row
-- invariants or privilege-crossing reads, so they are SECURITY DEFINER
-- functions instead of direct table writes:
--
--   * create_group_with_leader — group + leader membership + invite code +
--     draft week, atomically (five inserts that must not partially succeed)
--   * join_group_by_invite_code — reads invite_codes (which callers cannot),
--     inserts a forced member-role membership for auth.uid() only
--   * start_week — schedule + exactly 7 day rows, atomically
--   * publish_weekly_schedule — encodes the publish gate server-side
--   * rotate_invite_code — retire current code + generate a unique new one
--
-- Security assumptions, applying to every function here:
--   * SECURITY DEFINER runs as the migration role (table owner), which
--     bypasses RLS — so each function does its OWN authorization check on
--     auth.uid() before touching anything.
--   * search_path is pinned to '' and every reference is schema-qualified,
--     so no caller can hijack name resolution.
--   * EXECUTE is revoked from PUBLIC/anon and granted to authenticated only.
--   * Each function body is one transaction: any raise rolls back all of it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Private helpers (not exposed via PostgREST)
-- ----------------------------------------------------------------------------

-- Server-side invite code generation with collision retry. Replaces the local
-- client's unchecked `IRON-` + 4 random digits. Collisions only matter among
-- ACTIVE codes (partial unique index in 001); retired values may recur.
create or replace function private.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code     text;
  v_attempts int := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      -- ~9000 possible codes; 20 straight collisions means something is wrong.
      raise exception 'could not generate a unique invite code';
    end if;

    v_code := 'IRON-' || (1000 + floor(random() * 9000))::int::text;

    exit when not exists (
      select 1
      from public.invite_codes c
      where c.code = v_code
        and c.status = 'active'
    );
  end loop;

  return v_code;
end;
$$;

-- Create a week plus its 7 day rows. Mirrors draftWeekSchedule in
-- src/lib/store.tsx exactly: placeholder Proverbs chapters (20 + weekday),
-- Mon–Fri enabled, weekend rest, all days published, week starts as a draft
-- invisible to members. Used by create_group_with_leader and start_week.
create or replace function private.create_week_with_days(
  p_group_id   uuid,
  p_week_start date,
  p_created_by uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_schedule_id uuid;
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'week_start must be a Monday';
  end if;

  insert into public.weekly_schedules (group_id, week_start, created_by)
  values (p_group_id, p_week_start, p_created_by)
  returning id into v_schedule_id;

  insert into public.schedule_days (schedule_id, weekday, date, book, chapter, enabled)
  select
    v_schedule_id,
    w,
    p_week_start + w,
    'Proverbs',
    (20 + w)::smallint,
    w <= 4
  from generate_series(0, 6) as w;

  return v_schedule_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- create_group_with_leader
-- ----------------------------------------------------------------------------

-- The client passes p_week_start (its local current Monday) because "this
-- week" is a device-timezone concept — the server must not guess it from
-- now(). The date check lives in private.create_week_with_days.
create or replace function public.create_group_with_leader(
  p_name           text,
  p_week_start     date,
  p_name_ko        text default null,
  p_description    text default null,
  p_description_ko text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_group_id uuid;
  v_code     text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'a profile is required before creating a group';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'group name is required';
  end if;

  insert into public.groups (name, name_ko, description, description_ko, created_by)
  values (trim(p_name), p_name_ko, p_description, p_description_ko, v_uid)
  returning id into v_group_id;

  -- The creator is the group's one leader (contract §3.3: one leader per
  -- group by convention; this RPC is the only place a leader row is made).
  insert into public.memberships (group_id, user_id, role)
  values (v_group_id, v_uid, 'leader');

  v_code := private.generate_invite_code();
  insert into public.invite_codes (group_id, code, created_by)
  values (v_group_id, v_code, v_uid);

  perform private.create_week_with_days(v_group_id, p_week_start, v_uid);

  return jsonb_build_object(
    'group_id',    v_group_id,
    'invite_code', v_code
  );
end;
$$;

comment on function public.create_group_with_leader(text, date, text, text, text) is
  'Atomic: group + leader membership + invite code + current-week draft '
  'schedule with 7 day rows. The only path that creates groups (contract §6).';

-- ----------------------------------------------------------------------------
-- join_group_by_invite_code
-- ----------------------------------------------------------------------------

-- The ONLY join path. There is deliberately no INSERT policy on memberships:
-- knowing a code must not allow crafting arbitrary rows (any group, any role,
-- someone else's user_id). This function forces role = 'member' and
-- user_id = auth.uid(). It is idempotent for existing active members
-- (mirrors the local "joining the same code twice just switches" behavior)
-- and reactivates a previous 'left' row instead of duplicating.
create or replace function public.join_group_by_invite_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_group      record;
  v_membership record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'a profile is required before joining a group';
  end if;

  -- Privilege-crossing read: callers cannot select invite_codes; this lookup
  -- runs with definer rights and is the single place code validity ("active
  -- and not expired") is evaluated.
  select g.id, g.name, g.name_ko
    into v_group
  from public.invite_codes c
  join public.groups g on g.id = c.group_id
  where c.code = upper(trim(p_code))
    and c.status = 'active'
    and (c.expires_at is null or c.expires_at > now())
    and g.status = 'active';

  if not found then
    raise exception 'invalid or expired invite code';
  end if;

  select m.id, m.status, m.role
    into v_membership
  from public.memberships m
  where m.group_id = v_group.id
    and m.user_id  = v_uid
  for update;

  if found then
    if v_membership.status = 'active' then
      null;  -- already a member: idempotent, fall through and return the group
    elsif v_membership.status = 'left' then
      -- Reactivate as a plain member (contract §5): history is kept on the
      -- same row, role does not carry over.
      update public.memberships
      set status = 'active', role = 'member'
      where id = v_membership.id;
    else
      -- status = 'removed'. Removal doesn't exist in the app yet; when it
      -- ships, rejoin semantics must be decided deliberately (contract §10,
      -- open decision #2), so fail closed rather than silently readmitting.
      raise exception 'invalid or expired invite code';
    end if;
  else
    insert into public.memberships (group_id, user_id, role)
    values (v_group.id, v_uid, 'member');
  end if;

  return jsonb_build_object(
    'group_id', v_group.id,
    'name',     v_group.name,
    'name_ko',  v_group.name_ko
  );
end;
$$;

comment on function public.join_group_by_invite_code(text) is
  'The only join path (contract §6). Forces member role and own user_id; '
  'idempotent for existing members; reactivates left rows; fails closed for '
  'removed members pending the removal product decision.';

-- ----------------------------------------------------------------------------
-- start_week
-- ----------------------------------------------------------------------------

-- Not in the original four, but a contract §6 must-have: a week is a schedule
-- row PLUS exactly 7 day rows, which cannot be created atomically through
-- direct table writes (hence no INSERT policies on either table).
create or replace function public.start_week(
  p_group_id   uuid,
  p_week_start date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not private.is_group_leader(p_group_id, v_uid) then
    raise exception 'only the group leader can start a week';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.status = 'active'
  ) then
    raise exception 'group is not active';
  end if;

  begin
    return private.create_week_with_days(p_group_id, p_week_start, v_uid);
  exception
    when unique_violation then
      raise exception 'a schedule for this week already exists';
  end;
end;
$$;

comment on function public.start_week(uuid, date) is
  'Leader-only: creates the (group, week_start) schedule with its 7 draft day '
  'rows atomically (contract §6).';

-- ----------------------------------------------------------------------------
-- publish_weekly_schedule
-- ----------------------------------------------------------------------------

create or replace function public.publish_weekly_schedule(p_schedule_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_schedule record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select w.id, w.group_id, w.status, w.prayer_point
    into v_schedule
  from public.weekly_schedules w
  where w.id = p_schedule_id
  for update;

  if not found then
    raise exception 'schedule not found';
  end if;

  if not private.is_group_leader(v_schedule.group_id, v_uid) then
    raise exception 'only the group leader can publish a week';
  end if;

  -- Idempotent, and deliberately so: published_at is set exactly once and
  -- never overwritten — re-publishing would reset it and break the
  -- updated_at > published_at post-publish-edit signal (contract §10,
  -- decided #1).
  if v_schedule.status = 'published' then
    return;
  end if;

  -- The publish gate (mirrors manage.tsx): no prayer point, no publish.
  if length(trim(v_schedule.prayer_point)) = 0 then
    raise exception 'a prayer point is required before publishing';
  end if;

  update public.weekly_schedules
  set status = 'published', published_at = now()
  where id = p_schedule_id;
end;
$$;

comment on function public.publish_weekly_schedule(uuid) is
  'Leader-only publish with the non-empty-prayer-point gate. Idempotent; '
  'never overwrites published_at (contract §6, §10 decided #1).';

-- ----------------------------------------------------------------------------
-- rotate_invite_code
-- ----------------------------------------------------------------------------

create or replace function public.rotate_invite_code(p_group_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not private.is_group_leader(p_group_id, v_uid) then
    raise exception 'only the group leader can rotate the invite code';
  end if;

  update public.invite_codes
  set status = 'rotated'
  where group_id = p_group_id
    and status = 'active';

  v_code := private.generate_invite_code();

  insert into public.invite_codes (group_id, code, created_by)
  values (p_group_id, v_code, v_uid);

  return jsonb_build_object('invite_code', v_code);
end;
$$;

comment on function public.rotate_invite_code(uuid) is
  'Leader-only: retires the current active code and issues a new unique one. '
  'Old rows are kept as an audit of how people joined (contract §3.4, §6).';

-- ----------------------------------------------------------------------------
-- Deferred RPCs — deliberately NOT implemented (contract §6 "maybe" +
-- §10 open decisions). Stubs would suggest callable surface that must not
-- exist yet, so these are TODOs only:
--
--   * leave_group(group_id)    — needs open decision #1 (can members leave?
--     what happens to their shared reflections?); must refuse when the caller
--     is the group's leader (a group cannot lose its leader).
--   * remove_member(...)       — needs open decision #2, plus rejoin
--     semantics for status = 'removed' (see join RPC above).
--   * archive_group(group_id)  — leader-only status flip exists via direct
--     UPDATE today; becomes an RPC if archiving ever cascades (revoke codes).
--   * transfer_leadership(...) — needs open decision #8 (leader handover).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Grants: authenticated users only. Supabase default privileges auto-grant
-- EXECUTE to anon on new public functions, so revoke explicitly.
-- ----------------------------------------------------------------------------

revoke execute on function public.create_group_with_leader(text, date, text, text, text) from public, anon;
revoke execute on function public.join_group_by_invite_code(text)                        from public, anon;
revoke execute on function public.start_week(uuid, date)                                 from public, anon;
revoke execute on function public.publish_weekly_schedule(uuid)                          from public, anon;
revoke execute on function public.rotate_invite_code(uuid)                               from public, anon;

grant execute on function public.create_group_with_leader(text, date, text, text, text) to authenticated;
grant execute on function public.join_group_by_invite_code(text)                        to authenticated;
grant execute on function public.start_week(uuid, date)                                 to authenticated;
grant execute on function public.publish_weekly_schedule(uuid)                          to authenticated;
grant execute on function public.rotate_invite_code(uuid)                               to authenticated;
