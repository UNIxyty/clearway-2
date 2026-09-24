import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../components/console/ui';

// Ops Agent on the wall console (design spec §5, §6.14): ⌘J / Ctrl+J opens the
// same side panel the portal has. The console is a separate app, so the panel
// is the portal's own page (/agent/panel) hosted in a same-origin iframe, 420
// wide, pushed in beside the content. The page↔panel contract is four
// postMessage types, all same-origin:
//   host → panel   cw-agent-context   { context }          the page/record in view
//   panel → host   cw-agent-closed                         ×, Esc
//   panel → host   cw-agent-minimised { on }               tab on the right edge
//   panel → host   cw-agent-expand    { url }              open the full page
//   panel → host   cw-agent-toggle                          ⌘J pressed inside the iframe
// The AgentNavRow component lives in components/console/AgentDock.jsx.
// A user without a grant sees nothing: the same availability probe the
// portal uses gates the shortcut, the sidebar row and the dock itself.

const PANEL_WIDTH = 420;

// Shortcut binds — same grammar as components/agent/ui/keybinds.ts: "Mod+Shift+J",
// Mod = ⌘ on a Mac, Ctrl elsewhere. Kept tiny here rather than imported across apps.
const DEFAULT_BINDS = { open: 'Mod+J', expand: 'Mod+Shift+J', confirm: 'Mod+Enter' };
const IS_MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(`${navigator.platform} ${navigator.userAgent}`);
function activeBinds(config) { return config.perPlatform ? (IS_MAC ? config.mac : config.windows) : config.shared; }
function parseBind(bind) { const parts = String(bind).split('+'); const key = parts.pop(); return { mod: parts.includes('Mod'), meta: parts.includes('Meta'), ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift'), key }; }
function matchesBind(e, bind) {
  const b = parseBind(bind); const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const wantMeta = b.meta || (b.mod && IS_MAC), wantCtrl = b.ctrl || (b.mod && !IS_MAC);
  return e.metaKey === wantMeta && e.ctrlKey === wantCtrl && e.altKey === b.alt && e.shiftKey === b.shift && key === b.key;
}
function labelBind(bind) {
  const b = parseBind(bind); const key = b.key === 'Enter' ? (IS_MAC ? '⏎' : 'Enter') : b.key;
  if (IS_MAC) return `${b.ctrl ? '⌃' : ''}${b.alt ? '⌥' : ''}${b.shift ? '⇧' : ''}${b.mod || b.meta ? '⌘' : ''}${key}`;
  return [b.mod || b.ctrl ? 'Ctrl' : null, b.meta ? 'Win' : null, b.alt ? 'Alt' : null, b.shift ? 'Shift' : null, key].filter(Boolean).join('+');
}
const TAB_WIDTH = 44;

function consoleContext(page, label) {
  const kind = page === 'notam-check' ? 'notam-check' : page === 'limitations' ? 'limitations' : 'wall';
  return { kind, label: label || 'Digital Wall', page, icon: 'monitor' };
}

export function useAgentDock({ page, label }) {
  const [available, setAvailable] = useState(false);
  const [binds, setBinds] = useState(DEFAULT_BINDS);
  // "Open as side panel" from the full page hands the thread over through
  // sessionStorage (same tab, same origin), exactly as the portal shell does.
  const [openWith] = useState(() => {
    try { const id = sessionStorage.getItem('cw-agent-open-with'); if (id !== null) { sessionStorage.removeItem('cw-agent-open-with'); return id || ''; } } catch { /* private mode */ }
    return null;
  });
  const [open, setOpen] = useState(openWith !== null);
  const [minimised, setMinimised] = useState(false);
  const frameRef = useRef(null);
  const context = useMemo(() => consoleContext(page, label), [page, label]);

  useEffect(() => {
    let alive = true;
    fetch('/api/assistant/availability', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setAvailable(Boolean(d?.available)); })
      .catch(() => { if (alive) setAvailable(false); });
    // The organisation's shortcuts (Agent settings), resolved for this machine.
    fetch('/agent/api/settings', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.keybinds) setBinds(activeBinds(d.keybinds)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!available) return undefined;
    const onKey = (e) => {
      if (matchesBind(e, binds.open)) { e.preventDefault(); setOpen((v) => !v); setMinimised(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [available, binds]);

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'cw-agent-closed') { setOpen(false); setMinimised(false); }
      else if (e.data.type === 'cw-agent-minimised') setMinimised(Boolean(e.data.on));
      else if (e.data.type === 'cw-agent-toggle') { setOpen((v) => !v); setMinimised(false); }
      else if (e.data.type === 'cw-agent-expand' && typeof e.data.url === 'string' && e.data.url.startsWith('/')) window.location.assign(e.data.url);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // The context follows the page while the panel is open; the panel pins it
  // once a message is sent (its own rule).
  useEffect(() => {
    const win = frameRef.current?.contentWindow;
    if (open && win) win.postMessage({ type: 'cw-agent-context', context }, window.location.origin);
  }, [context, open]);

  const src = useMemo(() => {
    const q = new URLSearchParams({ context: JSON.stringify(context) });
    if (openWith) q.set('open', openWith);
    return `/agent/panel?${q.toString()}`;
    // The iframe keeps its thread across page changes: only the first context is in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, openWith]);

  const dock = available && open ? (
    <div
      style={{ width: minimised ? TAB_WIDTH : PANEL_WIDTH, flex: 'none', order: 9, borderLeft: `1px solid ${t.border}`, background: '#fff', minHeight: 0, display: 'flex' }}
      aria-label="Ops Agent"
    >
      <iframe ref={frameRef} title="Ops Agent" src={src} style={{ border: 'none', width: '100%', height: '100%', display: 'block' }} allow="clipboard-write" />
    </div>
  ) : null;

  const toggle = useCallback(() => { setOpen((v) => !v); setMinimised(false); }, []);
  return { available, open, toggle, dock, keycap: labelBind(binds.open) };
}

