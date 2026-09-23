"use client";

// Display Console UI kit, for the PORTAL.
//
// The console's kit (opsboard-react/src/components/console/ui.jsx) cannot be
// imported here — it is a separate Vite app (audit §7.3). This is the same kit
// expressed for the Next build, wired to the SAME token source
// (shared/design-tokens.json) so the two cannot drift on colour, radius or
// type. Sizes and weights are copied from the console kit literally.
//
// Why it exists at all: every control below replaces a browser default.
// Native checkboxes, `confirm()` and `prompt()` are unstyleable and look
// nothing like the platform — and in an ops tool a native dialog is also the
// one piece of UI a user cannot tell apart from a phishing prompt.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import tokens from "@/shared/design-tokens.json";

const sc = tokens.color;

export const t = {
  font: tokens.font.sans,
  mono: tokens.font.mono,
  ink: sc.text,
  body: sc.textBody,
  muted: sc.textMuted,
  faint: sc.textFaint,
  canvas: "#e8e9ec",
  surface: "#f5f6f7",
  card: sc.card,
  subtle: sc.cardSubtle,
  wash: "#f0f1f3",
  border: sc.border,
  borderInput: "#d6d8dc",
  borderInner: sc.borderInner,
  blue: sc.primary,
  blueDeep: sc.primaryDeep,
  blueTint: sc.primaryTint,
  blueWash: "#f2f7ff",
  blueBorder: "#dbe6ff",
  green: sc.green,
  greenDeep: sc.greenDeep,
  greenTint: sc.greenTint,
  greenBorder: "#c7ead2",
  red: sc.red,
  // Console-local: the shared redDeep/redTint differ from the shipped console
  // values, and this kit must match the console pixel for pixel.
  redDeep: "#b3383c",
  redTint: "#fdecec",
  redBorder: "#f4cdcd",
  amber: sc.amberDeep,
  amberTint: sc.amberTint,
  amberBorder: "#f0d3ba",
  shadow: "0 1px 2px rgba(16,18,22,.04)",
  shadowPanel: "0 1px 2px rgba(16,18,22,.04), 0 16px 40px rgba(16,18,22,.06)",
} as const;

const GLOBAL_CSS = `
  .cw-kit { font-family: ${t.font}; color: ${t.ink}; }
  .cw-kit input::placeholder, .cw-kit textarea::placeholder { color: ${t.faint}; }
  .cw-kit input, .cw-kit textarea, .cw-kit button { font-family: inherit; }
  @keyframes cwspin { to { transform: rotate(360deg); } }
  @keyframes cwfade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .cw-fade { animation: cwfade .22s ease; }
  .cw-hover-surface:hover { background: ${t.surface} !important; }
  .cw-hover-primary:hover { background: ${t.blueDeep} !important; }
  .cw-hover-danger:hover { background: #fbdcdc !important; }
  .cw-hover-row:hover { background: ${t.subtle}; }
  @media (prefers-reduced-motion: reduce) { .cw-fade { animation: none !important; } }
`;

export function ConsoleStyles() {
  return <style>{GLOBAL_CSS}</style>;
}

// ── Buttons ────────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "soft" | "softBlue" | "danger";

const BUTTON_VARIANTS: Record<Variant, { style: CSSProperties; hover: string }> = {
  primary: { style: { color: "#fff", background: t.blue, border: "none" }, hover: "cw-hover-primary" },
  secondary: { style: { color: t.ink, background: t.card, border: `1px solid ${t.borderInput}` }, hover: "cw-hover-surface" },
  ghost: { style: { color: t.body, background: "transparent", border: "none" }, hover: "cw-hover-surface" },
  soft: { style: { color: t.body, background: t.wash, border: "none" }, hover: "" },
  softBlue: { style: { color: t.blueDeep, background: t.blueTint, border: "none" }, hover: "" },
  danger: { style: { color: "#fff", background: t.red, border: "none" }, hover: "" },
};

export function Button({
  variant = "secondary",
  size = "md",
  spin = false,
  disabled = false,
  style = {},
  children,
  ...rest
}: {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  spin?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style" | "children">) {
  const v = BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.secondary;
  const pad = size === "sm" ? "7px 13px" : size === "lg" ? "11px 20px" : "10px 16px";
  return (
    <button
      type="button"
      className={disabled ? "" : v.hover}
      disabled={disabled}
      style={{
        fontFamily: "inherit",
        fontSize: size === "sm" ? 13 : 14,
        fontWeight: 600,
        padding: pad,
        borderRadius: 10,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        whiteSpace: "nowrap",
        opacity: disabled ? 0.55 : 1,
        ...v.style,
        ...style,
      }}
      {...rest}
    >
      {spin && (
        <span
          aria-hidden
          style={{
            width: 13, height: 13, borderRadius: "50%",
            border: `2px solid ${variant === "primary" || variant === "danger" ? "rgba(255,255,255,.45)" : "#cbd5e1"}`,
            borderTopColor: variant === "primary" || variant === "danger" ? "#fff" : t.blue,
            animation: "cwspin .7s linear infinite",
          }}
        />
      )}
      {children}
    </button>
  );
}

// ── Toggle (46×27, green when on) — replaces a native checkbox ─────────────

export function Toggle({
  on, onToggle, disabled = false, size = "md", label,
}: { on: boolean; onToggle: () => void; disabled?: boolean; size?: "sm" | "md"; label?: string }) {
  const w = size === "sm" ? 44 : 46;
  const h = size === "sm" ? 26 : 27;
  const knob = h - 6;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(on)}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: w, height: h, borderRadius: 999, border: "none",
        cursor: disabled ? "default" : "pointer",
        padding: 3, display: "flex",
        background: on ? t.green : "#cfd3d8",
        justifyContent: on ? "flex-end" : "flex-start",
        transition: "background .15s",
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <span style={{ width: knob, height: knob, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </button>
  );
}

// ── Inputs ─────────────────────────────────────────────────────────────────

const inputBase: CSSProperties = {
  width: "100%",
  border: `1px solid ${t.borderInput}`,
  borderRadius: 10,
  padding: "11px 13px",
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  background: t.card,
  color: t.ink,
  boxSizing: "border-box",
};

export function TextInput({ mono = false, style = {}, ...rest }: { mono?: boolean; style?: CSSProperties } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "style">) {
  return <input style={{ ...inputBase, ...(mono ? { fontFamily: t.mono } : {}), ...style }} {...rest} />;
}

export function TextArea({ style = {}, ...rest }: { style?: CSSProperties } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "style">) {
  return <textarea style={{ ...inputBase, minHeight: 70, resize: "vertical", ...style }} {...rest} />;
}

export function FieldLabel({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <label style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
      {children}
      {extra}
    </label>
  );
}

// ── Dropdown — replaces a native <select> ──────────────────────────────────

export function Dropdown<T extends string>({
  label, value, options, onChange, style = {},
}: {
  label?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button
        type="button"
        className="cw-hover-surface"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, height: 42,
          padding: "0 13px", borderRadius: 10, border: `1px solid ${t.borderInput}`,
          background: t.card, color: t.ink, fontSize: 14, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        {label && <span style={{ color: t.faint, fontWeight: 600 }}>{label}</span>}
        <span>{current?.label ?? value}</span>
        <span aria-hidden style={{ color: t.faint, fontSize: 11, marginLeft: 2 }}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="cw-fade"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40,
            minWidth: "100%", background: t.card, border: `1px solid ${t.border}`,
            borderRadius: 11, boxShadow: t.shadowPanel, padding: 5,
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className="cw-hover-surface"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "9px 11px", borderRadius: 8, border: "none", background: "transparent",
                fontSize: 13.5, fontWeight: o.value === value ? 700 : 500,
                color: o.value === value ? t.blueDeep : t.body,
                cursor: "pointer", textAlign: "left", fontFamily: "inherit", whiteSpace: "nowrap",
              }}
            >
              <span style={{ width: 14, color: t.blue }}>{o.value === value ? "✓" : ""}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Surfaces ───────────────────────────────────────────────────────────────

export function Card({ children, style = {}, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div
      className={className}
      style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 13, boxShadow: t.shadow, ...style }}
    >
      {children}
    </div>
  );
}

export function StatusPill({ color, bg, dot, children, style = {} }: { color: string; bg: string; dot?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, background: bg, padding: "5px 11px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", ...style }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />}
      {children}
    </span>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: t.redTint, border: `1px solid ${t.redBorder}`, borderRadius: 11, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5, color: t.redDeep }}>
      <span aria-hidden style={{ fontSize: 15, lineHeight: 1.2 }}>⚠</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function InfoBanner({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: t.blueWash, border: `1px solid ${t.blueBorder}`, borderRadius: 11, padding: "12px 14px", fontSize: 13, lineHeight: 1.55, color: t.body, ...style }}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 13, padding: "34px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: t.ink, marginBottom: 6 }}>{title}</div>
      {children && <div style={{ fontSize: 13, color: t.muted, lineHeight: 1.55, maxWidth: 460, margin: "0 auto" }}>{children}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 62, borderRadius: 13, background: t.card, border: `1px solid ${t.border}`, opacity: 0.6 }} />
      ))}
    </>
  );
}

// ── Dialogs — replace confirm() and prompt() ───────────────────────────────

export function ConfirmDialog({
  open, title, body, confirmLabel = "Delete", danger = true, busy = false, onConfirm, onCancel,
}: {
  open: boolean; title: string; body?: ReactNode; confirmLabel?: string;
  danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div
      className="cw-kit"
      style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(10,14,24,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onCancel}
    >
      <div
        className="cw-fade"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, boxShadow: t.shadowPanel, border: `1px solid ${t.border}`, maxWidth: 470, width: "100%", padding: "22px 24px" }}
      >
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start", marginBottom: 16 }}>
          <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: danger ? t.redTint : t.blueTint, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 19, color: danger ? t.red : t.blueDeep }}>
            ⚠
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: "3px 0 6px" }}>{title}</h3>
            {body && <div style={{ fontSize: 13.5, color: t.muted, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{body}</div>}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} spin={busy} disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

/** Prompt replacement: a real form, with the reason required rather than hoped for. */
export function ReasonDialog({
  open, title, body, label, placeholder, confirmLabel = "Confirm", danger = true, busy = false, minLength = 3, onConfirm, onCancel,
}: {
  open: boolean; title: string; body?: ReactNode; label: string; placeholder?: string;
  confirmLabel?: string; danger?: boolean; busy?: boolean; minLength?: number;
  onConfirm: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  const valid = reason.trim().length >= minLength;
  return (
    <div
      className="cw-kit"
      style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(10,14,24,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onCancel}
    >
      <div
        className="cw-fade"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, boxShadow: t.shadowPanel, border: `1px solid ${t.border}`, maxWidth: 470, width: "100%", padding: "22px 24px" }}
      >
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start", marginBottom: 16 }}>
          <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: danger ? t.redTint : t.blueTint, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 19, color: danger ? t.red : t.blueDeep }}>
            ⚠
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: "3px 0 6px" }}>{title}</h3>
            {body && <div style={{ fontSize: 13.5, color: t.muted, lineHeight: 1.55 }}>{body}</div>}
          </div>
        </div>
        <FieldLabel>{label}</FieldLabel>
        <TextArea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          style={{ minHeight: 76, marginBottom: 14 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: valid ? t.faint : t.amber }}>
            {valid ? "Recorded in the audit log." : `At least ${minLength} characters — this is recorded in the audit log.`}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button variant={danger ? "danger" : "primary"} spin={busy} disabled={busy || !valid} onClick={() => onConfirm(reason.trim())}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
