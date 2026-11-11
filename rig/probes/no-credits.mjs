// Does "no-credits" (rig/known-failures.json) still hold? Exit 0: yes — the Anthropic account behind the rig's key has
// no credit left (the API refuses a one-token message with a credit-balance error), so every suite that needs the
// model is skipped. Exit 1: the API accepted the message (or refused it for another reason, which is a different
// cause) — the suites run again. Never prints anything of the key. The probe itself costs nothing while it holds.
//   node --env-file=.env.rig rig/probes/no-credits.mjs
const k = String(process.env.ANTHROPIC_API_KEY || "").trim();
if (!k) { console.log("does not hold: no ANTHROPIC_API_KEY in .env.rig (that is no-model-key, another cause)"); process.exit(1); }
try {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 1, messages: [{ role: "user", content: "." }] }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  const msg = String(j?.error?.message || "");
  if (r.status === 400 && /credit/i.test(msg)) { console.log("holds: the API refuses a one-token message for want of credit"); process.exit(0); }
  console.log(`does not hold: the API answered ${r.status}${msg ? ` (${msg.slice(0, 80)})` : ""}`); process.exit(1);
} catch { console.log("does not hold: the API could not be reached (another cause)"); process.exit(1); }
