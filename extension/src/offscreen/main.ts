// Offscreen document of the Clearway Ops Agent extension (PROTOCOL.md, "Offscreen ↔ background").
//
// It owns the microphone and the speaker while the side panel is closed. getUserMedia runs HERE, an
// extension context, so Chrome asks for the microphone once for the extension, never per site. The
// background orchestrates (when to start, when to send, what to say); this document only listens,
// transcribes, plays and reports. It exists only while voice is active.
//
// The capture itself is the console's own VoiceCapture (components/agent/thread/voiceCapture.ts):
// mic → 16 kHz PCM → ElevenLabs Scribe v2 Realtime through the agent's single-use token, with the parallel
// MediaRecorder recording as the batch fallback. What useVoiceInput does around it in React is done here
// without React and the results are sent to the background as messages.
//
// THE RULE THIS FILE KEEPS: nothing acts on a partial. `offscreen.voice.result` carries committed text only
// (or the batch transcript), after the final commit. Partials are only ever forwarded for display.
//
// §8.4 data handling: audio lives in memory for the length of one utterance and is then dropped. Nothing is
// stored — not in chrome.storage, not in IndexedDB, not on disk.

import "./shim"; // must be first: fetch rewriting + rAF replacement for the modules below
import { VoiceCapture, alternativesFor, fetchRealtimeSession, type Candidate, type HeardWord, type Segment } from "@/components/agent/thread/voiceCapture";
import { AGENT_BASE } from "@/components/agent/types";
import { LIMITS } from "~/shared/config";

// ── Types ─────────────────────────────────────────────────────────────────────
type SpeechAudio = { audio: string; mime: string; duration: number; words: { i: number; t: number }[]; sentences: { text: string; start: number; end: number }[] };
type Uncertain = { id: string; text: string; options: string[] };
type Inbound =
  | { target: "offscreen"; type: "ping" }
  | { target: "offscreen"; type: "voice.start"; language?: string | null }
  | { target: "offscreen"; type: "voice.finish" }
  | { target: "offscreen"; type: "voice.cancel" }
  | { target: "offscreen"; type: "tts.play"; audio: SpeechAudio }
  | { target: "offscreen"; type: "tts.stop" }
  | { target: "offscreen"; type: "mic.test" };

// Same thresholds as useVoiceInput.
const MIN_MS = 400;              // a press shorter than this is not speech
const NOTHING_HEARD_MS = 4000;   // §4.23: "nothing heard in 4 s"
const SILENT_LEVEL = 0.02;
const PAUSE_MS = LIMITS.pauseToSendMs; // §E8: 1.5 s after the last commit → the background may send
const LEVEL_EVERY_MS = 50;       // ~20 level messages a second
const TTS_EVERY_MS = 50;
const MIC_TEST_MS = 5000;
const MIC_TEST_EVERY_MS = 100;

// ── Outbound ──────────────────────────────────────────────────────────────────
function post(msg: Record<string, unknown>) {
  // The background is the only listener that cares; a sleeping worker is woken by the message. A message
  // with no receiver (worker restarting mid-utterance) rejects — nothing to do about it here.
  try { void chrome.runtime.sendMessage(msg).catch(() => {}); } catch { /* extension context gone */ }
}
const sendError = (title: string, detail: string) => post({ type: "offscreen.voice.error", title, detail });

// Copy from useVoiceInput / MicPermissionCard (VoiceBar.tsx), so the bar in the page reads like the console.
const ERR = {
  cannotRecord: { title: "No microphone", detail: "this browser cannot record audio" },
  noMic: { title: "No microphone", detail: "none connected to this PC" },
  blocked: { title: "Microphone blocked", detail: "Chrome is blocking it for the extension — allow the microphone in the extension's site settings and try again. On the ops-room PC no microphone is connected — typing works the same." },
  nothingIn4s: { title: "Didn't catch that", detail: "nothing heard in 4 s" },
  lostKept: { title: "Microphone lost", detail: "what I heard is kept in the composer" },
  lostNothing: { title: "Microphone lost", detail: "the microphone disconnected" },
} as const;

// ── Text helpers (copied from useVoiceSession.ts; importing that module would pull React in here) ──────
/** The committed text as it will be sent: resolved replacements in place of what was heard. */
function committedText(segments: Segment[]): string {
  return segments.flatMap((s) => s.words.map((w) => w.resolved ?? w.text)).join(" ").replace(/\s+([,.?!;:])/g, "$1").trim();
}
const unresolvedWords = (segments: Segment[]) => segments.flatMap((s) => s.words).filter((w) => w.uncertain && !w.resolved);
const uncertainOf = (segments: Segment[]): Uncertain[] => unresolvedWords(segments).map((w) => ({ id: w.id, text: w.text, options: w.options }));

// ── One utterance ─────────────────────────────────────────────────────────────
type Utterance = {
  gen: number;
  capture: VoiceCapture;
  segments: Segment[];
  partial: string;
  candidates: Candidate[];
  language: string | null;
  via: "realtime" | "batch";
  startedAt: number;
  peak: number;
  lastLevelAt: number;
  lastCommitText: string;   // committed text when the pause timer was last armed
  lastCommitAt: number;     // when new committed text last arrived
  silenceTimer: number;     // the 1.5 s pause timer
  silenceSent: boolean;     // `offscreen.voice.silence` already sent for lastCommitText
  nothingTimer: number;     // the 4 s "nothing heard" check
  finishing: boolean;
};

let current: Utterance | null = null;
// Every start/cancel bumps the generation: a mic that finishes warming up after a cancel is closed, never kept.
let gen = 0;

function dropUtterance(u: Utterance | null) {
  if (!u) return;
  window.clearTimeout(u.silenceTimer); window.clearTimeout(u.nothingTimer);
  u.capture.close();          // stops tracks, closes the socket, discards the recording (§8.4)
  u.segments = []; u.partial = "";
  if (current === u) current = null;
}

// The 1.5 s pause. Measured from the moment the LAST committed text arrived (a `committed_transcript`
// message), and only while the live tail (partial) is empty: a partial cancels the timer; the partial
// emptying again re-arms it for whatever is left of the 1.5 s. It fires once per piece of committed
// text — new committed text resets the "sent" flag so a later pause can fire again if the background
// chose not to send the first time. Never fires with no committed segment, never while finishing.
function armPause(u: Utterance) {
  window.clearTimeout(u.silenceTimer);
  if (u.finishing || u.partial || !u.segments.length || u.silenceSent) return;
  const remaining = Math.max(0, PAUSE_MS - (Date.now() - u.lastCommitAt));
  u.silenceTimer = window.setTimeout(() => {
    if (current !== u || u.finishing || u.partial || u.silenceSent || !u.segments.length) return;
    u.silenceSent = true;
    post({ type: "offscreen.voice.silence" });
  }, remaining);
}

async function voiceStart(language: string | null) {
  dropUtterance(current);
  const mine = ++gen;
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") { sendError(ERR.cannotRecord.title, ERR.cannotRecord.detail); return; }
  // Denied for the extension: say so without a getUserMedia that would only throw. "prompt" is left to
  // getUserMedia itself — that is the one prompt the extension ever shows, and the first-run flow owns it.
  try {
    const perm = await (navigator.permissions?.query({ name: "microphone" as PermissionName }).catch(() => null) ?? null);
    if (perm?.state === "denied") { sendError(ERR.blocked.title, ERR.blocked.detail); return; }
  } catch { /* permissions API unavailable: fall through to getUserMedia */ }
  if (gen !== mine) return;

  // Mint the live-transcript session while the mic warms up (the shim sends it to the console origin).
  const session = fetchRealtimeSession(language);
  session.catch(() => {}); // handled in connect(); never an unhandled rejection

  const u: Utterance = {
    gen: mine, capture: null as unknown as VoiceCapture, segments: [], partial: "", candidates: [], language: null, via: "realtime",
    startedAt: 0, peak: 0, lastLevelAt: 0, lastCommitText: "", lastCommitAt: 0, silenceTimer: 0, silenceSent: false, nothingTimer: 0, finishing: false,
  };
  const capture = new VoiceCapture({
    onLevel: (bands) => {
      if (current !== u) return;
      u.peak = Math.max(u.peak, ...bands);
      const now = performance.now();
      if (now - u.lastLevelAt < LEVEL_EVERY_MS) return;
      u.lastLevelAt = now;
      post({ type: "offscreen.voice.level", bands });
    },
    onPartial: (text) => {
      if (current !== u) return;
      u.partial = text;
      post({ type: "offscreen.voice.partial", text });
      if (text) window.clearTimeout(u.silenceTimer); else armPause(u);
    },
    onSegments: (segs) => {
      if (current !== u) return;
      // Keep any resolved picks across re-renders of the same words; offer real alternatives for uncertain ones.
      const prev = new Map(u.segments.flatMap((s) => s.words).map((w) => [w.id, w] as const));
      const next = segs.map((s) => ({ ...s, words: s.words.map((w): HeardWord => { const p = prev.get(w.id); return p ? { ...w, resolved: p.resolved } : { ...w, options: w.uncertain ? alternativesFor(w.text, u.candidates).map((o) => (o.hint ? `${o.term} · ${o.hint}` : o.term)) : [] }; }) }));
      u.segments = next;
      const text = committedText(next);
      post({ type: "offscreen.voice.segments", text, uncertain: uncertainOf(next) });
      if (text !== u.lastCommitText) { u.lastCommitText = text; u.lastCommitAt = Date.now(); u.silenceSent = false; }
      armPause(u);
    },
    onLanguage: (lang) => { if (current === u) u.language = lang; },
    onRealtimeReady: (s) => { if (current === u) u.candidates = s.candidates ?? []; },
    onRealtimeLost: () => { if (current === u) u.via = "batch"; }, // the recording continues; transcribed on finish
    onMicLost: () => {
      if (current !== u) return;
      // §4.24: what was heard is kept — the background gets it as committed text before the error.
      const kept = committedText(u.segments);
      if (kept) post({ type: "offscreen.voice.segments", text: kept, uncertain: uncertainOf(u.segments) });
      dropUtterance(u);
      sendError(kept ? ERR.lostKept.title : ERR.lostNothing.title, kept ? ERR.lostKept.detail : ERR.lostNothing.detail);
    },
  });
  u.capture = capture;

  try { await capture.open(); }
  catch (e) {
    capture.close();
    const name = (e as DOMException)?.name;
    if (gen !== mine) return;
    if (name === "NotAllowedError" || name === "SecurityError") sendError(ERR.blocked.title, ERR.blocked.detail);
    else if (name === "VoiceUnavailable") { console.error("[voice]", (e as Error).message); sendError("Voice unavailable", "the audio processor could not load — type in the panel instead"); }
    else sendError(ERR.noMic.title, ERR.noMic.detail);
    return;
  }
  if (gen !== mine) { capture.close(); return; } // cancelled before the mic warmed up
  // Extension pages are exempt from the autoplay policy, but an AudioContext that opened suspended would give
  // neither levels nor PCM: resume it to be sure. (`ctx` is private to VoiceCapture; this is the one reach-in.)
  void (capture as unknown as { ctx: AudioContext | null }).ctx?.resume().catch(() => {});
  current = u;
  u.startedAt = Date.now();
  capture.connect(session);
  // §4.23 "Didn't catch that — nothing heard in 4 s".
  u.nothingTimer = window.setTimeout(() => {
    if (current !== u || u.finishing) return;
    const heard = Boolean(u.partial || u.segments.length);
    if (!heard && u.peak < 0.15) { dropUtterance(u); sendError(ERR.nothingIn4s.title, ERR.nothingIn4s.detail); }
  }, NOTHING_HEARD_MS);
}

function sendResult(text: string, language: string | null, via: "realtime" | "batch", uncertain: Uncertain[] = []) {
  post({ type: "offscreen.voice.result", text, language, via, uncertain });
}

/** Release: wait for the final commit; batch fallback if the live transcript could not finish. Mirrors useVoiceInput.stop. */
async function voiceFinish() {
  const u = current;
  if (!u || u.finishing) { if (!u) sendResult("", null, "realtime"); return; }
  u.finishing = true;
  window.clearTimeout(u.silenceTimer); window.clearTimeout(u.nothingTimer);
  const held = Date.now() - u.startedAt; const peak = u.peak;
  const result = await u.capture.finish();
  if (current !== u) return; // cancelled while finalizing: nothing is sent
  post({ type: "offscreen.voice.level", bands: Array(10).fill(0) });

  if (result.via === "realtime") {
    const segs = u.segments.length ? u.segments : result.segments;
    const text = committedText(segs);
    current = null; u.segments = []; // the audio is already gone (finish() closed the capture)
    if (!text) { sendResult("", result.language ?? u.language, "realtime"); return; }
    sendResult(text, result.language ?? u.language, "realtime", uncertainOf(segs));
    return;
  }

  // Batch fallback — the recording goes to the agent's transcribe route, then is dropped.
  let blob = result.audio;
  current = null; u.segments = [];
  if (!blob || held < MIN_MS || peak < SILENT_LEVEL || blob.size < 1024) { blob = null; sendResult("", null, "batch"); return; }
  try {
    const res = await fetch(`${AGENT_BASE}/api/voice/transcribe`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
    blob = null;
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      if (body?.error === "CAPABILITY_OFF") sendError("Voice is off", "switched off in Agent settings");
      else if (body?.error === "voice_unconfigured") sendError("Voice not set up", "no speech service on this deployment");
      else if (body?.error === "nothing_heard") sendResult("", null, "batch");
      else sendError("Couldn't transcribe", String(body?.message ?? `HTTP ${res.status}`).slice(0, 80));
      return;
    }
    const text = String(body.text ?? "").trim();
    sendResult(text, body.language ?? null, "batch");
  } catch (e) {
    blob = null;
    sendError("Couldn't transcribe", e instanceof Error ? e.message.slice(0, 80) : "network error");
  }
}

/** Esc: discard whatever was heard. Sends nothing. */
function voiceCancel() {
  gen += 1;
  dropUtterance(current);
  current = null;
}

// ── Playback ──────────────────────────────────────────────────────────────────
// The TTS clip from POST /api/voice/speak ({audio (base64), mime, duration, words:[{i,t}], sentences}),
// played the way useSpeaker plays it: an <audio> on a data: URL through an AnalyserNode for the bands.
type Player = { el: HTMLAudioElement; ctx: AudioContext | null; analyser: AnalyserNode | null; timer: number; clip: SpeechAudio; ended: boolean };
let player: Player | null = null;

/** How many characters of the spoken text have been heard (S3) — exactly useSpeaker.spokenChars. */
function spokenChars(clip: SpeechAudio, time: number, playing: boolean): number {
  let n = 0; for (const w of clip.words) { if (w.t <= time) n = w.i; else break; }
  if (!playing && time >= clip.duration && clip.duration > 0) return Number.MAX_SAFE_INTEGER;
  return n;
}

function ttsHalt(ended: boolean) {
  const p = player; player = null;
  if (!p) return;
  window.clearInterval(p.timer);
  p.el.pause(); p.el.onended = null; p.el.onerror = null; p.el.removeAttribute("src"); p.el.load();
  void p.ctx?.close().catch(() => {});
  if (ended) post({ type: "offscreen.tts.ended" });
}

async function ttsPlay(clip: SpeechAudio) {
  ttsHalt(false);
  if (!clip?.audio || !clip.mime) { post({ type: "offscreen.tts.ended" }); return; }
  const el = new Audio(`data:${clip.mime};base64,${clip.audio}`);
  const p: Player = { el, ctx: null, analyser: null, timer: 0, clip, ended: false };
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(el); const analyser = ctx.createAnalyser(); analyser.fftSize = 128;
    src.connect(analyser); analyser.connect(ctx.destination);
    p.ctx = ctx; p.analyser = analyser;
  } catch { /* bands stay 0; audio still plays */ }
  player = p;
  const progress = (playing: boolean) => {
    const time = playing ? el.currentTime : clip.duration;
    const bands: number[] = Array(7).fill(0);
    if (playing && p.analyser) {
      const data = new Uint8Array(64); p.analyser.getByteFrequencyData(data);
      const step = Math.floor(data.length / 7);
      for (let i = 0; i < 7; i += 1) { let s = 0; for (let j = 0; j < step; j += 1) s += data[i * step + j]; bands[i] = Math.min(1, (s / step / 255) * 1.6); }
    }
    post({ type: "offscreen.tts.progress", time, duration: clip.duration, spokenChars: spokenChars(clip, time, playing), bands });
  };
  el.onended = () => { if (player !== p) return; progress(false); ttsHalt(true); };
  el.onerror = () => { if (player === p) ttsHalt(true); };
  try { await el.play(); } catch { if (player === p) ttsHalt(true); return; }
  if (player !== p) return; // stopped while starting
  void p.ctx?.resume().catch(() => {});
  progress(true);
  p.timer = window.setInterval(() => { if (player !== p) return; progress(true); }, TTS_EVERY_MS);
}

// ── Mic test (first run) ──────────────────────────────────────────────────────
// Opens the microphone for 5 s and reports a level 10 times a second; -1 marks the end. This is where the
// extension's one microphone prompt is shown when the first-run flow asks for it.
let micTest: { stream: MediaStream; ctx: AudioContext; timer: number; stop: number } | null = null;
function micTestStop(report: boolean) {
  const t = micTest; micTest = null;
  if (!t) return;
  window.clearInterval(t.timer); window.clearTimeout(t.stop);
  t.stream.getTracks().forEach((tr) => tr.stop());
  void t.ctx.close().catch(() => {});
  if (report) post({ type: "offscreen.mic.level", level: -1 });
}
async function micTestStart() {
  micTestStop(false);
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") { sendError(ERR.cannotRecord.title, ERR.cannotRecord.detail); return; }
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }); }
  catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") sendError(ERR.blocked.title, ERR.blocked.detail);
    else sendError(ERR.noMic.title, ERR.noMic.detail);
    return;
  }
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256; src.connect(analyser);
  void ctx.resume().catch(() => {});
  const data = new Uint8Array(analyser.frequencyBinCount);
  const t = { stream, ctx, timer: 0, stop: 0 };
  micTest = t;
  t.timer = window.setInterval(() => {
    if (micTest !== t) return;
    analyser.getByteFrequencyData(data);
    // Same shaping as VoiceCapture's bands; the level is the loudest of ten bands.
    let level = 0; const step = Math.floor(data.length / 10);
    for (let i = 0; i < 10; i += 1) { let sum = 0; for (let j = 0; j < step; j += 1) sum += data[i * step + j]; level = Math.max(level, Math.min(1, (sum / step / 255) * 1.8)); }
    post({ type: "offscreen.mic.level", level });
  }, MIC_TEST_EVERY_MS);
  t.stop = window.setTimeout(() => { if (micTest === t) micTestStop(true); }, MIC_TEST_MS);
}

// ── Inbound ───────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  const msg = raw as Partial<Inbound> | null;
  if (!msg || msg.target !== "offscreen" || typeof msg.type !== "string") return false;
  // Answer synchronously so the background knows the document is alive; the work itself continues after.
  sendResponse({ ok: true });
  switch (msg.type) {
    case "ping": break;
    case "voice.start": void voiceStart(typeof msg.language === "string" && msg.language ? msg.language : null); break;
    case "voice.finish": void voiceFinish(); break;
    case "voice.cancel": voiceCancel(); break;
    case "tts.play": void ttsPlay(msg.audio as SpeechAudio); break;
    case "tts.stop": ttsHalt(false); break;
    case "mic.test": void micTestStart(); break;
    default: break;
  }
  return false;
});

// Teardown (the background closes the document when voice ends): nothing survives — no audio, no text.
window.addEventListener("pagehide", () => { voiceCancel(); ttsHalt(false); micTestStop(false); });
