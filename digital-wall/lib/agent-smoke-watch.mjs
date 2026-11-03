// Who watches the smoke checks (2026-11-03). The agent runs a real call on every model and AI path every few hours and
// records the run in the agent_settings row `smoke:last` (agent/lib/smoke.mjs). If the agent is down, or its schedule
// stops, those calls stop too, and a quiet smoke check looks exactly like a healthy one. So the wall, a separate
// service, reads that row every 30 minutes and alerts the developers' chat when:
//   - the row cannot be read (the database or the key is the problem — fails closed, never "fine"),
//   - there is no row, or
//   - the last run is older than two intervals and an hour.
// Once a day while it holds; "running again" when it clears. Not on a rig (a local database, or the test auth bypass).
const CHECK_MS = 30 * 60_000;
const REALERT_MS = 24 * 3600_000;
let state = { problem: null, alertedAt: 0 };

const base = () => String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

export async function alertDevelopers(text) {
  const token = String(process.env.TELEGRAM_BUG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chats = String(process.env.TELEGRAM_BUG_ALLOWED_CHAT_IDS || process.env.TELEGRAM_DEBUG_ALLOWED_CHAT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !chats.length) { console.error("[smoke-watch] alert NOT sent: no Telegram bot token or chat configured"); return false; }
  let sent = 0;
  for (const chat_id of chats) {
    try {
      const r = await fetch(`${String(process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "")}/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id, text }), signal: AbortSignal.timeout(10_000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) sent += 1; else console.error(`[smoke-watch] alert refused by Telegram: ${r.status} ${j?.description ?? ""}`);
    } catch (e) { console.error(`[smoke-watch] alert NOT sent: ${e?.message ?? e}`); }
  }
  return sent > 0;
}

/** What is wrong with the smoke record right now, or null. Never null because something could not be read. */
export async function smokeProblem({ now = Date.now(), fetchImpl = fetch } = {}) {
  if (!base() || !key()) return "the wall has no database settings, so it cannot see the agent's smoke checks";
  let row;
  try {
    const r = await fetchImpl(`${base()}/rest/v1/agent_settings?id=eq.smoke%3Alast&select=reason,updated_at`, { headers: { apikey: key(), authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return `the smoke record could not be read (database answered ${r.status})`;
    row = (await r.json())?.[0];
  } catch (e) { return `the smoke record could not be read (${String(e?.message ?? e).slice(0, 80)})`; }
  if (!row) return "the agent has never recorded a smoke run";
  let body; try { body = JSON.parse(row.reason); } catch { return "the smoke record is unreadable"; }
  const ranAt = Date.parse(body?.ranAt ?? row.updated_at); const every = Number(body?.everyHours) || 6;
  if (!Number.isFinite(ranAt)) return "the smoke record has no run time";
  const ageH = (now - ranAt) / 3600_000;
  if (ageH > every * 2 + 1) return `the agent's smoke checks last ran ${ageH.toFixed(1)} h ago (they run every ${every} h): the agent or its schedule has stopped`;
  return null;
}

export async function checkOnce({ now = Date.now(), fetchImpl = fetch, send = alertDevelopers } = {}) {
  const problem = await smokeProblem({ now, fetchImpl });
  if (problem) {
    if (!state.problem || now - state.alertedAt >= REALERT_MS) { if (await send(`Wall watching the agent's smoke checks: ${problem}.`)) state.alertedAt = now; }
    state.problem = problem;
  } else if (state.problem) {
    if (await send("Wall watching the agent's smoke checks: they are running again.")) state = { problem: null, alertedAt: 0 };
  }
  return problem;
}
export function resetForTest() { state = { problem: null, alertedAt: 0 }; }

export function startSmokeWatch() {
  const local = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/.test(base());
  if (local || String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true" || process.env.SMOKE_WATCH_DISABLED === "1") return false;
  // the first look waits for the agent's first run after a joint deploy (its first run is 5 minutes after start)
  setTimeout(() => checkOnce().catch(() => {}), 15 * 60_000).unref();
  setInterval(() => checkOnce().catch(() => {}), CHECK_MS).unref();
  return true;
}
