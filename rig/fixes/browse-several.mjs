// Airport search › Browse: ticking several airports lists them all as tabs ("Done · show 2"); one opens it
// ("Done · open 1"). Before 2026-10-14 "Done · open 2" opened only the first.
//   node --env-file=.env.rig rig/fixes/browse-several.mjs
import { BASE, signedIn, ok, done, sleep, text } from "./common.mjs";
const { browser, page } = await signedIn("user");
const toLatvia = async () => {
  await page.goto(`${BASE}/aip`, { waitUntil: "load" }); await sleep(2000);
  await page.getByRole("button", { name: /Browse by region/ }).click(); await sleep(800);
  await page.getByText("Europe", { exact: true }).click(); await sleep(800);
  await page.getByText(/^Latvia/).first().click(); await sleep(1500);
};
try {
  await toLatvia();
  await page.getByText("EVRA", { exact: true }).last().click(); await sleep(300);
  await page.getByText("EVLA", { exact: true }).last().click(); await sleep(300);
  const btn = page.getByRole("button", { name: /^Done/ });
  ok(/Done · show 2/.test(await text(btn)), "two ticked: the button says Done · show 2", await text(btn));
  await btn.click(); await sleep(2500);
  ok(page.url().endsWith("/aip"), "it stays on Airport search", page.url());
  const shown = await text(page.locator("body"));
  ok(/2 AIRPORTS/.test(shown) && /EVRA/.test(shown) && /EVLA/.test(shown), "both are listed as tabs", shown.match(/\d+ AIRPORTS.{0,60}/)?.[0]);
  await toLatvia();
  await page.getByText("EVVA", { exact: true }).last().click(); await sleep(300);
  ok(/Done · open 1/.test(await text(page.getByRole("button", { name: /^Done/ }))), "one ticked: the button says Done · open 1");
  await page.getByRole("button", { name: /^Done/ }).click(); await sleep(3000);
  ok(page.url().endsWith("/aip/EVVA"), "…and it opens that airport", page.url());
} finally { await browser.close(); }
done();
