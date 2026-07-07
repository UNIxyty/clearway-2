// NOTAM keyword filter + validity parsing (OPS spec).
//
// The filter is a set of colored keyword GROUPS — `{group, color, terms[],
// patterns[]}` — editable at runtime through /api/alerts/rules. Terms match
// as whole tokens (case-insensitive); patterns are regex sources compiled
// with /i, used for the wildcard runway forms where the designator (and
// sometimes a long phrase) sits between RWY and the state word, possibly
// with no space after RWY. Patterns are bounded ([^.;\n]{0,80}) so a match
// never reaches across sentences of an E) field.

// Wildcard runway patterns — must catch all three real-world forms:
//   RWY06R/24L CLSD                          (no space after RWY)
//   RWY 06L/24R SHALL BE TEMPORARILY CLSD    (words between designator and CLSD)
//   RWY 11/29 CLSD                           (spaces, direct)
const RWY_DESIGNATOR = "RWY\\s*[0-9]{2}[LRC]?(?:/[0-9]{2}[LRC]?)?";
export const RWY_CLOSED_PATTERN = `${RWY_DESIGNATOR}[^.;\\n]{0,80}?\\b(?:CLSD|CLOSED)\\b`;
export const RWY_AVAILABLE_PATTERN = `${RWY_DESIGNATOR}[^.;\\n]{0,80}?\\b(?:AVBL|AVAILABLE)\\b`;
export const RWY_BARE_PATTERN = `\\b${RWY_DESIGNATOR}\\b`;
export const RUNWAY_BARE_PATTERN = "\\bRUNWAY\\s*[0-9]{2}[LRC]?\\b";

// Default OPS filter. "RESTRICITON" is intentional — the misspelling appears
// in real feeds.
export const DEFAULT_NOTAM_GROUPS = [
  {
    group: "Closure / prohibition",
    color: "#e5484d",
    terms: [
      "ADCLSD", "CLOSED", "CLSD", "CLOSED DUE TO WIP", "DANGER", "WIP",
      "WORK IN PROGRESS", "INOP", "NOT AVAILABLE", "NOT AVBL",
      "OUT OF SERVICE", "U/S", "UNSERVICEABLE", "UNSERVICEABLE DUE TO MAINT",
      "SUSPENDED", "PROHIBITED", "FORBIDDEN", "NOT ALLOWED",
      "AD NOT TO BE PLANNED", "AD NOT AVBL AS ALTN", "TWY CLOSED",
    ],
    patterns: [RWY_CLOSED_PATTERN],
  },
  {
    group: "Restriction / conditional",
    color: "#ea8a4e",
    terms: [
      "PPR", "SLOT", "SLOTS", "RESTRICTION", "RESTRICITON", "RESTRICTIONS",
      "CUSTOMS", "MANDATORY", "MILITARY", "ALT", "ALTERNATE", "ALTN", "DIV",
      "PARK", "PARKING", "PKG", "PKNG", "FUEL", "RFF",
    ],
    patterns: [],
  },
  {
    group: "Availability",
    color: "#16a34a",
    terms: ["AVAILABLE", "AVBL", "ACTIVE", "ACTIVATED"],
    patterns: [RWY_AVAILABLE_PATTERN],
  },
  {
    group: "Runway / taxiway / infra",
    color: "#2563eb",
    terms: ["RWY", "RUNWAY", "TWY"],
    patterns: [RWY_BARE_PATTERN, RUNWAY_BARE_PATTERN],
  },
  {
    group: "Other / info",
    color: "#6c7079",
    terms: [],
    patterns: [],
  },
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeNotamGroups(input) {
  const groups = Array.isArray(input) ? input : [];
  if (groups.length === 0) throw new Error("notamGroups needs at least one group.");
  return groups.map((raw) => {
    const group = String(raw?.group || "").trim();
    if (!group) throw new Error("Every keyword group needs a name.");
    const color = String(raw?.color || "#6c7079").trim();
    if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) throw new Error(`Invalid color for group "${group}": ${color}`);
    const terms = (Array.isArray(raw?.terms) ? raw.terms : []).map((v) => String(v).trim()).filter(Boolean);
    const patterns = (Array.isArray(raw?.patterns) ? raw.patterns : []).map((v) => String(v).trim()).filter(Boolean);
    for (const source of patterns) {
      try {
        new RegExp(source, "i");
      } catch {
        throw new Error(`Invalid regex in group "${group}": ${source}`);
      }
    }
    return { group, color, terms, patterns };
  });
}

/** Compile groups into testable matchers. */
export function compileNotamGroups(groups) {
  return (groups || []).map((g) => ({
    group: g.group,
    color: g.color,
    tests: [
      ...(g.terms || []).map((term) => ({
        label: term,
        regex: new RegExp(`(?:^|[^A-Z0-9])${escapeRegex(term)}(?:[^A-Z0-9]|$)`, "i"),
      })),
      ...(g.patterns || []).map((source) => ({
        label: `/${source.slice(0, 40)}${source.length > 40 ? "…" : ""}/`,
        regex: new RegExp(source, "i"),
      })),
    ],
  }));
}

/**
 * Match one NOTAM's text against compiled groups.
 * Returns [{ label, group, color }] — empty when nothing fires.
 */
export function matchNotamText(text, compiledGroups) {
  const hits = [];
  const value = String(text || "");
  for (const cg of compiledGroups) {
    for (const test of cg.tests) {
      if (test.regex.test(value)) hits.push({ label: test.label, group: cg.group, color: cg.color });
    }
  }
  return hits;
}

// ── Validity parsing (B)/C) fields) ─────────────────────────────────────────
// Formats seen in the feeds:
//   CrewBriefing raw: "2605041524" (YYMMDDHHmm, UTC), possibly with EST/PERM
//   SkyLink-style:    "2026-05-04 15:24 UTC"
// C) may be PERM / PERMANENT -> no expiry, always valid.

/** Parse a NOTAM date field. Returns ms epoch, the string "PERM", or null. */
export function parseNotamTime(raw) {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!value) return null;
  if (value.includes("PERM")) return "PERM";
  // Accept letter suffixes: "2608132359EST" (estimated) / "...CET" etc.
  const compact = value.match(/\b(\d{10})(?=[A-Z]|\b)/);
  if (compact) {
    const s = compact[1];
    const year = 2000 + Number(s.slice(0, 2));
    const ms = Date.UTC(year, Number(s.slice(2, 4)) - 1, Number(s.slice(4, 6)), Number(s.slice(6, 8)), Number(s.slice(8, 10)));
    return Number.isFinite(ms) ? ms : null;
  }
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (iso) {
    const ms = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4]), Number(iso[5]));
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Human-readable validity endpoint: "6 Jul 09:00Z" (year appended when it differs from the current one). */
export function formatNotamTime(parsed, nowMs = Date.now()) {
  if (parsed === "PERM") return "PERM";
  if (typeof parsed !== "number") return "—";
  const d = new Date(parsed);
  const year = d.getUTCFullYear() === new Date(nowMs).getUTCFullYear() ? "" : ` ${d.getUTCFullYear()}`;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year} ${hh}:${mm}Z`;
}

/**
 * A NOTAM is in-window when its [from, till] overlaps [fromMs, toMs].
 * PERM till = always valid. Unparseable endpoints widen the range (safe:
 * a NOTAM we can't date is shown rather than silently dropped).
 */
export function notamOverlapsWindow(notam, fromMs, toMs) {
  const from = parseNotamTime(notam?.startDateUtc);
  const till = parseNotamTime(notam?.endDateUtc);
  const f = typeof from === "number" ? from : -Infinity;
  if (till === "PERM") return true;
  const t = typeof till === "number" ? till : Infinity;
  return f <= toMs && t >= fromMs;
}

/** True when the NOTAM's C) time is parseable and in the past. */
export function notamExpired(notam, nowMs = Date.now()) {
  const till = parseNotamTime(notam?.endDateUtc);
  return typeof till === "number" && till < nowMs;
}

/**
 * Lifecycle relative to `nowMs`: an expired NOTAM must never be presented
 * as active; a future one may still be eligible when it overlaps the check
 * window. "unknown" = neither endpoint parseable (shown, not trusted).
 */
export function notamStatus(notam, nowMs = Date.now()) {
  const from = parseNotamTime(notam?.startDateUtc);
  const till = parseNotamTime(notam?.endDateUtc);
  if (typeof till === "number" && till < nowMs) return "expired";
  if (typeof from === "number" && from > nowMs) return "future";
  if (till === "PERM" || typeof from === "number" || typeof till === "number") return "active";
  return "unknown";
}
