import { addMin, clamp } from '../data';

function hm(t) {
  const [h, m] = String(t || '00:00').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Brighter pill colors
const STATUS = {
  scheduled: { bg: 'rgba(72,82,115,.95)',   text: '#a8b4d8', hatch: 'rgba(100,112,155,.8)' },
  boarding:  { bg: 'rgba(170,125,35,.9)',   text: '#ffe0a0', hatch: 'rgba(200,155,45,.8)'  },
  airborne:  { bg: 'rgba(48,110,175,.9)',   text: '#b8e0ff', hatch: 'rgba(65,135,205,.8)'  },
  arrived:   { bg: 'rgba(38,108,78,.9)',    text: '#96e8c0', hatch: 'rgba(50,130,95,.8)'   },
  delayed:   { bg: 'rgba(145,62,62,.9)',    text: '#ffb8b8', hatch: 'rgba(175,75,75,.8)'   },
  slot:      { bg: 'rgba(112,82,168,.9)',   text: '#dcc8ff', hatch: 'rgba(135,100,195,.8)' },
};

export default function FlightPill({ flight, limIndex, onLimClick, startHour, totalHours, lane = 0 }) {
  const { fn, dep, arr, etd, eta, dlyMin, status, lim } = flight;

  const isDelayed = dlyMin > 0;
  const baseStatus = isDelayed ? 'delayed' : (status || 'scheduled');
  const theme = STATUS[baseStatus] || STATUS.scheduled;

  const actualDep = isDelayed ? addMin(etd, dlyMin) : etd;
  const actualEta = isDelayed ? addMin(eta, dlyMin) : eta;

  const frac = (time) => (hm(time) / 60 - startHour) / totalHours;
  const depF  = clamp(frac(etd));
  const dlyF  = isDelayed ? clamp(frac(actualDep)) : depF;
  const arrF  = clamp(frac(actualEta));

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

  const showLabels = (pillF / totalF) > 0.06;

  return (
    <div style={{
      position: 'absolute',
      left: (depF * 100).toFixed(3) + '%',
      width: (totalF * 100).toFixed(3) + '%',
      top: 10 + lane * 22,
      transform: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    }}>
      {/* Flight number above */}
      <div style={s.fn}>{fn}</div>

      {/* Hatch + pill + lim badge row */}
      <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>

        {isDelayed && hatchF > 0 && (
          <div style={{
            width: hatchPct, height: 18, flexShrink: 0,
            borderRadius: '99px 0 0 99px',
            background: isDelayed ? delayedHatchBg : defaultHatchBg,
            boxShadow: isDelayed
              ? 'inset 0 0 0 1px rgba(255,255,255,.25)'
              : `inset 0 0 0 1px ${theme.hatch.replace('.8', '.4')}`,
            overflow: 'hidden',
          }} />
        )}

        {/* Pill */}
        <div style={{
          width: pillPct, height: 18, flexShrink: 0,
          borderRadius: isDelayed && hatchF > 0 ? '0 99px 99px 0' : '99px',
          background: theme.bg,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.1)',
          display: 'flex', alignItems: 'center',
          padding: '0 7px', position: 'relative',
          cursor: 'default', transition: 'filter .12s',
        }}>
          {showLabels && (
            <>
              <span style={{ ...s.airport, color: theme.text, marginRight: 'auto' }}>{dep}</span>
              <span style={{ width: 1, background: 'rgba(0,0,0,.25)', height: 10, margin: '0 5px', flexShrink: 0 }} />
              <span style={{ ...s.airport, color: theme.text, marginLeft: 'auto' }}>{arr}</span>
            </>
          )}
        </div>

        {/* Limitation badge — appears right after pill */}
        {lim && limIndex !== undefined && (
          <div
            style={s.limBadge}
            onClick={() => onLimClick && onLimClick(lim, fn)}
            title={lim.msg}
          >
            {limIndex}
          </div>
        )}
      </div>

      {/* Times below */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 2 }}>
        <span style={s.time}>{etd}</span>
        <span style={{ ...s.time, ...(isDelayed ? s.timeDly : {}) }}>
          {actualEta}{isDelayed ? ` +${dlyMin}` : ''}
        </span>
      </div>
    </div>
  );
}

const s = {
  fn: {
    fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
    color: '#404d6e', marginBottom: 2, letterSpacing: '.4px', whiteSpace: 'nowrap',
  },
  airport: {
    fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
    fontWeight: 700, letterSpacing: '.5px', whiteSpace: 'nowrap',
  },
  limBadge: {
    marginLeft: 4, flexShrink: 0,
    width: 16, height: 16, borderRadius: '50%',
    background: 'rgba(240,177,59,.25)', border: '1px solid rgba(240,177,59,.5)',
    color: '#f0b13b', fontSize: 9, fontWeight: 700,
    fontFamily: "'IBM Plex Mono',monospace",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'background .15s',
  },
  time: {
    fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: '#404d6e',
  },
  timeDly: { color: 'rgba(220,110,110,.8)' },
};
