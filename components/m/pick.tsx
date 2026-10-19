"use client";

// Two small sheets for settings rows: pick one of a few options, or type one value. One decision per sheet.
import { useEffect, useState, type ReactNode } from "react";
import MaskIcon from "@/components/portal/Icon";
import { MButton, MSheet } from "./ui";

export function PickSheet<T extends string>({ open, onClose, title, subtitle, options, value, onPick, busy }: { open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; options: Array<{ value: T; label: string; sub?: string }>; value: T; onPick: (v: T) => void; busy?: boolean }) {
  return (
    <MSheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <div role="radiogroup" aria-label={title} className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface">
        {options.map((o) => { const on = o.value === value; return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => onPick(o.value)} className="flex min-h-14 w-full items-center gap-3 border-t border-cw-divider px-3.5 py-2 text-left text-cw-text first:border-t-0 disabled:opacity-60">
            <span className="flex min-w-0 flex-1 flex-col"><span className="text-[15.5px] font-semibold">{o.label}</span>{o.sub && <span className="text-[13px] text-cw-text-muted">{o.sub}</span>}</span>
            {on && <MaskIcon name="check" size={18} color="var(--cw-primary)" />}
          </button>
        ); })}
      </div>
    </MSheet>
  );
}

export function InputSheet({ open, onClose, title, subtitle, label, value, placeholder, type = "text", onSave, busy, failed, note, saveLabel = "Save", autoComplete }: {
  open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; label: string; value: string; placeholder?: string; type?: string; onSave: (v: string) => void; busy?: boolean; failed?: string | null; note?: ReactNode; saveLabel?: string; autoComplete?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => { if (open) setV(value); }, [open, value]);
  return (
    <MSheet open={open} onClose={onClose} title={title} subtitle={subtitle} footer={<MButton kind="primary" disabled={busy || !v.trim()} onClick={() => onSave(v.trim())}>{busy ? "Saving…" : saveLabel}</MButton>}>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-cw-text-muted">{label}</span>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} type={type} autoComplete={autoComplete} autoCapitalize={type === "email" ? "none" : undefined} className="h-12 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3.5 text-[16px] text-cw-text outline-none focus:border-cw-focus focus:shadow-[0_0_0_3px_var(--cw-focus-halo)]" />
      </label>
      {failed && <span role="alert" className="text-[13.5px] text-cw-danger-text">{failed}</span>}
      {note && <span className="text-[13px] leading-normal text-cw-text-muted">{note}</span>}
    </MSheet>
  );
}
