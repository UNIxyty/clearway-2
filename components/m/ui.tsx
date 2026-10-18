"use client";

// The phone pages' primitives (mobile-portal-spec.md › Rules): 44 px targets, 52–56 px primary actions in a sticky
// bar, rows of 56–68 px, bottom sheets for one decision, the three states on every screen. Colours are the portal's
// tokens plus the --ca-* / --mx-* additions, as Tailwind classes (tailwind.config.ts) — never a literal.
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import MaskIcon from "@/components/portal/Icon";
import { Skeleton } from "@/components/kit";
import { STATUS_LABEL, STATUS_TOKEN, CHECK_LABEL } from "@/shared/wall-facts.mjs";

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");

/** A 52 px (primary) / 48 px action. `kind`: primary · secondary · danger · sens (passenger data, rose). */
export function MButton({ children, kind = "secondary", size = "md", icon, href, onClick, disabled, type = "button", className, ariaLabel }: {
  children?: ReactNode; kind?: "primary" | "secondary" | "danger" | "sens" | "quiet"; size?: "md" | "lg" | "sm"; icon?: string; href?: string;
  onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string; ariaLabel?: string;
}) {
  const h = size === "lg" ? "h-[56px] text-[16px]" : size === "sm" ? "h-[44px] text-[14px]" : "h-[52px] text-[15.5px]";
  const look = {
    primary: "bg-cw-primary text-cw-text-on-primary font-bold",
    secondary: "border border-cw-border-control bg-cw-bg-surface text-cw-text font-semibold",
    danger: "bg-cw-danger-solid text-cw-text-on-primary font-bold",
    sens: "bg-ca-sens-solid text-ca-sens-on-solid font-bold",
    quiet: "text-cw-text-link font-semibold",
  }[kind];
  const cls = cx("inline-flex items-center justify-center gap-2 rounded-[12px] px-4 whitespace-nowrap disabled:opacity-60", h, look, className);
  const body = <>{icon && <MaskIcon name={icon} size={17} color="currentColor" />}{children}</>;
  if (href && !disabled) return <Link href={href} className={cls} aria-label={ariaLabel}>{body}</Link>;
  return <button type={type} className={cls} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>{body}</button>;
}

/** A sticky action bar at the thumb: one or two actions, the safe area under them. */
export function StickyBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-[5] mt-auto flex flex-col gap-2 border-t border-cw-border bg-cw-bg-page px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
      <div className="flex gap-2.5 [&>*]:flex-1">{children}</div>
      {note && <span className="text-center text-[12.5px] text-cw-text-muted">{note}</span>}
    </div>
  );
}

/** A card: surface, border, 14 px radius. */
export function MCard({ children, className, tone }: { children: ReactNode; className?: string; tone?: "warning" | "danger" | "info" }) {
  const t = tone === "warning" ? "border-cw-warning-border" : tone === "danger" ? "border-cw-danger-border" : tone === "info" ? "border-cw-primary-tint-border" : "border-cw-border";
  return <section className={cx("overflow-hidden rounded-[14px] border bg-cw-bg-surface", t, className)}>{children}</section>;
}

/** A list row of at least 56 px; a link when `href`, a button when `onClick`. */
export function MRow({ children, href, onClick, className, minH = 56, ariaLabel }: { children: ReactNode; href?: string; onClick?: () => void; className?: string; minH?: number; ariaLabel?: string }) {
  const cls = cx("flex w-full items-center gap-3 px-3.5 py-2 text-left text-cw-text border-t border-cw-divider first:border-t-0", className);
  const style = { minHeight: minH };
  if (href) return <Link href={href} className={cls} style={style} aria-label={ariaLabel}>{children}</Link>;
  if (onClick) return <button type="button" className={cls} style={style} onClick={onClick} aria-label={ariaLabel}>{children}</button>;
  return <div className={cls} style={style}>{children}</div>;
}

export function Chevron() {
  return <MaskIcon name="chevron-right" size={17} color="var(--cw-text-muted)" className="flex-none" />;
}

/** A section heading in 12 px caps. */
export function MLabel({ children, tone, count }: { children: ReactNode; tone?: "warning"; count?: number | string }) {
  return (
    <div className={cx("flex items-baseline gap-2 px-0.5 text-[12.5px] font-bold tracking-[.06em]", tone === "warning" ? "text-cw-warning-text" : "text-cw-text-muted")}>
      <span>{children}</span>{count !== undefined && <span className="font-mono text-[12.5px] font-semibold">{count}</span>}
    </div>
  );
}

/** Flight status pill: the wall legend's colours by meaning (--ca-st-*), the label from the shared facts. */
export function StatusPill({ status, small, children }: { status: string; small?: boolean; children?: ReactNode }) {
  const tok = (STATUS_TOKEN as Record<string, string>)[status] ?? "scheduled";
  const label = children ?? (STATUS_LABEL as Record<string, string>)[status] ?? status;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-[7px] px-2 font-semibold whitespace-nowrap", small ? "h-6 text-[12px]" : "h-[26px] text-[12.5px]")}
      style={{ background: `var(--ca-st-${tok}-bg)`, color: `var(--ca-st-${tok}-fg)` }}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{label}
    </span>
  );
}

/** The five checks as chips (--mx-chk-*): IMP · NTM · WX · CAA · LIM. */
export function CheckChip({ k, dim }: { k: string; dim?: boolean }) {
  return (
    <span className="inline-flex h-[26px] items-center rounded-[7px] px-2 font-mono text-[12px] font-bold tracking-[.03em]"
      style={{ background: `var(--mx-chk-${k}-bg)`, color: `var(--mx-chk-${k}-fg)`, opacity: dim ? 0.55 : 1 }}>
      {(CHECK_LABEL as Record<string, string>)[k] ?? k.toUpperCase()}
    </span>
  );
}

/** Segmented control, 38–44 px, with optional counts. */
export function MSegmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number | string; countTone?: "warning" }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid rounded-[12px] border border-cw-border bg-cw-bg-sunken p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cx("flex h-11 items-center justify-center gap-1.5 rounded-[9px] text-[14.5px] font-semibold", on ? "bg-cw-bg-surface text-cw-text shadow-cw-1" : "text-cw-text-muted")}>
            {o.label}{o.count !== undefined && <span className={cx("font-mono text-[12px] font-semibold", on && o.countTone === "warning" ? "text-cw-warning-text" : "text-cw-text-muted")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Loading draws the shape of what is coming: `cards` (104 px) or `rows` (64 px). */
export function MSkeleton({ kind = "rows", count = kind === "cards" ? 4 : 7, label = "Loading" }: { kind?: "rows" | "cards"; count?: number; label?: string }) {
  const widths = ["70%", "55%", "62%", "48%", "66%", "50%", "58%"];
  return (
    <div role="status" aria-label={label} aria-busy="true" className={cx("flex flex-col px-4", kind === "cards" ? "gap-2.5" : "")}>
      {Array.from({ length: count }, (_, i) =>
        kind === "cards" ? (
          <div key={i} className="grid h-[104px] grid-cols-[64px_1fr] gap-3 rounded-[14px] border border-cw-border bg-cw-bg-surface p-3.5">
            <Skeleton w={64} h={24} round={6} shimmer={false} />
            <span className="flex flex-col gap-2"><Skeleton w={widths[i % widths.length]} h={13} /><Skeleton w="50%" h={11} shimmer={false} /></span>
          </div>
        ) : (
          <div key={i} className="flex h-16 items-center gap-3.5 border-b border-cw-divider"><Skeleton w={46} h={16} shimmer={false} /><Skeleton w={widths[i % widths.length]} h={12} /></div>
        ))}
    </div>
  );
}

/** Empty: centred, says what fills it. */
export function MEmpty({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-8 pb-20 pt-10 text-center">
      <MaskIcon name={icon} size={26} color="var(--cw-text-muted)" />
      <span className="text-[17px] font-bold text-cw-text">{title}</span>
      {children && <span className="text-[14.5px] leading-normal text-cw-text-body">{children}</span>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

/** Error: says what still works. `stale` keeps the data under it and shows as a banner instead of a screen. */
export function MError({ title, children, onRetry, stale, icon = "cloud-off" }: { title: string; children?: ReactNode; onRetry?: () => void; stale?: boolean; icon?: string }) {
  if (stale) {
    return (
      <div role="alert" className="mx-4 mb-2.5 flex items-center gap-2.5 rounded-[12px] border border-cw-warning-border bg-cw-warning-tint px-3 py-2.5">
        <MaskIcon name={icon} size={18} color="var(--cw-warning-text)" className="flex-none" />
        <span className="flex-1 text-[13.5px] leading-snug text-cw-text"><strong>{title}</strong> {children}</span>
        {onRetry && <button type="button" onClick={onRetry} className="h-[44px] rounded-[10px] border border-cw-border-control bg-cw-bg-surface px-3 text-[13.5px] font-semibold text-cw-text">Retry</button>}
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2.5 px-8 pb-20 pt-10 text-center">
      <MaskIcon name={icon} size={26} color="var(--cw-danger-text)" />
      <span className="text-[17px] font-bold text-cw-text">{title}</span>
      {children && <span className="text-[14.5px] leading-normal text-cw-text-body">{children}</span>}
      {onRetry && <MButton kind="primary" size="sm" icon="refresh-cw" onClick={onRetry} className="mt-1.5">Try again</MButton>}
    </div>
  );
}

/** A bottom sheet over a scrim, with a handle: one decision, one primary action. Rendered to document.body. */
export function MSheet({ open, onClose, title, subtitle, lead, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; lead?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-cw-bg-scrim" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92%] w-full max-w-[430px] flex-col rounded-t-[20px] bg-mx-sheet shadow-cw-pop">
        <div className="flex justify-center pt-2"><span className="h-[5px] w-[38px] rounded-[3px] bg-mx-handle" /></div>
        <div className="flex items-center gap-2.5 border-b border-cw-border px-4 pb-3 pt-2.5">
          {lead}
          <span className="flex min-w-0 flex-1 flex-col"><span className="text-[17px] font-extrabold text-cw-text">{title}</span>{subtitle && <span className="text-[12.5px] text-cw-text-muted">{subtitle}</span>}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-[12px] text-cw-text-muted"><MaskIcon name="x" size={20} color="currentColor" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-col gap-2 border-t border-cw-border bg-mx-sheet px-4 pb-[max(30px,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** "HH:MM UTC" clock text and friends. */
export const hmUtc = (d: Date = new Date()) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
export const localPart = (email?: string | null) => (email ? String(email).split("@")[0] : "");
