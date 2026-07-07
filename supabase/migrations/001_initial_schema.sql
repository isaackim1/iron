-- ============================================================================
-- Iron — 001 initial schema
--
-- Implements docs/supabase-contract.md §3 (tables) and §4 (field
-- requirements). Documentation-first migration: the app is NOT wired to
-- Supabase yet; these files exist for review before a project is created.
--
-- Conventions (contract §3):
--   * uuid PKs via gen_random_uuid() (built into Postgres 13+, no extension)
--   * created_at everywhere; updated_at on mutable tables via trigger
--   * status columns are text + CHECK, not enums, so values can evolve
--     without an enum migration
--   * weeks run Monday–Sunday; weekday 0 = Monday … 6 = Sunday
-- ============================================================================

-- Schema for helper functions that must not be exposed through PostgREST.
-- (PostgREST only exposes `public`; RLS helpers and RPC internals live here.)
create schema if not exists private;

-- Policy expressions run as the querying role, so it needs USAGE to call the
-- helpers. anon gets USAGE only so its queries fail closed (empty/denied)
-- instead of erroring; no table grants are given to anon (see 002).
grant usage on schema private to authenticated, anon;

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at. On weekly_schedules/schedule_days, '
  'updated_at > published_at is the post-publish-edit signal (contract §10, decided #1).';

-- ----------------------------------------------------------------------------
-- profiles — app-facing identity, 1:1 with auth.users (contract §3.1)
-- ----------------------------------------------------------------------------

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text not null check (length(trim(display_name)) > 0),
  display_name_ko text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'App identity, 1:1 with auth.users (same id). UI language stays a device '
  'preference, not a column (contract §3.1).';

-- ----------------------------------------------------------------------------
-- groups — a small group; invite codes live in invite_codes (contract §3.2)
-- ----------------------------------------------------------------------------

create table public.groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) > 0),
  name_ko        text,
  description    text,
  description_ko text,
  status         text not null default 'active'
                   check (status in ('active', 'archived')),
  created_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index groups_created_by_idx on public.groups (created_by);

comment on table public.groups is
  'A small group. Names are intentionally NOT unique — the invite code is the '
  'identifier. Archive is soft (status), never hard delete (contract §3.2).';

-- ----------------------------------------------------------------------------
-- memberships — who belongs where, with which role (contract §3.3)
-- ----------------------------------------------------------------------------

create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('leader', 'member')),
  status     text not null default 'active'
               check (status in ('active', 'left', 'removed')),
  created_at timestamptz not null default now(),  -- serves as joined-at
  updated_at timestamptz not null default now(),

  -- One row per person per group, ever: re-joining reactivates the existing
  -- row (status back to 'active') instead of inserting a duplicate. This is
  -- stricter than "no duplicate active membership" and preserves history.
  constraint memberships_one_per_user_per_group unique (group_id, user_id)
);

create index memberships_user_id_idx      on public.memberships (user_id);
create index memberships_group_status_idx on public.memberships (group_id, status);

comment on table public.memberships is
  'Stable-id membership rows. "Is a member" everywhere means status = active. '
  'MVP keeps exactly one leader per group by convention (create RPC), not by '
  'constraint — co-leaders remain a product decision (contract §10).';

-- ----------------------------------------------------------------------------
-- invite_codes — joinable codes, separate from the group row (contract §3.4)
-- ----------------------------------------------------------------------------

create table public.invite_codes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  code       text not null check (code = upper(trim(code)) and length(code) > 0),
  status     text not null default 'active'
               check (status in ('active', 'rotated', 'revoked')),
  -- "Expired" is derived, not a status: a code is joinable only while
  -- status = 'active' AND (expires_at IS NULL OR expires_at > now()).
  -- The join RPC is the single place that evaluates this.
  expires_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
  -- No updated_at: rows are immutable apart from the status flip on rotation.
);

-- At most one active code per group (matches the one-code-per-group UX).
create unique index invite_codes_one_active_per_group
  on public.invite_codes (group_id)
  where status = 'active';

-- No two ACTIVE codes may share a value; retired code values may recur later.
create unique index invite_codes_active_code_unique
  on public.invite_codes (code)
  where status = 'active';

create index invite_codes_group_id_idx on public.invite_codes (group_id);

comment on table public.invite_codes is
  'Never deleted (audit of how people joined). Generation is server-side with '
  'collision retry (see 003), replacing the old client-side random code.';

-- ----------------------------------------------------------------------------
-- weekly_schedules — one week''s rhythm for one group (contract §3.5)
-- ----------------------------------------------------------------------------

create table public.weekly_schedules (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups (id) on delete cascade,
  -- Always a Monday: isodow is 1 = Monday … 7 = Sunday.
  week_start      date not null check (extract(isodow from week_start) = 1),
  status          text not null default 'draft'
                    check (status in ('draft', 'published')),
  published_at    timestamptz,
  prayer_point    text not null default '',
  prayer_point_ko text,
  announcement    text,
  announcement_ko text,
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint weekly_schedules_one_per_group_week unique (group_id, week_start),
  -- A published week always has its publish timestamp.
  constraint weekly_schedules_published_has_timestamp
    check (status = 'draft' or published_at is not null)
);

-- No extra (group_id, week_start) index: the unique constraint's index
-- already serves the "current week" lookup.

comment on table public.weekly_schedules is
  'Published weeks STAY editable in MVP (contract §10, decided #1): the '
  'update path does not check status. updated_at > published_at detects '
  'post-publish edits; there is no version history. published_at is set once '
  'and never overwritten (see publish RPC in 003).';

-- ----------------------------------------------------------------------------
-- schedule_days — one row per weekday per week (contract §3.6)
-- ----------------------------------------------------------------------------

create table public.schedule_days (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.weekly_schedules (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),  -- 0 = Monday
  date        date not null,
  -- Passage reference. book is the canonical English name matching
  -- BIBLE_BOOKS[].en in src/lib/bible.ts (which carries the Korean rendering
  -- client-side — no book_ko column needed). Never verse text.
  book        text not null check (length(trim(book)) > 0),
  chapter     smallint not null check (chapter >= 1),
  verse_start smallint check (verse_start >= 1),   -- null = whole chapter
  verse_end   smallint,
  enabled     boolean not null default true,       -- false = rest day
  published   boolean not null default true,       -- false = hidden from members
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint schedule_days_one_per_weekday unique (schedule_id, weekday),
  constraint schedule_days_one_per_date    unique (schedule_id, date),
  constraint schedule_days_verse_range_valid
    check (verse_end is null
           or (verse_start is not null and verse_end >= verse_start))
);

comment on table public.schedule_days is
  'Every week always has exactly 7 rows, created atomically by the start-week '
  'RPC (003). enabled/published are the only toggles; there is no delete. '
  'Hiding or disabling a day never touches existing reflections/Amens '
  '(contract §10, decided #2).';

-- Integrity: a day''s date must equal its week''s Monday + weekday. Rows are
-- only created by the start-week RPC and date/weekday are not client-updatable
-- (column grants in 002), so this trigger is belt-and-braces against RPC or
-- service-role bugs. SECURITY DEFINER so the parent-row lookup never depends
-- on the caller''s RLS visibility.
create or replace function public.check_schedule_day_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week_start date;
begin
  select w.week_start into v_week_start
  from public.weekly_schedules w
  where w.id = new.schedule_id;

  if v_week_start is null then
    raise exception 'weekly_schedule % not found', new.schedule_id;
  end if;

  if new.date <> v_week_start + new.weekday then
    raise exception 'schedule_days.date must equal week_start + weekday';
  end if;

  return new;
end;
$$;

create trigger schedule_days_check_date
  before insert or update of date, weekday, schedule_id on public.schedule_days
  for each row execute function public.check_schedule_day_date();

-- ----------------------------------------------------------------------------
-- reflections — a member''s written response to a day''s reading (contract §3.7)
-- ----------------------------------------------------------------------------

create table public.reflections (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  -- Soft link: nullable + SET NULL so reflections survive schedule
  -- restructuring. The passage snapshot below is what makes this safe — a
  -- reflection renders WITHOUT joining its day row, because members may lose
  -- read access to that row later (day hidden, week reverted) while the
  -- reflection stays readable (contract §10, decided #2 and #4).
  schedule_day_id    uuid references public.schedule_days (id) on delete set null,
  date               date not null,
  -- Passage SNAPSHOT, copied at posting time. Later schedule edits never
  -- rewrite what someone reflected on.
  book               text not null check (length(trim(book)) > 0),
  chapter            smallint not null check (chapter >= 1),
  verse_start        smallint check (verse_start >= 1),
  verse_end          smallint,
  highlighted_verses smallint[] not null default '{}',
  body               text not null check (length(trim(body)) > 0),
  visibility         text not null check (visibility in ('private', 'shared')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint reflections_verse_range_valid
    check (verse_end is null
           or (verse_start is not null and verse_end >= verse_start))
  -- Deliberately NO uniqueness on (user, day): multiple reflections per user
  -- per day are allowed, matching the local model.
);

create index reflections_feed_idx on public.reflections (group_id, date, visibility);
create index reflections_mine_idx on public.reflections (user_id, date desc);

comment on table public.reflections is
  'The heart of the product. visibility has exactly two values — private '
  '(owner-only, no leader override) and shared (group members). No delete in '
  'MVP; updated_at changing after created_at is the "edited" signal. bodyKo '
  'from the local mock intentionally has no column (mock-only field).';

-- Integrity: at insert time the snapshot must equal the referenced day''s
-- passage/date/group. Authorization (who may insert for which day) lives in
-- RLS (002); this trigger guards data integrity only, and also covers
-- service-role inserts that bypass RLS. Snapshot columns are not
-- client-updatable (column grants in 002), so BEFORE INSERT suffices.
create or replace function public.check_reflection_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day record;
begin
  if new.schedule_day_id is null then
    return new;  -- migration/backfill path; soft link already broken
  end if;

  select d.date, d.book, d.chapter, d.verse_start, d.verse_end, w.group_id
    into v_day
  from public.schedule_days d
  join public.weekly_schedules w on w.id = d.schedule_id
  where d.id = new.schedule_day_id;

  if not found then
    raise exception 'schedule_day % not found', new.schedule_day_id;
  end if;

  if v_day.group_id <> new.group_id then
    raise exception 'reflection group must match the scheduled day''s group';
  end if;

  if v_day.date <> new.date then
    raise exception 'reflection date must match the scheduled day''s date';
  end if;

  if v_day.book <> new.book
     or v_day.chapter <> new.chapter
     or v_day.verse_start is distinct from new.verse_start
     or v_day.verse_end   is distinct from new.verse_end then
    raise exception 'reflection passage snapshot must match the scheduled day at posting time';
  end if;

  return new;
end;
$$;

create trigger reflections_check_snapshot
  before insert on public.reflections
  for each row execute function public.check_reflection_snapshot();

-- ----------------------------------------------------------------------------
-- amen_responses — one-tap Amen (contract §3.8)
-- ----------------------------------------------------------------------------

create table public.amen_responses (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  schedule_day_id uuid references public.schedule_days (id) on delete set null,
  date            date not null,
  created_at      timestamptz not null default now()
  -- No updated_at: an Amen is immutable. No delete path in MVP.
);

-- One Amen per member per group per day. A group has at most one scheduled
-- day per date (schedule_days unique (schedule_id, date) + one schedule per
-- group-week), so this IS the one-Amen-per-scheduled-day rule, and it also
-- turns double-taps into a constraint violation the client can ignore.
create unique index amen_responses_one_per_user_per_day
  on public.amen_responses (group_id, user_id, date);

create index amen_responses_group_date_idx on public.amen_responses (group_id, date);

comment on table public.amen_responses is
  'Only the amen half of the local ResponseEntry — "who responded today" is a '
  'query over amen_responses UNION reflections, not a table (contract §7). '
  'Not a like button: unique per member per day, attached to a scheduled day.';

-- ----------------------------------------------------------------------------
-- notification_preferences — when to nudge each member (contract §3.9)
-- ----------------------------------------------------------------------------

create table public.notification_preferences (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  enabled     boolean not null default true,
  time_of_day time not null,
  -- IANA name sourced from the DEVICE (Intl.DateTimeFormat().resolvedOptions()
  -- .timeZone) at save time — never a server default, never hardcoded
  -- (replaces the local model's 'Europe/Amsterdam' placeholder).
  timezone    text not null check (length(trim(timezone)) > 0),
  -- MVP has one global reminder; the column exists so a later per-group mode
  -- doesn't need a schema rewrite (contract §3.9).
  scope       text not null default 'all_groups' check (scope in ('all_groups')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Preferences only — push delivery (tokens, scheduler) is a later phase and '
  'has no tables here (contract §9). Persists the enabled toggle the current '
  'UI loses.';

-- ----------------------------------------------------------------------------
-- updated_at triggers for all mutable tables
-- ----------------------------------------------------------------------------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

create trigger weekly_schedules_set_updated_at
  before update on public.weekly_schedules
  for each row execute function public.set_updated_at();

create trigger schedule_days_set_updated_at
  before update on public.schedule_days
  for each row execute function public.set_updated_at();

create trigger reflections_set_updated_at
  before update on public.reflections
  for each row execute function public.set_updated_at();

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();
