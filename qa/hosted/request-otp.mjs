// Step 1 of the OTP sign-in flow for hosted QA accounts.
// Usage: node qa/hosted/request-otp.mjs <email>
import { anonClient } from './lib.mjs';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node qa/hosted/request-otp.mjs <email>');
  process.exit(2);
}

const client = anonClient();
const { error } = await client.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: true },
});
if (error) {
  console.error(`OTP request failed: ${error.message}`);
  process.exit(1);
}
console.log(`OTP email sent to ${email}. Verify with:`);
console.log(`  node qa/hosted/verify-otp.mjs ${email} <6-digit code>`);
