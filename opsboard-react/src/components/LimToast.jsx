import { useEffect } from 'react';

const BADGE_COLORS = {
  AOG:  { bg: 'rgba(239,106,106,.15)', color: '#ef6a6a' },
  WX:   { bg: 'rgba(95,181,255,.15)',  color: '#5fb5ff' },
  CREW: { bg: 'rgba(240,177,59,.15)',  color: '#f0b13b' },
  PAX:  { bg: 'rgba(58,165,122,.15)', color: '#7ecfaa' },
  CTOT: { bg: 'rgba(184,140,255,.15)', color: '#ccb0f5' },
};

export default function LimToast({ lim, onClose }) {
  useEffect(() => {
    if (!lim) return;
    const id = setTimeout(onClose, 8000);
    return () => clearTimeout(id);
  }, [lim]);

  if (!lim) return null;

  const badge = BADGE_COLORS[lim.type] || BADGE_COLORS.AOG;

  return (
    <div style={s.toast}>
      <button style={s.close} onClick={onClose}>×</button>
      <div style={s.head}>
        <span style={{ ...s.badge, background: badge.bg, color: badge.color }}>
          {lim.type}
        </span>
        <span style={s.ac}>{lim.ac}</span>
      </div>
      <div style={s.msg}>{lim.msg}</div>
    </div>
  );
}

const s = {
  toast: {
    position: 'fixed', right: 18, bottom: 18, width: 290,
    background: '#161c2e', border: '1px solid #191e2d',
    borderRadius: 10, padding: 13, zIndex: 200,
    animation: 'toastIn .18s ease',
  },
  close: {
    position: 'absolute', top: 9, right: 9, background: 'none',
    border: 'none', color: '#353d56', cursor: 'pointer',
    fontSize: 15, padding: '2px 5px',
  },
  head: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 },
  badge: {
    fontSize: 9, fontWeight: 700, letterSpacing: '1.2px',
    padding: '2px 7px', borderRadius: 99,
  },
  ac: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#6e7894',
  },
  msg: { fontSize: 11, color: '#6e7894', lineHeight: 1.55 },
};
