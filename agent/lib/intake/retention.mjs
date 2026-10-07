// Retention for intake data that can hold personal data: the raw .eml, attachment files, and the extracted
// crew/pax identities. The period is a SETTING (agent_settings row `intake:retention`, days in `reason`),
// default 90 days, because the real period needs sign-off. It runs from the LATER of the message's arrival and its
// request's last flight (2026-10-07): the passenger manifest fills its rows from this record, so a request for a flight
// two months out must still hold its passengers on the day of the flight and for the period after it. The sweep:
//   - deletes the raw .eml of every message older than the period and marks it purged;
//   - deletes an attachment file only when no message still kept references the same content
//     (files are shared by hash — a GenDec that arrived yesterday keeps the file a 100-day-old copy also used);
//   - clears `intake_extractions.personal` for those requests.
// Message rows, request rows and non-personal extracted fields (airports, times, counts) stay: they are the
// operational record, and they carry no identities.
import { rest } from "../knowledge/retrieval.mjs";
import { deleteKey } from "./blobstore.mjs";

export const DEFAULT_RETENTION_DAYS = 90;

export async function retentionDays() {
  const row = (await rest("agent_settings?id=eq.intake:retention&select=reason").catch(() => []))?.[0];
  const n = Number(row?.reason);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_RETENTION_DAYS;
}
export async function setRetentionDays(days, user) {
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n < 1 || n > 3650) throw new Error("Retention must be between 1 and 3650 days.");
  await rest("agent_settings?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: "intake:retention", enabled: true, reason: String(n), updated_at: new Date().toISOString(), updated_by_email: user?.email ?? null }]) });
  return n;
}

/** The last scheduled departure of a request's legs (ISO), or null. */
export function lastFlightOf(review) {
  const t = (review?.legs ?? []).filter((l) => !l.removed).map((l) => l.fields?.find((f) => f.key === "std")?.utc).filter(Boolean).map((x) => Date.parse(x)).filter(Number.isFinite);
  return t.length ? new Date(Math.max(...t)).toISOString() : null;
}
/** When a message's personal data goes: `days` after the later of its arrival and its request's last flight. */
export function deleteAtFor(receivedAt, review, days) {
  const last = lastFlightOf(review);
  return new Date(Math.max(Date.parse(receivedAt), last ? Date.parse(last) : 0) + days * 86_400_000);
}

/** One sweep. Returns counts; never logs content or names. */
export async function sweep({ now = Date.now(), dryRun = false } = {}) {
  const days = await retentionDays();
  const cutoff = new Date(now - days * 86_400_000).toISOString();
  const expired = (await rest(`intake_messages?select=id,raw_key,received_at&purged_at=is.null&received_at=lt.${encodeURIComponent(cutoff)}&limit=500`)) ?? [];
  const out = { days, cutoff, messages: 0, keptForFlight: 0, rawDeleted: 0, filesDeleted: 0, filesKept: 0, personalCleared: 0, dryRun };
  for (const m of expired) {
    // A request whose last flight is later than its arrival keeps its data until `days` after that flight.
    const rq = (await rest(`intake_requests?select=review&message_id=eq.${m.id}`).catch(() => [])) ?? [];
    if (rq.some((r) => deleteAtFor(m.received_at, r.review, days).getTime() > now)) { out.keptForFlight += 1; continue; }
    out.messages += 1;
    const atts = (await rest(`intake_attachments?select=id,sha256,storage_key&message_id=eq.${m.id}&purged_at=is.null`)) ?? [];
    for (const a of atts) {
      // Still referenced by a message not (yet) purged — inside the period, or kept for its flight? Then the shared
      // file stays; the last message to go takes it.
      const live = (await rest(`intake_attachments?select=id,intake_messages!inner(received_at,purged_at)&sha256=eq.${a.sha256}&id=neq.${a.id}&intake_messages.purged_at=is.null&limit=1`).catch(() => [])) ?? [];
      if (live.length) out.filesKept += 1;
      else { if (!dryRun && (await deleteKey(a.storage_key))) out.filesDeleted += 1; }
      if (!dryRun) await rest(`intake_attachments?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ purged_at: new Date(now).toISOString() }) });
    }
    if (m.raw_key && !dryRun && (await deleteKey(m.raw_key))) out.rawDeleted += 1;
    const reqs = (await rest(`intake_requests?select=id&message_id=eq.${m.id}`)) ?? [];
    for (const r of reqs) if (!dryRun) { const cleared = await rest(`intake_extractions?request_id=eq.${r.id}&personal=not.is.null`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ personal: null }) }); out.personalCleared += Array.isArray(cleared) ? cleared.length : 0; }
    if (!dryRun) await rest(`intake_messages?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify({ purged_at: new Date(now).toISOString(), raw_key: null }) });
  }
  return out;
}
