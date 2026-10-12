import { loadDocs, loadHome, SITE } from "@/lib/docs/content";
import { brand, navRows } from "@/lib/docs/view";
import DocsFrame from "@/components/docs/DocsFrame";
import SearchOpener from "@/components/docs/SearchOpener";
import { InlineText } from "@/components/docs/Inline";
import MaskIcon from "@/components/portal/Icon";

// The docs home (design: Page Docs Home): what the product is, two ways in (search now, or start reading), who uses
// it, and a map of every section with its pages. The words come from content/docs/home.md and site.json; the map
// from the section folders.
export default function DocsHome() {
  const docs = loadDocs();
  const home = loadHome(docs);
  const nPages = docs.sections.reduce((a, s) => a + s.pages.length, 0);
  const first = docs.sections[0];
  return (
    <DocsFrame brand={brand()} nav={navRows(docs, { home: true })} toc={null} crumbs={[]}
      prevNext={first ? [{ kind: "next", label: "Start reading", title: first.title, sub: `Section 1 of ${docs.sections.length}`, href: first.href }] : []} wide>
      <div className="dx-home">
        <header className="hero">
          <h1>{home.title || `How to use ${SITE.product}`}</h1>
          {home.summary && <p>{home.summary}</p>}
        </header>

        <div className="ways">
          <div className="way">
            <span className="dx-eyebrow muted">On shift</span>
            <span className="t">Need an answer now?</span>
            <SearchOpener placeholder="Type what you want to do" />
            {home.onShift.length > 0 && <span className="b muted"><InlineText text={home.onShift} /></span>}
          </div>
          <div className="way">
            <span className="dx-eyebrow muted">Learning the product</span>
            <span className="t">New to {SITE.product}?</span>
            {home.newBody.length > 0 && <span className="b"><InlineText text={home.newBody} /></span>}
            {home.start && <a className="dx-primary" href={home.start.href}>Start with {home.start.title}<MaskIcon name="arrow-right" size={15} /></a>}
          </div>
        </div>

        {home.roles.length > 0 && (
          <section className="roles" aria-labelledby="dx-who">
            <h2 id="dx-who">Who uses it</h2>
            <div className="grid">
              {home.roles.map((r) => (
                <div key={r.title} className="role">
                  <span className="t">{r.title}</span>
                  <span className="d"><InlineText text={r.text} /></span>
                  {r.uses && <span className="s">{r.uses}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="map" aria-labelledby="dx-map">
          <div className="head"><h2 id="dx-map">Map of the {SITE.portalName}</h2><span className="n">{docs.sections.length} {docs.sections.length === 1 ? "section" : "sections"} · {nPages} {nPages === 1 ? "page" : "pages"}</span></div>
          <div className="grid">
            {docs.sections.map((s, i) => (
              <a key={s.slug} href={s.href}>
                <span className="top"><span className="ic"><MaskIcon name={s.icon} size={16} /></span><span className="t">{s.title}</span><span className="n dx-mono">{String(i + 1).padStart(2, "0")}</span></span>
                {s.summary && <span className="d">{s.summary}</span>}
                <span className="p">{s.pages.map((p) => p.title).join(" · ") || "No pages yet"}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </DocsFrame>
  );
}
