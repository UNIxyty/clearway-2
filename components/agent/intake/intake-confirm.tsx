"use client";

// Confirmation dialog (§I10, base §4.15). Shows exactly what will be written, runs as the signed-in person,
// and never shows a leg as created until Leon answered with a flight ID. Confirming only hands the send to the
// server: the dialog closes at once and the request row shows a spinner until Leon has answered (the page polls).

import { useId, useRef, useState } from "react";
import { C, TONE, mono } from "../ui/tokens";
import { Button, Icon } from "../ui/primitives";
import { Dialog, PulseDot, useCountdown } from "./controls";
import { intakeApi, type Prepared, type RequestDetail, type SendResult } from "./api";
import { LeonPill, errText, fieldOf, hm, plural, writeKey } from "./intake-shared";

type Phase = { k: "review" } | { k: "sending" } | { k: "done"; result: SendResult } | { k: "error"; message: string } | { k: "cancelling" };

export function ConfirmDialog({ prepared, detail, runsAs, onFinished }: { prepared: Prepared; detail: RequestDetail; runsAs: string; onFinished: (sent: boolean) => void }) {
  const titleId = useId();
  const [phase, setPhase] = useState<Phase>({ k: "review" });
  const fired = useRef(false);
  const cd = useCountdown(phase.k === "review" ? prepared.confirmation.expiresAt : null);
  const expired = cd != null && cd.seconds <= 0;
  const legs = prepared.legs;
  const scheduled = detail.request.type === "scheduled";
  const nums = legs.map((l) => l.index + 1);
  const title = prepared.resend ? `Resend ${nums.length === 1 ? `leg ${nums[0]}` : `legs ${nums.join(", ")}`} to Leon` : scheduled ? `Send ${plural(legs.length, "flight")} to Leon` : `Create ${plural(legs.length, "flight")} in Leon`;
  const go = prepared.resend ? "Resend to Leon" : scheduled ? "Send to Leon" : "Create in Leon";
  const reviewLegs = detail.review?.legs ?? [];

  const confirm = async () => {
    if (fired.current || expired) return; // double-click must not matter; the server also runs it once
    fired.current = true; phaseRef.current = "sending"; setPhase({ k: "sending" });
    try { await intakeApi.confirm(prepared.confirmation.token); onFinished(true); }
    catch (e) { setPhase({ k: "error", message: errText(e) }); }
  };
  // The dialog's focus trap keeps the first close handler it was given, so every close decision reads the
  // live phase from a ref: Esc while waiting for Leon must never cancel or close.
  const phaseRef = useRef<Phase["k"]>("review"); phaseRef.current = phase.k;
  const cancel = async () => {
    if (phaseRef.current !== "review") return;
    phaseRef.current = "cancelling"; setPhase({ k: "cancelling" });
    await intakeApi.cancel(prepared.confirmation.token).catch(() => {});
    onFinished(false);
  };
  const handleClose = () => { const k = phaseRef.current; if (k === "review") void cancel(); else if (k === "done" || k === "error") onFinished(true); };
  const onClose = phase.k === "sending" || phase.k === "cancelling" ? null : handleClose;

  const legLine = (l: Prepared["legs"][number]) => {
    const p = l.payload as Record<string, unknown>;
    const rl = reviewLegs.find((x) => x.index === l.index);
    const std = String(p.startTimeUTC ?? ""), sta = String(p.endTimeUTC ?? "");
    const date = rl ? fieldOf(rl, "date")?.value ?? "" : "";
    const reg = rl ? fieldOf(rl, "registration")?.value ?? "" : "";
    const type = rl ? fieldOf(rl, "aircraftType")?.value ?? "" : "";
    return [`LEG ${l.index + 1}`, `${p.adepCode ?? "····"} → ${p.adesCode ?? "····"}`, date, `${hm(std) || "--:--"} → ${hm(sta) || "--:--"} UTC`, [p.flightNo, type, reg].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  };
  const services = legs.map((l) => {
    const names = l.checklist.filter((c) => c.decision !== "note").flatMap((c) => (c.services?.length ? c.services : [c.label]).map((n) => (c.decision === "to_confirm" ? `${n} (to confirm)` : n)));
    return `Leg ${l.index + 1}: ${names.length ? names.join(", ") : "none"}`;
  });
  const checklist = legs.map((l) => {
    const items = l.checklist.filter((c) => c.decision !== "note").length, notes = l.checklist.filter((c) => c.decision === "note").length, tc = l.checklist.filter((c) => c.decision === "to_confirm").length;
    const caps = Object.entries(l.checklist.reduce<Record<string, number>>((m, c) => { m[c.statusCaption] = (m[c.statusCaption] ?? 0) + 1; return m; }, {})).map(([k, v]) => `${v} × ${k}`).join(", ");
    return `Leg ${l.index + 1}: ${plural(items, "item")}${notes ? ` + ${plural(notes, "note")}` : ""} · ${tc} as To confirm · ${l.skipped.length} declined, not added${caps ? ` · Leon status ${caps}` : ""}`;
  });

  const rows: { k: string; lines: string[]; mono?: boolean; bg?: string; color?: string }[] = [
    { k: "Where", lines: [prepared.resend ? "Leon · flights not yet in Leon" : "Leon · new flights"] },
    { k: "Request", lines: [detail.request.reference], mono: true },
    { k: "Legs", lines: legs.map(legLine), mono: true },
    ...(!scheduled ? [{ k: "Services", lines: services }, { k: "Checklist", lines: checklist }] : []),
    { k: "People", lines: ["Crew and passenger details go to Leon. Not shown here."] },
    ...(prepared.edited.length ? [{ k: "Changed", lines: prepared.edited.map((e) => `Leg ${e.leg + 1} · ${e.label} → ${e.value}`), bg: C.primaryTint3, color: C.primaryHover }] : []),
    ...(prepared.notChecked.length ? [{ k: "Not checked", lines: prepared.notChecked.map((e) => `Leg ${e.leg + 1} · ${e.label} · ${e.value}`), bg: TONE.amber.bg, color: TONE.amber.fg }] : []),
  ];

  return (
    <Dialog open onClose={onClose} labelledBy={titleId} width={600} accent="primary">
      <div style={{ background: C.primaryTint3, borderBottom: `1px solid ${C.primaryLine}`, padding: "13px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="send" size={16} color={C.primary} />
        <span id={titleId} style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{phase.k === "done" ? leonAnswerTitle(phase.result) : title}</span>
        {phase.k === "review" && cd && <span role="timer" style={{ ...mono({ fontSize: 12 }), color: expired ? C.danger : C.primaryOnTint }}>{expired ? "Expired" : `Expires in ${cd.text}`}</span>}
      </div>

      {phase.k !== "done" && (
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
          {rows.map((r) => (
            <div key={r.k} style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12, padding: "7px 8px", borderRadius: 7, background: r.bg ?? "transparent" }}>
              <span style={{ fontSize: 12.5, color: C.muted }}>{r.k}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                {r.lines.map((ln, i) => <span key={i} style={{ ...(r.mono ? mono({ fontSize: 13, fontWeight: 600 }) : { fontSize: 13, fontWeight: 600 }), lineHeight: 1.45, color: r.color ?? C.ink, overflowWrap: "anywhere" }}>{ln}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {phase.k === "done" && <Answer result={phase.result} />}

      <div style={{ padding: "12px 16px 14px", borderTop: `1px solid ${C.divider}`, display: "flex", alignItems: "center", gap: 8 }}>
        {(phase.k === "review" || phase.k === "cancelling") && (
          <>
            <span style={{ fontSize: 12, color: expired ? C.danger : C.muted, flex: 1 }}>{expired ? "This confirmation expired. Cancel and review again." : `Runs as ${prepared.runsAs ?? runsAs}. Nothing is sent until you confirm.`}</span>
            <Button variant="secondary" size="sm" data-autofocus onClick={() => void cancel()} disabled={phase.k === "cancelling"}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => void confirm()} disabled={expired || phase.k === "cancelling"}>{go}</Button>
          </>
        )}
        {phase.k === "sending" && (
          <span role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.body, flex: 1 }}><PulseDot color={C.primary} />Handing the send to the agent…</span>
        )}
        {phase.k === "error" && (
          <>
            <span role="alert" style={{ fontSize: 12.5, color: C.danger, flex: 1 }}>{phase.message} Nothing is shown as created. Check the Sent section on this page for each leg&apos;s state.</span>
            <Button variant="secondary" size="sm" data-autofocus onClick={() => onFinished(true)}>Close</Button>
          </>
        )}
        {phase.k === "done" && (
          <>
            <span style={{ fontSize: 12.5, color: C.body, flex: 1 }}>{phase.result.legs.some((l) => l.state === "in_leon") ? (scheduled ? "Created. This page and the email will show it." : "Created. The checklist fills next; this page and the email will show it.") : "Nothing was created in Leon."}</span>
            <Button variant="secondary" size="sm" data-autofocus onClick={() => onFinished(true)}>Close</Button>
          </>
        )}
      </div>
    </Dialog>
  );
}

function leonAnswerTitle(r: SendResult) {
  const inL = r.legs.filter((l) => l.state === "in_leon").length;
  if (inL === r.legs.length) return `Leon confirmed ${plural(inL, "flight")}`;
  if (inL === 0) return "Leon created nothing";
  return `Leon confirmed ${inL} of ${r.legs.length} flights`;
}

function Answer({ result }: { result: SendResult }) {
  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      {result.legs.map((l) => {
        const k = writeKey(l.state); const ok = l.state === "in_leon"; const bad = l.state === "not_in_leon";
        return (
          <div key={l.index} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: ok ? TONE.green.bg : bad ? TONE.red.bg : l.state === "unknown" ? TONE.amber.bg : C.sidebar, flexWrap: "wrap" }}>
            <span style={mono({ fontSize: 12.5, fontWeight: 700 })}>{ok ? "✓" : bad ? "✕" : "?"} LEG {l.index + 1}</span>
            <LeonPill k={k} id={l.flightNid} />
            {l.already && <span style={{ fontSize: 12, color: C.muted }}>was already in Leon</span>}
            {bad && l.error && <span style={{ fontSize: 12.5, color: C.danger }}>Leon: {l.error}</span>}
            {l.state === "unknown" && <span style={{ fontSize: 12.5, color: TONE.amber.fg }}>Leon did not answer. The agent is checking whether it exists.</span>}
          </div>
        );
      })}
      {result.checklist.total > 0 && <span style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Checklist: {result.checklist.filled} of {result.checklist.total} items filled so far.</span>}
      {!result.email.ok && result.email.error && <span style={{ fontSize: 12.5, color: TONE.amber.fg }}>The notification email was not sent: {result.email.error}</span>}
    </div>
  );
}
