"use client";

// Push-to-talk (design spec §4.23 docked in the composer, §6.9, §8.1–8.3).
// Hold the mic button or the voice shortcut: the bar appears at once
// (Invoked), the mic warms up (Listening: live waveform + timer), release →
// Processing (the recording is transcribed once, then discarded) → the text
// lands in the composer and is sent as a voice-originated message. Esc
// discards. Errors and the two permission cards are the spec's copy.
//
// Deviation, stated: the transcript does not stream while speaking (the
// speech-to-text used is batch), so the uncertain-word popover is replaced by
// a plain "check the transcript" pause when confidence is low.

import { useCallback, useEffect, useRef, useState } from "react";
import { C, SHADOW, mono } from "../ui/tokens";
import Orb from "../ui/Orb";
import Waveform from "../ui/Waveform";
import { Button, Icon } from "../ui/primitives";
import { AGENT_BASE } from "../types";

export type VoiceState = "idle" | "invoked" | "listening" | "processing" | "error" | "permission" | "blocked";
export type VoiceResult = { text: string; language: string | null; uncertain: boolean };
type VoiceError = { title: string; detail: string; action: "type" | "allow" | "retry" };

const MIN_MS = 400; // shorter than this is a tap, not speech
const SILENT_LEVEL = 0.02;

export function useVoiceInput({ onResult, onTypeInstead }: { onResult: (r: VoiceResult) => void; onTypeInstead?: () => void }) {
  const [state, setState] = useState<VoiceState>("idle");
  const [levels, setLevels] = useState<number[]>(() => Array(10).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<VoiceError | null>(null);
  const rec = useRef<{ stream: MediaStream; recorder: MediaRecorder; ctx: AudioContext; chunks: Blob[]; startedAt: number; raf: number; timer: number; peak: number; cancelled: boolean } | null>(null);
  const stateRef = useRef<VoiceState>("idle");
  const set = (s: VoiceState) => { stateRef.current = s; setState(s); };

  const teardown = useCallback(() => {
    const r = rec.current; if (!r) return; rec.current = null;
    cancelAnimationFrame(r.raf); window.clearInterval(r.timer);
    try { r.recorder.state !== "inactive" && r.recorder.stop(); } catch { /* already stopped */ }
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close().catch(() => {});
    setLevels(Array(10).fill(0)); setElapsed(0);
  }, []);

  const fail = useCallback((e: VoiceError, hold = 6000) => { setError(e); set("error"); window.setTimeout(() => { if (stateRef.current === "error") { setError(null); set("idle"); } }, hold); }, []);

  /** Key down / button down. */
  const start = useCallback(async () => {
    if (stateRef.current !== "idle" && stateRef.current !== "permission") return;
    set("invoked"); setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { fail({ title: "No microphone", detail: "this browser cannot record audio", action: "type" }); return; }
    // First use: the spec's permission card rather than a bare browser prompt.
    try {
      const perm = await (navigator.permissions?.query({ name: "microphone" as PermissionName }).catch(() => null) ?? null);
      if (perm?.state === "prompt" && !sessionStorage.getItem("cw-agent-mic-asked")) { set("permission"); return; }
      if (perm?.state === "denied") { set("blocked"); return; }
    } catch { /* permissions API unavailable: fall through to getUserMedia */ }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") { set("blocked"); return; }
      fail({ title: "No microphone", detail: "none connected to this PC", action: "type" }); return;
    }
    if ((stateRef.current as VoiceState) !== "invoked") { stream.getTracks().forEach((t) => t.stop()); return; } // released before the mic warmed up
    try { sessionStorage.setItem("cw-agent-mic-asked", "1"); } catch { /* private mode */ }
    const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream); const analyser = ctx.createAnalyser(); analyser.fftSize = 256; src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const entry = { stream, recorder, ctx, chunks: [] as Blob[], startedAt: Date.now(), raf: 0, timer: 0, peak: 0, cancelled: false };
    recorder.ondataavailable = (e) => { if (e.data.size) entry.chunks.push(e.data); };
    recorder.start(250);
    rec.current = entry; set("listening");
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bands: number[] = []; const step = Math.floor(data.length / 10);
      for (let i = 0; i < 10; i += 1) { let sum = 0; for (let j = 0; j < step; j += 1) sum += data[i * step + j]; bands.push(Math.min(1, (sum / step / 255) * 1.8)); }
      entry.peak = Math.max(entry.peak, ...bands);
      setLevels(bands); entry.raf = requestAnimationFrame(tick);
    };
    entry.raf = requestAnimationFrame(tick);
    entry.timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - entry.startedAt) / 1000)), 250);
  }, [fail]);

  /** Key up / button up: transcribe and hand the text over. */
  const stop = useCallback(async () => {
    const r = rec.current;
    if (stateRef.current === "invoked" && !r) { set("idle"); return; }
    if (!r) return;
    const held = Date.now() - r.startedAt; const peak = r.peak;
    const done = new Promise<Blob>((resolve) => { r.recorder.onstop = () => resolve(new Blob(r.chunks, { type: r.recorder.mimeType || "audio/webm" })); });
    teardown();
    const blob = await done;
    if (held < MIN_MS || peak < SILENT_LEVEL || blob.size < 1024) { fail({ title: "Didn't catch that", detail: held < MIN_MS ? "hold the key while you speak" : "nothing heard", action: "retry" }, 3000); return; }
    set("processing");
    try {
      const res = await fetch(`${AGENT_BASE}/api/voice/transcribe`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        if (body?.error === "CAPABILITY_OFF") fail({ title: "Voice is off", detail: "switched off in Agent settings", action: "type" });
        else if (body?.error === "voice_unconfigured") fail({ title: "Voice not set up", detail: "no speech service on this deployment", action: "type" });
        else if (body?.error === "nothing_heard") fail({ title: "Didn't catch that", detail: "nothing heard", action: "retry" }, 3000);
        else fail({ title: "Couldn't transcribe", detail: String(body?.message ?? `HTTP ${res.status}`).slice(0, 80), action: "retry" });
        return;
      }
      if (!String(body.text ?? "").trim()) { fail({ title: "Didn't catch that", detail: "no words recognised", action: "retry" }, 3000); return; }
      set("idle");
      onResult({ text: String(body.text).trim(), language: body.language ?? null, uncertain: Boolean(body.uncertain) });
    } catch (e) {
      fail({ title: "Couldn't transcribe", detail: e instanceof Error ? e.message.slice(0, 80) : "network error", action: "retry" });
    }
  }, [fail, onResult, teardown]);

  /** Esc: discard whatever was recorded. */
  const cancel = useCallback(() => { const r = rec.current; if (r) r.cancelled = true; teardown(); setError(null); set("idle"); }, [teardown]);
  const allow = useCallback(() => { try { sessionStorage.setItem("cw-agent-mic-asked", "1"); } catch { /* private mode */ } set("idle"); void start(); }, [start]);
  const dismiss = useCallback(() => { setError(null); set("idle"); }, []);
  useEffect(() => () => teardown(), [teardown]);

  return { state, levels, elapsed, error, start, stop, cancel, allow, dismiss, typeInstead: () => { dismiss(); onTypeInstead?.(); } };
}

/** The docked bar (§6.9 / §4.23) — rendered in place of the composer's input row while voice is active. */
export function VoiceBar({ v, panel, escLabel = "Esc" }: { v: ReturnType<typeof useVoiceInput>; panel: boolean; escLabel?: string }) {
  const mm = `${Math.floor(v.elapsed / 60)}:${String(v.elapsed % 60).padStart(2, "0")}`;
  if (v.state === "error" && v.error) {
    return (
      <div role="alert" className="ag-record-in" style={{ display: "flex", alignItems: "center", gap: 10, padding: panel ? "8px 6px 8px 12px" : "10px 8px 10px 14px", border: `1px solid ${C.dangerBorder}`, borderRadius: 999, background: C.surface, boxShadow: SHADOW.voicebar, margin: panel ? 8 : 10 }}>
        <Orb size={16} state="error" still title="Voice error" />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.danger }}>{v.error.title}</span>
        <span style={{ fontSize: 13, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.error.detail}</span>
        <button type="button" onClick={v.error.action === "type" ? v.typeInstead : v.dismiss} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 11px", cursor: "pointer" }}>
          {v.error.action === "type" ? "Type instead" : v.error.action === "allow" ? "How to allow" : "Hold again"}
        </button>
      </div>
    );
  }
  const listening = v.state === "listening", processing = v.state === "processing";
  return (
    <div className="ag-record-in" aria-live="polite" style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: panel ? "10px 12px" : "12px 16px", overflow: "hidden" }}>
      <Orb size={16} state={listening ? "listening" : processing ? "thinking" : "idle"} level={listening ? Math.max(...v.levels) : 0} title="Listening" />
      {processing ? null : <Waveform levels={v.levels} mode={listening ? "listening" : "invoked"} title="Microphone level" />}
      <span style={{ flex: 1, minWidth: 0, fontSize: panel ? 13.5 : 14, color: processing ? C.body : C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {processing ? "Transcribing…" : listening ? "Listening — release to send" : "Listening…"}
      </span>
      <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint, whiteSpace: "nowrap" }}>{listening ? `${mm} · ${escLabel}` : processing ? escLabel : `held · ${escLabel}`}</span>
      {processing && <span aria-hidden style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: "33%", background: C.primary }} className="ag-processing" />}
    </div>
  );
}

/** §8.2 / §8.3 — shown above the composer on first use or when the mic is blocked. */
export function MicPermissionCard({ v, panel, holdLabel }: { v: ReturnType<typeof useVoiceInput>; panel: boolean; holdLabel: string }) {
  const blocked = v.state === "blocked";
  const browser = typeof navigator !== "undefined" && /Edg\//.test(navigator.userAgent) ? "Edge" : /Firefox\//.test(navigator.userAgent) ? "Firefox" : /Safari\//.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent) ? "Safari" : "Chrome";
  return (
    <div role="dialog" aria-label={blocked ? "Microphone blocked" : "Allow microphone"} className="ag-record-in" style={{ background: C.surface, border: `1px solid ${blocked ? C.dangerBorder : C.border}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10, margin: panel ? "0 0 10px" : "0 0 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Orb size={30} state={blocked ? "error" : "idle"} still title="" />
        <span style={{ fontSize: 14.5, fontWeight: 700 }}>{blocked ? "Microphone blocked for this site" : "Talk to the agent from anywhere"}</span>
      </div>
      <div style={{ fontSize: panel ? 13 : 13.5, lineHeight: 1.5, color: C.body }}>
        {blocked
          ? `${browser} is blocking it. Click the ⊘ in the address bar → Microphone → Allow, then reload. On the ops-room PC no microphone is connected — typing works the same.`
          : `Hold ${holdLabel} on any console page. Audio is transcribed and discarded; only the text is kept in the thread.`}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {blocked
          ? <><Button variant="secondary" size="sm" onClick={() => { v.dismiss(); void v.start(); }}>Try again</Button><Button variant="ghost" size="sm" onClick={v.typeInstead}>Type instead</Button></>
          : <><Button variant="primary" size="sm" icon="mic" onClick={v.allow}>Allow microphone</Button><Button variant="ghost" size="sm" onClick={v.dismiss}>Not now</Button></>}
      </div>
    </div>
  );
}

export function VoiceIcon() { return <Icon name="mic" size={15} color={C.body} />; }
