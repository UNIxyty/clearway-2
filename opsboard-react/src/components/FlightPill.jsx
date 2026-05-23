import { clamp } from '../data';

// Brighter pill colors
const STATUS = {
  scheduled: { bg: 'rgba(72,82,115,.95)',   text: '#a8b4d8', hatch: 'rgba(100,112,155,.8)' },
  boarding:  { bg: 'rgba(170,125,35,.9)',   text: '#ffe0a0', hatch: 'rgba(200,155,45,.8)'  },
  airborne:  { bg: 'rgba(48,110,175,.9)',   text: '#b8e0ff', hatch: 'rgba(65,135,205,.8)'  },
  arrived:   { bg: 'rgba(38,108,78,.9)',    text: '#96e8c0', hatch: 'rgba(50,130,95,.8)'   },
  delayed:   { bg: 'rgba(145,62,62,.9)',    text: '#ffb8b8', hatch: 'rgba(175,75,75,.8)'   },
  slot:      { bg: 'rgba(112,82,168,.9)',   text: '#dcc8ff', hatch: 'rgba(135,100,195,.8)' },
};

export default function FlightPill({
  flight,
  limIndex,
  onLimClick,
  windowStartMs,
  windowDurationMs,
  lane = 0,
  laneStep = 42,
}) {
  const { fn, dep, arr, etd, eta, dlyMin, status, lim } = flight;

  const isDelayed = dlyMin > 0;
  const baseStatus = isDelayed ? 'delayed' : (status || 'scheduled');
  const theme = STATUS[baseStatus] || STATUS.scheduled;

  const depMs = Number(flight.startUtcMs) || 0;
  const schedArrMs = Number(flight.scheduledEndUtcMs) || depMs;
  const arrMs = Number(flight.endUtcMs) || schedArrMs;
  const delayEndMs = isDelayed ? depMs + dlyMin * 60_000 : depMs;
  const frac = (ms) => (ms - windowStartMs) / windowDurationMs;
  const depF = clamp(frac(depMs));
  const dlyF = isDelayed ? clamp(frac(delayEndMs)) : depF;
  const arrF = clamp(frac(arrMs));

  const totalF = Math.max(arrF - depF, 0.005);
  const hatchF = isDelayed ? Math.max(dlyF - depF, 0) : 0;
  const pillF  = Math.max(arrF - dlyF, 0.003);

  const hatchPct = ((hatchF / totalF) * 100).toFixed(2) + '%';
  const pillPct  = ((pillF  / totalF) * 100).toFixed(2) + '%';

  const defaultHatchBg = `repeating-linear-gradient(
    -45deg,
    ${theme.hatch} 0px, ${theme.hatch} 3px,
    rgba(8,10,18,.7) 3px, rgba(8,10,18,.7) 8px
  )`;
  const delayedHatchBg = `repeating-linear-gradient(
    -45deg,
    rgba(255,255,255,.72) 0px, rgba(255,255,255,.72) 2px,
    rgba(124,132,146,.88) 2px, rgba(124,132,146,.88) 8px
  )`;

  const showRoute = (pillF / totalF) > 0.08;
  const showFull = (pillF / totalF) > 0.14;

  return (
    <div style={{
      position: 'absolute',
      left: (depF * 100).toFixed(3) + '%',
      width: (totalF * 100).toFixed(3) + '%',
      top: 4 + lane * laneStep,
      transform: 'none',
      height: 24,
      display: 'flex',
      alignItems: 'stretch',
      overflow: 'hidden',
    }}>
      <div style={s.frame}>
        <div style={{ display: 'flex', width: '100%', alignItems: 'center', overflow: 'hidden' }}>

          {isDelayed && hatchF > 0 && (
            <div style={{
              width: hatchPct, height: 24, flexShrink: 0,
              borderRadius: '99px 0 0 99px',
              background: isDelayed ? delayedHatchBg : defaultHatchBg,
              boxShadow: isDelayed
                ? 'inset 0 0 0 1px rgba(255,255,255,.25)'
                : `inset 0 0 0 1px ${theme.hatch.replace('.8', '.4')}`,
              overflow: 'hidden',
            }} />
          )}

          <div style={{
            width: pillPct, height: 24, flexShrink: 0,
            borderRadius: isDelayed && hatchF > 0 ? '0 99px 99px 0' : '99px',
            background: theme.bg,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.1)',
            display: 'flex', alignItems: 'center',
            padding: '0 8px', position: 'relative',
            cursor: 'default', transition: 'filter .12s',
            gap: 8,
            overflow: 'hidden',
          }}>
            <div style={s.pillMain}>
              <span style={{ ...s.fn, color: theme.text }}>{fn}</span>
              {showRoute ? (
                <>
                  <span style={{ ...s.airport, color: theme.text, marginLeft: 'auto' }}>{dep}</span>
                  {showFull && (
                    <>
                      <span style={{ width: 1, background: 'rgba(0,0,0,.25)', height: 10, flexShrink: 0 }} />
                      <span style={{ ...s.airport, color: theme.text }}>{arr}</span>
                    </>
                  )}
                </>
              ) : (
                <span style={{ ...s.airport, color: theme.text, marginLeft: 'auto' }}>{dep}</span>
              )}
            </div>

            {lim && limIndex !== undefined && (
              <div
                style={s.limBadgeInline}
                onClick={() => onLimClick && onLimClick(lim, fn)}
                title={lim.msg}
              >
                {limIndex}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  frame: {
    width: '100%',
    height: 24,
    background: 'transparent',
    border: 'none',
    borderRadius: 99,
    padding: 0,
    boxShadow: 'none',
    overflow: 'hidden',
  },
  pillMain: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    overflow: 'hidden',
  },
  fn: {
    fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
    color: '#7386b5', marginBottom: 0, letterSpacing: '.4px', whiteSpace: 'nowrap', fontWeight: 700, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1,
  },
  airport: {
    fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
    fontWeight: 700, letterSpacing: '.5px', whiteSpace: 'nowrap', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1,
  },
  limBadgeInline: {
    marginLeft: 4,
    flexShrink: 0,
    width: 16, height: 16, borderRadius: '50%',
    background: 'rgba(240,177,59,.25)', border: '1px solid rgba(240,177,59,.5)',
    color: '#f0b13b', fontSize: 9, fontWeight: 700,
    fontFamily: "'IBM Plex Mono',monospace",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'background .15s',
  },
};
