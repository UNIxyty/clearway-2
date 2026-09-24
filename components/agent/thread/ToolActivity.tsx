"use client";

// Tool activity — what the agent is doing and what it did (design spec §4.5).
// Not a spinner: a record. A · live step list while working; B · collapsible
// completed summary with tool · arguments · result · duration; C · one-line
// summary for one or two tools. Tool names are whatever the backend reports.

import { useState } from "react";
import { C, mono } from "../ui/tokens";
import { Icon } from "../ui/primitives";
import type { ToolActivity as Step } from "../types";

const fmtMs = (ms: number | null | undefined) => (ms == null ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const args = (a: Record<string, unknown> | null | undefined) => { if (!a) return ""; const { confirmationToken: _c, voiceConfirmationToken: _v, ...rest } = a; return JSON.stringify(rest); };

/** A · live step list (Ops Agent B2). */
export function LiveSteps({ steps, panel = false }: { steps: Step[]; panel?: boolean }) {
  if (steps.length === 0) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "6px 0" }}>
      {steps.map((s, i) => {
        const state = s.state ?? (s.ok === false && s.error ? "done" : "done");
        const running = state === "running", queued = state === "queued", cancelled = state === "cancelled";
        const icon = cancelled ? "circle-slash" : running ? "loader-circle" : queued ? "circle" : "circle-check";
        const iconColor = cancelled ? C.faint : running ? C.primary : queued ? C.disabledFill : s.ok === false ? C.dangerBadge : C.okDot;
        return (
          <div key={`${s.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: panel ? "5px 12px" : "6px 14px" }}>
            <Icon name={icon} size={14} color={iconColor} style={running ? { animation: "ag-pulse 1100ms ease-in-out infinite" } : undefined} />
            <span style={{ flex: 1, fontSize: panel ? 13 : 13.5, fontWeight: running ? 600 : 500, color: running ? C.ink : cancelled ? C.faint : queued ? C.faint : C.muted, textDecoration: cancelled ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.summary && !running ? s.summary : <span style={mono()}>{s.name}</span>}{running ? "…" : ""}
            </span>
            <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>{cancelled ? "cancelled" : queued ? "queued" : running ? <Elapsed from={s.startedAt} /> : fmtMs(s.durationMs)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Elapsed({ from }: { from?: string | null }) {
  const [now, setNow] = useState(Date.now());
  useStateTick(setNow);
  if (!from) return null;
  return <>{fmtMs(now - new Date(from).getTime())}</>;
}
function useStateTick(setNow: (n: number) => void) {
  // 250 ms tick for the live elapsed column; cheap, unmounts with the row.
  useEffectOnce(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); });
}
import { useEffect } from "react";
function useEffectOnce(fn: () => () => void) { useEffect(fn, []); } // eslint-disable-line react-hooks/exhaustive-deps

/** B · completed summary, collapsible; C · one-line for 1–2 tools (expands to B). */
export function ToolSummary({ steps, elapsedMs, panel = false, defaultOpen = false }: { steps: Step[]; elapsedMs?: number | null; panel?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (steps.length === 0) return null;
  const wrote = steps.some((s) => s.write && s.ok);
  const failed = steps.filter((s) => !s.ok).length;
  const total = elapsedMs ?? steps.reduce((n, s) => n + (s.durationMs ?? 0), 0);
  const oneLine = steps.length <= 2;
  const headIcon = failed ? "triangle-alert" : "circle-check";
  const headColor = failed ? C.warnDot : C.okDot;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="ag-row-hover ag-focus"
        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: panel ? "8px 12px" : "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
        <Icon name={headIcon} size={oneLine ? 14 : 15} color={headColor} />
        {oneLine ? (
          <span style={{ fontSize: 13, color: C.muted, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {steps.length === 1 && steps[0].summary ? steps[0].summary : `Used ${steps.length} tool${steps.length > 1 ? "s" : ""}`}
            <span style={{ ...mono({ fontSize: 12 }), color: C.faint, marginLeft: 8 }}>{steps.map((s) => s.name).join(" · ")}{total ? ` · ${fmtMs(total)}` : ""}</span>
          </span>
        ) : (
          <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>
            Used {steps.length} tools <span style={{ fontWeight: 500, color: C.faint }}>· {wrote ? "changed data" : "read only"}{failed ? ` · ${failed} failed` : ""}{total ? ` · ${(total / 1000).toFixed(1)} s` : ""}</span>
          </span>
        )}
        <Icon name={open ? "chevron-up" : "chevron-down"} size={15} color={C.faint} />
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${C.divider}` }}>
          {steps.map((s, i) => (
            <div key={`${s.name}-${i}`} style={{ display: "grid", gridTemplateColumns: panel ? "18px minmax(0,1fr) auto" : "20px 170px minmax(0,1fr) auto", gap: 10, alignItems: "start", padding: panel ? "8px 12px" : "9px 14px", borderBottom: `1px solid ${C.dividerRow}` }}>
              <Icon name={s.write ? "pencil" : "eye"} size={14} color={s.write ? C.primaryHover : C.faint} />
              {!panel && <span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>}
              <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                {panel && <span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), color: C.ink }}>{s.name}</span>}
                <span style={{ ...mono({ fontSize: 12 }), color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{args(s.args)}</span>
                <span style={{ fontSize: 12.5, color: s.ok ? C.body : C.danger }}>{s.ok ? (s.summary ?? "ok") : `${s.error ?? "failed"}`}</span>
              </span>
              <span style={{ ...mono({ fontSize: 11.5 }), color: C.faint, whiteSpace: "nowrap" }}>{fmtMs(s.durationMs)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
