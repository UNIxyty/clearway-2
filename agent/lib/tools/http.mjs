// The ONLY way a tool reaches the platform.
//
// Two rules this file exists to enforce:
//
//  1. The agent acts as the SIGNED-IN USER. Every upstream call carries the
//     caller's own session — their Cookie header verbatim, plus their bearer
//     token. It never uses a service key, and never the wall's shared
//     x-debug-runner-secret, which bypasses portal auth entirely and would let
//     the agent read things its caller cannot. If the user's session cannot
//     reach an endpoint, neither can the agent on their behalf.
//
//  2. The model never issues arbitrary HTTP. Tools name a path; the model
//     names a tool. There is no tool that takes a URL.

import { ServiceUnavailable, Timeout, fromHttpStatus } from "./errors.mjs";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function portalBase() {
  return String(process.env.PORTAL_BASE_URL || "http://portal:3000").replace(/\/+$/, "");
}
function wallBase() {
  return String(process.env.DIGITAL_WALL_INTERNAL_URL || "http://digital-wall-backend:5174").replace(/\/+$/, "");
}

/**
 * Headers that make the upstream see THIS USER. The portal authenticates from
 * @supabase/ssr cookies and the wall accepts either, so forwarding the cookie
 * header verbatim covers both; the bearer is added for the wall's header path.
 */
function callerHeaders(user) {
  const headers = { accept: "application/json" };
  if (user?.cookieHeader) headers.cookie = user.cookieHeader;
  if (user?.accessToken) headers.authorization = `Bearer ${user.accessToken}`;
  return headers;
}

async function request(service, base, path, { user, method = "GET", timeoutMs = DEFAULT_TIMEOUT_MS, body = null } = {}) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: { ...callerHeaders(user), ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "manual", // a 307 to /login is an auth failure, not a page to follow
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (/timeout|abort/i.test(String(error?.name) + String(error?.message))) {
      throw Timeout(`${service} did not respond within ${Math.round(timeoutMs / 1000)}s.`, `${path}`);
    }
    throw ServiceUnavailable(`${service} is unreachable.`, `${path}: ${error?.message}`);
  }

  // The portal redirects unauthenticated requests to /login. Following that
  // would yield an HTML login page and a confusing "invalid JSON" error, so
  // it is reported for what it is.
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") || "";
    if (/\/login/.test(location)) throw fromHttpStatus(401, { service, path, body: "redirected to login" });
    throw fromHttpStatus(response.status, { service, path, body: location });
  }

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw fromHttpStatus(500, { service, path, body: "response too large" });
  }
  if (!response.ok) throw fromHttpStatus(response.status, { service, path, body: text });

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw fromHttpStatus(502, { service, path, body: text.slice(0, 200) });
  }
}

export const portalGet = (path, user, opts = {}) => request("the portal", portalBase(), path, { ...opts, user });
export const wallGet = (path, user, opts = {}) => request("the digital wall", wallBase(), path, { ...opts, user });

/** HEAD-style existence probe that never downloads a PDF body. */
export async function portalHead(path, user, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const response = await fetch(`${portalBase()}${path}`, {
      method: "HEAD",
      headers: callerHeaders(user),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: response.ok, status: response.status, contentLength: Number(response.headers.get("content-length")) || null };
  } catch {
    return { ok: false, status: 0, contentLength: null };
  }
}

export const bases = { portalBase, wallBase };
