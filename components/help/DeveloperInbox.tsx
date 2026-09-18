"use client";

// The developer inbox — the mini app's triage logic rebuilt for a desk: three
// panes, both inbox groups with identical chips, the auto-collected context as
// one horizontal strip, quick actions in the thread header, saved replies as a
// keyboard popover (↑↓ move, ⏎ insert, ⇧⏎ insert + set the status), and
// J/K/E/⌘⏎ shortcuts. Both this and the mini app read and write the same
// thread — a reply sent here appears in Telegram as your own message.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortalShell from "@/components/portal/Shell";
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
  const [openDropdown, setOpenDropdown] = useState<"status" | "type" | "setstatus" | null>(null);
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
      .then((r) => r.json())
      .then((d) => setThreads(d.threads || []))
      .catch(() => setThreads([]));
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

  const urgentGroup = filtered.filter(needsYouNow);
  const waitingGroup = filtered.filter((t) => !needsYouNow(t));
  const ordered = [...urgentGroup, ...waitingGroup];
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
    if (status === "impossible" && !reason) { setReasonDraft(""); setOpenDropdown(null); return; }
    try {
      await helpApi.setStatus(id, status, reason);
      setReasonDraft(null);
      setOpenDropdown(null);
      loadDetail(id);
      loadList();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed");
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
      alert(error instanceof Error ? error.message : "Send failed");
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

  const row = (r: ThreadWithMeta, urgentRow: boolean) => (
    <button
      key={r.id}
      onClick={() => setSelectedId(r.id)}
      className="flex w-full cursor-pointer gap-[11px] border-x-0 border-b border-t-0 border-solid border-[#f1f2f4] px-[18px] py-3 text-left"
      style={{
        background: r.id === selectedId ? "#f2f7ff" : urgentRow ? (r.type === "urgent" ? "#fffafa" : "#fafffb") : "#fff",
      }}
    >
      <span
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full font-mono text-[11px] font-bold"
        style={{
          background: r.type === "urgent" ? "#fdf2f2" : r.type === "chat" ? "#e7f6ec" : r.unread ? "#e8effe" : "#f5f6f7",
          color: r.type === "urgent" ? "#b42318" : r.type === "chat" ? "#15803d" : r.unread ? "#1d4ed8" : "#6c7079",
        }}
      >
        {initialsOf(r.userName || r.userEmail || "??")}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-[7px]">
          <span className="text-[13.5px] text-cw-ink" style={{ fontWeight: r.unread ? 700 : 500 }}>
            {r.userName || r.userEmail || "Ops"}
          </span>
          <TypeChip type={r.type} size={18} />
          <span
            className="ml-auto font-mono text-[11px]"
            style={urgentRow ? { color: "#e5484d", fontWeight: 700 } : { color: "#9aa0a8" }}
          >
            {urgentRow ? `waiting ${ageOf(r.lastMessageAt)}` : ageOf(r.lastMessageAt)}
          </span>
        </span>
        <span className="truncate text-[13px] leading-[1.4]" style={{ color: r.unread ? "#3a3d44" : "#9aa0a8" }}>
          {r.preview}
        </span>
        <span className="flex items-center gap-[7px]">
          <StatusChip status={r.status} size={17} />
          <span className="truncate font-mono text-[10.5px] text-cw-faint">
            {r.type === "chat" && urgentRow ? "wants to chat now" : String(r.context?.page || HELP_TYPE_META[r.type].label.toLowerCase())}
          </span>
          {r.unread > 0 && <span className="ml-auto h-2 w-2 flex-none rounded-full" style={{ background: urgentRow ? "#e5484d" : "#2563eb" }} />}
        </span>
      </span>
    </button>
  );

  return (
    <PortalShell crumb="Developer" title="" wide footer={false}>
      <div className="flex h-[calc(100dvh-54px)] overflow-hidden lg:h-dvh">
        {/* list pane */}
        <div className="flex w-[372px] flex-none flex-col border-r border-cw-border bg-white">
          <div className="flex flex-none flex-col gap-3 border-b border-cw-border px-[18px] pb-3 pt-4">
            <div className="flex items-center gap-2.5">
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-[18px] font-extrabold tracking-[-0.015em] text-cw-ink">Inbox</span>
                <span className="text-[12px] text-cw-faint">
                  {threads ? `${openCount} open · ${unreadCount} unread · ${urgentGroup.length} waiting on you` : "loading…"}
                </span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setFilter("unread")}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] border-none px-3 text-[13px] font-semibold"
                style={filter === "unread" ? { background: "#17181c", color: "#fff" } : { background: "#f5f6f7", border: "1px solid #e6e7ea", color: "#3a3d44" }}
              >
                Unread
                {unreadCount > 0 && (
                  <span className="rounded-[8px] px-[5px] font-mono text-[10px] font-bold" style={filter === "unread" ? { background: "rgba(255,255,255,.22)" } : { background: "#e6e7ea" }}>
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setFilter("all"); setStatusFilter(null); setTypeFilter(null); }}
                className="inline-flex h-9 cursor-pointer items-center rounded-[9px] px-3 text-[13px] font-semibold"
                style={filter === "all" && !statusFilter && !typeFilter ? { background: "#17181c", color: "#fff", border: "none" } : { background: "#f5f6f7", border: "1px solid #e6e7ea", color: "#3a3d44" }}
              >
                All
              </button>
              {(["status", "type"] as const).map((which) => (
                <div key={which} className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === which ? null : which)}
                    className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-[9px] border border-cw-border bg-cw-sidebar px-3 text-[13px] text-cw-body"
                  >
                    {which === "status" ? (statusFilter ? HELP_STATUS_META[statusFilter].label : "Status") : typeFilter ? HELP_TYPE_META[typeFilter as keyof typeof HELP_TYPE_META].label : "Type"} ▾
                  </button>
                  {openDropdown === which && (
                    <div className="absolute left-0 top-full z-30 mt-1 w-[170px] rounded-[10px] border border-cw-border bg-white p-1 shadow-[0_10px_28px_rgba(16,18,22,.14)]">
                      <button onClick={() => { (which === "status" ? setStatusFilter : setTypeFilter)(null); setOpenDropdown(null); }} className="block w-full cursor-pointer rounded-[7px] border-none bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-cw-muted hover:bg-cw-page">
                        Any
                      </button>
                      {(which === "status" ? HELP_STATUSES : Object.keys(HELP_TYPE_META)).map((v) => (
                        <button
                          key={v}
                          onClick={() => { if (which === "status") setStatusFilter(v as HelpStatus); else setTypeFilter(v); setOpenDropdown(null); }}
                          className="block w-full cursor-pointer rounded-[7px] border-none bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-cw-body hover:bg-cw-page"
                        >
                          {which === "status" ? HELP_STATUS_META[v as HelpStatus].label : HELP_TYPE_META[v as keyof typeof HELP_TYPE_META].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {threads === null &&
              [0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2 border-b border-[#f1f2f4] px-[18px] py-3">
                  <div className="h-3 w-[120px] rounded bg-[#f1f2f4]" />
                  <div className="h-3 w-full rounded bg-cw-sidebar" />
                </div>
              ))}
            {threads !== null && ordered.length === 0 && (
              <div className="px-[18px] py-8 text-center text-[13px] text-cw-faint">Nothing here — inbox zero.</div>
            )}
            {urgentGroup.length > 0 && (
              <div className="flex items-center gap-2 px-[18px] pb-1.5 pt-[9px]">
                <span className="font-mono text-[9.5px] font-bold tracking-[0.1em] text-[#b42318]">NEEDS YOU NOW</span>
                <span className="h-px flex-1 bg-[#f1f2f4]" />
              </div>
            )}
            {urgentGroup.map((r) => row(r, true))}
            {waitingGroup.length > 0 && (
              <div className="flex items-center gap-2 px-[18px] pb-1.5 pt-2.5">
                <span className="font-mono text-[9.5px] font-bold tracking-[0.1em] text-cw-faint">WAITING</span>
                <span className="h-px flex-1 bg-[#f1f2f4]" />
              </div>
            )}
            {waitingGroup.map((r) => row(r, false))}
          </div>

          <div className="flex flex-none items-center gap-2.5 border-t border-cw-border bg-cw-page px-[18px] py-2.5">
            <span className="flex-1 font-mono text-[10.5px] text-cw-faint">J / K to move · E to mark done · ⌘⏎ to send</span>
          </div>
        </div>

        {/* thread pane */}
        <div className="relative flex min-w-0 flex-1 flex-col bg-cw-page">
          {!t && (
            <div className="flex flex-1 items-center justify-center text-[13.5px] text-cw-faint">
              {threads?.length ? "Select a conversation — J/K walks the list." : "Reports and chats from ops appear here."}
            </div>
          )}
          {t && statusMeta && detail && (
            <>
              <div className="flex flex-none items-center gap-3 border-b border-cw-border bg-white px-[22px] py-[13px]">
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <div className="flex items-center gap-[9px]">
                    <span className="truncate text-[16px] font-extrabold tracking-[-0.015em] text-cw-ink">{t.title}</span>
                    <TypeChip type={t.type} size={20} />
                  </div>
                  <span className="truncate font-mono text-[11px] text-cw-faint">
                    {t.reference} · {t.userName || t.userEmail} · {String(t.context.role || "ops")} · filed {utcTime(t.createdAt)}
                  </span>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === "setstatus" ? null : "setstatus")}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border px-3 font-mono text-[10.5px] font-extrabold tracking-[0.06em]"
                    style={{ background: statusMeta.bg, borderColor: statusMeta.border, color: statusMeta.color }}
                  >
                    {statusMeta.chip} <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
                  </button>
                  {openDropdown === "setstatus" && (
                    <div className="absolute right-0 top-full z-30 mt-1 w-[190px] rounded-[10px] border border-cw-border bg-white p-1 shadow-[0_10px_28px_rgba(16,18,22,.14)]">
                      {HELP_STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => void setStatus(s)}
                          className="flex w-full cursor-pointer items-center gap-2 rounded-[7px] border-none bg-transparent px-2.5 py-2 text-left hover:bg-cw-page"
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: HELP_STATUS_META[s].dot }} />
                          <span className="text-[12.5px] font-semibold text-cw-body">{HELP_STATUS_META[s].label}</span>
                          {s === "impossible" && <span className="ml-auto text-[10.5px] text-cw-faint">needs a reason</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {helpThreadHasPresence(t.type) && t.presence !== "present" && (
                  <button
                    onClick={() => helpApi.presence(t.id, "join").then(() => loadDetail(t.id)).catch(() => {})}
                    className="inline-flex h-9 cursor-pointer items-center rounded-[9px] border border-cw-border bg-white px-[13px] text-[13px] font-semibold text-cw-body"
                  >
                    Go live
                  </button>
                )}
                {helpThreadHasPresence(t.type) && t.presence === "present" && (
                  <button
                    onClick={() => helpApi.presence(t.id, "close").then(() => { loadDetail(t.id); loadList(); }).catch(() => {})}
                    className="inline-flex h-9 cursor-pointer items-center rounded-[9px] border border-cw-border bg-white px-[13px] text-[13px] font-semibold text-cw-body"
                  >
                    End chat
                  </button>
                )}
                <button
                  onClick={() => void setStatus("done")}
                  className="inline-flex h-9 cursor-pointer items-center rounded-[9px] border-none bg-cw-green px-[13px] text-[13px] font-bold text-white"
                >
                  Mark done
                </button>
              </div>

              {reasonDraft !== null && (
                <div className="flex flex-none items-center gap-2.5 border-b border-[#f0c9ca] bg-[#fdf2f2] px-[22px] py-2.5">
                  <span className="text-[12.5px] font-bold text-[#b42318]">Impossible needs a written reason:</span>
                  <input
                    autoFocus
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && reasonDraft.trim().length >= 5 && void setStatus("impossible", reasonDraft.trim())}
                    placeholder="Why it cannot be done — ops will see this"
                    className="h-8 flex-1 rounded-[8px] border border-[#f0c9ca] bg-white px-2.5 text-[12.5px] outline-none"
                  />
                  <button
                    onClick={() => reasonDraft.trim().length >= 5 && void setStatus("impossible", reasonDraft.trim())}
                    className="h-8 cursor-pointer rounded-[8px] border-none bg-cw-red px-3 text-[12.5px] font-bold text-white"
                    style={{ opacity: reasonDraft.trim().length >= 5 ? 1 : 0.5 }}
                  >
                    Save
                  </button>
                  <button onClick={() => setReasonDraft(null)} className="h-8 cursor-pointer rounded-[8px] border border-[#f0c9ca] bg-white px-3 text-[12.5px] font-bold text-[#b42318]">Cancel</button>
                </div>
              )}

              <div className="flex flex-1 flex-col gap-[13px] overflow-y-auto px-[22px] py-[18px]">
                {/* auto-collected: one horizontal strip, first thing on screen */}
                <div className="flex items-start gap-[18px] rounded-[12px] border border-cw-border bg-white px-[15px] py-3">
                  <div className="flex flex-none items-center gap-2 pt-0.5">
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-[#f1f2f4] text-[11px] text-cw-muted">⚙</span>
                    <span className="font-mono text-[9.5px] font-bold tracking-[0.09em] text-cw-faint">AUTO-COLLECTED</span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-x-[22px] gap-y-2.5">
                    {HELP_CONTEXT_ORDER.map(({ key, label }) => {
                      const value = String(t.context[key] || "—");
                      return (
                        <div key={key} className="flex flex-none flex-col gap-px">
                          <span className="font-mono text-[8.5px] font-bold tracking-[0.08em] text-[#a0a5ab]">{label}</span>
                          <span className="whitespace-nowrap font-mono text-[11.5px] font-semibold" style={{ color: helpContextFieldIsRed(key, value) ? "#b42318" : "#17181c" }}>
                            {value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() =>
                      navigator.clipboard?.writeText(
                        HELP_CONTEXT_ORDER.map(({ key, label }) => `${label}: ${t.context[key] || "—"}`).join("\n"),
                      ).catch(() => {})
                    }
                    className="flex-none cursor-pointer border-none bg-transparent text-[12px] font-bold text-cw-primary"
                  >
                    Copy all
                  </button>
                </div>

                {timeline.map((item) => {
                  if (item.kind === "event") {
                    const e = item.event!;
                    const p = e.payload as { from?: string; to?: string; reason?: string };
                    const text =
                      e.kind === "status_changed"
                        ? `You set status to ${HELP_STATUS_META[p.to as HelpStatus]?.label || p.to}${p.reason ? ` — ${p.reason}` : ""}`
                        : e.kind === "joined" ? "You joined the chat"
                        : e.kind === "chat_closed" ? "You closed the chat"
                        : e.kind === "nudged" ? "They nudged again"
                        : e.kind === "linked_report" ? "A linked report was filed"
                        : e.kind;
                    return (
                      <div key={e.id} className="flex items-center gap-2.5 pl-[43px]">
                        <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: e.kind === "status_changed" ? "#2563eb" : "#c3c7ce" }} />
                        <span className="text-[12px] text-cw-muted">{text}</span>
                        <span className="font-mono text-[10.5px] text-[#c3c7ce]">{utcTime(e.createdAt)}</span>
                        <span className="h-px flex-1 bg-[#f1f2f4]" />
                      </div>
                    );
                  }
                  const m = item.msg!;
                  const mine = m.author === "developer";
                  return (
                    <div key={m.id} className="flex gap-[11px]">
                      <span
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-full font-mono text-[11px] font-bold"
                        style={mine ? { background: "#17181c", color: "#fff" } : { background: "#e8effe", color: "#1d4ed8" }}
                      >
                        {mine ? "ME" : initialsOf(m.authorName || t.userName || t.userEmail || "??")}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-baseline gap-[9px]">
                          <span className="text-[13px] font-bold text-cw-ink">{mine ? "You" : m.authorName || t.userName || "Ops"}</span>
                          <span className="font-mono text-[10.5px] text-cw-faint">{utcTime(m.createdAt)}</span>
                        </div>
                        <div
                          className="max-w-[560px] rounded-[12px] border px-4 py-3.5"
                          style={mine ? { background: "#f2f7ff", borderColor: "#dbe6ff" } : { background: "#fff", borderColor: "#e6e7ea" }}
                        >
                          <BlockRenderer blocks={m.blocks} attachments={attachmentMap} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="relative flex flex-none flex-col gap-2.5 border-t border-cw-border bg-white px-[22px] pb-4 pt-3">
                <div className="flex flex-col gap-2.5 rounded-[12px] border border-cw-border bg-cw-page px-3.5 py-3">
                  <textarea
                    ref={replyRef}
                    rows={2}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void send(); }
                    }}
                    placeholder="Reply — plain text; ``` fences make a code block"
                    className="w-full resize-none border-none bg-transparent p-0 text-[13.5px] leading-[1.55] text-cw-ink outline-none placeholder:text-[#c3c7ce]"
                  />
                  <AttachmentsPanel atts={atts} compact dropzone={false} />
                  <div className="flex items-center gap-[9px]">
                    <AttachButton atts={atts} />
                    <button onClick={wrapSelectionInCode} title="Wrap selection in a code block" className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[9px] border border-cw-border bg-white font-mono text-[12px] font-bold text-cw-body">
                      {"{ }"}
                    </button>
                    <span className="relative">
                    <button
                      onClick={() => { setRepliesOpen((v) => !v); setReplyIndex(0); }}
                      className="inline-flex h-9 cursor-pointer items-center gap-[7px] rounded-[9px] border border-[#dbe6ff] bg-[#f2f7ff] px-3 text-[13px] font-bold text-[#1d4ed8]"
                    >
                      ⚡ Saved replies
                    </button>
                    {repliesOpen && (
                  <div className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[360px] overflow-hidden rounded-[13px] border border-cw-border bg-white shadow-[0_14px_36px_rgba(16,18,22,.16)]">
                    <div className="flex items-center gap-2 border-b border-[#f1f2f4] px-[13px] py-2.5">
                      <span className="flex-1 text-[12.5px] font-bold text-cw-ink">Saved replies</span>
                      <input
                        autoFocus
                        value={replyFilter}
                        onChange={(e) => { setReplyFilter(e.target.value); setReplyIndex(0); }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") { e.preventDefault(); setReplyIndex((i) => Math.min(i + 1, visibleReplies.length - 1)); }
                          if (e.key === "ArrowUp") { e.preventDefault(); setReplyIndex((i) => Math.max(i - 1, 0)); }
                          if (e.key === "Enter" && visibleReplies[replyIndex]) { e.preventDefault(); insertSavedReply(visibleReplies[replyIndex], e.shiftKey); }
                          if (e.key === "Escape") { e.preventDefault(); setRepliesOpen(false); }
                        }}
                        placeholder="type to filter"
                        className="h-8 w-[140px] rounded-[7px] border border-cw-border bg-cw-page px-2.5 text-[12px] text-cw-body outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 p-1.5">
                      {visibleReplies.map((r, i) => (
                        <button
                          key={r.id}
                          onMouseEnter={() => setReplyIndex(i)}
                          onClick={(e) => insertSavedReply(r, e.shiftKey)}
                          className="flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-left"
                          style={i === replyIndex ? { background: "#f2f7ff", border: "1px solid #dbe6ff" } : { background: "transparent", border: "1px solid transparent" }}
                        >
                          <span
                            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] text-[12px]"
                            style={
                              r.setsStatus === "under_process" ? { background: "#f2f7ff", color: "#1d4ed8" }
                              : r.setsStatus === "done" ? { background: "#e7f6ec", color: "#15803d" }
                              : r.setsStatus === "impossible" ? { background: "#fdf2f2", color: "#b42318" }
                              : { background: "#f1f1f2", color: "#3a3d44" }
                            }
                          >
                            {r.setsStatus === "under_process" ? "◷" : r.setsStatus === "done" ? "✓" : r.setsStatus === "impossible" ? "✕" : "▣"}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-px">
                            <span className="text-[12.5px] leading-[1.35] text-cw-ink" style={{ fontWeight: i === replyIndex ? 700 : 500 }}>{r.text}</span>
                            <span className="text-[11px] text-cw-faint">
                              {r.setsStatus ? `sets ${HELP_STATUS_META[r.setsStatus].label} · ` : ""}used {r.useCount}×
                            </span>
                          </span>
                        </button>
                      ))}
                      {!visibleReplies.length && <div className="px-2.5 py-3 text-[12px] text-cw-faint">No saved reply matches.</div>}
                      <div className="flex items-center gap-3.5 px-2.5 pb-1 pt-[7px]">
                        {[["↑↓", "move"], ["⏎", "insert"], ["⇧⏎", "insert + set status"]].map(([k, v]) => (
                          <span key={k} className="flex items-center gap-1.5">
                            <span className="rounded-[4px] border border-cw-border bg-cw-sidebar px-[5px] py-px font-mono text-[10px] text-cw-muted">{k}</span>
                            <span className="text-[11px] text-cw-faint">{v}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                    </span>
                    <span className="ml-auto font-mono text-[10.5px] text-cw-faint">⌘⏎ to send</span>
                    <button
                      onClick={() => void send()}
                      disabled={sending}
                      className="inline-flex h-9 cursor-pointer items-center rounded-[9px] border-none bg-cw-primary px-[15px] text-[13px] font-bold text-white"
                    >
                      {sending ? "Sending…" : "Send reply"}
                    </button>
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
