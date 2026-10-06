import { useState, useEffect } from 'react';
import { useWallColors } from '../theme/WallColorsContext';
import { chromeFor } from '../theme/wallColors';

import { WALL_FONT } from '../theme/wallFont';
// Configurable world-clock bar (adapted from the digital-wall prototype's
// WorldClockBar). Clock config comes from the backend
// (GET /api/display/clocks) and is edited on the Console's Settings page;
// DisplayApp passes it down and live-updates it via the SSE config.changed
// event. Falls back to a sensible default set until config loads.

export const FALLBACK_CLOCKS = [
  { label: 'Riga', timeZone: 'Europe/Riga', local: true },
  { label: 'UTC', timeZone: 'UTC' },
];

const isUtc = (c) => /^(UTC|Etc\/UTC|Etc\/GMT|GMT|Etc\/Universal|Universal|Zulu)$/i.test(String(c.timeZone ?? ''));
const isLocal = (c) => c.local === true || c.home === true;

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
  // Resolved wall colour tokens — the clock bar reads the same chrome
  // family as the board (headerBg / gridLines / sidebarText derivations).
  const chrome = chromeFor(useWallColors());
  const s = makeStyles(sz, chrome);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const list = Array.isArray(clocks) && clocks.length > 0 ? clocks : FALLBACK_CLOCKS;

  return (
    <header style={s.header}>
      <div style={s.brand}>
        {/* Same asset as the console top bar; forced white for the dark wall.
            Falls back to the text wordmark if the asset ever goes missing. */}
        <img
          src={`${import.meta.env.BASE_URL}assets/clearway-mark.svg`}
          alt="Clearway"
          style={{ height: sz(26), width: 'auto', display: 'block', filter: 'brightness(0) invert(1)', opacity: 0.92 }}
          onError={(e) => {
            e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { textContent: 'CLEARWAY' }));
          }}
        />
      </div>

      <div style={s.clocks}>
        {list.map((c, i) => (
          <div
            key={`${c.label}-${c.timeZone}-${i}`}
            style={{ ...s.cell, ...(i === list.length - 1 ? { borderRight: 'none' } : {}) }}
          >
            {/* Bug report 7 item 2: three treatments — UTC (token clockUtc), the LOCAL clock (token clockLocal,
                picked in Settings → clocks; the server defaults it to the station's zone until someone picks), and
                every other clock in the default colour. If the local clock IS UTC, the UTC colour wins — UTC is the
                operational reference on this wall — and the label says "· LOCAL" in the local colour, so the
                double role is visible rather than silently swallowed. */}
            <span style={s.city}>{c.label}{isUtc(c) && isLocal(c) ? <span style={s.cityLocal}> · LOCAL</span> : null}</span>
            <span style={{ ...s.time, ...(isUtc(c) ? s.timeUtc : isLocal(c) ? s.timeLocal : {}) }}>{fmt(c.timeZone)}</span>
          </div>
        ))}
      </div>

      <div style={s.rightSlot}>{rightSlot}</div>
    </header>
  );
}

function makeStyles(sz, chrome) {
  return {
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: sz(92), padding: '0 20px', flexShrink: 0,
    borderBottom: `1px solid ${chrome.gridLine}`, background: chrome.headerBg,
  },
  brand: { width: sz(160), display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 },
  clocks: { display: 'flex', alignItems: 'stretch', flex: 1, justifyContent: 'center', overflow: 'hidden' },
  cell: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '0 28px', borderRight: `1px solid ${chrome.gridLine}`,
  },
  city: { fontSize: sz(12), fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: chrome.headerCity, marginBottom: 5, whiteSpace: 'nowrap' },
  time: { fontFamily: WALL_FONT, fontSize: sz(42), fontWeight: 600, letterSpacing: '-1.5px', color: chrome.headerTime, lineHeight: 1 },
  timeUtc: { color: chrome.clockUtc },
  timeLocal: { color: chrome.clockLocal },
  cityLocal: { color: chrome.clockLocal },
  rightSlot: { minWidth: 150, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 },
};
}
