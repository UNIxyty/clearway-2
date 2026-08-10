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
import { icaoToIso2 } from "./icao-country.mjs";

// "overfly" is accepted for entries that concern overflight permits
// (imported from IMPORTANT.docx). The wall only knows departure/arrival
// airports — not the filed route — so overfly-scoped entries are kept
// visible on the Important page but deliberately match no flights until
// route data exists to match against.
const DIRECTIONS = new Set(["any", "dep", "arr", "overfly"]);

/**
 * Entry countries may be ISO 3166-1 alpha-2 codes ("FR", "GB" — the
 * important-seed.json convention) or display names ("France"). ISO codes are
 * matched against the country derived from the flight's ICAO prefix (works
 * for every airport); names are matched against the airport-directory
 * country string, which looks like "France (LF)" — hence the suffix strip.
 */
function normalizeCountryName(value) {
  return String(value || "")
    .replace(/\s*\([A-Z0-9]{1,2}\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

function isIsoCode(value) {
  return /^[A-Z]{2}$/.test(String(value || "").trim());
}

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
  // Flight type + load (bug report item 10): permits can depend on
  // commercial/private and on PAX vs FERRY. "any" keeps prior behaviour.
  const APPLIES_TO = new Set(["any", "commercial", "private"]);
  const LOADS = new Set(["any", "pax", "ferry"]);
  const appliesTo = APPLIES_TO.has(String(input.appliesTo ?? existing?.appliesTo ?? "any"))
    ? String(input.appliesTo ?? existing?.appliesTo ?? "any")
    : "any";
  const load = LOADS.has(String(input.load ?? existing?.load ?? "any"))
    ? String(input.load ?? existing?.load ?? "any")
    : "any";

  // Audit metadata (Item 8): added* is stamped once at creation; confirmed*
  // records WHO flipped reviewed to true and when. Un-reviewing clears the
  // confirmation so the display never shows a stale reviewer.
  const wasReviewed = existing?.reviewed === true;
  const isReviewed = input.reviewed === true;
  const actor = String(input.__actor || "").trim() || null;
  let confirmedAt = existing?.confirmedAt ?? null;
  let confirmedBy = existing?.confirmedBy ?? null;
  if (isReviewed && !wasReviewed) {
    confirmedAt = now;
    confirmedBy = actor;
  } else if (!isReviewed && wasReviewed) {
    confirmedAt = null;
    confirmedBy = null;
  }

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
    appliesTo,
    load,
    isActive: input.isActive !== false,
    reviewed: isReviewed,
    source: String(input.source || existing?.source || "manual"),
    // Attachments are managed via their own endpoints — carried through
    // untouched here so a criteria edit can't drop them.
    attachments: Array.isArray(existing?.attachments) ? existing.attachments : [],
    addedAt: existing?.addedAt ?? existing?.createdAt ?? now,
    addedBy: existing?.addedBy ?? (existing ? null : actor),
    confirmedAt,
    confirmedBy,
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
    // Item 8 migration: older entries get null audit fields (addedAt
    // backfilled from createdAt) and an empty attachments list.
    this.entries = (Array.isArray(payload.entries) ? payload.entries : []).map((entry) => ({
      ...entry,
      attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
      addedAt: entry.addedAt ?? entry.createdAt ?? null,
      addedBy: entry.addedBy ?? null,
      confirmedAt: entry.confirmedAt ?? null,
      confirmedBy: entry.confirmedBy ?? null,
    }));
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

  /**
   * One-shot force re-review (Item 8): every entry back to needs-review.
   * Content, criteria and active state are untouched. Returns the count of
   * entries that were flipped.
   */
  async resetAllReviews() {
    let reset = 0;
    for (const entry of this.entries) {
      if (entry.reviewed !== false) {
        entry.reviewed = false;
        reset += 1;
      }
    }
    if (reset > 0) await this.persist();
    console.log(`[important] reset ${reset} entr${reset === 1 ? "y" : "ies"} to needs-review`);
    return reset;
  }

  async upsert(input, { actor = null } = {}) {
    const existing = input.id ? this.entries.find((e) => e.id === input.id) : null;
    const next = sanitizeImportantEntry({ ...input, __actor: actor }, existing);
    const index = this.entries.findIndex((e) => e.id === next.id);
    if (index >= 0) this.entries[index] = next;
    else this.entries.push(next);
    await this.persist();
    return next;
  }

  /**
   * Partial update (Item 5): merge the patch over the stored entry (match
   * criteria merged field-wise) and re-sanitize, so EVERY field — title,
   * body, criteria, direction, window, active, reviewed — is editable
   * through PATCH /api/important/:id.
   */
  async patch(id, patchInput = {}, { actor = null } = {}) {
    const existing = this.entries.find((e) => e.id === id);
    if (!existing) throw new Error("Important entry not found.");
    const merged = {
      ...existing,
      ...patchInput,
      id,
      match: { ...existing.match, ...(patchInput.match ?? {}) },
    };
    return this.upsert(merged, { actor });
  }

  /** Attachment references (Item 8) — bytes live in the attachment store. */
  async addAttachment(id, attachment) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error("Important entry not found.");
    entry.attachments = [...(entry.attachments ?? []), attachment];
    entry.updatedAt = new Date().toISOString();
    await this.persist();
    return entry;
  }

  async removeAttachment(id, attachmentId) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error("Important entry not found.");
    const attachment = (entry.attachments ?? []).find((a) => a.id === attachmentId);
    if (!attachment) throw new Error("Attachment not found.");
    entry.attachments = entry.attachments.filter((a) => a.id !== attachmentId);
    entry.updatedAt = new Date().toISOString();
    await this.persist();
    return { entry, attachment };
  }

  getAttachment(id, attachmentId) {
    const entry = this.entries.find((e) => e.id === id);
    const attachment = (entry?.attachments ?? []).find((a) => a.id === attachmentId);
    return attachment ? { entry, attachment } : null;
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
    const depIso = icaoToIso2(depIcao);
    const arrIso = icaoToIso2(arrIcao);
    const depCountryName = normalizeCountryName(ctx.depCountry);
    const arrCountryName = normalizeCountryName(ctx.arrCountry);
    const operatorNames = [ctx.oprId, ctx.operatorName]
      .map((v) => String(v || "").trim().toLowerCase())
      .filter(Boolean);
    const registration = String(ctx.registration || "").toUpperCase();
    const flightMs = ctx.startTimeUTC ? new Date(ctx.startTimeUTC).getTime() : NaN;

    const matched = [];
    for (const entry of this.activeEntries()) {
      const m = entry.match || {};
      const direction = m.direction || "any";
      // Overfly-scoped entries need route data the wall doesn't have.
      if (direction === "overfly") continue;
      const groups = [];

      if ((m.airportIcaos || []).length > 0) {
        const set = new Set(m.airportIcaos.map((v) => v.toUpperCase()));
        const depHit = direction !== "arr" && set.has(depIcao);
        const arrHit = direction !== "dep" && set.has(arrIcao);
        groups.push(depHit || arrHit);
      }
      if ((m.countries || []).length > 0) {
        const isoSet = new Set(m.countries.filter(isIsoCode).map((v) => v.trim().toUpperCase()));
        const nameSet = new Set(
          m.countries.filter((v) => !isIsoCode(v)).map(normalizeCountryName).filter(Boolean)
        );
        const depHit =
          direction !== "arr" &&
          ((depIso && isoSet.has(depIso)) || (depCountryName && nameSet.has(depCountryName)));
        const arrHit =
          direction !== "dep" &&
          ((arrIso && isoSet.has(arrIso)) || (arrCountryName && nameSet.has(arrCountryName)));
        groups.push(depHit || arrHit);
      }
      if ((m.operators || []).length > 0) {
        // Equality or containment either way, so the seed's display names
        // ("Panaviatic") match Leon operator names like "Panaviatic AS".
        const entryNames = m.operators.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
        groups.push(
          operatorNames.some((flightName) =>
            entryNames.some(
              (entryName) =>
                flightName === entryName ||
                (entryName.length >= 3 && flightName.includes(entryName)) ||
                (flightName.length >= 3 && entryName.includes(flightName))
            )
          )
        );
      }
      if ((m.registrations || []).length > 0) {
        const set = new Set(m.registrations.map((v) => v.toUpperCase()));
        groups.push(set.has(registration));
      }

      if (groups.length === 0) continue; // no criteria -> flags nothing
      if (!groups.every(Boolean)) continue;

      if (m.validFrom && Number.isFinite(flightMs) && flightMs < new Date(m.validFrom).getTime()) continue;
      if (m.validTo && Number.isFinite(flightMs) && flightMs > new Date(m.validTo).getTime()) continue;

      // Flight type + load gates (same convention as CAA: an UNKNOWN value
      // on the flight only ever matches "any").
      const isCommercial = typeof ctx.isCommercial === "boolean" ? ctx.isCommercial : null;
      const isFerry = typeof ctx.isFerry === "boolean" ? ctx.isFerry : null;
      if (entry.appliesTo === "commercial" && isCommercial !== true) continue;
      if (entry.appliesTo === "private" && isCommercial !== false) continue;
      if (entry.load === "pax" && isFerry !== false) continue;
      if (entry.load === "ferry" && isFerry !== true) continue;

      matched.push(entry);
    }
    return matched;
  }
}
