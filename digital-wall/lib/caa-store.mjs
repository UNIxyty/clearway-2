// CAA Details (Item 4) — Civil Aviation Authority contact records, imported
// from the OPS permissions sheet (CAA_NEW.xlsx, "Permissions - Air
// Navigation") and editable in the console. Stored in data/caa.json via the
// same local-JSON pattern as important-store.
//
// Each record keeps the sheet's columns VERBATIM (human-maintained data —
// OLD/NEW phone lists, working hours crammed into names, etc. are preserved,
// not cleaned) plus match flags:
//   match.countries / match.airportIcaos — country / airport / mixed scoping
//     (same semantics as IMP: OR within a list, AND across the two groups).
//   appliesTo — "any" | "commercial" | "private" (NEW, not in the sheet;
//     set per-entry in the app; matched against Leon's flight.isCommercial).
// A flight that matches shows the teal CAA pill marker and the authority's
// contact block in the overlay.

import { JsonFileStore } from "./json-store.mjs";

const APPLIES_TO = new Set(["any", "commercial", "private"]);

// The sheet's Function column is messy free text. functionKind is the
// STRUCTURED, filterable classification derived from it (the verbatim text
// stays in `functionText`).
export const FUNCTION_KINDS = [
  "overflight_landing",
  "landing",
  "overflight",
  "flight_plan",
  "other",
];

export function classifyFunction(text) {
  const v = String(text || "").toLowerCase();
  if (!v.trim()) return "other";
  const overflight = /over\s*fl(y|ight)/.test(v);
  const landing = /landing|lnd/.test(v);
  if (overflight && landing) return "overflight_landing";
  if (landing) return "landing";
  if (overflight) return "overflight";
  if (/flight\s*plan|fpl|route accept/.test(v)) return "flight_plan";
  return "other";
}

function normalizeList(values, { upper = false } = {}) {
  const list = (Array.isArray(values) ? values : [])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .map((v) => (upper ? v.toUpperCase() : v));
  return [...new Set(list)];
}

function normalizeCountryName(value) {
  return String(value || "")
    .replace(/\s*\([A-Z0-9]{1,2}\)\s*$/i, "")
    .replace(/\s+/g, " ") // sheet labels can carry line breaks
    .trim()
    .toLowerCase();
}

const text = (v) => String(v ?? "").trim();

/**
 * Multi-value contact fields (phones, mail): stored as arrays of strings,
 * same shape as match.countries. Legacy blobs (newline/comma-separated free
 * text from CAA_NEW.xlsx) are split here — values are separated, NEVER
 * cleaned or reformatted, so qualifiers like "(H24)", "OLD", "NEW" survive.
 */
export function splitMultiValue(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((v) => String(v ?? "").trim()).filter(Boolean))];
  }
  return [...new Set(
    String(value ?? "")
      .split(/[\r\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean)
  )];
}

export function sanitizeCaaEntry(input = {}, existing = null) {
  const country = text(input.country ?? existing?.country);
  const authorityName = text(input.authorityName ?? existing?.authorityName);
  if (!country && !authorityName) {
    throw new Error("A CAA entry needs at least a country or an authority name.");
  }
  const now = new Date().toISOString();
  const match = input.match || {};
  const appliesTo = APPLIES_TO.has(String(input.appliesTo || "").trim())
    ? String(input.appliesTo).trim()
    : existing?.appliesTo && APPLIES_TO.has(existing.appliesTo)
      ? existing.appliesTo
      : "any";
  const functionText = text(input.functionText ?? existing?.functionText);

  return {
    id: String(input.id || existing?.id || `CAA-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`),
    // ── the sheet's columns, verbatim ──
    country,
    authorityName,
    validity: text(input.validity ?? existing?.validity),
    functionText,
    functionKind: FUNCTION_KINDS.includes(input.functionKind)
      ? input.functionKind
      : classifyFunction(functionText),
    info: text(input.info ?? existing?.info),
    contact: text(input.contact ?? existing?.contact),
    phones: splitMultiValue(input.phones ?? existing?.phones),
    mail: splitMultiValue(input.mail ?? existing?.mail),
    sita: text(input.sita ?? existing?.sita),
    aftn: text(input.aftn ?? existing?.aftn),
    vfrAddresses: text(input.vfrAddresses ?? existing?.vfrAddresses),
    // ── match flags ──
    match: {
      countries: normalizeList(match.countries ?? existing?.match?.countries),
      airportIcaos: normalizeList(match.airportIcaos ?? existing?.match?.airportIcaos, { upper: true }),
    },
    appliesTo,
    isActive: input.isActive === undefined ? existing?.isActive !== false : input.isActive !== false,
    source: String(input.source || existing?.source || "manual"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export class CaaStore {
  constructor() {
    this.store = new JsonFileStore("caa.json", { entries: [] });
    this.entries = [];
    this.loaded = false;
  }

  async load() {
    const payload = await this.store.read();
    this.entries = Array.isArray(payload.entries) ? payload.entries : [];
    // One-time migration: phones/mail were free-text blobs (newline/comma
    // separated); convert to arrays in place, log what was split out.
    let migrated = 0;
    let valuesSplit = 0;
    for (const entry of this.entries) {
      if (typeof entry.phones === "string" || typeof entry.mail === "string") {
        const phones = splitMultiValue(entry.phones);
        const mail = splitMultiValue(entry.mail);
        valuesSplit += phones.length + mail.length;
        entry.phones = phones;
        entry.mail = mail;
        migrated += 1;
      }
    }
    if (migrated > 0) {
      await this.persist();
      console.log(`[caa] migrated ${migrated} entr${migrated === 1 ? "y" : "ies"} to array phones/mail (${valuesSplit} values split out)`);
    }
    this.loaded = true;
    return this.entries;
  }

  async persist() {
    await this.store.write({ entries: this.entries, updatedAt: new Date().toISOString() });
  }

  list({ includeInactive = true } = {}) {
    const rows = includeInactive ? this.entries : this.entries.filter((e) => e.isActive !== false);
    return rows.slice().sort((a, b) =>
      (a.country || a.authorityName || "").localeCompare(b.country || b.authorityName || "")
    );
  }

  async upsert(input) {
    const existing = input.id ? this.entries.find((e) => e.id === input.id) : null;
    const next = sanitizeCaaEntry(input, existing);
    const index = this.entries.findIndex((e) => e.id === next.id);
    if (index >= 0) this.entries[index] = next;
    else this.entries.push(next);
    await this.persist();
    return next;
  }

  async patch(id, patchInput = {}) {
    const existing = this.entries.find((e) => e.id === id);
    if (!existing) throw new Error("CAA entry not found.");
    const merged = {
      ...existing,
      ...patchInput,
      id,
      match: { ...existing.match, ...(patchInput.match ?? {}) },
    };
    return this.upsert(merged);
  }

  async remove(id) {
    const index = this.entries.findIndex((e) => e.id === id);
    if (index < 0) throw new Error("CAA entry not found.");
    this.entries.splice(index, 1);
    await this.persist();
  }

  async setActive(id, isActive) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error("CAA entry not found.");
    entry.isActive = isActive !== false;
    entry.updatedAt = new Date().toISOString();
    await this.persist();
    return entry;
  }

  /** Replace ALL entries (one-shot import). */
  async replaceAll(entries) {
    this.entries = entries;
    await this.persist();
    return this.entries.length;
  }

  activeEntries() {
    return this.entries.filter((e) => e.isActive !== false);
  }

  /**
   * Match active entries against a flight context:
   * { depIcao, arrIcao, depCountry, arrCountry, isCommercial }.
   * IMP semantics: OR within a criteria list, AND across country/airport
   * groups; entries with no criteria match nothing. The appliesTo flag then
   * gates on the flight kind — an UNKNOWN isCommercial only satisfies "any"
   * (never guess a flight into a commercial-only or private-only rule).
   */
  matchFlight(ctx) {
    const depIcao = String(ctx.depIcao || "").toUpperCase();
    const arrIcao = String(ctx.arrIcao || "").toUpperCase();
    const depCountry = normalizeCountryName(ctx.depCountry);
    const arrCountry = normalizeCountryName(ctx.arrCountry);
    const isCommercial = typeof ctx.isCommercial === "boolean" ? ctx.isCommercial : null;

    const matched = [];
    for (const entry of this.activeEntries()) {
      const m = entry.match || {};
      const groups = [];
      if ((m.countries || []).length > 0) {
        const names = new Set(m.countries.map(normalizeCountryName).filter(Boolean));
        groups.push((depCountry && names.has(depCountry)) || (arrCountry && names.has(arrCountry)));
      }
      if ((m.airportIcaos || []).length > 0) {
        const set = new Set(m.airportIcaos.map((v) => v.toUpperCase()));
        groups.push(set.has(depIcao) || set.has(arrIcao));
      }
      if (groups.length === 0 || !groups.every(Boolean)) continue;

      if (entry.appliesTo === "commercial" && isCommercial !== true) continue;
      if (entry.appliesTo === "private" && isCommercial !== false) continue;
      matched.push(entry);
    }
    return matched;
  }
}
