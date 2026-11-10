// One NOTAM parser for every screen (bug report 8 item 4; design "NOTAM Cards", 2026-11-10). A stored NOTAM item
// (location, number, class, startDateUtc, endDateUtc, created, condition) is parsed ONCE, on the server that
// serves it (the portal's /api/notams route and the wall's annotation), into `fields`; every card draws from the
// fields and never from the raw block again. The CrewBriefing rulers (`|#14|-----`) and the header line
// (`A0037/26 NOTAMN [ils llz | -13]`) are not fields and are gone from the card; a NOTAM that cannot be parsed keeps
// its raw text and is drawn in the same card, readable, counted as unparsed.
//
// Plain module: Node (the two servers) and both browsers (the portal, the wall app) import it alike.

const FIELD_RE = /(^|\n)\s*([QABCDEFG])\)\s*/g;

/** "2603160700" → epoch ms (UTC); "PERM", "", or anything else → null. Also accepts ISO strings. */
export function notamTimeMs(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s);
  if (m) {
    const [, yy, mo, dd, hh, mi] = m.map(Number);
    const ms = Date.UTC(2000 + yy, mo - 1, dd, hh, mi, 0);
    return Number.isFinite(ms) ? ms : null;
  }
  const iso = Date.parse(s);
  return Number.isFinite(iso) ? iso : null;
}

export const isPerm = (value) => /\bPERM\b/i.test(String(value ?? ''));

/** "D MMM YYYY HH:MMZ" — the one time format every Clearway screen and email uses. */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtZ(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

/** The validity line: "16 Mar 2026 07:00Z → 18 Mar 2026 13:00Z", "… → PERM", "… → EST". */
export function validityText(fields) {
  const from = fmtZ(fields.validFromMs) || (fields.b ? fields.b : '—');
  let till;
  if (fields.perm) till = 'PERM';
  else if (Number.isFinite(fields.validTillMs)) till = fmtZ(fields.validTillMs) + (fields.est ? ' EST' : '');
  else till = fields.c ? fields.c : '—';
  return `${from} → ${till}`;
}

/**
 * The stored item → fields. Never throws. `parsed` is false when the block carries no E) line at all, which is the
 * one case the raw text is the best we have.
 */
export function parseNotam(item) {
  const raw = String(item?.condition ?? item?.text ?? item?.raw ?? '').replace(/\r\n?/g, '\n');
  // strip the CrewBriefing ruler and the bracketed tag on the header line; keep the rest
  const cleaned = raw
    .split('\n')
    .filter((line) => !/^\s*\|#\d+\|[-\s]*$/.test(line))
    .map((line) => line.replace(/\s*\[[^\]]*\|\s*-?\d+\]\s*$/, ''))
    .join('\n')
    .trim();
  const header = /^([A-Z]\d{1,4}\/\d{2})\s+NOTAM([NRC])(?:\s+([A-Z]\d{1,4}\/\d{2}))?/m.exec(cleaned);
  const id = item?.number && item.number !== 'CREWBRIEFING-RAW' ? String(item.number) : header?.[1] || '';
  const type = (item?.class && /^[NRC]$/.test(item.class) ? item.class : header?.[2]) || 'N';
  const refers = header?.[3] || '';
  const fields = { q: '', a: '', b: '', c: '', d: '', e: '', f: '', g: '' };
  // positions of each "X)" marker, in order; a field runs to the next marker
  const marks = [];
  let m;
  FIELD_RE.lastIndex = 0;
  while ((m = FIELD_RE.exec(cleaned))) marks.push({ key: m[2].toLowerCase(), start: m.index + m[0].length, markAt: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].markAt : cleaned.length;
    let text = cleaned.slice(marks[i].start, end).trim();
    // A) B) C) sit on one line: "A) DBBB B) 2603160700 C) 2603181300" — cut A)/B)/C) at the next inline marker
    if (['a', 'b', 'c'].includes(marks[i].key)) text = text.split(/\s+(?=[BCDEFG]\)\s)/)[0].trim();
    if (!fields[marks[i].key]) fields[marks[i].key] = text;
  }
  const b = fields.b || item?.startDateUtc || '';
  const c = fields.c || item?.endDateUtc || '';
  const perm = isPerm(c) || (type === 'N' && !c && !fields.c && /\bPERM\b/.test(cleaned));
  const est = /\bEST\b/.test(c);
  const validFromMs = notamTimeMs(b);
  const validTillMs = perm ? null : notamTimeMs(c);
  const createdMs = item?.created ? Date.parse(String(item.created).replace(/^(\d{1,2}) (\w{3}) (\d{4})(?: ([0-9:]+))?$/, (_, d, mo, y, t) => `${d} ${mo} ${y} ${t || '00:00:00'} UTC`)) : NaN;
  const issuedMs = Number.isFinite(createdMs) ? createdMs : (Number.isFinite(Date.parse(item?.firstSeenAt || '')) ? Date.parse(item.firstSeenAt) : null);
  const parsed = Boolean(fields.e) || Boolean(fields.q);
  return {
    id, type, refers, location: fields.a || item?.location || '',
    ...fields,
    b, c, perm, est, validFromMs, validTillMs,
    issuedMs, issuedFrom: Number.isFinite(createdMs) ? 'source' : issuedMs != null ? 'first-seen' : null,
    parsed, raw: parsed ? '' : cleaned || raw,
  };
}

/** Expired: a C) time in the past. PERM, EST and an unreadable C) never expire here (the alerts scan keeps its own rule). */
export function notamExpired(fields, nowMs = Date.now()) {
  return !fields.perm && Number.isFinite(fields.validTillMs) && fields.validTillMs < nowMs;
}

/** Attach `fields` to every item of a stored NOTAM list and drop the expired ones; returns { items, dropped, unparsed }. */
export function prepareNotams(items, nowMs = Date.now()) {
  let dropped = 0; let unparsed = 0;
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const fields = item?.fields?.id !== undefined ? item.fields : parseNotam(item);
    if (notamExpired(fields, nowMs)) { dropped += 1; continue; }
    if (!fields.parsed) unparsed += 1;
    out.push({ ...item, fields });
  }
  return { items: out, dropped, unparsed };
}
