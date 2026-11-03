// The silence alarm (2026-11-03): armed when intake goes live, no inbound email for 24 working hours fails the
// `intake-silence` smoke check, and an unreadable mailbox is a failure, never silence. Rig database; clock passed in.
//   node --env-file=.env.rig rig/intake/silence-check.mjs
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 170)}` : ""}`); if (!c) failures += 1; };
const sil = await import("../../agent/lib/intake/silence.mjs");
const { setIntakeSettings, intakeSettings } = await import("../../agent/lib/intake/settings.mjs");
const smoke = await import("../../agent/lib/smoke.mjs");
const admin = { userId: "00000000-0000-4000-8000-0000000000aa", email: "rig-admin@rig.invalid" };
const wasArmed = (await intakeSettings({ fresh: true })).silenceAlarm?.armed === true;
const Mon = Date.parse("2026-11-02T06:00:00Z");
ok(sil.workingHoursBetween(Mon, Mon + 10 * 3600_000) === 10 && sil.workingHoursBetween(Date.parse("2026-10-30T16:00:00Z"), Mon) === 0 && sil.workingHoursBetween(Mon, Mon + 7 * 864e5) === 50, "working hours: Monday 08–18 Riga is 10, a weekend is 0, a week is 50");
try {
  await setIntakeSettings({ silenceAlarm: false }, admin);
  let x = await sil.intakeSilence({ now: Date.now() + 30 * 864e5 });
  ok(x.state === "not_armed", "not armed (intake not live): a month of silence does not ring", x.state);
  let r = await smoke.SMOKES["intake-silence"]();
  ok(/not armed/.test(r), "the smoke check passes, saying it is not armed", r);
  await setIntakeSettings({ silenceAlarm: true }, admin);
  const armedAt = Date.parse((await intakeSettings({ fresh: true })).silenceAlarm.since);
  x = await sil.intakeSilence({ now: armedAt + 3600_000 });
  ok(x.state === "ok" && x.hours <= 1, "just armed: counted from the arming, not from the last email weeks ago", `${x.state} ${x.hours} h`);
  x = await sil.intakeSilence({ now: armedAt + 7 * 864e5 });
  ok(x.state === "silent" && x.hours >= sil.SILENCE_WORKING_HOURS, "a week armed with no email: silent", `${x.hours} working hours`);
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  let threw = null; try { await sil.intakeSilence(); } catch (e) { threw = e; }
  process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  ok(threw !== null, "the mailbox cannot be read: an error (the smoke check fails), never silence-as-fine", threw?.message);
} finally { await setIntakeSettings({ silenceAlarm: wasArmed }, admin).catch(() => {}); }
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
