// Account › Profile › Change password: when the link email cannot be sent, the page says so. Before 2026-10-14 it
// said "Check your email" whatever happened. Since 2026-11-02 the portal sends through the rig's mock Resend, which
// refuses every send while this check runs (POST /_rig/fail-sends), so the send fails here on purpose.
//   node --env-file=.env.rig rig/fixes/profile-email-failure.mjs
import { BASE, signedIn, ok, done, sleep, text } from "./common.mjs";
const failSends = (on) => fetch("http://127.0.0.1:3996/_rig/fail-sends", { method: "POST", body: JSON.stringify({ on }) });
await failSends(true);
const { browser, page } = await signedIn("user");
try {
  await page.goto(`${BASE}/account/profile`, { waitUntil: "load" }); await sleep(2000);
  await page.getByRole("button", { name: "Change password" }).click(); await sleep(400);
  await page.getByLabel("Current password").fill("rig-access-check-only");
  await page.getByRole("button", { name: /Check and send the link/ }).click(); await sleep(4000);
  const shown = await text(page.locator("body"));
  ok(!/Check your email|Link handed to the mail service/.test(shown), "no success message when nothing was sent");
  ok(/The email could not be sent/.test(shown), "it says the email could not be sent, and what to do", shown.match(/The email could not.{0,120}/)?.[0] ?? shown.match(/[^\n]*(Password|current password|reset|could not|minute|seconds|Too many)[^\n]{0,160}/)?.[0]);
} finally { await browser.close(); await failSends(false); }
done();
