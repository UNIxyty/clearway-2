// Session: the console's own sign-in, observed — never copied. A poll of GET /api/extension/session tells us
// whether the console cookies still authenticate; the answer is stored, the badge/icon/menus follow it.
import { apiJson, getToken, setToken } from "~/shared/api";
import { CONSOLE_ORIGIN } from "~/shared/config";
import type { SessionState } from "~/shared/protocol";
import { getSession, setSession } from "~/shared/storage";
import { tellPanel } from "./state";
import { applyBadge } from "./badge";
import { updateMenus } from "./menus";

export async function refreshSession({ force = false }: { force?: boolean } = {}): Promise<SessionState> {
  const prev = await getSession();
  if (prev.status === "disconnected" && !force) return prev; // Disconnect is a deliberate act: no reconnect until the user says so
  if (!force && prev.status === "signed-in" && Date.now() - prev.checkedAt < 20_000) return prev;
  let { status, body } = await apiJson<Record<string, unknown>>("/extension/session", { timeoutMs: 12_000 });
  // 401 with no token in hand: the cookie did not authenticate (not sent, or the console is signed out).
  // Ask a signed-in console tab for a token — same origin, its cookies always travel — and try once more.
  if (status === 401 && !(await getToken()) && (await exchangeToken())) ({ status, body } = await apiJson<Record<string, unknown>>("/extension/session", { timeoutMs: 12_000 }));
  if (status === 401) await setToken(null); // a token that no longer authenticates is worthless: drop it
  let next: SessionState;
  if (status === 200 && body?.ok) {
    if (body.authPath) await chrome.storage.local.set({ authPath: body.authPath });
    next = { status: "signed-in", user: body.user as SessionState["user"], tools: (body.tools as string[]) ?? [], admins: (body.admins as SessionState["admins"]) ?? [], sites: (body.sites as SessionState["sites"]) ?? { approved: [], requests: [] }, quickActions: (body.quickActions as SessionState["quickActions"]) ?? null, replyMode: (body.replyMode as string | null) ?? null, checkedAt: Date.now() };
  } else if (status === 401 || status === 403) {
    next = { status: "signed-out", checkedAt: Date.now(), error: status === 403 ? String((body as { message?: string })?.message ?? "No access to the agent.") : null };
  } else {
    // Unreachable: keep what we knew (an old sites list is better than none) but say so.
    next = { ...prev, status: prev.status === "signed-in" ? "signed-in" : "unreachable", checkedAt: Date.now(), error: status ? `HTTP ${status}` : "offline" };
  }
  await setSession(next);
  if (prev.status !== next.status || JSON.stringify(prev.sites) !== JSON.stringify(next.sites)) { await applyBadge(); await updateMenus(); }
  tellPanel({ type: "session", session: next });
  return next;
}

/** Token exchange from a console tab (the fallback path). Returns true when a token was obtained. */
export async function exchangeToken(): Promise<boolean> {
  const tabs = await chrome.tabs.query({ url: `${CONSOLE_ORIGIN}/*` }).catch(() => [] as chrome.tabs.Tab[]);
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => { try { const res = await fetch("/agent/api/extension/token", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-clearway-client": "extension-exchange" }, body: "{}" }); const b = await res.json().catch(() => null); return res.ok && b?.ok ? { token: b.token as string, expiresAt: b.expiresAt as string } : null; } catch { return null; } } });
      const got = r?.result as { token: string; expiresAt: string } | null;
      if (got?.token) { await setToken({ value: got.token, expiresAt: got.expiresAt }); await scheduleRefresh(got.expiresAt); return true; }
    } catch { /* that tab could not be scripted; try the next */ }
  }
  return false;
}
async function scheduleRefresh(expiresAt: string) { const when = new Date(expiresAt).getTime() - 2 * 60_000; await chrome.alarms.create("token-refresh", { when: Math.max(Date.now() + 30_000, when) }); }
/** Before the token dies, ask for a fresh one; if refused, re-exchange from a console tab. */
export async function refreshToken() {
  const tok = await getToken(); if (!tok) return;
  const { status, body } = await apiJson<{ ok: boolean; token: string; expiresAt: string }>("/extension/token/refresh", { method: "POST", body: "{}", timeoutMs: 12_000 });
  if (status === 200 && body?.ok) { await setToken({ value: body.token, expiresAt: body.expiresAt }); await scheduleRefresh(body.expiresAt); return; }
  await setToken(null);
  await exchangeToken();
}

export async function disconnect() {
  await apiJson("/extension/disconnect", { method: "POST", body: "{}" }).catch(() => null);
  await setToken(null); await chrome.alarms.clear("token-refresh");
  const prev = await getSession();
  await setSession({ status: "disconnected", checkedAt: Date.now(), user: prev.user ?? null });
  await chrome.storage.local.remove(["draft", "insert", "thread"]);
  await applyBadge(); await updateMenus();
  tellPanel({ type: "session", session: await getSession() });
}

export async function reconnect() { await setSession({ status: "unknown", checkedAt: 0 }); return refreshSession({ force: true }); }
