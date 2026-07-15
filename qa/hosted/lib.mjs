// Shared plumbing for the hosted two-account E2E QA harness.
//
// Safety rules (see qa/hosted/README.md):
//   * anon key + real user sessions ONLY — never the service-role key.
//   * No destructive SQL, no resets. The harness only does what the app can.
//   * Session tokens are cached in qa/.sessions/ (gitignored) so a full run
//     needs OTP entry once per account, not once per run.
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SESSIONS_DIR = join(ROOT, 'qa', '.sessions');

/** Parse .env ourselves (no dotenv dep); values are never logged. */
export function loadEnv() {
  const env = {};
  const raw = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
    process.exit(2);
  }
  return { url, anonKey };
}

export function anonClient() {
  const { url, anonKey } = loadEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sessionPath(email) {
  return join(SESSIONS_DIR, `${email.replace(/[^a-z0-9.@+_-]/gi, '_')}.json`);
}

export function saveSession(email, session) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  writeFileSync(
    sessionPath(email),
    JSON.stringify(
      { access_token: session.access_token, refresh_token: session.refresh_token },
      null,
      2,
    ),
  );
}

/**
 * Authenticated client from a cached session (refreshing if needed).
 * Exits with instructions when the account has no valid cached session.
 */
export async function clientFor(email) {
  const client = anonClient();
  let stored;
  try {
    stored = JSON.parse(readFileSync(sessionPath(email), 'utf8'));
  } catch {
    console.error(
      `No cached session for ${email}.\n` +
        `Run: node qa/hosted/request-otp.mjs ${email}\n` +
        `then: node qa/hosted/verify-otp.mjs ${email} <6-digit code>`,
    );
    process.exit(3);
  }
  const { data, error } = await client.auth.setSession(stored);
  if (error || !data.session) {
    console.error(`Cached session for ${email} is no longer valid (${error?.message}). Re-run the OTP flow.`);
    process.exit(3);
  }
  saveSession(email, data.session); // tokens rotate on refresh
  return { client, userId: data.session.user.id };
}

// --- assertion helpers (mirrors supabase/validate-local.mjs output style) ---

let passed = 0;
let failed = 0;

export function section(title) {
  console.log(`\n--- ${title} ---`);
}

export function check(label, cond, detail = '') {
  if (cond) {
    console.log(`pass ${label}`);
    passed++;
  } else {
    console.log(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
    failed++;
  }
}

/** Supabase call that must succeed (error === null). */
export function expectOk(label, { data, error }) {
  check(label, !error, error?.message);
  return data;
}

/** Supabase call that must be refused (error !== null). */
export function expectErr(label, { error }) {
  if (error) {
    console.log(`pass ${label} (denied: ${String(error.message).slice(0, 80)})`);
    passed++;
  } else {
    console.log(`FAIL ${label} (expected denial, succeeded)`);
    failed++;
  }
}

/** RLS-filtered read/update that must silently return exactly n rows. */
export function expectRows(label, { data, error }, n) {
  const got = error ? `error: ${error.message}` : (data?.length ?? 0);
  check(label, !error && (data?.length ?? 0) === n, `got ${got}, wanted ${n}`);
  return data;
}

export function summary() {
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed ? 1 : 0);
}

// --- date helpers (mirror src/lib/dates.ts semantics, device-local) ---------

export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function mondayOfToday() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}
