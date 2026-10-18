"use client";

// The Ops Agent on a phone (mobile-portal-spec.md › Tier 1 › Ops Agent): ask one quick question, or confirm what the
// agent drafted. The same thread (useThread), the same replies, cards and drafted-action confirmations
// (AgentReply → ConfirmationCard), the same composer with attach and voice — in the phone's layout: the answer leads,
// the composer is sticky with a 48 px mic. Nothing changes data until the person confirms it, as everywhere.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { MButton, MError } from "@/components/m/ui";
import { useIdentity } from "@/components/portal/Shell";
import { useThread } from "@/components/agent/useThread";
import AgentStyles from "@/components/agent/ui/AgentStyles";
import Composer from "@/components/agent/thread/Composer";
import { AgentReply, UserBubble } from "@/components/agent/thread/Message";
import { ContextChip, SuggestedQuestions, suggestionsFor, useLiveSuggestions } from "@/components/agent/thread/ContextChip";
import { OfflineCard } from "@/components/agent/thread/ErrorCard";
import type { AgentContext } from "@/components/agent/types";
import { hm as hmZ } from "@/components/agent/intake/intake-shared";

function contextFrom(params: URLSearchParams): AgentContext | null {
  const icao = params.get("icao"), flight = params.get("flight");
  if (icao) return { kind: "airport", label: icao.toUpperCase(), icao: icao.toUpperCase(), icon: "map-pin" };
  if (flight) return { kind: "flight", label: flight, flightId: flight, icon: "plane" };
  return { kind: "wall", label: "the Wall", icon: "monitor" };
}

export default function AgentPhonePage() {
  const params = useSearchParams();
  const { initials, hasAgent, agentKnown } = useIdentity();
  const context = useMemo(() => contextFrom(params), [params]);
  const t = useThread({ context, initialConversationId: params.get("t"), initials });
  const live = useLiveSuggestions(context);
  const empty = useMemo(() => suggestionsFor(context, live), [context, live]);
  const [history, setHistory] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const hasThread = t.messages.length > 0 || t.loadingThread;
  usePhonePage({ title: hasThread ? (t.title ?? "Ops Agent") : "Ops Agent", subtitle: hasThread && context ? `Asking about ${context.label}` : null, tab: "agent", back: hasThread ? () => { t.newThread(); setHistory(false); } : null,
    actions: [{ icon: "history", label: "Recent threads", onClick: () => { setHistory((v) => !v); if (!t.conversations) void t.loadHistory(); } }] });
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [t.messages, t.activity]);

  if (agentKnown && !hasAgent) return <MError title="The Ops Agent is not available to you" icon="bot">Ask an admin for access. Everything else on the phone works without it.</MError>;
  const composerLocked = t.pendingConfirmation ? "Confirm or cancel the drafted action first." : null;

  return (
    <div className="flex min-h-full flex-col">
      <AgentStyles />
      {/* The shared composer's icon buttons are 30–36 px on a desk; on a phone every target is 44 px. The keyboard hint for
          voice (⌥⇧ Space) means nothing on a phone and is hidden. The context chip's small × keeps its footprint (negative
          margins) while its hit box grows. */}
      <style>{`[data-phone-shell] [data-cw-agent-composer] button{min-width:44px!important;min-height:44px!important}[data-phone-shell] [data-cw-agent-composer] span[style*="flex: 1"]+span{display:none!important}[data-phone-shell] button[aria-label="Clear context"]{width:44px!important;height:44px!important;margin:-13px!important;background:transparent!important}`}</style>
      {history ? (
        <div className="flex flex-col px-4 pb-6 pt-3.5">
          <span className="pb-1 text-[12px] font-bold tracking-[.06em] text-cw-text-muted">RECENT THREADS</span>
          {t.conversations === null && <span className="py-3 text-[14px] text-cw-text-muted">Loading…</span>}
          {t.conversations?.length === 0 && <span className="py-3 text-[14px] text-cw-text-muted">No earlier conversations.</span>}
          {(t.conversations ?? []).map((c) => (
            <button key={c.id} type="button" onClick={() => { void t.openConversation(c.id); setHistory(false); }} className="flex min-h-12 items-center gap-2.5 border-b border-cw-divider text-left">
              <MaskIcon name="message-square" size={16} color="var(--cw-text-muted)" className="flex-none" /><span className="min-w-0 flex-1 truncate text-[15px] text-cw-text">{c.title}</span><span className="font-mono text-[12.5px] text-cw-text-muted">{hmZ(c.lastMessageAt)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div ref={bodyRef} className="flex flex-1 flex-col gap-3.5 px-4 pb-4 pt-4">
          {!hasThread && (
            <>
              <div className="flex flex-col gap-1.5 pt-2"><span className="text-[24px] font-extrabold tracking-[-.02em]">What do you need?</span><span className="text-[15px] leading-normal text-cw-text-body">{empty.sub}</span></div>
              <ContextChip context={context} onClear={() => t.setPinnedContext(null)} />
              <div className="flex flex-col gap-2">
                {empty.items.map((s) => (
                  <button key={s.question} type="button" onClick={() => void t.send(s.question, { command: s.question.startsWith("/") ? s.question.split(" ")[0] : null })} className="flex min-h-[52px] items-center gap-3 rounded-[12px] border border-cw-border bg-cw-bg-surface px-3.5 py-2 text-left text-[15px] font-medium text-cw-text">
                    <MaskIcon name={s.icon ?? "message-square"} size={18} color="var(--cw-text-muted)" className="flex-none" /><span className="flex-1">{s.question}</span><MaskIcon name="arrow-up-right" size={16} color="var(--cw-text-muted)" />
                  </button>
                ))}
              </div>
              {empty.recent && empty.recent.length > 0 && (
                <div className="flex flex-col">
                  <span className="pb-1 pt-2 text-[12px] font-bold tracking-[.06em] text-cw-text-muted">RECENT</span>
                  {empty.recent.map((r) => <button key={r.id} type="button" onClick={() => void t.openConversation(r.id)} className="flex min-h-12 items-center gap-2.5 border-b border-cw-divider text-left"><MaskIcon name="message-square" size={16} color="var(--cw-text-muted)" className="flex-none" /><span className="flex-1 truncate text-[15px] text-cw-text">{r.title}</span><span className="font-mono text-[12.5px] text-cw-text-muted">{hmZ(r.at)}</span></button>)}
                </div>
              )}
            </>
          )}
          {t.loadingThread && <div aria-busy className="flex flex-col gap-2">{[80, 60, 70].map((w, i) => <div key={i} className="h-3 rounded bg-cw-bg-hover" style={{ width: `${w}%` }} />)}</div>}
          {t.messages.map((m, i) => m.role === "user"
            ? <UserBubble key={m.id ?? i} message={m} panel />
            : <AgentReply key={m.id ?? i} message={m} panel onContinue={m.stopped ? t.continueReply : undefined} onConfirmationSettled={(c, o) => t.onConfirmationSettled(c, o.status, o.at, o.result)} />)}
          {t.streaming && t.activity && <div className="flex items-center gap-2 text-[13.5px] text-cw-text-muted"><span className="ag-pulse-1000"><MaskIcon name="loader-circle" size={15} color="var(--cw-text-link)" /></span><span className="font-mono text-[12.5px]">{t.activity}</span></div>}
          {t.offline && <OfflineCard queued={t.queued} panel />}
          {t.error && !t.offline && (
            <div role="alert" className="flex flex-col gap-2 rounded-[14px] border border-cw-danger-border bg-cw-danger-tint px-3.5 py-3">
              <span className="flex gap-2 text-[14.5px] font-bold"><MaskIcon name="circle-alert" size={17} color="var(--cw-danger-text)" />The agent didn’t answer</span>
              <span className="text-[13.5px] leading-normal text-cw-text-body">Your question is saved. Nothing was changed.</span>
              <MButton size="sm" icon="refresh-cw" className="self-start" onClick={() => { const last = [...t.messages].reverse().find((m) => m.role === "user"); if (last) void t.send(last.content ?? "", {}); }}>Ask again</MButton>
            </div>
          )}
        </div>
      )}
      {!history && (
        <div className="sticky bottom-0 z-[5] border-t border-cw-border bg-cw-bg-page px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
          <Composer panel context={context} streaming={t.streaming} locked={composerLocked} offline={t.offline} voiceThread={t} autoFocus={false} onSend={(text, ids, meta) => void t.send(text, { attachmentIds: ids, attachments: meta.attachments, command: meta.command, tier: meta.tier ?? null, ...(meta.voice ? { voice: true, language: meta.voice.language } : {}) })} onStop={t.stop} placeholderOverride="Ask, or type / for an action" />
        </div>
      )}
    </div>
  );
}
