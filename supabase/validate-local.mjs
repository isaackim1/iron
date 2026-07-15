// Validate Iron's Supabase migrations against PGlite (real Postgres in WASM)
// — no Docker required. Shims the Supabase-provided surface (auth schema,
// auth.uid(), roles), runs 001 → 002 → 003, then a behavioral RLS regression
// suite covering the contract's security rules.
//
// Run from the repo root:
//   npm run test:rls        (or: node supabase/validate-local.mjs)
//
// Structure: sections S1–S12, each a product concern. Fixture manipulation
// that no real client could perform (expiring codes, flipping membership
// status) runs as the table owner via asOwner() and is clearly marked — every
// actual assertion runs as anon or as an authenticated user, never as owner.
//
// This complements — not replaces — the hosted two-account E2E harness
// (qa/hosted/), which validates the same rules against the real Supabase
// stack. PGlite is real Postgres but not the full Supabase deployment.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const db = new PGlite();

let passed = 0;
let failed = 0;

function section(title) {
  console.log(`\n--- ${title} ---`);
}

async function run(label, sql) {
  try {
    await db.exec(sql);
    console.log(`OK   ${label}`);
  } catch (e) {
    console.log(`FAIL ${label}: ${e.message}`);
    throw e;
  }
}

// --- Role/impersonation helpers ---------------------------------------------

async function become(role, uid) {
  await db.exec(
    `set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`,
  );
}

/** Run fn as an authenticated user (or pass uid=null for a bare JWT-less session). */
async function asUser(uid, fn) {
  await become('authenticated', uid);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

/** Run fn as the anon role (no session at all). */
async function asAnon(fn) {
  await become('anon', null);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

/**
 * TEST FIXTURE ONLY — runs as the table owner, bypassing RLS. Used to set up
 * states no client API can produce (expired codes, left/removed memberships).
 * Never used for an assertion about what users can or cannot do.
 */
async function asOwner(fn) {
  await db.exec('reset role;');
  return fn();
}

// --- Assertion helpers -------------------------------------------------------

async function expectOk(label, ctx, fn) {
  try {
    const r = await ctx(fn);
    console.log(`pass ${label}`);
    passed++;
    return r;
  } catch (e) {
    console.log(`FAIL ${label}: ${e.message}`);
    failed++;
    return null;
  }
}

async function expectDeny(label, ctx, fn) {
  try {
    await ctx(fn);
    console.log(`FAIL ${label} (expected denial, succeeded)`);
    failed++;
  } catch (e) {
    console.log(`pass ${label} (denied: ${e.message.slice(0, 80)})`);
    passed++;
  }
}

/** RLS-filtered UPDATE/SELECT that must silently match zero rows. */
async function expectZeroRows(label, ctx, fn) {
  try {
    const r = await ctx(fn);
    const n = r?.rows?.length ?? 0;
    if (n === 0) {
      console.log(`pass ${label} (0 rows)`);
      passed++;
    } else {
      console.log(`FAIL ${label}: matched ${n} rows`);
      failed++;
    }
  } catch (e) {
    console.log(`FAIL ${label}: ${e.message}`);
    failed++;
  }
}

async function expectRowCount(label, ctx, fn, want) {
  try {
    const r = await ctx(fn);
    const n = r?.rows?.length ?? 0;
    if (n === want) {
      console.log(`pass ${label} (${n} rows)`);
      passed++;
    } else {
      console.log(`FAIL ${label}: got ${n} rows, wanted ${want}`);
      failed++;
    }
    return r;
  } catch (e) {
    console.log(`FAIL ${label}: ${e.message}`);
    failed++;
    return null;
  }
}

function check(label, cond, detail = '') {
  if (cond) {
    console.log(`pass ${label}`);
    passed++;
  } else {
    console.log(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
    failed++;
  }
}

// --- Supabase environment shim -----------------------------------------------
// Mirrors what a real Supabase project provides before migrations run.
// auth.uid() reads a GUC so we can impersonate users in tests, same trick
// used by Supabase's own test helpers.
await run('shim', `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid
    language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase default privileges: authenticated/anon get table access,
  -- gated by RLS. Our 002 then revokes/narrows.
  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant execute on functions to anon, authenticated, service_role;
`);

for (const f of ['001_initial_schema.sql', '002_rls_policies.sql', '003_rpc_functions.sql']) {
  await run(f, await readFile(`${MIG}/${f}`, 'utf8'));
}

// --- Fixtures ------------------------------------------------------------------
// LEADER leads group A. MEMBER is a member of A (later also of B, for
// cross-group privacy probes). LEADER_B leads group B. JOINER joins A late
// (rotation + membership-lifecycle tests). OUTSIDER never joins anything.
// NOPROFILE has an auth user but never creates a profile.
const LEADER = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';
const LEADER_B = '33333333-3333-3333-3333-333333333333';
const JOINER = '44444444-4444-4444-4444-444444444444';
const OUTSIDER = '55555555-5555-5555-5555-555555555555';
const NOPROFILE = '66666666-6666-6666-6666-666666666666';

// Any Monday works; fixed for determinism (2026-07-06 is a Monday).
const WEEK = '2026-07-06';

await db.exec(
  `insert into auth.users (id) values ('${LEADER}'),('${MEMBER}'),('${LEADER_B}'),('${JOINER}'),('${OUTSIDER}'),('${NOPROFILE}')`,
);

// ==============================================================================
section('S1 anon + unauthenticated posture');
// ==============================================================================

const TABLES = [
  'profiles', 'groups', 'memberships', 'invite_codes', 'weekly_schedules',
  'schedule_days', 'reflections', 'amen_responses', 'notification_preferences',
];
for (const t of TABLES) {
  await expectDeny(`anon cannot select ${t}`, asAnon, () =>
    db.query(`select * from public.${t} limit 1`));
}
await expectDeny('anon cannot call create_group_with_leader', asAnon, () =>
  db.query(`select public.create_group_with_leader('X', '${WEEK}'::date)`));
await expectDeny('anon cannot call join_group_by_invite_code', asAnon, () =>
  db.query(`select public.join_group_by_invite_code('IRON-0000')`));
await expectDeny('anon cannot call start_week', asAnon, () =>
  db.query(`select public.start_week(gen_random_uuid(), '${WEEK}'::date)`));
await expectDeny('anon cannot call publish_weekly_schedule', asAnon, () =>
  db.query(`select public.publish_weekly_schedule(gen_random_uuid())`));
await expectDeny('anon cannot call rotate_invite_code', asAnon, () =>
  db.query(`select public.rotate_invite_code(gen_random_uuid())`));

// authenticated role with no JWT claim (defense in depth: should never occur)
await expectDeny('JWT-less session cannot create group', (fn) => asUser(null, fn), () =>
  db.query(`select public.create_group_with_leader('X', '${WEEK}'::date)`));
await expectRowCount('JWT-less session sees no profiles', (fn) => asUser(null, fn), () =>
  db.query(`select * from public.profiles`), 0);

// ==============================================================================
section('S2 profiles');
// ==============================================================================

const asLeader = (fn) => asUser(LEADER, fn);
const asMember = (fn) => asUser(MEMBER, fn);
const asLeaderB = (fn) => asUser(LEADER_B, fn);
const asJoiner = (fn) => asUser(JOINER, fn);
const asOutsider = (fn) => asUser(OUTSIDER, fn);

await expectOk('leader creates own profile', asLeader, () =>
  db.query(`insert into public.profiles (id, display_name) values ('${LEADER}', 'Isaac') returning id`));
await expectOk('member creates own profile', asMember, () =>
  db.query(`insert into public.profiles (id, display_name) values ('${MEMBER}', 'Hana') returning id`));
await expectOk('leader B creates own profile', asLeaderB, () =>
  db.query(`insert into public.profiles (id, display_name) values ('${LEADER_B}', 'Minho') returning id`));
await expectOk('joiner creates own profile', asJoiner, () =>
  db.query(`insert into public.profiles (id, display_name) values ('${JOINER}', 'Jun') returning id`));
await expectOk('outsider creates own profile', asOutsider, () =>
  db.query(`insert into public.profiles (id, display_name) values ('${OUTSIDER}', 'Out') returning id`));

await expectDeny('member cannot create profile for someone else', asMember, async () => {
  const r = await db.query(`insert into public.profiles (id, display_name) values ('${NOPROFILE}', 'X') returning id`);
  if (r.rows.length) throw new Error('inserted someone else’s profile');
});
await expectDeny('empty display name rejected', (fn) => asUser(NOPROFILE, fn), () =>
  db.query(`insert into public.profiles (id, display_name) values ('${NOPROFILE}', '  ') returning id`));

// No shared group yet: nobody sees anybody else.
await expectRowCount('member sees only own profile before any group', asMember, () =>
  db.query(`select id from public.profiles`), 1);

await expectOk('member renames own profile', asMember, () =>
  db.query(`update public.profiles set display_name = 'Hana Kim' where id = '${MEMBER}' returning id`));
await expectZeroRows('member cannot rename someone else (0 rows via RLS)', asMember, () =>
  db.query(`update public.profiles set display_name = 'hax' where id = '${LEADER}' returning id`));
await expectDeny('member cannot rewrite profiles.id (column grant)', asMember, () =>
  db.query(`update public.profiles set id = '${NOPROFILE}' where id = '${MEMBER}'`));

// ==============================================================================
section('S3 group creation');
// ==============================================================================

await expectDeny('create group without a profile rejected', (fn) => asUser(NOPROFILE, fn), () =>
  db.query(`select public.create_group_with_leader('No Profile Crew', '${WEEK}'::date)`));
await expectDeny('create group with empty name rejected', asLeader, () =>
  db.query(`select public.create_group_with_leader('   ', '${WEEK}'::date)`));
await expectDeny('create group with non-Monday week rejected', asLeader, () =>
  db.query(`select public.create_group_with_leader('Tuesday Crew', '2026-07-07'::date)`));
await expectDeny('direct insert into groups blocked', asLeader, () =>
  db.query(`insert into public.groups (name, created_by) values ('Direct', '${LEADER}') returning id`));

const gA = await expectOk('create_group_with_leader (group A)', asLeader, () =>
  db.query(`select public.create_group_with_leader('Honest People', '${WEEK}'::date) as r`));
const groupA = gA?.rows?.[0]?.r?.group_id;
const codeA = gA?.rows?.[0]?.r?.invite_code;
console.log(`     group A=${groupA} code=${codeA}`);

const gB = await expectOk('create_group_with_leader (group B)', asLeaderB, () =>
  db.query(`select public.create_group_with_leader('Iron Backend QA', '${WEEK}'::date) as r`));
const groupB = gB?.rows?.[0]?.r?.group_id;
const codeB = gB?.rows?.[0]?.r?.invite_code;

const aLeaderRows = await asLeader(() =>
  db.query(`select role, status from public.memberships where group_id = '${groupA}' and user_id = '${LEADER}'`));
check('creator is active leader of group A',
  aLeaderRows.rows.length === 1 && aLeaderRows.rows[0].role === 'leader' && aLeaderRows.rows[0].status === 'active');

// ==============================================================================
section('S4 join by invite code');
// ==============================================================================

await expectOk('member joins group A by code', asMember, () =>
  db.query(`select public.join_group_by_invite_code('${codeA}') as r`));
await expectOk('joining twice is idempotent', asMember, () =>
  db.query(`select public.join_group_by_invite_code('${codeA}') as r`));
await expectOk('code is case/whitespace tolerant', asMember, () =>
  db.query(`select public.join_group_by_invite_code('  ${codeA.toLowerCase()} ') as r`));
await expectDeny('bad code rejected', asOutsider, () =>
  db.query(`select public.join_group_by_invite_code('IRON-0000') as r`));
await expectDeny('join without a profile rejected', (fn) => asUser(NOPROFILE, fn), () =>
  db.query(`select public.join_group_by_invite_code('${codeA}') as r`));
await expectDeny('outsider cannot insert membership directly', asOutsider, () =>
  db.query(`insert into public.memberships (group_id, user_id, role) values ('${groupA}', '${OUTSIDER}', 'leader')`));

// Expiry is derived from expires_at, evaluated only inside the join RPC.
await asOwner(() =>
  db.query(`update public.invite_codes set expires_at = now() - interval '1 hour' where group_id = '${groupA}' and status = 'active'`));
await expectDeny('expired code rejected', asOutsider, () =>
  db.query(`select public.join_group_by_invite_code('${codeA}') as r`));
await asOwner(() =>
  db.query(`update public.invite_codes set expires_at = null where group_id = '${groupA}' and status = 'active'`));

// ==============================================================================
section('S5 cross-group isolation (A ↔ B)');
// ==============================================================================

await expectRowCount('member of A cannot see group B row', asMember, () =>
  db.query(`select id from public.groups where id = '${groupB}'`), 0);
await expectRowCount('member of A cannot see B memberships', asMember, () =>
  db.query(`select id from public.memberships where group_id = '${groupB}'`), 0);
await expectRowCount('member of A cannot see B schedules', asMember, () =>
  db.query(`select id from public.weekly_schedules where group_id = '${groupB}'`), 0);
await expectRowCount('member of A cannot see leader B profile (no shared group)', asMember, () =>
  db.query(`select id from public.profiles where id = '${LEADER_B}'`), 0);

await expectZeroRows('leader A cannot rename group B (0 rows via RLS)', asLeader, () =>
  db.query(`update public.groups set name = 'hax' where id = '${groupB}' returning id`));
await expectDeny('leader A cannot start a week for B', asLeader, () =>
  db.query(`select public.start_week('${groupB}', '2026-07-13'::date)`));
await expectDeny('leader A cannot rotate B invite code', asLeader, () =>
  db.query(`select public.rotate_invite_code('${groupB}')`));

const bSchedule = await asLeaderB(() =>
  db.query(`select id from public.weekly_schedules where group_id = '${groupB}'`));
const scheduleB = bSchedule.rows[0].id;
await expectDeny('leader A cannot publish B schedule', asLeader, () =>
  db.query(`select public.publish_weekly_schedule('${scheduleB}')`));
await expectZeroRows('leader A cannot edit B prayer point (0 rows via RLS)', asLeader, () =>
  db.query(`update public.weekly_schedules set prayer_point = 'hax' where id = '${scheduleB}' returning id`));

// ==============================================================================
section('S6 weekly schedule lifecycle (group A)');
// ==============================================================================

await expectRowCount('draft week invisible to member', asMember, () =>
  db.query(`select id from public.weekly_schedules where group_id = '${groupA}'`), 0);

const draft = await asLeader(() =>
  db.query(`select id, status from public.weekly_schedules where group_id = '${groupA}'`));
check('leader sees own draft week', draft.rows.length === 1 && draft.rows[0].status === 'draft');
const scheduleA = draft.rows[0].id;

const dayRows = await asLeader(() =>
  db.query(`select id, weekday, date, book, chapter, enabled, published from public.schedule_days where schedule_id = '${scheduleA}' order by weekday`));
check('week has 7 day rows, Mon–Fri enabled',
  dayRows.rows.length === 7 && dayRows.rows.filter((d) => d.enabled).length === 5,
  `rows=${dayRows.rows.length}`);
const day = Object.fromEntries(dayRows.rows.map((d) => [d.weekday, d]));

await expectDeny('start_week rejects non-Monday', asLeader, () =>
  db.query(`select public.start_week('${groupA}', '2026-07-07'::date)`));
await expectDeny('start_week rejects duplicate week', asLeader, () =>
  db.query(`select public.start_week('${groupA}', '${WEEK}'::date)`));
await expectDeny('member cannot start a week', asMember, () =>
  db.query(`select public.start_week('${groupA}', '2026-07-13'::date)`));

await expectDeny('publish blocked without prayer point', asLeader, () =>
  db.query(`select public.publish_weekly_schedule('${scheduleA}')`));
await expectOk('leader sets prayer point', asLeader, () =>
  db.query(`update public.weekly_schedules set prayer_point = 'Lord, keep us centered.' where id = '${scheduleA}' returning id`));
await expectZeroRows('member cannot edit schedule (0 rows via RLS)', asMember, () =>
  db.query(`update public.weekly_schedules set prayer_point = 'hax' where id = '${scheduleA}' returning id`));
await expectDeny('leader cannot flip status directly (column grant)', asLeader, () =>
  db.query(`update public.weekly_schedules set status = 'published' where id = '${scheduleA}'`));
await expectDeny('leader cannot rewrite week_start (column grant)', asLeader, () =>
  db.query(`update public.weekly_schedules set week_start = '2026-07-13' where id = '${scheduleA}'`));
await expectDeny('member cannot publish', asMember, () =>
  db.query(`select public.publish_weekly_schedule('${scheduleA}')`));

await expectOk('publish via RPC', asLeader, () =>
  db.query(`select public.publish_weekly_schedule('${scheduleA}')`));
const pub1 = await asLeader(() =>
  db.query(`select published_at from public.weekly_schedules where id = '${scheduleA}'`));
check('published_at is set', !!pub1.rows[0].published_at);

await expectOk('re-publish is idempotent', asLeader, () =>
  db.query(`select public.publish_weekly_schedule('${scheduleA}')`));
const pub2 = await asLeader(() =>
  db.query(`select published_at from public.weekly_schedules where id = '${scheduleA}'`));
check('published_at never overwritten',
  String(pub1.rows[0].published_at) === String(pub2.rows[0].published_at));

await expectOk('leader edits prayer point after publish (decided #1)', asLeader, () =>
  db.query(`update public.weekly_schedules set prayer_point = 'Lord, teach us to rest.' where id = '${scheduleA}' returning id`));

// member visibility
await expectRowCount('member sees published week', asMember, () =>
  db.query(`select id from public.weekly_schedules where group_id = '${groupA}'`), 1);
await expectRowCount('member sees 5 enabled days (weekend rest hidden)', asMember, () =>
  db.query(`select weekday from public.schedule_days where schedule_id = '${scheduleA}'`), 5);

await expectOk('leader hides Wednesday', asLeader, () =>
  db.query(`update public.schedule_days set published = false where id = '${day[2].id}' returning id`));
await expectRowCount('hidden day invisible to member', asMember, () =>
  db.query(`select weekday from public.schedule_days where schedule_id = '${scheduleA}'`), 4);
await expectZeroRows('member cannot toggle a day (0 rows via RLS)', asMember, () =>
  db.query(`update public.schedule_days set enabled = false where id = '${day[2].id}' returning id`));
await expectDeny('leader cannot rewrite a day’s date (column grant)', asLeader, () =>
  db.query(`update public.schedule_days set date = '2026-07-20' where id = '${day[2].id}'`));
await expectDeny('leader cannot move a day’s weekday (column grant)', asLeader, () =>
  db.query(`update public.schedule_days set weekday = 6 where id = '${day[2].id}'`));

// ==============================================================================
section('S7 Amen responses (group A)');
// ==============================================================================

const mon = day[0];
const wed = day[2]; // hidden above
const sat = day[5]; // rest day (enabled = false)

await expectOk('member Amens Monday', asMember, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}') returning id`));
await expectDeny('double Amen blocked (unique per member per day)', asMember, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}')`));
await expectDeny('Amen on hidden day blocked for member', asMember, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${MEMBER}', '${wed.id}', '${iso(wed.date)}')`));
await expectOk('leader Amens own hidden day', asLeader, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${LEADER}', '${wed.id}', '${iso(wed.date)}') returning id`));
await expectDeny('Amen on rest day blocked even for leader', asLeader, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${LEADER}', '${sat.id}', '${iso(sat.date)}')`));
await expectDeny('Amen as someone else blocked', asMember, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${LEADER}', '${mon.id}', '${iso(mon.date)}')`));
await expectDeny('Amen with no schedule day blocked', asMember, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${MEMBER}', null, '${iso(mon.date)}')`));
await expectDeny('Amen with mismatched date blocked', asMember, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${MEMBER}', '${day[1].id}', '${iso(mon.date)}')`));
await expectDeny('Amen claiming another group blocked (day/group mismatch)', asMember, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupB}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}')`));
await expectDeny('outsider cannot Amen at all', asOutsider, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${OUTSIDER}', '${mon.id}', '${iso(mon.date)}')`));

// ==============================================================================
section('S8 reflections (group A)');
// ==============================================================================

await expectOk('member posts shared reflection', asMember, () =>
  db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, body, visibility) values ('${groupA}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}', '${mon.book}', ${mon.chapter}, 'Shared thought', 'shared') returning id`));
await expectOk('member posts private reflection', asMember, () =>
  db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, body, visibility) values ('${groupA}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}', '${mon.book}', ${mon.chapter}, 'Private thought', 'private') returning id`));
await expectDeny('wrong passage snapshot rejected', asMember, () =>
  db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, body, visibility) values ('${groupA}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}', 'Genesis', 1, 'Wrong snapshot', 'shared')`));
await expectDeny('reflection with no schedule day rejected', asMember, () =>
  db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, body, visibility) values ('${groupA}', '${MEMBER}', null, '${iso(mon.date)}', '${mon.book}', ${mon.chapter}, 'Dangling', 'shared')`));
await expectDeny('reflection as someone else rejected', asMember, () =>
  db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, body, visibility) values ('${groupA}', '${LEADER}', '${mon.id}', '${iso(mon.date)}', '${mon.book}', ${mon.chapter}, 'Forged', 'shared')`));
await expectDeny('reflection on rest day rejected', asLeader, () =>
  db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, body, visibility) values ('${groupA}', '${LEADER}', '${sat.id}', '${iso(sat.date)}', '${sat.book}', ${sat.chapter}, 'Rest day', 'shared')`));
await expectDeny('invalid verse range rejected (constraint)', asMember, () =>
  db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, verse_start, verse_end, body, visibility) values ('${groupA}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}', '${mon.book}', ${mon.chapter}, 5, 2, 'Bad range', 'shared')`));

const leaderReads = await asLeader(() =>
  db.query(`select body from public.reflections where group_id = '${groupA}' and user_id = '${MEMBER}'`));
const leaderBodies = leaderReads.rows.map((r) => r.body);
check('leader sees shared but not private reflection',
  leaderBodies.includes('Shared thought') && !leaderBodies.includes('Private thought'),
  JSON.stringify(leaderBodies));

await expectRowCount('outsider sees no reflections', asOutsider, () =>
  db.query(`select id from public.reflections`), 0);

// Hiding a day after responses exist never touches the responses.
await expectOk('leader hides Monday after responses', asLeader, () =>
  db.query(`update public.schedule_days set published = false where id = '${mon.id}' returning id`));
await expectRowCount('shared reflection survives day hiding', asLeader, () =>
  db.query(`select id from public.reflections where user_id = '${MEMBER}' and visibility = 'shared'`), 1);
await expectRowCount('member Amen survives day hiding', asMember, () =>
  db.query(`select id from public.amen_responses where user_id = '${MEMBER}'`), 1);

// author edits
await expectOk('author edits own reflection body', asMember, () =>
  db.query(`update public.reflections set body = 'Edited thought' where body = 'Shared thought' returning id`));
const edited = await asMember(() =>
  db.query(`select created_at, updated_at from public.reflections where body = 'Edited thought'`));
check('edit stamps updated_at > created_at (edited signal)',
  new Date(edited.rows[0].updated_at) > new Date(edited.rows[0].created_at));
await expectOk('author edits highlighted verses', asMember, () =>
  db.query(`update public.reflections set highlighted_verses = '{1,2,3}' where body = 'Edited thought' returning id`));
await expectOk('author flips visibility shared → private → shared', asMember, () =>
  db.query(`update public.reflections set visibility = 'shared' where body = 'Edited thought' returning id`));
await expectDeny('author cannot edit passage snapshot (column grant)', asMember, () =>
  db.query(`update public.reflections set chapter = 99 where user_id = '${MEMBER}'`));
await expectDeny('author cannot reassign reflection to another group (column grant)', asMember, () =>
  db.query(`update public.reflections set group_id = '${groupB}' where user_id = '${MEMBER}'`));
await expectDeny('author cannot reassign author (column grant)', asMember, () =>
  db.query(`update public.reflections set user_id = '${LEADER}' where user_id = '${MEMBER}'`));
await expectZeroRows('leader cannot edit member reflection (0 rows via RLS)', asLeader, () =>
  db.query(`update public.reflections set body = 'hax' where user_id = '${MEMBER}' returning id`));

// ==============================================================================
section('S9 cross-group privacy with shared membership');
// ==============================================================================

// MEMBER joins B: MEMBER and LEADER_B now share group B, so LEADER_B can see
// MEMBER's profile — but must still see NONE of MEMBER's group-A reflections.
await expectOk('member joins group B too', asMember, () =>
  db.query(`select public.join_group_by_invite_code('${codeB}') as r`));
await expectRowCount('groupmate-of-B sees member profile now', asLeaderB, () =>
  db.query(`select id from public.profiles where id = '${MEMBER}'`), 1);
await expectRowCount('leader B sees no group-A reflections (even shared)', asLeaderB, () =>
  db.query(`select id from public.reflections where group_id = '${groupA}'`), 0);
await expectRowCount('leader B sees no group-A Amens', asLeaderB, () =>
  db.query(`select id from public.amen_responses where group_id = '${groupA}'`), 0);
await expectRowCount('leader B sees no group-A memberships', asLeaderB, () =>
  db.query(`select id from public.memberships where group_id = '${groupA}'`), 0);

// ==============================================================================
section('S10 invite code rotation + visibility');
// ==============================================================================

const rot = await expectOk('leader rotates invite code', asLeader, () =>
  db.query(`select public.rotate_invite_code('${groupA}') as r`));
const codeA2 = rot?.rows?.[0]?.r?.invite_code;
await expectDeny('member cannot rotate invite code', asMember, () =>
  db.query(`select public.rotate_invite_code('${groupA}')`));
await expectDeny('old code rejected after rotation', asJoiner, () =>
  db.query(`select public.join_group_by_invite_code('${codeA}')`));
await expectOk('joiner joins with new code', asJoiner, () =>
  db.query(`select public.join_group_by_invite_code('${codeA2}') as r`));
await expectRowCount('invite codes hidden from members', asMember, () =>
  db.query(`select code from public.invite_codes where group_id = '${groupA}'`), 0);
const leaderCodes = await asLeader(() =>
  db.query(`select code, status from public.invite_codes where group_id = '${groupA}' order by created_at`));
check('leader sees rotation audit trail (rotated + active)',
  leaderCodes.rows.length === 2 &&
  leaderCodes.rows.some((c) => c.status === 'rotated') &&
  leaderCodes.rows.some((c) => c.status === 'active'));

// ==============================================================================
section('S11 membership lifecycle (left / removed / leader rejoin)');
// ==============================================================================

// FIXTURE: no leave/remove UI exists yet, so flip status as owner.
await asOwner(() =>
  db.query(`update public.memberships set status = 'left' where group_id = '${groupA}' and user_id = '${JOINER}'`));
await expectRowCount('left member loses group read', asJoiner, () =>
  db.query(`select id from public.groups where id = '${groupA}'`), 0);
await expectRowCount('left member loses shared reflections', asJoiner, () =>
  db.query(`select id from public.reflections where group_id = '${groupA}'`), 0);
await expectRowCount('left member loses schedule read', asJoiner, () =>
  db.query(`select id from public.weekly_schedules where group_id = '${groupA}'`), 0);
await expectDeny('left member cannot Amen', asJoiner, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupA}', '${JOINER}', '${day[1].id}', '${iso(day[1].date)}')`));

await expectOk('left member rejoins via code (row reactivated)', asJoiner, () =>
  db.query(`select public.join_group_by_invite_code('${codeA2}') as r`));
const rejoined = await asJoiner(() =>
  db.query(`select role, status from public.memberships where group_id = '${groupA}' and user_id = '${JOINER}'`));
check('rejoin reactivates the same row as active member',
  rejoined.rows.length === 1 && rejoined.rows[0].status === 'active' && rejoined.rows[0].role === 'member');
const joinerRowCount = await asOwner(() =>
  db.query(`select count(*)::int as n from public.memberships where group_id = '${groupA}' and user_id = '${JOINER}'`));
check('rejoin does not duplicate the membership row', joinerRowCount.rows[0].n === 1);

// A leader who left rejoins as plain member (role does not carry over).
await asOwner(() =>
  db.query(`update public.memberships set status = 'left' where group_id = '${groupB}' and user_id = '${LEADER_B}'`));
await expectOk('former leader rejoins own group', asLeaderB, () =>
  db.query(`select public.join_group_by_invite_code('${codeB}') as r`));
const exLeader = await asLeaderB(() =>
  db.query(`select role from public.memberships where group_id = '${groupB}' and user_id = '${LEADER_B}'`));
check('former leader rejoins as member, not leader (documented edge)',
  exLeader.rows.length === 1 && exLeader.rows[0].role === 'member');
// FIXTURE: restore leadership so later sections have a group-B leader.
await asOwner(() =>
  db.query(`update public.memberships set role = 'leader' where group_id = '${groupB}' and user_id = '${LEADER_B}'`));

// removed members fail closed pending the removal product decision.
await asOwner(() =>
  db.query(`update public.memberships set status = 'removed' where group_id = '${groupA}' and user_id = '${JOINER}'`));
await expectDeny('removed member cannot rejoin (fails closed)', asJoiner, () =>
  db.query(`select public.join_group_by_invite_code('${codeA2}') as r`));
await asOwner(() =>
  db.query(`update public.memberships set status = 'active' where group_id = '${groupA}' and user_id = '${JOINER}'`));

// ==============================================================================
section('S12 notification preferences');
// ==============================================================================

// Mirrors saveNotificationPref in src/lib/db/notifications.ts: update mutable
// fields first (0 rows on first save), then insert, then update.
await expectRowCount('first-save update matches 0 rows', asMember, () =>
  db.query(`update public.notification_preferences set enabled = true, time_of_day = '07:40', timezone = 'Europe/Amsterdam', scope = 'all_groups' where user_id = '${MEMBER}' returning user_id`), 0);
await expectOk('first-save insert works', asMember, () =>
  db.query(`insert into public.notification_preferences (user_id, enabled, time_of_day, timezone, scope) values ('${MEMBER}', true, '07:40', 'Europe/Amsterdam', 'all_groups') returning user_id`));
await expectRowCount('later update works (regression: grants-safe update)', asMember, () =>
  db.query(`update public.notification_preferences set enabled = false, time_of_day = '08:15', timezone = 'Asia/Seoul', scope = 'all_groups' where user_id = '${MEMBER}' returning user_id`), 1);
const pref = await asMember(() =>
  db.query(`select enabled, time_of_day, timezone from public.notification_preferences where user_id = '${MEMBER}'`));
check('preference round-trips (enabled/time/timezone)',
  pref.rows[0].enabled === false && String(pref.rows[0].time_of_day).startsWith('08:15') && pref.rows[0].timezone === 'Asia/Seoul');

await expectDeny('cannot set someone else’s preference', asMember, () =>
  db.query(`insert into public.notification_preferences (user_id, time_of_day, timezone) values ('${LEADER}', '07:00', 'Asia/Seoul')`));
await expectDeny('cannot rewrite preference user_id (column grant)', asMember, () =>
  db.query(`update public.notification_preferences set user_id = '${LEADER}' where user_id = '${MEMBER}'`));
await expectRowCount('preferences invisible to others (even group leader)', asLeader, () =>
  db.query(`select user_id from public.notification_preferences`), 0);

// ==============================================================================
section('S13 archived groups');
// ==============================================================================

await expectOk('leader archives group B (leader edit, granted column)', asLeaderB, () =>
  db.query(`update public.groups set status = 'archived' where id = '${groupB}' returning id`));
await expectDeny('joining an archived group rejected', asOutsider, () =>
  db.query(`select public.join_group_by_invite_code('${codeB}') as r`));
const bDay = await asLeaderB(() =>
  db.query(`select d.id, d.date from public.schedule_days d join public.weekly_schedules w on w.id = d.schedule_id where w.group_id = '${groupB}' and d.weekday = 0`));
await expectDeny('archived group accepts no responses', asLeaderB, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupB}', '${LEADER_B}', '${bDay.rows[0].id}', '${iso(bDay.rows[0].date)}')`));
await expectRowCount('archived group still readable to members (soft archive)', asLeaderB, () =>
  db.query(`select id from public.groups where id = '${groupB}'`), 1);
await expectOk('leader unarchives group B', asLeaderB, () =>
  db.query(`update public.groups set status = 'active' where id = '${groupB}' returning id`));
await expectOk('responses accepted again after unarchive', asLeaderB, () =>
  db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupB}', '${LEADER_B}', '${bDay.rows[0].id}', '${iso(bDay.rows[0].date)}') returning id`));

// ==============================================================================
section('S14 final profile visibility matrix');
// ==============================================================================

await expectRowCount('outsider still sees only own profile', asOutsider, () =>
  db.query(`select id from public.profiles`), 1);
const memberSees = await asMember(() =>
  db.query(`select display_name from public.profiles order by display_name`));
const names = memberSees.rows.map((r) => r.display_name);
check('member sees exactly their groupmates (A + B), never outsiders',
  names.includes('Isaac') && names.includes('Minho') && names.includes('Jun') &&
  names.includes('Hana Kim') && !names.includes('Out'),
  names.join(', '));

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
