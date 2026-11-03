// The silence alarm (2026-11-03). The intake mailbox received nothing for 25 days and nothing said so — expected then,
// because intake is not live, and indistinguishable from a broken MX record or webhook. Once an admin arms it (Settings ›
// Flight intake, when intake goes live), no inbound email for SILENCE_WORKING_HOURS (24) working hours — Monday to
// Friday, 08:00–18:00 Europe/Riga — fails the `intake-silence` smoke check, which alerts through the developers' alert
// and shows on the service-status page. The input missing is a failure, never silence: if the last email's time cannot
// be read, the check fails. And the smoke run itself is watched by the wall (digital-wall/lib/agent-smoke-watch.mjs).
import { rest } from "../knowledge/retrieval.mjs";
import { intakeSettings } from "./settings.mjs";

export const SILENCE_WORKING_HOURS = Number(process.env.INTAKE_SILENCE_WORKING_HOURS || 24);
const TZ = "Europe/Riga", START = 8, END = 18;

/** Working hours (Mon–Fri, 08:00–18:00 in Riga) between two instants, counted per minute-free hour steps. */
export function workingHoursBetween(fromMs, toMs) {
  if (!(toMs > fromMs)) return 0;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23" });
  let h = 0;
  for (let t = fromMs; t < toMs; t += 3600_000) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour); const wd = parts.weekday;
    if (wd !== "Sat" && wd !== "Sun" && hour >= START && hour < END) h += Math.min(1, (toMs - t) / 3600_000);
  }
  return Math.round(h * 10) / 10;
}

/** { state: "not_armed" | "ok" | "silent", lastAt, hours } — throws when the last email's time cannot be read. */
export async function intakeSilence({ now = Date.now() } = {}) {
  const settings = await intakeSettings({ fresh: true });
  const rows = await rest("intake_messages?direction=eq.inbound&select=received_at&order=received_at.desc&limit=1");   // throws if unreadable
  if (!Array.isArray(rows)) throw new Error("the intake mailbox could not be read");
  const lastAt = rows[0]?.received_at ?? null;
  const armed = settings.silenceAlarm?.armed === true;
  if (!armed) return { state: "not_armed", lastAt, hours: null, armedSince: null };
  const from = Math.max(lastAt ? Date.parse(lastAt) : 0, settings.silenceAlarm.since ? Date.parse(settings.silenceAlarm.since) : 0);
  const hours = workingHoursBetween(from, now);
  return { state: hours >= SILENCE_WORKING_HOURS ? "silent" : "ok", lastAt, hours, armedSince: settings.silenceAlarm.since };
}
