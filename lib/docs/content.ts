// The docs content, read from content/docs/. Server only.
//
//   content/docs/site.json                    brand and settings (one file: name, logo, support, public or not)
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
import { parsePage, splitFrontMatter, blocks as parseBlocks, type Block, type Fn } from "./parse";
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
  return { slug, href: `/docs/${slug}`, order: Number(m[1]), dir, title: meta.title || slug, icon: meta.icon || "file-text",
    summary: meta.summary ?? "", version: meta.version ?? "", updated: meta.updated ?? "", body, pages, problems };
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
