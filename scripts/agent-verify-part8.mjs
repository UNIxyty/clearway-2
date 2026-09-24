#!/usr/bin/env node
// Part 8's done-condition: authorized REVERSIBLE destructive actions execute
// without a confirmation screen; every one has an immutable before-state, a
// full audit trail and a TESTED restore path; irreversible actions still
// require explicit confirmation, and that confirmation is enforced by the
// backend rather than asked of the model.
//
//   node scripts/agent-verify-part8.mjs
//
// Writes to the LOCAL wall rig. It purges what it creates on purpose — that is
// one of the things under test — so point it at a rig, never at production.

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const value = (f, d) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);
const BASE = value("--base", process.env.AGENT_BASE_URL || "http://127.0.0.1:5175").replace(/\/+$/, "");
const WALL = (process.env.DIGITAL_WALL_INTERNAL_URL || "http://127.0.0.1:5199").replace(/\/+$/, "");
const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
const SB = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const results = [];
const check = (name, passed, detail = "") => { results.push({ name, passed }); console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

async function sb(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const invoke = (name, input = {}) =>
  fetch(`${BASE}/api/tools/invoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, input }) }).then((r) => r.json());
const wall = (path, init = {}) =>
  fetch(`${WALL}${path}`, { headers: { "Content-Type": "application/json" }, ...init }).then((r) => r.json()).catch(() => null);

const onWall = async (id) => ((await wall("/api/timeline/limitations?includeInactive=true"))?.limitations ?? []).some((r) => r.id === id);
const inBin = async (id) => ((await wall("/api/timeline/limitations?deleted=true"))?.limitations ?? []).some((r) => r.id === id);
const makeLimitation = (title, extra = {}) =>
  wall("/api/timeline/limitations", { method: "POST", body: JSON.stringify({ title, description: "Part 8 verification record.", match: { airportIcaos: ["EVRA"], countries: [], flights: [] }, ...extra }) });

async function main() {
  console.log(`agent: ${BASE}\nwall:  ${WALL}\n`);
  await sb("agent_settings?id=eq.global", { method: "PATCH", body: JSON.stringify({ enabled: true, reason: "part8 verify" }) });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb("agent_access", { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: MOCK_USER_ID, user_email: "part8@clearway.local" }]) });
  await sb(`agent_actions?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });

  // ── Deletion is reversible, and executes without a confirmation step ────
  const a = (await makeLimitation("PART8-VERIFY · deletion is reversible"))?.limitation;
  const del = await invoke("delete_limitation", { id: a.id });
  check("a limitation is deleted directly, with no confirmation step",
    del.ok === true && del.deleted === true && del.confirmationRequired !== true,
    del.ok ? `id=${del.id}` : del.message);
  check("the deletion carries an action id and reports itself undoable",
    Boolean(del.actionId) && del.undoable === true, del.actionId);
  check("the record is off the wall", (await onWall(a.id)) === false);
  check("the record is NOT destroyed — it is restorable", await inBin(a.id));

  const [delRow] = await sb(`agent_actions?id=eq.${del.actionId}&select=*`);
  check("the deletion stored the COMPLETE record as before-state, not a diff",
    delRow?.before_state?.title === a.title && Object.keys(delRow?.before_state ?? {}).length >= 8,
    `${Object.keys(delRow?.before_state ?? {}).length} fields`);
  check("the deletion stored no after-state, because there is no after",
    delRow?.after_state === null);

  // ── The restore path, actually exercised ────────────────────────────────
  const listed = await invoke("list_deleted_limitations", {});
  check("the deleted record is findable for restore",
    listed.ok === true && (listed.limitations ?? []).some((r) => r.id === a.id),
    `${listed.count} restorable`);

  const undo = await invoke("undo_action", { actionId: del.actionId });
  check("the deletion can be undone", undo.ok === true && undo.undone === true, undo.what);
  check("undo puts the record back on the wall", await onWall(a.id));
  check("undo restores the SAME id, rather than creating a lookalike",
    (await onWall(a.id)) && !(await inBin(a.id)), a.id);
  const [restoredRow] = await sb(`agent_actions?id=eq.${del.actionId}&select=undone_at,undone_by_action_id`);
  check("the original deletion is marked undone but NOT erased",
    Boolean(restoredRow?.undone_at) && Boolean(restoredRow?.undone_by_action_id));

  // A direct restore, without going through undo — someone else's deletion,
  // or one made long enough ago that nobody has the action id.
  const b = (await makeLimitation("PART8-VERIFY · direct restore"))?.limitation;
  await invoke("delete_limitation", { id: b.id });
  const restore = await invoke("restore_limitation", { id: b.id });
  check("a deleted record can be restored directly by id",
    restore.ok === true && restore.restored === true && (await onWall(b.id)), restore.title);
  check("the restore is itself a logged action", Boolean(restore.actionId), restore.actionId);

  // ── Permanent limitations are undeletable, by anyone ────────────────────
  const perm = (await makeLimitation("PART8-VERIFY · permanent", { isPermanent: true }))?.limitation;
  const permDel = await invoke("delete_limitation", { id: perm.id });
  check("the agent cannot delete a permanent limitation",
    permDel.ok === false && /permanent/i.test(String(permDel.message)), String(permDel.message).slice(0, 60));
  const permDirect = await wall(`/api/timeline/limitations/${perm.id}`, { method: "DELETE" });
  check("nor can a direct API call — the rule is in the store, not the tool",
    permDirect?.ok === false && /permanent/i.test(String(permDirect.error)));
  check("the permanent limitation is still on the wall", await onWall(perm.id));

  // ── Irreversible: confirmation is required, and backend-enforced ────────
  const c = (await makeLimitation("PART8-VERIFY · purge target"))?.limitation;
  await invoke("delete_limitation", { id: c.id });

  const ask = await invoke("purge_deleted_limitation", { id: c.id });
  check("purging asks first — the irreversible path is NOT executed on the first call",
    ask.ok === true && ask.confirmationRequired === true && ask.executed === false);
  check("the confirmation token is issued by the backend", typeof ask.confirmationToken === "string" && ask.confirmationToken.length >= 16);
  check("nothing was destroyed while awaiting confirmation", await inBin(c.id));
  const pendingRows = await sb(`agent_actions?user_id=eq.${MOCK_USER_ID}&error=eq.awaiting_confirmation&select=id,reversible,target_id`);
  check("the request for confirmation is itself recorded",
    (pendingRows ?? []).some((r) => r.target_id === c.id && r.reversible === false));

  const forged = await invoke("purge_deleted_limitation", { id: c.id, confirmationToken: "00000000-0000-4000-8000-00000000fake" });
  check("a token the model invented is refused",
    forged.confirmationRequired === true && forged.executed === false && (await inBin(c.id)));

  const purge = await invoke("purge_deleted_limitation", { id: c.id, confirmationToken: ask.confirmationToken });
  check("a real token purges the record", purge.ok === true && purge.executed === true, purge.message);
  check("the record is genuinely gone — not on the wall, not restorable",
    !(await onWall(c.id)) && !(await inBin(c.id)));
  const failedRestore = await invoke("restore_limitation", { id: c.id });
  check("a purged record cannot be restored", failedRestore.ok === false);

  const [purgeRow] = await sb(`agent_actions?user_id=eq.${MOCK_USER_ID}&tool_name=eq.purge_deleted_limitation&success=is.true&select=*&order=created_at.desc&limit=1`);
  check("the purge is recorded as irreversible, with a reason",
    purgeRow?.reversible === false && Boolean(purgeRow?.irreversible_reason), purgeRow?.irreversible_reason);
  check("the snapshot outlives the record it describes",
    purgeRow?.before_state?.title === "PART8-VERIFY · purge target");
  const undoPurge = await invoke("undo_action", { actionId: purgeRow.id });
  check("an irreversible action cannot be undone", undoPurge.ok === false, undoPurge.error);

  // A single confirmation must not authorise a second destruction.
  const d = (await makeLimitation("PART8-VERIFY · token reuse"))?.limitation;
  await invoke("delete_limitation", { id: d.id });
  const reused = await invoke("purge_deleted_limitation", { id: d.id, confirmationToken: ask.confirmationToken });
  check("a spent token cannot be reused on another record",
    reused.executed === false && (await inBin(d.id)));

  // ── A normalised title must still find the record (audit finding S1) ────
  // The model drops punctuation and reorders words; the tool must not turn
  // that into "the limitation does not exist".
  const dotted = (await makeLimitation("AUDIT · TWY B closed EVRA"))?.limitation;
  const loose = await invoke("list_limitations", { query: "AUDIT TWY B closed EVRA" });
  check("a query without the title's punctuation still finds the record",
    loose.ok === true && (loose.limitations ?? []).some((r) => r.id === dotted.id), `count=${loose.count}`);
  const reordered = await invoke("list_limitations", { query: "evra closed twy" });
  check("word order and case do not matter", (reordered.limitations ?? []).some((r) => r.id === dotted.id));
  const miss = await invoke("list_limitations", { query: "AUDIT TWY Z closed EVRA" });
  check("a near-miss returns closest matches instead of a bare zero",
    miss.count === 0 && (miss.closestMatches ?? []).some((m) => m.id === dotted.id) && typeof miss.note === "string",
    `nearest=${miss.closestMatches?.[0]?.title} missed=${miss.closestMatches?.[0]?.missedTokens}`);
  await wall(`/api/timeline/limitations/${dotted.id}`, { method: "DELETE" }).catch(() => {});
  await wall(`/api/timeline/limitations/${dotted.id}/purge`, { method: "DELETE" }).catch(() => {});

  // ── Still out of reach ──────────────────────────────────────────────────
  const tools = await (await fetch(`${BASE}/api/tools`)).json();
  const names = (tools.tools ?? []).map((t) => t.name);
  check("no send-to-crew or safety-acknowledgement tool is offered",
    !names.some((n) => /acknowledge|^send_notam|dispatch|crew/.test(n)), `${names.length} tools offered`);
  check("no tool writes flight operational status — explicitly out of scope",
    !names.some((n) => /flight_status|set_flight|trip_status|leon_write/.test(n)));

  // ── Cleanup: the rig's own records, purged deliberately ─────────────────
  for (const id of [a.id, b.id, perm.id, d.id]) {
    await wall(`/api/timeline/limitations/${id}`, { method: "DELETE" }).catch(() => {});
    await wall(`/api/timeline/limitations/${id}/purge`, { method: "DELETE" }).catch(() => {});
  }
  await sb(`agent_actions?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nverification aborted: ${e.message}`); process.exit(1); });
