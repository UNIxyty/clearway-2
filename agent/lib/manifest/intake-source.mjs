// Passenger Manifest — our own record of a flight's passengers, for a flight our flight intake created in Leon.
//
// Leon holds an intake-created flight's passengers only as its text list (intake/leon-people.mjs: Leon's structured
// list takes address-book contacts only, and the agent creates none). The rows a person confirmed on the intake review
// screen are in intake_extractions.personal; this returns them for the leg that became `nid`. Read-only; nothing here
// is logged. Precedence (model.mjs): Leon's structured records, then this record, then blank rows.
import { rest } from "../knowledge/retrieval.mjs";
import { leonOperator } from "../intake/leon-client.mjs";
import { peopleForLeg } from "../intake/leon-people.mjs";

/**
 * → null when our intake did not create this flight, else
 *   { reference, legIndex, purged, passengers: [person…], crewCount: number|null, written: { sha, at } | null }
 * `written` is the last passenger-list write Leon confirmed (hash of the text and count it was given).
 */
export async function intakeRecordFor(oprId, nid) {
  if (String(oprId) !== leonOperator()) return null; // the intake writes to one Leon account only
  const w = (await rest(`intake_leon_writes?select=request_id,leg_index&leon_flight_nid=eq.${Number(nid)}&state=eq.in_leon&order=updated_at.desc&limit=1`))?.[0];
  if (!w) return null;
  const r = (await rest(`intake_requests?select=id,reference,current_extraction_id,review&id=eq.${w.request_id}`))?.[0];
  if (!r) return null;
  const ex = r.current_extraction_id ? (await rest(`intake_extractions?select=personal&id=eq.${r.current_extraction_id}`))?.[0] : null;
  const people = ex?.personal?.people ?? null;
  const written = (await rest(`intake_leon_people_writes?select=content_sha256,updated_at&request_id=eq.${r.id}&leg_index=eq.${w.leg_index}&kind=eq.pax&state=eq.in_leon&order=updated_at.desc&limit=1`).catch(() => []))?.[0] ?? null;
  const leg = (r.review?.legs ?? []).find((l) => l.index === w.leg_index);
  const crewField = leg?.fields?.find((f) => f.key === "crewCount");
  const { pax, crew } = people ? peopleForLeg(people, w.leg_index) : { pax: [], crew: [] };
  const stated = /^\d+$/.test(String(crewField?.value ?? "")) ? Number(crewField.value) : null;
  return {
    reference: r.reference, legIndex: w.leg_index, purged: !people,
    passengers: pax, crewCount: stated ?? (crew.length || null),
    written: written ? { sha: written.content_sha256, at: written.updated_at } : null,
  };
}
