// Validate Iron's Supabase migrations against PGlite (real Postgres in WASM)
// — no Docker required. Shims the Supabase-provided surface (auth schema,
// auth.uid(), roles), runs 001 → 002 → 003, then a behavioral RLS smoke test
// (53 assertions covering the contract's security rules).
//
// Run from the repo root:
//   npm install --no-save @electric-sql/pglite
//   node supabase/validate-local.mjs
//
// This complements — not replaces — `npx supabase db reset` on a machine
// with Docker, which validates against the real Supabase stack.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const iso = (d) => d instanceof Date ? d.toISOString().slice(0, 10) : d;
const db = new PGlite();

async function run(label, sql) {
  try {
    await db.exec(sql);
    console.log(`OK   ${label}`);
  } catch (e) {
    console.log(`FAIL ${label}: ${e.message}`);
    throw e;
  }
}

// --- Supabase environment shim -------------------------------------------
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

// --- Behavioral smoke tests ------------------------------------------------
const LEADER = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';
const OUTSIDER = '33333333-3333-3333-3333-333333333333';

await db.exec(`insert into auth.users (id) values ('${LEADER}'),('${MEMBER}'),('${OUTSIDER}')`);

let passed = 0, failed = 0;
async function as(uid, fn, label, expectFail = false) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    const r = await fn();
    await db.exec('reset role;');
    if (expectFail) { console.log(`FAIL ${label} (expected denial, succeeded)`); failed++; }
    else { console.log(`pass ${label}`); passed++; }
    return r;
  } catch (e) {
    await db.exec('reset role;');
    if (expectFail) { console.log(`pass ${label} (denied: ${e.message.slice(0, 80)})`); passed++; }
    else { console.log(`FAIL ${label}: ${e.message}`); failed++; }
    return null;
  }
}

// profiles
await as(LEADER, () => db.query(`insert into public.profiles (id, display_name) values ('${LEADER}', 'Isaac') returning id`), 'leader creates own profile');
await as(MEMBER, () => db.query(`insert into public.profiles (id, display_name) values ('${MEMBER}', 'Hana') returning id`), 'member creates own profile');
await as(OUTSIDER, () => db.query(`insert into public.profiles (id, display_name) values ('${OUTSIDER}', 'Out') returning id`), 'outsider creates own profile');
await as(MEMBER, async () => {
  const r = await db.query(`insert into public.profiles (id, display_name) values ('${OUTSIDER}', 'X') returning id`);
  if (r.rows.length) throw new Error('should not insert someone else');
}, 'member cannot create profile for someone else', true);

// create group RPC (week_start must be a Monday — 2026-07-06 is a Monday)
const g = await as(LEADER, () => db.query(`select public.create_group_with_leader('Honest People', '2026-07-06'::date) as r`), 'create_group_with_leader');
const groupId = g?.rows?.[0]?.r?.group_id;
const inviteCode = g?.rows?.[0]?.r?.invite_code;
console.log(`     group=${groupId} code=${inviteCode}`);

// bad monday rejected
await as(LEADER, () => db.query(`select public.start_week('${groupId}', '2026-07-07'::date)`), 'start_week rejects non-Monday', true);

// join by code
await as(MEMBER, () => db.query(`select public.join_group_by_invite_code('${inviteCode}') as r`), 'member joins by code');
await as(MEMBER, () => db.query(`select public.join_group_by_invite_code('${inviteCode}') as r`), 'joining twice is idempotent');
await as(OUTSIDER, () => db.query(`select public.join_group_by_invite_code('IRON-0000') as r`), 'bad code rejected', true);

// direct membership insert must be blocked
await as(OUTSIDER, async () => {
  await db.query(`insert into public.memberships (group_id, user_id, role) values ('${groupId}', '${OUTSIDER}', 'leader')`);
}, 'outsider cannot insert membership directly', true);

// draft week invisible to member
const draftAsMember = await as(MEMBER, () => db.query(`select count(*)::int as n from public.weekly_schedules where group_id = '${groupId}'`), 'member queries schedules');
if (draftAsMember && draftAsMember.rows[0].n === 0) { console.log('pass draft week invisible to member'); passed++; }
else { console.log(`FAIL draft week visible to member (n=${draftAsMember?.rows?.[0]?.n})`); failed++; }

// leader sees draft + 7 days
const draftAsLeader = await as(LEADER, () => db.query(`select w.id, w.status from public.weekly_schedules w where w.group_id = '${groupId}'`), 'leader sees draft week');
const scheduleId = draftAsLeader?.rows?.[0]?.id;
const days = await as(LEADER, () => db.query(`select id, weekday, date, book, chapter, enabled, published from public.schedule_days where schedule_id = '${scheduleId}' order by weekday`), 'leader reads 7 day rows');
if (days && days.rows.length === 7 && days.rows.filter(d => d.enabled).length === 5) { console.log('pass 7 rows, Mon–Fri enabled'); passed++; }
else { console.log(`FAIL day rows wrong: ${days?.rows?.length}`); failed++; }

// publish gate: no prayer point yet
await as(LEADER, () => db.query(`select public.publish_weekly_schedule('${scheduleId}')`), 'publish blocked without prayer point', true);

// leader edits prayer point (direct update, column-granted)
await as(LEADER, () => db.query(`update public.weekly_schedules set prayer_point = 'Lord, keep us centered.' where id = '${scheduleId}' returning id`), 'leader sets prayer point');
// member cannot edit
await as(MEMBER, async () => {
  const r = await db.query(`update public.weekly_schedules set prayer_point = 'hax' where id = '${scheduleId}' returning id`);
  if (r.rows.length) throw new Error('member updated schedule');
}, 'member cannot edit schedule (0 rows via RLS)');
// leader cannot flip status directly (column grant excludes it)
await as(LEADER, () => db.query(`update public.weekly_schedules set status = 'published' where id = '${scheduleId}'`), 'leader cannot flip status directly', true);

// publish via RPC
await as(LEADER, () => db.query(`select public.publish_weekly_schedule('${scheduleId}')`), 'publish via RPC');

// member now sees week and enabled+published days only
const memberDays = await as(MEMBER, () => db.query(`select weekday from public.schedule_days where schedule_id = '${scheduleId}' order by weekday`), 'member reads visible days');
if (memberDays && memberDays.rows.length === 5) { console.log('pass member sees 5 enabled days (weekend rest hidden)'); passed++; }
else { console.log(`FAIL member sees ${memberDays?.rows?.length} days`); failed++; }

// leader hides Wednesday (weekday 2)
const wedId = days.rows.find(d => d.weekday === 2).id;
const wed = days.rows.find(d => d.weekday === 2);
await as(LEADER, () => db.query(`update public.schedule_days set published = false where id = '${wedId}' returning id`), 'leader hides Wednesday');
const memberDays2 = await as(MEMBER, () => db.query(`select weekday from public.schedule_days where schedule_id = '${scheduleId}'`), 'member re-reads days');
if (memberDays2 && memberDays2.rows.length === 4) { console.log('pass hidden day invisible to member'); passed++; }
else { console.log(`FAIL member sees ${memberDays2?.rows?.length} days after hide`); failed++; }

// member cannot change weekday/date (column grant)
await as(MEMBER, async () => {
  const r = await db.query(`update public.schedule_days set enabled = false where id = '${wedId}' returning id`);
  if (r.rows.length) throw new Error('member toggled day');
}, 'member cannot toggle day (0 rows via RLS)');

// Amen on a visible day (Monday, weekday 0)
const mon = days.rows.find(d => d.weekday === 0);
await as(MEMBER, () => db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupId}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}') returning id`), 'member Amens Monday');
await as(MEMBER, () => db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupId}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}')`), 'double Amen blocked', true);
// Amen on hidden Wednesday blocked for member
await as(MEMBER, () => db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupId}', '${MEMBER}', '${wedId}', '${iso(wed.date)}')`), 'Amen on hidden day blocked', true);
// but leader can respond to their hidden day
await as(LEADER, () => db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupId}', '${LEADER}', '${wedId}', '${iso(wed.date)}') returning id`), 'leader Amens own hidden day');
// Amen as someone else blocked
await as(MEMBER, () => db.query(`insert into public.amen_responses (group_id, user_id, schedule_day_id, date) values ('${groupId}', '${LEADER}', '${mon.id}', '${iso(mon.date)}')`), 'Amen as someone else blocked', true);

// reflections: shared + private, snapshot must match
await as(MEMBER, () => db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, body, visibility) values ('${groupId}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}', '${mon.book}', ${mon.chapter}, 'Shared thought', 'shared') returning id`), 'member posts shared reflection');
await as(MEMBER, () => db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, body, visibility) values ('${groupId}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}', '${mon.book}', ${mon.chapter}, 'Private thought', 'private') returning id`), 'member posts private reflection');
await as(MEMBER, () => db.query(`insert into public.reflections (group_id, user_id, schedule_day_id, date, book, chapter, body, visibility) values ('${groupId}', '${MEMBER}', '${mon.id}', '${iso(mon.date)}', 'Genesis', 1, 'Wrong snapshot', 'shared')`), 'wrong passage snapshot rejected', true);

// leader sees shared but NOT member's private
const leaderReads = await as(LEADER, () => db.query(`select body from public.reflections where group_id = '${groupId}' and user_id = '${MEMBER}'`), 'leader reads member reflections');
const bodies = (leaderReads?.rows ?? []).map(r => r.body);
if (bodies.includes('Shared thought') && !bodies.includes('Private thought')) { console.log('pass private reflection hidden from leader'); passed++; }
else { console.log(`FAIL leader sees: ${JSON.stringify(bodies)}`); failed++; }

// outsider sees nothing
const outsiderReads = await as(OUTSIDER, () => db.query(`select count(*)::int as n from public.reflections`), 'outsider queries reflections');
if (outsiderReads && outsiderReads.rows[0].n === 0) { console.log('pass outsider sees no reflections'); passed++; }
else { console.log(`FAIL outsider sees ${outsiderReads?.rows?.[0]?.n}`); failed++; }

// hide Monday AFTER responses exist → reflection stays readable
await as(LEADER, () => db.query(`update public.schedule_days set published = false where id = '${mon.id}' returning id`), 'leader hides Monday after responses');
const stillVisible = await as(LEADER, () => db.query(`select count(*)::int as n from public.reflections where user_id = '${MEMBER}' and visibility = 'shared'`), 'shared reflection after day hidden');
if (stillVisible && stillVisible.rows[0].n === 1) { console.log('pass reflections survive day hiding'); passed++; }
else { console.log(`FAIL reflection gone after hide`); failed++; }

// author edits body; cannot edit snapshot
await as(MEMBER, () => db.query(`update public.reflections set body = 'Edited thought' where body = 'Shared thought' returning id`), 'author edits own reflection');
await as(MEMBER, () => db.query(`update public.reflections set chapter = 99 where user_id = '${MEMBER}'`), 'author cannot edit snapshot', true);
await as(LEADER, async () => {
  const r = await db.query(`update public.reflections set body = 'hax' where user_id = '${MEMBER}' returning id`);
  if (r.rows.length) throw new Error('leader edited member reflection');
}, 'leader cannot edit member reflection (0 rows via RLS)');

// rotate invite code; old code stops working
const rot = await as(LEADER, () => db.query(`select public.rotate_invite_code('${groupId}') as r`), 'rotate invite code');
await as(OUTSIDER, () => db.query(`select public.join_group_by_invite_code('${inviteCode}')`), 'old code rejected after rotation', true);
await as(OUTSIDER, () => db.query(`select public.join_group_by_invite_code('${rot.rows[0].r.invite_code}')`), 'new code works');
await as(MEMBER, () => db.query(`select code from public.invite_codes where group_id = '${groupId}'`), 'member queries invite codes').then(r => {
  if (r && r.rows.length === 0) { console.log('pass invite codes hidden from members'); passed++; }
  else { console.log(`FAIL member sees ${r?.rows?.length} codes`); failed++; }
});

// notification prefs owner-only
await as(MEMBER, () => db.query(`insert into public.notification_preferences (user_id, time_of_day, timezone) values ('${MEMBER}', '07:40', 'Europe/Amsterdam') returning user_id`), 'member sets own notification pref');
await as(LEADER, () => db.query(`select count(*)::int as n from public.notification_preferences`), 'leader queries prefs').then(r => {
  if (r && r.rows[0].n === 0) { console.log('pass prefs invisible to others'); passed++; }
  else { console.log(`FAIL leader sees ${r?.rows?.[0]?.n} prefs`); failed++; }
});

// profiles visibility: groupmates yes, strangers limited
const names = await as(OUTSIDER, () => db.query(`select display_name from public.profiles order by display_name`), 'outsider (now member) reads profiles');
console.log(`     outsider sees profiles: ${(names?.rows ?? []).map(r => r.display_name).join(', ')}`);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
