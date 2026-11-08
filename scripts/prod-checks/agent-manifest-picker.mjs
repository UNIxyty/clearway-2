// The flight picker's manifest request is researched, not questioned, for a registration like D-IMOI (2026-11-09).
// The question check took "IMOI" in "D-IMOI" for an airport code and answered "I don't recognise IMOI as an ICAO code"
// instead of making the manifest. Runs the agent's own question check, in the agent container, on the picker's exact
// sentence (invented flight number; real airports); no manifest is made, so no passenger data is touched. A check
// account, plain user, read-only, removed at the end. Prints codes and booleans only.
export const ROLES = ["user"];
export async function check({ accounts: [u], ok }) {
  const root = process.env.AGENT_ROOT || "/app";
  const { candidateCodes, checkQuestion } = await import(`${root}/lib/question-check.mjs`);
  const user = { userId: u.id, email: u.email, name: "Check account", agentRole: "user", accessToken: u.bearer, cookieHeader: u.cookie };
  for (const reg of ["D-IMOI", "G-ABCD", "OE-GLL"]) {
    const q = `Make the passenger manifest for CHK240 · ${reg} · EVRA → EETN · Mon 09 Nov · 10:05Z · Clearway (CWY) (flight_id cwy-cwy:1)`;
    const codes = candidateCodes(q);
    ok(JSON.stringify(codes) === JSON.stringify(["EVRA", "EETN"]), `${reg}: the registration is not taken for an airport code`, codes.join(", "));
    const r = await checkQuestion(q, user);
    ok(!r.ask && !r.fallback, `${reg}: no question back, the manifest request goes ahead`, r.ask ? "asked a question" : r.fallback ? `fallback ${r.fallback.kind}` : "no question");
  }
}
