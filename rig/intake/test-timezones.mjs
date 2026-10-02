// Time zones: the runtime's data must be current, and local → UTC must be right or refused, never silently wrong.
// FAILS on a runtime with stale tz data. That is the point: run it in the image (and in CI) so staleness is loud.
//   node rig/intake/test-timezones.mjs            (set ICU_TIMEZONE_FILES_DIR to test against newer data)
import { TRICKY, TZ_MINIMUM, tzVersion, tzOlder, tzStatus, resolveLocal, localToUtcChecked, localToUtc, offsetMinutes } from "../../agent/lib/tzdata.mjs";
let failures = 0; const ok = (c, what, detail = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${detail ? `  · ${detail}` : ""}`); if (!c) failures += 1; };

console.log(`runtime: node ${process.version}, tz data ${tzVersion()}, minimum ${TZ_MINIMUM}, ICU_TIMEZONE_FILES_DIR=${process.env.ICU_TIMEZONE_FILES_DIR || "(not set)"}`);
ok(!tzOlder(tzVersion(), TZ_MINIMUM), `tz data is ${TZ_MINIMUM} or newer`, tzVersion());
ok(tzOlder("2025a", "2026c") && tzOlder("2026c", "2026d") && tzOlder("2026d", "2027a") && !tzOlder("2026c", "2026c") && tzOlder("", "2026c"), "version ordering");

// The tricky conversions, straight from the platform's data (no guard), so each wrong one is named.
for (const [tz, date, time, expected] of TRICKY) { const got = resolveLocal(date, time, tz).utc; ok(got === expected, `${tz} ${date} ${time} local → ${expected}`, got === expected ? "" : `got ${got}`); }

// Times that happen twice or never are refused, with the choices named.
let r = localToUtcChecked("2026-10-25", "02:30", "Europe/Madrid", "Madrid");
const st = tzStatus();
if (st.ok) {
  ok(r.utc === null && r.problem === "ambiguous" && /00:30 UTC or 01:30 UTC/.test(r.note), "a local time that happens twice is refused", r.note);
  r = localToUtcChecked("2026-03-29", "02:30", "Europe/Madrid", "Madrid");
  ok(r.utc === null && r.problem === "nonexistent", "a local time that never happens is refused", r.note);
  r = localToUtcChecked("2026-10-06", "17:30", "Nowhere/Invented", "x");
  ok(r.utc === null && r.problem === "unknown_zone", "an unknown zone is refused", r.note);
  ok(localToUtc("2026-10-06", "17:30", "Africa/Casablanca") === "2026-10-06T17:30:00Z", "guarded conversion: Casablanca 17:30 local on 6 Oct 2026 is 17:30Z");
  ok(offsetMinutes("Africa/Casablanca", "2026-10-06T17:30:00Z") === 0 && offsetMinutes("Europe/Riga", "2026-07-01T12:00:00Z") === 180, "guarded offsets");
} else {
  // Stale runtime: the guard must refuse everything, loudly.
  ok(r.utc === null && r.problem === "stale" && /out of date/.test(r.note), "STALE RUNTIME: conversion refused with the reason", r.note);
  ok(localToUtc("2026-07-01", "12:00", "Europe/Riga") === null && offsetMinutes("Europe/Riga", "2026-07-01T12:00:00Z") === null, "STALE RUNTIME: even an unaffected zone is not converted");
  console.log("self-test failures:"); for (const f of st.failures) console.log("   " + f);
}
ok(st.ok, "the runtime's self-test passes (conversions are enabled)");
console.log(failures ? `\n${failures} FAILED` : "\nall passed"); process.exit(failures ? 1 : 0);
