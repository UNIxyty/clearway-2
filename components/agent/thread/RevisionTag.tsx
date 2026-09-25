"use client";

// Revision state, in words, wherever a document is named: source chips, the
// verbatim frame, document cards, the Knowledge base list, the viewer header.
// The rule: UNKNOWN IS NOT CURRENT — an unknown revision is stated ("revision
// unknown"), never left blank, and never styled like a current one.

import { C } from "../ui/tokens";
import { Icon } from "../ui/primitives";
import type { RevisionInfo } from "../types";

export const REVISION_LOOK: Record<RevisionInfo["state"], { fg: string; bg: string; border: string; icon: string }> = {
  current: { fg: C.body, bg: C.hover, border: C.border, icon: "badge-check" },
  future: { fg: C.info, bg: C.infoTint, border: C.infoBorder, icon: "clock" },
  superseded: { fg: C.warn, bg: C.warnTint, border: C.warnBorder, icon: "history" },
  unknown: { fg: C.muted, bg: C.surface, border: C.borderControl, icon: "circle-help" },
};

export function revisionOrUnknown(r: RevisionInfo | null | undefined): RevisionInfo {
  return r && r.state ? r : { state: "unknown", words: "revision unknown", label: "revision unknown", reason: "no revision data" };
}

/** Small pill. `current` renders only when `showCurrent` (a chip in a source row stays quiet when all is well). */
export function RevisionTag({ revision, showCurrent = false, size = 11 }: { revision: RevisionInfo | null | undefined; showCurrent?: boolean; size?: number }) {
  const r = revisionOrUnknown(revision);
  if (r.state === "current" && !showCurrent) return null;
  const look = REVISION_LOOK[r.state];
  const text = r.state === "current" ? r.label : r.state === "unknown" ? "revision unknown" : `${r.label}`;
  return (
    <span data-revision-state={r.state} title={r.reason ?? undefined} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: size, fontWeight: 600, lineHeight: 1.3, color: look.fg, background: look.bg, border: `1px solid ${look.border}`, borderRadius: 999, padding: "1px 7px 1px 5px", whiteSpace: "nowrap", fontStyle: r.state === "unknown" ? "italic" : "normal" }}>
      <Icon name={look.icon} size={size} color={look.fg} />{text}
    </span>
  );
}

/** One plain sentence for a claim's neighbourhood. Null when current. */
export function revisionSentence(r: RevisionInfo | null | undefined, name?: string | null): string | null {
  const v = revisionOrUnknown(r);
  const who = name ? name : "This document";
  if (v.state === "current") return null;
  if (v.state === "superseded") return `${who} is ${v.revision ?? "an older revision"} and has been superseded${v.reason ? ` (${v.reason})` : ""}.`;
  if (v.state === "future") return `${who} is not yet effective${v.effectiveFrom ? ` — it applies from ${v.effectiveFrom}` : ""}.`;
  return `${who} has no revision data: it is not known whether it is current.`;
}
