// Typed wrappers over chrome.storage. The service worker keeps nothing in memory across events.
import { DEFAULT_SETTINGS, type Draft, type InsertState, type PendingState, type SessionState, type Settings } from "./protocol";

const local = () => chrome.storage.local;
const sync = () => chrome.storage.sync;

export async function getSession(): Promise<SessionState> { return ((await local().get("session")).session as SessionState) ?? { status: "unknown", checkedAt: 0 }; }
export async function setSession(s: SessionState) { await local().set({ session: s }); }
export async function getSettings(): Promise<Settings> { try { return { ...DEFAULT_SETTINGS, ...((await sync().get("settings")).settings as Partial<Settings>) }; } catch { return DEFAULT_SETTINGS; } }
export async function setSettings(patch: Partial<Settings>) { const cur = await getSettings(); await sync().set({ settings: { ...cur, ...patch } }); }
export async function getPending(): Promise<PendingState> { return ((await local().get("pending")).pending as PendingState) ?? { confirmations: [], jobs: [], approvedSites: [], notamReview: 0 }; }
export async function setPending(p: PendingState) { await local().set({ pending: p }); }
export async function getThread(): Promise<{ conversationId: string | null }> { return ((await local().get("thread")).thread as { conversationId: string | null }) ?? { conversationId: null }; }
export async function setThread(conversationId: string | null) { await local().set({ thread: { conversationId } }); }
export async function getDraft(): Promise<Draft | null> { return ((await local().get("draft")).draft as Draft) ?? null; }
export async function setDraft(d: Draft | null) { if (d) await local().set({ draft: d }); else await local().remove("draft"); }
export async function getInsert(): Promise<InsertState | null> { return ((await local().get("insert")).insert as InsertState) ?? null; }
export async function setInsert(i: InsertState | null) { if (i) await local().set({ insert: i }); else await local().remove("insert"); }
export async function getFlag(key: string): Promise<boolean> { return Boolean(((await local().get("explained")).explained as Record<string, boolean>)?.[key]); }
export async function setFlag(key: string, v: boolean) { const cur = ((await local().get("explained")).explained as Record<string, boolean>) ?? {}; await local().set({ explained: { ...cur, [key]: v } }); }
