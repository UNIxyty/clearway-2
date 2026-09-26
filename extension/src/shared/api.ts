// The agent API from an extension context. Cookies of the console origin are attached by Chrome because the
// origin is a host permission; the extension holds no token of its own. Every request says it is the extension.
import { AGENT_API } from "./config";

export type ApiInit = RequestInit & { pageHost?: string | null; timeoutMs?: number };

// Fallback token (see agent/lib/extension-session.mjs): memory-only storage, never chrome.storage.local.
export async function getToken(): Promise<string | null> { try { return ((await chrome.storage.session.get("token")).token as { value: string; expiresAt: string } | undefined)?.value ?? null; } catch { return null; } }
export async function setToken(t: { value: string; expiresAt: string } | null) { try { if (t) await chrome.storage.session.set({ token: t }); else await chrome.storage.session.remove("token"); } catch { /* no session storage */ } }

export async function api(path: string, init: ApiInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  headers.set("x-clearway-client", "extension");
  // The console's cookie is primary; a token, when held, rides along and the server uses it only when
  // the cookie did not arrive.
  const token = await getToken(); if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  if (init.pageHost) headers.set("x-clearway-page-host", init.pageHost);
  if (init.body && typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init.timeoutMs ?? 20_000);
  try {
    return await fetch(`${AGENT_API}${path}`, { ...init, headers, credentials: "include", cache: "no-store", signal: init.signal ?? ctl.signal });
  } finally { clearTimeout(t); }
}
export async function apiJson<T = Record<string, unknown>>(path: string, init: ApiInit = {}): Promise<{ status: number; body: T | null }> {
  try { const r = await api(path, init); const body = (await r.json().catch(() => null)) as T | null; return { status: r.status, body }; }
  catch (e) { return { status: 0, body: null }; }
}
export const hmZ = (iso: string | number | Date = Date.now()) => { const d = new Date(iso); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`; };
