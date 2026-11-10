// One real send of each CLIENT email template to a test inbox (bug report 8 part 1C, 2026-11-10). Runs in the agent
// container on the server (it carries shared/email and the mailer with the production key):
//   docker cp scripts/prod-checks/send-client-email-samples.mjs agent-service:/tmp/s.mjs
//   docker exec -e TO=<address> agent-service node /tmp/s.mjs
// Sample values only (invented names, example links); the footer address is the real support setting; each send is
// recorded in Mailbox › Sent as kind "client-email-sample". Prints counts and ids, never an address body.
import { sendEmail } from "/digital-wall/lib/mailer.mjs";
import { buildEmail, sampleVars } from "/shared/email/templates.mjs";

const TO = String(process.env.TO || "").trim();
if (!TO) { console.error("TO is required"); process.exit(2); }
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
let support = "";
try { const r = await fetch(`${SB}/rest/v1/app_settings?select=value&key=eq.clients.support_email`, { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } }); support = String((await r.json())?.[0]?.value?.email ?? ""); } catch { support = ""; }
const portalUrl = String(process.env.PORTAL_SITE_URL || process.env.PORTAL_BASE_URL || "https://clearway.verxyl.com").replace(/\/+$/, "");
const IDS = ["07-client-request-received", "08-client-approved-set-password", "09-client-request-refused", "10-client-access-removed", "11-client-new-set-password-link", "12-client-password-changed"];
let sent = 0;
for (const id of IDS) {
  const mail = buildEmail(id, { ...sampleVars(id, portalUrl), portalUrl, supportEmail: support, email: TO, name: "Dmitry (test client)", company: "Clearway Test Client", link: `${portalUrl}/login`, resetLink: `${portalUrl}/login?forgot=1` });
  const out = await sendEmail({ to: [TO], subject: `[Sample] ${mail.subject}`, html: mail.html, text: mail.text, from: "Clearway <no-reply@clearway.verxyl.com>", record: { kind: "client-email-sample", ref: id } });
  console.log(`${id}: ${out.ok ? "sent" : "NOT SENT"}${out.ok ? "" : ` (${out.error})`}`);
  if (out.ok) sent += 1;
}
console.log(`${sent} of ${IDS.length} sample emails sent, support address ${support ? "set" : "not set"}`);
process.exit(sent === IDS.length ? 0 : 1);
