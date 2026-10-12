import { loadDocs, SITE } from "@/lib/docs/content";
import { brand, navRows } from "@/lib/docs/view";
import DocsFrame from "@/components/docs/DocsFrame";
import MaskIcon from "@/components/portal/Icon";

// The docs home. Stage 1: the map of every section and its pages (the full home — two ways in, who uses it — is
// Stage 3). Built from the files in content/docs/.
export default function DocsHome() {
  const docs = loadDocs();
  return (
    <DocsFrame brand={brand()} nav={navRows(docs, { home: true })} toc={null} crumbs={[]} prevNext={[]} wide>
      <div className="dx-page">
        <header className="dx-page-head">
          <span className="dx-eyebrow">{SITE.product} {SITE.docsName}</span>
          <h1 className="dx-h1">How to use the {SITE.product} {SITE.portalName}</h1>
          <p className="dx-lede">Every section of the portal, and every task in it, step by step.</p>
        </header>
        <section className="dx-list" aria-label="Sections">
          {docs.sections.map((s) => (
            <a key={s.slug} href={s.href}>
              <span className="t" style={{ display: "flex", alignItems: "center", gap: 8 }}><MaskIcon name={s.icon} size={16} />{s.title}</span>
              {s.summary && <span className="s">{s.summary}</span>}
              <span className="m">{s.pages.map((p) => p.title).join(" · ") || "No pages yet"}</span>
            </a>
          ))}
        </section>
      </div>
    </DocsFrame>
  );
}
