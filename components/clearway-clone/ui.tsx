"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function PanelShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md bg-[#182437] p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-balance text-5xl font-semibold text-slate-100">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-800/70">
      <table className="w-full border-collapse text-left">
        <thead className="bg-[#63718e] text-[32px] text-slate-100">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-[#1a2a40] text-[30px] text-slate-300">{children}</tbody>
      </table>
    </div>
  );
}

export function CellRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("border-b border-slate-900/40 align-top", className)}>
      {children}
    </tr>
  );
}

export function Modal({
  title,
  open,
  children,
  onClose,
  footer,
}: {
  title: string;
  open: boolean;
  children: ReactNode;
  onClose: () => void;
  footer: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-[#08101d]/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-2xl bg-[#1c2a3e] p-8 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-balance text-4xl font-semibold text-slate-100">{title}</h3>
        <div className="mt-6 space-y-4">{children}</div>
        <div className="mt-8 flex items-center justify-end gap-3">{footer}</div>
      </div>
    </div>
  );
}

export function TextInput({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  const id = `clone-input-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={id} className="block text-pretty text-2xl text-slate-300">
      <span className="mb-2 block">{label}</span>
      <input
        id={id}
        placeholder={placeholder}
        className="h-14 w-full rounded-md border border-slate-800 bg-[#0f1a2b] px-3 text-2xl text-slate-200 outline-none ring-0 focus:border-slate-500"
      />
    </label>
  );
}
