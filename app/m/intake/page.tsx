"use client";

// Flight intake on a phone (mobile-portal-spec.md › Tier 1 › Flight intake): answer the question that is blocking a
// request. NEEDS YOU: each card shows who, the route, the source, the legs and its age, then the blocking question
// with its answers as 48 px buttons — the same yes or no the desktop's Process it / Skip it (or Cancel in Leon /
// Keep it) record. MOVING ON THEIR OWN: the current step of each request. The done ones are folded.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { MCard, MEmpty, MError, MLabel, MRow, MSkeleton } from "@/components/m/ui";
import { intakeApi, type ListRow, type RequestDetail } from "@/components/agent/intake/api";
import { ago } from "@/components/agent/intake/intake-shared";
import { answerQuestion, questionFor, useIntakeList, type Question, intakeErrorText } from "@/lib/m/intake";

const NEEDS = new Set(["needs_you", "needs_review", "stuck", "waiting"]);
const MOVING = new Set(["in_progress"]);
const legsWord = (r: ListRow) => { const n = r.legs.filter((l) => !l.removed).length; return `${n} leg${n === 1 ? "" : "s"}`; };

/** A needs-you card: the row, then the question when the request has one, else the status and Open. */
function NeedsCard({ row, onAnswered }: { row: ListRow; onAnswered: () => void }) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { let alive = true; intakeApi.detail(row.id).then((d) => { if (alive) setDetail(d); }).catch(() => {}); return () => { alive = false; }; }, [row.id, row.updatedAt]);
  const q: Question = detail ? questionFor(detail) : null;
  const answer = async (value: "yes" | "no") => {
    if (!detail || !q) return;
    setBusy(value); setFailed(null);
    try { await answerQuestion(detail, q, value); onAnswered(); } catch (e) { setFailed(intakeErrorText(e, "The agent did not answer.")); } finally { setBusy(null); }
  };
  return (
    <MCard tone="warning" className="shadow-cw-1">
      <Link href={`/m/intake/${row.id}`} className="flex flex-col gap-[3px] px-3.5 py-3 text-cw-text">
        <span className="flex items-baseline gap-2"><span className="flex-1 truncate text-[16px] font-bold">{row.from || row.reference}</span><span className="font-mono text-[12px] text-cw-text-muted">{ago(row.updatedAt)}</span></span>
        <span className="font-mono text-[13.5px] font-medium text-cw-text-body">{row.route || row.reference}</span>
        <span className="text-[12.5px] text-cw-text-muted">{row.type === "scheduled" ? "Scheduled flight" : "Handling request"} · {legsWord(row)} · {row.stage}</span>
      </Link>
      <div className="flex flex-col gap-2.5 border-t border-cw-warning-border bg-cw-warning-tint px-3.5 py-3">
        <span className="flex gap-2 text-[14.5px] font-semibold leading-snug"><MaskIcon name="circle-help" size={17} color="var(--cw-warning-text)" className="mt-px flex-none" />{q ? q.text : detail ? row.statusLabel : "Reading the request…"}</span>
        {q?.why && <span className="text-[13px] leading-snug text-cw-text-body">{q.why}</span>}
        {failed && <span role="alert" className="text-[13px] text-cw-danger-text">{failed}</span>}
        <div className="grid gap-2" style={{ gridTemplateColumns: q && q.answers.length > 1 ? "1fr 1fr" : "1fr" }}>
          {q ? q.answers.map((a) => (
            <button key={a.value} type="button" disabled={busy !== null} onClick={() => void answer(a.value)} className="flex min-h-12 items-center justify-center rounded-[11px] border border-cw-border-control bg-cw-bg-surface px-2.5 text-center text-[14px] font-semibold text-cw-text disabled:opacity-60">{busy === a.value ? "Recording…" : a.label}</button>
          )) : (
            <Link href={`/m/intake/${row.id}`} className="flex min-h-12 items-center justify-center rounded-[11px] border border-cw-border-control bg-cw-bg-surface px-2.5 text-[14px] font-semibold text-cw-text">Open</Link>
          )}
        </div>
      </div>
    </MCard>
  );
}

export default function IntakeListPage() {
  const { rows, error, reload } = useIntakeList();
  const [doneOpen, setDoneOpen] = useState(false);
  const needs = useMemo(() => (rows ?? []).filter((r) => NEEDS.has(r.statusKey) || r.needsAttention), [rows]);
  const moving = useMemo(() => (rows ?? []).filter((r) => MOVING.has(r.statusKey) && !r.needsAttention), [rows]);
  const done = useMemo(() => (rows ?? []).filter((r) => !NEEDS.has(r.statusKey) && !MOVING.has(r.statusKey) && !r.needsAttention), [rows]);
  usePhonePage({ title: "Flight intake", subtitle: rows ? (needs.length ? `${needs.length} need${needs.length === 1 ? "s" : ""} you` : "Nothing needs you") : null, tab: "intake" });

  if (!rows && !error) return <MSkeleton kind="cards" count={3} label="Loading intake" />;
  if (!rows && error) return <MError title="Couldn’t load intake" onRetry={reload}>Requests keep moving without you; only this list failed to load. {error}</MError>;
  return (
    <div className="flex min-h-full flex-col gap-2.5 px-4 pb-6 pt-3.5">
      {error && <MError stale title="Not updating." onRetry={reload}>Showing the list as it was.</MError>}
      {needs.length === 0 && (
        <MEmpty icon="circle-check" title="Nothing needs you">{moving.length} request{moving.length === 1 ? " is" : "s are"} moving on their own. You will be told if one gets stuck.</MEmpty>
      )}
      {needs.length > 0 && <MLabel tone="warning" count={needs.length}>NEEDS YOU</MLabel>}
      {needs.map((r) => <NeedsCard key={r.id} row={r} onAnswered={reload} />)}
      {moving.length > 0 && (
        <>
          <div className="pt-2.5"><MLabel count={moving.length}>MOVING ON THEIR OWN</MLabel></div>
          <MCard>
            {moving.map((r) => (
              <MRow key={r.id} href={`/m/intake/${r.id}`} minH={60}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-semibold">{r.from || r.reference}</span><span className="truncate font-mono text-[12.5px] text-cw-text-muted">{r.route || r.reference}</span></span>
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-cw-info-text"><MaskIcon name="circle-dot" size={13} color="currentColor" />{r.stage}</span>
              </MRow>
            ))}
          </MCard>
        </>
      )}
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setDoneOpen((v) => !v)} className="flex min-h-12 items-center gap-2 px-1 text-[14px] text-cw-text-muted"><MaskIcon name="circle-check" size={16} color="var(--cw-success)" /><span className="flex-1 text-left">{done.length} done or closed</span><MaskIcon name={doneOpen ? "chevron-up" : "chevron-down"} size={16} color="currentColor" /></button>
          {doneOpen && (
            <MCard>
              {done.map((r) => (
                <MRow key={r.id} href={`/m/intake/${r.id}`} minH={56}>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-semibold">{r.from || r.reference}</span><span className="truncate font-mono text-[12.5px] text-cw-text-muted">{r.route || r.reference}</span></span>
                  <span className="text-[12.5px] text-cw-text-muted">{r.statusLabel} · {ago(r.updatedAt)}</span>
                </MRow>
              ))}
            </MCard>
          )}
        </>
      )}
    </div>
  );
}
