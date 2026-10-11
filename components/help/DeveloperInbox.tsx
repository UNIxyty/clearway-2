"use client";

// Developer → Inbox (portal redesign, stage 3 — "Page Inbox"): the mini app's triage logic rebuilt for a desk. The
// list is grouped — waiting on you (urgent, a chat asking for you now, unread, or never touched), open, done — and
// filtered by Unread / All, status and type. The thread shows its status, where it was sent from, the auto-collected
// context as one strip, the conversation, and a reply composer with attachments, code fences and saved replies (a
// keyboard popover: ↑↓ move, ⏎ insert, ⇧⏎ insert and set the status). J/K/E/⌘⏎ shortcuts. Both this and the mini
// app read and write the same thread — a reply sent here appears in Telegram as your own message.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import { Button, EmptyState, ErrorState, IconButton, Kbd, Menu, NoMatchState, Segmented, Select, SkeletonRows, TextInput, errorDetail, useToast } from "@/components/kit";
import BlockRenderer, { type AttachmentMeta } from "@/components/help/BlockRenderer";
import { StatusChip, TypeChip } from "@/components/help/chips";
import {
  ageOf,
  flushOutbox,
  helpApi,
  subscribeHelpStream,
  utcTime,
  type ThreadWithMeta,
} from "@/components/help/helpApi";
import { AttachButton, AttachmentsPanel, useAttachments } from "@/components/help/BlockEditor";
import {
  HELP_CONTEXT_ORDER,
  HELP_STATUSES,
  HELP_STATUS_META,
  HELP_TYPE_META,
  helpContextFieldIsRed,
  helpThreadHasPresence,
  type HelpBlock,
  type HelpStatus,
} from "@/lib/help/shared";

type SavedReply = { id: string; text: string; setsStatus: HelpStatus | null; useCount: number };
type ThreadDetail = Awaited<ReturnType<typeof helpApi.getThread>>;

const initialsOf = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "??";

function needsYouNow(t: ThreadWithMeta): boolean {
  if (t.status === "done" || t.status === "impossible") return false;
  if (t.type === "urgent") return true;
  return t.type === "chat" && ["notified", "joining", "no_answer"].includes(t.presence);
}

export default function DeveloperInbox() {
  const [threads, setThreads] = useState<ThreadWithMeta[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [filter, setFilter] = useState<"unread" | "all">("all");
  const [statusFilter, setStatusFilter] = useState<HelpStatus | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const toast = useToast();
  const [reasonDraft, setReasonDraft] = useState<string | null>(null); // non-null = collecting Impossible reason
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [replyFilter, setReplyFilter] = useState("");
  const [replyIndex, setReplyIndex] = useState(0);
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
  const atts = useAttachments();
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const loadList = useCallback(() => {
    fetch("/api/help/inbox", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(errorDetail(r.status, "GET", "/api/help/inbox") + (d?.error ? ` · ${d.error}` : ""));
        setThreads(d.threads || []); setListError(null);
      })
      .catch((e) => setListError((prev) => (e instanceof Error ? e.message : prev ?? errorDetail("network", "GET", "/api/help/inbox"))));
  }, []);

  const loadDetail = useCallback((id: string) => {
    helpApi.getThread(id).then((d) => {
      setDetail(d);
      helpApi.markRead(d.thread.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadList();
    flushOutbox();
    fetch("/api/help/saved-replies", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSavedReplies(d.replies || []))
      .catch(() => {});
    const unsub = subscribeHelpStream((e) => {
      loadList();
      if (e.threadId === selectedIdRef.current) loadDetail(e.threadId);
    });
    return unsub;
  }, [loadList, loadDetail]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const filtered = useMemo(() => {
    let list = threads || [];
    if (filter === "unread") list = list.filter((t) => t.unread > 0);
    if (statusFilter) list = list.filter((t) => t.status === statusFilter);
    if (typeFilter) list = list.filter((t) => t.type === typeFilter);
    return list;
  }, [threads, filter, statusFilter, typeFilter]);

  // Waiting on you: open, and urgent, a chat asking for you now, unread, or never touched. Open: the rest not done.
  const isDone = (t: ThreadWithMeta) => t.status === "done" || t.status === "impossible";
  const waitingOnYou = (t: ThreadWithMeta) => !isDone(t) && (needsYouNow(t) || t.unread > 0 || t.status === "untouched");
  const waitingGroup = [...filtered.filter(waitingOnYou)].sort((a, b) => Number(needsYouNow(b)) - Number(needsYouNow(a)));
  const openGroup = filtered.filter((t) => !isDone(t) && !waitingOnYou(t));
  const doneGroup = filtered.filter(isDone);
  const ordered = [...waitingGroup, ...openGroup, ...doneGroup];
  const unreadCount = (threads || []).filter((t) => t.unread > 0).length;
  const openCount = (threads || []).filter((t) => t.status === "untouched" || t.status === "under_process").length;

  // Keyboard: J/K walk the list, E marks done, ⌘⏎ sends. Never while typing
  // (except ⌘⏎, which belongs to the reply box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void send(); return; }
      if (typing) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        if (!ordered.length) return;
        const idx = ordered.findIndex((t) => t.id === selectedIdRef.current);
        const next = e.key === "j" ? Math.min(idx + 1, ordered.length - 1) : Math.max(idx - 1, 0);
        setSelectedId(ordered[Math.max(0, next)].id);
      }
      if (e.key === "e" && selectedIdRef.current) {
        e.preventDefault();
        void setStatus("done");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered]);

  async function setStatus(status: HelpStatus, reason?: string) {
    const id = selectedIdRef.current;
    if (!id) return;
    if (status === "impossible" && !reason) { setReasonDraft(""); return; }
    try {
      await helpApi.setStatus(id, status, reason);
      setReasonDraft(null);
      loadDetail(id);
      loadList();
    } catch (error) {
      toast.show({ tone: "danger", title: "Couldn't change the status", body: error instanceof Error ? error.message : undefined });
    }
  }

  function replyToBlocks(text: string): HelpBlock[] {
    // Plain text plus code blocks (``` fences) — no slash menu on this side.
    const blocks: HelpBlock[] = [];
    const parts = text.split(/```/);
    parts.forEach((part, i) => {
      const trimmed = part.replace(/^\n+|\n+$/g, "");
      if (!trimmed) return;
      if (i % 2 === 1) blocks.push({ type: "code", text: trimmed });
      else for (const para of trimmed.split(/\n{2,}/)) if (para.trim()) blocks.push({ type: "paragraph", text: para.trim() });
    });
    return blocks;
  }

  async function send() {
    const id = selectedIdRef.current;
    if (!id || sending) return;
    const blocks = replyToBlocks(reply);
    for (const aid of atts.attachedIds) blocks.push({ type: "attachment", id: aid });
    if (!blocks.length) return;
    setSending(true);
    try {
      await helpApi.sendMessage(id, { blocks, attachmentIds: atts.attachedIds });
      setReply("");
      atts.reset();
      loadDetail(id);
      loadList();
    } catch (error) {
      toast.show({ tone: "danger", title: "Couldn't send the reply", body: error instanceof Error ? error.message : undefined, action: { label: "Retry", onClick: () => void send() } });
    } finally {
      setSending(false);
    }
  }

  function insertSavedReply(r: SavedReply, alsoSetStatus: boolean) {
    setReply((v) => (v ? `${v}\n${r.text}` : r.text));
    setRepliesOpen(false);
    setReplyFilter("");
    fetch("/api/help/saved-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ used: r.id }),
    }).catch(() => {});
    if (alsoSetStatus && r.setsStatus) void setStatus(r.setsStatus, r.setsStatus === "impossible" ? r.text : undefined);
    replyRef.current?.focus();
  }

  function wrapSelectionInCode() {
    const el = replyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const next = `${reply.slice(0, s)}\n\`\`\`\n${reply.slice(s, e)}\n\`\`\`\n${reply.slice(e)}`;
    setReply(next);
    el.focus();
  }

  const visibleReplies = savedReplies.filter((r) => !replyFilter || r.text.toLowerCase().includes(replyFilter.toLowerCase()));

  const attachmentMap = useMemo(() => {
    const m = new Map<string, AttachmentMeta>();
    for (const a of detail?.attachments || []) m.set(a.id, a);
    return m;
  }, [detail?.attachments]);

  const timeline = useMemo(() => {
    if (!detail) return [];
    return [
      ...detail.messages.map((m) => ({ at: m.createdAt, kind: "msg" as const, msg: m })),
      ...detail.events.map((e) => ({ at: e.createdAt, kind: "event" as const, event: e })),
    ].sort((a, b) => a.at.localeCompare(b.at));
  }, [detail]);

  const t = detail?.thread;
  const statusMeta = t ? HELP_STATUS_META[t.status] : null;

  const row = (r: ThreadWithMeta, waiting: boolean) => {
    const on = r.id === selectedId;
    const urgentNow = needsYouNow(r);
    return (
      <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} aria-current={on ? "true" : undefined}
        className={`flex w-full cursor-pointer gap-3 border-x-0 border-b border-t-0 border-solid border-cw-divider px-4 py-3 text-left font-sans outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--cw-focus)] ${on ? "bg-cw-bg-selected shadow-[inset_3px_0_0_var(--cw-primary)]" : "bg-transparent hover:bg-cw-bg-hover"}`}>
        <span aria-hidden className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-cw-border bg-cw-bg-sunken text-[11px] font-bold text-cw-text-body">
          {initialsOf(r.userName || r.userEmail || "??")}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-cw-text" style={{ fontWeight: r.unread ? 700 : 500 }}>{r.userName || r.userEmail || "Ops"}</span>
            <span className={`font-mono text-[11.5px] ${urgentNow ? "font-bold text-cw-danger-text" : "text-cw-text-muted"}`}>{urgentNow ? `waiting ${ageOf(r.lastMessageAt)}` : ageOf(r.lastMessageAt)}</span>
          </span>
          <span className="truncate text-[13.5px] text-cw-text" style={{ fontWeight: r.unread ? 700 : 500 }}>{r.title || r.preview}</span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <TypeChip type={r.type} size={18} />
            {!waiting && <StatusChip status={r.status} size={18} />}
            <span className="min-w-0 truncate font-mono text-[11.5px] text-cw-text-muted">{r.type === "chat" && urgentNow ? "wants to chat now" : String(r.context?.page || HELP_TYPE_META[r.type].label.toLowerCase())}</span>
            {r.unread > 0 && <span aria-label="Unread" className={`ml-auto h-2 w-2 flex-none rounded-full ${urgentNow ? "bg-cw-danger" : "bg-cw-primary"}`} />}
          </span>
        </span>
      </button>
    );
  };
  const group = (label: string, list: ThreadWithMeta[], waiting = false) => list.length > 0 && (
    <div key={label} role="group" aria-label={label}>
      <div className="flex gap-2 px-4 pb-1.5 pt-3.5 text-[10.5px] font-bold tracking-[0.12em] text-cw-text-muted">{label.toUpperCase()}<span className="font-mono">{list.length}</span></div>
      {list.map((r) => row(r, waiting))}
    </div>
  );
  const filtering = filter === "unread" || statusFilter !== null || typeFilter !== null;

  return (
    <PortalShell crumb="Developer" title="Inbox"
      subtitle={`Bug reports, help threads and chats sent to developers.${threads ? ` ${openCount} open · ${unreadCount} unread · ${waitingGroup.length} waiting on you.` : ""}`}
      headerRight={<span className="cw-wide-only font-mono text-[12px] text-cw-text-muted">J / K move · E mark done · ⌘↵ send</span>}>
      <div style={{ padding: "0 var(--cw-page-pad) 32px" }}>
        <div className="grid overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1 min-[900px]:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]" style={{ height: "max(600px, calc(100dvh - var(--cw-topbar) - 170px))" }}>
          {/* list */}
          <div className="flex min-h-0 min-w-0 flex-col border-b border-cw-border min-[900px]:border-b-0 min-[900px]:border-r">
            <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-cw-divider p-3">
              <Segmented size="sm" label="Show" value={filter} onChange={setFilter} options={[{ value: "unread", label: <>Unread{unreadCount > 0 && <span className="ml-1.5 font-mono text-[11px]">{unreadCount}</span>}</> }, { value: "all", label: "All" }]} />
              <span className="w-[108px]"><Select size="sm" label="Status" value={statusFilter ?? "any"} onChange={(v) => setStatusFilter(v === "any" ? null : (v as HelpStatus))}
                options={[{ value: "any", label: "Status" }, ...HELP_STATUSES.map((s) => ({ value: s, label: HELP_STATUS_META[s].label }))]} /></span>
              <span className="w-[100px]"><Select size="sm" label="Type" value={typeFilter ?? "any"} onChange={(v) => setTypeFilter(v === "any" ? null : v)}
                options={[{ value: "any", label: "Type" }, ...Object.keys(HELP_TYPE_META).map((k) => ({ value: k, label: HELP_TYPE_META[k as keyof typeof HELP_TYPE_META].label }))]} /></span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Threads">
              {threads === null ? (
                listError ? <ErrorState title="Couldn't load the inbox" detail={listError} onRetry={loadList} /> : <SkeletonRows rows={6} label="Loading the inbox" />
              ) : ordered.length === 0 ? (
                filtering ? <NoMatchState title="Nothing matches these filters" onClear={() => { setFilter("all"); setStatusFilter(null); setTypeFilter(null); }}>{(threads?.length ?? 0)} {threads?.length === 1 ? "thread is" : "threads are"} hidden.</NoMatchState>
                  : <EmptyState icon="inbox" title="Nothing waiting">New bug reports, help threads and chats land here as they arrive.</EmptyState>
              ) : (
                <>
                  {group("Waiting on you", waitingGroup, true)}
                  {group("Open", openGroup)}
                  {group("Done", doneGroup)}
                </>
              )}
            </div>
          </div>

          {/* thread */}
          <div className="relative flex min-h-0 min-w-0 flex-col">
            {!t && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-cw-text-muted">
                <MaskIcon name="mail-open" size={22} />
                <div className="text-[14px]">{threads?.length ? "Select a conversation." : "Inbox is clear."}</div>
                {threads?.length ? <div className="font-mono text-[12px]">J / K walks the list</div> : null}
              </div>
            )}
            {t && statusMeta && detail && (
              <>
                <div className="flex flex-none flex-wrap items-start gap-4 border-b border-cw-divider px-6 py-[18px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeChip type={t.type} size={20} />
                      <StatusChip status={t.status} size={20} />
                      <span className="font-mono text-[12px] text-cw-text-muted">{t.reference}</span>
                    </div>
                    <h2 className="m-0 mt-2 text-[18px] font-extrabold tracking-[-0.01em] text-cw-text">{t.title}</h2>
                    <div className="mt-1 text-[13px] text-cw-text-muted">
                      {t.userName || t.userEmail}{t.context.page ? <> · from <span className="font-mono">{String(t.context.page)}</span></> : null} · {String(t.context.role || "ops")} · <span className="font-mono">{utcTime(t.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-none flex-wrap items-center gap-2">
                    {helpThreadHasPresence(t.type) && t.presence !== "present" && <Button size="sm" onClick={() => helpApi.presence(t.id, "join").then(() => loadDetail(t.id)).catch(() => {})}>Go live</Button>}
                    {helpThreadHasPresence(t.type) && t.presence === "present" && <Button size="sm" onClick={() => helpApi.presence(t.id, "close").then(() => { loadDetail(t.id); loadList(); }).catch(() => {})}>End chat</Button>}
                    <Menu label="Set status" buttonLabel={<>Status: {statusMeta.label}</>} align="end"
                      items={HELP_STATUSES.map((s) => ({ id: s, label: <>{HELP_STATUS_META[s].label}{s === "impossible" && <span className="ml-auto pl-3 text-[11.5px] text-cw-text-muted">needs a reason</span>}</>, text: HELP_STATUS_META[s].label, onSelect: () => void setStatus(s) }))} />
                    {t.status !== "done" && <Button size="sm" icon="check" onClick={() => void setStatus("done")}>Mark done <Kbd>E</Kbd></Button>}
                  </div>
                </div>

                {reasonDraft !== null && (
                  <div className="flex flex-none flex-wrap items-center gap-2.5 border-b border-cw-danger-border bg-cw-danger-tint px-6 py-2.5">
                    <span className="text-[13px] font-bold text-cw-danger-text">Impossible needs a written reason:</span>
                    <span className="min-w-[220px] flex-1"><TextInput autoFocus value={reasonDraft} onChange={(e) => setReasonDraft(e.target.value)} aria-label="Why it can't be done"
                      onKeyDown={(e) => e.key === "Enter" && reasonDraft.trim().length >= 5 && void setStatus("impossible", reasonDraft.trim())} placeholder="Why it can't be done — ops will see this" /></span>
                    {reasonDraft.trim().length >= 5 && <Button size="sm" variant="danger" onClick={() => void setStatus("impossible", reasonDraft.trim())}>Save</Button>}
                    <Button size="sm" variant="quiet" onClick={() => setReasonDraft(null)}>Cancel</Button>
                  </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 py-5">
                  {/* auto-collected: one horizontal strip, first thing on screen */}
                  <div className="flex items-start gap-4 rounded-[12px] border border-cw-border bg-cw-bg-sunken px-4 py-3">
                    <span className="flex-none pt-0.5 text-[10.5px] font-bold tracking-[0.1em] text-cw-text-muted">AUTO-COLLECTED</span>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-2.5">
                      {HELP_CONTEXT_ORDER.map(({ key, label }) => {
                        const value = String(t.context[key] || "—");
                        return (
                          <div key={key} className="flex flex-none flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-cw-text-muted">{label}</span>
                            <span className={`whitespace-nowrap font-mono text-[12px] font-semibold ${helpContextFieldIsRed(key, value) ? "text-cw-danger-text" : "text-cw-text"}`}>{value}</span>
                          </div>
                        );
                      })}
                    </div>
                    <Button size="sm" variant="quiet" icon="copy" onClick={() => { void navigator.clipboard?.writeText(HELP_CONTEXT_ORDER.map(({ key, label }) => `${label}: ${t.context[key] || "—"}`).join("\n")).then(() => toast.show({ tone: "info", title: "Context copied" })).catch(() => {}); }}>Copy all</Button>
                  </div>

                  {timeline.map((item) => {
                    if (item.kind === "event") {
                      const e = item.event!;
                      const p = e.payload as { from?: string; to?: string; reason?: string };
                      const text =
                        e.kind === "status_changed" ? <>Status changed to <strong className="font-semibold text-cw-text-body">{HELP_STATUS_META[p.to as HelpStatus]?.label || p.to}</strong>{p.reason ? ` — ${p.reason}` : ""}</>
                        : e.kind === "joined" ? "You joined the chat"
                        : e.kind === "chat_closed" ? "You closed the chat"
                        : e.kind === "nudged" ? "They nudged again"
                        : e.kind === "linked_report" ? "A linked report was filed"
                        : e.kind;
                      return (
                        <div key={e.id} className="flex items-center gap-2.5 text-[12px] text-cw-text-muted">
                          <span className="h-px flex-1 bg-cw-divider" /><span>{text} · <span className="font-mono">{utcTime(e.createdAt)}</span></span><span className="h-px flex-1 bg-cw-divider" />
                        </div>
                      );
                    }
                    const m = item.msg!;
                    const mine = m.author === "developer";
                    return (
                      <div key={m.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                        <span aria-hidden className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[11px] font-bold ${mine ? "bg-cw-primary text-cw-text-on-primary" : "border border-cw-border bg-cw-bg-sunken text-cw-text-body"}`}>
                          {mine ? "ME" : initialsOf(m.authorName || t.userName || t.userEmail || "??")}
                        </span>
                        <div className={`flex min-w-0 max-w-[560px] flex-col gap-1.5 ${mine ? "items-end" : "items-start"}`}>
                          <div className="text-[12px] text-cw-text-muted"><strong className="font-semibold text-cw-text">{mine ? "You" : m.authorName || t.userName || "Ops"}</strong> · <span className="font-mono">{utcTime(m.createdAt)}</span></div>
                          <div className={`rounded-[12px] border px-3.5 py-2.5 text-[14px] leading-[1.55] text-cw-text ${mine ? "border-cw-primary-tint-border bg-cw-primary-tint" : "border-cw-border bg-cw-bg-sunken"}`}>
                            <BlockRenderer blocks={m.blocks} attachments={attachmentMap} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="relative flex-none px-6 pb-[18px] pt-3">
                  <div className="flex flex-col gap-2.5 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3.5 py-3 focus-within:border-cw-focus focus-within:shadow-[0_0_0_3px_var(--cw-focus-halo)]">
                    <textarea
                      ref={replyRef}
                      rows={2}
                      value={reply}
                      aria-label={`Reply to ${t.userName || t.userEmail || "ops"}`}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void send(); } }}
                      placeholder={`Reply to ${t.userName || t.userEmail || "ops"}… plain text; \`\`\` fences make a code block`}
                      className="min-h-10 w-full resize-none border-none bg-transparent p-0 font-sans text-[14px] leading-[1.55] text-cw-text outline-none placeholder:text-cw-text-placeholder"
                    />
                    <AttachmentsPanel atts={atts} compact dropzone={false} />
                    <div className="flex flex-wrap items-center gap-2">
                      <AttachButton atts={atts} />
                      <IconButton icon="code" label="Wrap the selection in a code block" size="sm" bordered onClick={wrapSelectionInCode} />
                      <span className="relative">
                        <Button size="sm" icon="zap" aria-expanded={repliesOpen} onClick={() => { setRepliesOpen((v) => !v); setReplyIndex(0); }}>Saved replies</Button>
                        {repliesOpen && (
                          <div className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[360px] overflow-hidden rounded-[12px] border border-cw-border bg-cw-bg-raised shadow-cw-pop">
                            <div className="flex items-center gap-2 border-b border-cw-divider px-3 py-2.5">
                              <span className="flex-1 text-[13px] font-bold text-cw-text">Saved replies</span>
                              <span className="w-[150px]"><TextInput autoFocus value={replyFilter} aria-label="Filter saved replies" placeholder="Type to filter"
                                onChange={(e) => { setReplyFilter(e.target.value); setReplyIndex(0); }}
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowDown") { e.preventDefault(); setReplyIndex((i) => Math.min(i + 1, visibleReplies.length - 1)); }
                                  if (e.key === "ArrowUp") { e.preventDefault(); setReplyIndex((i) => Math.max(i - 1, 0)); }
                                  if (e.key === "Enter" && visibleReplies[replyIndex]) { e.preventDefault(); insertSavedReply(visibleReplies[replyIndex], e.shiftKey); }
                                  if (e.key === "Escape") { e.preventDefault(); setRepliesOpen(false); }
                                }} className="!h-8 !text-[12.5px]" /></span>
                            </div>
                            <div className="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto p-1.5" role="listbox" aria-label="Saved replies">
                              {visibleReplies.map((r, i) => (
                                <button key={r.id} type="button" role="option" aria-selected={i === replyIndex} onMouseEnter={() => setReplyIndex(i)} onClick={(e) => insertSavedReply(r, e.shiftKey)}
                                  className={`flex cursor-pointer flex-col gap-0.5 rounded-[8px] border px-2.5 py-2 text-left font-sans ${i === replyIndex ? "border-cw-primary-tint-border bg-cw-bg-selected" : "border-transparent bg-transparent"}`}>
                                  <span className="text-[13px] leading-[1.4] text-cw-text" style={{ fontWeight: i === replyIndex ? 600 : 500 }}>{r.text}</span>
                                  <span className="text-[11.5px] text-cw-text-muted">{r.setsStatus ? `sets ${HELP_STATUS_META[r.setsStatus].label} · ` : ""}used {r.useCount}×</span>
                                </button>
                              ))}
                              {!visibleReplies.length && <div className="px-2.5 py-3 text-[12.5px] text-cw-text-muted">No saved reply matches.</div>}
                              <div className="flex flex-wrap items-center gap-3 px-2.5 pb-1 pt-1.5 text-[11.5px] text-cw-text-muted"><span><Kbd>↑↓</Kbd> move</span><span><Kbd>↵</Kbd> insert</span><span><Kbd>⇧↵</Kbd> insert and set the status</span></div>
                            </div>
                          </div>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-cw-text-muted">They see your reply in Help &amp; support.</span>
                      <Button size="sm" variant="primary" loading={sending} loadingLabel="Sending…" onClick={() => void send()}>Send <span className="font-mono text-[11px] font-medium opacity-80">⌘↵</span></Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
