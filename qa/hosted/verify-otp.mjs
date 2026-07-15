// Step 2 of the OTP sign-in flow: verify the code and cache the session.
// Usage: node qa/hosted/verify-otp.mjs <email> <6-digit code>
import { anonClient, saveSession } from './lib.mjs';

const [email, token] = process.argv.slice(2);
if (!email || !token) {
  console.error('Usage: node qa/hosted/verify-otp.mjs <email> <6-digit code>');
  process.exit(2);
}

const client = anonClient();
const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
if (error || !data.session) {
  console.error(`OTP verification failed: ${error?.message ?? 'no session returned'}`);
  process.exit(1);
}
saveSession(email, data.session);
console.log(`Session cached for ${email} (user ${data.session.user.id}).`);
