import { withAlpha } from '../../theme/wallColors';
import { MONO_FONT } from '../../theme/wallFont';

// Wall previews (components/wall-preview/*): pieces of the wall display drawn in the console, from the wall's own
// resolved colours and font — DATA the console edits, never a portal token. Every root carries data-wall-display="true";
// scripts/check-console-theme.mjs refuses a --cw-* token or data-theme anywhere in this folder, and the rig's
// console-theme check proves these render pixel-identical with the portal in light and in dark.

/** Miniature pill rendered purely from resolved tokens (the Colours tab's sticky preview). */
export default function PreviewPill({ c }) {
  const hatch = `repeating-linear-gradient(45deg, ${withAlpha(c.hatchLight, 0.9)} 0px, ${withAlpha(
    c.hatchLight,
    0.9
  )} 6px, ${withAlpha(c.hatchDark, 0.9)} 6px, ${withAlpha(c.hatchDark, 0.9)} 10px)`;
  return (
    <div
      data-wall-display="true"
      style={{
        background: c.boardBg,
        borderRadius: 12,
        padding: '16px 16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        fontFamily: MONO_FONT,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: c.limUnchecked,
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          1
        </span>
        <span style={{ color: c.textCallsign, fontWeight: 700, fontSize: 13 }}>CWY101</span>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300, height: 22 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 99,
              display: 'flex',
              overflow: 'hidden',
              boxShadow: `0 0 0 2px ${c.mvtRing}`,
            }}
          >
            <div style={{ width: '26%', background: hatch }} />
            <div
              style={{
                flex: 1,
                background: c.stateAirborne,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 10px',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <span style={{ color: c.boardBg }}>EVRA</span>
              <span style={{ color: c.boardBg }}>EGGW</span>
            </div>
          </div>
        </div>
        <span style={{ color: c.markerImp, fontSize: 10.5, fontWeight: 800 }}>IMP</span>
        <span style={{ color: c.markerNtm, fontSize: 10.5, fontWeight: 800 }}>NTM</span>
        <span style={{ color: c.markerCaa, fontSize: 10.5, fontWeight: 800 }}>CAA</span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11.5, paddingLeft: 26, flexWrap: 'wrap' }}>
        <span style={{ color: c.textTimes }}>T/O 13:22</span>
        <span style={{ color: c.textDeltaLate, fontWeight: 800 }}>+22</span>
        <span style={{ color: c.textTimes }}>LDG 15:35</span>
        <span style={{ color: c.textDeltaEarly, fontWeight: 800 }}>−5</span>
        <span style={{ color: c.textIcao, fontWeight: 700 }}>LEBL→LIPB</span>
        <span style={{ display: 'inline-flex', gap: 7, marginLeft: 'auto' }}>
          {[c.stateScheduled, c.stateAirborne, c.stateDelayed, c.stateCtot, c.stateArrived].map((fill, i) => (
            <span key={i} style={{ width: 18, height: 9, borderRadius: 3, background: fill }} />
          ))}
          <span style={{ width: 18, height: 9, borderRadius: 3, border: `2px solid ${c.estimatedOutline}` }} />
        </span>
      </div>
    </div>
  );
}
