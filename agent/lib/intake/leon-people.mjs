// Passengers and crew to Leon, after a leg's flight exists. Every value is the request's own, as the review holds it
// (intake_extractions.personal.people); nothing is invented, reformatted or completed.
//
// What Leon's API takes (live schema, cwy-cwy, 2026-10-07):
//   Passengers — the structured list (passengerList.savePassengerList / addPassengersToList) takes ONLY references to
//     contacts that already exist in the operator's Leon address book (PassengerContactInput.contactNid: Int!). An
//     ad-hoc passenger exists only as Leon's free-text passenger list: passengerList.savePassengerText(flightNid,
//     { count, text }) — the flight's own passenger list in Leon, data source "text". That is what is written here.
//     Creating address-book contacts for one-off charter passengers is NOT done: it is a decision for ops, not code.
//   Crew — Leon assigns crew to a flight only by its own crew-member id (crewPanel.crew.assign: loginNid), and a crew
//     member exists only as a full Leon user record (crewMember.create). The agent creates none. There is no crew-count
//     field on FlightCreate / FlightUpdate (Flight.crewProperty counts are derived from assignments). So the operator's
//     crew — names and details as the request gave them, and the count — go into the flight's OPS notes, under a
//     heading that says they are the operator's crew per the request and NOT assigned in Leon.
//
// Each write follows the rule of every Leon write: the attempt is recorded (intake_leon_people_writes, state 'sending')
// BEFORE the call, then the outcome. The row holds a hash and a count — never a name, date or document number — and so
// do the audit rows. A row still 'sending' after a restart becomes 'unknown'; nothing is retried automatically.
import { createHash } from "node:crypto";
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { leonGraphql } from "./leon-client.mjs";
import { personalTokens, scrubString } from "./personal.mjs";

export const KINDS = ["pax", "crew"];
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const timeout = () => ({ timeoutMs: Number(process.env.INTAKE_LEON_TIMEOUT_MS || 30000) });
const clean = (v) => (v == null ? "" : String(v).trim());

/** The people the request gives for one leg: that leg's rows plus rows for every leg (leg null), in the request's order. */
export function peopleForLeg(people = [], legIndex) {
  const on = (p) => p.leg === legIndex || p.leg == null;
  return { pax: people.filter((p) => p.list === "pax" && on(p)), crew: people.filter((p) => p.list === "crew" && on(p)) };
}

/** One person, every value verbatim; a value the request did not give is left out (never a placeholder). */
function personLine(p, n, { role = false } = {}) {
  const parts = [];
  if (role && clean(p.role)) parts.push(clean(p.role));
  parts.push(clean(p.name));
  if (!role && clean(p.type)) parts.push(clean(p.type));
  if (clean(p.dob)) parts.push(`DOB ${clean(p.dob)}`);
  if (clean(p.nationality)) parts.push(clean(p.nationality));
  if (clean(p.passport)) parts.push(`Passport ${clean(p.passport)}`);
  if (clean(p.expiry)) parts.push(`Expires ${clean(p.expiry)}`);
  return `${n}. ${parts.filter(Boolean).join(" · ")}`;
}

/** The passenger list as Leon's own text list. count = the reviewed passenger total (what paxNumber carries), else the names listed. */
export function passengerTextFor(pax, { reference, paxNumber } = {}) {
  if (!pax.length) return null;
  const text = [`Passengers as given in handling request ${reference ?? ""}`.trim() + " — recorded by the Clearway Ops Agent from the request, not checked against documents.", "",
    ...pax.map((p, i) => personLine(p, i + 1))].join("\n");
  return { text, count: Number.isInteger(paxNumber) ? paxNumber : pax.length, people: pax.length };
}

export const crewHeading = (marker) => `OPERATOR'S CREW per the handling request · ${marker}`;
/** The crew block for the flight's OPS notes. Written when the request names crew or states a crew count. */
export function crewNoteFor(crew, { marker, crewCount } = {}) {
  const count = clean(crewCount);
  if (!crew.length && !/^\d+$/.test(count)) return null;
  const lines = [crewHeading(marker),
    "Recorded by the Clearway Ops Agent from the request. NOT assigned in Leon: Leon assigns crew only from its own crew records, and the agent creates none.",
    count ? `Crew count per the request: ${count}` : `Crew count: not stated in the request (${crew.length} named)`];
  if (crew.length) lines.push(...crew.map((p, i) => personLine(p, i + 1, { role: true })));
  else lines.push("No crew names in the request.");
  return { text: lines.join("\n"), count: count || null, people: crew.length };
}

/** What will happen to a leg's people, for the confirm dialog and the page: counts only. */
export function peoplePlan(people, leg, { reference, marker, paxNumber, crewCount }) {
  const { pax, crew } = peopleForLeg(people, leg.index);
  const p = passengerTextFor(pax, { reference, paxNumber }), c = crewNoteFor(crew, { marker, crewCount });
  return { pax: p ? { people: p.people, count: p.count, sha: sha(p.text + "\u0000" + p.count) } : null, crew: c ? { people: c.people, count: c.count, sha: sha(c.text) } : null };
}
/** One hash per leg for everything about its people, so a confirmation is bound to them as to the flight payload. */
export const peopleHash = (plan) => sha(`${plan.pax?.sha ?? "-"}|${plan.crew?.sha ?? "-"}`);

/** Leon's reason in plain words with every personal value removed (a validation message can echo the input). */
function refusalWords(errors, tokens) {
  const e = errors?.[0] ?? {}; const msg = String(e.message ?? "Leon refused it.");
  const reason = (/with reason '([^']+)'/.exec(msg)?.[1] ?? msg).replace(/got invalid value "[^"]*"/g, "got an invalid value");
  return { words: `Leon: ${scrubString(reason, tokens).slice(0, 300)}`, category: e.extensions?.category ?? null };
}

async function insertAttempt(row) {
  const ins = await rest("intake_leon_people_writes?on_conflict=request_id,leg_index,kind,content_sha256", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([row]) });
  if (Array.isArray(ins) && ins.length) return { row: ins[0], fresh: true };
  const prior = (await rest(`intake_leon_people_writes?select=*&request_id=eq.${row.request_id}&leg_index=eq.${row.leg_index}&kind=eq.${row.kind}&content_sha256=eq.${row.content_sha256}`))?.[0];
  if (prior?.state === "not_in_leon") {
    const taken = await rest(`intake_leon_people_writes?id=eq.${prior.id}&state=eq.not_in_leon`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "sending", leon_error: null, leon_flight_nid: row.leon_flight_nid, sent_by_email: row.sent_by_email, updated_at: new Date().toISOString() }) });
    if (Array.isArray(taken) && taken.length) return { row: taken[0], fresh: true };
  }
  return { row: prior, fresh: false };
}

const PAX_MUTATION = `mutation($f:FlightNid!,$t:PassengerTextInput!){ passengerList{ savePassengerText(flightNid:$f, passengerText:$t){ count } } }`;
const NOTES_READ = `query($n:FlightNid!){ flight(flightNid:$n){ flightNid notes{ ops } } }`;
const NOTES_WRITE = `mutation($l:[FlightUpdateInput!]!){ flights{ flightListUpdate(flightList:$l){ flightNid } } }`;

/** The two Leon calls. Each resolves { ok, already?, res, thrown }. */
async function callPax(flightNid, plan) {
  const res = await leonGraphql(PAX_MUTATION, { f: Number(flightNid), t: { count: plan.count, text: plan.text } }, timeout());
  return { ok: !!res.data?.passengerList?.savePassengerText && !res.errors?.length, res };
}
async function callCrew(flightNid, plan) {
  // Read the notes Leon holds now (ops may already have typed in them) and add the crew block below; never twice.
  const cur = await leonGraphql(NOTES_READ, { n: Number(flightNid) }, timeout());
  if (cur.errors?.length || !cur.data?.flight) return { ok: false, res: cur.errors?.length ? cur : { ...cur, errors: [{ message: "Leon did not return the flight to add the crew to." }] } };
  const ops = String(cur.data.flight.notes?.ops ?? "");
  const heading = plan.text.split("\n")[0];
  if (ops.includes(heading)) return { ok: true, already: true, res: cur };
  const res = await leonGraphql(NOTES_WRITE, { l: [{ flightNid: Number(flightNid), opsNotes: ops ? `${ops.replace(/\s+$/, "")}\n\n${plan.text}` : plan.text }] }, timeout());
  return { ok: Array.isArray(res.data?.flights?.flightListUpdate) && !res.errors?.length, res };
}

/**
 * Writes one created leg's passengers and crew. Never throws for a Leon answer: every outcome is returned and
 * recorded. → [{ kind, state: 'in_leon'|'not_in_leon'|'unknown'|'none', people, count, error?, already? }]
 */
export async function writeLegPeople({ requestId, leg, flightNid, people, reference, marker, paxNumber, crewCount, user }) {
  const { pax, crew } = peopleForLeg(people, leg.index);
  const tokens = personalTokens(people);
  const plans = { pax: passengerTextFor(pax, { reference, paxNumber }), crew: crewNoteFor(crew, { marker, crewCount }) };
  const out = [];
  for (const kind of KINDS) {
    const plan = plans[kind];
    if (!plan) { out.push({ kind, state: "none", people: 0 }); continue; }
    const contentSha = kind === "pax" ? sha(plan.text + "\u0000" + plan.count) : sha(plan.text);
    let row, fresh;
    try { ({ row, fresh } = await insertAttempt({ request_id: requestId, leg_index: leg.index, kind, leon_flight_nid: String(flightNid), content_sha256: contentSha, people_count: plan.people, state: "sending", sent_by_email: user.email })); }
    catch (e) {
      // No record of the attempt → no call: a write that cannot be recorded is not made.
      out.push({ kind, state: "not_sent", people: plan.people, count: plan.count, error: `Not sent: the attempt could not be recorded first (${String(e.message).slice(0, 120)}).` }); continue;
    }
    if (!fresh) { out.push(row?.state === "in_leon" ? { kind, state: "in_leon", people: plan.people, count: plan.count, already: true } : { kind, state: "unknown", people: plan.people, count: plan.count, error: "An earlier write of exactly this is unfinished or its result is unknown. Nothing was sent again; check Leon." }); continue; }
    const t0 = Date.now(); let r = null, thrown = null;
    try { r = kind === "pax" ? await callPax(flightNid, plan) : await callCrew(flightNid, plan); } catch (e) { thrown = e; }
    const ms = Date.now() - t0;
    let o;
    if (r?.ok) o = { kind, state: "in_leon", people: plan.people, count: plan.count, already: !!r.already };
    else if (!thrown && r?.res && r.res.httpStatus < 500 && r.res.errors?.length) { const w = refusalWords(r.res.errors, tokens); o = { kind, state: "not_in_leon", people: plan.people, count: plan.count, error: w.words, category: w.category }; }
    else o = { kind, state: "unknown", people: plan.people, count: plan.count, error: thrown ? `Leon did not answer (${thrown.name === "TimeoutError" || /abort|timeout/i.test(String(thrown.message)) ? "timed out" : scrubString(String(thrown.message), tokens).slice(0, 120)})` : `Leon answered HTTP ${r?.res?.httpStatus} without confirming` };
    await rest(`intake_leon_people_writes?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ state: o.state, leon_error: o.error ?? null, http_status: r?.res?.httpStatus ?? null, answered_ms: ms, updated_at: new Date().toISOString() }) }).catch(() => {});
    await audit({ kind: `intake.leon_${kind}_${o.state === "in_leon" ? "written" : o.state === "not_in_leon" ? "refused" : "unknown"}`, userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, toolName: "intake.leon_send", toolArgs: { requestId, leg: leg.index, kind }, toolResult: { flightNid: String(flightNid), people: plan.people, count: plan.count, already: o.already ?? false }, success: o.state === "in_leon", error: o.error ?? null, confirmationStatus: "confirmed", latencyMs: ms }).catch(() => {});
    out.push(o);
  }
  return out;
}

/** On start: a passenger/crew write that never recorded its outcome is unknown. Nothing retries. */
export async function recoverPeopleOnStart() {
  const rows = await rest(`intake_leon_people_writes?state=eq.sending`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "unknown", leon_error: "The service stopped during the write; the result was never recorded. Check Leon.", updated_at: new Date().toISOString() }) }).catch(() => []);
  for (const w of rows ?? []) {
    await rest(`intake_requests?id=eq.${w.request_id}`, { method: "PATCH", body: JSON.stringify({ status: "needs_you", status_reason: `Leon did not answer · leg ${w.leg_index + 1} ${w.kind === "pax" ? "passengers" : "crew"} unknown · check Leon`, updated_at: new Date().toISOString() }) }).catch(() => {});
    await audit({ kind: `intake.leon_${w.kind}_unknown`, success: false, error: "service restarted during a write", confirmationStatus: "not_required", detail: { requestId: w.request_id, leg: w.leg_index, writeId: w.id } }).catch(() => {});
  }
  return (rows ?? []).length;
}

/** Plain words for one outcome, for the page, the stage and the email. Counts only. */
export function outcomeWords(o) {
  const n = (k, c) => `${c} ${k === "pax" ? (c === 1 ? "passenger" : "passengers") : "crew"}`;
  if (o.kind === "pax") {
    if (o.state === "none") return "No passenger names in the request: nothing written to Leon's passenger list.";
    if (o.state === "in_leon") return `${n("pax", o.people)} written to the flight's passenger list in Leon (Leon's text list, as the request gave them${o.count !== o.people ? `; count ${o.count}` : ""})${o.already ? ", already there" : ""}.`;
    return `Passengers NOT written to Leon: ${o.error ?? "no answer"}`;
  }
  if (o.state === "none") return "No crew in the request.";
  if (o.state === "in_leon") return `${o.people ? n("crew", o.people) : "The crew count"} recorded in the flight's OPS notes as the operator's crew — NOT assigned in Leon${o.already ? " (already there)" : ""}.`;
  return `Crew NOT recorded in Leon: ${o.error ?? "no answer"}`;
}
