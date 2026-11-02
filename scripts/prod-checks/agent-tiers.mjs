// Every model tier on production's key, as a plain user (a check account: read-only, removed at the end). Runs in the
// agent container; with AGENT_CODE=checkout it runs this checkout's agent code, so a generation change is proven before
// it is deployed (2026-11-03: every tier onto the newest model in its family). For each tier: the model that actually
// answered (not a fallback), and for the chat tiers a real read-only tool call answered from its result. Prints models,
// stop reasons, token counts and cost — no flight data.
export const ROLES = ["user"];
export async function check({ accounts: [u], ok }) {
  const root = process.env.AGENT_ROOT || "/app";
  const { streamConversationWithTools, converseOnce } = await import(`${root}/lib/bedrock.mjs`);
  const { systemPrompt, currentTimeLine, loadModelConfig } = await import(`${root}/lib/models.mjs`);
  const { routeTurn } = await import(`${root}/lib/router.mjs`);
  const { costUsd } = await import(`${root}/lib/routing.mjs`);
  const tiers = loadModelConfig().tiers;
  const want = (t) => tiers[t].id;
  const usd = (d) => `$${costUsd({ modelId: d.modelId, inputTokens: d.inputTokens ?? 0, outputTokens: d.outputTokens ?? 0, cacheReadTokens: d.cacheReadTokens ?? 0 }).toFixed(4)}`;
  console.log(`tiers: router ${want("router")} · fast ${want("fast")} · standard ${want("standard")} · reasoning ${want("reasoning")} · extraction ${want("extraction")}`);

  // router: the classifier answers on its own model (an outage falls back to "standard" silently, so the source is checked)
  for (const [q, allowed] of [["What time is it in UTC?", ["fast", "standard"]], ["Compare the slot rules and the NOTAMs for three airports and tell me which conflict", ["standard", "reasoning"]]]) {
    const r = await routeTurn({ question: q, allowReasoning: true });
    ok(r.source !== "fallback" && r.source !== "unparsed" && r.routerModelId === want("router") && allowed.includes(r.routerTier), `router on ${want("router")} classified a question (${r.routerTier})`, `${r.source} · ${r.routerModelId} · ${r.routerLatencyMs} ms`);
  }

  // fast, standard, reasoning: one real tool turn each, with the account's own session
  const user = { userId: u.id, email: u.email, name: "Check account", agentRole: "user", accessToken: u.bearer, cookieHeader: u.cookie };
  const system = `${systemPrompt()}\n\n${currentTimeLine()}`;
  for (const [tier, question] of [
    ["fast", "How many flights are on the ops wall right now? Use your wall tool and give the number."],
    ["standard", "How many flights are on the ops wall right now? Use your wall tool and give the number."],
    ["reasoning", "Use your wall tool to count the flights on the ops wall right now, then check the current weather at EVRA with your weather tool. Give the flight count and say whether EVRA is VMC or IMC."],
  ]) {
    let text = ""; const tools = []; let done = null;
    for await (const ev of streamConversationWithTools({ tier, system, messages: [{ role: "user", content: question }], user, conversationId: null })) {
      if (ev.type === "delta") text += ev.text; else if (ev.type === "tool") tools.push(ev); else if (ev.type === "done") done = ev;
    }
    const wall = tools.find((t) => t.name === "get_wall_state" && t.ok);
    if (tier === "reasoning") ok(tools.some((t) => t.name === "get_weather" && t.ok), "reasoning: the weather tool ran too, and the round after the tools was accepted with the model's thinking sent back", tools.map((t) => `${t.name}:${t.ok ? "ok" : t.error?.code ?? t.error}`).join(", "));
    const n = wall?.result?.flightCount;
    ok(done?.modelId === want(tier) && done.stopReason === "end_turn", `${tier}: the turn ran on ${want(tier)} and ended normally`, `${done?.modelId} · ${done?.stopReason} · in ${done?.inputTokens} out ${done?.outputTokens} cache ${done?.cacheReadTokens} · ${done ? usd(done) : ""}`);
    ok(!!wall && Number.isInteger(n) && new RegExp(`\\b${n}\\b`).test(text), `${tier}: a tool ran with the account's session and the answer gives its result`, tools.map((t) => `${t.name}:${t.ok ? "ok" : t.error?.code ?? t.error}`).join(", ") || "no tool");
  }

  // extraction: the intake extractor's call shape (temperature 0 asked, which the 5.5 models no longer take), invented text
  const ex = await converseOnce({ tier: "extraction", system: "Return only a JSON object {\"registration\": string, \"arrival\": ICAO string}.", messages: [{ role: "user", content: [{ text: "Handling request: aircraft YL-RIG arriving EVRA tomorrow 14:00Z, departing 18:00Z. Invented test message." }] }], maxTokens: 16000, temperature: 0 });
  let j = null; try { j = JSON.parse(String(ex.text).replace(/^```(json)?|```$/gm, "").trim()); } catch { /* reported below */ }
  ok(ex.modelId === want("extraction") && j?.registration === "YL-RIG" && j?.arrival === "EVRA", `extraction: ${want("extraction")} returned the JSON asked for`, `${ex.modelId} · in ${ex.inputTokens} out ${ex.outputTokens}`);
}
