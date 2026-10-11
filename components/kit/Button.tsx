"use client";

// Buttons (portal redesign §2.1): primary, secondary, quiet, destructive, destructive-quiet; 30 / 36 / 44 high;
// rest, hover, active, focus, loading and disabled. A loading button keeps its width's place, says what it is doing
// ("Approving…") and cannot be pressed twice. Icon-only buttons always carry a tooltip and an aria-label.
import { forwardRef, useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import MaskIcon from "@/components/portal/Icon";
import { themedRoot } from "./popover";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "danger-quiet";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border border-transparent bg-cw-primary text-cw-text-on-primary hover:bg-cw-primary-hover active:bg-cw-primary-active",
  secondary: "border border-cw-border-control bg-cw-bg-surface text-cw-text hover:border-cw-border-strong hover:bg-cw-bg-hover active:bg-cw-bg-active",
  quiet: "border border-transparent bg-transparent text-cw-text-body hover:bg-cw-bg-hover hover:text-cw-text active:bg-cw-bg-active",
  danger: "border border-transparent bg-cw-danger-solid text-cw-text-on-primary hover:bg-cw-danger-solid-hover active:bg-cw-danger-solid-hover",
  "danger-quiet": "border border-cw-danger-border bg-cw-bg-surface text-cw-danger-text hover:bg-cw-danger-tint active:bg-cw-danger-tint",
};
const SIZE: Record<ButtonSize, string> = {
  sm: "h-[30px] gap-1.5 rounded-[8px] px-2.5 text-[13px]",
  md: "h-9 gap-2 rounded-[10px] px-3.5 text-[14px]",
  lg: "h-11 gap-2 rounded-[10px] px-[18px] text-[15px]",
};
const FOCUS = "outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-bg-surface),0_0_0_4px_var(--cw-focus)]";
const FOCUS_DANGER = "outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-bg-surface),0_0_0_4px_var(--cw-danger)]";
const DISABLED = "disabled:cursor-not-allowed disabled:border-cw-disabled-border disabled:bg-cw-disabled-bg disabled:text-cw-text-disabled";
const DISABLED_QUIET = "disabled:cursor-not-allowed disabled:bg-transparent disabled:text-cw-text-disabled";

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <span aria-hidden className={clsx("inline-block flex-none rounded-full border-2 border-current border-t-transparent", className)} style={{ width: size, height: size, animation: "cw-spin 700ms linear infinite" }} />;
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Lucide icon name, drawn before the label. */
  icon?: string;
  iconAfter?: string;
  /** In progress: a spinner replaces the icon and loadingLabel (if given) the label. */
  loading?: boolean;
  loadingLabel?: string;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconAfter, loading = false, loadingLabel, disabled, className, children, type = "button", ...rest },
  ref,
) {
  const quiet = variant === "quiet";
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex flex-none cursor-pointer select-none items-center justify-center whitespace-nowrap font-sans font-semibold transition-colors duration-[120ms] ease-out",
        SIZE[size], VARIANT[variant], variant === "danger" ? FOCUS_DANGER : FOCUS,
        loading ? "cursor-progress disabled:cursor-progress" : quiet ? DISABLED_QUIET : DISABLED,
        loading && (variant === "primary" || variant === "danger") && "disabled:opacity-85",
        loading && variant === "secondary" && "disabled:text-cw-text-muted",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 12 : 14} /> : icon ? <MaskIcon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {loading && loadingLabel ? loadingLabel : children}
      {!loading && iconAfter && <MaskIcon name={iconAfter} size={size === "sm" ? 14 : 16} />}
    </button>
  );
});

/** A square icon-only button. The label is its accessible name and its tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "children" | "icon"> & { icon: string; label: string; shortcut?: string; bordered?: boolean }>(
  function IconButton({ icon, label, shortcut, bordered = false, size = "sm", variant, className, ...rest }, ref) {
    const dim = size === "sm" ? "h-[30px] w-[30px] rounded-[8px]" : size === "md" ? "h-9 w-9 rounded-[10px]" : "h-11 w-11 rounded-[10px]";
    return (
      <Tooltip label={label} shortcut={shortcut}>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className={clsx(
            "inline-flex flex-none cursor-pointer items-center justify-center transition-colors duration-[120ms]",
            dim, FOCUS,
            variant === "danger-quiet" ? "text-cw-danger-text hover:bg-cw-danger-tint"
              : bordered ? "border border-cw-border-control bg-cw-bg-surface text-cw-text-body hover:bg-cw-bg-hover hover:text-cw-text"
              : "border border-transparent bg-transparent text-cw-text-muted hover:bg-cw-bg-hover hover:text-cw-text",
            "disabled:cursor-not-allowed disabled:text-cw-text-disabled disabled:hover:bg-transparent",
            className,
          )}
          {...rest}
        >
          <MaskIcon name={icon} size={16} />
        </button>
      </Tooltip>
    );
  },
);

/**
 * Tooltip (§2.6): ink, 12px, with an optional shortcut, shown on hover after a beat and at once on keyboard focus.
 * Wraps exactly one focusable element; the element keeps its own accessible name (the tooltip is a visual repeat).
 */
export function Tooltip({ label, shortcut, children, side = "top" }: { label: ReactNode; shortcut?: string; children: ReactElement; side?: "top" | "bottom" }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const id = useId();
  const open = useCallback((delay: number) => { clearTimeout(timer.current); timer.current = setTimeout(() => setShow(true), delay); }, []);
  const close = useCallback(() => { clearTimeout(timer.current); setShow(false); setPos(null); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!show) return;
    const a = wrap.current?.firstElementChild as HTMLElement | null; const t = tip.current;
    if (!a || !t) return;
    const r = a.getBoundingClientRect();
    const up = side === "top" ? r.top > t.offsetHeight + 10 : r.bottom + t.offsetHeight + 10 > window.innerHeight;
    const left = Math.max(6, Math.min(r.left + r.width / 2 - t.offsetWidth / 2, window.innerWidth - t.offsetWidth - 6));
    setPos({ left, top: up ? r.top - t.offsetHeight - 6 : r.bottom + 6 });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show, side, close]);
  return (
    <span
      ref={wrap}
      className="inline-flex"
      onMouseEnter={() => open(400)}
      onMouseLeave={close}
      onFocus={(e) => { if ((e.target as HTMLElement).matches(":focus-visible")) open(0); }}
      onBlur={close}
      onMouseDown={close}
      aria-describedby={show ? id : undefined}
    >
      {children}
      {show && typeof document !== "undefined" && createPortal(
        <div ref={tip} id={id} role="tooltip" className="pointer-events-none fixed z-[90] flex items-center gap-2 whitespace-nowrap rounded-[6px] bg-cw-ink px-2 py-1.5 font-sans text-[12px] text-cw-on-ink"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
          {label}
          {shortcut && <span className="font-mono text-[11px] font-medium opacity-75">{shortcut}</span>}
        </div>,
        themedRoot(wrap.current),
      )}
    </span>
  );
}
