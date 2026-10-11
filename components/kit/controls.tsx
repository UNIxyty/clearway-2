"use client";

// Form controls (portal redesign §2.2): text, search, select, multi-select, date (UTC), toggle, checkbox, radio,
// segmented. Every one is a styled element with full keyboard support — no native <select>, checkbox, radio or date
// input is rendered anywhere in the portal (scripts/check-portal-controls.mjs).
import { forwardRef, useId, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";
import MaskIcon from "@/components/portal/Icon";
import { Popover, useListKeys, useScrollActive } from "./popover";

const FOCUS_RING = "focus-visible:border-cw-focus focus-visible:shadow-[0_0_0_3px_var(--cw-focus-halo)]";
const FIELD = "h-9 w-full rounded-[8px] border bg-cw-bg-surface px-3 font-sans text-[14px] text-cw-text outline-none transition-[border-color,box-shadow] duration-[120ms] placeholder:text-cw-text-placeholder";

/** A label above its control, with an optional hint or error under it. */
export function Field({ label, hint, error, children, htmlFor, extra, className }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string; extra?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex min-w-0 flex-col gap-1.5", className)}>
      {label && <label htmlFor={htmlFor} className="flex items-center gap-2 text-[13px] font-semibold text-cw-text">{label}{extra}</label>}
      {children}
      {error ? (
        <span role="alert" className="flex items-center gap-1.5 text-[12px] text-cw-danger-text"><MaskIcon name="circle-alert" size={13} />{error}</span>
      ) : hint ? <span className="text-[12px] leading-snug text-cw-text-muted">{hint}</span> : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean }>(
  function TextInput({ invalid, mono, className, readOnly, ...rest }, ref) {
    return (
      <input
        ref={ref}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        className={clsx(FIELD, mono && "font-mono text-[13px]",
          invalid ? "border-cw-danger" : readOnly ? "border-cw-border bg-cw-bg-sunken text-cw-text-body" : "border-cw-border-control focus:border-cw-focus focus:shadow-[0_0_0_3px_var(--cw-focus-halo)]",
          "disabled:cursor-not-allowed disabled:border-cw-disabled-border disabled:bg-cw-disabled-bg disabled:text-cw-text-disabled",
          className)}
        {...rest}
      />
    );
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function TextArea({ invalid, className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx("min-h-[76px] w-full resize-y rounded-[8px] border bg-cw-bg-surface px-3 py-2 font-sans text-[14px] leading-normal text-cw-text outline-none placeholder:text-cw-text-placeholder",
          invalid ? "border-cw-danger" : "border-cw-border-control focus:border-cw-focus focus:shadow-[0_0_0_3px_var(--cw-focus-halo)]", className)}
        {...rest}
      />
    );
  },
);

/** A read-only value that can be copied (ids, keys). */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex h-9 items-center justify-between gap-2 rounded-[8px] border border-cw-border bg-cw-bg-sunken pl-3 pr-1 font-mono text-[13px] text-cw-text-body">
      <span className="min-w-0 truncate">{value}</span>
      <button type="button" aria-label={copied ? `${label} copied` : `Copy ${label}`} title={copied ? "Copied" : "Copy"}
        onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
        className={clsx("flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]", copied ? "text-cw-success-text" : "text-cw-text-muted")}>
        <MaskIcon name={copied ? "check" : "copy"} size={14} />
      </button>
    </div>
  );
}

/** Search (§2.2): an icon, a shortcut hint while empty, a match count and a clear button once typed in. */
export const SearchInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> & { value: string; onValueChange: (v: string) => void; shortcut?: string; count?: ReactNode; size?: "sm" | "md" }>(
  function SearchInput({ value, onValueChange, shortcut, count, size = "md", className, placeholder = "Search", ...rest }, ref) {
    return (
      <div className={clsx("flex items-center gap-2 rounded-[8px] border border-cw-border-control bg-cw-bg-surface pl-2.5 pr-1.5 focus-within:border-cw-focus focus-within:shadow-[0_0_0_3px_var(--cw-focus-halo)]", size === "sm" ? "h-8" : "h-9", className)}>
        <MaskIcon name="search" size={size === "sm" ? 15 : 16} color="var(--cw-text-muted)" />
        <input ref={ref} type="search" value={value} onChange={(e) => onValueChange(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Escape" && value) { e.preventDefault(); onValueChange(""); } }}
          className={clsx("h-full min-w-0 flex-1 border-none bg-transparent font-sans text-cw-text outline-none placeholder:text-cw-text-placeholder [&::-webkit-search-cancel-button]:hidden", size === "sm" ? "text-[13px]" : "text-[14px]")} {...rest} />
        {value ? (
          <>
            {count != null && <span className="flex-none font-mono text-[12px] text-cw-text-muted">{count}</span>}
            <button type="button" aria-label="Clear search" onClick={() => onValueChange("")} className="flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent text-cw-text-muted outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]"><MaskIcon name="x" size={14} /></button>
          </>
        ) : shortcut ? <kbd className="flex-none rounded-[4px] border border-cw-border-control px-[5px] py-px font-mono text-[11px] font-medium text-cw-text-muted">{shortcut}</kbd> : null}
      </div>
    );
  },
);

export type Option<T extends string> = { value: T; label: ReactNode; text?: string; hint?: ReactNode; disabled?: boolean };
const optText = (o: Option<string>) => o.text ?? (typeof o.label === "string" ? o.label : String(o.value));

const Trigger = forwardRef<HTMLButtonElement, { open: boolean; invalid?: boolean; disabled?: boolean; size: "sm" | "md"; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>>(function Trigger({ open, invalid, disabled, size, children, ...rest }, ref) {
  return (
    <button ref={ref} type="button" disabled={disabled} aria-expanded={open}
      className={clsx("flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[8px] border bg-cw-bg-surface pl-3 pr-2.5 text-left font-sans text-cw-text outline-none transition-[border-color,box-shadow] duration-[120ms]",
        size === "sm" ? "h-[30px] text-[13px]" : "h-9 text-[14px]",
        open ? "border-cw-focus shadow-[0_0_0_3px_var(--cw-focus-halo)]" : invalid ? "border-cw-danger" : "border-cw-border-control hover:border-cw-border-strong", FOCUS_RING,
        "disabled:cursor-not-allowed disabled:border-cw-disabled-border disabled:bg-cw-disabled-bg disabled:text-cw-text-disabled")}
      {...rest}>
      {children}
      <MaskIcon name={open ? "chevron-up" : "chevron-down"} size={16} color="var(--cw-text-muted)" />
    </button>
  );
});

/** Select (§2.2): a button that opens a listbox. ↑↓ Home End, type to jump, Enter/Space chooses, Esc closes. */
export function Select<T extends string>({ value, onChange, options, placeholder = "Choose…", label, id, disabled, invalid, size = "md", className, renderValue }: {
  value: T | null; onChange: (v: T) => void; options: Option<T>[]; placeholder?: string; label?: string; id?: string;
  disabled?: boolean; invalid?: boolean; size?: "sm" | "md"; className?: string; renderValue?: (o: Option<T>) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? null;
  const keys = useListKeys(options, { isDisabled: (o) => Boolean(o.disabled), text: optText });
  useScrollActive(open, listId, keys.active);
  const openList = () => { setOpen(true); keys.setActive(Math.max(0, options.findIndex((o) => o.value === value))); };
  const choose = (o: Option<T>) => { if (o.disabled) return; onChange(o.value); setOpen(false); btn.current?.focus(); };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); } return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (options[keys.active]) choose(options[keys.active]); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    keys.onKey(e);
  };
  return (
    <div className={clsx("min-w-0", className)}>
      <Trigger ref={btn} open={open} invalid={invalid} disabled={disabled} size={size}
        id={id} role="combobox" aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-label={label}
        aria-activedescendant={open && keys.active >= 0 ? `${listId}-${keys.active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}>
        <span className={clsx("min-w-0 truncate", !current && "text-cw-text-placeholder")}>{current ? (renderValue ? renderValue(current) : current.label) : placeholder}</span>
      </Trigger>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} matchWidth id={listId} role="listbox" label={label}>
        {options.map((o, i) => (
          <div key={o.value} id={`${listId}-${i}`} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
            onMouseEnter={() => keys.setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(o); }}
            className={clsx("flex min-h-8 cursor-pointer items-center justify-between gap-3 rounded-[6px] px-2.5 py-1 text-[14px]",
              o.disabled ? "cursor-not-allowed text-cw-text-disabled" : i === keys.active ? "bg-cw-bg-hover" : o.value === value ? "bg-cw-bg-selected" : "")}>
            <span className="min-w-0"><span className="block truncate">{o.label}</span>{o.hint && <span className="block text-[12px] text-cw-text-muted">{o.hint}</span>}</span>
            {o.value === value && <MaskIcon name="check" size={15} color="var(--cw-text-link)" />}
          </div>
        ))}
      </Popover>
    </div>
  );
}

/** Multi-select (§2.2): chosen values as removable chips, options with checkboxes and counts. */
export function MultiSelect<T extends string>({ values, onChange, options, placeholder = "Any", label, counts, size = "md", className }: {
  values: T[]; onChange: (v: T[]) => void; options: Option<T>[]; placeholder?: string; label?: string; counts?: Partial<Record<T, number>>; size?: "sm" | "md"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const keys = useListKeys(options, { isDisabled: (o) => Boolean(o.disabled), text: optText });
  useScrollActive(open, listId, keys.active);
  const toggle = (v: T) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) { if (["ArrowDown", "Enter", " "].includes(e.key)) { e.preventDefault(); setOpen(true); keys.setActive(0); } return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const o = options[keys.active]; if (o && !o.disabled) toggle(o.value); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    keys.onKey(e);
  };
  return (
    <div className={clsx("min-w-0", className)}>
      <div ref={box} tabIndex={0} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={label}
        aria-activedescendant={open && keys.active >= 0 ? `${listId}-${keys.active}` : undefined}
        onClick={() => setOpen((o) => !o)} onKeyDown={onKeyDown}
        className={clsx("flex min-w-0 cursor-pointer flex-wrap items-center gap-1 rounded-[8px] border bg-cw-bg-surface py-1 pl-1 pr-2.5 outline-none", size === "sm" ? "min-h-[30px]" : "min-h-9",
          open ? "border-cw-focus shadow-[0_0_0_3px_var(--cw-focus-halo)]" : "border-cw-border-control hover:border-cw-border-strong", FOCUS_RING)}>
        {values.length === 0 && <span className="px-2 text-[14px] text-cw-text-placeholder">{placeholder}</span>}
        {values.map((v) => {
          const o = options.find((x) => x.value === v);
          return (
            <span key={v} className="inline-flex h-[26px] items-center gap-1 rounded-[6px] border border-cw-border bg-cw-bg-sunken pl-2 pr-1 text-[13px] text-cw-text">
              {o?.label ?? v}
              <button type="button" aria-label={`Remove ${o ? optText(o) : v}`} onClick={(e) => { e.stopPropagation(); toggle(v); }}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[4px] border-none bg-transparent text-cw-text-muted outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]"><MaskIcon name="x" size={13} /></button>
            </span>
          );
        })}
        <span className="ml-auto"><MaskIcon name={open ? "chevron-up" : "chevron-down"} size={16} color="var(--cw-text-muted)" /></span>
      </div>
      <Popover anchor={box} open={open} onClose={() => setOpen(false)} matchWidth id={listId} role="listbox" label={label}>
        {options.map((o, i) => {
          const on = values.includes(o.value);
          return (
            <div key={o.value} id={`${listId}-${i}`} role="option" aria-selected={on} aria-disabled={o.disabled || undefined}
              onMouseEnter={() => keys.setActive(i)} onMouseDown={(e) => { e.preventDefault(); if (!o.disabled) toggle(o.value); }}
              className={clsx("flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 text-[14px]", o.disabled ? "cursor-not-allowed text-cw-text-disabled" : i === keys.active && "bg-cw-bg-hover")}>
              <CheckMark checked={on} disabled={o.disabled} />
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {counts?.[o.value] != null && <span className="font-mono text-[12px] text-cw-text-muted">{counts[o.value]}</span>}
            </div>
          );
        })}
      </Popover>
    </div>
  );
}

// ── Date (UTC) ───────────────────────────────────────────────────────────────────────────────────────────────────────
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const parseYmd = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
export const formatDay = (s: string | null) => { const d = parseYmd(s); return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}` : ""; };

/**
 * Date (§2.2): a field that opens a month grid. Dates are UTC days ("YYYY-MM-DD"), as everything in ops is.
 * ←→ a day, ↑↓ a week, PageUp/PageDown a month, Home/End the week's ends, Enter chooses, Esc closes.
 */
export function DateInput({ value, onChange, label, min, max, placeholder = "Choose a date", id, size = "md", className }: {
  value: string | null; onChange: (v: string) => void; label?: string; min?: string; max?: string; placeholder?: string; id?: string; size?: "sm" | "md"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const today = ymd(new Date());
  const [cursor, setCursor] = useState(value ?? today);
  const c = parseYmd(cursor)!;
  const first = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => ymd(new Date(first.getTime() + (i - lead) * 86400000))), [first.getTime(), lead]); // eslint-disable-line react-hooks/exhaustive-deps
  const allowed = (d: string) => (!min || d >= min) && (!max || d <= max);
  const shift = (n: number) => setCursor(ymd(new Date(c.getTime() + n * 86400000)));
  const shiftMonth = (n: number) => { const d = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + n, 1)); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(c.getUTCDate(), last)); setCursor(ymd(d)); };
  const choose = (d: string) => { if (!allowed(d)) return; onChange(d); setOpen(false); btn.current?.focus(); };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) { if (["ArrowDown", "Enter", " "].includes(e.key)) { e.preventDefault(); setCursor(value ?? today); setOpen(true); } return; }
    const map: Record<string, () => void> = { ArrowLeft: () => shift(-1), ArrowRight: () => shift(1), ArrowUp: () => shift(-7), ArrowDown: () => shift(7), PageUp: () => shiftMonth(-1), PageDown: () => shiftMonth(1), Home: () => shift(-((c.getUTCDay() + 6) % 7)), End: () => shift(6 - ((c.getUTCDay() + 6) % 7)), Enter: () => choose(cursor), " ": () => choose(cursor) };
    if (map[e.key]) { e.preventDefault(); map[e.key](); } else if (e.key === "Tab") setOpen(false);
  };
  return (
    <div className={clsx("min-w-0", className)}>
      <Trigger ref={btn} open={open} size={size} id={id} aria-haspopup="dialog" aria-label={label ? `${label}${value ? `: ${formatDay(value)}` : ""}` : undefined}
        onClick={() => { setCursor(value ?? today); setOpen((o) => !o); }} onKeyDown={onKeyDown}>
        <span className={clsx("min-w-0 truncate font-mono", !value && "font-sans text-cw-text-placeholder")}>{value ? formatDay(value) : placeholder}</span>
      </Trigger>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} role="dialog" label={label ?? "Choose a date"} className="p-3" minWidth={256}>
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onMouseDown={(e) => e.preventDefault()} onClick={() => shiftMonth(-1)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent text-cw-text-muted hover:bg-cw-bg-hover"><MaskIcon name="chevron-left" size={16} /></button>
          <span className="text-[13px] font-bold" aria-live="polite">{MONTHS[c.getUTCMonth()]} {c.getUTCFullYear()}</span>
          <button type="button" aria-label="Next month" onMouseDown={(e) => e.preventDefault()} onClick={() => shiftMonth(1)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent text-cw-text-muted hover:bg-cw-bg-hover"><MaskIcon name="chevron-right" size={16} /></button>
        </div>
        <div role="grid" aria-label={`${MONTHS[c.getUTCMonth()]} ${c.getUTCFullYear()}`} className="grid grid-cols-7 gap-0.5 text-center">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} role="columnheader" className="h-6 text-[11px] font-semibold leading-6 text-cw-text-muted">{d}</span>)}
          {days.map((d) => {
            const inMonth = parseYmd(d)!.getUTCMonth() === c.getUTCMonth();
            const sel = d === value, cur = d === cursor, ok = allowed(d);
            return (
              <span key={d} role="gridcell" aria-selected={sel} aria-disabled={!ok || undefined} aria-current={d === today ? "date" : undefined}
                onMouseDown={(e) => { e.preventDefault(); choose(d); }}
                className={clsx("h-7 rounded-[6px] font-mono text-[12px] leading-7",
                  !ok ? "cursor-not-allowed text-cw-text-disabled" : "cursor-pointer",
                  sel ? "bg-cw-primary font-semibold text-cw-text-on-primary" : cur ? "bg-cw-bg-hover text-cw-text shadow-[inset_0_0_0_1.5px_var(--cw-focus)]" : inMonth ? "text-cw-text-body hover:bg-cw-bg-hover" : "text-cw-text-muted hover:bg-cw-bg-hover",
                  d === today && !sel && "font-semibold underline decoration-cw-text-link underline-offset-2")}>
                {parseYmd(d)!.getUTCDate()}
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-cw-divider pt-2 text-[12px] text-cw-text-muted">
          <span>UTC</span>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(today)} disabled={!allowed(today)} className="cursor-pointer rounded-[6px] border-none bg-transparent px-1.5 py-0.5 font-sans text-[12px] font-semibold text-cw-text-link hover:bg-cw-bg-hover disabled:text-cw-text-disabled">Today</button>
        </div>
      </Popover>
    </div>
  );
}

// ── Toggle, checkbox, radio, segmented ───────────────────────────────────────────────────────────────────────────────
/** Toggle (§2.2): 32 × 18; on is primary. role="switch". */
export function Toggle({ checked, onChange, label, disabled, hint, id, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; hint?: ReactNode; id?: string; ariaLabel?: string }) {
  const track = (
    <span aria-hidden className={clsx("relative block h-[18px] w-8 flex-none rounded-[9px] transition-colors duration-150 ease-out",
      disabled ? "border border-cw-disabled-border bg-cw-disabled-bg" : checked ? "bg-cw-primary" : "bg-cw-border-strong")}>
      <span className={clsx("absolute h-3.5 w-3.5 rounded-full shadow-cw-1 transition-[left] duration-150 ease-out", disabled ? "top-px bg-cw-bg-surface" : "top-0.5 bg-cw-knob")}
        style={{ left: checked ? (disabled ? 15 : 16) : disabled ? 1 : 2 }} />
    </span>
  );
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} disabled={disabled} aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={clsx("group flex min-w-0 cursor-pointer items-start gap-2.5 rounded-[6px] border-none bg-transparent p-0 text-left font-sans text-[14px] outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-bg-surface),0_0_0_4px_var(--cw-focus)]",
        disabled ? "cursor-not-allowed text-cw-text-disabled" : "text-cw-text")}>
      <span className="flex flex-none pt-px">{track}</span>
      {label && <span className="min-w-0"><span className="block font-medium">{label}</span>{hint && <span className="block text-[12.5px] text-cw-text-muted">{hint}</span>}</span>}
    </button>
  );
}

function CheckMark({ checked, disabled, focusRing }: { checked: boolean | "mixed"; disabled?: boolean; focusRing?: boolean }) {
  return (
    <span aria-hidden className={clsx("flex h-4 w-4 flex-none items-center justify-center rounded-[4px] text-cw-text-on-primary",
      disabled ? "border-[1.5px] border-cw-disabled-border bg-cw-disabled-bg" : checked ? "bg-cw-primary" : "border-[1.5px] border-cw-border-strong bg-cw-bg-surface",
      focusRing && "shadow-[0_0_0_2px_var(--cw-bg-surface),0_0_0_4px_var(--cw-focus)]")}>
      {checked && !disabled && <MaskIcon name={checked === "mixed" ? "minus" : "check"} size={11} />}
      {checked && disabled && <MaskIcon name={checked === "mixed" ? "minus" : "check"} size={11} color="var(--cw-text-disabled)" />}
    </span>
  );
}

/** Checkbox (§2.2): off, on, mixed, disabled; Space toggles. role="checkbox". */
export function Checkbox({ checked, onChange, label, disabled, hint, id, className, ariaLabel }: {
  checked: boolean | "mixed"; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; hint?: ReactNode; id?: string; className?: string; ariaLabel?: string;
}) {
  return (
    <button type="button" role="checkbox" id={id} aria-checked={checked === "mixed" ? "mixed" : checked} aria-label={ariaLabel} disabled={disabled}
      onClick={() => onChange(checked !== true)}
      className={clsx("group flex min-w-0 cursor-pointer items-start gap-2.5 rounded-[5px] border-none bg-transparent p-0 text-left font-sans text-[14px] outline-none [&:focus-visible>span:first-child]:shadow-[0_0_0_2px_var(--cw-bg-surface),0_0_0_4px_var(--cw-focus)]",
        disabled ? "cursor-not-allowed text-cw-text-disabled" : "text-cw-text", className)}>
      <span className="mt-0.5 flex rounded-[4px]"><CheckMark checked={checked} disabled={disabled} /></span>
      {label && <span className="min-w-0"><span className="block">{label}</span>{hint && <span className="block text-[12.5px] text-cw-text-muted">{hint}</span>}</span>}
    </button>
  );
}

/** Radio group (§2.2): arrow keys move and choose, as a native radio group does. */
export function RadioGroup<T extends string>({ value, onChange, options, label, className }: { value: T | null; onChange: (v: T) => void; options: Option<T>[]; label: string; className?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const current = Math.max(0, options.findIndex((o) => o.value === value));
  const step = (from: number, d: number) => { const at = enabled.indexOf(from); const next = enabled[(at + d + enabled.length) % enabled.length]; onChange(options[next].value); refs.current[next]?.focus(); };
  return (
    <div role="radiogroup" aria-label={label} className={clsx("flex flex-col gap-2.5", className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} disabled={o.disabled}
            tabIndex={i === (value === null ? enabled[0] : current) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); step(i, 1); } if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); step(i, -1); } }}
            className={clsx("flex min-w-0 cursor-pointer items-start gap-2.5 rounded-[5px] border-none bg-transparent p-0 text-left font-sans text-[14px] outline-none [&:focus-visible>span:first-child]:shadow-[0_0_0_2px_var(--cw-bg-surface),0_0_0_4px_var(--cw-focus)]",
              o.disabled ? "cursor-not-allowed text-cw-text-disabled" : "text-cw-text")}>
            <span aria-hidden className={clsx("mt-0.5 h-4 w-4 flex-none rounded-full bg-cw-bg-surface", o.disabled ? "border-[1.5px] border-cw-disabled-border" : on ? "border-[5px] border-cw-primary" : "border-[1.5px] border-cw-border-strong")} />
            <span className="min-w-0"><span className="block">{o.label}</span>{o.hint && <span className="block text-[12.5px] text-cw-text-muted">{o.hint}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control (§2.2): one choice among a few, side by side; arrow keys move. */
export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: { value: T; onChange: (v: T) => void; options: Option<T>[]; label: string; size?: "sm" | "md" }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const at = options.findIndex((o) => o.value === value);
  const go = (d: number) => { let i = at; for (let n = 0; n < options.length; n++) { i = (i + d + options.length) % options.length; if (!options[i].disabled) break; } onChange(options[i].value); refs.current[i]?.focus(); };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] border border-cw-border bg-cw-bg-sunken p-[3px]">
      {options.map((o, i) => (
        <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={o.value === value} disabled={o.disabled} tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); } }}
          className={clsx("flex flex-none cursor-pointer items-center whitespace-nowrap rounded-[7px] border-none px-3 font-sans outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]",
            size === "sm" ? "h-6 text-[12.5px]" : "h-7 text-[13px]",
            o.value === value ? "bg-cw-bg-surface font-semibold text-cw-text shadow-cw-1" : "bg-transparent font-medium text-cw-text-muted hover:text-cw-text",
            o.disabled && "cursor-not-allowed text-cw-text-disabled hover:text-cw-text-disabled")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export { CheckMark };
