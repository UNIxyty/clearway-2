// Admin › Email logs was removed on 2026-10-14: nothing had written to email_logs since Pick'em was retired, so the
// page could only show old rows. The sidebar must not offer it and its address must not open a page.
//   node --env-file=.env.rig rig/fixes/email-logs-removed.mjs
import { BASE, signedIn, ok, done, sleep, text } from "./common.mjs";
const { browser, page } = await signedIn("admin");
try {
  await page.goto(`${BASE}/admin/users`, { waitUntil: "load" }); await sleep(2000);
  ok(!/Email logs/.test(await text(page.locator("[data-cw-sidebar]"))), "the sidebar's Admin group has no Email logs");
  const res = await page.goto(`${BASE}/admin/email/logs`, { waitUntil: "load" }); await sleep(1500);
  ok(res?.status() === 404 || /Page not found|does not exist/.test(await text(page.locator("body"))), "the old address is not found", String(res?.status()));
  const api = await page.evaluate(async () => (await fetch("/api/admin/email-logs")).status);
  ok(api === 404, "its API is gone", String(api));
} finally { await browser.close(); }
done();
