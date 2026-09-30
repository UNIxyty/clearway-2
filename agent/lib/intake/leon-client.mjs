// Leon GraphQL client for the intake write path (cwy-cwy). Server-side only.
//
// Auth: the API-key refresh token (LEON_REFRESH_TOKEN) is exchanged for a 30-minute access token at
// /access_token/refresh/. Neither token is ever logged, returned to a browser or written to the DB.
// GraphQL errors are RETURNED (not thrown) with Leon's own message and extensions, because a refusal is a
// first-class outcome on the review screen, not an exception.
const TTL_MS = 25 * 60 * 1000;
let cached = { token: null, until: 0 };

export const leonOperator = () => String(process.env.LEON_INTAKE_OPR_ID || process.env.LEON_OPR_ID || "cwy-cwy").trim();
// LEON_API_BASE is set ONLY by the rig (rig/intake/mock-leon.mjs). Production leaves it unset.
const base = () => String(process.env.LEON_API_BASE || "").replace(/\/+$/, "") || `https://${leonOperator()}.${process.env.LEON_SANDBOX === "true" ? "sandbox.leon.aero" : "leon.aero"}`;
export const leonConfigured = () => Boolean(String(process.env.LEON_INTAKE_REFRESH_TOKEN || process.env.LEON_REFRESH_TOKEN || "").trim());

async function accessToken() {
  if (cached.token && Date.now() < cached.until) return cached.token;
  const refresh = String(process.env.LEON_INTAKE_REFRESH_TOKEN || process.env.LEON_REFRESH_TOKEN || "").trim();
  if (!refresh) throw new Error("Leon is not configured (no refresh token)");
  const form = new URLSearchParams(); form.set("refresh_token", refresh);
  const r = await fetch(`${base()}/access_token/refresh/`, { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Leon token refresh → HTTP ${r.status}`);
  const t = (await r.text()).trim();
  if (!t) throw new Error("Leon token refresh returned nothing");
  cached = { token: t, until: Date.now() + TTL_MS };
  return t;
}

/**
 * One GraphQL call. Resolves { data, errors, httpStatus, ms }. `errors` is Leon's array verbatim (message,
 * path, extensions) — callers decide what a refusal means. Network failures and timeouts THROW, because then
 * we do not know whether Leon acted (the caller must treat that as "unknown", never as "refused").
 */
export async function leonGraphql(query, variables = {}, { timeoutMs = 30000 } = {}) {
  const started = Date.now();
  const r = await fetch(`${base()}/api/graphql/`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken()}` },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(timeoutMs),
  });
  const ms = Date.now() - started;
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (r.status === 401) cached = { token: null, until: 0 };
  if (!json) return { data: null, errors: [{ message: `HTTP ${r.status}: ${text.slice(0, 200)}` }], httpStatus: r.status, ms };
  return { data: json.data ?? null, errors: json.errors ?? null, httpStatus: r.status, ms };
}
