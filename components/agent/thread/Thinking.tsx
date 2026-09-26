"use client";

// Item 8a — the agent's thinking, collapsed. Text the model wrote before calling a tool is its reasoning,
// not the answer: the server moves it out of the reply (`thought` events) and it lives here, in one
// disclosure built on the tool-activity pattern (§4.5, A8): "Thinking…" with the A7 pulse while it runs,
// "Thought for 4s" after, expandable to read.
//
// Item 4 — actions that ran WITHOUT a confirmation card because the user's setting allowed it are listed
// under the reply, marked auto-confirmed, each with an Undo.

import { useState } from "react";
import { C, mono } from "../ui/tokens";
import { Icon } from "../ui/primitives";
import type { PerformedAction } from "../types";

export type ThinkingBlock = { text: string; ms: number };

export function Thinking({ block, running, panel = false }: { block: ThinkingBlock | null | undefined; running: boolean; panel?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!block?.text?.trim() && !running) return null;
  const secs = Math.max(1, Math.round((block?.ms ?? 0) / 1000));
  return (
    <div data-thinking style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button type="button" aria-expanded={open} disabled={!block?.text?.trim()} onClick={() => setOpen((v) => !v)} className="ag-row-hover ag-focus"
        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: panel ? "7px 12px" : "8px 14px", border: "none", background: "transparent", cursor: block?.text?.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
        {running ? <span className="ag-pulse-1200" style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary, flex: "none" }} /> : <Icon name="brain" size={14} color={C.faint} />}
        <span style={{ fontSize: 13, color: C.muted, flex: 1 }}>{running ? "Thinking…" : `Thought for ${secs}s`}</span>
        {block?.text?.trim() && <Icon name={open ? "chevron-up" : "chevron-down"} size={15} color={C.faint} />}
      </button>
      {open && block?.text && (
        <div style={{ borderTop: `1px solid ${C.divider}`, padding: panel ? "8px 12px 10px" : "10px 14px 12px", fontSize: panel ? 12.5 : 13, lineHeight: 1.55, color: C.muted, whiteSpace: "pre-wrap" }}>{block.text.trim()}</div>
      )}
    </div>
  );
}

export function AutoConfirmedActions({ actions, panel = false, onUndo }: { actions: (PerformedAction & { autoConfirmed?: boolean })[]; panel?: boolean; onUndo: (a: PerformedAction) => void }) {
  const auto = actions.filter((a) => a.autoConfirmed);
  if (!auto.length) return null;
  return (
    <div data-auto-confirmed role="status" style={{ display: "flex", flexDirection: "column", gap: 6, background: C.warnWash, border: `1px solid ${C.warnBorder}`, borderRadius: 10, padding: panel ? "8px 10px" : "9px 12px" }}>
      {auto.map((a) => (
        <div key={a.actionId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: panel ? 12.5 : 13, color: C.body }}>
          <Icon name="zap" size={13} color={C.warn} />
          <span style={{ flex: 1, minWidth: 0 }}><b style={{ color: C.warn }}>Auto-confirmed</b> · {a.what} <span style={{ ...mono({ fontSize: 11 }), color: C.faint }}>· {a.actionId.slice(0, 8)}</span></span>
          <button type="button" onClick={() => onUndo(a)} className="ag-focus" style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: C.primaryHover, background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>Undo</button>
        </div>
      ))}
      <span style={{ fontSize: 11.5, color: C.muted }}>Done without a confirmation card because of your setting “Skip confirmation for low-risk actions”.</span>
    </div>
  );
}
