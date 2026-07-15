# Iron — hosted two-account E2E QA harness

Drives the **real hosted Supabase project** through the same surface the app
uses: the anon key plus real authenticated user sessions. It is the hosted
counterpart to the PGlite suite (`npm run test:rls`) — same rules, real stack.

## Safety rules

- **Anon key + user sessions only.** The service-role key is never used —
  RLS proofs are only meaningful from realistic user contexts.
- **Nothing is deleted.** The harness only performs actions the app itself
  can perform. Each run creates one QA group and archives it at the end so it
  never appears in the app's My Groups (the app filters to `active`).
- Session tokens are cached in `qa/.sessions/` (gitignored). Never commit or
  print them.

## Running

Two different accounts are required (Gmail `+suffix` aliases work well —
Supabase treats them as separate users, the mail lands in one inbox).

One-time per account (or when a cached session expires):

```bash
node qa/hosted/request-otp.mjs leader@example.com
node qa/hosted/verify-otp.mjs  leader@example.com 123456
node qa/hosted/request-otp.mjs member@example.com
node qa/hosted/verify-otp.mjs  member@example.com 654321
```

Full run:

```bash
node qa/hosted/run-e2e.mjs --leader leader@example.com --member member@example.com
```

Exit code 0 = all assertions passed. Output style matches
`supabase/validate-local.mjs` (`pass`/`FAIL` per assertion, summary line).

## What it covers

- anon posture: no table reads, no RPC calls without a session
- profile creation own-row-only
- group creation RPC (draft week, 7 day rows, Mon–Fri enabled)
- pre-join invisibility, invite-code join (case/whitespace tolerant,
  idempotent), garbage codes rejected
- draft weeks invisible to members; publish gate (prayer point required);
  `status` column not directly writable; `published_at` set exactly once
- member/leader schedule visibility (rest days, hidden days) and the
  leader-only mutation surface
- Amen: unique per member/day, hidden-day and rest-day denials, no
  responding as someone else
- reflections: shared/private visibility, snapshot integrity, author-only
  edits, immutable snapshot columns, survival of later day-hiding
- notification preferences: grants-safe update→insert save path, owner-only
  visibility
- invite code rotation: old code dies, members can't rotate
- archive: leader-only, blocks joins and new responses, stays readable
