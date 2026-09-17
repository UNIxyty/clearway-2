import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAuthenticatedUser } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "How do I…" searches the user guide as you type. Sections come from the
// Digital Wall guide's h2/h3 headings plus their following text; up to three
// matches. The guide HTML is read from the repo in dev and fetched from the
// wall container in production (the portal image does not carry it).

type Section = { title: string; text: string };
let cache: { sections: Section[]; at: number } | null = null;

function wallBase(): string {
  return (process.env.DIGITAL_WALL_INTERNAL_URL || "http://digital-wall-backend:5174").replace(/\/+$/, "");
}

async function loadGuideHtml(): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), "digital-wall", "guide", "index.html"), "utf-8");
  } catch { /* not on disk (prod container) */ }
  try {
    const res = await fetch(`${wallBase()}/guide/`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) return await res.text();
  } catch { /* wall unreachable */ }
  return null;
}

function extractSections(html: string): Section[] {
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const parts = stripped.split(/<h([23])[^>]*>/i);
  const sections: Section[] = [];
  // split yields [before, level, rest, level, rest, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const rest = parts[i + 1] || "";
    const titleEnd = rest.search(/<\/h[23]>/i);
    if (titleEnd === -1) continue;
    const title = rest.slice(0, titleEnd).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    const body = rest
      .slice(titleEnd)
      .replace(/<[^>]*>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);
    if (title) sections.push({ title, text: body });
  }
  return sections;
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const q = String(new URL(request.url).searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 3) return NextResponse.json({ results: [] });

  if (!cache || Date.now() - cache.at > 10 * 60 * 1000) {
    const html = await loadGuideHtml();
    cache = { sections: html ? extractSections(html) : [], at: Date.now() };
  }

  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  const scored = cache.sections
    .map((s) => {
      const hayTitle = s.title.toLowerCase();
      const hayText = s.text.toLowerCase();
      let score = 0;
      for (const t of tokens.length ? tokens : [q]) {
        if (hayTitle.includes(t)) score += 3;
        if (hayText.includes(t)) score += 1;
      }
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ s }) => {
      const idx = s.text.toLowerCase().indexOf(tokens[0] || q);
      const snippet = idx >= 0 ? `…${s.text.slice(Math.max(0, idx - 60), idx + 120)}…` : s.text.slice(0, 160);
      return { title: s.title, snippet, href: "/digital-wall/guide/" };
    });

  return NextResponse.json({ results: scored });
}
