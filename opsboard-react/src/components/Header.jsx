import { useState, useEffect } from 'react';

const CLOCKS = [
  { city: 'Riga',     tz: 'Europe/Riga',     home: true },
  { city: 'Paris',    tz: 'Europe/Paris'               },
  { city: 'New York', tz: 'America/New_York'           },
  { city: 'Istanbul', tz: 'Europe/Istanbul'            },
  { city: 'UTC',      tz: 'UTC'                        },
];

function fmt(tz) {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}
function fmtDate() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
}

export default function Header() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header style={s.header}>
      <div style={s.brand}>
        <span style={s.brandName}>CLEARWAY</span>
        <span style={s.brandSub}>OPS · {fmtDate()}</span>
      </div>

      <div style={s.clocks}>
        {CLOCKS.map((c, i) => (
          <div key={c.city} style={{ ...s.cell, ...(i === CLOCKS.length - 1 ? { borderRight: 'none' } : {}) }}>
            <span style={s.city}>{c.city}</span>
            <span style={{ ...s.time, ...(c.home ? s.timeHome : {}) }}>{fmt(c.tz)}</span>
          </div>
        ))}
      </div>

      <div style={{ width: 150 }} />
    </header>
  );
}

const s = {
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: 76, padding: '0 20px', flexShrink: 0,
    borderBottom: '1px solid #222840', background: '#161b26',
  },
  brand: { width: 150, display: 'flex', flexDirection: 'column', gap: 4 },
  brandName: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: '#404d6e', letterSpacing: '1px' },
  brandSub:  { fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,  color: '#2e3a56', letterSpacing: '0.5px' },
  clocks: { display: 'flex', alignItems: 'stretch', flex: 1, justifyContent: 'center' },
  cell: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '0 32px', borderRight: '1px solid #222840',
  },
  city: { fontSize: 10, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', color: '#404d6e', marginBottom: 5 },
  time: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 34, fontWeight: 500, letterSpacing: '-1.5px', color: '#e8ebf5', lineHeight: 1 },
  timeHome: { color: '#6dc4ff' },
};
