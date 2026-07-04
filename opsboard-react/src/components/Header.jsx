import { useState, useEffect } from 'react';

// Configurable world-clock bar (adapted from the digital-wall prototype's
// WorldClockBar). Clock config comes from the backend
// (GET /api/display/clocks) and is edited on the Console's Settings page;
// DisplayApp passes it down and live-updates it via the SSE config.changed
// event. Falls back to a sensible default set until config loads.

export const FALLBACK_CLOCKS = [
  { label: 'Riga', timeZone: 'Europe/Riga', home: true },
  { label: 'UTC', timeZone: 'UTC' },
];

function fmt(timeZone) {
  try {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
  } catch {
    return '--:--';
  }
}

function fmtDate() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
}

export default function Header({ clocks = FALLBACK_CLOCKS, rightSlot = null, scale = 1 }) {
  const sz = (v) => Math.round(v * scale);
  const s = makeStyles(sz);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const list = Array.isArray(clocks) && clocks.length > 0 ? clocks : FALLBACK_CLOCKS;

  return (
    <header style={s.header}>
      <div style={s.brand}>
        <span style={s.brandName}>CLEARWAY</span>
        <span style={s.brandSub}>OPS · {fmtDate()}</span>
      </div>

      <div style={s.clocks}>
        {list.map((c, i) => (
          <div
            key={`${c.label}-${c.timeZone}-${i}`}
            style={{ ...s.cell, ...(i === list.length - 1 ? { borderRight: 'none' } : {}) }}
          >
            <span style={s.city}>{c.label}</span>
            <span style={{ ...s.time, ...(c.home ? s.timeHome : {}) }}>{fmt(c.timeZone)}</span>
          </div>
        ))}
      </div>

      <div style={s.rightSlot}>{rightSlot}</div>
    </header>
  );
}

function makeStyles(sz) {
  return {
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: sz(92), padding: '0 20px', flexShrink: 0,
    borderBottom: '1px solid #222840', background: '#161b26',
  },
  brand: { width: 150, display: 'flex', flexDirection: 'column', gap: 4 },
  brandName: { fontFamily: "'IBM Plex Mono',monospace", fontSize: sz(11), color: '#5a6a94', letterSpacing: '1px' },
  brandSub:  { fontFamily: "'IBM Plex Mono',monospace", fontSize: sz(10),  color: '#48547a', letterSpacing: '0.5px' },
  clocks: { display: 'flex', alignItems: 'stretch', flex: 1, justifyContent: 'center', overflow: 'hidden' },
  cell: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '0 28px', borderRight: '1px solid #222840',
  },
  city: { fontSize: sz(12), fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: '#7f8cb0', marginBottom: 5, whiteSpace: 'nowrap' },
  time: { fontFamily: "'IBM Plex Mono',monospace", fontSize: sz(42), fontWeight: 600, letterSpacing: '-1.5px', color: '#f2f5fb', lineHeight: 1 },
  timeHome: { color: '#6dc4ff' },
  rightSlot: { minWidth: 150, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 },
};
}
