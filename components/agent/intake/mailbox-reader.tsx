"use client";

// Agent mailbox §M6–§M11: the reader for a received message, in order — header card with the understood block
// and actions, the conversation, the message, attachments, raw source and headers (folded, `u`).

import { useEffect, useState, type ReactNode } from "react";
import { C, TONE, mono, type Tone } from "../ui/tokens";
import { Icon, dateLong, dayTimeZ, hmZ, kb } from "../ui/primitives";
import { ApiError, mailboxApi, type MailMessage, type Understood } from "./api";
import { MessageCard } from "./mailbox-body";
import { MailActions } from "./mailbox-dialogs";
import { Card, RefLink, SmallEyebrow, parseAddr, useCopy } from "./mailbox-shared";

// ── §M7 What the agent understood ────────────────────────────────────────────────────────────────────────
const KIND: Record<Understood["kind"], { tone: Tone; icon: string; red?: boolean }> = {
  processed: { tone: TONE.green, icon: "circle-check" },
  notrec: { tone: TONE.red, icon: "circle-help", red: true },
  failed: { tone: TONE.red, icon: "circle-x", red: true },
  reply: { tone: TONE.blue, icon: "reply" },
  replybad: { tone: TONE.amber, icon: "message-circle-question" },
  ignored: { tone: TONE.slate, icon: "circle-minus" },
  wait: { tone: TONE.amber, icon: "hourglass" },
};
const FALLBACK_KIND: Record<string, Understood["kind"]> = { processed: "processed", not_recognised: "notrec", failed: "failed", reply: "reply", ignored: "ignored", waiting: "wait" };
const CHECK: Record<string, { icon: string; color: string; words: string }> = {
  yes: { icon: "circle-check", color: C.okDot, words: "Found" },
  no: { icon: "circle-x", color: C.dangerBadge, words: "Not found" },
  maybe: { icon: "circle-help", color: TONE.amber.ic, words: "Partly found" },
  none: { icon: "circle-minus", color: C.faint, words: "Not applicable" },
};

function UnderstoodBlock({ message }: { message: MailMessage }) {
  const u: Understood = message.understood ?? { kind: FALLBACK_KIND[message.status] ?? "wait", title: message.status === "waiting" ? "Not processed yet" : message.statusReason ?? "No reading recorded", checks: [] };
  const k = KIND[u.kind] ?? KIND.wait;
  const ref = u.ref ?? message.request?.reference ?? null;
  const ignoredBy = message.ignored;
  return (
    <div style={{ borderRadius: 12, padding: "12px 14px", background: k.tone.bg, border: k.red ? `1.5px solid ${C.dangerBadge}` : `1px solid ${k.tone.bd}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {u.kind === "wait" && message.status === "waiting" ? <span className="cw-pulse" style={{ display: "inline-flex", marginTop: 1 }}><Icon name={k.icon} size={18} color={k.tone.ic} /></span> : <Icon name={k.icon} size={18} color={k.tone.ic} style={{ marginTop: 1 }} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: k.tone.fg, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
            <span>{u.title}</span>
            {ref && <RefLink refText={ref} requestId={message.request?.id ?? null} size={12.5} />}
            {(u.refState ?? message.request?.state) && <span style={{ fontSize: 12.5, fontWeight: 600, color: C.body }}>{u.refState ?? message.request?.state}</span>}
          </div>
          {u.body && <div style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>{u.body}</div>}
          {ignoredBy && <div style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>Marked by {ignoredBy.by} · {ignoredBy.reason}{ignoredBy.note ? ` · “${ignoredBy.note}”` : ""}</div>}
        </div>
      </div>
      {u.checks.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.divider}`, overflow: "hidden" }}>
          <div style={{ padding: "7px 12px", background: C.page }}><SmallEyebrow>What the agent looked for</SmallEyebrow></div>
          <div role="table" aria-label="What the agent looked for">
            {u.checks.map(([name, st, text], i) => {
              const c = CHECK[st] ?? CHECK.none;
              return (
                <div role="row" key={i} style={{ display: "grid", gridTemplateColumns: "18px 140px minmax(0,1fr)", gap: 10, padding: "7px 12px", borderTop: `1px solid ${C.dividerRow}`, alignItems: "start" }}>
                  <span role="cell" aria-label={c.words} style={{ display: "inline-flex", marginTop: 1 }}><Icon name={c.icon} size={14} color={c.color} /></span>
                  <span role="cell" style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{name}</span>
                  <span role="cell" style={{ fontSize: 12.5, lineHeight: 1.45, color: text ? C.body : C.faint }}>{text || c.words}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {u.hint && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.body }}><b>Next step:</b> {u.hint}</div>}
    </div>
  );
}

// ── §M11 The conversation ────────────────────────────────────────────────────────────────────────────────
export type ThreadItem = MailMessage["thread"][number];
export function ThreadCard({ message, onOpen }: { message: MailMessage; onOpen: (t: ThreadItem) => void }) {
  if (!message.thread?.length) return null;
  const first = message.thread.find((t) => t.kind === "in");
  const heading = [message.request?.reference, first ? parseAddr(first.sub).name : null, "handling request"].filter(Boolean).join(" · ");
  return (
    <Card pad="14px 18px 8px" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}><SmallEyebrow>The conversation</SmallEyebrow><span style={{ fontSize: 12.5, color: C.body }}>{heading}</span></div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", maxHeight: 380, overflowY: "auto" }}>
        {message.thread.map((t, i) => {
          const bounced = t.kind === "out" && /bounced|complained|failed/i.test(t.sub);
          const dot = t.kind === "in" ? { icon: "arrow-down-left", fg: C.primaryHover, bg: C.primaryTint } : t.kind === "out" ? (bounced ? { icon: "arrow-up-right", fg: C.danger, bg: C.dangerTint } : { icon: "arrow-up-right", fg: C.neutral, bg: C.neutralTint }) : { icon: "dot", fg: C.faint, bg: C.sidebar };
          const label = t.kind === "in" ? "RECEIVED" : t.kind === "out" ? "SENT" : "EVENT";
          const last = i === message.thread.length - 1;
          const inner = (
            <>
              <span style={{ position: "relative", width: 22, flex: "none", display: "flex", justifyContent: "center" }}>
                {!last && <span aria-hidden style={{ position: "absolute", top: 24, bottom: -10, width: 2, background: C.border }} />}
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: dot.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}><Icon name={dot.icon} size={12} color={dot.fg} /></span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: C.faint }}>{label}{t.current ? " · THIS MESSAGE" : ""}</span>
                <span style={{ fontSize: 13, fontWeight: t.current ? 700 : 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span style={{ fontSize: 12, color: bounced ? C.danger : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.kind === "in" ? parseAddr(t.sub).addr ?? parseAddr(t.sub).name : t.sub}</span>
              </span>
              <span style={{ ...mono({ fontSize: 11.5 }), color: C.muted, flex: "none" }}>{dayTimeZ(t.at)}</span>
            </>
          );
          const rowStyle = { display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 8px", margin: "0 -8px 4px", borderRadius: 8, background: t.current ? C.primaryTint3 : "transparent", width: "calc(100% + 16px)", textAlign: "left" as const, fontFamily: "inherit", border: "none" };
          return (
            <li key={t.id + i}>
              {t.kind === "ev" || t.current ? <div style={rowStyle} aria-current={t.current ? "true" : undefined}>{inner}</div>
                : <button type="button" className="ag-focus cw-row" onClick={() => onOpen(t)} aria-label={`${label === "SENT" ? "Open sent email" : "Open received email"}: ${t.title}`} style={{ ...rowStyle, cursor: "pointer" }}>{inner}</button>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ── §M9 Attachments ──────────────────────────────────────────────────────────────────────────────────────
function tileFor(name: string) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? "").toUpperCase();
  const tone = ext === "PDF" ? TONE.red : ["XLSX", "XLS", "CSV"].includes(ext) ? TONE.green : ext === "EML" ? TONE.blue : TONE.slate;
  return { ext: ext || "FILE", tone };
}
function AttachmentsCard({ message }: { message: MailMessage }) {
  if (!message.attachments.length) return null;
  return (
    <Card pad="14px 18px" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SmallEyebrow>Attachments · open in a new tab</SmallEyebrow>
      {message.attachments.map((a) => {
        const t = tileFor(a.name);
        return (
          <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 10px", border: `1px solid ${C.divider}`, borderRadius: 10 }}>
            <span aria-hidden style={{ width: 30, height: 36, borderRadius: 5, background: t.tone.bg, color: t.tone.fg, ...mono({ fontSize: 9.5, fontWeight: 700 }), display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{t.ext.slice(0, 4)}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
              <span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), color: C.ink, overflowWrap: "anywhere" }}>{a.name}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{a.type} · {kb(a.bytes)}</span>
              {a.role && <span style={{ fontSize: 12, lineHeight: 1.45, color: C.body }}><b style={{ fontWeight: 600, textTransform: "capitalize" }}>{a.role}</b>{a.why ? ` · ${a.why}` : ""}</span>}
              {a.personal && !a.purged && <span style={{ fontSize: 12, color: TONE.amber.fg }}>Contains personal data. Opening or downloading it is logged under your name.</span>}
              {a.purged && <span style={{ fontSize: 12, color: C.muted }}>Removed by retention.</span>}
            </div>
            {!a.purged && (
              <span style={{ display: "flex", gap: 6, flex: "none" }}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="ag-focus ag-hover" aria-label={`Open ${a.name} in a new tab`} style={attBtn}><Icon name="eye" size={13} color={C.body} />Open</a>
                <a href={`${a.url}?download=1`} className="ag-focus ag-hover" aria-label={`Download ${a.name}`} style={attBtn}><Icon name="download" size={13} color={C.body} />Download</a>
              </span>
            )}
          </div>
        );
      })}
    </Card>
  );
}
const attBtn = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 8, padding: "5px 9px", textDecoration: "none" } as const;

// ── §M10 Raw source and headers ──────────────────────────────────────────────────────────────────────────
function authTone(v: string | undefined) { return v === "pass" ? TONE.green : v && v !== "none" ? TONE.red : TONE.slate; }
function RawSection({ message, open, onToggle }: { message: MailMessage; open: boolean; onToggle: () => void }) {
  const [raw, setRaw] = useState<{ headers: [string, string][]; raw: string; auth: MailMessage["auth"] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopy();
  useEffect(() => {
    if (!open || raw) return; let dead = false;
    mailboxApi.raw(message.id).then((r) => { if (!dead) setRaw(r); }).catch((e) => { if (!dead) setError(e instanceof ApiError ? e.message : "The server did not answer."); });
    return () => { dead = true; };
  }, [open, raw, message.id]);
  const auth = raw?.auth ?? message.auth ?? {};
  return (
    <Card pad={0}>
      <button type="button" className="ag-focus" aria-expanded={open} onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "none", border: "none", fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={14} color={C.muted} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Raw source and headers</span>
        <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message.rfcMessageId ?? ""}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>{open ? "Hide" : "Show · u"}</span>
      </button>
      {open && (
        <div className="cw-expand" style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {(["spf", "dkim", "dmarc"] as const).map((k) => { const v = auth?.[k]; const t = authTone(v); return <span key={k} style={{ ...mono({ fontSize: 11.5, fontWeight: 600 }), color: t.fg, background: t.bg, borderRadius: 6, padding: "3px 8px" }}>{k.toUpperCase()} {v ?? "none"}</span>; })}
            <span style={{ flex: 1 }} />
            <button type="button" className="ag-focus" disabled={!raw} onClick={() => raw && void copy(raw.raw)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.primary, background: "none", border: "none", cursor: raw ? "pointer" : "default", padding: 0 }}>{copied ? "Copied" : "Copy all"}</button>
            <a href={mailboxApi.rawDownloadUrl(message.id)} className="ag-focus" style={{ fontSize: 12, fontWeight: 600, color: C.primary, textDecoration: "none" }}>Download .eml</a>
          </div>
          {error && <div role="alert" style={{ fontSize: 13, color: C.danger }}>{error}</div>}
          {!raw && !error && <div aria-busy="true" style={{ fontSize: 12.5, color: C.faint }}>Loading the raw source…</div>}
          {raw && (
            <>
              <div role="table" aria-label="Headers, in received order" style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
                {raw.headers.map(([k, v], i) => (
                  <div role="row" key={i} style={{ display: "grid", gridTemplateColumns: "170px minmax(0,1fr)", gap: 10, padding: "5px 10px", borderTop: i ? `1px solid ${C.dividerRow}` : "none", ...mono({ fontSize: 11.5 }), lineHeight: 1.5 }}>
                    <span role="cell" style={{ color: C.muted, overflowWrap: "anywhere" }}>{k}</span>
                    <span role="cell" style={{ color: C.ink, overflowWrap: "anywhere" }}>{v}</span>
                  </div>
                ))}
              </div>
              <pre tabIndex={0} aria-label="Raw message source" className="ag-focus" style={{ margin: 0, ...mono({ fontSize: 11.5 }), lineHeight: 1.6, background: C.sidebar, borderRadius: 10, padding: "10px 12px", maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: C.body }}>{raw.raw}</pre>
            </>
          )}
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Personal data in the raw source is masked the same way as the body. Download .eml gives the message exactly as received, personal data included, and is logged under your name.</div>
        </div>
      )}
    </Card>
  );
}

const ACTION_WORDS: Record<string, string> = { ignore: "Marked as ignored", unignore: "Not ignored · reprocess", reprocess: "Reprocessed", "process-handling": "Processed as handling request" };

// ── The reader ───────────────────────────────────────────────────────────────────────────────────────────
function Grid({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr)", gap: "5px 10px", fontSize: 12.5, lineHeight: 1.5 }}>
      {rows.map(([k, v]) => <div key={k} style={{ display: "contents" }}><span style={{ color: C.faint }}>{k}</span><span style={{ color: C.body, overflowWrap: "anywhere" }}>{v}</span></div>)}
    </div>
  );
}

export function ReceivedReader({ message, runAs, capture, plain, setPlain, rawOpen, setRawOpen, onChanged, onOpenThread }: { message: MailMessage; runAs: string; capture: boolean; plain: boolean; setPlain: (v: boolean) => void; rawOpen: boolean; setRawOpen: (v: boolean) => void; onChanged: (m?: MailMessage) => void; onOpenThread: (t: ThreadItem) => void }) {
  const from = parseAddr(message.from);
  const known = message.understood?.checks.find(([n]) => n === "Known sender");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.ink, lineHeight: 1.3, overflowWrap: "anywhere" }}>{message.subject || "(no subject)"}</h2>
        <Grid rows={[
          ["From", <span key="f"><b style={{ color: C.ink }}>{from.name}</b>{from.addr && from.addr !== from.name && <span style={{ ...mono({ fontSize: 12 }), color: C.muted }}> {from.addr}</span>}{known && <span style={{ fontWeight: 600, color: known[1] === "yes" ? C.ok : TONE.amber.fg }}> {known[1] === "yes" ? "· known sender" : "· unknown sender"}</span>}</span>],
          ["To", <span key="t" style={mono({ fontSize: 12 })}>{message.to.join(", ")}</span>],
          ...(message.cc?.length ? [["Cc", <span key="c" style={mono({ fontSize: 12 })}>{message.cc.join(", ")}</span>] as [string, ReactNode]] : []),
          ["Received", <span key="r" style={mono({ fontSize: 12 })}>{dateLong(message.at)} · {hmZ(message.at)}</span>],
          ["Kept", message.retention],
        ]} />
        <UnderstoodBlock message={message} />
        <MailActions message={message} runAs={runAs} capture={capture} onChanged={onChanged} />
        {message.history.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: C.muted }}>
            <SmallEyebrow>History</SmallEyebrow>
            {message.history.map((h, i) => <span key={i}><span style={mono({ fontSize: 11.5 })}>{dayTimeZ(h.at)}</span> · {h.by} · {h.action === "forward" ? `Forwarded to ${h.to ?? "someone"}` : ACTION_WORDS[h.action] ?? h.action}{h.status ? ` (was ${h.status.replace(/_/g, " ")})` : ""}</span>)}
          </div>
        )}
      </Card>
      <ThreadCard message={message} onOpen={onOpenThread} />
      <MessageCard key={message.id} id={message.id} plain={plain} setPlain={setPlain} onOpenRaw={() => setRawOpen(true)} />
      <AttachmentsCard message={message} />
      <RawSection key={`raw-${message.id}`} message={message} open={rawOpen} onToggle={() => setRawOpen(!rawOpen)} />
    </div>
  );
}
