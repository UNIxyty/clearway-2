"use client";

// Top-bar search (portal redesign §4, approved item 5): pages and nav only, for now. It is built on SOURCES so more can
// be added later (airports, flights, people) without touching the UI: a source turns a query into results.
// ⌘K / Ctrl+K focuses it from anywhere. Below 900px it is an icon that opens the same search over the page.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import MaskIcon from "@/components/portal/Icon";
import type { NavTopic } from "@/components/portal/nav";

export type SearchResult = { id: string; label: string; group: string; href: string; icon: string; external?: boolean };
export type SearchSource = { id: string; title: string; search: (q: string) => SearchResult[] };

/** Every page the person can reach from the nav (already filtered for their role), plus Help. */
export function pagesSource(topics: NavTopic[]): SearchSource {
  const pages: SearchResult[] = [];
  for (const t of topics) {
    if (t.href) pages.push({ id: t.id, label: t.label, group: "Portal", href: t.href, icon: t.icon });
    for (const i of t.items ?? []) {
      if (i.id === "acc-signout") continue;
      pages.push({ id: i.id, label: i.label, group: t.label, href: i.href, icon: i.icon, external: i.external });
    }
  }
  pages.push({ id: "help", label: "Help & support", group: "Portal", href: "/help", icon: "life-buoy" });
  pages.push({ id: "help-bug", label: "Report a bug", group: "Help & support", href: "/help/new?type=bug", icon: "bug" });
  const seen = new Set<string>();
  const unique = pages.filter((p) => (seen.has(p.href + p.label) ? false : (seen.add(p.href + p.label), true)));
  return {
    id: "pages",
    title: "Pages",
    search: (q) => {
      const s = q.trim().toLowerCase();
      if (!s) return unique;
      const score = (p: SearchResult) => {
        const l = p.label.toLowerCase(), g = p.group.toLowerCase();
        if (l.startsWith(s)) return 0;
        if (l.split(/\s+/).some((w) => w.startsWith(s))) return 1;
        if (l.includes(s)) return 2;
        if (`${g} ${l}`.includes(s)) return 3;
        return 9;
      };
      return unique.map((p) => [score(p), p] as const).filter(([n]) => n < 9).sort((a, b) => a[0] - b[0]).map(([, p]) => p);
    },
  };
}

export default function TopSearch({ sources, onGo, narrow }: { sources: SearchSource[]; onGo: (r: SearchResult) => void; narrow: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  const groups = useMemo(() => sources.map((s) => ({ source: s, results: s.search(q).slice(0, 8) })).filter((g) => g.results.length), [sources, q]);
  const flat = useMemo(() => groups.flatMap((g) => g.results), [groups]);
  useEffect(() => setHi(0), [q]);

  const close = useCallback(() => { setOpen(false); setOverlay(false); setQ(""); input.current?.blur(); }, []);
  const go = (r: SearchResult) => { close(); onGo(r); };

  // ⌘K / Ctrl+K from anywhere (also inside fields: it is the search shortcut, not a character).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (narrow) setOverlay(true);
        setOpen(true);
        requestAnimationFrame(() => input.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [narrow]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(flat.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[hi]) go(flat[hi]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  const field = (
    <div className="relative flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-cw-border-control bg-cw-bg-surface pl-2.5 pr-2 focus-within:border-cw-focus focus-within:shadow-[0_0_0_3px_var(--cw-focus-halo)]">
      <MaskIcon name="search" size={15} color="var(--cw-text-muted)" />
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Go to a page…"
        aria-label="Search pages"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && flat[hi] ? `${listId}-${hi}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className="h-full min-w-0 flex-1 border-none bg-transparent font-sans text-[13.5px] text-cw-text outline-none placeholder:text-cw-text-placeholder"
      />
      <kbd className="rounded-[4px] border border-cw-border-control px-[5px] py-px font-mono text-[11px] font-medium text-cw-text-muted">⌘K</kbd>
    </div>
  );
  const results = open && (
    <div id={listId} role="listbox" aria-label="Pages" className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[420px] overflow-y-auto rounded-[12px] border border-cw-border bg-cw-bg-raised p-1.5 shadow-cw-pop">
      {flat.length === 0 ? (
        <div className="px-3 py-6 text-center text-[13px] text-cw-text-muted">No page matches “{q}”.</div>
      ) : (
        groups.map((g) => (
          <div key={g.source.id}>
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-cw-text-muted">{g.source.title}</div>
            {g.results.map((r) => {
              const i = flat.indexOf(r);
              return (
                <div
                  key={r.id + r.href}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === hi}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => { e.preventDefault(); go(r); }}
                  className={clsx("flex h-9 cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px]", i === hi ? "bg-cw-bg-selected text-cw-text" : "text-cw-text-body")}
                >
                  <MaskIcon name={r.icon === "ring-mark" ? "bot" : r.icon} size={15} color={i === hi ? "var(--cw-text-link)" : "var(--cw-text-muted)"} />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                  <span className="truncate text-[12px] text-cw-text-muted">{r.group}</span>
                  {r.external && <MaskIcon name="arrow-up-right" size={13} color="var(--cw-text-muted)" />}
                  {i === hi && <MaskIcon name="corner-down-left" size={13} color="var(--cw-text-muted)" />}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );

  if (narrow) {
    return (
      <>
        <button type="button" aria-label="Search pages (⌘K)" title="Search pages (⌘K)" onClick={() => { setOverlay(true); setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}
          className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[10px] border-none bg-transparent text-cw-text-body hover:bg-cw-bg-hover">
          <MaskIcon name="search" size={17} />
        </button>
        {overlay && (
          <div className="fixed inset-0 z-[60] bg-cw-bg-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div ref={box} className="relative mx-auto mt-3 w-[calc(100%-24px)] max-w-[640px]">{field}{results}</div>
          </div>
        )}
      </>
    );
  }
  return <div ref={box} className="relative flex w-full max-w-[640px] min-w-0">{field}{results}</div>;
}
