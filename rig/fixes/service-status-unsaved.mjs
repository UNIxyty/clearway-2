// Admin › Service status editor reloads every 10 s. An edit not saved yet must survive the reload, and the row must
// say "Not saved" until it is saved. (Before 2026-10-14 the reload silently threw the edit away.)
//   node --env-file=.env.rig rig/fixes/service-status-unsaved.mjs
import { BASE, signedIn, ok, done, sleep, text, rest } from "./common.mjs";
const COUNTRY = "Estonia";
const before = (await rest(`country_service_statuses?country=eq.${COUNTRY}&select=state,note`))?.[0];
const { browser, page } = await signedIn("admin");
try {
  await page.goto(`${BASE}/admin/service-status`, { waitUntil: "load" }); await sleep(2500);
  const row = page.locator("tr").filter({ hasText: COUNTRY }).last();
  ok(await row.count() === 1, `${COUNTRY} is listed`);
  await row.getByRole("combobox").first().click(); await page.getByRole("option", { name: "In work" }).click();
  await row.getByPlaceholder(/Optional note/).fill("Checking EETN, not saved yet");
  ok(/Not saved/.test(await text(row)), "an edited row says Not saved");
  await sleep(12_500); // past one 10 s reload
  ok(/In work/.test(await text(row)), "after a reload the chosen status is still there", await text(row));
  ok((await row.getByPlaceholder(/Optional note/).inputValue()) === "Checking EETN, not saved yet", "after a reload the typed note is still there");
  ok(/Not saved/.test(await text(row)), "…and the row still says Not saved");
  const stored = (await rest(`country_service_statuses?country=eq.${COUNTRY}&select=state,note`))?.[0];
  ok(stored?.state === before?.state && stored?.note === before?.note, "nothing was stored before Save", JSON.stringify(stored));
  await row.getByRole("button", { name: "Save" }).click(); await sleep(1500);
  ok(!/Not saved/.test(await text(row)), "after Save the row no longer says Not saved");
  const saved = (await rest(`country_service_statuses?country=eq.${COUNTRY}&select=state,note`))?.[0];
  ok(saved?.state === "in_work" && saved?.note === "Checking EETN, not saved yet", "Save stored the edit", JSON.stringify(saved));
} finally {
  await rest(`country_service_statuses?country=eq.${COUNTRY}`, { method: "PATCH", body: JSON.stringify({ state: before?.state ?? "not_checked", note: before?.note ?? "" }) });
  await browser.close();
}
done();
