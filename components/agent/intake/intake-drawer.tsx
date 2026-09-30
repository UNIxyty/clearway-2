"use client";

// The original email (§I9): a right drawer, as received. The body comes from the agent mailbox in text mode,
// where personal data is already masked; the full message (and reveal) lives in the mailbox.

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { C, mono } from "../ui/tokens";
import { Icon, dayTimeZ, kb } from "../ui/primitives";
import { Drawer, Tag } from "./controls";
import { mailboxApi, type RequestDetail } from "./api";
import { EYEBROW, errText, plural } from "./intake-shared";

export function OriginalEmailDrawer({ detail, open, onClose }: { detail: RequestDetail; open: boolean; onClose: () => void }) {
  const titleId = useId();
  const r = detail.request;
  const [body, setBody] = useState<{ text: string; masks: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open || body || err) return;
    let live = true;
    mailboxApi.body(r.messageId, "text", false)
      .then((x) => { if (live) setBody(x.body.purged ? { text: "", masks: 0 } : { text: x.body.text ?? "", masks: x.body.masks ?? 0 }); })
      .catch((e) => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [open, r.messageId, body, err]);
  const atts = detail.attachments.filter((a) => !a.inline);
  const anyPersonal = atts.some((a) => a.personal);
  return (
    <Drawer open={open} onClose={onClose} labelledBy={titleId}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span id={titleId} style={{ fontSize: 15, fontWeight: 700 }}>Original email</span>
            <span style={{ fontSize: 12, color: C.muted }}>As received. The agent never edits it. <span style={mono()}>{r.reference}</span></span>
          </div>
          <button type="button" className="ag-focus" onClick={onClose} style={{ fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
            Close<span style={{ ...mono({ fontSize: 11 }), color: C.muted }}>Esc</span>
          </button>
        </div>
        <div style={{ padding: "14px 20px", display: "grid", gridTemplateColumns: "70px 1fr", rowGap: 5, fontSize: 12.5, borderBottom: `1px solid ${C.divider}` }}>
          <span style={{ color: C.faint }}>From</span><span style={{ overflowWrap: "anywhere" }}>{r.sender && r.fromAddr && r.sender !== r.fromAddr.replace(/"/g, "") ? `${r.sender} · ${r.fromAddr}` : r.fromAddr ?? r.sender ?? "—"}</span>
          <span style={{ color: C.faint }}>To</span><span style={{ overflowWrap: "anywhere" }}>{(r.toAddrs ?? []).join(", ") || "—"}</span>
          <span style={{ color: C.faint }}>Received</span><span style={mono({ fontSize: 12 })}>{dayTimeZ(r.receivedAt, { alwaysDate: true })}</span>
          <span style={{ color: C.faint }}>Subject</span><span style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{r.subject ?? "(no subject)"}</span>
        </div>
        <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {r.purged ? (
            <span style={{ fontSize: 13, color: C.muted }}>The email body and attachments were removed by retention ({detail.retention.days} days).</span>
          ) : body ? (
            <>
              {body.masks > 0 && <span style={{ fontSize: 12, color: C.muted }}>{plural(body.masks, "personal value")} masked here. The agent mailbox can show them, logged.</span>}
              <pre style={{ margin: 0, ...mono({ fontSize: 12.5 }), lineHeight: 1.6, color: C.ink, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{body.text || "(empty body)"}</pre>
            </>
          ) : err ? (
            <span style={{ fontSize: 12.5, color: C.muted }}>The body could not be loaded here ({err}).</span>
          ) : (
            <span style={{ fontSize: 12.5, color: C.faint }}>Loading the body…</span>
          )}
          <Link href={`/agent/mailbox?m=${encodeURIComponent(r.messageId)}`} className="ag-focus" style={{ fontSize: 13, fontWeight: 600, color: C.primary, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="inbox" size={14} color={C.primary} />Open in the agent mailbox
          </Link>
          {atts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={EYEBROW}>Attachments</span>
              {atts.map((a) => {
                const bad = a.role === "unreadable";
                const status = bad ? "Could not read" : a.personal ? "Read · contains personal data" : a.read ? "Read" : "Not read";
                return (
                  <div key={a.id ?? a.name} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${bad ? C.dangerBorder : C.border}`, background: bad ? C.dangerTint : C.surface, borderRadius: 10, padding: "10px 12px" }}>
                    <Icon name={bad ? "file-x" : "file-text"} size={18} color={bad ? C.dangerBadge : C.muted} />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), overflowWrap: "anywhere" }}>{a.name}</span>
                      <span style={{ fontSize: 12, color: bad ? C.danger : C.muted }}>{kb(a.bytes)}{a.pages ? ` · ${plural(a.pages, "page")}` : ""} · {status}</span>
                    </div>
                    <Tag tone={{ fg: C.neutral, bg: C.neutralTint }}>{a.role.toUpperCase()}</Tag>
                    {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="ag-focus" style={{ fontSize: 12.5, fontWeight: 600, color: C.primary, whiteSpace: "nowrap" }}>Open ↗</a>}
                  </div>
                );
              })}
              {anyPersonal && <span style={{ fontSize: 12, lineHeight: 1.5, color: C.muted }}>Attachments with personal data open in a new tab, and opening one is logged, the same as Show personal data.</span>}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
