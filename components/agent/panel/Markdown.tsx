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

import { C, FONT } from "./tokens";
import type { ReactNode } from "react";

function isSafeHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/** Inline: `code`, **bold**, *italic*, [text](/path). */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      out.push(
        <code key={key} style={{ fontFamily: FONT.mono, fontSize: "0.92em", background: C.wash, borderRadius: 4, padding: "1px 4px" }}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      out.push(<strong key={key} style={{ fontWeight: 700 }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link && isSafeHref(link[2])) {
        out.push(
          <a key={key} href={link[2]} style={{ color: C.blueDeep, textDecoration: "underline" }} target="_blank" rel="noopener noreferrer">
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
        <div key={`${keyPrefix}-r${r}`} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {head.map((label, c) => (
            <div
              key={c}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(88px, 38%) 1fr",
                gap: 10,
                padding: "6px 10px",
                borderTop: c === 0 ? "none" : `1px solid ${C.rowLine}`,
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: C.faint, fontWeight: 600 }}>{label}</span>
              <span style={{ color: C.ink, minWidth: 0, overflowWrap: "anywhere" }}>
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

export default function Markdown({ text }: { text: string }) {
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
