// What the docs shell shows, built from the content (server). Nothing here lists sections or pages: the nav, the
// breadcrumb and previous/next all come from the files in content/docs/.
import fs from "node:fs";
import path from "node:path";
import { SITE, readingOrder, type DocPage, type DocSection, type Docs } from "./content";
import type { Brand, Crumb, NavRow, PrevNext, TocEntry } from "@/components/docs/DocsFrame";

export function brand(): Brand {
  const s = SITE;
  return {
    product: s.product, docsName: s.docsName, portalUrl: s.portalUrl, logo: s.logo,
    // While the docs live next to the portal (and behind its sign-in), "Open the portal" goes to the portal on this host.
    portalHref: s.public ? s.portalUrl : "/dashboard",
    // An empty support email means the portal's Help & support page.
    supportHref: s.supportEmail ? `mailto:${s.supportEmail}` : s.supportLink,
    supportText: s.supportEmail ? `Write to ${s.supportEmail}` : `Tell us in ${s.supportLabel}`,
    creditName: s.credit?.name ?? "", creditLight: s.credit?.logoLight ?? "", creditDark: s.credit?.logoDark ?? "",
  };
}

export const hasGlossary = () => fs.existsSync(path.join(process.cwd(), "content", "docs", "glossary.md"));

/** Left nav: Home and Glossary on top, then the sections; only the current section opens to its pages. */
export function navRows(docs: Docs, here: { home?: boolean; glossary?: boolean; section?: string; page?: string }): NavRow[] {
  const rows: NavRow[] = [{ title: "Home", href: "/docs", icon: "house", on: !!here.home }];
  if (hasGlossary()) rows.push({ title: "Glossary", href: "/docs/glossary", icon: "book-a", on: !!here.glossary });
  rows.push({ title: "Sections", href: "#label" });
  for (const s of docs.sections) {
    const open = s.slug === here.section;
    rows.push({ title: s.title, href: s.href, icon: s.icon, count: open ? undefined : s.pages.length, open, on: open && !here.page });
    if (open) for (const p of s.pages) rows.push({ title: p.title, href: p.href, sub: true, on: p.slug === here.page, count: p.fns.length > 1 ? p.fns.length : undefined });
  }
  return rows;
}

export function crumbs(section?: DocSection | null, page?: DocPage | null, last?: string): Crumb[] {
  const c: Crumb[] = [{ title: SITE.docsName, href: "/docs" }];
  if (section) c.push({ title: section.title, href: section.href });
  if (page) c.push({ title: page.title, href: page.href });
  if (last) c.push({ title: last });
  return c;
}

/** Previous / next over the reading order: a section's overview, then its pages, then the next section. */
export function prevNext(docs: Docs, section: DocSection, page: DocPage | null): PrevNext[] {
  const order = readingOrder(docs);
  const idx = order.findIndex((o) => o.section === section && o.page === page);
  const label = (o: (typeof order)[number]) => (o.page ? o.page.title : `${o.section.title} overview`);
  const out: PrevNext[] = [];
  const pv = order[idx - 1]; const nx = order[idx + 1];
  if (pv) out.push({ kind: "prev", title: label(pv), sub: pv.section.title, href: pv.page ? pv.page.href : pv.section.href });
  if (nx) out.push({ kind: "next", title: label(nx), sub: nx.section.title, href: nx.page ? nx.page.href : nx.section.href });
  return out;
}

/** "On this page": tasks, under their groups when the page has groups. */
export function tocFor(page: DocPage): TocEntry[] | null {
  if (page.status !== "written" || !page.fns.length) return null;
  const out: TocEntry[] = []; let g = "";
  for (const f of page.fns) {
    if (f.group && f.group !== g) { g = f.group; out.push({ head: g }); }
    out.push({ n: f.n, id: f.id, title: f.title, danger: f.irreversible });
  }
  return out;
}

export const fmtDate = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
