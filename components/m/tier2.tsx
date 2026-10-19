"use client";

// Tier 2 on the phone (mobile-portal-spec.md › Tier 2): four patterns, chosen per page — a list that opens a detail,
// cards with a severity edge, stacked blocks, and grouped settings rows (form). No page uses a table. Rows are at
// least 60 px with one trailing item: a meta time, a tone badge, a 44 px action, a 44 px call button, or a chevron.
// Loading is shared (six row skeletons in a card); every page carries its own empty and error copy.
import Link from "next/link";
import { type ReactNode } from "react";
import MaskIcon from "@/components/portal/Icon";
import { MButton, MEmpty, MError, StickyBar } from "./ui";

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "sens";
/** The six badge tones as the portal's tokens (the rose pair is client-access's sensitive-data colour). */
export const TONE: Record<Tone, { bg: string; fg: string; edge: string }> = {
  ok: { bg: "var(--cw-success-tint)", fg: "var(--cw-success-text)", edge: "var(--cw-success)" },
  warn: { bg: "var(--cw-warning-tint)", fg: "var(--cw-warning-text)", edge: "var(--cw-warning)" },
  bad: { bg: "var(--cw-danger-tint)", fg: "var(--cw-danger-text)", edge: "var(--cw-danger)" },
  info: { bg: "var(--cw-info-tint)", fg: "var(--cw-info-text)", edge: "var(--cw-info)" },
  neutral: { bg: "var(--cw-neutral-tint)", fg: "var(--cw-neutral-text)", edge: "var(--cw-neutral)" },
  sens: { bg: "var(--ca-sens-tint)", fg: "var(--ca-sens-text)", edge: "var(--ca-sens)" },
};

export function Badge({ tone, children, small }: { tone: Tone; children: ReactNode; small?: boolean }) {
  return <span className={cx("inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 font-semibold", small ? "h-5 text-[11.5px]" : "h-6 text-[12px]")} style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>{children}</span>;
}

// ── list ──
export type T2Action = { label: string; onClick?: () => void; href?: string; disabled?: boolean; busy?: boolean; kind?: "secondary" | "primary" | "danger" };
export type T2Row = {
  key: string; title: ReactNode; sub?: ReactNode; mono?: boolean;
  meta?: string; badge?: readonly [ReactNode, Tone]; action?: T2Action; call?: string; href?: string; onClick?: () => void; dim?: boolean;
};
export type T2Group = { h: string; count?: number | string; tone?: "warning"; rows: T2Row[] };

export function T2Search({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <label className="flex h-12 items-center gap-2.5 rounded-[12px] border border-cw-border-control bg-cw-bg-surface px-3 focus-within:border-cw-focus focus-within:shadow-[0_0_0_3px_var(--cw-focus-halo)]">
      <MaskIcon name="search" size={18} color="var(--cw-text-muted)" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent text-[15.5px] text-cw-text outline-none placeholder:text-cw-text-placeholder" />
      {value && <button type="button" onClick={() => onChange("")} aria-label="Clear" className="flex h-11 w-11 items-center justify-center rounded-[11px] text-cw-text-muted"><MaskIcon name="circle-x" size={18} color="currentColor" /></button>}
    </label>
  );
}

/** Filter chips, 44 px, the chosen one filled; a count in mono. */
export function T2Chips<T extends string>({ value, onChange, chips, label = "Filter" }: { value: T; onChange: (v: T) => void; chips: Array<{ k: T; label: string; n?: number | string }>; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {chips.map((c) => { const on = c.k === value; return (
        <button key={c.k} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.k)} className={cx("inline-flex h-11 flex-none items-center gap-[7px] rounded-[22px] border px-3.5 text-[14px] font-semibold", on ? "border-cw-text bg-cw-text text-cw-bg-page" : "border-cw-border-control bg-cw-bg-surface text-cw-text-body")}>
          {c.label}{c.n !== undefined && <span className="font-mono text-[12px] font-semibold opacity-80">{c.n}</span>}
        </button>
      ); })}
    </div>
  );
}

function RowBody({ r }: { r: T2Row }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cx("text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]", r.mono && "font-mono", r.dim && "text-cw-text-muted")}>{r.title}</span>
        {r.sub && <span className="text-[13px] leading-[1.4] text-cw-text-muted [overflow-wrap:anywhere]">{r.sub}</span>}
      </span>
      <span className="flex flex-none items-center gap-1.5">
        {r.meta && <span className="whitespace-nowrap font-mono text-[12.5px] text-cw-text-muted">{r.meta}</span>}
        {r.badge && <Badge tone={r.badge[1]}>{r.badge[0]}</Badge>}
        {r.action && (r.action.href
          ? <Link href={r.action.href} className="inline-flex h-11 items-center whitespace-nowrap rounded-[11px] border border-cw-border-control bg-cw-bg-surface px-3.5 text-[14px] font-semibold text-cw-text">{r.action.label}</Link>
          : <button type="button" disabled={r.action.disabled || r.action.busy} onClick={(e) => { e.stopPropagation(); r.action?.onClick?.(); }} className={cx("inline-flex h-11 items-center whitespace-nowrap rounded-[11px] border px-3.5 text-[14px] font-semibold disabled:opacity-60", r.action.kind === "primary" ? "border-transparent bg-cw-primary text-cw-text-on-primary" : r.action.kind === "danger" ? "border-cw-danger-border bg-cw-bg-surface text-cw-danger-text" : "border-cw-border-control bg-cw-bg-surface text-cw-text")}>{r.action.busy ? "…" : r.action.label}</button>)}
        {r.call && <a href={`tel:${r.call.replace(/[^+\d]/g, "")}`} aria-label={`Call ${r.call}`} onClick={(e) => e.stopPropagation()} className="flex h-11 w-11 items-center justify-center rounded-[11px]" style={{ background: TONE.ok.bg, color: TONE.ok.fg }}><MaskIcon name="phone" size={18} color="currentColor" /></a>}
        {!r.action && !r.call && (r.href || r.onClick) && <MaskIcon name="chevron-right" size={17} color="var(--cw-text-muted)" className="mx-1.5" />}
      </span>
    </>
  );
}

export function T2Rows({ rows, minH = 60 }: { rows: T2Row[]; minH?: number }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface">
      {rows.map((r) => {
        const cls = "flex w-full items-center gap-2.5 border-t border-cw-divider py-2 pl-3.5 pr-2 text-left text-cw-text first:border-t-0";
        const style = { minHeight: minH };
        if (r.href) return <Link key={r.key} href={r.href} className={cls} style={style}><RowBody r={r} /></Link>;
        if (r.onClick) return <button key={r.key} type="button" onClick={r.onClick} className={cls} style={style}><RowBody r={r} /></button>;
        return <div key={r.key} className={cls} style={style}><RowBody r={r} /></div>;
      })}
    </div>
  );
}

export function T2Groups({ groups }: { groups: T2Group[] }) {
  return (
    <>
      {groups.filter((g) => g.rows.length).map((g) => (
        <div key={g.h} className="flex flex-col gap-1.5">
          <div className={cx("flex items-baseline gap-2 px-0.5 pt-1 text-[12px] font-bold tracking-[.06em]", g.tone === "warning" ? "text-cw-warning-text" : "text-cw-text-muted")}><span>{g.h}</span>{g.count !== undefined && <span className="font-mono">{g.count}</span>}</div>
          <T2Rows rows={g.rows} />
        </div>
      ))}
    </>
  );
}

// ── detail ──
export type T2DetailRow = { k: string; v: ReactNode; mono?: boolean };
export function T2Detail({ title, mono, rows, actions, children }: { title: ReactNode; mono?: boolean; rows: T2DetailRow[]; actions?: T2Action[]; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className={cx("m-0 text-[22px] font-extrabold leading-tight tracking-[-.015em] [overflow-wrap:anywhere]", mono && "font-mono")}>{title}</h2>
      <div className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface">
        {rows.map((r) => <div key={r.k} className="flex min-h-[52px] flex-col justify-center gap-0.5 border-t border-cw-divider px-3.5 py-2 first:border-t-0"><span className="text-[12.5px] text-cw-text-muted">{r.k}</span><span className={cx("text-[15px] font-semibold [overflow-wrap:anywhere]", r.mono && "font-mono")}>{r.v}</span></div>)}
      </div>
      {children}
      {actions?.map((a) => <MButton key={a.label} kind={a.kind === "primary" ? "primary" : a.kind === "danger" ? "danger" : "secondary"} size="md" href={a.href} onClick={a.onClick} disabled={a.disabled || a.busy}>{a.busy ? "…" : a.label}</MButton>)}
    </div>
  );
}

// ── cards ──
export type T2Card = { key: string; tone: "bad" | "warn" | "info" | "neutral"; title: ReactNode; line?: ReactNode; by?: string; href?: string; onClick?: () => void };
export function T2Cards({ cards }: { cards: T2Card[] }) {
  return (
    <>
      {cards.map((c) => {
        const inner = <><span className="text-[15.5px] font-bold leading-[1.35] [overflow-wrap:anywhere]">{c.title}</span>{c.line && <span className="text-[13.5px] leading-snug text-cw-text-body [overflow-wrap:anywhere]">{c.line}</span>}{c.by && <span className="font-mono text-[12px] text-cw-text-muted">{c.by}</span>}</>;
        const cls = "flex w-full flex-col gap-1 rounded-[14px] border border-cw-border bg-cw-bg-surface px-3.5 py-3 text-left text-cw-text";
        const style = { borderLeft: `4px solid ${TONE[c.tone].edge}` };
        if (c.href) return <Link key={c.key} href={c.href} className={cls} style={style}>{inner}</Link>;
        if (c.onClick) return <button key={c.key} type="button" onClick={c.onClick} className={cls} style={style}>{inner}</button>;
        return <div key={c.key} className={cls} style={style}>{inner}</div>;
      })}
    </>
  );
}

// ── blocks ──
export type T2Block = { key: string; title: ReactNode; rows: Array<[ReactNode, ReactNode]>; href?: string };
export function T2Blocks({ blocks }: { blocks: T2Block[] }) {
  return (
    <>
      {blocks.map((b) => (
        <div key={b.key} className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface">
          {b.href ? <Link href={b.href} className="flex h-12 items-center border-b border-cw-divider px-3.5 text-[15px] font-bold text-cw-text">{b.title}<MaskIcon name="chevron-right" size={16} color="var(--cw-text-muted)" className="ml-auto" /></Link> : <div className="flex h-12 items-center border-b border-cw-divider px-3.5 text-[15px] font-bold">{b.title}</div>}
          {b.rows.map(([k, v], i) => <div key={i} className="flex min-h-11 items-center gap-3 border-t border-cw-divider px-3.5 py-1.5 text-[14.5px] first:border-t-0"><span className="min-w-0 flex-1 text-cw-text-body [overflow-wrap:anywhere]">{k}</span><span className="font-mono text-[14.5px] font-semibold">{v}</span></div>)}
        </div>
      ))}
    </>
  );
}

// ── form ──
export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className="flex h-11 w-14 flex-none items-center justify-end disabled:opacity-60">
      <span className={cx("relative h-7 w-12 rounded-[14px] transition-colors", on ? "bg-cw-primary" : "bg-cw-border-strong")}><span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-cw-knob shadow-cw-1 transition-[left]" style={{ left: on ? 23 : 3 }} /></span>
    </button>
  );
}
export type T2FormRow = { key: string; title: ReactNode; sub?: ReactNode; toggle?: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }; href?: string; onClick?: () => void; readOnly?: boolean; trailing?: ReactNode };
export type T2FormGroup = { key: string; h: string; rows: T2FormRow[]; note?: ReactNode; status?: { tone: Tone; title: string; line: ReactNode }; danger?: T2Action; before?: ReactNode };
export function T2Form({ groups }: { groups: T2FormGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1.5">
          <span className="px-0.5 pt-1 text-[12px] font-bold tracking-[.06em] text-cw-text-muted">{g.h}</span>
          {g.before}
          {g.status && (
            <div className="flex gap-3 rounded-[14px] border p-3.5" style={{ background: TONE[g.status.tone].bg, borderColor: TONE[g.status.tone].edge }}>
              <span className="mt-1.5 h-3 w-3 flex-none rounded-full" style={{ background: TONE[g.status.tone].edge, boxShadow: `0 0 0 4px ${TONE[g.status.tone].bg}` }} />
              <span className="flex flex-col gap-1"><span className="text-[17px] font-extrabold">{g.status.title}</span><span className="text-[13.5px] leading-normal text-cw-text-body">{g.status.line}</span></span>
            </div>
          )}
          {g.rows.length > 0 && (
            <div className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface">
              {g.rows.map((r) => {
                const body = <><span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-semibold">{r.title}</span>{r.sub && <span className="text-[13px] text-cw-text-muted [overflow-wrap:anywhere]">{r.sub}</span>}</span>
                  {r.toggle ? <Toggle on={r.toggle.on} onChange={r.toggle.onChange} disabled={r.toggle.disabled} label={typeof r.title === "string" ? r.title : "Toggle"} /> : r.trailing ? r.trailing : r.readOnly ? <MaskIcon name="lock" size={15} color="var(--cw-text-muted)" className="mx-1" /> : (r.href || r.onClick) ? <MaskIcon name="chevron-right" size={17} color="var(--cw-text-muted)" className="mx-1" /> : null}</>;
                const cls = "flex w-full min-h-14 items-center gap-2.5 border-t border-cw-divider py-1.5 pl-3.5 pr-2.5 text-left text-cw-text first:border-t-0";
                if (r.href) return <Link key={r.key} href={r.href} className={cls}>{body}</Link>;
                if (r.onClick) return <button key={r.key} type="button" onClick={r.onClick} className={cls}>{body}</button>;
                return <div key={r.key} className={cls}>{body}</div>;
              })}
            </div>
          )}
          {g.note && <span className="px-0.5 text-[13px] leading-normal text-cw-text-muted">{g.note}</span>}
          {g.danger && <MButton kind="danger-outline" className="mt-1.5" icon="power" onClick={g.danger.onClick} href={g.danger.href} disabled={g.danger.disabled || g.danger.busy}>{g.danger.label}</MButton>}
        </div>
      ))}
    </>
  );
}

// ── states and the page frame ──
export function T2Loading({ label = "Loading", rows = 6 }: { label?: string; rows?: number }) {
  const widths = ["62%", "48%", "70%", "55%", "44%", "60%", "52%"];
  return (
    <div role="status" aria-label={label} aria-busy="true" className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="flex h-[60px] flex-col justify-center gap-[7px] border-t border-cw-divider px-3.5 first:border-t-0"><span className="cw-skel h-3 rounded" style={{ width: widths[i % widths.length] }} /><span className="h-2.5 w-[38%] rounded bg-cw-skeleton" /></div>)}
    </div>
  );
}

/**
 * The page's frame: loading (shared skeleton), error (the page's own copy, what still works, Try again) and empty
 * (the page's own copy) — or the content. A stale error keeps the content under a banner.
 */
export function T2Page({ loading, error, empty, emptyCopy, errorCopy, onRetry, stale, children, sticky, top }: {
  loading: boolean; error: string | null; empty: boolean; emptyCopy: [string, string]; errorCopy: [string, string]; onRetry?: () => void; stale?: boolean;
  children: ReactNode; sticky?: ReactNode; top?: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-3">
        {top}
        {error && stale && <MError stale title={errorCopy[0]} onRetry={onRetry}>{errorCopy[1]}</MError>}
        {loading ? <T2Loading /> : error && !stale ? <MError title={errorCopy[0]} onRetry={onRetry}>{errorCopy[1]} {error}</MError> : empty ? <MEmpty icon="inbox" title={emptyCopy[0]}>{emptyCopy[1]}</MEmpty> : children}
      </div>
      {sticky && !loading && <StickyBar>{sticky}</StickyBar>}
    </div>
  );
}
