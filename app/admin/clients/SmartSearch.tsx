"use client";

// The Clients page's smart search (2026-11-02): as ops type, what they could mean, from real records only — operators
// (by name and code), aircraft registrations from the fleet, trips from the wall's flights, and the people and
// companies who asked or were approved. Prefix matches first (lib/clients/suggest.mjs). Keyboard first: ↑↓ move, ↵ takes,
// Esc closes. When nothing matches it says so; there is no "use what I typed" — a scope can only name what exists.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { KIND_LABEL, rankSuggestions } from "@/lib/clients/suggest.mjs";

export type SuggestKind = "operator" | "registration" | "trip" | "client";
export type SuggestItem = { kind: SuggestKind; value: string; label: string; detail?: string; keys: string[] };
type Ranked = SuggestItem & { tier: number };

const ICON: Record<SuggestKind, string> = { operator: "building-2", registration: "plane", trip: "hash", client: "user" };
const NOTHING: Record<string, string> = {
  "operator,registration,trip": "No operator, aircraft or trip matches",
  "operator,registration,trip,client": "No client, operator, aircraft or trip matches",
};

export default function SmartSearch({ items, kinds, onPick, label, placeholder, loading = false, unavailable = null, autoFocus = false, dataAttr }: {
  items: SuggestItem[]; kinds: SuggestKind[]; onPick: (item: SuggestItem) => void; label: string; placeholder: string;
  loading?: boolean; unavailable?: string | null; autoFocus?: boolean; dataAttr?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId(); const input = useRef<HTMLInputElement>(null); const box = useRef<HTMLDivElement>(null);
  const ranked = useMemo<Ranked[]>(() => (q.trim() ? (rankSuggestions(items, q, { perKind: 6, kinds }) as Ranked[]) : []), [items, q, kinds]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away); return () => document.removeEventListener("mousedown", away);
  }, []);
  const take = (it: SuggestItem) => { onPick(it); setQ(""); setOpen(false); input.current?.focus(); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(ranked.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && ranked[active]) take(ranked[active]); }
    else if (e.key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }
  };
  const showList = open && q.trim().length > 0;
  const optId = (i: number) => `${listId}-o${i}`;
  let lastKind: string | null = null;
  return (
    <div ref={box} className="relative min-w-0" {...(dataAttr ? { [dataAttr]: "" } : {})}>
      <div className="flex h-10 items-center gap-2 rounded-[10px] border border-cw-border-control bg-cw-bg-surface px-3 focus-within:border-cw-focus focus-within:shadow-[0_0_0_3px_var(--cw-focus-halo)]">
        <MaskIcon name="search" size={15} className="flex-none text-cw-text-muted" />
        <input ref={input} value={q} autoFocus={autoFocus} placeholder={placeholder} aria-label={label} role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={showList && ranked[active] ? optId(active) : undefined}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-cw-text outline-none placeholder:text-cw-text-placeholder"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
        {q && <button type="button" aria-label="Clear" className="flex h-7 w-7 items-center justify-center rounded-[7px] text-cw-text-muted hover:bg-cw-bg-hover" onClick={() => { setQ(""); input.current?.focus(); }}><MaskIcon name="x" size={14} /></button>}
      </div>
      {showList && (
        <div id={listId} role="listbox" aria-label={label} className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-[340px] overflow-y-auto rounded-[12px] border border-cw-border bg-cw-bg-raised py-1.5 shadow-cw-pop" data-suggestions>
          {loading && !ranked.length && <div className="px-3 py-2.5 text-[13.5px] text-cw-text-muted" role="status">Loading what exists…</div>}
          {!loading && !ranked.length && (
            <div className="flex flex-col gap-1 px-3 py-2.5 text-[13.5px]" role="status" data-no-match>
              <span className="text-cw-text">{NOTHING[kinds.join(",")] ?? "Nothing matches"} “{q.trim()}”.</span>
              <span className="text-cw-text-muted">{kinds.includes("client") ? "Try a company, a person, an operator code, a registration or a trip number." : "A scope can only name an operator in Leon, an aircraft in the fleet or a trip on the wall."}</span>
            </div>
          )}
          {unavailable && <div className="px-3 py-2 text-[12.5px] text-cw-warning-text">{unavailable}</div>}
          {ranked.map((it, i) => {
            const head = it.kind !== lastKind ? <div key={`h-${it.kind}`} role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-bold tracking-[.06em] text-cw-text-muted">{KIND_LABEL[it.kind].toUpperCase()}</div> : null;
            lastKind = it.kind;
            return [head, (
              <div key={`${it.kind}:${it.value}`} id={optId(i)} role="option" aria-selected={i === active} data-option={`${it.kind}:${it.value}`}
                className={`mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 ${i === active ? "bg-cw-bg-selected" : "hover:bg-cw-bg-hover"}`}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); take(it); }}>
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[7px] bg-cw-bg-sunken text-cw-text-body"><MaskIcon name={ICON[it.kind]} size={14} /></span>
                <span className="flex min-w-0 flex-col"><span className={`truncate text-[14px] font-semibold text-cw-text ${it.kind === "client" ? "" : "font-mono"}`}>{it.label}</span>{it.detail && <span className="truncate text-[12.5px] text-cw-text-muted">{it.detail}</span>}</span>
              </div>
            )];
          })}
        </div>
      )}
    </div>
  );
}
