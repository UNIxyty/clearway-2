// The one NOTAM card (design "NOTAM Cards", 2026-11-10): a category square, the number, the validity on the right
// (under the number on a phone), the body one ICAO field per line — Q) the quietest, E) the largest — wrapped at
// 80 characters. The same markup on the flight NOTAM check page, the airport page's NOTAM panel and the client and
// phone flight pages (read-only there). It is a string of HTML with `cw-nc-*` classes (shared/notam-card.css) so the
// portal (React 18) and the wall app (React 19) draw literally the same thing. Values are escaped here; the only
// dynamic attribute is data-notam-id.
import { validityText, fmtZ } from './notam-parse.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Soft-wrap at 80 characters on spaces; the browser wraps shorter lines itself. */
export function wrap80(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    let cur = '';
    for (const word of line.split(/\s+/)) {
      if (!word) continue;
      if (cur && cur.length + 1 + word.length > 80) { out.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
    }
    out.push(cur);
  }
  return out.join('\n');
}

const TYPE_WORD = { N: 'New', R: 'Replaces', C: 'Cancels' };

/**
 * @param {object} fields  from shared/notam-parse.mjs parseNotam()
 * @param {object} opts    { flagged: bool, flagText: '', groups: [{ group, color }] (the keyword groups that hit), muted: bool,
 *                           highlight: (text) => html (optional keyword highlighter; must escape), issuedLabel: bool }
 */
export function notamCardHtml(fields, opts = {}) {
  const hl = typeof opts.highlight === 'function' ? opts.highlight : esc;
  const cls = ['cw-nc', opts.flagged ? 'is-flagged' : '', opts.muted ? 'is-muted' : '', fields.parsed ? '' : 'is-raw'].filter(Boolean).join(' ');
  const typeWord = TYPE_WORD[fields.type] || 'NOTAM';
  const refers = fields.refers ? ` <span class="cw-nc-refers">${esc(fields.refers)}</span>` : '';
  const chips = (opts.groups || []).map((g) => `<span class="cw-nc-chip" style="--chip:${esc(g.color || '')}">${esc(g.group)}</span>`).join('');
  const flag = opts.flagged ? `<span class="cw-nc-flag">${esc(opts.flagText || 'Flagged')}</span>` : '';
  const issued = fields.issuedMs != null ? `<span class="cw-nc-issued">${fields.issuedFrom === 'source' ? 'Issued' : 'First seen'} ${esc(fmtZ(fields.issuedMs))}</span>` : '<span class="cw-nc-issued is-none">Issue time not in source</span>';
  const line = (key, text, big = false) => (text ? `<div class="cw-nc-line cw-nc-${key}${big ? ' is-big' : ''}"><span class="cw-nc-key">${key.toUpperCase()})</span><span class="cw-nc-val">${hl(wrap80(text))}</span></div>` : '');
  const body = fields.parsed
    ? [line('q', fields.q), line('a', fields.a), fields.b || fields.c ? `<div class="cw-nc-line cw-nc-bc"><span class="cw-nc-key">B)</span><span class="cw-nc-val">${esc(fields.b || '—')}</span><span class="cw-nc-key">C)</span><span class="cw-nc-val">${esc(fields.perm ? 'PERM' : fields.c || '—')}</span></div>` : '', line('d', fields.d), line('e', fields.e, true), line('f', fields.f), line('g', fields.g)].join('')
    : `<div class="cw-nc-line cw-nc-raw is-big"><span class="cw-nc-key">RAW</span><span class="cw-nc-val">${hl(wrap80(fields.raw))}</span></div>`;
  return `<article class="${cls}" data-notam-id="${esc(fields.id)}" data-notam-type="${esc(fields.type)}">
  <header class="cw-nc-head">
    <span class="cw-nc-type" title="${esc(typeWord)}">${esc(fields.type)}</span>
    <span class="cw-nc-id">${esc(fields.id || 'No number')}${refers}</span>
    ${flag}${chips}
    <span class="cw-nc-valid">${esc(validityText(fields))}</span>
  </header>
  <div class="cw-nc-body">${body}</div>
  <footer class="cw-nc-foot">${issued}${fields.parsed ? '' : '<span class="cw-nc-unparsed">Could not be split into fields</span>'}</footer>
</article>`;
}

/** A list of prepared items ({ fields }) → one block of cards, with the counts the design asks for. */
export function notamListHtml(items, { unparsed = 0, dropped = 0, each = () => ({}) } = {}) {
  const cards = items.map((it) => notamCardHtml(it.fields, each(it))).join('');
  const note = unparsed ? `<p class="cw-nc-note">${unparsed} NOTAM${unparsed === 1 ? '' : 's'} could not be split into fields and ${unparsed === 1 ? 'is' : 'are'} shown as received.</p>` : '';
  const gone = dropped ? `<p class="cw-nc-note is-quiet">${dropped} expired NOTAM${dropped === 1 ? '' : 's'} not shown.</p>` : '';
  return `${cards}${note}${gone}`;
}
