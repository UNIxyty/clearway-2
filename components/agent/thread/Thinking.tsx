"use client";

// Item 8a — the agent's thinking, collapsed. Text the model wrote before calling a tool is its reasoning,
// not the answer: the server moves it out of the reply (`thought` events) and it lives here, in one
// disclosure built on the tool-activity pattern (§4.5, A8): "Thinking…" with the A7 pulse while it runs,
// "Thought for 4s" after, expandable to read.
//
// Item 4 — actions that ran WITHOUT a confirmation card because the user's setting allowed it are listed
// under the reply, marked auto-confirmed, each with an Undo.

import { useState } from "react";
import { mono } from "../ui/tokens";
import { Icon } from "../ui/primitives";
import type { PerformedAction } from "../types";
import { cw } from "@/lib/portal-tokens";

export type ThinkingBlock = { text: string; ms: number };

export function Thinking({ block, running, panel = false }: { block: ThinkingBlock | null | undefined; running: boolean; panel?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!block?.text?.trim() && !running) return null;
  const secs = Math.max(1, Math.round((block?.ms ?? 0) / 1000));
  return (
    <div data-thinking style={{ background: cw.bgSurface, border: `1px solid ${cw.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button type="button" aria-expanded={open} disabled={!block?.text?.trim()} onClick={() => setOpen((v) => !v)} className="ag-row-hover ag-focus"
        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: panel ? "7px 12px" : "8px 14px", border: "none", background: "transparent", cursor: block?.text?.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
        {running ? <span className="ag-pulse-1200" style={{ width: 8, height: 8, borderRadius: "50%", background: cw.primary, flex: "none" }} /> : <Icon name="brain" size={14} color={cw.textMuted} />}
        <span style={{ fontSize: 13, color: cw.textMuted, flex: 1 }}>{running ? "Thinking…" : `Thought for ${secs}s`}</span>
        {block?.text?.trim() && <Icon name={open ? "chevron-up" : "chevron-down"} size={15} color={cw.textMuted} />}
      </button>
      {open && block?.text && (
        <div style={{ borderTop: `1px solid ${cw.divider}`, padding: panel ? "8px 12px 10px" : "10px 14px 12px", fontSize: panel ? 12.5 : 13, lineHeight: 1.55, color: cw.textMuted, whiteSpace: "pre-wrap" }}>{block.text.trim()}</div>
      )}
    </div>
  );
}

export function AutoConfirmedActions({ actions, panel = false, onUndo }: { actions: (PerformedAction & { autoConfirmed?: boolean })[]; panel?: boolean; onUndo: (a: PerformedAction) => void }) {
  const auto = actions.filter((a) => a.autoConfirmed);
  if (!auto.length) return null;
  return (
    <div data-auto-confirmed role="status" style={{ display: "flex", flexDirection: "column", gap: 6, background: cw.warningTint, border: `1px solid ${cw.warningBorder}`, borderRadius: 10, padding: panel ? "8px 10px" : "9px 12px" }}>
      {auto.map((a) => (
        <div key={a.actionId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: panel ? 12.5 : 13, color: cw.textBody }}>
          <Icon name="zap" size={13} color={cw.warningText} />
          <span style={{ flex: 1, minWidth: 0 }}><b style={{ color: cw.warningText }}>Auto-confirmed</b> · {a.what} <span style={{ ...mono({ fontSize: 11 }), color: cw.textMuted }}>· {a.actionId.slice(0, 8)}</span></span>
          <button type="button" onClick={() => onUndo(a)} className="ag-focus" style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: cw.textLink, background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>Undo</button>
        </div>
      ))}
      <span style={{ fontSize: 11.5, color: cw.textMuted }}>Done without a confirmation card because of your setting “Skip confirmation for low-risk actions”.</span>
    </div>
  );
}

/** Item 11 — a file the agent is still building: named steps, the A7 pulse on the running one, Cancel. */
export type BuildingFile = { id: string; filename: string; format: string | null; steps: string[]; index: number };
export function BuildingFileCard({ file, panel = false }: { file: BuildingFile; panel?: boolean }) {
  const steps = file.steps.length ? file.steps : ["Preparing"];
  return (
    <div data-building-file role="group" aria-label={`Building ${file.filename}`} aria-busy style={{ background: cw.bgSurface, border: `1px dashed ${cw.borderControl}`, borderRadius: panel ? 12 : 14, padding: panel ? 12 : "14px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span className="ag-pulse-1200" style={{ width: 34, height: 42, borderRadius: 5, background: cw.bgHover, border: `1px solid ${cw.border}`, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", ...mono({ fontSize: 8.5, fontWeight: 800 }), color: cw.textMuted }}>{(file.format ?? "file").toUpperCase()}</span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: cw.textMuted }}>BUILDING</span><span style={{ ...mono({ fontSize: 13, fontWeight: 600 }), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.filename}</span></div>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
          {steps.map((st, i) => {
            const done = i < file.index, running = i === file.index;
            return <li key={st} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: done ? cw.textMuted : running ? cw.text : cw.textMuted }}>
              {done ? <Icon name="check" size={12} color={cw.successText} /> : running ? <span className="ag-pulse-1200" style={{ width: 8, height: 8, margin: 2, borderRadius: "50%", background: cw.primary }} /> : <span style={{ width: 8, height: 8, margin: 2, borderRadius: "50%", border: `1px solid ${cw.borderControl}` }} />}{st}
            </li>;
          })}
        </ol>
      </div>
      <button type="button" onClick={() => window.dispatchEvent(new Event("cw-agent-stop"))} className="ag-focus ag-btn-secondary" style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: `1px solid ${cw.borderControl}`, background: cw.bgSurface, color: cw.textBody, cursor: "pointer" }}>Cancel</button>
    </div>
  );
}
