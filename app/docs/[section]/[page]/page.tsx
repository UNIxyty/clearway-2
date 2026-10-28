import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPage, loadDocs } from "@/lib/docs/content";
import { brand, crumbs, navRows, prevNext, tocFor } from "@/lib/docs/view";
import DocsFrame from "@/components/docs/DocsFrame";
import PageView from "@/components/docs/PageView";

// One page per file: content/docs/<NN-section>/<NN-page>.md → /docs/<section>/<page>. Built at build time.
// Unknown pages render and call notFound() (the docs' own not-found); see [section]/page.tsx.
export const dynamicParams = true;
export function generateStaticParams() {
  return loadDocs().sections.flatMap((s) => s.pages.map((p) => ({ section: s.slug, page: p.slug })));
}
export function generateMetadata({ params }: { params: { section: string; page: string } }): Metadata {
  const { page } = findPage(params.section, params.page);
  return { title: page?.title, description: page?.summary || undefined };
}

export default function DocsPage({ params }: { params: { section: string; page: string } }) {
  const { docs, section, page } = findPage(params.section, params.page);
  if (!section || !page) notFound();
  return (
    <DocsFrame brand={brand()} nav={navRows(docs, { section: section.slug, page: page.slug })} toc={tocFor(page)}
      crumbs={crumbs(section, page)} prevNext={prevNext(docs, section, page)}>
      <PageView docs={docs} section={section} page={page} />
    </DocsFrame>
  );
}
