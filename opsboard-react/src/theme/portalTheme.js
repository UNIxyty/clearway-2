// The console follows the portal's theme (wall console, Stage 1, 2026-10-18). This is the portal's
// components/portal/theme.ts in plain JS: the same choice ("system" | "light" | "dark"), the same localStorage key
// (cw-theme — shared with the portal on the same origin, so a choice made in Settings › Appearance reaches the console
// at once), the same saved copy on the account (GET/POST /api/user/preferences, which the portal serves), and the same
// effect: data-theme and color-scheme on <html>, read by the --cw-* tokens the console's stylesheet carries.
//
// Only the console surface calls this. The wall display never does: it sets no data-theme, loads no --cw-* token and
// keeps its own per-account colours (scripts/check-console-theme.mjs proves it).
import { useEffect, useState } from 'react';

export const THEME_KEY = 'cw-theme';
const EVENT = 'cw-theme-change';
const isChoice = (v) => v === 'system' || v === 'light' || v === 'dark';

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
    const saved = (await r.json())?.preferences?.theme;
    if (isChoice(saved) && saved !== readChoice()) setChoice(saved, { save: false });
  } catch { /* the portal is not reachable from here (the rig's console preview): this device's choice stands */ }
}

/**
 * Apply the theme before the first paint of the console and keep it current: other tabs (storage), the device setting
 * (matchMedia, when the choice is "system"), and the account's saved choice. Returns the resolved theme.
 */
export function usePortalTheme() {
  const [theme, setTheme] = useState(() => (typeof document === 'undefined' ? 'light' : applyPortalTheme()));
  useEffect(() => {
    const sync = () => setTheme(applyPortalTheme());
    const onStorage = (e) => { if (e.key === THEME_KEY) sync(); };
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSystem = () => { if (readChoice() === 'system') sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    mq?.addEventListener?.('change', onSystem);
    adoptAccountChoice().then(sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', onStorage); mq?.removeEventListener?.('change', onSystem); };
  }, []);
  return { theme, choice: readChoice(), setChoice };
}
