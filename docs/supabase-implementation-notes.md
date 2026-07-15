# Iron — Supabase implementation notes

Companion to `docs/supabase-contract.md`. Covers the SQL under
`supabase/migrations/`, the app integration under `src/lib/`, how to set it
up, and what is deliberately not done yet.

## What exists

### Database (schema branch)

| File | Contents |
| --- | --- |
| `supabase/migrations/001_initial_schema.sql` | `private` schema, 9 tables, constraints, indexes, `updated_at` trigger, two integrity triggers (day-date, reflection-snapshot). |
| `supabase/migrations/002_rls_policies.sql` | RLS enabled on all 9 tables, 4 `private.*` helper predicates, 21 policies, column-level grants. |
| `supabase/migrations/003_rpc_functions.sql` | 5 `security definer` RPCs (`create_group_with_leader`, `join_group_by_invite_code`, `start_week`, `publish_weekly_schedule`, `rotate_invite_code`) + 2 private helpers; deferred RPCs listed as TODOs. |
| `supabase/validate-local.mjs` | Docker-free migration validation: runs all three migrations on PGlite (real Postgres in WASM) with an auth/roles shim, then 53 behavioral RLS assertions. |
| `supabase/config.toml` | `supabase init` output for a future local stack. |

Files must run in order — 002 references tables from 001, 003 references
helpers from 002.

### App integration (this branch)

| File | Contents |
| --- | --- |
| `src/lib/supabase.ts` | Client (AsyncStorage-backed session persistence); `null` when env vars are missing → the app runs in demo mode instead of crashing. |
| `src/lib/db/*` | Data layer: `types` (hand-written row types), `profiles`, `groups` (RPCs), `schedules`, `reflections`, `responses`, `notifications`, `load` (assembles the whole app state from RLS-scoped selects). |
| `src/lib/supabase-actions.ts` | `AppActions` against Supabase: optimistic dispatch through the existing reducer + matching server write; join/create/start-week are server-first with a full reload so state always carries server ids. |
| `src/lib/store.tsx` | Mode-branched provider: demo hydration/persistence unchanged; Supabase mode follows the auth session, mirrors server data into the same `AppState`, and persists only device prefs (language, active group). |
| `src/app/sign-in.tsx` | Email OTP screen (typed 6-digit code — no deep links, works in Expo Go). |
| `.env.example` | Placeholder env vars; `.env` is gitignored. |

**Two modes, never mixed.** With `EXPO_PUBLIC_SUPABASE_URL` +
`EXPO_PUBLIC_SUPABASE_ANON_KEY` set, the app is Supabase-backed end to end
and demo seeds are never loaded. Without them it is exactly the pre-Supabase
local demo app (separate AsyncStorage keys). The choice happens once, at
module load.

## Setup

1. Create a Supabase project (or run a local stack on a machine with Docker:
   `npx supabase start`).
2. Apply migrations: `npx supabase db push` (linked project) or
   `npx supabase db reset` (local stack). Note the Supabase CLI expects
   migration files named `<timestamp>_name.sql`; rename the `001_`/`002_`/
   `003_` files preserving order when adopting the CLI flow.
3. Auth: enable the **Email** provider. OTP-code sign-in works out of the box
   (`signInWithOtp` + `verifyOtp` with typed codes); no redirect URL or deep
   link setup is needed. For production, configure custom SMTP — the built-in
   sender is rate-limited (~2 emails/hour), which also matters when testing
   with real addresses. On a local stack, OTP emails land in Mailpit
   (`http://127.0.0.1:54324`).
4. `cp .env.example .env`, fill in the URL and anon key, restart Expo with
   cache clear (`npx expo start -c` — env vars are inlined at bundle time).

## Validation status

See `docs/qa-playbook.md` for the full release QA process.

- **PGlite RLS regression suite: PASSING.** `npm run test:rls` → migrations
  apply cleanly, ~140 behavioral assertions pass across sections S1–S14
  (anon posture, cross-group isolation, schedule lifecycle, Amen/reflection
  rules, membership lifecycle, archived groups, column-grant immutability
  and more). `@electric-sql/pglite` is a devDependency; the suite runs after
  a plain `npm install`.
- **Hosted two-account E2E harness:** `qa/hosted/` drives the real Supabase
  project with the anon key + two real OTP sessions (see its README).
- Migrations `001`–`003` are applied to the hosted dev project;
  `npx supabase migration list --linked` matches local history.
- App checks passing: `npm run check` (typecheck + lint + RLS suite),
  `npx madge --circular src` (none).

## What is intentionally NOT done

- **No API.Bible** — verse text is still the local mock (`src/lib/bible.ts`);
  the backend stores only passage references.
- **No push notification delivery** — preferences persist to
  `notification_preferences`; no tokens/scheduler. The reminder on/off switch
  in the notification screen remains UI-only (the table has `enabled` ready).
- **No social features, no analytics, no storage buckets.**
- ~~No sign-out UI~~ — implemented since: the Account screen signs out via
  Supabase, resets in-memory state, and clears the persisted session.
- **No realtime** — data refreshes on auth, join/create/start-week, and
  reflection posts. Other members' new activity appears on next reload/app
  start. Deliberate MVP choice to keep the surface minimal.

## Security assumptions (unchanged from the schema phase)

- RLS is the boundary; the anon key ships in the client by design.
- All `private.*` helpers and RPCs are `security definer` with pinned
  `search_path`; every RPC authorizes on `auth.uid()` itself.
- Client mutations are optimistic: the reducer enforces the same product
  rules first, RLS enforces them for real. A rejected write logs a warning
  and converges on the next reload rather than crashing.
- The feed's "respond before you read today's reflections" gate stays
  client-side UX, per the contract.

## Known MVP limitations / risks

- **Stale-passage reflections**: if a leader edits a day's passage after a
  member loaded the app, that member's reflection insert carries the old
  snapshot and the DB trigger rejects it (warning logged; local copy stays
  until restart). Self-heals on reload; a refetch-before-post can come later.
- **Offline writes are fire-and-forget**: failed syncs warn and drop; there
  is no outbox/retry queue.
- **Leader edits on archived groups** are not blocked by policy yet
  (archiving has no UI; revisit with contract open decision #3).
- Hand-written row types in `src/lib/db/types.ts` — replace with
  `supabase gen types typescript` once a project exists.

## Manual QA checklist (Expo Go, two devices/accounts)

1. Fresh install with env vars set → sign-in screen; email OTP code arrives;
   typing it signs in; app lands on Welcome (no groups yet).
2. Create group as leader (name typed here becomes the profile) → invite code
   screen shows a real `IRON-XXXX` code → notification time → Home shows the
   draft week.
3. On device 2, sign in with a different email, join with the invite code →
   member Home shows "not scheduled yet" while the week is a draft.
4. Leader: Manage → set chapters via the Bible picker (book → chapter →
   whole/range), auto-fill, write prayer point → Publish → member sees the
   week after reopening the app.
5. Toggle Saturday enabled: member sees a Saturday reading appear/disappear
   (rest day) after reload.
6. Hide today's reading (eye icon): member's Home/Feed show rest state;
   direct `/reading` access is blocked; leader still sees it.
7. Member Amens today → leader's Feed "responded" count includes them;
   double-tap doesn't duplicate.
8. Member posts a **shared** reflection → appears in leader's Feed (after
   leader responds, per the soft gate). Member posts a **private** reflection
   → never appears in anyone else's Feed; visible in own My Reflections.
9. Hide the day after responses exist → existing shared reflection still
   opens from the Feed.
10. Switch between two groups (one led, one joined) → Manage tab appears only
    for the led group.
11. Change notification time → row appears/updates in
    `notification_preferences` with the device's IANA timezone.
12. Kill and reopen the app → still signed in, same active group, data
    reloads from the server.
13. Remove env vars, restart with `-c` → demo mode boots with seeded data
    (no crash, no Supabase calls).

## Next step after this branch

1. Run `npx supabase db reset` on a Docker-capable machine (or `db push` to a
   dev project) and walk the QA checklist above in Expo Go.
2. Generate typed rows (`supabase gen types typescript`) and swap
   `src/lib/db/types.ts`.
3. Then, per contract §8: invite-code rotation UI, notification `enabled`
   persistence in the UI, and (later phases) push delivery and API.Bible.
