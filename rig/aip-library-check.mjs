// The AIP library's table while ENR is paused (2026-11-11), without a worker: every country's ENR link is the one paused
// state with the one sentence, ENR is not checked and not counted, the official link survives a server-side block as
// "unchecked" and live, a dated link is rebuilt for the cycle in force, and the four countries without a public AIP say
// so. Pure module reads (scripts/aip-library.mjs, lib/aip-enr.mjs); no network.
//   node --env-file=.env.rig rig/aip-library-check.mjs
import { ENR_ENABLED, ENR_PAUSED_TEXT } from "../lib/aip-enr.mjs";
import { seedCountries, libraryTable, datedUrlForCycle, eaipGenGuesses } from "../scripts/aip-library.mjs";

let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };

ok(ENR_ENABLED === false, "ENR is paused (AIP_ENR is not 'on')", String(process.env.AIP_ENR ?? "(unset)"));
ok(ENR_PAUSED_TEXT === "Not supported now, working on it", "the paused words are the ones asked for", ENR_PAUSED_TEXT);
const t = await libraryTable();
ok(t.enrEnabled === false && t.countries.length >= 100, "the table says ENR is off and holds every country", `${t.countries.length} countries`);
ok(t.countries.every((c) => c.links.enr.state === "paused" && c.links.enr.why === ENR_PAUSED_TEXT && c.links.enr.url === null), "every country's ENR link is paused, with the same words and no address", t.countries.filter((c) => c.links.enr.state !== "paused").map((c) => c.name).join(", "));
const seed = seedCountries();
const noAip = seed.filter((c) => c.noAip);
ok(noAip.length === 4 && noAip.every((c) => !c.official) && t.countries.filter((c) => noAip.some((n) => n.iso === c.iso)).every((c) => /^No public AIP:/.test(c.links.official.why)), "the four countries with no public AIP say so, with no link", noAip.map((c) => c.name).join(", "));
ok(seed.filter((c) => c.official).length >= 100, "every other country has an official page on file", `${seed.filter((c) => c.official).length} of ${seed.length}`);
ok(datedUrlForCycle("https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_16_APR_2026/FRANCE/home.html", "2026-10-29") === "https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_29_OCT_2026/FRANCE/home.html", "a dated link (DD_MON_YYYY) is rebuilt for the cycle in force");
ok(datedUrlForCycle("https://aip.dfs.de/BasicIFR/2026APR20/chapter/x.html", "2026-10-29") === "https://aip.dfs.de/BasicIFR/2026OCT29/chapter/x.html", "a dated link (YYYYMONDD) is rebuilt for the cycle in force");
ok(datedUrlForCycle("https://www.ais.gov.hk/eaip_20260319/VH-history-en-US.html", "2026-10-29") === "https://www.ais.gov.hk/eaip_20261029/VH-history-en-US.html", "a dated link (YYYYMMDD) is rebuilt for the cycle in force");
ok(datedUrlForCycle("https://eaip.austrocontrol.at/", "2026-10-29") === null, "a link without a date is left alone");
const g = eaipGenGuesses("https://ais.fi/eaip/006-2026_2026_10_16/index.html", ["EF"]);
ok(g.includes("https://ais.fi/eaip/006-2026_2026_10_16/eAIP/EF-GEN%201.2-en-GB.html") && g.includes("https://ais.fi/eaip/006-2026_2026_10_16/html/eAIP/EF-GEN-1.2-en-GB.html"), "the GEN guesses cover the eAIP layouts (dashed and spaced names, html/ and plain)", `${g.length} guesses`);
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
