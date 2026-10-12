import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadDocs, loadGlossary } from "@/lib/docs/content";
import { brand, crumbs, navRows } from "@/lib/docs/view";
import DocsFrame from "@/components/docs/DocsFrame";
import { InlineText } from "@/components/docs/Inline";
import MaskIcon from "@/components/portal/Icon";

// The glossary (design: Page Docs Glossary), from content/docs/glossary.md: a row of first letters, then one entry
// per term — the term, what it stands for, the definition, an example, and where it shows in the portal.
export const metadata: Metadata = { title: "Glossary" };

export default function GlossaryPage() {
  const g = loadGlossary();
  if (!g) notFound();
  const docs = loadDocs();
  const firstOf: Record<string, string> = {};
  for (const t of g.terms) { const l = t.term[0].toUpperCase(); if (!firstOf[l]) firstOf[l] = t.id; }
  return (
    <DocsFrame brand={brand()} nav={navRows(docs, { glossary: true })} toc={null} crumbs={crumbs(null, null, g.title)} prevNext={[]}>
      <div className="dx-page">
        <header className="dx-page-head">
          <span className="dx-eyebrow">Reference</span>
          <h1 className="dx-h1">{g.title}</h1>
          {g.summary && <p className="dx-lede">{g.summary}</p>}
          <nav className="dx-letters" aria-label="Jump to a letter">
            {Object.entries(firstOf).map(([l, id]) => <a key={l} href={`#${id}`}>{l}</a>)}
          </nav>
        </header>
        <dl className="dx-glossary">
          {g.terms.map((t) => (
            <div key={t.id} id={t.id} className="term">
              <dt className="dx-mono">{t.term}</dt>
              <dd>
                {t.expansion && <span className="x">{t.expansion}</span>}
                <span className="d"><InlineText text={t.definition} /></span>
                {(t.example.length > 0 || t.where.length > 0) && (
                  <span className="meta">
                    {t.example.length > 0 && <span className="ex">Example <InlineText text={t.example} /></span>}
                    {t.where.length > 0 && <span className="wh"><MaskIcon name="map-pin" size={13} /><span><InlineText text={t.where} /></span></span>}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </DocsFrame>
  );
}
