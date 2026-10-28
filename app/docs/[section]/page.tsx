import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadDocs, videoSrc, SITE } from "@/lib/docs/content";
import { brand, crumbs, fmtDate, navRows, prevNext } from "@/lib/docs/view";
import DocsFrame, { type TocEntry } from "@/components/docs/DocsFrame";
import { Blocks } from "@/components/docs/Blocks";
import { Video } from "@/components/docs/Media";
import MaskIcon from "@/components/portal/Icon";

// A section's landing page (design: Page Docs Section): version, updated date and page count; the section's video;
// its pages; what's new and the version history. All of it from content/docs/<NN-section>/_section.md and the page
// files next to it. While no page in the section is written, it says so and lists what is planned.
// dynamicParams on (2026-10-28): an unknown section renders here and calls notFound(), so it gets the docs' own
// not-found inside the docs layout. The portal's root not-found no longer carries a docs version.
export const dynamicParams = true;
export function generateStaticParams() { return loadDocs().sections.map((s) => ({ section: s.slug })); }
export function generateMetadata({ params }: { params: { section: string } }): Metadata {
  const s = loadDocs().sections.find((x) => x.slug === params.section);
  return { title: s?.title, description: s?.summary || undefined };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default function SectionPage({ params }: { params: { section: string } }) {
  const docs = loadDocs();
  const section = docs.sections.find((s) => s.slug === params.section);
  if (!section) notFound();
  const written = section.pages.some((p) => p.status === "written");
  const news = section.body.filter((b) => b.kind === "news");
  const history = section.body.filter((b) => b.kind === "history");
  const overview = section.body.filter((b) => b.kind !== "news" && b.kind !== "history");
  const v = section.video ? videoSrc(section.video.name) : null;
  const toc: TocEntry[] | null = written ? [
    { n: 1, id: "overview", title: "Overview", plain: true },
    { n: 2, id: "pages", title: "Pages in this section", plain: true },
    ...(news.length ? [{ n: 3, id: "whats-new", title: "What’s new", plain: true }] : []),
    ...(history.length ? [{ n: news.length ? 4 : 3, id: "history", title: "Version history", plain: true }] : []),
  ] : null;
  return (
    <DocsFrame brand={brand()} nav={navRows(docs, { section: section.slug })} toc={toc} tocBar={false} crumbs={crumbs(section)} prevNext={prevNext(docs, section, null)}>
      <div className="dx-page">
        <header className="dx-page-head" id="fn-overview">
          <span className="dx-eyebrow">Section</span>
          <h1 className="dx-h1 section">{section.title}</h1>
          {section.summary && <p className="dx-lede">{section.summary}</p>}
          <div className="dx-chiprow">
            {section.version && <span className="ver dx-mono">v{section.version}</span>}
            {section.updated && <span><MaskIcon name="calendar" size={13} />Updated {fmtDate(section.updated)}</span>}
            <span><MaskIcon name="files" size={13} />{plural(section.pages.length, "page")}</span>
          </div>
        </header>

        {!written ? (
          <div className="dx-empty" data-docs-state="section-being-written">
            <div className="top"><MaskIcon name="pen-line" size={20} className="ic" />
              <div><span className="t">Nothing written in this section yet</span>
                <span className="b">{section.pages.length ? "These pages are planned." : "Its pages are still being decided."} Need something now? Search the docs, or ask in <a href={SITE.supportLink}>{SITE.supportLabel}</a>.</span></div>
            </div>
            {section.pages.length > 0 && (
              <div className="planned">
                {section.pages.map((p) => <a key={p.slug} href={p.href}><MaskIcon name="pen-line" size={15} /><span className="t">{p.title}</span><span className="s">Planned</span></a>)}
              </div>
            )}
          </div>
        ) : (
          <>
            {section.video && <Video src={v?.src ?? null} poster={v?.poster ?? null} title={`${section.title} in ${section.video.length || "one minute"}`} length={section.video.length} />}
            {overview.length > 0 && <Blocks blocks={overview} />}
            <section id="fn-pages" className="dx-sec-block" aria-labelledby="dx-pages">
              <h2 id="dx-pages">Pages in this section</h2>
              <div className="dx-pagelist">
                {section.pages.map((p) => (
                  <a key={p.slug} href={p.href}>
                    <span className="main"><span className="t">{p.title}</span>
                      <span className="s">{p.summary || p.fns.slice(0, 3).map((f) => f.title).join(" · ")}</span></span>
                    <span className="c">{p.status === "written" ? plural(p.fns.length, "task") : "Being written"}</span>
                  </a>
                ))}
              </div>
            </section>
            {news.length > 0 && <section id="fn-whats-new" className="dx-sec-block"><Blocks blocks={news} /></section>}
            {history.length > 0 && (
              <section id="fn-history" className="dx-sec-block" aria-labelledby="dx-history">
                <h2 id="dx-history">Version history</h2>
                <Blocks blocks={history} />
              </section>
            )}
          </>
        )}
      </div>
    </DocsFrame>
  );
}
