"use client";

// Clearway ring mark and voice indicator — the orb (design spec §4.1).
//
// The Clearway logo rendered live on a canvas: idle it IS the logo; listening,
// thinking and speaking deform it; error is still. Every number below is from
// §4.1 — geometry, colour by state, glow, level smoothing — and the design's
// simulated levels are NOT shipped: `level` is supplied by the caller from the
// mic (listening) or TTS output (speaking), 0–1, and defaults to 0.

import { useEffect, useRef } from "react";
import { C } from "./tokens";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

const COLOUR: Record<OrbState, string> = {
  idle: C.ink, listening: C.primary, thinking: C.primary, speaking: C.primary, error: C.dangerBadge,
};

function hexWithAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export default function Orb({
  size = 26, state = "idle", level = 0, still = false, title,
}: {
  size?: number;
  state?: OrbState;
  /** Mic RMS (listening) or TTS amplitude (speaking), normalised 0–1. */
  level?: number;
  /** Avatar use: no breathing at all. */
  still?: boolean;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(0);
  const targetRef = useRef(level);
  targetRef.current = Math.max(0, Math.min(1, level));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = size * dpr; canvas.height = size * dpr;
    canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;

    const cx = size / 2, R = size * 0.33, w = Math.max(1.6, size * 0.075), d = R * 0.36;
    const colour = COLOUR[state];
    const mounted = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const t = (now - mounted) / 1000;
      // O2/W1 smoothing: level += (target − level) × 0.18 per frame.
      levelRef.current += (targetRef.current - levelRef.current) * 0.18;
      const level = reduced ? (state === "listening" || state === "speaking" ? 0.5 : levelRef.current) : levelRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // Glow: only over 40px and not idle.
      if (size > 40 && state !== "idle") {
        const g = ctx.createRadialGradient(cx, cx, R * 0.4, cx, cx, size / 2);
        g.addColorStop(0, hexWithAlpha(colour, 0.10 + level * 0.14));
        g.addColorStop(1, hexWithAlpha(colour, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      }

      ctx.lineCap = "round"; ctx.lineWidth = w;

      if (state === "idle") {
        ctx.strokeStyle = hexWithAlpha(colour, 0.9);
        ctx.beginPath(); ctx.arc(cx, cx, R, 0, Math.PI * 2); ctx.stroke();
        const breathe = still || reduced ? 1 : 1 + 0.04 * Math.sin(1.3 * t);
        ctx.fillStyle = hexWithAlpha(colour, 0.9);
        ctx.beginPath(); ctx.arc(cx, cx, d * breathe, 0, Math.PI * 2); ctx.fill();
      } else if (state === "listening") {
        ctx.strokeStyle = colour;
        ctx.beginPath();
        for (let i = 0; i <= 90; i += 1) {
          const a = (i / 90) * Math.PI * 2;
          const r = R + R * level * 0.16 * (0.6 * Math.sin(3 * a + 2.4 * t) + 0.4 * Math.sin(5 * a - 3.3 * t));
          const x = cx + r * Math.cos(a), y = cx + r * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = colour;
        ctx.beginPath(); ctx.arc(cx, cx, d * (0.85 + level * 0.55), 0, Math.PI * 2); ctx.fill();
      } else if (state === "thinking") {
        ctx.strokeStyle = hexWithAlpha(colour, 0.16);
        ctx.beginPath(); ctx.arc(cx, cx, R, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = colour;
        const start = reduced ? 0 : 3.2 * t;
        const len = reduced ? 0.7 * Math.PI : Math.PI * (0.55 + 0.25 * Math.sin(1.6 * t));
        ctx.beginPath(); ctx.arc(cx, cx, R, start, start + len); ctx.stroke();
        ctx.fillStyle = colour;
        ctx.beginPath(); ctx.arc(cx, cx, d * (reduced ? 0.86 : 0.8 + 0.12 * Math.sin(4 * t)), 0, Math.PI * 2); ctx.fill();
      } else if (state === "speaking") {
        ctx.strokeStyle = colour;
        ctx.beginPath();
        for (let i = 0; i <= 90; i += 1) {
          const a = (i / 90) * Math.PI * 2;
          const r = R + R * level * 0.05 * Math.sin(2 * a + 4 * t);
          const x = cx + r * Math.cos(a), y = cx + r * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
        if (!reduced) {
          ctx.lineWidth = w * 0.45;
          for (let i = 0; i < 3; i += 1) {
            const p = (0.55 * t + i / 3) % 1;
            ctx.strokeStyle = hexWithAlpha(colour, (1 - p) * 0.28);
            ctx.beginPath(); ctx.arc(cx, cx, R + p * size * 0.16, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.lineWidth = w;
        }
        ctx.fillStyle = colour;
        ctx.beginPath(); ctx.arc(cx, cx, d * (0.9 + level * 0.35), 0, Math.PI * 2); ctx.fill();
      } else {
        // error — a gap at 12 o'clock, full dot, NO animation at all.
        ctx.strokeStyle = colour;
        ctx.beginPath(); ctx.arc(cx, cx, R, -Math.PI / 2 + 0.55, -Math.PI / 2 - 0.55 + Math.PI * 2); ctx.stroke();
        ctx.fillStyle = colour;
        ctx.beginPath(); ctx.arc(cx, cx, d, 0, Math.PI * 2); ctx.fill();
      }

      const animates = !reduced && state !== "error" && !(state === "idle" && still);
      if (animates) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size, state, still]);

  return <canvas ref={ref} role="img" aria-label={title ?? `Ops Agent · ${state}`} style={{ display: "block", width: size, height: size, flex: "none" }} />;
}
