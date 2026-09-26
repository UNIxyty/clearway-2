// Session: the console's own sign-in, observed — never copied. A poll of GET /api/extension/session tells us
// whether the console cookies still authenticate; the answer is stored, the badge/icon/menus follow it.
import { apiJson } from "~/shared/api";
import type { SessionState } from "~/shared/protocol";
import { getSession, setSession } from "~/shared/storage";
import { tellPanel } from "./state";
import { applyBadge } from "./badge";
import { updateMenus } from "./menus";

export async function refreshSession({ force = false }: { force?: boolean } = {}): Promise<SessionState> {
  const prev = await getSession();
  if (prev.status === "disconnected" && !force) return prev; // Disconnect is a deliberate act: no reconnect until the user says so
  if (!force && prev.status === "signed-in" && Date.now() - prev.checkedAt < 20_000) return prev;
  const { status, body } = await apiJson<Record<string, unknown>>("/extension/session", { timeoutMs: 12_000 });
  let next: SessionState;
  if (status === 200 && body?.ok) {
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

export async function disconnect() {
  await apiJson("/extension/disconnect", { method: "POST", body: "{}" }).catch(() => null);
  const prev = await getSession();
  await setSession({ status: "disconnected", checkedAt: Date.now(), user: prev.user ?? null });
  await chrome.storage.local.remove(["draft", "insert", "thread"]);
  await applyBadge(); await updateMenus();
  tellPanel({ type: "session", session: await getSession() });
}

export async function reconnect() { await setSession({ status: "unknown", checkedAt: 0 }); return refreshSession({ force: true }); }
