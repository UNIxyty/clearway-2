"use client";

// Keyboard shortcuts (design spec §15), editable in Agent settings (§12).
// A bind is "Mod+Shift+J": `Mod` is ⌘ on a Mac and Ctrl elsewhere; `Meta`
// and `Ctrl` are literal and only appear in the per-platform sets. Esc is
// fixed. The organisation's binds come from GET /api/settings; while they
// load, or for someone without the agent, the defaults apply.

import { useEffect, useState } from "react";
import { AGENT_BASE } from "../types";

export type BindAction = "open" | "expand" | "confirm" | "voice";
export type BindSet = Record<BindAction, string>;
export type KeybindConfig = { perPlatform: boolean; shared: BindSet; mac: BindSet; windows: BindSet };
export type Platform = "mac" | "windows";

export const BIND_DEFAULTS: BindSet = { open: "Mod+J", expand: "Mod+Shift+J", confirm: "Mod+Enter", voice: "Alt+Space" };
export const DEFAULT_CONFIG: KeybindConfig = { perPlatform: false, shared: { ...BIND_DEFAULTS }, mac: { ...BIND_DEFAULTS }, windows: { ...BIND_DEFAULTS } };
const CACHE_KEY = "cw-agent-keybinds";
const EVENT = "cw-agent-keybinds";

export function platform(): Platform {
  if (typeof navigator === "undefined") return "mac";
  const p = `${(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad/i.test(p) ? "mac" : "windows";
}

/** The set that applies to this machine. */
export function activeSet(config: KeybindConfig, os: Platform = platform()): BindSet {
  return { ...BIND_DEFAULTS, ...(config.perPlatform ? config[os] : config.shared) };
}

type Parsed = { mod: boolean; meta: boolean; ctrl: boolean; alt: boolean; shift: boolean; key: string };
export function parseBind(bind: string): Parsed {
  const parts = bind.split("+");
  const key = parts.pop() ?? "";
  const has = (t: string) => parts.includes(t);
  return { mod: has("Mod"), meta: has("Meta"), ctrl: has("Ctrl"), alt: has("Alt"), shift: has("Shift"), key };
}

/**
 * The physical key, from `code` first: on a Mac, ⌥ Space delivers a
 * non-breaking space as `key` and ⌥J delivers "∆", so `key` alone never
 * matches an Alt chord. `code` is layout-independent for letters and digits.
 */
export function eventKey(e: KeyboardEvent): string {
  const code = e.code || "";
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit(\d)$/.exec(code); if (m) return m[1];
  if (code === "Space") return "Space";
  if (code === "Enter" || code === "NumpadEnter") return "Enter";
  if (code === "Escape") return "Escape";
  if (/^(Arrow(Up|Down|Left|Right)|F[1-9]|F1[0-2])$/.test(code)) return code;
  if (e.key === " " || e.key === "\u00a0") return "Space";
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key;
}

/** Does this keydown match the bind on this platform? */
export function matches(e: KeyboardEvent, bind: string, os: Platform = platform()): boolean {
  const b = parseBind(bind);
  const wantMeta = b.meta || (b.mod && os === "mac");
  const wantCtrl = b.ctrl || (b.mod && os !== "mac");
  return e.metaKey === wantMeta && e.ctrlKey === wantCtrl && e.altKey === b.alt && e.shiftKey === b.shift && eventKey(e) === b.key;
}

/** Turn a keydown into a bind string; `null` when it is not a usable chord. */
export function bindFromEvent(e: KeyboardEvent, style: "mod" | "literal", os: Platform = platform()): string | null {
  const key = eventKey(e);
  if (["Meta", "Control", "Alt", "Shift", "Dead", "Unidentified", "Tab", "CapsLock"].includes(key)) return null;
  if (!e.metaKey && !e.ctrlKey && !e.altKey) return null; // a bare letter would eat typing
  const parts: string[] = [];
  const primary = os === "mac" ? e.metaKey : e.ctrlKey, secondary = os === "mac" ? e.ctrlKey : e.metaKey;
  if (style === "mod") { if (primary) parts.push("Mod"); if (secondary) parts.push(os === "mac" ? "Ctrl" : "Meta"); }
  else { if (e.metaKey) parts.push("Meta"); if (e.ctrlKey) parts.push("Ctrl"); }
  if (e.altKey) parts.push("Alt"); if (e.shiftKey) parts.push("Shift");
  return [...parts, key].join("+");
}

/** Keycap label: ⌘⇧J on a Mac, Ctrl+Shift+J on Windows. */
export function label(bind: string, os: Platform = platform()): string {
  const b = parseBind(bind);
  const keyName = b.key === "Enter" ? (os === "mac" ? "⏎" : "Enter") : b.key === "Space" ? (os === "mac" ? "Space" : "Space") : b.key === "Escape" ? "Esc" : b.key;
  if (os === "mac") return `${b.ctrl ? "⌃" : ""}${b.alt ? "⌥" : ""}${b.shift ? "⇧" : ""}${b.mod || b.meta ? "⌘" : ""}${b.key === "Space" ? " " : ""}${keyName}`;
  const parts: string[] = [];
  if (b.mod || b.ctrl) parts.push("Ctrl"); if (b.meta) parts.push("Win"); if (b.alt) parts.push("Alt"); if (b.shift) parts.push("Shift");
  return [...parts, keyName].join("+");
}

function readCache(): KeybindConfig | null {
  try { const raw = sessionStorage.getItem(CACHE_KEY); return raw ? (JSON.parse(raw) as KeybindConfig) : null; } catch { return null; }
}
export function publishKeybinds(config: KeybindConfig) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(config)); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: config }));
}

/** The organisation's binds, resolved for this machine. Cached per tab so keycaps never flash the defaults. */
export type Capabilities = Record<string, boolean>;
let capsCache: Capabilities | null = null;
export function useKeybinds(): { config: KeybindConfig; binds: BindSet; os: Platform; caps: Capabilities; label: (a: BindAction) => string; matches: (e: KeyboardEvent, a: BindAction) => boolean } {
  const [config, setConfig] = useState<KeybindConfig>(() => (typeof window === "undefined" ? DEFAULT_CONFIG : readCache() ?? DEFAULT_CONFIG));
  const [os, setOs] = useState<Platform>("mac");
  const [caps, setCaps] = useState<Capabilities>(() => capsCache ?? {});
  useEffect(() => {
    setOs(platform());
    const onChange = (e: Event) => setConfig((e as CustomEvent<KeybindConfig>).detail);
    window.addEventListener(EVENT, onChange);
    fetch(`${AGENT_BASE}/api/settings`, { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b) => { if (b?.ok && b.keybinds) { setConfig(b.keybinds); try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(b.keybinds)); } catch { /* private mode */ } } if (b?.ok && Array.isArray(b.capabilities)) { const next: Capabilities = {}; for (const c of b.capabilities) next[c.key] = Boolean(c.enabled); capsCache = next; setCaps(next); } }).catch(() => {});
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  const binds = activeSet(config, os);
  return { config, binds, os, caps, label: (a) => label(binds[a], os), matches: (e, a) => matches(e, binds[a], os) };
}
