"use client";

// Agent mailbox §M12: the actions under the understood block and their dialogs. Process as handling request is
// §4.15 (server-issued, expiring token; blocking). No personal data in any dialog.

import { useEffect, useId, useState, type ReactNode } from "react";
import { C, TONE, mono } from "../ui/tokens";
import { Button, Icon, dateLong, hmZ } from "../ui/primitives";
import { Dialog, Segmented, Tooltip, useCountdown } from "./controls";
import { ApiError, mailboxApi, type Confirmation, type MailMessage } from "./api";
import { FieldArea, FieldInput, LinkAsButton, parseAddr } from "./mailbox-shared";

type Kind = "process" | "ignore" | "unignore" | "reprocess" | "forward";
const REASONS = ["Not for us", "Spam", "Newsletter", "Duplicate", "Handled elsewhere", "Other"] as const;

function DialogHead({ id, children, primary, right }: { id: string; children: ReactNode; primary?: boolean; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: primary ? C.primaryTint3 : C.page, borderBottom: `1px solid ${primary ? C.primaryLine : C.divider}`, borderRadius: "13px 13px 0 0" }}>
      <h2 id={id} style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.ink, flex: 1 }}>{children}</h2>
      {right}
    </div>
  );
}
function DialogFoot({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px 14px", borderTop: `1px solid ${C.divider}` }}>
      <span style={{ flex: 1, fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{note}</span>
      {children}
    </div>
  );
}
const inkBtn = { background: C.ink, color: C.surface, borderColor: C.ink } as const;
function Done({ children }: { children: ReactNode }) {
  return <div role="status" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.5, color: C.ok, fontWeight: 600, background: C.okTint, border: `1px solid ${C.okBorder}`, borderRadius: 10, padding: "10px 12px" }}><Icon name="circle-check" size={16} color={C.okDot} style={{ marginTop: 2 }} /><span>{children}</span></div>;
}
function Err({ children }: { children: ReactNode }) {
  return <div role="alert" style={{ fontSize: 13, lineHeight: 1.5, color: C.danger, background: C.dangerTint, border: `1px solid ${C.dangerBorder}`, borderRadius: 10, padding: "9px 12px" }}>{children}</div>;
}
function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr)", gap: "7px 12px", fontSize: 13, lineHeight: 1.45 }}>
      {rows.map(([k, v]) => <div key={k} style={{ display: "contents" }}><span style={{ color: C.faint }}>{k}</span><span style={{ color: C.body, overflowWrap: "anywhere" }}>{v}</span></div>)}
    </div>
  );
}
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "The server did not answer. Nothing was changed.");

// ── Process as handling request (§4.15) ──────────────────────────────────────────────────────────────────
function ProcessDialog({ message, runAs, onClose, onDone }: { message: MailMessage; runAs: string; onClose: () => void; onDone: () => void }) {
  const hid = useId();
  const [conf, setConf] = useState<Confirmation | null>(null);
  const [phase, setPhase] = useState<"issuing" | "confirm" | "working" | "done">("issuing");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ requestId?: string; reference?: string; status?: string } | null>(null);
  const cd = useCountdown(conf?.expiresAt ?? null);
  const expired = phase === "confirm" && cd != null && cd.seconds <= 0;
  const issue = async () => {
    setPhase("issuing"); setError(null); setConf(null);
    try { const r = await mailboxApi.action(message.id, "process-handling"); if (!r.confirmation) throw new ApiError(500, "The server did not issue a confirmation."); setConf(r.confirmation); setPhase("confirm"); }
    catch (e) { setError(errText(e)); setPhase("confirm"); }
  };
  useEffect(() => { void issue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const confirm = async () => {
    if (!conf) return; setPhase("working"); setError(null);
    try {
      const r = await mailboxApi.action(message.id, "process-handling", { token: conf.token });
      const out = (r.result ?? {}) as { requestId?: string; reference?: string; status?: string; failed?: string; refused?: string };
      if (out.failed || out.refused) throw new ApiError(409, out.failed ?? out.refused ?? "");
      setResult(out); setPhase("done"); onDone();
    } catch (e) { setError(errText(e)); setPhase("confirm"); }
  };
  const u = message.understood;
  const found = (u?.checks ?? []).filter(([, s]) => s === "yes" || s === "maybe").map(([n, , t]) => `${n}${t ? `: ${t}` : ""}`);
  const from = parseAddr(message.from);
  return (
    <Dialog open onClose={phase === "working" ? null : onClose} labelledBy={hid} accent="primary">
      <DialogHead id={hid} primary right={phase === "confirm" && cd && !error ? <span style={{ ...mono({ fontSize: 12, fontWeight: 600 }), color: expired ? C.danger : C.primaryHover }}>{expired ? "Expired" : `Expires in ${cd.text}`}</span> : null}>Process as handling request</DialogHead>
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Rows rows={[
          ["Email", message.subject ?? "(no subject)"],
          ["From", <span key="f">{from.name}{from.addr && from.addr !== from.name && <span style={{ ...mono({ fontSize: 12 }), color: C.muted }}> {from.addr}</span>}</span>],
          ["Received", <span key="r" style={mono({ fontSize: 12.5 })}>{dateLong(message.at)} · {hmZ(message.at)}</span>],
          ["Pre-filled", found.length ? found.join(" · ") : "Nothing yet. The agent reads the email again when you confirm."],
          ["Reference", u?.ref ? <span key="x" style={mono({ fontSize: 12.5, fontWeight: 600 })}>{u.ref}</span> : "None given; the agent builds one from the registration and date"],
        ]} />
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: C.body }}>The agent reads this email again as a handling request and pre-fills what it can. Values it is unsure of are marked low confidence. Nothing goes to Leon until someone reviews and confirms it on the intake page.</p>
        {expired && <Err>This confirmation expired. Nothing was created. <button type="button" className="ag-focus" onClick={() => void issue()} style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: C.primary, background: "none", border: "none", padding: 0, cursor: "pointer" }}>Start again</button></Err>}
        {error && <Err>{error}</Err>}
        {phase === "done" && result && (
          <Done>Created handling request {result.reference ? <span style={mono({ fontWeight: 700 })}>{result.reference}</span> : null}{result.status ? ` · ${result.status.replace(/_/g, " ")}` : ""}. This email is now Processed and linked to it.</Done>
        )}
      </div>
      <DialogFoot note={phase === "done" ? null : `Runs as ${runAs}. Creates a request, not a flight.`}>
        {phase === "done" ? (
          <>
            {result?.requestId && <LinkAsButton href={`/agent/intake?r=${encodeURIComponent(result.requestId)}`} icon="arrow-right">Open request {result.reference ?? ""}</LinkAsButton>}
            <Button size="sm" variant="primary" data-autofocus onClick={onClose}>Close</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" disabled={phase === "working"} onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="primary" data-autofocus disabled={!conf || expired || phase !== "confirm"} spinning={phase === "working" || phase === "issuing"} onClick={() => void confirm()}>Create handling request</Button>
          </>
        )}
      </DialogFoot>
    </Dialog>
  );
}

// ── Mark as ignored ──────────────────────────────────────────────────────────────────────────────────────
function IgnoreDialog({ message, onClose, onDone }: { message: MailMessage; onClose: () => void; onDone: (m: MailMessage | undefined) => void }) {
  const hid = useId();
  const [reason, setReason] = useState<string>(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState(false);
  const needNote = reason === "Other" && !note.trim();
  const go = async () => { setBusy(true); setError(null); try { const r = await mailboxApi.action(message.id, "ignore", { reason, note: note.trim() }); setDone(true); onDone(r.message); } catch (e) { setError(errText(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={busy ? null : onClose} labelledBy={hid}>
      <DialogHead id={hid}>Mark as ignored</DialogHead>
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.body }}>Reason <span style={{ color: C.muted, fontWeight: 400 }}>· one is required</span></span>
          <Segmented size="sm" label="Reason" value={reason} onChange={setReason} disabled={done} options={REASONS.map((r) => ({ value: r, label: r }))} />
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.body }}>Note <span style={{ color: C.muted, fontWeight: 400 }}>· {reason === "Other" ? "required for Other" : "optional"} · shown to others</span></span>
          <FieldArea value={note} onChange={setNote} ariaLabel="Note" invalid={reason === "Other" && !note.trim() && note.length > 0} />
        </label>
        {error && <Err>{error}</Err>}
        {done && <Done>Marked as ignored · {reason}. It no longer shows in Needs attention.</Done>}
      </div>
      <DialogFoot note={done ? null : "Can be undone. Recorded with your name and reason."}>
        {done ? <Button size="sm" variant="primary" data-autofocus style={inkBtn} onClick={onClose}>Close</Button> : (
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="primary" style={inkBtn} disabled={!reason || needNote || busy} spinning={busy} onClick={() => void go()}>Mark as ignored</Button>
          </>
        )}
      </DialogFoot>
    </Dialog>
  );
}

// ── Reprocess / Not ignored · reprocess ──────────────────────────────────────────────────────────────────
function ReprocessDialog({ message, verb, onClose, onDone }: { message: MailMessage; verb: "reprocess" | "unignore"; onClose: () => void; onDone: (m: MailMessage | undefined) => void }) {
  const hid = useId(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState(false);
  const label = verb === "unignore" ? "Not ignored · reprocess" : "Reprocess";
  const go = async () => { setBusy(true); setError(null); try { const r = await mailboxApi.action(message.id, verb); setDone(true); onDone(r.message); } catch (e) { setError(errText(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={busy ? null : onClose} labelledBy={hid}>
      <DialogHead id={hid}>{label}</DialogHead>
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5, lineHeight: 1.55, color: C.body }}>
        <p style={{ margin: 0 }}>Runs the current reading rules on this email again. If it is recognised now, a request is created in the normal way. The earlier result stays in this message&apos;s history.</p>
        {message.request && <p style={{ margin: 0 }}>It will not create a second request if <span style={mono({ fontWeight: 600 })}>{message.request.reference}</span> still exists; it updates that request&apos;s values instead, before review.</p>}
        {error && <Err>{error}</Err>}
        {done && <Done>In the queue. The status is Waiting until the agent has read it again.</Done>}
      </div>
      <DialogFoot note={done ? null : "Status becomes Waiting until done."}>
        {done ? <Button size="sm" variant="primary" data-autofocus style={inkBtn} onClick={onClose}>Close</Button> : (
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="primary" style={inkBtn} data-autofocus disabled={busy} spinning={busy} onClick={() => void go()}>{label}</Button>
          </>
        )}
      </DialogFoot>
    </Dialog>
  );
}

// ── Forward to a person ──────────────────────────────────────────────────────────────────────────────────
function ForwardDialog({ message, capture, onClose, onDone }: { message: MailMessage; capture: boolean; onClose: () => void; onDone: (m: MailMessage | undefined) => void }) {
  const hid = useId(); const [to, setTo] = useState(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState(false);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim());
  const go = async () => { setBusy(true); setError(null); try { const r = await mailboxApi.action(message.id, "forward", { to: to.trim(), note: note.trim() }); setDone(true); onDone(r.message); } catch (e) { setError(errText(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={busy ? null : onClose} labelledBy={hid}>
      <DialogHead id={hid}>Forward to a person</DialogHead>
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.body }}>To</span>
          <FieldInput value={to} onChange={setTo} ariaLabel="Forward to (email address)" placeholder="name@company.com" monoText autoFocus invalid={to.trim().length > 3 && !valid} />
          <span style={{ fontSize: 12, color: C.muted }}>Type an email address. There is no people directory here yet.</span>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.body }}>Note <span style={{ color: C.muted, fontWeight: 400 }}>· optional</span></span>
          <FieldArea value={note} onChange={setNote} ariaLabel="Note" />
        </label>
        {message.hasPersonal && (
          <div style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.5, color: TONE.amber.fg, background: C.warnTint, border: `1px solid ${C.warnBorder}`, borderRadius: 10, padding: "9px 12px" }}>
            <Icon name="shield-alert" size={15} color={TONE.amber.ic} style={{ marginTop: 2 }} />
            <span>This email contains personal data. It is forwarded as received, with passport numbers and dates of birth. Forward only to someone who needs them.</span>
          </div>
        )}
        {error && <Err>{error}</Err>}
        {done && <Done>Forwarded to <span style={mono()}>{to.trim()}</span>. It is in Sent{capture ? " (test mode: stored, not delivered)" : ""}.</Done>}
      </div>
      <DialogFoot note={done ? null : <>Sent from the agent&apos;s address as an attachment. Replies go to them, not here.{capture ? " Test mode: stored in Sent, not delivered." : ""}</>}>
        {done ? <Button size="sm" variant="primary" data-autofocus style={inkBtn} onClick={onClose}>Close</Button> : (
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="primary" style={inkBtn} disabled={!valid || busy} spinning={busy} onClick={() => void go()}>Forward</Button>
          </>
        )}
      </DialogFoot>
    </Dialog>
  );
}

// ── The action row ───────────────────────────────────────────────────────────────────────────────────────
function Act({ children, icon, primary, onClick }: { children: ReactNode; icon: string; primary?: boolean; onClick: () => void }) {
  return <Button size="sm" variant={primary ? "primary" : "secondary"} icon={icon} onClick={onClick} style={{ borderRadius: 9, padding: primary ? "7px 12px" : "6px 11px" }}>{children}</Button>;
}
function NotBuilt({ children, icon }: { children: ReactNode; icon: string }) {
  return (
    <Tooltip label="Provider-portal requests are not built yet">
      {(p) => <Button size="sm" variant="secondary" icon={icon} aria-disabled="true" onClick={(e) => e.preventDefault()} {...p} style={{ borderRadius: 9, padding: "6px 11px", opacity: 0.5, cursor: "not-allowed" }}>{children}</Button>}
    </Tooltip>
  );
}

export function MailActions({ message, runAs, capture, onChanged }: { message: MailMessage; runAs: string; capture: boolean; onChanged: (m?: MailMessage) => void }) {
  const [open, setOpen] = useState<Kind | null>(null);
  const s = message.status; const req = message.request;
  const openReq = req ? <LinkAsButton key="open" href={`/agent/intake?r=${encodeURIComponent(req.id)}`} icon="arrow-right" primary>Open request {req.reference}</LinkAsButton> : null;
  const process = <Act key="p" icon="clipboard-list" primary onClick={() => setOpen("process")}>Process as handling request</Act>;
  const notif = <NotBuilt key="n" icon="plane">Process as flight notification</NotBuilt>;
  const ignore = <Act key="i" icon="circle-minus" onClick={() => setOpen("ignore")}>Mark as ignored…</Act>;
  const fwd = <Act key="f" icon="forward" onClick={() => setOpen("forward")}>Forward to a person…</Act>;
  const repro = <Act key="r" icon="rotate-ccw" onClick={() => setOpen("reprocess")}>Reprocess</Act>;
  const unign = <Act key="u" icon="rotate-ccw" primary onClick={() => setOpen("unignore")}>Not ignored · reprocess</Act>;
  let acts: ReactNode[];
  if (s === "not_recognised") acts = [process, notif, ignore, fwd];
  else if (s === "failed") acts = req ? [openReq, repro, fwd] : [process, notif, ignore, fwd, repro];
  else if (s === "processed" || s === "reply") acts = [openReq, repro, fwd];
  else if (s === "ignored") acts = [unign, fwd];
  else acts = [fwd];
  const close = () => setOpen(null);
  const done = (m?: MailMessage) => onChanged(m);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{acts.filter(Boolean)}</div>
      {open === "process" && <ProcessDialog message={message} runAs={runAs} onClose={close} onDone={() => onChanged()} />}
      {open === "ignore" && <IgnoreDialog message={message} onClose={close} onDone={done} />}
      {(open === "reprocess" || open === "unignore") && <ReprocessDialog message={message} verb={open} onClose={close} onDone={done} />}
      {open === "forward" && <ForwardDialog message={message} capture={capture} onClose={close} onDone={done} />}
    </>
  );
}
