"use client";

// The thread. Ops messages white, developer replies tinted blue, system events
// one line with a dot — never mistakable for someone speaking. The footer
// restates which mode this is. Chats carry the presence strip: five states,
// each stated in words with a timestamp; at five minutes the strip offers
// filing it as a report, keeping everything already typed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "@/components/portal/Shell";
import BlockEditor, {
  AttachmentsPanel,
  newKey,
  paragraph,
  serializeLines,
  useAttachments,
  type EditorLine,
} from "@/components/help/BlockEditor";
import BlockRenderer, { type AttachmentMeta } from "@/components/help/BlockRenderer";
import { ContextGrid, StatusChip, TypeChip } from "@/components/help/chips";
import {
  DEVELOPER_NAME,
  ageOf,
  flushOutbox,
  helpApi,
  readOutbox,
  subscribeHelpStream,
  utcTime,
  writeOutbox,
  type OutboxItem,
} from "@/components/help/helpApi";
import {
  HELP_STATUS_META,
  helpThreadHasPresence,
  type HelpBlock,
  type HelpStatus,
  type HelpThread as Thread,
} from "@/lib/help/shared";

type Message = { id: string; author: "ops" | "developer"; authorName: string | null; blocks: HelpBlock[]; createdAt: string };
type Event = { id: string; kind: string; payload: Record<string, unknown>; actor: string | null; createdAt: string };

function initialsOf(name: string): string {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "??";
}

function eventText(e: Event): string {
  const p = e.payload as { from?: string; to?: string; reason?: string; reference?: string };
  switch (e.kind) {
    case "opened": return `${DEVELOPER_NAME} opened the report`;
    case "status_changed": {
      const from = HELP_STATUS_META[p.from as HelpStatus]?.label || p.from;
      const to = HELP_STATUS_META[p.to as HelpStatus]?.label || p.to;
      return `Status changed from ${from} to ${to}${p.reason ? ` — ${p.reason}` : ""}`;
    }
    case "joined": return `${DEVELOPER_NAME} joined the chat`;
    case "chat_closed": return `${DEVELOPER_NAME} closed the chat`;
    case "nudged": return "Nudge sent to Telegram";
    case "linked_report": return `Filed a linked report ${p.reference || ""}`;
    case "presence_changed": return `${DEVELOPER_NAME} is opening the chat`;
    default: return e.kind;
  }
}

function eventDot(e: Event): string {
  if (e.kind === "status_changed") return "#2563eb";
  if (e.kind === "joined") return "#16a34a";
  if (e.kind === "chat_closed") return "#9aa0a8";
  return "#c3c7ce";
}

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const label = `${d.getUTCDate()} ${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getUTCMonth()]}`;
  return d.toDateString() === today.toDateString() ? `TODAY · ${label}` : label;
};

// ── Presence strip (five states, timestamps over colour) ────────────────────

function PresenceStrip({ thread, onNudge, onFileReport }: { thread: Thread; onNudge: () => void; onFileReport: () => void }) {
  const at = thread.presenceAt ? utcTime(thread.presenceAt) : "";
  const cfg = {
    not_notified: { bg: "#fbfbfc", border: "#e6e7ea", dot: "#9aa0a8", title: "Not notified yet",
      sub: `Send your first message and ${DEVELOPER_NAME} gets a Telegram alert.`, tColor: "#17181c", sColor: "#6c7079", action: null as null | { label: string; onClick: () => void; primary?: boolean } },
    notified: { bg: "#fdf6ec", border: "#f3e0c4", dot: "#f59e0b", title: `${DEVELOPER_NAME} has been notified`,
      sub: `Telegram alert delivered ${at}. He has not opened the chat yet.`, tColor: "#8a4b09", sColor: "#8a5a23", action: { label: "Nudge again", onClick: onNudge } },
    joining: { bg: "#f2f7ff", border: "#dbe6ff", dot: "#2563eb", title: `${DEVELOPER_NAME} is opening the chat`,
      sub: `Opened Telegram ${at}. Usually a few seconds.`, tColor: "#1d4ed8", sColor: "#3a5170", action: null },
    present: { bg: "#e7f6ec", border: "#c7ead2", dot: "#16a34a", title: `${DEVELOPER_NAME} is here`,
      sub: `Joined ${at}. Replies are live from now on.`, tColor: "#15803d", sColor: "#3f6b4f", action: null },
    no_answer: { bg: "#f5f6f7", border: "#e6e7ea", dot: "#9aa0a8", title: "No answer for five minutes",
      sub: "He may be away from his phone. Filing this as a report keeps everything you wrote.", tColor: "#17181c", sColor: "#6c7079",
      action: { label: "File as report", onClick: onFileReport, primary: true } },
    none: null,
  }[thread.presence];
  if (!cfg) return null;
  return (
    <div className="flex items-center gap-[11px] rounded-[11px] border px-3.5 py-3" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: cfg.dot }} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-bold" style={{ color: cfg.tColor }}>{cfg.title}</span>
        <span className="text-[12.5px] leading-[1.45]" style={{ color: cfg.sColor }}>{cfg.sub}</span>
      </div>
      {cfg.action && (
        <button
          onClick={cfg.action.onClick}
          className="inline-flex h-[34px] flex-none cursor-pointer items-center rounded-[9px] border px-3 text-[12.5px] font-bold"
          style={cfg.action.primary ? { background: "#2563eb", borderColor: "#2563eb", color: "#fff" } : { background: "#fff", borderColor: cfg.border, color: cfg.tColor }}
        >
          {cfg.action.label}
        </button>
      )}
    </div>
  );
}

// ── The thread page ─────────────────────────────────────────────────────────

export default function HelpThread({ reference }: { reference: string }) {
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof helpApi.getThread>> | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lines, setLines] = useState<EditorLine[]>([paragraph()]);
  const [offline, setOffline] = useState(false);
  const [failedItems, setFailedItems] = useState<OutboxItem[]>([]);
  const atts = useAttachments();
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef<string | null>(null);

  const load = useCallback(() => {
    helpApi
      .getThread(reference)
      .then((d) => {
        setData(d);
        threadIdRef.current = d.thread.id;
        helpApi.markRead(d.thread.id);
        setFailedItems(readOutbox().filter((i) => i.threadId === d.thread.id && i.lastError));
      })
      .catch(() => setNotFound(true));
  }, [reference]);

  useEffect(load, [load]);

  useEffect(() => {
    const unsub = subscribeHelpStream((e) => {
      if (e.threadId === threadIdRef.current) load();
    });
    const onOnline = () => {
      setOffline(false);
      if (threadIdRef.current) flushOutbox(threadIdRef.current).then(({ sent }) => sent && load());
    };
    const onOffline = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { unsub(); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [data?.messages.length, data?.events.length]);

  const attachmentMap = useMemo(() => {
    const m = new Map<string, AttachmentMeta>();
    for (const a of data?.attachments || []) m.set(a.id, a);
    return m;
  }, [data?.attachments]);

  const timeline = useMemo(() => {
    if (!data) return [];
    const items: Array<{ at: string; kind: "msg" | "event"; msg?: Message; event?: Event }> = [
      ...data.messages.map((m) => ({ at: m.createdAt, kind: "msg" as const, msg: m })),
      ...data.events.map((e) => ({ at: e.createdAt, kind: "event" as const, event: e })),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [data]);

  async function send() {
    if (!data) return;
    const blocks = serializeLines(lines);
    for (const id of atts.attachedIds) blocks.push({ type: "attachment", id });
    if (!blocks.length) return;
    const clientKey = newKey();
    const item: OutboxItem = { clientKey, threadId: data.thread.id, blocks, attachmentIds: atts.attachedIds, queuedAt: new Date().toISOString() };

    setLines([paragraph()]);
    atts.reset();

    if (offline) {
      // Saved on the device; sends itself when the connection returns.
      writeOutbox([...readOutbox(), item]);
      return;
    }
    try {
      await helpApi.sendMessage(data.thread.id, { blocks, attachmentIds: item.attachmentIds, clientKey });
      load();
    } catch (error) {
      const err = error as Error & { status?: number; body?: { closed?: boolean } };
      if (err.body?.closed) { load(); return; }
      item.lastTriedAt = new Date().toISOString();
      item.lastError = err.message === "network" || err.message?.includes("fetch") ? "network" : err.message || "refused";
      writeOutbox([...readOutbox(), item]);
      setFailedItems(readOutbox().filter((i) => i.threadId === data.thread.id && i.lastError));
    }
  }

  function retryFailed(item: OutboxItem) {
    const rest = readOutbox().filter((i) => i.clientKey !== item.clientKey);
    writeOutbox(rest);
    setFailedItems(rest.filter((i) => i.threadId === item.threadId && i.lastError));
    helpApi
      .sendMessage(item.threadId, { blocks: item.blocks, attachmentIds: item.attachmentIds, clientKey: item.clientKey })
      .then(() => load())
      .catch(() => {
        writeOutbox([...readOutbox(), { ...item, lastTriedAt: new Date().toISOString() }]);
        setFailedItems(readOutbox().filter((i) => i.threadId === item.threadId && i.lastError));
      });
  }

  function copyText(item: OutboxItem) {
    const text = item.blocks.map((b) => ("text" in b ? b.text : "items" in b ? b.items.map((x) => (typeof x === "string" ? x : x.text)).join("\n") : "")).join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function fileAsReport() {
    if (!data) return;
    // Keeps everything already typed: draft the chat's content into a bug report.
    const blocks = [
      ...data.messages.filter((m) => m.author === "ops").flatMap((m) => m.blocks),
      ...serializeLines(lines),
    ].filter((b) => b.type !== "attachment");
    try { localStorage.setItem("help-draft:bug", JSON.stringify({ title: data.thread.title, blocks, ts: Date.now() })); } catch { /* fine */ }
    router.push(`/help/new?type=bug&from=${data.thread.reference}`);
  }

  if (notFound) {
    return (
      <PortalShell crumb="Help" title="">
        <div className="mx-auto max-w-[640px] px-[30px] pt-10">
          <div className="rounded-[13px] border border-cw-border bg-white p-6 text-[13.5px] text-cw-muted">
            This thread does not exist, or it is not yours.
          </div>
        </div>
      </PortalShell>
    );
  }

  if (!data) {
    return (
      <PortalShell crumb="Help" title="">
        <div className="mx-auto max-w-[860px] px-[30px] pt-8">
          <div className="flex flex-col gap-[9px] rounded-[13px] border border-cw-border bg-white px-3.5 py-[13px]">
            <div className="h-3 w-[110px] rounded bg-[#f1f2f4]" />
            <div className="h-3 w-full rounded bg-cw-sidebar" />
            <div className="h-3 w-2/3 rounded bg-cw-sidebar" />
          </div>
        </div>
      </PortalShell>
    );
  }

  const { thread, closed, viewer } = data;
  const isChat = helpThreadHasPresence(thread.type);
  const lastOpsMsg = [...data.messages].reverse().find((m) => m.author === "ops");
  const devReadAt = thread.devLastReadAt ? Date.parse(thread.devLastReadAt) : 0;
  const statusMeta = HELP_STATUS_META[thread.status];

  return (
    <PortalShell crumb="Help" title="" wide>
      <div className="mx-auto flex h-[calc(100vh-120px)] max-w-[900px] flex-col px-[30px]">
        <div
          className="flex flex-none items-center gap-3 rounded-t-[16px] border border-cw-border bg-white px-6 py-3.5"
          style={thread.type === "urgent" ? { background: "#fdf2f2", borderColor: "#f0c9ca" } : isChat ? { background: "#f7fdf9" } : undefined}
        >
          <button onClick={() => router.push("/help")} className="flex h-[34px] w-[34px] flex-none cursor-pointer items-center justify-center rounded-[9px] border border-cw-border bg-white text-[15px] text-cw-body">←</button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-[9px]">
              <span className="truncate text-[16px] font-extrabold tracking-[-0.015em] text-cw-ink">{thread.title}</span>
              <TypeChip type={thread.type} size={20} />
            </div>
            <span className="font-mono text-[11.5px] text-cw-faint">
              {thread.reference} · filed {utcTime(thread.createdAt)} {ageOf(thread.createdAt) === "just now" ? "today" : `· ${ageOf(thread.createdAt)}`}
            </span>
          </div>
          <div className="flex flex-none items-center gap-2 rounded-[10px] border px-3 py-[7px]" style={{ background: statusMeta.bg, borderColor: statusMeta.border }}>
            <span className="h-2 w-2 rounded-full" style={{ background: statusMeta.dot }} />
            <span className="font-mono text-[10.5px] font-extrabold tracking-[0.06em]" style={{ color: statusMeta.color }}>{statusMeta.chip}</span>
          </div>
        </div>

        <div ref={scrollRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto border-x border-cw-border bg-cw-page px-6 py-5">
          {isChat && viewer === "ops" && thread.status !== "done" && (
            <PresenceStrip
              thread={thread}
              onNudge={() => helpApi.presence(thread.id, "nudge").then(load).catch(() => {})}
              onFileReport={fileAsReport}
            />
          )}

          {timeline.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-cw-border" />
              <span className="font-mono text-[10.5px] font-semibold tracking-[0.07em] text-cw-faint">{dayLabel(timeline[0].at)}</span>
              <span className="h-px flex-1 bg-cw-border" />
            </div>
          )}

          {timeline.map((item, i) => {
            if (item.kind === "event") {
              const e = item.event!;
              return (
                <div key={e.id} className="flex items-center gap-2.5 pl-[46px]">
                  <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: eventDot(e) }} />
                  <span className="text-[12.5px] text-cw-muted">{eventText(e)}</span>
                  <span className="font-mono text-[11px] text-[#c3c7ce]">{utcTime(e.createdAt)}</span>
                  <span className="h-px flex-1 bg-cw-borderInner" />
                </div>
              );
            }
            const m = item.msg!;
            const mine = (viewer === "ops") === (m.author === "ops");
            const isDev = m.author === "developer";
            const isFirstOpsMessage = m.author === "ops" && !timeline.slice(0, i).some((x) => x.kind === "msg" && x.msg!.author === "ops");
            return (
              <div key={m.id} className="flex gap-3">
                <span
                  className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full font-mono text-[11.5px] font-bold"
                  style={isDev ? { background: "#17181c", color: "#fff" } : { background: "#e8effe", color: "#1d4ed8" }}
                >
                  {initialsOf(m.authorName || (isDev ? DEVELOPER_NAME : "You"))}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
                  <div className="flex items-baseline gap-[9px]">
                    <span className="text-[13.5px] font-bold text-cw-ink">{mine ? "You" : m.authorName || (isDev ? DEVELOPER_NAME : "Ops")}</span>
                    {isDev && (
                      <span className="inline-flex h-[18px] items-center rounded-[4px] bg-cw-sidebar px-1.5 text-[10px] font-bold tracking-[0.05em] text-cw-muted">DEVELOPER</span>
                    )}
                    <span className="font-mono text-[11px] text-cw-faint">{utcTime(m.createdAt)}</span>
                  </div>
                  <div
                    className="rounded-[13px] border px-4 py-[15px]"
                    style={isDev ? { background: "#f2f7ff", borderColor: "#dbe6ff" } : { background: "#fff", borderColor: "#e6e7ea" }}
                  >
                    <BlockRenderer blocks={m.blocks} attachments={attachmentMap} />
                    {isFirstOpsMessage && Object.keys(thread.context || {}).length > 0 && (
                      <CollapsedContext context={thread.context} />
                    )}
                  </div>
                  {viewer === "ops" && m.author === "ops" && lastOpsMsg?.id === m.id && devReadAt >= Date.parse(m.createdAt) && (
                    <span className="pl-0.5 text-[11.5px] text-cw-faint">Read {utcTime(thread.devLastReadAt!)}</span>
                  )}
                </div>
              </div>
            );
          })}

          {failedItems.map((item) => (
            <div key={item.clientKey} className="ml-[46px] flex flex-col gap-[9px] rounded-[12px] border border-[#f0c9ca] bg-[#fdf2f2] px-3.5 py-[13px]">
              <div className="flex items-center gap-2">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-cw-red text-[11px] font-extrabold text-white">!</span>
                <span className="text-[13px] font-bold text-[#b42318]">Not delivered</span>
              </div>
              <span className="text-[12.5px] leading-normal text-[#8b3a3a]">
                Sent {utcTime(item.queuedAt)}, refused by the server at {utcTime(item.lastTriedAt || item.queuedAt)}. {DEVELOPER_NAME} has not seen this.
              </span>
              <div className="flex gap-2">
                <button onClick={() => retryFailed(item)} className="inline-flex h-[34px] cursor-pointer items-center rounded-[8px] border-none bg-cw-red px-3 text-[12.5px] font-bold text-white">Send again</button>
                <button onClick={() => copyText(item)} className="inline-flex h-[34px] cursor-pointer items-center rounded-[8px] border border-[#f0c9ca] bg-white px-3 text-[12.5px] font-bold text-[#b42318]">Copy text</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-none flex-col gap-[11px] rounded-b-[16px] border border-t-0 border-cw-border bg-white px-6 pb-[18px] pt-3.5">
          {offline && (
            <div className="flex flex-col gap-1 rounded-[12px] border border-[#f3e0c4] bg-[#fdf6ec] px-3.5 py-[13px]">
              <span className="text-[13px] font-bold text-[#8a4b09]">You are offline</span>
              <span className="text-[12.5px] leading-normal text-[#8a5a23]">The reply is saved on this device. It will send by itself when the connection returns.</span>
            </div>
          )}
          {closed ? (
            <div className="flex items-center gap-3 rounded-[12px] border border-cw-border bg-cw-page px-3.5 py-3">
              <span className="flex-1 text-[12.5px] text-cw-muted">
                This thread was closed 48 hours after it was marked Done. Reopening files a linked report — everything here stays.
              </span>
              <button
                onClick={fileAsReport}
                className="inline-flex h-[34px] flex-none cursor-pointer items-center rounded-[9px] border-none bg-cw-primary px-3 text-[12.5px] font-bold text-white"
              >
                File a linked report
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-[12px] border border-cw-border bg-cw-page px-4 py-3">
                <BlockEditor lines={lines} onChange={setLines} atts={atts} screenUrl={String(thread.context.page || "/")} compact placeholder="Reply — / for commands" />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={send}
                    className="inline-flex h-9 cursor-pointer items-center rounded-[9px] border-none bg-cw-primary px-[15px] text-[13px] font-bold text-white"
                  >
                    Send
                  </button>
                </div>
              </div>
              <AttachmentsPanel atts={atts} compact />
              {viewer === "ops" && (
                <div className="flex items-center gap-2.5">
                  <span className="flex-1 text-[12.5px] text-cw-faint">
                    {isChat
                      ? thread.presence === "present"
                        ? `This is a live chat. ${DEVELOPER_NAME} is here.`
                        : `This is a live chat. ${DEVELOPER_NAME} sees it in Telegram.`
                      : `This is a report, not a live chat. ${DEVELOPER_NAME} replies when he picks it up.`}
                  </span>
                  {!isChat && (
                    <button
                      onClick={() => router.push(`/help/new?type=chat&page=${encodeURIComponent(String(thread.context.page || ""))}`)}
                      className="inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-[9px] border border-[#c7ead2] bg-[#e7f6ec] px-3 text-[12.5px] font-bold text-[#15803d]"
                    >
                      <span className="h-[7px] w-[7px] rounded-full bg-cw-green" />
                      Ask him to come live
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

function CollapsedContext({ context }: { context: Thread["context"] }) {
  const [open, setOpen] = useState(false);
  const count = Object.values(context).filter(Boolean).length;
  return (
    <div className="mt-3 border-t border-cw-borderInner pt-2.5">
      <div className="flex items-center gap-[9px]">
        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px] bg-[#f1f2f4] text-[10px] text-cw-muted">⚙</span>
        <span className="flex-1 text-[12.5px] text-cw-faint">{count} technical details attached automatically</span>
        <button onClick={() => setOpen((v) => !v)} className="cursor-pointer border-none bg-transparent text-[12.5px] font-bold text-cw-primary">
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && <div className="pt-3"><ContextGrid context={context} /></div>}
    </div>
  );
}
