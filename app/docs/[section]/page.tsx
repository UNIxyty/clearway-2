import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadDocs } from "@/lib/docs/content";
import { brand, crumbs, fmtDate, navRows, prevNext } from "@/lib/docs/view";
import DocsFrame from "@/components/docs/DocsFrame";
import { Blocks } from "@/components/docs/Blocks";
import MaskIcon from "@/components/portal/Icon";

// A section's landing page: content/docs/<NN-section>/_section.md, then its pages in order.
export const dynamicParams = false;
export function generateStaticParams() { return loadDocs().sections.map((s) => ({ section: s.slug })); }
export function generateMetadata({ params }: { params: { section: string } }): Metadata {
  const s = loadDocs().sections.find((x) => x.slug === params.section);
  return { title: s?.title, description: s?.summary || undefined };
}

export default function SectionPage({ params }: { params: { section: string } }) {
  const docs = loadDocs();
  const section = docs.sections.find((s) => s.slug === params.section);
  if (!section) notFound();
  return (
    <DocsFrame brand={brand()} nav={navRows(docs, { section: section.slug })} toc={null} crumbs={crumbs(section)} prevNext={prevNext(docs, section, null)}>
      <div className="dx-page">
        <header className="dx-page-head">
          <span className="dx-eyebrow">Section</span>
          <h1 className="dx-h1">{section.title}</h1>
          {section.summary && <p className="dx-lede">{section.summary}</p>}
          <div className="dx-meta">
            <span><MaskIcon name="file-text" size={14} />{section.pages.length} {section.pages.length === 1 ? "page" : "pages"}</span>
            {section.updated && <span><MaskIcon name="calendar" size={14} />Updated {fmtDate(section.updated)}</span>}
            {section.version && <span><MaskIcon name="tag" size={14} />Version {section.version}</span>}
          </div>
        </header>
        {section.body.length > 0 && <Blocks blocks={section.body} />}
        <section className="dx-list" aria-label="Pages in this section">
          {section.pages.map((p) => (
            <a key={p.slug} href={p.href}>
              <span className="t">{p.title}</span>
              {p.summary && <span className="s">{p.summary}</span>}
              <span className="m">{p.status === "written" ? `${p.fns.length} ${p.fns.length === 1 ? "task" : "tasks"}` : "Being written"}</span>
            </a>
          ))}
        </section>
      </div>
    </DocsFrame>
  );
}
