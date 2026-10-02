// Time zones: the one place a local clock reading becomes UTC, and the checks that keep stale data from doing
// it silently.
//
// WHY THIS EXISTS. Node resolves zones through its bundled ICU data, which only moves when Node does. Countries
// change their rules with weeks of notice (Morocco and two Canadian provinces in 2026 alone), so a runtime that
// was current at build time converts a local time one hour wrong a few months later, and nothing looks wrong:
// the review screen says "converted" because the code believes it. That value goes into an ops system.
//
// THE RULES HERE
//   1. Where the source gives UTC, callers use it and never come here. Conversion is the last resort.
//   2. The runtime must run on current tz data (the image fetches the newest release at build; scripts/fetch-tzdata.mjs).
//   3. Before converting anything, the runtime proves itself: its tz version is at least TZ_MINIMUM, and a set
//      of deliberately tricky conversions comes out right. If not, nothing is converted: the caller gets a
//      reason and the field blocks until a person enters the UTC time.
//   4. A local time that happens twice (clocks go back) or never (clocks go forward) is not converted either.
//   5. Once a day the IANA release name is fetched; a newer release than the runtime's is shown as a warning.
//
// Raising TZ_MINIMUM: when IANA publishes a release that changes rules, set it here and add a TRICKY case for
// the change (expected value from a current tz database, e.g. `zdump` or Python's zoneinfo), then rebuild.

/**
 * The oldest tz release this code accepts.
 * 2026c: Morocco to UTC+0 (Sep 2026); British Columbia and Alberta stop changing clocks (Nov 2026).
 * 2026d: Northwest Territories (America/Inuvik) stay on -06.  2026e: Manitoba (America/Winnipeg) stays on -05.
 */
export const TZ_MINIMUM = "2026e";

/** [zone, local date, local time, expected UTC]. Each one is a rule change or an odd offset that stale or broken data gets wrong. */
export const TRICKY = [
  ["Africa/Casablanca", "2026-10-06", "17:30", "2026-10-06T17:30:00Z"],   // UTC+0 since 20 Sep 2026 (2026 release); older data says +1
  ["Africa/Casablanca", "2026-07-01", "12:00", "2026-07-01T11:00:00Z"],   // still +1 before the change
  ["Africa/El_Aaiun", "2026-12-01", "12:00", "2026-12-01T12:00:00Z"],     // follows Morocco
  ["America/Vancouver", "2026-12-15", "12:00", "2026-12-15T19:00:00Z"],   // no fall-back in Nov 2026
  ["America/Edmonton", "2026-12-15", "12:00", "2026-12-15T18:00:00Z"],    // no fall-back in Nov 2026
  ["America/Inuvik", "2026-12-15", "12:00", "2026-12-15T18:00:00Z"],      // 2026d: no fall-back in Nov 2026
  ["America/Winnipeg", "2026-12-15", "12:00", "2026-12-15T17:00:00Z"],    // 2026e: no fall-back in Nov 2026
  ["America/Mexico_City", "2026-07-01", "12:00", "2026-07-01T18:00:00Z"], // DST abolished 2022
  ["Asia/Tehran", "2026-07-01", "12:00", "2026-07-01T08:30:00Z"],         // DST abolished 2022, half-hour offset
  ["Asia/Amman", "2026-01-15", "12:00", "2026-01-15T09:00:00Z"],          // permanent +3 since 2022
  ["Africa/Cairo", "2026-07-01", "12:00", "2026-07-01T09:00:00Z"],        // DST reintroduced 2023
  ["Asia/Almaty", "2026-06-01", "12:00", "2026-06-01T07:00:00Z"],         // +5 since March 2024
  ["America/Asuncion", "2026-07-01", "12:00", "2026-07-01T15:00:00Z"],    // permanent -3 since 2024
  ["America/Santiago", "2026-07-01", "12:00", "2026-07-01T16:00:00Z"],    // southern-hemisphere winter
  ["America/Nuuk", "2026-07-01", "12:00", "2026-07-01T13:00:00Z"],        // -2 with DST since 2024
  ["Europe/Riga", "2026-10-24", "12:00", "2026-10-24T09:00:00Z"],         // the day before clocks go back
  ["Europe/Riga", "2026-10-25", "12:00", "2026-10-25T10:00:00Z"],         // the day they go back
  ["Europe/London", "2026-03-29", "12:00", "2026-03-29T11:00:00Z"],       // the day clocks go forward
  ["Asia/Kathmandu", "2026-05-01", "12:00", "2026-05-01T06:15:00Z"],      // 45-minute offset
  ["Australia/Lord_Howe", "2026-01-15", "12:00", "2026-01-15T01:00:00Z"], // half-hour DST
  ["America/St_Johns", "2026-07-01", "12:00", "2026-07-01T14:30:00Z"],    // half-hour offset with DST
  ["Asia/Dubai", "2026-07-01", "12:00", "2026-07-01T08:00:00Z"],          // no DST, as a control
];

export const tzVersion = () => String(process.versions.tz || "unknown");
/** "2025a" < "2026c" < "2026d" < "2027a". An unreadable version is older than everything. */
export function tzOlder(a, b) {
  const p = (v) => { const m = /^(\d{4})([a-z]*)$/.exec(String(v || "").trim()); return m ? [Number(m[1]), m[2]] : [0, ""]; };
  const [ya, la] = p(a), [yb, lb] = p(b);
  return ya !== yb ? ya < yb : la < lb;
}

/** Offset in minutes of an IANA zone at an instant, straight from the platform's tz data. No guard: internal. */
function platformOffset(tz, ms) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    return Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(ms / 1000) * 1000) / 60000);
  } catch { return null; }
}
const iso = (ms) => new Date(ms).toISOString().replace(/\.000Z$/, "Z");

/**
 * Local wall clock → UTC with the platform's data, no staleness guard. Finds every instant whose local reading
 * is that clock time: exactly one is the answer; two means the time happens twice (clocks go back); none means
 * it never happens (clocks go forward).
 */
export function resolveLocal(dateYmd, hhmm, tz) {
  const wall = Date.parse(`${dateYmd}T${hhmm}:00Z`);
  if (!Number.isFinite(wall) || !tz) return { utc: null, problem: "unreadable", candidates: [] };
  const offsets = new Set([-86400000, 0, 86400000].map((d) => platformOffset(tz, wall + d)));
  if (offsets.has(null)) return { utc: null, problem: "unknown_zone", candidates: [] };
  const candidates = [...offsets].filter((o) => platformOffset(tz, wall - o * 60000) === o).map((o) => wall - o * 60000).sort((a, b) => a - b).map(iso);
  if (candidates.length === 1) return { utc: candidates[0], problem: null, candidates };
  return { utc: null, problem: candidates.length ? "ambiguous" : "nonexistent", candidates };
}

// ── Self-test: run once, before the first conversion ─────────────────────────────────────────────────────────
let selfTest = null; let latest = { release: null, checkedAt: null, error: null };
function runSelfTest() {
  const version = tzVersion(); const failures = [];
  if (tzOlder(version, TZ_MINIMUM)) failures.push(`tz data ${version} is older than the required ${TZ_MINIMUM}`);
  for (const [tz, date, time, expected] of TRICKY) {
    const got = resolveLocal(date, time, tz).utc;
    if (got !== expected) failures.push(`${tz} ${date} ${time} local → ${got ?? "nothing"}, should be ${expected}`);
  }
  return { ok: failures.length === 0, version, minimum: TZ_MINIMUM, failures };
}
/** { ok, version, minimum, failures[], latest, behind }. `ok: false` means nothing is converted. */
export function tzStatus() {
  if (!selfTest) selfTest = runSelfTest();
  return { ...selfTest, latest: latest.release, latestCheckedAt: latest.checkedAt, behind: Boolean(latest.release && tzOlder(selfTest.version, latest.release)) };
}
export const staleNote = () => { const s = tzStatus(); return `This server's time-zone data (${s.version}) is out of date or failed its self-test, so local times are not converted. Enter the UTC time.`; };

/** Guarded: null when the runtime's tz data is not trusted. */
export function offsetMinutes(tz, atIso) {
  if (!tz || !tzStatus().ok) return null;
  const ms = Date.parse(atIso); return Number.isFinite(ms) ? platformOffset(tz, ms) : null;
}
/**
 * Guarded conversion. → { utc, problem, note }: `utc` is null whenever the answer is not certain, and `note`
 * says why in words a dispatcher can act on. problem: null | stale | ambiguous | nonexistent | unknown_zone | unreadable.
 */
export function localToUtcChecked(dateYmd, hhmm, tz, place = "the airport") {
  if (!tzStatus().ok) return { utc: null, problem: "stale", note: staleNote() };
  const r = resolveLocal(dateYmd, hhmm, tz);
  if (!r.problem) return { utc: r.utc, problem: null, note: null };
  const clocks = r.candidates.map((c) => `${c.slice(11, 16)} UTC`).join(" or ");
  const note = r.problem === "ambiguous" ? `${hhmm} local happens twice in ${place} that night (the clocks go back): ${clocks}. Enter the UTC time.`
    : r.problem === "nonexistent" ? `${hhmm} local does not exist in ${place} that night (the clocks go forward). Enter the UTC time.`
    : r.problem === "unknown_zone" ? `The time zone "${tz}" is not known to this server. Enter the UTC time.`
    : "The local time could not be read. Enter the UTC time.";
  return { utc: null, problem: r.problem, note };
}
/** Guarded conversion, UTC ISO or null. Prefer localToUtcChecked where the reason matters. */
export const localToUtc = (dateYmd, hhmm, tz) => localToUtcChecked(dateYmd, hhmm, tz).utc;

// ── Loud at startup, and a daily look at what IANA has published ─────────────────────────────────────────────
async function refreshLatest() {
  try {
    const r = await fetch("https://data.iana.org/time-zones/tzdb/version", { signal: AbortSignal.timeout(8000) });
    const v = (await r.text()).trim();
    if (!r.ok || !/^\d{4}[a-z]+$/.test(v)) throw new Error(`unexpected answer (HTTP ${r.status})`);
    latest = { release: v, checkedAt: new Date().toISOString(), error: null };
  } catch (e) { latest = { ...latest, checkedAt: new Date().toISOString(), error: String(e.message).slice(0, 120) }; }
  return latest;
}
/** Call once on start. Logs the state in words nobody can miss, then keeps the IANA release name fresh. */
export function startTzWatch(log = (line) => process.stderr.write(line + "\n")) {
  const s = tzStatus();
  if (s.ok) log(`[tzdata] ${s.version} (minimum ${s.minimum}); ${TRICKY.length} check conversions correct.`);
  else { log(`[tzdata] ERROR: TIME-ZONE DATA NOT TRUSTED. LOCAL TIMES WILL NOT BE CONVERTED TO UTC.`); for (const f of s.failures) log(`[tzdata]   ${f}`); log(`[tzdata]   Fix: rebuild the image (it fetches current tz data) and check ICU_TIMEZONE_FILES_DIR. See docs/intake.md, "Time zones".`); }
  if (String(process.env.TZDATA_LATEST_CHECK || "").trim() === "off") return s;
  const check = async () => { const l = await refreshLatest(); if (l.release && tzOlder(tzVersion(), l.release)) log(`[tzdata] WARNING: IANA has published ${l.release}; this server runs ${tzVersion()}. Rebuild the image to pick it up.`); };
  void check(); setInterval(check, 24 * 3600 * 1000).unref();
  return s;
}
/** Tests only. */
export const _resetForTests = () => { selfTest = null; latest = { release: null, checkedAt: null, error: null }; };
