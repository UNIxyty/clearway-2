// The phone app's theme: the same choice the portal keeps on this device ("cw-theme": light, dark or system), drawn
// with the phone tokens. Only the phone's own marks are set on <html> (class cw3-doc, data-cw3-theme): the portal's
// data-theme is left alone, so nothing the console or the display reads changes.
import { useCallback, useEffect, useState } from 'react';
import { THEME_KEY, readChoice, resolve } from '../../theme/portalTheme';

const EVENT = 'cw-theme-change';

function mark(theme) {
  const root = document.documentElement;
  root.classList.add('cw3-doc');
  root.setAttribute('data-cw3-theme', theme);
}

/** { theme: 'light'|'dark'|'system', resolved: 'light'|'dark', setTheme(v) } — setTheme throws when the device refuses to keep it. */
export function usePhoneTheme() {
  const [choice, setChoice] = useState(readChoice);
  const [resolved, setResolved] = useState(() => resolve(readChoice()));
  useEffect(() => {
    const sync = () => { const v = readChoice(); setChoice(v); setResolved(resolve(v)); };
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    mq?.addEventListener?.('change', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(EVENT, sync); mq?.removeEventListener?.('change', sync); };
  }, []);
  useEffect(() => { mark(resolved); }, [resolved]);
  useEffect(() => () => { document.documentElement.classList.remove('cw3-doc'); document.documentElement.removeAttribute('data-cw3-theme'); }, []);
  const setTheme = useCallback((v) => {
    const next = v === 'light' || v === 'dark' ? v : 'system';
    localStorage.setItem(THEME_KEY, next); // throws when storage is closed: the caller says so
    setChoice(next); setResolved(resolve(next));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);
  return { theme: choice, resolved, setTheme };
}
