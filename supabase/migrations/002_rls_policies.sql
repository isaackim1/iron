-- ============================================================================
-- Iron — 002 row level security
--
-- Implements docs/supabase-contract.md §5. General posture: RLS ON for every
-- table, DENY BY DEFAULT. Where a write path is missing below, that is
-- intentional — the operation either goes through an RPC (003) or does not
-- exist in the product (e.g. deleting reflections, un-tapping an Amen).
--
-- Two rules that are deliberately NOT here:
--   * The feed's "respond before you see today's reflections" gate is a UX
--     rule and stays client-side (contract §5) — members are still authorized
--     to read shared content.
--   * Nothing is readable by anon. Iron has no anonymous surface and no
--     public discovery of any kind.
--
-- Security note: the private.* helpers are SECURITY DEFINER so membership
-- lookups inside policies do not recurse into memberships' own policies.
-- They are owned by the migration role (table owner), which bypasses RLS;
-- search_path is pinned and all references are schema-qualified.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere
-- ----------------------------------------------------------------------------

alter table public.profiles                 enable row level security;
alter table public.groups                   enable row level security;
alter table public.memberships              enable row level security;
alter table public.invite_codes             enable row level security;
alter table public.weekly_schedules         enable row level security;
alter table public.schedule_days            enable row level security;
alter table public.reflections              enable row level security;
alter table public.amen_responses           enable row level security;
alter table public.notification_preferences enable row level security;

-- Defense in depth: no anonymous access at all, independent of RLS. (Blanket
-- revoke is safe here — at this point the schema contains only Iron tables.)
revoke all on all tables in schema public from anon;

-- ----------------------------------------------------------------------------
-- Helper predicates (private schema — not exposed via PostgREST)
-- ----------------------------------------------------------------------------

-- "Member of a group" = membership row with status = 'active' (contract §5).
create or replace function private.is_active_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.group_id = p_group_id
      and m.user_id  = p_user_id
      and m.status   = 'active'
  );
$$;

-- "Leader of a group" = active member with role = 'leader'.
create or replace function private.is_group_leader(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.group_id = p_group_id
      and m.user_id  = p_user_id
      and m.role     = 'leader'
      and m.status   = 'active'
  );
$$;

-- Two users share at least one group where both are active members. Drives
-- profile visibility (names in feed / members list / Amen line) without any
-- global profile discovery.
create or replace function private.shares_group_with(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships a
    join public.memberships b on b.group_id = a.group_id
    where a.user_id = p_user_a and a.status = 'active'
      and b.user_id = p_user_b and b.status = 'active'
  );
$$;

-- The "visible scheduled day" rule (contract §5), used by the INSERT policies
-- on reflections and amen_responses. A user may respond to a day iff:
--   * the day exists, belongs to the claimed group, and matches the claimed
--     date (so denormalized columns cannot lie),
--   * the group is active (archived groups stop accepting responses),
--   * the day is enabled (rest days take no responses), and
--   * for the group's leader: nothing more (leaders respond to their own
--     drafts, matching sel.todayVisibleDay in src/lib/store.tsx);
--     for members: the week is published AND the day is published.
-- This check applies at INSERT TIME ONLY — hiding a day later never affects
-- existing rows (contract §10, decided #2).
create or replace function private.can_respond_to_day(
  p_day_id   uuid,
  p_group_id uuid,
  p_date     date,
  p_user_id  uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.schedule_days d
    join public.weekly_schedules w on w.id = d.schedule_id
    join public.groups g           on g.id = w.group_id
    where d.id       = p_day_id
      and w.group_id = p_group_id
      and g.status   = 'active'
      and d.date     = p_date
      and d.enabled
      and (
        private.is_group_leader(w.group_id, p_user_id)
        or (
          w.status = 'published'
          and d.published
          and private.is_active_member(w.group_id, p_user_id)
        )
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------

-- Read: own profile, plus people who share at least one group. Never global.
create policy "profiles_select_own_or_groupmate"
  on public.profiles
  for select
  using (
    id = (select auth.uid())
    or private.shares_group_with(id, (select auth.uid()))
  );

-- Insert: own row only, once, at signup (id must equal auth.uid()).
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (id = (select auth.uid()));

-- Update: own row only. Which columns is narrowed by grants below.
create policy "profiles_update_own"
  on public.profiles
  for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- groups
-- ----------------------------------------------------------------------------

-- Read: members only — non-members cannot read even the name. (Invite-code
-- join learns the group name through the join RPC, not a table read.)
create policy "groups_select_member"
  on public.groups
  for select
  using (private.is_active_member(id, (select auth.uid())));

-- Update: leader only. Columns narrowed by grants below (name/description/
-- status). No status check: archiving and unarchiving are both leader edits.
create policy "groups_update_leader"
  on public.groups
  for update
  using (private.is_group_leader(id, (select auth.uid())))
  with check (private.is_group_leader(id, (select auth.uid())));

-- No INSERT policy: group creation is the create_group_with_leader RPC (003),
-- which atomically seeds the leader membership, invite code, and draft week.
-- No DELETE policy: groups archive, never delete.

-- ----------------------------------------------------------------------------
-- memberships
-- ----------------------------------------------------------------------------

-- Read: members see all membership rows of their groups (member lists,
-- "x of n responded").
create policy "memberships_select_groupmate"
  on public.memberships
  for select
  using (private.is_active_member(group_id, (select auth.uid())));

-- No INSERT/UPDATE/DELETE policies — deliberately. Joining goes through the
-- join RPC (knowing a code must not allow crafting arbitrary membership rows:
-- any group, any role, someone else's user_id). Leave/remove/role changes do
-- not exist in the app yet and will ship as RPCs when decided (contract §10).

-- ----------------------------------------------------------------------------
-- invite_codes
-- ----------------------------------------------------------------------------

-- Read: the group's leader only (the invite screen is leader-facing).
-- Joiners never read this table — the join RPC does the lookup.
create policy "invite_codes_select_leader"
  on public.invite_codes
  for select
  using (private.is_group_leader(group_id, (select auth.uid())));

-- No INSERT/UPDATE/DELETE policies: creation happens inside the create-group
-- RPC, rotation inside rotate_invite_code (003). Rows are never deleted.

-- ----------------------------------------------------------------------------
-- weekly_schedules
-- ----------------------------------------------------------------------------

-- Read: leaders see all weeks of their groups (including drafts); members see
-- only published weeks. Drafts are structurally invisible to members.
create policy "weekly_schedules_select_leader"
  on public.weekly_schedules
  for select
  using (private.is_group_leader(group_id, (select auth.uid())));

create policy "weekly_schedules_select_member_published"
  on public.weekly_schedules
  for select
  using (
    status = 'published'
    and private.is_active_member(group_id, (select auth.uid()))
  );

-- Update: leader only. Deliberately NO status check — published weeks stay
-- editable in MVP (contract §10, decided #1); updated_at > published_at is
-- the post-publish-edit signal. Columns narrowed by grants below (prayer
-- point / announcement only; status and published_at flip via the publish
-- RPC, week_start/group_id are immutable).
create policy "weekly_schedules_update_leader"
  on public.weekly_schedules
  for update
  using (private.is_group_leader(group_id, (select auth.uid())))
  with check (private.is_group_leader(group_id, (select auth.uid())));

-- No INSERT policy: starting a week is the start_week RPC (003), which
-- creates the schedule plus exactly 7 day rows atomically. No DELETE.

-- ----------------------------------------------------------------------------
-- schedule_days
-- ----------------------------------------------------------------------------

-- Read (leader): all seven rows of any week of groups they lead.
create policy "schedule_days_select_leader"
  on public.schedule_days
  for select
  using (
    exists (
      select 1
      from public.weekly_schedules w
      where w.id = schedule_days.schedule_id
        and private.is_group_leader(w.group_id, (select auth.uid()))
    )
  );

-- Read (member): only enabled + published days of published weeks. Hidden and
-- rest days are structurally invisible to members, matching the app's route
-- guards. NOTE: this does not affect reflections/Amens written earlier —
-- their read policies below never consult the day's current flags, and
-- reflections carry passage snapshots so they render without this row
-- (contract §10, decided #2 and #4).
create policy "schedule_days_select_member_visible"
  on public.schedule_days
  for select
  using (
    schedule_days.enabled
    and schedule_days.published
    and exists (
      select 1
      from public.weekly_schedules w
      where w.id = schedule_days.schedule_id
        and w.status = 'published'
        and private.is_active_member(w.group_id, (select auth.uid()))
    )
  );

-- Update: leader only, including after the week is published (decided #1).
-- Columns narrowed by grants below (passage + flags; weekday/date/schedule_id
-- are immutable to clients).
create policy "schedule_days_update_leader"
  on public.schedule_days
  for update
  using (
    exists (
      select 1
      from public.weekly_schedules w
      where w.id = schedule_days.schedule_id
        and private.is_group_leader(w.group_id, (select auth.uid()))
    )
  )
  with check (
    exists (
      select 1
      from public.weekly_schedules w
      where w.id = schedule_days.schedule_id
        and private.is_group_leader(w.group_id, (select auth.uid()))
    )
  );

-- No INSERT policy (rows are created by the start_week RPC, always 7).
-- No DELETE policy (enabled/published are the only toggles).

-- ----------------------------------------------------------------------------
-- reflections
-- ----------------------------------------------------------------------------

-- Read: THE WHOLE read story (contract §5, decided #2/#4) — visibility +
-- membership only, never the referenced day's current flags or week status:
--   * private → owner only, no leader override;
--   * shared  → owner + active members of the group.
-- So reflections written against a day that is later hidden stay readable.
create policy "reflections_select_own_or_shared_groupmate"
  on public.reflections
  for select
  using (
    user_id = (select auth.uid())
    or (
      visibility = 'shared'
      and private.is_active_member(group_id, (select auth.uid()))
    )
  );

-- Insert: only as oneself, only for a visible scheduled day of the claimed
-- group/date (the helper also enforces the leader/member visibility split and
-- that the group is active). The snapshot-matches-day rule is the trigger in
-- 001 (integrity), this policy is authorization.
create policy "reflections_insert_own_visible_day"
  on public.reflections
  for insert
  with check (
    user_id = (select auth.uid())
    and private.can_respond_to_day(
      schedule_day_id, group_id, reflections.date, (select auth.uid())
    )
  );

-- Update: owner only. Columns narrowed by grants below (body / visibility /
-- highlighted_verses; date, passage snapshot, group and author are immutable,
-- matching the local edit behavior).
create policy "reflections_update_own"
  on public.reflections
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No DELETE policy: deletion is not in the product yet (contract §10 open
-- decision — hard delete is the recommendation if it ships).

-- ----------------------------------------------------------------------------
-- amen_responses
-- ----------------------------------------------------------------------------

-- Read: group members (Amen line, responded counts). As with reflections,
-- readability never depends on the day's current flags — the visible-day
-- check applies at insert time only.
create policy "amen_responses_select_groupmate"
  on public.amen_responses
  for select
  using (private.is_active_member(group_id, (select auth.uid())));

-- Insert: only as oneself, only for a visible scheduled day. The unique index
-- (group_id, user_id, date) makes double-taps a constraint violation.
create policy "amen_responses_insert_own_visible_day"
  on public.amen_responses
  for insert
  with check (
    user_id = (select auth.uid())
    and private.can_respond_to_day(
      schedule_day_id, group_id, amen_responses.date, (select auth.uid())
    )
  );

-- No UPDATE/DELETE policies: an Amen is immutable and cannot be un-tapped.

-- ----------------------------------------------------------------------------
-- notification_preferences
-- ----------------------------------------------------------------------------

-- Owner only, both directions — nobody else (including leaders) can see when
-- a member gets reminded.
create policy "notification_preferences_select_own"
  on public.notification_preferences
  for select
  using (user_id = (select auth.uid()));

create policy "notification_preferences_insert_own"
  on public.notification_preferences
  for insert
  with check (user_id = (select auth.uid()));

create policy "notification_preferences_update_own"
  on public.notification_preferences
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No DELETE policy: enabled = false is the off state.

-- ----------------------------------------------------------------------------
-- Column-level grants — RLS decides WHICH ROWS; these decide WHICH COLUMNS.
--
-- Supabase's default privileges give `authenticated` full column access, so
-- each table with an UPDATE/INSERT policy gets its privilege revoked and
-- re-granted on exactly the columns that policy is meant to allow. id and
-- created_at come from defaults; updated_at comes from the trigger (triggers
-- set columns without needing the caller to hold a grant on them).
-- ----------------------------------------------------------------------------

-- profiles: users edit their names only.
revoke insert, update on public.profiles from authenticated;
grant insert (id, display_name, display_name_ko) on public.profiles to authenticated;
grant update (display_name, display_name_ko)     on public.profiles to authenticated;

-- groups: leaders edit naming/description and archive status; created_by and
-- id are immutable. (Creation itself is RPC-only, so no INSERT grant.)
revoke insert, update on public.groups from authenticated;
grant update (name, name_ko, description, description_ko, status)
  on public.groups to authenticated;

-- memberships / invite_codes: all writes are RPC-only; remove the write
-- privileges entirely so RLS deny-by-default is not the only line of defense.
revoke insert, update, delete on public.memberships  from authenticated;
revoke insert, update, delete on public.invite_codes from authenticated;

-- weekly_schedules: leaders edit content only; status/published_at flip via
-- the publish RPC; week_start/group_id/created_by are immutable.
revoke insert, update on public.weekly_schedules from authenticated;
grant update (prayer_point, prayer_point_ko, announcement, announcement_ko)
  on public.weekly_schedules to authenticated;

-- schedule_days: leaders edit the passage and the two flags; weekday/date/
-- schedule_id are immutable (day rows are created by the start_week RPC).
revoke insert, update on public.schedule_days from authenticated;
grant update (book, chapter, verse_start, verse_end, enabled, published)
  on public.schedule_days to authenticated;

-- reflections: authors set the full row at insert (minus timestamps/id) and
-- may edit body/visibility/highlights only — never date, passage snapshot,
-- group, or author (matches local edit behavior).
revoke insert, update on public.reflections from authenticated;
grant insert (group_id, user_id, schedule_day_id, date, book, chapter,
              verse_start, verse_end, highlighted_verses, body, visibility)
  on public.reflections to authenticated;
grant update (body, visibility, highlighted_verses)
  on public.reflections to authenticated;

-- amen_responses: insert only, immutable afterwards.
revoke insert, update, delete on public.amen_responses from authenticated;
grant insert (group_id, user_id, schedule_day_id, date)
  on public.amen_responses to authenticated;

-- notification_preferences: owner sets everything except timestamps.
revoke insert, update on public.notification_preferences from authenticated;
grant insert (user_id, enabled, time_of_day, timezone, scope)
  on public.notification_preferences to authenticated;
grant update (enabled, time_of_day, timezone, scope)
  on public.notification_preferences to authenticated;
