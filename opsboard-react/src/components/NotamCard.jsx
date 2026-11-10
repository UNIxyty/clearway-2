// The one NOTAM card, in React (design "NOTAM Cards", 2026-11-10): a thin wrapper around shared/notam-card.mjs, the
// same HTML the portal's airport page draws. Keyword highlighting (the console's rule groups) runs over the field
// text through the card's `highlight` hook; the raw ruler and header line are not in the card at all.
import { useMemo } from 'react';
import { notamCardHtml } from '../../../shared/notam-card.mjs';
import { parseNotam } from '../../../shared/notam-parse.mjs';
import '../../../shared/notam-card.css';
import { buildHighlightGroups } from './NotamText';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Escaped HTML with <mark> around every keyword hit (first group that hits wins a span; no overlaps). */
export function highlightHtml(text, compiled) {
  const value = String(text || '');
  if (!compiled?.length) return esc(value);
  const ranges = [];
  for (const group of compiled) for (const regex of group.regexes) {
    regex.lastIndex = 0; let m;
    while ((m = regex.exec(value)) !== null) { if (!m[0].length) { regex.lastIndex += 1; continue; } ranges.push({ start: m.index, end: m.index + m[0].length, color: group.color }); }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  let out = ''; let cursor = 0;
  for (const r of ranges) { if (r.start < cursor) continue; out += esc(value.slice(cursor, r.start)) + `<mark class="cw-nc-mark" style="--chip:${esc(r.color)}">${esc(value.slice(r.start, r.end))}</mark>`; cursor = r.end; }
  return out + esc(value.slice(cursor));
}

/** Loaded once per page: the card's stylesheet. */
export function NotamCardStyles() { return null; } // the stylesheet comes with this module's import

/**
 * @param notam    an annotated NOTAM (wall: fields, matches, status, inWindow) or a stored item (fields are parsed here)
 * @param groups   the console's rule groups (buildHighlightGroups input) — optional
 * @param muted    drawn quietly (outside today's window, or not flagged while "show all" is on)
 */
export default function NotamCard({ notam, groups = [], muted = false, flagged = null }) {
  const compiled = useMemo(() => buildHighlightGroups(groups), [groups]);
  const html = useMemo(() => {
    const fields = notam.fields?.id !== undefined ? notam.fields : parseNotam(notam);
    const hits = (notam.matches || []).map((m) => ({ group: String(m.group || '').toUpperCase(), color: m.color }));
    const isFlagged = flagged ?? (hits.length > 0 && notam.inWindow !== false);
    return notamCardHtml(fields, { flagged: isFlagged, flagText: isFlagged ? 'Flagged' : '', groups: hits, muted, highlight: (text) => highlightHtml(text, compiled) });
  }, [notam, compiled, muted, flagged]);
  return <div className="cw-nc-wrap" data-notam-card="" dangerouslySetInnerHTML={{ __html: html }} />;
}
