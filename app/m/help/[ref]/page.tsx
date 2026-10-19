"use client";

// One help thread on a phone: the messages as plain text, newest at the bottom, and a reply box. A developer reading
// it in the Inbox gets the status switch too (portal.help.answer); the same thread page serves both.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { PickSheet } from "@/components/m/pick";
import { MButton, MError, MSkeleton } from "@/components/m/ui";
import { Badge } from "@/components/m/tier2";
import { helpApi } from "@/components/help/helpApi";
import { HELP_STATUSES, type HelpBlock, type HelpStatus, type HelpThread } from "@/lib/help/shared";
import { STATUS, TYPE, blockLines } from "@/lib/m/help";
import { dayTime, hmZ, useAction } from "@/lib/m/t2";
import { shownText } from "@/lib/error-text";

type Loaded = { thread: HelpThread; closed: boolean; messages: Array<{ id: string; author: "ops" | "developer"; authorName: string | null; blocks: HelpBlock[]; createdAt: string }>; attachments: Array<{ id: string; name: string; size: number; mime: string; isImage: boolean }>; viewer: "ops" | "developer" };

export default function HelpThreadPhonePage() {
  const { ref } = useParams<{ ref: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState(false);
  const act = useAction("Couldn’t send that. Try again.");
  const load = useMemo(() => async () => { try { const d = await helpApi.getThread(String(ref)); setData(d); setError(null); void helpApi.markRead(d.thread.id); } catch (e) { setError(shownText(e, "The portal did not answer.")); } }, [ref]);
  useEffect(() => { void load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [load]);
  const t = data?.thread;
  usePhonePage({ title: t?.title ?? "Thread", subtitle: t ? `${t.reference} · ${TYPE[t.type] ?? t.type}` : null, monoSubtitle: true, back: data?.viewer === "developer" ? "/m/inbox" : "/m/help", tab: "more", tabs: false, actions: data?.viewer === "developer" ? [{ icon: "flag", label: "Change status", onClick: () => setStatus(true) }] : [] });
  const send = () => act.run("send", async () => { if (!t) return; await helpApi.sendMessage(t.id, { blocks: [{ type: "paragraph", text: text.trim() }], attachmentIds: [] }); setText(""); await load(); });
  const setSt = (s: HelpStatus) => act.run("status", async () => { if (!t) return; await helpApi.setStatus(t.id, s); setStatus(false); await load(); });
  if (error && !data) return <MError title="Couldn’t open the thread" onRetry={load}>{error}</MError>;
  if (!data || !t) return <MSkeleton kind="rows" count={5} label="Loading the thread" />;
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-cw-text-muted"><Badge tone={STATUS[t.status]?.tone ?? "neutral"}>{STATUS[t.status]?.label ?? t.status}</Badge>{t.statusReason && <span>{t.statusReason}</span>}<span className="ml-auto">Opened {dayTime(t.createdAt)}</span></div>
        {error && <MError stale title="Not updating." onRetry={load}>{error}</MError>}
        {data.messages.map((m) => { const mine = m.author === data.viewer; return (
          <div key={m.id} className={`flex max-w-[92%] flex-col gap-1 rounded-[14px] px-3.5 py-2.5 ${mine ? "self-end bg-cw-primary-tint" : "self-start border border-cw-border bg-cw-bg-surface"}`}>
            <span className="text-[12px] font-semibold text-cw-text-muted">{m.authorName || (m.author === "developer" ? "Developer" : "Ops")} · {hmZ(m.createdAt)}</span>
            {m.blocks.flatMap((b) => blockLines(b, data.attachments)).map((l, i) => l.kind === "heading" ? <span key={i} className="text-[15px] font-bold">{l.text}</span> : l.kind === "mono" ? <pre key={i} className="m-0 whitespace-pre-wrap break-words font-mono text-[13px]">{l.text}</pre> : l.kind === "attachment" ? <span key={i} className="text-[13.5px] text-cw-text-link">📎 {l.text} · open on a desk</span> : <span key={i} className="whitespace-pre-wrap text-[15px] leading-normal">{l.text}</span>)}
          </div>
        ); })}
        {data.closed && <span className="text-center text-[13px] text-cw-text-muted">This thread is closed. Ask again from Help & support if it comes back.</span>}
      </div>
      {!data.closed && (
        <div className="sticky bottom-0 z-[5] flex flex-col gap-2 border-t border-cw-border bg-cw-bg-page px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          {act.failed && <span role="alert" className="text-[13.5px] text-cw-danger-text">{act.failed}</span>}
          <div className="flex items-end gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a reply" className="min-h-12 flex-1 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3.5 py-3 text-[16px] leading-normal text-cw-text outline-none focus:border-cw-focus" />
            <MButton kind="primary" size="sm" icon="send" ariaLabel="Send" disabled={!text.trim() || act.busy !== null} onClick={() => void send()}>{act.busy === "send" ? "…" : "Send"}</MButton>
          </div>
        </div>
      )}
      <PickSheet open={status} onClose={() => setStatus(false)} title="Status" options={HELP_STATUSES.map((s) => ({ value: s, label: STATUS[s].label }))} value={t.status} onPick={(s) => void setSt(s)} busy={act.busy === "status"} />
    </div>
  );
}
