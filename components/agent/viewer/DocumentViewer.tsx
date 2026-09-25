"use client";

// The document viewer (spec addendum §V2–§V11). Layout O1: it covers the
// console page between the sidebar and the agent panel; the page stays
// mounted underneath, the sidebar is untouched, the panel does not move. One
// component serves the side panel, the full-page chat and the Knowledge base.
// The ink frame (#17181c) never appears here — tier is shown in words (§V7).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgentStyles from "../ui/AgentStyles";
import { C, SHADOW, TIER, VIEWER, mono } from "../ui/tokens";
import { Button, Icon, IconButton, Keycap, RingMark, dateLong, hmZ, kb } from "../ui/primitives";
import { useKeybinds } from "../ui/keybinds";
import { useViewer } from "./ViewerContext";
import { PdfView, ZOOMS, type PdfHandle, type PdfStatus } from "./PdfView";
import { DocxView, IMAGE_ZOOMS, ImageView, StateCard, TableView, TextView, docTileLook, useStableCallback } from "./OtherViews";
import { reportCheck } from "./locate";
import { VIEWABLE, fileKindOf, typeLabel, type Citation, type CitationResult, type DocRef } from "./types";
import { AGENT_BASE } from "../types";

type Search = { open: boolean; query: string; count: number; current: number; pages: number[] };

function useReducedMotion() { const [r, setR] = useState(false); useEffect(() => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); setR(m.matches); const on = () => setR(m.matches); m.addEventListener("change", on); return () => m.removeEventListener("change", on); }, []); return r; }

/** Measures the columns the viewer sits between: the sidebar and the panel (or its minimised tab). */
function useColumns(open: boolean) {
  const [cols, setCols] = useState({ left: 248, right: 0, width: 0, height: 0 });
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const side = document.querySelector<HTMLElement>("[data-cw-sidebar]"); const left = side && getComputedStyle(side).display !== "none" ? side.offsetWidth : 0;
      const panel = document.querySelector<HTMLElement>("[data-cw-agent-panel]"); const tab = document.querySelector<HTMLElement>("[data-cw-agent-minimised]");
      const thread = document.querySelector<HTMLElement>("[data-cw-thread-column]");
      const right = panel ? panel.offsetWidth : thread ? thread.offsetWidth : tab ? 0 : 0;
      setCols({ left, right, width: window.innerWidth - left - right, height: window.innerHeight });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(document.body);
    window.addEventListener("resize", measure); const id = window.setInterval(measure, 500);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.clearInterval(id); };
  }, [open]);
  return cols;
}

export default function DocumentViewer({ onAskAbout }: { onAskAbout?: (ref: DocRef, page: number) => void }) {
  const v = useViewer();
  const kbd = useKeybinds();
  const reduced = useReducedMotion();
  const cols = useColumns(v.open);
  const tab = v.active;
  const kind = tab ? fileKindOf(tab.ref) : "pdf";
  const pdf = useRef<PdfHandle | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<PdfStatus>({ state: "loading", loaded: 0, total: null });
  const [effectiveZoom, setEffectiveZoom] = useState(100);
  const [thumbs, setThumbs] = useState<boolean | null>(null);
  const [search, setSearch] = useState<Search>({ open: false, query: "", count: 0, current: 0, pages: [] });
  const [pageField, setPageField] = useState("1");
  const [pageBad, setPageBad] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [closing, setClosing] = useState(false);
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [otherError, setOtherError] = useState<{ code: "fetch" | "permission" | "render" | "empty"; detail: string } | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const pageInput = useRef<HTMLInputElement | null>(null);
  const canvasHost = useRef<HTMLDivElement | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => { const on = () => setOffline(false), off = () => setOffline(true); setOffline(!navigator.onLine); window.addEventListener("online", on); window.addEventListener("offline", off); return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); }; }, []);

  const compact = cols.width > 0 && cols.width < 1000;
  const canvasWidth = Math.max(320, cols.width - (thumbs ?? cols.width >= 900 + VIEWER.thumbRail ? VIEWER.thumbRail : 0));
  const showThumbs = kind === "pdf" && (thumbs ?? cols.width >= 900 + VIEWER.thumbRail);
  const pages = tab?.ref.pages ?? (status.state === "ready" || status.state === "progressive" ? (status as { pages: number }).pages : 0);
  const busy = status.state === "loading" || status.state === "password" || status.state === "error" || otherError !== null;
  const scanned = status.state === "ready" && status.scanned;

  useEffect(() => { if (tab) setPageField(String(tab.page)); }, [tab?.page, tab?.ref.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reset per document during render (not in an effect): a child view may report "ready" from its own
  // effect before a parent effect would run, and the reset would then wipe it — the toolbar stayed inert after a tab switch.
  const [statusKey, setStatusKey] = useState(tab?.ref.key ?? null);
  if ((tab?.ref.key ?? null) !== statusKey) { setStatusKey(tab?.ref.key ?? null); setStatus({ state: "loading", loaded: 0, total: tab?.ref.bytes ?? null }); setOtherError(null); setSearch({ open: false, query: "", count: 0, current: 0, pages: [] }); setMeta({}); }

  // Citation requests (§V6): located once the document is ready; the result is stored on the tab and reported.
  const onCitationResult = useStableCallback((r: CitationResult) => {
    if (!tab) return;
    v.setResult(tab.ref.key, r);
    const c = tab.citations.find((x) => x.k === r.k);
    if (r.state === "not-found") void reportCheck({ kind: c?.verbatim ? "verbatim" : "citation", documentKey: tab.ref.key, filename: tab.ref.filename, page: c?.page ?? null, citation: r.k, span: c?.span ?? c?.verbatim?.text ?? null, found: false, conversationId: v.conversationId });
    if (r.state === "found" && c?.verbatim) void reportCheck({ kind: "verbatim", documentKey: tab.ref.key, filename: tab.ref.filename, page: r.page, citation: r.k, span: c.verbatim.text, found: true, conversationId: v.conversationId });
  });
  useEffect(() => {
    if (!v.pending || !tab || v.pending.key !== tab.ref.key) return;
    if (kind === "pdf" && status.state !== "ready" && status.state !== "progressive") return;
    const c = v.pending.citation; v.consumePending();
    if (kind === "pdf") void pdf.current?.locate(c);
    else if (kind !== "text") onCitationResult({ k: c.k, state: "no-span", page: c.page });
  }, [v.pending, tab, status.state, kind, v, onCitationResult]);

  // Page + zoom state lives on the tab (restored when switching back).
  const onPage = useStableCallback((n: number) => { if (tab && tab.page !== n) v.patchTab(tab.ref.key, { page: n }); });
  const onZoom = useStableCallback((z: number | "fit", effective: number) => { if (tab && tab.zoom !== z) v.patchTab(tab.ref.key, { zoom: z }); if (effective) setEffectiveZoom(effective); });
  const onRotation = useStableCallback((deg: number) => { if (tab) v.patchTab(tab.ref.key, { rotation: deg }); });
  const onStatus = useStableCallback((s: PdfStatus) => { setStatus(s); if ((s.state === "ready" || s.state === "progressive") && tab && tab.ref.pages !== s.pages) v.patchTab(tab.ref.key, {}); if (s.state === "ready" && tab) tab.ref.pages = s.pages; });
  const onSearchResult = useStableCallback((r: { count: number; current: number; pages: number[] }) => setSearch((s) => ({ ...s, ...r })));
  const onOtherError = useStableCallback((code: "fetch" | "permission" | "render" | "empty", detail: string) => setOtherError({ code, detail }));
  const onAnnounce = useStableCallback((t: string) => setAnnounce(t));

  const zoomStep = (dir: 1 | -1) => { const steps = kind === "image" ? IMAGE_ZOOMS : ZOOMS; const cur = tab?.zoom === "fit" || tab?.zoom == null ? effectiveZoom : tab.zoom; const i = steps.findIndex((z) => z >= cur); const next = dir > 0 ? steps[Math.min(steps.length - 1, (i === -1 ? steps.length - 1 : i) + (steps[i] === cur ? 1 : 0))] : steps[Math.max(0, (i === -1 ? steps.length : i) - 1)]; if (next && tab) v.patchTab(tab.ref.key, { zoom: next }); };
  const goPage = (n: number) => { if (!tab) return; const p = Math.min(Math.max(1, n), pages || 1); pdf.current?.goToPage(p); v.patchTab(tab.ref.key, { page: p }); };

  // Close (all tabs) with DV2.
  const close = useCallback(() => { if (reduced) { v.close(); return; } setClosing(true); window.setTimeout(() => { setClosing(false); v.close(); }, 160); }, [reduced, v]);

  // Keyboard register (§V11) — viewer scope.
  useEffect(() => {
    if (!v.open) return;
    // Viewer scope = focus inside the viewer, or nothing focused at all (a toast button that just went away, a click on the canvas gutter).
    const inViewer = () => { const a = document.activeElement; return (root.current?.contains(a) ?? false) || !a || a === document.body; };
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA";
      if (e.key === "F6") { e.preventDefault(); if (inViewer()) (document.querySelector<HTMLElement>('[data-cw-agent-panel] textarea, [data-cw-thread-column] textarea') ?? document.querySelector<HTMLElement>("[data-cw-agent-panel]"))?.focus(); else (canvasHost.current?.querySelector<HTMLElement>('[role="document"]'))?.focus(); return; }
      if (!inViewer()) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") { if (search.open) { e.preventDefault(); setSearch((s) => ({ ...s, open: false, query: "" })); pdf.current?.search(""); canvasHost.current?.querySelector<HTMLElement>('[role="document"]')?.focus(); return; } if (!typing) { e.preventDefault(); close(); } return; }
      if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); if (kind !== "unsupported" && !scanned) { setSearch((s) => ({ ...s, open: true })); setTimeout(() => searchInput.current?.focus(), 30); } return; }
      if (mod && e.key.toLowerCase() === "w") { e.preventDefault(); if (tab) v.closeTab(tab.ref.key); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (tab?.ref.downloadUrl) window.location.assign(tab.ref.downloadUrl); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomStep(1); return; }
      if (mod && e.key === "-") { e.preventDefault(); zoomStep(-1); return; }
      if (mod && e.key === "0") { e.preventDefault(); if (tab) v.patchTab(tab.ref.key, { zoom: "fit" }); return; }
      if (e.ctrlKey && e.key === "Tab") { e.preventDefault(); v.nextTab(e.shiftKey ? -1 : 1); return; }
      if (typing) return;
      if (e.key === "PageDown") { e.preventDefault(); goPage((tab?.page ?? 1) + 1); return; }
      if (e.key === "PageUp") { e.preventDefault(); goPage((tab?.page ?? 1) - 1); return; }
      if (e.key === "Home") { e.preventDefault(); goPage(1); return; }
      if (e.key === "End") { e.preventDefault(); goPage(pages); return; }
      if (e.key.toLowerCase() === "r" && !mod) { e.preventDefault(); if (kind === "pdf") pdf.current?.rotate(); return; }
      if (e.key.toLowerCase() === "t" && !mod) { e.preventDefault(); setThumbs((t) => !(t ?? showThumbs)); return; }
      if (e.key === "[" || e.key === "]") { e.preventDefault(); stepCitation(e.key === "]" ? 1 : -1); return; }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.open, search.open, tab, pages, kind, scanned, close, showThumbs]);

  const stepCitation = (dir: 1 | -1) => { if (!tab || !tab.citations.length) return; const ks = tab.citations.map((c) => c.k); const i = Math.max(0, ks.indexOf(tab.activeCitation ?? ks[0])); const k = ks[(i + dir + ks.length) % ks.length]; v.patchTab(tab.ref.key, { activeCitation: k }); pdf.current?.focusCitation(k); };

  // Focus on open: the canvas (a citation moves it to the passage once located).
  useEffect(() => { if (!v.open) return; const id = window.setTimeout(() => { if (!v.pending) canvasHost.current?.querySelector<HTMLElement>('[role="document"]')?.focus(); }, 250); return () => window.clearTimeout(id); }, [v.open, tab?.ref.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!v.open || !tab) return null;
  const ref = tab.ref;
  const tile = docTileLook(kind, ref);
  const activeResult = tab.activeCitation != null ? tab.results[tab.activeCitation] : null;
  const activeCitation = tab.activeCitation != null ? tab.citations.find((c) => c.k === tab.activeCitation) : null;
  const superseded = ref.revision?.superseded;
  const tierLook = ref.tier === "company" ? { fg: TIER.company.fg, icon: "book-open", name: "Company" } : ref.tier === "attachment" ? { fg: TIER.attachment.fg, icon: "paperclip", name: "Attachment" } : { fg: TIER.internal.fg, icon: "database", name: "Internal" };
  const loadedFraction = status.state === "progressive" || status.state === "loading" ? (status.total ? Math.min(1, status.loaded / status.total) : 0) : 1;
  const stepLabel = (id: string) => kbd.label(id as never);

  return (
    <div ref={root} className={closing ? "cw-viewer-out" : "cw-viewer-in"} role="region" aria-label={`Document viewer · ${ref.filename}`}
      style={{ position: "fixed", top: 0, bottom: 0, left: cols.left, width: Math.max(320, cols.width), zIndex: 30, background: C.surface, display: "flex", flexDirection: "column", fontFamily: "inherit", color: C.ink, borderRight: `1px solid ${C.border}` }}>
      <AgentStyles />
      <span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{announce}</span>

      {/* Tab strip (§V4.1) */}
      <div role="tablist" aria-label="Open documents" style={{ height: VIEWER.tabStrip, flex: "none", background: C.sidebar, borderBottom: `1px solid ${C.border}`, padding: "0 10px", display: "flex", alignItems: "flex-end", gap: 2, overflow: "hidden" }}>
        <button type="button" onClick={close} title="Back · Esc" style={{ fontFamily: "inherit", height: 22, alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px 0 4px", marginRight: 6, border: "none", borderRight: `1px solid ${C.border}`, background: "transparent", fontSize: 12.5, fontWeight: 600, color: C.muted, cursor: "pointer" }}>
          <Icon name="arrow-left" size={14} color={C.muted} />{v.from ?? "Back"}
        </button>
        {v.tabs.map((t) => { const k = fileKindOf(t.ref); const on = t.ref.key === ref.key; return (
          <div key={t.ref.key} role="tab" aria-selected={on} tabIndex={0} onClick={() => v.activate(t.ref.key)} onKeyDown={(e) => { if (e.key === "Enter") v.activate(t.ref.key); }} className={on ? "cw-tab cw-tab-on" : "cw-tab"}
            style={{ height: 34, borderRadius: "9px 9px 0 0", padding: "0 8px 0 12px", display: "inline-flex", alignItems: "center", gap: 8, maxWidth: 260, minWidth: 0, flex: "0 1 auto", cursor: "pointer", background: on ? C.surface : "transparent", border: on ? `1px solid ${C.border}` : "1px solid transparent", borderBottom: "none", marginBottom: on ? -1 : 0 }}>
            <Icon name={k === "image" ? "image" : k === "table" ? "table-2" : k === "text" ? "file-code" : k === "unsupported" ? "file-question" : "file-text"} size={13} color={on ? C.body : C.faint} />
            <span style={{ ...mono({ fontSize: 12, fontWeight: on ? 600 : 500 }), color: on ? C.ink : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.ref.filename}</span>
            <button type="button" aria-label={`Close ${t.ref.filename}`} onClick={(e) => { e.stopPropagation(); v.closeTab(t.ref.key); }} className="ag-hover" style={{ width: 18, height: 18, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}><Icon name="x" size={11} color={C.faint} /></button>
          </div>); })}
      </div>

      {/* Header (§V4.2) */}
      <div style={{ flex: "none", padding: "12px 18px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 34, height: 42, borderRadius: 5, background: tile.bg, border: `1px solid ${tile.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8.5, fontWeight: 800, color: tile.fg, flex: "none" }}>{tile.label}</span>
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ ...mono({ fontSize: 14.5, fontWeight: 600 }), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ref.filename}</span>
            {ref.revision && <span style={{ ...mono({ fontSize: 11.5, fontWeight: 600 }), color: superseded ? C.warn : C.body, background: superseded ? C.warnTint : C.hover, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>{ref.revision.label}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted, flexWrap: "wrap" }}>
            <span>{typeLabel(kind, ref)}{scanned ? " · scanned" : ""}{ref.bytes != null ? ` · ${kb(ref.bytes)}` : ""}{pages ? ` · ${pages} page${pages === 1 ? "" : "s"}` : meta.dims ? ` · ${meta.dims}` : meta.rows ? ` · ${meta.rows}` : ""}</span>
            <span aria-hidden style={{ width: 3, height: 3, borderRadius: "50%", background: C.disabledFill }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name={tierLook.icon} size={12} color={tierLook.fg} /><span style={{ fontWeight: 700, color: tierLook.fg }}>{tierLook.name}</span><span>· {ref.sourceName}</span></span>
            {ref.fetchedAt && <><span aria-hidden style={{ width: 3, height: 3, borderRadius: "50%", background: C.disabledFill }} /><span style={mono({ fontSize: 11.5 })}>{ref.source === "knowledge" ? "uploaded" : "fetched"} {dateLong(ref.fetchedAt)} {hmZ(ref.fetchedAt)}</span></>}
            {ref.approval?.status === "authoritative" && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: C.companyDeep, background: C.violetTint2, border: `1px solid ${C.violetBorder}`, borderRadius: 999, padding: "2px 9px 2px 7px" }}><Icon name="badge-check" size={12} color={C.companyDeep} />Authoritative{ref.approval.by ? ` · approved by ${ref.approval.by}` : ""}{ref.approval.at ? ` ${dateLong(ref.approval.at)}` : ""}</span>}
            {ref.approval?.status === "reference" && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: C.body, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 999, padding: "2px 9px 2px 7px" }}><Icon name="book-open" size={12} color={C.body} />Reference · cited, not quotable</span>}
            {ref.approval?.status === "awaiting" && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: C.warn, background: C.warnTint, border: `1px solid ${C.warnBorder}`, borderRadius: 999, padding: "2px 9px 2px 7px" }}><Icon name="clock" size={12} color={C.warn} />Awaiting approval · not quotable</span>}
          </div>
        </div>
        {v.panelClosed && onAskAbout && <button type="button" onClick={() => { v.setPanelClosed(false); onAskAbout(ref, tab.page); }} className="ag-hover ag-focus ag-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 11px", borderRadius: 8, border: `1px solid ${C.borderControl}`, background: C.surface, color: C.ink, cursor: "pointer" }}><RingMark size={14} color={C.primaryHover} dot={5} />{compact ? "Ask" : "Ask about this document"}<Keycap>{stepLabel("open")}</Keycap></button>}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <HeaderAction icon="paperclip" label="Attach to reply" compact={compact} title="Attach to your next message" disabled={busy} onClick={() => window.dispatchEvent(new CustomEvent("cw-agent-attach-open-doc", { detail: { ref, page: tab.page } }))} />
          <HeaderAction icon="mail" label="Email" compact={compact} title="Send by email · asks first" disabled={busy || offline} onClick={() => window.dispatchEvent(new CustomEvent("cw-agent-email-doc", { detail: { ref } }))} />
          {ref.downloadUrl && <a href={offline ? undefined : ref.downloadUrl} download style={{ textDecoration: "none", pointerEvents: offline ? "none" : undefined }}><HeaderAction icon="download" label="Download" compact={compact} title={`Download · ${stepLabel("open").replace(/J$/, "S")}`} disabled={offline} /></a>}
          {ref.sourceUrl && <a href={offline ? undefined : ref.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", pointerEvents: offline ? "none" : undefined }}><HeaderAction icon="external-link" label="Open source" compact={compact} title={ref.source === "aip" ? "Open in AIP Portal" : "Open in Knowledge base"} disabled={offline} /></a>}
          <span style={{ width: 1, height: 24, background: C.border, margin: "0 4px" }} />
          <IconButton icon="x" title="Close · Esc" size={34} iconSize={17} color={C.body} onClick={close} />
        </div>
      </div>

      {/* Awaiting-approval strip (§V7) */}
      {ref.approval?.status === "awaiting" && (
        <div style={{ flex: "none", background: C.warnWash, borderBottom: `1px solid ${C.warnBorder}`, padding: "9px 16px", fontSize: 12.5, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ flex: 1 }}>Uploaded by {ref.approval.uploadedBy ?? "—"}{ref.approval.at ? ` ${dateLong(ref.approval.at)}` : ""}. Not approved — the agent won&apos;t quote or rely on this document until an approver approves it.</span>
          {ref.canApprove && <a href="/agent/knowledge" style={{ textDecoration: "none" }}><Button variant="secondary" size="xs">Review in Knowledge base</Button></a>}
        </div>
      )}

      {/* Toolbar (§V4.3) */}
      <div style={{ height: VIEWER.toolbar, flex: "none", padding: "0 14px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", gap: 6, opacity: busy ? 0.4 : 1, pointerEvents: busy ? "none" : undefined }} aria-hidden={busy}>
        {kind === "pdf" && <ToolButton icon="panel-left" title="Thumbnails · T" on={showThumbs} onClick={() => setThumbs(!showThumbs)} />}
        {(kind === "pdf" || kind === "docx") && (<>
          <span style={{ width: 1, height: 22, background: C.border, margin: "0 4px" }} />
          <ToolButton icon="chevron-up" title="Previous page · PgUp" disabled={tab.page <= 1} onClick={() => goPage(tab.page - 1)} />
          <input ref={pageInput} value={pageField} onChange={(e) => setPageField(e.target.value.replace(/[^0-9]/g, ""))} onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => { if (e.key === "Enter") { const n = Number(pageField); if (n >= 1 && n <= pages) goPage(n); else { setPageBad(true); setTimeout(() => { setPageBad(false); setPageField(String(tab.page)); }, 1000); } } }} aria-label="Page" style={{ ...mono({ fontSize: 13, fontWeight: 600 }), width: 44, height: 30, border: `1px solid ${pageBad ? C.dangerBadge : C.borderControl}`, borderRadius: 7, textAlign: "center", fontFamily: undefined, outline: "none", color: C.ink, background: C.surface }} />
          <span style={{ ...mono({ fontSize: 13 }), color: C.muted }}>/ {pages || "…"}</span>
          <ToolButton icon="chevron-down" title="Next page · PgDn" disabled={tab.page >= pages} onClick={() => goPage(tab.page + 1)} />
        </>)}
        {(kind === "pdf" || kind === "image" || kind === "docx") && (<>
          <span style={{ width: 1, height: 22, background: C.border, margin: "0 4px" }} />
          <ToolButton icon="minus" title="Zoom out · ⌘−" disabled={(tab.zoom === "fit" ? effectiveZoom : tab.zoom) <= (kind === "image" ? IMAGE_ZOOMS[0] : ZOOMS[0])} onClick={() => zoomStep(-1)} />
          <span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), width: 52, textAlign: "center" }}>{tab.zoom === "fit" ? effectiveZoom : tab.zoom}%</span>
          <ToolButton icon="plus" title="Zoom in · ⌘+" disabled={(tab.zoom === "fit" ? effectiveZoom : tab.zoom) >= (kind === "image" ? 400 : 200)} onClick={() => zoomStep(1)} />
          <button type="button" onClick={() => v.patchTab(ref.key, { zoom: "fit" })} title={kind === "image" ? "Fit · ⌘0" : "Fit width · ⌘0"} className="ag-hover ag-focus" style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 9px", borderRadius: 8, border: "none", background: tab.zoom === "fit" ? C.primaryTint : "transparent", color: tab.zoom === "fit" ? C.primaryHover : C.body, cursor: "pointer" }}><Icon name="move-horizontal" size={14} color={tab.zoom === "fit" ? C.primaryHover : C.body} />{kind === "image" ? "Fit" : "Fit width"}</button>
        </>)}
        {kind === "pdf" && <ToolButton icon="rotate-cw" title="Rotate · R" onClick={() => pdf.current?.rotate()} rotate={tab.rotation} />}
        {tab.citations.length > 0 && (<>
          <span style={{ width: 1, height: 22, background: C.border, margin: "0 4px" }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.primaryTint, border: `1px solid ${C.primaryLine}`, borderRadius: 8, padding: "3px 4px 3px 10px", fontSize: 12.5, fontWeight: 600, color: C.primaryHover }}>
            Citation {Math.max(1, tab.citations.findIndex((c) => c.k === tab.activeCitation) + 1)} of {tab.citations.length}
            <button type="button" aria-label="Previous citation · [" onClick={() => stepCitation(-1)} className="ag-hover" style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="chevron-left" size={14} color={C.primaryHover} /></button>
            <button type="button" aria-label="Next citation · ]" onClick={() => stepCitation(1)} className="ag-hover" style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="chevron-right" size={14} color={C.primaryHover} /></button>
          </span>
        </>)}
        <span style={{ flex: 1 }} />
        {kind !== "unsupported" && <button type="button" disabled={scanned} title={scanned ? "No text layer — search unavailable" : "Search · ⌘F"} onClick={() => { setSearch((s) => ({ ...s, open: !s.open })); setTimeout(() => searchInput.current?.focus(), 30); }} className="ag-hover ag-focus" style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 9px", borderRadius: 8, border: "none", background: search.open ? C.primaryTint : "transparent", color: search.open ? C.primaryHover : C.body, cursor: scanned ? "not-allowed" : "pointer", opacity: scanned ? 0.4 : 1 }}><Icon name="search" size={14} color={search.open ? C.primaryHover : C.body} />Search<span style={{ ...mono({ fontSize: 11 }), opacity: 0.7 }}>⌘F</span></button>}
      </div>

      {/* Search row (§V4.4) */}
      {search.open && (
        <div className="cw-search-row" style={{ height: VIEWER.searchRow, flex: "none", background: C.page, borderBottom: `1px solid ${C.divider}`, padding: "0 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 420, flex: 1, height: 34, background: C.surface, border: `1px solid ${C.primary}`, boxShadow: SHADOW.focus, borderRadius: 9, padding: "0 10px" }}>
            <Icon name="search" size={14} color={C.faint} />
            <input ref={searchInput} value={search.query} onChange={(e) => { const q = e.target.value; setSearch((s) => ({ ...s, query: q })); window.clearTimeout((searchInput.current as unknown as { t?: number })?.t); (searchInput.current as unknown as { t?: number }).t = window.setTimeout(() => pdf.current?.search(q), 200); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pdf.current?.nextMatch(e.shiftKey ? -1 : 1); } }} placeholder="Search in the document" aria-label="Search in the document" style={{ flex: 1, border: "none", outline: "none", fontFamily: "inherit", fontSize: 13.5, background: "transparent" }} />
            <span style={{ ...mono({ fontSize: 12 }), color: search.query && search.count === 0 ? C.danger : C.muted, whiteSpace: "nowrap" }}>{search.query ? (search.count ? `${search.current} of ${search.count}` : "No matches") : ""}</span>
          </label>
          <ToolButton icon="chevron-up" title="Previous match · ⇧⏎" bordered onClick={() => pdf.current?.nextMatch(-1)} disabled={!search.count} />
          <ToolButton icon="chevron-down" title="Next match · ⏎" bordered onClick={() => pdf.current?.nextMatch(1)} disabled={!search.count} />
          {search.pages.length > 0 && <span style={{ fontSize: 12, color: C.muted }}>{search.pages.length > 8 ? `Matches on ${search.pages.length} pages` : <>Matches on pages <span style={mono({ fontSize: 12 })}>{search.pages.join(", ")}</span></>}</span>}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="xs" keycap="Esc" onClick={() => { setSearch((s) => ({ ...s, open: false, query: "" })); pdf.current?.search(""); }}>Close</Button>
        </div>
      )}

      {/* Banners (§V4.5): failed citation → superseded → offline → scanned / rendered preview */}
      {activeResult?.state === "not-found" && activeCitation && (
        <Banner icon="search-x" fg={C.danger} bg={C.dangerTint} border={C.dangerBorder} lead={activeCitation.verbatim ? "Text differs from the quoted clause." : `Couldn't find cited passage ${activeCitation.k} in this file.`}
          text={activeCitation.verbatim ? `The approved clause quoted in the reply was not found word for word in ${ref.filename}${activeCitation.page ? ` (cited p. ${activeCitation.page})` : ""}. The stored text and the file have diverged — logged as a data error.` : `The agent cited${activeCitation.page ? ` p. ${activeCitation.page}` : " this document"} for “${(activeCitation.span ?? "").slice(0, 160)}${(activeCitation.span ?? "").length > 160 ? "…" : ""}”, but no matching text is on that page or anywhere else in the document. Treat the claim as unverified.`}
          action={!scanned ? { label: "Search the document", onClick: () => { const q = (activeCitation.span ?? activeCitation.verbatim?.text ?? "").split(/\s+/).slice(0, 4).join(" "); setSearch((s) => ({ ...s, open: true, query: q })); pdf.current?.search(q); setTimeout(() => searchInput.current?.focus(), 30); } } : undefined} />
      )}
      {activeResult?.state === "found" && activeCitation?.verbatim && <div style={{ flex: "none", padding: "6px 16px", borderBottom: `1px solid ${C.divider}`, display: "flex" }}><span style={{ fontSize: 10.5, fontWeight: 600, color: C.companyDeep, background: C.violetTint2, border: `1px solid ${C.violetBorder}`, borderRadius: 5, padding: "2px 7px" }}>Quoted verbatim in the reply · text matches</span></div>}
      {activeResult?.state === "no-span" && activeCitation && <Banner icon="info" fg={C.body} bg={C.sidebar} border={C.border} lead="No passage to locate." text={`The agent cited ${ref.filename}${activeCitation.page ? ` at p. ${activeCitation.page}` : ""} as a whole; it did not return the exact words it relied on, so nothing is highlighted. Read the page yourself.`} />}
      {superseded && ref.revision && <Banner icon="history" fg={C.warn} bg={C.warnTint} border={C.warnBorder} lead="Superseded." text={`This is ${ref.revision.label}.`} action={ref.revision.currentHref ? { label: "Open current", href: ref.revision.currentHref } : undefined} />}
      {offline && <Banner icon="wifi-off" fg={C.body} bg={C.sidebar} border={C.border} lead="You're offline." text="Showing the copy saved on this PC. Search works; Download, Email and Open source need a connection." />}
      {scanned && <Banner icon="scan-text" fg={C.body} bg={C.sidebar} border={C.border} lead="Scanned document — no text layer." text="Search and citation highlights aren't available, and the agent can only read what it extracted when the file was indexed." />}
      {kind === "docx" && !otherError && <Banner icon="info" fg={C.body} bg={C.sidebar} border={C.border} lead="Rendered preview." text="Layout may differ from Word. Download for the original file." action={ref.downloadUrl ? { label: "Download original", href: ref.downloadUrl } : undefined} />}
      {status.state === "progressive" && (
        <div style={{ flex: "none", padding: "8px 16px 10px", borderBottom: `1px solid ${C.divider}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}><span className="cw-skel" style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary }} /><span style={{ flex: 1 }}>Loading page {status.page} of {status.pages || "…"}{status.total ? ` · ${(status.loaded / 1048576).toFixed(1)} of ${(status.total / 1048576).toFixed(1)} MB` : ""} · you can read and search the pages already loaded</span></div>
          <div style={{ height: 3, background: C.border, borderRadius: 2, marginTop: 6, overflow: "hidden" }}><div style={{ width: `${Math.round(loadedFraction * 100)}%`, height: "100%", background: C.primary, transition: "width 200ms linear" }} /></div>
        </div>
      )}

      {/* Body */}
      <div ref={canvasHost} style={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
        {status.state === "error" && status.code === "toolarge" && <StateCard icon="file-warning" tone="amber" kind="TOO LARGE" title={`This file is ${status.detail}`} body="The viewer opens files up to 100 MB. The AIP Portal pages large documents from the server, so open it there, or download it." note="The agent can still answer questions about it from the indexed text." actions={[...(ref.sourceUrl ? [{ label: "Open in AIP Portal", href: ref.sourceUrl, external: true, primary: true }] : []), ...(ref.downloadUrl ? [{ label: "Download", href: ref.downloadUrl }] : [])]} />}
        {(status.state === "error" && status.code === "empty") || otherError?.code === "empty" ? <StateCard icon="file" tone="neutral" kind="EMPTY" title="This file is empty" body={`${ref.filename} is 0 bytes. There's nothing to show or ask about.`} actions={[{ label: "Remove from thread", primary: true, onClick: () => v.closeTab(ref.key) }]} /> : null}
        {(status.state === "error" && status.code === "permission") || otherError?.code === "permission" ? <StateCard icon="lock" tone="red" kind="PERMISSION DENIED" title="You don't have access to this document" body={`${ref.filename} is restricted. The agent may have quoted from it because approved clauses are shared; the full document isn't. Ask an admin.`} diag={`read → ${otherError?.detail ?? status.state === "error" ? (status as { detail: string }).detail : ""}`} actions={[{ label: "Request access", primary: true, href: `mailto:?subject=${encodeURIComponent(`Access request: ${ref.filename}`)}` }, { label: "Copy request", onClick: () => { void navigator.clipboard?.writeText(`Please grant me access to ${ref.filename} (${ref.key}).`); } }]} /> : null}
        {(status.state === "error" && status.code === "fetch") || otherError?.code === "fetch" ? <StateCard icon="cloud-off" tone="amber" kind="FETCH FAILED" title={`Couldn't fetch ${ref.filename}`} body="The source didn't answer. Check the connection or try again." diag={`fetch → ${otherError?.detail ?? (status.state === "error" ? status.detail : "")} · ${hmZ(new Date().toISOString())}`} actions={[{ label: "Retry", primary: true, onClick: () => { setOtherError(null); pdf.current?.retry(); } }, ...(ref.downloadUrl ? [{ label: "Download", href: ref.downloadUrl }] : [])]} /> : null}
        {(status.state === "error" && status.code === "render") || otherError?.code === "render" ? <StateCard icon="file-x" tone="red" kind="RENDER FAILED" title={`Couldn't display this ${typeLabel(kind, ref)}`} body="The file downloaded, but it couldn't be drawn. The file may be damaged. The agent's answer was based on the indexed text, not this copy." diag={otherError?.detail ?? (status.state === "error" ? status.detail : "")} actions={[{ label: "Retry", primary: true, onClick: () => { setOtherError(null); pdf.current?.retry(); } }, ...(ref.downloadUrl ? [{ label: "Download", href: ref.downloadUrl }] : []), ...(ref.sourceUrl && ref.source === "aip" ? [{ label: "Open in AIP Portal", href: ref.sourceUrl, external: true }] : [])]} /> : null}
        {status.state === "password" && kind === "pdf" && (
          <StateCard icon="lock" tone="neutral" kind="PROTECTED" title="This PDF is password-protected" body="Enter the password to open it here." note="The password is used once to open the file on this PC and isn't stored. The agent can't read protected files.">
            <form onSubmit={(e) => { e.preventDefault(); pdf.current?.submitPassword(password); setPassword(""); }} style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" autoFocus style={{ height: 38, border: `1px solid ${status.wrong ? C.dangerBadge : C.primary}`, boxShadow: SHADOW.focus, borderRadius: 9, padding: "0 12px", fontFamily: "inherit", fontSize: 14, outline: "none" }} />
              {status.wrong && <span style={{ fontSize: 12, color: C.danger }}>Wrong password</span>}
              <div><Button variant="primary" size="sm" type="submit">Open</Button></div>
            </form>
          </StateCard>
        )}
        {kind === "unsupported" && !otherError && <StateCard icon="file-question" tone="neutral" kind="NO PREVIEW" title={`Can't preview .${ref.filename.split(".").pop()} files`} body={`${ref.filename}${ref.bytes != null ? `, ${kb(ref.bytes)}` : ""}, from ${ref.sourceName}. The agent can read its name and metadata, not its contents.`} note={`Viewable types: ${VIEWABLE}.`} actions={[...(ref.downloadUrl ? [{ label: "Download", href: ref.downloadUrl, primary: true }] : []), ...(ref.sourceUrl ? [{ label: ref.source === "aip" ? "Open in AIP Portal" : "Open source", href: ref.sourceUrl, external: true }] : []), { label: "Email", onClick: () => window.dispatchEvent(new CustomEvent("cw-agent-email-doc", { detail: { ref } })) }]} />}
        {kind === "pdf" && !(status.state === "error") && ref.url && (
          <PdfView hidden={status.state === "password"} ref={pdf} url={ref.url} bytes={ref.bytes} targetPage={tab.page} zoom={tab.zoom} rotation={tab.rotation} canvasWidth={canvasWidth} thumbnails={showThumbs} citations={tab.citations} activeCitation={tab.activeCitation} onStatus={onStatus} onPage={onPage} onZoom={onZoom} onRotation={onRotation} onSearch={onSearchResult} onCitationResult={onCitationResult} onAnnounce={onAnnounce} reducedMotion={reduced} />
        )}
        {kind === "image" && !otherError && ref.url && <ImageView url={ref.url} zoom={tab.zoom} onZoom={onZoom} onMeta={(m) => { setMeta({ dims: `${m.w} × ${m.h}` }); setStatus({ state: "ready", pages: 0, scanned: false }); }} onError={onOtherError} canvasWidth={cols.width} canvasHeight={cols.height - 200} />}
        {kind === "table" && !otherError && <TableView url={ref.url} table={ref.table} query={search.query} onMeta={(m) => { setMeta({ rows: `${m.rows} rows · ${m.cols} columns${m.sheets > 1 ? ` · ${m.sheets} sheets` : ""}` }); setStatus({ state: "ready", pages: 0, scanned: false }); }} onError={onOtherError} onSearch={onSearchResult} />}
        {kind === "text" && !otherError && ref.url && <TextView url={ref.url} query={search.query} citedSpan={activeCitation?.span ?? activeCitation?.verbatim?.text ?? null} onMeta={(m) => { setMeta({ rows: `${m.lines} lines` }); setStatus({ state: "ready", pages: 0, scanned: false }); }} onError={onOtherError} onSearch={onSearchResult} onCitationResult={(found) => { if (activeCitation) onCitationResult({ k: activeCitation.k, state: found ? "found" : "not-found", page: null }); }} />}
        {kind === "docx" && !otherError && ref.url && <DocxView url={ref.url} query={search.query} onMeta={() => setStatus({ state: "ready", pages: 0, scanned: false })} onError={onOtherError} onSearch={onSearchResult} canvasWidth={cols.width} />}
        {kind === "pdf" && status.state === "loading" && (
          <div aria-hidden style={{ position: "absolute", inset: 0, background: C.viewerCanvas, display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 28px", pointerEvents: "none" }}>
            <div style={{ width: Math.min(canvasWidth - 56, VIEWER.pageMax), height: 520, background: C.surface, boxShadow: "0 1px 3px rgba(16,18,22,.12)", padding: "56px 48px", display: "flex", flexDirection: "column", gap: 12 }}>{[92, 88, 95, 70, 90, 86, 94, 60, 80].map((w, i) => <span key={i} className="cw-skel" style={{ height: 10, borderRadius: 3, background: C.hover, width: `${w}%` }} />)}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 12 }}>Opening {ref.filename}{ref.bytes != null ? ` · ${kb(ref.bytes)}` : ""}</div>
          </div>
        )}
      </div>

      {v.toast && (
        <div role="status" style={{ position: "absolute", left: "50%", bottom: 22, transform: "translateX(-50%)", background: C.ink, color: C.surface, fontSize: 13, borderRadius: 10, padding: "9px 12px", boxShadow: SHADOW.menu, display: "flex", alignItems: "center", gap: 12, zIndex: 5 }}>
          {v.toast.text}{v.toast.undo && <button type="button" onClick={() => { v.toast?.undo?.(); v.dismissToast(); root.current?.querySelector<HTMLElement>('[role="document"]')?.focus(); }} style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: C.surface, background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}>Undo</button>}
        </div>
      )}
    </div>
  );
}

function ToolButton({ icon, title, on, disabled, onClick, bordered, rotate }: { icon: string; title: string; on?: boolean; disabled?: boolean; onClick?: () => void; bordered?: boolean; rotate?: number }) {
  return (
    <button type="button" title={title} aria-label={title.split(" · ")[0]} aria-pressed={on} disabled={disabled} onClick={onClick} className="ag-hover ag-focus ag-icon-button"
      style={{ width: 32, height: 32, borderRadius: 8, border: bordered ? `1px solid ${C.borderControl}` : "none", background: on ? C.primaryTint : C.surface, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.35 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, transform: rotate ? `rotate(${rotate}deg)` : undefined, transition: "transform 200ms" }}>
      <Icon name={icon} size={16} color={on ? C.primaryHover : C.body} />
    </button>
  );
}
// Below 1000 px of viewer width the actions drop their labels (NOT IN DESIGN — spec default) so the header stays one row at 1280 with the panel open.
function HeaderAction({ icon, label, title, disabled, onClick, compact }: { icon: string; label: string; title: string; disabled?: boolean; onClick?: () => void; compact?: boolean }) {
  return <button type="button" title={title} aria-label={label} disabled={disabled} onClick={onClick} className="ag-hover ag-focus ag-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: compact ? "7px 8px" : "7px 11px", borderRadius: 8, border: `1px solid ${C.borderControl}`, background: C.surface, color: C.ink, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}><Icon name={icon} size={14} color={C.body} />{compact ? null : label}</button>;
}
function Banner({ icon, fg, bg, border, lead, text, action }: { icon: string; fg: string; bg: string; border: string; lead: string; text: string; action?: { label: string; onClick?: () => void; href?: string } }) {
  return (
    <div role={fg === C.danger ? "alert" : "status"} style={{ flex: "none", padding: "10px 16px", background: bg, borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 10 }}>
      <Icon name={icon} size={16} color={fg} />
      <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: C.body }}><strong style={{ color: fg }}>{lead}</strong> {text}</span>
      {action && (action.href ? <a href={action.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><Button variant="secondary" size="xs">{action.label}</Button></a> : <Button variant="secondary" size="xs" onClick={action.onClick}>{action.label}</Button>)}
    </div>
  );
}

/** Where the viewer would send the Attach/Email actions: listened to by the hosts. */
export const VIEWER_EVENTS = { attach: "cw-agent-attach-open-doc", email: "cw-agent-email-doc" } as const;
export { AGENT_BASE };
