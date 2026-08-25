"use client";

// Portal design-system primitives — the Display Console look (light theme,
// white cards, Public Sans + IBM Plex Mono, #2563eb primary) ported into
// the portal's Tailwind stack. Pure presentation: no data logic here.

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function PCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-[14px] border border-[#e6e7ea] bg-white shadow-[0_1px_2px_rgba(16,18,22,.04)]",
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
        "text-[11px] font-bold uppercase tracking-[0.12em] text-[#9aa0a8]",
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
        variant === "primary" && "border-none bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
        variant === "secondary" &&
          "border border-[#d6d8dc] bg-white text-[#17181c] hover:bg-[#f5f6f7]",
        variant === "quiet" &&
          "border-none bg-transparent text-[#6c7079] hover:bg-[#f0f1f3] hover:text-[#17181c]",
        variant === "danger-quiet" &&
          "border-none bg-transparent text-[#6c7079] hover:bg-[#fdecec] hover:text-[#e5484d]",
        variant === "stop" &&
          "border border-[#f4d4b8] bg-[#fdf1e8] text-[#c2703b] hover:bg-[#fbe8d9]",
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
      className={clsx("text-[11px] font-bold tracking-[0.06em] text-[#9aa0a8]", className)}
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
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f0f1f3] text-[#9aa0a8]">
          {icon}
        </div>
      )}
      <div className="text-base font-bold text-[#17181c]">{title}</div>
      {children && <div className="max-w-md text-sm leading-relaxed text-[#6c7079]">{children}</div>}
    </div>
  );
}
