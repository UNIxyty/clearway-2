import { useWallColors } from '../../theme/WallColorsContext';
import { chromeFor } from '../../theme/wallColors';
import { WALL_FONT } from '../../theme/wallFont';

// The wall's clock bar, as the Settings › Wall clocks preview, on the wall's own colours (components/wall-preview/
// PreviewPill.jsx says the rule). `zoneTime(timeZone)` is the caller's formatter so the preview ticks with the card.
export default function ClockBarPreview({ clocks, zoneTime }) {
  const colors = useWallColors();
  const ch = chromeFor(colors);
  const shown = clocks.length > 0 ? clocks : [{ label: 'UTC', timeZone: 'UTC', home: false }];
  return (
    <div data-wall-display="true" style={{ background: ch.headerBg, borderRadius: 14, padding: '16px 22px', display: 'flex', justifyContent: 'space-around', fontFamily: WALL_FONT }}>
      {shown.map((clock, index) => (
        <div key={`${clock.timeZone}-${index}`} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: clock.home || clock.local ? ch.clockLocal : ch.headerCity, marginBottom: 5 }}>
            {clock.label.toUpperCase()}
          </div>
          <div style={{ fontSize: 26, fontWeight: 600, color: clock.home || clock.local ? ch.clockLocal : ch.headerTime }}>{zoneTime(clock.timeZone)}</div>
        </div>
      ))}
    </div>
  );
}
