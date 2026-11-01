// Our emails come from us (2026-11-02): through Resend with the brand's sender, recorded in Mailbox › Sent
// (lib/mail/send.ts). Supabase may make a link (auth.admin.generateLink sends nothing) but must not send: these calls
// make Supabase email someone from its own default sender, with no row and no delivery status. docs/emails.md.
//   node rig/check-own-mail.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const SENDS = [
  [/\binviteUserByEmail\s*\(/, "inviteUserByEmail — Supabase sends the invite"],
  [/\bresetPasswordForEmail\s*\(/, "resetPasswordForEmail — Supabase sends the reset"],
  [/\bupdateUser\s*\(\s*\{[^}]*\bemail\s*[:,}]/, "updateUser({ email }) — Supabase sends the email-change confirmations"],
  [/\.auth\.signUp\s*\(/, "auth.signUp — Supabase sends the confirmation"],
  [/\bsignInWithOtp\s*\(/, "signInWithOtp — Supabase sends the magic link"],
  [/\.auth\.resend\s*\(/, "auth.resend — Supabase sends again"],
  [/\breauthenticate\s*\(/, "reauthenticate — Supabase sends a code"],
];
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== "node_modules" && n !== ".next") walk(p); } else if (/\.(tsx?|jsx?|mjs)$/.test(n)) files.push(p); } };
for (const d of ["app", "lib", "components", "digital-wall/lib", "agent/lib"]) { try { walk(d); } catch { /* a tree that is not there */ } }
let bad = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return; // a comment naming the call
    for (const [re, why] of SENDS) if (re.test(line)) { bad += 1; console.log(`FAIL  ${f}:${i + 1}  ${why}; make the link with auth.admin.generateLink and send it with lib/mail/send.ts`); }
  });
}
console.log(bad ? `\n${bad} FAILED · ${files.length} files read` : `ALL PASSED · ${files.length} files read`);
process.exit(bad ? 1 : 0);
