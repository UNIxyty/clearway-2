// Docs content: one Markdown file per page → typed blocks the docs components render. Pure (no file access), so the
// site, search and rig/docs-check.mjs all read pages the same way. The format is written for people, not developers:
// docs/how-to-write-docs.md is the reference, and every rule below is one a writer can see in that file.
//
//   ---                              front matter: "key: value" lines
//   title: Operators
//   ---
//   Intro paragraph.                 anything before the first task
//   # Reading the board              a group of tasks (long pages)
//   ## Add an operator               a task ("function")
//   Roles: Admin                     optional, first line under a task
//   One-sentence summary.            the first paragraph of a task
//   :::warning Title … :::           note | warning | cannot-be-undone | example | how-it-works
//   1. A step                        numbered steps; indented lines under a step:
//      [screenshot: name | caption]    a screenshot
//      Note: …                         a note under the step
//   [screenshot: name | caption]     a screenshot on its own
//   [video: name | 0:30]             a video on its own
//   **Button**  `value`  [text](section/page#task)

export type Inline =
  | { kind: "text"; t: string }
  | { kind: "ui"; t: string }
  | { kind: "code"; t: string }
  | { kind: "link"; href: string; label: Inline[] };

export type Shot = { name: string; caption: string };
export type Step = { text: Inline[]; shot?: Shot; note?: Inline[] };
export type ExampleRow = { key: string; value: Inline[]; copy: string | null };

export type Block =
  | { kind: "p"; text: Inline[] }
  | { kind: "h3"; text: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "steps"; steps: Step[] }
  | { kind: "callout"; tone: "note" | "warning" | "irreversible"; title: string; body: Block[] }
  | { kind: "example"; title: string; rows: ExampleRow[] }
  | { kind: "how"; body: Block[] }
  | { kind: "shot"; shot: Shot }
  | { kind: "video"; name: string; length: string }
  | { kind: "code"; title: string; text: string }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] };

export type Fn = {
  id: string;
  n: number;
  title: string;
  roles: string;
  group: string;
  summary: Inline[];
  blocks: Block[];
  irreversible: boolean;
};

export type Parsed = {
  meta: Record<string, string>;
  intro: Block[];
  groups: string[];
  fns: Fn[];
  problems: string[];
};

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ── front matter ────────────────────────────────────────────────────────────────────────────────────────────────
export function splitFrontMatter(src: string): { meta: Record<string, string>; body: string; problems: string[] } {
  const text = src.replace(/\r\n?/g, "\n");
  const meta: Record<string, string> = {}; const problems: string[] = [];
  if (!text.startsWith("---\n")) return { meta, body: text, problems };
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { meta, body: text, problems: ["the header starts with --- but never ends with a second ---"] };
  for (const line of text.slice(4, end).split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) { problems.push(`header line not understood: "${line.trim()}" (it should be "name: value")`); continue; }
    meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(text.indexOf("\n", end + 1) + 1), problems };
}

// ── inline: **UI label**, `value`, [text](target) ───────────────────────────────────────────────────────────────
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ kind: "text", t: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "ui", t: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "code", t: m[2] });
    else out.push({ kind: "link", href: m[4], label: inline(m[3]) });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ kind: "text", t: s.slice(last) });
  return out;
}
export const plain = (xs: Inline[]): string => xs.map((x) => (x.kind === "link" ? plain(x.label) : x.t)).join("");

const SHOT = /^\[screenshot:\s*([a-z0-9][a-z0-9-]*)\s*(?:\|\s*(.*?))?\s*\]$/i;
const VIDEO = /^\[video:\s*([a-z0-9][a-z0-9-]*)\s*(?:\|\s*(.*?))?\s*\]$/i;
const CONTAINER = /^:::\s*([a-z-]+)\s*(.*)$/i;
const TONES: Record<string, "note" | "warning" | "irreversible"> = { note: "note", warning: "warning", "cannot-be-undone": "irreversible", irreversible: "irreversible" };

// ── blocks ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function blocks(lines: string[], problems: string[], where: string): Block[] {
  const out: Block[] = [];
  let i = 0;
  const isBlank = (l: string | undefined) => l === undefined || !l.trim();
  while (i < lines.length) {
    const line = lines[i]; const t = line.trim();
    if (!t) { i += 1; continue; }
    // ``` code ```
    const fence = /^```\s*(.*)$/.exec(t);
    if (fence) {
      const body: string[] = []; i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) { body.push(lines[i]); i += 1; }
      if (i >= lines.length) problems.push(`${where}: a code block starts with \`\`\` but never ends`);
      i += 1;
      out.push({ kind: "code", title: fence[1].replace(/^title\s*[:=]\s*/i, "").replace(/^["']|["']$/g, ""), text: body.join("\n") });
      continue;
    }
    // ::: container
    const c = CONTAINER.exec(t);
    if (c) {
      const kind = c[1].toLowerCase(); const title = c[2].trim();
      const body: string[] = []; i += 1;
      while (i < lines.length && lines[i].trim() !== ":::") { body.push(lines[i]); i += 1; }
      if (i >= lines.length) problems.push(`${where}: ":::${kind}" is never closed with a line holding only :::`);
      i += 1;
      if (TONES[kind]) {
        const tone = TONES[kind];
        out.push({ kind: "callout", tone, title: title || (tone === "irreversible" ? "This cannot be undone" : tone === "warning" ? "Warning" : "Note"), body: blocks(body, problems, where) });
      } else if (kind === "example") {
        const rows: ExampleRow[] = [];
        for (const l of body) {
          if (!l.trim()) continue;
          const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(l);
          if (!m) { problems.push(`${where}: example line not understood: "${l.trim()}" (it should be "Name: value")`); continue; }
          const only = /^`([^`]+)`$/.exec(m[2].trim());
          rows.push({ key: m[1], value: inline(m[2]), copy: only ? only[1] : null });
        }
        out.push({ kind: "example", title, rows });
      } else if (kind === "how-it-works" || kind === "how") {
        out.push({ kind: "how", body: blocks(body, problems, where) });
      } else {
        problems.push(`${where}: unknown block ":::${kind}" (use note, warning, cannot-be-undone, example or how-it-works)`);
        out.push(...blocks(body, problems, where));
      }
      continue;
    }
    // [screenshot: …] / [video: …] on their own line
    const s = SHOT.exec(t);
    if (s) { out.push({ kind: "shot", shot: { name: s[1].toLowerCase(), caption: s[2] ?? "" } }); i += 1; continue; }
    const v = VIDEO.exec(t);
    if (v) { out.push({ kind: "video", name: v[1].toLowerCase(), length: v[2] ?? "" }); i += 1; continue; }
    // ### sub-heading
    if (/^###\s+/.test(t)) { out.push({ kind: "h3", text: inline(t.replace(/^###\s+/, "")) }); i += 1; continue; }
    // | table |
    if (t.startsWith("|")) {
      const rowsRaw: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rowsRaw.push(lines[i].trim()); i += 1; }
      const cells = (r: string) => r.replace(/^\||\|$/g, "").split("|").map((x) => inline(x.trim()));
      const sep = rowsRaw.findIndex((r) => /^\|[\s:|-]+\|?$/.test(r));
      const head = sep > 0 ? cells(rowsRaw[0]) : [];
      const body = rowsRaw.filter((_, k) => k !== sep && !(sep > 0 && k === 0)).map(cells);
      out.push({ kind: "table", head, rows: body });
      continue;
    }
    // 1. steps
    if (/^\d+[.)]\s+/.test(t)) {
      const steps: Step[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (/^\s*\d+[.)]\s+/.test(l) && !/^\s{2,}/.test(l)) { steps.push({ text: inline(l.replace(/^\s*\d+[.)]\s+/, "")) }); i += 1; continue; }
        if (steps.length && /^\s{2,}\S/.test(l)) {
          const x = l.trim(); const cur = steps[steps.length - 1];
          const shot = SHOT.exec(x);
          if (shot) cur.shot = { name: shot[1].toLowerCase(), caption: shot[2] ?? "" };
          else if (/^note\s*:/i.test(x)) cur.note = inline(x.replace(/^note\s*:\s*/i, ""));
          else cur.text = [...cur.text, { kind: "text", t: " " }, ...inline(x)];
          i += 1; continue;
        }
        if (isBlank(l) && /^\s*\d+[.)]\s+/.test(lines[i + 1] ?? "")) { i += 1; continue; }
        break;
      }
      out.push({ kind: "steps", steps });
      continue;
    }
    // - bullet list
    if (/^[-*]\s+/.test(t)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(inline(lines[i].trim().replace(/^[-*]\s+/, ""))); i += 1; }
      out.push({ kind: "list", items });
      continue;
    }
    // paragraph: consecutive plain lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|:::|#{1,3}\s|\||\d+[.)]\s|[-*]\s|\[(screenshot|video):)/i.test(lines[i].trim())) { para.push(lines[i].trim()); i += 1; }
    if (!para.length) { problems.push(`${where}: line not understood: "${t}"`); i += 1; continue; }
    out.push({ kind: "p", text: inline(para.join(" ")) });
  }
  return out;
}

// ── a page: intro, groups (# …) and tasks (## …) ────────────────────────────────────────────────────────────────
export function parsePage(src: string, where = "page"): Parsed {
  const { meta, body, problems } = splitFrontMatter(src);
  const lines = body.split("\n");
  const intro: string[] = []; const groups: string[] = []; const fns: Fn[] = [];
  let group = ""; let cur: { title: string; group: string; lines: string[] } | null = null;
  const chunks: { title: string; group: string; lines: string[] }[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (!inFence && /^#\s+/.test(line)) { group = line.replace(/^#\s+/, "").trim(); if (!groups.includes(group)) groups.push(group); cur = null; continue; }
    if (!inFence && /^##\s+/.test(line)) { cur = { title: line.replace(/^##\s+/, "").trim(), group, lines: [] }; chunks.push(cur); continue; }
    (cur ? cur.lines : intro).push(line);
  }
  const ids = new Set<string>();
  chunks.forEach((ch, k) => {
    const lw = `${where} › ${ch.title}`;
    let roles = meta.roles || "";
    const ls = [...ch.lines];
    const first = ls.findIndex((l) => l.trim());
    if (first >= 0 && /^roles?\s*:/i.test(ls[first].trim())) { roles = ls[first].trim().replace(/^roles?\s*:\s*/i, ""); ls.splice(first, 1); }
    const bs = blocks(ls, problems, lw);
    const sIdx = bs.findIndex((b) => b.kind === "p");
    const summary = sIdx >= 0 && bs.slice(0, sIdx).every((b) => b.kind === "p") ? (bs.splice(sIdx, 1)[0] as { kind: "p"; text: Inline[] }).text : [];
    let id = slugify(ch.title) || `task-${k + 1}`;
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    fns.push({ id, n: k + 1, title: ch.title, roles: roles || "All roles", group: ch.group, summary, blocks: bs,
      irreversible: bs.some((b) => b.kind === "callout" && b.tone === "irreversible") });
  });
  return { meta, intro: blocks(intro, problems, `${where} (intro)`), groups, fns, problems };
}

// Every block, depth first (search, the docs check).
export function* walkBlocks(bs: Block[]): Generator<Block> {
  for (const b of bs) { yield b; if (b.kind === "callout" || b.kind === "how") yield* walkBlocks(b.body); }
}
export function* walkInline(bs: Block[]): Generator<Inline> {
  const each = function* (xs: Inline[]): Generator<Inline> { for (const x of xs) { yield x; if (x.kind === "link") yield* each(x.label); } };
  for (const b of walkBlocks(bs)) {
    if (b.kind === "p" || b.kind === "h3") yield* each(b.text);
    else if (b.kind === "list") for (const it of b.items) yield* each(it);
    else if (b.kind === "steps") for (const s of b.steps) { yield* each(s.text); if (s.note) yield* each(s.note); }
    else if (b.kind === "example") for (const r of b.rows) yield* each(r.value);
    else if (b.kind === "table") for (const r of [b.head, ...b.rows]) for (const c of r) yield* each(c);
  }
}
