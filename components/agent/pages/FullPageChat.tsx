"use client";

// Full-page chat (design spec §7): the deliberate session. Header 60 with the
// thread title, meta, the two policy pills, the side-panel button and New
// chat; the thread in an 800 px column; the composer pinned below. Opened
// from Ops Agent → Chat, History, or Expand from the panel (which carries the
// thread: same id, same scroll, same pending confirmation, same context).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PortalShell, { useIdentity } from "@/components/portal/Shell";
import { C, mono } from "../ui/tokens";
import { Button, HeaderPill, IconButton, Icon, dayTimeZ } from "../ui/primitives";
import Orb from "../ui/Orb";
import AgentStyles from "../ui/AgentStyles";
import Composer from "../thread/Composer";
import { ContextChip, SuggestedQuestions, suggestionsFor, useLiveSuggestions } from "../thread/ContextChip";
import { AgentReply, UserBubble } from "../thread/Message";
import { OfflineCard } from "../thread/ErrorCard";
import { useThread } from "../useThread";
import { AGENT_BASE, type AgentContext } from "../types";
import { useKeybinds } from "../ui/keybinds";
import { useViewerOptional } from "../viewer/ViewerContext";
import { PANEL, VIEWER } from "../ui/tokens";

function useAvailability() {
  const [state, setState] = useState<"checking" | "yes" | "no">("checking");
  const { initials } = useIdentity();
  useEffect(() => {
    fetch("/api/assistant/availability", { cache: "no-store" }).then((r) => r.json()).then((b) => setState(b?.available ? "yes" : "no")).catch(() => setState("no"));
  }, []);
  return { state, initials };
}

export default function FullPageChat({ conversationId = null }: { conversationId?: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from");
  const { state: availability, initials } = useAvailability();
  const [settings, setSettings] = useState<{ web: boolean } | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const context: AgentContext | null = useMemo(() => (from ? { kind: "page", label: from } : null), [from]);
  const t = useThread({ context, initialConversationId: conversationId, initials });
  const kb = useKeybinds();
  const viewer = useViewerOptional();
  useEffect(() => { viewer?.setConversationId(t.conversationId); }, [t.conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { viewer?.setFrom("Chat"); }, [viewer]);
  // §V10 B5: while a document is open the thread becomes a right-hand column (420; 360 below 1400 of content width).
  const docOpen = Boolean(viewer?.open);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const f = () => setNarrow(window.innerWidth - (document.querySelector<HTMLElement>("[data-cw-sidebar]")?.offsetWidth ?? 248) < VIEWER.panelNarrowBelow); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const docContext: AgentContext | null = viewer?.open && viewer.active ? { kind: "document", label: viewer.active.ref.filename, icon: "file-text", page: viewer.active.page, pages: viewer.active.ref.pages ?? null, document: { source: viewer.active.ref.source, id: viewer.active.ref.id, filename: viewer.active.ref.filename } } : null;
  useEffect(() => { if (docContext) t.setPinnedContext(docContext); }, [docContext?.label, docContext?.page]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = useLiveSuggestions(null);
  const empty = useMemo(() => suggestionsFor(null, live, true), [live]);

  useEffect(() => { fetch(`${AGENT_BASE}/api/settings`, { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).then((b) => { if (b?.ok) setSettings({ web: Boolean(b.capabilities?.find((c: { key: string; enabled: boolean }) => c.key === "web_search")?.enabled) }); }).catch(() => {}); }, []);
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [t.messages.length]);
  // Once the thread exists it owns a URL: /agent/t/{id}. Adopted in place (no
  // remount) so a reload or a shared link comes back to the same thread instead
  // of "New chat".
  useEffect(() => {
    if (!t.conversationId || conversationId === t.conversationId) return;
    const url = `/agent/t/${encodeURIComponent(t.conversationId)}${from ? `?from=${encodeURIComponent(from)}` : ""}`;
    if (window.location.pathname !== url.split("?")[0]) window.history.replaceState(window.history.state, "", url);
  }, [t.conversationId, conversationId, from]);
  // ⌘⇧J from the full page moves the thread into the panel over the last console page.
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (kb.matches(e, "expand")) { e.preventDefault(); toPanel(); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }); // eslint-disable-line react-hooks/exhaustive-deps
  const toPanel = () => {
    try { sessionStorage.setItem("cw-agent-open-with", t.conversationId ?? ""); } catch { /* private mode */ }
    const back = document.referrer && new URL(document.referrer).origin === location.origin && !/\/agent/.test(document.referrer) ? document.referrer : "/dashboard";
    // The wall console is a separate app: a full navigation, never a router push.
    if (/\/digital-wall\//.test(back)) window.location.assign(back); else router.push(back);
  };

  if (availability !== "yes") {
    return <PortalShell crumb="" title="Not found" subtitle=""><div style={{ padding: 32, fontSize: 14, color: C.muted }}>{availability === "checking" ? "" : "This page does not exist."}</div></PortalShell>;
  }

  const composerLocked = t.pendingConfirmation ? (/^(send_email|email_document)$/.test(t.pendingConfirmation.toolName) ? "Confirm or cancel the email above to continue" : "Confirm or cancel the change above to continue") : null;
  const msgCount = t.messages.length;
  const started = t.messages[0]?.createdAt ?? null;

  return (
    <PortalShell crumb="Ops Agent" footer={false} wide>
      <AgentStyles />
      <div data-cw-thread-column={docOpen ? "" : undefined} style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 0px)", minHeight: 0, ...(docOpen ? { position: "fixed", top: 0, right: 0, bottom: 0, width: narrow ? PANEL.minWidth : PANEL.width, zIndex: 31, background: C.surface, borderLeft: `1px solid ${C.border}` } : {}) }}>
        {/* Header 60 (§7.2) */}
        <div style={{ height: 60, flex: "none", display: "flex", alignItems: "center", gap: docOpen ? 8 : 14, padding: docOpen ? "0 16px" : "0 24px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title ?? (msgCount ? t.messages[0].content.slice(0, 60) : "New chat")}</span>
            {msgCount > 0 && <span style={{ ...mono({ fontSize: 12 }), color: C.faint }} suppressHydrationWarning>{started ? dayTimeZ(started, { alwaysDate: true }).replace(/ (\d{2}:\d{2}Z)$/, " · started $1") : ""} · {msgCount} message{msgCount === 1 ? "" : "s"}{from ? <> · from <span style={{ color: C.primaryHover }}>{from}</span></> : null}</span>}
          </div>
          {/* As a 420/360 column beside a document (§V10 B5) the pills go and New chat is icon-only — NOT IN DESIGN, spec default. */}
          {!docOpen && settings?.web && <HeaderPill icon="globe" iconColor={C.warn}>Web search on</HeaderPill>}
          {!docOpen && <HeaderPill icon="shield-check">Changes: ask first</HeaderPill>}
          {!docOpen && <span style={{ width: 1, height: 24, background: C.border }} />}
          <IconButton icon="panel-right" title={`Open as side panel · ${kb.label("expand")}`} size={36} bordered onClick={toPanel} />
          {docOpen ? <IconButton icon="plus" title="New chat" size={36} bordered onClick={() => { t.newThread(); router.push("/agent"); }} /> : <Button variant="primary" size="md" icon="plus" onClick={() => { t.newThread(); router.push("/agent"); }}>New chat</Button>}
        </div>

        {/* Thread */}
        <div ref={threadRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "32px 24px 8px" }}>
          <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 30 }}>
            {t.loadingThread && <div aria-busy style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 14, width: `${80 - i * 15}%`, borderRadius: 4, background: C.hover }} />)}</div>}
            {!t.loadingThread && msgCount === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, padding: "56px 48px 28px", textAlign: "center" }}>
                <Orb size={64} state="idle" title="Ops Agent" />
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{empty.headline}</div>
                <div style={{ fontSize: 15, lineHeight: 1.55, color: C.muted, maxWidth: 520 }}>{empty.sub}</div>
                <div style={{ width: "100%", textAlign: "left" }}><SuggestedQuestions items={empty.items} full onAsk={(q) => void t.send(q)} /></div>
              </div>
            )}
            {t.messages.map((m, i) => m.role === "user"
              ? <UserBubble key={m.id ?? i} message={m} />
              : <AgentReply key={m.id ?? i} message={m} onContinue={m.stopped ? t.continueReply : undefined} onConfirmationSettled={(c, o) => t.onConfirmationSettled(c, o.status, o.at, o.result)} onSendFile={(f) => void t.send(`Email the file ${f.filename} — ask me who to send it to.`)} onEmailDocument={(d) => void t.send(`Email me the document "${d.title}".`)} />)}
            {t.streaming && t.activity && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.ink, paddingLeft: 42 }}><span className="ag-pulse-1000"><Icon name="loader-circle" size={13} color={C.primary} /></span><span style={mono()}>{t.activity}</span><span>…</span></div>}
            {t.offline && <OfflineCard queued={t.queued} panel={false} />}
            {t.error && !t.offline && <div role="alert" style={{ border: `1px solid ${C.warnBorder}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6, background: C.surface }}><div style={{ fontSize: 12, fontWeight: 700, color: C.warn }}>That didn&apos;t work</div><div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{t.error}</div><div><Button variant="primary" size="sm" onClick={() => t.setError(null)}>Dismiss</Button></div></div>}
          </div>
        </div>

        {docContext && (
          <div style={{ width: "100%", maxWidth: docOpen ? "none" : 760, margin: "0 auto", padding: docOpen ? "0 16px 8px" : "0 0 8px", display: "flex" }}>
            <ContextChip context={docContext} onClear={() => { t.setPinnedContext(null); viewer?.close(); }} />
          </div>
        )}
        <Composer context={docContext} panel={docOpen} streaming={t.streaming} locked={composerLocked} offline={t.offline} onSend={(text, ids, meta) => void t.send(text, { attachmentIds: ids, command: meta.command, ...(meta.voice ? { voice: true, language: meta.voice.language } : {}) })} onStop={t.stop} />
      </div>
    </PortalShell>
  );
}
