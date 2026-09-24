"use client";

// The Ops Agent side panel (design spec §4.26, §6).
//
// 420 px default, drag the left edge 360–600, remembered per user. Push when
// the content keeps ≥ 900 px, overlay otherwise (always at 1280), no scrim.
// Header 60 with History · New thread · Open full page · Minimise · Close.
// Slides in over 200 ms, out over 160 ms (P1; instant under reduced motion).
// Focus goes to the composer on open and back to the opener on close. The
// thread survives close; expand carries it to /agent/t/{id}. The sidebar is
// never changed by the panel.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { C, PANEL, SHADOW, mono } from "../ui/tokens";
import { Button, Icon, IconButton, RingMark, hmZ, dayTimeZ } from "../ui/primitives";
import AgentStyles from "../ui/AgentStyles";
import Composer from "../thread/Composer";
import { ContextChip, NowOnChip, SuggestedQuestions, suggestionsFor, useLiveSuggestions } from "../thread/ContextChip";
import { AgentReply, UserBubble } from "../thread/Message";
import { OfflineCard } from "../thread/ErrorCard";
import { useThread } from "../useThread";
import type { AgentContext, ConversationSummary } from "../types";
import { matches as matchesBind, useKeybinds } from "../ui/keybinds";

export function useAgentPanel() {
  const [open, setOpen] = useState(false);
  const kb = useKeybinds();
  const openBind = kb.binds.open, os = kb.os;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (matchesBind(e, openBind, os)) { e.preventDefault(); setOpen((v) => !v); } };
    const onAsk = () => setOpen(true);
    window.addEventListener("keydown", onKey); window.addEventListener("cw-agent-open", onAsk);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("cw-agent-open", onAsk); };
  }, [openBind, os]);
  return { open, setOpen };
}

type Minimised = { state: "working"; step: number; of: number } | { state: "needs-you"; count: number } | { state: "done" } | null;

export default function AgentPanel({ open, onClose, context, initials = null, initialConversationId = null, onWidthChange, embedded = false }: { open: boolean; onClose: () => void; context: AgentContext | null; initials?: string | null; initialConversationId?: string | null; onWidthChange?: (px: number) => void; /** Hosted in another app's iframe (wall console): fills the frame, talks to the host by postMessage. */ embedded?: boolean }) {
  const router = useRouter();
  const [width, setWidth] = useState<number>(PANEL.width);
  const [overlay, setOverlay] = useState(false);
  const [view, setView] = useState<"thread" | "history">("thread");
  const [historyQuery, setHistoryQuery] = useState("");
  const [minimised, setMinimised] = useState<Minimised>(null);
  const [closing, setClosing] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const userScrolledUp = useRef(false);
  const doneTimer = useRef<number | null>(null);

  const t = useThread({ context, initialConversationId, initials });
  const kb = useKeybinds();
  const activeContext = t.pinnedContext ?? context;
  const contextMoved = Boolean(t.pinnedContext && context && context.label !== t.pinnedContext.label);
  const live = useLiveSuggestions(activeContext);
  const empty = useMemo(() => suggestionsFor(activeContext, live), [activeContext, live]);

  // Width, remembered per user (§4.26).
  useEffect(() => { try { const saved = Number(localStorage.getItem("cw-agent-panel-width")); if (saved >= PANEL.minWidth && saved <= PANEL.maxWidth) setWidth(saved); } catch { /* private mode */ } }, []);
  useEffect(() => { onWidthChange?.(open && !minimised ? width : 0); }, [width, open, minimised, onWidthChange]);
  // Push vs overlay (§6.2).
  useEffect(() => {
    if (embedded) { setOverlay(false); return; }
    const decide = () => { const vw = window.innerWidth; const sidebar = document.querySelector<HTMLElement>("[data-cw-sidebar]")?.offsetWidth ?? 248; setOverlay(vw <= PANEL.overlayBelow || vw - sidebar - width < PANEL.pushMinContent); };
    decide(); window.addEventListener("resize", decide); return () => window.removeEventListener("resize", decide);
  }, [width, embedded]);
  const tellHost = useCallback((msg: Record<string, unknown>) => { if (embedded && window.parent !== window) window.parent.postMessage(msg, window.location.origin); }, [embedded]);
  useEffect(() => { tellHost({ type: "cw-agent-minimised", on: Boolean(minimised) }); }, [minimised, tellHost]);
  useEffect(() => {
    const move = (e: MouseEvent) => { if (!dragRef.current) return; setWidth(Math.min(PANEL.maxWidth, Math.max(PANEL.minWidth, dragRef.current.startWidth + (dragRef.current.startX - e.clientX)))); };
    const up = () => { if (!dragRef.current) return; dragRef.current = null; try { localStorage.setItem("cw-agent-panel-width", String(width)); } catch { /* private mode */ } };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [width]);

  // Context attaches when ready (§4.21 loading): a chip that reads the page for < 300 ms.
  useEffect(() => { if (!open) return; setContextLoading(true); const id = setTimeout(() => setContextLoading(false), 250); return () => clearTimeout(id); }, [open, context?.label]);

  // Focus: composer on open, opener on close (spec default).
  useEffect(() => {
    if (open) { openerRef.current = document.activeElement as HTMLElement; setClosing(false); setMinimised(null); }
  }, [open]);
  const close = useCallback(() => {
    if (t.streaming) return;
    setClosing(true);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => { setClosing(false); onClose(); openerRef.current?.focus?.(); }, reduced ? 0 : 160);
  }, [onClose, t.streaming]);

  // Esc precedence (§15): menu → voice → confirmation → streaming → panel. Menus/streaming/confirmation handle their own; this is the last step.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !t.streaming && !t.pendingConfirmation && view === "thread" && document.activeElement?.tagName !== "INPUT" && !(document.activeElement as HTMLTextAreaElement)?.value) close();
      if (e.key === "Escape" && view === "history") setView("thread");
      if (kb.matches(e, "expand")) { e.preventDefault(); expand(); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [open, t.streaming, t.pendingConfirmation, view, close, kb.binds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll while streaming unless the user scrolled up (spec default).
  useEffect(() => { const el = bodyRef.current; if (!el || userScrolledUp.current) return; el.scrollTop = el.scrollHeight; }, [t.messages, t.activity]);
  const onScroll = () => { const el = bodyRef.current; if (!el) return; userScrolledUp.current = el.scrollTop + el.clientHeight < el.scrollHeight - 40; };

  // Minimised tab states (§6.13): working (step count), needs you (amber), done (30 s).
  useEffect(() => {
    if (!minimised) return;
    if (t.pendingConfirmation) setMinimised({ state: "needs-you", count: 1 });
    else if (t.streaming) { const steps = t.messages[t.messages.length - 1]?.toolActivity ?? []; setMinimised({ state: "working", step: steps.length, of: Math.max(steps.length, 1) }); }
    else if (minimised.state === "working") { setMinimised({ state: "done" }); doneTimer.current = window.setTimeout(() => setMinimised(null), 30_000); }
  }, [t.streaming, t.pendingConfirmation, t.messages]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (doneTimer.current) window.clearTimeout(doneTimer.current); }, []);

  function expand() {
    const url = t.conversationId ? `/agent/t/${encodeURIComponent(t.conversationId)}?from=${encodeURIComponent(context?.label ?? "")}` : "/agent";
    if (embedded) { tellHost({ type: "cw-agent-expand", url }); return; }
    setExpanding(true);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => router.push(url), reduced ? 100 : 200);
  }

  if (!open) return null;

  if (minimised) {
    const amber = minimised.state === "needs-you";
    return (
      <button type="button" onClick={() => setMinimised(null)} title={`Reopen the agent · ${kb.label("open")}`} aria-label="Reopen the agent"
        style={{ position: "fixed", right: 0, top: embedded ? 12 : 34 + 60, width: 44, background: amber ? C.warnTint : C.surface, border: `1px solid ${amber ? C.warnBorder : C.borderControl}`, borderRight: "none", borderRadius: "12px 0 0 12px", boxShadow: SHADOW.panelMinimised, padding: "10px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", zIndex: 40, fontFamily: "inherit" }}>
        {minimised.state === "working" ? <span className="ag-spin" style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${C.primary}`, borderTopColor: "transparent" }} /> : <RingMark size={18} color={amber ? C.warn : C.ink} />}
        <span style={{ writingMode: "vertical-rl", fontSize: 11, fontWeight: 600, color: amber ? C.warn : minimised.state === "done" ? C.ink : C.primaryHover }}>
          {minimised.state === "working" ? `Working · ${minimised.step} of ${minimised.of}` : amber ? `Confirm ${minimised.count} change${minimised.count > 1 ? "s" : ""}` : "Reply ready"}
        </span>
        <span className={minimised.state === "working" ? "ag-pulse-1200" : undefined} style={{ width: 8, height: 8, borderRadius: "50%", background: amber ? C.warnDot : minimised.state === "done" ? C.ink : C.primary }} />
      </button>
    );
  }

  const composerLocked = t.pendingConfirmation ? (/^(send_email|email_document)$/.test(t.pendingConfirmation.toolName) ? "Confirm or cancel the email above to continue" : "Confirm or cancel the change above to continue") : null;

  return (
    <>
      <AgentStyles />
      <aside
        role="complementary" aria-label="Ops Agent"
        className={`${closing ? "ag-panel-out" : "ag-panel-in"} ${expanding ? "ag-expanding" : ""}`}
        style={{
          width: embedded ? "100%" : expanding ? "100vw" : width, flex: "none", background: C.surface, borderLeft: embedded ? "none" : `1px solid ${C.border}`, display: "flex", flexDirection: "column",
          position: overlay || expanding ? "fixed" : "relative", ...(overlay || expanding ? { top: 0, right: 0, bottom: 0, zIndex: 60, boxShadow: SHADOW.panelOverlay } : { height: "100vh", position: "sticky", top: 0, zIndex: 40 }),
          fontFamily: "inherit", color: C.ink,
        }}
      >
        {!embedded && <div onMouseDown={(e) => { dragRef.current = { startX: e.clientX, startWidth: width }; e.preventDefault(); }} title="Drag to resize" role="separator" aria-orientation="vertical"
          style={{ position: "absolute", left: -3, top: "50%", width: 6, height: 44, marginTop: -22, borderRadius: 3, background: C.borderControl, cursor: "ew-resize", zIndex: 2 }} />}

        {/* Header 60 */}
        <div style={{ height: PANEL.headerHeight, flex: "none", display: "flex", alignItems: "center", gap: 6, padding: "0 10px 0 16px", borderBottom: `1px solid ${C.divider}` }}>
          {view === "history" ? (
            <><IconButton icon="arrow-left" title="Back to thread" onClick={() => setView("thread")} /><span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>History</span></>
          ) : (
            <><RingMark size={18} /><span style={{ fontSize: 14.5, fontWeight: 700, flex: 1, marginLeft: 4 }}>Ops Agent</span></>
          )}
          <IconButton icon="history" title="History" onClick={() => { setView((v) => (v === "history" ? "thread" : "history")); if (!t.conversations) void t.loadHistory(); }} />
          <IconButton icon="square-pen" title="New thread" onClick={() => { t.newThread(); setView("thread"); }} />
          <IconButton icon="maximize-2" title={`Open full page · ${kb.label("expand")}`} onClick={expand} />
          <IconButton icon="minus" title="Minimise" onClick={() => setMinimised(t.pendingConfirmation ? { state: "needs-you", count: 1 } : t.streaming ? { state: "working", step: 0, of: 1 } : { state: "done" })} />
          <IconButton icon="x" title="Close · Esc" onClick={close} disabled={t.streaming} />
        </div>

        {view === "history" ? (
          <PanelHistory conversations={t.conversations} query={historyQuery} setQuery={setHistoryQuery} currentId={t.conversationId} context={activeContext} onOpen={(id) => { void t.openConversation(id); setView("thread"); }} />
        ) : (
          <div ref={bodyRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <ContextChip context={activeContext} loading={contextLoading && t.messages.length === 0} onClear={() => t.setPinnedContext(null)} />
            {contextMoved && context && <NowOnChip context={context} onSwitch={() => t.setPinnedContext(context)} />}

            {t.loadingThread && <div aria-busy style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[80, 60, 70].map((w, i) => <div key={i} style={{ height: 12, width: `${w}%`, borderRadius: 4, background: C.hover }} />)}</div>}

            {!t.loadingThread && t.messages.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
                <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{empty.headline}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.muted }}>{empty.sub}</div>
                <SuggestedQuestions items={empty.items} onAsk={(q) => void t.send(q, { command: q.startsWith("/") ? q.split(" ")[0] : null })} />
                {empty.recent && empty.recent.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: C.faint }}>PICK UP WHERE YOU LEFT OFF</span>
                    {empty.recent.map((r) => <button key={r.id} type="button" onClick={() => void t.openConversation(r.id)} className="ag-row-hover ag-focus" style={{ display: "flex", justifyContent: "space-between", gap: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: C.ink, background: "transparent", border: "none", borderRadius: 8, padding: "7px 8px", cursor: "pointer", textAlign: "left" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span><span style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>{hmZ(r.at)}</span></button>)}
                  </div>
                )}
              </div>
            )}

            {t.messages.map((m, i) => m.role === "user"
              ? <UserBubble key={m.id ?? i} message={m} panel />
              : <AgentReply key={m.id ?? i} message={m} panel onContinue={m.stopped ? t.continueReply : undefined} onConfirmationSettled={(c, o) => t.onConfirmationSettled(c, o.status, o.at, o.result)} onSendFile={(f) => void t.send(`Email the file ${f.filename} — ask me who to send it to.`)} onEmailDocument={(d) => void t.send(`Email me the document "${d.title}".`)} />)}

            {t.streaming && t.activity && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.ink }}><span className="ag-pulse-1000"><Icon name="loader-circle" size={12} color={C.primary} /></span><span style={mono()}>{t.activity}</span><span>…</span></div>
            )}
            {t.offline && <OfflineCard queued={t.queued} panel />}
            {t.error && !t.offline && <div role="alert" style={{ border: `1px solid ${C.warnBorder}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}><div style={{ fontSize: 12, fontWeight: 700, color: C.warn }}>That didn&apos;t work</div><div style={{ fontSize: 13, lineHeight: 1.5 }}>{t.error}</div><div><Button variant="primary" size="xs" onClick={() => t.setError(null)}>Dismiss</Button></div></div>}
          </div>
        )}

        {view === "thread" && <Composer panel context={activeContext} streaming={t.streaming} locked={composerLocked} offline={t.offline} onSend={(text, ids, meta) => void t.send(text, { attachmentIds: ids, command: meta.command })} onStop={t.stop} voiceEnabled={false} />}
      </aside>
    </>
  );
}

/** History in the panel (§6.10): ABOUT {record} → TODAY · ELSEWHERE → YESTERDAY → older. */
function PanelHistory({ conversations, query, setQuery, currentId, context, onOpen }: { conversations: ConversationSummary[] | null; query: string; setQuery: (q: string) => void; currentId: string | null; context: AgentContext | null; onOpen: (id: string) => void }) {
  const key = context?.kind === "flight" ? context.label : context?.icao ?? null;
  const filtered = (conversations ?? []).filter((c) => !query || `${c.title} ${c.snippet ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const groups: Array<[string, ConversationSummary[]]> = [];
  const about = key ? filtered.filter((c) => (c.entities ?? []).includes(key) || c.title.includes(key)) : [];
  if (about.length) groups.push([`ABOUT ${key}`, about]);
  const rest = filtered.filter((c) => !about.includes(c));
  const today = rest.filter((c) => new Date(c.lastMessageAt) >= startOfToday), yesterday = rest.filter((c) => { const d = new Date(c.lastMessageAt); return d < startOfToday && d >= startOfYesterday; }), older = rest.filter((c) => new Date(c.lastMessageAt) < startOfYesterday);
  if (today.length) groups.push([about.length ? "TODAY · ELSEWHERE" : "TODAY", today]); if (yesterday.length) groups.push(["YESTERDAY", yesterday]); if (older.length) groups.push(["OLDER", older]);
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, height: 38, border: `1px solid ${C.borderControl}`, borderRadius: 10, padding: "0 12px" }}><Icon name="search" size={14} color={C.faint} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search threads" aria-label="Search threads" style={{ flex: 1, border: "none", outline: "none", fontFamily: "inherit", fontSize: 13.5, background: "transparent" }} /></div>
      </div>
      {conversations === null && <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 8 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 44, borderRadius: 10, background: C.hover }} />)}</div>}
      {conversations !== null && filtered.length === 0 && <div style={{ padding: "8px 12px", fontSize: 13, color: C.muted }}>{query ? "No threads match." : "No earlier conversations."}</div>}
      {groups.map(([label, list]) => (
        <div key={label}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, padding: "8px 12px 4px" }}>{label}</div>
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="ag-row-hover ag-focus" style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 2, padding: "9px 12px", borderBottom: `1px solid ${C.dividerRow}`, border: "none", background: c.id === currentId ? C.rowExpanded : "transparent", cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span><span style={{ ...mono({ fontSize: 11 }), color: C.faint }} suppressHydrationWarning>{dayTimeZ(c.lastMessageAt)}</span></span>
              {c.snippet && <span style={{ fontSize: 12.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.snippet}</span>}
            </button>
          ))}
        </div>
      ))}
      <a href="/agent/history" style={{ marginTop: "auto", padding: "10px 12px", borderTop: `1px solid ${C.divider}`, fontSize: 12.5, fontWeight: 600, color: C.primaryHover, textDecoration: "none" }}>All history in full page →</a>
    </div>
  );
}
