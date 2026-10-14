// Every time the portal shows is UTC, written one way, with a Z (docs/agent-design-spec.md §1):
//   07:42Z · 07:49:12Z (records of actions) · 23 SEP 18:10Z · 02 Sep 2026 (a day, no time).
// Never format a time in the reader's local zone: `rig/check-utc-times.mjs` (source) and `rig/utc-browser-check.mjs`
// (what a page shows) fail when something does.

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

type When = string | number | Date | null | undefined;

function toDate(v: When): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const sameUtcDay = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();

/** `18:10Z` */
export function hmZ(v: When): string {
  const d = toDate(v); if (!d) return "";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

/** `18:10:05Z` — seconds only on records of actions. */
export function hmsZ(v: When): string {
  const d = toDate(v); if (!d) return "";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

/** `23 SEP` — and `23 SEP 2025` when it is not this year (UTC). */
export function dayZ(v: When, now: Date = new Date()): string {
  const d = toDate(v); if (!d) return "";
  const year = d.getUTCFullYear() === now.getUTCFullYear() ? "" : ` ${d.getUTCFullYear()}`;
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}${year}`;
}

/** `23 SEP 18:10Z` — or just `18:10Z` when it is today (UTC), unless `alwaysDate`. `seconds` adds `:05`. */
export function dayTimeZ(v: When, { alwaysDate = false, seconds = false }: { alwaysDate?: boolean; seconds?: boolean } = {}): string {
  const d = toDate(v); if (!d) return "";
  const now = new Date();
  const t = seconds ? hmsZ(d) : hmZ(d);
  return sameUtcDay(d, now) && !alwaysDate ? t : `${dayZ(d, now)} ${t}`;
}

/** `02 Sep 2026` — a day with no time. */
export function dateLong(v: When): string {
  const d = toDate(v); if (!d) return "";
  const m = MONTHS[d.getUTCMonth()];
  return `${pad(d.getUTCDate())} ${m[0]}${m.slice(1).toLowerCase()} ${d.getUTCFullYear()}`;
}

/** True when the instant falls on today's UTC date. */
export function isTodayUtc(v: When): boolean {
  const d = toDate(v); return Boolean(d && sameUtcDay(d, new Date()));
}
