"use client";

// Verbatim block — the ink frame (design spec §4.8), and "Agent's reading".
//
// §3 rule 1: the text inside is the stored clause, fetched BY ID from the
// authoritative store when the block mounts. The frame never renders model
// text. If the fetch fails it shows an error in the frame's place — not the
// reply's copy of the text, and never a paraphrase. §3 rule 2: nothing else in
// the product uses this ink header.

import { useEffect, useState } from "react";
import { C, TYPE, mono } from "../ui/tokens";
import { Button, Icon, Eyebrow, dateLong } from "../ui/primitives";
import { AGENT_BASE, type VerbatimRecord } from "../types";
import { useOpenDocument } from "../viewer/useOpenDocument";

type Fetched = { status: "loading" } | { status: "ok"; record: VerbatimRecord } | { status: "error"; message: string };

export function VerbatimFrame({ record, panel = false, notReadAloud = false }: { record: VerbatimRecord; panel?: boolean; notReadAloud?: boolean }) {
  const [state, setState] = useState<Fetched>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const od = useOpenDocument();

  useEffect(() => {
    let alive = true;
    const kind = record.kind ?? "limitation";
    fetch(`${AGENT_BASE}/api/verbatim/${kind}/${encodeURIComponent(record.id)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => { const body = await r.json().catch(() => null); if (!alive) return; if (r.ok && body?.ok && body.record) setState({ status: "ok", record: { ...record, ...body.record, text: String(body.record.text) } }); else setState({ status: "error", message: body?.message || `The stored text could not be fetched (HTTP ${r.status}).` }); })
      .catch((e) => { if (alive) setState({ status: "error", message: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [record.id, record.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.status === "error") return <VerbatimUnavailable id={record.id} heading={record.heading} message={state.message} panel={panel} />;

  const r = state.status === "ok" ? state.record : record;
  const ref = [r.reference ?? r.id, r.version ? `rev ${r.version}` : null].filter(Boolean).join(" · ");
  const approved = r.approvedBy ? `Approved ${r.approvedAt ? dateLong(r.approvedAt) : ""} by ${r.approvedBy}` : r.updatedAt ? `Stored ${dateLong(r.updatedAt)}` : null;
  const validity = [r.effectiveFrom, r.effectiveTo].filter(Boolean).join(" – ");

  async function copyExact() {
    if (state.status !== "ok") return;
    try { await navigator.clipboard.writeText(state.record.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); }
  }

  return (
    <div data-verbatim-frame style={{ border: `1.5px solid ${C.ink}`, borderRadius: panel ? 10 : 12, background: C.surface, overflow: "hidden" }}>
      <div style={{ background: C.ink, color: C.surface, padding: panel ? "7px 11px" : "9px 14px", display: "flex", flexDirection: panel ? "column" : "row", alignItems: panel ? "flex-start" : "center", gap: panel ? 1 : 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {!panel && <Icon name="stamp" size={15} color={C.surface} />}
          <span style={panel ? TYPE.verbatimHeaderPanel : TYPE.verbatimHeader}>{notReadAloud ? `Verbatim · ${r.reference ?? r.id} · not read aloud` : "Verbatim · approved text"}</span>
        </span>
        {!panel && <span style={{ fontSize: 12, color: C.disabled }}>Reproduced exactly. Not summarised.</span>}
        {!panel && <span style={{ flex: 1 }} />}
        <span style={{ ...mono({ fontSize: panel ? 10.5 : 11.5 }), color: C.disabled, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{ref}</span>
      </div>
      <div style={{ padding: panel ? "10px 11px" : "16px 18px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {r.heading && !panel && <div style={{ fontSize: 12.5, fontWeight: 700, color: C.body }}>{r.heading}</div>}
        {state.status === "loading" ? (
          <div aria-busy style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ height: 12, width: "90%", borderRadius: 4, background: C.hover }} /><div style={{ height: 12, width: "70%", borderRadius: 4, background: C.hover }} />
          </div>
        ) : (
          <div style={{ ...(panel ? TYPE.verbatimPanel : TYPE.verbatim), color: C.ink, whiteSpace: "pre-wrap", userSelect: "text" }}>{state.record.text}</div>
        )}
      </div>
      <div style={{ padding: panel ? "8px 11px" : "10px 18px 12px", borderTop: `1px dashed ${C.borderControl}`, display: "flex", flexDirection: panel ? "column" : "row", flexWrap: "wrap", alignItems: panel ? "flex-start" : "center", gap: panel ? 6 : 14 }}>
        {(approved || validity) && (
          <span style={{ fontSize: panel ? 11.5 : 12, color: C.muted }}>
            {approved && <>{approved.split(" by ")[0]}{r.approvedBy ? <> by <span style={{ fontWeight: 600, color: C.body }}>{r.approvedBy}</span></> : null} · authoritative tier</>}
            {validity && <> · valid <span style={mono()}>{validity}</span></>}
          </span>
        )}
        {r.sha256 && !panel && <span style={{ ...mono({ fontSize: 11 }), color: C.faint }}>sha256 {r.sha256.slice(0, 4)}…{r.sha256.slice(-4)}</span>}
        {!panel && <span style={{ flex: 1 }} />}
        <span style={{ display: "flex", gap: 6 }}>
          <Button variant="secondary" size="xs" icon="copy" onClick={() => void copyExact()} disabled={state.status !== "ok"} style={{ fontSize: panel ? 12 : 12.5 }}>{copied ? "Copied" : panel ? "Copy exact" : "Copy exact text"}</Button>
          {(r.documentId || r.page != null || r.kind === "tier1") && <Button variant="secondary" size="xs" icon="eye" style={{ fontSize: panel ? 12 : 12.5 }} disabled={!r.documentId} title={r.documentId ? "Open the source document and check the quoted text" : "No source file for this record"} onClick={(e) => void od.openVerbatim(r, null, e.currentTarget)}>{panel ? `Open${r.page != null ? ` p. ${r.page}` : ""}` : `Open source${r.page != null ? ` · p. ${r.page}` : ""}`}</Button>}
        </span>
      </div>
    </div>
  );
}

/** §3 rule 1: the clause could not be fetched — an error, never a fallback. */
export function VerbatimUnavailable({ id, heading, message, panel }: { id: string; heading: string; message: string; panel: boolean }) {
  return (
    <div role="alert" style={{ border: `1px solid ${C.dangerBorder}`, borderRadius: panel ? 10 : 12, background: C.surface, padding: panel ? 12 : "14px 16px", display: "flex", gap: 12 }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: C.dangerTint, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="stamp" size={16} color={C.dangerBadge} /></span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Approved text unavailable</div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.danger }}>VERBATIM NOT SHOWN</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.body }}>The stored clause for <span style={mono()}>{id}</span>{heading ? ` (${heading})` : ""} could not be fetched, so it is not shown — nothing here is a paraphrase of it.</div>
        <div style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>{message}</div>
      </div>
    </div>
  );
}

/** The synthesised text next to a quote — deliberately quieter (§4.8). */
export function AgentsReading({ children, panel = false }: { children: React.ReactNode; panel?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Eyebrow small={panel} icon={panel ? undefined : "pen-line"} color={C.faint}>{panel ? "Agent's reading" : "Agent's reading — check against the quoted text"}</Eyebrow>
      <div style={{ ...(panel ? TYPE.bodyPanel : TYPE.body), color: C.body }}>{children}</div>
    </div>
  );
}
