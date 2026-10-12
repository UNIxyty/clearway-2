"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { KIND_LABEL, groupBySection, highlight, search, type Hit, type IndexRow } from "@/lib/docs/search";

// Docs search (design: Docs Screen, search overlay). The index is built at build time (lib/docs/search.ts says how)
// and fetched once, the first time search opens. ⌘K / Ctrl+K opens it from anywhere, as in the portal; "/" opens it
// too, but only when the focus is not in a text field, so it never eats a character someone is typing.

let indexPromise: Promise<IndexRow[]> | null = null;
export function loadIndex(): Promise<IndexRow[]> {
  if (!indexPromise) {
    indexPromise = fetch("/docs/search-index.json", { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<IndexRow[]>; })
      .catch((e) => { indexPromise = null; throw e; });
  }
  return indexPromise;
}

export function useIndex(enabled: boolean) {
  const [rows, setRows] = useState<IndexRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || rows) return;
    let live = true;
    loadIndex().then((r) => { if (live) { setRows(r); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [enabled, rows, attempt]);
  return { rows, failed, retry: () => { setFailed(false); setAttempt((a) => a + 1); } };
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/** ⌘K anywhere; "/" when not typing. */
export function useSearchKeys(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); open(); return; }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) { e.preventDefault(); open(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
}

export function Marked({ text, q }: { text: string; q: string }) {
  return <>{highlight(text, q).map((p, i) => (p.m ? <mark key={i} className="dx-mark">{p.t}</mark> : <span key={i}>{p.t}</span>))}</>;
}

const ICON: Record<IndexRow["kind"], string> = { task: "list-checks", page: "file-text", section: "folder", term: "book-a" };
export const hitPath = (h: Hit) => (h.kind === "term" ? h.section : h.kind === "task" ? `${h.section} › ${h.page}` : h.kind === "page" ? h.section : "Section");

/** The header's search field (an icon below 900px). */
export function SearchField({ onOpen }: { onOpen: () => void }) {
  return (
    <>
      <button type="button" className="dx-searchfield" onClick={onOpen} aria-label="Search the docs (⌘K)">
        <MaskIcon name="search" size={16} className="ic" />
        <span className="ph">Search: a task, a field, an ICAO code</span>
        <kbd className="dx-kbd">⌘K</kbd>
      </button>
      <button type="button" className="dx-iconbtn dx-searchicon" onClick={onOpen} aria-label="Search the docs"><MaskIcon name="search" size={18} /></button>
    </>
  );
}

export function SearchDialog({ onClose, suggestions, glossaryHref, supportHref, supportLabel }: {
  onClose: () => void; suggestions: string[]; glossaryHref: string | null; supportHref: string; supportLabel: string;
}) {
  const { rows, failed, retry } = useIndex(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hits = useMemo(() => (rows && q.trim() ? search(rows, q) : []), [rows, q]);
  const top = hits.slice(0, 9);
  const groups = groupBySection(top);
  const flat = groups.flatMap((g) => g.hits);
  const cur = Math.min(sel, Math.max(flat.length - 1, 0));

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; opener?.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => { document.getElementById(`${listId}-${cur}`)?.scrollIntoView({ block: "nearest" }); }, [cur, listId]);

  // Opening a result closes search first: a result on this page only changes the #, with no new page to replace it.
  const go = useCallback((href: string) => { onClose(); window.location.href = href; }, [onClose]);
  const allResults = useCallback(() => go(`/docs/search?q=${encodeURIComponent(q.trim())}`), [go, q]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel(Math.min(cur + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel(Math.max(cur - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) { if (q.trim()) allResults(); }
      else if (flat[cur]) go(flat[cur].href);
    }
  };
  // Esc closes from anywhere in the dialog; Tab stays inside it.
  const box = useRef<HTMLDivElement>(null);
  const onBoxKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "Tab" || !box.current) return;
    const els = [...box.current.querySelectorAll<HTMLElement>("input, button, a[href]")].filter((x) => x.offsetParent !== null);
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i === els.length - 1 ? 0 : i + 1);
    e.preventDefault(); els[next].focus();
  };

  let n = -1;
  return (
    <>
      <div className="dx-search-scrim" onClick={onClose} />
      <div ref={box} className="dx-search" role="dialog" aria-modal="true" aria-label="Search the docs" onKeyDown={onBoxKey}>
        <div className="dx-search-head">
          <MaskIcon name="search" size={18} className="ic" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
            placeholder="Search: a task, a field, an ICAO code" aria-label="Search the docs" role="combobox" aria-expanded={flat.length > 0}
            aria-controls={listId} aria-activedescendant={flat.length ? `${listId}-${cur}` : undefined} aria-autocomplete="list" autoComplete="off" spellCheck={false} />
          <button type="button" className="dx-kbd dx-esc" onClick={onClose} aria-label="Close search">esc</button>
        </div>
        <div className="dx-search-body" id={listId} role="listbox" aria-label="Results">
          {failed ? (
            <div className="dx-search-empty" role="alert">
              <MaskIcon name="circle-alert" size={24} />
              <span className="t">Search didn’t load</span>
              <span className="b">Check your connection and try again. The sections on the left lead to every page.</span>
              <button type="button" className="dx-btn" onClick={retry}><MaskIcon name="rotate-cw" size={14} />Try again</button>
            </div>
          ) : !q.trim() ? (
            suggestions.length > 0 && (
              <>
                <div className="dx-search-label">Try</div>
                <div className="dx-search-try">{suggestions.map((t) => <button key={t} type="button" onClick={() => { setQ(t); setSel(0); input.current?.focus(); }}>{t}</button>)}</div>
              </>
            )
          ) : !rows ? (
            <div className="dx-search-loading" aria-busy="true">Loading the index…</div>
          ) : flat.length === 0 ? (
            <div className="dx-search-empty">
              <MaskIcon name="search-x" size={24} />
              <span className="t">Nothing matches “{q.trim()}”</span>
              <span className="b">Try one word for the thing you want to do, or the name of the screen.{glossaryHref ? " Abbreviations are in the glossary." : ""}</span>
              <div className="links">
                {glossaryHref && <a href={glossaryHref}><MaskIcon name="book-a" size={14} />Glossary</a>}
                <a href={supportHref}><MaskIcon name="life-buoy" size={14} />{supportLabel}</a>
              </div>
            </div>
          ) : groups.map((g) => (
            <div key={g.section} role="group" aria-label={g.section}>
              <div className="dx-search-label"><span>{g.section}</span><span className="n">{hits.filter((h) => h.section === g.section).length}</span></div>
              {g.hits.map((h) => {
                n += 1; const i = n;
                return (
                  <a key={h.href + h.title} id={`${listId}-${i}`} href={h.href} role="option" aria-selected={i === cur}
                    className={`dx-search-row${i === cur ? " on" : ""}`} onMouseMove={() => setSel(i)} onClick={onClose}>
                    <span className="ic"><MaskIcon name={ICON[h.kind]} size={15} /></span>
                    <span className="txt"><span className="t"><Marked text={h.title} q={q} /></span><span className="p">{hitPath(h)}</span></span>
                    {h.danger && <span className="dx-danger-tag"><MaskIcon name="octagon-alert" size={11} />Cannot be undone</span>}
                    <span className="k">{h.draft ? "Being written" : KIND_LABEL[h.kind]}</span>
                    {i === cur && <MaskIcon name="corner-down-left" size={14} className="enter" />}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
        <div className="dx-search-foot">
          <span><kbd className="dx-kbd">↑↓</kbd>move</span>
          <span><kbd className="dx-kbd">↵</kbd>open</span>
          <span><kbd className="dx-kbd">⇧↵</kbd>all results</span>
          <span className="sp" />
          <span>{q.trim() && rows ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : ""}</span>
        </div>
      </div>
    </>
  );
}
