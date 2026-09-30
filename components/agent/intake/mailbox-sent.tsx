"use client";

// Agent mailbox §M13: the reader for an email the agent sent — kind, delivery from Resend, the answer line,
// the conversation, and the email as sent (same sandbox as received mail).

import { C, mono } from "../ui/tokens";
import { Button, Icon, dateLong, hmZ, hmsZ } from "../ui/primitives";
import { Tooltip } from "./controls";
import type { MailMessage } from "./api";
import { AsSentFrame } from "./mailbox-body";
import { ThreadCard, type ThreadItem } from "./mailbox-reader";
import { Card, LinkAsButton, RefLink, SmallEyebrow, deliveryMeta, parseAddr, useCopy } from "./mailbox-shared";

const EVENT_ICON: Record<string, { icon: string; color: string }> = {
  queued: { icon: "circle-dot", color: C.faint }, sent: { icon: "arrow-up-right", color: C.neutral }, delivered: { icon: "circle-check", color: C.okDot },
  delayed: { icon: "clock", color: C.warnDot }, delivery_delayed: { icon: "clock", color: C.warnDot }, bounced: { icon: "circle-x", color: C.dangerBadge },
  complained: { icon: "shield-alert", color: C.dangerBadge }, failed: { icon: "circle-x", color: C.dangerBadge }, captured: { icon: "circle-dot", color: C.neutral },
};

export function SentReader({ message, onOpenThread }: { message: MailMessage; onOpenThread: (t: ThreadItem) => void }) {
  const sent = message.sent;
  const d = deliveryMeta(sent?.delivery ?? null);
  const { copied, copy } = useCopy();
  const events = sent?.events ?? [];
  const captureNote = sent?.delivery === "captured" ? "Test mode: the email was stored here and never handed to Resend, so nobody received it." : null;
  const why = sent?.detail ?? captureNote;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.body, border: `1px solid ${C.borderControl}`, borderRadius: 6, padding: "2px 7px", background: C.surface }}>{sent?.kind ?? "Email"}</span>
          {message.request && <RefLink refText={message.request.reference} requestId={message.request.id} />}
        </div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.ink, lineHeight: 1.3, overflowWrap: "anywhere" }}>{message.subject || "(no subject)"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr)", gap: "5px 10px", fontSize: 12.5, lineHeight: 1.5 }}>
          <span style={{ color: C.faint }}>From</span><span style={{ ...mono({ fontSize: 12 }), color: C.body }}>{parseAddr(message.from).addr ?? message.from}</span>
          <span style={{ color: C.faint }}>To</span><span style={{ ...mono({ fontSize: 12, fontWeight: 600 }), color: C.ink, overflowWrap: "anywhere" }}>{message.to.join(", ")}</span>
          <span style={{ color: C.faint }}>Sent</span><span style={{ ...mono({ fontSize: 12 }), color: C.body }}>{dateLong(message.at)} · {hmZ(message.at)}</span>
          <span style={{ color: C.faint }}>Resend ID</span><span style={{ ...mono({ fontSize: 12 }), color: sent?.resendId ? C.body : C.faint }}>{sent?.resendId ?? "None · not sent through Resend"}</span>
          <span style={{ color: C.faint }}>Kept</span><span style={{ color: C.body }}>{message.retention}</span>
        </div>

        <div style={{ borderRadius: 12, padding: "12px 14px", background: d.tone.bg, border: `1px solid ${d.tone.bd}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Icon name={d.icon ?? "circle-dot"} size={18} color={d.tone.ic} style={{ marginTop: 1 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: d.tone.fg }}>{d.heading}</span>
              {why && <span style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>{why}</span>}
            </div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${d.tone.bd}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "7px 12px", background: C.page }}><SmallEyebrow>Delivery · from Resend</SmallEyebrow></div>
            {events.length === 0 && <div style={{ padding: "8px 12px", fontSize: 12.5, color: C.muted, borderTop: `1px solid ${C.dividerRow}` }}>No events from Resend yet.</div>}
            <div role="table" aria-label="Delivery events">
              {events.map((e, i) => {
                const ic = EVENT_ICON[e.event.toLowerCase()] ?? { icon: "dot", color: C.faint };
                return (
                  <div role="row" key={i} style={{ display: "grid", gridTemplateColumns: "18px 90px 96px minmax(0,1fr)", gap: 10, padding: "7px 12px", borderTop: `1px solid ${C.dividerRow}`, alignItems: "start" }}>
                    <span role="cell" style={{ display: "inline-flex", marginTop: 1 }}><Icon name={ic.icon} size={14} color={ic.color} /></span>
                    <span role="cell" style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, textTransform: "capitalize" }}>{e.event.replace(/_/g, " ")}</span>
                    <span role="cell" style={{ ...mono({ fontSize: 12 }), color: C.body }}>{hmsZ(e.at)}</span>
                    <span role="cell" style={{ ...mono({ fontSize: 11.5 }), color: C.muted, overflowWrap: "anywhere" }}>{e.detail ?? ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "0 2px" }}><SmallEyebrow>Answer</SmallEyebrow><span style={{ fontSize: 13, fontWeight: 600, color: C.body }}>No answer expected · review is on the page</span></div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {message.request && <LinkAsButton href={`/agent/intake?r=${encodeURIComponent(message.request.id)}`} icon="arrow-right" primary>Open request {message.request.reference}</LinkAsButton>}
          {sent?.resendId ? (
            <Button size="sm" variant="secondary" icon="copy" onClick={() => void copy(sent.resendId ?? "")} style={{ borderRadius: 9, padding: "6px 11px" }}>{copied ? "Copied" : "Copy Resend ID"}</Button>
          ) : (
            <Tooltip label="This email has no Resend ID: it was not sent through Resend">
              {(p) => <Button size="sm" variant="secondary" icon="copy" aria-disabled="true" {...p} style={{ borderRadius: 9, padding: "6px 11px", opacity: 0.5, cursor: "not-allowed" }}>Copy Resend ID</Button>}
            </Tooltip>
          )}
        </div>
      </Card>
      <ThreadCard message={message} onOpen={onOpenThread} />
      <section aria-label="The email as sent" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: C.page }}>
          <SmallEyebrow>As sent</SmallEyebrow>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.muted }}><Icon name="shield" size={13} color={C.muted} />Sandboxed · scripts off · links not live</span>
        </div>
        <AsSentFrame id={message.id} />
      </section>
    </div>
  );
}
