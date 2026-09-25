// AIRAC calendar and the revision state of a cached AIP document.
//
// The rule that governs this file: UNKNOWN IS NOT CURRENT. A document is
// "current" only when the source gave us a revision AND we looked at the
// source during the cycle in force. Anything less is stated as unknown, with
// the reason, never rendered as though it were fine.

export type RevisionState = "current" | "future" | "superseded" | "unknown";

export const REVISION_WORDS: Record<RevisionState, string> = {
  current: "current",
  future: "not yet effective",
  superseded: "superseded",
  unknown: "revision unknown",
};

export type AipRevisionMeta = {
  icao: string | null;
  source: string | null;
  effectiveDate: string | null;
  airac: string | null;
  airacFlag: boolean | null;
  revisionSource: "ead-table" | "filename" | "none";
  sourceFilename: string | null;
  sourceUrl: string | null;
  sha256: string | null;
  bytes: number | null;
  fetchedAt: string | null;
  history?: { effectiveDate: string | null; airac: string | null; sha256: string | null; fetchedAt: string | null }[];
};

export type Revision = {
  state: RevisionState;
  words: string;
  /** "AIRAC 2610", "eff. 22 JAN 2026", or null */
  revision: string | null;
  effectiveFrom: string | null;
  validUntil: string | null;
  fetchedAt: string | null;
  /** Header chip text, e.g. "AIRAC 2610 · eff. 01 OCT 2026" / "AIRAC 2609 · superseded" / "revision unknown" */
  label: string;
  reason: string;
  /** For superseded copies: the id/key of the revision that replaced it, when we hold it. */
  supersededBy: string | null;
};

// 28-day cycles from a fixed epoch: 2026-01-22 is AIRAC 2601. ICAO Annex 15 §6.2.
const AIRAC_EPOCH_UTC = Date.UTC(2026, 0, 22);
const CYCLE_MS = 28 * 24 * 3600 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

function firstCycleOfYear(year: number): Date {
  let first = new Date(AIRAC_EPOCH_UTC);
  while (first.getUTCFullYear() < year) first = new Date(first.getTime() + CYCLE_MS);
  while (first.getUTCFullYear() > year) first = new Date(first.getTime() - CYCLE_MS);
  while (new Date(first.getTime() - CYCLE_MS).getUTCFullYear() === year) first = new Date(first.getTime() - CYCLE_MS);
  return first;
}

/** The cycle in force at `at`: { cycle: "2609", effectiveFrom: "2026-09-03", nextCycle: "2610", nextEffectiveFrom: "2026-10-01" }. */
export function airacAt(at: Date = new Date()) {
  const n = Math.floor((at.getTime() - AIRAC_EPOCH_UTC) / CYCLE_MS);
  const from = new Date(AIRAC_EPOCH_UTC + n * CYCLE_MS);
  const next = new Date(from.getTime() + CYCLE_MS);
  return { cycle: airacCycleLabel(from), effectiveFrom: isoDay(from), nextCycle: airacCycleLabel(next), nextEffectiveFrom: isoDay(next) };
}

export function airacCycleLabel(effectiveFrom: Date | string): string {
  const d = effectiveFrom instanceof Date ? effectiveFrom : new Date(`${effectiveFrom}T00:00:00Z`);
  const first = firstCycleOfYear(d.getUTCFullYear());
  return `${String(d.getUTCFullYear()).slice(2)}${pad(Math.round((d.getTime() - first.getTime()) / CYCLE_MS) + 1)}`;
}

/** "2601" when the date is exactly a cycle date, else null. */
export function airacForDate(effectiveDate: string | null): string | null {
  if (!effectiveDate) return null;
  const t = Date.parse(`${effectiveDate}T00:00:00Z`);
  if (Number.isNaN(t) || (t - AIRAC_EPOCH_UTC) % CYCLE_MS !== 0) return null;
  return airacCycleLabel(new Date(t));
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export function dayWords(day: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day ?? ""));
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(day ?? "");
}

/**
 * Revision state of a cached AIP copy from its sidecar.
 *
 * - no effectiveDate → unknown ("the source gave no revision")
 * - effectiveDate after today → future (a next-cycle publication)
 * - copy fetched before the cycle in force began → unknown ("not checked since AIRAC nnnn took effect"):
 *   the source may have amended it and we have not looked — that is not "current"
 * - otherwise → current (effective now, checked this cycle, nothing newer known)
 * - superseded → only when a newer copy replaced this one (history), which the resolve route reports
 *   for the previous revision a citation may still point at
 */
export function aipRevision(meta: AipRevisionMeta | null, now: Date = new Date()): Revision {
  const today = isoDay(now);
  const inForce = airacAt(now);
  const fetchedAt = meta?.fetchedAt ?? null;
  const effectiveFrom = meta?.effectiveDate ?? null;
  const revision = meta?.airac ? `AIRAC ${meta.airac}` : effectiveFrom ? `eff. ${dayWords(effectiveFrom)}` : null;
  let state: RevisionState; let reason: string;
  if (!meta) { state = "unknown"; reason = "no revision record for this copy"; }
  else if (!effectiveFrom) { state = "unknown"; reason = `the source gave no effective date (fetched ${fetchedAt ? dayWords(fetchedAt.slice(0, 10)) : "at an unknown time"})`; }
  else if (effectiveFrom > today) { state = "future"; reason = `effective from ${dayWords(effectiveFrom)}`; }
  else if (fetchedAt && fetchedAt.slice(0, 10) < inForce.effectiveFrom) { state = "unknown"; reason = `not checked against the source since AIRAC ${inForce.cycle} took effect ${dayWords(inForce.effectiveFrom)} (fetched ${dayWords(fetchedAt.slice(0, 10))})`; }
  else { state = "current"; reason = `checked ${fetchedAt ? dayWords(fetchedAt.slice(0, 10)) : "this cycle"}, nothing newer known`; }
  const label = revisionLabel({ revision, effectiveFrom, state, airac: meta?.airac ?? null });
  return { state, words: REVISION_WORDS[state], revision, effectiveFrom, validUntil: null, fetchedAt, label, reason, supersededBy: null };
}

export function revisionLabel({ revision, effectiveFrom, state, airac }: { revision: string | null; effectiveFrom: string | null; state: RevisionState; airac?: string | null }): string {
  if (state === "unknown" && !revision) return "revision unknown";
  const parts: string[] = [];
  if (airac) { parts.push(`AIRAC ${airac}`); if (effectiveFrom) parts.push(`eff. ${dayWords(effectiveFrom)}`); }
  else if (revision) parts.push(revision);
  if (state === "superseded") parts.push("superseded");
  else if (state === "future") parts.push("not yet effective");
  else if (state === "unknown") parts.push("not checked this cycle");
  return parts.join(" · ") || "revision unknown";
}

/** The revision a superseded copy had — for a citation that named the earlier revision. */
export function previousRevisions(meta: AipRevisionMeta | null): { revision: string | null; effectiveDate: string | null; airac: string | null; fetchedAt: string | null }[] {
  return (meta?.history ?? []).map((h) => ({ revision: h.airac ? `AIRAC ${h.airac}` : h.effectiveDate ? `eff. ${dayWords(h.effectiveDate)}` : null, effectiveDate: h.effectiveDate, airac: h.airac, fetchedAt: h.fetchedAt }));
}
