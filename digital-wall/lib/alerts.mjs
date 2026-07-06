// NOTAM ("NTM") flight markers.
//
// Looks at flights departing within the next 24h, fetches NOTAMs for ADEP
// and ADES through the cached portal proxy (lib/portal-client.mjs), flags
// flights whose records match the configurable keyword/regex rule set, and
// decorates them exactly like limitations (badge class NTM).
//
// Weather is NOT handled here anymore: the old METAR/TAF keyword scan and
// its WX findings were replaced by the CheckWX flight_category system
// (lib/checkwx.mjs) — per-airport category markers, acknowledgment-only.

import crypto from "node:crypto";
import { JsonFileStore } from "./json-store.mjs";
import { getNotams, portalConfigured } from "./portal-client.mjs";
import {
  compileNotamGroups,
  DEFAULT_NOTAM_GROUPS,
  matchNotamText,
  notamExpired,
  sanitizeNotamGroups,
} from "./notam-rules.mjs";

// The scan looks 24h ahead — it runs ONCE per day, invoked by the daily
// NOTAM check (lib/notam-check.mjs) right after it fetched today's airports
// (the per-ICAO responses are still warm in the portal proxy cache), plus on
// demand via POST /api/alerts/scan. There is no continuous interval anymore,
// and findings are never emailed — the daily notification email is the only
// email (Item 2 of the console fixes).
const SCAN_HORIZON_HOURS = 24;

// Rule set — editable at runtime via GET/PUT /api/alerts/rules (persisted in
// data/alert-rules.json). NOTAM rules are the OPS keyword filter: colored
// groups of whole-token terms + bounded wildcard patterns (lib/notam-rules).
// Weather keeps the flat keywords/regexes shape.
export const DEFAULT_RULES = {
  notamGroups: DEFAULT_NOTAM_GROUPS,
};

function sha1(text) {
  return crypto.createHash("sha1").update(String(text)).digest("hex").slice(0, 16);
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
    const stored = Array.isArray(payload.findings) ? payload.findings : [];
    // One-time cleanup: WX findings from the retired METAR/TAF keyword scan
    // are gone for good (CheckWX categories replaced them).
    this.findings = stored.filter((f) => f.type !== "WX");
    if (this.findings.length !== stored.length) {
      console.log(`[alerts] purged ${stored.length - this.findings.length} legacy WX finding(s)`);
      await this.persist();
    }
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
    const stored = await this.rulesStore.read();
    // Migrate pre-OPS-filter rule files (flat notam.keywords/regexes) to the
    // grouped filter; the weather section and windows carry over.
    if (!Array.isArray(stored.notamGroups) || stored.notamGroups.length === 0) {
      const migrated = { notamGroups: DEFAULT_NOTAM_GROUPS };
      await this.rulesStore.write(migrated);
      return migrated;
    }
    // Retired keys from older rule files: windowsDays (one 24h scan per day)
    // and weather (replaced by CheckWX flight categories).
    if (stored.windowsDays || stored.weather) {
      delete stored.windowsDays;
      delete stored.weather;
      await this.rulesStore.write(stored);
    }
    return stored;
  }

  async setRules(input) {
    const rules = {
      notamGroups: sanitizeNotamGroups(input.notamGroups ?? DEFAULT_NOTAM_GROUPS),
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
          badge: finding.type, // NTM
          icao: finding.icao ?? null, // which airport raised it (Part 3 gating)
        });
      }
    }
    return result;
  }

  collectUpcomingFlights(horizonHours = SCAN_HORIZON_HOURS) {
    const nowMs = Date.now();
    const horizonMs = nowMs + horizonHours * 3600_000;
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
      const notamGroups = compileNotamGroups(rules.notamGroups);
      const nowMs = Date.now();

      const flights = this.collectUpcomingFlights();

      // One portal lookup per unique airport, sequential to stay gentle on
      // the scrape-backed upstream (responses are TTL-cached anyway).
      const icaos = new Set();
      for (const { flight } of flights) {
        for (const icao of [flight.adep?.icao, flight.ades?.icao]) {
          if (icao && /^[A-Z0-9]{4}$/i.test(icao)) icaos.add(String(icao).toUpperCase());
        }
      }
      const notamsByIcao = new Map();
      for (const icao of icaos) {
        notamsByIcao.set(icao, await getNotams(icao));
      }

      let newFindings = 0;
      let changedFindings = 0;
      const byId = new Map(this.findings.map((f) => [f.id, f]));

      for (const { key, flight, aircraft } of flights) {
        const windowLabel = "24 h";
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
              // Validity gate: an expired NOTAM (C) in the past) is never flagged.
              if (notamExpired(notam, nowMs)) continue;
              const text = `${notam.number ?? ""} ${notam.condition ?? ""}`;
              const hits = matchNotamText(text, notamGroups);
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
                matchedKeywords: hits.map((h) => h.label),
                matches: hits,
                windowLabel,
                recordTitle: notam.number ?? "NOTAM",
                departureUtc: flight.startTimeUTC,
                route: `${flight.adep?.icao ?? "UNK"} -> ${flight.ades?.icao ?? "UNK"}`,
              });
              if (outcome === "new") newFindings += 1;
              if (outcome === "changed") changedFindings += 1;
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

}
