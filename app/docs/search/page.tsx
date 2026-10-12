import { Suspense } from "react";
import type { Metadata } from "next";
import { loadDocs, SITE } from "@/lib/docs/content";
import { resolveLink } from "@/lib/docs/links";
import { brand, crumbs, glossaryHref, navRows } from "@/lib/docs/view";
import DocsFrame from "@/components/docs/DocsFrame";
import SearchResults from "@/components/docs/SearchResults";

// All results for a query: /docs/search?q=… (⇧↵ in the search box). The page is static; the query and the results
// are read in the browser, from the same build-time index as the search box.
export const metadata: Metadata = { title: "Search" };

export default function DocsSearchPage() {
  const docs = loadDocs();
  const b = brand();
  return (
    <DocsFrame brand={b} nav={navRows(docs, {})} toc={null} crumbs={crumbs(null, null, "Search")} prevNext={[]} wide>
      <Suspense fallback={<div className="dx-search-loading" aria-busy="true">Loading search…</div>}>
        <SearchResults suggestions={SITE.searchSuggestions ?? []} common={(SITE.commonTasks ?? []).map((a) => resolveLink(a).href)}
          glossaryHref={glossaryHref()} supportHref={b.supportHref} supportText={b.supportText} />
      </Suspense>
    </DocsFrame>
  );
}
