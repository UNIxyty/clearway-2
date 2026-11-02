// One real tool-using chat turn on production, as a plain user (a check account: read-only, removed at the end). Runs in
// the agent container (scripts/check-accounts.sh picks it by the agent- prefix): the agent's own turn function, the
// model on the Anthropic API, a read-only tool called with the account's own session, and the answer built from it.
// Prints the tool, the model, stop reason and token counts — no flight data.
export const ROLES = ["user"];
export async function check({ accounts: [u], ok }) {
  const { streamConversationWithTools } = await import(`${process.env.AGENT_ROOT || "/app"}/lib/bedrock.mjs`);
  const { systemPrompt, currentTimeLine } = await import(`${process.env.AGENT_ROOT || "/app"}/lib/models.mjs`);
  const user = { userId: u.id, email: u.email, name: "Check account", agentRole: "user", accessToken: u.bearer };
  let text = ""; const tools = []; let done = null;
  for await (const ev of streamConversationWithTools({ tier: "standard", system: `${systemPrompt()}\n\n${currentTimeLine()}`, messages: [{ role: "user", content: "How many flights are on the ops wall right now? Use your wall tool and give the number." }], user, conversationId: null })) {
    if (ev.type === "delta") text += ev.text;
    else if (ev.type === "tool") tools.push(ev);
    else if (ev.type === "done") done = ev;
  }
  const wall = tools.find((t) => t.name === "get_wall_state");
  ok(!!wall, "the model called a tool (get_wall_state)", tools.map((t) => t.name).join(", ") || "none");
  ok(wall?.ok === true, "the tool ran with the account's own session and returned a result", wall?.error?.code ?? "ok");
  const n = wall?.result?.flightCount;
  ok(Number.isInteger(n) && new RegExp(`\\b${n}\\b`).test(text), "the answer is built from the tool's result (it gives the tool's flight count)", Number.isInteger(n) ? "count matches" : "no count");
  ok(done?.stopReason === "end_turn" && /^claude-/.test(String(done?.modelId)), "the turn ended normally on the Anthropic API", `${done?.modelId} · in ${done?.inputTokens} out ${done?.outputTokens} · cache read ${done?.cacheReadTokens}`);
}
