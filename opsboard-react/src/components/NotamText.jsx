// Keyword-highlighted NOTAM text, shared by the Console (NOTAM check panel)
// and the wall overlay. Highlight colors come from the editable rule groups
// (GET /api/alerts/rules -> notamGroups: {group, color, terms[], patterns[]}).

/** Compile rule groups into global regexes usable for highlighting. */
export function buildHighlightGroups(notamGroups) {
  const compiled = [];
  for (const group of notamGroups || []) {
    const regexes = [];
    for (const term of group.terms || []) {
      const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        regexes.push(new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`, 'gi'));
      } catch {
        /* skip */
      }
    }
    for (const source of group.patterns || []) {
      try {
        regexes.push(new RegExp(source, 'gi'));
      } catch {
        /* skip */
      }
    }
    if (regexes.length > 0) compiled.push({ color: group.color, regexes });
  }
  return compiled;
}

function collectRanges(text, groups) {
  const ranges = [];
  for (const group of groups) {
    for (const regex of group.regexes) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match[0].length === 0) {
          regex.lastIndex += 1;
          continue;
        }
        ranges.push({ start: match.index, end: match.index + match[0].length, color: group.color });
      }
    }
  }
  // Earlier start wins; on ties the longer match wins. Overlaps are dropped.
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    kept.push(range);
    cursor = range.end;
  }
  return kept;
}

export default function NotamText({ text, groups, style = {} }) {
  const value = String(text || '');
  const ranges = groups && groups.length > 0 ? collectRanges(value, groups) : [];
  if (ranges.length === 0) return <span style={style}>{value}</span>;

  const parts = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(<span key={`t${index}`}>{value.slice(cursor, range.start)}</span>);
    parts.push(
      <mark
        key={`m${index}`}
        style={{
          background: 'transparent',
          color: range.color,
          fontWeight: 700,
          borderBottom: `2px solid ${range.color}55`,
        }}
      >
        {value.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < value.length) parts.push(<span key="tail">{value.slice(cursor)}</span>);
  return <span style={style}>{parts}</span>;
}
