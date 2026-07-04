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
import { mailerConfigured, renderTemplateFile, sendEmail } from "./mailer.mjs";
import {
  compileNotamGroups,
  formatNotamTime,
  matchNotamText,
  notamOverlapsWindow,
  parseNotamTime,
} from "./notam-rules.mjs";

const CHECK_WINDOW_MS = 24 * 3600_000;

function checkTz() {
  return String(process.env.NOTAM_CHECK_TZ || "Europe/Riga").trim();
}

function checkHour() {
  const parsed = Number(process.env.NOTAM_CHECK_HOUR);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 10;
}

function digestRecipients() {
  return String(process.env.NOTAM_DIGEST_TO || "ops@clearway.aero")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
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
  constructor({ timelineService, alertsService, sseHub }) {
    this.timelineService = timelineService;
    this.alertsService = alertsService;
    this.sseHub = sseHub;
    this.store = new JsonFileStore("notam-check.json", { day: null, sign: "NONE", airports: [] });
    this.state = { day: null, sign: "NONE", airports: [] };
    this.running = false;
    this.interval = null;
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
      emailedAt: this.state.emailedAt ?? null,
      emailedTo: this.state.emailedTo ?? null,
      sign: this.signState(),
      done: this.state.airports.filter((a) => a.checked).length,
      total: this.state.airports.length,
      airports: this.state.airports,
    };
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
      if (hour >= checkHour() && this.state.day !== day) {
        this.runDailyCheck({ reason: "scheduled" }).catch((error) => {
          console.error("notam-check scheduled run failed:", error?.message || error);
        });
      }
    }, 60_000);
    if (typeof this.interval.unref === "function") this.interval.unref();
  }

  collectTodaysAirports(day) {
    const airports = new Map();
    for (const [key, flight] of this.timelineService.flightsByNid.entries()) {
      if (flight.isCnl) continue;
      if (flightZonedDay(flight) !== day) continue;
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

      const targets = this.collectTodaysAirports(day);
      const airports = [];
      for (const target of targets) {
        // One fetch per unique ICAO (portal proxy caches; CrewBriefing only).
        const result = await getNotams(target.icao);
        const all = result.ok ? result.data?.notams ?? [] : [];
        const annotated = all.map((notam) => ({
          number: notam.number ?? null,
          class: notam.class ?? null,
          startDateUtc: notam.startDateUtc ?? null,
          endDateUtc: notam.endDateUtc ?? null,
          validFrom: formatNotamTime(parseNotamTime(notam.startDateUtc)),
          validTill: formatNotamTime(parseNotamTime(notam.endDateUtc)),
          condition: notam.condition ?? "",
          inWindow: notamOverlapsWindow(notam, nowMs, windowTo),
          matches: matchNotamText(`${notam.number ?? ""} ${notam.condition ?? ""}`, groups),
        }));
        airports.push({
          icao: target.icao,
          name: target.name,
          flights: target.flights,
          error: result.ok ? null : result.error,
          // Filtered set = keyword-matched AND valid in [now, +24h] (PERM included).
          filtered: annotated.filter((n) => n.inWindow && n.matches.length > 0),
          all: annotated,
          checked: null, // reset acknowledgments on every run
        });
      }

      this.state = {
        day,
        ranAt: new Date().toISOString(),
        reason,
        airports,
        emailedAt: null,
        emailedTo: null,
      };
      await this.store.write(this.state);
      this.broadcast();

      const emailed = await this.emailNotification();
      if (emailed) await this.store.write(this.state);

      // Single daily source of truth for NTM/WX flight markers: the alert
      // scan (NOTAM + weather, 24h ahead) runs right after the check, reusing
      // the per-ICAO responses just cached by the portal proxy.
      if (this.alertsService) {
        await this.alertsService.runScan().catch((error) => {
          console.error("post-check alert scan failed:", error?.message || error);
        });
      }
      return this.publicState();
    } finally {
      this.running = false;
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
    return this.publicState();
  }

  /**
   * Notification-only email: "NOTAMs need to be checked" + a link to the
   * NOTAM Check page. Deliberately contains NO NOTAM records — the reading
   * and acknowledging happen in the console.
   */
  async emailNotification() {
    const to = digestRecipients();
    if (to.length === 0 || !mailerConfigured()) return false;
    const s = this.state;
    const base = String(process.env.DIGITAL_WALL_PUBLIC_URL || "https://clearway.verxyl.com/digital-wall")
      .trim()
      .replace(/\/+$/, "");
    const subject = `[NOTAM CHECK] ${s.day} — NOTAMs need to be checked for today's flights`;
    let html;
    try {
      html = await renderTemplateFile(path.resolve(process.cwd(), "templates", "notam-notify.html"), {
        subject,
        day: s.day,
        airportCount: String(s.airports.length),
        link: `${base}/console/notam-check`,
        generatedAt: s.ranAt,
      });
    } catch (error) {
      console.error("notam-notify template failed:", error?.message || error);
      return false;
    }
    const result = await sendEmail({ to, subject, html });
    if (result.ok) {
      this.state.emailedAt = new Date().toISOString();
      this.state.emailedTo = to.join(", ");
      return true;
    }
    console.error(`NOTAM notification email failed: ${result.error}`);
    return false;
  }
}
