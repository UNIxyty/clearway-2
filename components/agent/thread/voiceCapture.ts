"use client";

// Microphone → ElevenLabs Scribe v2 Realtime, in the browser (design spec
// §4.23 "transcript streaming", §8.1 steps 2–4). No React in here: one
// VoiceCapture per utterance, owned by useVoiceInput.
//
//  - The socket URL (single-use token, VAD commits, timestamps, keyterms) is
//    minted by the agent service: POST /api/voice/realtime-token. The API key
//    never reaches the page.
//  - Audio: the mic is resampled here to 16 kHz mono PCM16 (an AudioWorklet,
//    no fallback: voice is unavailable without it) and sent in 250 ms
//    chunks — inside the API's 0.1–1 s window.
//  - partial_transcript REWRITES the live tail; committed_transcript is
//    final. Only committed text ever leaves this file as something sendable.
//  - On release, finish() forces a commit and waits until the server has
//    committed everything it heard (the live tail is empty). If that does not
//    happen, or the socket failed at any point, the parallel MediaRecorder
//    recording is handed back for the batch endpoint — so a realtime outage
//    degrades to the old behaviour with a visible note, never to lost words.
//  - §8.4: audio lives in memory for the length of one utterance and is then
//    dropped. Nothing is stored.

import { AGENT_BASE } from "../types";

export type Candidate = { term: string; kind: string; hint: string | null };
export type RealtimeSession = { url: string; sampleRate: number; autoCommitSeconds: number; uncertainLogprob: number; keyterms: string[]; candidates: Candidate[] };
export type HeardWord = { id: string; text: string; logprob: number | null; uncertain: boolean; options: string[]; resolved: string | null };
export type Segment = { id: number; text: string; words: HeardWord[]; timed: boolean };
export type FinishResult = { segments: Segment[]; language: string | null; via: "realtime" | "batch"; audio: Blob | null };

type Events = {
  onLevel: (bands: number[]) => void;
  onPartial: (text: string) => void;
  onSegments: (segments: Segment[]) => void;
  onLanguage: (language: string) => void;
  /** The live transcript stopped working; the recording continues for the batch fallback. */
  onRealtimeLost: (reason: string) => void;
  onRealtimeReady: (session: RealtimeSession) => void;
  onMicLost: () => void;
};

const CHUNK_SECONDS = 0.25;
const FINAL_COMMIT_TIMEOUT_MS = 3500;
const FATAL = new Set(["error", "auth_error", "quota_exceeded", "unaccepted_terms", "rate_limited", "queue_overflow", "resource_exhausted", "session_time_limit_exceeded", "input_error", "invalid_request", "chunk_size_exceeded", "transcriber_error"]);

// The PCM tap is a real file (public/voice-worklet.js), loaded by URL: the console serves it at
// /voice-worklet.js and the Chrome extension ships it at its root. Never a blob: an extension's CSP
// (script-src 'self') refuses blob worklets, and a silent fallback hid that. There is no fallback: if the
// worklet cannot load, voice is unavailable and says so (VoiceUnavailable → a visible card).
const workletUrl = () => {
  const rt = (globalThis as { chrome?: { runtime?: { id?: string; getURL?: (p: string) => string } } }).chrome?.runtime;
  return rt?.id && rt.getURL ? rt.getURL("voice-worklet.js") : "/voice-worklet.js";
};
export class VoiceUnavailable extends Error { constructor(why: string) { super(why); this.name = "VoiceUnavailable"; } }

let wordSeq = 0;
function wordsOf(text: string, raw?: Array<{ text: string; type: string; logprob?: number }> | null, threshold = -2): HeardWord[] {
  if (raw && raw.length) {
    return raw.filter((w) => w.type === "word" && w.text.trim()).map((w) => {
      const lp = typeof w.logprob === "number" ? w.logprob : null;
      return { id: `w${++wordSeq}`, text: w.text.trim(), logprob: lp, uncertain: lp !== null && lp < threshold, options: [], resolved: null };
    });
  }
  return text.split(/\s+/).filter(Boolean).map((t) => ({ id: `w${++wordSeq}`, text: t, logprob: null, uncertain: false, options: [], resolved: null }));
}

/** Int16 little-endian PCM → base64, in slices (btoa on a huge string blows the stack). */
function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}

export async function fetchRealtimeSession(language: string | null = null): Promise<RealtimeSession> {
  const res = await fetch(`${AGENT_BASE}/api/voice/realtime-token`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language }) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body.url) {
    const err = new Error(String(body?.message ?? `HTTP ${res.status}`)) as Error & { code?: string };
    err.code = body?.error; throw err;
  }
  return body as RealtimeSession;
}

export class VoiceCapture {
  stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;
  private ws: WebSocket | null = null;
  private session: RealtimeSession | null = null;
  private live = false;          // socket open and trusted
  private lost = false;          // realtime failed; batch on release
  private pending: Int16Array[] = []; // PCM waiting for the socket to open
  private pendingSamples = 0;
  private outBuf: number[] = [];
  private resamplePos = 0;
  private inRate = 48000;
  private closed = false;
  private finishing: { resolve: () => void; sawCommit: boolean } | null = null;
  segments: Segment[] = [];
  partial = "";
  language: string | null = null;
  private segSeq = 0;

  constructor(private ev: Events) {}

  /** Acquire the microphone. Throws the browser's DOMException (NotAllowedError, NotFoundError…). */
  async open(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const track = this.stream.getAudioTracks()[0];
    if (track) track.onended = () => { if (!this.closed) this.ev.onMicLost(); };

    // Batch fallback: record in parallel from the first frame.
    if (typeof MediaRecorder !== "undefined") {
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
      this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.recorder.start(250);
    }

    const ctx = new AudioContext();
    this.ctx = ctx; this.inRate = ctx.sampleRate;
    const src = ctx.createMediaStreamSource(this.stream);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256; src.connect(analyser);
    const mute = ctx.createGain(); mute.gain.value = 0; mute.connect(ctx.destination);
    this.nodes.push(src, analyser, mute);
    const onFrame = (f: Float32Array) => this.push(f);
    if (!ctx.audioWorklet) throw new VoiceUnavailable("this browser has no AudioWorklet");
    try { await ctx.audioWorklet.addModule(workletUrl()); }
    catch (e) { throw new VoiceUnavailable(`the audio processor could not load (${workletUrl()}): ${String((e as Error)?.message ?? e)}`); }
    const node = new AudioWorkletNode(ctx, "cw-pcm", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    node.port.onmessage = (e: MessageEvent<Float32Array>) => onFrame(e.data);
    src.connect(node); node.connect(mute); this.nodes.push(node);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bands: number[] = []; const step = Math.floor(data.length / 10);
      for (let i = 0; i < 10; i += 1) { let sum = 0; for (let j = 0; j < step; j += 1) sum += data[i * step + j]; bands.push(Math.min(1, (sum / step / 255) * 1.8)); }
      this.ev.onLevel(bands);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Connect the live transcript. Called with the minted session (or its failure). */
  connect(sessionPromise: Promise<RealtimeSession>) {
    sessionPromise.then((session) => {
      if (this.closed) return;
      this.session = session;
      const ws = new WebSocket(session.url);
      this.ws = ws;
      ws.onopen = () => { if (this.closed) return; };
      ws.onmessage = (e) => this.onMessage(e.data);
      ws.onerror = () => this.fail("the live transcript connection failed");
      ws.onclose = (e) => { if (!this.closed && !this.finishing?.sawCommit) this.fail(e.reason || `connection closed (${e.code})`); };
    }).catch((e: Error) => this.fail(e.message || "no live transcript"));
  }

  private fail(reason: string) {
    if (this.lost || this.closed) return;
    this.lost = true; this.live = false;
    try { this.ws?.close(); } catch { /* closed */ }
    this.ev.onRealtimeLost(reason);
    this.finishing?.resolve();
  }

  private onMessage(raw: string) {
    let m: Record<string, unknown>;
    try { m = JSON.parse(raw); } catch { return; }
    const type = String(m.message_type ?? "");
    if (type === "session_started") {
      this.live = true;
      if (this.session) this.ev.onRealtimeReady(this.session);
      this.flushPending();
      return;
    }
    if (type === "partial_transcript") { this.partial = String(m.text ?? ""); this.ev.onPartial(this.partial); return; }
    if (type === "committed_transcript") {
      const text = String(m.text ?? "").trim();
      if (text) { this.segments = [...this.segments, { id: ++this.segSeq, text, words: wordsOf(text, null), timed: false }]; this.ev.onSegments(this.segments); }
      this.partial = ""; this.ev.onPartial("");
      this.noteCommit(Boolean(text));
      return;
    }
    if (type === "committed_transcript_with_timestamps") {
      const text = String(m.text ?? "").trim();
      const lang = typeof m.language_code === "string" && m.language_code ? m.language_code : null;
      if (lang) { this.language = lang; this.ev.onLanguage(lang); }
      if (text) {
        const words = wordsOf(text, m.words as never, this.session?.uncertainLogprob ?? -2);
        const idx = this.segments.findIndex((s) => !s.timed && s.text === text);
        if (idx >= 0) this.segments = this.segments.map((s, i) => (i === idx ? { ...s, words, timed: true } : s));
        else this.segments = [...this.segments, { id: ++this.segSeq, text, words, timed: true }];
        this.ev.onSegments(this.segments);
      }
      this.partial = ""; this.ev.onPartial("");
      this.noteCommit(true, true);
      return;
    }
    // A forced commit with nothing new to commit is an answer, not a failure.
    if (type === "insufficient_audio_activity" || type === "commit_throttled") { this.noteCommit(false, true); return; }
    if (type === "warning") return;
    if (FATAL.has(type)) this.fail(String(m.error ?? m.message ?? type));
  }

  private noteCommit(_hadText: boolean, timed = false) {
    const f = this.finishing; if (!f) return;
    f.sawCommit = true;
    // Done when the server has committed everything it heard. With timestamps
    // on, the timed message is the last one of a commit — wait for it.
    if (!this.partial && (timed || !this.segments.some((s) => !s.timed))) f.resolve();
  }

  /** Float32 at the context rate → 16 kHz PCM16, box-filter decimation. */
  private push(frame: Float32Array) {
    if (this.closed || this.lost) return;
    const ratio = this.inRate / 16000;
    let pos = this.resamplePos;
    while (pos + ratio <= frame.length) {
      const a = Math.floor(pos), b = Math.min(frame.length, Math.floor(pos + ratio));
      let sum = 0; for (let k = a; k < b; k += 1) sum += frame[k];
      const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
      this.outBuf.push(v < 0 ? v * 0x8000 : v * 0x7fff);
      pos += ratio;
    }
    this.resamplePos = pos - frame.length;
    const chunk = Math.round(16000 * CHUNK_SECONDS);
    while (this.outBuf.length >= chunk) this.enqueue(Int16Array.from(this.outBuf.splice(0, chunk)));
  }

  private enqueue(pcm: Int16Array) {
    if (this.live && this.ws?.readyState === WebSocket.OPEN) { this.send(pcm, false); return; }
    // Keep up to ~8 s while the token and socket come up; the words said
    // before the socket opened must still be transcribed.
    this.pending.push(pcm); this.pendingSamples += pcm.length;
    while (this.pendingSamples > 16000 * 8) { const d = this.pending.shift(); this.pendingSamples -= d?.length ?? 0; }
  }

  private flushPending() {
    const list = this.pending; this.pending = []; this.pendingSamples = 0;
    for (const p of list) this.send(p, false);
  }

  private send(pcm: Int16Array, commit: boolean) {
    try { this.ws?.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: pcm.length ? toBase64(pcm) : "", commit, sample_rate: 16000 })); }
    catch { this.fail("could not send audio"); }
  }

  /** Release: force the final commit and wait for it; hand back the recording if realtime could not finish. */
  async finish(): Promise<FinishResult> {
    const audio = await this.stopRecorder();
    this.stopAudio();
    const liveOk = this.live && !this.lost && this.ws?.readyState === WebSocket.OPEN;
    if (liveOk) {
      if (this.outBuf.length) { this.send(Int16Array.from(this.outBuf.splice(0)), false); }
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, FINAL_COMMIT_TIMEOUT_MS);
        this.finishing = { resolve: () => { window.clearTimeout(timer); resolve(); }, sawCommit: false };
        this.send(new Int16Array(0), true);
      });
    }
    const complete = liveOk && !this.lost && !this.partial;
    this.close();
    if (complete) return { segments: this.segments, language: this.language, via: "realtime", audio: null };
    return { segments: this.segments, language: this.language, via: "batch", audio };
  }

  private stopRecorder(): Promise<Blob | null> {
    const r = this.recorder; if (!r) return Promise.resolve(null);
    if (r.state === "inactive") return Promise.resolve(new Blob(this.chunks, { type: r.mimeType || "audio/webm" }));
    return new Promise((resolve) => { r.onstop = () => resolve(new Blob(this.chunks, { type: r.mimeType || "audio/webm" })); try { r.stop(); } catch { resolve(null); } });
  }

  private stopAudio() {
    cancelAnimationFrame(this.raf);
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* gone */ } }
    this.nodes = [];
    this.stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  /** Esc, or teardown: drop everything, send nothing. */
  close() {
    if (this.closed) return;
    this.closed = true;
    try { if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop(); } catch { /* stopped */ }
    this.stopAudio();
    try { this.ws?.close(); } catch { /* closed */ }
    this.ws = null; this.chunks = []; this.pending = []; this.outBuf = [];
  }
}

// ── Uncertain words: real alternatives only (§4.23 "codes are matched against live flights and ICAOs") ──
const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
function distance(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** Up to three options for a heard word: the closest real entities, and what was heard. */
export function alternativesFor(heard: string, candidates: Candidate[]): { term: string; hint: string | null }[] {
  const h = normCode(heard);
  if (h.length < 2) return [{ term: heard, hint: null }];
  const looksLikeCode = /\d/.test(heard) || /^[A-Z]{3,}/.test(heard.replace(/[^A-Za-z0-9]/g, ""));
  const scored = looksLikeCode ? candidates
    .map((c) => ({ c, d: distance(h, normCode(c.term)) }))
    .filter(({ c, d }) => d <= Math.max(1, Math.floor(normCode(c.term).length * 0.4)))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ c }) => ({ term: c.term, hint: c.hint })) : [];
  const out = scored.filter((x, i, arr) => arr.findIndex((y) => y.term === x.term) === i);
  if (!out.some((o) => normCode(o.term) === h)) out.push({ term: heard.replace(/[.,?!;:]+$/, ""), hint: null });
  return out.slice(0, 3);
}
