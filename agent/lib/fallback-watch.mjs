// Falling back is fine; falling back quietly is not (2026-11-03). Every fallback is on the audit row the turn already
// writes (chat.response detail.fallbacks: the router, a fallback model, a retry a tier up; knowledge.uploaded
// detail.fallbacks: the tier proposal). This watch reads them every hour and alarms through the developers' alert:
//
//   chat turns       in the last 6 h, at least 2 turns fell back AND they are at least a quarter of the turns. One
//                    blip stays quiet; a dead router on a slow afternoon (two questions, both on the fallback) does not.
//   tier proposals   any upload in the last 6 h whose proposal fell back: each one is a model that did not answer.
//
// Sender fallbacks (wall mail from the fallback address while clearway.verxyl.com is not verified in Resend) are
// recorded on the send's row and not alarmed: they are expected every day until the DNS is in, and an alarm that
// always rings is one nobody reads.
// Once a day per kind while it holds; "back to normal" when it clears. Not on a rig.
import { rest } from "./knowledge/retrieval.mjs";
import { alertDevelopers } from "./alert.mjs";
import { logDetail } from "./public-errors.mjs";
import { isRigRun, isLocalSupabase } from "../../lib/rig-guard.mjs";

export const WINDOW_H = 6, MIN_TURNS = 2, MIN_SHARE = 0.25;
const REALERT_MS = 24 * 3600_000;
const ROW = "fallbacks:last";

const turnFellBack = (r) => (Array.isArray(r.detail?.fallbacks) && r.detail.fallbacks.length > 0) || ["fallback", "unparsed"].includes(r.detail?.route?.source);

/** What the rows say, as { kind: { problem, counts } } — pure, for the rig. */
export function judge({ chatRows = [], uploadRows = [] }) {
  const out = {};
  const fb = chatRows.filter(turnFellBack);
  const kinds = [...new Set(fb.flatMap((r) => (r.detail?.fallbacks ?? []).map((f) => f.kind)).concat(fb.some((r) => !(r.detail?.fallbacks ?? []).length) ? ["router"] : []))];
  out.chat = { turns: chatRows.length, fellBack: fb.length, kinds, problem: fb.length >= MIN_TURNS && fb.length / Math.max(1, chatRows.length) >= MIN_SHARE ? `${fb.length} of ${chatRows.length} chat turns in the last ${WINDOW_H} h fell back (${kinds.join(", ") || "router"})` : null };
  const up = uploadRows.filter((r) => (r.detail?.fallbacks ?? []).length > 0);
  out.ingest = { uploads: uploadRows.length, fellBack: up.length, problem: up.length ? `${up.length} knowledge upload${up.length === 1 ? "" : "s"} in the last ${WINDOW_H} h got the default tier: the model did not answer` : null };
  return out;
}

async function rows(now) {
  const since = encodeURIComponent(new Date(now - WINDOW_H * 3600_000).toISOString());
  const chatRows = (await rest(`agent_audit_log?kind=eq.chat.response&created_at=gte.${since}&select=created_at,detail&limit=5000`)) ?? [];
  const uploadRows = (await rest(`agent_audit_log?kind=eq.knowledge.uploaded&created_at=gte.${since}&select=created_at,detail&limit=1000`)) ?? [];
  return { chatRows, uploadRows };
}

export async function checkFallbacks({ now = Date.now(), input = null, send = alertDevelopers } = {}) {
  let prev = {}; try { prev = JSON.parse((await rest(`agent_settings?id=eq.${encodeURIComponent(ROW)}&select=reason`))?.[0]?.reason ?? "{}"); } catch { prev = {}; }
  let verdict;
  try { verdict = judge(input ?? (await rows(now))); }
  catch (e) { verdict = { read: { problem: `the fallback watch could not read the audit log (${String(e?.message ?? e).slice(0, 100)})` } }; }
  const alerts = { ...(prev.alerts ?? {}) }; const lines = []; const firing = [];
  for (const [kind, v] of Object.entries(verdict)) {
    if (v.problem) { if (!alerts[kind] || now - Date.parse(alerts[kind]) >= REALERT_MS) { lines.push(`✗ ${v.problem}`); firing.push(kind); } }
    else if (prev.verdict?.[kind]?.problem) { lines.push(`✓ ${kind}: back to normal`); delete alerts[kind]; }
  }
  let sent = null;
  if (lines.length) { sent = await send(`Agent fallbacks, ${new Date(now).toISOString().slice(0, 16)}Z\n${lines.join("\n")}`, "fallbacks"); if (sent) for (const k of firing) alerts[k] = new Date(now).toISOString(); }
  const body = { at: new Date(now).toISOString(), verdict, alerts, lastAlert: lines.length ? { at: new Date(now).toISOString(), sent } : prev.lastAlert ?? null };
  await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: ROW, enabled: true, reason: JSON.stringify(body), updated_at: new Date(now).toISOString(), updated_by_email: "fallback-watch@check.invalid" }]) }).catch((e) => logDetail("fallbacks", "could not record the watch", e));
  return body;
}

export function startFallbackWatch() {
  if (isRigRun() || isLocalSupabase(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "") || process.env.FALLBACK_WATCH_DISABLED === "1") return false;
  const run = () => checkFallbacks().catch((e) => logDetail("fallbacks", "the watch itself failed", e));
  setTimeout(run, 10 * 60_000).unref(); setInterval(run, 3600_000).unref();
  return true;
}
