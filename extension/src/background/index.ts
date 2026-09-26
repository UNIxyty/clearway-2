// Clearway Ops Agent — service worker. Ephemeral by design: every handler re-reads chrome.storage, alarms
// carry the timers, and nothing here assumes it ran before. Wires Chrome's events to the modules.
import { getInsert, getPending, getSession, getSettings, getThread, setFlag, setThread } from "~/shared/storage";
import { hostOf, isChromePage } from "~/shared/sites";
import { activeTab, panelOpen, ports, tabInfo, tellPanel } from "./state";
import { disconnect, reconnect, refreshSession } from "./session";
import { addPendingConfirmations, applyBadge, clearJobs, markSiteEnabled, pollBadge, prunePending, settleConfirmation } from "./badge";
import { MENU, createMenus, updateMenus } from "./menus";
import { installOmnibox } from "./omnibox";
import { notify, onNotificationClick } from "./notifications";
import { askAboutImage, askAboutSelection, beginCapture, finishCapture, openPanel, pushDraft, sendPage } from "./actions";
import * as insert from "./insert";
import * as voice from "./voice";
import { inject, send } from "./inject";

// The toolbar icon does one thing: it opens the panel. No popup (§E1).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(async () => {
  await createMenus();
  await chrome.alarms.create("session", { periodInMinutes: 1 });
  await chrome.alarms.create("badge", { periodInMinutes: 2 });
  await refreshSession({ force: true });
  await applyBadge();
});
chrome.runtime.onStartup.addListener(async () => { await createMenus(); await refreshSession({ force: true }); await applyBadge(); });
// Every start of the worker: draw the badge from stored state (a pending confirmation must survive a restart).
void (async () => { await prunePending(); await applyBadge(); })();

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "session") { await refreshSession(); }
  else if (a.name === "badge") { await pollBadge(); }
  else if (a.name === "pending-expiry") { await prunePending(); await applyBadge(); }
  else if (a.name === "insert-undo") { await insert.onUndoAlarm(); }
  else if (a.name === "voice-hide") { await voice.onHideAlarm(); }
});

// ── Commands (§E15): the four Chrome shortcuts. Each is a user gesture. ───────────────────────────────
chrome.commands.onCommand.addListener(async (command, tab) => {
  const t = tab ?? (await activeTab());
  const session = await getSession();
  if (session.status !== "signed-in") { await openPanel(t?.windowId); return; }
  if (command === "voice-toggle") await voice.toggle(t);
  else if (command === "capture-region") await beginCapture(t);
  else if (command === "ask-selection") { try { await askAboutSelection(t); } catch (e) { await openPanel(t?.windowId); tellPanel({ type: "notice", text: "Chrome doesn't let extensions read its own pages. Paste the text instead." }); } }
});

// ── Context menus ────────────────────────────────────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const t = tab ?? (await activeTab());
  switch (info.menuItemId) {
    case MENU.askSelection: try { await askAboutSelection(t, info.selectionText ?? null); } catch { await openPanel(t?.windowId); } break;
    case MENU.sendPage: case MENU.aSend: try { await sendPage(t); } catch { await openPanel(t?.windowId); tellPanel({ type: "notice", text: "This page can't be read." }); } break;
    case MENU.capture: case MENU.aCapture: await beginCapture(t); break;
    case MENU.askImage: if (info.srcUrl) { try { await askAboutImage(t, info.srcUrl); } catch { await openPanel(t?.windowId); } } break;
    case MENU.aOpen: await openPanel(t?.windowId); break;
    case MENU.aSettings: await openPanel(t?.windowId); await chrome.storage.local.set({ openView: "settings" }); tellPanel({ type: "view", view: "settings" }); break;
  }
});

// ── Omnibox ──────────────────────────────────────────────────────────────────────────────────────────
installOmnibox(async (text) => { const t = await activeTab(); await openPanel(t?.windowId); await pushDraft({ text }); });

// ── Notifications ────────────────────────────────────────────────────────────────────────────────────
onNotificationClick(async (id) => {
  const w = await chrome.windows.getLastFocused().catch(() => null);
  if (w?.id) { await chrome.windows.update(w.id, { focused: true }).catch(() => {}); await openPanel(w.id); }
  tellPanel({ type: "focus", kind: id.startsWith("cw-confirm-") ? "confirmation" : "job", token: id.replace(/^cw-(confirm|job)-/, "") });
});

// ── Tabs: the tab bar follows the active tab; the pill lives only on approved hosts ───────────────────
async function tabChanged(tabId: number | null, why: "activated" | "updated") {
  const tab = tabId != null ? await chrome.tabs.get(tabId).catch(() => null) : await activeTab();
  if (!tab) return;
  const act = await activeTab(); if (act?.id !== tab.id) return;
  const info = await tabInfo(tab);
  tellPanel({ type: "tab", tab: info });
  await updateMenus(tab);
  if (why === "updated" && tab.status === "complete" && info.status === "approved") {
    const settings = await getSettings();
    if (settings.pill && tab.id) { try { await inject(tab.id, "pill"); await send(tab.id, { type: "pill.config", enabled: true }); } catch { /* not scriptable after all */ } }
  }
}
chrome.tabs.onActivated.addListener(({ tabId }) => void tabChanged(tabId, "activated"));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url) void insert.onTabGone(tabId, true);
  if (change.status === "complete" || change.url || change.title) void tabChanged(tabId, change.status === "complete" ? "updated" : "activated");
  void tab;
});
chrome.tabs.onRemoved.addListener((tabId) => { void insert.onTabGone(tabId, false); });
chrome.windows.onFocusChanged.addListener(() => void tabChanged(null, "activated"));

// ── Messages from content scripts and the offscreen document ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: Record<string, unknown>, sender, reply) => {
  if (!msg || typeof msg.type !== "string" || msg.target === "offscreen") return false;
  const tabId = sender.tab?.id ?? null;
  (async () => {
    const t = String(msg.type);
    if (t === "pill.ask" && sender.tab) { await askAboutSelection(sender.tab, String(msg.text ?? "")); }
    else if (t === "selection.changed" && tabId != null) { const act = await activeTab(); if (act?.id === tabId) tellPanel({ type: "selection", has: Boolean(msg.has) }); }
    else if (t === "capture.region" && tabId != null) await finishCapture(tabId, msg.rect as { x: number; y: number; w: number; h: number }, Number(msg.dpr) || 1);
    else if (t === "capture.full" && tabId != null) await finishCapture(tabId, null, Number(msg.dpr) || 1);
    else if (t === "capture.cancel") { /* nothing captured, nothing sent */ }
    else if (t === "insert.event" && tabId != null) await insert.onPageEvent(tabId, String(msg.id), String(msg.event), msg.detail as Record<string, unknown>);
    else if (t === "voicebar.action" && tabId != null) await voice.onBarAction(tabId, String(msg.action));
    else if (t.startsWith("offscreen.")) await voice.onOffscreenEvent(msg);
  })().then(() => reply({ ok: true })).catch((e) => reply({ ok: false, error: String(e) }));
  return true;
});

// ── The side panel's port ─────────────────────────────────────────────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sidepanel") return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(async (msg: Record<string, unknown>) => {
    const t = String(msg.type);
    if (t === "panel.ready") {
      const session = await refreshSession();
      port.postMessage({ type: "session", session });
      port.postMessage({ type: "tab", tab: await tabInfo(await activeTab(), session) });
      port.postMessage({ type: "pending", pending: await getPending() });
      port.postMessage({ type: "insert", insert: await getInsert() });
      port.postMessage({ type: "thread.changed", conversationId: (await getThread()).conversationId });
      const ov = (await chrome.storage.local.get("openView")).openView; if (ov) { await chrome.storage.local.remove("openView"); port.postMessage({ type: "view", view: ov }); }
      const cf = (await chrome.storage.local.get("captureFailed")).captureFailed as { reason: string; diagnostic: string; url: string; at: number } | undefined;
      if (cf && Date.now() - cf.at < 30_000) { await chrome.storage.local.remove("captureFailed"); port.postMessage({ type: "capture.failed", ...cf }); }
      await clearJobs();
    }
    else if (t === "session.refresh") { const session = await refreshSession({ force: true }); port.postMessage({ type: "session", session }); port.postMessage({ type: "tab", tab: await tabInfo(await activeTab(), session) }); }
    else if (t === "session.reconnect") { port.postMessage({ type: "session", session: await reconnect() }); }
    else if (t === "session.disconnect") { await disconnect(); }
    else if (t === "panel.thread") { await setThread((msg.conversationId as string | null) ?? null); }
    else if (t === "panel.pending") {
      const list = (msg.confirmations as { token: string; what: string | null; expiresAt: string | null; conversationId: string | null; toolName: string }[]) ?? [];
      const added = await addPendingConfirmations(list.map((c) => ({ ...c, fromThisBrowser: true })));
      if (added && list.length) await notify("confirmation", { what: list[0].what, expiresAt: list[0].expiresAt, token: list[0].token });
    }
    else if (t === "panel.settled") await settleConfirmation(String(msg.token));
    else if (t === "panel.action") {
      const tab = await activeTab(); const action = String(msg.action);
      if (action === "region") await beginCapture(tab);
      else if (action === "page") { try { await sendPage(tab); } catch { port.postMessage({ type: "notice", text: "This page can't be read." }); } }
      else if (action === "selection") { try { await askAboutSelection(tab); } catch { port.postMessage({ type: "notice", text: "This page can't be read." }); } }
      else if (action === "tab") port.postMessage({ type: "tab", tab: await tabInfo(tab) });
      else if (action === "site-enabled") { await markSiteEnabled(String(msg.host ?? "")); await refreshSession({ force: true }); port.postMessage({ type: "tab", tab: await tabInfo(tab) }); await tabChanged(tab?.id ?? null, "updated"); }
      else if (action === "pill-setting") { const on = Boolean(msg.enabled); for (const tb of await chrome.tabs.query({})) if (tb.id) void send(tb.id, { type: "pill.config", enabled: on }); }
      else if (action === "explained") await setFlag(String(msg.key), true);
      else if (action === "open-console") await chrome.tabs.create({ url: String(msg.url) });
    }
    else if (t === "panel.insert") {
      const action = String(msg.action);
      if (action === "review") await insert.review({ text: String(msg.text ?? ""), verbatim: (msg.verbatim as string | null) ?? null, conversationId: (msg.conversationId as string | null) ?? null });
      else if (action === "commit") await insert.commit(String(msg.id));
      else if (action === "undo") await insert.undo(String(msg.id), "panel");
      else if (action === "cancel") await insert.cancel(String(msg.id), "You cancelled.");
    }
    else if (t === "panel.mic-test") { await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["USER_MEDIA" as chrome.offscreen.Reason], justification: "Microphone test from Settings." }).catch(() => {}); }
  });
});
// Relay offscreen mic-test levels to the panel as well.
chrome.runtime.onMessage.addListener((msg: Record<string, unknown>) => { if (msg?.type === "offscreen.mic.level") tellPanel({ type: "mic.level", level: msg.level }); return false; });

export { hostOf, isChromePage, panelOpen };
