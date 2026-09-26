// The attachment card (§E6): what was sent from the page, its kind and size — above the message in the
// thread, and above the composer while drafting (with ✕). It is a record of what left the browser.
import { useState } from "react";
import { C, mono } from "@/components/agent/ui/tokens";
import { Icon } from "@/components/agent/ui/primitives";
import type { PageContext } from "~/shared/protocol";
import { LIMITS } from "~/shared/config";
import { hmZ } from "~/shared/api";

const KIND = { selection: { label: "SELECTION", icon: "scan-text" }, capture: { label: "CAPTURE", icon: "scan" }, page: { label: "PAGE", icon: "file-text" } } as const;
const fmt = (n: number) => n.toLocaleString("en-GB");
export function sizeLabel(pc: PageContext): { text: string; over: boolean } {
  if (pc.kind === "capture") return { text: `${Math.max(1, Math.round((pc.bytes ?? 0) / 1024))} KB`, over: false };
  const chars = pc.chars ?? pc.text?.length ?? 0;
  if (pc.kind === "selection") return { text: `${fmt(chars)} chars`, over: chars > LIMITS.selectionChars };
  return { text: chars >= 1024 ? `${(chars / 1024).toFixed(1)} KB` : `${chars} chars`, over: Boolean(pc.trimmed) };
}

export function PageContextCard({ pc, onRemove, style = {} }: { pc: PageContext; onRemove?: () => void; style?: React.CSSProperties }) {
  const [expanded, setExpanded] = useState(false);
  const k = KIND[pc.kind]; const size = sizeLabel(pc);
  const footer = pc.kind === "capture" ? `${pc.title || "Capture"} · ${pc.host} · ${hmZ(pc.sentAt)}` : `${pc.title || pc.host} · ${pc.host}${pathOf(pc.url)}`;
  return (
    <div data-page-context={pc.kind} style={{ width: "100%", maxWidth: 310, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: C.muted }}>
        <Icon name={k.icon} size={12} color={C.muted} /><span>{k.label}</span><span style={{ flex: 1 }} />
        <span style={{ ...mono({ fontSize: 10.5, fontWeight: 500 }), color: size.over ? C.warn : C.muted, letterSpacing: 0 }}>{size.text}</span>
        {onRemove && <button type="button" onClick={onRemove} aria-label="Remove" className="ag-focus" style={{ border: "none", background: "transparent", padding: 2, marginRight: -4, cursor: "pointer", display: "inline-flex" }}><Icon name="x" size={12} color={C.faint} /></button>}
      </div>
      {pc.kind === "selection" && (
        <div role={expanded ? undefined : "button"} onClick={() => setExpanded((v) => !v)} title={expanded ? "Collapse" : "Show all"}
          style={{ fontSize: 12.5, lineHeight: 1.5, color: C.body, borderLeft: `2px solid ${C.borderControl}`, paddingLeft: 8, whiteSpace: "pre-wrap", overflow: "hidden", display: expanded ? "block" : "-webkit-box", WebkitLineClamp: expanded ? undefined : 3, WebkitBoxOrient: "vertical" as never, cursor: "pointer" }}>{pc.text}</div>
      )}
      {pc.kind === "capture" && (pc.dataUrl ? <img src={pc.dataUrl} alt="Captured region" style={{ height: 88, width: "fit-content", maxWidth: "100%", objectFit: "contain", borderRadius: 6, border: `1px solid ${C.border}` }} /> : <div style={{ height: 88, borderRadius: 6, background: C.hover, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.faint }}>{pc.width ? `${pc.width} × ${pc.height} px` : "Image"}</div>)}
      {pc.kind === "page" && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.body }}>{pc.title || pc.host} · {fmt(pc.words ?? 0)} words · headings kept · {pc.tables ?? 0} table{(pc.tables ?? 0) === 1 ? "" : "s"}{pc.trimmed ? <span style={{ color: C.warn }}> · Page trimmed to the first {fmt(LIMITS.pageChars)} characters.</span> : null}</div>}
      <div style={{ fontSize: 11, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{footer}</div>
    </div>
  );
}
function pathOf(url: string) { try { const u = new URL(url); return u.pathname === "/" ? "" : u.pathname; } catch { return ""; } }
