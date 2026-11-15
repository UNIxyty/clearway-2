// The client's Timeline (2026-11-15): the ops Digital Wall timeline page itself. The same parts the ops room display
// draws (DisplayApp): the clock bar (Header) and the timeline (Board in its guard) with its sidebar, the date and the
// legends, in the display's own shell layout, with the display's default sizes and colours. Nothing here restyles
// it. The differences from the ops page:
//   · the data: the wall backend's client-scoped feed (only their operators, aircraft and flights; no limitations,
//     no important notices, no CAA, no checks: digital-wall/lib/client-scope.mjs)
//   · the sizes, colours and font are the client's own saved view (/api/client/view), never the ops room's
//   · the ops-only parts are not drawn at all: the flight overlay (checklist, notes, who checked what), the voice
//     readout, the upcoming-flights table (services), the movement-overdue flash and the unconfirmed ring (ops alerts)
//   · a pill opens the client's own flight panel
// The display's colours come from WallColorsProvider (ClientApp gives it the client's own overrides only).
import Header from '../components/Header';
import BoardGuard, { WallPart } from '../components/DisplayGuards';
import { WALL_FONT } from '../theme/wallFont';

const NO_LIMITATIONS = [];
// the display's own defaults (DisplayApp's first state, the server's DEFAULT_DISPLAY_SETTINGS)
const DEFAULTS = { scale: 1.3, timeZoom: 1, rowZoom: 1, pillHeight: 1, markerScale: 1, labelScale: 1, sidebarScale: 1.3, headerScale: 1.3, acColScale: 1 };

/** The ops sidebar's width at a sidebar scale (Board's leftPanel: 330 px times the scale). */
export const opsSidebarWidth = (settings) => Math.round(330 * num(settings, 'sidebarScale'));
function num(settings, key) { const v = settings?.[key]; return Number.isFinite(v) ? v : DEFAULTS[key]; }

export default function ClientTimeline({ aircraft, windowStartUtc, windowEndUtc, clocks, settings, weatherOn = false, onPillTap, children = null }) {
  const n = (key) => num(settings, key);
  return (
    <div style={s.shell} data-ops-timeline="">
      <WallPart where="client/timeline/header">
        <Header clocks={clocks} scale={n('headerScale')} />
      </WallPart>
      <div style={s.boardRow} data-board="" data-lanes={aircraft.length}>
        <BoardGuard
          aircraft={aircraft}
          limitations={NO_LIMITATIONS}
          windowStartUtc={windowStartUtc}
          windowEndUtc={windowEndUtc}
          scale={n('scale')}
          timeZoom={n('timeZoom')}
          rowZoom={n('rowZoom')}
          pillHeight={n('pillHeight')}
          markerScale={n('markerScale')}
          labelScale={n('labelScale')}
          sidebarScale={n('sidebarScale')}
          acColScale={n('acColScale')}
          mvtThresholdMin={Number.POSITIVE_INFINITY}
          showUnconfirmedRing={false}
          autoFitRows={settings?.autoFitRows === true}
          showWxLegend={weatherOn}
          onPillTap={onPillTap}
        />
        {children}
      </div>
    </div>
  );
}

const s = {
  // DisplayApp's shell, filling its place in the client's page instead of the whole screen; the display's own page
  // colours (index.css --bg / --text), because the client's frame has the portal's
  shell: { flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: WALL_FONT, background: 'var(--bg)', color: 'var(--text)', fontSize: 13, lineHeight: 'normal' },
  boardRow: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', overflow: 'hidden', position: 'relative' },
};
