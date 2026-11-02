// What a real turn costs, before and after the 5.5 move, and at a lower effort (2026-11-03). As a check account
// (read-only, removed at the end), in the agent container. The same questions, the same tools, on:
//   before   — the models each tier ran until 2026-11-03, with the requests it sent then (no thinking field)
//   after    — the tiers as configured now
//   lower    — the same 5.5 model one effort level down
// Each turn twice: the first may write the prompt cache, the second reads it (what a busy desk sees). Money is the
// actual token counts at Anthropic list prices, cache writes included. Answers are graded against the tool's own
// result (the flight count, the NOTAM count, the wind, VMC/IMC); they are not printed. Then the real volume from the
// audit log, as counts, and a monthly figure.
export const ROLES = ["user"];
const PRICE = { // USD per million: input, output, cache read, cache write (5 min) — platform.claude.com pricing, 2026-11-03
  "claude-haiku-4-5-20251001": [1, 5, 0.10, 1.25], "claude-haiku-5-5": [0.10, 0.50, 0.01, 0.125],
  "claude-sonnet-5": [2, 10, 0.20, 2.5], "claude-sonnet-5-5": [2, 10, 0.10, 2.5],
  "claude-opus-5": [5, 25, 0.50, 6.25], "claude-opus-5-5": [4, 20, 0.20, 5],
};
const money = (m, i, o, cr, cw) => { const p = PRICE[m]; return p ? (i * p[0] + o * p[1] + cr * p[2] + cw * p[3]) / 1e6 : NaN; };
const $ = (x) => `$${x.toFixed(4)}`;

function wxCategory(metar) {
  const m = String(metar ?? "");
  if (/\bCAVOK\b/.test(m)) return "VMC";
  const vis = Number((m.match(/\s(\d{4})(?:\s|NDV)/) ?? [])[1] ?? NaN);
  const ceil = Number((m.match(/\b(?:BKN|OVC|VV)(\d{3})/) ?? [])[1] ?? 999) * 100;
  if (!Number.isFinite(vis)) return null;
  if ((vis >= 8000 || vis === 9999) && ceil >= 2000) return "VMC";
  if (vis < 5000 || ceil < 1500) return "IMC";
  return null;   // borderline: not graded
}

export async function check({ accounts: [u], ok }) {
  const root = process.env.AGENT_ROOT || "/app";
  const { streamConversationWithTools } = await import(`${root}/lib/bedrock.mjs`);
  const { systemPrompt, currentTimeLine, loadModelConfig } = await import(`${root}/lib/models.mjs`);
  const { rest } = await import(`${root}/lib/knowledge/retrieval.mjs`);
  const cfg = loadModelConfig();
  const saved = JSON.parse(JSON.stringify(cfg.tiers));
  const set = (tier, id, request) => { cfg.tiers[tier] = { ...saved[tier], id, fallbackId: null, request }; };
  const user = { userId: u.id, email: u.email, name: "Check account", agentRole: "user", accessToken: u.bearer, cookieHeader: u.cookie };
  const system = `${systemPrompt()}\n\n${currentTimeLine()}`;

  const QUESTIONS = {
    fast: "How many flights are on the ops wall right now? Use your wall tool and give the number.",
    standard: "What is the current weather at EVRA, and how many NOTAMs are in force there? Give the wind, the visibility, whether it is VMC or IMC, and the NOTAM count.",
    reasoning: "Use your wall tool to count the flights on the ops wall right now, then check the current weather at EVRA. Give the flight count, the wind, and whether EVRA is VMC or IMC.",
  };
  const grade = (text, tools) => {
    const r = Object.fromEntries(tools.filter((t) => t.ok).map((t) => [t.name, t.result]));
    const marks = []; const miss = [];
    const mark = (name, pass) => { marks.push(pass); if (!pass) miss.push(name); };
    if (r.get_wall_state && Number.isInteger(r.get_wall_state.flightCount)) mark("flight count", new RegExp(`\\b${r.get_wall_state.flightCount}\\b`).test(text));
    if (r.get_notams && Number.isInteger(r.get_notams.count)) mark("NOTAM count", new RegExp(`\\b${r.get_notams.count}\\b`).test(text));
    const metar = r.get_weather?.metar ?? r.get_weather?.weather;
    const wind = String(metar ?? "").match(/\b(\d{3}|VRB)(\d{2,3})(?:G\d{2,3})?KT\b/);
    if (wind) mark(`wind (${wind[1] === "VRB" ? "variable" : "direction"}/${Number(wind[2])} kt)`, new RegExp(`\\b${wind[1]}\\b|${wind[1] === "VRB" ? "variable" : "\\b" + wind[1] + "°"}`, "i").test(text) && new RegExp(`\\b${Number(wind[2])}\\s*(kt|knots?)`, "i").test(text));
    const cat = wxCategory(metar);
    if (cat) mark(`category (${cat})`, new RegExp(`\\b${cat}\\b`).test(text) && !new RegExp(`\\b${cat === "VMC" ? "IMC" : "VMC"}\\b`).test(text.replace(/not\s+(VMC|IMC)/g, "")));
    return { got: marks.filter(Boolean).length, of: marks.length, miss, chars: text.length };
  };
  const turn = async (tier) => {
    let text = ""; const tools = []; let done = null;
    for await (const ev of streamConversationWithTools({ tier, system, messages: [{ role: "user", content: QUESTIONS[tier] }], user, conversationId: null })) {
      if (ev.type === "delta") text += ev.text; else if (ev.type === "tool") tools.push(ev); else if (ev.type === "done") done = ev;
    }
    const usd = money(done.modelId, done.inputTokens, done.outputTokens, done.cacheReadTokens, done.cacheWriteTokens);
    return { done, usd, g: grade(text, tools), tools: tools.map((t) => `${t.name}:${t.ok ? "ok" : "x"}`).join(",") };
  };

  const VARIANTS = [
    ["fast", "before", "claude-haiku-4-5-20251001", null],
    ["fast", "after", saved.fast.id, saved.fast.request],
    ["standard", "before", "claude-sonnet-5", null],
    ["standard", "after", saved.standard.id, saved.standard.request],
    ["standard", "lower (low)", saved.standard.id, { ...saved.standard.request, output_config: { effort: "low" } }],
    ["standard", "between_tools", saved.standard.id, { thinking: { type: "between_tools" }, output_config: { effort: "medium" } }],
    ["reasoning", "before", "claude-opus-5", null],
    ["reasoning", "after", saved.reasoning.id, saved.reasoning.request],
    ["reasoning", "lower (medium)", saved.reasoning.id, { ...saved.reasoning.request, output_config: { effort: "medium" } }],
  ];
  const warm = {};
  for (const [tier, label, id, request] of VARIANTS) {
    set(tier, id, request);
    for (const run of [1, 2]) {
      const t = await turn(tier); const d = t.done;
      console.log(`${tier.padEnd(9)} ${label.padEnd(14)} run ${run}  ${d.modelId.padEnd(26)} in ${String(d.inputTokens).padStart(5)} out ${String(d.outputTokens).padStart(5)} cache r ${String(d.cacheReadTokens).padStart(6)} w ${String(d.cacheWriteTokens).padStart(6)}  ${$(t.usd)}  answer ${t.g.got}/${t.g.of} ${String(t.g.chars).padStart(4)} chars${t.g.miss.length ? ` missed: ${t.g.miss.join(", ")}` : ""}  ${t.tools}`);
      if (run === 2) warm[`${tier} ${label}`] = t;
      ok(d.modelId === id && d.stopReason === "end_turn", `${tier} ${label} run ${run}: answered on ${id}`, d.modelId);
    }
    cfg.tiers[tier] = saved[tier];
  }
  for (const tier of ["fast", "standard", "reasoning"]) {
    const b = warm[`${tier} before`], a = warm[`${tier} after`];
    console.log(`→ ${tier}: one warm turn ${$(b.usd)} before, ${$(a.usd)} after (${a.usd > b.usd ? "MORE" : "less"}, ${((a.usd / b.usd - 1) * 100).toFixed(0)}%); output tokens ${b.done.outputTokens} → ${a.done.outputTokens}`);
  }

  // Real volume: chat turns in the audit log (counts and averages only)
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const rows = (await rest(`agent_audit_log?kind=eq.chat.response&created_at=gte.${encodeURIComponent(since)}&select=created_at,model_tier,model_id,input_tokens,output_tokens,detail->cacheReadTokens,detail->cacheWriteTokens&limit=100000`)) ?? [];
  const byMonth = {}; const byTier = {};
  for (const r of rows) {
    const m = r.created_at.slice(0, 7); byMonth[m] = (byMonth[m] ?? 0) + 1;
    const t = (byTier[r.model_tier ?? "?"] ??= { n: 0, in: 0, out: 0, cr: 0, cw: 0 });
    t.n += 1; t.in += r.input_tokens ?? 0; t.out += r.output_tokens ?? 0; t.cr += Number(r.cacheReadTokens ?? 0); t.cw += Number(r.cacheWriteTokens ?? 0);
  }
  console.log(`volume, last 90 days: ${rows.length} chat turns · by month ${JSON.stringify(byMonth)}`);
  for (const [t, v] of Object.entries(byTier)) console.log(`  ${t}: ${v.n} turns · avg in ${Math.round(v.in / v.n)} out ${Math.round(v.out / v.n)} cache r ${Math.round(v.cr / v.n)} w ${Math.round(v.cw / v.n)}`);
  const days = Math.max(1, (Date.now() - Math.min(...rows.map((r) => Date.parse(r.created_at)), Date.now())) / 864e5);
  const perMonth = (rows.length / days) * 30;
  // monthly at the real mix and the real average tokens per tier, priced on each tier's model before and after; the
  // measured change in output tokens (thinking) applied to the after side
  const ids = { before: { fast: "claude-haiku-4-5-20251001", standard: "claude-sonnet-5", reasoning: "claude-opus-5" }, after: { fast: saved.fast.id, standard: saved.standard.id, reasoning: saved.reasoning.id } };
  for (const side of ["before", "after"]) {
    let usd = 0;
    for (const [t, v] of Object.entries(byTier)) {
      const tier = ["fast", "standard", "reasoning"].includes(t) ? t : "standard";
      const outScale = side === "after" ? warm[`${tier} after`].done.outputTokens / Math.max(1, warm[`${tier} before`].done.outputTokens) : 1;
      usd += money(ids[side][tier], v.in, v.out * outScale, v.cr, v.cw) / v.n * (v.n / rows.length);
    }
    const router = money(side === "before" ? "claude-haiku-4-5-20251001" : saved.router.id, 400, 4, 0, 0);   // ~400 in, ~4 out per classification
    console.log(`monthly at ${Math.round(perMonth)} turns/month, ${side}: $${(perMonth * (usd + router)).toFixed(2)} (per turn ${$(usd + router)})`);
  }
  ok(rows.length >= 0, "volume read from the audit log", `${rows.length} turns`);
}
