"use client";

// Voice with the panel closed (design spec §4.23 placement, §6.9 C2 flow):
// hold the voice key anywhere on a console page → the compact bar floats 22 px
// above the bottom edge, centred on the content area (not the viewport — the
// sidebar is excluded), draggable along the bottom edge with left / centre /
// right snaps remembered per user. The question goes to the panel's own
// thread (it lives on while the panel is closed), so "needs room" simply
// opens the panel with the thread already in it. A short answer shows in a
// card above the bar for 8 s, spoken when the delivery rule says so.
//
// Mounted by AgentPanel while it is closed or minimised. It yields to a
// mounted composer (full-page chat): only one voice host owns the keybind.

import { useCallback, useEffect, useRef, useState } from "react";
import AgentStyles from "../ui/AgentStyles";
import { useKeybinds } from "../ui/keybinds";
import type { AgentContext } from "../types";
import type { Thread } from "../useThread";
import { MicPermissionCard, ShortAnswerCard, SpeakingCard, VoiceBar, VoiceNote, barLook } from "./VoiceBar";
import VoiceOverlay from "./VoiceOverlay";
import { useVoiceSession } from "./useVoiceSession";

type Snap = "left" | "centre" | "right";
const SNAP_KEY = "cw-agent-voicebar-snap";

export default function FloatingVoice({ thread, context, openPanel }: { thread: Thread; context: AgentContext | null; openPanel: () => void }) {
  const kb = useKeybinds();
  const enabled = kb.caps.voice !== false && !thread.offline;
  const s = useVoiceSession({
    enabled,
    docked: false,
    locked: thread.pendingConfirmation ? "pending" : null,
    thread,
    send: (text, meta) => void thread.send(text, { voice: true, language: meta.language }),
    onStopReply: thread.stop,
    // No composer on screen: "Type instead" and kept text both open the panel.
    onTypeInstead: openPanel,
    onKeepText: (text) => { try { sessionStorage.setItem("cw-agent-voice-draft", text); } catch { /* private mode */ } openPanel(); },
    openPanel,
    guard: () => !document.querySelector("[data-cw-agent-composer]"),
  });

  // Placement: centred on the content area; snaps remembered per user.
  const [snap, setSnap] = useState<Snap>("centre");
  useEffect(() => { try { const v = localStorage.getItem(SNAP_KEY); if (v === "left" || v === "right" || v === "centre") setSnap(v); } catch { /* private mode */ } }, []);
  const [area, setArea] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const f = () => { const side = document.querySelector<HTMLElement>("[data-cw-sidebar]")?.getBoundingClientRect().width ?? 0; setArea({ left: side, width: window.innerWidth - side }); };
    f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f);
  }, []);
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const [dx, setDx] = useState(0);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).closest("[data-voicebar-handle]")) return;
    drag.current = { x: e.clientX, dx: 0 }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => { if (drag.current) setDx(e.clientX - drag.current.x); }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const x = e.clientX - area.left; drag.current = null; setDx(0);
    const next: Snap = x < area.width / 3 ? "left" : x > (area.width * 2) / 3 ? "right" : "centre";
    setSnap(next); try { localStorage.setItem(SNAP_KEY, next); } catch { /* private mode */ }
  }, [area]);

  const look = barLook(s);
  const permission = s.voice.state === "permission" || s.voice.state === "blocked";
  const delivered = s.reply.phase === "delivered" ? s.reply : null;
  const speaking = Boolean(delivered && s.speaker.playing);
  // The short card: a short answer that did not need room (§4.23 C2 step 2).
  const shortCard = delivered && !delivered.plan.room && !speaking && delivered.plan.display ? delivered.plan.display : null;
  if (look === "hidden" && !permission && !speaking && !shortCard && !s.overlay) return null;

  const selected = context?.selected?.[0]?.label ?? null;
  const position: React.CSSProperties = snap === "left"
    ? { left: area.left + 22, alignItems: "flex-start" }
    : snap === "right"
      ? { right: 22, alignItems: "flex-end" }
      : { left: area.left + area.width / 2, transform: `translateX(-50%)`, alignItems: "center" };

  return (
    <>
      <AgentStyles />
      <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ position: "fixed", bottom: 22, zIndex: 70, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none", ...position, ...(dx ? { translate: `${dx}px 0` } : {}) }}>
        <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", gap: 8, alignItems: "inherit" }}>
          {permission && <MicPermissionCard v={s.voice} panel={false} floating holdLabel={s.holdLabel} onTypeInstead={openPanel} />}
          {delivered && speaking && <SpeakingCard s={s} plan={delivered.plan} onShowFull={() => { s.speaker.stop(); openPanel(); }} />}
          {shortCard && <ShortAnswerCard text={shortCard} openLabel={s.openLabel} onOpen={() => { s.setReply({ phase: "idle" }); openPanel(); }} sayable={!delivered?.spoken} onSay={s.sayInstead} />}
          <VoiceNote v={s.voice} />
          {!s.overlay && <VoiceBar s={s} variant="floating" selectedLabel={selected} />}
        </div>
      </div>
      <VoiceOverlay s={s} replyWhere="panel" />
    </>
  );
}
