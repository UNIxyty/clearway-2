// Puts the NEWEST published time-zone data where Node's ICU reads it (ICU_TIMEZONE_FILES_DIR).
//
// The distribution's tzdata-icu package is the baseline, but it can trail IANA by weeks (Oct 2026: Ubuntu had
// 2026c while IANA was at 2026e, which changes Manitoba and the Northwest Territories from 1 Nov). The ICU
// project publishes the same four files for every IANA release, usually within days. This script asks IANA for
// the current release name, fetches ICU's files for it, PROVES that Node then reports that release, and only
// then replaces the baseline. Any failure leaves the directory as it was and says why: the build's time-zone
// test decides afterwards whether what is there is new enough.
//   node scripts/fetch-tzdata.mjs <dir>
import { mkdirSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os"; import path from "node:path";
const dir = process.argv[2]; if (!dir) { console.error("usage: fetch-tzdata.mjs <dir>"); process.exit(2); }
const FILES = ["zoneinfo64.res", "metaZones.res", "timezoneTypes.res", "windowsZones.res"];
const reported = (d) => execFileSync(process.execPath, ["-p", "process.versions.tz"], { env: { ...process.env, ICU_TIMEZONE_FILES_DIR: d } }).toString().trim();
const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
mkdirSync(dir, { recursive: true });
let before = "none"; try { before = reported(dir); } catch { /* empty dir */ }
try {
  const latest = (await get("https://data.iana.org/time-zones/tzdb/version")).toString().trim();
  if (!/^\d{4}[a-z]+$/.test(latest)) throw new Error(`IANA answered "${latest.slice(0, 40)}"`);
  if (latest === before) { console.log(`[tzdata] already on the latest release, ${latest}`); process.exit(0); }
  const tmp = mkdtempSync(path.join(tmpdir(), "tz-"));
  for (const f of FILES) { const b = await get(`https://raw.githubusercontent.com/unicode-org/icu-data/main/tzdata/icunew/${latest}/44/le/${f}`); if (b.length < 10000) throw new Error(`${f} is only ${b.length} bytes`); writeFileSync(path.join(tmp, f), b); }
  const got = reported(tmp);
  if (got !== latest) throw new Error(`with the fetched files Node reports ${got}, not ${latest}`);
  for (const f of FILES) copyFileSync(path.join(tmp, f), path.join(dir, f));
  rmSync(tmp, { recursive: true, force: true });
  console.log(`[tzdata] ${before} → ${latest} (from the ICU project's data for the IANA release)`);
} catch (e) {
  console.log(`[tzdata] could not get the latest release (${String(e.message).slice(0, 160)}); keeping ${before}`);
}
