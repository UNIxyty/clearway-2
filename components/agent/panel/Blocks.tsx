"use client";

// Reply parts at panel width.
//
// The one that matters: VerbatimFrame. The design calls the verbatim/synthesised
// distinction "the most important distinction in the interface", and it has to
// survive a 400px column. So the frame is the heaviest object the panel can
// draw — a 1.5px ink border and a solid ink header — and nothing else in the
// panel is allowed to look like it. The agent's own words then sit OUTSIDE the
// frame under "AGENT'S READING", so the boundary between what the authority
// wrote and what the agent inferred is a visual fact, not a caption.

import { useEffect, useState } from "react";
import { C, FONT, SOURCE_TIERS, iconStyle } from "./tokens";
import Markdown from "./Markdown";
import type { AirportData, DocumentData, FileData, FlightCardData, PerformedAction, SourceRef, ToolActivity, VerbatimRecord } from "./types";

export function VerbatimFrame({ record }: { record: VerbatimRecord }) {
  const [copied, setCopied] = useState(false);
  const validity = [record.effectiveFrom, record.effectiveTo].filter(Boolean).join(" – ");
  // Locale/timezone-dependent, so it must not decide the server-rendered HTML.
  const [approvedDate, setApprovedDate] = useState<string | null>(null);
  useEffect(() => {
    if (!record.updatedAt) return;
    const d = new Date(record.updatedAt);
    if (!Number.isNaN(d.getTime())) {
      setApprovedDate(d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }));
    }
  }, [record.updatedAt]);
  const approved = [record.approvedBy, approvedDate].filter(Boolean).join(" · ");

  async function copyExact() {
    try {
      // "Copy exact" must put the ORIGINAL on the clipboard — not the rendered
      // text with the heading or the frame's furniture folded in.
      await navigator.clipboard.writeText(record.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ border: `1.5px solid ${C.ink}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ background: C.ink, color: "#fff", padding: "7px 11px", display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em" }}>VERBATIM · APPROVED TEXT</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.ghost, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[record.id, record.heading].filter(Boolean).join(" · ")}
        </span>
      </div>
      {/* The stored text, exactly. No truncation, no re-wrapping of content. */}
      <div style={{ padding: "10px 11px", fontSize: 14, lineHeight: 1.6, fontWeight: 500, whiteSpace: "pre-wrap", color: C.ink }}>
        {record.text}
      </div>
      <div style={{ padding: "8px 11px", borderTop: `1px dashed ${C.borderInput}`, display: "flex", flexDirection: "column", gap: 6 }}>
        {(approved || validity) && (
          <span style={{ fontSize: 11.5, color: C.muted }}>
            {[approved, validity].filter(Boolean).join(" · ")}
          </span>
        )}
        <span style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => void copyExact()}
            style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, border: `1px solid ${C.borderInput}`, background: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: C.ink }}
          >
            {copied ? "Copied" : "Copy exact"}
          </button>
          <span style={{ fontSize: 11.5, color: C.faint, alignSelf: "center" }}>{record.source}</span>
        </span>
      </div>
    </div>
  );
}

export function AgentsReading({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: C.faint }}>AGENT&apos;S READING</div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: C.body }}>
        {typeof children === "string" ? <Markdown text={children} /> : children}
      </div>
    </>
  );
}

/** Numbered, tier-coloured, one line each — the narrow-column treatment. */
export function Sources({ sources }: { sources: SourceRef[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, borderTop: `1px solid ${C.borderInner}`, paddingTop: 8 }}>
      {sources.map((s) => {
        const tier = SOURCE_TIERS[s.tier] ?? SOURCE_TIERS.internal;
        return (
          <div key={`${s.n}-${s.label}`} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: tier.fg, background: tier.bg, borderRadius: 4, minWidth: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              {s.n}
            </span>
            <span style={iconStyle(s.icon ?? tier.icon, 11, tier.fg)} />
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: C.body }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Flight card, from the design's A1 artboard. Route, times and the chips that
 * say what applies. Built from a tool result, so nothing here is the model's
 * account of a flight — it is the wall's.
 */
export function FlightCard({ flight }: { flight: FlightCardData }) {
  const time = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    // Zulu, always — a dispatcher reads Z, and a local-time conversion here
    // would also differ between server and client.
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
  };
  const chips: Array<{ label: string; fg: string; bg: string }> = [];
  if (flight.limitationCount) chips.push({ label: `${flight.limitationCount} limitation${flight.limitationCount > 1 ? "s" : ""}`, fg: "#b45309", bg: "#fef3e2" });
  if (flight.importantCount) chips.push({ label: `${flight.importantCount} IMP`, fg: "#b45309", bg: "#fef3e2" });
  if (flight.status) chips.push({ label: String(flight.status), fg: "#475569", bg: "#eef1f5" });

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.rowLine}` }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 15, fontWeight: 600 }}>{flight.callsign ?? flight.flightId}</span>
        <span style={{ fontSize: 12, color: C.muted, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {[flight.operatorId, flight.registration].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", padding: "10px 12px", fontFamily: FONT.mono }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{flight.departureIcao ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: C.body }}>{time(flight.scheduledDeparture) ?? "no time"}</div>
        </div>
        <span style={iconStyle("arrow-right", 14, C.faint)} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{flight.arrivalIcao ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: C.body }}>{time(flight.scheduledArrival) ?? "no time"}</div>
        </div>
      </div>
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 12px", background: C.page, borderTop: `1px solid ${C.rowLine}` }}>
          {chips.map((c) => (
            <span key={c.label} style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, padding: "2px 7px", borderRadius: 5 }}>
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Raw METAR/NOTAM: hanging indent so each report still starts at the margin. */
export function MonoBlock({ title, text }: { title: string; text: string }) {
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      // Always the original line breaks, whatever "Wrap" is showing.
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard blocked */ }
  }
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: C.muted, flex: 1 }}>{title}</span>
        <button onClick={() => setWrap((w) => !w)} style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", color: wrap ? C.ink : C.faint }}>
          Wrap
        </button>
        <button onClick={() => void copy()} style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", color: C.blueDeep }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div
        style={{
          fontFamily: FONT.mono, fontSize: 12, lineHeight: 1.7,
          padding: "9px 10px 9px 22px", textIndent: -12,
          whiteSpace: wrap ? "pre-wrap" : "pre",
          overflowX: wrap ? "hidden" : "auto",
          wordBreak: wrap ? "normal" : undefined,
          color: C.ink,
        }}
      >
        {text}
      </div>
    </div>
  );
}

/**
 * What the agent CHANGED, as opposed to what it looked up. Shown expanded and
 * above the reply, not folded into the tool-activity row: a dispatcher must not
 * have to open a disclosure to discover that the wall was modified.
 */
export function ActionsPerformed({ actions }: { actions: PerformedAction[] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div style={{ border: `1px solid ${C.blueBorder}`, background: C.blueTint, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.blueDeep }}>
        <span style={iconStyle("square-pen", 12, C.blueDeep)} />
        CHANGED ON THE WALL
      </div>
      {actions.map((a) => (
        <div key={a.actionId} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, lineHeight: 1.45, color: C.ink }}>
          <span style={{ flex: 1 }}>{a.what}</span>
          {/* The marker staff see on the record itself, echoed here so the
              attribution is visible at the moment of the change too. */}
          <span style={{ flex: "none", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", color: C.blueDeep, background: "#dbeafe", borderRadius: 4, padding: "2px 6px" }}>
            AI
          </span>
        </div>
      ))}
      <span style={{ fontSize: 11.5, color: C.muted }}>
        Marked as AI-authored. Ask to undo any of these.
      </span>
    </div>
  );
}

/** Collapsible "what the agent did". Collapsed by default — it is evidence, not narration. */
export function ToolActivityRow({ activity, elapsedMs }: { activity: ToolActivity[]; elapsedMs?: number | null }) {
  const [open, setOpen] = useState(false);
  if (!activity || activity.length === 0) return null;
  const failed = activity.filter((a) => !a.ok).length;
  const seconds = elapsedMs != null ? ` · ${(elapsedMs / 1000).toFixed(1)} s` : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.muted, background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}
      >
        <span style={iconStyle(failed > 0 ? "triangle-alert" : "circle-check", 13, failed > 0 ? C.amber : C.green)} />
        Used {activity.length} {activity.length === 1 ? "tool" : "tools"}
        {failed > 0 ? ` · ${failed} failed` : ""}
        {seconds}
        <span style={iconStyle(open ? "chevron-up" : "chevron-down", 12, C.faint)} />
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 20 }}>
          {activity.map((a, i) => (
            <div key={`${a.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: a.ok ? C.muted : C.amber }}>
              <span style={iconStyle(a.ok ? "check" : "x", 11, a.ok ? C.green : C.amber)} />
              <span style={{ fontFamily: FONT.mono }}>{a.name}</span>
              {a.error && <span style={{ color: C.amber }}>{a.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tool failure, with what is still known and what could not be confirmed. */
export function ToolFailureNote({ activity }: { activity: ToolActivity[] }) {
  const failed = (activity ?? []).filter((a) => !a.ok);
  if (failed.length === 0) return null;
  return (
    <div style={{ border: `1px solid ${C.amberBorder}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.amber }}>
        {failed.length === 1 ? "A lookup failed" : `${failed.length} lookups failed`}
      </div>
      {failed.map((a, i) => (
        <div key={i} style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>
          {a.name} → {a.error ?? "failed"}
        </div>
      ))}
    </div>
  );
}


/** A located document: the AD 2 page, a GEN entry, or a knowledge-base source. Opens the original. */
export function DocumentCard({ doc }: { doc: DocumentData }) {
  const kindLabel = doc.kind === "aip" ? "AIP" : doc.kind === "gen" ? "GEN" : "COMPANY DOC";
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px" }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: doc.kind === "knowledge" ? "#ede9fe" : C.blueTint, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <span style={iconStyle(doc.kind === "knowledge" ? "book-open" : "file-text", 14, doc.kind === "knowledge" ? "#6d28d9" : C.blueDeep)} />
      </span>
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</span>
        <span style={{ fontSize: 11.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[kindLabel, doc.subtitle, doc.cached ? null : "not cached yet"].filter(Boolean).join(" · ")}
        </span>
      </div>
      {doc.href && <span style={iconStyle("arrow-up-right", 13, C.faint)} />}
    </div>
  );
  const frame: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 12, background: "#fff", textDecoration: "none", color: "inherit", display: "block" };
  return doc.href
    ? <a href={doc.href} target="_blank" rel="noopener noreferrer" className="cw-hover-surface" style={frame}>{inner}</a>
    : <div style={frame}>{inner}</div>;
}

/** A file the agent generated this turn. The download is the same route email attachments use. */
export function FileCard({ file }: { file: FileData }) {
  const ext = (file.filename.split(".").pop() ?? "").toUpperCase();
  const size = file.bytes != null ? (file.bytes >= 1024 * 1024 ? `${(file.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.bytes / 1024))} KB`) : null;
  return (
    <a href={file.downloadPath} download={file.filename} className="cw-hover-surface" style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "#fff", textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 10, padding: "9px 11px" }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: C.greenTint, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none", fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 800, color: C.greenDeep }}>
        {ext.slice(0, 4)}
      </span>
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.filename}</span>
        <span style={{ fontSize: 11.5, color: C.faint }}>{[size, "generated by the agent"].filter(Boolean).join(" · ")}</span>
      </div>
      <span style={iconStyle("download", 14, C.blueDeep)} />
    </a>
  );
}

/** Airport summary, from the tools that answered about this ICAO and nothing else. */
export function AirportCard({ airport }: { airport: AirportData }) {
  const facets: Array<[string, string]> = [];
  if (airport.country) facets.push(["Country", airport.country]);
  if (airport.notamCount != null) facets.push(["NOTAMs", String(airport.notamCount)]);
  if (airport.limitationCount != null) facets.push(["Limitations", String(airport.limitationCount)]);
  if (airport.aipCached != null) facets.push(["AD 2", airport.aipCached ? "cached" : "not cached"]);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.rowLine}` }}>
        <span style={iconStyle("map-pin", 14, C.blueDeep)} />
        <span style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: 700 }}>{airport.icao}</span>
        <span style={{ flex: 1 }} />
        {airport.aipUrl && (
          <a href={airport.aipUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: C.blueDeep, textDecoration: "none" }}>AIP ↗</a>
        )}
      </div>
      {facets.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", padding: "9px 12px" }}>
          {facets.map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: C.faint }}>{k.toUpperCase()}</span>
              <span style={{ fontSize: 13, color: C.ink }}>{v}</span>
            </div>
          ))}
        </div>
      )}
      {airport.metar && (
        <div style={{ borderTop: `1px solid ${C.rowLine}`, padding: "8px 12px", fontFamily: FONT.mono, fontSize: 11.5, lineHeight: 1.5, color: C.ink, whiteSpace: "pre-wrap" }}>{airport.metar}</div>
      )}
    </div>
  );
}
