/**
 * Encode EAD password for use as EAD_PASSWORD_ENC in .env (base64).
 * Run: node scripts/ead-encode-password.mjs "your password"
 * Then in .env set: EAD_PASSWORD_ENC=<output>
 */

const password = process.argv[2] || process.env.EAD_PASSWORD;
if (!password) {
  console.error('Usage: node scripts/ead-encode-password.mjs "your-password"');
  console.error('   or: EAD_PASSWORD=your-pass node scripts/ead-encode-password.mjs');
  process.exit(1);
}
console.log(Buffer.from(password, 'utf8').toString('base64'));
