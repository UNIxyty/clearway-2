"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import MaskIcon from "@/components/portal/Icon";
import ThemeMenu from "@/components/portal/ThemeMenu";

// The docs shell (design: Docs Screen): header, left nav (a drawer below 1280px), the article, the task list on the
// right ("On this page", a bar with a bottom sheet below 900px), breadcrumb, previous/next and footer.
// Everything that names the product comes from content/docs/site.json through `brand`.

export type NavRow = { title: string; href: string; icon?: string; count?: number; on?: boolean; open?: boolean; sub?: boolean };
export type TocEntry = { head: string } | { n: number; id: string; title: string; danger?: boolean };
export type Crumb = { title: string; href?: string };
export type PrevNext = { kind: "prev" | "next"; title: string; sub: string; href: string };
export type Brand = {
  product: string; docsName: string; portalUrl: string; portalHref: string; logo: string;
  supportHref: string; supportText: string; creditName: string; creditLight: string; creditDark: string;
};

function NavList({ rows }: { rows: NavRow[] }) {
  return (
    <>
      {rows.map((r, i) => r.href === "#label"
        ? <div key={i} className="dx-nav-label">{r.title}</div>
        : (
          <a key={i} href={r.href} aria-current={r.on ? "page" : undefined}
            className={`dx-nav-row${r.sub ? " sub" : ""}${r.on ? " on" : r.open ? " open" : ""}`}>
            {r.icon && <MaskIcon name={r.icon} size={16} className="ic" />}
            <span className="lab">{r.title}</span>
            {r.count ? <span className="cnt">{r.count}</span> : null}
            {r.open && !r.sub && <MaskIcon name="chevron-down" size={14} className="ic" />}
          </a>
        ))}
    </>
  );
}

function useActiveTask(items: { n: number; id: string }[]) {
  const [active, setActive] = useState(items[0]?.n ?? 0);
  useEffect(() => {
    if (!items.length) return;
    const onScroll = () => {
      let a = items[0].n;
      for (const it of items) {
        const el = document.getElementById(`fn-${it.id}`);
        if (el && el.getBoundingClientRect().top <= 64 + 120) a = it.n;   // its top has passed 120px below the header
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) a = items[items.length - 1].n;
      setActive(a);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [items]);
  return [active, setActive] as const;
}

function TocList({ toc, active, onPick }: { toc: TocEntry[]; active: number; onPick: (n: number, id: string) => void }) {
  return (
    <>
      {toc.map((x, i) => ("head" in x
        ? <div key={i} className="dx-toc-head">{x.head}</div>
        : (
          <a key={i} href={`#fn-${x.id}`} className={`dx-toc-item${x.n === active ? " on" : ""}`} aria-current={x.n === active ? "location" : undefined}
            onClick={(e) => { e.preventDefault(); onPick(x.n, x.id); }}>
            <span className="num">{String(x.n).padStart(2, "0")}</span><span>{x.title}</span>
            {x.danger && <MaskIcon name="octagon-alert" size={13} className="dx-danger-ic" />}
          </a>
        )))}
    </>
  );
}

export default function DocsFrame({ brand, nav, toc, crumbs, prevNext, children, wide = false }: {
  brand: Brand; nav: NavRow[]; toc: TocEntry[] | null; crumbs: Crumb[]; prevNext: PrevNext[]; children: ReactNode; wide?: boolean;
}) {
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const items = useMemo(() => (toc ?? []).filter((x): x is { n: number; id: string; title: string } => "n" in x), [toc]);
  const [active, setActive] = useActiveTask(items);
  const current = items.find((x) => x.n === active) ?? items[0];
  const go = useCallback((n: number, id: string) => {
    const el = document.getElementById(`fn-${id}`);
    if (el) {
      const reduce = document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64 - 20, behavior: reduce ? "auto" : "smooth" });
      history.replaceState(null, "", `#fn-${id}`);
    }
    setActive(n); setSheet(false);
  }, [setActive]);
  useEffect(() => {
    if (!drawer && !sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setDrawer(false); setSheet(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, sheet]);
  const hasToc = items.length > 0;

  return (
    <div className="dx" style={{ ["--dx-logo" as string]: `url(${brand.logo})` }}>
      <a className="dx-skip" href="#dx-content">Skip to the content</a>
      <header className="dx-head">
        <button type="button" className="dx-iconbtn bordered dx-menu-btn" aria-label="Sections" aria-expanded={drawer} onClick={() => setDrawer(true)}><MaskIcon name="menu" size={18} /></button>
        <a href="/docs" className="dx-brand" aria-label={`${brand.product} ${brand.docsName}`}>
          <span className="dx-logo" role="img" aria-label={brand.product} />
          <span className="dx-brand-sep" />
          <span className="dx-brand-name">{brand.docsName}</span>
        </a>
        <div className="dx-head-mid" />
        <a href={brand.portalHref} className="dx-portal-link">Open the portal<MaskIcon name="arrow-up-right" size={15} /></a>
        <ThemeMenu />
      </header>

      {hasToc && current && (
        <button type="button" className="dx-tocbar" aria-label={`On this page: ${current.title}. Open the task list`} onClick={() => setSheet(true)}>
          <span className="num">{String(current.n).padStart(2, "0")}</span><span className="t">{current.title}</span>
          <span className="pos">{active} / {items.length}</span><MaskIcon name="chevrons-up-down" size={16} />
        </button>
      )}

      <div className={`dx-body${hasToc ? "" : " no-toc"}`}>
        <nav className="dx-nav" aria-label="Docs sections"><NavList rows={nav} /></nav>
        <main className="dx-main" id="dx-content">
          <div className={`dx-article${wide ? " wide" : ""}`}>
            {crumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="dx-crumb">
                {crumbs.map((c, i) => (
                  <span key={i} style={{ display: "contents" }}>
                    {i > 0 && <MaskIcon name="chevron-right" size={13} />}
                    {c.href && i < crumbs.length - 1 ? <a href={c.href}>{c.title}</a> : <span className={i === crumbs.length - 1 ? "here" : ""} aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.title}</span>}
                  </span>
                ))}
              </nav>
            )}
            {children}
            {prevNext.length > 0 && (
              <nav aria-label="Previous and next" className="dx-pn">
                {prevNext.map((p) => (
                  <a key={p.kind} href={p.href} className={p.kind}>
                    <span className="k"><MaskIcon name={p.kind === "prev" ? "arrow-left" : "arrow-right"} size={14} />{p.kind === "prev" ? "Previous" : "Next"}</span>
                    <span className="t">{p.title}</span><span className="s">{p.sub}</span>
                  </a>
                ))}
              </nav>
            )}
            <footer className="dx-foot">
              <span>Something wrong or missing? <a href={brand.supportHref}>{brand.supportText}</a></span>
              {brand.creditName && (
                <span className="dx-credit">Built by
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {brand.creditLight ? <img className="light" src={brand.creditLight} alt={brand.creditName} /> : <span>{brand.creditName}</span>}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {brand.creditDark && <img className="dark" src={brand.creditDark} alt={brand.creditName} />}
                </span>
              )}
            </footer>
          </div>
        </main>
        {hasToc && (
          <aside className="dx-toc" aria-label="On this page">
            <div className="dx-toc-title"><span>On this page</span><span className="dx-mono" style={{ fontSize: 12, color: "var(--cw-text-muted)" }}>{active} / {items.length}</span></div>
            <div className="dx-toc-list"><TocList toc={toc!} active={active} onPick={go} /></div>
            <button type="button" className="dx-totop" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><MaskIcon name="arrow-up" size={14} />Back to top</button>
          </aside>
        )}
      </div>

      {drawer && (
        <>
          <div className="dx-scrim" onClick={() => setDrawer(false)} />
          <div className="dx-drawer" role="dialog" aria-modal="true" aria-label="Sections">
            <div className="dx-drawer-head"><span style={{ flex: 1 }}>Sections</span><button type="button" className="dx-iconbtn" aria-label="Close" onClick={() => setDrawer(false)} autoFocus><MaskIcon name="x" size={18} /></button></div>
            <div className="dx-drawer-body"><NavList rows={nav} /></div>
          </div>
        </>
      )}
      {sheet && hasToc && (
        <>
          <div className="dx-scrim" onClick={() => setSheet(false)} />
          <div className="dx-sheet" role="dialog" aria-modal="true" aria-label="On this page">
            <div className="dx-sheet-grip"><span /></div>
            <div className="dx-sheet-head"><span style={{ flex: 1 }}>On this page</span><span className="dx-mono" style={{ fontSize: 12, color: "var(--cw-text-muted)", fontWeight: 500 }}>{active} / {items.length}</span>
              <button type="button" className="dx-iconbtn" aria-label="Close" onClick={() => setSheet(false)} autoFocus><MaskIcon name="x" size={18} /></button></div>
            <div className="dx-sheet-body"><TocList toc={toc!} active={active} onPick={go} /></div>
          </div>
        </>
      )}
    </div>
  );
}
