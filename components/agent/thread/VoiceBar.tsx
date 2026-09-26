"use client";

// The compact voice bar (design spec §4.23) in its five states — Invoked,
// Listening, Uncertain word, Processing, Error — docked into the composer
// (§6.9) or floating 22 px above the page (panel closed); the speaking and
// short-answer cards (§4.25, V7); the microphone permission cards (§8.2,
// §8.3). The logic lives in useVoiceSession; this file only draws it.
//
// Transcript: committed words are ink and never move; the live partial tail is
// faint (#9aa0a8) and is REWRITTEN in place as Scribe refines it — only the
// words that changed settle in (120 ms), so a correction reads as the tail
// firming up, not as a glitch. Older words scroll off the left (V4) using the
// design's own technique (direction: rtl on the container, an isolated LTR
// span inside). Nothing on screen here is sendable until it is committed.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { C, SHADOW, VOICE, mono } from "../ui/tokens";
import Orb from "../ui/Orb";
import Waveform from "../ui/Waveform";
import { Button, Icon, RingMark } from "../ui/primitives";
import type { HeardWord, Segment } from "./voiceCapture";
import type { ReplyMode, SpeechPlan, Speaker, VoiceInput, VoiceSession } from "./useVoiceSession";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ── Transcript ────────────────────────────────────────────────────────────────
/** Split the partial into the part that matches the last one (stable) and the part that changed. */
function usePartialDiff(partial: string): [string, string] {
  const prev = useRef("");
  const out = useMemo<[string, string]>(() => {
    const a = prev.current.split(" "), b = partial.split(" ");
    let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k += 1;
    // The last shared word may still be growing ("rele" → "released"): count it as changed.
    if (k === b.length && k > 0) k -= 1;
    return [b.slice(0, k).join(" "), b.slice(k).join(" ")];
  }, [partial]);
  useEffect(() => { prev.current = partial; }, [partial]);
  return out;
}

const uncertainStyle = (): CSSProperties => ({ ...mono({ fontSize: 13 }), borderBottom: `2px dotted ${VOICE.uncertainUnderline}`, background: VOICE.uncertainBg, borderRadius: 3, padding: "0 3px" });

export function Transcript({ segments, partial, caret, size = 14, wrap = false, wordRefs, center = false }: { segments: Segment[]; partial: string; caret: boolean; size?: number; wrap?: boolean; wordRefs?: React.MutableRefObject<Map<string, HTMLSpanElement>>; center?: boolean }) {
  const [stable, changed] = usePartialDiff(partial);
  const words = segments.flatMap((s) => s.words);
  const body = (
    <>
      {words.map((w: HeardWord, i) => (
        <span key={w.id}>
          {i > 0 ? " " : ""}
          {w.uncertain && !w.resolved
            ? <span ref={(el) => { if (wordRefs) { if (el) wordRefs.current.set(w.id, el); else wordRefs.current.delete(w.id); } }} style={uncertainStyle()} title="Low confidence">{w.text}</span>
            : <span style={{ color: C.ink, ...(w.resolved ? mono({ fontSize: size - 1 }) : {}) }}>{w.resolved ?? w.text}</span>}
        </span>
      ))}
      {partial && (
        <span style={{ color: C.faint }}>
          {words.length ? " " : ""}{stable}{stable && changed ? " " : ""}
          <span key={changed} className="ag-partial-in">{changed}</span>
        </span>
      )}
      {caret && <span aria-hidden className="ag-caret" style={{ display: "inline-block", width: 1.5, height: 15, background: C.primary, marginLeft: 2, verticalAlign: "-2px" }} />}
    </>
  );
  if (wrap) return <div style={{ fontSize: size, lineHeight: 1.5, color: C.ink, textAlign: center ? "center" : "left", wordBreak: "break-word" }}>{body}</div>;
  // V4: older words leave on the left.
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", direction: "rtl", textAlign: "left", fontSize: size }}>
      <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>{body}</span>
    </div>
  );
}

// ── Uncertain-word popover (§4.23 state 3, V8) ────────────────────────────────
export function UncertainPopover({ word, onPick, left }: { word: HeardWord; onPick: (value: string) => void; left: number }) {
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  return (
    <div role="listbox" aria-label={`Did you mean — heard "${word.text}"`} className="ag-menu-in"
      style={{ position: "absolute", bottom: "calc(100% + 8px)", left: Math.max(0, left), display: "flex", gap: 4, alignItems: "center", background: C.ink, borderRadius: 10, padding: 5, fontSize: 12.5, color: C.surface, boxShadow: VOICE.popoverShadow, zIndex: 4, whiteSpace: "nowrap" }}>
      {!typing && word.options.map((o, i) => (
        <button key={o} type="button" role="option" aria-selected={i === 0} onClick={() => onPick(o)}
          style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), color: C.surface, background: i === 0 ? C.primary : "transparent", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>
          <span style={{ opacity: 0.7, marginRight: 5 }}>{i + 1}</span>{o}
        </button>
      ))}
      {typing
        ? <input autoFocus value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && value.trim()) onPick(value.trim()); if (e.key === "Escape") setTyping(false); }} aria-label="Type the word"
            style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), width: 110, color: C.surface, background: "transparent", border: `1px solid ${C.muted}`, borderRadius: 6, padding: "3px 6px", outline: "none" }} />
        : <button type="button" onClick={() => setTyping(true)} style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), color: C.disabled, background: "transparent", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>type…</button>}
    </div>
  );
}

/** Where to anchor the popover: the first unresolved word's x inside `host`. */
function usePopoverLeft(host: React.RefObject<HTMLElement>, wordRefs: React.MutableRefObject<Map<string, HTMLSpanElement>>, wordId: string | null, deps: unknown[]) {
  const [left, setLeft] = useState(0);
  useLayoutEffect(() => {
    if (!wordId || !host.current) return;
    const el = wordRefs.current.get(wordId); if (!el) return;
    const h = host.current.getBoundingClientRect(), r = el.getBoundingClientRect();
    setLeft(Math.min(Math.max(0, r.left - h.left - 8), Math.max(0, h.width - 180)));
  }, [wordId, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return left;
}

// ── Reply preference pill (6b) ────────────────────────────────────────────────
export function ReplyModePill({ mode, onClick, panel = false }: { mode: ReplyMode; onClick: () => void; panel?: boolean }) {
  return (
    <button type="button" onClick={onClick} title="How answers to voice questions are delivered — click to change. Hold ⇧ on the sending press to flip it for one answer."
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.primaryHover, background: C.primaryTint, border: "none", borderRadius: 999, padding: panel ? "3px 8px" : "6px 10px", cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>
      <Icon name="volume-2" size={12} color={C.primaryHover} />Reply: {mode}
    </button>
  );
}

// ── The bar ───────────────────────────────────────────────────────────────────
type BarLook = "invoked" | "listening" | "check" | "processing" | "error" | "notice" | "hidden";
export function barLook(s: VoiceSession): BarLook {
  const v = s.voice.state;
  if (v === "error") return "error";
  if (v === "check") return "check";
  if (v === "listening") return "listening";
  if (v === "invoked") return "invoked";
  if (v === "finalizing" || s.reply.phase === "working") return "processing";
  if (s.reply.phase === "notice") return "notice";
  return "hidden";
}

function Keys({ label }: { label: string }) {
  return <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: "nowrap" }}><span style={{ ...mono(), color: C.muted }}>{label}</span> held · <span style={{ ...mono(), color: C.muted }}>Esc</span></span>;
}

export function VoiceBar({ s, variant, panel = false, selectedLabel = null, style }: { s: VoiceSession; variant: "docked" | "floating"; panel?: boolean; selectedLabel?: string | null; style?: CSSProperties }) {
  const v = s.voice;
  const look = barLook(s);
  const wordRefs = useRef(new Map<string, HTMLSpanElement>());
  const host = useRef<HTMLDivElement | null>(null);
  const measure = useRef<HTMLSpanElement | null>(null);
  const first = v.unresolved[0] ?? null;
  const popLeft = usePopoverLeft(host, wordRefs, first?.id ?? null, [v.segments, v.partial]);
  const floating = variant === "floating";

  // V2: width grows with the transcript, 380 → 560 (floating only; docked fills the composer).
  const [textWidth, setTextWidth] = useState(0);
  useLayoutEffect(() => { if (measure.current) setTextWidth(measure.current.scrollWidth); }, [v.segments, v.partial, look]);
  const chrome = 14 + 16 + 12 + 56 + 12 + 12 + 70 + 8;
  const width = !floating ? undefined : look === "invoked" ? 380 : look === "error" || look === "notice" ? undefined : Math.min(560, Math.max(380, chrome + textWidth));

  if (look === "hidden") return null;

  const pill: CSSProperties = floating
    ? { position: "relative", height: 44, width, minWidth: look === "error" || look === "notice" ? 360 : undefined, maxWidth: 560, boxSizing: "border-box", background: C.surface, border: `1px solid ${look === "error" ? C.dangerBorder : look === "notice" ? C.warnBorder : C.borderControl}`, borderRadius: 999, boxShadow: look === "error" ? VOICE.errorShadow : SHADOW.voicebar, padding: look === "error" ? "0 6px 0 14px" : "0 8px 0 14px", display: "flex", alignItems: "center", gap: 12 }
    : { position: "relative", display: "flex", alignItems: "center", flexWrap: look === "processing" ? "nowrap" : "wrap", rowGap: 6, columnGap: 10, padding: panel ? "10px 12px" : "12px 16px" };

  if (look === "error" && v.error) {
    const e = v.error;
    return (
      <div role="alert" className={`${floating ? "ag-voicebar-in" : "ag-record-in"} ${e.leaving ? "ag-fade-out" : ""}`} style={{ ...pill, ...(floating ? {} : { border: `1px solid ${C.dangerBorder}`, borderRadius: 999, background: C.surface, boxShadow: VOICE.errorShadow, margin: panel ? 8 : 10, padding: "8px 6px 8px 14px" }), ...style }}>
        <Orb size={16} state="error" still title="Voice error" />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.danger, whiteSpace: "nowrap" }}>{e.title}</span>
        <span style={{ fontSize: 13, color: C.muted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.detail}</span>
        <button type="button" onClick={() => (e.action === "type" ? (v.dismiss(), s.typeInstead()) : e.action === "allow" ? v.dismiss() : (v.dismiss(), void v.start()))}
          style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>
          {e.action === "type" ? `Type instead ${s.openLabel}` : e.action === "allow" ? "How to allow" : `Press ${s.keyLabel} again`}
        </button>
      </div>
    );
  }

  if (look === "notice" && s.reply.phase === "notice") {
    return (
      <div role="status" className={floating ? "ag-voicebar-in" : "ag-record-in"} style={{ ...pill, ...(floating ? {} : { border: `1px solid ${C.warnBorder}`, borderRadius: 999, background: C.surface, margin: panel ? 8 : 10, padding: "8px 14px" }), ...style }}>
        <RingMark size={16} color={C.warn} dot={6} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.warn, flex: 1 }}>{s.reply.text}</span>
        <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>Esc</span>
      </div>
    );
  }

  const processing = look === "processing";
  const request = processing ? (s.reply.phase === "working" ? s.reply.request : v.segments.length ? v.segments.map((x) => x.text).join(" ") : "") : "";
  const step = processing ? (v.state === "finalizing" ? (v.live ? "Finishing the transcript…" : "Transcribing…") : s.reply.phase === "working" ? s.reply.step ?? "Working…" : "Working…") : null;
  const checkCount = v.unresolved.length;

  return (
    <div ref={host} className={`${floating ? "ag-voicebar-in ag-voicebar-grow" : "ag-record-in"}`} aria-live="polite" style={{ ...pill, ...style }}>
      {/* Left: ring mark 16 (listening blue) */}
      {floating ? <span data-voicebar-handle="" title="Drag along the bottom edge" style={{ cursor: "grab", display: "inline-flex" }}><RingMark size={16} color={C.primary} dot={6} /></span> : <RingMark size={16} color={C.primary} dot={6} />}
      {processing ? (
        <>
          <span style={{ fontSize: 13.5, color: C.muted, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "none" }}>{request ? `“${request}”` : ""}</span>
          <span aria-hidden style={{ width: 1, height: 18, background: C.border, flex: "none" }} />
          <span style={{ fontSize: 13.5, color: C.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step}</span>
          <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>Esc</span>
          {/* V3: 2px line, 33 % wide, sliding along the bottom edge. */}
          <span aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", overflow: "hidden", pointerEvents: "none" }}>
            <span className="ag-processing" style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: "33%", background: C.primary }} />
          </span>
        </>
      ) : (
        <>
          <Waveform levels={look === "check" || checkCount ? v.levels.map((x) => x * 0.5) : v.levels} mode={look === "invoked" ? "invoked" : checkCount ? "low" : "listening"} title="Microphone level" />
          {floating && (look === "invoked" && !v.segments.length && !v.partial
            ? <span style={{ flex: 1, fontSize: 13.5, color: C.faint }}>Listening…</span>
            : <Transcript segments={v.segments} partial={v.partial} caret={look === "listening"} size={14} wordRefs={wordRefs} />)}
          {!floating && <span style={{ flex: 1 }} />}
          {checkCount > 0
            ? <span style={{ fontSize: 11.5, fontWeight: 600, color: C.warn, whiteSpace: "nowrap" }}>{checkCount === 1 ? "1 word to check" : `${checkCount} words to check`}</span>
            : look === "invoked" ? <Keys label={s.keyLabel} /> : <span style={{ ...mono({ fontSize: floating ? 11.5 : 11 }), color: C.faint, whiteSpace: "nowrap" }}>{mmss(v.elapsed)}{floating ? "" : " · Esc"}</span>}
          {floating && selectedLabel && look !== "invoked" && <span style={{ fontSize: 11, fontWeight: 600, color: C.primaryHover, background: C.primaryTint, borderRadius: 999, padding: "4px 8px", whiteSpace: "nowrap" }}>+ {selectedLabel} selected</span>}
          {!floating && <ReplyModePill mode={s.mode} onClick={s.cycleMode} panel={panel} />}
          {first && first.options.length > 0 && (look === "check" || look === "listening") && <UncertainPopover word={first} left={popLeft} onPick={(val) => v.resolve(first.id, val)} />}
          {/* §6.9 docked: the transcript types into the field below the top row, 14/1.5, grey provisional tail, caret. */}
          {!floating && (
            <div style={{ flexBasis: "100%", minHeight: 21 }}>
              {look === "invoked" && !v.segments.length && !v.partial
                ? <span style={{ fontSize: 14, color: C.faint }}>Listening…</span>
                : <Transcript segments={v.segments} partial={v.partial} caret={look === "listening"} size={14} wrap wordRefs={wordRefs} />}
            </div>
          )}
        </>
      )}
      {/* Hidden measure for V2 width growth. */}
      <span ref={measure} aria-hidden style={{ position: "absolute", visibility: "hidden", whiteSpace: "nowrap", fontSize: 14, pointerEvents: "none", left: 0, top: 0 }}>{v.segments.map((x) => x.text).join(" ")} {v.partial}</span>
    </div>
  );
}

// ── Fallback note (realtime unavailable) ──────────────────────────────────────
export function VoiceNote({ v, panel = false }: { v: VoiceInput; panel?: boolean }) {
  if (!v.note || v.state === "idle" || v.state === "error") return null;
  return <div role="status" style={{ fontSize: 12, color: C.warn, padding: panel ? "0 12px 6px" : "0 16px 8px", display: "flex", gap: 6, alignItems: "center" }}><Icon name="wifi-off" size={12} color={C.warn} />{v.note}</div>;
}

// ── Speaking: transcript coloured by what has been heard (S3) ─────────────────
function SpokenText({ text, spokenChars, size = 14 }: { text: string; spokenChars: number; size?: number }) {
  const cut = Math.min(text.length, spokenChars);
  return <div style={{ fontSize: size, lineHeight: 1.5 }}><span style={{ color: C.ink }}>{text.slice(0, cut)}</span><span style={{ color: C.disabled }}>{text.slice(cut)}</span></div>;
}

function StopButton({ onClick, label = "Stop" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="ag-focus" style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.stop, background: C.stopTint, border: `1px solid ${C.stopBorder}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: C.stopSquare }} />{label}<span style={{ ...mono({ fontSize: 11 }), opacity: 0.72 }}>Esc</span>
    </button>
  );
}
const pillBtn: CSSProperties = { fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" };

/** The speaking card above the floating bar (§4.25: short, long/summary, must-show). */
export function SpeakingCard({ s, plan, onShowFull }: { s: VoiceSession; plan: SpeechPlan; onShowFull: () => void }) {
  const sp: Speaker = s.speaker;
  const long = plan.kind === "long";
  const shown = plan.kind === "shown" || plan.kind === "confirm";
  if (shown) {
    return (
      <div role="status" className="ag-voicebar-in" style={{ width: 440, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 16, boxShadow: SHADOW.voicebar, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.divider}` }}>
          <Waveform variant="short" levels={sp.playing ? sp.bands : null} mode={sp.playing ? "speaking" : "invoked"} title="Voice output" />
          <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>“{plan.spoken}”</span>
          {plan.badge && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: C.muted, background: C.hover, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>{plan.badge}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, padding: "8px 14px", fontSize: 12, color: C.muted }}><span>Opens in the side panel on ⏎</span><span style={{ flex: 1 }} /><span>Esc dismiss</span></div>
      </div>
    );
  }
  return (
    <div role="status" className="ag-voicebar-in" style={{ width: 440, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 16, boxShadow: SHADOW.voicebar, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Waveform variant="speaking" levels={sp.playing ? sp.bands : null} mode={sp.playing ? "speaking" : "invoked"} title="Voice output" />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.primary, flex: 1, whiteSpace: "nowrap" }}>{long ? "SPEAKING SUMMARY" : "SPEAKING"} · {mmss(sp.time)} / {mmss(sp.duration)}</span>
        <button type="button" onClick={s.showInstead} style={pillBtn}>Show instead <span style={{ ...mono(), color: C.faint }}>S</span></button>
        <StopButton onClick={() => sp.stop()} />
      </div>
      {long && <div aria-hidden style={{ height: 3, borderRadius: 2, background: C.border, overflow: "hidden" }}><div style={{ height: "100%", width: `${sp.duration ? Math.min(100, (sp.time / sp.duration) * 100) : 0}%`, background: C.primary }} /></div>}
      <SpokenText text={plan.spoken} spokenChars={sp.spokenChars} />
      {plan.verbatimIds.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: C.muted }}>VERBATIM · {plan.verbatimIds.join(", ")} · NOT READ ALOUD</div>}
      {long && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px dashed ${C.borderControl}`, paddingTop: 9, fontSize: 12.5, color: C.muted }}>
          <Icon name="file-text" size={13} color={C.muted} /><span style={{ flex: 1 }}>Full answer · about {Math.max(1, Math.round(plan.fullSeconds / 60))} min to read aloud</span>
          <button type="button" onClick={onShowFull} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.primaryHover, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Show full</button>
        </div>
      )}
    </div>
  );
}

/** V7 — the short answer above the floating bar, 8 s, ⏎ opens it in the panel. */
export function ShortAnswerCard({ text, openLabel, onOpen, sayable, onSay }: { text: string; openLabel: string; onOpen: () => void; sayable: boolean; onSay: () => void }) {
  return (
    <div role="status" className="ag-voicebar-in" style={{ width: 440, boxSizing: "border-box", background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 10, boxShadow: VOICE.shortCardShadow, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: C.ink }}>{text}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" onClick={onOpen} style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: C.primaryHover, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>Open in panel {openLabel}</button>
        <span style={{ flex: 1 }} />
        {sayable && <button type="button" onClick={onSay} style={{ ...pillBtn, padding: "3px 9px", fontSize: 12 }}>Say it <span style={{ ...mono(), color: C.faint }}>V</span></button>}
      </div>
    </div>
  );
}

/** Speaking in the panel/thread (§4.25 "both at once" + round-1 spoken transcript): orb, progress, READING n OF m, click a sentence to jump. */
export function DockedSpeaking({ s, panel }: { s: VoiceSession; panel: boolean }) {
  const sp = s.speaker;
  if (s.reply.phase !== "delivered" || !sp.clip) return null;
  if (!sp.playing) return null;
  const plan = s.reply.plan;
  const sentences = sp.clip.sentences.length ? sp.clip.sentences : [{ text: plan.spoken, start: 0, end: sp.duration }];
  const current = sp.sentenceIndex;
  return (
    <div role="status" className="ag-record-in" style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: panel ? 12 : 14, display: "flex", flexDirection: "column", gap: 8, margin: panel ? "0 0 10px" : "0 0 12px", background: C.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Orb size={30} state="speaking" level={sp.level} title="Speaking" />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: C.primary, whiteSpace: "nowrap" }}>{plan.summarised ? "SPEAKING SUMMARY" : `READING ${current + 1} OF ${sentences.length}`}</span>
        <div aria-hidden style={{ flex: 1, height: 3, borderRadius: 2, background: C.border, overflow: "hidden" }}><div style={{ height: "100%", width: `${sp.duration ? Math.min(100, (sp.time / sp.duration) * 100) : 0}%`, background: C.primary }} /></div>
        <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>{mmss(sp.time)} / {mmss(sp.duration)}</span>
        <button type="button" onClick={s.showInstead} style={pillBtn}>Show instead <span style={{ ...mono(), color: C.faint }}>S</span></button>
        <StopButton onClick={() => sp.stop()} />
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.65 }}>
        {sentences.map((x, i) => (
          <span key={i} role="button" tabIndex={0} onClick={() => sp.seek(x.start)} onKeyDown={(e) => { if (e.key === "Enter") sp.seek(x.start); }} className="ag-reading"
            style={{ cursor: "pointer", color: i <= current ? C.ink : C.faint, background: i === current ? VOICE.readingHighlight : "transparent", boxShadow: i === current ? `0 0 0 2px ${VOICE.readingHighlight}` : "none", borderRadius: 3 }}>
            {x.text}{" "}
          </span>
        ))}
      </div>
      {plan.verbatimIds.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: C.muted }}>VERBATIM · {plan.verbatimIds.join(", ")} · NOT READ ALOUD</div>}
    </div>
  );
}

// ── §8.2 / §8.3 permission cards ──────────────────────────────────────────────
export function MicPermissionCard({ v, panel, keyLabel, onTypeInstead, floating = false }: { v: VoiceInput; panel: boolean; keyLabel: string; onTypeInstead: () => void; floating?: boolean }) {
  const blocked = v.state === "blocked";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? "Safari" : "Chrome";
  // The instruction matches the actual browser (§8.3 spec rule).
  const how = browser === "Firefox" ? "Click the microphone icon in the address bar → Allow, then reload." : browser === "Safari" ? "Safari → Settings for this website → Microphone → Allow, then reload." : "Click the ⊘ in the address bar → Microphone → Allow, then reload.";
  return (
    <div role="dialog" aria-label={blocked ? "Microphone blocked" : "Allow microphone"} className="ag-record-in" style={{ background: C.surface, border: `1px solid ${blocked ? C.dangerBorder : C.border}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10, margin: floating ? 0 : panel ? "0 0 10px" : "0 0 12px", width: floating ? 440 : undefined, boxSizing: "border-box", boxShadow: floating ? SHADOW.voicebar : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Orb size={30} state={blocked ? "error" : "idle"} still title="" />
        <span style={{ fontSize: 14.5, fontWeight: 700 }}>{blocked ? "Microphone blocked for this site" : "Talk to the agent from anywhere"}</span>
      </div>
      <div style={{ fontSize: panel ? 13 : 13.5, lineHeight: 1.5, color: C.body }}>
        {blocked
          ? `${browser} is blocking it. ${how} On the ops-room PC no microphone is connected — typing works the same.`
          : `Press ${keyLabel} on any console page, and again to send. Audio is transcribed and discarded; only the text is kept in the thread.`}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {blocked
          ? <><Button variant="secondary" size="sm" onClick={() => { v.dismiss(); void v.start(); }}>Try again</Button><Button variant="ghost" size="sm" onClick={() => { v.dismiss(); onTypeInstead(); }}>Type instead</Button></>
          : <><Button variant="primary" size="sm" icon="mic" onClick={v.allow}>Allow microphone</Button><Button variant="ghost" size="sm" onClick={v.dismiss}>Not now</Button></>}
      </div>
    </div>
  );
}

export function VoiceIcon() { return <Icon name="mic" size={15} color={C.body} />; }
