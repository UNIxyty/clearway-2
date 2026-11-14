// The client desk's icons (v3, 2026-11-13): lucide outlines drawn inline (24 grid, 2 px stroke, round caps, the text's
// own colour), 16 px unless a size is given. The wall app ships no icon library and the portal's /icons files are
// masks for portal pages, so the frame carries the few it needs here. Paths are lucide's (ISC licence).
const P = (d) => ({ d });
const C = (cx, cy, r) => ({ c: [cx, cy, r] });
const ICONS = {
  'eye-off': [P('M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'), P('M14.084 14.158a3 3 0 0 1-4.242-4.242'), P('M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'), P('m2 2 20 20')],
  eye: [P('M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'), C(12, 12, 3)],
  sliders: [P('M21 4h-7'), P('M10 4H3'), P('M21 12h-9'), P('M8 12H3'), P('M21 20h-5'), P('M12 20H3'), P('M14 2v4'), P('M8 10v4'), P('M16 18v4')],
  'chevron-down': [P('m6 9 6 6 6-6')],
  'chevron-left': [P('m15 18-6-6 6-6')],
  'chevron-right': [P('m9 18 6-6-6-6')],
  minus: [P('M5 12h14')],
  plus: [P('M5 12h14'), P('M12 5v14')],
  'locate-fixed': [P('M2 12h3'), P('M19 12h3'), P('M12 2v3'), P('M12 19v3'), C(12, 12, 7), C(12, 12, 3)],
  'wifi-off': [P('M12 20h.01'), P('M8.5 16.429a5 5 0 0 1 7 0'), P('M5 12.859a10 10 0 0 1 5.17-2.69'), P('M19 12.859a10 10 0 0 0-2.007-1.523'), P('M2 8.82a15 15 0 0 1 4.177-2.643'), P('M22 8.82a15 15 0 0 0-11.288-3.764'), P('m2 2 20 20')],
  'calendar-x': [P('M8 2v4'), P('M16 2v4'), P('M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8'), P('M3 10h18'), P('m17 22 5-5'), P('m17 17 5 5')],
  'arrow-right': [P('M5 12h14'), P('m12 5 7 7-7 7')],
  'arrow-left': [P('m12 19-7-7 7-7'), P('M19 12H5')],
  search: [C(11, 11, 8), P('m21 21-4.3-4.3')],
  'search-x': [P('m13.5 8.5-5 5'), P('m8.5 8.5 5 5'), C(11, 11, 8), P('m21 21-4.3-4.3')],
  x: [P('M18 6 6 18'), P('m6 6 12 12')],
  plane: [P('M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z')],
  'circle-slash': [C(12, 12, 10), P('M9 15l6-6')],
  'rotate-ccw': [P('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'), P('M3 3v5h5')],
  'triangle-alert': [P('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'), P('M12 9v4'), P('M12 17h.01')],
};

/** One icon. `name` is a key above; anything else draws nothing (a missing icon must never break a row). */
export default function Icon({ name, size = 16, className = '', style }) {
  const parts = ICONS[name];
  if (!parts) return null;
  return (
    <svg className={`cwi${className ? ` ${className}` : ''}`} data-icon={name} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}>
      {parts.map((p, i) => (p.d ? <path key={i} d={p.d} /> : <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} />))}
    </svg>
  );
}
