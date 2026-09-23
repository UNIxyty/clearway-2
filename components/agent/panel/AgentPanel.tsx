"use client";

// The Ops Agent side panel.
//
// The design's own decisions, implemented rather than approximated:
//  · 420px default, drag the left edge 360–600, remembered per user.
//  · The page COMPRESSES when the content area keeps >= 900px; otherwise the
//    panel overlays with a shadow and no scrim, so the page stays usable. At
//    1280 it always overlays.
//  · ⌘J opens and closes from anywhere; Esc closes. The thread stays.
//  · The sidebar never auto-collapses — the user chose its state.
//  · The context chip updates as the user navigates UNTIL they send; after that
//    the thread keeps its context and a "Now on…" chip offers the switch.
//
// History is server-side (agent_conversations / agent_messages), so the same
// thread survives a reload and follows the user into the full page.

import { useCallback, useEffect, useRef, useState } from "react";
import { C, FONT, PANEL, iconStyle } from "./tokens";
import { AgentsReading, Sources, ToolActivityRow, ToolFailureNote, VerbatimFrame } from "./Blocks";
import Markdown from "./Markdown";
import Composer from "./Composer";
import type { AgentContext, AgentMessage, ConversationSummary, SourceRef, ToolActivity, VerbatimRecord } from "./types";

const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_BASE_URL || "/agent";

export function useAgentPanel() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export default function AgentPanel({
  open, onClose, context, fullPage = false, initialConversationId = null,
}: {
  open: boolean;
  onClose: () => void;
  context: AgentContext | null;
  fullPage?: boolean;
  /** Carried from the panel by ?c=<id> so "expand" continues the same thread. */
  initialConversationId?: string | null;
}) {
  const [width, setWidth] = useState<number>(PANEL.defaultWidth);
  const [overlay, setOverlay] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // The context is frozen once a question has been sent, per the design.
  const [pinnedContext, setPinnedContext] = useState<AgentContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const activeContext = pinnedContext ?? context;
  const contextMoved = Boolean(pinnedContext && context && context.label !== pinnedContext.label);

  // Remembered per user, as the design says.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(PANEL.storageKey));
      if (saved >= PANEL.minWidth && saved <= PANEL.maxWidth) setWidth(saved);
    } catch { /* private mode */ }
  }, []);

  // Compress vs overlay, recomputed on resize.
  useEffect(() => {
    const decide = () => {
      const vw = window.innerWidth;
      setOverlay(vw <= PANEL.alwaysOverlayBelow || vw - width < PANEL.minContentWidth);
    };
    decide();
    window.addEventListener("resize", decide);
    return () => window.removeEventListener("resize", decide);
  }, [width]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !streaming) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, streaming]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, activity]);

  // Drag the left edge.
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const next = Math.min(PANEL.maxWidth, Math.max(PANEL.minWidth, dragRef.current.startWidth + (dragRef.current.startX - e.clientX)));
      setWidth(next);
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try { localStorage.setItem(PANEL.storageKey, String(width)); } catch { /* private mode */ }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [width]);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`${AGENT_BASE}/api/conversations`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setConversations(body?.conversations ?? []);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    const res = await fetch(`${AGENT_BASE}/api/conversations/${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!body?.ok) return;
    setConversationId(id);
    setMessages(body.messages ?? []);
    setPinnedContext(body.conversation?.context ?? null);
    setShowHistory(false);
  }, []);

  // "Expand to full page" carries the conversation rather than restarting it.
  useEffect(() => {
    if (initialConversationId) void openConversation(initialConversationId);
  }, [initialConversationId, openConversation]);

  function newThread() {
    setConversationId(null);
    setMessages([]);
    setPinnedContext(null);
    setError(null);
  }

  async function send(text: string) {
    setError(null);
    if (offline) return; // queued state is shown; nothing that changes data is queued
    const pinned = pinnedContext ?? context;
    setPinnedContext(pinned);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: text }, { id: "streaming", role: "assistant", content: "", streaming: true }]);
    setStreaming(true);
    setActivity(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";
    const tools: ToolActivity[] = [];
    let sources: SourceRef[] = [];
    let verbatim: VerbatimRecord[] = [];

    try {
      const response = await fetch(`${AGENT_BASE}/api/chat`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ message: text, conversationId, context: pinned }),
      });
      if (!response.ok || !response.body) {
        const b = await response.json().catch(() => null);
        throw new Error(b?.message || `The assistant is unavailable (HTTP ${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (!event || !data) continue;
          const payload = JSON.parse(data);
          if (event === "start") {
            setConversationId(payload.conversationId);
          } else if (event === "delta") {
            answer += payload.text;
            setActivity(null);
            setMessages((m) => replaceStreaming(m, { content: answer }));
          } else if (event === "tool") {
            tools.push({ name: payload.name, ok: payload.ok, error: payload.error ?? null });
            setActivity(payload.name);
            setMessages((m) => replaceStreaming(m, { toolActivity: [...tools] }));
          } else if (event === "done") {
            sources = payload.sources ?? [];
            verbatim = payload.verbatim ?? [];
          } else if (event === "error") {
            throw new Error(payload.message || payload.error);
          }
        }
      }

      setMessages((m) => replaceStreaming(m, {
        id: `msg-${Date.now()}`,
        content: answer,
        sources,
        toolActivity: tools,
        blocks: verbatim.length ? { verbatim } : null,
        streaming: false,
      }));
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      if (!aborted) setError(e instanceof Error ? e.message : String(e));
      setMessages((m) => replaceStreaming(m, { content: answer, toolActivity: tools, streaming: false }));
    } finally {
      setStreaming(false);
      setActivity(null);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  if (!open) return null;

  const body = (
    <>
      {/* Header */}
      <div style={{ height: PANEL.headerHeight, flex: "none", display: "flex", alignItems: "center", gap: 6, padding: "0 10px 0 16px", borderBottom: `1px solid ${C.borderInner}` }}>
        <span style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${C.ink}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.ink }} />
        </span>
        <span style={{ fontSize: 14.5, fontWeight: 700, flex: 1, marginLeft: 4 }}>Ops Agent</span>
        <HeaderButton icon="history" title="History" onClick={() => { setShowHistory((v) => !v); if (!conversations) void loadHistory(); }} />
        <HeaderButton icon="square-pen" title="New thread" onClick={newThread} />
        {!fullPage && (
          <HeaderButton
            icon="maximize-2"
            title="Open full page · ⌘⇧J"
            onClick={() => { window.location.href = conversationId ? `/agent?c=${encodeURIComponent(conversationId)}` : "/agent"; }}
          />
        )}
        {!fullPage && <HeaderButton icon="x" title="Close · Esc" onClick={onClose} />}
      </div>

      {/* Thread */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {showHistory ? (
          <History conversations={conversations} onOpen={openConversation} />
        ) : (
          <>
            {activeContext && (
              <ContextChip context={activeContext} onClear={() => setPinnedContext(null)} />
            )}
            {contextMoved && context && (
              <button
                onClick={() => setPinnedContext(context)}
                style={{ alignSelf: "flex-start", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.muted, background: C.surface, border: `1px dashed ${C.borderInput}`, borderRadius: 999, padding: "4px 11px", cursor: "pointer" }}
              >
                Now on {context.label} — switch?
              </button>
            )}

            {messages.length === 0 && <EmptyState context={activeContext} onAsk={send} />}

            {messages.map((m, i) => (
              <MessageView key={m.id ?? i} message={m} />
            ))}

            {streaming && activity && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.ink }}>
                <span style={{ ...iconStyle("loader-circle", 12, C.blue), animation: "cwpulse 1.1s ease-in-out infinite" }} />
                <span style={{ fontFamily: FONT.mono }}>{activity}</span>
                <span>…</span>
              </div>
            )}

            {offline && <OfflineNote />}
            {error && !offline && <ErrorNote message={error} onRetry={() => setError(null)} />}
            <div ref={endRef} />
          </>
        )}
      </div>

      <Composer agentBase={AGENT_BASE} context={activeContext} streaming={streaming} disabled={offline} onSend={send} onStop={stop} />
    </>
  );

  if (fullPage) {
    return <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: FONT.sans, color: C.ink, background: "#fff" }}>{body}</div>;
  }

  return (
    <div
      className="cw-fade"
      style={{
        width, flex: "none", background: "#fff",
        borderLeft: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column",
        position: overlay ? "fixed" : "relative",
        ...(overlay ? { top: 0, right: 0, bottom: 0, zIndex: 60, boxShadow: C.shadowOverlay } : {}),
        fontFamily: FONT.sans, color: C.ink,
      }}
    >
      {/* Drag handle on the left edge */}
      <div
        onMouseDown={(e) => { dragRef.current = { startX: e.clientX, startWidth: width }; e.preventDefault(); }}
        title="Drag to resize"
        style={{ position: "absolute", left: -3, top: "50%", width: 6, height: 44, marginTop: -22, borderRadius: 3, background: C.borderInput, cursor: "ew-resize", zIndex: 2 }}
      />
      {body}
    </div>
  );
}

function replaceStreaming(list: AgentMessage[], patch: Partial<AgentMessage>): AgentMessage[] {
  const next = [...list];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].role === "assistant") { next[i] = { ...next[i], ...patch }; break; }
  }
  return next;
}

function HeaderButton({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="cw-hover-surface"
      style={{ width: 30, height: 30, border: "none", background: "transparent", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
    >
      <span style={iconStyle(icon, 16, C.muted)} />
    </button>
  );
}

function ContextChip({ context, onClear }: { context: AgentContext; onClear: () => void }) {
  return (
    <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: C.blueDeep, background: C.blueTint, border: `1px solid ${C.blueBorder}`, borderRadius: 999, padding: "5px 6px 5px 11px" }}>
      <span style={iconStyle(context.icon ?? (context.kind === "flight" ? "plane" : context.kind === "airport" ? "map-pin" : "file-text"), 12, C.blueDeep)} />
      {context.kind === "flight" ? "Asking about flight " : "Asking about "}
      <span style={{ fontFamily: FONT.mono }}>{context.icao ?? context.label}</span>
      <button onClick={onClear} title="Clear context" style={{ width: 18, height: 18, borderRadius: "50%", background: C.blueBorder, border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
        <span style={iconStyle("x", 9, C.blueDeep)} />
      </button>
    </span>
  );
}

function MessageView({ message }: { message: AgentMessage }) {
  if (message.role === "user") {
    return (
      <div style={{ alignSelf: "flex-end", background: C.userBubble, borderRadius: "14px 14px 4px 14px", padding: "9px 13px", fontSize: 14, maxWidth: "88%", whiteSpace: "pre-wrap" }}>
        {message.content}
      </div>
    );
  }
  const verbatim = message.blocks?.verbatim ?? [];
  const failed = (message.toolActivity ?? []).filter((a) => !a.ok);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ToolActivityRow activity={message.toolActivity ?? []} />
      {failed.length > 0 && <ToolFailureNote activity={message.toolActivity ?? []} />}

      {/* Quoted operational text FIRST and framed, then the agent's own words
          under their own label — the boundary is structural, not a caption. */}
      {verbatim.map((record) => <VerbatimFrame key={`${record.tool}-${record.id}`} record={record} />)}

      {message.content && (
        verbatim.length > 0
          ? <AgentsReading>{message.content}</AgentsReading>
          : <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              <Markdown text={message.content} />
              {message.streaming && <span style={{ display: "inline-block", width: 7, height: 15, background: C.blue, marginLeft: 2, verticalAlign: -3, animation: "cwcaret 1s steps(1) infinite" }} />}
            </div>
      )}

      {message.streaming && !message.content && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ height: 12, width: "80%", borderRadius: 4, background: C.wash }} />
          <div style={{ height: 12, width: "60%", borderRadius: 4, background: C.wash }} />
        </div>
      )}

      {message.error && (
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.amber }}>{message.error}</div>
      )}

      <Sources sources={message.sources ?? []} />
    </div>
  );
}

function EmptyState({ context, onAsk }: { context: AgentContext | null; onAsk: (q: string) => void }) {
  // Suggestions follow the context, as the design's B1/B2/B3 do.
  const suggestions = context?.icao
    ? [
        { k: "NOTAM", c: C.blueDeep, q: `Any NOTAMs I should know about at ${context.icao}?` },
        { k: "WEATHER", c: C.blueDeep, q: `What's the weather and TAF at ${context.icao}?` },
        { k: "DOCUMENTS", c: C.blueDeep, q: `Find the AD 2 document for ${context.icao}.` },
        { k: "LIMITATIONS", c: "#6d28d9", q: `What limitations apply at ${context.icao} today?` },
      ]
    : context?.flightId
    ? [
        { k: "NOW", c: C.amber, q: `Why is ${context.label} delayed?` },
        { k: "FLIGHT", c: C.blueDeep, q: `What applies to ${context.label}?` },
        { k: "NOTAM", c: C.red, q: `Any NOTAMs for this flight's airports?` },
      ]
    : [
        { k: "NOW", c: C.amber, q: "How does the wall look right now?" },
        { k: "NOTAM CHECK", c: C.red, q: "Is today's NOTAM check done?" },
        { k: "STATUS", c: C.blueDeep, q: "Is the platform healthy?" },
      ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
        {context?.label ? `What do you need to know about ${context.icao ?? context.label}?` : "What do you need?"}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.muted }}>
        {context?.label
          ? "I can see the page you have open, plus NOTAMs, weather, documents and the flights through it."
          : "Ask about a flight or airport, @ to name one, / for an action. I answer as you — I can only see what you can see."}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {suggestions.map((s) => (
          <button
            key={s.q}
            onClick={() => onAsk(s.q)}
            className="cw-hover-surface"
            style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start", textAlign: "left", border: `1px solid ${C.border}`, background: "#fff", borderRadius: 11, padding: "9px 11px", cursor: "pointer", fontFamily: "inherit" }}
          >
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", color: s.c }}>{s.k}</span>
            <span style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{s.q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function History({ conversations, onOpen }: { conversations: ConversationSummary[] | null; onOpen: (id: string) => void }) {
  if (conversations === null) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 44, borderRadius: 10, background: C.wash }} />)}</div>;
  }
  if (conversations.length === 0) {
    return <div style={{ fontSize: 13, color: C.muted, paddingTop: 8 }}>No earlier conversations.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginBottom: 4 }}>HISTORY</div>
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen(c.id)}
          className="cw-hover-surface"
          style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", textAlign: "left", border: "none", background: "transparent", borderRadius: 9, padding: "8px 9px", cursor: "pointer", fontFamily: "inherit" }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{c.title}</span>
          <span style={{ fontSize: 11.5, color: C.faint }}>{new Date(c.lastMessageAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
        </button>
      ))}
    </div>
  );
}

function OfflineNote() {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6, background: C.page }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: C.muted }}>
        <span style={iconStyle("wifi-off", 13, C.muted)} />
        Offline
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>
        You&apos;re offline. Earlier replies stay readable; new questions send when the connection returns. Nothing that changes data is queued.
      </div>
    </div>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ border: `1px solid ${C.amberBorder}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.amber }}>That didn&apos;t work</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: C.ink }}>{message}</div>
      <div>
        <button onClick={onRetry} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#fff", background: C.blue, border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
