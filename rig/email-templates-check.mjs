// Every email template (design "Clearway Emails", 2026-11-10): each one is built with sample values, sent once to the
// rig's mail mock through the one mailer, read back, and rendered in a browser at 660 and 375 wide, light and dark
// (the email's own dark-mode rules forced, as Apple Mail applies them). Checks: a plain-text twin, a preheader, a
// 600px table layout, the VML button for Outlook, every variable escaped (a planted "<b>" stays text), no raw "{{",
// no internal hostname, times in the "12 Nov 2026 19:14Z" form, and the support address in the footer when given.
// Screenshots in rig/.scratch/shots/email-<id>-<theme>-<width>.png.
//   node --env-file=.env.rig rig/email-templates-check.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import { TEMPLATE_IDS, buildEmail, sampleVars } from "../shared/email/templates.mjs";
import { sendEmail } from "../digital-wall/lib/mailer.mjs";

const MOCK = process.env.RESEND_BASE_URL || "http://127.0.0.1:3996";
process.env.RESEND_BASE_URL = MOCK;
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "rig-mail-mock-key-not-a-secret";
const OUT = "rig/.scratch/shots"; fs.mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const sentList = async () => (await fetch(`${MOCK}/_rig/sent`)).json();
const sentBody = async (id) => (await fetch(`${MOCK}/_rig/sent/${id}`)).json();

const browser = await chromium.launch();
const n0 = (await sentList()).length;
for (const id of TEMPLATE_IDS) {
  const vars = { ...sampleVars(id, "https://portal.example.invalid"), name: "Sample <b>Person</b>", company: "Sample Air <script>x</script> (invented)" };
  const mail = buildEmail(id, vars);
  ok(mail.text.length > 40 && !/<[a-z]/i.test(mail.text), `${id}: a plain-text twin`, `${mail.text.length} chars`);
  ok(mail.html.includes('width="600"') && mail.html.includes("<!--[if mso]>") && /v:roundrect|cw-btn/.test(mail.html) === /link|Link/.test(JSON.stringify(vars)), `${id}: 600px tables and the Outlook button when there is a link`);
  ok(mail.html.includes("&lt;b&gt;Person&lt;/b&gt;") || !/\bname\b/.test(JSON.stringify(sampleVars(id))) , `${id}: a planted tag in a value stays text`);
  ok(!mail.html.includes("<script>") && !/\{\{/.test(mail.html) && !/\{\{/.test(mail.text), `${id}: no raw script and no unfilled variable`);
  ok(!/agent-service|digital-wall-backend|127\.0\.0\.1|localhost|supabase_db/i.test(mail.html.replace(/https:\/\/[a-z0-9.-]+\.supabase\.co\/[^\s"']+/g, "")), `${id}: no internal hostname`);
  const times = mail.html.match(/\b\d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}Z\b/g) || [];
  ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(mail.html), `${id}: every time is written like 12 Nov 2026 19:14Z`, times.slice(0, 2).join(", "));
  ok(mail.html.includes(vars.supportEmail), `${id}: the support address is in the footer`);
  ok(mail.html.includes('style="display:none;font-size:1px') && (mail.preheader ? mail.html.includes(mail.preheader.slice(0, 20).replace(/&/g, "&amp;")) : true), `${id}: a preheader`);
  const sent = await sendEmail({ to: ["rig-mail-check@rig.invalid"], subject: mail.subject, html: mail.html, text: mail.text, from: "Clearway <no-reply@rig.invalid>", record: null });
  ok(sent.ok === true, `${id}: sent once through the one mailer to the rig's mail mock`, sent.error || "");
  for (const theme of ["light", "dark"]) for (const width of [660, 375]) {
    const html = theme === "dark" ? mail.html.replace("@media (prefers-color-scheme:dark){", "@media all{") : mail.html;
    const ctx = await browser.newContext({ viewport: { width, height: 900 } }); const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "load" }); await page.waitForTimeout(150);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    ok(!wide, `${id} ${theme} ${width}: no horizontal scroll`);
    await page.screenshot({ path: `${OUT}/email-${id}-${theme}-${width}.png`, fullPage: true });
    await ctx.close();
  }
}
const sentNow = (await sentList()).slice(n0).filter((e) => [].concat(e.to).includes("rig-mail-check@rig.invalid"));
ok(sentNow.length === TEMPLATE_IDS.length, `${TEMPLATE_IDS.length} sends reached the mock, one per template`, String(sentNow.length));
if (sentNow[0]) { const body = await sentBody(sentNow[sentNow.length - 1].id); ok(Boolean(body.html) && body.html.includes("cw-card"), "the mock holds the rendered html of a send"); }
await browser.close();
console.log(failures ? `FAILED: ${failures}` : "ALL PASSED");
process.exit(failures ? 1 : 0);
