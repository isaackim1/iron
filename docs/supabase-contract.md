# Iron — Supabase Backend Contract Plan

Status: **planning document only.** No Supabase packages are installed, no runtime
code changes accompany this document, and no migrations exist yet. Any SQL below
is illustrative, not authoritative.

This document defines the backend contract Iron will implement against when
Supabase is introduced. It is written from the current local implementation
(`src/lib/types.ts`, `src/lib/store.tsx`, `src/lib/mock.ts`) as of commit
`c588045 Support configurable weekly reading days`.

---

## 1. Product boundary

Iron is a dedicated Bible-reading and prayer space for Christian small groups
(Korean 청년부 friendly). It replaces KakaoTalk noise so the Word, prayer points,
Amen responses, and reflections do not get lost in chat.

**Core value: "The Word doesn't get lost in chat noise."**

Iron is:

- Calm, warm, minimal, spiritual
- Leader-driven: leaders set a weekly rhythm (readings, prayer point,
  announcement), members respond daily
- Small: a group is a dozen people who know each other, joined by invite code

Iron is **not**:

- Social media — no likes, comments, streaks, follower counts, or public feeds
- A generic Bible app — the reading exists inside the group's weekly rhythm
- A devotional content platform — all content comes from the group's own leader
  and members

**What this means for the backend.** The schema and security rules below exist
to protect the small-group rhythm, not to enable growth mechanics:

- Everything is scoped to a group. There is no cross-group or public read path
  anywhere in the schema. No table is world-readable.
- There is no engagement counter to accumulate. An Amen is a one-per-day
  response to today's reading, not a like — it is unique per member per day and
  attached to a scheduled day, so it cannot become a reaction system.
- Reflections have exactly two visibilities (`private`, `shared`) and no
  reply/comment table for them to grow into.
- The leader role is a stewardship role (set the week, invite members), not a
  moderation/admin hierarchy. Only two roles exist.
- Discovery does not exist: the only way into a group is a code handed to you
  by a person.

Any future feature that requires weakening one of these properties should be
treated as a product question first, not a schema question.

## 2. Current local model summary

All state is local: a single reducer store (`src/lib/store.tsx`) hydrated from
one AsyncStorage key (`iron.appState.v1`, `APP_STATE_VERSION = 1`), seeded with
demo data (`src/lib/mock.ts`) on first run or when parsing fails.

### Entities (from `src/lib/types.ts`)

| Local entity | Shape | Notes |
| --- | --- | --- |
| `UserProfile` | `id`, `name`, `nameKo?` | No auth. IDs are `u-${Date.now()}` for real users, `u-isaac` etc. for seeds. |
| `Group` | `id`, `name`, `nameKo?`, `description`, `descriptionKo?`, `inviteCode`, `createdBy` | Invite code is a **column on the group**, generated client-side as `IRON-` + 4 random digits, never expiring, uniqueness not checked. |
| `Membership` | `userId`, `groupId`, `role: 'leader'\|'member'`, `joinedAt` | **No stable ID** — identified by the (userId, groupId) pair. Exactly one leader per group (the creator). No status; leaving/removal doesn't exist. |
| `WeeklySchedule` | `id`, `groupId`, `weekStart` (ISO Monday), `days: ScheduleDay[7]`, `prayerPoint`, `prayerPointKo?`, `announcement?`, `announcementKo?`, `published` | One per (group, week). Days are an **embedded array**, not separate records. `published` is a boolean on the week. |
| `ScheduleDay` | `weekday 0–6` (0 = Monday), `date`, `passage {book, chapter, verseStart?, verseEnd?}`, `enabled`, `published` | `enabled=false` ⇒ rest day (nobody reads). `published=false` ⇒ day hidden from members even when the week is published. |
| `ResponseEntry` | `id`, `userId`, `groupId`, `date`, `kind: 'amen'\|'reflection'`, `reflectionId?`, `createdAt` | **Mixes two things**: Amen taps and pointers to reflections, so "who responded today" is one list. Amens are deduped per (user, group, date) in the reducer. |
| `Reflection` | `id`, `userId`, `groupId`, `date`, `passage`, `highlightedVerses: number[]`, `body`, `bodyKo?`, `visibility: 'shared'\|'private'`, `createdAt` | `passage` is a snapshot copied from the schedule day at posting time. `bodyKo` is mock-only (seed content); real user content is single-language. |
| `NotificationPreference` | `userId`, `time "HH:MM"`, `timezone` | Timezone is **hardcoded** to `'Europe/Amsterdam'` in the reducer. The on/off switch in `notification-time.tsx` is component state and is **not persisted at all**. |

### Behavior currently owned by client/local state

These rules live in the reducer and selectors today and must move to (or be
re-enforced by) the backend:

- **Invite code generation and join** (`actions.createGroup` / `actions.joinGroup`):
  code lookup is case-insensitive, joining twice just switches the active
  group, the joiner types their own display name at join time.
- **Draft week on group creation** (`draftWeekSchedule`): a new group gets an
  unpublished current-week draft — Proverbs placeholder chapters, Mon–Fri
  enabled, Sat/Sun rest, all days `published: true`.
- **Publish gate** (`manage.tsx`): a week can only be published once a prayer
  point is non-empty. Publishing is currently one-way in the UI (button
  disables), but the reducer still accepts edits to prayer point, announcement,
  passages, and per-day flags **after** publish — intended behavior that the
  backend keeps (decided, §10).
- **Leader-only mutations**: reducer guards (`hasActiveGroupLeaderRole`) gate
  schedule edits, publish, and start-week to the active group's leader.
- **Visibility rules** (`sel.todayVisibleDay`): leaders see their enabled days
  always; members see a day only if the week is published AND the day is
  enabled AND the day is published. This gate controls both viewing the reading
  and creating Amens/reflections, and is also enforced as route guards in
  `reading.tsx` and `reflection/new.tsx`.
- **Amen dedupe**: one Amen per (user, group, date), enforced in the reducer.
- **Reflection permissions** (`userCanViewReflection` / `userCanEditReflection`):
  owner sees and edits own; group members see `shared` ones; edits keep the
  original date/passage and only change body/visibility.
- **Feed soft gate** (`feed.tsx`): members must respond (Amen or reflection)
  before today's shared reflections are shown. This is a UX rule, **not** a
  data-access rule — see §5.
- **Week rollover** (`manage.tsx` "start week"): schedules are keyed by
  (groupId, weekStart) and looked up by the current Monday; when a week rolls
  over, the leader starts a new draft week.
- **Legacy data normalization** (`normalizeSchedule` in `store.tsx`): persisted
  schedules from before the 7-day/per-day-flags change stored only Mon–Fri
  without `enabled`/`published`; hydration fills the missing weekend days as
  disabled and defaults missing flags to `true`. Relevant to migration — see §7.
- **AsyncStorage owns persistence**: the entire app state is serialized on
  every change; hydration falls back to demo data on any failure.

## 3. Proposed Supabase tables

Conventions used throughout:

- All primary keys are `uuid` (`gen_random_uuid()`), named `id`.
- All tables have `created_at timestamptz not null default now()`; mutable
  tables also have `updated_at timestamptz not null default now()` maintained
  by a trigger.
- Enums are listed as their value sets; whether they become Postgres enums or
  `text` + check constraints is an implementation detail for later.
- "Required" means `not null`.

### 3.1 `profiles`

- **Purpose**: app-facing identity, 1:1 with `auth.users`. Keeps auth concerns
  out of the app schema.
- **Key columns**:
  - `id uuid` PK, **references `auth.users(id)`** (same value, not a fresh id)
  - `display_name text` — required
  - `display_name_ko text` — nullable (optional Korean name, user-entered)
  - `created_at`, `updated_at` — required
- **Relationships**: referenced by `memberships.user_id`, `reflections.user_id`,
  `amen_responses.user_id`, `notification_preferences.user_id`, and the
  `created_by` columns.
- **Indexes / uniqueness**: PK only.
- **Status/deleted strategy**: none for MVP; account deletion rides on
  `auth.users` deletion (cascade behavior decided at implementation time).
- Note: UI language (`en`/`ko`) stays a device preference, not a profile
  column — it is presentation, not identity (open decision §10 if we ever want
  it to roam across devices).

### 3.2 `groups`

- **Purpose**: a small group. The invite code moves **out** of this table into
  `invite_codes` so codes can rotate/expire without touching the group row.
- **Key columns**:
  - `id uuid` PK
  - `name text` — required
  - `name_ko text` — nullable
  - `description text` — nullable (local model has empty strings; make it nullable)
  - `description_ko text` — nullable
  - `created_by uuid` — required, references `profiles(id)`
  - `status` — required, `'active' | 'archived'`, default `'active'`
  - `created_at`, `updated_at` — required
- **Relationships**: parent of `memberships`, `invite_codes`,
  `weekly_schedules`, `reflections`, `amen_responses`.
- **Indexes / uniqueness**: PK; index on `created_by`. Group names are **not**
  unique (two groups may share a name; the invite code is the identifier).
- **Status/deleted strategy**: soft archive via `status = 'archived'` (no hard
  delete). Archived groups stop accepting writes but history remains readable
  to members — exact read behavior is an open decision (§10).

### 3.3 `memberships`

- **Purpose**: who belongs to which group, with which role. Gets the **stable
  ID** the local model lacks.
- **Key columns**:
  - `id uuid` PK — stable membership ID
  - `group_id uuid` — required, references `groups(id)`
  - `user_id uuid` — required, references `profiles(id)`
  - `role` — required, `'leader' | 'member'`
  - `status` — required, `'active' | 'left' | 'removed'`, default `'active'`
  - `created_at` (serves as joined-at), `updated_at` — required
- **Relationships**: junction between `profiles` and `groups`.
- **Indexes / uniqueness**:
  - unique `(group_id, user_id)` — one membership row per person per group;
    re-joining reactivates the existing row rather than inserting a duplicate
  - index on `user_id` (drives "my groups")
  - index on `(group_id, status)` (drives member lists and counts)
- **Status/deleted strategy**: soft, via `status`. `left`/`removed` rows keep
  the join history and keep old reflections attributable. All "is a member"
  checks throughout this document mean **`status = 'active'`**.
- MVP keeps exactly one `leader` per group (matching current behavior); the
  schema deliberately does not prevent more than one, so co-leaders remain a
  product decision (§10), not a migration.

### 3.4 `invite_codes`

- **Purpose**: joinable codes for a group, separated from the group row so
  they can be rotated, expired, or revoked.
- **Key columns**:
  - `id uuid` PK
  - `group_id uuid` — required, references `groups(id)`
  - `code text` — required; normalized uppercase (`IRON-XXXX` format initially,
    generated server-side)
  - `status` — required, `'active' | 'rotated' | 'revoked'`, default `'active'`
  - `expires_at timestamptz` — nullable (null = no expiry; whether Iron uses
    expiry at all is an open decision §10)
  - `created_by uuid` — required, references `profiles(id)`
  - `created_at` — required (`updated_at` optional; rows are mostly immutable
    apart from status)
- **Relationships**: child of `groups`.
- **Indexes / uniqueness**:
  - unique `code` **among non-retired codes** (partial unique index where
    `status = 'active'`) — a rotated code's value may be reissued later, but no
    two active codes collide. Server-side generation retries on collision,
    fixing the current client-side "hope 4 digits don't collide" approach.
  - partial unique index on `group_id where status = 'active'` — at most one
    active code per group (matches the current one-code-per-group UX).
- **Status/deleted strategy**: status column; rows are never deleted (audit of
  how people joined).

### 3.5 `weekly_schedules`

- **Purpose**: one week's rhythm for one group — prayer point, announcement,
  publish state. The days move to `schedule_days`.
- **Key columns**:
  - `id uuid` PK
  - `group_id uuid` — required, references `groups(id)`
  - `week_start date` — required; **always a Monday** (weeks run Mon–Sun, per
    `src/lib/dates.ts`); enforced by a check constraint or by the RPC that
    creates weeks
  - `status` — required, `'draft' | 'published'`, default `'draft'` (replaces
    the local `published` boolean; a status enum leaves room for a future
    `archived` without a migration)
  - `published_at timestamptz` — nullable, set on publish. Published weeks
    stay editable in MVP (decided — see §10); `updated_at > published_at` is
    the signal that a week changed after publishing. No version history in
    MVP.
  - `prayer_point text` — required with default `''` (publish requires it
    non-empty; the draft starts empty)
  - `prayer_point_ko text` — nullable
  - `announcement text` — nullable
  - `announcement_ko text` — nullable
  - `created_by uuid` — required, references `profiles(id)`
  - `created_at`, `updated_at` — required
- **Relationships**: child of `groups`; parent of `schedule_days`.
- **Indexes / uniqueness**:
  - unique `(group_id, week_start)` — the invariant the local reducer enforces
    in `startWeek`
  - index on `(group_id, week_start desc)` (drives "current week" lookup)
- **Status/deleted strategy**: `status`; no deletion. Old weeks simply stop
  being current (whether members can browse them is an open decision §10).

### 3.6 `schedule_days`

- **Purpose**: one row per weekday per weekly schedule — the current embedded
  `days` array split into records so Amens/reflections can reference a
  specific scheduled day and per-day flags are individually updatable.
- **Key columns**:
  - `id uuid` PK
  - `schedule_id uuid` — required, references `weekly_schedules(id)`
  - `weekday smallint` — required, 0–6 with 0 = Monday (check constraint)
  - `date date` — required; must equal `week_start + weekday` (enforced by the
    writing RPC/trigger)
  - `book text` — required (canonical English book name, e.g. `"Proverbs"`,
    matching `BIBLE_BOOKS[].en` in `src/lib/bible.ts`, which also carries the
    Korean rendering — no `book_ko` column needed)
  - `chapter smallint` — required
  - `verse_start smallint` — nullable (null = whole chapter)
  - `verse_end smallint` — nullable
  - `enabled boolean` — required, default `true` — `false` = rest day
  - `published boolean` — required, default `true` — `false` = hidden from
    members even when the week is published
  - `created_at`, `updated_at` — required
- **Relationships**: child of `weekly_schedules`; referenced (nullable) by
  `reflections` and `amen_responses`.
- **Indexes / uniqueness**:
  - unique `(schedule_id, weekday)` — exactly seven possible rows per week
  - unique `(schedule_id, date)` — redundant with the above given the date
    rule, but cheap and makes date-based lookups safe
- **Status/deleted strategy**: none; `enabled`/`published` are the toggles.
  Every week always has all 7 rows (mirrors `normalizeSchedule`'s guarantee).

### 3.7 `reflections`

- **Purpose**: a member's written response to a day's reading — the heart of
  the product.
- **Key columns**:
  - `id uuid` PK
  - `group_id uuid` — required, references `groups(id)`
  - `user_id uuid` — required, references `profiles(id)`
  - `schedule_day_id uuid` — nullable, references `schedule_days(id)` — link
    to the day it responds to. Nullable so reflections survive schedule
    restructuring and so migration of any pre-Supabase content is possible.
    The passage snapshot (below) is what makes this safe: a reflection must
    render without joining its day row, because members may lose read access
    to that row (day later hidden, week reverted to draft) while the
    reflection itself stays readable (decided — see §5 and §10).
  - `date date` — required (denormalized; the feed and My Reflections query by
    date, and it stays meaningful even if the day link breaks)
  - Passage **snapshot** (copied at posting time, exactly like the local model,
    so later schedule edits never rewrite what someone reflected on):
    - `book text` — required
    - `chapter smallint` — required
    - `verse_start smallint`, `verse_end smallint` — nullable
  - `highlighted_verses smallint[]` — required, default `'{}'`
  - `body text` — required, non-empty
  - `visibility` — required, `'private' | 'shared'`
  - `created_at`, `updated_at` — required (`updated_at` changing after creation
    is the "edited" signal; no separate flag needed for MVP)
- **Relationships**: child of `groups` and `profiles`; soft link to
  `schedule_days`.
- **Indexes / uniqueness**:
  - index `(group_id, date, visibility)` — drives the feed (today/yesterday
    shared reflections)
  - index `(user_id, date desc)` — drives My Reflections
  - **No** uniqueness on (user, day): the local model already allows multiple
    reflections per user per day, and nothing in the product forbids it.
- **Status/deleted strategy**: none for MVP (the app has edit but no delete).
  If delete ships later, prefer hard delete over a tombstone — private
  spiritual writing should be really gone (open decision §10).
- `bodyKo` intentionally has **no column**: it exists only on seeded demo
  content (`types.ts` marks it mock-only). Real content is single-language.

### 3.8 `amen_responses`

- **Purpose**: the one-tap "Amen" to a day's reading. Replaces the `'amen'`
  half of the local `ResponseEntry`; the `'reflection'` half is **not** ported
  (see §7 — "who responded" becomes a query over the union of this table and
  `reflections`).
- **Key columns**:
  - `id uuid` PK
  - `group_id uuid` — required, references `groups(id)`
  - `user_id uuid` — required, references `profiles(id)`
  - `schedule_day_id uuid` — nullable, references `schedule_days(id)`
  - `date date` — required (denormalized, same rationale as reflections)
  - `created_at` — required (no `updated_at`; rows are immutable)
- **Relationships**: child of `groups` and `profiles`; soft link to
  `schedule_days`.
- **Indexes / uniqueness**:
  - unique `(group_id, user_id, date)` — the reducer's dedupe rule becomes a
    database constraint: one Amen per member per group per day
  - index `(group_id, date)` — drives "who said Amen today"
- **Status/deleted strategy**: none. An Amen is never edited; whether it can be
  un-tapped (deleted) is not in the current product — no delete path for MVP.

### 3.9 `notification_preferences`

- **Purpose**: when to nudge each member. Push delivery itself is out of scope
  for this phase; the table exists so the preference UI has a real home and the
  later push system has data to read.
- **Key columns**:
  - `user_id uuid` PK, references `profiles(id)` — exactly one row per user
    (matches the current model; per-group scope is a widening decision, below)
  - `enabled boolean` — required, default `true` — **fixes a current gap**: the
    reminder toggle in `notification-time.tsx` is component state today and is
    never persisted
  - `time_of_day time` — required (the local `"HH:MM"` string becomes a real
    time type)
  - `timezone text` — required; IANA name. **Source: the device**, captured via
    `Intl.DateTimeFormat().resolvedOptions().timeZone` whenever the preference
    is saved (and refreshed on app start if it drifted). Never hardcoded — the
    current `'Europe/Amsterdam'` literal in the reducer is a placeholder to
    eliminate.
  - `scope` — required, `'all_groups'`, default `'all_groups'` — MVP has one
    global reminder. The column exists so a later `'per_group'` mode (with a
    companion table) doesn't need a schema rewrite. Whether per-group ever
    ships is an open decision (§10).
  - `created_at`, `updated_at` — required
- **Relationships**: 1:1 with `profiles`.
- **Indexes / uniqueness**: PK is the uniqueness.
- **Status/deleted strategy**: none; `enabled = false` is the off state.

## 4. Important field requirements

Cross-cutting checklist — where each required concern lives:

| Requirement | Where it lands |
| --- | --- |
| `created_at` | Every table, `timestamptz not null default now()`. |
| `updated_at` | Every mutable table (`profiles`, `groups`, `memberships`, `weekly_schedules`, `schedule_days`, `reflections`, `notification_preferences`), trigger-maintained. Immutable rows (`amen_responses`, `invite_codes`) skip it. |
| `created_by` | `groups`, `invite_codes`, `weekly_schedules`. Not needed on user-owned rows (`reflections`, `amen_responses`) where `user_id` *is* the creator. |
| Stable membership IDs | `memberships.id uuid` PK (new — local model only has the composite pair). |
| Group roles | `memberships.role: 'leader' \| 'member'`. Two roles only, by design. |
| Group status | `groups.status: 'active' \| 'archived'`. |
| Membership status | `memberships.status: 'active' \| 'left' \| 'removed'`. |
| Invite code status/expiry | `invite_codes.status: 'active' \| 'rotated' \| 'revoked'` + nullable `expires_at`. |
| Week start date | `weekly_schedules.week_start date`, always Monday, unique per group. |
| Schedule publish state | `weekly_schedules.status: 'draft' \| 'published'` + `published_at`. |
| Per-day enabled/rest | `schedule_days.enabled boolean` (`false` = rest day). |
| Per-day published/hidden | `schedule_days.published boolean` (`false` = hidden from members). |
| Reflection visibility | `reflections.visibility: 'private' \| 'shared'`. Exactly two values; no "public". |
| Notification enabled | `notification_preferences.enabled` (persisting what the UI currently loses). |
| Notification scope | `notification_preferences.scope`, MVP-fixed to `'all_groups'`. |
| Timezone source | Device IANA timezone captured at save time into `notification_preferences.timezone`; never a server default, never hardcoded. |

## 5. Row Level Security plan

Plain-English policies, one block per table. Two definitions used throughout:

- **"member of a group"** = has a `memberships` row for that group with
  `status = 'active'`.
- **"leader of a group"** = member of the group with `role = 'leader'`.
- **"visible scheduled day"** (for members) = the day's week has
  `status = 'published'`, the day has `enabled = true` and `published = true`.
  For the group's leader, only `enabled = true` is required (leaders see and
  can respond to their own drafts, matching `sel.todayVisibleDay`).

General posture: **RLS on for every table, deny by default.** Clients get
narrow read policies and even narrower write policies; anything with
invariants goes through an RPC (§6) running as `security definer`.

### `profiles`

- **Read**: a user can read their own profile, and the profiles of people who
  share at least one group with them (needed to render names in feed, members
  list, and Amen lines). No global profile reads.
- **Write**: a user can update only their own profile. Insert happens once at
  signup (own row only, id must equal `auth.uid()`).

### `groups`

- **Read**: members can read only groups they belong to. Non-members can read
  nothing — not even the group's name. (Invite-code join returns the group
  name through the join RPC, not through a table read.)
- **Write**: creation goes through the create-group RPC only. Updates
  (name/description/status) only by the group's leader. No client deletes ever.

### `memberships`

- **Read**: members can read all membership rows of groups they belong to
  (drives member lists and "x of n responded").
- **Write**: no direct client inserts — joining goes through the join RPC,
  group creation seeds the leader row through the create RPC. Role changes and
  `status` changes (remove member) only by the group's leader, via RPC. A
  member updating their own row to `status = 'left'` (leave group) is RPC-only
  too, and blocked for the leader themselves (a group cannot lose its leader;
  see §10).

### `invite_codes`

- **Read**: only the group's leader can read the codes of their group (the
  invite screen is leader-facing). Ordinary members do not need to enumerate
  codes; joiners never read this table directly — the join RPC does the lookup
  with elevated rights.
- **Write**: create/rotate/revoke only by the group's leader, via RPC (code
  generation and collision handling are server logic).

### `weekly_schedules`

- **Read**: members can read schedules of their groups where
  `status = 'published'`. The group's leader can additionally read drafts.
  (Hiding drafts from members at the row level makes the "members never see
  an unpublished week" rule structural rather than a client courtesy.)
- **Write**: insert (start week) and update (prayer point, announcement)
  only by the group's leader. Publishing goes through the publish RPC because
  it validates the non-empty-prayer-point invariant. **Published weeks remain
  editable by the leader** (decided): the update policy does not check
  `status`, matching current app behavior. Post-publish edits are detectable
  by `updated_at > published_at`; no version history in MVP. No deletes.

### `schedule_days`

- **Read**: the group's leader reads all seven rows. Members read only days of
  published weeks with `enabled = true` **and** `published = true` — hidden and
  rest days are structurally invisible to members, matching today's route
  guards (`reading.tsx`). Hiding or disabling a day affects only the day row
  itself and *new* responses: members lose access to the reading and can no
  longer Amen or start a reflection for that day, but existing reflections and
  Amens are untouched — their readability is governed solely by their own
  policies below, never by the day's current flags (decided). Hiding a day
  must never delete or hide existing responses.
- **Write**: only the group's leader (toggle enabled/published, set passage),
  **including after the week is published** (decided — published weeks stay
  editable in MVP; `updated_at` on the day row vs. the week's `published_at`
  reveals post-publish changes). Row creation happens inside the start-week
  RPC (always 7 rows). No deletes.

### `reflections`

- **Read**:
  - `private` reflections: **owner only**. No exception for leaders.
  - `shared` reflections: owner, plus active members of the reflection's
    group.
  - These two rules are the **whole** read story (decided): readability
    depends only on visibility + membership, never on the referenced
    schedule day's current `enabled`/`published` flags or the week's status.
    So members cannot read draft weeks or hidden/rest day rows, yet
    reflections written against a day that is later hidden remain readable —
    the passage snapshot (§3.7) keeps them renderable without the day row.
  - Note: the feed's "respond before you see today's reflections" gate is a
    **UX rule and stays client-side**. It must not become RLS — a member who
    hasn't responded is still authorized to read shared content (they can see
    yesterday's already); encoding a soft nudge as a security rule would also
    make "x of n responded" and the Amen line inconsistent to compute.
- **Write**:
  - Insert: a member can create a reflection only as themselves
    (`user_id = auth.uid()`), only in a group they are an active member of,
    and only for a **visible scheduled day** of that group (per the definition
    above — leaders get the leader variant). The passage snapshot must match
    the day being responded to (enforced in the insert policy or a trigger).
  - Update: owner only, and only `body`, `visibility`, `highlighted_verses` —
    never `date`, `group_id`, `user_id`, or the passage snapshot (matches the
    local edit behavior which pins date/passage).
  - Delete: none for MVP.

### `amen_responses`

- **Read**: members can read Amens of groups they belong to (drives the Amen
  line and responded counts). As with reflections, readability never depends
  on the referenced day's current flags — the visible-day check applies at
  insert time only.
- **Write**: insert only as oneself, only in an active-membership group, only
  for a **visible scheduled day**, and the unique `(group_id, user_id, date)`
  constraint makes double-taps a no-op. No updates, no deletes.

### `notification_preferences`

- **Read/Write**: owner only, in both directions. Nobody else — including
  leaders — can see when a member gets reminded.

### Invite-code joining (cross-cutting)

Joining must go through the join RPC exclusively. There is deliberately **no**
INSERT policy on `memberships` for ordinary users: knowing a code must not
allow crafting arbitrary membership rows (any group, any role, someone else's
user_id). The RPC validates the code (active, not expired), then inserts a
`member`-role, `active`-status row for `auth.uid()` — or reactivates a
previous `left` row — and returns the group.

## 6. Supabase RPC / controlled functions

Operations with multi-row invariants or privilege-crossing reads become
`security definer` functions instead of direct table writes:

| RPC | Why it can't be a direct write | Behavior sketch |
| --- | --- | --- |
| `join_group_with_code(code)` | Reads `invite_codes` (which the caller can't), validates status/expiry, inserts/reactivates a membership with forced `role = 'member'`, `user_id = auth.uid()`. Idempotent for existing members (returns the group, mirrors the local "just switch" behavior). | **Must-have.** |
| `create_group_with_leader(name, name_ko?, description?)` | Atomically: insert group (with `created_by`), insert leader membership, generate a collision-checked invite code, create the current week's draft schedule with its 7 `schedule_days` rows (Mon–Fri enabled, weekend rest — mirrors `draftWeekSchedule`). Five inserts that must not partially succeed. | **Must-have.** |
| `start_week(group_id, week_start)` | Creates the schedule row plus exactly 7 day rows with correct dates and defaults; enforces Monday and the (group, week) uniqueness cleanly. | **Must-have.** |
| `publish_week(schedule_id)` | Validates prayer point non-empty, flips `status` to `'published'`, stamps `published_at`. Encodes the publish gate server-side. | **Must-have.** |
| `rotate_invite_code(group_id)` | Marks the current active code `'rotated'`, generates a new unique one — two writes plus generation logic. | **Should-have** (can ship after MVP join works; until then the create-time code just lives forever, as today). |
| `leave_group(group_id)` | Sets own membership to `'left'`; must refuse when caller is the group's leader. | **Maybe** — the feature doesn't exist in the app yet (§10). Define it as RPC when it does. |
| `archive_group(group_id)` | Leader-only status flip; kept as RPC so archiving can later cascade (revoke codes, etc.). | **Maybe** (§10). |

Plain client writes (no RPC needed): profile updates, prayer
point/announcement edits, day toggles and passages (leader, via RLS),
reflection insert/edit, Amen insert, notification preferences. Their
invariants are single-row and expressible as policies + constraints.

## 7. Local-to-Supabase migration mapping

Reality check first: today's persisted data is a demo/mock world on a handful
of devices (seed users like `u-isaac`, seed groups, generated joiner history).
There is **no production data to preserve**. The honest migration is:
**Supabase starts empty; real accounts, groups, and content are created fresh
through the new flows.** The mapping below is therefore primarily a
*shape* mapping (how each local concept translates), not a data-port plan —
plus what a device-side import would look like if we ever choose to offer one.

### Maps directly (same meaning, new home)

| Local | Supabase |
| --- | --- |
| `UserProfile.name` / `.nameKo` | `profiles.display_name` / `.display_name_ko` |
| `Group.name/nameKo/description/descriptionKo/createdBy` | `groups.*` (empty-string description → `null`) |
| `Membership.role` | `memberships.role` |
| `Membership.joinedAt` | `memberships.created_at` |
| `WeeklySchedule.weekStart` | `weekly_schedules.week_start` |
| `WeeklySchedule.prayerPoint/Ko`, `announcement/Ko` | same names, snake_case |
| `ScheduleDay.enabled` / `.published` | `schedule_days.enabled` / `.published` |
| `Reflection.body`, `.visibility`, `.highlightedVerses`, `.date` | `reflections.*` |
| `Reflection.passage` snapshot | `reflections.book/chapter/verse_start/verse_end` |
| `NotificationPreference.time` | `notification_preferences.time_of_day` |

### Needs renaming / retyping

- All IDs: local string IDs (`u-${Date.now()}`, `g-…`, `s-…`, `r-…`) →
  fresh UUIDs. No local ID survives; anything imported needs an old-id→uuid
  map during the import, then the old IDs are discarded.
- `WeeklySchedule.published: boolean` → `weekly_schedules.status:
  'draft'|'published'` (+ `published_at`).
- `Membership` (composite identity) → row with its own `id`, plus new
  `status = 'active'`.
- `NotificationPreference.time "HH:MM"` string → `time` column type.
- camelCase → snake_case throughout.

### Splits into separate rows

- `Group.inviteCode` → an `invite_codes` row (`status = 'active'`,
  `created_by` = group creator, no expiry).
- `WeeklySchedule.days[7]` (embedded array) → 7 `schedule_days` rows, keyed by
  `(schedule_id, weekday)`, `date = week_start + weekday`.
- `ResponseEntry` **splits by kind and half of it disappears**:
  - `kind: 'amen'` rows → `amen_responses` rows.
  - `kind: 'reflection'` rows → **nothing**. They were pointers letting the
    local store treat "responded today" as one list; on Supabase that becomes
    a query/view over `amen_responses ∪ reflections` per (group, date). Port
    the *selector logic* (`respondedToday`, `respondedCountToday`,
    `myResponseKinds`), not the rows.

### Does not migrate

- **All seed/demo data**: seed users, `g-honest` / `g-word`, seeded schedules,
  seeded reflections/Amens, and the generated joiner history
  (`buildJoinerHistory`) and demo bonus memberships
  (`buildDemoJoinGroupContext` / `buildDemoCreateGroupContext`). None of it is
  real. The demo world remains useful for local development but never touches
  the database.
- `Reflection.bodyKo` — mock-only field, no column (§3.7).
- The hardcoded `'Europe/Amsterdam'` timezone — replaced by device timezone at
  first preference save.
- `language`, `currentUserId`, `activeGroupId`, `draftVerses` — session/device
  state, stays in AsyncStorage (auth session replaces `currentUserId`).
- `APP_STATE_VERSION` / storage-key machinery — superseded by server state
  plus whatever local cache layer the Supabase phase introduces.

### Legacy Mon–Fri persisted schedules

Old persisted weeks (pre-`c588045`) stored 5 days without per-day flags.
`normalizeSchedule` already repairs this at hydration: missing weekend days
are synthesized as `enabled: false, published: true`, missing flags default to
`true`. Rule: **any import reads post-hydration state, never raw AsyncStorage
JSON** — so the Mon–Fri case is already solved and no legacy special-casing
exists server-side. Current seven-day schedules map 1:1 onto seven
`schedule_days` rows with their flags carried over as-is. The server-side
invariant "every week has exactly 7 day rows" is `normalizeSchedule`'s
guarantee made permanent, and once Supabase is authoritative the client-side
normalizer can eventually retire.

## 8. MVP implementation order

Safest sequence, each step shippable and testable before the next:

1. **Schema + generated types only.** Write migrations for all nine tables +
   RLS + triggers; generate TypeScript types. App still runs 100% on local
   state — this step has zero runtime risk and lets the contract be reviewed
   as real SQL.
2. **Auth + profile creation.** Sign-in via **email OTP** (decided — see §10)
   and the `profiles` row. The app keeps its local world; the only new
   behavior is having a session.
3. **Groups + memberships.** `create_group_with_leader` and
   `join_group_with_code` RPCs; group list/switcher reads from Supabase.
   First real two-device moment: create on one phone, join on another.
4. **Schedule read/write.** `start_week`, `publish_week`, leader edits, member
   reads with the visibility policies. The weekly rhythm is now shared.
5. **Reflections + Amen.** The daily loop goes live: policies for visible-day
   inserts, feed queries, My Reflections, responded counts.
6. **Invite code management.** `rotate_invite_code` and the leader-facing code
   screens on real data. (Basic join already worked since step 3 with the
   creation-time code.)
7. **Notification preferences.** Persist time/enabled/timezone to the table
   (UI already exists; this also fixes the unpersisted toggle).
8. **Push notifications — later, separate phase.** The table from step 7 is
   the input; delivery (Expo push tokens, scheduling infra) is explicitly out
   of scope for this contract.

Steps 3–5 are the risky middle: each one moves an owner of truth from
AsyncStorage to Postgres. Do not parallelize them.

## 9. Explicit non-goals

The backend will **not** include, in this phase (and mostly ever):

- Comments or replies of any kind
- Likes/reactions beyond the one-per-day Amen
- Public discovery: no group search, no browse, no public group pages
- Streaks, badges, leaderboards, or any gamification
- Social profiles (bios, avatars-as-identity, follower/following)
- Public feeds; nothing is readable outside a group's membership
- Complex analytics — no read-tracking, no per-member engagement dashboards
  beyond the existing "x of n responded today"
- Bible text API integration (API.Bible) — verse text stays mock/local this
  phase; the schema stores references (book/chapter/verses), never verse text
- Push notification delivery — preferences only (§3.9); no tokens, no
  scheduler, no send pipeline this phase

## 10. Product decisions

### Decided (July 2026)

1. **Leaders may edit published weeks in MVP.** No locking of published weeks.
   Post-publish edits are detected by comparing `updated_at` (on the week or
   its day rows) against `published_at`; no version history in MVP. Encoded in
   the `weekly_schedules`/`schedule_days` UPDATE policies (§5).
2. **Hiding a day never touches existing responses.** If a leader hides a day
   after members responded, existing reflections remain visible under normal
   reflection privacy (shared → group members, private → owner only), and
   Amens remain readable to the group. Hiding a day only removes members'
   access to the reading and blocks *new* Amens/reflections for that day. It
   must never delete or hide existing reflections automatically. Encoded in
   §5: response read policies depend only on visibility + membership, never on
   the day's current flags; the visible-day check is insert-time only.
3. **Auth starts with email OTP.** Apple sign-in can be added later if iOS
   distribution requires it; Kakao can be considered later for Korean church
   adoption. Neither blocks the Supabase MVP.
4. **RLS visibility split.** Members cannot read draft weeks or hidden/rest
   `schedule_days` rows (structurally, at the row level) — but existing
   reflections stay readable based on reflection visibility + membership,
   which is safe because reflections carry passage snapshots and never need to
   join the day row (§3.7).

### Still open

Decisions needed from Isaac before (or during early) implementation — each
with where it bites:

1. **Can members leave groups?** No UI for it today. If yes, `leave_group` RPC
   ships and `status = 'left'` gets used; decide what leavers' past shared
   reflections do (stay visible is the schema default).
2. **Can leaders remove members?** Same shape as (1) but leader-initiated
   (`status = 'removed'`). Also: is a removed member's history kept visible?
3. **Old schedules: archived or always visible?** Today only the current week
   is ever shown. Decide whether members can browse past weeks (read policy on
   old `weekly_schedules` rows) or the app stays current-week-only.
4. **Should invite codes expire?** `expires_at` exists and is null-capable
   either way. Expiry adds safety for leaked codes but adds leader friction
   ("the code stopped working").
5. **Can one user lead multiple groups?** Nothing in the schema prevents it
   (and the local demo effectively allows a leader who's a member elsewhere).
   Confirm it's intended so the create-group RPC doesn't need a check. Related:
   should a group ever have **co-leaders**? Schema allows; product says one
   leader today.
6. **Should hidden (unpublished) days still allow the leader to write
   reflections/Amens?** Today: yes — `todayVisibleDay` gives leaders their
   enabled days regardless of publish state, and responses attach to them.
   Keeping it means leader responses can exist on days members can't see yet.
7. **Reflection deletion.** The app has edit but no delete. If delete ships:
   hard delete (recommended for private spiritual writing) vs soft.
8. **Leader handover.** One leader per group + no leader-leave means a group
   whose leader stops using the app is frozen. A "transfer leadership" RPC is
   the eventual answer — in scope for MVP or not?
9. **Per-group display names.** Locally the join screen asks for a name every
   time but writes one global profile. With real accounts: is one global
   `display_name` fine, or do 청년부 members need a different name per group
   (e.g. English name in one group, Korean in another)? Affects whether
   `memberships` gets a `nickname` column.

---

*Next step after this document is agreed: §8 step 1 — write the actual SQL
migrations and RLS policies as code review-able files (still without wiring
the app to them).*
