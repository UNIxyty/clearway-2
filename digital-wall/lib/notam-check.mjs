// Daily "CHECK NOTAM" workflow (OPS spec, Item 1c).
//
// Every day at NOTAM_CHECK_HOUR (default 10:00) Europe/Riga:
//   - collect TODAY's flights (Riga day), deduplicate their ADEP/ADES,
//   - fetch NOTAMs per airport (CrewBriefing via the cached portal proxy —
//     one lookup per ICAO),
//   - filter by the OPS keyword groups + validity (now → +24h; PERM always
//     included),
//   - raise the wall sign "!!! CHECK NOTAM !!!" (SSE notam-check.changed;
//     the display only renders state),
//   - email the full filtered set to the digest recipient.
//
// Dispatchers acknowledge each airport from the console (POST
// /api/notam-check/ack); when every airport is checked the sign flips to
// "NOTAM CHECKED". State persists per Riga-day in data/notam-check.json and
// resets at the next daily run.

import path from "node:path";
import { JsonFileStore } from "./json-store.mjs";
import { getNotams, portalConfigured } from "./portal-client.mjs";
import { flightVisibleInWindow } from "../leon-sync.mjs";
import { mailerConfigured, renderTemplateFile, sendEmail } from "./mailer.mjs";
import {
  compileNotamGroups,
  formatNotamTime,
  matchNotamText,
  notamOverlapsWindow,
  notamStatus,
  parseNotamTime,
} from "./notam-rules.mjs";

const CHECK_WINDOW_MS = 24 * 3600_000;

/** Release/creation date, when the record has one ("CREATED: 07 Jul 2026 01:23:00" or a parsable stamp). */
function issuedText(raw, nowMs) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const compact = parseNotamTime(value);
  if (typeof compact === "number") return formatNotamTime(compact, nowMs);
  const parsed = Date.parse(value.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value} UTC`);
  return Number.isFinite(parsed) ? formatNotamTime(parsed, nowMs) : null;
}

function checkTz() {
  return String(process.env.NOTAM_CHECK_TZ || "Europe/Riga").trim();
}

function checkHour() {
  const parsed = Number(process.env.NOTAM_CHECK_HOUR);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 10;
}

// No fabricated default here: the old fallback ("ops@clearway.aero") meant an
// unset NOTAM_DIGEST_TO silently mailed a mailbox nobody reads — the #1 way
// "the notification isn't arriving". Unset now records a visible emailError.
function digestRecipients() {
  return String(process.env.NOTAM_DIGEST_TO || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Reminder cadence while airports remain unchecked (default 120 min, min 1). */
function reminderIntervalMs() {
  const minutes = Number(process.env.NOTAM_REMINDER_INTERVAL_MIN);
  return (Number.isFinite(minutes) && minutes >= 1 ? minutes : 120) * 60_000;
}

/** Calendar date (YYYY-MM-DD) and hour in the check timezone. */
function zonedNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: checkTz(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** The flight's departure date in the check timezone. */
function flightZonedDay(flight) {
  if (!flight.startTimeUTC) return null;
  const dt = new Date(flight.startTimeUTC);
  if (!Number.isFinite(dt.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: checkTz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(dt);
}

export class NotamCheckService {
  constructor({ timelineService, alertsService, sseHub, weatherService = null }) {
    this.timelineService = timelineService;
    this.alertsService = alertsService;
    this.sseHub = sseHub;
    this.weatherService = weatherService; // CheckWX — refreshed with each check run
    this.store = new JsonFileStore("notam-check.json", { day: null, sign: "NONE", airports: [] });
    this.state = { day: null, sign: "NONE", airports: [] };
    this.running = false;
    this.interval = null;
    this.reminderTimer = null; // single pending reminder; reset on each daily run
    this.lastRunError = null; // last scheduled/manual run failure, surfaced to the console
  }

  async load() {
    this.state = await this.store.read();
  }

  signState() {
    if (!this.state.day || this.state.airports.length === 0) return "NONE";
    return this.state.airports.every((a) => a.checked) ? "CHECKED" : "CHECK";
  }

  publicState() {
    return {
      day: this.state.day,
      timeZone: checkTz(),
      checkHour: checkHour(),
      ranAt: this.state.ranAt ?? null,
      dailyFiredFor: this.state.dailyFiredFor ?? null,
      emailedAt: this.state.emailedAt ?? null,
      emailedTo: this.state.emailedTo ?? null,
      emailError: this.state.emailError ?? null,
      remindersSent: this.state.remindersSent ?? 0,
      lastReminderAt: this.state.lastReminderAt ?? null,
      reminderIntervalMin: Math.round(reminderIntervalMs() / 60_000),
      lastRunError: this.lastRunError,
      sign: this.signState(),
      done: this.state.airports.filter((a) => a.checked).length,
      total: this.state.airports.length,
      airports: this.state.airports,
    };
  }

  /**
   * True when this airport carries a CHECKED ack in the CURRENT CHECK CYCLE
   * (the latest daily run). Deliberately NOT compared against the calendar
   * day: after Riga midnight but before the next 10:00 run, state.day is
   * still yesterday's — the old day-equality guard made this return false
   * for every airport overnight, so all NTM markers reappeared on flights
   * whose NOTAMs were already reviewed. Acks reset when the next daily run
   * builds the new day's airport list, which is the intended re-flag point.
   */
  isAirportCheckedToday(icao) {
    if (!this.state.day) return false;
    const airport = this.state.airports.find((a) => a.icao === String(icao || "").toUpperCase());
    return Boolean(airport?.checked);
  }

  broadcast() {
    if (!this.sseHub) return;
    const s = this.publicState();
    this.sseHub.broadcast({ type: "notam-check.changed", sign: s.sign, done: s.done, total: s.total, day: s.day });
  }

  startScheduler() {
    // Poll once a minute: when the zoned day advances past the check hour and
    // today's run hasn't happened, run it. Self-heals across restarts and
    // downtime (a boot at 11:30 still runs the 10:00 check).
    this.interval = setInterval(() => {
      const { day, hour } = zonedNow();
      // Fire on a DEDICATED per-day marker, not on state.day: a manual
      // "Run check now" before 10:00 also sets state.day, which used to
      // swallow the scheduled run (and its notification) for the whole day —
      // exactly the "checked at 04:40, no 10:00 email" miss.
      if (hour >= checkHour() && this.state.dailyFiredFor !== day) {
        console.log(`[notam-check] scheduled daily run firing for ${day} (state.day=${this.state.day}, dailyFiredFor=${this.state.dailyFiredFor ?? "never"})`);
        this.runDailyCheck({ reason: "scheduled" }).catch((error) => {
          this.lastRunError = error?.message || String(error);
          console.error("notam-check scheduled run failed:", this.lastRunError);
        });
      }
    }, 60_000);
    if (typeof this.interval.unref === "function") this.interval.unref();
    // A restart mid-day must not kill the reminder loop for pending airports.
    this.armReminder();
  }

  stopReminder() {
    if (this.reminderTimer) {
      clearTimeout(this.reminderTimer);
      this.reminderTimer = null;
    }
  }

  /** (Re)arm the single pending reminder while today's check has unchecked airports. */
  armReminder() {
    this.stopReminder();
    const { day } = zonedNow();
    if (!this.state.day || this.state.day !== day) return; // no run today / stale state
    if (this.state.airports.length === 0) return;
    if (this.state.airports.every((a) => a.checked)) return;
    this.reminderTimer = setTimeout(() => {
      this.fireReminder().catch((error) => {
        console.error("notam-check reminder failed:", error?.message || error);
        this.armReminder(); // keep trying next interval
      });
    }, reminderIntervalMs());
    if (typeof this.reminderTimer.unref === "function") this.reminderTimer.unref();
  }

  async fireReminder() {
    const { day } = zonedNow();
    if (this.state.day !== day) return this.stopReminder(); // Riga day rolled over — stop for today
    const remaining = this.state.airports.filter((a) => !a.checked).length;
    if (remaining === 0) return this.stopReminder();
    console.log(`[notam-check] reminder firing — ${remaining} airport(s) still unchecked for ${day}`);
    await this.emailNotification({ reminder: true });
    await this.store.write(this.state);
    this.broadcast();
    this.armReminder();
  }

  collectTodaysAirports(day, visibilitySettings = null) {
    const airports = new Map();
    for (const [key, flight] of this.timelineService.flightsByNid.entries()) {
      if (flight.isCnl) continue;
      if (flightZonedDay(flight) !== day) continue;
      // Item 9: airport collection follows the same visibility window as the
      // wall — a flight beyond the upcoming horizon (or long landed) doesn't
      // add its airports to today's check.
      if (visibilitySettings && !flightVisibleInWindow(flight, Date.now(), visibilitySettings)) continue;
      for (const airport of [flight.adep, flight.ades]) {
        const icao = String(airport?.icao || "").toUpperCase();
        if (!/^[A-Z0-9]{4}$/.test(icao) || icao === "UNKN") continue;
        if (!airports.has(icao)) {
          airports.set(icao, { icao, name: airport?.name || "", flights: [] });
        }
        if (flight.flightNo && !airports.get(icao).flights.includes(flight.flightNo)) {
          airports.get(icao).flights.push(flight.flightNo);
        }
      }
    }
    return [...airports.values()].sort((a, b) => a.icao.localeCompare(b.icao));
  }

  /**
   * Annotate a raw NOTAM list with parsed/formatted validity, lifecycle
   * status, window eligibility and keyword matches, then order it so the
   * NOTAMs eligible for today's flights are in focus:
   *   flagged-eligible → eligible → future (outside window) → expired.
   * An expired NOTAM can never be flagged (inWindow is false once C) has
   * passed), so `filtered` only ever contains active/imminent notices.
   */
  annotateNotams(rawNotams, groups, nowMs, windowTo) {
    const annotated = rawNotams.map((notam) => ({
      number: notam.number ?? null,
      class: notam.class ?? null,
      startDateUtc: notam.startDateUtc ?? null,
      endDateUtc: notam.endDateUtc ?? null,
      validFrom: formatNotamTime(parseNotamTime(notam.startDateUtc), nowMs),
      validTill: formatNotamTime(parseNotamTime(notam.endDateUtc), nowMs),
      issued: issuedText(notam.created, nowMs),
      condition: notam.condition ?? "",
      status: notamStatus(notam, nowMs),
      inWindow: notamOverlapsWindow(notam, nowMs, windowTo),
      matches: matchNotamText(`${notam.number ?? ""} ${notam.condition ?? ""}`, groups),
    }));
    const rank = (n) => {
      if (n.status === "expired") return 3;
      if (!n.inWindow) return 2; // future, outside today's window
      return n.matches.length > 0 ? 0 : 1;
    };
    const all = annotated.map((n, i) => ({ n, i })).sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i).map((x) => x.n);
    return {
      all,
      // Filtered set = keyword-matched AND valid in [now, +24h] (PERM included).
      filtered: all.filter((n) => n.inWindow && n.matches.length > 0),
    };
  }

  async runDailyCheck({ reason = "manual" } = {}) {
    if (this.running) return this.publicState();
    if (!portalConfigured()) {
      throw new Error("PORTAL_BASE_URL not configured — NOTAM check needs the portal proxy.");
    }
    this.running = true;
    try {
      const { day } = zonedNow();
      const nowMs = Date.now();
      const windowTo = nowMs + CHECK_WINDOW_MS;
      const rules = await this.alertsService.getRules();
      const groups = compileNotamGroups(rules.notamGroups);

      const visibilitySettings = await (this.timelineService.getVisibilitySettings?.() ?? Promise.resolve(null));
      const targets = this.collectTodaysAirports(day, visibilitySettings);
      // Same-day re-runs (scheduled 10:00 after an early manual run, or a
      // manual refresh later in the day) refresh the NOTAM data but PRESERVE
      // the acknowledgments already given today. Acks only reset when the
      // Riga day changes.
      const previousAcks = new Map(
        this.state.day === day
          ? (this.state.airports ?? []).filter((a) => a.checked).map((a) => [a.icao, a.checked])
          : []
      );
      const airports = [];
      for (const target of targets) {
        // One fetch per unique ICAO (portal proxy caches; CrewBriefing only).
        const result = await getNotams(target.icao);
        airports.push({
          icao: target.icao,
          name: target.name,
          flights: target.flights,
          error: result.ok ? null : result.error,
          checked: previousAcks.get(target.icao) ?? null,
          ...this.annotateNotams(result.ok ? result.data?.notams ?? [] : [], groups, nowMs, windowTo),
        });
      }

      let flightCount = 0;
      for (const flight of this.timelineService.flightsByNid.values()) {
        if (!flight.isCnl && flightZonedDay(flight) === day) flightCount += 1;
      }

      const sameDayRerun = this.state.day === day;
      const { hour } = zonedNow();
      // Any run at/after the check hour counts as "the daily has fired" so
      // the scheduler doesn't double-send a minute later; a manual run
      // BEFORE the hour deliberately does not (10:00 must still notify).
      const countsAsDaily = reason === "scheduled" || hour >= checkHour();
      this.state = {
        day,
        ranAt: new Date().toISOString(),
        reason,
        dailyFiredFor: countsAsDaily ? day : (sameDayRerun ? this.state.dailyFiredFor ?? null : null),
        airports,
        flightCount,
        emailedAt: null,
        emailedTo: null,
        emailError: null,
        remindersSent: sameDayRerun ? this.state.remindersSent ?? 0 : 0,
        lastReminderAt: sameDayRerun ? this.state.lastReminderAt ?? null : null,
      };
      this.lastRunError = null;
      await this.store.write(this.state);
      this.broadcast();

      const done = airports.filter((a) => a.checked).length;
      console.log(
        `[notam-check] ${reason} run for ${day}: ${airports.length} airport(s), ${flightCount} flight(s), ` +
          `${done} pre-checked${airports.length === 0 ? " — nothing to notify" : " — sending daily notification"}`
      );
      await this.emailNotification();
      await this.store.write(this.state);
      this.armReminder();

      // Single daily source of truth for the NTM flight markers: the NOTAM
      // alert scan runs right after the check, reusing the per-ICAO responses
      // just cached by the portal proxy.
      if (this.alertsService) {
        await this.alertsService.runScan().catch((error) => {
          console.error("post-check alert scan failed:", error?.message || error);
        });
      }
      // WX rides along with every check run: one CheckWX decoded-METAR call
      // per unique airport (acknowledgment-only — no page, no emails).
      if (this.weatherService) {
        await this.weatherService.refreshFor(targets.map((t) => t.icao)).catch((error) => {
          console.error("post-check WX refresh failed:", error?.message || error);
        });
      }
      return this.publicState();
    } finally {
      this.running = false;
    }
  }

  /**
   * Re-fetch a single FAILED airport (Item 2). Only errored airports are
   * resyncable — successful ones keep their cached result. Bypasses the
   * portal client's failure cache, guards against double-fires, keeps any
   * existing acknowledgment, and broadcasts the updated state.
   */
  async resyncAirport(icao) {
    const code = String(icao || "").toUpperCase();
    const airport = this.state.airports?.find((a) => a.icao === code);
    if (!airport) throw new Error(`Airport ${icao} is not part of today's check.`);
    if (!airport.error) throw new Error(`${code} already synced fine — resync is only for failed airports.`);
    this.resyncing = this.resyncing || new Set();
    if (this.resyncing.has(code)) throw new Error(`${code} resync already in progress.`);
    this.resyncing.add(code);
    try {
      const rules = await this.alertsService.getRules();
      const groups = compileNotamGroups(rules.notamGroups);
      const nowMs = Date.now();
      console.log(`[notam-check] resyncing ${code} (previous error: ${airport.error})`);
      const result = await getNotams(code, { fresh: true });
      // Refresh this airport's weather too while we're here.
      if (this.weatherService) {
        await this.weatherService.refreshFor([code]).catch(() => {});
      }
      if (result.ok) {
        Object.assign(airport, {
          error: null,
          ...this.annotateNotams(result.data?.notams ?? [], groups, nowMs, nowMs + CHECK_WINDOW_MS),
        });
      } else {
        airport.error = result.error;
      }
      await this.store.write(this.state);
      this.broadcast();
      return this.publicState();
    } finally {
      this.resyncing.delete(code);
    }
  }

  async ack(icao, user) {
    const airport = this.state.airports?.find((a) => a.icao === String(icao || "").toUpperCase());
    if (!airport) throw new Error(`Airport ${icao} is not part of today's check.`);
    airport.checked = airport.checked
      ? null // toggling off is allowed (mis-click)
      : { by: user?.name || user?.email || "unknown", at: new Date().toISOString() };
    await this.store.write(this.state);
    this.broadcast();
    // All checked -> reminders stop; an undo re-arms them.
    if (this.signState() === "CHECKED") this.stopReminder();
    else this.armReminder();
    return this.publicState();
  }

  /** Human date line for the email eyebrow, in the check timezone. */
  dateLine() {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: checkTz(),
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
      .format(new Date())
      .toUpperCase()
      .replace(/,/g, " ·");
  }

  /**
   * Notification-only email (design: Email Templates.dc.html) — the initial
   * "Action needed" send after the daily run, or the amber reminder while
   * airports remain unchecked. Deliberately contains NO NOTAM records — the
   * reading and acknowledging happen in the console. Every skip/failure is
   * logged AND recorded in state.emailError so the console can show why
   * nothing arrived.
   */
  async emailNotification({ reminder = false } = {}) {
    const s = this.state;
    const label = reminder ? "reminder" : "notification";
    const fail = (message) => {
      s.emailError = message;
      console.error(`[notam-check] ${label} email NOT sent: ${message}`);
      return false;
    };

    if (s.airports.length === 0) {
      console.log(`[notam-check] no airports today — ${label} email skipped.`);
      return false;
    }
    const to = digestRecipients();
    if (to.length === 0) return fail("NOTAM_DIGEST_TO is not set — configure the recipient in the backend .env.");
    if (!mailerConfigured()) return fail("RESEND_API_KEY is not set — the backend cannot send email.");

    const base = String(process.env.DIGITAL_WALL_PUBLIC_URL || "https://clearway.verxyl.com/digital-wall")
      .trim()
      .replace(/\/+$/, "");
    const assetBase = new URL(base).origin;
    const total = s.airports.length;
    const done = s.airports.filter((a) => a.checked).length;
    const remaining = total - done;
    const link = `${base}/console/notam-check`;

    const subject = reminder
      ? `Reminder: ${remaining} of ${total} airport${total === 1 ? "" : "s"} still need a NOTAM check`
      : `Action needed: check today's NOTAMs (${s.day})`;
    const template = reminder ? "notam-reminder.html" : "notam-notify.html";

    let html;
    try {
      html = await renderTemplateFile(path.resolve(process.cwd(), "templates", template), {
        subject,
        dateLine: this.dateLine(),
        day: s.day,
        airportCount: String(total),
        flightCount: String(s.flightCount ?? 0),
        done: String(done),
        remaining: String(remaining),
        link,
        assetBase,
        generatedAt: s.ranAt,
      });
    } catch (error) {
      return fail(`template ${template} failed to render: ${error?.message || error}`);
    }

    const result = await sendEmail({ to, subject, html });
    if (!result.ok) return fail(result.error);

    s.emailError = null;
    if (reminder) {
      s.remindersSent = (s.remindersSent ?? 0) + 1;
      s.lastReminderAt = new Date().toISOString();
    } else {
      s.emailedAt = new Date().toISOString();
      s.emailedTo = to.join(", ");
    }
    console.log(`[notam-check] ${label} email sent to ${to.join(", ")} (Resend id ${result.id ?? "n/a"})`);
    return true;
  }
}
