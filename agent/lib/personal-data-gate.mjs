// One door to a passenger's personal data (2026-11-02). Every route that hands a passenger's personal data out unmasked
// comes through here: the intake reveal (text), the request's attachments (a passport scan, a passenger list), the
// original email (.eml, every attachment in it), the flight passenger reveal and the mailbox reveal. Until 2026-11-02 the
// text needed the reveal permission, a limit and a row, while the scan of the same passport needed only the agent
// allowlist: the permission was decoration. rig/personal-data-paths-check.mjs lists the paths; add a new one there.
//
// What it checks, in this order, the same for every path:
//   1. the permission — intake.people.reveal for staff (or the mailbox's own, for its reveal), the documents level for
//      a client;
//   2. one rate-limit bucket per person: every reveal row of every path in the last 10 minutes counts;
//   3. one audit row per opening: who, when, which request / message / flight, which path — never a name, a document
//      number, a date of birth or a file's contents.
import { audit, auditOrThrow } from "./store.mjs";
import { rest } from "./knowledge/retrieval.mjs";
import { can } from "../../lib/permissions/grants.mjs";

export const WINDOW_MS = 10 * 60_000;
export const REVEAL_LIMIT = 40;         // staff, per person per window, all paths together (decided 2026-10-20)
export const CLIENT_REVEAL_LIMIT = 15;  // a client checks their own passengers, not a manifest a day
const KINDS = ["intake.personal_revealed", "mailbox.personal_revealed"];

/** The reveal rows of this person in the window, every path counted; the flights among them (for the burst signal). */
export async function recentReveals(user) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  let rows = null;
  try { rows = await rest(`agent_audit_log?select=detail,created_at&kind=in.(${KINDS.join(",")})&actor_id=eq.${encodeURIComponent(user.userId)}&created_at=gt.${encodeURIComponent(since)}&order=created_at.desc&limit=500`); } catch { rows = null; }
  // fail closed: no count, no reveal (the detail of a failed read stays out of the answer)
  if (!Array.isArray(rows)) throw Object.assign(new Error("Personal data can't be shown right now: the view count could not be checked. Try again in a minute."), { status: 503 });
  const flights = new Set(); for (const r of rows) if (r.detail?.flightId) flights.add(r.detail.flightId);
  return { count: rows.length, flights: [...flights], since };
}

/**
 * May this person open this personal data now? Returns { ok: true, recent, record(detail) } or { ok: false, status,
 * message, permission? }. `record` writes the one audit row: call it after the data is read and before it is sent.
 * `what`: "text" | "attachment" | "mail" | "passenger" | "mailbox" — which path, for the row.
 */
export async function personalDataGate(user, { what, permission = "intake.people.reveal", client = null, detail = {} }) {
  const allowed = client ? client.passengerLevel === "documents" : await can(user.agentRole, permission);
  if (!allowed) return client ? { ok: false, status: 404, message: "That is not on your account." } : { ok: false, status: 403, message: "You don't have permission to see passengers' personal data.", permission };
  const limit = client ? CLIENT_REVEAL_LIMIT : REVEAL_LIMIT;
  const recent = await recentReveals(user);
  if (recent.count >= limit) {
    await audit({ kind: "intake.personal_reveal_limited", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: false, confirmationStatus: "not_required", detail: { what, ...detail, count: recent.count, windowMin: WINDOW_MS / 60_000 } }).catch(() => {});
    return { ok: false, status: 429, message: `That is ${recent.count} views of personal data in 10 minutes. Wait a few minutes, then carry on; this stop is logged.` };
  }
  // The row is written BEFORE the data is sent, and a row that cannot be written stops the reveal (fail closed): an
  // opening nobody can see afterwards would also be one the limit never counted.
  const record = async (extra = {}) => {
    try { await auditOrThrow({ kind: what === "mailbox" ? "mailbox.personal_revealed" : "intake.personal_revealed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { what, ...detail, ...extra, viewsInWindow: recent.count + 1 } }); }
    catch { throw Object.assign(new Error("The view could not be logged, so it was not shown. Try again in a minute."), { status: 503 }); }
  };
  return { ok: true, recent, record };
}
