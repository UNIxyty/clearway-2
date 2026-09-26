"use client";

// The large voice overlay (design spec §4.24, Ops Agent D2) — double-tap the
// voice key. Scrim, a 600-wide card 36 px from the bottom, the 120 px orb in
// all five states (O1–O5, colour change O6), the state label, the transcript
// and the footer. Hands-free: a tap keeps it listening, the next tap sends;
// holding works as push-to-talk. The review-only state switcher in the design
// is not built (§4.24).

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { C, SHADOW, VOICE, mono } from "../ui/tokens";
import Orb, { type OrbState } from "../ui/Orb";
import { ReplyModePill, Transcript } from "./VoiceBar";
import type { VoiceSession } from "./useVoiceSession";

export default function VoiceOverlay({ s, replyWhere }: { s: VoiceSession; replyWhere: "panel" | "page" }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!s.overlay || !mounted) return null;
  const v = s.voice; const sp = s.speaker;
  const orb: OrbState = v.state === "error" ? "error"
    : v.state === "listening" || v.state === "invoked" || v.state === "check" ? "listening"
    : sp.playing ? "speaking"
    : v.state === "finalizing" || s.reply.phase === "working" ? "thinking"
    : "idle";
  const label = orb === "error" ? (v.error?.lost ? "MICROPHONE LOST" : (v.error?.title ?? "ERROR").toUpperCase()) : orb === "listening" ? "LISTENING" : orb === "thinking" ? "WORKING" : orb === "speaking" ? "SPEAKING" : "READY";
  const labelColour = orb === "error" ? C.dangerBadge : orb === "idle" ? C.faint : C.primary;
  const level = orb === "listening" ? Math.max(0, ...v.levels) : orb === "speaking" ? sp.level : 0;
  const first = v.unresolved[0] ?? null;

  let transcript: React.ReactNode;
  if (orb === "error" && v.error) {
    transcript = <><span style={{ color: C.danger }}>{v.error.lost ? "I lost the microphone mid-sentence." : `${v.error.title}.`}</span><span style={{ color: C.muted }}>{v.error.lost ? ` What I heard is kept in the composer — press ${s.holdLabel} to try again.` : ` ${v.error.detail}.`}</span></>;
  } else if (orb === "listening") {
    transcript = v.segments.length || v.partial ? <Transcript segments={v.segments} partial={v.partial} caret={v.state === "listening"} size={19} wrap center /> : <span style={{ color: C.faint }}>Listening…</span>;
  } else if (orb === "thinking") {
    const step = v.state === "finalizing" ? "Finishing the transcript…" : s.reply.phase === "working" ? s.reply.step ?? "Working…" : "Working…";
    transcript = <span style={{ color: C.muted }}>{step.split(/(\b[A-Z]{2,}[0-9A-Z]*\b)/).map((part, i) => (/^[A-Z]{2,}[0-9A-Z]*$/.test(part) ? <span key={i} style={{ ...mono(), color: C.ink }}>{part}</span> : part))}</span>;
  } else if (orb === "speaking" && s.reply.phase === "delivered") {
    const text = s.reply.plan.spoken; const cut = Math.min(text.length, sp.spokenChars);
    transcript = <><span style={{ color: C.ink }}>{text.slice(0, cut)}</span><span style={{ color: C.disabled }}>{text.slice(cut)}</span></>;
  } else if (s.reply.phase === "delivered") {
    transcript = <span style={{ color: C.ink }}>{s.reply.plan.display}</span>;
  } else if (s.reply.phase === "notice") {
    transcript = <span style={{ color: C.warn }}>{s.reply.text}</span>;
  } else {
    transcript = <span style={{ color: C.faint }}>Hold {s.holdLabel} and speak.</span>;
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Voice" style={{ position: "fixed", inset: 0, zIndex: 90 }}>
      <div className="ag-scrim-in" onClick={s.closeOverlay} style={{ position: "absolute", inset: 0, background: VOICE.overlayScrim }} />
      <div className="ag-overlay-in" style={{ position: "absolute", left: "50%", bottom: 36, marginLeft: -300, width: 600, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", background: C.surface, borderRadius: 22, boxShadow: SHADOW.overlay, padding: "26px 28px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <Orb size={120} state={orb} level={level} title={`Voice · ${label.toLowerCase()}`} />
        <span className="ag-state-colour" aria-live="polite" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: labelColour }}>{label}{s.handsFree && orb === "listening" ? " · HANDS-FREE" : ""}</span>
        <div style={{ fontSize: 19, lineHeight: 1.5, textAlign: "center", color: C.ink, minHeight: 58, maxWidth: 520 }}>{transcript}</div>
        {first && orb === "listening" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center", background: VOICE.uncertainBg, border: `1px solid ${C.warnBorder}`, borderRadius: 10, padding: "7px 10px", fontSize: 12.5, color: C.warnStrong }}>
            <span>Not sure I heard “{first.text}”:</span>
            {first.options.map((o, i) => (
              <button key={o} type="button" onClick={() => v.resolve(first.id, o)} style={{ ...mono({ fontSize: 12.5, fontWeight: i === 0 ? 600 : 400 }), color: C.ink, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 8, padding: "3px 8px", cursor: "pointer" }}>
                <span style={{ color: C.faint, marginRight: 4 }}>{i + 1}</span>{o}
              </button>
            ))}
          </div>
        )}
        {v.note && <div role="status" style={{ fontSize: 12, color: C.warn }}>{v.note}</div>}
        <div style={{ alignSelf: "stretch", borderTop: `1px solid ${C.divider}`, paddingTop: 12, display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: C.faint, flexWrap: "wrap" }}>
          <span>Release <span style={mono()}>{s.holdLabel}</span> to send</span>
          <span><span style={mono()}>Esc</span> discard</span>
          <span>Tap once to keep listening</span>
          <span style={{ flex: 1 }} />
          <span>Reply in the {replyWhere} · sound {s.mode === "text" ? "off" : "on"}</span>
          <ReplyModePill mode={s.mode} onClick={s.cycleMode} panel />
        </div>
      </div>
    </div>,
    document.body,
  );
}
