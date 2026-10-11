"use client";

// Filter bar and table (portal redesign §2.3, §2.4). Tables use the PAGE's scroll — never an inner scroll area; the
// header sticks under the top bar and gains a shadow once the page scrolls past it. Above 50 rows the table paginates.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import MaskIcon from "@/components/portal/Icon";
import { Button } from "./Button";
import { Checkbox, MultiSelect, SearchInput, Select, type Option } from "./controls";
import { Popover } from "./popover";
import { EmptyState, ErrorState, Menu, NoMatchState, SkeletonRows, type MenuItem } from "./surfaces";

// ── Filter bar ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type FilterDef = { id: string; label: string; icon?: string; options: Option<string>[]; values: string[]; onChange: (v: string[]) => void; counts?: Record<string, number> };

function FilterChip({ f }: { f: FilterDef }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const active = f.values.length > 0;
  const shown = f.values.map((v) => { const o = f.options.find((x) => x.value === v); return o?.text ?? (typeof o?.label === "string" ? o.label : v); }).join(", ");
  return (
    <span className={clsx("inline-flex h-8 flex-none items-center rounded-[8px] border text-[13px] font-semibold",
      active ? "border-cw-primary-tint-border bg-cw-bg-selected text-cw-text-link" : "border-dashed border-cw-border-control text-cw-text-body")}>
      <button ref={btn} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-full cursor-pointer items-center gap-1.5 rounded-[8px] border-none bg-transparent pl-2.5 pr-2 font-sans text-[13px] font-semibold text-inherit outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">
        <MaskIcon name={active ? (f.icon ?? "circle-dot") : "plus"} size={14} />
        {f.label}{active && <span className="max-w-[180px] truncate font-medium">{shown}</span>}
      </button>
      {active && <button type="button" aria-label={`Clear ${f.label}`} onClick={() => f.onChange([])} className="mr-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent text-inherit outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]"><MaskIcon name="x" size={13} /></button>}
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} role="dialog" label={`Filter by ${f.label}`} minWidth={240} className="p-2">
        <div className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-cw-text-muted">{f.label}</div>
        <div className="flex flex-col gap-0.5">
          {f.options.map((o) => {
            const on = f.values.includes(o.value);
            return (
              <div key={o.value} className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 hover:bg-cw-bg-hover">
                <Checkbox checked={on} onChange={() => f.onChange(on ? f.values.filter((v) => v !== o.value) : [...f.values, o.value])} label={o.label} />
                {f.counts?.[o.value] != null && <span className="ml-auto font-mono text-[12px] text-cw-text-muted">{f.counts[o.value]}</span>}
              </div>
            );
          })}
        </div>
      </Popover>
    </span>
  );
}

/**
 * Filter bar (§2.3): a search, up to four filters inline (most used first), the rest behind "More filters" whose badge
 * counts the active ones among them. An active filter is a filled chip with its value and an ✕.
 */
export function FilterBar({ search, onSearch, searchPlaceholder = "Search", filters = [], inline = 4, count, extra }: {
  search?: string; onSearch?: (v: string) => void; searchPlaceholder?: string; filters?: FilterDef[]; inline?: number; count?: ReactNode; extra?: ReactNode;
}) {
  const inlineFilters = filters.slice(0, inline); const rest = filters.slice(inline);
  const [more, setMore] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const restActive = rest.filter((f) => f.values.length).length;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-cw-divider px-4 py-3">
      {onSearch && <SearchInput size="sm" value={search ?? ""} onValueChange={onSearch} placeholder={searchPlaceholder} className="w-[280px] max-w-full" />}
      {inlineFilters.map((f) => <FilterChip key={f.id} f={f} />)}
      {rest.length > 0 && (
        <>
          <button ref={moreBtn} type="button" aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore((o) => !o)}
            className="inline-flex h-8 flex-none cursor-pointer items-center gap-1.5 rounded-[8px] border border-cw-border-control bg-transparent px-2.5 font-sans text-[13px] font-semibold text-cw-text-body outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">
            <MaskIcon name="sliders-horizontal" size={14} />More filters
            {restActive > 0 && <span className="rounded-[4px] bg-cw-bg-sunken px-[5px] py-px font-mono text-[11px] font-semibold">{restActive}</span>}
          </button>
          <Popover anchor={moreBtn} open={more} onClose={() => setMore(false)} role="dialog" label="More filters" minWidth={280} className="p-3">
            <div className="flex flex-col gap-3">
              {rest.map((f) => (
                <div key={f.id} className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-cw-text-muted">{f.label}</span>
                  <MultiSelect size="sm" values={f.values} onChange={f.onChange} options={f.options} counts={f.counts} label={f.label} />
                </div>
              ))}
            </div>
          </Popover>
        </>
      )}
      {extra}
      {count != null && <span className="ml-auto text-[13px] text-cw-text-muted">{count}</span>}
    </div>
  );
}

/** The "filtered" strip (§2.3): whenever anything is filtered, say how many rows are hidden — never look like the full list. */
export function FilteredStrip({ shown, total, reasons, onClear, noun = "rows" }: { shown: number; total: number; reasons: string; onClear: () => void; noun?: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2.5 border-b border-cw-primary-tint-border bg-cw-bg-selected px-4 py-2 text-[13px] text-cw-text">
      <MaskIcon name="filter" size={15} color="var(--cw-text-link)" />
      <strong className="font-bold">Showing {shown} of {total}</strong>
      <span className="text-cw-text-body">· {reasons} {reasons ? "are hiding" : "hide"} {total - shown} {noun}</span>
      <button type="button" onClick={onClear} className="ml-auto cursor-pointer rounded-[6px] border-none bg-transparent px-1 font-sans text-[13px] font-semibold text-cw-text-link outline-none hover:underline focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">Clear all</button>
    </div>
  );
}

/** "3 filters and a search" — the subject of the filtered strip. */
export function filterReasons(activeFilters: number, searching: boolean) {
  const parts = [];
  if (activeFilters) parts.push(`${activeFilters} filter${activeFilters === 1 ? "" : "s"}`);
  if (searching) parts.push("a search");
  return parts.join(" and ");
}

// ── Table ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Column<R> = {
  id: string;
  header: ReactNode;
  cell: (row: R) => ReactNode;
  /** Present → the header sorts by it (asc, desc, then off). */
  sortValue?: (row: R) => string | number | null;
  width?: string;
  align?: "left" | "right";
};
export type TableState = "ready" | "loading" | "error";

export function DataTable<R>({
  label, columns, rows, rowKey, density = "comfortable", state = "ready", error, empty, filtered, onClearFilters, noMatchTitle, noMatchBody,
  selectable = false, selected, onSelectedChange, bulkActions, rowMenu, onRowClick, pageSize: initialPageSize = 50, toolbar, defaultSort, rowTone,
}: {
  label: string;
  columns: Column<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  density?: "comfortable" | "dense";
  state?: TableState;
  error?: { title: ReactNode; detail?: ReactNode; onRetry?: () => void; onReport?: () => void };
  empty: { icon?: string; title: ReactNode; body?: ReactNode; action?: ReactNode };
  /** Rows are hidden by a search or filter: the empty table then says so and offers onClearFilters. */
  filtered?: boolean;
  onClearFilters?: () => void;
  noMatchTitle?: ReactNode;
  noMatchBody?: ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  bulkActions?: (keys: string[]) => ReactNode;
  rowMenu?: (r: R) => MenuItem[];
  onRowClick?: (r: R) => void;
  pageSize?: number;
  toolbar?: ReactNode;
  defaultSort?: { id: string; dir: "asc" | "desc" };
  rowTone?: (r: R) => "selected" | "warning" | "danger" | null;
}) {
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const v = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = v(a), y = v(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
      return sort.dir === "asc" ? c : -c;
    });
  }, [rows, sort, columns]);
  const paged = sorted.length > 50;
  const pages = paged ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  useEffect(() => { if (page > pages - 1) setPage(0); }, [pages, page]);
  const visible = paged ? sorted.slice(page * pageSize, page * pageSize + pageSize) : sorted;
  const sel = selected ?? new Set<string>();
  const visibleKeys = visible.map(rowKey);
  const allOn = visibleKeys.length > 0 && visibleKeys.every((k) => sel.has(k));
  const someOn = visibleKeys.some((k) => sel.has(k));
  const toggleAll = () => { const n = new Set(sel); if (allOn) visibleKeys.forEach((k) => n.delete(k)); else visibleKeys.forEach((k) => n.add(k)); onSelectedChange?.(n); };
  const toggle = (k: string) => { const n = new Set(sel); if (n.has(k)) n.delete(k); else n.add(k); onSelectedChange?.(n); };
  const cycle = (id: string) => setSort((s) => (!s || s.id !== id ? { id, dir: "asc" } : s.dir === "asc" ? { id, dir: "desc" } : null));

  // Sticky header: a sentinel just above it says when the page has scrolled past, which turns the shadow on.
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: "-56px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const rowH = density === "dense" ? "h-8" : "h-[52px]";
  const headH = density === "dense" ? "h-8" : "h-9";
  const cellPad = "px-4";
  const nSel = sel.size;
  const colSpan = columns.length + (selectable ? 1 : 0) + (rowMenu ? 1 : 0);

  let body: ReactNode = null;
  if (state === "loading") body = <tr><td colSpan={colSpan} className="p-0"><SkeletonRows rows={5} label={`Loading ${label}`} /></td></tr>;
  else if (state === "error" && error) body = <tr><td colSpan={colSpan} className="p-0"><ErrorState {...error} /></td></tr>;
  else if (rows.length === 0 && filtered && onClearFilters) body = <tr><td colSpan={colSpan} className="p-0"><NoMatchState title={noMatchTitle ?? "Nothing matches"} onClear={onClearFilters}>{noMatchBody}</NoMatchState></td></tr>;
  else if (rows.length === 0) body = <tr><td colSpan={colSpan} className="p-0"><EmptyState icon={empty.icon} title={empty.title} action={empty.action}>{empty.body}</EmptyState></td></tr>;

  return (
    <div className="relative">
      {nSel > 0 && bulkActions ? (
        <div role="toolbar" aria-label={`${nSel} selected`} className="flex min-h-11 flex-wrap items-center gap-3 border-b border-cw-primary-tint-border bg-cw-bg-selected px-4 py-1.5 text-[13px] text-cw-text">
          <Checkbox checked={allOn ? true : someOn ? "mixed" : false} onChange={toggleAll} ariaLabel="Select all on this page" />
          <strong className="font-bold">{nSel} selected</strong>
          {bulkActions([...sel])}
          <Button size="sm" variant="quiet" className="ml-auto" onClick={() => onSelectedChange?.(new Set())}>Clear</Button>
        </div>
      ) : toolbar}
      <div ref={sentinel} aria-hidden className="h-0" />
      <table aria-label={label} aria-busy={state === "loading" || undefined} className="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className={clsx("sticky top-[var(--cw-topbar)] z-[3] w-11 border-b border-cw-border bg-cw-bg-sunken pl-4", headH, stuck && "shadow-cw-2 [clip-path:inset(0_0_-24px_0)]")}>
                {/* While the bulk-action bar is up, its checkbox is the "all" control (§2.4). */}
                {!(nSel > 0 && bulkActions) && <Checkbox checked={allOn ? true : someOn ? "mixed" : false} onChange={toggleAll} ariaLabel="Select all on this page" disabled={!visible.length || state !== "ready"} />}
              </th>
            )}
            {columns.map((c) => {
              const dir = sort?.id === c.id ? sort.dir : null;
              return (
                <th key={c.id} scope="col" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : c.sortValue ? "none" : undefined}
                  className={clsx("sticky top-[var(--cw-topbar)] z-[3] whitespace-nowrap border-b border-cw-border bg-cw-bg-sunken text-[11px] font-bold uppercase tracking-[0.06em] text-cw-text-muted", headH, cellPad, c.align === "right" && "text-right", stuck && "shadow-cw-2 [clip-path:inset(0_0_-24px_0)]")}
                  style={{ width: c.width }}>
                  {c.sortValue ? (
                    <button type="button" onClick={() => cycle(c.id)} className={clsx("inline-flex cursor-pointer items-center gap-1 rounded-[4px] border-none bg-transparent p-0 font-sans text-[11px] font-bold uppercase tracking-[0.06em] outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]", dir ? "text-cw-text" : "text-cw-text-muted hover:text-cw-text")}>
                      {c.header}<MaskIcon name={dir === "asc" ? "arrow-up" : dir === "desc" ? "arrow-down" : "arrow-up-down"} size={12} className={dir ? "" : "opacity-60"} />
                    </button>
                  ) : c.header}
                </th>
              );
            })}
            {rowMenu && <th scope="col" className={clsx("sticky top-[var(--cw-topbar)] z-[3] w-14 border-b border-cw-border bg-cw-bg-sunken pr-4 text-right text-[11px] font-bold uppercase tracking-[0.06em] text-cw-text-muted", headH, stuck && "shadow-cw-2 [clip-path:inset(0_0_-24px_0)]")}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {body ?? visible.map((r) => {
            const k = rowKey(r); const on = sel.has(k); const tone = rowTone?.(r);
            return (
              <tr key={k} aria-selected={selectable ? on : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={clsx("group text-[14px] text-cw-text", onRowClick && "cursor-pointer",
                  on || tone === "selected" ? "bg-cw-bg-selected" : tone === "warning" ? "bg-cw-warning-tint" : tone === "danger" ? "bg-cw-danger-tint" : "hover:bg-cw-bg-hover")}>
                {selectable && <td className={clsx("border-b border-cw-divider pl-4", rowH)} onClick={(e) => e.stopPropagation()}><Checkbox checked={on} onChange={() => toggle(k)} ariaLabel="Select row" /></td>}
                {columns.map((c) => <td key={c.id} className={clsx("border-b border-cw-divider", rowH, cellPad, density === "dense" ? "text-[13px] text-cw-text-body" : "py-1.5", c.align === "right" && "text-right")}>{c.cell(r)}</td>)}
                {rowMenu && <td className={clsx("border-b border-cw-divider pr-3 text-right", rowH)} onClick={(e) => e.stopPropagation()}><Menu items={rowMenu(r)} label="Row actions" /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {state === "ready" && rows.length > 0 && (
        <div className="flex min-h-12 flex-wrap items-center gap-4 px-4 py-2 text-[13px] text-cw-text-body">
          {paged ? (
            <>
              <span><strong className="font-mono font-medium text-cw-text">{page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)}</strong> of <span className="font-mono">{sorted.length}</span></span>
              <span className="flex items-center gap-1.5 text-cw-text-muted">Rows
                <span className="w-[76px]"><Select size="sm" label="Rows per page" value={String(pageSize)} onChange={(v) => { setPageSize(Number(v)); setPage(0); }} options={["25", "50", "100"].map((v) => ({ value: v, label: v }))} renderValue={(o) => <span className="font-mono">{o.label}</span>} /></span>
              </span>
              <Pagination page={page} pages={pages} onPage={(p) => { setPage(p); window.scrollTo({ top: Math.max(0, (sentinel.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 120) }); }} />
            </>
          ) : <span><span className="font-mono">{sorted.length}</span> {sorted.length === 1 ? "row" : "rows"}</span>}
        </div>
      )}
    </div>
  );
}

/** Page numbers: 1 2 3 … 10, with previous and next. */
export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const list: Array<number | "…"> = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1 || (page < 3 && i < 3) || (page > pages - 4 && i > pages - 4)) list.push(i);
    else if (list[list.length - 1] !== "…") list.push("…");
  }
  const btn = "flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-[8px] border-none px-1.5 font-mono text-[12px] font-medium outline-none focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]";
  return (
    <nav aria-label="Pages" className="ml-auto flex items-center gap-1">
      <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} className={clsx(btn, "bg-transparent text-cw-text-body hover:bg-cw-bg-hover disabled:cursor-not-allowed disabled:text-cw-text-disabled disabled:hover:bg-transparent")}><MaskIcon name="chevron-left" size={15} /></button>
      {list.map((p, i) => p === "…" ? <span key={`e${i}`} className="px-1 text-cw-text-muted">…</span> : (
        <button key={p} type="button" aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)} className={clsx(btn, p === page ? "bg-cw-ink text-cw-on-ink" : "bg-transparent text-cw-text-body hover:bg-cw-bg-hover")}>{p + 1}</button>
      ))}
      <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className={clsx(btn, "bg-transparent text-cw-text-body hover:bg-cw-bg-hover disabled:cursor-not-allowed disabled:text-cw-text-disabled disabled:hover:bg-transparent")}><MaskIcon name="chevron-right" size={15} /></button>
    </nav>
  );
}

/** A table card: the card's frame around a DataTable (keeps the page's scroll — no overflow clipping). */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1 [&_table_thead_tr:first-child_th:first-child]:rounded-tl-[13px] [&_table_thead_tr:first-child_th:last-child]:rounded-tr-[13px]", className)}>{children}</div>;
}
