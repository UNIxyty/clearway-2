"use client";

// Portal design-system primitives — the Display Console look (light theme,
// white cards, Public Sans + IBM Plex Mono, blue primary) ported into
// the portal's Tailwind stack. Pure presentation: no data logic here.

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function PCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1",
        className
      )}
      {...rest}
    />
  );
}

export function PSectionTitle({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "text-[11px] font-bold uppercase tracking-[0.12em] text-cw-text-muted",
        className
      )}
      {...rest}
    />
  );
}

type PButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger-quiet" | "stop";
  size?: "md" | "sm";
};

export function PButton({ variant = "secondary", size = "md", className, ...rest }: PButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex cursor-pointer items-center gap-2 rounded-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "px-4 py-[10px] text-sm" : "px-3 py-[7px] text-[12.5px] rounded-lg",
        variant === "primary" && "border-none bg-cw-primary text-cw-text-on-primary hover:bg-cw-primary-hover",
        variant === "secondary" &&
          "border border-cw-border-control bg-cw-bg-surface text-cw-text hover:bg-cw-bg-sunken",
        variant === "quiet" &&
          "border-none bg-transparent text-cw-text-muted hover:bg-cw-bg-hover hover:text-cw-text",
        variant === "danger-quiet" &&
          "border-none bg-transparent text-cw-text-muted hover:bg-cw-danger-tint hover:text-cw-danger-text",
        variant === "stop" &&
          "border border-cw-orange-border bg-cw-orange-tint text-cw-orange-text hover:bg-cw-orange-tint",
        className
      )}
      {...rest}
    />
  );
}

export function PChip({
  color,
  bg,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { color: string; bg: string }) {
  return (
    <span
      className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", className)}
      style={{ color, background: bg }}
      {...rest}
    >
      {children}
    </span>
  );
}

export function PMono({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={clsx("font-mono", className)} {...rest} />;
}

/** Table header cell label, console style. */
export function PTh({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("text-[11px] font-bold tracking-[0.06em] text-cw-text-muted", className)}
      {...rest}
    />
  );
}

export function PEmpty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cw-bg-hover text-cw-text-muted">
          {icon}
        </div>
      )}
      <div className="text-base font-bold text-cw-text">{title}</div>
      {children && <div className="max-w-md text-sm leading-relaxed text-cw-text-muted">{children}</div>}
    </div>
  );
}
