import { useWallColors } from '../../theme/WallColorsContext';
import { chromeFor } from '../../theme/wallColors';
import { MONO_FONT, WALL_FONT } from '../../theme/wallFont';

// The wall's limitations sidebar card, as the editor's live preview (Limitations page). Drawn from the wall's
// resolved colours (components/wall-preview/PreviewPill.jsx says the rule), so it previews the wall this room has,
// not a fixed dark card.
export default function LimitationPreview({ title, desc, scope, permanent, window, mobile = false }) {
  const colors = useWallColors();
  const ch = chromeFor(colors);
  return (
    <div data-wall-display="true" style={mobile ? { width: '100%' } : { width: 'clamp(340px, 21vw, 440px)', flex: 'none', position: 'sticky', top: 0 }}>
      <div style={{ background: ch.panelBg, borderRadius: 16, padding: 18, fontFamily: WALL_FONT }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: ch.sidebarMuted, marginBottom: 14 }}>
          LIMITATIONS
        </div>
        <div style={{ background: ch.insetBg, borderRadius: 12, padding: 18, borderLeft: `5px solid ${ch.amber}` }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {permanent && (
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: ch.amber }}>PERMANENT</span>
            )}
            {!permanent && window !== 'always' && (
              <span style={{ fontSize: 12, fontFamily: MONO_FONT, color: ch.legendLabel }}>{window}</span>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: ch.limTitle, margin: '8px 0 10px', lineHeight: 1.15 }}>
            {title || 'EGLL slot enforcement'}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: colors.sidebarText }}>
            {desc || 'Heathrow CTOT strictly enforced — confirm slot with delivery before pushback. No tolerance beyond -5/+10.'}
          </div>
          <div style={{ fontSize: 14, fontFamily: MONO_FONT, color: ch.sidebarMuted, marginTop: 12 }}>{scope || 'EGLL · GB'}</div>
        </div>
        <div style={{ fontSize: 11, color: ch.sidebarMuted, marginTop: 12, textAlign: 'center' }}>
          Rendered at wall scale · fully legible at distance
        </div>
      </div>
    </div>
  );
}
