"use client";

// One intake request on a phone: route, sender and time received, the stage bar ("Step 4 of 11 · Awaiting review"),
// then the one question first, the legs (each with what needs a look), services and people (counts only; documents
// stay hidden), and the original email. The sticky bar stays disabled until nothing blocks the send.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { Chevron, MButton, MCard, MError, MRow, MSkeleton, StickyBar } from "@/components/m/ui";
import { bannerFor } from "@/components/agent/intake/intake-detail";
import { fieldOf, hm, legDate, legRoute } from "@/components/agent/intake/intake-shared";
import { answerQuestion, legIssues, questionFor, useIntakeDetail, intakeErrorText } from "@/lib/m/intake";
import { confirmPlan } from "@/components/agent/intake/intake-review";

export default function IntakeRequestPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, error, reload } = useIntakeDetail(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const r = detail?.request;
  usePhonePage({ title: r?.sender || r?.reference || "Request", subtitle: r ? `${r.typeLabel} · ${(detail?.review?.legs ?? []).filter((l) => !l.removed).length} legs` : null, back: "/m/intake", tab: "intake", actions: detail ? [{ icon: "mail", label: "Original email", href: `/m/intake/${id}/email` }] : [] });

  if (!detail && !error) return <MSkeleton kind="rows" count={6} label="Loading the request" />;
  if (!detail || !r) return <MError title="Couldn’t load the request" onRetry={reload}>{error}</MError>;

  const legs = (detail.review?.legs ?? []).filter((l) => !l.removed);
  const q = questionFor(detail);
  const banner = bannerFor(detail, Date.now(), r.status === "closed");
  const stages = detail.stageNames;
  const reached = stages.map((n) => detail.stages.find((s) => s.name === n)).filter((s) => s && s.state !== "none" && s.state !== "skip").length;
  const current = detail.stages.find((s) => s.state === "prog" || s.state === "wait" || s.state === "hold" || s.state === "fail") ?? null;
  const stageColor = (i: number) => { const s = detail.stages.find((x) => x.name === stages[i]); return !s || s.state === "none" || s.state === "skip" ? "var(--cw-border-control)" : s.state === "done" ? "var(--cw-success)" : s.state === "fail" ? "var(--cw-danger)" : "var(--cw-warning)"; };
  const plan = confirmPlan(detail);
  const closed = r.status === "closed";
  const blocked = closed || detail.blockers.length > 0 || Boolean(q) || plan.live.length === 0 || legs.some((l) => legIssues(l).fix > 0 || legIssues(l).tz);
  const issuesText = (l: (typeof legs)[number]) => { const i = legIssues(l); const parts = [i.tz ? "1 question" : null, i.fix ? `${i.fix} to fix` : null, i.check ? `${i.check} to look at` : null].filter(Boolean); return parts.length ? parts.join(" · ") : l.inLeon ? "In Leon" : "Looks right"; };
  const answer = async (value: "yes" | "no") => {
    if (!q) return;
    setBusy(value); setFailed(null);
    try { await answerQuestion(detail, q, value); await reload(); } catch (e) { setFailed(intakeErrorText(e, "The agent did not answer.")); } finally { setBusy(null); }
  };
  const peopleCount = Object.values(detail.people?.legs ?? {}).reduce((n, l) => n + (l.crew ?? 0) + (l.pax ?? 0), 0);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-3.5 px-4 pb-6 pt-3.5">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[14px] font-medium">{legs.map((l) => legRoute(l)).join(" · ") || r.reference}</span>
          <span className="text-[13px] text-cw-text-muted">From {r.sender || "—"}{r.receivedAt ? ` · received ${hm(r.receivedAt)} UTC` : ""}</span>
          <div className="mt-1.5 flex items-center gap-1" aria-label={`Step ${reached} of ${stages.length}`}>{stages.map((n, i) => <span key={n} className="h-[5px] flex-1 rounded-[3px]" style={{ background: stageColor(i) }} />)}</div>
          <span className="text-[12.5px] text-cw-text-muted">Step {reached} of {stages.length} · <strong className={banner?.tone === "red" ? "text-cw-danger-text" : banner?.tone === "amber" ? "text-cw-warning-text" : "text-cw-text"}>{current?.name ?? r.ui.label}</strong></span>
        </div>

        {q ? (
          <section className="flex flex-col gap-2.5 rounded-[14px] border-[1.5px] border-cw-warning-border bg-cw-warning-tint p-3.5">
            <span className="text-[12px] font-bold tracking-[.06em] text-cw-warning-text">1 QUESTION FIRST</span>
            <span className="text-[16px] font-bold leading-snug">{q.text}</span>
            {q.why && <span className="text-[13.5px] leading-normal text-cw-text-body">{q.why}</span>}
            {failed && <span role="alert" className="text-[13px] text-cw-danger-text">{failed}</span>}
            <div className="flex flex-col gap-2">{q.answers.map((a) => <MButton key={a.value} size="md" disabled={busy !== null} onClick={() => void answer(a.value)}>{busy === a.value ? "Recording…" : a.label}</MButton>)}</div>
          </section>
        ) : banner ? (
          <div role={banner.tone === "red" ? "alert" : undefined} className={`flex gap-2.5 rounded-[12px] border px-3 py-2.5 text-[13.5px] leading-snug ${banner.tone === "red" ? "border-cw-danger-border bg-cw-danger-tint" : banner.tone === "amber" ? "border-cw-warning-border bg-cw-warning-tint" : banner.tone === "green" ? "border-cw-success-border bg-cw-success-tint" : banner.tone === "blue" ? "border-cw-primary-tint-border bg-cw-primary-tint" : "border-cw-border bg-cw-bg-sunken"}`}>
            <MaskIcon name={banner.icon} size={16} color="currentColor" className="mt-px flex-none" /><span><strong>{banner.title}</strong>{banner.body ? ` ${banner.body}` : ""}</span>
          </div>
        ) : null}

        {legs.length > 0 && (
          <section className="flex flex-col gap-2">
            <span className="text-[17px] font-extrabold">Legs</span>
            <MCard>
              {legs.map((l) => { const i = legIssues(l); const bad = i.fix > 0 || i.tz; return (
                <MRow key={l.index} href={`/m/intake/${id}/leg/${l.index}`} minH={68}>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]"><span className="font-mono text-[15px] font-semibold">{legRoute(l)}</span><span className="text-[13px] text-cw-text-muted">{legDate(l)}{fieldOf(l, "std")?.value ? ` · ${fieldOf(l, "std")?.value} → ${fieldOf(l, "sta")?.value ?? "—"}` : ""}</span></span>
                  <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${bad ? "text-cw-warning-text" : i.check ? "text-cw-warning-text" : "text-cw-success-text"}`}>{issuesText(l)}<Chevron /></span>
                </MRow>
              ); })}
            </MCard>
          </section>
        )}

        <MCard>
          <MRow minH={56}><MaskIcon name="list-checks" size={18} color="var(--cw-text-muted)" className="flex-none" /><span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold">Services</span><span className="text-[13px] text-cw-text-muted">{legs.reduce((n, l) => n + l.services.length, 0)} requested · {legs.reduce((n, l) => n + l.services.filter((s) => s.conditional).length, 0)} conditional</span></span></MRow>
          <MRow minH={56}><MaskIcon name="users" size={18} color="var(--ca-sens-text)" className="flex-none" /><span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold">Crew and passengers</span><span className="text-[13px] text-cw-text-muted">{peopleCount ? `${peopleCount} people` : "none listed"} · documents hidden</span></span></MRow>
          {detail.emails.length > 0 && <MRow minH={56} href={`/m/intake/${id}/email`}><MaskIcon name="mail" size={18} color="var(--cw-text-muted)" className="flex-none" /><span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold">Original email</span><span className="text-[13px] text-cw-text-muted">{detail.emails.length} on this request</span></span></MRow>}
        </MCard>
        {detail.blockers.length > 0 && <div className="text-[13px] text-cw-text-body">{detail.blockers.join(" ")}</div>}
      </div>
      <StickyBar>
        {blocked ? (
          <MButton kind="secondary" disabled>{closed ? r.ui.label : q ? "Answer the question to continue" : legs.some((l) => legIssues(l).fix > 0 || legIssues(l).tz) ? "Look at the legs to continue" : plan.live.length === 0 ? "Everything is in Leon" : "Waiting"}</MButton>
        ) : (
          <Link href={`/m/intake/${id}/confirm`} className="flex h-[52px] items-center justify-center gap-2 rounded-[12px] bg-cw-primary text-[15.5px] font-bold text-cw-text-on-primary"><MaskIcon name="send" size={17} color="currentColor" />{plan.resend ? "Send again" : "Review and send to Leon"}</Link>
        )}
      </StickyBar>
    </div>
  );
}
