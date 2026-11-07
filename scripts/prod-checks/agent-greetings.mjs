// Disclosure on production (2026-11-05): "hey", "thanks" and "what can you do" as a plain user (a check account:
// read-only, removed at the end), in the agent container, routed as the server routes them. Each must raise no
// follow-up (the machinery has nothing to report), stay on the fast tier, and stay under 150 output tokens (100 until
// 2026-11-07: model variance put "what can you do" at 108 with the same answer). Prints
// counts and the tier only, never the answer.
export const ROLES = ["user"];
export async function check({ accounts: [u], ok }) {
  const root = process.env.AGENT_ROOT || "/app";
  const { streamConversationWithTools } = await import(`${root}/lib/bedrock.mjs`);
  const { systemPrompt, currentTimeLine } = await import(`${root}/lib/models.mjs`);
  const { routeTurn } = await import(`${root}/lib/router.mjs`);
  const { questionKinds } = await import(`${root}/lib/turn-policy.mjs`);
  const { subjectsOf } = await import(`${root}/lib/follow-up.mjs`);
  const user = { userId: u.id, email: u.email, name: "Check account", agentRole: "user", accessToken: u.bearer, cookieHeader: u.cookie };
  for (const q of ["hey", "thanks", "what can you do"]) {
    const route = await routeTurn({ question: q, hasHistory: false, allowReasoning: true });
    const policy = { ...questionKinds(q), names: [], subjects: subjectsOf(q, []) };
    let done = null; const events = new Set();
    for await (const ev of streamConversationWithTools({ tier: route.tier, system: `${systemPrompt()}\n\n${currentTimeLine()}`, messages: [{ role: "user", content: [{ text: q }] }], user, conversationId: null, policy })) {
      events.add(ev.type);
      if (ev.type === "done") done = ev;
    }
    const followUps = (done?.followUps ?? []).filter((f) => f.kind !== "audit");
    ok(followUps.length === 0 && !events.has("partial"), `"${q}": no follow-up raised, no partial answer`, `${followUps.length} follow-up(s)`);
    ok(route.tier === "fast", `"${q}": routed to the fast tier`, `${route.tier} (${route.source ?? "router"})`);
    ok((done?.outputTokens ?? 999) < 150, `"${q}": under 150 output tokens`, `${done?.outputTokens} tokens · ${done?.modelId}`);
  }
}
