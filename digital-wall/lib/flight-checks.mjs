// Per-FLIGHT acknowledgements for the timeline info tab (bug report item 1):
// ops expand a flight's tab, read its IMP / NOTAM / WX / CAA content, and
// press "Checked" — the corresponding indicator disappears FOR THAT FLIGHT
// only. Each ack is per type, stamped with who/when (the IMP/CAA
// confirmedAt/confirmedBy pattern), and lives for ONE check cycle: the same
// cadence as the daily NOTAM check (a cycle runs from one 10:00-Riga
// boundary to the next, so a new day's flights flag again after the daily
// run — mirrored from notam-check, not invented).

import { JsonFileStore } from "./json-store.mjs";
import { zonedNow } from "./notam-check.mjs";

export const CHECK_TYPES = ["imp", "ntm", "wx", "caa"];

function checkHour() {
  const parsed = Number(process.env.NOTAM_CHECK_HOUR);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 10;
}

/** The identity of the current check cycle: the Riga day of its 10:00 start. */
export function currentCycleDay() {
  const { day, hour } = zonedNow();
  if (hour >= checkHour()) return day;
  // Before today's run the previous day's cycle is still current.
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export class FlightChecksStore {
  constructor() {
    this.store = new JsonFileStore("flight-checks.json", { checks: {} });
    this.checks = {}; // "<oprId>:<flightNid>" -> { imp: {at, by, cycle}, ... }
    this.loaded = false;
  }

  async load() {
    const payload = await this.store.read();
    this.checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};
    this.loaded = true;
    return this.checks;
  }

  async persist() {
    // Expired acks (older cycles) are pruned on write so the file never
    // grows unboundedly.
    const cycle = currentCycleDay();
    for (const [key, entry] of Object.entries(this.checks)) {
      for (const type of Object.keys(entry)) {
        if (entry[type]?.cycle !== cycle) delete entry[type];
      }
      if (Object.keys(entry).length === 0) delete this.checks[key];
    }
    await this.store.write({ checks: this.checks, updatedAt: new Date().toISOString() });
  }

  /** Valid (current-cycle) acks for one flight: { imp: {at, by}, ... }. */
  statusFor(flightKey) {
    const entry = this.checks[String(flightKey)] ?? null;
    if (!entry) return {};
    const cycle = currentCycleDay();
    const out = {};
    for (const type of CHECK_TYPES) {
      if (entry[type] && entry[type].cycle === cycle) {
        out[type] = { at: entry[type].at, by: entry[type].by ?? null };
      }
    }
    return out;
  }

  /** Set (checked=true) or clear per-type acks. types: subset of CHECK_TYPES. */
  async setChecked(flightKey, types, { actor = null, checked = true } = {}) {
    const key = String(flightKey || "").trim();
    if (!key) throw new Error("flight key is required");
    const wanted = (Array.isArray(types) ? types : [types])
      .map((t) => String(t || "").toLowerCase())
      .filter((t) => CHECK_TYPES.includes(t));
    if (wanted.length === 0) throw new Error(`types must be among: ${CHECK_TYPES.join(", ")}`);
    if (!this.checks[key]) this.checks[key] = {};
    const cycle = currentCycleDay();
    for (const type of wanted) {
      if (checked) {
        this.checks[key][type] = { at: new Date().toISOString(), by: actor, cycle };
      } else {
        delete this.checks[key][type];
      }
    }
    await this.persist();
    return this.statusFor(key);
  }
}
