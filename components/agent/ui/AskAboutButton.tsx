"use client";

// "Ask about {record}" (design spec §6.1): the page-header entry point to the
// panel. Secondary button, static ring mark, keycap ⌘J. It only asks the
// shell to open the panel; the shell renders it solely for allowlisted users.

import { useEffect, useState } from "react";
import { C } from "./tokens";
import { Keycap, RingMark } from "./primitives";

export default function AskAboutButton({ label, style = {}, gate = false }: { label: string; style?: React.CSSProperties; /** true when the parent has not already checked agent availability */ gate?: boolean }) {
  const [available, setAvailable] = useState(!gate);
  useEffect(() => {
    if (!gate) return;
    fetch("/api/assistant/availability", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => setAvailable(Boolean(d?.available))).catch(() => setAvailable(false));
  }, [gate]);
  if (!available) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("cw-agent-open"))} title="Ask the Ops Agent about this · ⌘J" className="ag-hover ag-focus"
      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, border: `1px solid ${C.borderControl}`, background: C.surface, color: C.ink, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", ...style }}>
      <RingMark size={14} color={C.primaryHover} dot={5} />
      <span>Ask about {label}</span>
      <Keycap>⌘J</Keycap>
    </button>
  );
}
