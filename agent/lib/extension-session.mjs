// Extension token exchange (fallback authentication for the Chrome extension).
//
// The primary path is the console's own session cookie, which Chrome attaches to the extension's requests
// because the console origin is a host permission. That is browser behaviour, not a contract: if a cookie
// policy change stops the cookie travelling, this path takes over. A console page (signed in, same origin,
// cookies always sent) asks POST /api/extension/token; the answer is a short-lived token that carries the
// user's OWN Supabase access token, sealed so only this service can read it. The extension holds it in
// memory-only storage, refreshes it before it expires, and clears it on Disconnect and sign-out. Nothing
// long-lived is ever handed out: the token dies in minutes, and the Supabase access token inside it dies on
// its own schedule (the console keeps refreshing the real session; the extension re-exchanges from a console
// tab). Every request still runs as the user — the sealed access token is what the tool layer forwards.
import crypto from "node:crypto";

export const TOKEN_TTL_MS = Number(process.env.AGENT_EXTENSION_TOKEN_TTL_MS || 15 * 60 * 1000);
const PREFIX = "cwx.";

function key() {
  const explicit = String(process.env.AGENT_EXTENSION_TOKEN_SECRET || "").trim();
  const base = explicit || String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!base) throw new Error("No key material for extension tokens (AGENT_EXTENSION_TOKEN_SECRET).");
  return crypto.createHmac("sha256", "clearway-extension-token-v1").update(base).digest(); // 32 bytes
}
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(String(s), "base64url");

/** Seal a token for this user. `accessToken` is the user's Supabase access token (from the cookie). */
export function issueExtensionToken({ userId, email, accessToken, ttlMs = TOKEN_TTL_MS }) {
  const payload = Buffer.from(JSON.stringify({ v: 1, uid: userId, email: email ?? null, at: accessToken, exp: Date.now() + ttlMs, iat: Date.now() }));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { token: `${PREFIX}${b64u(iv)}.${b64u(enc)}.${b64u(tag)}`, expiresAt: new Date(Date.now() + ttlMs).toISOString() };
}

export function isExtensionToken(bearer) { return typeof bearer === "string" && bearer.startsWith(PREFIX); }

/** Open a token. Returns the payload, or null when it is not ours, is tampered with, or has expired. */
export function openExtensionToken(token) {
  try {
    if (!isExtensionToken(token)) return null;
    const [iv, enc, tag] = token.slice(PREFIX.length).split(".").map(unb64u);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8"));
    if (payload?.v !== 1 || typeof payload.at !== "string" || !payload.uid) return null;
    if (Number(payload.exp) <= Date.now()) return null;
    return payload;
  } catch { return null; }
}

/**
 * The tool layer forwards the caller's Cookie header to the portal and the wall so they authenticate the
 * same user. A token-authenticated request has no cookie, so one is synthesised in the @supabase/ssr shape
 * from the user's own access token — the same session, the same user, nothing extra.
 */
export function cookieHeaderFor(accessToken) {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  let ref = "supabase"; try { ref = new URL(url).hostname.split(".")[0] || ref; } catch { /* keep */ }
  const session = { access_token: accessToken, refresh_token: "", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: null };
  return `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
}

// ── Which path authenticated each user last: a silent change of browser behaviour shows up here, in the
// log, rather than as user reports. ────────────────────────────────────────────────────────────────
const lastPath = new Map();
/** Returns true when the path changed for this user (the caller audits it). */
export function notePath(userId, path) {
  const prev = lastPath.get(userId);
  lastPath.set(userId, path);
  if (lastPath.size > 2000) lastPath.delete(lastPath.keys().next().value);
  return prev !== path;
}
