"use client";

// Viewer state (spec addendum §V2, §V10): one viewer, tabs that belong to the
// conversation, the layout it covers, and what to return focus to. The console
// page underneath is never unmounted — the viewer is an overlay over the
// content column (sidebar untouched, panel untouched).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { VIEWER } from "../ui/tokens";
import type { Citation, CitationResult, DocRef, OpenOptions, ViewerTab } from "./types";

type Toast = { text: string; undo?: () => void } | null;

export type ViewerApi = {
  open: boolean;
  tabs: ViewerTab[];
  active: ViewerTab | null;
  from: string | null;
  panelClosed: boolean;
  setPanelClosed: (closed: boolean) => void;
  toast: Toast;
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  setFrom: (label: string | null) => void;
  openDocument: (ref: DocRef, opts?: OpenOptions) => void;
  close: () => void;
  closeTab: (key: string) => void;
  activate: (key: string) => void;
  patchTab: (key: string, patch: Partial<Pick<ViewerTab, "page" | "zoom" | "rotation" | "scrollTop" | "activeCitation">>) => void;
  setResult: (key: string, r: CitationResult) => void;
  addCitation: (key: string, c: Citation) => void;
  nextTab: (dir: 1 | -1) => void;
  dismissToast: () => void;
  /** The last citation request, consumed by the renderer once located. */
  pending: { key: string; citation: Citation; at: number } | null;
  consumePending: () => void;
};

const Ctx = createContext<ViewerApi | null>(null);
const STORE = "cw-agent-viewer-tabs";

function loadStore(): Record<string, { tabs: ViewerTab[]; activeKey: string | null }> {
  try { return JSON.parse(sessionStorage.getItem(STORE) || "{}"); } catch { return {}; }
}
function saveStore(store: Record<string, { tabs: ViewerTab[]; activeKey: string | null }>) {
  try { sessionStorage.setItem(STORE, JSON.stringify(store)); } catch { /* private mode */ }
}

/** Same passage → the existing citation; a new passage under a used number → the next free number. */
function placeCitation(existing: Citation[], c: Citation): Citation {
  const same = (a: Citation, b: Citation) => (a.span ?? a.verbatim?.text ?? "") === (b.span ?? b.verbatim?.text ?? "") && (a.page ?? null) === (b.page ?? null);
  const match = existing.find((e) => same(e, c));
  if (match) return match;
  if (!existing.some((e) => e.k === c.k)) return c;
  return { ...c, k: Math.max(0, ...existing.map((e) => e.k)) + 1 };
}

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<ViewerTab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [panelClosed, setPanelClosed] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [pending, setPending] = useState<ViewerApi["pending"]>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Tabs belong to the thread (§V10 B3): switching threads swaps the set.
  const setConversationId = useCallback((id: string | null) => {
    setConversationIdState((prev) => {
      if (prev === id) return prev;
      const store = loadStore();
      if (prev) store[prev] = { tabs, activeKey };
      if (id && store[id]) { setTabs(store[id].tabs); setActiveKey(store[id].activeKey); } else { setTabs([]); setActiveKey(null); }
      saveStore(store);
      return id;
    });
  }, [tabs, activeKey]);
  useEffect(() => { if (!conversationId) return; const store = loadStore(); store[conversationId] = { tabs, activeKey }; saveStore(store); }, [tabs, activeKey, conversationId]);

  const showToast = useCallback((t: Toast) => { setToast(t); if (toastTimer.current) window.clearTimeout(toastTimer.current); if (t) toastTimer.current = window.setTimeout(() => setToast(null), 6000); }, []);

  const openDocument = useCallback((ref: DocRef, opts: OpenOptions = {}) => {
    if (opts.opener) openerRef.current = opts.opener; else if (!open) openerRef.current = document.activeElement as HTMLElement;
    if (opts.from) setFrom(opts.from);
    setPanelClosed(Boolean(opts.panelClosed));
    // Place the citation against the tab as it is now, so the pending locate (and its focus) uses the same
    // number the tab will carry.
    const already = tabs.find((t) => t.ref.key === ref.key);
    if (already && opts.citation) opts = { ...opts, citation: placeCitation(already.citations, opts.citation) };
    setTabs((list) => {
      const now = Date.now();
      const existing = list.find((t) => t.ref.key === ref.key);
      let next: ViewerTab[];
      if (existing) {
        // A second citation into the open document (§V6 C3): the same passage is the same citation; a
        // different passage that happens to carry the same reply number gets the next number here, so
        // both stay visible and the stepper counts them.
        const incoming = opts.citation ?? null; // already placed above, against the same tab
        next = list.map((t) => (t.ref.key === ref.key ? { ...t, ref: { ...t.ref, ...ref }, lastViewedAt: now, page: opts.page ?? incoming?.page ?? t.page, citations: incoming && !t.citations.some((c) => c.k === incoming.k) ? [...t.citations, incoming] : t.citations, activeCitation: incoming?.k ?? t.activeCitation } : t));
      } else {
        const tab: ViewerTab = { ref, page: opts.page ?? opts.citation?.page ?? 1, zoom: "fit", rotation: 0, scrollTop: 0, lastViewedAt: now, citations: opts.citation ? [opts.citation] : [], activeCitation: opts.citation?.k ?? null, results: {} };
        next = [...list, tab];
        // Max 6: the seventh evicts the least recently viewed, with Undo (§V4.1).
        if (next.length > VIEWER.maxTabs) {
          const victim = [...next].filter((t) => t.ref.key !== ref.key).sort((a, b) => a.lastViewedAt - b.lastViewedAt)[0];
          next = next.filter((t) => t !== victim);
          showToast({ text: `Closed ${victim.ref.filename}`, undo: () => setTabs((l) => (l.some((t) => t.ref.key === victim.ref.key) ? l : [...l, { ...victim, lastViewedAt: Date.now() }])) });
        }
      }
      return next;
    });
    setActiveKey(ref.key);
    if (opts.citation) setPending({ key: ref.key, citation: opts.citation, at: Date.now() });
    setOpen(true);
  }, [open, showToast, tabs]);

  const close = useCallback(() => {
    setOpen(false); setPending(null);
    const el = openerRef.current; openerRef.current = null;
    window.setTimeout(() => { if (el && document.contains(el)) el.focus(); else document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus(); }, 0);
  }, []);

  const closeTab = useCallback((key: string) => {
    setTabs((list) => {
      const next = list.filter((t) => t.ref.key !== key);
      if (next.length === 0) { setOpen(false); setActiveKey(null); return next; }
      setActiveKey((cur) => (cur === key ? [...next].sort((a, b) => b.lastViewedAt - a.lastViewedAt)[0].ref.key : cur));
      return next;
    });
  }, []);

  const activate = useCallback((key: string) => { setActiveKey(key); setTabs((list) => list.map((t) => (t.ref.key === key ? { ...t, lastViewedAt: Date.now() } : t))); }, []);
  const patchTab = useCallback<ViewerApi["patchTab"]>((key, patch) => setTabs((list) => list.map((t) => (t.ref.key === key ? { ...t, ...patch } : t))), []);
  const setResult = useCallback<ViewerApi["setResult"]>((key, r) => setTabs((list) => list.map((t) => (t.ref.key === key ? { ...t, results: { ...t.results, [r.k]: r } } : t))), []);
  const addCitation = useCallback<ViewerApi["addCitation"]>((key, c) => setTabs((list) => list.map((t) => { if (t.ref.key !== key) return t; const placed = placeCitation(t.citations, c); return t.citations.some((x) => x.k === placed.k) ? t : { ...t, citations: [...t.citations, placed] }; })), []);
  const nextTab = useCallback((dir: 1 | -1) => { setTabs((list) => { if (!list.length) return list; const i = Math.max(0, list.findIndex((t) => t.ref.key === activeKey)); const n = list[(i + dir + list.length) % list.length]; setActiveKey(n.ref.key); return list; }); }, [activeKey]);

  const active = useMemo(() => tabs.find((t) => t.ref.key === activeKey) ?? null, [tabs, activeKey]);
  const api = useMemo<ViewerApi>(() => ({
    open, tabs, active, from, panelClosed, setPanelClosed, toast, conversationId, setConversationId, setFrom: (label) => setFrom(label), openDocument, close, closeTab, activate, patchTab, setResult, addCitation, nextTab,
    dismissToast: () => setToast(null), pending, consumePending: () => setPending(null),
  }), [open, tabs, active, from, panelClosed, toast, conversationId, setConversationId, openDocument, close, closeTab, activate, patchTab, setResult, addCitation, nextTab, pending]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useViewer(): ViewerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useViewer outside ViewerProvider");
  return v;
}
/** Safe variant for components that may render outside the shell (returns null). */
export function useViewerOptional(): ViewerApi | null { return useContext(Ctx); }

/** Resolve a document by source + id through the agent, so every entry point shares one metadata shape. */
/** ICAO and kind from an AIP file path the portal serves: /files/aip/ead-pdf/EVRA.pdf → AD 2 EVRA; /api/aip/gen/pdf?icao=EVRA or aip/gen-pdf/EV-GEN-1.2.pdf → GEN. */
export function aipLocator(documentPath: string): { kind: "aip" | "gen"; icao: string } | null {
  const p = String(documentPath);
  const q = /[?&]icao=([A-Za-z0-9]{4})/.exec(p);
  if (/gen/i.test(p) && q) return { kind: "gen", icao: q[1].toUpperCase() };
  const m = /\/([A-Za-z0-9]{4})\.pdf(?:$|\?)/.exec(p);
  if (m && !/GEN/i.test(p)) return { kind: "aip", icao: m[1].toUpperCase() };
  if (q) return { kind: "aip", icao: q[1].toUpperCase() };
  return null;
}

export async function fetchDocRef(source: "knowledge" | "generated" | "attachment" | "aip" | "gen", id: string): Promise<DocRef | null> {
  const base = process.env.NEXT_PUBLIC_AGENT_BASE_URL || "/agent";
  try {
    const r = await fetch(`${base}/api/documents/${source}/${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" });
    const b = await r.json().catch(() => null);
    if (!r.ok || !b?.ok) return null;
    return b.document as DocRef;
  } catch { return null; }
}

/** An AIP document served by the portal's own file path (§V3 E1, get_aip_document). */
export function aipDocRef(documentPath: string, title?: string | null, meta?: { cached?: boolean; source?: string | null }): DocRef {
  const clean = documentPath.split("?")[0];
  const filename = decodeURIComponent(clean.split("/").pop() || "document.pdf");
  return {
    key: `aip:${clean}`, source: "aip", id: clean, filename, title: title ?? null, mime: filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : null, bytes: null,
    url: `${clean}?inline=1`, downloadUrl: clean, sourceUrl: clean.replace(/^\/files\//, "/aip/") ?? null,
    tier: "internal", sourceName: meta?.source ? `AIP Portal · ${meta.source.toUpperCase()}` : "AIP Portal", fetchedAt: null, revision: { label: "revision unknown", state: "unknown", words: "revision unknown", reason: "not yet resolved" }, approval: null,
  };
}
