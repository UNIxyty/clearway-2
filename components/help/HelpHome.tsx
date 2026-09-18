"use client";

// Help & support home: five routes (urgent separated by weight and colour —
// the only one that states a response time), with history BESIDE the picker,
// not behind a tab, so "did anyone answer me" is answered before it is asked.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PortalShell from "@/components/portal/Shell";
import { StatusChip } from "@/components/help/chips";
import {
  DEVELOPER_NAME,
  OUT_OF_HOURS_PHONE,
  ageOf,
  developerAvailableNow,
  helpApi,
  subscribeHelpStream,
  utcTime,
  type ThreadWithMeta,
} from "@/components/help/helpApi";
import { HELP_TYPE_META } from "@/lib/help/shared";

const SCENARIOS: Array<{ type: string; glyph: string; title: string; sub: string }> = [
  { type: "bug", glyph: "⌗", title: "Something is broken", sub: "A bug report. We will ask which screen and what you expected." },
  { type: "request", glyph: "✎", title: "I have a suggestion", sub: "A change you would like. Filed for the next planning round." },
  { type: "question", glyph: "?", title: "How do I…", sub: "The guide answers most of these. We will search it first." },
  { type: "chat", glyph: "⌯", title: "Chat with the developer", sub: "Live conversation. They are notified the moment you open it." },
];

export default function HelpHome() {
  const router = useRouter();
  const params = useSearchParams();
  const [threads, setThreads] = useState<ThreadWithMeta[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fromPage = params.get("page") || "";

  useEffect(() => {
    let alive = true;
    const load = () => helpApi.listThreads().then((d) => alive && setThreads(d.threads)).catch(() => alive && setThreads([]));
    load();
    const unsub = subscribeHelpStream(() => load());
    return () => { alive = false; unsub(); };
  }, []);

  const compose = (type: string) =>
    router.push(`/help/new?type=${type}${fromPage ? `&page=${encodeURIComponent(fromPage)}` : ""}`);

  const available = developerAvailableNow();
  const visible = threads ? (showAll ? threads : threads.slice(0, 4)) : null;

  return (
    <PortalShell crumb="Help" title="" wide>
      <div className="mx-auto max-w-[1100px] px-[30px] pb-12">
        <div className="flex items-start gap-5 border-b border-cw-border bg-white px-0 pb-5 pt-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <h1 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] text-cw-ink">Help &amp; support</h1>
            <span className="text-[14px] text-cw-muted">
              Reports go to the developer who builds Clearway. They are read between 06:00 and 22:00Z.
            </span>
          </div>
          <div className="flex flex-none items-center gap-[9px] rounded-[11px] border border-cw-border bg-cw-page px-[13px] py-[9px]">
            <span className="h-[9px] w-[9px] rounded-full" style={{ background: available ? "#16a34a" : "#9aa0a8" }} />
            <div className="flex flex-col gap-px">
              <span className="text-[12.5px] font-bold text-cw-ink">{available ? "Developer available" : "Outside reading hours"}</span>
              <span className="font-mono text-[11px] text-cw-faint">{available ? `reads until 22:00Z · now ${utcTime()}` : `reads again from 06:00Z`}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 pt-6 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.11em] text-cw-faint">WHAT DO YOU NEED?</span>

            <button
              onClick={() => compose("urgent")}
              className="flex cursor-pointer items-center gap-4 rounded-[14px] border border-[#f0c9ca] bg-white px-5 py-[18px] text-left"
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] border border-[#f0c9ca] bg-[#fdf2f2] text-[20px] font-extrabold text-cw-red">!</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-[9px]">
                  <span className="text-[16px] font-bold tracking-[-0.01em] text-cw-ink">Something is blocking ops right now</span>
                  <span className="inline-flex h-5 items-center rounded-[5px] border border-[#f0c9ca] bg-[#fdf2f2] px-[7px] font-mono text-[9.5px] font-extrabold tracking-[0.07em] text-[#b42318]">URGENT</span>
                </span>
                <span className="text-[13.5px] leading-normal text-cw-muted">
                  Pings the developer in Telegram the moment you send. Typically answered in under 25 minutes between
                  06:00 and 22:00Z — outside those hours call {OUT_OF_HOURS_PHONE}.
                </span>
              </span>
              <span className="inline-flex h-10 flex-none items-center rounded-[10px] bg-cw-red px-4 text-[13.5px] font-bold text-white">Report it</span>
            </button>

            {SCENARIOS.map((s) => {
              const meta = HELP_TYPE_META[s.type as keyof typeof HELP_TYPE_META];
              return (
                <button
                  key={s.type}
                  onClick={() => compose(s.type)}
                  className="flex cursor-pointer items-center gap-4 rounded-[14px] border border-cw-border bg-white px-5 py-4 text-left hover:bg-cw-page"
                >
                  <span
                    className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] border text-[17px]"
                    style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
                  >
                    {s.glyph}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-[15px] font-bold tracking-[-0.01em] text-cw-ink">{s.title}</span>
                    <span className="text-[13.5px] leading-normal text-cw-muted">{s.sub}</span>
                  </span>
                  <span className="flex-none text-[17px] text-[#c3c7ce]">›</span>
                </button>
              );
            })}
          </div>

          <div className="flex w-full flex-none flex-col gap-3.5 lg:w-[320px]">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.11em] text-cw-faint">YOUR HISTORY</span>

            {visible === null &&
              [0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-[9px] rounded-[13px] border border-cw-border bg-white px-3.5 py-[13px]">
                  <div className="h-3 w-[110px] rounded bg-[#f1f2f4]" />
                  <div className="h-3 w-full rounded bg-cw-sidebar" />
                  <div className="h-3 w-2/3 rounded bg-cw-sidebar" />
                </div>
              ))}

            {visible !== null && visible.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-[12px] border border-cw-border bg-white p-4 text-center">
                <span className="text-[14px] font-bold text-cw-ink">Nothing filed yet</span>
                <span className="text-[12.5px] leading-normal text-cw-muted">
                  Your reports and chats will collect here so you can check back on them.
                </span>
              </div>
            )}

            {visible?.map((t) => (
              <Link
                key={t.id}
                href={`/help/${t.reference}`}
                className="flex flex-col gap-2 rounded-[13px] border border-cw-border bg-white px-3.5 py-[13px] no-underline hover:bg-cw-page"
              >
                <div className="flex items-center gap-2">
                  <StatusChip status={t.status} />
                  <span className="font-mono text-[10.5px] text-cw-faint">{t.reference}</span>
                  <span className="ml-auto text-[11.5px] text-cw-faint">{ageOf(t.lastMessageAt)}</span>
                </div>
                <span className="text-[13.5px] font-bold leading-[1.4] text-cw-ink">{t.title}</span>
                <span
                  className="text-[12px]"
                  style={t.unread > 0 ? { color: "#2563eb", fontWeight: 700 } : { color: "#9aa0a8" }}
                >
                  {t.unread > 0
                    ? `${t.unread} new ${t.unread === 1 ? "reply" : "replies"}`
                    : t.status === "untouched"
                      ? `${HELP_TYPE_META[t.type].label} · not read yet`
                      : t.status === "impossible"
                        ? "Answered with a reason"
                        : t.status === "done"
                          ? "Closed by the developer"
                          : t.preview}
                </span>
              </Link>
            ))}

            {threads && threads.length > 4 && !showAll && (
              <button onClick={() => setShowAll(true)} className="cursor-pointer border-none bg-transparent pl-0.5 text-left text-[13px] font-bold text-cw-primary">
                All {threads.length} reports and chats →
              </button>
            )}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
