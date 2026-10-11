"use client";

// Display Console UI kit, for the PORTAL. Since the portal redesign (stage 2) its controls are drawn by the portal kit
// (components/kit); this file keeps the props the agent pages already use.
//
// The console's kit (opsboard-react/src/components/console/ui.jsx) cannot be
// imported here — it is a separate Vite app (audit §7.3). This is the same kit
// expressed for the Next build. Sizes and weights are copied from the console
// kit literally; colours are the portal's --cw-* tokens (lib/portal-tokens.ts),
// so the kit follows the portal's light/dark theme. (It used to read
// shared/design-tokens.json — the wall's file — which the portal no longer imports.)
//
// Why it exists at all: every control below replaces a browser default.
// Native checkboxes, `confirm()` and `prompt()` are unstyleable and look
// nothing like the platform — and in an ops tool a native dialog is also the
// one piece of UI a user cannot tell apart from a phishing prompt.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  Button as KitButton, Callout, Card as KitCard, ConfirmDialog as KitConfirmDialog, EmptyState as KitEmptyState, Field, Modal, Select as KitSelect, SkeletonRows,
  TextArea as KitTextArea, TextInput as KitTextInput, Toggle as KitToggle, type ButtonVariant as KitVariant,
} from "@/components/kit";
import { cw } from "@/lib/portal-tokens";
import { FONT } from "@/components/agent/ui/tokens";

export const t = {
  font: FONT.sans,
  mono: FONT.mono,
  ink: cw.text,
  body: cw.textBody,
  muted: cw.textMuted,
  faint: cw.textMuted,
  canvas: cw.bgHover,
  surface: cw.bgSunken,
  card: cw.bgSurface,
  subtle: cw.bgPage,
  wash: cw.bgHover,
  border: cw.border,
  borderInput: cw.borderControl,
  borderInner: cw.divider,
  blue: cw.primary,
  blueDeep: cw.textLink,
  blueHover: cw.primaryHover,
  blueTint: cw.primaryTint,
  blueWash: cw.primaryTint,
  blueBorder: cw.primaryTintBorder,
  green: cw.success,
  greenDeep: cw.successText,
  greenTint: cw.successTint,
  greenBorder: cw.successBorder,
  red: cw.dangerSolid,
  redDeep: cw.dangerText,
  redTint: cw.dangerTint,
  redBorder: cw.dangerBorder,
  amber: cw.warningText,
  amberTint: cw.warningTint,
  amberBorder: cw.warningBorder,
  shadow: cw.shadow1,
  shadowPanel: cw.shadow2,
} as const;

const GLOBAL_CSS = `
  .cw-kit { font-family: ${t.font}; color: ${t.ink}; }
  .cw-kit input::placeholder, .cw-kit textarea::placeholder { color: ${t.faint}; }
  .cw-kit input, .cw-kit textarea, .cw-kit button { font-family: inherit; }
  @keyframes cwspin { to { transform: rotate(360deg); } }
  @keyframes cwfade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .cw-fade { animation: cwfade .22s ease; }
  .cw-hover-surface:hover { background: ${t.surface} !important; }
  .cw-hover-primary:hover { background: ${t.blueHover} !important; }
  .cw-hover-danger:hover { background: var(--cw-danger-border) !important; }
  .cw-hover-row:hover { background: ${t.subtle}; }
  @media (prefers-reduced-motion: reduce) { .cw-fade { animation: none !important; } }
`;

export function ConsoleStyles() {
  return <style>{GLOBAL_CSS}</style>;
}

// ── Buttons — the portal kit's (components/kit, portal redesign §2.1), with this kit's props ─────────────

type Variant = "primary" | "secondary" | "ghost" | "soft" | "softBlue" | "danger";
const KIT_VARIANT: Record<Variant, KitVariant> = { primary: "primary", secondary: "secondary", ghost: "quiet", soft: "secondary", softBlue: "secondary", danger: "danger" };

export function Button({
  variant = "secondary",
  size = "md",
  spin = false,
  disabled = false,
  style,
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
  return <KitButton variant={KIT_VARIANT[variant] ?? "secondary"} size={size === "lg" ? "md" : size} loading={spin} disabled={disabled} style={style} {...rest}>{children}</KitButton>;
}

// ── Toggle — the kit's switch ───────────────────────────────────────────────

export function Toggle({ on, onToggle, disabled = false, label }: { on: boolean; onToggle: () => void; disabled?: boolean; size?: "sm" | "md"; label?: string }) {
  return <KitToggle checked={Boolean(on)} onChange={() => onToggle()} disabled={disabled} ariaLabel={label} />;
}

// ── Inputs — the kit's ───────────────────────────────────────────────────────

export function TextInput({ mono = false, style, ...rest }: { mono?: boolean; style?: CSSProperties } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "style">) {
  return <KitTextInput mono={mono} style={style} {...rest} />;
}

export function TextArea({ style, ...rest }: { style?: CSSProperties } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "style">) {
  return <KitTextArea style={style} {...rest} />;
}

export function FieldLabel({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <label style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
      {children}
      {extra}
    </label>
  );
}

// ── Dropdown — the kit's Select (a styled listbox, never a native <select>) ──

export function Dropdown<T extends string>({
  label, value, options, onChange, style = {},
}: {
  label?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  style?: CSSProperties;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <span style={{ display: "inline-block", minWidth: 180, ...style }}>
      <KitSelect<T>
        value={value}
        onChange={onChange}
        options={options}
        label={label ?? current?.label}
        renderValue={(o) => (label ? <><span style={{ color: t.muted, fontWeight: 600 }}>{label}</span> {o.label}</> : o.label)}
      />
    </span>
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
  return <Callout tone="danger">{children}</Callout>;
}

export function InfoBanner({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={style}><Callout tone="info">{children}</Callout></div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <KitCard padded={false}><KitEmptyState title={title} compact>{children}</KitEmptyState></KitCard>;
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return <KitCard padded={false}><SkeletonRows rows={rows} /></KitCard>;
}

// ── Dialogs — the kit's Modal (replace confirm() and prompt()) ───────────────

export function ConfirmDialog({
  open, title, body, confirmLabel = "Delete", danger = true, busy = false, onConfirm, onCancel,
}: {
  open: boolean; title: string; body?: ReactNode; confirmLabel?: string;
  danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return <KitConfirmDialog open={open} title={title} body={body} confirmLabel={confirmLabel} danger={danger} busy={busy} onConfirm={onConfirm} onCancel={onCancel} />;
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
  const valid = reason.trim().length >= minLength;
  return (
    <Modal open={open} onClose={onCancel} busy={busy} title={title} icon={danger ? "triangle-alert" : "info"} tone={danger ? "danger" : "primary"} width={470}
      actions={<>
        <span style={{ marginRight: "auto", alignSelf: "center", fontSize: 12, color: valid ? t.muted : "var(--cw-warning-text)" }}>
          {valid ? "Recorded in the audit log." : `At least ${minLength} characters — this is recorded in the audit log.`}
        </span>
        <KitButton onClick={onCancel} disabled={busy}>Cancel</KitButton>
        <KitButton variant={danger ? "danger" : "primary"} loading={busy} disabled={!valid} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</KitButton>
      </>}>
      {body}
      <div style={{ marginTop: 12 }}>
        <Field label={label}><KitTextArea data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} /></Field>
      </div>
    </Modal>
  );
}
