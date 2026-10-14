// Airport search: four letters are matched as an ICAO code AND as a name. Before 2026-10-14, "Riga", "Oslo" and
// "Nice" found nothing because any four-letter query was treated only as a code.
//   node --env-file=.env.rig rig/fixes/search-four-letters.mjs
import { BASE, signedIn, ok, done } from "./common.mjs";
const { browser, page } = await signedIn("user");
const search = (q) => page.evaluate(async (q) => (await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json()).results.map((a) => a.icao), q);
try {
  await page.goto(`${BASE}/help`, { waitUntil: "load" });
  for (const [q, icao] of [["Riga", "EVRA"], ["Oslo", "ENGM"], ["Nice", "LFMN"]]) {
    const r = await search(q); ok(r.includes(icao), `"${q}" finds ${icao}`, r.slice(0, 5).join(","));
  }
  const evra = await search("EVRA"); ok(evra[0] === "EVRA", "an exact ICAO code still comes first", evra.slice(0, 3).join(","));
  const latvia = await search("Latvia"); ok(latvia.length >= 7, "a country still lists its airports", String(latvia.length));
} finally { await browser.close(); }
done();
