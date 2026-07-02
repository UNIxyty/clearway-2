// NOTAM ("NTM") and WEATHER ("WX") alert scanner (Feature 6).
//
// On a configurable cadence, looks at upcoming flights inside 7/3/1-day
// look-ahead windows, fetches NOTAMs + weather for ADEP and ADES through the
// cached portal proxy (lib/portal-client.mjs — never hammers the scrape-backed
// upstream), flags flights whose records match a configurable keyword/regex
// rule set, decorates them exactly like limitations (badge classes NTM / WX),
// and emails the full record once per (flight, record) — re-sending only when
// the record text materially changes.

import crypto from "node:crypto";
import path from "node:path";
import { JsonFileStore } from "./json-store.mjs";
import { getNotams, getWeather, portalConfigured } from "./portal-client.mjs";
import { escapeHtml, mailerConfigured, renderTemplateFile, sendEmail } from "./mailer.mjs";

const DEFAULT_SCAN_INTERVAL_MS = 30 * 60 * 1000;

// Starting rule set — editable at runtime via GET/PUT /api/alerts/rules
// (persisted in data/alert-rules.json). `keywords` match as whole words,
// case-insensitive; `regexes` are raw JS regex sources compiled with /i.
export const DEFAULT_RULES = {
  windowsDays: [7, 3, 1],
  notam: {
    keywords: [
      "CLSD", "CLOSED", "U/S", "UNSERVICEABLE", "OBST", "OBSTACLE",
      "GPS", "RAIM", "RESTRICTED", "RESTRICTION", "CURFEW", "PROHIBITED",
      "FUEL NOT AVBL", "FUEL NOT AVAILABLE", "SNOW CLOSURE",
    ],
    regexes: ["RWY[^.]{0,40}CLSD", "AD\\s+CLSD", "AERODROME\\s+CLOSED"],
  },
  weather: {
    keywords: ["TS", "TSRA", "FZRA", "FZDZ", "FZFG", "SN", "GR", "SQ", "FC", "VA"],
    regexes: [
      "\\b(BKN|OVC)00[0-4]\\b",        // ceiling below ~500 ft
      "\\bVV00[0-3]\\b",               // vertical visibility < 300 ft
      "\\b0[0-4]00\\b(?=\\s)",         // visibility below 500 m
      "\\bFG\\b",                       // fog
      "G(4[0-9]|[5-9][0-9])KT",        // gusts 40 kt and above
    ],
  },
};

function sha1(text) {
  return crypto.createHash("sha1").update(String(text)).digest("hex").slice(0, 16);
}

function compileRules(section) {
  const tests = [];
  for (const keyword of section?.keywords ?? []) {
    const escaped = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    tests.push({ label: keyword, regex: new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:[^A-Z0-9]|$)`, "i") });
  }
  for (const source of section?.regexes ?? []) {
    try {
      tests.push({ label: `/${source}/`, regex: new RegExp(source, "i") });
    } catch {
      /* invalid pattern — skipped; PUT /api/alerts/rules validates new ones */
    }
  }
  return tests;
}

function matchedLabels(text, tests) {
  const hits = [];
  for (const test of tests) {
    if (test.regex.test(text)) hits.push(test.label);
  }
  return hits;
}

function windowLabelFor(departureMs, nowMs, windowsDays) {
  const days = (departureMs - nowMs) / 86_400_000;
  const sorted = [...windowsDays].sort((a, b) => a - b);
  for (const window of sorted) {
    if (days <= window) return `${window} day${window === 1 ? "" : "s"}`;
  }
  return null; // outside every window
}

export class AlertsService {
  constructor({ timelineService, sseHub = null }) {
    this.timelineService = timelineService;
    this.sseHub = sseHub;
    this.rulesStore = new JsonFileStore("alert-rules.json", DEFAULT_RULES);
    this.findingsStore = new JsonFileStore("alert-findings.json", { findings: [] });
    this.findings = [];
    this.findingsByFlightKey = new Map();
    this.interval = null;
    this.scanning = false;
    this.lastScan = null;
  }

  async load() {
    const payload = await this.findingsStore.read();
    this.findings = Array.isArray(payload.findings) ? payload.findings : [];
    this.rebuildIndex();
  }

  rebuildIndex() {
    this.findingsByFlightKey = new Map();
    for (const finding of this.findings) {
      if (finding.isActive === false) continue;
      if (!this.findingsByFlightKey.has(finding.flightKey)) {
        this.findingsByFlightKey.set(finding.flightKey, []);
      }
      this.findingsByFlightKey.get(finding.flightKey).push(finding);
    }
  }

  async persist() {
    await this.findingsStore.write({ findings: this.findings, updatedAt: new Date().toISOString() });
  }

  async getRules() {
    return this.rulesStore.read();
  }

  async setRules(input) {
    const windowsDays = (Array.isArray(input.windowsDays) ? input.windowsDays : DEFAULT_RULES.windowsDays)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 60);
    if (windowsDays.length === 0) throw new Error("windowsDays needs at least one window (1-60).");
    const cleanSection = (section, fallback) => {
      const keywords = (Array.isArray(section?.keywords) ? section.keywords : fallback.keywords)
        .map((k) => String(k).trim())
        .filter(Boolean);
      const regexes = (Array.isArray(section?.regexes) ? section.regexes : fallback.regexes)
        .map((r) => String(r).trim())
        .filter(Boolean);
      for (const source of regexes) {
        try {
          new RegExp(source, "i");
        } catch {
          throw new Error(`Invalid regex: ${source}`);
        }
      }
      return { keywords, regexes };
    };
    const rules = {
      windowsDays,
      notam: cleanSection(input.notam, DEFAULT_RULES.notam),
      weather: cleanSection(input.weather, DEFAULT_RULES.weather),
    };
    await this.rulesStore.write(rules);
    return rules;
  }

  listFindings({ includeInactive = false } = {}) {
    const rows = includeInactive ? this.findings : this.findings.filter((f) => f.isActive !== false);
    return rows.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  /** Decoration hook (same contract the timeline service expects). */
  matchFlight(ctx) {
    const keys = [];
    if (ctx.oprId && ctx.flightNid) keys.push(`${ctx.oprId}:${ctx.flightNid}`);
    if (ctx.flightNid) keys.push(String(ctx.flightNid));
    const seen = new Set();
    const result = [];
    for (const key of keys) {
      for (const finding of this.findingsByFlightKey.get(key) ?? []) {
        if (seen.has(finding.id)) continue;
        seen.add(finding.id);
        result.push({
          id: finding.id,
          title: finding.title,
          description: finding.description,
          badge: finding.type, // NTM | WX
        });
      }
    }
    return result;
  }

  startPolling() {
    const parsed = Number(process.env.ALERT_SCAN_INTERVAL_MS);
    const intervalMs = Number.isFinite(parsed) && parsed >= 60_000 ? parsed : DEFAULT_SCAN_INTERVAL_MS;
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.runScan().catch((error) => {
        this.lastScan = { at: new Date().toISOString(), ok: false, error: String(error?.message || error) };
      });
    }, intervalMs);
    if (typeof this.interval.unref === "function") this.interval.unref();
    // First scan shortly after boot, once the Leon cache has settled.
    setTimeout(() => {
      this.runScan().catch(() => {});
    }, 20_000).unref?.();
  }

  collectUpcomingFlights(maxWindowDays) {
    const nowMs = Date.now();
    const horizonMs = nowMs + maxWindowDays * 86_400_000;
    const flights = [];
    for (const [key, flight] of this.timelineService.flightsByNid.entries()) {
      if (flight.isCnl) continue;
      const depMs = new Date(flight.startTimeUTC || 0).getTime();
      if (!Number.isFinite(depMs) || depMs < nowMs - 3600_000 || depMs > horizonMs) continue;
      const aircraft = this.timelineService.aircraftByFlightNid.get(key) ?? {};
      flights.push({ key, flight, aircraft, depMs });
    }
    return flights;
  }

  async runScan() {
    if (this.scanning) return this.lastScan;
    if (!portalConfigured()) {
      this.lastScan = { at: new Date().toISOString(), ok: false, error: "PORTAL_BASE_URL not configured; scanner idle." };
      return this.lastScan;
    }
    this.scanning = true;
    const startedAt = new Date().toISOString();
    try {
      const rules = await this.getRules();
      const notamTests = compileRules(rules.notam);
      const weatherTests = compileRules(rules.weather);
      const windows = rules.windowsDays?.length ? rules.windowsDays : DEFAULT_RULES.windowsDays;
      const maxWindow = Math.max(...windows);
      const nowMs = Date.now();

      const flights = this.collectUpcomingFlights(maxWindow);

      // One portal lookup per unique airport, sequential to stay gentle on
      // the scrape-backed upstream (responses are TTL-cached anyway).
      const icaos = new Set();
      for (const { flight } of flights) {
        for (const icao of [flight.adep?.icao, flight.ades?.icao]) {
          if (icao && /^[A-Z0-9]{4}$/i.test(icao)) icaos.add(String(icao).toUpperCase());
        }
      }
      const notamsByIcao = new Map();
      const weatherByIcao = new Map();
      for (const icao of icaos) {
        notamsByIcao.set(icao, await getNotams(icao));
        weatherByIcao.set(icao, await getWeather(icao));
      }

      let newFindings = 0;
      let changedFindings = 0;
      const emailQueue = [];
      const byId = new Map(this.findings.map((f) => [f.id, f]));

      for (const { key, flight, aircraft, depMs } of flights) {
        const windowLabel = windowLabelFor(depMs, nowMs, windows);
        if (!windowLabel) continue;
        const airports = [
          { icao: flight.adep?.icao, role: "departure" },
          { icao: flight.ades?.icao, role: "arrival" },
        ];
        for (const airport of airports) {
          const icao = String(airport.icao || "").toUpperCase();
          if (!icao || icao.length !== 4) continue;

          // NOTAM findings — one per matching record.
          const notamResult = notamsByIcao.get(icao);
          if (notamResult?.ok) {
            for (const notam of notamResult.data?.notams ?? []) {
              const text = `${notam.number ?? ""} ${notam.condition ?? ""}`;
              const hits = matchedLabels(text, notamTests);
              if (hits.length === 0) continue;
              const recordText = [
                `NOTAM ${notam.number ?? "(no number)"}  class ${notam.class ?? "-"}`,
                `Location: ${notam.location ?? icao}`,
                `Valid: ${notam.startDateUtc ?? "-"} -> ${notam.endDateUtc ?? "-"}`,
                "",
                notam.condition ?? "",
              ].join("\n");
              const id = `NTM:${key}:${icao}:${notam.number ?? sha1(notam.condition ?? "")}`;
              const outcome = this.upsertFinding(byId, {
                id,
                type: "NTM",
                flightKey: key,
                flightNid: String(flight.flightNid),
                oprId: aircraft.oprId ?? flight.oprId ?? null,
                flightNo: flight.flightNo,
                registration: aircraft.registration ?? flight.aircraftRegistration ?? null,
                icao,
                airportRole: airport.role,
                title: `${notam.number ?? "NOTAM"} at ${icao} (${airport.role})`,
                description: recordText,
                matchedKeywords: hits,
                windowLabel,
                recordTitle: notam.number ?? "NOTAM",
                departureUtc: flight.startTimeUTC,
                route: `${flight.adep?.icao ?? "UNK"} -> ${flight.ades?.icao ?? "UNK"}`,
              });
              if (outcome === "new") newFindings += 1;
              if (outcome === "changed") changedFindings += 1;
              if (outcome !== "unchanged") emailQueue.push(byId.get(id));
            }
          }

          // Weather finding — at most one per (flight, airport), covering the
          // whole METAR/TAF text.
          const weatherResult = weatherByIcao.get(icao);
          if (weatherResult?.ok && weatherResult.data?.weather) {
            const weatherText = String(weatherResult.data.weather);
            const hits = matchedLabels(weatherText, weatherTests);
            if (hits.length > 0) {
              const id = `WX:${key}:${icao}`;
              const outcome = this.upsertFinding(byId, {
                id,
                type: "WX",
                flightKey: key,
                flightNid: String(flight.flightNid),
                oprId: aircraft.oprId ?? flight.oprId ?? null,
                flightNo: flight.flightNo,
                registration: aircraft.registration ?? flight.aircraftRegistration ?? null,
                icao,
                airportRole: airport.role,
                title: `Weather at ${icao} (${airport.role}): ${hits.slice(0, 3).join(", ")}`,
                description: weatherText,
                matchedKeywords: hits,
                windowLabel,
                recordTitle: "METAR/TAF",
                departureUtc: flight.startTimeUTC,
                route: `${flight.adep?.icao ?? "UNK"} -> ${flight.ades?.icao ?? "UNK"}`,
              });
              if (outcome === "new") newFindings += 1;
              if (outcome === "changed") changedFindings += 1;
              if (outcome !== "unchanged") emailQueue.push(byId.get(id));
            }
          }
        }
      }

      // Drop findings for flights that left the cache or departed >1 day ago.
      const liveKeys = new Set(flights.map((f) => f.key));
      const before = this.findings.length;
      this.findings = [...byId.values()].filter((finding) => {
        if (liveKeys.has(finding.flightKey)) return true;
        const depMs = new Date(finding.departureUtc || 0).getTime();
        return Number.isFinite(depMs) && depMs > Date.now() - 86_400_000;
      });
      const pruned = before - this.findings.length + (byId.size - before);

      this.rebuildIndex();
      await this.persist();

      let emailed = 0;
      for (const finding of emailQueue) {
        if (await this.emailFinding(finding)) emailed += 1;
      }
      if (emailed > 0) await this.persist();

      if ((newFindings > 0 || changedFindings > 0 || pruned !== 0) && this.sseHub) {
        this.sseHub.broadcast({ type: "alerts.changed", newFindings, changedFindings });
      }

      this.lastScan = {
        at: startedAt,
        ok: true,
        flightsScanned: flights.length,
        airportsQueried: icaos.size,
        newFindings,
        changedFindings,
        emailed,
        totalActiveFindings: this.findings.filter((f) => f.isActive !== false).length,
      };
      return this.lastScan;
    } finally {
      this.scanning = false;
    }
  }

  /** Returns "new" | "changed" | "unchanged". */
  upsertFinding(byId, data) {
    const now = new Date().toISOString();
    const recordHash = sha1(data.description);
    const existing = byId.get(data.id);
    if (!existing) {
      byId.set(data.id, {
        ...data,
        recordHash,
        isActive: true,
        emailedAt: null,
        emailedHash: null,
        createdAt: now,
        updatedAt: now,
      });
      return "new";
    }
    if (existing.recordHash === recordHash) {
      // Same record — refresh the window label only (a 7-day finding becomes
      // a 1-day finding as departure approaches; no re-email for that).
      existing.windowLabel = data.windowLabel;
      return "unchanged";
    }
    Object.assign(existing, data, { recordHash, updatedAt: now });
    return "changed"; // material change -> eligible for re-email
  }

  async emailFinding(finding) {
    const to = String(process.env.ALERT_EMAIL_TO || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (to.length === 0 || !mailerConfigured()) return false;
    if (finding.emailedHash === finding.recordHash) return false; // already sent this exact record

    const alertType = finding.type === "NTM" ? "NOTAM" : "WEATHER";
    const subject = `[${finding.type}] ${finding.flightNo} ${finding.route} — ${finding.recordTitle} at ${finding.icao} (${finding.windowLabel} window)`;
    let html;
    try {
      html = await renderTemplateFile(path.resolve(process.cwd(), "templates", "alert-email.html"), {
        subject,
        alertType,
        badgeClass: finding.type,
        flightNo: finding.flightNo ?? "",
        route: finding.route ?? "",
        departureUtc: finding.departureUtc ?? "",
        windowLabel: finding.windowLabel ?? "",
        airportIcao: finding.icao ?? "",
        airportRole: finding.airportRole ?? "",
        recordTitle: finding.recordTitle ?? "",
        matchedKeywords: (finding.matchedKeywords ?? []).join(", "),
        recordHtml: escapeHtml(finding.description ?? ""),
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("alert email template failed:", error?.message || error);
      return false;
    }
    const result = await sendEmail({ to, subject, html });
    if (result.ok) {
      finding.emailedAt = new Date().toISOString();
      finding.emailedHash = finding.recordHash;
      return true;
    }
    console.error(`alert email failed for ${finding.id}: ${result.error}`);
    return false;
  }
}
