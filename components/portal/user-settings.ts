"use client";

// The person's own settings in the browser (portal redesign, stage 4): table density, motion and pinned tabs. Each is
// kept in localStorage — THEME_SCRIPT applies density and motion to <html> before the first paint — and on the account,
// which follows the person to another device and wins when it answers (adoptAccountSettings). The start page is read
// on the server (app/page.tsx); the dashboard layout has its own store (lib/dashboard-layout).

import { useEffect, useState } from "react";
import { isDensity, isMotion, isStartPage, sanitizePins, DEFAULT_START, type Density, type Motion, type Pin } from "@/lib/user-settings";

export const DENSITY_KEY = "cw-density";
export const MOTION_KEY = "cw-motion";
const PINS_KEY = "cw-pins";
const EVENT = "cw-settings-change";

type Local = { density: Density; motion: Motion; pins: Pin[] };
const read = (): Local => {
  try {
    const d = localStorage.getItem(DENSITY_KEY), m = localStorage.getItem(MOTION_KEY);
    return { density: isDensity(d) ? d : "comfortable", motion: isMotion(m) ? m : "system", pins: sanitizePins(JSON.parse(localStorage.getItem(PINS_KEY) || "[]")) ?? [] };
  } catch { return { density: "comfortable", motion: "system", pins: [] }; }
};
function applyToPage(s: Local) {
  const root = document.documentElement;
  if (s.density === "compact") root.setAttribute("data-density", "compact"); else root.removeAttribute("data-density");
  if (s.motion === "reduce") root.setAttribute("data-motion", "reduce"); else root.removeAttribute("data-motion");
}
// Settings changed in this page since it loaded. The account's copy, which may arrive a moment later, never overwrites
// them — the person's latest choice is the one they just made.
const changedHere = new Set<keyof Local>();
function store(patch: Partial<Local>) {
  try {
    if (patch.density) localStorage.setItem(DENSITY_KEY, patch.density);
    if (patch.motion) localStorage.setItem(MOTION_KEY, patch.motion);
    if (patch.pins) localStorage.setItem(PINS_KEY, JSON.stringify(patch.pins));
  } catch { /* private mode: still applies on this page */ }
  applyToPage(read());
  window.dispatchEvent(new CustomEvent(EVENT));
}

const COLUMN = { density: "table_density", motion: "motion", pins: "pinned_tabs", startPage: "start_page" } as const;
export type SettingKey = keyof typeof COLUMN;

/** Save one setting: here at once, then on the account. Resolves to what happened to the account copy. */
export async function saveSetting(key: SettingKey, value: Density | Motion | Pin[] | string): Promise<"saved" | "local" | "failed"> {
  if (key !== "startPage") { changedHere.add(key); store({ [key]: value } as Partial<Local>); }
  const res = await fetch("/api/user/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ [COLUMN[key]]: value }) }).catch(() => null);
  if (!res?.ok) return "failed";
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body?.unsaved) && body.unsaved.includes(COLUMN[key]) ? "local" : "saved";
}

/** The account's saved values win over this browser's (they are the ones the person last chose, anywhere). */
export function adoptAccountSettings(prefs: Record<string, unknown> | null | undefined) {
  if (!prefs) return;
  const patch: Partial<Local> = {};
  if (isDensity(prefs.table_density) && !changedHere.has("density")) patch.density = prefs.table_density;
  if (isMotion(prefs.motion) && !changedHere.has("motion")) patch.motion = prefs.motion;
  if ("pinned_tabs" in prefs && prefs.pinned_tabs !== null && !changedHere.has("pins")) { const p = sanitizePins(prefs.pinned_tabs); if (p) patch.pins = p; }
  const cur = read();
  if ((patch.density && patch.density !== cur.density) || (patch.motion && patch.motion !== cur.motion) || (patch.pins && JSON.stringify(patch.pins) !== JSON.stringify(cur.pins))) store(patch);
}

/** Density, motion and pins as they stand in this browser; follows changes from this tab, other tabs and the account. */
export function useLocalSettings() {
  const [s, setS] = useState<Local>({ density: "comfortable", motion: "system", pins: [] });
  useEffect(() => {
    const sync = () => setS(read());
    sync();
    const onStorage = (e: StorageEvent) => { if (e.key === DENSITY_KEY || e.key === MOTION_KEY || e.key === PINS_KEY) { applyToPage(read()); sync(); } };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", onStorage); };
  }, []);
  return s;
}

export const startPageOf = (prefs: Record<string, unknown> | null | undefined) => (isStartPage(prefs?.start_page) ? (prefs!.start_page as string) : DEFAULT_START);
