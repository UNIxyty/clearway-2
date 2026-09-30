"use client";

// Agent mailbox §M4 / §M13 rows: status first, agent-written "what happened" on line 3, never a body snippet.
// A row is a card-link: an invisible full-size button selects it; the REF link sits above it.

import type { ReactNode } from "react";
import { C, TONE, mono } from "../ui/tokens";
import { Icon, dayTimeZ } from "../ui/primitives";
import { StatusPill } from "./controls";
import type { MailRow } from "./api";
import { AddrChip, RefLink, deliveryMeta, parseAddr, statusMeta } from "./mailbox-shared";

export function rowIsNeeds(r: MailRow) { return r.direction === "outbound" ? deliveryMeta(r.delivery).needs : ["not_recognised", "failed", "waiting"].includes(r.status); }

export function MailListRow({ r, selected, flash, isNew, addresses, onSelect, setRef }: { r: MailRow; selected: boolean; flash: boolean; isNew: boolean; addresses: string[]; onSelect: () => void; setRef: (el: HTMLDivElement | null) => void }) {
  const out = r.direction === "outbound";
  const meta = out ? deliveryMeta(r.delivery) : statusMeta(r.status);
  const needs = rowIsNeeds(r);
  const sender = out ? `To ${r.to.join(", ")}` : parseAddr(r.from).name;
  const addr = out ? parseAddr(r.from).addr : r.to.find((a) => addresses.includes(a)) ?? r.to[0] ?? null;
  const replyBad = r.status === "reply" && /^not understood/i.test(r.what);
  const whatColor = out ? C.body : r.status === "not_recognised" || r.status === "failed" ? C.danger : r.status === "waiting" ? TONE.amber.fg : replyBad ? C.danger : r.status === "ignored" ? C.muted : C.body;
  const whatWeight = !out && (r.status === "not_recognised" || r.status === "failed" || r.status === "waiting") ? 600 : 400;
  const edge = selected ? C.primary : meta.edge;
  const time = dayTimeZ(r.at);
  return (
    <div ref={setRef} data-row-id={r.id} className={`${isNew ? "cw-expand cw-flash-blue" : flash ? "cw-flash-blue" : ""}`}
      style={{ position: "relative", padding: "11px 14px", borderBottom: `1px solid ${C.dividerRow}`, display: "flex", flexDirection: "column", gap: 4, background: selected ? C.primaryTint3 : undefined, boxShadow: edge ? `inset 3px 0 0 ${edge}` : undefined, opacity: !out && r.status === "ignored" ? 0.78 : 1 }}>
      <button type="button" className="ag-focus mb-rowbtn" aria-current={selected ? "true" : undefined} onClick={onSelect}
        aria-label={`${meta.label}. ${sender}. ${r.subject ?? "No subject"}. ${time}.${r.attachments ? ` ${r.attachments} attachment${r.attachments === 1 ? "" : "s"}.` : ""}`}
        style={{ position: "absolute", inset: 0, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0 }} />
      <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, pointerEvents: "none" }}>
        <StatusPill tone={meta.tone} icon={meta.icon} pulse={meta.pulse}>{meta.label}</StatusPill>
        <span style={{ fontSize: 13, fontWeight: needs ? 700 : 600, color: C.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sender}</span>
        {r.attachments > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, color: C.muted, flex: "none" }}><Icon name="paperclip" size={11} color={C.muted} />{r.attachments}</span>}
        <span style={{ ...mono({ fontSize: 11.5 }), color: C.muted, flex: "none" }}>{time}</span>
      </div>
      <div aria-hidden style={{ fontSize: 13, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pointerEvents: "none" }}>{r.subject || "(no subject)"}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span aria-hidden style={{ fontSize: 12, fontWeight: whatWeight, color: whatColor, flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pointerEvents: "none" }}>{r.what || (r.status === "waiting" ? "In the queue" : meta.label)}</span>
        {r.ref && <RefLink refText={r.ref} requestId={r.requestId} />}
        <span style={{ flex: 1 }} />
        {addr && <span aria-hidden style={{ pointerEvents: "none", display: "inline-flex" }}><AddrChip addr={addr} /></span>}
      </div>
      {r.matched && <div aria-hidden style={{ fontSize: 11.5, color: C.muted, pointerEvents: "none" }}>{r.matched}</div>}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading messages">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} style={{ padding: "12px 14px", borderBottom: `1px solid ${C.dividerRow}`, display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ height: 10, width: `${40 + ((i * 13) % 30)}%`, borderRadius: 5, background: C.hover }} />
          <span style={{ height: 9, width: `${65 + ((i * 7) % 25)}%`, borderRadius: 5, background: C.hover }} />
          <span style={{ height: 9, width: "40%", borderRadius: 5, background: C.dividerRow }} />
        </div>
      ))}
    </div>
  );
}

/** §M15.3 signal 3: the gap marker at the top of the list. */
export function GapMarker({ address, lastAt, why }: { address: string; lastAt: string | null; why: string | null }) {
  const local = `${address.split("@")[0]}@`;
  return (
    <div role="note" style={{ margin: "10px 12px", border: `1.5px dashed ${C.dangerBadge}`, background: C.dangerWashSoft, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.danger }}>{lastAt ? `Nothing from ${local} since ${dayTimeZ(lastAt)}` : `Nothing can arrive on ${local}`}</span>
      <span style={{ fontSize: 12.5, lineHeight: 1.45, color: C.body }}>{why ? `${why}. ` : ""}The gap is the connection, not the senders.{lastAt ? " Rows below it arrived before it failed." : ""}</span>
    </div>
  );
}

export function NewChip({ n, onShow }: { n: number; onShow: () => void }): ReactNode {
  return (
    <div style={{ position: "sticky", top: 8, zIndex: 3, display: "flex", justifyContent: "center", height: 0, overflow: "visible" }}>
      <button type="button" className="ag-focus cw-fade" onClick={onShow} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.surface, background: C.primary, border: "none", borderRadius: 999, padding: "5px 12px", cursor: "pointer", boxShadow: "none" }}>
        <Icon name="arrow-up" size={12} color={C.surface} />{n} new · Show
      </button>
    </div>
  );
}
