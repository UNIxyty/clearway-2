"use client";

// Confirm and send to Leon, on a phone: the five summary rows (each leg in UTC, the aircraft, the people, the
// services), then the desktop's own confirmation dialog — the same prepare → confirm calls, the same countdown, the
// same record of who sent it. Nothing is sent until the person presses Confirm there.
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { MButton, MCard, MError, MSkeleton, StickyBar } from "@/components/m/ui";
import { intakeApi, type Prepared } from "@/components/agent/intake/api";
import { ConfirmDialog } from "@/components/agent/intake/intake-confirm";
import { fieldOf, legDate, legRoute } from "@/components/agent/intake/intake-shared";
import { confirmPlan } from "@/components/agent/intake/intake-review";
import { useIdentity } from "@/components/portal/Shell";
import { useIntakeDetail, intakeErrorText } from "@/lib/m/intake";

export default function IntakeConfirmPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { detail, error, reload } = useIntakeDetail(id);
  const { display } = useIdentity();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  usePhonePage({ title: "Confirm", subtitle: detail ? `${detail.request.sender || detail.request.reference} · ${(detail.review?.legs ?? []).filter((l) => !l.removed).length} legs` : null, back: `/m/intake/${id}`, tab: "intake", tabs: false });

  if (!detail && !error) return <MSkeleton kind="rows" count={5} label="Loading the request" />;
  if (!detail) return <MError title="Couldn’t load the request" onRetry={reload}>{error}</MError>;
  const legs = (detail.review?.legs ?? []).filter((l) => !l.removed);
  const plan = confirmPlan(detail);
  const reg = legs.map((l) => fieldOf(l, "registration")?.value).find(Boolean) ?? "—";
  const type = legs.map((l) => fieldOf(l, "type")?.value).find(Boolean) ?? "";
  const people = Object.values(detail.people?.legs ?? {}).reduce((a, l) => ({ crew: a.crew + (l.crew ?? 0), pax: a.pax + (l.pax ?? 0) }), { crew: 0, pax: 0 });
  const services = legs.reduce((n, l) => n + l.services.filter((s) => s.decision !== "decline").length, 0);
  const conditional = legs.reduce((n, l) => n + l.services.filter((s) => s.conditional).length, 0);
  const rows: Array<[string, string, string]> = [
    ...legs.map((l, i): [string, string, string] => [`Leg ${i + 1}`, legRoute(l), `${legDate(l)} · ${fieldOf(l, "std")?.value ?? "—"} → ${fieldOf(l, "sta")?.value ?? "—"} UTC`]),
    ["Aircraft", [reg, type].filter(Boolean).join(" · "), ""],
    ["People", `${people.crew} crew · ${people.pax} pax`, ""],
    ["Services", `${services}${conditional ? ` · ${conditional} conditional` : ""}`, ""],
  ];
  const prepare = async () => {
    setPreparing(true); setFailed(null);
    try { setPrepared(await intakeApi.prepare(id)); } catch (e) { setFailed(intakeErrorText(e, "The agent did not answer.")); } finally { setPreparing(false); }
  };
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-3.5 px-4 pb-5 pt-3.5">
        <span className="text-[15px] leading-normal text-cw-text-body">This sends {plan.live.length === 1 ? "the leg" : `${plan.live.length} legs`} to Leon as one request for {detail.request.sender || detail.request.reference}. Check the things that matter most:</span>
        <MCard>{rows.map(([k, v, s], i) => <div key={k + i} className={`grid min-h-[52px] grid-cols-[96px_minmax(0,1fr)] items-center gap-2.5 px-3.5 py-2 ${i ? "border-t border-cw-divider" : ""}`}><span className="text-[13px] text-cw-text-muted">{k}</span><span className="flex flex-col gap-0.5"><span className="font-mono text-[14.5px] font-semibold">{v}</span>{s && <span className="text-[12.5px] text-cw-text-muted">{s}</span>}</span></div>)}</MCard>
        <div className="flex gap-2.5 rounded-[10px] bg-cw-bg-sunken px-3 py-2.5 text-[13.5px] leading-snug text-cw-text-body"><MaskIcon name="info" size={16} color="var(--cw-text-muted)" className="mt-px flex-none" /><span>Once sent, changes are made in Leon. You can still cancel the request there.</span></div>
        {failed && <div role="alert" className="rounded-[10px] border border-cw-danger-border bg-cw-danger-tint px-3 py-2 text-[13.5px] text-cw-danger-text">{failed}</div>}
      </div>
      <StickyBar note={display ? `Logged as ${display}` : undefined}>
        <MButton kind="primary" size="lg" icon="send" disabled={preparing || plan.live.length === 0} onClick={() => void prepare()}>{preparing ? "Preparing…" : plan.resend ? "Send again to Leon" : "Confirm and send to Leon"}</MButton>
      </StickyBar>
      {prepared && <ConfirmDialog prepared={prepared} detail={detail} runsAs={prepared.runsAs ?? display} onFinished={(sent) => { setPrepared(null); if (sent) router.push(`/m/intake/${id}`); else void reload(); }} />}
    </div>
  );
}
