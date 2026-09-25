// Revision state of a document — the one place that decides whether what a
// dispatcher is reading is current.
//
// The rule that governs everything here: UNKNOWN IS NOT CURRENT. A document
// with no revision data says so; it never renders as current, and a blank
// field is never read as "fine".
//
// Four states, all distinguishable:
//   current     effective now, nothing newer known
//   future      published, effective from a later date (a future AIRAC)
//   superseded  a newer revision exists, or the validity has ended
//   unknown     we have no revision data for this document
//
// Data comes from columns that already exist (agent_documents.version,
// effective_date; agent_tier1_records.version/effective_date/expires_date/
// superseded_by) plus the ones docs/supabase-agent-revisions.sql adds
// (valid_until, superseded_by, revision_source). The extra columns are
// feature-detected so the service runs — with less information, never with a
// guessed revision — until that SQL has been run.

// retrieval.mjs is imported lazily: the tool registry loads this module while retrieval's own
// import graph is still evaluating, and a static import would form a cycle (TDZ on the schema).
const rest = async (...args) => (await import("./retrieval.mjs")).rest(...args);

export const REVISION_STATES = ["current", "future", "superseded", "unknown"];

/** Words for each state — used by the tools, the viewer and the answer. */
export const REVISION_WORDS = {
  current: "current",
  future: "not yet effective",
  superseded: "superseded",
  unknown: "revision unknown",
};

// ── AIRAC calendar ──────────────────────────────────────────────────────────
// AIRAC cycles are 28 days from a fixed epoch. 2026-01-22 is AIRAC 2601 (the
// first effective date of 2026); cycles are numbered per calendar year of the
// first effective date, 13 per year. Source: ICAO Annex 15 §6.2 (AIRAC).
const AIRAC_EPOCH_UTC = Date.UTC(2026, 0, 22); // 2026-01-22
const CYCLE_MS = 28 * 24 * 3600 * 1000;

function utcDate(y, m, d) { return new Date(Date.UTC(y, m, d)); }
function isoDate(d) { return d.toISOString().slice(0, 10); }

/** The AIRAC cycle effective at `at` (default now): { cycle: "2609", effectiveFrom, nextEffectiveFrom, nextCycle }. */
export function airacAt(at = new Date()) {
  const t = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const n = Math.floor((t - AIRAC_EPOCH_UTC) / CYCLE_MS);
  const from = new Date(AIRAC_EPOCH_UTC + n * CYCLE_MS);
  const next = new Date(from.getTime() + CYCLE_MS);
  return { cycle: airacCycleLabel(from), effectiveFrom: isoDate(from), nextCycle: airacCycleLabel(next), nextEffectiveFrom: isoDate(next) };
}

/** "2610" for an effective date: YY + ordinal within the year (13 per year). */
export function airacCycleLabel(effectiveFrom) {
  const d = effectiveFrom instanceof Date ? effectiveFrom : new Date(effectiveFrom);
  const year = d.getUTCFullYear();
  // Count 28-day steps since the first effective date in that year.
  let first = new Date(AIRAC_EPOCH_UTC);
  while (first.getUTCFullYear() < year) first = new Date(first.getTime() + CYCLE_MS);
  while (first.getUTCFullYear() > year) first = new Date(first.getTime() - CYCLE_MS);
  // `first` is now the first cycle date that falls in `year` (it may still be one step off after the loops).
  while (new Date(first.getTime() - CYCLE_MS).getUTCFullYear() === year) first = new Date(first.getTime() - CYCLE_MS);
  const ordinal = Math.round((d.getTime() - first.getTime()) / CYCLE_MS) + 1;
  return `${String(year).slice(2)}${String(ordinal).padStart(2, "0")}`;
}

/** Effective date of an AIRAC cycle label ("2610" → "2026-10-01"), or null if malformed. */
export function airacEffectiveDate(cycle) {
  const m = /^(\d{2})(\d{2})$/.exec(String(cycle ?? "").trim());
  if (!m) return null;
  const year = 2000 + Number(m[1]), ordinal = Number(m[2]);
  if (ordinal < 1 || ordinal > 14) return null;
  let first = new Date(AIRAC_EPOCH_UTC);
  while (first.getUTCFullYear() < year) first = new Date(first.getTime() + CYCLE_MS);
  while (first.getUTCFullYear() > year) first = new Date(first.getTime() - CYCLE_MS);
  while (new Date(first.getTime() - CYCLE_MS).getUTCFullYear() === year) first = new Date(first.getTime() - CYCLE_MS);
  return isoDate(new Date(first.getTime() + (ordinal - 1) * CYCLE_MS));
}

// ── State machine ───────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
function asDay(v) { if (!v) return null; const s = String(v); if (!DATE_RE.test(s)) return null; return s.slice(0, 10); }

/**
 * Decide the state of one document from its own fields.
 *
 * @param {object} fields  { version, effectiveDate, validUntil, supersededBy, airac }
 * @param {object} [opts] { today: "YYYY-MM-DD" }
 * @returns {{ state, revision, effectiveFrom, validUntil, supersededBy, label, words, reason }}
 */
export function revisionState(fields = {}, { today = isoDate(new Date()) } = {}) {
  const airac = fields.airac ? String(fields.airac).trim() : null;
  const version = fields.version ? String(fields.version).trim() : null;
  const effectiveFrom = asDay(fields.effectiveDate) ?? (airac ? airacEffectiveDate(airac) : null);
  const validUntil = asDay(fields.validUntil);
  const supersededBy = fields.supersededBy ?? null;
  const revision = airac ? `AIRAC ${airac}` : version ? (/^v/i.test(version) ? version : `v${version}`) : null;

  let state, reason;
  if (supersededBy) { state = "superseded"; reason = "a newer revision exists"; }
  else if (validUntil && validUntil < today) { state = "superseded"; reason = `validity ended ${validUntil}`; }
  else if (effectiveFrom && effectiveFrom > today) { state = "future"; reason = `effective from ${effectiveFrom}`; }
  else if (revision || effectiveFrom) { state = "current"; reason = "effective now, nothing newer known"; }
  else { state = "unknown"; reason = "no revision data for this document"; }

  // For AIP documents the cycle calendar itself supersedes: a cycle older than the one in force is
  // superseded even when nothing points at the newer file (the newer cycle exists by definition).
  if (state === "current" && airac) {
    const inForce = airacAt(new Date(`${today}T12:00:00Z`));
    if (airac < inForce.cycle) { state = "superseded"; reason = `AIRAC ${inForce.cycle} took effect ${inForce.effectiveFrom}`; }
  }

  const label = revisionLabel({ revision, effectiveFrom, validUntil, state });
  return { state, revision, effectiveFrom, validUntil, supersededBy, label, words: REVISION_WORDS[state], reason };
}

/** Header chip text: "AIRAC 2610 · eff. 01 OCT 2026", "v3 · eff. 18 SEP 2026", "AIRAC 2609 · superseded", "revision unknown". */
export function revisionLabel({ revision, effectiveFrom, validUntil, state }) {
  if (state === "unknown") return "revision unknown";
  const parts = [];
  if (revision) parts.push(revision);
  if (state === "superseded") parts.push("superseded");
  else if (state === "future") parts.push(`not yet effective · from ${dayWords(effectiveFrom)}`);
  else if (effectiveFrom) parts.push(`eff. ${dayWords(effectiveFrom)}`);
  if (validUntil && state !== "superseded") parts.push(`until ${dayWords(validUntil)}`);
  return parts.join(" · ") || "revision unknown";
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export function dayWords(day) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day)); if (!m) return String(day); return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`; }

// ── Column feature detection ────────────────────────────────────────────────
// docs/supabase-agent-revisions.sql adds valid_until / superseded_by /
// revision_source to agent_documents. Until it has been run the service reads
// the columns that exist and reports what it cannot know as unknown.

let revisionColumnsPromise = null;
export function hasRevisionColumns() {
  if (!revisionColumnsPromise) {
    revisionColumnsPromise = rest("agent_documents?select=id,valid_until,superseded_by,revision_source&limit=1")
      .then(() => true)
      .catch((error) => { process.stderr.write(`[revision] agent_documents has no revision columns yet (run docs/supabase-agent-revisions.sql): ${String(error?.message ?? error).slice(0, 80)}\n`); return false; });
  }
  return revisionColumnsPromise;
}
/** Test hook: forget the cached detection (e.g. after the SQL has been run). */
export function resetRevisionColumns() { revisionColumnsPromise = null; }

/** The select list for agent_documents that includes what exists. */
export async function documentSelect(base = "*") {
  return (await hasRevisionColumns()) ? base : base; // `*` already covers whatever exists; kept for callers that list columns
}

// ── Knowledge-base documents ────────────────────────────────────────────────

/**
 * Revision state for a knowledge-base document row, taking the newer sibling
 * into account: a later approved/indexed revision of the same title from the
 * same source supersedes this one, even before superseded_by is set.
 *
 * @param {object} row    agent_documents row
 * @param {object[]} [siblings]  other agent_documents rows to compare against (same title + source)
 */
export function documentRevision(row, siblings = [], opts = {}) {
  const base = { version: row.version, effectiveDate: row.effective_date, validUntil: row.valid_until ?? null, supersededBy: row.superseded_by ?? null };
  let supersededBy = base.supersededBy;
  if (!supersededBy && (row.effective_date || row.version)) {
    const newer = siblings.filter((s) => s.id !== row.id && sameFamily(row, s) && ["approved", "indexed"].includes(s.status) && isNewer(s, row));
    if (newer.length) supersededBy = newer.sort((a, b) => cmpRevision(b, a))[0].id;
  }
  const r = revisionState({ ...base, supersededBy }, opts);
  return { ...r, currentId: supersededBy ?? null };
}

function norm(s) { return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " "); }
export function sameFamily(a, b) { return norm(a.title) === norm(b.title) && norm(a.source) === norm(b.source); }
function isNewer(a, b) { return cmpRevision(a, b) > 0; }
function cmpRevision(a, b) {
  const da = asDay(a.effective_date), db = asDay(b.effective_date);
  if (da && db && da !== db) return da < db ? -1 : 1;
  const va = versionNumber(a.version), vb = versionNumber(b.version);
  if (va != null && vb != null && va !== vb) return va - vb;
  return 0;
}
function versionNumber(v) { const m = /(\d+(?:\.\d+)?)/.exec(String(v ?? "")); return m ? Number(m[1]) : null; }

/** Load the sibling rows for a document (same title + source), cheap enough per request. */
export async function loadSiblings(row) {
  if (!row?.title) return [];
  try {
    const rows = await rest(`agent_documents?title=ilike.${encodeURIComponent(String(row.title).replace(/[%_]/g, ""))}&select=id,title,source,version,effective_date,status,created_at`);
    return (rows ?? []).filter((s) => s.id !== row.id);
  } catch { return []; }
}

/** One-line note the agent puts NEXT TO a claim drawn from a document that is not current. Null when current. */
export function revisionNotice(rev, { name } = {}) {
  if (!rev || rev.state === "current") return null;
  const who = name ? `${name}` : "This document";
  if (rev.state === "superseded") return `${who} is ${rev.revision ?? "an older revision"}, which has been superseded${rev.reason ? ` (${rev.reason})` : ""}. Check the current revision before acting on it.`;
  if (rev.state === "future") return `${who} is ${rev.revision ?? "a revision"} that is not yet effective${rev.effectiveFrom ? ` (effective ${dayWords(rev.effectiveFrom)})` : ""}. It does not apply today.`;
  return `${who} has no revision data — it is not known whether it is current.`;
}

// ── Tool-facing helpers ─────────────────────────────────────────────────────

/** JSON schema for the `revision` object every document tool returns. */
export const REVISION_SCHEMA = {
  type: ["object", "null"],
  properties: {
    state: { type: "string", enum: REVISION_STATES, description: "current | future (not yet effective) | superseded | unknown. Unknown is NOT current." },
    words: { type: "string" },
    label: { type: "string", description: "e.g. AIRAC 2610 · eff. 01 OCT 2026 / v3 · superseded / revision unknown" },
    revision: { type: ["string", "null"] },
    effectiveFrom: { type: ["string", "null"] },
    validUntil: { type: ["string", "null"] },
    fetchedAt: { type: ["string", "null"] },
    reason: { type: "string" },
    supersededBy: { type: ["string", "null"] },
  },
};

/** Normalise what the portal's resolve/exists routes return (lib/airac.ts Revision) — or unknown when absent. */
export function revisionFromPortal(rev, cached = true) {
  if (!cached) return { state: "unknown", words: REVISION_WORDS.unknown, label: "revision unknown", revision: null, effectiveFrom: null, validUntil: null, fetchedAt: null, reason: "no cached copy — the revision is known once the document has been fetched", supersededBy: null };
  if (!rev || !REVISION_STATES.includes(rev.state)) return { state: "unknown", words: REVISION_WORDS.unknown, label: "revision unknown", revision: null, effectiveFrom: null, validUntil: null, fetchedAt: null, reason: "no revision record for this copy", supersededBy: null };
  return { state: rev.state, words: rev.words ?? REVISION_WORDS[rev.state], label: rev.label ?? REVISION_WORDS[rev.state], revision: rev.revision ?? null, effectiveFrom: rev.effectiveFrom ?? null, validUntil: rev.validUntil ?? null, fetchedAt: rev.fetchedAt ?? null, reason: rev.reason ?? "", supersededBy: rev.supersededBy ?? null, previous: rev.previous ?? [] };
}

/** Strip a revision to what the tool result / source chip carries. */
export function publicRevision(r) {
  if (!r) return null;
  return { state: r.state, words: r.words, label: r.label, revision: r.revision ?? null, effectiveFrom: r.effectiveFrom ?? null, validUntil: r.validUntil ?? null, fetchedAt: r.fetchedAt ?? null, reason: r.reason ?? "", supersededBy: r.supersededBy ?? r.currentId ?? null };
}

/**
 * Attach `revision` to every knowledge hit (tier 1 and tier 2) from its document row.
 * One batch read for the documents, one for their siblings. A hit whose document
 * cannot be read gets state unknown — not current.
 */
export async function attachDocumentRevisions(hits, opts = {}) {
  const ids = [...new Set(hits.map((h) => h.documentId).filter(Boolean))];
  let docs = [];
  if (ids.length) {
    try { docs = await rest(`agent_documents?id=in.(${ids.map(encodeURIComponent).join(",")})&select=*`); } catch (error) { process.stderr.write(`[revision] document read failed: ${String(error?.message ?? error).slice(0, 100)}\n`); }
  }
  const byId = new Map((docs ?? []).map((d) => [d.id, d]));
  const titles = [...new Set((docs ?? []).map((d) => d.title).filter(Boolean))];
  let siblings = [];
  if (titles.length) {
    try { siblings = await rest(`agent_documents?title=in.(${titles.map((t) => `"${encodeURIComponent(String(t).replace(/"/g, ""))}"`).join(",")})&select=id,title,source,version,effective_date,status,created_at`); } catch { siblings = []; }
  }
  for (const h of hits) {
    const d = h.documentId ? byId.get(h.documentId) : null;
    h.revision = d ? publicRevision(documentRevision(d, siblings ?? [], opts)) : { state: "unknown", words: REVISION_WORDS.unknown, label: "revision unknown", revision: null, effectiveFrom: null, validUntil: null, fetchedAt: null, reason: h.documentId ? "the document record could not be read" : "the record is not linked to a document", supersededBy: null };
  }
  return hits;
}

const STATE_RANK = { current: 0, future: 1, unknown: 2, superseded: 3 };
/**
 * Retrieval prefers current revisions: within a tier, current first, then not-yet-effective,
 * then unknown, then superseded; and a superseded document is dropped from tier 2 when a
 * current document of the same family is also in the results (it would only repeat old text).
 */
export function preferCurrent(hits, { dropSuperseded = true } = {}) {
  const currentFamilies = new Set(hits.filter((h) => h.revision?.state === "current").map((h) => h.documentId));
  // Tier 1 (approved text) is never dropped: the strictest rule wants it shown word for word AND flagged.
  const kept = dropSuperseded ? hits.filter((h) => !(h.revision?.state === "superseded" && h.revision?.supersededBy && currentFamilies.has(h.revision.supersededBy))) : hits;
  return kept.sort((a, b) => (STATE_RANK[a.revision?.state ?? "unknown"] - STATE_RANK[b.revision?.state ?? "unknown"]) || ((b.rerankScore ?? b.score ?? 0) - (a.rerankScore ?? a.score ?? 0)));
}

/** Notes for the model about hits that are not current. */
export function revisionNotesFor(hits, { authoritative = false } = {}) {
  const notes = [];
  for (const h of hits) {
    const r = h.revision; if (!r || r.state === "current") continue;
    const name = h.title ?? h.source ?? "the document";
    if (r.state === "superseded") notes.push(`"${name}" (${r.label}) is SUPERSEDED${authoritative ? " — its approved wording may no longer match the current document; say so next to the quote" : "; a newer revision exists — say so next to any claim from it"}.`);
    else if (r.state === "future") notes.push(`"${name}" (${r.label}) is NOT YET EFFECTIVE — say from when it applies.`);
    else notes.push(`"${name}" has no revision data — say its revision is unknown; do not call it current.`);
  }
  return [...new Set(notes)];
}
