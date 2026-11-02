// Who our emails come from (2026-11-02). Account mail: Clearway <no-reply@clearway.verxyl.com>; wall alerts:
// alerts@clearway.verxyl.com; intake keeps agent@verxyl.com. Until clearway.verxyl.com is verified in Resend, a send it
// refuses for that reason goes again from the address that works today — nothing is blocked while DNS is added.
// Against the rig's mock Resend (:3996), which can refuse a sender domain as Resend does (POST /_rig/unverified).
//   node --env-file=.env.rig rig/sender-check.mjs
const MOCK = "http://127.0.0.1:3996", PORTAL = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
process.env.RESEND_BASE_URL = MOCK; process.env.RESEND_API_KEY ||= "rig-mock-resend-key";
const { sendEmail } = await import("../digital-wall/lib/mailer.mjs");
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const unverified = (domains) => fetch(`${MOCK}/_rig/unverified`, { method: "POST", body: JSON.stringify({ domains }) });
const lastSent = async (subjectRe) => { for (let i = 0; i < 20; i++) { const s = (await (await fetch(`${MOCK}/_rig/sent`)).json()).filter((e) => subjectRe.test(e.subject)).pop(); if (s) return s; await new Promise((r) => setTimeout(r, 250)); } return null; };
const addr = (from) => String(from ?? "").match(/<([^>]+)>/)?.[1] ?? String(from ?? "");
const forgot = (email) => fetch(`${PORTAL}/api/auth/password/forgot`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).then((r) => r.json().catch(() => ({})));
const run = Date.now().toString(36);
try {
  // 1. the subdomain not verified yet
  await unverified(["clearway.verxyl.com"]);
  let r = await sendEmail({ to: "rig-sender@rig.invalid", subject: `rig wall alert ${run} a`, html: "<p>rig</p>" });
  let s = await lastSent(new RegExp(`rig wall alert ${run} a`));
  ok(r.ok && s && addr(s.from).endsWith("@verxyl.com") && !addr(s.from).includes("clearway.verxyl.com"), "not verified yet: the wall's alert went out from the fallback, not blocked", addr(s?.from));
  let j = await forgot("rig-access-dev@rig.invalid");
  s = await lastSent(/Reset your/);
  ok(j.sent === true && s && addr(s.from) === "no-reply@verxyl.com" && /^Clearway </.test(String(s.from)), "not verified yet: account mail (a password reset) went out from Clearway <no-reply@verxyl.com>", s?.from);
  // 2. verified
  await unverified([]);
  r = await sendEmail({ to: "rig-sender@rig.invalid", subject: `rig wall alert ${run} b`, html: "<p>rig</p>" });
  s = await lastSent(new RegExp(`rig wall alert ${run} b`));
  ok(r.ok && addr(s?.from) === "alerts@clearway.verxyl.com", "verified: the wall's alert comes from alerts@clearway.verxyl.com", addr(s?.from));
  j = await forgot("rig-access-admin@rig.invalid");
  s = await lastSent(/Reset your/);
  ok(j.sent === true && addr(s?.from) === "no-reply@clearway.verxyl.com" && /^Clearway </.test(String(s?.from)), "verified: account mail comes from Clearway <no-reply@clearway.verxyl.com>", s?.from);
  // 3. a refusal for any other reason is not retried from the fallback: it fails, and says so
  await unverified(["clearway.verxyl.com", "verxyl.com"]);
  r = await sendEmail({ to: "rig-sender@rig.invalid", subject: `rig wall alert ${run} c`, html: "<p>rig</p>" });
  ok(r.ok === false, "when the fallback is refused too, the send fails and says so (no silent success)", r.error?.slice(0, 80));
} finally { await unverified([]); }
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
