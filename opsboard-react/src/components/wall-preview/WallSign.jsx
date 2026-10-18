import { WALL_SIGN } from '../../theme/wallSign';
import { WALL_FONT } from '../../theme/wallFont';

// Today's wall sign as the display draws it (DisplayApp NotamSign, same constants: theme/wallSign.js), for the NOTAM
// Check page's banner. The wall's own colours (components/wall-preview/PreviewPill.jsx says the rule): the sign looks
// the same whatever theme the console is in. `animate` lets the console pause the pulse under reduced motion.
export default function WallSign({ sign, scale = 1, animate = true }) {
  const v = WALL_SIGN[sign];
  if (!v) return null;
  return (
    <div
      data-wall-display="true"
      className={v.pulse ? 'cw-motion-decor' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: WALL_FONT,
        fontSize: Math.round(14 * scale),
        fontWeight: 700,
        letterSpacing: '1px',
        color: v.text,
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius: 8,
        padding: '8px 14px',
        whiteSpace: 'nowrap',
        animation: v.pulse && animate ? 'cwsignpulse 1.6s ease-in-out infinite' : 'none',
        boxShadow: `0 0 ${v.pulse ? 18 : 12}px ${v.glow}`,
      }}
    >
      <style>{'@keyframes cwsignpulse{0%,100%{opacity:1}50%{opacity:.55}}'}</style>
      {v.label}
    </div>
  );
}
