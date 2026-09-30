"use client";

// Hand-built controls for Flight intake and the Agent mailbox. No native <select>, date/time input, checkbox
// or title tooltip anywhere in these pages (build rule). Every control: keyboard complete, ARIA roles, Esc,
// arrow keys, visible focus (.ag-focus), and it stays still under prefers-reduced-motion.

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { C, INTAKE, SHADOW, TONE, mono, type Tone } from "../ui/tokens";
import { Icon } from "../ui/primitives";

// ── Styles: pulse, transitions, hatch, reduced motion ───────────────────────────────────────────────────
export function IntakeStyles() {
  return (
    <style>{`
      @keyframes cwpulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
      .cw-pulse { animation: cwpulse ${INTAKE.pulse} ease-in-out infinite; }
      .cw-t-field { transition: background-color 120ms cubic-bezier(.2,.8,.2,1), border-color 120ms cubic-bezier(.2,.8,.2,1); }
      .cw-fade { animation: cwfade 100ms cubic-bezier(.2,.8,.2,1); }
      @keyframes cwfade { from { opacity: 0 } to { opacity: 1 } }
      .cw-expand { animation: cwexpand 160ms cubic-bezier(.2,.8,.2,1); transform-origin: top; }
      @keyframes cwexpand { from { opacity: 0; transform: scaleY(.98) } to { opacity: 1; transform: none } }
      .cw-drawer { animation: cwdrawer 200ms cubic-bezier(.2,.8,.2,1); }
      @keyframes cwdrawer { from { transform: translateX(600px) } to { transform: none } }
      .cw-scrim { animation: cwfade 200ms cubic-bezier(.2,.8,.2,1); }
      .cw-flash-blue { animation: cwflashb 1200ms cubic-bezier(.4,0,1,1); }
      @keyframes cwflashb { from { background-color: ${INTAKE.flashBlue} } }
      .cw-flash-red { animation: cwflashr 1200ms cubic-bezier(.4,0,1,1); }
      @keyframes cwflashr { from { background-color: ${INTAKE.flashRed} } }
      .cw-hatch { background: repeating-linear-gradient(135deg, ${INTAKE.hatchA} 0 6px, ${INTAKE.hatchB} 6px 12px); }
      .cw-row:hover { background: ${C.hover}; }
      .cw-input:focus-within { border-color: ${C.primary} !important; box-shadow: ${SHADOW.focus}; }
      .cw-opt[aria-selected="true"], .cw-opt:hover, .cw-opt[data-active="true"] { background: ${C.hover}; }
      .cw-img-blocked { display: inline-block; border: 1.5px dashed ${C.disabledFill}; border-radius: 6px; padding: 6px 9px; color: ${C.muted}; font-size: 12px; }
      @media (prefers-reduced-motion: reduce) {
        .cw-pulse { animation: none; opacity: 1; }
        .cw-t-field, .cw-fade, .cw-expand, .cw-drawer, .cw-scrim, .cw-flash-blue, .cw-flash-red { animation: none !important; transition: none !important; }
      }
      @media print { .cw-reveal-value { display: none !important; } .cw-reveal-mask { display: inline !important; } }
    `}</style>
  );
}

export function PulseDot({ color, size = 7 }: { color: string; size?: number }) {
  return <span aria-hidden className="cw-pulse" style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flex: "none" }} />;
}

/** Status pill (§I3 / §M5): 11.5/700, radius 999, icon 11 — or a pulsing dot for in-progress / waiting. */
export function StatusPill({ tone, icon, pulse, children, size = "md" }: { tone: Tone; icon?: string; pulse?: boolean; children: ReactNode; size?: "md" | "sm" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: size === "sm" ? 11 : 11.5, fontWeight: 700, color: tone.fg, background: tone.bg, border: `1px solid ${tone.bd}`, borderRadius: 999, padding: "2px 8px 2px 6px", lineHeight: 1.35, whiteSpace: "nowrap" }}>
      {pulse ? <PulseDot color={tone.ic} /> : icon ? <Icon name={icon} size={11} color={tone.ic} /> : null}
      {children}
    </span>
  );
}

/** Type chip (§I1): neutral on purpose — type is not urgency. */
export function TypeChip({ type, long = false }: { type: "handling" | "scheduled"; long?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: C.body, border: `1px solid ${C.borderControl}`, borderRadius: 6, padding: "2px 7px 2px 5px", background: C.surface, whiteSpace: "nowrap" }}>
      <Icon name={type === "scheduled" ? "calendar-clock" : "clipboard-list"} size={12} color={C.muted} />
      {type === "scheduled" ? (long ? "Scheduled flight" : "Scheduled") : long ? "Handling request" : "Handling"}
    </span>
  );
}

export function Tag({ tone, children, style }: { tone: { fg: string; bg: string }; children: ReactNode; style?: CSSProperties }) {
  return <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: tone.fg, background: tone.bg, borderRadius: 4, padding: "2px 6px", lineHeight: 1.4, whiteSpace: "nowrap", ...style }}>{children}</span>;
}

// ── Tooltip (hand-built; never the title attribute) ────────────────────────────────────────────────────
export function Tooltip({ label, children, placement = "top" }: { label: ReactNode; children: (props: { "aria-describedby": string; onMouseEnter: () => void; onMouseLeave: () => void; onFocus: () => void; onBlur: () => void }) => ReactNode; placement?: "top" | "bottom" }) {
  const id = useId(); const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const k = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open]);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      {children({ "aria-describedby": id, onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false), onFocus: () => setOpen(true), onBlur: () => setOpen(false) })}
      <span role="tooltip" id={id} style={{ position: "absolute", [placement === "top" ? "bottom" : "top"]: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: C.ink, color: C.surface, fontSize: 12, fontWeight: 500, lineHeight: 1.4, padding: "5px 8px", borderRadius: 6, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 60, opacity: open ? 1 : 0, visibility: open ? "visible" : "hidden" }}>{label}</span>
    </span>
  );
}

// ── Select: a listbox menu (the design's dropdowns h30 radius 8) ───────────────────────────────────────
export type Option<T extends string> = { value: T; label: string; hint?: string };
export function Select<T extends string>({ label, value, options, onChange, active, width, prefix, disabled, compact = true, "aria-label": ariaLabel }: { label?: string; value: T; options: Option<T>[]; onChange: (v: T) => void; active?: boolean; width?: number; prefix?: string; disabled?: boolean; compact?: boolean; "aria-label"?: string }) {
  const [open, setOpen] = useState(false); const [idx, setIdx] = useState(0);
  const btn = useRef<HTMLButtonElement>(null); const list = useRef<HTMLUListElement>(null); const id = useId();
  const cur = options.find((o) => o.value === value);
  const typed = useRef({ s: "", t: 0 });
  useEffect(() => { if (open) { const i = Math.max(0, options.findIndex((o) => o.value === value)); setIdx(i); requestAnimationFrame(() => list.current?.focus()); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) return; const d = (e: MouseEvent) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", d); return () => document.removeEventListener("mousedown", d); }, [open]);
  const choose = (i: number) => { const o = options[i]; if (o) onChange(o.value); setOpen(false); btn.current?.focus(); };
  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setIdx(0); } else if (e.key === "End") { e.preventDefault(); setIdx(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(idx); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) { const now = Date.now(); typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : "") + e.key.toLowerCase(), t: now }; const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.s)); if (i >= 0) setIdx(i); }
  };
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button ref={btn} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel ?? label} className="ag-focus" onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}
        style={{ height: compact ? 30 : 34, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px", borderRadius: 8, border: `1px solid ${active ? C.citeOutline : C.borderControl}`, background: active ? C.suggestHover : C.surface, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.body, cursor: disabled ? "not-allowed" : "pointer", width, opacity: disabled ? 0.5 : 1 }}>
        {prefix && <span style={{ color: C.muted, fontWeight: 500 }}>{prefix} ·</span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur?.label ?? label}</span>
        <Icon name="chevron-down" size={13} color={C.muted} style={{ marginLeft: "auto" }} />
      </button>
      {open && (
        <ul ref={list} role="listbox" id={id} tabIndex={-1} aria-activedescendant={`${id}-${idx}`} aria-label={ariaLabel ?? label} onKeyDown={onListKey}
          style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: Math.max(width ?? 0, 180), maxHeight: 320, overflowY: "auto", margin: 0, padding: 4, listStyle: "none", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, boxShadow: SHADOW.menuPanel, zIndex: 50, outline: "none" }}>
          {options.map((o, i) => (
            <li key={o.value} id={`${id}-${i}`} role="option" aria-selected={o.value === value} data-active={i === idx} className="cw-opt" onMouseEnter={() => setIdx(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)}
              style={{ padding: "7px 10px", borderRadius: 7, fontSize: 13, fontWeight: o.value === value ? 700 : 500, color: C.ink, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 14, display: "inline-flex" }}>{o.value === value && <Icon name="check" size={13} color={C.primary} />}</span>
              <span style={{ flex: 1 }}>{o.label}</span>{o.hint && <span style={{ fontSize: 11.5, color: C.faint }}>{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Segmented control (radiogroup, roving focus, arrows select) ────────────────────────────────────────
export function Segmented<T extends string>({ options, value, onChange, label, colors, size = "md", disabled }: { options: { value: T; label: ReactNode; count?: number; countTone?: "red" }[]; value: T; onChange: (v: T) => void; label: string; colors?: Partial<Record<T, { fg: string; bg: string; inset: string }>>; size?: "md" | "sm"; disabled?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (d: number) => { const n = (i + d + options.length) % options.length; onChange(options[n].value); refs.current[n]?.focus(); };
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "inline-flex", background: C.hover, borderRadius: 9, padding: 3, gap: 2 }}
      onKeyDown={(e) => { if (disabled) return; if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); } else if (e.key === "Home") { e.preventDefault(); onChange(options[0].value); refs.current[0]?.focus(); } else if (e.key === "End") { e.preventDefault(); onChange(options[options.length - 1].value); refs.current[options.length - 1]?.focus(); } }}>
      {options.map((o, k) => {
        const on = o.value === value; const col = colors?.[o.value];
        return (
          <button key={o.value} ref={(el) => { refs.current[k] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} disabled={disabled} className="ag-focus" onClick={() => onChange(o.value)}
            style={{ fontFamily: "inherit", fontSize: size === "sm" ? 12.5 : 13, fontWeight: on ? 700 : 600, padding: size === "sm" ? "5px 10px" : "6px 12px", borderRadius: 7, border: "none", cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              background: on ? (col?.bg ?? C.surface) : "transparent", color: on ? (col?.fg ?? C.ink) : C.muted, boxShadow: on ? (col ? `inset 0 0 0 1.5px ${col.inset}` : SHADOW.composer) : "none" }}>
            {o.label}
            {o.count != null && <span style={{ ...mono({ fontSize: 11, fontWeight: 700 }), color: o.countTone === "red" ? C.surface : C.muted, background: o.countTone === "red" ? C.dangerBadge : "transparent", borderRadius: 999, padding: o.countTone === "red" ? "0 6px" : 0 }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Checkbox (role=checkbox, Space toggles) ────────────────────────────────────────────────────────────
export function Checkbox({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <span role="checkbox" aria-checked={checked} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} className="ag-focus" onClick={() => !disabled && onChange(!checked)} onKeyDown={(e) => { if (!disabled && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onChange(!checked); } }}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12.5, color: C.body, borderRadius: 6, userSelect: "none", opacity: disabled ? 0.6 : 1 }}>
      <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? C.primary : C.disabledFill}`, background: checked ? C.primary : C.surface, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{checked && <Icon name="check" size={12} color={C.surface} />}</span>
      {children}
    </span>
  );
}

// ── Tabs (role=tablist; arrows move and select) ────────────────────────────────────────────────────────
export function TabList<T extends string>({ tabs, value, onChange, label, underline = false }: { tabs: { value: T; label: ReactNode; count?: number; countTone?: "red" | "plain" }[]; value: T; onChange: (v: T) => void; label: string; underline?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const i = Math.max(0, tabs.findIndex((t) => t.value === value));
  const go = (n: number) => { const k = (n + tabs.length) % tabs.length; onChange(tabs[k].value); refs.current[k]?.focus(); };
  return (
    <div role="tablist" aria-label={label} onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); } else if (e.key === "Home") { e.preventDefault(); go(0); } else if (e.key === "End") { e.preventDefault(); go(tabs.length - 1); } }}
      style={underline ? { display: "flex", gap: 22 } : { display: "inline-flex", background: C.hover, borderRadius: 10, padding: 3, gap: 2 }}>
      {tabs.map((t, k) => { const on = t.value === value; return (
        <button key={t.value} ref={(el) => { refs.current[k] = el; }} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} className="ag-focus" onClick={() => onChange(t.value)}
          style={underline ? { fontFamily: "inherit", fontSize: 14.5, fontWeight: 700, color: on ? C.ink : C.muted, background: "none", border: "none", borderBottom: `2px solid ${on ? C.ink : "transparent"}`, padding: "6px 0 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }
            : { fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: on ? C.surface : "transparent", color: on ? C.ink : C.muted, boxShadow: on ? SHADOW.composer : "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
          {t.label}
          {t.count != null && (t.countTone === "red" && t.count > 0 ? <span style={{ ...mono({ fontSize: 11, fontWeight: 700 }), color: C.surface, background: C.dangerBadge, borderRadius: 999, padding: "0 6px" }}>{t.count}</span> : <span style={{ ...mono({ fontSize: 11.5, fontWeight: 600 }), color: C.faint }}>{t.count.toLocaleString("en-GB")}</span>)}
        </button>
      ); })}
    </div>
  );
}

// ── Focus trap shared by Dialog and Drawer ─────────────────────────────────────────────────────────────
function useFocusTrap(open: boolean, box: React.RefObject<HTMLElement | null>, onEscape: (() => void) | null) {
  useLayoutEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => [...(box.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    requestAnimationFrame(() => (box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? box.current)?.focus());
    const k = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) { e.preventDefault(); e.stopPropagation(); onEscape(); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", k, true);
    return () => { document.removeEventListener("keydown", k, true); opener?.focus?.(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const OverlayContext = createContext<{ depth: number }>({ depth: 0 });
/** True while any dialog or drawer is open: page hotkeys stand down. */
export function useOverlayOpen() { return useContext(OverlayContext).depth > 0; }

/** Modal dialog. `onClose` null = cannot be dismissed (e.g. waiting for Leon). */
export function Dialog({ open, onClose, labelledBy, width = 560, children, accent = "neutral" }: { open: boolean; onClose: (() => void) | null; labelledBy: string; width?: number; children: ReactNode; accent?: "primary" | "neutral" }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(open, box, onClose);
  if (!open) return null;
  return (
    <div className="cw-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }} style={{ position: "fixed", inset: 0, background: INTAKE.scrimDialog, zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "10vh" }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className="cw-fade"
        style={{ width, maxWidth: "calc(100vw - 32px)", maxHeight: "80vh", overflowY: "auto", background: C.surface, borderRadius: 14, border: `1.5px solid ${accent === "primary" ? C.primary : C.borderControl}`, boxShadow: SHADOW.modalLight, outline: "none" }}>
        {children}
      </div>
    </div>
  );
}

/** Right drawer, 600 wide (§I9). */
export function Drawer({ open, onClose, labelledBy, children, width = 600 }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(open, box, onClose);
  if (!open) return null;
  return (
    <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 90 }}>
      <div className="cw-scrim" onMouseDown={onClose} style={{ position: "absolute", inset: 0, background: INTAKE.scrimDrawer }} />
      <aside ref={box} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className="cw-drawer"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width, maxWidth: "100vw", background: C.surface, boxShadow: INTAKE.drawerShadow, overflowY: "auto", outline: "none" }}>
        {children}
      </aside>
    </div>
  );
}

// ── Page hotkeys: never while typing, never while a dialog/drawer is open (unless allowed) ─────────────
export function useHotkeys(map: Record<string, (e: globalThis.KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(map); ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.getAttribute("role") === "listbox");
      if (typing && e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') && e.key !== "Escape") return;
      const fn = ref.current[e.key]; if (fn) fn(e);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [enabled]);
}

/** A mono text input with an optional suffix cell (UTC / TZ ?). Always type="text": never a native time/date. */
export function TextInput({ value, onCommit, placeholder, monoText = true, suffix, style, ariaLabel, readOnly, invalid, borderColor, dashed, background, width, onKeyDown, height = 32 }: { value: string; onCommit: (v: string) => void; placeholder?: string; monoText?: boolean; suffix?: { text: string; tone: "utc" | "tz" }; style?: CSSProperties; ariaLabel: string; readOnly?: boolean; invalid?: boolean; borderColor?: string; dashed?: boolean; background?: string; width?: number | string; onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void; height?: number }) {
  const [v, setV] = useState(value); useEffect(() => setV(value), [value]);
  const commit = useCallback(() => { if (v !== value) onCommit(v); }, [v, value, onCommit]);
  return (
    <span className="cw-t-field cw-input" style={{ display: "inline-flex", alignItems: "stretch", height, width: width ?? "100%", borderRadius: 7, border: `${invalid || dashed ? 1.5 : 1}px ${dashed ? "dashed" : "solid"} ${borderColor ?? (invalid ? C.dangerBadge : C.borderControl)}`, background: background ?? (readOnly ? C.page : C.surface), overflow: "hidden", ...style }}>
      <input type="text" aria-label={ariaLabel} aria-invalid={invalid || undefined} value={v} readOnly={readOnly} placeholder={placeholder} spellCheck={false} autoComplete="off"
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } else if (e.key === "Escape") { setV(value); } onKeyDown?.(e); }}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", padding: "0 10px", fontFamily: monoText ? "var(--font-mono, 'IBM Plex Mono', monospace)" : "inherit", ...(monoText ? mono({ fontSize: 13.5, fontWeight: 600 }) : { fontSize: 13.5, fontWeight: 500 }), color: C.ink }} />
      {suffix && <span aria-hidden style={{ display: "inline-flex", alignItems: "center", padding: "0 8px", fontSize: 11, fontWeight: 700, ...mono(), background: suffix.tone === "tz" ? TONE.red.ic : C.neutralTint, color: suffix.tone === "tz" ? C.surface : C.neutral }}>{suffix.text}</span>}
    </span>
  );
}

/** Link-styled button (no anchor unless it navigates). */
export function LinkButton({ children, onClick, icon, color = C.primary, disabled }: { children: ReactNode; onClick: () => void; icon?: string; color?: string; disabled?: boolean }) {
  return (
    <button type="button" className="ag-focus" disabled={disabled} onClick={onClick} style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 13, fontWeight: 600, color, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 5, opacity: disabled ? 0.5 : 1 }}>
      {icon && <Icon name={icon} size={14} color={color} />}{children}
    </button>
  );
}

/** Countdown text for an expiring confirmation: "Expires in 4:52". */
export function useCountdown(untilIso: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!untilIso) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [untilIso]);
  if (!untilIso) return null;
  const s = Math.max(0, Math.round((Date.parse(untilIso) - now) / 1000));
  return { seconds: s, text: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` };
}
