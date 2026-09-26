// The console's components fetch relative paths ("/agent/api/…") with credentials "same-origin" and open
// documents with window.open("/agent/doc?…"). In an extension page the origin is chrome-extension://, so
// both are rebased onto the console origin here, once, before any component loads. Cookies come from the
// console's own session (a host permission); the extension holds no token.
import { CONSOLE_ORIGIN } from "~/shared/config";

let pageHost: string | null = null;
export function setPageHost(h: string | null) { pageHost = h; }

let tokenCache: string | null = null;
const readToken = async () => { try { tokenCache = ((await chrome.storage.session.get("token")).token as { value: string } | undefined)?.value ?? null; } catch { tokenCache = null; } };
void readToken(); try { chrome.storage.onChanged.addListener((c, area) => { if (area === "session" && c.token) tokenCache = (c.token.newValue as { value: string } | undefined)?.value ?? null; }); } catch { /* no storage */ }
const native = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/") && !url.startsWith("//")) url = `${CONSOLE_ORIGIN}${url}`;
  if (!url.startsWith(CONSOLE_ORIGIN)) return native(input, init);
  const headers = new Headers(init.headers ?? (typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined));
  headers.set("x-clearway-client", "extension");
  if (tokenCache && !headers.has("authorization")) headers.set("authorization", `Bearer ${tokenCache}`);
  if (pageHost) headers.set("x-clearway-page-host", pageHost);
  headers.set("accept", headers.get("accept") ?? "application/json, text/event-stream");
  const req = typeof input === "string" || input instanceof URL ? url : new Request(url, input);
  return native(req, { ...init, headers, credentials: "include" });
}) as typeof window.fetch;

const nativeOpen = window.open.bind(window);
window.open = ((url?: string | URL, target?: string, features?: string) => {
  let u = url ? String(url) : "";
  if (u.startsWith("/") && !u.startsWith("//")) u = `${CONSOLE_ORIGIN}${u}`;
  if (/^https?:/.test(u)) { void chrome.tabs.create({ url: u }); return null; }
  return nativeOpen(url, target, features);
}) as typeof window.open;
