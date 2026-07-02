// Real authentication for the Digital Wall backend.
//
// The wall and console are served from the same host as the main Clearway
// portal (clearway.verxyl.com), so the portal's Supabase Auth cookies
// (`sb-<ref>-auth-token`, set by @supabase/ssr, possibly chunked `.0`/`.1`)
// arrive on every /digital-wall/* request through the nginx gateway. We parse
// the session from those cookies (or an Authorization: Bearer header) and
// verify the access token server-side against Supabase's /auth/v1/user.
//
// Degradation rules (the wall must never go dark because auth is down):
// - DISABLE_AUTH_FOR_TESTING=true  -> auth off, mock ADMIN user (local dev).
// - Supabase env missing           -> auth off, mock user, warning at boot.
// - Supabase unreachable           -> requests with a previously verified
//   token keep working for the cache TTL; new sessions fail closed (401).

import crypto from "node:crypto";

const VERIFY_CACHE_TTL_MS = 60 * 1000;
const verifyCache = new Map(); // sha256(token) -> { user, expiresAtMs } | { invalid: true, expiresAtMs }

export const MOCK_USER = {
  userId: "local-user-id",
  email: "local@clearway.aero",
  name: "Local Operator",
  initials: "LO",
  role: "ADMIN",
};

function supabaseUrl() {
  return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
}

function supabaseApiKey() {
  // The anon key is enough to call /auth/v1/user with a user's JWT; fall back
  // to the service-role key, which is already configured for operators storage.
  return (
    String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  );
}

export function authEnabled() {
  if (String(process.env.DISABLE_AUTH_FOR_TESTING || "").trim() === "true") return false;
  return Boolean(supabaseUrl() && supabaseApiKey());
}

export function describeAuthPosture() {
  if (String(process.env.DISABLE_AUTH_FOR_TESTING || "").trim() === "true") {
    return "disabled (DISABLE_AUTH_FOR_TESTING=true)";
  }
  if (!supabaseUrl() || !supabaseApiKey()) {
    return "disabled (Supabase URL / key not configured)";
  }
  return "enabled (Supabase session required)";
}

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

/**
 * Extract the Supabase access token from a Cookie header. Handles the
 * @supabase/ssr formats: plain JSON, `base64-` prefixed JSON, and cookies
 * chunked into `sb-...-auth-token.0`, `.1`, ... pieces.
 */
export function extractAccessTokenFromCookies(cookieHeader) {
  const jar = parseCookieHeader(cookieHeader);
  const groups = new Map(); // base cookie name -> [{index, value}]
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
    const raw = chunks.map((chunk) => chunk.value).join("");
    const decoded = decodeCookieValue(raw);
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

function mapSupabaseUser(payload) {
  const meta = payload.user_metadata || {};
  const email = payload.email || null;
  const name =
    String(meta.full_name || meta.name || "").trim() ||
    [meta.firstname, meta.lastname].filter(Boolean).join(" ").trim() ||
    (email ? email.split("@")[0] : "User");
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "??";
  return {
    userId: payload.id,
    email,
    name,
    initials,
    role: String(payload.app_metadata?.role || meta.role || "user"),
  };
}

async function verifyAccessToken(token) {
  const cacheKey = crypto.createHash("sha256").update(token).digest("hex");
  const cached = verifyCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAtMs) {
    return cached.invalid ? null : cached.user;
  }

  let response;
  try {
    response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
      headers: {
        apikey: supabaseApiKey(),
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Supabase unreachable: keep any previous verdict, otherwise fail closed.
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
  verifyCache.set(cacheKey, { user, expiresAtMs: Date.now() + VERIFY_CACHE_TTL_MS });
  if (verifyCache.size > 500) {
    const oldest = verifyCache.keys().next().value;
    verifyCache.delete(oldest);
  }
  return user;
}

/** Resolve the authenticated user for a request, or null. */
export async function authenticateRequest(req) {
  if (!authEnabled()) return MOCK_USER;

  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const token = bearer || extractAccessTokenFromCookies(req.headers.cookie);
  if (!token) return null;
  return verifyAccessToken(token);
}
