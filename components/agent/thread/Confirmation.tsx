"use client";

// Confirmation prompts, their records, and the modal (design spec §4.15).
//
// This is the safety mechanism, and the UI half of §3 rules 6–9. The prompt
// shows what will change and on what; nothing runs until Confirm; Confirm
// disables on first activation and the request is idempotent on the token,
// so a second click, a held Enter or a network retry cannot run the action
// twice; the prompt expires at 5 minutes and is not reusable; the composer is
// locked while one is pending; and the destructive level has no keyboard
// confirm — hold 2 s with a pointer, or Space held on the focused button.

import { useCallback, useEffect, useRef, useState } from "react";
import { C, SHADOW, mono } from "../ui/tokens";
import { Button, Icon, Keycap, Spinner, hmZ, hmsZ } from "../ui/primitives";
import { AGENT_BASE, type PendingConfirmation, type ConfirmationStatus } from "../types";

type Outcome = { status: ConfirmationStatus; at: string; result?: Record<string, unknown> | null; error?: string | null };

/** Live status by token: on mount (a reload) and after any action. */
async function fetchStatus(token: string) {
  const r = await fetch(`${AGENT_BASE}/api/confirmations/${token}`, { credentials: "same-origin", cache: "no-store" });
  const b = await r.json().catch(() => null);
  return r.ok && b?.ok ? b.confirmation : null;
}

function useCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = expiresAt ? Math.max(0, new Date(expiresAt).getTime() - now) : null;
  return { left, expired: left !== null && left <= 0, mmss: left == null ? "" : `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` };
}

/** Human line for the card body from the tool + arguments (§4.15 body grid). Tool names come from the backend. */
function rows(c: PendingConfirmation): Array<[string, React.ReactNode]> {
  const i = c.input ?? {};
  const out: Array<[string, React.ReactNode]> = [["Action", <><span>{c.what ?? c.toolName}</span> <span style={{ ...mono({ fontSize: 12 }), color: C.faint }}>{c.toolName}</span></>]];
  if (c.target) out.push(["Target", <span style={mono()}>{c.target}</span>]);
  for (const [k, v] of Object.entries(i)) {
    if (k === "id" || v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const label = k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    const text = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    const codeLike = /^(icao|airportIcaos|registration|operatorId|to|startDate|endDate|filename)$/.test(k);
    out.push([label, <span style={codeLike ? mono() : undefined}>{text}</span>]);
  }
  return out.slice(0, 8);
}

export function ConfirmationCard({
  confirmation, panel = false, onSettled, previewedOnPage = false,
}: {
  confirmation: PendingConfirmation;
  panel?: boolean;
  /** The parent lifts the outcome so it can unlock the composer and re-render the record. */
  onSettled?: (outcome: Outcome) => void;
  previewedOnPage?: boolean;
}) {
  const c = confirmation;
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(c.status && c.status !== "pending" ? { status: c.status, at: c.appliedAt ?? c.cancelledAt ?? new Date().toISOString(), result: c.result ?? null } : null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const firedRef = useRef(false);
  const { expired, mmss } = useCountdown(c.expiresAt);

  // Focus moves to Cancel when a prompt appears (spec default): a stray Enter must not confirm.
  useEffect(() => { if (!outcome) cancelRef.current?.focus(); }, [outcome]);

  // On mount (e.g. after a reload) ask the server what became of it.
  useEffect(() => {
    if (outcome) return;
    let alive = true;
    fetchStatus(c.token).then((s) => {
      if (!alive || !s) { if (alive && !s) settle({ status: "expired", at: new Date().toISOString(), error: "This confirmation is no longer known to the service." }); return; }
      if (s.status === "applied") settle({ status: "applied", at: s.appliedAt ?? new Date().toISOString(), result: s.result ?? null });
      else if (s.status === "cancelled") settle({ status: "cancelled", at: s.cancelledAt ?? new Date().toISOString() });
      else if (s.status === "expired") settle({ status: "expired", at: s.expiresAt ?? new Date().toISOString() });
    }).catch(() => {});
    return () => { alive = false; };
  }, [c.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const settle = useCallback((o: Outcome) => { setOutcome(o); onSettled?.(o); }, [onSettled]);

  // Expiry (§3 rule 8): nothing runs; the prompt is not reusable.
  useEffect(() => { if (expired && !outcome && !busy) settle({ status: "expired", at: new Date().toISOString() }); }, [expired, outcome, busy, settle]);

  async function confirm() {
    // Double-fire guard (§3 rule 6): the first activation disables the control;
    // the server is idempotent on the token besides.
    if (firedRef.current || busy || outcome) return;
    firedRef.current = true; setBusy(true); setError(null);
    try {
      const r = await fetch(`${AGENT_BASE}/api/confirmations/${c.token}/confirm`, { method: "POST", credentials: "same-origin" });
      const b = await r.json().catch(() => null);
      if (b?.ok && b.result?.ok !== false) settle({ status: "applied", at: b.confirmation?.appliedAt ?? new Date().toISOString(), result: b.result ?? null });
      else if (b?.result?.reason === "expired" || b?.confirmation?.status === "expired") settle({ status: "expired", at: new Date().toISOString() });
      else if (b?.result?.reason === "cancelled") settle({ status: "cancelled", at: new Date().toISOString() });
      else { firedRef.current = false; setError(b?.result?.message || b?.message || `The change could not be applied (HTTP ${r.status}).`); }
    } catch (e) {
      firedRef.current = false; setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }
  async function cancel() {
    if (busy || outcome) return;
    setBusy(true);
    try { await fetch(`${AGENT_BASE}/api/confirmations/${c.token}/cancel`, { method: "POST", credentials: "same-origin" }); } catch { /* the record still says cancelled locally */ }
    settle({ status: "cancelled", at: new Date().toISOString() }); setBusy(false);
  }

  // Keyboard (§15): ⌘⏎ confirms standard, ⏎ applies low, Esc cancels; destructive has NO keyboard confirm.
  useEffect(() => {
    if (outcome) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); void cancel(); return; }
      if (c.level === "standard" && (e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void confirm(); }
      if (c.level === "low" && e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey && (document.activeElement === cancelRef.current || document.activeElement === document.body)) { e.preventDefault(); void confirm(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [outcome, c.level]); // eslint-disable-line react-hooks/exhaustive-deps

  if (outcome) return <ConfirmationRecord confirmation={c} outcome={outcome} panel={panel} />;

  if (c.level === "low") {
    return (
      <div role="group" aria-label="Confirm change" style={{ background: "#fff", border: `1px solid ${C.borderControl}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Icon name="sliders-horizontal" size={15} color={C.muted} />
        <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>{c.what ?? c.toolName}{c.target ? <> · <span style={mono()}>{c.target}</span></> : null}</span>
        {error && <span style={{ fontSize: 12, color: C.danger }}>{error}</span>}
        <Button variant="primary" size="sm" onClick={() => void confirm()} disabled={busy} spinning={busy} keycap="⏎">Apply</Button>
        <Button ref={cancelRef as never} variant="ghost" size="sm" onClick={() => void cancel()} disabled={busy}>Cancel</Button>
      </div>
    );
  }

  if (c.level === "destructive") return <DestructiveBar confirmation={c} busy={busy} error={error} mmss={mmss} onHoldComplete={() => void confirm()} onKeep={() => void cancel()} cancelRef={cancelRef} panel={panel} />;

  const isEmail = /^(send_email|email_document)$/.test(c.toolName);
  const title = isEmail ? "Confirm before I send" : c.what ? `Confirm: ${c.what}` : "Confirm this change";
  return (
    <div role="group" aria-label={title} style={{ background: "#fff", border: `1.5px solid ${C.primary}`, borderRadius: 14, boxShadow: SHADOW.pending, overflow: "hidden" }}>
      <div style={{ background: C.primaryTint3, borderBottom: `1px solid ${C.primaryLine}`, padding: panel ? "10px 12px" : "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="shield-alert" size={16} color={C.primaryHover} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.primaryHover, flex: 1 }}>{title}</span>
        <span style={{ fontSize: panel ? 11.5 : 12, color: C.primaryOnTint, whiteSpace: "nowrap" }}>{previewedOnPage ? "previewed on the page ←" : isEmail ? "Nothing is sent until you confirm" : "Nothing changes until you confirm"}{c.expiresAt ? <> · expires <span style={mono()}>{hmZ(c.expiresAt)}</span></> : null}</span>
      </div>
      <div style={{ padding: panel ? "12px" : "14px 16px", display: "grid", gridTemplateColumns: panel ? "78px minmax(0,1fr)" : "90px minmax(0,1fr)", rowGap: 9, columnGap: 14, fontSize: panel ? 13 : 13.5 }}>
        {rows(c).map(([k, v]) => (<><span key={`${k}-k`} style={{ color: C.muted }}>{k}</span><span key={`${k}-v`} style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v}</span></>))}
      </div>
      {error && <div role="alert" style={{ padding: "0 16px 10px", fontSize: 12.5, color: C.danger }}>{error}</div>}
      <div style={{ padding: panel ? "10px 12px" : "12px 16px", borderTop: `1px solid ${C.divider}`, background: C.page, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" size={panel ? "sm" : "lg"} onClick={() => void confirm()} disabled={busy} spinning={busy} keycap="⌘⏎">{isEmail ? "Confirm and send" : c.what && /^(add|creat)/i.test(c.what) ? "Create" : "Confirm"}</Button>
        <span style={{ flex: 1 }} />
        <Button ref={cancelRef as never} variant="ghost" size={panel ? "sm" : "md"} onClick={() => void cancel()} disabled={busy} keycap="Esc">Cancel</Button>
      </div>
    </div>
  );
}

/** Destructive — pinned bar, hold to confirm 2 s (§4.15 C). C2 fill is progress and keeps running under reduced motion. */
function DestructiveBar({ confirmation: c, busy, error, mmss, onHoldComplete, onKeep, cancelRef, panel }: { confirmation: PendingConfirmation; busy: boolean; error: string | null; mmss: string; onHoldComplete: () => void; onKeep: () => void; cancelRef: React.RefObject<HTMLButtonElement | null>; panel: boolean }) {
  const [holding, setHolding] = useState(false);
  const [fill, setFill] = useState(0);
  const timer = useRef<number | null>(null);
  const start = () => { if (busy || holding) return; setHolding(true); setFill(100); timer.current = window.setTimeout(() => { timer.current = null; setHolding(false); onHoldComplete(); }, 2000); };
  const release = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } setHolding(false); setFill(0); };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return (
    <div role="group" aria-label="Destructive change — hold to confirm" style={{ background: "#fff", border: `1.5px solid ${C.dangerBadge}`, borderRadius: 10, overflow: "hidden", position: "sticky", bottom: 8, zIndex: 3 }}>
      <div style={{ background: C.dangerTint, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="trash-2" size={14} color={C.dangerBadge} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.danger, flex: 1 }}>{c.what ?? c.toolName}{c.target ? <> <span style={mono()}>{c.target}</span></> : null} — can&apos;t be undone</span>
        <span style={{ ...mono({ fontSize: 11 }), color: C.danger }}>{mmss} left</span>
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12.5, color: C.body, lineHeight: 1.5 }}>Hold the button for 2 seconds to confirm. Release earlier and nothing happens.</div>
        {error && <div role="alert" style={{ fontSize: 12.5, color: C.danger }}>{error}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="ag-focus" aria-label="Hold to delete — hold for 2 seconds" disabled={busy}
            onPointerDown={start} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
            onKeyDown={(e) => { if (e.key === " " && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={(e) => { if (e.key === " ") { e.preventDefault(); release(); } }}
            style={{ position: "relative", overflow: "hidden", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#fff", background: busy ? C.dangerDisabled : C.dangerBadge, border: "none", padding: "8px 14px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", userSelect: "none", touchAction: "none" }}>
            <span className={holding ? "ag-hold-fill" : "ag-hold-release"} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fill}%`, background: "rgba(0,0,0,.18)", pointerEvents: "none" }} />
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>{busy ? <Spinner color="#fff" /> : null}{busy ? "" : holding ? "Keep holding…" : "Hold to delete"}</span>
          </button>
          <span style={{ flex: 1 }} />
          <Button ref={cancelRef as never} variant="secondary" size={panel ? "sm" : "md"} onClick={onKeep} disabled={busy}>Keep it</Button>
        </div>
      </div>
    </div>
  );
}

/** What the prompt becomes after it is answered (§4.15 D). */
export function ConfirmationRecord({ confirmation: c, outcome, panel = false }: { confirmation: PendingConfirmation; outcome: Outcome; panel?: boolean }) {
  const isEmail = /^(send_email|email_document)$/.test(c.toolName);
  const ref = (outcome.result?.actionId ?? outcome.result?.id ?? outcome.result?.resendId ?? null) as string | null;
  if (outcome.status === "applied") {
    return (
      <div className="ag-record-in" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: panel ? 12 : 14, padding: panel ? "10px 12px" : "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name={isEmail ? "mail-check" : "shield-check"} size={panel ? 15 : 16} color={C.okDot} />
          <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{isEmail ? `Sent${c.target ? ` to ${c.target}` : ""}` : `${c.what ?? "Change"}${c.target ? ` · ${c.target}` : ""} — applied`}</span>
          <span style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>Confirmed by you · <span style={mono()}>{hmsZ(outcome.at)}</span>{ref ? <> · <span style={mono()}>{String(ref).slice(0, 12)}</span></> : null}</span>
        </div>
        {outcome.result?.warning ? <div style={{ fontSize: 12.5, color: C.warn }}>{String(outcome.result.warning)}</div> : null}
        <div style={{ fontSize: 12.5, color: C.faint }}>{outcome.result?.undoable === false ? "This one cannot be undone." : "Undo isn't automatic — ask me to revert it."}</div>
      </div>
    );
  }
  const expiredOrCancelled = outcome.status === "expired";
  return (
    <div className="ag-record-in" style={{ background: C.page, border: `1px dashed ${C.borderControl}`, borderRadius: panel ? 12 : 14, padding: panel ? "10px 12px" : "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={expiredOrCancelled ? "timer-off" : "circle-slash"} size={16} color={C.faint} />
        <span style={{ fontSize: 14, fontWeight: 600, color: C.muted, flex: 1 }}>{expiredOrCancelled ? "Expired — nothing changed" : isEmail ? "Email not sent — you cancelled" : "Cancelled — nothing changed"}</span>
      </div>
      <div style={{ fontSize: 13, color: C.muted }}>
        {expiredOrCancelled ? "No answer within 5 minutes. The wall may have changed since, so I won't reuse this prompt — ask again." : <>You cancelled at <span style={mono()}>{hmsZ(outcome.at)}</span>. Recorded in the activity log as declined.</>}
      </div>
    </div>
  );
}

/** Modal (§4.15 E) — only from the voice bar / ⌘K, where no thread exists. */
export function ConfirmationModal({ confirmation: c, onSettled }: { confirmation: PendingConfirmation; onSettled: (o: Outcome) => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLElement | null>(null);
  const destructive = c.level === "destructive";
  const matches = !destructive || (c.target != null && typed.trim() === String(c.target));
  useEffect(() => { firstRef.current?.focus(); const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); void cancel(); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function go() {
    if (busy || !matches) return; setBusy(true);
    const r = await fetch(`${AGENT_BASE}/api/confirmations/${c.token}/confirm`, { method: "POST", credentials: "same-origin" }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    onSettled(r?.ok && r.result?.ok !== false ? { status: "applied", at: new Date().toISOString(), result: r.result } : { status: r?.result?.reason === "expired" ? "expired" : "cancelled", at: new Date().toISOString(), error: r?.result?.message ?? null });
  }
  async function cancel() { await fetch(`${AGENT_BASE}/api/confirmations/${c.token}/cancel`, { method: "POST", credentials: "same-origin" }).catch(() => {}); onSettled({ status: "cancelled", at: new Date().toISOString() }); }
  return (
    <div role="dialog" aria-modal aria-label={c.what ?? "Confirm"} style={{ position: "fixed", inset: 0, zIndex: 70, background: destructive ? "rgba(23,24,28,.45)" : "rgba(23,24,28,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: destructive ? 420 : 340, background: "#fff", borderRadius: destructive ? 16 : 14, boxShadow: destructive ? SHADOW.modal : SHADOW.modalLight, overflow: "hidden" }}>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {destructive && <span style={{ width: 36, height: 36, borderRadius: 10, background: C.dangerTint, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="trash-2" size={18} color={C.dangerBadge} /></span>}
          <div style={{ fontSize: destructive ? 16 : 14, fontWeight: destructive ? 800 : 700 }}>{c.what ?? c.toolName}{c.target ? <> <span style={mono()}>{c.target}</span></> : null}{destructive ? " permanently?" : "?"}</div>
          <div style={{ fontSize: 13, color: C.muted }}>The agent asked on your behalf. Nothing changes until you decide here.</div>
          {destructive && (
            <input ref={firstRef as never} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${c.target ?? "the ID"} to confirm`} aria-label="Type the ID to confirm"
              style={{ ...mono({ fontSize: 12.5 }), border: `1px solid ${C.borderControl}`, borderRadius: 8, padding: "8px 10px", outline: "none" }} />
          )}
        </div>
        <div style={{ background: C.page, borderTop: `1px solid ${C.divider}`, padding: "12px 20px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button ref={destructive ? undefined : (firstRef as never)} variant="secondary" size="md" onClick={() => void cancel()} disabled={busy}>{destructive ? "Keep it" : "Cancel"}</Button>
          <Button variant={destructive ? "destructive" : "primary"} size="md" onClick={() => void go()} disabled={busy || !matches} spinning={busy}>{destructive ? "Delete" : "Apply"}</Button>
        </div>
      </div>
    </div>
  );
}

export type { Outcome as ConfirmationOutcome };
