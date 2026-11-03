// The runaway ceiling (2026-11-03). At our volume (~350 turns a quarter, about $10 a month) a bill can only surprise us
// through a loop — a job that keeps calling, a script left running — never through a tariff. So every model call on the
// Anthropic API (chat, router, extraction, ingest, rerank, the smoke checks) passes this ledger: it is refused once the
// UTC day's spend reaches AGENT_DAILY_CEILING_USD (default $25, about 25 times a busy day), the person is told plainly
// that the agent has stopped for today, and the developers are alerted once that day.
//
// The day's total is the actual tokens of each response at the pricing table's list prices (agent/config/models.json,
// cache reads and writes included). It is kept in the agent_settings row `spend:<YYYY-MM-DD>`, so a restart does not
// reset it. If that row cannot be read the ledger counts from what this process has seen, and says so in the log.
import { loadModelConfig } from "./models.mjs";
import { AgentError } from "./errors.mjs";
import { alertDevelopers } from "./alert.mjs";
import { logDetail } from "./public-errors.mjs";

export const ceilingUsd = () => Number(process.env.AGENT_DAILY_CEILING_USD || 25);
let state = { day: null, usd: 0, loaded: false, alertedDay: null, persistTimer: null };
const today = (now = new Date()) => now.toISOString().slice(0, 10);
const base = () => String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
async function db(path, init = {}) {
  const r = await fetch(`${base()}/rest/v1/${path}`, { ...init, headers: { apikey: key(), authorization: `Bearer ${key()}`, "content-type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${r.status}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

/** USD for one response, at the pricing table's rates (first matching key wins; cache writes at 1.25x input by default). */
export function priceUsd(modelId, u = {}) {
  const pricing = loadModelConfig().pricing ?? {};
  const k = Object.keys(pricing).find((p) => p !== "_comment" && p !== "default" && String(modelId ?? "").includes(p));
  const r = pricing[k] ?? pricing.default ?? { input: 3, output: 15, cacheRead: 0.3 };
  // the API's own web search is billed per search, $10 per 1,000 (2026-11-03), on top of the result tokens it adds to input
  const searchUsd = (u.webSearchRequests ?? 0) * Number(pricing.webSearchPerRequest ?? 0.01);
  return ((u.inputTokens ?? 0) * r.input + (u.outputTokens ?? 0) * r.output + (u.cacheReadInputTokens ?? 0) * (r.cacheRead ?? r.input * 0.1) + (u.cacheWriteInputTokens ?? 0) * (r.cacheWrite ?? r.input * 1.25)) / 1e6 + searchUsd;
}

async function ensureDay(now = new Date()) {
  const d = today(now);
  if (state.day !== d) state = { ...state, day: d, usd: 0, loaded: false };
  if (state.loaded) return;
  state.loaded = true;
  if (!base() || !key()) return;
  try { const row = (await db(`agent_settings?id=eq.${encodeURIComponent(`spend:${d}`)}&select=reason`))?.[0]; const v = Number(JSON.parse(row?.reason ?? "{}").usd); if (Number.isFinite(v)) state.usd = Math.max(state.usd, v); }
  catch (e) { logDetail("spend", "could not read today's spend; counting from this process", e); }
}
function persistSoon() {
  if (state.persistTimer || !base() || !key()) return;
  state.persistTimer = setTimeout(async () => {
    state.persistTimer = null;
    try { await db("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: `spend:${state.day}`, enabled: true, reason: JSON.stringify({ usd: Math.round(state.usd * 1e6) / 1e6, ceilingUsd: ceilingUsd(), at: new Date().toISOString() }), updated_at: new Date().toISOString() }]) }); }
    catch (e) { logDetail("spend", "could not record today's spend", e); }
  }, 5_000);
  state.persistTimer.unref?.();
}

/** Throws spend_ceiling when today's spend has reached the ceiling. Called before every model call. */
export async function checkCeiling({ now = new Date() } = {}) {
  await ensureDay(now);
  if (state.usd < ceilingUsd()) return;
  if (state.alertedDay !== state.day) {
    state.alertedDay = state.day; // once a day, sent or not: the refusal itself is in every reply and the log
    const sent = await alertDevelopers(`The agent has stopped for today: it reached its daily spending ceiling ($${state.usd.toFixed(2)} of $${ceilingUsd()}) at ${now.toISOString().slice(11, 16)}Z. Every model call is refused until 00:00 UTC. A loop is the likely cause: check the agent's log and agent_audit_log.`, "spend");
    logDetail("spend", "daily ceiling reached", `$${state.usd.toFixed(2)} of $${ceilingUsd()} · developers alerted: ${sent ? "yes" : "NO"}`);
  }
  throw new AgentError("spend_ceiling", `daily spending ceiling reached ($${state.usd.toFixed(2)} of $${ceilingUsd()})`, { status: 503, retryable: false });
}

/** Adds one response's cost to today. */
export function recordUsage(modelId, usage, { now = new Date() } = {}) {
  if (state.day !== today(now)) state = { ...state, day: today(now), usd: 0, loaded: false };
  const usd = priceUsd(modelId, usage);
  if (Number.isFinite(usd) && usd > 0) { state.usd += usd; persistSoon(); }
  return usd;
}

/** A cost that is not a model response (a Tavily search), added to today the same way. */
export function recordExtraUsd(usd, _what = "extra", { now = new Date() } = {}) {
  if (state.day !== today(now)) state = { ...state, day: today(now), usd: 0, loaded: false };
  if (Number.isFinite(usd) && usd > 0) { state.usd += usd; persistSoon(); }
  return usd;
}

export function spentToday() { return { day: state.day, usd: state.usd, ceilingUsd: ceilingUsd() }; }
/** Today's spend for the Settings card, from the stored day (so it is right after a restart). */
export async function todaySpend({ now = new Date() } = {}) { await ensureDay(now); return { day: state.day, usd: Math.round(state.usd * 100) / 100, ceilingUsd: ceilingUsd(), reached: state.usd >= ceilingUsd() }; }
export function resetForTest(usd = 0, day = today()) { if (state.persistTimer) clearTimeout(state.persistTimer); state = { day, usd, loaded: true, alertedDay: null, persistTimer: null }; }
