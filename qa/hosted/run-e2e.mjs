// Hosted two-account end-to-end QA against the real Supabase project.
//
// Usage:
//   node qa/hosted/run-e2e.mjs --leader <email> --member <email>
//
// Prereq: both accounts have cached sessions (request-otp.mjs / verify-otp.mjs).
//
// What it does: creates ONE fresh QA group as the leader, walks the entire
// product flow with both accounts (join, publish, visibility, Amen,
// reflections, prefs, rotation), probing RLS denials along the way, then
// archives the QA group so it never shows up in the app's My Groups.
// Uses the anon key + real user sessions only. Never deletes anything.
import {
  anonClient,
  check,
  clientFor,
  expectErr,
  expectOk,
  expectRows,
  isoDate,
  mondayOfToday,
  section,
  summary,
} from './lib.mjs';

const args = process.argv.slice(2);
function argOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const leaderEmail = argOf('--leader');
const memberEmail = argOf('--member');
if (!leaderEmail || !memberEmail || leaderEmail === memberEmail) {
  console.error('Usage: node qa/hosted/run-e2e.mjs --leader <email> --member <email> (two different accounts)');
  process.exit(2);
}

const { client: L, userId: LEADER } = await clientFor(leaderEmail);
const { client: M, userId: MEMBER } = await clientFor(memberEmail);
console.log(`leader=${LEADER}\nmember=${MEMBER}`);

const WEEK = mondayOfToday();
const RUN = `QA ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

// ---------------------------------------------------------------------------
section('anon posture (no session)');
// ---------------------------------------------------------------------------
const A = anonClient();
expectErr('anon cannot read profiles', await A.from('profiles').select('id').limit(1));
expectErr('anon cannot read groups', await A.from('groups').select('id').limit(1));
expectErr('anon cannot read reflections', await A.from('reflections').select('id').limit(1));
expectErr('anon cannot call join RPC', await A.rpc('join_group_by_invite_code', { p_code: 'IRON-0000' }));

// ---------------------------------------------------------------------------
section('profiles');
// ---------------------------------------------------------------------------
async function ensureProfile(client, uid, name) {
  const { data, error } = await client.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) return { error };
  if (data) return { data };
  return client.from('profiles').insert({ id: uid, display_name: name }).select('*').single();
}
expectOk('leader has/creates profile', await ensureProfile(L, LEADER, 'QA Leader'));
expectOk('member has/creates profile', await ensureProfile(M, MEMBER, 'QA Member'));
expectErr('member cannot create profile for leader id',
  await M.from('profiles').insert({ id: LEADER, display_name: 'forged' }).select('id'));

// ---------------------------------------------------------------------------
section('group creation (leader)');
// ---------------------------------------------------------------------------
const created = expectOk(`create QA group "${RUN}"`,
  await L.rpc('create_group_with_leader', { p_name: RUN, p_week_start: WEEK }));
const GROUP = created?.group_id;
const CODE = created?.invite_code;
if (!GROUP || !CODE) {
  console.error('Cannot continue without a QA group.');
  summary();
}
console.log(`     group=${GROUP} code=${CODE}`);

expectErr('leader cannot insert groups directly',
  await L.from('groups').insert({ name: 'direct', created_by: LEADER }).select('id'));

const draft = expectRows('leader sees 1 draft schedule',
  await L.from('weekly_schedules').select('*').eq('group_id', GROUP), 1);
const SCHED = draft?.[0]?.id;
check('new week is a draft', draft?.[0]?.status === 'draft');
const leaderDays = expectRows('leader sees 7 day rows',
  await L.from('schedule_days').select('*').eq('schedule_id', SCHED).order('weekday'), 7);
const day = Object.fromEntries((leaderDays ?? []).map((d) => [d.weekday, d]));
check('Mon–Fri enabled, weekend rest',
  (leaderDays ?? []).filter((d) => d.enabled).length === 5 && !day[5]?.enabled && !day[6]?.enabled);

// ---------------------------------------------------------------------------
section('pre-join member visibility');
// ---------------------------------------------------------------------------
expectRows('member cannot see the group before joining',
  await M.from('groups').select('id').eq('id', GROUP), 0);
expectRows('member cannot see the schedule before joining',
  await M.from('weekly_schedules').select('id').eq('group_id', GROUP), 0);
expectErr('garbage invite code rejected',
  await M.rpc('join_group_by_invite_code', { p_code: 'IRON-0000' }));

// ---------------------------------------------------------------------------
section('member joins (draft week still hidden)');
// ---------------------------------------------------------------------------
const joined = expectOk('member joins by invite code',
  await M.rpc('join_group_by_invite_code', { p_code: ` ${CODE.toLowerCase()} ` }));
check('join returns the group id', joined?.group_id === GROUP);
expectOk('joining twice is idempotent',
  await M.rpc('join_group_by_invite_code', { p_code: CODE }));
expectRows('member now sees the group',
  await M.from('groups').select('id').eq('id', GROUP), 1);
expectRows('member sees leader profile (shared group)',
  await M.from('profiles').select('id').eq('id', LEADER), 1);
expectRows('draft week still invisible to member',
  await M.from('weekly_schedules').select('id').eq('group_id', GROUP), 0);
expectRows('member cannot read invite codes',
  await M.from('invite_codes').select('code').eq('group_id', GROUP), 0);
expectErr('member cannot insert memberships directly',
  await M.from('memberships').insert({ group_id: GROUP, user_id: MEMBER, role: 'leader' }).select('id'));

// ---------------------------------------------------------------------------
section('publish gate + schedule mutations');
// ---------------------------------------------------------------------------
expectErr('publish blocked without prayer point',
  await L.rpc('publish_weekly_schedule', { p_schedule_id: SCHED }));
expectRows('leader sets prayer point',
  await L.from('weekly_schedules').update({ prayer_point: 'Lord, keep this group honest.' }).eq('id', SCHED).select('id'), 1);
expectErr('leader cannot flip status directly (column grant)',
  await L.from('weekly_schedules').update({ status: 'published' }).eq('id', SCHED).select('id'));
expectRows('member cannot edit the schedule (0 rows)',
  await M.from('weekly_schedules').update({ prayer_point: 'hax' }).eq('id', SCHED).select('id'), 0);
expectErr('member cannot publish', await M.rpc('publish_weekly_schedule', { p_schedule_id: SCHED }));
expectErr('member cannot start a week', await M.rpc('start_week', { p_group_id: GROUP, p_week_start: WEEK }));
expectErr('member cannot rotate the invite code', await M.rpc('rotate_invite_code', { p_group_id: GROUP }));
expectErr('duplicate start_week rejected', await L.rpc('start_week', { p_group_id: GROUP, p_week_start: WEEK }));

expectOk('leader publishes via RPC', await L.rpc('publish_weekly_schedule', { p_schedule_id: SCHED }));
const pub1 = expectRows('published week readable to member now',
  await M.from('weekly_schedules').select('status, published_at').eq('group_id', GROUP), 1);
check('status is published', pub1?.[0]?.status === 'published');
expectOk('re-publish is idempotent', await L.rpc('publish_weekly_schedule', { p_schedule_id: SCHED }));
const pub2 = await L.from('weekly_schedules').select('published_at').eq('id', SCHED).single();
check('published_at never overwritten', pub2.data?.published_at === pub1?.[0]?.published_at);

expectRows('member sees 5 enabled+published days',
  await M.from('schedule_days').select('weekday').eq('schedule_id', SCHED), 5);
expectRows('leader hides Tuesday',
  await L.from('schedule_days').update({ published: false }).eq('id', day[1].id).select('id'), 1);
expectRows('member sees 4 days after hide',
  await M.from('schedule_days').select('weekday').eq('schedule_id', SCHED), 4);
expectRows('member cannot toggle a day (0 rows)',
  await M.from('schedule_days').update({ enabled: false }).eq('id', day[1].id).select('id'), 0);
expectErr('leader cannot rewrite a day date (column grant)',
  await L.from('schedule_days').update({ date: WEEK }).eq('id', day[1].id).select('id'));

// ---------------------------------------------------------------------------
section('Amen');
// ---------------------------------------------------------------------------
const mon = day[0];
const tue = day[1]; // hidden above
const sat = day[5]; // rest day
expectOk('member Amens Monday',
  await M.from('amen_responses').insert({ group_id: GROUP, user_id: MEMBER, schedule_day_id: mon.id, date: mon.date }));
const dup = await M.from('amen_responses').insert({ group_id: GROUP, user_id: MEMBER, schedule_day_id: mon.id, date: mon.date });
check('double Amen hits unique constraint (23505, app treats as success)',
  dup.error?.code === '23505', dup.error?.code ?? 'no error');
expectErr('Amen on hidden day blocked for member',
  await M.from('amen_responses').insert({ group_id: GROUP, user_id: MEMBER, schedule_day_id: tue.id, date: tue.date }));
expectOk('leader Amens own hidden day',
  await L.from('amen_responses').insert({ group_id: GROUP, user_id: LEADER, schedule_day_id: tue.id, date: tue.date }));
expectErr('Amen on rest day blocked even for leader',
  await L.from('amen_responses').insert({ group_id: GROUP, user_id: LEADER, schedule_day_id: sat.id, date: sat.date }));
expectErr('Amen as someone else blocked',
  await M.from('amen_responses').insert({ group_id: GROUP, user_id: LEADER, schedule_day_id: mon.id, date: mon.date }));
expectRows('both responses visible to groupmates',
  await M.from('amen_responses').select('id').eq('group_id', GROUP), 2);

// ---------------------------------------------------------------------------
section('reflections');
// ---------------------------------------------------------------------------
const snap = { group_id: GROUP, user_id: MEMBER, schedule_day_id: mon.id, date: mon.date, book: mon.book, chapter: mon.chapter };
expectOk('member posts shared reflection',
  await M.from('reflections').insert({ ...snap, body: 'QA shared reflection', visibility: 'shared' }));
expectOk('member posts private reflection',
  await M.from('reflections').insert({ ...snap, body: 'QA private reflection', visibility: 'private' }));
expectErr('wrong passage snapshot rejected',
  await M.from('reflections').insert({ ...snap, book: 'Genesis', chapter: 1, body: 'forged snapshot', visibility: 'shared' }));
expectErr('reflection as someone else rejected',
  await M.from('reflections').insert({ ...snap, user_id: LEADER, body: 'forged author', visibility: 'shared' }));

const leaderView = expectRows('leader sees exactly 1 member reflection (the shared one)',
  await L.from('reflections').select('body, visibility').eq('group_id', GROUP).eq('user_id', MEMBER), 1);
check('...and it is the shared one', leaderView?.[0]?.visibility === 'shared');
expectRows('member sees both own reflections',
  await M.from('reflections').select('id').eq('group_id', GROUP).eq('user_id', MEMBER), 2);

expectRows('author edits own reflection',
  await M.from('reflections').update({ body: 'QA shared reflection (edited)' }).eq('group_id', GROUP).eq('visibility', 'shared').eq('user_id', MEMBER).select('id'), 1);
expectErr('author cannot edit passage snapshot (column grant)',
  await M.from('reflections').update({ chapter: 99 }).eq('group_id', GROUP).eq('user_id', MEMBER).select('id'));
expectRows('leader cannot edit member reflection (0 rows)',
  await L.from('reflections').update({ body: 'hax' }).eq('group_id', GROUP).eq('user_id', MEMBER).select('id'), 0);

// day hidden after the fact: reflection survives
expectRows('leader hides Monday after responses',
  await L.from('schedule_days').update({ published: false }).eq('id', mon.id).select('id'), 1);
expectRows('shared reflection survives day hiding',
  await L.from('reflections').select('id').eq('group_id', GROUP).eq('user_id', MEMBER), 1);

// ---------------------------------------------------------------------------
section('notification preferences (regression: grants-safe save)');
// ---------------------------------------------------------------------------
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const mutable = { enabled: true, time_of_day: '08:15', timezone: tz, scope: 'all_groups' };
const upd = await M.from('notification_preferences').update(mutable).eq('user_id', MEMBER).select('user_id');
expectOk('update own pref (may be 0 rows on first run)', upd);
if ((upd.data?.length ?? 0) === 0) {
  expectOk('first-save insert works',
    await M.from('notification_preferences').insert({ user_id: MEMBER, ...mutable }));
}
expectRows('subsequent update works',
  await M.from('notification_preferences').update({ ...mutable, time_of_day: '07:40' }).eq('user_id', MEMBER).select('user_id'), 1);
expectErr('cannot insert pref for someone else',
  await M.from('notification_preferences').insert({ user_id: LEADER, ...mutable }));
expectRows('member pref invisible to leader',
  await L.from('notification_preferences').select('user_id').eq('user_id', MEMBER), 0);

// ---------------------------------------------------------------------------
section('invite code rotation');
// ---------------------------------------------------------------------------
const rotated = expectOk('leader rotates the invite code',
  await L.rpc('rotate_invite_code', { p_group_id: GROUP }));
expectErr('old code dead after rotation',
  await M.rpc('join_group_by_invite_code', { p_code: CODE }));
expectOk('new code still joins (idempotent for existing member)',
  await M.rpc('join_group_by_invite_code', { p_code: rotated.invite_code }));

// ---------------------------------------------------------------------------
section('archive QA group (cleanup: keeps My Groups tidy)');
// ---------------------------------------------------------------------------
expectRows('member cannot archive the group (0 rows)',
  await M.from('groups').update({ status: 'archived' }).eq('id', GROUP).select('id'), 0);
expectRows('leader archives the QA group',
  await L.from('groups').update({ status: 'archived' }).eq('id', GROUP).select('id'), 1);
expectErr('archived group takes no more responses',
  await L.from('amen_responses').insert({ group_id: GROUP, user_id: LEADER, schedule_day_id: day[2].id, date: day[2].date }));
expectErr('archived group cannot be joined',
  await M.rpc('join_group_by_invite_code', { p_code: rotated.invite_code }));
expectRows('archived group still readable (soft archive)',
  await M.from('groups').select('id').eq('id', GROUP), 1);

summary();
