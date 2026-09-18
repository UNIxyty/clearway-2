import { useEffect, useMemo, useState } from 'react';
import Board from '../Board';
import { useWallColors } from '../../theme/WallColorsContext';
import { chromeFor, markerChipsFor, wxCategoryColorsFor } from '../../theme/wallColors';
import FlightDetailSheet from './FlightDetailSheet';
import PhoneWall from './PhoneWall';
import TabletWall from './TabletWall';
import { MONO } from './mobileChrome';
import { flattenFlights, hmZ } from './mobileUtil';
import { ConnChip, StaleBanner } from './WallChrome';
import useConnection from './useConnection';

// The Digital Wall below the ops-room breakpoint (design sections A + B):
//   ≤767 portrait   → PhoneWall (Now / Attention / Timeline tabs)
//   ≤767 landscape  → the mini timeline full-screen (A6)
//   768–1919        → TabletWall (reduced timeline + rail + drawer)
// Data fetching / polling / SSE stay in DisplayApp — this component only
// arranges what it is given. The selected flight lives HERE so it carries
// across rotation (portrait ⇄ landscape) and between phone and tablet.

export default function ResponsiveWall({
  vp,
  aircraft = [],
  limitations = [],
  windowStartUtc,
  windowEndUtc,
  clocks = [],
  notamState = null,
  mvtThresholdMin = 15,
  mvtFlashSeconds = 1,
  loadedOnce = false,
  error = '',
  dataUpdatedAt = 0,
  onReload = null,
}) {
  const conn = useConnection(dataUpdatedAt);
  const chrome = chromeFor(useWallColors());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const flights = useMemo(() => flattenFlights(aircraft), [aircraft]);
  const selectedFlight = selectedId ? flights.find((f) => f.id === selectedId) || null : null;

  const openFlight = (f) => setSelectedId(f?.id ?? null);
  const closeSheet = () => setSelectedId(null);

  const shared = {
    aircraft,
    limitations,
    flights,
    windowStartUtc,
    windowEndUtc,
    conn,
    nowMs,
    mvtThresholdMin,
    mvtFlashSeconds,
    onOpenFlight: openFlight,
    onRetry: onReload,
  };

  // A landscape PHONE is wider than the 767 portrait cut (844×390) but is
  // still a phone: anything landscape with a phone-height viewport gets the
  // full-screen mini timeline (design A6), not the tablet layout.
  const phoneLandscape = vp.landscape && (vp.isPhone || (vp.height <= 500 && vp.width < 1024));
  let view;
  if (vp.isPhone && !vp.landscape) {
    view = <PhoneWall {...shared} notamState={notamState} loadedOnce={loadedOnce} />;
  } else if (phoneLandscape) {
    view = <LandscapePhoneWall {...shared} />;
  } else {
    view = <TabletWall {...shared} clocks={clocks} />;
  }

  return (
    <>
      {view}
      {selectedFlight && (
        <FlightDetailSheet
          flight={selectedFlight}
          limitations={limitations}
          stale={conn.stale}
          nowMs={nowMs}
          mvtThresholdMin={mvtThresholdMin}
          onClose={closeSheet}
        />
      )}
      {error && (
        <div style={{ position: 'fixed', bottom: 10, right: 12, zIndex: 400, fontSize: 11, color: chrome.error, background: chrome.headerBg, border: `1px solid ${chrome.gridLine}`, borderRadius: 6, padding: '5px 10px', maxWidth: 320 }}>
          Data unavailable: {error}
        </div>
      )}
    </>
  );
}

// ── Landscape phone (design A6): rotating IS the answer — the full mini
// timeline, three hours in view, dots inside the pills, legend in the header.
// Rotating back returns to the list with the same selected flight.
function LandscapePhoneWall({
  aircraft,
  limitations,
  windowStartUtc,
  windowEndUtc,
  conn,
  nowMs,
  mvtThresholdMin,
  mvtFlashSeconds,
  onOpenFlight,
  onRetry,
}) {
  const c = useWallColors();
  const chrome = chromeFor(c);
  const chips = markerChipsFor(c);
  const wxColors = wxCategoryColorsFor(c);
  const stale = conn.stale;
  return (
    <div style={{ height: '100dvh', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: chrome.boardBg, color: chrome.headerTime, overflow: 'hidden' }}>
      {stale && <StaleBanner ageMin={conn.ageMin} lastAliveMs={conn.lastAliveMs} onRetry={onRetry} />}
      <div style={{ flex: 'none', padding: '10px 16px 9px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${chrome.gridLine}` }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: chrome.headerTime }}>Timeline</span>
        <ConnChip status={conn.status} />
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: chrome.legendLabel }}>
          {hmZ(nowMs)}Z · {aircraft.length} aircraft
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 13 }}>
          {[
            ['IMP', chips.IMP.text],
            ['NTM', chips.NTM.text],
            ['CAA', chips.CAA.text],
            ['WX', wxColors.MVFR],
          ].map(([label, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: chrome.legendLabel }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Board
          aircraft={aircraft}
          limitations={limitations}
          windowStartUtc={windowStartUtc}
          windowEndUtc={windowEndUtc}
          scale={1}
          rowZoom={0.7}
          pillHeight={1}
          markerScale={1}
          labelScale={1.1}
          sidebarScale={1}
          acColScale={0.78}
          mvtThresholdMin={mvtThresholdMin}
          mvtFlashSeconds={mvtFlashSeconds}
          hideSidebar
          rowHeightPx={52}
          viewportHoursOverride={3}
          forceMarkerMode="dots"
          bodyContent="callsign"
          bodyRight="times"
          belowText="none"
          markersInside
          maxMarkers={3}
          touchHitMinPx={44}
          onPillTap={onOpenFlight}
          staleMode={stale}
        />
      </div>
    </div>
  );
}
