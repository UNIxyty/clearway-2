"use client";

// Waveform — the compact level meter (design spec §4.2).
//
// Genuinely small; replaces the orb in compact contexts. Bars are driven by
// `levels` the caller supplies (mic bands while listening, TTS output while
// speaking), 0–1 each. The design's sine simulations are not shipped: with no
// caller data the bars sit at the "invoked" 0.12 — flat dots until sound
// arrives — which is exactly the state the spec draws for that moment.

import { useEffect, useRef } from "react";
import { C, WALL } from "./tokens";

export type WaveformVariant = "bar" | "wall" | "speaking" | "short";
const VARIANTS: Record<WaveformVariant, { w: number; h: number; bars: number; colour: string }> = {
  bar: { w: 56, h: 18, bars: 10, colour: C.primary },
  wall: { w: 48, h: 16, bars: 10, colour: WALL.accent },
  speaking: { w: 40, h: 16, bars: 7, colour: C.primary },
  short: { w: 32, h: 14, bars: 6, colour: C.primary },
};

export default function Waveform({
  variant = "bar", levels, mode = "invoked", title,
}: {
  variant?: WaveformVariant;
  /** One value per bar, 0–1. Length may differ from the bar count; it is resampled. */
  levels?: number[] | null;
  mode?: "invoked" | "listening" | "low" | "speaking";
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const current = useRef<number[]>([]);
  const target = useRef<number[]>([]);
  const { w, h, bars, colour } = VARIANTS[variant];

  const resampled: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    if (levels && levels.length) resampled.push(Math.max(0, Math.min(1, levels[Math.floor((i / bars) * levels.length)] ?? 0)));
    else resampled.push(mode === "invoked" ? 0.12 : 0);
  }
  target.current = resampled;

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const gap = 2, bw = (w - gap * (bars - 1)) / bars;
    if (current.current.length !== bars) current.current = new Array(bars).fill(0.12);
    let frame = 0; let last = 0;
    const draw = (now: number) => {
      // Reduced motion: static bars at the current level, at most 4 updates/s, no tween.
      if (reduced && now - last < 250) { frame = requestAnimationFrame(draw); return; }
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = colour;
      for (let i = 0; i < bars; i += 1) {
        const t = target.current[i] ?? 0;
        current.current[i] = reduced ? t : current.current[i] + (t - current.current[i]) * 0.25;
        const bh = Math.max(2, current.current[i] * h);
        const x = i * (bw + gap), y = (h - bh) / 2, r = bw / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + bw, y, x + bw, y + bh, r); ctx.arcTo(x + bw, y + bh, x, y + bh, r); ctx.arcTo(x, y + bh, x, y, r); ctx.arcTo(x, y, x + bw, y, r);
        ctx.closePath(); ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [w, h, bars, colour]);

  return <canvas ref={ref} role="img" aria-label={title ?? "Voice level"} style={{ display: "block", width: w, height: h, flex: "none" }} />;
}
