"use client";

// Date picker in the console's own furniture (design spec §11: the date
// filter is a secondary dropdown button showing `23 SEP 2026` in mono; the
// menu was not drawn, so this follows the console Dropdown: white card,
// radius 11, panel shadow). Never the browser's native control.

import { useEffect, useRef, useState } from "react";
import { C, SHADOW, mono } from "./tokens";
import { Icon } from "./primitives";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

export default function DateField({ value, onChange, placeholder = "Date: any", label = "Date", clearable = true, style = {} }: { value: string; onChange: (next: string) => void; placeholder?: string; label?: string; clearable?: boolean; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [view, setView] = useState(() => { const [y, m] = (value || "").split("-").map(Number); return y && m ? { y, m: m - 1 } : { y: today.getUTCFullYear(), m: today.getUTCMonth() }; });
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const first = new Date(Date.UTC(view.y, view.m, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const todayIso = iso(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)} className="ag-hover ag-focus ag-btn-secondary"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 42, padding: "0 13px", borderRadius: 10, border: `1px solid ${C.borderControl}`, background: C.surface, color: value ? C.ink : C.muted, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
        <Icon name="history" size={15} color={C.faint} />
        <span style={value ? mono({ fontSize: 13, fontWeight: 600 }) : undefined}>{value ? formatDateLabel(value) : placeholder}</span>
        <span aria-hidden style={{ color: C.faint, fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <div role="dialog" aria-label={`${label} picker`} className="ag-menu-in" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40, width: 262, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, boxShadow: SHADOW.menuPanel, padding: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <button type="button" aria-label="Previous month" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))} className="ag-hover ag-icon-button" style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="arrow-left" size={14} /></button>
            <span style={{ flex: 1, textAlign: "center", ...mono({ fontSize: 12.5, fontWeight: 700 }) }}>{MONTHS[view.m]} {view.y}</span>
            <button type="button" aria-label="Next month" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))} className="ag-hover ag-icon-button" style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="arrow-right" size={14} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: C.faint, padding: "2px 0" }}>{d}</span>)}
            {cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} />;
              const v = iso(view.y, view.m, d); const selected = v === value; const isToday = v === todayIso;
              return (
                <button key={v} type="button" aria-label={formatDateLabel(v)} aria-pressed={selected} onClick={() => { onChange(v); setOpen(false); }} className={selected ? "ag-focus" : "ag-hover ag-icon-button ag-focus"}
                  style={{ height: 30, borderRadius: 7, border: isToday && !selected ? `1px solid ${C.primaryBorder}` : "1px solid transparent", background: selected ? C.primary : "transparent", color: selected ? C.surface : C.ink, cursor: "pointer", ...mono({ fontSize: 12.5, fontWeight: selected || isToday ? 700 : 500 }) }}>
                  {d}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, borderTop: `1px solid ${C.divider}`, paddingTop: 8 }}>
            <button type="button" onClick={() => { onChange(todayIso); setOpen(false); }} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.primary, background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px" }}>Today</button>
            <span style={{ flex: 1 }} />
            {clearable && value && <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.muted, background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px" }}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  );
}
