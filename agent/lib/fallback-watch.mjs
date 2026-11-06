// Falling back is fine; falling back quietly is not (2026-11-03). Every fallback is on the row the work already writes
// (chat.response detail.fallbacks: the router, a fallback model, a retry a tier up; knowledge.uploaded detail.fallbacks:
// the tier proposal; a send's intake_messages row, delivery_detail.fallback: the sender). This watch reads them every
// hour and alarms through the developers' alert:
//
//   chat turns       at today's volume (about 4 turns a day, 347 in 90 days) ONE fallback in the last 6 h alarms, with
//                    its reason: a percentage needs a denominator, and a window often holds one turn or none. When a
//                    window holds SWITCH_AT (20) turns or more (about 80 a day, twenty times today), the share rule takes
//                    over: at least 3 turns fell back and at least 15% of them.
//   tier proposals   any upload whose proposal fell back: each one is a model that did not answer.
//   sender           a send that went out from the fallback address alarms, UNLESS Resend itself reports the intended
//                    sender's domain as not verified. The exemption clears itself: once the domain verifies, a sender
//                    fallback alarms like anything else. Resend cannot be asked → no exemption.
// Once a day per kind while it holds; "back to normal" when it clears. Not on a rig.
import { rest, restAll } from "./knowledge/retrieval.mjs";
import { alertDevelopers } from "./alert.mjs";
import { logDetail } from "./public-errors.mjs";
import { isRigRun, isLocalSupabase } from "../../lib/rig-guard.mjs";

export const WINDOW_H = 6, SWITCH_AT = 20, MIN_TURNS = 3, MIN_SHARE = 0.15;
const REALERT_MS = 24 * 3600_000;
const ROW = "fallbacks:last";

const turnFellBack = (r) => (Array.isArray(r.detail?.fallbacks) && r.detail.fallbacks.length > 0) || ["fallback", "unparsed"].includes(r.detail?.route?.source);

const reasons = (rows) => [...new Set(rows.flatMap((r) => (r.detail?.fallbacks?.length ? r.detail.fallbacks : [{ kind: "router", reason: r.detail?.route?.reason }]).map((f) => `${f.kind}${f.reason ? `: ${String(f.reason).slice(0, 80)}` : ""}`)))].slice(0, 4);

/** What the rows say, as { kind: { problem, … } } — pure, for the rig. `domains`: { "clearway.verxyl.com": "verified" | "pending" | … } or null when Resend could not be asked. */
export function judge({ chatRows = [], uploadRows = [], senderRows = [], domains = {} }) {
  const out = {};
  const fb = chatRows.filter(turnFellBack);
  const kinds = [...new Set(fb.flatMap((r) => (r.detail?.fallbacks ?? []).map((f) => f.kind)).concat(fb.some((r) => !(r.detail?.fallbacks ?? []).length) ? ["router"] : []))];
  const byShare = chatRows.length >= SWITCH_AT;
  const firing = byShare ? fb.length >= MIN_TURNS && fb.length / chatRows.length >= MIN_SHARE : fb.length >= 1;
  out.chat = { turns: chatRows.length, fellBack: fb.length, kinds, rule: byShare ? "share" : "any", problem: firing ? `${fb.length} of ${chatRows.length} chat turn${chatRows.length === 1 ? "" : "s"} in the last ${WINDOW_H} h fell back — ${reasons(fb).join("; ")}` : null };
  const up = uploadRows.filter((r) => (r.detail?.fallbacks ?? []).length > 0);
  out.ingest = { uploads: uploadRows.length, fellBack: up.length, problem: up.length ? `${up.length} knowledge upload${up.length === 1 ? "" : "s"} in the last ${WINDOW_H} h got the default tier: the model did not answer` : null };
  const domainOf = (addr) => String(addr ?? "").replace(/^.*</, "").replace(/>.*$/, "").split("@")[1]?.toLowerCase() ?? "";
  const sends = senderRows.filter((r) => r.delivery_detail?.fallback);
  const exempt = [], alarmed = [];
  for (const r of sends) { const d = domainOf(r.delivery_detail.fallback.from); const st = domains === null ? null : domains[d]; (st && st !== "verified" ? exempt : alarmed).push({ d, st }); }
  out.sender = { sends: sends.length, exempt: exempt.length, problem: alarmed.length ? `${alarmed.length} email${alarmed.length === 1 ? "" : "s"} in the last ${WINDOW_H} h went from the fallback sender, and ${domains === null ? "Resend could not be asked whether the domain is verified" : `${[...new Set(alarmed.map((a) => a.d))].join(", ")} is ${[...new Set(alarmed.map((a) => a.st ?? "unknown to Resend"))].join("/")}`}` : null };
  return out;
}

async function resendDomains() {
  const key = String(process.env.RESEND_API_KEY || "").trim(); if (!key) return null;
  try {
    const r = await fetch(`${String(process.env.RESEND_API_BASE || "https://api.resend.com").replace(/\/+$/, "")}/domains`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = await r.json(); return Object.fromEntries((j.data ?? []).map((d) => [String(d.name).toLowerCase(), String(d.status)]));
  } catch { return null; }
}

async function rows(now) {
  const since = encodeURIComponent(new Date(now - WINDOW_H * 3600_000).toISOString());
  // every row of the window (2026-11-07): limit=5000 was 1000 under the database's page limit, and "N of M turns fell
  // back" and the 15% rule were judged on the part that came back
  const chatRows = await restAll(`agent_audit_log?kind=eq.chat.response&created_at=gte.${since}&select=created_at,detail&order=created_at.asc,id.asc`);
  const uploadRows = await restAll(`agent_audit_log?kind=eq.knowledge.uploaded&created_at=gte.${since}&select=created_at,detail&order=created_at.asc,id.asc`);
  const senderRows = await restAll(`intake_messages?direction=eq.outbound&received_at=gte.${since}&delivery_detail->fallback=not.is.null&select=received_at,delivery_detail&order=received_at.asc,id.asc`);
  const domains = senderRows.length ? await resendDomains() : {};
  return { chatRows, uploadRows, senderRows, domains };
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
