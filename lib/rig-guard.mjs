// The test rig must never reach the production database. A "rig run" is any process started with the
// auth bypass (DISABLE_AUTH_FOR_TESTING=true) or a test role; such a run may only point at a local
// Supabase (127.0.0.1 / localhost). Reaching anything else needs a phrase a person types — never a
// default, never a flag that is on, never inherited from a developer's .env.
export const RIG_PHRASE = "I understand this rig run reaches the production database";

export function isRigRun(env = process.env) {
  return String(env.DISABLE_AUTH_FOR_TESTING || "").trim() === "true" || Boolean(String(env.AGENT_TEST_ROLE || "").trim());
}
export function isLocalSupabase(url) {
  try { const h = new URL(String(url || "")).hostname; return h === "127.0.0.1" || h === "localhost" || h === "host.docker.internal" || h === "supabase_kong_rig" || h.endsWith(".local"); } catch { return false; }
}
/** Returns null when the process may start, else the reason it must not. */
export function rigViolation(env = process.env) {
  if (!isRigRun(env)) return null;
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  if (isLocalSupabase(url)) return null;
  if (String(env.RIG_ALLOW_PRODUCTION || "") === RIG_PHRASE) return null;
  return `This is a rig run (DISABLE_AUTH_FOR_TESTING / AGENT_TEST_ROLE) but NEXT_PUBLIC_SUPABASE_URL is not a local Supabase (${url || "unset"}). The rig has its own database: see rig/README.md. To reach production on purpose, set RIG_ALLOW_PRODUCTION="${RIG_PHRASE}".`;
}
export function assertRigSafe(label, env = process.env) {
  const why = rigViolation(env);
  if (why) { process.stderr.write(`[${label}] REFUSING TO START: ${why}\n`); process.exit(78); }
}
