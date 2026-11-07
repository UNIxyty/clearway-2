// Scheduled smoke calls (2026-11-03). A path nobody exercises reports nothing: extraction was refused by the API for a
// day (temperature on Sonnet 5) and nothing said so, because no mail arrived to run it. Every model and AI path the
// agent owns gets a real call here, against the real APIs, every SMOKE_EVERY_HOURS (default 6), with invented input:
//
//   router          the classifier answers on its own model (a failure falls back to "standard" silently)
//   fast            one call on the fast tier
//   standard-tools  a whole tool turn on the standard tier: the model calls a tool, gets the result, and the round
//                   after it is accepted with the model's thinking sent back (get_flight_tracking: no network, no data)
//   reasoning       one call on the reasoning tier
//   extraction      an invented handling request through the real extractor and its schema check
//   ingest-classify the knowledge upload's tier proposal (a failure falls back to "reference" silently)
//   knowledge       a knowledge-base search, end to end
//   web-search-api  the Anthropic API's own web search on one approved domain, with a citation back (2026-11-03)
//   voice           text to speech, then that audio back to text, and the words compared
//   scheduled-jobs  the retention and generated-files sweeps ran on time and worked (lib/jobs.mjs)
//   intake-silence  armed when intake goes live: no inbound email for 24 working hours fails it (lib/intake/silence.mjs)
//
// The result of each run is the agent_settings row `smoke:last` (JSON in `reason`). A failure alerts the developers'
// Telegram chat (the path the AIP refresh uses), counted sent only when Telegram accepted it; a path that stays down is
// alerted again once a day, and its recovery is said too. The wall's backend watches the row itself: a smoke run that
// stops, or a row it cannot read, is alerted from there (digital-wall/lib/agent-smoke-watch.mjs).
import { converseOnce, streamConversationWithTools } from "./bedrock.mjs";
import { loadModelConfig, systemPrompt, currentTimeLine } from "./models.mjs";
import { routeTurn } from "./router.mjs";
import { rest } from "./knowledge/retrieval.mjs";
import { logDetail, recordedReason } from "./public-errors.mjs";
import { alertDevelopers } from "./alert.mjs";
import { isRigRun, isLocalSupabase } from "../../lib/rig-guard.mjs";

export const EVERY_HOURS = Number(process.env.SMOKE_EVERY_HOURS || 6);
const REALERT_MS = 24 * 3600_000;
const ROW = "smoke:last";
// The smoke run acts as a synthetic user that cannot be mistaken for a person and cannot receive mail.
const SMOKE_USER = { userId: "00000000-0000-4000-8000-00000000500e", email: "smoke@check.invalid", name: "Smoke check", agentRole: "user" };

const EMAIL = {
  message: { from: "ops@example.invalid", to: ["intake@example.invalid"], date: "Mon, 2 Nov 2026 09:12:00 +0000", subject: "Handling request YL-TST EVRA (smoke check)" },
  bodyText: "Dear Clearway team,\n\nPlease arrange ground handling for the flight below. Invented smoke-check message, no real people.\n\nAircraft: C25C, registration YL-TST\nSchedule (all UTC times)\n05NOV26 EPWA 0830 - EVRA 1015\n\nCrew 2, PAX 0.\n\nBest regards,\nJane Testperson\nExample Test Air",
  attachments: [],
};

// A failed check's detail goes to the developers' alert: our own sentence when `must` failed, otherwise the kind of
// failure, with the thrown text in the log (2026-11-07).
class SmokeFailed extends Error {}
const failedDetail = (e) => {
  if (e instanceof SmokeFailed) return e.message.slice(0, 300);
  return recordedReason("smoke", "a smoke call threw", e);
};
async function timed(fn) { const t = Date.now(); try { const detail = await fn(); return { ok: true, ms: Date.now() - t, detail: String(detail ?? "") }; } catch (e) { return { ok: false, ms: Date.now() - t, detail: failedDetail(e) }; } }
const must = (cond, why) => { if (!cond) throw new SmokeFailed(why); };

export const SMOKES = {
  router: async () => {
    const r = await routeTurn({ question: "What time is it in UTC right now?", allowReasoning: true });
    must(r.source === "router" || r.source === "low-confidence", `the router did not answer (${r.source}: ${r.reason})`);
    must(r.routerModelId === loadModelConfig().tiers.router.id, `answered on ${r.routerModelId}, not the router's model`);
    return `${r.routerModelId} → ${r.routerTier}`;
  },
  fast: async () => { const r = await converseOnce({ tier: "fast", messages: [{ role: "user", content: "Reply with the single word OK." }], maxTokens: 64 }); must(/\bOK\b/i.test(r.text), "no OK in the reply"); return r.modelId; },
  "standard-tools": async () => {
    const tools = []; let done = null;
    for await (const ev of streamConversationWithTools({ tier: "standard", system: `${systemPrompt()}\n\n${currentTimeLine()}`, messages: [{ role: "user", content: "Smoke check: call get_flight_tracking for callsign SMOKE1, then say in one sentence whether tracking is available." }], user: SMOKE_USER, conversationId: null })) {
      if (ev.type === "tool") tools.push(ev); else if (ev.type === "done") done = ev;
    }
    must(tools.some((t) => t.name === "get_flight_tracking" && t.ok), `the tool was not called (${tools.map((t) => t.name).join(", ") || "none"})`);
    must(done?.stopReason === "end_turn", `the turn ended ${done?.stopReason}`);
    return `${done.modelId} · tool round accepted`;
  },
  reasoning: async () => { const r = await converseOnce({ tier: "reasoning", messages: [{ role: "user", content: "Reply with the single word OK." }], maxTokens: 2048 }); must(/\bOK\b/i.test(r.text), "no OK in the reply"); return r.modelId; },
  extraction: async () => {
    const { runModel } = await import("./intake/extract.mjs");
    const r = await runModel(EMAIL);
    const leg = r.raw?.legs?.[0];
    must(String(leg?.registration?.value ?? "").toUpperCase() === "YL-TST" && /EVRA/.test(String(leg?.arrival?.value ?? "")), "the extraction did not read the invented request");
    return r.modelId;
  },
  "ingest-classify": async () => {
    const { classifyDocument } = await import("./knowledge/ingest.mjs");
    const p = await classifyDocument({ title: "Smoke check (invented text)", source: "smoke", sample: "Aircraft above 5,700 kg shall not land between 2300 and 0500 UTC without prior permission. Requests at least 24 hours in advance." });
    must(p.automatic === true, `the model did not answer: ${p.reason}`);
    return p.tier;
  },
  knowledge: async () => {
    const { searchKnowledge } = await import("./knowledge/retrieval.mjs");
    const r = await searchKnowledge("night restrictions", { limit: 3 });
    must(!(r.failures ?? []).length, `search failures: ${(r.failures ?? []).join("; ").slice(0, 200)}`);
    return `${r.tier1.length + r.tier2.length} hit(s)`;
  },
  "web-search-api": async () => {
    const { anthropicWebTool } = await import("./web-sources.mjs");
    const { messagesOnce } = await import("./anthropic-runtime.mjs");
    const model = loadModelConfig().tiers?.fast?.id ?? "claude-haiku-5-5";
    const j = await messagesOnce({ model, max_tokens: 1200, messages: [{ role: "user", content: "Smoke check: search for EUROCONTROL's network operations portal and say in one sentence what it is, citing the page." }], tools: [{ ...anthropicWebTool({ official: ["eurocontrol.int"], industry: [] }, { widened: false }), max_uses: 1 }] });
    const result = (j.content ?? []).find((b) => b.type === "web_search_tool_result");
    must(result && Array.isArray(result.content) && result.content.length > 0, `no search results (${result?.content?.error_code ?? j.stop_reason ?? "no search ran"})`);
    must(result.content.every((r) => /(^|\.)eurocontrol\.int$/.test(new URL(r.url).hostname)), "a result outside the allowed domain: the filter was not applied");
    must((j.content ?? []).some((b) => b.type === "text" && b.citations?.length), "no citation in the answer");
    return `${model} · ${result.content.length} result(s), cited`;
  },
  // Not a call but an absence (2026-11-03): armed when intake goes live; no inbound email for 24 working hours fails it.
  "intake-silence": async () => {
    const { intakeSilence, SILENCE_WORKING_HOURS } = await import("./intake/silence.mjs");
    const x = await intakeSilence();
    const last = x.lastAt ? `${x.lastAt.slice(0, 16)}Z` : "never";
    if (x.state === "not_armed") return `not armed (intake not live) · last email ${last}`;
    must(x.state !== "silent", `no inbound email for ${x.hours} working hours (armed; alarms from ${SILENCE_WORKING_HOURS}) · last email ${last}`);
    return `${x.hours} working hours since the last email (${last})`;
  },
  // The agent's scheduled jobs, by their own recorded runs (lib/jobs.mjs, 2026-11-03): a report nobody reads is not a check.
  "scheduled-jobs": async () => {
    const { jobProblems } = await import("./jobs.mjs");
    const problems = await jobProblems({ startedAt: Date.now() - process.uptime() * 1000 });
    must(problems.length === 0, problems.join("; "));
    return problems.seen.join(" · ");   // what was seen, not a count that sounds like more (2026-11-03)
  },
  voice: async () => {
    const { synthesize, ttsConfigured } = await import("./voice/tts.mjs");
    const { transcribe } = await import("./voice/stt.mjs");
    must(ttsConfigured(), "voice is not configured");
    const said = await synthesize("Clearway smoke check, runway two four.");
    const heard = await transcribe({ buffer: Buffer.from(said.audio, "base64"), mime: said.mime ?? "audio/mpeg" });
    must(/smoke/i.test(heard.text) && /runway/i.test(heard.text), "the audio did not come back as the same words");
    return "spoken and heard back";
  },
};

export { alertDevelopers };

async function readRow() { const row = (await rest(`agent_settings?id=eq.${encodeURIComponent(ROW)}&select=reason`))?.[0]; try { return row?.reason ? JSON.parse(row.reason) : null; } catch { return null; } }
async function writeRow(body) { await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: ROW, enabled: true, reason: JSON.stringify(body), updated_at: new Date().toISOString(), updated_by_email: SMOKE_USER.email }]) }); }

/**
 * What the health answer says about the model and AI paths: the last smoke run, read at most once a minute. Not "ok"
 * because a key is set (2026-11-03): ok only when a run happened recently and every path in it worked.
 */
let healthCache = { at: 0, value: null };
export async function smokeHealth({ now = Date.now() } = {}) {
  if (now - healthCache.at < 60_000 && healthCache.value) return healthCache.value;
  let value;
  try {
    const last = await readRow();
    if (!last?.ranAt) value = { state: "unchecked", ranAt: null, failing: [] };
    else {
      const failing = Object.entries(last.results ?? {}).filter(([, r]) => !r.ok).map(([n]) => n);
      const stale = now - Date.parse(last.ranAt) > (Number(last.everyHours) || EVERY_HOURS) * 2 * 3600_000 + 3600_000;
      value = { state: stale ? "stale" : failing.length ? "failing" : "working", ranAt: last.ranAt, failing };
    }
  } catch { value = { state: "unreadable", ranAt: null, failing: [] }; }
  healthCache = { at: now, value };
  return value;
}

/** One run of every smoke (or the named ones). Records the run and alerts on what failed or recovered. */
export async function runSmokes({ only = null, alert = true, now = () => new Date() } = {}) {
  const prev = (await readRow().catch(() => null)) ?? {};
  const results = {};
  for (const [name, fn] of Object.entries(SMOKES)) { if (only && !only.includes(name)) continue; results[name] = await timed(fn); }
  const at = now().toISOString();
  const alerts = { ...(prev.alerts ?? {}) };
  const lines = []; const failingNow = [];
  for (const [name, r] of Object.entries(results)) {
    const was = prev.results?.[name];
    if (!r.ok) {
      // a new failure, or one last alerted a day ago or more (an alert never sent leaves no time: it is tried again)
      const last = alerts[name] ? Date.parse(alerts[name]) : 0;
      if (!alerts[name] || Date.parse(at) - last >= REALERT_MS) { lines.push(`✗ ${name}: ${r.detail}`); failingNow.push(name); }
    } else {
      if (was && !was.ok) lines.push(`✓ ${name} works again`);
      delete alerts[name];
    }
  }
  let alerted = null;
  if (alert && lines.length) {
    alerted = await alertDevelopers(`Agent smoke check (${process.env.CW_ENV_NAME || "production"}), ${at.slice(0, 16)}Z\n${lines.join("\n")}`);
    if (alerted) for (const name of failingNow) alerts[name] = at;
  }
  const body = { ranAt: at, everyHours: EVERY_HOURS, results: { ...(only ? prev.results ?? {} : {}), ...results }, alerts, lastAlert: lines.length ? { at, sent: alerted } : prev.lastAlert ?? null };
  await writeRow(body).catch((e) => logDetail("smoke", "could not record the run", e));
  for (const [name, r] of Object.entries(results)) if (!r.ok) logDetail("smoke", `${name} FAILED`, r.detail);
  return body;
}

/** The schedule: first run a few minutes after start, then every EVERY_HOURS. SMOKE_DISABLED=1 turns it off (the rig). */
export function startSmokeSchedule() {
  // never on a test rig (no real key, a local database): the schedule is production's
  if (isRigRun() || isLocalSupabase(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")) return false;
  if (process.env.SMOKE_DISABLED === "1" || !(EVERY_HOURS > 0)) return false;
  const run = () => runSmokes().catch((e) => logDetail("smoke", "the run itself failed", e));
  setTimeout(run, Number(process.env.SMOKE_FIRST_DELAY_MS || 5 * 60_000)).unref();
  setInterval(run, EVERY_HOURS * 3600_000).unref();
  return true;
}
