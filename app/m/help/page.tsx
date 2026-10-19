"use client";

// Help & support on a phone (Tier 2 › list): get an answer or ask a person. Your threads as a list, newest first,
// with their status; Ask a person is a full-screen form that creates a thread (portal.help.ask) with the same
// client context the desk sends. Screenshots and drawings are attached on a desk.
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MButton, MError } from "@/components/m/ui";
import { T2Groups, T2Page } from "@/components/m/tier2";
import { collectClientContext, helpApi } from "@/components/help/helpApi";
import { HELP_THREAD_TYPES, type HelpThread, type HelpThreadType } from "@/lib/help/shared";
import { STATUS, TYPE } from "@/lib/m/help";
import { ago, useAction, useResource } from "@/lib/m/t2";

type Row = HelpThread & { preview?: string; unread?: number };

export default function HelpPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const asking = search.get("new") === "1";
  const r = useResource<{ threads?: Row[] }>("/api/help/threads", { poll: 30_000, fallback: "The portal did not answer." });
  const act = useAction("Couldn’t send that. Try again.");
  const [draft, setDraft] = useState<{ type: HelpThreadType; title: string; text: string }>({ type: "question", title: "", text: "" });
  const threads = useMemo(() => (r.data?.threads ?? []).slice().sort((a, b) => (b.lastMessageAt ?? b.createdAt ?? "").localeCompare(a.lastMessageAt ?? a.createdAt ?? "")), [r.data]);
  usePhonePage({ title: asking ? "Ask a person" : "Help & support", subtitle: asking ? "Answered by the developer" : threads.length ? `${threads.filter((t) => t.status === "untouched" || t.status === "under_process").length} open` : null, back: asking ? () => router.replace("/m/help") : null, tab: "more", tabs: !asking });
  const send = () => act.run("create", async () => {
    const { thread } = await helpApi.createThread({ type: draft.type, title: draft.title.trim(), blocks: [{ type: "paragraph", text: draft.text.trim() }], attachmentIds: [], context: collectClientContext("/m/help"), clientKey: `m-${Date.now().toString(36)}` });
    setDraft({ type: "question", title: "", text: "" }); router.replace(`/m/help/${encodeURIComponent(thread.reference)}`);
  });
  const open = threads.filter((t) => t.status === "untouched" || t.status === "under_process"), closed = threads.filter((t) => t.status === "done" || t.status === "impossible");
  const row = (t: Row) => ({ key: t.id, title: t.title, sub: `${TYPE[t.type] ?? t.type} · ${t.reference}${t.preview ? ` · ${t.preview}` : ""}`, meta: ago(t.lastMessageAt ?? t.createdAt), badge: t.unread ? [`${t.unread} new`, "info"] as const : [STATUS[t.status]?.label ?? t.status, STATUS[t.status]?.tone ?? "neutral"] as const, href: `/m/help/${encodeURIComponent(t.reference)}` });

  if (asking) return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-4">
        {act.failed && <MError title="Not sent." icon="life-buoy" onRetry={act.clear}>{act.failed}</MError>}
        <div role="radiogroup" aria-label="What kind" className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {HELP_THREAD_TYPES.filter((t) => t !== "chat").map((t) => { const on = draft.type === t; return <button key={t} type="button" role="radio" aria-checked={on} onClick={() => setDraft((d) => ({ ...d, type: t }))} className={`inline-flex h-11 flex-none items-center rounded-[22px] border px-3.5 text-[14px] font-semibold ${on ? "border-cw-text bg-cw-text text-cw-bg-page" : "border-cw-border-control bg-cw-bg-surface text-cw-text-body"}`}>{TYPE[t]}</button>; })}
        </div>
        <label className="flex flex-col gap-1.5"><span className="text-[12.5px] font-semibold text-cw-text-muted">In one line</span>
          <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder={draft.type === "bug" ? "What went wrong, where" : "What you need"} className="h-12 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3.5 text-[16px] text-cw-text outline-none focus:border-cw-focus focus:shadow-[0_0_0_3px_var(--cw-focus-halo)]" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-[12.5px] font-semibold text-cw-text-muted">The details</span>
          <textarea value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} rows={7} placeholder={draft.type === "bug" ? "What you did, what you expected, what you saw. The time and the flight help." : "As much as helps."} className="rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3.5 py-3 text-[16px] leading-normal text-cw-text outline-none focus:border-cw-focus focus:shadow-[0_0_0_3px_var(--cw-focus-halo)]" /></label>
        <span className="text-[13px] leading-normal text-cw-text-muted">Your name, this page and the time go with it. Screenshots are attached on a desk.{draft.type === "urgent" ? " Urgent wakes the developer." : ""}</span>
      </div>
      <div className="sticky bottom-0 z-[5] border-t border-cw-border bg-cw-bg-page px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3"><MButton kind="primary" icon="send" className="w-full" disabled={!draft.title.trim() || !draft.text.trim() || act.busy !== null} onClick={() => void send()}>{act.busy ? "Sending…" : "Send"}</MButton></div>
    </div>
  );
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={threads.length === 0} emptyCopy={["No questions yet", "Ask a person: a bug, a request or a question. The guide is under More › Guide."]} errorCopy={["Couldn’t load your threads", "You can still ask a person."]} onRetry={r.reload}
      sticky={<MButton kind="primary" icon="message-circle" href="/m/help?new=1">Ask a person</MButton>}>
      <T2Groups groups={[{ h: "OPEN", count: open.length, rows: open.map(row) }, { h: "ANSWERED", count: closed.length, rows: closed.map(row) }]} />
    </T2Page>
  );
}
