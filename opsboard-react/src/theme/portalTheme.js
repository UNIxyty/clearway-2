// The console follows the portal's theme (wall console, Stage 1, 2026-10-18). This is the portal's
// components/portal/theme.ts in plain JS: the same choice ("system" | "light" | "dark"), the same localStorage key
// (cw-theme — shared with the portal on the same origin, so a choice made in Settings › Appearance reaches the console
// at once), the same saved copy on the account (GET/POST /api/user/preferences, which the portal serves), and the same
// effect: data-theme and color-scheme on <html>, read by the --cw-* tokens the console's stylesheet carries.
//
// The portal's Motion preference (Settings › Preferences: "Match device" | "Reduce") comes the same way: localStorage
// cw-motion, the account's `motion`, data-motion="reduce" on <html> (components/portal/user-settings.ts). One place
// chooses both; the console has no control of its own for either, and follows a change made in another tab at once.
//
// Only the console surface calls this. The wall display never does: it sets no data-theme or data-motion, loads no
// --cw-* token and keeps its own per-account colours (scripts/check-console-theme.mjs proves it).
import { useEffect, useState } from 'react';

export const THEME_KEY = 'cw-theme';
export const MOTION_KEY = 'cw-motion';
const EVENT = 'cw-theme-change';
const isChoice = (v) => v === 'system' || v === 'light' || v === 'dark';
const isMotion = (v) => v === 'system' || v === 'reduce';

export function readMotion() {
  try { const v = localStorage.getItem(MOTION_KEY); return isMotion(v) ? v : 'system'; } catch { return 'system'; }
}
export function applyPortalMotion(motion = readMotion()) {
  const root = document.documentElement;
  if (motion === 'reduce') root.setAttribute('data-motion', 'reduce'); else root.removeAttribute('data-motion');
  return motion;
}

export function readChoice() {
  try { const v = localStorage.getItem(THEME_KEY); return isChoice(v) ? v : 'system'; } catch { return 'system'; }
}
const systemTheme = () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
export const resolve = (choice) => (choice === 'system' ? systemTheme() : choice);

export function applyPortalTheme(choice = readChoice()) {
  const theme = resolve(choice);
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  return theme;
}

/** Change the theme here and now; save it to the account unless it came from the account. */
export function setChoice(choice, { save = true } = {}) {
  try { localStorage.setItem(THEME_KEY, choice); } catch { /* private mode: still applies for this page */ }
  applyPortalTheme(choice);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: choice }));
  if (save) {
    fetch('/api/user/preferences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: choice }) }).catch(() => {});
  }
}

/** The account's saved choice wins over this device's (it is the one the person last made, anywhere). */
export async function adoptAccountChoice() {
  try {
    const r = await fetch('/api/user/preferences', { headers: { accept: 'application/json' } });
    if (!r.ok) return;
    const prefs = (await r.json())?.preferences ?? {};
    if (isChoice(prefs.theme) && prefs.theme !== readChoice()) setChoice(prefs.theme, { save: false });
    if (isMotion(prefs.motion) && prefs.motion !== readMotion()) {
      try { localStorage.setItem(MOTION_KEY, prefs.motion); } catch { /* private mode */ }
      applyPortalMotion(prefs.motion);
      window.dispatchEvent(new CustomEvent(EVENT));
    }
  } catch { /* the portal is not reachable from here (the rig's console preview): this device's choice stands */ }
}

/**
 * Apply the theme before the first paint of the console and keep it current: other tabs (storage), the device setting
 * (matchMedia, when the choice is "system"), and the account's saved choice. Returns the resolved theme.
 */
export function usePortalTheme() {
  const [theme, setTheme] = useState(() => (typeof document === 'undefined' ? 'light' : applyPortalTheme()));
  const [motion, setMotion] = useState(() => (typeof document === 'undefined' ? 'system' : applyPortalMotion()));
  useEffect(() => {
    const sync = () => { setTheme(applyPortalTheme()); setMotion(applyPortalMotion()); };
    // Another tab (the portal's Settings) changed the choice: the browser tells this one, and it follows at once.
    const onStorage = (e) => { if (e.key === THEME_KEY || e.key === MOTION_KEY) sync(); };
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSystem = () => { if (readChoice() === 'system') sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    mq?.addEventListener?.('change', onSystem);
    adoptAccountChoice().then(sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', onStorage); mq?.removeEventListener?.('change', onSystem); };
  }, []);
  return { theme, choice: readChoice(), motion, setChoice };
}
