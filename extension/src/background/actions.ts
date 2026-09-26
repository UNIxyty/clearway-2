// The three ways content reaches the agent (§E6): selection, region capture, whole page — each an explicit
// user act, each producing a draft the panel shows as a card BEFORE anything is sent.
import { api, hmZ } from "~/shared/api";
import { LIMITS } from "~/shared/config";
import type { PageContext } from "~/shared/protocol";
import { getSession, setDraft } from "~/shared/storage";
import { hostOf } from "~/shared/sites";
import { extractPage } from "~/content/pageExtract";
import { readSelection } from "~/content/readSelection";
import { NotScriptable, assertScriptable, inject, run, send } from "./inject";
import { activeTab, tabInfo, tellPanel } from "./state";

export async function openPanel(windowId?: number) {
  try { await chrome.sidePanel.open(windowId != null ? { windowId } : { windowId: (await chrome.windows.getLastFocused()).id! }); return true; }
  catch { return false; }
}

/** Draft → storage → panel. The panel loads it into the composer; nothing is sent until Enter. */
export async function pushDraft(draft: { text?: string; pageContext?: PageContext; send?: boolean }) {
  const d = { ...draft, at: Date.now() }; await setDraft(d); tellPanel({ type: "draft", draft: d });
}

export async function askAboutSelection(tab: chrome.tabs.Tab | null, selectionText?: string | null) {
  assertScriptable(tab);
  let sel = selectionText ? { text: selectionText, title: tab.title ?? "", url: tab.url ?? "", host: hostOf(tab.url ?? ""), inEditable: false, chars: selectionText.length } : null;
  try { const read = await run(tab.id, readSelection); if (read?.text || !sel) sel = read; } catch (e) { if (!sel) throw e; }
  const text = sel?.text ?? "";
  if (!text.trim()) { await openPanel(tab.windowId); await pushDraft({ text: "" }); tellPanel({ type: "notice", text: "Nothing is selected on this page." }); return; }
  const pc: PageContext = { kind: "selection", text, chars: text.length, title: sel!.title, url: sel!.url, host: sel!.host, sentAt: new Date().toISOString(), trimmed: false };
  await openPanel(tab.windowId);
  await pushDraft({ pageContext: pc });
}

export async function sendPage(tab: chrome.tabs.Tab | null) {
  assertScriptable(tab);
  const info = await tabInfo(tab);
  if (info.status !== "approved") { tellPanel({ type: "notice", text: `${info.host} isn't on Clearway's site list, so the page can't be read.` }); return; }
  const page = await run(tab.id, extractPage);
  let text = page?.text ?? ""; let trimmed = false;
  if (text.length > LIMITS.pageChars) { text = text.slice(0, LIMITS.pageChars); trimmed = true; }
  const pc: PageContext = { kind: "page", text, chars: text.length, words: page?.words ?? 0, headings: page?.headings ?? 0, tables: page?.tables ?? 0, title: page?.title ?? tab.title ?? "", url: page?.url ?? tab.url ?? "", host: page?.host ?? hostOf(tab.url ?? ""), sentAt: new Date().toISOString(), trimmed };
  await openPanel(tab.windowId);
  await pushDraft({ pageContext: pc });
}

// ── Region capture (§E6.2) ────────────────────────────────────────────────────
export async function beginCapture(tab: chrome.tabs.Tab | null) {
  try {
    assertScriptable(tab);
    await inject(tab.id, "capture");
    await send(tab.id, { type: "capture.begin" });
  } catch (e) {
    const err = e instanceof NotScriptable ? e : new NotScriptable("cannot-script", String(e));
    await openPanel(tab?.windowId);
    tellPanel({ type: "capture.failed", reason: err.reason, diagnostic: err.diagnostic, url: tab?.url ?? "" });
    await chrome.storage.local.set({ captureFailed: { reason: err.reason, diagnostic: err.diagnostic, url: tab?.url ?? "", at: Date.now() } });
  }
}

export async function finishCapture(tabId: number, rect: { x: number; y: number; w: number; h: number } | null, dpr: number) {
  try { await finishCaptureInner(tabId, rect, dpr); }
  catch (e) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const failed = { reason: "upload", diagnostic: `capture → ${String((e as Error)?.message ?? e)}`, url: tab?.url ?? "", at: Date.now() };
    await chrome.storage.local.set({ captureFailed: failed }); tellPanel({ type: "capture.failed", ...failed });
  }
}
async function finishCaptureInner(tabId: number, rect: { x: number; y: number; w: number; h: number } | null, dpr: number) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  await openPanel(tab.windowId);
  tellPanel({ type: "capturing" });
  await new Promise((r) => setTimeout(r, 60)); // the overlay has removed itself; let the page repaint
  let dataUrl: string;
  try { dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }); }
  catch (e) {
    const diag = `tabs.captureVisibleTab → ${String((e as Error)?.message ?? e)}`;
    // Verified: a click inside the side panel grants no activeTab, and a host permission alone does not
    // allow captureVisibleTab. The shortcut, the right-click item and the toolbar click do.
    const failed = { reason: /activeTab|all_urls/.test(diag) ? "no-gesture" : "chrome-page", diagnostic: diag, url: tab.url ?? "", at: Date.now() };
    await chrome.storage.local.set({ captureFailed: failed }); tellPanel({ type: "capture.failed", ...failed }); return;
  }
  const changed = await chrome.tabs.get(tabId).catch(() => null);
  if (!changed || changed.url !== tab.url) { tellPanel({ type: "capture.failed", reason: "tab-changed", diagnostic: "The tab changed before the capture finished.", url: tab.url ?? "" }); return; }
  // The screenshot arrives as a data: URL; decoded here rather than fetched (connect-src allows the console only).
  const blob = dataUrlToBlob(dataUrl);
  const bmp = await createImageBitmap(blob);
  const scale = dpr || 1;
  const sx = rect ? Math.max(0, Math.round(rect.x * scale)) : 0, sy = rect ? Math.max(0, Math.round(rect.y * scale)) : 0;
  const sw = rect ? Math.min(bmp.width - sx, Math.round(rect.w * scale)) : bmp.width, sh = rect ? Math.min(bmp.height - sy, Math.round(rect.h * scale)) : bmp.height;
  const long = Math.max(sw, sh); const k = long > LIMITS.captureMaxPx ? LIMITS.captureMaxPx / long : 1;
  const ow = Math.max(1, Math.round(sw * k)), oh = Math.max(1, Math.round(sh * k));
  const canvas = new OffscreenCanvas(ow, oh); canvas.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, ow, oh);
  const png = await canvas.convertToBlob({ type: "image/png" });
  const tw = Math.min(ow, 320), th = Math.max(1, Math.round(oh * (tw / ow)));
  const thumb = new OffscreenCanvas(tw, th); thumb.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, tw, th);
  const thumbUrl = await blobToDataUrl(await thumb.convertToBlob({ type: "image/jpeg", quality: 0.8 }));
  const host = hostOf(tab.url ?? ""); const at = new Date().toISOString();
  const name = `capture-${host || "page"}-${hmZ(at).replace(":", "")}.png`;
  const r = await api(`/attachments?name=${encodeURIComponent(name)}`, { method: "POST", body: png, headers: { "content-type": "image/png" }, pageHost: host, timeoutMs: 30_000 }).catch(() => null);
  const body = r ? await r.json().catch(() => null) : null;
  if (!r?.ok || !body?.ok) { tellPanel({ type: "capture.failed", reason: "upload", diagnostic: `POST /api/attachments → ${r ? `HTTP ${r.status}` : "network error"}`, url: tab.url ?? "" }); return; }
  const pc: PageContext = { kind: "capture", attachmentId: body.attachment.id, bytes: png.size, width: ow, height: oh, title: tab.title ?? "", url: host, host, sentAt: at, dataUrl: thumbUrl };
  await pushDraft({ pageContext: pc });
  await send(tabId, { type: "capture.flash" });
}

export async function askAboutImage(tab: chrome.tabs.Tab | null, srcUrl: string) {
  assertScriptable(tab);
  // The page fetches its own image (it has the rights the extension does not) and hands back a data URL.
  let dataUrl: string | null = null;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [srcUrl], func: async (u: string) => { try { const b = await (await fetch(u)).blob(); return await new Promise<string>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.readAsDataURL(b); }); } catch { return null; } } });
    dataUrl = (res?.result as string | null) ?? null;
  } catch { dataUrl = null; }
  if (!dataUrl) { await openPanel(tab.windowId); tellPanel({ type: "notice", text: "That image couldn't be read from the page. Capture the region instead (⌥⇧S)." }); return; }
  const blob = dataUrlToBlob(dataUrl);
  const host = hostOf(tab.url ?? ""); const at = new Date().toISOString();
  await openPanel(tab.windowId); tellPanel({ type: "capturing" });
  const r = await api(`/attachments?name=${encodeURIComponent(`image-${host}-${hmZ(at).replace(":", "")}.${blob.type.includes("jpeg") ? "jpg" : "png"}`)}`, { method: "POST", body: blob, headers: { "content-type": blob.type || "image/png" }, pageHost: host, timeoutMs: 30_000 }).catch(() => null);
  const body = r ? await r.json().catch(() => null) : null;
  if (!r?.ok || !body?.ok) { tellPanel({ type: "capture.failed", reason: "upload", diagnostic: `POST /api/attachments → ${r ? `HTTP ${r.status}` : "network error"}`, url: tab.url ?? "" }); return; }
  await pushDraft({ pageContext: { kind: "capture", attachmentId: body.attachment.id, bytes: blob.size, title: tab.title ?? "", url: host, host, sentAt: at, dataUrl: blob.size < 400_000 ? dataUrl : undefined } });
}

function dataUrlToBlob(u: string): Blob { const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(u); if (!m) throw new Error("not a data URL"); const type = m[1] || "application/octet-stream"; if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type }); const bin = atob(m[3]); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i); return new Blob([bytes], { type }); }
async function blobToDataUrl(b: Blob) { const buf = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return `data:${b.type};base64,${btoa(s)}`; }

export async function currentTabForGesture(tab?: chrome.tabs.Tab | null) { return tab ?? (await activeTab()); }
export { getSession };
