# Iron — release QA playbook

The repeatable process for trusting a `supabase-integration` build. Run it
before merging integration work and before any build that reaches real users.

## Principles

- **RLS is the boundary, so test it as users.** All security assertions run
  as `anon` or as authenticated user sessions. The service-role key is never
  used to "prove" anything — it bypasses the thing being tested.
- **The hosted dev database is never reset.** No `supabase db reset --linked`,
  no destructive SQL, no migration repair. QA data is created through the
  product's own paths and archived afterwards.
- **Applied migrations are immutable.** `001`–`003` are live. Every schema,
  grant, function, or policy correction ships as a new forward migration
  (`004_<description>.sql` onward) — see the migration protocol below.

## 1. Static gates (every change)

```bash
npm run check          # typecheck + lint + PGlite RLS suite
npx madge --circular --extensions ts,tsx src   # must report none
git diff --check       # no whitespace damage
```

`npm run check` must end `0 failed`. A typecheck/lint failure or any RLS
assertion failure blocks the change.

## 2. PGlite RLS regression suite (every change touching SQL or the data layer)

```bash
npm run test:rls       # node supabase/validate-local.mjs
```

Real Postgres (WASM) runs migrations 001→003 against a Supabase shim, then
~140 behavioral assertions in sections S1–S14: anon posture, profiles,
group creation, invite joins (expiry, case tolerance), cross-group isolation,
schedule lifecycle (publish gate, `published_at` set-once, hidden/rest days),
Amen rules, reflection visibility + snapshot integrity, cross-group privacy
with shared membership, rotation, membership lifecycle (left/removed/leader
rejoin), notification preferences, archived groups, and the profile
visibility matrix.

**Extending it:** add assertions to the matching section using the helpers
(`expectOk`, `expectDeny`, `expectZeroRows`, `expectRowCount`, `check`).
Fixture manipulation that no client could perform goes through `asOwner()`
and must never carry an assertion. New product rules get a new section.

**Every new migration must land with suite coverage for what it changes.**

## 3. Hosted two-account E2E (before release builds; after any migration push)

The same rules, proven on the real stack — PostgREST, GoTrue, real grants.
See `qa/hosted/README.md` for the account/OTP setup (Gmail `+suffix` aliases
give unlimited test accounts in one inbox).

```bash
node qa/hosted/run-e2e.mjs --leader <email> --member <email>
```

Creates one QA group, exercises the full product flow from both accounts with
RLS denial probes throughout, then archives the group (the app's My Groups
only shows `active`, so QA runs never clutter real devices). Must end
`0 failed`.

## 4. Manual Expo Go checklist (what automation can't see)

On a real device against the hosted project:

- [ ] OTP email arrives, 6-digit code signs in
- [ ] fresh sign-in lands on the right screen with server data
- [ ] sign-out from Account resets state and survives app restart
- [ ] create group → invite code visible; second device joins with it
- [ ] leader: set week, hide a day, publish; member sees exactly that
- [ ] member: Amen and reflection (shared + private) round-trip
- [ ] leader Feed shows the member's shared reflection, never the private one
- [ ] multi-group: switch groups, active group survives restart
- [ ] Korean mode: Manage fields not clipped, My Groups metadata aligned
- [ ] notification time picker saves and reloads
- [ ] airplane mode: app opens without crashing, converges on reconnect

## 5. Migration protocol (any schema/RLS/RPC change)

1. Write `supabase/migrations/00N_<clear_description>.sql` — never edit an
   applied file.
2. Explain its purpose and get the SQL reviewed before it goes anywhere.
3. `npm run test:rls` — the suite must apply the new migration cleanly
   (add it to the loop in `validate-local.mjs`) and cover its behavior.
4. `npx supabase migration list --linked` — confirm local/remote history
   matches before pushing.
5. `npx supabase db push --linked --dry-run` — must list only the intended
   new migration.
6. Push, then re-run the hosted E2E harness (§3).

## 6. Data hygiene

- Hosted QA groups are named `QA <timestamp>` and archived by the harness.
- Session tokens live only in `qa/.sessions/` (gitignored).
- Real secrets (SMTP, service-role, access tokens) never appear in the repo,
  in scripts, or in QA output.
