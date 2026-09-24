"use client";

// Messages: the user bubble (design spec §4.3), the agent reply shell (§4.4),
// streaming and the stopped row (§4.6). The reply shell composes the blocks in
// the spec's order: tool activity → prose → rich cards → verbatim → agent's
// reading → sources; a confirmation is the whole reply when the agent needs
// one. Every block is drawn from what the backend returned.

import { C, TYPE, mono } from "../ui/tokens";
import { Button, Icon, hmZ, hmsZ } from "../ui/primitives";
import Orb from "../ui/Orb";
import Markdown from "../panel/Markdown";
import { ToolSummary, LiveSteps } from "./ToolActivity";
import { ClaimedProse, SourceChips, SourceStrip, useHotSource } from "./Sources";
import { VerbatimFrame, AgentsReading } from "./Verbatim";
import { FlightCard, FlightRows, AirportSummary, DocumentResult, GeneratedFile, TableResult, MonoBlock } from "./Cards";
import { ConfirmationCard, type ConfirmationOutcome } from "./Confirmation";
import { ErrorCard, kindFor } from "./ErrorCard";
import type { AgentMessage, DocumentData, FileData, PendingConfirmation, MonoData } from "../types";

export function UserBubble({ message: m, panel = false }: { message: AgentMessage; panel?: boolean }) {
  // Inline chips: @Mentions in blue mono, /commands in black mono (§4.19, §4.20).
  const parts = m.content.split(/(@[A-Z0-9-]{3,}|\/[a-z]+\b)/g);
  return (
    <div style={{ alignSelf: "flex-end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, maxWidth: panel ? 330 : 560 }} className="ag-user-row">
      <div style={{ background: C.bubbleUser, borderRadius: panel ? "14px 14px 4px 14px" : "16px 16px 4px 16px", padding: panel ? "9px 13px" : "11px 15px", fontSize: panel ? 14 : 15, lineHeight: 1.55, color: C.ink, whiteSpace: "pre-wrap", display: "inline-flex", gap: 7, alignItems: "flex-start", opacity: m.sending ? 0.6 : 1 }}>
        {m.voice && <Icon name="mic" size={13} color={C.faint} style={{ marginTop: 3 }} />}
        <span>
          {parts.map((p, i) => /^@/.test(p) ? <span key={i} style={{ ...mono({ fontSize: 13.5, fontWeight: 600 }), color: C.primaryHover, background: C.primaryTint2, borderRadius: 6, padding: "0 6px" }}>{p}</span>
            : /^\/[a-z]+$/.test(p) ? <span key={i} style={{ ...mono({ fontSize: 13.5, fontWeight: 600 }), color: C.surface, background: C.ink, borderRadius: 6, padding: "0 7px" }}>{p}</span> : <span key={i}>{p}</span>)}
        </span>
      </div>
      {m.failed ? (
        <span style={{ fontSize: 12, color: C.danger, display: "inline-flex", gap: 8, alignItems: "center" }}>Not sent · {m.failed}</span>
      ) : (
        <span className={panel ? "ag-hover-only" : undefined} style={{ ...mono({ fontSize: 11 }), color: C.faint }} suppressHydrationWarning>{m.sending ? "Sending…" : `${m.initials ?? "You"} · ${hmZ(m.createdAt) || ""}`}</span>
      )}
    </div>
  );
}

export function StreamingCaret({ panel = false }: { panel?: boolean }) {
  return <span className="ag-caret" aria-hidden style={{ display: "inline-block", width: panel ? 7 : 8, height: panel ? 15 : 17, background: C.primary, marginLeft: 2, verticalAlign: -3 }} />;
}

export function StoppedRow({ at, finished, cancelled, onContinue, panel = false }: { at: string; finished: number; cancelled: number; onContinue: () => void; panel?: boolean }) {
  return (
    <div className="ag-fade-150" style={{ borderTop: `1px dashed ${C.borderControl}`, paddingTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
      <Icon name="square" size={14} color={C.faint} />
      <span style={{ fontSize: 13, color: C.muted, flex: 1 }}>Stopped by you at <span style={mono()}>{hmsZ(at)}</span>. Partial reply kept; {finished} tool{finished === 1 ? "" : "s"} finished, {cancelled} {cancelled === 1 ? "was" : "were"} cancelled before {cancelled === 1 ? "it" : "they"} ran.</span>
      <Button variant="secondary" size={panel ? "xs" : "sm"} onClick={onContinue}>Continue</Button>
    </div>
  );
}

export function AgentReply({
  message: m, panel = false, onConfirmationSettled, onContinue, onEmailDocument, onSendFile, onShowOnPage,
}: {
  message: AgentMessage; panel?: boolean;
  onConfirmationSettled?: (c: PendingConfirmation, o: ConfirmationOutcome) => void;
  onContinue?: () => void;
  onEmailDocument?: (d: DocumentData) => void;
  onSendFile?: (f: FileData) => void;
  onShowOnPage?: (b: MonoData) => void;
}) {
  const { hot, setHot } = useHotSource();
  const b = m.blocks ?? {};
  const verbatim = b.verbatim ?? [], flights = b.flights ?? [], mono_ = b.mono ?? [], documents = b.documents ?? [], files = b.files ?? [], airports = b.airports ?? [], tables = b.tables ?? [], confirmations = b.confirmations ?? [];
  const sources = m.sources ?? [];
  const steps = m.toolActivity ?? [];
  const failed = steps.filter((s) => !s.ok && s.state !== "cancelled");
  const live = m.streaming && steps.some((s) => s.state === "running" || s.state === "queued");
  const proseStyle = panel ? TYPE.bodyPanel : TYPE.body;

  const prose = m.content ? (
    b.claims && b.claims.length ? <div style={proseStyle}><ClaimedProse text={m.content} spans={b.claims} sources={sources} hot={hot} setHot={setHot} panel={panel} /></div>
      : <div style={{ ...proseStyle, color: verbatim.length ? C.body : C.ink }}><Markdown text={m.content} />{m.streaming && <StreamingCaret panel={panel} />}</div>
  ) : null;

  return (
    <div style={{ display: "flex", gap: panel ? 0 : 14 }}>
      {!panel && <div style={{ width: 28, flex: "none", paddingTop: 2 }}><Orb size={26} state={m.streaming ? "thinking" : "idle"} still title="Ops Agent" /></div>}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: panel ? 10 : 14 }}>
        {!panel && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontSize: 13.5, fontWeight: 700 }}>Ops Agent</span><span style={{ ...mono({ fontSize: 11 }), color: C.faint }} suppressHydrationWarning>{hmZ(m.createdAt)}</span></div>
        )}

        {live ? <LiveSteps steps={steps} panel={panel} /> : steps.length > 0 && <ToolSummary steps={steps} elapsedMs={m.latencyMs ?? null} panel={panel} defaultOpen={false} />}

        {failed.map((s, i) => {
          const kind = kindFor(s.error, s.summary);
          return <ErrorCard key={`${s.name}-${i}`} panel={panel} kind={kind}
            title={kind === "permission_denied" ? `You can't do that from here` : kind === "source_unavailable" ? `${s.name} is using cached data` : `${s.name} didn't answer`}
            body={kind === "permission_denied" ? `${s.name} needs a role your account doesn't have. I can read for you; ask an admin to grant it.` : `I could not complete ${s.name}, so I have not said anything about that part. Everything else in the reply stands.`}
            diagnostic={`${s.name} → ${s.error ?? "failed"}${s.durationMs != null ? ` · ${s.durationMs} ms` : ""}`} />;
        })}

        {m.error && steps.length === 0 && <ErrorCard panel={panel} kind={kindFor(m.error)} title={/model|529|overload/i.test(m.error) ? "The agent can't reply right now" : "That didn't work"} body={/model|529|overload/i.test(m.error) ? "Your message is saved. Nothing was run. The console itself is working — Flights, NOTAM Check and AIP search are all available." : "The reply could not be completed. Nothing was changed."} diagnostic={m.error} />}

        {confirmations.length > 0 ? (
          confirmations.map((c) => <ConfirmationCard key={c.token} confirmation={c} panel={panel} onSettled={(o) => onConfirmationSettled?.(c, o)} />)
        ) : null}

        {prose && (verbatim.length === 0 ? prose : null)}

        {airports.map((a) => <AirportSummary key={a.icao} airport={a} panel={panel} />)}
        {flights.length > 2 ? <FlightRows flights={flights} panel={panel} /> : flights.map((f) => <FlightCard key={f.flightId} flight={f} panel={panel} />)}
        {tables.map((t) => <TableResult key={t.id} table={t} panel={panel} />)}
        {mono_.map((x) => <MonoBlock key={x.id} block={x} panel={panel} onShowOnPage={onShowOnPage} />)}
        {documents.map((d) => <DocumentResult key={`${d.kind}-${d.href ?? d.documentId ?? d.title}`} doc={d} panel={panel} onEmail={onEmailDocument} />)}
        {files.map((f) => <GeneratedFile key={f.id} file={f} panel={panel} onSend={onSendFile} />)}

        {verbatim.map((r) => <VerbatimFrame key={`${r.kind ?? "limitation"}-${r.id}`} record={r} panel={panel} />)}
        {verbatim.length > 0 && m.content && <AgentsReading panel={panel}><Markdown text={m.content} />{m.streaming && <StreamingCaret panel={panel} />}</AgentsReading>}

        {m.streaming && !m.content && !live && (
          <div aria-busy style={{ display: "flex", flexDirection: "column", gap: 6 }}><div style={{ height: 12, width: "80%", borderRadius: 4, background: C.hover }} /><div style={{ height: 12, width: "60%", borderRadius: 4, background: C.hover }} /></div>
        )}
        {m.stopped && onContinue && <StoppedRow at={m.stopped.at} finished={m.stopped.finished} cancelled={m.stopped.cancelled} onContinue={onContinue} panel={panel} />}

        {!m.streaming && (m.content || sources.length > 0) && confirmations.length === 0 && (panel ? <SourceStrip sources={sources} hot={hot} setHot={setHot} /> : <SourceChips sources={sources} hot={hot} setHot={setHot} />)}
      </div>
    </div>
  );
}
