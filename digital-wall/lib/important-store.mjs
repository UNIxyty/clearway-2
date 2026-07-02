// "Important" standing operational limitations (badge class IMP), imported
// from IMPORTANT.docx or added manually in the Console. Stored in
// data/important.json via the same local-JSON pattern as other wall config.
//
// Matching semantics: within one criteria list it's OR (any listed airport
// matches); across the criteria groups it's AND (an entry scoped to both an
// operator and a country only flags that operator's flights touching that
// country). An entry with no criteria at all matches nothing — imported
// entries whose criteria could not be inferred stay visible on the Important
// page (flagged for review) without flagging every flight.

import { JsonFileStore } from "./json-store.mjs";

const DIRECTIONS = new Set(["any", "dep", "arr"]);

function normalizeList(values, { upper = false } = {}) {
  const list = (Array.isArray(values) ? values : [])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .map((v) => (upper ? v.toUpperCase() : v));
  return [...new Set(list)];
}

function toIsoDateOrNull(value) {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function sanitizeImportantEntry(input = {}, existing = null) {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Important entry title is required.");
  const now = new Date().toISOString();
  const match = input.match || {};
  const direction = DIRECTIONS.has(String(match.direction || "any")) ? String(match.direction || "any") : "any";

  return {
    id: String(input.id || existing?.id || `IMP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`),
    title,
    body: String(input.body ?? existing?.body ?? "").trim(),
    class: "IMP",
    match: {
      countries: normalizeList(match.countries),
      airportIcaos: normalizeList(match.airportIcaos, { upper: true }),
      operators: normalizeList(match.operators),
      registrations: normalizeList(match.registrations, { upper: true }),
      direction,
      validFrom: toIsoDateOrNull(match.validFrom),
      validTo: toIsoDateOrNull(match.validTo),
    },
    isActive: input.isActive !== false,
    reviewed: input.reviewed === true,
    source: String(input.source || existing?.source || "manual"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export class ImportantStore {
  constructor() {
    this.store = new JsonFileStore("important.json", { entries: [] });
    this.entries = [];
    this.loaded = false;
  }

  async load() {
    const payload = await this.store.read();
    this.entries = Array.isArray(payload.entries) ? payload.entries : [];
    this.loaded = true;
    return this.entries;
  }

  async persist() {
    await this.store.write({ entries: this.entries, updatedAt: new Date().toISOString() });
  }

  list({ includeInactive = true } = {}) {
    const rows = includeInactive ? this.entries : this.entries.filter((e) => e.isActive !== false);
    return rows
      .slice()
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  }

  activeEntries() {
    return this.entries.filter((e) => e.isActive !== false);
  }

  async upsert(input) {
    const existing = input.id ? this.entries.find((e) => e.id === input.id) : null;
    const next = sanitizeImportantEntry(input, existing);
    const index = this.entries.findIndex((e) => e.id === next.id);
    if (index >= 0) this.entries[index] = next;
    else this.entries.push(next);
    await this.persist();
    return next;
  }

  async remove(id) {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.entries.length === before) throw new Error("Important entry not found.");
    await this.persist();
  }

  async setActive(id, isActive) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error("Important entry not found.");
    entry.isActive = Boolean(isActive);
    entry.updatedAt = new Date().toISOString();
    await this.persist();
    return entry;
  }

  /**
   * Match active entries against a flight context:
   * { depIcao, arrIcao, depCountry, arrCountry, oprId, operatorName,
   *   registration, startTimeUTC }
   */
  matchFlight(ctx) {
    const depIcao = String(ctx.depIcao || "").toUpperCase();
    const arrIcao = String(ctx.arrIcao || "").toUpperCase();
    const depCountry = String(ctx.depCountry || "").toLowerCase();
    const arrCountry = String(ctx.arrCountry || "").toLowerCase();
    const operatorNames = [ctx.oprId, ctx.operatorName]
      .map((v) => String(v || "").toLowerCase())
      .filter(Boolean);
    const registration = String(ctx.registration || "").toUpperCase();
    const flightMs = ctx.startTimeUTC ? new Date(ctx.startTimeUTC).getTime() : NaN;

    const matched = [];
    for (const entry of this.activeEntries()) {
      const m = entry.match || {};
      const direction = m.direction || "any";
      const groups = [];

      if ((m.airportIcaos || []).length > 0) {
        const set = new Set(m.airportIcaos.map((v) => v.toUpperCase()));
        const depHit = direction !== "arr" && set.has(depIcao);
        const arrHit = direction !== "dep" && set.has(arrIcao);
        groups.push(depHit || arrHit);
      }
      if ((m.countries || []).length > 0) {
        const set = new Set(m.countries.map((v) => v.toLowerCase()));
        const depHit = direction !== "arr" && depCountry && set.has(depCountry);
        const arrHit = direction !== "dep" && arrCountry && set.has(arrCountry);
        groups.push(depHit || arrHit);
      }
      if ((m.operators || []).length > 0) {
        const set = new Set(m.operators.map((v) => v.toLowerCase()));
        groups.push(operatorNames.some((name) => set.has(name)));
      }
      if ((m.registrations || []).length > 0) {
        const set = new Set(m.registrations.map((v) => v.toUpperCase()));
        groups.push(set.has(registration));
      }

      if (groups.length === 0) continue; // no criteria -> flags nothing
      if (!groups.every(Boolean)) continue;

      if (m.validFrom && Number.isFinite(flightMs) && flightMs < new Date(m.validFrom).getTime()) continue;
      if (m.validTo && Number.isFinite(flightMs) && flightMs > new Date(m.validTo).getTime()) continue;

      matched.push(entry);
    }
    return matched;
  }
}
