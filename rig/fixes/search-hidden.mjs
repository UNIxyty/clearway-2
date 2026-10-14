// An airport a person hid (AIP & Documents › Hidden airports) stays out of their search results too, and the page says
// it is hidden with a way to restore it. Before 2026-10-14 search only filtered its database rows, so a hidden airport
// was still found by code or name.
//   node --env-file=.env.rig rig/fixes/search-hidden.mjs
import { BASE, signedIn, ok, done, sleep, text, rest } from "./common.mjs";
const { browser, page, userId } = await signedIn("user");
const ICAO = "EVCA";
const search = (q) => page.evaluate(async (q) => { const d = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json(); return { results: d.results.map((a) => a.icao), hidden: d.hiddenMatches ?? [] }; }, q);
let row;
try {
  await page.goto(`${BASE}/help`, { waitUntil: "load" });
  ok((await search("Cesis")).results.includes(ICAO), `before hiding, "Cesis" finds ${ICAO}`);
  row = (await rest("deleted_airports", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ icao: ICAO, airport_snapshot: { icao: ICAO, name: "Cesis Airport", country: "Latvia (EV)" }, deleted_by: userId }) }))?.[0];
  for (const q of ["Cesis", ICAO, "Latvia"]) {
    const r = await search(q);
    ok(!r.results.includes(ICAO) && r.hidden.includes(ICAO), `hidden: "${q}" does not list ${ICAO}, and says it is hidden`, JSON.stringify(r).slice(0, 160));
  }
  await page.goto(`${BASE}/aip`, { waitUntil: "load" }); await sleep(1500);
  await page.getByPlaceholder(/Airport code/).fill("Cesis"); await page.getByRole("button", { name: "Find" }).click(); await sleep(2500); await page.keyboard.press("Escape");
  const shown = await text(page.locator("body"));
  ok(/You hid EVCA, so it is not listed\./.test(shown) && /Restore in Hidden airports/.test(shown), "the search page says the airport is hidden, with Restore in Hidden airports", shown.match(/You hid.{0,80}/)?.[0]);
} finally {
  if (row?.id) await rest(`deleted_airports?id=eq.${row.id}`, { method: "DELETE" });
  await browser.close();
}
done();
