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

import { useState } from "react";
import { C, FONT, SOURCE_TIERS, iconStyle } from "./tokens";
import type { SourceRef, ToolActivity, VerbatimRecord } from "./types";

export function VerbatimFrame({ record }: { record: VerbatimRecord }) {
  const [copied, setCopied] = useState(false);
  const validity = [record.effectiveFrom, record.effectiveTo].filter(Boolean).join(" – ");
  const approved = [record.approvedBy, record.updatedAt ? new Date(record.updatedAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : null]
    .filter(Boolean)
    .join(" · ");

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
      <div style={{ fontSize: 14, lineHeight: 1.55, color: C.body, whiteSpace: "pre-wrap" }}>{children}</div>
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
