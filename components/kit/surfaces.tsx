"use client";

// Cards, badges, states, menus, modal and toasts (portal redesign §2.5, §2.6).
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import MaskIcon from "@/components/portal/Icon";
import { Button, IconButton } from "./Button";
import { Popover, themedRoot, useListKeys, useScrollActive } from "./popover";

// ── Card ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Card (§2.6): 52px header (icon, title, description, meta or actions), 20px body, optional 48px footer on bg-sunken. */
export function Card({ title, icon, description, meta, actions, footer, children, padded = true, className, id }: {
  title?: ReactNode; icon?: string; description?: ReactNode; meta?: ReactNode; actions?: ReactNode; footer?: ReactNode; children?: ReactNode; padded?: boolean; className?: string; id?: string;
}) {
  return (
    <section id={id} className={clsx("rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1", className)} aria-label={typeof title === "string" ? title : undefined}>
      {title && (
        <header className="flex min-h-[52px] flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-cw-divider px-5 py-2">
          {icon && <MaskIcon name={icon} size={16} color="var(--cw-text-muted)" />}
          <h2 className="m-0 text-[15px] font-bold text-cw-text">{title}</h2>
          {description && <span className="text-[13px] text-cw-text-muted">{description}</span>}
          {(meta || actions) && <span className="ml-auto flex items-center gap-2">{meta && <span className="font-mono text-[12px] text-cw-text-muted">{meta}</span>}{actions}</span>}
        </header>
      )}
      <div className={clsx(padded && "p-5", "text-[14px] leading-[1.55] text-cw-text-body")}>{children}</div>
      {footer && <footer className="flex min-h-12 items-center justify-end gap-2 rounded-b-[14px] border-t border-cw-divider bg-cw-bg-sunken px-5 py-2">{footer}</footer>}
    </section>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Tone = "success" | "warning" | "danger" | "info" | "orange" | "neutral" | "diff" | "primary";
const TONE: Record<Tone, string> = {
  success: "bg-cw-success-tint text-cw-success-text", warning: "bg-cw-warning-tint text-cw-warning-text", danger: "bg-cw-danger-tint text-cw-danger-text",
  info: "bg-cw-info-tint text-cw-info-text", orange: "bg-cw-orange-tint text-cw-orange-text", neutral: "bg-cw-neutral-tint text-cw-neutral-text",
  diff: "bg-cw-diff-tint text-cw-diff-text", primary: "bg-cw-primary-tint text-cw-text-link",
};
const DOT: Record<Tone, string> = { success: "bg-cw-success", warning: "bg-cw-warning", danger: "bg-cw-danger", info: "bg-cw-info", orange: "bg-cw-orange", neutral: "bg-cw-neutral", diff: "bg-cw-diff", primary: "bg-cw-primary" };

/** Status badge (§2.6): a tint, its text colour, and a dot. */
export function Badge({ tone = "neutral", dot = true, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex h-[22px] flex-none items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 text-[12px] font-semibold", TONE[tone], className)}>
      {dot && <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}

/** Role badge (§2.6): DEVELOPER ink, ADMIN primary, USER neutral, PENDING warning. */
export function RoleBadge({ role }: { role: "developer" | "admin" | "user" | "pending" }) {
  const look = { developer: "bg-cw-ink text-cw-on-ink", admin: "border border-cw-primary-tint-border bg-cw-primary-tint text-cw-text-link", user: "bg-cw-neutral-tint text-cw-neutral-text", pending: "border border-cw-warning-border bg-cw-warning-tint text-cw-warning-text" }[role];
  return <span className={clsx("inline-flex h-[22px] flex-none items-center rounded-[6px] px-2 text-[11.5px] font-bold tracking-[0.04em]", look)}>{role.toUpperCase()}</span>;
}

/** A count (nav items, filter groups): mono, round. */
export function CountBadge({ n, tone = "warning" }: { n: number; tone?: "warning" | "danger" | "primary" | "neutral" }) {
  const look = { warning: "bg-cw-warning-tint text-cw-warning-text", danger: "bg-cw-danger-solid text-cw-text-on-primary", primary: "bg-cw-primary text-cw-text-on-primary", neutral: "bg-cw-bg-sunken text-cw-text-body" }[tone];
  return <span className={clsx("inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-[10px] px-1.5 font-mono text-[11px] font-semibold", look)}>{n}</span>;
}

/** Keyboard key. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[4px] border border-cw-border-control px-[5px] py-px font-mono text-[11px] font-medium text-cw-text-muted">{children}</kbd>;
}

// ── Callout ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function Callout({ tone = "info", title, children, icon, action }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode; icon?: string; action?: ReactNode }) {
  const look = { info: ["bg-cw-primary-tint border-cw-primary-tint-border", "text-cw-text-link", "info"], warning: ["bg-cw-warning-tint border-cw-warning-border", "text-cw-warning-text", "triangle-alert"], danger: ["bg-cw-danger-tint border-cw-danger-border", "text-cw-danger-text", "circle-alert"], success: ["bg-cw-success-tint border-cw-success-border", "text-cw-success-text", "circle-check"] }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={clsx("flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13.5px] leading-normal text-cw-text-body", look[0])}>
      <span className={clsx("mt-0.5 flex", look[1])}><MaskIcon name={icon ?? look[2]} size={16} /></span>
      <div className="min-w-0 flex-1">{title && <div className={clsx("font-semibold", look[1])}>{title}</div>}{children}</div>
      {action}
    </div>
  );
}

// ── States (§2.5) ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Nothing exists yet: say how things get here. */
export function EmptyState({ icon = "inbox", title, children, action, compact = false }: { icon?: string; title: ReactNode; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-2 px-6 text-center", compact ? "py-8" : "min-h-[240px] py-6")}>
      <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-cw-border bg-cw-bg-sunken text-cw-text-muted"><MaskIcon name={icon} size={18} /></span>
      <div className="mt-1 text-[15px] font-bold text-cw-text">{title}</div>
      {children && <div className="max-w-[340px] text-[13px] leading-normal text-cw-text-muted [text-wrap:pretty]">{children}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

/** Nothing matches: say what hid it and offer to clear. */
export function NoMatchState({ title, children, onClear, clearLabel = "Clear filters" }: { title: ReactNode; children?: ReactNode; onClear: () => void; clearLabel?: string }) {
  return <EmptyState icon="search-x" title={title} action={<Button size="sm" onClick={onClear}>{clearLabel}</Button>}>{children}</EmptyState>;
}

/** Something failed: name it, keep the status visible, offer a retry. */
export function ErrorState({ title, detail, onRetry, onReport, compact = false }: { title: ReactNode; detail?: ReactNode; onRetry?: () => void; onReport?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={clsx("flex flex-col items-center justify-center gap-2 px-6 text-center", compact ? "py-8" : "min-h-[240px] py-6")}>
      <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-cw-danger-border bg-cw-danger-tint text-cw-danger-text"><MaskIcon name="cloud-off" size={18} /></span>
      <div className="mt-1 text-[15px] font-bold text-cw-text">{title}</div>
      {detail && <div className="font-mono text-[12px] text-cw-text-muted">{detail}</div>}
      {(onRetry || onReport) && (
        <div className="mt-1.5 flex gap-2">
          {onRetry && <Button size="sm" variant="primary" icon="rotate-cw" onClick={onRetry}>Try again</Button>}
          {onReport && <Button size="sm" variant="quiet" onClick={onReport}>Report a problem</Button>}
        </div>
      )}
    </div>
  );
}

/** The detail line under an error: status · method path · time (Z). */
export const errorDetail = (status: number | string, method: string, path: string, at = new Date()) => `${status} · ${method} ${path} · ${at.toISOString().slice(11, 19)}Z`;

export function Skeleton({ w, h = 10, round = 4, shimmer = true, className }: { w: number | string; h?: number; round?: number; shimmer?: boolean; className?: string }) {
  return <span aria-hidden className={clsx("inline-block flex-none", shimmer ? "cw-shimmer" : "bg-cw-skeleton", className)} style={{ width: w, height: h, borderRadius: round }} />;
}

/** Loading draws the shape of what is coming — never a bare "Loading…". */
export function SkeletonRows({ rows = 5, avatar = true, label = "Loading" }: { rows?: number; avatar?: boolean; label?: string }) {
  const widths = [["55%", "35%"], ["40%", "50%"], ["62%", "30%"], ["48%", "42%"], ["35%", "28%"]];
  return (
    <div role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-4 border-b border-cw-divider px-4 last:border-b-0">
          {avatar && <Skeleton w={28} h={28} round={14} />}
          <span className="flex flex-1 flex-col gap-1.5"><Skeleton w={widths[i % 5][0]} /><Skeleton w={widths[i % 5][1]} h={8} shimmer={false} /></span>
          <Skeleton w={52} h={20} round={6} shimmer={false} />
        </div>
      ))}
    </div>
  );
}

// ── Menu ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type MenuItem = { id: string; label: ReactNode; text?: string; icon?: string; danger?: boolean; disabled?: boolean; onSelect: () => void };

/** A menu behind a button (row ⋯, "More"): ↑↓ Home End, type to jump, Enter chooses, Esc closes. */
export function Menu({ items, label, trigger = "ellipsis", align = "end", buttonLabel }: { items: MenuItem[]; label: string; trigger?: string; align?: "start" | "end"; buttonLabel?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const keys = useListKeys(items, { isDisabled: (i) => Boolean(i.disabled), text: (i) => i.text ?? (typeof i.label === "string" ? i.label : i.id) });
  useScrollActive(open, id, keys.active);
  const run = (i: MenuItem) => { if (i.disabled) return; setOpen(false); btn.current?.focus(); i.onSelect(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (["ArrowDown", "Enter", " "].includes(e.key)) { e.preventDefault(); setOpen(true); keys.setActive(items.findIndex((i) => !i.disabled)); } return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (items[keys.active]) run(items[keys.active]); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    keys.onKey(e);
  };
  return (
    <>
      {buttonLabel ? (
        <Button ref={btn} size="sm" iconAfter="chevron-down" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)} onKeyDown={onKeyDown}>{buttonLabel}</Button>
      ) : (
        <IconButton ref={btn} icon={trigger} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
          className={clsx(open && "bg-cw-bg-active text-cw-text")} onClick={() => setOpen((o) => !o)} onKeyDown={onKeyDown} />
      )}
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} placement={align === "end" ? "bottom-end" : "bottom-start"} role="menu" label={label} id={id} minWidth={220}>
        {items.map((i, n) => (
          <div key={i.id} id={`${id}-${n}`} role="menuitem" aria-disabled={i.disabled || undefined} tabIndex={-1}
            onMouseEnter={() => keys.setActive(n)} onMouseDown={(e) => { e.preventDefault(); run(i); }}
            className={clsx("flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 text-[14px]",
              i.disabled ? "cursor-not-allowed text-cw-text-disabled" : i.danger ? "text-cw-danger-text" : "text-cw-text",
              n === keys.active && !i.disabled && (i.danger ? "bg-cw-danger-tint" : "bg-cw-bg-hover"))}>
            {i.icon && <MaskIcon name={i.icon} size={15} />}
            {i.label}
          </div>
        ))}
      </Popover>
    </>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Modal (§2.6): over a scrim, focus kept inside, Esc and the scrim close it, focus returns to what opened it. */
export function Modal({ open, onClose, title, icon, tone = "primary", children, actions, width = 440, busy = false }: {
  open: boolean; onClose: () => void; title: ReactNode; icon?: string; tone?: "primary" | "danger" | "warning"; children?: ReactNode; actions?: ReactNode; width?: number; busy?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, button:not([disabled])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); }
      if (e.key === "Tab" && box.current) {
        const f = [...box.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); (opener.current as HTMLElement | null)?.focus?.(); };
  }, [open, onClose, busy]);
  if (!open || typeof document === "undefined") return null;
  const tint = { primary: "bg-cw-primary-tint text-cw-text-link", danger: "bg-cw-danger-tint text-cw-danger-text", warning: "bg-cw-warning-tint text-cw-warning-text" }[tone];
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cw-bg-scrim p-5" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full rounded-[16px] border border-cw-border bg-cw-bg-raised text-cw-text shadow-cw-pop" style={{ maxWidth: width }}>
        <div className="flex gap-3 px-6 pt-5">
          {icon && <span aria-hidden className={clsx("flex h-9 w-9 flex-none items-center justify-center rounded-[10px]", tint)}><MaskIcon name={icon} size={17} /></span>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-[17px] font-bold leading-snug">{title}</h2>
            {children && <div className="mt-1.5 text-[13.5px] leading-[1.55] text-cw-text-body">{children}</div>}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-5">{actions}</div>
      </div>
    </div>,
    // Inside the themed container of whatever opened it (the opener, or the modal itself once focus moved in).
    themedRoot(box.current ?? document.activeElement),
  );
}

/** Confirm (replaces confirm()): Cancel and one named action. */
export function ConfirmDialog({ open, title, body, confirmLabel, busyLabel, danger = false, busy = false, icon, onConfirm, onCancel }: {
  open: boolean; title: ReactNode; body?: ReactNode; confirmLabel: string; busyLabel?: string; danger?: boolean; busy?: boolean; icon?: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} icon={icon ?? (danger ? "triangle-alert" : "info")} tone={danger ? "danger" : "primary"} busy={busy}
      actions={<>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} loading={busy} loadingLabel={busyLabel} onClick={onConfirm} data-autofocus>{confirmLabel}</Button>
      </>}>
      {body}
    </Modal>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export type ToastInput = { tone?: "success" | "warning" | "danger" | "info"; title: ReactNode; body?: ReactNode; action?: { label: string; onClick: () => void }; duration?: number };
type ToastItem = ToastInput & { id: number };
const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

/** Toasts (§2.6): bottom-right, announced politely (errors assertively); 6 s, or until dismissed when there is an action. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // The toast layer is a portal, which the server cannot render: draw it only after mount, or the first client render
  // would differ from the server's on every page and React would throw the server render away.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback((t: ToastInput) => {
    const id = next.current++;
    setItems((l) => [...l.slice(-3), { ...t, id }]);
    const ms = t.duration ?? (t.action ? 10000 : 6000);
    if (ms > 0) setTimeout(() => dismiss(id), ms);
  }, [dismiss]);
  const look = { success: ["circle-check", "var(--cw-success)"], warning: ["triangle-alert", "var(--cw-warning)"], danger: ["circle-x", "var(--cw-danger)"], info: ["info", "var(--cw-info)"] } as const;
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {mounted && createPortal(
        <div className="pointer-events-none fixed bottom-5 right-5 z-[110] flex w-[380px] max-w-[calc(100vw-40px)] flex-col gap-2.5">
          <div aria-live="polite" className="contents">
            {items.filter((t) => t.tone !== "danger").map((t) => <ToastCard key={t.id} t={t} look={look[t.tone ?? "info"]} onClose={() => dismiss(t.id)} />)}
          </div>
          <div aria-live="assertive" className="contents">
            {items.filter((t) => t.tone === "danger").map((t) => <ToastCard key={t.id} t={t} look={look.danger} onClose={() => dismiss(t.id)} />)}
          </div>
        </div>,
        themedRoot(document.body),
      )}
    </ToastContext.Provider>
  );
}
function ToastCard({ t, look, onClose }: { t: ToastItem; look: readonly [string, string]; onClose: () => void }) {
  return (
    <div role={t.tone === "danger" ? "alert" : "status"} className="pointer-events-auto flex items-start gap-2.5 rounded-[12px] border border-cw-border bg-cw-bg-raised py-3 pl-3.5 pr-3 text-cw-text shadow-cw-pop">
      <span className="mt-px flex"><MaskIcon name={look[0]} size={16} color={look[1]} /></span>
      <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{t.title}</div>{t.body && <div className="mt-0.5 text-[12.5px] leading-[1.45] text-cw-text-muted">{t.body}</div>}</div>
      {t.action && <button type="button" onClick={() => { t.action!.onClick(); onClose(); }} className="flex-none cursor-pointer rounded-[6px] border-none bg-transparent px-1 font-sans text-[13px] font-semibold text-cw-text-link outline-none hover:underline focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">{t.action.label}</button>}
      <button type="button" aria-label="Dismiss" onClick={onClose} className="flex h-5 w-5 flex-none cursor-pointer items-center justify-center rounded-[4px] border-none bg-transparent text-cw-text-muted outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]"><MaskIcon name="x" size={14} /></button>
    </div>
  );
}
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? { show: () => {} };
}
