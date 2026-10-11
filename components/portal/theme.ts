"use client";

// Theme switching (portal redesign §1.3). Three choices: "system" (match this device, the default), "light", "dark".
// The choice lives in localStorage (cw-theme), which THEME_SCRIPT reads in <head> before first paint, and on the
// account (user_preferences.theme), which follows the person to another device. What the page uses is data-theme on
// <html>: every colour is a --cw-* token keyed off it, so a change applies instantly, with no transition and no
// re-render. The Digital Wall reads neither (§1.4).
import { useEffect, useState } from "react";
import { THEME_KEY } from "./theme-script";

export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";
const EVENT = "cw-theme-change";

const isChoice = (v: unknown): v is ThemeChoice => v === "system" || v === "light" || v === "dark";

export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isChoice(v) ? v : "system";
  } catch {
    return "system";
  }
}
const systemTheme = (): Theme => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
export const resolve = (choice: ThemeChoice): Theme => (choice === "system" ? systemTheme() : choice);

function apply(choice: ThemeChoice) {
  const theme = resolve(choice);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

/** Change the theme here and now; save it to the account unless it came from the account. */
export function setChoice(choice: ThemeChoice, { save = true }: { save?: boolean } = {}) {
  try { localStorage.setItem(THEME_KEY, choice); } catch { /* private mode: still applies for this page */ }
  apply(choice);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: choice }));
  if (save) {
    void fetch("/api/user/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: choice }) }).catch(() => {});
  }
}

/** The account's saved choice wins over this device's (it is the one the person last made, anywhere). */
export function adoptAccountChoice(accountChoice: unknown) {
  if (isChoice(accountChoice) && accountChoice !== readChoice()) setChoice(accountChoice, { save: false });
}

/** The current choice and the theme it resolves to; follows other tabs and, on "system", the device setting. */
export function useTheme() {
  const [choice, setLocal] = useState<ThemeChoice>("system");
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const sync = () => { const c = readChoice(); setLocal(c); setTheme(resolve(c)); };
    sync();
    const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) { apply(readChoice()); sync(); } };
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystem = () => { if (readChoice() === "system") { apply("system"); sync(); } };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    mq?.addEventListener?.("change", onSystem);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", onStorage); mq?.removeEventListener?.("change", onSystem); };
  }, []);
  return { choice, theme, setChoice };
}
