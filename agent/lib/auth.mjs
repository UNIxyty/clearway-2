// Authentication for the agent service.
//
// The agent ACTS AS THE SIGNED-IN USER. There is no service account with
// elevated rights: the caller's Supabase session is what the agent carries, and
// anything the agent does later on the user's behalf must be reachable by that
// same user in the console. This file resolves who is calling; agent-access.mjs
// decides whether they may use the agent at all.
//
// Mechanism is deliberately identical to digital-wall/lib/auth.mjs: the portal,
// the wall and the agent are one origin, so the same @supabase/ssr cookies
// arrive here. Duplicating a security-critical cookie parser would be worse
// than sharing its shape, so this is the same logic with the same failure
// modes, verified against Supabase's /auth/v1/user.
//
// Fails CLOSED: missing Supabase config denies everything. There is no
// display-endpoint carve-out here — unlike the wall, an agent that cannot
// identify its caller has nothing safe to serve.

import crypto from "node:crypto";

const VERIFY_CACHE_TTL_MS = 60 * 1000;
const verifyCache = new Map();

function supabaseUrl() {
  return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
}
function supabaseApiKey() {
  return (
    String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  );
}
function authTestingBypass() {
  return String(process.env.DISABLE_AUTH_FOR_TESTING || "").trim() === "true";
}
export function authConfigured() {
  return Boolean(supabaseUrl() && supabaseApiKey());
}
export function describeAuthPosture() {
  if (authTestingBypass()) return "disabled (DISABLE_AUTH_FOR_TESTING=true)";
  if (!authConfigured()) return "MISCONFIGURED (Supabase URL / key not set) — failing closed, all requests denied";
  return "enabled (Supabase session required)";
}

export const MOCK_USER = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "local@clearway.aero",
  name: "Local Operator",
  initials: "LO",
  role: "ADMIN",
};

function parseCookieHeader(header) {
  const jar = new Map();
  for (const part of String(header || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
  return jar;
}

function decodeCookieValue(raw) {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  if (value.startsWith("base64-")) {
    try {
      value = Buffer.from(value.slice("base64-".length), "base64").toString("utf-8");
    } catch {
      return null;
    }
  }
  return value;
}

/** Supabase access token from a Cookie header: plain JSON, `base64-` prefixed, or `.0`/`.1` chunked. */
export function extractAccessTokenFromCookies(cookieHeader) {
  const jar = parseCookieHeader(cookieHeader);
  const groups = new Map();
  for (const [name, value] of jar.entries()) {
    const match = /^(sb-[a-z0-9]+-auth-token)(?:\.(\d+))?$/i.exec(name);
    if (!match) continue;
    const base = match[1];
    const index = match[2] === undefined ? -1 : Number(match[2]);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push({ index, value });
  }
  for (const chunks of groups.values()) {
    chunks.sort((a, b) => a.index - b.index);
    const decoded = decodeCookieValue(chunks.map((c) => c.value).join(""));
    if (!decoded) continue;
    try {
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed) && typeof parsed[0] === "string") return parsed[0];
      if (parsed && typeof parsed.access_token === "string") return parsed.access_token;
    } catch {
      /* not a JSON session cookie */
    }
  }
  return null;
}

function parseEmailList(raw) {
  return String(raw || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function roleFromMetadata(appMeta = {}, userMeta = {}) {
  const roleValue = String(appMeta.role || userMeta.role || "").toLowerCase();
  if (roleValue === "developer") return "developer";
  if (roleValue === "admin") return "admin";
  const rolesRaw = appMeta.roles || userMeta.roles;
  const roles = Array.isArray(rolesRaw) ? rolesRaw.map((v) => String(v).toLowerCase()) : [];
  if (roles.includes("developer")) return "developer";
  if (roles.includes("admin")) return "admin";
  if (appMeta.is_developer === true || userMeta.is_developer === true) return "developer";
  if (appMeta.is_admin === true || userMeta.is_admin === true) return "admin";
  return "none";
}

/**
 * The caller's platform role, resolved exactly as lib/admin-auth.ts does it —
 * this decides which TOOLS the agent may offer, so the two must not disagree.
 * Developer is a FLAG, not an admin tier: DEVELOPER_EMAILS and the explicit
 * developer signals confer it; ADMIN_EMAILS confers admin and nothing more.
 * Fails to "user" — the least privileged answer — on any lookup failure.
 */
async function resolveAgentRole(user) {
  const email = user.email ? user.email.toLowerCase() : null;
  if (email && parseEmailList(process.env.DEVELOPER_EMAILS).includes(email)) return "developer";

  const metaRole = roleFromMetadata(user.appMetadata, user.userMetadata);
  if (metaRole === "developer") return "developer";

  let prefs = null;
  try {
    const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (url && key) {
      const response = await fetch(
        `${url}/rest/v1/user_preferences?user_id=eq.${encodeURIComponent(user.userId)}&select=is_admin,is_developer&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) }
      );
      if (response.ok) prefs = (await response.json())?.[0] ?? null;
    }
  } catch {
    /* fall through: absence of a flag is not a grant */
  }
  if (prefs?.is_developer) return "developer";
  if (metaRole === "admin") return "admin";
  if (email && parseEmailList(process.env.ADMIN_EMAILS).includes(email)) return "admin";
  if (prefs?.is_admin) return "admin";
  return "user";
}

function mapSupabaseUser(payload) {
  const meta = payload.user_metadata || {};
  const email = payload.email || null;
  const name =
    String(meta.full_name || meta.name || "").trim() ||
    [meta.firstname, meta.lastname].filter(Boolean).join(" ").trim() ||
    (email ? email.split("@")[0] : "User");
  const initials =
    name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "??";
  return {
    userId: payload.id,
    email,
    name,
    initials,
    role: String(payload.app_metadata?.role || meta.role || "user"),
    appMetadata: payload.app_metadata || {},
    userMetadata: meta,
  };
}

async function verifyAccessToken(token) {
  const cacheKey = crypto.createHash("sha256").update(token).digest("hex");
  const cached = verifyCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAtMs) return cached.invalid ? null : cached.user;

  let response;
  try {
    response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
      headers: { apikey: supabaseApiKey(), authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Supabase unreachable: honour a previous positive verdict for the cache
    // window, deny anything new.
    return cached && !cached.invalid ? cached.user : null;
  }
  if (!response.ok) {
    verifyCache.set(cacheKey, { invalid: true, expiresAtMs: Date.now() + VERIFY_CACHE_TTL_MS });
    return null;
  }
  const payload = await response.json();
  if (!payload?.id) {
    verifyCache.set(cacheKey, { invalid: true, expiresAtMs: Date.now() + VERIFY_CACHE_TTL_MS });
    return null;
  }
  const user = mapSupabaseUser(payload);
  verifyCache.set(cacheKey, { user, expiresAtMs: Date.now() + VERIFY_CACHE_TTL_MS, token });
  if (verifyCache.size > 500) verifyCache.delete(verifyCache.keys().next().value);
  return user;
}

/**
 * Who is calling, or null. The caller's raw access token is returned alongside
 * the user so downstream tool calls (Parts 2+) can act AS THE USER against the
 * portal's own APIs rather than with elevated credentials.
 */
export async function authenticateRequest(req) {
  if (authTestingBypass()) {
    return {
      ...MOCK_USER,
      accessToken: null,
      cookieHeader: req.headers.cookie ?? null,
      // Local rigs stand in for whatever role is being exercised.
      agentRole: String(process.env.AGENT_TEST_ROLE || "developer"),
    };
  }
  if (!authConfigured()) return null;

  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const token = bearer || extractAccessTokenFromCookies(req.headers.cookie);
  if (!token) return null;
  const user = await verifyAccessToken(token);
  if (!user) return null;
  return {
    ...user,
    accessToken: token,
    // The caller's raw Cookie header, forwarded verbatim by the tool layer so
    // upstream services authenticate THIS USER rather than the agent.
    cookieHeader: req.headers.cookie ?? null,
    agentRole: await resolveAgentRole(user),
  };
}
