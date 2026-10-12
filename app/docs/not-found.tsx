import { loadDocs, loadHome } from "@/lib/docs/content";
import { brand, crumbs, glossaryHref, navRows } from "@/lib/docs/view";
import DocsFrame from "@/components/docs/DocsFrame";
import SearchOpener from "@/components/docs/SearchOpener";
import MaskIcon from "@/components/portal/Icon";

// Any /docs address that is not a page (design: Page Docs Not Found): 404, one line, search, and a few ways on.
// Every link here exists: Home, the home page's starting point, the glossary if there is one, and support.
export default function DocsNotFound() {
  const docs = loadDocs();
  const b = brand();
  const start = loadHome(docs).start;
  const g = glossaryHref();
  const links = [
    { title: "Home", href: "/docs", icon: "house" },
    ...(start ? [{ title: start.title, href: start.href, icon: "flag-triangle-right" }] : []),
    ...(g ? [{ title: "Glossary", href: g, icon: "book-a" }] : []),
    { title: b.supportLabel, href: b.supportHref, icon: "life-buoy" },
  ];
  return (
    <DocsFrame brand={b} nav={navRows(docs, {})} toc={null} crumbs={crumbs(null, null, "Page not found")} prevNext={[]}>
      <div className="dx-page dx-notfound" data-docs-state="not-found">
        <div className="head">
          <span className="code dx-mono">404</span>
          <h1 className="dx-h1">This page isn’t here</h1>
          <p className="dx-lede">The link may be from an older version of the docs, or the page has moved. Search for what you were trying to do.</p>
        </div>
        <SearchOpener placeholder="Search: a task, a field, an ICAO code" big />
        <div className="ways">
          <span className="dx-eyebrow muted">Or go to</span>
          <div className="links">{links.map((l) => <a key={l.href} href={l.href}><MaskIcon name={l.icon} size={15} />{l.title}</a>)}</div>
        </div>
      </div>
    </DocsFrame>
  );
}
