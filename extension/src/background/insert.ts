// Insert into page (§E9), brokered here so it survives panel closes: the page draws the preview and does
// the one plain-text edit; the panel shows the confirmation and the records; the server logs every step.
import { apiJson } from "~/shared/api";
import { LIMITS } from "~/shared/config";
import type { InsertState } from "~/shared/protocol";
import { getInsert, setInsert } from "~/shared/storage";
import { activeTab, tabInfo, tellPanel } from "./state";
import { NotScriptable, inject, send } from "./inject";

async function log(i: InsertState, result: "inserted" | "undone" | "cancelled") {
  await apiJson("/extension/insert-log", { method: "POST", body: JSON.stringify({ host: i.host, field: i.field?.label ?? "field", characters: i.characters ?? i.text.length, result, verbatim: i.verbatim ?? null, conversationId: i.conversationId ?? null }), pageHost: i.host }).catch(() => null);
}
async function save(i: InsertState | null) { await setInsert(i); tellPanel({ type: "insert", insert: i }); if (i?.status === "inserted" && i.undoUntil) await chrome.alarms.create("insert-undo", { when: new Date(i.undoUntil).getTime() + 200 }); }

/** Step 2 — Review: preview in the page, confirmation in the panel. Approved sites only (it needs a script in the page). */
export async function review({ text, verbatim, conversationId }: { text: string; verbatim?: string | null; conversationId?: string | null }) {
  const tab = await activeTab();
  const info = await tabInfo(tab);
  const id = `ins-${Date.now().toString(36)}`;
  const base: InsertState = { id, tabId: tab?.id ?? -1, host: info.host, text, verbatim: verbatim ?? null, conversationId: conversationId ?? null, status: "review" };
  if (!tab?.id || !info.scriptable) { await save({ ...base, status: "cancelled", cancelReason: "Chrome doesn't let extensions write into its own pages." }); return; }
  if (info.status !== "approved") { await save({ ...base, status: "cancelled", cancelReason: `${info.host} isn't on Clearway's site list. Inserting into a page works on approved sites only.` }); return; }
  try { await inject(tab.id, "insert"); } catch (e) { await save({ ...base, status: "cancelled", cancelReason: e instanceof NotScriptable ? e.diagnostic : String(e) }); return; }
  let r = await send<{ ok: boolean; reason?: string; field?: InsertState["field"]; after?: string }>(tab.id, { type: "insert.preview", id, text });
  if (!r) { await save({ ...base, status: "cancelled", cancelReason: "The page didn't answer." }); return; }
  if (!r.ok && r.reason === "noTarget") {
    await save({ ...base, status: "picking" });
    r = await send<{ ok: boolean; reason?: string; field?: InsertState["field"]; after?: string }>(tab.id, { type: "insert.pick", id });
    if (!r?.ok) { await save({ ...base, status: "cancelled", cancelReason: r?.reason === "cancelled" ? "You cancelled." : "No field was chosen." }); return; }
  } else if (!r.ok) { await save({ ...base, status: "cancelled", cancelReason: r.reason === "notEditable" ? "The field you last clicked can't be typed into." : "The page refused the preview." }); return; }
  await save({ ...base, status: "review", field: r.field ?? { label: "field", kind: "input" }, after: r.after ?? "" });
}

/** Step 3 — Insert, on ⌘⏎ or the button. One edit, plain text, never submits. */
export async function commit(id: string) {
  const i = await getInsert(); if (!i || i.id !== id || i.status !== "review") return;
  const r = await send<{ ok: boolean; characters?: number; reason?: string }>(i.tabId, { type: "insert.commit", id });
  if (!r?.ok) { await save({ ...i, status: "cancelled", cancelReason: r?.reason === "targetLost" ? "The field this was going into is gone." : "The page couldn't take the text." }); await log(i, "cancelled"); return; }
  const now = Date.now();
  const next: InsertState = { ...i, status: "inserted", characters: r.characters ?? i.text.length, insertedAt: new Date(now).toISOString(), undoUntil: new Date(now + LIMITS.undoSeconds * 1000).toISOString() };
  await save(next); await log(next, "inserted");
}

export async function undo(id: string, from: "panel" | "page") {
  const i = await getInsert(); if (!i || i.id !== id || i.status !== "inserted") return;
  if (from === "panel") { const r = await send<{ ok: boolean }>(i.tabId, { type: "insert.undo", id }); if (!r?.ok) { await save({ ...i, undoUntil: undefined }); return; } }
  const next: InsertState = { ...i, status: "undone", undoUntil: undefined };
  await save(next); await log(next, "undone");
}

export async function cancel(id: string, reason: string, tellPage = true) {
  const i = await getInsert(); if (!i || i.id !== id) return;
  if (i.status === "inserted" || i.status === "undone" || i.status === "cancelled") return;
  if (tellPage) await send(i.tabId, { type: "insert.cancel", id });
  const next: InsertState = { ...i, status: "cancelled", cancelReason: reason };
  await save(next); await log(next, "cancelled");
}

/** Events from the page script. */
export async function onPageEvent(tabId: number, id: string, event: string, detail?: Record<string, unknown>) {
  const i = await getInsert(); if (!i || i.id !== id) return;
  if (i.tabId !== tabId) return;
  if (event === "targetLost") await cancel(id, "The field this was going into is gone.", false);
  else if (event === "fieldChanged") await cancel(id, "The field changed.", false);
  else if (event === "undoExpired") { if (i.status === "inserted") await save({ ...i, undoUntil: undefined }); }
  else if (event === "undone") { if (i.status === "inserted") { const next: InsertState = { ...i, status: "undone", undoUntil: undefined }; await save(next); await log(next, "undone"); } }
  else if (event === "inserted") { if (i.status === "review" && detail?.characters) await save({ ...i, characters: Number(detail.characters) }); }
}

/** A navigation or a closed tab while reviewing cancels the insert (§E9). */
export async function onTabGone(tabId: number, navigated: boolean) {
  const i = await getInsert(); if (!i || i.tabId !== tabId) return;
  if (i.status === "review" || i.status === "picking") await cancel(i.id, navigated ? "The field this was going into is gone." : "The tab was closed.", false);
  else if (i.status === "inserted" && i.undoUntil) await save({ ...i, undoUntil: undefined });
}
export async function onUndoAlarm() { const i = await getInsert(); if (i?.status === "inserted" && i.undoUntil && new Date(i.undoUntil).getTime() <= Date.now() + 300) await save({ ...i, undoUntil: undefined }); }
