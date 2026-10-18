import { chromeFor, resolveWallColors } from '../../theme/wallColors';
import { resolveWallFont } from '../../theme/wallFont';

// The boundary preview at the top of the console's Settings page: a strip of the wall display drawn from this
// room's own wall settings — colours and font are per-account DATA (GET /api/display/settings), never a portal token
// (components/wall-preview/PreviewPill.jsx says the rule). The portal's light and dark theme stops at the dashed
// line around it: with the portal in dark, this strip is pixel-identical to the portal in light (the rig's
// console-theme check proves it). Invented rows, never real flights.
const ROWS = [
  ['14:05', 'BYS2210', 'EGLF', 'stateDelayed'],
  ['15:22', 'BYS1006', 'EVRA', 'stateCtot'],
  ['15:40', 'PNV315', 'EYVI', 'stateScheduled'],
  ['16:40', 'NJC412', 'EFHK', 'stateAirborne'],
];

export default function WallDisplayPreview({ settings, loading = false, minHeight = 196 }) {
  const colors = resolveWallColors(settings?.colors);
  const ch = chromeFor(colors);
  const font = resolveWallFont(settings?.font, settings?.zeroStyle);
  return (
    <div
      data-wall-display="true"
      style={{ borderRadius: 12, overflow: 'hidden', background: colors.boardBg, fontFamily: font.stack, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, minHeight }}
    >
      {loading ? (
        <span style={{ margin: 'auto', fontSize: 13, color: ch.sidebarMuted }}>Loading this room’s wall settings…</span>
      ) : (
        <>
          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: ch.headerCity }}>
            <span>DEPARTURES · EVRA</span><span style={{ color: ch.clockUtc }}>14:20 UTC</span>
          </span>
          {ROWS.map(([time, callsign, to, state]) => (
            <span key={callsign} style={{ display: 'grid', gridTemplateColumns: '62px 100px 70px 1fr', gap: 10, alignItems: 'center', height: 36, padding: '0 10px', borderRadius: 8, background: ch.insetBg, fontSize: 16, fontWeight: 800, color: colors.textCallsign }}>
              <span style={{ color: colors.textTimes }}>{time}</span>
              <span>{callsign}</span>
              <span style={{ color: colors.textIcao }}>{to}</span>
              <span style={{ justifySelf: 'end', width: 54, height: 12, borderRadius: 6, background: colors[state] }} />
            </span>
          ))}
        </>
      )}
    </div>
  );
}
