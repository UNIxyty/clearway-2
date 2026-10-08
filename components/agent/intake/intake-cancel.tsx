"use client";

// Type 1 cancellation (agent/lib/intake/cancel.mjs): the provider cancelled a flight we loaded. Shows what arrived and how
// it was matched, each leg as Leon held it (departed and already-cancelled legs flagged), the question to ops with its
// deadline, the two answers (the same decision the "Cancel in Leon?" email asks), and each leg's outcome. "Cancelled in
// Leon" means Leon keeps the flight as cancelled; nothing is removed.
import { useState } from "react";
import { C, TONE, mono } from "../ui/tokens";
import { Icon, dayTimeZ, hmsZ } from "../ui/primitives";
import type { RequestDetail } from "./api";
import { CARD, EYEBROW } from "./intake-shared";
import { SmallButton } from "./intake-fields";

export function CancellationPanel({ detail, answer }: { detail: RequestDetail; answer: (yes: boolean) => Promise<void> }) {
  const c = detail.review?.cancellation;
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  if (!c) return null;
  const a = c.approval ?? null;
  const rows = detail.sent.cancels ?? [];
  const latest = (leg: number) => rows.filter((w) => w.leg === leg).sort((x, y) => Date.parse(x.updatedAt ?? x.at) - Date.parse(y.updatedAt ?? y.at)).pop();
  const open = !!a && !a.answer;
  const late = open && Date.parse(a!.deadlineAt) <= Date.now();
  const go = async (yes: boolean) => { setBusy(yes ? "yes" : "no"); try { await answer(yes); } finally { setBusy(null); } };
  const outcomeOf = (index: number) => c.outcome?.legs.find((o) => o.index === index);
  return (
    <section aria-label="Cancellation from the provider" style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, borderColor: open ? C.dangerBadge : C.border }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Cancellation from the provider</span>
        <span style={{ fontSize: 12.5, color: C.muted }}>Received {dayTimeZ(c.receivedAt, { alwaysDate: true })} · matched by {c.matchedBy}{c.uidDiffers ? " · the calendar UID differs from the one on file (recorded)" : ""}</span>
      </div>
      {(c.legs ?? []).length > 0 && (
        <div role="table" aria-label="Legs in Leon" style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {(c.legs ?? []).map((l, i) => {
            const o = outcomeOf(l.index); const w = latest(l.index);
            const state = o?.state ?? w?.state ?? null;
            // While a new question is open, an earlier attempt's result is history, not this question's outcome.
            const earlier = open && !o && w && w.state !== "cancelled" ? `Not cancelled last time (${w.error ?? w.state}). On yes, the agent tries again.` : null;
            const text = l.alreadyCancelled ? "Already cancelled in Leon when the cancellation arrived: no call." : earlier ? earlier : state === "cancelled" ? `Cancelled in Leon${o?.already ? " (it already was)" : ""}: Leon keeps it as cancelled, not removed.` : state === "not_cancelled" ? `NOT cancelled. ${o?.error ?? w?.error ?? ""}` : state === "unknown" || state === "sending" ? `${o?.error ?? w?.error ?? "Leon did not answer."} Check the flight in Leon.` : state === "not_sent" ? (o?.error ?? "Not sent.") : state === "departed" || l.departed ? "Already departed: the agent does not cancel a departed flight. A person decides." : open ? "Will be cancelled in Leon on yes." : "Not cancelled.";
            const bad = !earlier && !l.alreadyCancelled && (state === "not_cancelled" || state === "unknown" || state === "sending" || state === "not_sent");
            return (
              <div role="row" key={l.index} style={{ display: "grid", gridTemplateColumns: "64px 120px 150px 1fr", gap: 12, padding: "8px 14px", borderTop: i ? `1px solid ${C.dividerRow}` : "none", alignItems: "center", background: bad ? TONE.red.bg : l.departed && state !== "cancelled" ? TONE.amber.bg : "transparent" }}>
                <span role="cell" style={mono({ fontSize: 12, fontWeight: 700 })}>LEG {l.index + 1}</span>
                <span role="cell" style={mono({ fontSize: 12.5 })}>{l.flightNid}</span>
                <span role="cell" style={mono({ fontSize: 12, color: C.muted })}>{l.std ? dayTimeZ(l.std, { alwaysDate: true }) : "—"}</span>
                <span role={bad ? "alert" : "cell"} style={{ fontSize: 13, color: bad ? C.danger : state === "cancelled" ? C.ok : C.body, fontWeight: bad ? 600 : 400 }}>{text}</span>
              </div>
            );
          })}
        </div>
      )}
      {a && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={EYEBROW}>Cancel in Leon? · asked {hmsZ(a.askedAt)} · {a.to.length} address{a.to.length === 1 ? "" : "es"} · answer by {dayTimeZ(a.deadlineAt, { alwaysDate: true })}</span>
          {a.answer ? (
            <span style={{ fontSize: 13, fontWeight: 600, color: a.answer.value === "yes" ? C.ink : C.body }}>{a.answer.value === "yes" ? "Yes, cancel in Leon" : "No, keep the flights: nothing was touched in Leon"} <span style={{ fontWeight: 400, color: C.muted }}>· {a.answer.by} · {a.answer.how} · {hmsZ(a.answer.at)}</span></span>
          ) : (
            <>
              <span role="status" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: late ? C.danger : TONE.amber.fg, fontWeight: 600 }}><Icon name="circle-help" size={13} color={late ? C.dangerBadge : TONE.amber.fg} />{late ? "No answer by the deadline. Nothing has been cancelled; it waits for a decision." : "Waiting for ops. Nothing is cancelled until someone says yes."}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SmallButton tone="danger" busy={busy === "yes"} busyLabel="Recording…" disabled={busy !== null} onClick={() => void go(true)}>Cancel in Leon</SmallButton>
                <SmallButton busy={busy === "no"} busyLabel="Recording…" disabled={busy !== null} onClick={() => void go(false)}>Keep the flights</SmallButton>
              </div>
              <span style={{ fontSize: 12, color: C.muted }}>Leon keeps a cancelled flight as cancelled; it is not removed, and the agent cannot undo it.</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
