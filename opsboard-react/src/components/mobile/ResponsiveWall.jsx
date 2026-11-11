import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import Board from '../Board';
import { useWallColors } from '../../theme/WallColorsContext';
import { chromeFor, markerChipsFor, wxCategoryColorsFor } from '../../theme/wallColors';
import FlightDetailSheet from './FlightDetailSheet';
import TabletWall from './TabletWall';
import { useAuth } from '../../AuthGate';
import { MONO } from './mobileChrome';
import { flattenFlights, hmZ } from './mobileUtil';
import { ConnChip, StaleBanner } from './WallChrome';
import useConnection from './useConnection';
import PhoneWall from './phone/PhoneWall';
// The staff phone app (design "Phone Views", 2026-11-12): a signed-in person on a phone, NOT framed by /m/wall, gets the
// wall's own phone app with its five tabs. Loaded only then, so its stylesheet never reaches the display (rig/stage1-check).
const StaffPhone = lazy(() => import('../../client/StaffPhone'));

// The Digital Wall below the ops-room breakpoint (design sections A + B):
//   a signed-in PERSON on a phone-sized screen, upright or sideways → the portal's phone wall at /m/wall
//     (mobile Stage 2; PhoneWall retired). A registered SCREEN (device token) stays here at any size: a small
//     screen mounted sideways in an ops room is a wall, not a phone.
//   ≤767 portrait (a screen)  → the reduced timeline
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
  mvtThresholdMin = 15,
  showUnconfirmedRing = true,
  mvtFlashSeconds = 1,
  error = '',
  dataUpdatedAt = 0,
  onReload = null,
  notamState = null,
  loadedOnce = false,
  displaySettings = {},   // the signed-in person's own display profile (DisplayApp › loadSettings), for the staff phone's look
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
    showUnconfirmedRing,
    mvtFlashSeconds,
    onOpenFlight: openFlight,
    onRetry: onReload,
  };

  // A landscape PHONE is wider than the 767 portrait cut (844×390) but is
  // still a phone: anything landscape with a phone-height viewport gets the
  // full-screen mini timeline (design A6), not the tablet layout.
  const phoneLandscape = vp.landscape && (vp.isPhone || (vp.height <= 500 && vp.width < 1024));
  // Who is asking decides, not the orientation. AuthGate knows: a person has a session (user), a registered screen
  // runs in deviceMode (or is waiting to be paired, and never reaches here). With no session and the backend
  // unreachable nobody is redirected: the display degrades in place.
  const { user, deviceMode } = useAuth();
  // The phone wall (2026-10-27): the Wall tab in /m frames this page with ?in=m, and a signed-in person there gets the
  // wall's own phone screens (phone/PhoneWall.jsx) in the room's colours and font. A person on a phone anywhere else
  // is sent to /m/wall, so the one app keeps its tabs; a registered screen (deviceMode) never gets either.
  const params = new URLSearchParams(window.location.search);
  const framed = params.get('in') === 'm' && window.top !== window.self;
  const person = Boolean(user) && !deviceMode;
  const phoneWall = person && framed;
  // (until 2026-11-12 a person on a phone outside the /m frame was sent to /m/wall; now the phone app is here)
  const staffPhone = person && !framed && (vp.isPhone || phoneLandscape);
  if (staffPhone) {
    return <Suspense fallback={null}><StaffPhone aircraft={aircraft} windowStartUtc={windowStartUtc} windowEndUtc={windowEndUtc} clocks={clocks} loadedOnce={loadedOnce} error={error} onReload={onReload} settings={displaySettings} initialFlightId={params.get('flight')} /></Suspense>;
  }
  if (phoneWall) {
    return <PhoneWall aircraft={aircraft} limitations={limitations} clocks={clocks} notamState={notamState} loadedOnce={loadedOnce} error={error} dataUpdatedAt={dataUpdatedAt} onReload={onReload} initialFlightId={params.get('flight')} />;
  }
  let view;
  if (phoneLandscape) {
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
          showUnconfirmedRing={showUnconfirmedRing}
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
  showUnconfirmedRing = true,
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
        <ConnChip status={conn.status} feedUnknown={conn.feedUnknown} feed={conn.feed} />
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
          showUnconfirmedRing={showUnconfirmedRing}
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
