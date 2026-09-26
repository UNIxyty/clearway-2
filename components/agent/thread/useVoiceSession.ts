"use client";

// Voice, end to end (design spec §8): capture → live transcript → send →
// reply delivery (shown / spoken) — one hook, used by the docked composer
// (§6.9) and by the floating compact bar when the panel is closed (§4.23).
//
// Three layers:
//   useVoiceInput  — one utterance: mic, live transcript (Scribe v2 Realtime),
//                    uncertain words, final commit, batch fallback.
//   useSpeaker     — TTS playback with level (orb O4, waveform W1) and word /
//                    sentence timing (S2, S3).
//   useVoiceSession — the keybind flow (hold / tap / double-tap, ⇧ on
//                    release, Esc precedence), the overlay, the reply-mode
//                    preference (6b/6c), rule 9 ("Please confirm on screen")
//                    and the wall readout activity (postVoiceActivity).
//
// THE RULE THIS FILE KEEPS: nothing acts on a partial. Interim text is only
// ever rendered. The send path receives text built from committed segments
// (or the batch transcript), after the final commit, with every uncertain
// word resolved by the person.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AGENT_BASE, type AgentMessage } from "../types";
import { eventKey, useKeybinds } from "../ui/keybinds";
import { VoiceCapture, alternativesFor, fetchRealtimeSession, type Candidate, type HeardWord, type Segment } from "./voiceCapture";
import { postVoiceActivity, type VoicePhase } from "./voiceActivity";

// ── Types ─────────────────────────────────────────────────────────────────────
export type VoiceState = "idle" | "invoked" | "listening" | "finalizing" | "check" | "error" | "permission" | "blocked";
export type VoiceError = { title: string; detail: string; action: "type" | "allow" | "retry"; hold: number; lost?: boolean; leaving?: boolean };
export type VoiceResult = { text: string; language: string | null; via: "realtime" | "batch"; uncertain: boolean; flip: boolean };
export type ReplyMode = "auto" | "spoken" | "text";
export type SpeechPlan = { kind: "short" | "long" | "shown" | "confirm" | "empty"; spoken: string; display: string; sentences: string[]; badge: string | null; room: boolean; summarised: boolean; verbatimIds: string[]; withheldSentences: number; fullSeconds: number };
export type SpeechAudio = { audio: string; mime: string; duration: number; words: { i: number; t: number }[]; sentences: { text: string; start: number; end: number }[] };

const MIN_MS = 400;           // a button press shorter than this is not speech
const TAP_MS = 150;           // §8.1: held ≥ 150 ms is a hold; shorter is a tap
const DOUBLE_TAP_MS = 300;    // §8.1: two presses within 300 ms → overlay
const NOTHING_HEARD_MS = 4000; // §4.23: "nothing heard in 4 s"
const SILENT_LEVEL = 0.02;
const ACTIVITY_MIN_GAP_MS = 250; // wall readout: ≤ 4 updates a second

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** The committed text as it will be sent: resolved replacements in place of what was heard. */
export function committedText(segments: Segment[]): string {
  return segments.flatMap((s) => s.words.map((w) => w.resolved ?? w.text)).join(" ").replace(/\s+([,.?!;:])/g, "$1").trim();
}
export const unresolvedWords = (segments: Segment[]) => segments.flatMap((s) => s.words).filter((w) => w.uncertain && !w.resolved);

// ── One utterance ─────────────────────────────────────────────────────────────
export function useVoiceInput({ onResult, onKeepText, onPhase }: { onResult: (r: VoiceResult) => void; onKeepText?: (text: string) => void; onPhase?: (phase: VoicePhase, extra?: { partial?: string; committed?: string }) => void }) {
  const [state, setStateRaw] = useState<VoiceState>("idle");
  const [levels, setLevels] = useState<number[]>(() => Array(10).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<VoiceError | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [partial, setPartial] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const stateRef = useRef<VoiceState>("idle");
  const cap = useRef<VoiceCapture | null>(null);
  // Every start/cancel bumps the generation: a mic that finishes warming up
  // after a tap was cancelled (or a second press began) is closed, never kept.
  const gen = useRef(0);
  const meta = useRef({ startedAt: 0, peak: 0, timer: 0, silence: 0, flip: false, candidates: [] as Candidate[], language: null as string | null, via: "realtime" as "realtime" | "batch" });
  const segRef = useRef<Segment[]>([]);
  const partialRef = useRef("");
  const onResultRef = useRef(onResult); onResultRef.current = onResult;
  const onKeepRef = useRef(onKeepText); onKeepRef.current = onKeepText;
  const onPhaseRef = useRef(onPhase); onPhaseRef.current = onPhase;
  const set = (s: VoiceState) => { stateRef.current = s; setStateRaw(s); };

  const teardown = useCallback(() => {
    const m = meta.current;
    window.clearInterval(m.timer); window.clearTimeout(m.silence);
    cap.current?.close(); cap.current = null;
    setLevels(Array(10).fill(0)); setElapsed(0);
  }, []);
  const resetText = () => { segRef.current = []; partialRef.current = ""; setSegments([]); setPartial(""); };

  const fail = useCallback((e: Omit<VoiceError, "hold"> & { hold?: number }) => {
    const hold = e.hold ?? 6000;
    teardown(); setError({ ...e, hold }); set("error");
    onPhaseRef.current?.("error");
    // V5: holds 6 s (3 s for "Didn't catch that"), then fades over 200 ms.
    window.setTimeout(() => { if (stateRef.current === "error") setError((x) => (x ? { ...x, leaving: true } : x)); }, Math.max(0, hold - 200));
    window.setTimeout(() => { if (stateRef.current === "error") { setError(null); set("idle"); } }, hold);
  }, [teardown]);

  /** Key down / button down. */
  const start = useCallback(async () => {
    if (!["idle", "permission", "error"].includes(stateRef.current)) return;
    setError(null); setNote(null); resetText(); setLive(false);
    const mine = ++gen.current;
    set("invoked");
    meta.current.peak = 0; meta.current.flip = false; meta.current.language = null; meta.current.via = "realtime";
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") { fail({ title: "No microphone", detail: "this browser cannot record audio", action: "type" }); return; }
    // First use: the spec's permission card rather than a bare browser prompt (§8.2).
    try {
      const perm = await (navigator.permissions?.query({ name: "microphone" as PermissionName }).catch(() => null) ?? null);
      if (perm?.state === "prompt" && !sessionStorage.getItem("cw-agent-mic-asked")) { set("permission"); return; }
      if (perm?.state === "denied") { set("blocked"); return; }
    } catch { /* permissions API unavailable: fall through to getUserMedia */ }
    if (stateRef.current !== "invoked" || gen.current !== mine) return;
    // Mint the live-transcript session while the mic warms up.
    const session = fetchRealtimeSession(null);
    session.catch(() => {}); // handled in connect(); never an unhandled rejection
    const capture = new VoiceCapture({
      onLevel: (bands) => { meta.current.peak = Math.max(meta.current.peak, ...bands); setLevels(bands); if (stateRef.current === "invoked" && cap.current === capture) set("listening"); },
      onPartial: (text) => { partialRef.current = text; setPartial(text); if (text) onPhaseRef.current?.("listening", { partial: text, committed: committedText(segRef.current) }); },
      onSegments: (segs) => {
        const cands = meta.current.candidates;
        // Keep the person's picks across re-renders of the same words; offer real alternatives for uncertain ones.
        const prev = new Map(segRef.current.flatMap((s) => s.words).map((w) => [w.id, w] as const));
        const next = segs.map((s) => ({ ...s, words: s.words.map((w): HeardWord => { const p = prev.get(w.id); return p ? { ...w, resolved: p.resolved } : { ...w, options: w.uncertain ? alternativesFor(w.text, cands).map((o) => (o.hint ? `${o.term} · ${o.hint}` : o.term)) : [] }; }) }));
        segRef.current = next; setSegments(next);
        onPhaseRef.current?.("listening", { partial: partialRef.current, committed: committedText(next) });
      },
      onLanguage: (lang) => { meta.current.language = lang; },
      onRealtimeReady: (s) => { meta.current.candidates = s.candidates ?? []; setLive(true); },
      onRealtimeLost: (reason) => { setLive(false); meta.current.via = "batch"; setNote(`Live transcript unavailable (${reason.slice(0, 60)}) — I'll transcribe when you release.`); },
      onMicLost: () => {
        // §4.24 error: what was heard is kept in the composer.
        const kept = committedText(segRef.current);
        if (kept) onKeepRef.current?.(kept);
        fail({ title: "Microphone lost", detail: kept ? "what I heard is kept in the composer" : "the microphone disconnected", action: "retry", lost: true });
      },
    });
    try { await capture.open(); }
    catch (e) {
      capture.close();
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") { set("blocked"); return; }
      fail({ title: "No microphone", detail: "none connected to this PC", action: "type" }); return;
    }
    if (gen.current !== mine || (stateRef.current !== "invoked" && stateRef.current !== "listening")) { capture.close(); return; } // released / Esc before the mic warmed up
    try { sessionStorage.setItem("cw-agent-mic-asked", "1"); } catch { /* private mode */ }
    cap.current = capture;
    capture.connect(session);
    const m = meta.current; m.startedAt = Date.now();
    m.timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - m.startedAt) / 1000)), 250);
    // §4.23 "Didn't catch that — nothing heard in 4 s" (3 s hold).
    m.silence = window.setTimeout(() => {
      if (cap.current !== capture || stateRef.current !== "listening") return;
      const heardText = Boolean(partialRef.current || segRef.current.length);
      if (!heardText && m.peak < 0.15) { resetText(); fail({ title: "Didn't catch that", detail: "nothing heard in 4 s", action: "retry", hold: 3000 }); }
    }, NOTHING_HEARD_MS);
    onPhaseRef.current?.("listening");
  }, [fail]);

  const deliver = useCallback((segs: Segment[], via: "realtime" | "batch", language: string | null, uncertain = false) => {
    const text = committedText(segs);
    if (!text) { fail({ title: "Didn't catch that", detail: "no words recognised", action: "retry", hold: 3000 }); return; }
    set("idle");
    onPhaseRef.current?.("thinking", { committed: text });
    onResultRef.current({ text, language, via, uncertain, flip: meta.current.flip });
  }, [fail]);

  /** Key up / button up. Waits for the final commit before anything is sendable. */
  const stop = useCallback(async (opts: { flip?: boolean } = {}) => {
    const capture = cap.current;
    if (!capture) { if (stateRef.current === "invoked") { set("idle"); onPhaseRef.current?.("cancelled"); } return; }
    if (stateRef.current !== "listening" && stateRef.current !== "invoked") return;
    const m = meta.current; m.flip = Boolean(opts.flip);
    window.clearInterval(m.timer); window.clearTimeout(m.silence);
    const held = Date.now() - m.startedAt; const peak = m.peak;
    set("finalizing"); onPhaseRef.current?.("transcribing", { partial: partialRef.current, committed: committedText(segRef.current) });
    const result = await capture.finish();
    cap.current = null; setLevels(Array(10).fill(0));
    if ((stateRef.current as VoiceState) !== "finalizing") return; // Esc while finalizing
    if (result.via === "realtime") {
      const segs = segRef.current.length ? segRef.current : result.segments;
      if (!committedText(segs)) { resetText(); fail({ title: "Didn't catch that", detail: held < MIN_MS ? "hold the key while you speak" : "nothing heard", action: "retry", hold: 3000 }); return; }
      if (unresolvedWords(segs).length) { set("check"); return; } // the popover asks (§4.23: ask before acting on an unresolved one)
      deliver(segs, "realtime", result.language);
      return;
    }
    // Batch fallback — the old path, with a visible note.
    setNote((n) => n ?? "Live transcript unavailable — transcribed after release.");
    const blob = result.audio;
    if (!blob || held < MIN_MS || peak < SILENT_LEVEL || blob.size < 1024) { resetText(); fail({ title: "Didn't catch that", detail: held < MIN_MS ? "hold the key while you speak" : "nothing heard", action: "retry", hold: 3000 }); return; }
    try {
      const res = await fetch(`${AGENT_BASE}/api/voice/transcribe`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
      const body = await res.json().catch(() => null);
      if ((stateRef.current as VoiceState) !== "finalizing") return;
      if (!res.ok || !body?.ok) {
        if (body?.error === "CAPABILITY_OFF") fail({ title: "Voice is off", detail: "switched off in Agent settings", action: "type" });
        else if (body?.error === "voice_unconfigured") fail({ title: "Voice not set up", detail: "no speech service on this deployment", action: "type" });
        else if (body?.error === "nothing_heard") fail({ title: "Didn't catch that", detail: "nothing heard", action: "retry", hold: 3000 });
        else fail({ title: "Couldn't transcribe", detail: String(body?.message ?? `HTTP ${res.status}`).slice(0, 80), action: "retry" });
        return;
      }
      const text = String(body.text ?? "").trim();
      if (!text) { fail({ title: "Didn't catch that", detail: "no words recognised", action: "retry", hold: 3000 }); return; }
      const segs: Segment[] = [{ id: 1, text, timed: false, words: text.split(/\s+/).map((t, i) => ({ id: `b${i}`, text: t, logprob: null, uncertain: false, options: [], resolved: null })) }];
      segRef.current = segs; setSegments(segs); setPartial("");
      // Batch gives no per-word confidence: a low language probability is the only signal, and it holds the text for checking.
      deliver(segs, "batch", body.language ?? null, Boolean(body.uncertain));
    } catch (e) {
      fail({ title: "Couldn't transcribe", detail: e instanceof Error ? e.message.slice(0, 80) : "network error", action: "retry" });
    }
  }, [deliver, fail]);

  /** Pick an alternative (1–3) or a typed replacement for an uncertain word. */
  const resolve = useCallback((wordId: string, value: string) => {
    const clean = value.replace(/\s·\s.*$/, "").trim();
    if (!clean) return;
    const next = segRef.current.map((s) => ({ ...s, words: s.words.map((w) => (w.id === wordId ? { ...w, resolved: clean } : w)) }));
    segRef.current = next; setSegments(next);
    if (stateRef.current === "check" && !unresolvedWords(next).length) deliver(next, "realtime", meta.current.language);
  }, [deliver]);

  /** Esc: discard whatever was heard. */
  const cancel = useCallback((opts: { silent?: boolean } = {}) => {
    const was = stateRef.current;
    gen.current += 1;
    teardown(); setError(null); resetText(); setNote(null); set("idle");
    if (!opts.silent && was !== "idle") onPhaseRef.current?.("cancelled");
  }, [teardown]);
  const allow = useCallback(() => { try { sessionStorage.setItem("cw-agent-mic-asked", "1"); } catch { /* private mode */ } set("idle"); void start(); }, [start]);
  const dismiss = useCallback(() => { setError(null); set("idle"); }, []);
  useEffect(() => () => teardown(), [teardown]);

  const unresolved = useMemo(() => unresolvedWords(segments), [segments]);
  return { state, levels, elapsed, error, segments, partial, note, live, unresolved, start, stop, cancel, allow, dismiss, resolve, stateRef };
}
export type VoiceInput = ReturnType<typeof useVoiceInput>;

// ── Playback ──────────────────────────────────────────────────────────────────
// A reply that opens the panel ("needs room") keeps speaking while the bar that
// started it unmounts; the orphaned clip is tracked here so Esc anywhere stops it.
let orphan: HTMLAudioElement | null = null;
export function stopOrphanSpeech(): boolean { const a = orphan; orphan = null; if (!a) return false; a.pause(); return true; }

export function useSpeaker() {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [level, setLevel] = useState(0);
  const [bands, setBands] = useState<number[]>(() => Array(7).fill(0));
  const [clip, setClip] = useState<SpeechAudio | null>(null);
  const el = useRef<HTMLAudioElement | null>(null);
  const graph = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const raf = useRef(0);
  const onEnd = useRef<(() => void) | null>(null);
  const persist = useRef(false);

  const halt = useCallback((ended = false) => {
    cancelAnimationFrame(raf.current);
    const a = el.current; el.current = null;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    void graph.current?.ctx.close().catch(() => {}); graph.current = null;
    setPlaying(false); setLevel(0); setBands(Array(7).fill(0));
    const cb = onEnd.current; onEnd.current = null;
    if (ended) cb?.();
  }, []);

  const play = useCallback(async (audio: SpeechAudio, opts: { onEnded?: () => void; persist?: boolean } = {}) => {
    const onEnded = opts.onEnded;
    stopOrphanSpeech();
    halt();
    persist.current = Boolean(opts.persist);
    const a = new Audio(`data:${audio.mime};base64,${audio.audio}`);
    el.current = a; onEnd.current = onEnded ?? null;
    setClip(audio); setDuration(audio.duration); setTime(0);
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(a); const analyser = ctx.createAnalyser(); analyser.fftSize = 128;
      src.connect(analyser); analyser.connect(ctx.destination);
      graph.current = { ctx, analyser };
    } catch { graph.current = null; /* level stays 0; audio still plays */ }
    a.onended = () => { setTime(audio.duration); halt(true); };
    try { await a.play(); } catch { halt(true); return; }
    setPlaying(true);
    const data = new Uint8Array(64); let last = 0;
    const tick = (now: number) => {
      if (el.current !== a) return;
      if (now - last > 50) {
        last = now; setTime(a.currentTime);
        const g = graph.current;
        if (g) {
          g.analyser.getByteFrequencyData(data);
          const out: number[] = []; const step = Math.floor(data.length / 7);
          for (let i = 0; i < 7; i += 1) { let s = 0; for (let j = 0; j < step; j += 1) s += data[i * step + j]; out.push(Math.min(1, (s / step / 255) * 1.6)); }
          setBands(out); setLevel(Math.max(...out));
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [halt]);

  const seek = useCallback((t: number) => { if (el.current) el.current.currentTime = Math.max(0, t); }, []);
  const stop = useCallback(() => halt(false), [halt]);
  useEffect(() => () => {
    // Unmount: a persisting clip plays on (the panel it opened shows the answer); anything else stops.
    const a = el.current;
    if (persist.current && a && !a.paused) {
      cancelAnimationFrame(raf.current); orphan = a;
      const g = graph.current; a.onended = () => { if (orphan === a) orphan = null; void g?.ctx.close().catch(() => {}); };
      el.current = null; graph.current = null;
      return;
    }
    halt(false);
  }, [halt]);

  /** How many characters of the spoken text have been heard (S3). */
  const spokenChars = useMemo(() => {
    if (!clip) return 0;
    let n = 0; for (const w of clip.words) { if (w.t <= time) n = w.i; else break; }
    if (!playing && time >= duration && duration > 0) return Number.MAX_SAFE_INTEGER;
    return n;
  }, [clip, time, playing, duration]);
  const sentenceIndex = useMemo(() => (clip ? Math.max(0, clip.sentences.findIndex((s) => time < s.end)) : 0), [clip, time]);
  return { playing, time, duration, level, bands, clip, spokenChars, sentenceIndex, play, stop, seek };
}
export type Speaker = ReturnType<typeof useSpeaker>;

// ── The whole flow ────────────────────────────────────────────────────────────
export type VoiceThread = { messages: AgentMessage[]; conversationId: string | null; streaming: boolean; activity: string | null; pendingConfirmation: unknown | null };
export type ReplyState =
  | { phase: "idle" }
  | { phase: "working"; request: string; startIndex: number; flip: boolean; step: string | null }
  | { phase: "delivered"; request: string; plan: SpeechPlan; spoken: boolean; mode: ReplyMode; at: number; audio: SpeechAudio | null }
  | { phase: "notice"; text: string; tone: "warn" | "info"; at: number };

const MODE_KEY = "cw-agent-reply-mode";
export function readReplyMode(): ReplyMode { try { const v = localStorage.getItem(MODE_KEY); return v === "spoken" || v === "text" || v === "auto" ? v : "auto"; } catch { return "auto"; } }

/** A tool step for the Processing state / overlay WORKING line: "Checking search flights for BTI472…". */
export function stepLabel(messages: AgentMessage[], activity: string | null): string | null {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  const tool = last?.toolActivity?.[last.toolActivity.length - 1];
  const name = activity ?? tool?.name ?? null;
  if (!name) return null;
  const args = (tool?.name === name ? tool?.args : null) ?? {};
  const code = ["callsign", "icao", "registration", "flight_id", "id", "query"].map((k) => (args as Record<string, unknown>)[k]).find((v) => typeof v === "string" && v) as string | undefined;
  const words = name.replace(/^(get|list|search|check)_/, (m) => `${m.slice(0, -1)} `).replace(/_/g, " ");
  return `Checking ${words}${code ? ` for ${code}` : ""}…`;
}

export function useVoiceSession({
  enabled, docked, locked = null, thread, send, onStopReply, onKeepText, onTypeInstead, openPanel, guard,
}: {
  enabled: boolean;
  /** Docked in an open panel / full-page composer (§6.9) vs the floating bar (§4.23). */
  docked: boolean;
  /** A confirmation is pending (§3 rule 7): voice may listen, but nothing is sent — and a spoken "yes" confirms nothing (rule 9). */
  locked?: string | null;
  thread: VoiceThread | null;
  send: (text: string, meta: { language: string | null }) => void;
  onStopReply?: () => void;
  onKeepText?: (text: string) => void;
  onTypeInstead?: () => void;
  openPanel?: () => void;
  /** Return false to ignore the keybind (another voice host owns it). */
  guard?: () => boolean;
}) {
  const kb = useKeybinds();
  const speaker = useSpeaker();
  const [reply, setReply] = useState<ReplyState>({ phase: "idle" });
  const [overlay, setOverlay] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [mode, setModeRaw] = useState<ReplyMode>("auto");
  useEffect(() => { setModeRaw(readReplyMode()); }, []);
  const setMode = useCallback((m: ReplyMode) => { setModeRaw(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ } }, []);
  const cycleMode = useCallback(() => setMode(mode === "auto" ? "spoken" : mode === "spoken" ? "text" : "auto"), [mode, setMode]);

  // Wall readout: one session id per utterance+reply; ≤ 4 updates a second.
  const act = useRef({ id: uid(), last: 0, timer: 0, queued: null as null | Parameters<typeof postVoiceActivity>[0] });
  const activity = useCallback((phase: VoicePhase, extra: { partial?: string; committed?: string; tools?: { name: string; state: string }[]; outcome?: { kind: string; summary?: string } } = {}) => {
    const a = act.current;
    if (phase === "listening" && !extra.partial && !extra.committed) a.id = uid(); // a new utterance
    // The wall readout speaks a small vocabulary (item 6); map this session's richer states onto it.
    const toolState = (st: string): "running" | "ok" | "error" => (st === "done" ? "ok" : st === "failed" ? "error" : "running");
    const outcomeKind = (k: string): "ok" | "confirm" | "error" => (k === "ok" ? "ok" : k === "error" ? "error" : "confirm");
    const body = { sessionId: a.id, phase, partial: extra.partial, committed: extra.committed, tools: extra.tools?.filter((t) => t.state !== "cancelled").map((t) => ({ name: t.name, state: toolState(t.state) })), outcome: extra.outcome ? { kind: outcomeKind(extra.outcome.kind), summary: extra.outcome.summary } : undefined };
    const streamingUpdate = phase === "listening" && (extra.partial !== undefined || extra.committed !== undefined);
    const now = Date.now();
    if (!streamingUpdate || now - a.last >= ACTIVITY_MIN_GAP_MS) { window.clearTimeout(a.timer); a.queued = null; a.last = now; postVoiceActivity(body); return; }
    a.queued = body;
    if (!a.timer) a.timer = window.setTimeout(() => { a.timer = 0; if (a.queued) { a.last = Date.now(); postVoiceActivity(a.queued); a.queued = null; } }, ACTIVITY_MIN_GAP_MS - (now - a.last));
  }, []);

  const lockedRef = useRef(locked); lockedRef.current = locked;
  const threadRef = useRef(thread); threadRef.current = thread;
  const modeRef = useRef(mode); modeRef.current = mode;

  const notice = useCallback((text: string, tone: "warn" | "info" = "warn") => setReply({ phase: "notice", text, tone, at: Date.now() }), []);

  const sayPhrase = useCallback(async (phrase: "confirm_on_screen" | "answer_first") => {
    if (modeRef.current === "text") return;
    const res = await fetch(`${AGENT_BASE}/api/voice/speak`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phrase }) }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (body?.audio) void speaker.play(body.audio);
  }, [speaker]);

  const onResult = useCallback((r: VoiceResult) => {
    // Rule 7 / rule 9: while a confirmation is pending, voice sends nothing, and a
    // spoken "yes" confirms nothing — the button must be pressed.
    const th = threadRef.current;
    if (lockedRef.current || th?.pendingConfirmation) {
      const yes = /^(yes|yeah|yep|yup|sure|ok|okay|confirm(ed)?|go ahead|do it|apply( it)?|approved?|affirmative|correct|да|подтверждаю|давай)(?=[\s,.!]|$)/i.test(r.text.trim());
      notice(yes ? "Please confirm on screen." : "Answer the confirmation on screen first.");
      void sayPhrase(yes ? "confirm_on_screen" : "answer_first");
      activity("done", { committed: r.text, outcome: { kind: yes ? "confirm_on_screen" : "locked" } });
      if (!yes) onKeepText?.(r.text);
      return;
    }
    // Batch fallback with low confidence: hold the text for checking rather than act on it.
    if (r.uncertain) { onKeepText?.(r.text); notice("Low confidence — check what I heard, then press ⏎."); activity("done", { committed: r.text, outcome: { kind: "held_for_check" } }); return; }
    setReply({ phase: "working", request: r.text, startIndex: th?.messages.length ?? 0, flip: r.flip, step: null });
    send(r.text, { language: r.language });
  }, [activity, notice, onKeepText, sayPhrase, send]);

  const voice = useVoiceInput({ onResult, onKeepText, onPhase: (p, extra) => activity(p, extra) });

  // Reply progress → Processing step, wall readout "acting", then delivery.
  const toolsSeen = useRef(0);
  const delivering = useRef(false);
  useEffect(() => {
    if (reply.phase !== "working" || !thread) return;
    const assistant = thread.messages.slice(reply.startIndex).filter((m) => m.role === "assistant");
    const last = assistant[assistant.length - 1];
    const step = stepLabel(thread.messages.slice(reply.startIndex), thread.activity);
    if (step !== reply.step) setReply({ ...reply, step });
    const tools = last?.toolActivity ?? [];
    if (tools.length !== toolsSeen.current) { toolsSeen.current = tools.length; if (tools.length) activity("acting", { tools: tools.map((t) => ({ name: t.name, state: t.state ?? (t.ok ? "done" : "failed") })) }); }
    if (thread.streaming || !last || last.streaming) return;
    toolsSeen.current = 0;
    if (delivering.current) return;
    if (last.error || last.stopped) { setReply({ phase: "idle" }); activity(last.error ? "error" : "cancelled", { outcome: { kind: last.error ? "error" : "stopped", summary: last.error ?? undefined } }); return; }
    delivering.current = true;
    void deliver(reply.request, reply.flip).finally(() => { delivering.current = false; });
  }, [thread?.messages, thread?.streaming, thread?.activity, reply]); // eslint-disable-line react-hooks/exhaustive-deps

  const deliver = useCallback(async (request: string, flip: boolean, forceSpeak = false) => {
    const th = threadRef.current;
    const pref = modeRef.current;
    const effective: ReplyMode = forceSpeak ? "spoken" : flip ? (pref === "text" ? "spoken" : "text") : pref;
    // 6c "inferred": in auto, a reply is spoken when the question came from the
    // bar or the overlay (eyes elsewhere); docked in an open thread it is shown.
    const speak = effective === "spoken" || (effective === "auto" && (!docked || overlayRef.current));
    const res = await fetch(`${AGENT_BASE}/api/voice/speak`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: th?.conversationId, speak }) }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!body?.ok || !body.plan) { setReply({ phase: "idle" }); activity("done", { outcome: { kind: "shown" } }); if (!docked) openPanel?.(); return; }
    const plan = body.plan as SpeechPlan; const audio = (body.audio ?? null) as SpeechAudio | null;
    // Needs room → the panel opens with the thread already in it (§4.23).
    if (!docked && plan.room) openPanel?.();
    setReply({ phase: "delivered", request, plan, spoken: Boolean(audio), mode: effective, at: Date.now(), audio });
    activity("done", { committed: request, outcome: { kind: plan.kind, summary: plan.display.slice(0, 160) } });
    if (audio) void speaker.play(audio, { persist: !docked && plan.room });
  }, [activity, docked, openPanel, speaker]);

  /** V — say instead (preference = text, or after "Show instead"). */
  const sayInstead = useCallback(() => {
    if (reply.phase !== "delivered" || speaker.playing) return;
    if (reply.audio) { void speaker.play(reply.audio); setReply({ ...reply, spoken: true }); return; }
    void deliver(reply.request, false, true);
  }, [deliver, reply, speaker]);
  /** S — show instead: stop the voice, keep the answer on screen. */
  const showInstead = useCallback(() => { speaker.stop(); if (reply.phase === "delivered" && !docked && reply.plan.kind !== "short") openPanel?.(); }, [docked, openPanel, reply, speaker]);

  // Short-answer card: 8 s after the answer, unless speech is still going (V7).
  useEffect(() => {
    if ((reply.phase !== "delivered" && reply.phase !== "notice") || speaker.playing) return;
    const id = window.setTimeout(() => setReply({ phase: "idle" }), 8000);
    return () => window.clearTimeout(id);
  }, [reply, speaker.playing]);

  // ── Keybind flow (§8.1, §15) ──
  const overlayRef = useRef(overlay); overlayRef.current = overlay;
  const handsRef = useRef(handsFree); handsRef.current = handsFree;
  const keys = useRef({ pressAt: 0, lastPressAt: 0, lastWasTap: false, holding: false, stopOnUp: false });

  const press = useCallback(() => {
    const k = keys.current; const now = Date.now();
    speaker.stop(); // talking over the agent stops it
    if (overlayRef.current) {
      k.holding = true; k.pressAt = now;
      if (handsRef.current && voice.stateRef.current === "listening") { k.stopOnUp = true; return; } // tap to send
      k.stopOnUp = false;
      if (voice.stateRef.current === "idle" || voice.stateRef.current === "error") void voice.start();
      return;
    }
    if (k.lastWasTap && now - k.lastPressAt < DOUBLE_TAP_MS) {
      // Double-tap → the large overlay (§4.24), listening at once.
      voice.cancel({ silent: true }); setOverlay(true); setHandsFree(false);
      k.holding = true; k.pressAt = now; k.lastWasTap = false; k.stopOnUp = false;
      window.setTimeout(() => void voice.start(), 0);
      return;
    }
    k.lastPressAt = now; k.pressAt = now; k.holding = true;
    if (voice.stateRef.current === "check") return; // answer the popover first
    void voice.start();
  }, [speaker, voice]);

  const release = useCallback((shift: boolean) => {
    const k = keys.current; if (!k.holding) return; k.holding = false;
    const held = Date.now() - k.pressAt;
    if (overlayRef.current) {
      if (k.stopOnUp) { k.stopOnUp = false; setHandsFree(false); void voice.stop({ flip: shift }); return; }
      if (held < TAP_MS) { setHandsFree(true); return; } // "Tap once to keep listening"
      setHandsFree(false); void voice.stop({ flip: shift }); return;
    }
    if (held < TAP_MS) { k.lastWasTap = true; voice.cancel({ silent: true }); return; } // maybe the first of a double-tap
    k.lastWasTap = false;
    void voice.stop({ flip: shift });
  }, [voice]);

  /** Esc precedence: voice capture → speech/reply → overlay (§15). Returns true when handled. */
  const escape = useCallback((): boolean => {
    const s = voice.stateRef.current;
    if (s === "invoked" || s === "listening" || s === "finalizing" || s === "check") { voice.cancel(); setHandsFree(false); return true; }
    if (s === "error" || s === "permission" || s === "blocked") { voice.dismiss(); return true; }
    if (speaker.playing) { speaker.stop(); return true; }
    if (stopOrphanSpeech()) return true;
    if (reply.phase === "working") { onStopReply?.(); setReply({ phase: "idle" }); activity("cancelled"); return true; }
    if (overlayRef.current) { setOverlay(false); return true; }
    if (!docked && (reply.phase === "delivered" || reply.phase === "notice")) { setReply({ phase: "idle" }); return true; }
    return false;
  }, [activity, docked, onStopReply, reply.phase, speaker, voice]);

  useEffect(() => {
    if (!enabled) return;
    const typing = () => { const a = document.activeElement as HTMLElement | null; return Boolean(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)); };
    const down = (e: KeyboardEvent) => {
      if (guard && !guard()) return;
      if (kb.matches(e, "voice")) { e.preventDefault(); if (!e.repeat) press(); return; }
      if (e.key === "Escape") { if (escape()) { e.preventDefault(); e.stopPropagation(); } return; }
      // Uncertain-word popover: 1–3 pick.
      if (voice.stateRef.current === "check" || (voice.unresolved.length && voice.stateRef.current === "listening")) {
        const n = /^Digit([1-3])$/.exec(e.code)?.[1];
        const w = voice.unresolved[0];
        if (n && w && w.options[Number(n) - 1] && !typing()) { e.preventDefault(); voice.resolve(w.id, w.options[Number(n) - 1]); return; }
      }
      // S / V while an answer is spoken / shown (§15).
      if (!typing() && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.code === "KeyS" && speaker.playing) { e.preventDefault(); showInstead(); return; }
        if (e.code === "KeyV" && reply.phase === "delivered" && !speaker.playing) { e.preventDefault(); sayInstead(); return; }
        if (e.key === "Enter" && !docked && reply.phase === "delivered") { e.preventDefault(); openPanel?.(); setReply({ phase: "idle" }); return; }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (!keys.current.holding) return;
      const key = kb.binds.voice.split("+").pop();
      if (eventKey(e) === key || ["Alt", "Meta", "Control"].includes(e.key)) release(e.shiftKey);
    };
    // The console host forwards the shortcut into the panel iframe.
    const forwarded = (e: Event) => { if (guard && !guard()) return; const on = (e as CustomEvent<{ on: boolean; shift?: boolean }>).detail?.on; if (on) press(); else release(Boolean((e as CustomEvent<{ shift?: boolean }>).detail?.shift)); };
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true); window.addEventListener("cw-agent-voice", forwarded);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("cw-agent-voice", forwarded); };
  }, [enabled, kb, press, release, escape, guard, voice, speaker.playing, showInstead, sayInstead, reply.phase, docked, openPanel]);

  const closeOverlay = useCallback(() => { voice.cancel({ silent: true }); speaker.stop(); setOverlay(false); setHandsFree(false); }, [speaker, voice]);

  return {
    voice, speaker, reply, setReply, overlay, setOverlay, closeOverlay, handsFree, mode, setMode, cycleMode,
    press, release, escape, sayInstead, showInstead, holdLabel: kb.label("voice"), openLabel: kb.label("open"), reduced: reducedMotion(),
    typeInstead: () => { voice.dismiss(); onTypeInstead?.(); },
    working: reply.phase === "working",
  };
}
export type VoiceSession = ReturnType<typeof useVoiceSession>;
