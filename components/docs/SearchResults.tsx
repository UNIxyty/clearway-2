"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MaskIcon from "@/components/portal/Icon";
import { groupBySection, search } from "@/lib/docs/search";
import { Marked, hitPath, useIndex } from "./Search";

// The full results page (design: Page Docs Search): the query, a chip per section, results grouped by section with
// the task's summary, "Cannot be undone" on tasks that are, and an empty state with common tasks and the glossary.
// ⇧↵ in the search box opens it. The address carries the query (/docs/search?q=…), so it can be shared.

export default function SearchResults({ suggestions, common, glossaryHref, supportHref, supportText }: {
  suggestions: string[]; common: string[]; glossaryHref: string | null; supportHref: string; supportText: string;
}) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [only, setOnly] = useState<string | null>(null);
  const { rows, failed, retry } = useIndex(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!q) input.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- first render only
  useEffect(() => {
    const u = new URL(window.location.href);
    if (q.trim()) u.searchParams.set("q", q.trim()); else u.searchParams.delete("q");
    window.history.replaceState(null, "", u.toString());
  }, [q]);

  const hits = useMemo(() => (rows && q.trim() ? search(rows, q) : []), [rows, q]);
  const groups = groupBySection(hits);
  const shown = only ? groups.filter((g) => g.section === only) : groups;
  const commonRows = useMemo(() => (rows ? common.map((h) => rows.find((r) => r.href === h)).filter((r): r is NonNullable<typeof r> => !!r) : []), [rows, common]);

  return (
    <div className="dx-results">
      <div className="dx-results-field">
        <MaskIcon name="search" size={18} className="ic" />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOnly(null); }} placeholder="Search: a task, a field, an ICAO code" aria-label="Search the docs" autoComplete="off" spellCheck={false} />
        {q && <button type="button" className="dx-iconbtn" aria-label="Clear" onClick={() => { setQ(""); input.current?.focus(); }}><MaskIcon name="x" size={16} /></button>}
      </div>

      {failed ? (
        <div className="dx-search-empty" role="alert">
          <span className="t">Search didn’t load</span>
          <button type="button" className="dx-btn" onClick={retry}><MaskIcon name="rotate-cw" size={14} />Try again</button>
        </div>
      ) : !q.trim() ? (
        <div className="dx-results-head">
          <h1 className="dx-h1 sm">Search the docs</h1>
          <p className="dx-p">Type what you want to do, the name of a screen, or an abbreviation.</p>
          {suggestions.length > 0 && <div className="dx-search-try">{suggestions.map((t) => <button key={t} type="button" onClick={() => setQ(t)}>{t}</button>)}</div>}
        </div>
      ) : !rows ? (
        <div className="dx-search-loading" aria-busy="true">Loading the index…</div>
      ) : hits.length > 0 ? (
        <>
          <div className="dx-results-head">
            <h1 className="dx-h1 sm" aria-live="polite">{hits.length} {hits.length === 1 ? "result" : "results"}</h1>
            <div className="dx-chips" role="group" aria-label="Show results from">
              <button type="button" className={!only ? "on" : ""} aria-pressed={!only} onClick={() => setOnly(null)}>All<span className="n">{hits.length}</span></button>
              {groups.map((g) => <button key={g.section} type="button" className={only === g.section ? "on" : ""} aria-pressed={only === g.section} onClick={() => setOnly(g.section)}>{g.section}<span className="n">{g.hits.length}</span></button>)}
            </div>
          </div>
          {shown.map((g) => (
            <section key={g.section} className="dx-results-group" aria-label={g.section}>
              <div className="head"><span className="t">{g.section}</span><span className="n">{g.hits.length}</span></div>
              {g.hits.map((h) => (
                <a key={h.href + h.title} href={h.href} className="dx-results-row">
                  <span className="top"><span className="t"><Marked text={h.title} q={q} /></span>
                    {h.danger && <span className="dx-danger-tag"><MaskIcon name="octagon-alert" size={11} />Cannot be undone</span>}
                    {h.draft && <span className="dx-draft-tag">Being written</span>}</span>
                  <span className="p">{hitPath(h)}</span>
                  {h.summary && <span className="s">{h.summary}</span>}
                </a>
              ))}
            </section>
          ))}
        </>
      ) : (
        <>
          <div className="dx-results-head">
            <h1 className="dx-h1 sm">Nothing matches “{q.trim()}”</h1>
            <p className="dx-p">Search looks at section, page and task names{glossaryHref ? ", and the glossary" : ""}. Try a single verb for what you want to do, or the name of the screen.</p>
          </div>
          <div className="dx-results-none">
            {commonRows.length > 0 && (
              <div className="card">
                <span className="t">Common tasks</span>
                {commonRows.map((r) => <a key={r.href} href={r.href}><span>{r.title}</span><span className="p">{hitPath({ ...r, score: 0 })}</span></a>)}
              </div>
            )}
            <div className="card">
              {glossaryHref && (<><span className="t">Looking for an abbreviation?</span><span className="b">They are in the glossary.</span><a href={glossaryHref} className="strong">Open the glossary</a><span className="rule" /></>)}
              <span className="b">Still stuck? <a href={supportHref}>{supportText}</a>, and say what you were trying to do.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
