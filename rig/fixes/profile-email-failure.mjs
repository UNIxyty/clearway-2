// Account › Profile › Change password: when the link email cannot be sent, the page says so. Before 2026-10-14 it
// said "Check your email" whatever happened. The rig has no mail server, so every send fails here.
//   node --env-file=.env.rig rig/fixes/profile-email-failure.mjs
import { BASE, signedIn, ok, done, sleep, text } from "./common.mjs";
const { browser, page } = await signedIn("user");
try {
  await page.goto(`${BASE}/account/profile`, { waitUntil: "load" }); await sleep(2000);
  await page.getByRole("button", { name: "Change password" }).click(); await sleep(400);
  await page.getByLabel("Current password").fill("rig-access-check-only");
  await page.getByRole("button", { name: /Check and send the link/ }).click(); await sleep(4000);
  const shown = await text(page.locator("body"));
  ok(!/Check your email/.test(shown), "no Check your email when nothing was sent");
  ok(/The email could not be sent/.test(shown), "it says the email could not be sent, and what to do", shown.match(/The email could not.{0,120}/)?.[0]);
} finally { await browser.close(); }
done();
