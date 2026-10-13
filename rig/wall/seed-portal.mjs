// Rig-only: what the portal would hold for the wall's test airports, INVENTED: NOTAMs, and a stand-in AIP AD-2 PDF.
// NOTAMs for the airports of the wall's mock flights (rig/wall/mock-leon.mjs), written where the
// portal keeps its NOTAM cache (STORAGE_ROOT/notam/<ICAO>.json). The portal answers /api/notams from that file before it
// would try any scraper, so the wall's NOTAM check gets a full list on the rig without CrewBriefing. Times are
// relative to now, in CrewBriefing's raw form (YYMMDDHHmm UTC, or PERM). The texts use the filter's keywords, so each
// airport has flagged and unflagged notices; none is a real NOTAM.
// The AIP stand-ins go where the portal keeps fetched AIPs (STORAGE_ROOT/aip/ead-pdf/<ICAO>.pdf), so the wall's
// "Send AIP / GEN" can be tried: each is one page saying it is an invented test document.
//   node rig/wall/seed-portal.mjs            (then press Run check now, or Retry on an airport)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DIR = path.join(ROOT, "rig/.scratch/storage/notam");
const H = 3600_000;
const cb = (h) => { const d = new Date(Date.now() + h * H); const p = (n) => String(n).padStart(2, "0"); return `${String(d.getUTCFullYear()).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}00`; };
// [number, class, start (h), end (h or "PERM"), text]
const SET = {
  EVRA: [["A9001/26", "AD", -48, 72, "TWY B CLSD DUE TO WIP. (INVENTED, RIG ONLY)"], ["A9002/26", "AD", -2, 30, "APRON 3 STANDS 31-34 NOT AVBL. (INVENTED, RIG ONLY)"], ["A9003/26", "NAV", -100, "PERM", "ILS RWY 18 GP U/S. (INVENTED, RIG ONLY)"], ["A9004/26", "OTHER", -10, 200, "BIRD CONCENTRATION IN THE VICINITY OF THE AD. (INVENTED, RIG ONLY)"]],
  EETN: [["A9101/26", "AD", -5, 20, "RWY 08/26 CLSD 2300-0400 DAILY. (INVENTED, RIG ONLY)"], ["A9102/26", "OTHER", -30, 300, "AD OPS RESTRICTED TO AIRCRAFT WITH PPR. (INVENTED, RIG ONLY)"]],
  ESSA: [["A9201/26", "AD", -1, 12, "DE-ICING AVBL ONLY ON REQUEST 2H BEFORE ETD. (INVENTED, RIG ONLY)"]],
  LSGG: [["A9301/26", "AD", -24, 48, "TWY Y CLSD. (INVENTED, RIG ONLY)"], ["A9302/26", "OTHER", 30, 60, "FIREWORKS DISPLAY 2KM NORTH OF AD. (INVENTED, RIG ONLY)"]],
  EYVI: [["A9401/26", "AD", -3, 40, "RWY 01/19 RESTRICTED TO ACFT BELOW 40T MTOW. (INVENTED, RIG ONLY)"]],
  LFPB: [["A9501/26", "OTHER", -6, 6, "GROUND HANDLING LIMITED, EXPECT DELAYS. (INVENTED, RIG ONLY)"]],
  LIPZ: [["A9601/26", "AD", -12, 36, "FUEL NOT AVBL 0000-0500. (INVENTED, RIG ONLY)"]],
  EGLF: [],
};
mkdirSync(DIR, { recursive: true });
for (const [icao, list] of Object.entries(SET)) {
  const notams = list.map(([number, cls, s, e, condition]) => ({ location: icao, number, class: cls, startDateUtc: cb(s), endDateUtc: e === "PERM" ? "PERM" : cb(e), created: cb(s - 1), condition }));
  writeFileSync(path.join(DIR, `${icao}.json`), JSON.stringify({ icao, notams, updatedAt: new Date().toISOString() }, null, 1));
}
console.log(`wrote invented NOTAMs for ${Object.keys(SET).length} airports → ${path.relative(ROOT, DIR)}`);

const { PDFDocument, StandardFonts } = createRequire(path.join(ROOT, "package.json"))("pdf-lib");
const AIP = path.join(ROOT, "rig/.scratch/storage/aip/ead-pdf");
mkdirSync(AIP, { recursive: true });
for (const icao of ["EVRA", "EYVI", "EETN", "LSGG"]) {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const pg = doc.addPage([595, 842]);
  [`AD 2 ${icao} (INVENTED TEST DOCUMENT)`, "Made by rig/wall/seed-portal.mjs for the test system.", "This is not an AIP. Nothing in it is real."].forEach((line, i) => pg.drawText(line, { x: 50, y: 780 - i * 24, size: i ? 11 : 16, font }));
  writeFileSync(path.join(AIP, `${icao}.pdf`), await doc.save());
}
console.log(`wrote invented AIP stand-ins → ${path.relative(ROOT, AIP)}`);
