// Shared by every in-page script: a host element with a CLOSED shadow root, the foreign-surface treatment
// (§E8 VB: opaque white, rgba border, white halo + drop shadow), the fonts, the animation register (§E15) and a few
// SVG helpers. Nothing in here reads the page. Each content bundle carries its own copy of this module.

export type Surface = { host: HTMLElement; root: ShadowRoot; layer: HTMLElement };

const surfaces = new Map<string, Surface>();
const FONT_STYLE_ID = "cw-fonts";

function fontUrl(file: string): string | null {
  try {
    const c = (globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } }).chrome;
    return c?.runtime?.getURL ? c.runtime.getURL(`fonts/${file}`) : null;
  } catch { return null; }
}

// Chrome ignores @font-face rules declared inside a shadow tree, so the faces are declared once in the document
// with unique family names (the page's CSS never refers to them). Missing files fall through to the system stacks.
function ensureFonts(): void {
  if (document.getElementById(FONT_STYLE_ID)) return;
  const sans = fontUrl("PublicSans-400_800.woff2");
  const mono = fontUrl("IBMPlexMono-400.woff2");
  const monoBold = fontUrl("IBMPlexMono-600.woff2");
  const rules: string[] = [];
  if (sans) rules.push(`@font-face{font-family:"CW Public Sans";src:url("${sans}") format("woff2");font-weight:100 900;font-style:normal;font-display:swap}`);
  if (mono) rules.push(`@font-face{font-family:"CW Plex Mono";src:url("${mono}") format("woff2");font-weight:400;font-style:normal;font-display:swap}`);
  if (monoBold) rules.push(`@font-face{font-family:"CW Plex Mono";src:url("${monoBold}") format("woff2");font-weight:600;font-style:normal;font-display:swap}`);
  if (!rules.length) return;
  const style = document.createElement("style");
  style.id = FONT_STYLE_ID;
  style.textContent = rules.join("\n");
  (document.head || document.documentElement).appendChild(style);
}

export const SANS = `"CW Public Sans", "Public Sans", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
export const MONO = `"CW Plex Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

export const BASE_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.cw-layer { position: fixed; top: 0; left: 0; width: 0; height: 0; overflow: visible; }
.cw-surface {
  background: #ffffff; color: #17181c;
  border: 1px solid rgba(16,18,22,.28);
  box-shadow: 0 0 0 3px rgba(255,255,255,.92), 0 10px 30px rgba(0,0,0,.32);
  font-family: ${SANS}; font-size: 13px; line-height: 1.4; font-weight: 400;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  letter-spacing: normal; text-align: left; white-space: normal; cursor: default;
}
.cw-mono, .cw-key { font-family: ${MONO}; font-variant-numeric: tabular-nums; }
.cw-key { font-weight: 400; white-space: nowrap; }
.cw-sep { color: #9aa0a8; }
.cw-btn { appearance: none; -webkit-appearance: none; border: 0; margin: 0; cursor: pointer; font-family: ${SANS}; line-height: 1; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.cw-btn:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.cw-primary { background: #2563eb; color: #fff; }
.cw-primary:hover { background: #1d4ed8; }
.cw-ico { display: inline-block; flex: none; vertical-align: middle; }
.cw-ico svg { display: block; width: 100%; height: 100%; }

/* §E15 register. */
@keyframes cwX1 { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
@keyframes cwX2 { from { opacity: 1; } to { opacity: 0; } }
@keyframes cwX3 { from { opacity: 0; } to { opacity: 1; } }
@keyframes cwX5 { 0% { opacity: 0; } 50% { opacity: .6; } 100% { opacity: 0; } }
@keyframes cwX6 { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes cwX8 { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@keyframes cwX8out { from { opacity: 1; } to { opacity: 0; } }
@keyframes cwX9 { from { opacity: 0; } to { opacity: 1; } }
@keyframes cwX11 { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes cwSlide { from { left: -33%; } to { left: 100%; } }
.cw-x1 { animation: cwX1 120ms ease-out both; }
.cw-x2 { animation: cwX2 80ms ease-in both; }
.cw-x3 { animation: cwX3 120ms ease-out both; }
.cw-x5 { animation: cwX5 180ms ease-out both; }
.cw-x6 { animation: cwX6 120ms ease-out both; }
.cw-x7 { transition: width 150ms ease-out; }
.cw-x8 { animation: cwX8 120ms ease-out both; }
.cw-x8out { animation: cwX8out 160ms ease-in both; }
.cw-x9 { animation: cwX9 150ms ease-out both; }
.cw-x11 { animation: cwX11 120ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .cw-x1, .cw-x2, .cw-x3, .cw-x5, .cw-x6, .cw-x8, .cw-x8out, .cw-x9, .cw-x11 { animation-duration: 1ms !important; }
  .cw-x7 { transition: none !important; }
  .cw-slide { animation: none !important; left: 0 !important; }
}
`;

export function reducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** Creates (or reuses) the closed-shadow surface with the given id. The host sits on <html>, above everything. */
export function createSurface(id: string, extraCss = ""): Surface {
  const existing = surfaces.get(id);
  if (existing && existing.host.isConnected) return existing;
  // An orphan host from an earlier injection (its shadow root is closed and unreachable): drop it.
  document.getElementById(id)?.remove();
  ensureFonts();
  const host = document.createElement("div");
  host.id = id;
  host.setAttribute("style", "all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; display: block; overflow: visible;");
  host.setAttribute("data-clearway", "surface");
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = BASE_CSS + "\n" + extraCss;
  root.appendChild(style);
  const layer = document.createElement("div");
  layer.className = "cw-layer";
  root.appendChild(layer);
  document.documentElement.appendChild(host);
  const s = { host, root, layer };
  surfaces.set(id, s);
  return s;
}

export function getSurface(id: string): Surface | undefined {
  const s = surfaces.get(id);
  return s && s.host.isConnected ? s : undefined;
}

/** Tears a surface down. */
export function remove(id: string): void {
  const s = surfaces.get(id);
  surfaces.delete(id);
  if (s) s.host.remove();
  else document.getElementById(id)?.remove();
}

/** The console's ring mark: a 2px ring with a centre dot (6px at 16, 5px at 14). */
export function ringMark(size = 16, color = "#2563eb"): string {
  const c = size / 2;
  const r = c - 1;                   // 2px stroke, kept inside the box
  const dot = size >= 16 ? 3 : 2.5;
  return `<span class="cw-ico cw-ring" style="width:${size}px;height:${size}px" aria-hidden="true"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="2"/><circle cx="${c}" cy="${c}" r="${dot}" fill="${color}"/></svg></span>`;
}

// lucide paths (copied from public/icons/<name>.svg; scan and text-select from lucide itself, the console has no file for them).
const PATHS: Record<string, string> = {
  "scan": '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
  "text-select": '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>',
  "undo-2": '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  "circle-check": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  "mic": '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  "globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  "database": '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
};

export type IconName = keyof typeof PATHS;

/** An inline lucide icon (stroke 2, currentColor). */
export function icon(name: string, size = 14, color = "currentColor"): string {
  const d = PATHS[name] ?? PATHS["circle-check"];
  return `<span class="cw-ico cw-ico-${name}" style="width:${size}px;height:${size}px;color:${color}" aria-hidden="true"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
}

/** Mono keycaps: keys("⌥⇧E") → <span class="cw-key">⌥⇧E</span>; several are joined with a thin space. */
export function keys(...labels: string[]): string {
  return labels.map((k) => `<span class="cw-key">${escapeHtml(k)}</span>`).join(" ");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Waveform bars (§4.2): n bars, heights from 0..1 bands mapped to min..max px. */
export function waveform(n: number, bands: number[] | undefined, min: number, max: number, color = "#2563eb", width = 3, gap = 2): HTMLElement {
  const el = document.createElement("span");
  el.className = "cw-wave";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `display:inline-flex;align-items:center;gap:${gap}px;height:${max}px;flex:none`;
  for (let i = 0; i < n; i++) {
    const bar = document.createElement("i");
    bar.style.cssText = `display:block;width:${width}px;border-radius:2px;background:${color};height:${min}px;transition:height 60ms linear`;
    el.appendChild(bar);
  }
  setWave(el, bands, min, max);
  return el;
}

export function setWave(el: HTMLElement, bands: number[] | undefined, min: number, max: number): void {
  const bars = el.children;
  for (let i = 0; i < bars.length; i++) {
    const b = bands && bands.length ? bands[Math.floor((i * bands.length) / bars.length)] : 0;
    const v = Math.max(0, Math.min(1, Number(b) || 0));
    (bars[i] as HTMLElement).style.height = `${Math.round((min + v * (max - min)) * 10) / 10}px`;
  }
}

/** Safe wrapper around chrome.runtime.sendMessage (the worker may be asleep or the extension reloaded). */
export function send(message: unknown): void {
  try {
    const p = chrome.runtime.sendMessage(message) as unknown as Promise<unknown> | undefined;
    if (p && typeof (p as Promise<unknown>).catch === "function") (p as Promise<unknown>).catch(() => {});
  } catch { /* extension context gone */ }
}

export function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

/** m:ss from seconds. */
export function mmss(seconds: number | undefined): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
