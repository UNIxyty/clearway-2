"use client";

// One leg on a phone: only the fields that need a look, each with its value in mono 26, a tag, why it was flagged,
// what the email said and where, and its answers — the same edits the desktop makes (op: tz, op: field). Underneath,
// the fields that look right, folded. The sticky bar moves to the next leg or back to the request.
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { MButton, MCard, MError, MSkeleton, StickyBar } from "@/components/m/ui";
import { intakeApi, type Field } from "@/components/agent/intake/api";
import { legDate, legRoute } from "@/components/agent/intake/intake-shared";
import { flaggedFields, okFields, useIntakeDetail, intakeErrorText } from "@/lib/m/intake";

const monoish = (f: Field) => ["airport", "registration", "type", "flightNo", "time", "date", "count"].includes(f.kind);

export default function IntakeLegPage() {
  const { id, n } = useParams<{ id: string; n: string }>();
  const router = useRouter();
  const { detail, setDetail, error, reload } = useIntakeDetail(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [okOpen, setOkOpen] = useState(false);
  const legs = (detail?.review?.legs ?? []).filter((l) => !l.removed);
  const leg = legs.find((l) => String(l.index) === n) ?? null;
  const pos = leg ? legs.indexOf(leg) : -1;
  usePhonePage({ title: leg ? `Leg ${pos + 1}` : "Leg", subtitle: leg ? `${legRoute(leg)} · ${legDate(leg)}` : null, monoSubtitle: true, back: `/m/intake/${id}`, tab: "intake", tabs: false });

  if (!detail && !error) return <MSkeleton kind="cards" count={2} label="Loading the leg" />;
  if (!detail || !leg) return <MError title="Couldn’t load the leg" onRetry={reload}>{error ?? "This leg is not on the request."}</MError>;

  const flagged = flaggedFields(leg);
  const ok = okFields(leg);
  const closed = detail.request.status === "closed";
  const apply = async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setFailed(null);
    try { const d = await intakeApi.edit(id, body); setDetail(d); setEditing(null); } catch (e) { setFailed(intakeErrorText(e, "The agent did not answer.")); } finally { setBusy(null); }
  };
  const next = legs[pos + 1];

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-3.5 px-4 pb-5 pt-3.5">
        <div className="flex items-baseline gap-2"><span className="flex-1 text-[17px] font-extrabold">Needs a look</span><span className="font-mono text-[13px] text-cw-text-muted">{flagged.length}</span></div>
        {failed && <div role="alert" className="rounded-[10px] border border-cw-danger-border bg-cw-danger-tint px-3 py-2 text-[13.5px] text-cw-danger-text">{failed}</div>}
        {flagged.length === 0 && <div className="rounded-[14px] border border-cw-success-border bg-cw-success-tint px-3.5 py-3 text-[14.5px]">Nothing on this leg needs a look.</div>}
        {flagged.map(({ f, tone, tag }) => {
          const tz = f.state === "tz_unknown" ? leg.tz ?? null : null;
          const isEditing = editing?.key === f.key;
          return (
            <section key={f.key} className={`overflow-hidden rounded-[14px] border-[1.5px] bg-cw-bg-surface ${tone === "bad" ? "border-cw-danger" : "border-cw-warning"}`}>
              <div className="flex flex-col gap-2 px-3.5 py-3">
                <span className="flex items-center gap-2"><span className="flex-1 text-[13.5px] font-semibold text-cw-text-muted">{f.label}</span><span className={`inline-flex h-5 items-center rounded-[5px] px-1.5 text-[10.5px] font-bold tracking-[.04em] ${tone === "bad" ? "bg-cw-danger-solid text-cw-text-on-primary" : "bg-cw-warning-tint text-cw-warning-text"}`}>{tag}</span></span>
                {isEditing ? (
                  <input autoFocus value={editing.value} onChange={(e) => setEditing({ key: f.key, value: e.target.value })} aria-label={f.label} className="h-14 rounded-[12px] border-[1.5px] border-cw-focus bg-cw-bg-surface px-3.5 font-mono text-[22px] font-semibold text-cw-text shadow-[0_0_0_3px_var(--cw-focus-halo)] outline-none" />
                ) : (
                  <span className={`text-[26px] font-bold tracking-[-.01em] ${monoish(f) ? "font-mono" : ""}`}>{f.value || <span className="text-cw-text-muted">—</span>}</span>
                )}
                {f.note && <span className="text-[13.5px] leading-normal text-cw-text-body">{f.note}</span>}
                {f.said && <span className="flex flex-wrap items-baseline gap-1.5 text-[12.5px] text-cw-text-muted">Email said<code className="rounded-[5px] border border-cw-border bg-cw-bg-sunken px-1.5 py-px font-mono text-[12.5px] text-cw-text">{f.said}</code>{f.source ? `· ${f.source}` : ""}</span>}
              </div>
              {!closed && (
                <div className="grid gap-2 px-3.5 pb-3.5" style={{ gridTemplateColumns: tz ? "1fr" : "1fr 1fr" }}>
                  {tz ? (
                    <>
                      <MButton size="sm" disabled={busy !== null} onClick={() => void apply(f.key, { op: "tz", leg: leg.index, choice: "utc" })}><MaskIcon name="globe" size={15} color="currentColor" />It’s UTC{tz.utc.std ? <span className="font-normal text-cw-text-muted"> · STD {tz.utc.std}</span> : null}</MButton>
                      <MButton size="sm" disabled={busy !== null} onClick={() => void apply(f.key, { op: "tz", leg: leg.index, choice: "local" })}><MaskIcon name="clock" size={15} color="currentColor" />It’s local{tz.local.std ? <span className="font-normal text-cw-text-muted"> · {tz.local.std} UTC</span> : null}</MButton>
                    </>
                  ) : isEditing ? (
                    <>
                      <MButton size="sm" onClick={() => setEditing(null)}>Cancel</MButton>
                      <MButton size="sm" kind="primary" disabled={busy !== null} onClick={() => void apply(f.key, { op: "field", leg: leg.index, key: f.key, value: ["airport", "registration", "type", "flightNo"].includes(f.kind) ? editing.value.toUpperCase() : editing.value })}>Save</MButton>
                    </>
                  ) : (
                    <>
                      {f.state === "low_confidence" ? <MButton size="sm" disabled={busy !== null} onClick={() => void apply(f.key, { op: "looks_right", leg: leg.index, key: f.key })}><MaskIcon name="check" size={15} color="currentColor" />Looks right</MButton> : <span />}
                      <MButton size="sm" onClick={() => setEditing({ key: f.key, value: f.value ?? "" })}><MaskIcon name="pencil" size={15} color="currentColor" />Edit</MButton>
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
        <MCard>
          <button type="button" onClick={() => setOkOpen((v) => !v)} className="flex min-h-14 w-full items-center gap-2.5 px-3.5 py-2 text-left">
            <MaskIcon name="circle-check" size={18} color="var(--cw-success)" className="flex-none" />
            <span className="flex flex-1 flex-col"><span className="text-[15px] font-semibold text-cw-text">{ok.length} field{ok.length === 1 ? "" : "s"} look right</span><span className="text-[12.5px] text-cw-text-muted">Cross-checked, converted or read as written</span></span>
            <MaskIcon name={okOpen ? "chevron-up" : "chevron-down"} size={17} color="var(--cw-text-muted)" />
          </button>
          {okOpen && ok.map((f) => <div key={f.key} className="flex min-h-11 items-center gap-2.5 border-t border-cw-divider px-3.5 text-[14px]"><span className="flex-1 text-cw-text-muted">{f.label}</span><span className={`text-right font-semibold ${monoish(f) ? "font-mono" : ""}`}>{f.value || "—"}</span></div>)}
        </MCard>
      </div>
      <StickyBar>
        {next ? <MButton kind="primary" icon="arrow-right" onClick={() => router.push(`/m/intake/${id}/leg/${next.index}`)}>Leg {pos + 1} reviewed · next leg</MButton>
          : <MButton kind="primary" icon="arrow-left" onClick={() => router.push(`/m/intake/${id}`)}>Back to the request</MButton>}
      </StickyBar>
    </div>
  );
}
