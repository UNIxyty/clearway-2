import { useEffect, useRef, useState } from 'react';
import sharedTokens from '../../../shared/design-tokens.json';
import { subscribeWallStream } from '../services/wallStream';
import { WALL_FONT } from '../theme/wallFont';

// Voice readout on the wall DISPLAY (item 6; docs/agent-wall-voice-readout.md).
//
// When a dispatcher talks to the Ops Agent on a CONSOLE, the room sees who is
// speaking, what they said, what the agent is doing and how it ended — bottom
// centre, read-only. This is a READOUT, not a control: the agent is not
// available on the wall (design spec §3 rule 13), so there are no buttons, no
// focus, no keys, no tap targets (pointer-events: none). The only accessibility
// surface is a polite live region.
//
// Everything shown here was already reduced to the room-safe subset by the
// agent service's sanitiser (agent/lib/voice/wall-readout.mjs) and clamped
// again by the wall backend. This component adds nothing from anywhere else.
//
// Lifetime: auto-hides HIDE_AFTER_END_MS after the turn ends; expires if events
// stop arriving (server `ttlMs`, 20 s default) — a console that disconnects
// mid-turn cannot leave a stale readout. The backend also sends an explicit
// `phase: "expired"`.

const w = sharedTokens.wall;
const motion = sharedTokens.motion;
const HIDE_AFTER_END_MS = 6_000;
const DEFAULT_TTL_MS = 20_000;
const TERMINAL = new Set(['done', 'error', 'cancelled']);
const EXIT_MS = motion.base;

const PHASE_LABEL = {
  listening: 'Listening…',
  transcribing: 'Transcribing…',
  thinking: 'Thinking…',
  acting: 'Working…',
  done: 'Finished',
  error: 'Stopped',
  cancelled: 'Cancelled',
};

const CSS = `
  .cw-voice-readout {
    opacity: 0;
    transform: translateY(12px);
    transition: opacity ${motion.base}ms ${motion.easeOut}, transform ${motion.base}ms ${motion.easeOut};
  }
  .cw-voice-readout[data-open="true"] { opacity: 1; transform: none; }
  .cw-voice-readout[data-open="false"] {
    transition-timing-function: ${motion.easeIn};
  }
  @keyframes cwvoicepulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  .cw-voice-live { animation: cwvoicepulse 1.4s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .cw-voice-readout, .cw-voice-readout[data-open="true"] { transition: opacity ${motion.fast}ms linear; transform: none; }
    .cw-voice-live { animation: none; }
  }
`;

function stateMark(state) {
  if (state === 'ok') return { glyph: '✓', color: w.accent };
  if (state === 'error') return { glyph: '!', color: w.uncertain };
  return { glyph: '•', color: w.accent, live: true };
}

/** The most recently updated, still-live readout (one on screen at a time). */
function pickCurrent(readouts, now) {
  let best = null;
  for (const entry of readouts.values()) {
    if (entry.hideAt <= now) continue;
    if (!best || entry.receivedAt > best.receivedAt) best = entry;
  }
  return best ? best.data : null;
}

export default function VoiceReadout({ scale = 1 }) {
  const readoutsRef = useRef(new Map()); // id -> { data, receivedAt, hideAt }
  const [current, setCurrent] = useState(null); // what is rendered (kept during exit)
  const [open, setOpen] = useState(false);
  const exitTimer = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      for (const [id, entry] of readoutsRef.current) {
        if (entry.hideAt <= now) readoutsRef.current.delete(id);
      }
      const next = pickCurrent(readoutsRef.current, now);
      if (next) {
        clearTimeout(exitTimer.current);
        setCurrent(next);
        // Next frame, so the entrance transition runs from the closed state.
        requestAnimationFrame(() => setOpen(true));
      } else {
        setOpen(false);
        clearTimeout(exitTimer.current);
        exitTimer.current = setTimeout(() => setCurrent(null), EXIT_MS + 40);
      }
    };

    const unsubscribe = subscribeWallStream('voice-activity', (event) => {
      if (!event || typeof event.id !== 'string') return;
      if (event.phase === 'expired') {
        readoutsRef.current.delete(event.id);
      } else {
        const now = Date.now();
        const ttl = Number.isFinite(event.ttlMs) ? event.ttlMs : DEFAULT_TTL_MS;
        readoutsRef.current.set(event.id, {
          data: event,
          receivedAt: now,
          hideAt: now + (TERMINAL.has(event.phase) ? Math.min(HIDE_AFTER_END_MS, ttl) : ttl),
        });
      }
      refresh();
    });
    // Expiry must not depend on another event arriving.
    const tick = setInterval(() => {
      const now = Date.now();
      let expired = false;
      for (const entry of readoutsRef.current.values()) if (entry.hideAt <= now) expired = true;
      if (expired) refresh();
    }, 500);
    return () => {
      unsubscribe();
      clearInterval(tick);
      clearTimeout(exitTimer.current);
    };
  }, []);

  const px = (n) => Math.round(n * scale);
  const data = current;
  const committed = data?.transcript?.committed || '';
  const partial = data?.transcript?.partial || '';
  const outcome = data?.outcome || null;
  const activity = Array.isArray(data?.activity) ? data.activity : [];
  const live = data && !TERMINAL.has(data.phase);

  return (
    <>
      <style>{CSS}</style>
      {/* Polite live region, always mounted (so the first update is
          announced); never focusable, never interactive. The provisional
          transcript tail is aria-hidden so every partial is not re-read. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: px(22),
          transform: 'translateX(-50%)',
          zIndex: 180,
          pointerEvents: 'none',
          userSelect: 'none',
          width: `min(${px(620)}px, 62vw)`,
        }}
      >
        {data && (
      <div
        className="cw-voice-readout"
        data-open={open ? 'true' : 'false'}
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          gap: px(12),
          alignItems: 'flex-start',
          padding: `${px(10)}px ${px(16)}px ${px(11)}px`,
          background: w.voicebarBg,
          border: `1px solid ${w.voicebarBorder}`,
          borderRadius: sharedTokens.radius.cardLg * scale,
          color: w.text,
          fontFamily: WALL_FONT,
          fontSize: px(14),
          lineHeight: 1.4,
        }}
      >
          <>
            {/* Ring mark (§4.1 over-wall variant): accent ring + dot. */}
            <span
              aria-hidden="true"
              className={live ? 'cw-voice-live' : undefined}
              style={{
                flex: 'none',
                marginTop: px(3),
                width: px(14),
                height: px(14),
                borderRadius: '50%',
                border: `2px solid ${outcome && outcome.kind !== 'ok' ? w.uncertain : w.accent}`,
                boxSizing: 'border-box',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <span style={{ width: px(5), height: px(5), borderRadius: '50%', background: outcome && outcome.kind !== 'ok' ? w.uncertain : w.accent }} />
            </span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: px(3) }}>
              <div style={{ fontSize: px(12.5), color: w.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ color: w.text, fontWeight: 700 }}>{data.speaker || 'A dispatcher'}</span>
                {' · Ops Agent · '}
                {PHASE_LABEL[data.phase] || ''}
              </div>
              {(committed || partial) && (
                <div
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }}
                >
                  <span>{committed}</span>
                  {committed && partial ? ' ' : ''}
                  {partial && <span aria-hidden="true" style={{ color: w.textMuted }}>{partial}</span>}
                </div>
              )}
              {outcome ? (
                <div style={{ fontSize: px(13), fontWeight: 700, color: outcome.kind === 'ok' ? w.accent : w.uncertain }}>
                  {outcome.text}
                </div>
              ) : activity.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: px(14), rowGap: px(2), fontSize: px(12.5), color: w.textMuted }}>
                  {activity.map((step, index) => {
                    const mark = stateMark(step.state);
                    return (
                      <span key={`${index}-${step.label}`} style={{ whiteSpace: 'nowrap' }}>
                        <span aria-hidden="true" className={mark.live ? 'cw-voice-live' : undefined} style={{ color: mark.color, fontWeight: 700, marginRight: px(5) }}>
                          {mark.glyph}
                        </span>
                        {step.label}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </>
      </div>
        )}
      </div>
    </>
  );
}
