# Iron — Supabase implementation notes

Companion to `docs/supabase-contract.md`. The contract says *what* the backend
is; this file says how to review and run the SQL under `supabase/migrations/`
and what deliberately isn't done yet.

## What exists

| File | Contents |
| --- | --- |
| `supabase/migrations/001_initial_schema.sql` | `private` schema, 9 tables, constraints, indexes, `updated_at` trigger, two integrity triggers (day-date, reflection-snapshot). |
| `supabase/migrations/002_rls_policies.sql` | RLS enabled on all 9 tables, 4 `private.*` helper predicates, 21 policies, column-level grants. |
| `supabase/migrations/003_rpc_functions.sql` | 5 `security definer` RPCs (`create_group_with_leader`, `join_group_by_invite_code`, `start_week`, `publish_weekly_schedule`, `rotate_invite_code`) + 2 private helpers; deferred RPCs listed as TODOs. |

Files must run in order — 002 references tables from 001, 003 references
helpers from 002 (`private.is_group_leader`).

## What is intentionally NOT wired yet

- **The app is untouched.** No Supabase packages installed, no client, no env
  vars, no runtime behavior change. Iron still runs entirely on local/mock
  state + AsyncStorage.
- **No Supabase project exists.** These files have not been executed anywhere;
  they are for review.
- **No API.Bible** — the schema stores passage references (book/chapter/verse
  range), never verse text.
- **No push notification delivery** — only the `notification_preferences`
  table; no tokens, no scheduler (contract §9).
- **No storage buckets, no analytics, no social mechanics** of any kind.

## How to run/review the migrations later

When a Supabase project is created (not part of this task):

1. `supabase init` in the repo (creates `supabase/config.toml`).
2. The Supabase CLI expects migration filenames as `<timestamp>_name.sql`
   (e.g. `20260707000001_initial_schema.sql`). Rename the three files then —
   the `001_`/`002_`/`003_` prefixes were chosen for review readability and
   preserve the required ordering when renamed in the same order.
3. Local check: `supabase start` + `supabase db reset` runs all migrations
   against a local stack (this also provides `auth.users` and the
   `anon`/`authenticated`/`service_role` roles the SQL references).
4. Remote: `supabase link --project-ref <ref>` then `supabase db push`.
5. Generate types for the app phase:
   `supabase gen types typescript --local > src/lib/database.types.ts`
   (path to be decided at wiring time; nothing imports it yet).

The SQL targets a Supabase environment: it references `auth.users`,
`auth.uid()`, and the `anon`/`authenticated` roles. It will not run on a
vanilla Postgres without shims — review it as Supabase SQL.

## Security assumptions (to re-verify at wiring time)

- **`security definer` everywhere it matters.** All `private.*` helpers and
  all 5 RPCs run as the migration role (table owner), which bypasses RLS.
  Every RPC therefore does its own `auth.uid()` authorization check before
  touching data, and every definer function pins `search_path = ''` with
  schema-qualified references.
- **Deny by default.** RLS is enabled on all 9 tables; any operation without a
  policy (all deletes, all writes to `memberships`/`invite_codes`, inserts to
  `groups`/`weekly_schedules`/`schedule_days`) is blocked for clients and only
  reachable through RPCs or the service role.
- **Column-level grants complement RLS.** RLS picks rows; revoked-then-
  regranted column lists pick columns (e.g. leaders can edit a day's passage
  and flags but not its `date`/`weekday`; reflection authors can edit
  body/visibility/highlights but never the passage snapshot or date).
- **anon has nothing.** All table privileges are revoked from `anon`; RPC
  execute is granted to `authenticated` only. Iron has no anonymous surface.
- **Profile creation is a client insert** (`profiles_insert_own`, id must
  equal `auth.uid()`). Alternative: a trigger on `auth.users`. Decide at
  wiring time; the policy is safe either way.
- **The feed's "respond first" gate stays client-side** (contract §5). RLS
  authorizes group members to read shared reflections; the soft gate is UX.
- **Archived groups**: new Amens/reflections are blocked
  (`private.can_respond_to_day` checks group status) and the join RPC refuses
  archived groups, but leader edits to schedules of an archived group are not
  yet blocked — acceptable for MVP since archiving has no UI; revisit with
  open decision #3.
- **`removed` members cannot rejoin by code** — the join RPC fails closed,
  because removal semantics are an undecided product question (contract §10).
  Nothing can set `status = 'removed'` yet, so this path is unreachable today.
- **Timestamps are server-side.** `created_at`/`updated_at` are never
  client-writable (insert column grants exclude them; `updated_at` comes from
  triggers), so feed ordering cannot be spoofed.
- **The client passes `week_start`** to `create_group_with_leader`/`start_week`
  because "this week" is a device-timezone concept; the server validates it is
  a Monday but does not guess it from `now()`.

## Next step after schema review

Per contract §8, in order:

1. Isaac reviews these three SQL files against the contract.
2. Create the Supabase project, run the migrations (steps above), and try the
   RPC flows by hand (SQL editor or `curl`) — especially: join with a bad
   code, member reading a draft week, member inserting a reflection on a
   hidden day (all must fail).
3. Then begin app wiring as its own task, following contract §8: auth (email
   OTP) + profile creation first, groups/memberships second. That task — not
   this one — installs `@supabase/supabase-js` and adds the client.
