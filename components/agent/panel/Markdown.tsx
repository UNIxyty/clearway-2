"use client";

// A small, deliberately limited Markdown renderer for agent replies.
//
// Why not a library: this renders text a language model produced, into an
// aviation ops tool. The safe set is small — paragraphs, lists, bold, inline
// code, and links — and everything outside it should appear as plain text
// rather than be interpreted. It builds React elements, never HTML strings, so
// there is no innerHTML path at all.
//
// Links are restricted to same-origin paths (the portal's own /files, /aip,
// /api routes). A model that emits an external URL gets it rendered as text,
// not as something a dispatcher can click.

import { FONT } from "../ui/tokens";
import type { ReactNode } from "react";
import { cw } from "@/lib/portal-tokens";

function isSafeHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/** A citation placed after a claim (2026-11-03): ⟦3,4⟧ or ⟦5|not from an official source: reuters.com, 2 Nov⟧. */
export const CITE_OPEN = "\u27E6", CITE_CLOSE = "\u27E7";
export type RenderCite = (ns: number[], mark: string | null, key: string) => ReactNode;
let renderCite: RenderCite | null = null;

/** Inline: `code`, **bold**, *italic*, [text](/path), and the citation marks. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\u27E6[^\u27E7]+\u27E7)|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith(CITE_OPEN)) {
      const [nums, ...markParts] = token.slice(1, -1).split("|");
      const ns = nums.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0);
      if (renderCite && ns.length) out.push(<span key={key}>{renderCite(ns, markParts.join("|") || null, key)}</span>);
    } else if (token.startsWith("`")) {
      out.push(
        <code key={key} style={{ fontFamily: FONT.mono, fontSize: "0.92em", background: cw.bgHover, borderRadius: 4, padding: "1px 4px" }}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      out.push(<strong key={key} style={{ fontWeight: 700 }}>{inline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith("*")) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link && isSafeHref(link[2])) {
        out.push(
          <a key={key} href={link[2]} style={{ color: cw.textLink, textDecoration: "underline" }} target="_blank" rel="noopener noreferrer">
            {link[1]}
          </a>
        );
      } else {
        // Not a path we will make clickable — show the label, keep the URL visible as text.
        out.push(link ? `${link[1]} (${link[2]})` : token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * A pipe table. Models reach for these constantly, and rendered as raw text at
 * 400px they are unreadable — which is exactly what a dispatcher saw. At panel
 * width the table becomes STACKED ROWS (label/value pairs per record) rather
 * than a squeezed grid, matching the design's "stacked rows" treatment.
 */
function Table({ rows, keyPrefix }: { rows: string[][]; keyPrefix: string }) {
  const [head, ...body] = rows;
  if (!head || body.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {body.map((cells, r) => (
        <div key={`${keyPrefix}-r${r}`} style={{ border: `1px solid ${cw.border}`, borderRadius: 10, overflow: "hidden" }}>
          {head.map((label, c) => (
            <div
              key={c}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(88px, 38%) 1fr",
                gap: 10,
                padding: "6px 10px",
                borderTop: c === 0 ? "none" : `1px solid ${cw.divider}`,
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: cw.textMuted, fontWeight: 600 }}>{label}</span>
              <span style={{ color: cw.text, minWidth: 0, overflowWrap: "anywhere" }}>
                {inline(cells[c] ?? "", `${keyPrefix}-${r}-${c}`)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableDivider = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line);
const splitRow = (line: string) =>
  line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** Puts each claim's citation after it, in the text the renderer reads (spans index the stored reply). */
export function withCitations(text: string, claims: { start: number; end: number; n: number; ns?: number[]; mark?: string }[]): string {
  let out = text;
  for (const c of [...claims].sort((a, b) => b.end - a.end)) {
    if (c.end < 0 || c.end > out.length) continue;
    const ns = (c.ns?.length ? c.ns : [c.n]).join(",");
    out = `${out.slice(0, c.end)}${CITE_OPEN}${ns}${c.mark ? `|${c.mark.replace(/[\u27E6\u27E7|]/g, "")}` : ""}${CITE_CLOSE}${out.slice(c.end)}`;
  }
  return out;
}

export default function Markdown({ text, cite = null }: { text: string; cite?: RenderCite | null }) {
  renderCite = cite;   // rendering is synchronous: set for this tree, read by inline()
  const lines = String(text ?? "").split("\n");
  const nodes: ReactNode[] = [];
  let list: string[] | null = null;
  let ordered = false;
  let table: string[][] | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const Tag = ordered ? "ol" : "ul";
    nodes.push(
      <Tag key={key} style={{ margin: "2px 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 3 }}>
        {list.map((item, i) => <li key={i}>{inline(item, `${key}-${i}`)}</li>)}
      </Tag>
    );
    list = null;
  };

  const flushTable = (key: string) => {
    if (!table) return;
    nodes.push(<Table key={key} rows={table} keyPrefix={key} />);
    table = null;
  };

  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");

    if (isTableRow(line)) {
      flushList(`l${index}`);
      if (isTableDivider(line)) return; // the |---|---| separator carries no data
      table ??= [];
      table.push(splitRow(line));
      return;
    }
    flushTable(`t${index}`);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);

    if (bullet || numbered) {
      const wantOrdered = Boolean(numbered);
      if (list && wantOrdered !== ordered) flushList(`l${index}`);
      ordered = wantOrdered;
      list ??= [];
      list.push((bullet ?? numbered)![1]);
      return;
    }
    flushList(`l${index}`);

    if (!line.trim()) return;
    if (heading) {
      nodes.push(<div key={index} style={{ fontWeight: 700, fontSize: "1.02em", marginTop: 2 }}>{inline(heading[1], `h${index}`)}</div>);
      return;
    }
    nodes.push(<p key={index} style={{ margin: 0 }}>{inline(line, `p${index}`)}</p>);
  });
  flushList("l-end");
  flushTable("t-end");

  return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{nodes}</div>;
}
