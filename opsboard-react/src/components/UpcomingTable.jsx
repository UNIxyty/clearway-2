import { useEffect, useState } from 'react';
import { fetchUpcomingFlights } from '../services/timelineApi';
import { WX_CATEGORY_COLORS } from './FlightPill';
import { subscribeWallStream } from '../services/wallStream';

// Upcoming Flight Table (bug report 3 item 10): a side panel listing every
// flight from today 00:01 UTC onward — the wall's look-ahead beyond the
// timeline window. Cell colours come straight from Leon checklists:
//   FLIGHT      — the flight's OPS checklist aggregate (worst item wins)
//   ADEP / ADES — the SLOT & HANDLING services affecting that airport
//                 (Leon definitions "Slot (ADEP/ADES)", "Handling …" carry
//                 affectedAirport: adep/ades/both — introspected live)
//   WX DEP/DES  — coloured dot by decoded weather category (same palette
//                 as the timeline).
// Enable/side/scale/width are per-account display settings.

const COLS = [
  { key: 'fn', label: 'FLIGHT' },
  { key: 'dep', label: 'ADEP' },
  { key: 'wxDep', label: 'WX' },
  { key: 'etdHm', label: 'ETD' },
  { key: 'dly', label: 'DLY' },
  { key: 'atdHm', label: 'ATD' },
  { key: 'arr', label: 'ADES' },
  { key: 'wxArr', label: 'WX' },
  { key: 'etaHm', label: 'ETA' },
  { key: 'ataHm', label: 'ATA' },
  { key: 'date', label: 'DATE' },
  { key: 'trip', label: 'TRIP' },
];

export default function UpcomingTable({ scale = 1, widthPct = 30 }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchUpcomingFlights()
        .then((data) => { if (alive) { setRows(data); setError(''); } })
        .catch((err) => { if (alive) setError(err instanceof Error ? err.message : String(err)); });
    };
    load();
    const timer = setInterval(load, 120_000);
    const unsubscribe = subscribeWallStream('flight.changed', load);
    // A weather fetch (00:01 UTC daily or the console button) must repaint
    // the WX dots immediately, not on the next 2-minute tick.
    const unsubscribeWx = subscribeWallStream('weather.changed', load);
    return () => { alive = false; clearInterval(timer); unsubscribe(); unsubscribeWx(); };
  }, []);

  const sz = (v) => Math.max(1, Math.round(v * scale));
  const s = styles(sz);

  function wxDot(cat) {
    if (!cat) return <span style={{ color: '#3d476a' }}>·</span>;
    return <span style={{ ...s.dot, background: WX_CATEGORY_COLORS[cat] || '#8fa0c4' }} title={cat} />;
  }

  function cell(row, col) {
    switch (col.key) {
      case 'fn':
        return <span style={{ color: row.flightColor || '#e7ecf7', fontWeight: 700 }}>{row.fn}</span>;
      case 'dep':
        return <span style={{ color: row.adepColor || '#ccd6ee' }}>{row.dep}</span>;
      case 'arr':
        return <span style={{ color: row.adesColor || '#ccd6ee' }}>{row.arr}</span>;
      case 'wxDep':
        return wxDot(row.wxDep);
      case 'wxArr':
        return wxDot(row.wxArr);
      case 'dly':
        if (row.dly == null || row.dly === 0) return <span style={{ color: '#3d476a' }}>—</span>;
        return (
          <span style={{ color: row.dly > 0 ? '#e8a33d' : '#4ade80', fontWeight: 700 }}>
            {row.dly > 0 ? '+' : '−'}{Math.abs(row.dly)}
          </span>
        );
      default:
        return row[col.key] ?? <span style={{ color: '#3d476a' }}>—</span>;
    }
  }

  return (
    <div style={{ ...s.panel, width: `${widthPct}%` }}>
      <div style={s.title}>UPCOMING FLIGHTS</div>
      <div style={s.scroll} className="cw-lim-scroll">
        <table style={s.table}>
          <thead>
            <tr>
              {COLS.map((col, i) => (
                <th key={`${col.key}-${i}`} style={s.th}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} style={i % 2 === 1 ? s.trAlt : undefined}>
                {COLS.map((col, j) => (
                  <td key={`${col.key}-${j}`} style={s.td}>{cell(row, col)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error && <div style={s.empty}>No flights from 00:01 UTC yet</div>}
        {error && <div style={{ ...s.empty, color: '#ef9a9a' }}>{error}</div>}
      </div>
    </div>
  );
}

function styles(sz) {
  return {
    panel: {
      flex: '0 0 auto',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid #222840',
      borderRight: '1px solid #222840',
      background: '#10141f',
      overflow: 'hidden',
    },
    title: {
      padding: `${sz(8)}px ${sz(10)}px ${sz(4)}px`,
      fontSize: sz(11),
      fontWeight: 800,
      letterSpacing: '.12em',
      color: '#8fa0c4',
      fontFamily: "'IBM Plex Mono',monospace",
    },
    scroll: { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto' },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: "'IBM Plex Mono',monospace",
      fontSize: sz(11),
    },
    th: {
      position: 'sticky',
      top: 0,
      background: '#151a29',
      color: '#7a89ad',
      fontSize: sz(9.5),
      fontWeight: 800,
      letterSpacing: '.08em',
      textAlign: 'left',
      padding: `${sz(4)}px ${sz(6)}px`,
      borderBottom: '1px solid #232e45',
      whiteSpace: 'nowrap',
      zIndex: 1,
    },
    td: {
      padding: `${sz(3)}px ${sz(6)}px`,
      color: '#ccd6ee',
      whiteSpace: 'nowrap',
      borderBottom: '1px solid rgba(34,40,64,.5)',
    },
    trAlt: { background: 'rgba(255,255,255,.025)' },
    dot: {
      display: 'inline-block',
      width: sz(8),
      height: sz(8),
      borderRadius: '50%',
      verticalAlign: 'middle',
    },
    empty: { padding: sz(12), fontSize: sz(11), color: '#5a6a94', fontFamily: "'IBM Plex Mono',monospace" },
  };
}
