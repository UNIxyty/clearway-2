// The eight web search prompts (the user's, 2026-11-03), asked as real questions through the agent's own turn — the
// router, the tools, both providers, the two passes, the citations as the console builds them (lib/citations.mjs) — on
// production's key, as a check account (read-only, removed at the end), in the agent container. Before a deploy:
//   AGENT_CODE=checkout scripts/check-accounts.sh run agent-web-prompts
// Prints each answer AS WRITTEN, with the citation numbers placed after their claims and the mark in «», then the
// sources by class, every search (provider, pass, query, hosts), and the turn's cost. Nothing is tuned here: this is
// what Dmitry would read. The questions are about public airspace and services; no passenger or personal data.
export const ROLES = ["user"];

export const EIGHT = [
  { k: "1", title: "Official source, straightforward", q: "What does EASA's current conflict zone bulletin say about Russian airspace?" },
  { k: "2", title: "Industry source, no official equivalent", q: "Is there an FBO or GAT at EGCC for business aviation? Address and details." },
  { k: "3", title: "Regulatory question that must not be answered from memory", q: "Flight LTBS-LBBG-EDDS on a PC24 with passengers — does Bulgaria require a landing permit?" },
  { k: "4", title: "Live geopolitical, where news will beat the authorities", q: "Is Sudan's airspace open, and what overflight restrictions apply?" },
  { k: "5", title: "Nothing on the approved list, something elsewhere", q: "What do crews say about handling delays at Tamanrasset DAAT?" },
  { k: "6", title: "Nothing anywhere", q: "What are the current overflight permit requirements for the Republic of Westarctica?" },
  { k: "7", title: "The allowlist actually filters (allowed_domains = easa.europa.eu alone)", q: "What are the current restrictions on flying over Belarus?", env: { AGENT_WEB_ALLOWED: "easa.europa.eu" } },
  { k: "8a", title: "Tavily against Anthropic — question 1 on Tavily only", q: "What does EASA's current conflict zone bulletin say about Russian airspace?", env: { AGENT_WEB_PROVIDER: "tavily" } },
  { k: "8b", title: "Tavily against Anthropic — question 1 on Anthropic only", q: "What does EASA's current conflict zone bulletin say about Russian airspace?", env: { AGENT_WEB_PROVIDER: "anthropic" } },
  { k: "8c", title: "Tavily against Anthropic — question 4 on Tavily only", q: "Is Sudan's airspace open, and what overflight restrictions apply?", env: { AGENT_WEB_PROVIDER: "tavily" } },
  { k: "8d", title: "Tavily against Anthropic — question 4 on Anthropic only", q: "Is Sudan's airspace open, and what overflight restrictions apply?", env: { AGENT_WEB_PROVIDER: "anthropic" } },
];

/** Asks each prompt as a fresh conversation and prints what the person would read. Shared with agent-ten-questions. */
export async function askAll(prompts, { accounts: [u], ok }) {
  const root = process.env.AGENT_ROOT || "/app";
  process.env.AGENT_WEB_NO_SEED = "1";   // a check account writes no settings row
  const { streamConversationWithTools } = await import(`${root}/lib/bedrock.mjs`);
  const { systemPrompt, currentTimeLine } = await import(`${root}/lib/models.mjs`);
  const { routeTurn } = await import(`${root}/lib/router.mjs`);
  const { costUsd } = await import(`${root}/lib/routing.mjs`);
  const { sourcesFromToolCalls } = await import(`${root}/lib/tools/framework.mjs`);
  const { citationsToClaims } = await import(`${root}/lib/citations.mjs`);
  const user = { userId: u.id, email: u.email, name: "Check account", agentRole: "user", accessToken: u.bearer, cookieHeader: u.cookie };
  const only = String(process.env.ONLY || "").split(",").filter(Boolean);
  let total = 0;
  for (const p of prompts) {
    if (only.length && !only.includes(p.k)) continue;
    const saved = {}; for (const [k, v] of Object.entries(p.env ?? {})) { saved[k] = process.env[k]; process.env[k] = v; }
    const started = Date.now();
    let text = "", thought = "", done = null, err = null; const tools = [];
    const route = await routeTurn({ question: p.q, hasHistory: false, allowReasoning: true });
    try {
      for await (const ev of streamConversationWithTools({ tier: route.tier, system: `${systemPrompt()}\n\n${currentTimeLine()}`, messages: [{ role: "user", content: p.q }], user, conversationId: null })) {
        if (ev.type === "delta") text += ev.text;
        else if (ev.type === "thought") { if (text.endsWith(ev.text)) text = text.slice(0, text.length - ev.text.length); thought += ev.text; }
        else if (ev.type === "tool") tools.push(ev);
        else if (ev.type === "done") done = ev;
      }
    } catch (e) { err = e; }
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    const secs = Math.round((Date.now() - started) / 1000);
    console.log(`\n━━━━ ${p.k}. ${p.title}`);
    console.log(`Q: ${p.q}`);
    if (err || !done) { console.log(`FAILED: ${err?.code ?? ""} ${String(err?.message ?? "no answer").slice(0, 200)}`); ok(false, `${p.k}: answered`, err?.code ?? "no done"); continue; }
    const c = citationsToClaims({ answer: text, answerBlocks: done.answerBlocks ?? [], sources: sourcesFromToolCalls(tools), web: done.web, toolCalls: tools });
    const w = done.web ?? {};
    const usd = costUsd({ modelId: done.modelId, inputTokens: done.inputTokens, outputTokens: done.outputTokens, cacheReadTokens: done.cacheReadTokens, cacheWriteTokens: done.cacheWriteTokens, webSearches: w.anthropicSearches ?? 0, tavilySearches: w.tavilySearches ?? 0 });
    total += usd;
    console.log(`router → ${route.tier} (${route.source}) · answered on ${done.modelId} · provider ${w.provider} · ${(w.searches ?? []).length} search(es): ${w.anthropicSearches ?? 0} Anthropic, ${w.tavilySearches ?? 0} Tavily · widened: ${w.widened ? `yes, for "${w.widenedFor}"` : "no"} · $${usd.toFixed(4)} · ${secs} s${w.settings?.overridden ? ` · allowed list for this run: ${(w.settings.official ?? []).join(", ")}` : ""}`);
    for (const s of w.searches ?? []) console.log(`  search · ${s.provider} · pass ${s.pass} · "${s.query}" → ${s.results ?? "?"} result(s)${s.error ? ` (error ${s.error})` : ""}${s.hosts?.length ? `: ${s.hosts.join(", ")}` : ""}`);
    const otherTools = tools.filter((t) => !["tavily_search", "widen_web_search"].includes(t.name)).map((t) => `${t.name}${t.ok ? "" : " (failed)"}`);
    if (otherTools.length) console.log(`  other tools: ${otherTools.join(", ")}`);
    // the answer as the console shows it: [n] after each cited claim, the mark in «»
    let shown = text;
    for (const cl of [...c.claims].sort((a, b) => b.end - a.end)) shown = `${shown.slice(0, cl.end)} [${(cl.ns ?? [cl.n]).join(",")}]${cl.mark ? ` «${cl.mark}»` : ""}${shown.slice(cl.end)}`;
    console.log(`\nANSWER (as written):\n${shown.trim()}\n`);
    console.log(`SOURCES:`);
    for (const s of c.sources) console.log(`  [${s.n}] ${s.tierLabel ?? s.tier} · ${s.label}${s.published ? ` · ${s.published}` : ""}${s.href ? ` · ${s.href}` : ""}`);
    if (!c.sources.length) console.log("  (none)");
    console.log(`CLAIMS: ${c.claims.length} cited · ${c.claims.filter((x) => x.mark).length} marked · by class ${JSON.stringify(c.counts)}${c.dropped ? ` · NOT PLACED: ${c.dropped}` : ""}`);
    ok(true, `${p.k}: answered`, `${done.modelId} ${c.claims.length} claims`);
  }
  console.log(`\nTOTAL for this run: $${total.toFixed(4)}`);
}

export async function check(ctx) { return askAll(EIGHT, ctx); }
