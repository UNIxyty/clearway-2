// The question check alone (lib/question-check.mjs, 2026-11-04): codes against the place names written next to them,
// on production's key and our own airports data, as a check account. One fast-tier call per question; nothing is
// searched and no turn runs. Prints what the agent would do: ask (and the question it would ask) or go ahead.
//   AGENT_CODE=checkout scripts/check-accounts.sh run agent-question-check
export const ROLES = ["user"];
const QUESTIONS = [
  "Handling at Riga EVLA tomorrow, any restrictions?",
  "Handling at EVRA Riga tomorrow, any restrictions?",
  "Is fuel available at Liepaja EVRA?",
  "Night curfew at Vilnius EYVI?",
  "Flight EVRA-EVLA on a PC24, any PPR?",
  "Latvian EVRA slot rules?",
  "Overflight of Marsell FIR LFMM tomorrow?",
  "Landing at Tallinn EETN, and is URMX open?",
  "Do you need API for Hong Kong VHHH and Macao VMMC?",
];
export async function check({ accounts: [u], ok }) {
  const root = process.env.AGENT_ROOT || "/app";
  const { checkQuestion } = await import(`${root}/lib/question-check.mjs`);
  const user = { userId: u.id, email: u.email, name: "Check account", agentRole: "user", accessToken: u.bearer, cookieHeader: u.cookie };
  for (const q of QUESTIONS) {
    const r = await checkQuestion(q, user);
    console.log(`\nQ: ${q}\n   codes: ${r.codes.map((c) => `${c.code} = ${c.is ?? "?"}${c.writtenAs ? ` (written as "${c.writtenAs}")` : ""}${c.mismatch ? " MISMATCH" : ""}${c.kind === "unknown" ? " UNKNOWN" : ""}`).join("; ") || "none"}${r.fallback ? `\n   CHECK FELL BACK: ${r.fallback.reason}` : ""}`);
    console.log(r.ask ? `   → ASKS, searches nothing:\n     ${r.ask.replace(/\n/g, "\n     ")}` : "   → goes ahead (the answer must name each aerodrome with its code)");
    ok(!r.fallback, `checked: ${q.slice(0, 40)}`);
  }
}
