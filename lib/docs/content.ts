// The docs content, read from content/docs/. Server only.
//
//   content/docs/site.json                    brand and settings (one file: name, logo, support, public or not)
//   content/docs/home.md                      the home page's words (optional)
//   content/docs/glossary.md                  the glossary (optional)
//   content/docs/02-digital-wall/             a section: the number orders it, the rest is its address
//   content/docs/02-digital-wall/_section.md  the section's title, icon and summary
//   content/docs/02-digital-wall/03-operators.md   a page: /docs/digital-wall/operators
//   public/docs-media/screenshots/<name>.png  screenshots, referenced by name from pages
//   public/docs-media/videos/<name>.mp4 (+ <name>.jpg poster)
//
// Adding a page is adding a file; nothing here lists pages. Paths are fixed under the working directory on purpose
// (Next's file tracing then takes exactly content/docs and public/docs-media into the build, nothing else).
// Server only (it reads files): imported by server components and route handlers, never by client components.
import fs from "node:fs";
import path from "node:path";
import { inline, parsePage, plain, splitFrontMatter, blocks as parseBlocks, type Block, type Fn, type Inline } from "./parse";
import { parseGlossary, type Glossary } from "./glossary";
import type { IndexRow } from "./search";
import site from "@/content/docs/site.json";

export type Site = typeof site;
export const SITE: Site = site;

const ROOT = path.join(process.cwd(), "content", "docs");
const MEDIA = path.join(process.cwd(), "public", "docs-media");

export type DocPage = {
  section: string; slug: string; href: string; order: number; file: string;
  title: string; summary: string; status: "written" | "draft"; updated: string; roles: string;
  video: { name: string; length: string } | null; related: string[];
  intro: Block[]; groups: string[]; fns: Fn[]; problems: string[];
};
export type DocSection = {
  slug: string; href: string; order: number; dir: string;
  title: string; icon: string; summary: string; version: string; updated: string;
  video: { name: string; length: string } | null;
  body: Block[]; pages: DocPage[]; problems: string[];
};
export type Docs = { sections: DocSection[]; problems: string[] };

const ORDERED = /^(\d+)-([a-z0-9][a-z0-9-]*?)(\.md)?$/;

function readSection(dir: string): DocSection | null {
  const m = ORDERED.exec(dir); if (!m) return null;
  const abs = path.join(ROOT, dir);
  const problems: string[] = [];
  let meta: Record<string, string> = {}; let body: Block[] = [];
  const secFile = path.join(abs, "_section.md");
  if (fs.existsSync(secFile)) {
    const fm = splitFrontMatter(fs.readFileSync(secFile, "utf8"));
    meta = fm.meta; problems.push(...fm.problems.map((p) => `${dir}/_section.md: ${p}`));
    body = parseBlocks(fm.body.split("\n"), problems, `${dir}/_section.md`);
  } else problems.push(`${dir}: no _section.md (the section has no title or summary)`);
  const slug = m[2];
  const pages: DocPage[] = [];
  for (const f of fs.readdirSync(abs).sort()) {
    const pm = ORDERED.exec(f); if (!pm || !f.endsWith(".md")) continue;
    const parsed = parsePage(fs.readFileSync(path.join(abs, f), "utf8"), `${dir}/${f}`);
    const pmeta = parsed.meta;
    if (!pmeta.title) parsed.problems.push(`${dir}/${f}: no title in the header`);
    const [vName, vLen] = (pmeta.video ?? "").split("|").map((x) => x.trim());
    pages.push({
      section: slug, slug: pm[2], href: `/docs/${slug}/${pm[2]}`, order: Number(pm[1]), file: `content/docs/${dir}/${f}`,
      title: pmeta.title || pm[2], summary: pmeta.summary ?? "", status: pmeta.status === "written" ? "written" : "draft",
      updated: pmeta.updated ?? "", roles: pmeta.roles ?? "",
      video: vName ? { name: vName.toLowerCase(), length: vLen ?? "" } : null,
      related: (pmeta.related ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      intro: parsed.intro, groups: parsed.groups, fns: parsed.fns, problems: parsed.problems,
    });
  }
  const [svName, svLen] = (meta.video ?? "").split("|").map((x) => x.trim());
  return { slug, href: `/docs/${slug}`, order: Number(m[1]), dir, title: meta.title || slug, icon: meta.icon || "file-text",
    summary: meta.summary ?? "", version: meta.version ?? "", updated: meta.updated ?? "",
    video: svName ? { name: svName.toLowerCase(), length: svLen ?? "" } : null, body, pages, problems };
}

let cache: { at: number; docs: Docs } | null = null;
/** All sections and pages, in reading order. Read once per process in production; on every call in development. */
export function loadDocs(): Docs {
  if (cache && process.env.NODE_ENV === "production") return cache.docs;
  const dirs = fs.existsSync(ROOT) ? fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  const sections = dirs.map(readSection).filter((s): s is DocSection => !!s).sort((a, b) => a.order - b.order);
  const problems = sections.flatMap((s) => [...s.problems, ...s.pages.flatMap((p) => p.problems)]);
  const docs = { sections, problems };
  cache = { at: Date.now(), docs };
  return docs;
}

export function findPage(section: string, page: string) {
  const docs = loadDocs();
  const s = docs.sections.find((x) => x.slug === section);
  return { docs, section: s ?? null, page: s?.pages.find((p) => p.slug === page) ?? null };
}

/** The flat reading order: each section's overview, then its pages. */
export function readingOrder(docs: Docs) {
  return docs.sections.flatMap((s) => [{ section: s, page: null as DocPage | null }, ...s.pages.map((p) => ({ section: s, page: p as DocPage | null }))]);
}

/** Screenshot and video files that exist (a missing one shows its "to come" state, never a broken image). */
const exts = [".png", ".jpg", ".jpeg", ".webp"];
export function screenshotSrc(name: string): string | null {
  for (const e of exts) if (fs.existsSync(path.join(MEDIA, "screenshots", name + e))) return `/docs-media/screenshots/${name}${e}`;
  return null;
}
export function videoSrc(name: string): { src: string; poster: string | null } | null {
  if (!fs.existsSync(path.join(MEDIA, "videos", `${name}.mp4`))) return null;
  const poster = exts.find((e) => fs.existsSync(path.join(MEDIA, "videos", name + e)));
  return { src: `/docs-media/videos/${name}.mp4`, poster: poster ? `/docs-media/videos/${name}${poster}` : null };
}

// ── the glossary, the home page, the search index ───────────────────────────────────────────────────────────────

let glossaryCache: Glossary | null | undefined;
/** content/docs/glossary.md, or null when there is none (the nav then has no Glossary row). */
export function loadGlossary(): Glossary | null {
  if (glossaryCache !== undefined && process.env.NODE_ENV === "production") return glossaryCache;
  const f = path.join(ROOT, "glossary.md");
  glossaryCache = fs.existsSync(f) ? parseGlossary(fs.readFileSync(f, "utf8"), "content/docs/glossary.md") : null;
  return glossaryCache;
}

export type HomeRole = { title: string; text: Inline[]; uses: string };
export type Home = {
  title: string; summary: string; onShift: Inline[]; newBody: Inline[];
  /** Where "Start" goes: a section or section/page address, resolved; null when it names nothing. */
  start: { href: string; title: string } | null;
  roles: HomeRole[]; problems: string[];
};
/**
 * content/docs/home.md: the header (title, summary, start, on-shift, new) and one "## Role" per kind of reader, its
 * description, and a "Uses:" line. Without the file, the home page shows the map of sections only.
 */
export function loadHome(docs: Docs): Home {
  const f = path.join(ROOT, "home.md");
  const empty: Home = { title: "", summary: "", onShift: [], newBody: [], start: null, roles: [], problems: [] };
  if (!fs.existsSync(f)) return empty;
  const { meta, body, problems } = splitFrontMatter(fs.readFileSync(f, "utf8"));
  const roles: HomeRole[] = [];
  let cur: { title: string; lines: string[] } | null = null;
  for (const line of body.split("\n")) {
    if (/^##\s+/.test(line)) { cur = { title: line.replace(/^##\s+/, "").trim(), lines: [] }; roles.push({ title: cur.title, text: [], uses: "" }); continue; }
    if (!cur || !line.trim()) continue;
    const r = roles[roles.length - 1];
    if (/^uses\s*:/i.test(line.trim())) r.uses = line.trim().replace(/^uses\s*:\s*/i, "");
    else r.text = [...r.text, ...(r.text.length ? [{ kind: "text" as const, t: " " }] : []), ...inline(line.trim())];
  }
  let start: Home["start"] = null;
  if (meta.start) {
    const [s, p] = meta.start.split("/");
    const sec = docs.sections.find((x) => x.slug === s);
    const pg = p ? sec?.pages.find((x) => x.slug === p) : null;
    if (sec && (!p || pg)) start = { href: pg ? pg.href : sec.href, title: pg ? pg.title : sec.title };
    else problems.push(`content/docs/home.md: start "${meta.start}" is not a section or page`);
  }
  return { title: meta.title ?? "", summary: meta.summary ?? "", onShift: inline(meta["on-shift"] ?? ""), newBody: inline(meta.new ?? ""), start, roles, problems };
}

/** Every searchable row: sections, pages, tasks, glossary terms. Built at build time (lib/docs/search.ts). */
export function searchIndex(): IndexRow[] {
  const docs = loadDocs();
  const rows: IndexRow[] = [];
  for (const s of docs.sections) {
    rows.push({ kind: "section", title: s.title, section: s.title, page: "", href: s.href, summary: s.summary });
    for (const p of s.pages) {
      const draft = p.status !== "written";
      rows.push({ kind: "page", title: p.title, section: s.title, page: "", href: p.href, summary: p.summary, ...(draft ? { draft } : {}) });
      for (const f of p.fns) {
        rows.push({ kind: "task", title: f.title, section: s.title, page: p.title, href: draft ? p.href : `${p.href}#fn-${f.id}`, summary: plain(f.summary),
          ...(f.irreversible ? { danger: true } : {}), ...(draft ? { draft } : {}) });
      }
    }
  }
  const g = loadGlossary();
  if (g) for (const t of g.terms) rows.push({ kind: "term", title: t.term, section: g.title, page: "", href: `/docs/glossary#${t.id}`, summary: plain(t.definition), also: t.expansion });
  return rows;
}
