// Voice with the panel closed (§E8): the bar is drawn by a content script, the microphone lives in the
// offscreen document, the question goes to the same thread as the panel, and the answer is spoken from the
// offscreen document. Press to start; press again, Enter, or a 1.5 s pause sends; Esc discards. Nothing acts
// on a partial transcript, and a spoken answer never confirms anything (§3 rule 9).
import { api, apiJson } from "~/shared/api";
import { LIMITS } from "~/shared/config";
import type { VoiceBarState } from "~/shared/protocol";
import { getSession, getThread, setDraft, setThread } from "~/shared/storage";
import { hostOf } from "~/shared/sites";
import { addPendingConfirmations } from "./badge";
import { NotScriptable, assertScriptable, inject, send } from "./inject";
import { openPanel } from "./actions";
import { panelOpen, tellPanel } from "./state";

type VoiceState = { active: boolean; tabId: number; windowId: number; phase: "invoked" | "listening" | "processing" | "answer" | "error"; text: string; tail: string; startedAt: number; host: string; language: string | null; hideAt?: number };
const get = async (): Promise<VoiceState | null> => ((await chrome.storage.local.get("voice")).voice as VoiceState) ?? null;
const set = async (v: VoiceState | null) => { if (v) await chrome.storage.local.set({ voice: v }); else await chrome.storage.local.remove("voice"); };

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.().catch(() => false);
  if (!has) await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["USER_MEDIA" as chrome.offscreen.Reason, "AUDIO_PLAYBACK" as chrome.offscreen.Reason], justification: "Microphone capture and spoken replies for voice questions while the side panel is closed. Audio is transcribed and discarded." });
}
const off = (msg: Record<string, unknown>) => chrome.runtime.sendMessage({ target: "offscreen", ...msg }).catch(() => null);
const bar = (tabId: number, state: VoiceBarState) => send(tabId, { type: "voicebar.state", ...state });

export async function toggle(tab: chrome.tabs.Tab | null) {
  const session = await getSession();
  if (session.status !== "signed-in") { await openPanel(tab?.windowId); return; }
  if (await panelOpen()) { tellPanel({ type: "voice.toggle" }); return; }
  const v = await get();
  if (v?.active) {
    if (v.phase === "invoked" || v.phase === "listening") return finish();
    if (v.phase === "answer" || v.phase === "error") return hide();
    return; // processing: nothing to toggle
  }
  try {
    assertScriptable(tab);
    await ensureOffscreen();
    await inject(tab.id, "voicebar");
    const st: VoiceState = { active: true, tabId: tab.id, windowId: tab.windowId, phase: "invoked", text: "", tail: "", startedAt: Date.now(), host: hostOf(tab.url ?? ""), language: null };
    await set(st);
    await bar(tab.id, { state: "invoked", bands: [] });
    await off({ type: "voice.start", language: null });
  } catch (e) {
    // Chrome's own pages: the panel opens (the shortcut is a gesture) with voice docked in the composer.
    if (e instanceof NotScriptable) { await setDraft({ at: Date.now(), text: "", voice: true } as never); await openPanel(tab?.windowId); tellPanel({ type: "voice.toggle" }); }
  }
}

/** The last events, for support: `chrome.storage.local.voiceTrace` (types only, never audio or text). */
async function trace(type: string) { const cur = ((await chrome.storage.local.get("voiceTrace")).voiceTrace as string[]) ?? []; cur.push(`${new Date().toISOString().slice(11, 19)} ${type}`); await chrome.storage.local.set({ voiceTrace: cur.slice(-40) }); }

export async function onOffscreenEvent(msg: Record<string, unknown>) {
  const v = await get(); if (!v?.active) return;
  const t = String(msg.type);
  if (t !== "offscreen.voice.level" && t !== "offscreen.tts.progress") await trace(t + (t === "offscreen.voice.error" ? ` ${String(msg.title ?? "")}` : ""));
  if (t === "offscreen.voice.level") { if (v.phase === "invoked" || v.phase === "listening") await bar(v.tabId, { state: v.phase, text: v.text, tail: v.tail, bands: msg.bands as number[], seconds: Math.floor((Date.now() - v.startedAt) / 1000) }); }
  else if (t === "offscreen.voice.partial") { v.tail = String(msg.text ?? ""); if (v.phase === "invoked" && (v.tail || v.text)) v.phase = "listening"; await set(v); await bar(v.tabId, { state: v.phase === "invoked" ? "invoked" : "listening", text: v.text, tail: v.tail, seconds: Math.floor((Date.now() - v.startedAt) / 1000) }); }
  else if (t === "offscreen.voice.segments") { v.text = String(msg.text ?? ""); if (v.text) v.phase = "listening"; await set(v); await bar(v.tabId, { state: "listening", text: v.text, tail: v.tail, seconds: Math.floor((Date.now() - v.startedAt) / 1000) }); }
  else if (t === "offscreen.voice.silence") { if (v.phase === "listening" && v.text.trim()) await finish(); }
  else if (t === "offscreen.voice.result") { await ask(String(msg.text ?? ""), (msg.language as string | null) ?? null); }
  else if (t === "offscreen.voice.error") { v.phase = "error"; await set(v); await bar(v.tabId, { state: "error", error: { title: String(msg.title ?? "Voice didn't work"), detail: String(msg.detail ?? "") } }); setTimeout(() => void hide(), 4000); }
  else if (t === "offscreen.tts.progress") { if (v.phase === "answer") { const a = (await chrome.storage.local.get("voiceAnswer")).voiceAnswer as VoiceBarState["answer"]; if (a) { const next = { ...a, spokenChars: Number(msg.spokenChars) || 0, time: Number(msg.time) || 0, duration: Number(msg.duration) || a.duration, speaking: true }; await chrome.storage.local.set({ voiceAnswer: next }); await bar(v.tabId, { state: "answer", answer: next, bands: msg.bands as number[] }); } } }
  else if (t === "offscreen.tts.ended") { const a = (await chrome.storage.local.get("voiceAnswer")).voiceAnswer as VoiceBarState["answer"]; if (a && v.phase === "answer") { const next = { ...a, spokenChars: Number.MAX_SAFE_INTEGER, speaking: false, time: a.duration }; await chrome.storage.local.set({ voiceAnswer: next }); await bar(v.tabId, { state: "answer", answer: next }); await linger(); } }
}

async function finish() {
  const v = await get(); if (!v?.active || (v.phase !== "listening" && v.phase !== "invoked")) return;
  v.phase = "processing"; await set(v);
  await bar(v.tabId, { state: "processing", text: v.text || v.tail, step: "Listening to the end…" });
  await off({ type: "voice.finish" });
}

export async function cancel() {
  const v = await get(); if (!v) return;
  await off({ type: "voice.cancel" }); await off({ type: "tts.stop" });
  await hide();
}
async function hide() {
  const v = await get(); if (!v) return;
  await bar(v.tabId, { state: "hidden" });
  await set(null); await chrome.storage.local.remove("voiceAnswer");
  await chrome.alarms.clear("voice-hide");
  try { await chrome.offscreen.closeDocument(); } catch { /* already closed */ }
}
async function linger() { await chrome.alarms.create("voice-hide", { when: Date.now() + LIMITS.answerLingerMs }); }
export async function onHideAlarm() { const v = await get(); if (v?.phase === "answer" || v?.phase === "error") await hide(); }

/** Sends the committed text as a voice message into the shared thread and reads the reply. */
async function ask(text: string, language: string | null) {
  const v = await get(); if (!v?.active) return;
  await trace(`ask ${text.length} chars`);
  if (!text.trim()) { v.phase = "error"; await set(v); await bar(v.tabId, { state: "error", error: { title: "Didn't catch that", detail: "Nothing was heard. Press ⌥⇧Space and try again, or type it in the panel." } }); setTimeout(() => void hide(), 3500); return; }
  v.phase = "processing"; v.text = text; v.language = language; await set(v);
  await bar(v.tabId, { state: "processing", text, step: "Thinking…" });
  const { conversationId } = await getThread();
  let res: Response;
  try {
    res = await api("/chat", { method: "POST", body: JSON.stringify({ message: text, conversationId, inputMode: "voice", voice: { language }, system: extensionSystemLine(v.host) }), pageHost: v.host, timeoutMs: 120_000 });
  } catch { return fail(v, "The agent can't reply right now", "The network dropped. Nothing was run."); }
  if (!res.ok || !res.body) { const b = await res.json().catch(() => null); return fail(v, "The agent can't reply right now", String(b?.message ?? `HTTP ${res.status}`)); }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; let done: Record<string, unknown> | null = null; let convId = conversationId;
  for (;;) {
    const { done: end, value } = await reader.read(); if (end) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n"); buf = frames.pop() ?? "";
    for (const f of frames) {
      const ev = /^event: (.+)$/m.exec(f)?.[1]; const data = /^data: (.+)$/m.exec(f)?.[1]; if (!ev || !data) continue;
      let p: Record<string, unknown>; try { p = JSON.parse(data); } catch { continue; }
      if (ev === "start") { convId = String(p.conversationId); await setThread(convId); }
      else if (ev === "tool_progress" && p.step === "start") await bar(v.tabId, { state: "processing", text, step: stepLabel(String(p.name), null) });
      else if (ev === "tool") await bar(v.tabId, { state: "processing", text, step: stepLabel(String(p.name), p.input as Record<string, unknown>) });
      else if (ev === "done") done = p;
      else if (ev === "error") return fail(v, "The agent can't reply right now", String(p.message ?? p.error ?? "error"));
    }
  }
  if (!done) return fail(v, "The agent can't reply right now", "The reply ended early. Nothing was run.");
  tellPanel({ type: "thread.changed", conversationId: convId });
  const confirmations = (done.confirmations as { token: string; what: string | null; expiresAt: string | null; toolName: string }[] | undefined) ?? [];
  const sources = ((done.sources as { label?: string; name?: string; tier?: string; icon?: string }[] | undefined) ?? []).map((s) => ({ name: String(s.label ?? s.name ?? ""), icon: s.icon ?? (s.tier === "web" ? "globe" : s.tier === "company" ? "book-open" : "database") }));
  if (confirmations.length) {
    await addPendingConfirmations(confirmations.map((c) => ({ token: c.token, what: c.what, expiresAt: c.expiresAt, conversationId: convId, toolName: c.toolName, fromThisBrowser: true })));
    return deliver(v, { text: "That needs a confirmation. Nothing changes until you confirm it in the panel.", spokenChars: 0, speaking: false, time: 0, duration: 0, sources, needsPanel: true }, null);
  }
  const session = await getSession();
  const { status, body } = await apiJson<{ ok: boolean; plan: { kind: string; display: string; spoken: string; room: boolean }; audio: Record<string, unknown> | null }>("/voice/speak", { method: "POST", body: JSON.stringify({ conversationId: convId, speak: session.replyMode !== "text" }), pageHost: v.host, timeoutMs: 60_000 });
  const plan = status === 200 && body?.ok ? body.plan : null;
  const needsPanel = !plan || plan.room || plan.kind === "shown" || plan.kind === "confirm" || plan.kind === "empty";
  const display = plan?.display || String(done.content ?? "").slice(0, 400) || "The answer is in the panel.";
  return deliver(v, { text: needsPanel ? (plan?.display || "This answer needs the panel.") : display, spokenChars: 0, speaking: Boolean(body?.audio) && !needsPanel, time: 0, duration: Number((body?.audio as { duration?: number })?.duration ?? 0), sources, needsPanel }, needsPanel ? null : body?.audio ?? null);
}

async function deliver(v: VoiceState, answer: NonNullable<VoiceBarState["answer"]>, audio: Record<string, unknown> | null) {
  v.phase = "answer"; await set(v); await chrome.storage.local.set({ voiceAnswer: answer });
  await bar(v.tabId, { state: "answer", text: v.text, answer });
  if (audio) await off({ type: "tts.play", audio }); else await linger();
}
async function fail(v: VoiceState, title: string, detail: string) { v.phase = "error"; await set(v); await bar(v.tabId, { state: "error", error: { title, detail } }); setTimeout(() => void hide(), 5000); }

export async function onBarAction(tabId: number, action: string) {
  const v = await get(); if (!v || v.tabId !== tabId) return;
  if (action === "send") await finish();
  else if (action === "discard") await cancel();
  else if (action === "stop") { await off({ type: "tts.stop" }); const a = (await chrome.storage.local.get("voiceAnswer")).voiceAnswer as VoiceBarState["answer"]; if (a) { const n = { ...a, speaking: false }; await chrome.storage.local.set({ voiceAnswer: n }); await bar(tabId, { state: "answer", answer: n }); } await linger(); }
  else if (action === "show" || action === "openPanel") { await off({ type: "tts.stop" }); const opened = await openPanel(v.windowId); if (opened) { await hide(); tellPanel({ type: "thread.changed", conversationId: (await getThread()).conversationId }); } }
  else if (action === "say") { const { conversationId } = await getThread(); const { body } = await apiJson<{ ok: boolean; audio: Record<string, unknown> | null }>("/voice/speak", { method: "POST", body: JSON.stringify({ conversationId, speak: true }) }); if (body?.audio) await off({ type: "tts.play", audio: body.audio }); }
}

/** A tool step for the Processing state: "Checking get notams for EGLL…" (mirrors the console's stepLabel). */
function stepLabel(name: string, args: Record<string, unknown> | null): string {
  const code = ["callsign", "icao", "registration", "flight_id", "id", "query"].map((k) => args?.[k]).find((x) => typeof x === "string" && x) as string | undefined;
  const words = name.replace(/^(get|list|search|check)_/, (m) => `${m.slice(0, -1)} `).replace(/_/g, " ");
  return `Checking ${words}${code ? ` for ${code}` : ""}…`;
}

export function extensionSystemLine(host: string | null): string {
  return [
    "The user is talking to you from the Clearway Chrome extension, in a browser tab" + (host ? ` on ${host}` : "") + ". You cannot see that page: you only receive what the user explicitly sends (a selection, a captured region, or the page text), and you must never imply otherwise.",
    "Wall actions are not available from the extension; if the user asks to show something on the wall, say it is done from the console.",
    "If the user asks you to put, insert or draft text INTO the page or an email they are writing, reply briefly and put the exact plain text to insert inside a fenced block that starts with ```insert and ends with ``` — plain text only, no markdown inside it. The extension turns that block into an insert card the user reviews in the page.",
  ].join(" ");
}
