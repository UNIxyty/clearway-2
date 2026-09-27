// The Clearway Ops Agent side panel (§E4). The conversation is the console's own components; around it:
// our header, the tab bar, the extension's states, drafts from the page, inserts, and settings.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgentStyles from "@/components/agent/ui/AgentStyles";
import { C, mono } from "@/components/agent/ui/tokens";
import { Button, Icon, IconButton, RingMark, dayTimeZ, hmZ } from "@/components/agent/ui/primitives";
import Composer from "@/components/agent/thread/Composer";
import { AgentReply, UserBubble } from "@/components/agent/thread/Message";
import { SuggestedQuestions, suggestionsFor, useLiveSuggestions } from "@/components/agent/thread/ContextChip";
import { useThread } from "@/components/agent/useThread";
import type { AgentMessage, ConversationSummary, PendingConfirmation as ThreadConfirmation } from "@/components/agent/types";
import { CONSOLE_ORIGIN, LIMITS, SHORTCUTS } from "~/shared/config";
import { apiJson, hmZ as hmZs } from "~/shared/api";
import type { PageContext, QuickAction, QuickActionRule, SiteRequest } from "~/shared/protocol";
import { approvedEntryFor, originPattern, pendingRequestFor } from "~/shared/sites";
import { setPageHost } from "./shim";
import { post, useExtension } from "./useExtension";
import { TabBar, type QuickRow } from "./TabBar";
import { PageContextCard } from "./PageContextCard";
import { ApprovedEnable, Banner, CaptureFailed, FirstRun, Loading, LongSelection, NotOnList, OfflineBanner, PageChanged, RecognisedCard, RequestDeclined, RequestSent, RequestSite, SignedOut } from "./StateCards";
import { InsertProposal, InsertRecord, InsertReview, splitInsert } from "./InsertCards";
import { SettingsView } from "./Settings";
import { extensionSystemLine } from "../background/voice";

const WALL_ROW: [string, string] = ["Wall", "Not from here. Show it on the wall from the console"];
const WALL_TOOLS = /^(create_limitation|update_limitation|create_important|create_report)$/;

export default function App() {
  const ext = useExtension();
  const { session, tab, settings } = ext;
  const initials = session.user?.initials ?? null;
  const t = useThread({ context: null, initialConversationId: null, initials });
  const [view, setView] = useState<"thread" | "history" | "settings">("thread");
  const [historyQuery, setHistoryQuery] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [enableDenied, setEnableDenied] = useState(false);
  const [mic, setMic] = useState<"pending" | "allowed" | "skipped" | "asking" | "denied">(settings.mic);
  const [micLevel, setMicLevel] = useState<number | null>(null);
  const [pageChanged, setPageChanged] = useState<{ title: string; at: string } | null>(null);
  const sentFrom = useRef<{ url: string; title: string; at: string; answerId: string | null } | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const voiceOn = useRef(false);
  const [resolved, setResolved] = useState<Record<string, { callsign: string; date: string; adep: string; ades: string } | null>>({});
  const [explainedHere, setExplainedHere] = useState<string | null>(null);
  const signedIn = session.status === "signed-in";
  useEffect(() => { setMic(settings.mic); }, [settings.mic]);
  useEffect(() => { setPageHost(tab?.host ?? null); }, [tab?.host]);

  // Thread continuity: the worker holds the current thread id; voice from a closed panel writes into it.
  useEffect(() => { post({ type: "panel.thread", conversationId: t.conversationId }); }, [t.conversationId]);
  useEffect(() => ext.subscribe((m) => {
    const type = String(m.type);
    if (type === "thread.changed") { const id = (m.conversationId as string | null) ?? null; if (id && id !== t.conversationId && !t.streaming) void t.openConversation(id); }
    else if (type === "voice.toggle") { voiceOn.current = !voiceOn.current; window.dispatchEvent(new CustomEvent("cw-agent-voice", { detail: { on: voiceOn.current } })); if (voiceOn.current) setTimeout(() => { voiceOn.current = false; }, 90_000); }
    else if (type === "view") setView(m.view === "settings" ? "settings" : "thread");
    else if (type === "focus") setTimeout(() => document.querySelector<HTMLElement>("[data-confirmations]")?.scrollIntoView({ block: "center" }), 300);
    else if (type === "mic.level") setMicLevel(Number(m.level));
  }), [ext.subscribe, t.conversationId, t.streaming]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (t.streaming) voiceOn.current = false; }, [t.streaming]);
  // S2: signed out → the panel checks every 10 s and connects on its own once the console is signed in.
  useEffect(() => { if (session.status !== "signed-out" && session.status !== "unreachable") return; const id = setInterval(() => post({ type: "session.refresh" }), 10_000); return () => clearInterval(id); }, [session.status]);

  // Confirmations the thread raises → the worker (badge, notification, expiry); settled → cleared.
  useEffect(() => {
    const pend = t.messages.flatMap((m) => m.blocks?.confirmations ?? []).filter((c) => !c.status || c.status === "pending");
    if (pend.length) post({ type: "panel.pending", confirmations: pend.map((c) => ({ token: c.token, what: c.what, expiresAt: c.expiresAt, conversationId: t.conversationId, toolName: c.toolName })) });
  }, [t.messages, t.conversationId]);
  const onSettled = useCallback((c: ThreadConfirmation, o: { status: string; at: string; result?: Record<string, unknown> | null }) => { t.onConfirmationSettled(c, o.status as never, o.at, o.result); post({ type: "panel.settled", token: c.token }); }, [t]);

  // Drafts from the page: text into the composer; page content as a card above it; voice when asked.
  useEffect(() => {
    const d = ext.draft; if (!d) return;
    if (d.text) window.dispatchEvent(new CustomEvent("cw-agent-compose", { detail: { text: d.text, send: false } }));
    if ((d as { voice?: boolean }).voice) { voiceOn.current = true; setTimeout(() => window.dispatchEvent(new CustomEvent("cw-agent-voice", { detail: { on: true } })), 300); }
    setTimeout(() => document.querySelector<HTMLTextAreaElement>("[data-cw-agent-panel] textarea")?.focus(), 50);
  }, [ext.draft?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const compose = (e: Event) => { const d = (e as CustomEvent<{ text: string; send: boolean }>).detail; if (!d?.text) return; if (d.send) void send(d.text, { command: null }); else { const ta = document.querySelector<HTMLTextAreaElement>("[data-cw-agent-panel] textarea"); if (ta) { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set; setter?.call(ta, d.text); ta.dispatchEvent(new Event("input", { bubbles: true })); ta.focus(); } } };
    const stop = () => t.stop();
    window.addEventListener("cw-agent-compose", compose); window.addEventListener("cw-agent-stop", stop);
    return () => { window.removeEventListener("cw-agent-compose", compose); window.removeEventListener("cw-agent-stop", stop); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // S9: the page changed while an answer streams — once per answer.
  useEffect(() => {
    if (!t.streaming || !sentFrom.current || !tab) { if (!t.streaming) setPageChanged(null); return; }
    if (tab.url !== sentFrom.current.url && !pageChanged) setPageChanged({ title: sentFrom.current.title, at: sentFrom.current.at });
  }, [tab?.url, t.streaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll while streaming.
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [t.messages.length, t.activity, ext.insert?.status]);

  const draftPc = ext.draft?.pageContext ?? null;
  const overLimit = draftPc?.kind === "selection" && (draftPc.chars ?? draftPc.text?.length ?? 0) > LIMITS.selectionChars;

  const send = useCallback(async (text: string, opts: { attachmentIds?: string[]; attachments?: never[]; command: string | null; tier?: string | null; voice?: boolean; language?: string | null }) => {
    if (overLimit) return;
    const pc = draftPc ? { ...draftPc } : null;
    if (pc) sentFrom.current = { url: pc.kind === "capture" ? tab?.url ?? "" : pc.url, title: pc.title || pc.host, at: pc.sentAt, answerId: null };
    else sentFrom.current = null;
    setPageChanged(null);
    await ext.clearDraft();
    await t.send(text, { ...opts, pageContext: pc as never, system: extensionSystemLine(tab?.host ?? null) });
  }, [draftPc, overLimit, ext, t, tab?.url, tab?.host]);

  // Quick actions (§E7): from the address only.
  const quick = useMemo(() => matchQuick(tab?.url ?? "", session.quickActions?.rules ?? []), [tab?.url, session.quickActions]);
  useEffect(() => {
    if (!quick || quick.entity.kind !== "leon-flight") return;
    const key = `leon:${quick.entity.id}`; if (key in resolved) return;
    setResolved((r) => ({ ...r, [key]: null }));
    void apiJson<{ ok: boolean; flight?: { callsign: string; date: string; adep: string; ades: string } }>("/extension/resolve", { method: "POST", body: JSON.stringify({ kind: "leon-flight", id: quick.entity.id }), pageHost: tab?.host }).then(({ body }) => { setResolved((r) => ({ ...r, [key]: body?.ok && body.flight ? body.flight : null })); });
  }, [quick?.entity.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const quickRow: QuickRow = useMemo(() => {
    if (!quick || !signedIn) return null;
    const f = resolved[`leon:${quick.entity.id}`];
    const vars: Record<string, string> = quick.entity.kind === "icao" ? { icao: quick.entity.id.toUpperCase() } : f ? { callsign: f.callsign, date: f.date, adep: f.adep, ades: f.ades } : {};
    if (quick.entity.kind === "leon-flight" && !vars.callsign) return null;
    const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    const tools = new Set(session.tools ?? []);
    const actions = quick.rule.actions.filter((a) => (a.requires ?? []).every((r) => tools.has(r))).map((a) => ({ ...a, label: fill(a.label), message: a.message ? fill(a.message) : undefined, compose: a.compose ? fill(a.compose) : undefined }));
    return { eyebrow: quick.entity.kind === "icao" ? "AIRPORT" : "LEON · FLIGHT", entity: quick.entity.kind === "icao" ? vars.icao : vars.callsign, actions, onAction: (a: QuickAction) => { if (a.kind === "write" && a.compose) window.dispatchEvent(new CustomEvent("cw-agent-compose", { detail: { text: a.compose, send: false } })); else void send(a.message ?? a.label, { command: null }); } };
  }, [quick, resolved, session.tools, signedIn, send]);
  const recognised = quick?.entity.kind === "leon-flight" && resolved[`leon:${quick.entity.id}`] ? resolved[`leon:${quick.entity.id}`]! : null;
  useEffect(() => { if (recognised && explainedHere !== quick!.entity.id) setExplainedHere(quick!.entity.id); }, [recognised]); // eslint-disable-line react-hooks/exhaustive-deps

  // Site status helpers.
  const approvedEntry = tab && session.sites ? approvedEntryFor(tab.host, session.sites.approved) : null;
  const myRequest: SiteRequest | null = tab && session.sites ? (pendingRequestFor(tab.host, session.sites.requests) ?? session.sites.requests.filter((r) => r.host === tab.host && r.status === "declined").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))[0] ?? null) : null;
  async function requestSite(reason: string, includeSubdomains: boolean) {
    if (!tab) return; setRequestBusy(true); setRequestError(null);
    const { status, body } = await apiJson<{ ok: boolean; message?: string }>("/extension/sites/request", { method: "POST", body: JSON.stringify({ host: tab.host.replace(/:\d+$/, ""), includeSubdomains, reason }), pageHost: tab.host });
    setRequestBusy(false);
    if (status === 200 && body?.ok) { setRequesting(false); post({ type: "session.refresh" }); post({ type: "panel.action", action: "tab" }); }
    else setRequestError(body?.message ?? `The request could not be sent (HTTP ${status}).`);
  }
  async function enableSite() {
    if (!tab) return; const pattern = originPattern(tab.url); if (!pattern) return;
    let ok = false; try { ok = await chrome.permissions.request({ origins: [pattern] }); } catch { ok = false; }
    setEnableDenied(!ok);
    if (ok) post({ type: "panel.action", action: "site-enabled", host: tab.host });
  }
  async function allowMic() {
    setMic("asking");
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((x) => x.stop()); setMic("allowed"); await ext.setSettings({ mic: "allowed" }); }
    catch { setMic("denied"); }
  }

  // Insert (§E9).
  const verbatimLabelFor = useCallback((text: string) => {
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const n = norm(text);
    for (const m of t.messages) for (const r of m.blocks?.verbatim ?? []) { if (r.text && n.includes(norm(r.text))) { const rev = (r.revision as { id?: string; label?: string } | null | undefined)?.id ?? (r.revision as { label?: string } | null | undefined)?.label; const clause = /§\s*([\d.]+)/.exec(r.heading ?? "")?.[1]; return `VERBATIM — ${r.id}${rev ? ` rev ${rev}` : ""}${clause ? ` §${clause}` : ""} (approved text, do not edit)`; } }
    return null;
  }, [t.messages]);
  const review = (text: string) => { const label = verbatimLabelFor(text); post({ type: "panel.insert", action: "review", text: label ? `${label}\n${text}` : text, verbatim: label, conversationId: t.conversationId }); };

  // ── Render ────────────────────────────────────────────────────────────────────────────────────────
  const composerLocked = t.pendingConfirmation ? "Confirm or cancel the change above" : null;
  const composerDisabled = !signedIn || !settings.firstRunDone;
  const requestedAt = myRequest?.status === "pending" ? myRequest.requestedAt : approvedEntry?.approvedAt ?? null;
  const live = useLiveSuggestions(null);
  const empty = useMemo(() => suggestionsFor(null, live), [live]);
  const messages = useMemo(() => t.messages.map((m) => (m.blocks?.confirmations?.length ? { ...m, blocks: { ...m.blocks, confirmations: m.blocks.confirmations.map((c) => (WALL_TOOLS.test(c.toolName) && !c.extraRows ? { ...c, extraRows: [WALL_ROW] } : c)) } } : m)), [t.messages]);

  if (view === "settings") return (
    <Shell>
      <SettingsView session={session} settings={settings} setSettings={(p) => void ext.setSettings(p)} onBack={() => setView("thread")} micLevel={micLevel} onDisconnect={() => { post({ type: "session.disconnect" }); t.newThread(); setView("thread"); }} />
    </Shell>
  );

  return (
    <Shell>
      <div style={{ height: 48, flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 14px", borderBottom: `1px solid ${C.divider}` }}>
        {view === "history" ? <><IconButton icon="arrow-left" title="Back to thread" onClick={() => setView("thread")} /><span style={{ fontSize: 14.5, fontWeight: 700, flex: 1 }}>History</span></> : <><RingMark size={18} /><span style={{ fontSize: 14.5, fontWeight: 700, flex: 1, marginLeft: 6 }}>Ops Agent</span></>}
        <IconButton icon="history" title="History" onClick={() => { setView((v) => (v === "history" ? "thread" : "history")); if (!t.conversations) void t.loadHistory(); }} />
        <IconButton icon="square-pen" title="New thread" onClick={() => { t.newThread(); void ext.clearDraft(); setView("thread"); }} />
        <IconButton icon="external-link" title="Open in console" onClick={() => chrome.tabs.create({ url: t.conversationId ? `${CONSOLE_ORIGIN}/agent/t/${encodeURIComponent(t.conversationId)}` : `${CONSOLE_ORIGIN}/agent` })} />
        <IconButton icon="settings-2" title="Settings" onClick={() => setView("settings")} />
      </div>

      {view === "history" ? (
        <History conversations={t.conversations} query={historyQuery} setQuery={setHistoryQuery} currentId={t.conversationId} onOpen={(id) => { void t.openConversation(id); setView("thread"); }} />
      ) : (
        <>
          {signedIn && settings.firstRunDone && tab && <TabBar tab={tab} selectionHas={ext.selectionHas} requestedAt={requestedAt} quick={quickRow} blockedNote={requesting || (tab.status === "not-on-list" && t.messages.length === 0) ? "Selections, the page and quick actions are off here." : tab.status === "approved-pending-enable" ? `Approved${approvedEntry?.approvedBy ? ` by ${approvedEntry.approvedBy}` : ""}. Allow it in Chrome to finish.` : null}
            onSend={(k) => { if (k === "region") post({ type: "panel.action", action: "region" }); else if (k === "page") post({ type: "panel.action", action: "page" }); else post({ type: "panel.action", action: "selection" }); }} />}

          <div ref={bodyRef} data-thread style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {session.status === "unknown" && <Loading />}
            {(session.status === "signed-out" || session.status === "disconnected" || session.status === "unreachable") && <SignedOut session={session} onOpenConsole={() => chrome.tabs.create({ url: `${CONSOLE_ORIGIN}/login` })} onConnect={() => post({ type: session.status === "disconnected" ? "session.reconnect" : "session.refresh" })} />}
            {signedIn && !settings.firstRunDone && <FirstRun session={session} mic={mic} onAllowMic={() => void allowMic().then(() => ext.setSettings({ firstRunDone: true }))} onSkipMic={() => void ext.setSettings({ mic: "skipped", firstRunDone: true })} />}

            {signedIn && settings.firstRunDone && tab && (
              <>
                {tab.status === "not-on-list" && !requesting && t.messages.length === 0 && (myRequest?.status === "declined" ? <RequestDeclined request={myRequest} /> : <NotOnList host={tab.host} onRequest={() => setRequesting(true)} onCapture={() => post({ type: "panel.action", action: "region" })} />)}
                {requesting && <RequestSite host={tab.host.replace(/:\d+$/, "")} title={tab.title} admins={session.admins ?? []} busy={requestBusy} error={requestError} onSend={(r, s) => void requestSite(r, s)} onCancel={() => setRequesting(false)} />}
                {tab.status === "requested" && myRequest && t.messages.length === 0 && <RequestSent request={myRequest} />}
                {tab.status === "approved-pending-enable" && <ApprovedEnable host={tab.host} approvedBy={approvedEntry?.approvedBy ?? null} approvedAt={approvedEntry?.approvedAt ?? null} onEnable={() => void enableSite()} denied={enableDenied} />}
                {recognised && explainedHere === quick?.entity.id && t.messages.length === 0 && <RecognisedCard body={`Flight ${quick!.entity.id} in Leon is ${recognised.callsign}, ${fmtDay(recognised.date)}, ${recognised.adep} → ${recognised.ades}. The page itself hasn't been read.`} />}
                {ext.captureFailed && <CaptureFailed reason={ext.captureFailed.reason} diagnostic={ext.captureFailed.diagnostic} onDismiss={() => ext.setCaptureFailed(null)} onRetry={() => { ext.setCaptureFailed(null); post({ type: "panel.action", action: "region" }); }} onPaste={() => { ext.setCaptureFailed(null); document.querySelector<HTMLTextAreaElement>("[data-cw-agent-panel] textarea")?.focus(); }} onAttach={() => { ext.setCaptureFailed(null); document.querySelector<HTMLInputElement>("[data-cw-agent-panel] input[type=file]")?.click(); }} />}
                {ext.notice && <Banner icon="info" title="" body={<>{ext.notice} <button type="button" onClick={() => ext.setNotice(null)} style={{ border: "none", background: "transparent", color: C.primaryHover, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, padding: 0 }}>Dismiss</button></>} />}

                {t.loadingThread && <div aria-busy style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[80, 60, 70].map((w, i) => <div key={i} style={{ height: 12, width: `${w}%`, borderRadius: 4, background: C.hover }} />)}</div>}
                {!t.loadingThread && t.messages.length === 0 && !requesting && tab.status !== "not-on-list" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 4 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{empty.headline}</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.muted }}>{tab.status === "approved" ? "Send a selection, a region or the page from the bar above, or just ask." : empty.sub}</div>
                    <SuggestedQuestions items={empty.items} onAsk={(q) => void send(q, { command: q.startsWith("/") ? q.split(" ")[0] : null })} />
                  </div>
                )}

                {messages.map((m, i) => m.role === "user" ? (
                  <div key={m.id ?? i} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    {m.blocks?.pageContext && <PageContextCard pc={m.blocks.pageContext as PageContext} />}
                    <UserBubble message={m} panel />
                  </div>
                ) : (
                  <AssistantMessage key={m.id ?? i} m={m} last={i === messages.length - 1} pageChanged={i === messages.length - 1 ? pageChanged : null} host={tab.host} onSettled={onSettled} onContinue={m.stopped ? t.continueReply : undefined} onSend={(text) => void send(text, { command: null })} onReview={review} verbatimLabelFor={verbatimLabelFor} />
                ))}

                {ext.insert && (ext.insert.status === "review" || ext.insert.status === "picking") && <InsertReview insert={ext.insert} onInsert={() => post({ type: "panel.insert", action: "commit", id: ext.insert!.id })} onEdit={() => { post({ type: "panel.insert", action: "cancel", id: ext.insert!.id }); window.dispatchEvent(new CustomEvent("cw-agent-compose", { detail: { text: `Rewrite the text to insert: `, send: false } })); }} onCancel={() => post({ type: "panel.insert", action: "cancel", id: ext.insert!.id })} />}
                {ext.insert && (ext.insert.status === "inserted" || ext.insert.status === "undone" || ext.insert.status === "cancelled") && <InsertRecord insert={ext.insert} onUndo={() => post({ type: "panel.insert", action: "undo", id: ext.insert!.id })} />}

                {t.streaming && t.activity && <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.ink }}><span className="ag-pulse-1000"><Icon name="loader-circle" size={12} color={C.primary} /></span><span style={mono()}>{t.activity}</span><span>…</span></div>}
                {t.offline && <OfflineBanner queued={t.queued.length} />}
                {t.error && !t.offline && <div role="alert" style={{ border: `1px solid ${C.warnBorder}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}><div style={{ fontSize: 12, fontWeight: 700, color: C.warn }}>That didn't work</div><div style={{ fontSize: 13, lineHeight: 1.5 }}>{t.error}</div><div><Button variant="primary" size="xs" onClick={() => t.setError(null)}>Dismiss</Button></div></div>}
              </>
            )}
          </div>

          {(draftPc || ext.capturing) && signedIn && (
            <div style={{ flex: "none", padding: "8px 12px 0", display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${C.divider}` }}>
              {ext.capturing && !draftPc && <div style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 7 }}><span className="ag-pulse-1000"><Icon name="scan" size={12} color={C.primary} /></span>Capturing…</div>}
              {draftPc && <PageContextCard pc={draftPc} onRemove={() => void ext.clearDraft()} />}
              {overLimit && draftPc && <LongSelection chars={draftPc.chars ?? draftPc.text?.length ?? 0} canPage={tab?.status === "approved"} onPage={() => post({ type: "panel.action", action: "page" })} onTrim={() => void ext.setDraft({ ...ext.draft!, pageContext: { ...draftPc, text: (draftPc.text ?? "").slice(0, LIMITS.selectionChars), chars: LIMITS.selectionChars, trimmed: true } })} onCancel={() => void ext.clearDraft()} />}
            </div>
          )}
          <div data-cw-agent-panel="" style={composerDisabled ? { opacity: 0.55, pointerEvents: "none" } : undefined}>
            <Composer panel context={null} streaming={t.streaming} locked={composerLocked} offline={t.offline} voiceThread={t} autoFocus={false}
              placeholderOverride={composerDisabled ? "Ask the agent…" : overLimit ? "Choose what to do with the long selection above" : t.offline ? "You're offline. Questions send when you're back" : "Ask, or send something from the page…"}
              onSend={(text, ids, meta) => void send(text, { attachmentIds: ids, attachments: meta.attachments as never, command: meta.command, tier: meta.tier ?? null, ...(meta.voice ? { voice: true, language: meta.voice.language } : {}) })} onStop={t.stop} />
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div data-cw-extension style={{ height: "100%", display: "flex", flexDirection: "column", background: C.surface, color: C.ink, minWidth: 320 }}>
      <AgentStyles />
      <style>{`[data-cw-extension] textarea{font-family:inherit} [data-thread] .ag-record-in > div:first-child{flex-wrap:wrap} @media (max-width:359px){ [data-thread] [role=group] > div{flex-wrap:wrap} }`}</style>
      {children}
    </div>
  );
}

function AssistantMessage({ m, last, pageChanged, host, onSettled, onContinue, onSend, onReview, verbatimLabelFor }: { m: AgentMessage; last: boolean; pageChanged: { title: string; at: string } | null; host: string; onSettled: (c: ThreadConfirmation, o: { status: string; at: string; result?: Record<string, unknown> | null }) => void; onContinue?: () => void; onSend: (t: string) => void; onReview: (text: string) => void; verbatimLabelFor: (t: string) => string | null }) {
  const { prose, inserts } = useMemo(() => (m.streaming ? { prose: m.content, inserts: [] as string[] } : splitInsert(m.content ?? "")), [m.content, m.streaming]);
  const shown = inserts.length ? { ...m, content: prose } : m;
  return (
    <div data-confirmations={m.blocks?.confirmations?.length ? "" : undefined} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {last && pageChanged && <PageChanged title={pageChanged.title} at={pageChanged.at} />}
      <AgentReply message={shown} panel onConfirmationSettled={onSettled as never} onContinue={onContinue} onEmailDocument={(d) => onSend(`Email me the document "${d.title}".`)} onSendFile={(f) => onSend(`Email the file ${f.filename} — ask me who to send it to.`)} />
      {inserts.map((text, i) => <InsertProposal key={i} text={text} host={host} verbatimLabel={verbatimLabelFor(text)} onReview={() => onReview(text)} onEdit={() => window.dispatchEvent(new CustomEvent("cw-agent-compose", { detail: { text: `Change the text to insert: `, send: false } }))} />)}
    </div>
  );
}

/** History in the panel (§6.10): TODAY · YESTERDAY · OLDER, search, the same threads as the console. */
function History({ conversations, query, setQuery, currentId, onOpen }: { conversations: ConversationSummary[] | null; query: string; setQuery: (q: string) => void; currentId: string | null; onOpen: (id: string) => void }) {
  const filtered = (conversations ?? []).filter((c) => !query || `${c.title} ${c.snippet ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0); const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const groups: Array<[string, ConversationSummary[]]> = [];
  const today = filtered.filter((c) => new Date(c.lastMessageAt) >= startOfToday), yesterday = filtered.filter((c) => { const d = new Date(c.lastMessageAt); return d < startOfToday && d >= startOfYesterday; }), older = filtered.filter((c) => new Date(c.lastMessageAt) < startOfYesterday);
  if (today.length) groups.push(["TODAY", today]); if (yesterday.length) groups.push(["YESTERDAY", yesterday]); if (older.length) groups.push(["OLDER", older]);
  return (
    <div data-view="history" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 12px" }}><div style={{ display: "flex", alignItems: "center", gap: 9, height: 38, border: `1px solid ${C.borderControl}`, borderRadius: 10, padding: "0 12px" }}><Icon name="search" size={14} color={C.faint} /><input name="history-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search threads" aria-label="Search threads" style={{ flex: 1, border: "none", outline: "none", fontFamily: "inherit", fontSize: 13.5, background: "transparent" }} /></div></div>
      {conversations === null && <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 8 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 44, borderRadius: 10, background: C.hover }} />)}</div>}
      {conversations !== null && filtered.length === 0 && <div style={{ padding: "8px 12px", fontSize: 13, color: C.muted }}>{query ? "No threads match." : "No earlier conversations."}</div>}
      {groups.map(([label, list]) => (
        <div key={label}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, padding: "8px 12px 4px" }}>{label}</div>
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="ag-row-hover ag-focus" style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 2, padding: "9px 12px", border: "none", borderBottom: `1px solid ${C.dividerRow}`, background: c.id === currentId ? C.rowExpanded : "transparent", cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span><span style={{ ...mono({ fontSize: 11 }), color: C.faint }}>{dayTimeZ(c.lastMessageAt)}</span></span>
              {c.snippet && <span style={{ fontSize: 12.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.snippet}</span>}
            </button>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => chrome.tabs.create({ url: `${CONSOLE_ORIGIN}/agent/history` })} style={{ marginTop: "auto", padding: "10px 12px", borderTop: `1px solid ${C.divider}`, border: "none", background: "transparent", textAlign: "left", fontSize: 12.5, fontWeight: 600, color: C.primaryHover, cursor: "pointer", fontFamily: "inherit" }}>All history in the console →</button>
    </div>
  );
}

function matchQuick(url: string, rules: QuickActionRule[]): { rule: QuickActionRule; entity: { kind: "leon-flight" | "icao"; id: string } } | null {
  for (const rule of rules) {
    let re: RegExp; try { re = new RegExp(rule.pattern, rule.flags ?? ""); } catch { continue; }
    const m = re.exec(url); if (!m) continue;
    const id = rule.entity.id.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? "");
    if (id) return { rule, entity: { kind: rule.entity.kind, id } };
  }
  return null;
}
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function fmtDay(iso: string) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`; }
export { hmZ, hmZs };
