"use client";

// Rich reply cards (design spec §4.9–§4.14): flight, airport summary, document
// result, generated file, table, mono block. Every card is built from a tool
// RESULT the backend returned — a card is never the model's account of a
// thing. Codes, times, deltas and raw reports are mono (§3 rule 14).

import { useState } from "react";
import { C, mono } from "../ui/tokens";
import { Button, Icon, Pill, Tag, Eyebrow, hmZ, kb } from "../ui/primitives";
import { AGENT_BASE, type AirportData, type DocumentData, type FileData, type FlightCardData, type MonoData, type TableData } from "../types";
import { useOpenDocument } from "../viewer/useOpenDocument";

// ── §4.9 Flight card ──────────────────────────────────────────────────────────
const deltaMin = (sched: string | null | undefined, est: string | null | undefined) => {
  if (!sched || !est) return null; const a = new Date(sched).getTime(), b = new Date(est).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null; return Math.round((b - a) / 60000);
};
function Delta({ minutes }: { minutes: number | null }) {
  if (minutes == null) return null;
  if (minutes <= 0) return <span style={{ ...mono({ fontSize: 12.5 }), color: C.faint }}>—</span>;
  return <span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), color: C.warn }}>+{minutes}</span>;
}

export function FlightCard({ flight: f, panel = false, onOpen }: { flight: FlightCardData; panel?: boolean; onOpen?: (f: FlightCardData) => void }) {
  const dDep = deltaMin(f.scheduledDeparture, f.estimatedDeparture), dArr = deltaMin(f.scheduledArrival, f.estimatedArrival);
  const delayed = (dDep ?? 0) > 0 || /delay/i.test(String(f.status ?? ""));
  const markers: Array<{ label: React.ReactNode; fg: string; bg: string }> = [];
  if (f.ctot) markers.push({ label: <>CTOT <span style={mono()}>{hmZ(f.ctot) || f.ctot}</span></>, fg: C.warn, bg: C.warnTint });
  if (f.notamUnreviewed?.length) markers.push({ label: <>NOTAM unreviewed · <span style={mono()}>{f.notamUnreviewed.join(", ")}</span></>, fg: C.danger, bg: C.dangerTint });
  if (f.limitationCount) markers.push({ label: `${f.limitationCount} limitation${f.limitationCount > 1 ? "s" : ""}`, fg: C.warn, bg: C.warnTint });
  if (f.importantCount) markers.push({ label: `${f.importantCount} IMP`, fg: C.warn, bg: C.warnTint });
  if (f.status && !delayed) markers.push({ label: String(f.status), fg: C.neutral, bg: C.neutralTint });

  if (panel) {
    return (
      <div role="group" aria-label={`Flight ${f.callsign ?? f.flightId}`} className={onOpen ? "ag-card-hover ag-hover" : undefined} onClick={onOpen ? () => onOpen(f) : undefined} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.dividerRow}` }}>
          <span style={mono({ fontSize: 15, fontWeight: 600 })}>{f.callsign ?? f.flightId}</span>
          <span style={{ fontSize: 12, color: C.muted, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[f.operatorId, f.registration ? <span key="r" style={mono()}>{f.registration}</span> : null, f.aircraftType].filter(Boolean).map((x, i) => <span key={i}>{i > 0 ? " · " : ""}{x}</span>)}</span>
          {dDep != null && dDep > 0 ? <Pill fg={C.warn} bg={C.warnTint} style={{ fontSize: 11.5, padding: "3px 8px" }}><span style={mono()}>+{dDep}</span></Pill> : f.ctot ? <Pill fg={C.warn} bg={C.warnTint} style={{ fontSize: 11.5, padding: "3px 8px" }}>CTOT</Pill> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", padding: "10px 12px", ...mono() }}>
          <div><div style={{ fontSize: 17, fontWeight: 600 }}>{f.departureIcao ?? "—"}</div><div style={{ fontSize: 11.5, color: C.body }}>{hmZ(f.scheduledDeparture) || "no time"}{f.estimatedDeparture && dDep ? <> → <span style={{ color: C.warn, fontWeight: 600 }}>{hmZ(f.estimatedDeparture)}</span></> : null}</div></div>
          <Icon name="arrow-right" size={14} color={C.faint} />
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 17, fontWeight: 600 }}>{f.arrivalIcao ?? "—"}</div><div style={{ fontSize: 11.5, color: C.body }}>{hmZ(f.scheduledArrival) || "no time"}{f.estimatedArrival && dArr ? <> → <span style={{ color: C.warn, fontWeight: 600 }}>{hmZ(f.estimatedArrival)}</span></> : null}</div></div>
        </div>
        {markers.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 12px", background: C.page, borderTop: `1px solid ${C.dividerRow}` }}>{markers.map((m, i) => <Tag key={i} fg={m.fg} bg={m.bg}>{m.label}</Tag>)}</div>}
      </div>
    );
  }
  return (
    <div role="group" aria-label={`Flight ${f.callsign ?? f.flightId}`} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${C.divider}` }}>
        <span style={mono({ fontSize: 18, fontWeight: 600, letterSpacing: "0.02em" })}>{f.callsign ?? f.flightId}</span>
        <span style={{ fontSize: 13.5, color: C.muted, flex: 1 }}>{f.operatorId}{f.registration ? <> · <span style={{ ...mono({ fontSize: 12.5 }), color: C.body }}>{f.registration}</span></> : null}{f.aircraftType ? ` · ${f.aircraftType}` : ""}</span>
        {delayed && <Pill fg={C.warn} bg={C.warnTint}>Delayed{f.ctot ? " · CTOT" : ""}</Pill>}
        {f.onWall && <Pill fg={C.ok} bg={C.okTint}>On wall</Pill>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: 12, alignItems: "center", padding: "16px 18px" }}>
        <div><div style={mono({ fontSize: 22, fontWeight: 600 })}>{f.departureIcao ?? "—"}</div>{f.departureCity && <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>{f.departureCity}</div>}<div style={{ display: "flex", gap: 16, ...mono({ fontSize: 12.5 }) }}><span><span style={{ color: C.faint }}>STD </span>{hmZ(f.scheduledDeparture) || "—"}</span>{f.estimatedDeparture && <span><span style={{ color: C.faint }}>ETD </span>{hmZ(f.estimatedDeparture)} <Delta minutes={dDep} /></span>}</div></div>
        <div style={{ position: "relative", height: 1, background: C.borderControl }}><span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", background: C.surface, padding: "0 2px" }}><Icon name="plane" size={16} color={C.faint} /></span></div>
        <div style={{ textAlign: "right" }}><div style={mono({ fontSize: 22, fontWeight: 600 })}>{f.arrivalIcao ?? "—"}</div>{f.arrivalCity && <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>{f.arrivalCity}</div>}<div style={{ display: "flex", gap: 16, justifyContent: "flex-end", ...mono({ fontSize: 12.5 }) }}><span><span style={{ color: C.faint }}>STA </span>{hmZ(f.scheduledArrival) || "—"}</span>{f.estimatedArrival && <span><span style={{ color: C.faint }}>ETA </span>{hmZ(f.estimatedArrival)} <Delta minutes={dArr} /></span>}</div></div>
      </div>
      <div style={{ background: C.page, borderTop: `1px solid ${C.divider}`, padding: "11px 18px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {markers.map((m, i) => <Pill key={i} fg={m.fg} bg={m.bg} style={{ fontWeight: i === 1 && f.notamUnreviewed?.length ? 700 : 600 }}>{m.label}</Pill>)}
        <span style={{ flex: 1 }} />
        <a href={`/digital-wall/console/flights?flight=${encodeURIComponent(f.flightId)}`} style={{ textDecoration: "none" }}><Button variant="secondary" size="sm">Open in Flights</Button></a>
      </div>
    </div>
  );
}

/** Dense grouped rows (2a) for several results; a row expands to the spacious card. */
export function FlightRows({ flights, panel = false }: { flights: FlightCardData[]; panel?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const limit = panel ? 2 : 4;
  const shown = showAll ? flights : flights.slice(0, limit);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        {shown.map((f) => {
          const dDep = deltaMin(f.scheduledDeparture, f.estimatedDeparture), dArr = deltaMin(f.scheduledArrival, f.estimatedArrival);
          return (
            <div key={f.flightId}>
              <button type="button" className="ag-row-hover ag-focus" onClick={() => setOpen(open === f.flightId ? null : f.flightId)} style={{ width: "100%", textAlign: "left", display: "grid", gridTemplateColumns: "24px 76px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.dividerRow}`, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="plane" size={14} color={C.muted} />
                <span style={mono({ fontSize: 13, fontWeight: 600 })}>{f.callsign ?? f.flightId}</span>
                <span style={{ ...mono({ fontSize: 12 }), color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.departureIcao ?? "—"} {hmZ(f.estimatedDeparture ?? f.scheduledDeparture)} {dDep ? <span style={{ color: C.warn }}>+{dDep}</span> : null} → {f.arrivalIcao ?? "—"} {hmZ(f.estimatedArrival ?? f.scheduledArrival)} {dArr ? <span style={{ color: C.warn }}>+{dArr}</span> : null}{f.registration ? ` · ${f.registration}` : ""}</span>
                <span style={{ display: "flex", gap: 4 }}>{f.ctot && <Tag fg={C.warn} bg={C.warnTint} style={{ fontSize: 10.5, borderRadius: 4, padding: "2px 6px" }}>CTOT</Tag>}{f.notamUnreviewed?.length ? <Tag fg={C.danger} bg={C.dangerTint} style={{ fontSize: 10.5, borderRadius: 4, padding: "2px 6px" }}>NOTAM</Tag> : null}{f.limitationCount ? <Tag fg={C.warn} bg={C.warnTint} style={{ fontSize: 10.5, borderRadius: 4, padding: "2px 6px" }}>LIM</Tag> : null}</span>
              </button>
              {open === f.flightId && <div style={{ padding: 10, background: C.page }}><FlightCard flight={f} panel={panel} /></div>}
            </div>
          );
        })}
      </div>
      {flights.length > limit && !showAll && <button type="button" className="ag-focus" onClick={() => setShowAll(true)} style={{ alignSelf: "flex-start", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.primaryHover, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>+{flights.length - limit} more flights</button>}
    </div>
  );
}

// ── §4.10 Airport summary ─────────────────────────────────────────────────────
function CategoryBadge({ category }: { category: string | null | undefined }) {
  if (!category) return null;
  const c = category.toUpperCase();
  const look = c === "VFR" ? { fg: C.ok, bg: C.okTint } : c === "MVFR" ? { fg: C.info, bg: C.infoTint } : { fg: C.danger, bg: C.dangerTint };
  return <span style={{ fontSize: 11, fontWeight: 700, color: look.fg, background: look.bg, borderRadius: 6, padding: "3px 8px" }}>{c}</span>;
}
export function AirportSummary({ airport: a, panel = false }: { airport: AirportData; panel?: boolean }) {
  if (panel) {
    return (
      <div role="group" aria-label={`Airport ${a.icao}`} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.dividerRow}` }}>
          <span style={mono({ fontSize: 15, fontWeight: 600 })}>{a.icao}</span>
          <span style={{ fontSize: 12, color: C.muted, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name ?? a.country ?? ""}</span>
          <CategoryBadge category={a.category} />
          {a.metarAt && <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>METAR {hmZ(a.metarAt)}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "78px 1fr", rowGap: 6, columnGap: 8, padding: "9px 12px", fontSize: 12.5 }}>
          {a.metar && <><span style={{ color: C.muted }}>Weather</span><span style={{ ...mono({ fontSize: 12 }), lineHeight: 1.5, overflowWrap: "anywhere" }}>{a.metar}</span></>}
          {a.notamCount != null && <><span style={{ color: C.muted }}>NOTAM</span><span><span style={mono()}>{a.notamCount}</span> active{a.notamNew ? <> · <span style={{ color: C.danger, fontWeight: 600 }}>{a.notamNew} new</span></> : null}</span></>}
          {a.limitationCount != null && <><span style={{ color: C.muted }}>Limitations</span><span>{a.limitationCount}</span></>}
          {a.caa && <><span style={{ color: C.muted }}>CAA</span><span>{a.caa.name}{a.caa.phone ? <> · <span style={mono()}>{a.caa.phone}</span></> : null}</span></>}
          {a.aipUrl && <><span style={{ color: C.muted }}>AIP</span><a href={a.aipUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.primaryHover, fontWeight: 600, textDecoration: "none" }}>Open{a.aipCached === false ? " (not cached)" : ""} ↗</a></>}
        </div>
      </div>
    );
  }
  return (
    <div role="group" aria-label={`Airport ${a.icao}`} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Eyebrow>Weather{a.metarAt ? ` · ${hmZ(a.metarAt)}` : ""}</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={mono({ fontSize: 16, fontWeight: 600 })}>{a.icao}</span><CategoryBadge category={a.category} /></div>
        {a.decoded ? <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.body }}>{a.decoded}</div> : a.metar ? <div style={{ ...mono({ fontSize: 12.5 }), lineHeight: 1.6, color: C.body, overflowWrap: "anywhere" }}>{a.metar}</div> : <div style={{ fontSize: 13, color: C.faint }}>No weather returned.</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Eyebrow>NOTAM</Eyebrow>
        {a.notamCount != null ? <><div><span style={{ fontSize: 22, fontWeight: 800 }}>{a.notamCount}</span> <span style={{ fontSize: 13, fontWeight: 500, color: C.muted }}>active</span></div>{a.notamNew ? <div style={{ fontSize: 13, fontWeight: 600, color: C.dangerBadge }}>{a.notamNew} new since last check</div> : null}</> : <div style={{ fontSize: 13, color: C.faint }}>Not checked in this reply.</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Eyebrow>CAA contact</Eyebrow>
        {a.caa ? <><div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.caa.name}</div>{a.caa.phone && <div style={{ ...mono({ fontSize: 12.5 }), color: C.body }}>{a.caa.phone}</div>}{a.caa.email && <a href={`mailto:${a.caa.email}`} style={{ fontSize: 12.5, color: C.primary }}>{a.caa.email}</a>}</> : <div style={{ fontSize: 13, color: C.faint }}>{a.country ?? "—"}{a.aipUrl ? <> · <a href={a.aipUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.primaryHover, fontWeight: 600, textDecoration: "none" }}>AIP ↗</a></> : null}</div>}
      </div>
    </div>
  );
}

// ── §4.11 Document result ─────────────────────────────────────────────────────
function PdfTile({ small = false }: { small?: boolean }) {
  return <span style={{ width: small ? 34 : 44, height: small ? 42 : 54, borderRadius: small ? 5 : 7, background: C.dangerTint, border: `1px solid ${C.dangerBorder}`, display: "inline-flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: small ? 5 : 7, flex: "none" }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", color: C.dangerBadge }}>PDF</span></span>;
}
export function DocumentResult({ doc, panel = false, onEmail }: { doc: DocumentData; panel?: boolean; onEmail?: (doc: DocumentData) => void }) {
  const name = doc.title;
  const od = useOpenDocument();
  const openable = Boolean(doc.href || doc.documentId);
  // §V3 E1: Open (primary) · Download · Email; the file name is the same action.
  const actions = (
    <>
      <Button variant="primary" size={panel ? "xs" : "sm"} icon="eye" disabled={!openable} title={openable ? undefined : "Source unavailable"} style={panel ? { width: "100%" } : undefined} onClick={(e) => void od.openDocumentResult(doc, e.currentTarget)}>Open</Button>
      {doc.href ? <a href={doc.href} download style={{ textDecoration: "none", display: "contents" }}><Button variant="primary" size={panel ? "xs" : "sm"} style={panel ? { width: "100%" } : undefined}>Download</Button></a> : <Button variant="primary" size={panel ? "xs" : "sm"} disabled style={panel ? { width: "100%" } : undefined} title="Not cached yet">Download</Button>}
      <Button variant="secondary" size={panel ? "xs" : "sm"} style={panel ? { width: "100%" } : undefined} onClick={() => onEmail?.(doc)} disabled={!onEmail}>Email</Button>
    </>
  );
  return (
    <div role="group" aria-label={name} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: panel ? 12 : 14, padding: panel ? 12 : "14px 16px", display: "flex", flexDirection: panel ? "column" : "row", alignItems: panel ? "stretch" : "center", gap: panel ? 10 : 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: panel ? 10 : 14, minWidth: 0, flex: 1 }}>
        <PdfTile small={panel} />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <button type="button" disabled={!openable} onClick={(e) => void od.openDocumentResult(doc, e.currentTarget)} className="ag-doc-name ag-focus" style={{ ...mono({ fontSize: panel ? 13 : 14, fontWeight: 600 }), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: openable ? "pointer" : "default", color: C.ink, fontFamily: undefined }}>{name}</button>
          <span style={{ fontSize: panel ? 12 : 13, color: C.muted, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {doc.subtitle}
            {doc.stale && <Tag fg={C.warn} bg={C.warnTint}>Cached · {doc.stale}</Tag>}
            {!doc.cached && !doc.stale && <span style={{ color: C.faint }}>· not cached yet</span>}
          </span>
          {doc.note && !panel && <span style={{ fontSize: 12, color: C.faint }}>{doc.note}</span>}
        </div>
      </div>
      <div style={{ display: panel ? "grid" : "flex", gridTemplateColumns: panel ? "1fr 1fr 1fr" : undefined, gap: 6 }}>{actions}</div>
    </div>
  );
}

// ── §4.12 Generated file ──────────────────────────────────────────────────────
export function GeneratedFile({ file, panel = false, onSend }: { file: FileData; panel?: boolean; onSend?: (file: FileData) => void }) {
  const ext = (file.filename.split(".").pop() ?? "").toUpperCase();
  const isPdf = ext === "PDF";
  const od = useOpenDocument();
  return (
    <div role="group" aria-label={`Generated file ${file.filename}`} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: panel ? 12 : 14, overflow: "hidden", display: "flex" }}>
      {!panel && (
        <button type="button" aria-label={`Open ${file.filename}`} onClick={(e) => void od.openGenerated(file, e.currentTarget)} className="ag-thumb-open ag-focus" style={{ width: 132, background: C.sidebar, borderRight: `1px solid ${C.divider}`, padding: 14, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", border: "none", cursor: "pointer", position: "relative", fontFamily: "inherit" }}>
          {isPdf
            ? <object data={`${file.downloadPath}?inline=1#page=1&toolbar=0&navpanes=0`} type="application/pdf" aria-label="Page 1 preview" style={{ width: 84, height: 110, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, boxShadow: "0 2px 6px rgba(16,18,22,.06)", pointerEvents: "none" }} />
            : <span style={{ width: 84, height: 110, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, boxShadow: "0 2px 6px rgba(16,18,22,.06)", display: "flex", alignItems: "center", justifyContent: "center", ...mono({ fontSize: 12, fontWeight: 700 }), color: C.muted }}>{ext}</span>}
          <span className="ag-thumb-open-chip" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: C.surface, background: "rgba(23,24,28,.78)", borderRadius: 6, padding: "4px 7px", opacity: 0, pointerEvents: "none" }}><Icon name="eye" size={11} color={C.surface} />Open</span>
        </button>
      )}
      <div style={{ padding: panel ? 12 : "14px 16px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Eyebrow color={C.okDot}>Generated file</Eyebrow>
          <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>{[file.generatedAt ? hmZ(file.generatedAt) : null, file.pages ? `${file.pages} page${file.pages > 1 ? "s" : ""}` : null, kb(file.bytes)].filter(Boolean).join(" · ")}</span>
        </div>
        <span style={{ ...mono({ fontSize: 14, fontWeight: 600 }), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.filename}</span>
        {file.summary && <span style={{ fontSize: 13, lineHeight: 1.5, color: C.muted }}>{file.summary}</span>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button variant="primary" size="sm" icon="eye" onClick={(e) => void od.openGenerated(file, e.currentTarget)}>Open</Button>
          <a href={file.downloadPath} download={file.filename} style={{ textDecoration: "none" }}><Button variant="secondary" size="sm" icon="download">Download</Button></a>
          <Button variant="secondary" size="sm" onClick={() => onSend?.(file)} disabled={!onSend}>Send…</Button>
        </div>
      </div>
    </div>
  );
}

// ── §4.13 Table result ────────────────────────────────────────────────────────
const looksMono = (v: string) => /^[A-Z]{4}$|^\d{2}:\d{2}Z$|^[A-Z]{2,3}\d{2,4}[A-Z]?$|^[A-Z]{1,2}-[A-Z]{3,4}$|^\+?-?\d+$|^\d{2} [A-Z]{3}/.test(v.trim());
export function TableResult({ table: t, panel = false }: { table: TableData; panel?: boolean }) {
  const [fullSheet, setFullSheet] = useState(false);
  const od = useOpenDocument();
  const full = fullSheet && !od.hasViewer;
  const setFull = (on: boolean) => { if (on && od.hasViewer) od.openTable(t); else setFullSheet(on); };
  const [showAll, setShowAll] = useState(false);
  const inline = panel ? 4 : 10;
  const rows = showAll || full ? t.rows : t.rows.slice(0, inline);
  const monoCols = new Set(t.monoColumns ?? []);
  const cell = (v: string, c: number) => <span style={monoCols.has(c) || looksMono(v) ? mono() : undefined}>{/^\d+ new$/i.test(v) ? <Tag fg={C.danger} bg={C.dangerTint} style={{ borderRadius: 999, padding: "3px 9px", fontSize: 12 }}>{v}</Tag> : v}</span>;
  const grid = `repeat(${t.columns.length}, minmax(0, 1fr))`;
  const fullTable = (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 12, padding: "9px 14px", background: C.page, borderBottom: `1px solid ${C.divider}` }}>{t.columns.map((h) => <span key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: C.faint, textTransform: "uppercase" }}>{h}</span>)}</div>
      {(full ? t.rows : rows).map((r, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: grid, gap: 12, padding: "11px 14px", borderBottom: `1px solid ${C.dividerRow}`, fontSize: 13.5, alignItems: "center" }}>{r.map((v, c) => <span key={c} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell(v, c)}</span>)}</div>)}
      {(t.footer?.openHref || t.rows.length > inline) && (
        <div style={{ padding: "9px 14px", display: "flex", gap: 8, alignItems: "center" }}>
          {t.footer?.openHref && <a href={t.footer.openHref} style={{ textDecoration: "none" }}><Button variant="secondary" size="sm">{t.footer.openLabel ?? "Open"}</Button></a>}
          {!full && t.rows.length > inline && !showAll && <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>Show all {t.rows.length}</Button>}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={() => { const csv = [t.columns, ...t.rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${t.title ?? "table"}.csv`; a.click(); }}>Export CSV</Button>
        </div>
      )}
    </div>
  );
  if (!panel) return fullTable;
  // Panel: reflow to two-line rows, never scroll sideways (§4.13). Over 4 rows or 5 columns → Full view sheet.
  const needsFullView = t.rows.length > 4 || t.columns.length > 5;
  return (
    <>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.page, borderBottom: `1px solid ${C.divider}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{t.title ?? `${t.rows.length} rows`}</span>
          {needsFullView && <button type="button" className="ag-focus" onClick={() => setFull(true)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.primaryHover, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}><Icon name="maximize-2" size={12} color={C.primaryHover} />Full view</button>}
        </div>
        {t.rows.slice(0, 4).map((r, i) => (
          <div key={i} style={{ padding: "9px 12px", borderBottom: `1px solid ${C.dividerRow}`, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={mono({ fontSize: 13.5, fontWeight: 600 })}>{r[0]}</span><span style={{ ...mono({ fontSize: 12 }), color: C.body, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r[1]}</span>{r.slice(2).find((v) => /^\d+ new$/i.test(v)) && <Tag fg={C.danger} bg={C.dangerTint} style={{ borderRadius: 999 }}>{r.find((v) => /^\d+ new$/i.test(v))}</Tag>}</div>
            <div style={{ ...mono({ fontSize: 11.5 }), color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.columns.slice(2).map((h, c) => (/^\d+ new$/i.test(r[c + 2] ?? "") ? null : `${h.toLowerCase()} ${r[c + 2] ?? "—"}`)).filter(Boolean).join(" · ")}</div>
          </div>
        ))}
        {t.rows.length > 4 && <div style={{ padding: "8px 12px", fontSize: 12, color: C.muted, display: "flex", gap: 8 }}>+{t.rows.length - 4} more · <button type="button" onClick={() => setFull(true)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.primaryHover, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Show all</button>{t.footer?.filterHint && <><span>·</span><a href={t.footer.openHref ?? "#"} style={{ fontWeight: 600, color: C.primaryHover, textDecoration: "none" }}>{t.footer.filterHint}</a></>}</div>}
      </div>
      {full && (
        <div role="dialog" aria-label="Full view" style={{ position: "fixed", top: 0, bottom: 0, right: 420, width: 900, maxWidth: "calc(100vw - 420px)", background: C.surface, borderLeft: `1px solid ${C.border}`, boxShadow: "-18px 0 40px rgba(16,18,22,.10)", zIndex: 50, display: "flex", flexDirection: "column" }}>
          <div style={{ height: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: `1px solid ${C.divider}` }}><span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{t.title ?? "Full view"}</span><Button variant="ghost" size="sm" onClick={() => setFull(false)} keycap="Esc">Close</Button></div>
          <div style={{ padding: 16, overflow: "auto" }}>{fullTable}</div>
        </div>
      )}
    </>
  );
}

// ── §4.14 Mono block ──────────────────────────────────────────────────────────
export function MonoBlock({ block, panel = false, onShowOnPage }: { block: MonoData; panel?: boolean; onShowOnPage?: (block: MonoData) => void }) {
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(block.text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* clipboard blocked */ } }
  const lines = block.text.split("\n");
  return (
    <div role="group" aria-label={block.title} style={{ background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: panel ? 8 : 10, padding: panel ? "6px 10px" : "7px 12px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase" }}>{block.title}</span>
        {block.meta && <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>{block.meta}</span>}
        <span style={{ flex: 1 }} />
        {panel && <button type="button" onClick={() => setWrap((w) => !w)} style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", color: wrap ? C.ink : C.faint }}>Wrap</button>}
        {panel && onShowOnPage && <button type="button" onClick={() => onShowOnPage(block)} style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", color: C.primaryHover }}>Show on page ↖</button>}
        <button type="button" onClick={() => void copy()} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit", fontSize: 12, fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", color: C.body }}><Icon name="copy" size={13} color={C.body} />{copied ? "Copied" : "Copy"}</button>
      </div>
      {/* Full page: `pre`, no reflow. Panel: wrap only at spaces, hanging indent, ↳ marks a wrapped line. */}
      <div style={{ ...mono({ fontSize: panel ? 12 : 13.5 }), lineHeight: panel ? 1.7 : 1.75, padding: panel ? "9px 10px 9px 22px" : "12px 14px", textIndent: panel ? -12 : 0, whiteSpace: panel && wrap ? "pre-wrap" : "pre", overflowX: panel && wrap ? "hidden" : "auto", wordBreak: "normal", overflowWrap: "normal", color: C.ink }}>
        {lines.map((line, i) => (
          <div key={i} style={line.trim() === "—" ? { color: C.faint } : undefined}>{line}{panel && wrap && line.length > 46 ? <span aria-hidden style={{ color: C.faint }}> ↳</span> : null}</div>
        ))}
      </div>
    </div>
  );
}
