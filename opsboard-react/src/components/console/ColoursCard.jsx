import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDisplaySettings, saveDisplaySettings } from '../../services/timelineApi';
import {
  WALL_COLOR_GROUPS,
  WALL_COLOR_DEFAULTS,
  resolveWallColors,
  contrastRatio,
  withAlpha,
} from '../../theme/wallColors';
import { Button, Card, ErrorBanner, LoadingState, t, useToast } from './ui';

// Colours tab (bug reports 1-4 were all contrast/colour): every wall colour
// as an editable token, per-account like the sizing cards. Each edit PUTs
// only its own key ({colors:{key:hex}} — the server merges per key), the
// wall re-reads on config.changed within ~1-2s. Guardrails: live WCAG
// contrast readouts vs the board background (warn < 4.5:1 — the wall is
// read from metres away), a live preview pill, and near-identical-state
// warnings. Reset per token / Reset all restore the shipped defaults.

const WARN_RATIO = 4.5;
// Perceptual sameness uses RGB distance, not luminance ratio — a blue and a
// purple of equal brightness are perfectly distinguishable hues.
const NEAR_IDENTICAL_DIST = 60;

function rgbDistance(a, b) {
  const pa = parseInt(String(a).slice(1), 16);
  const pb = parseInt(String(b).slice(1), 16);
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
  const db = (pa & 255) - (pb & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function ContrastBadge({ hex, against }) {
  const ratio = useMemo(() => {
    try {
      return contrastRatio(hex, against);
    } catch {
      return null;
    }
  }, [hex, against]);
  if (ratio == null) return null;
  const low = ratio < WARN_RATIO;
  return (
    <span
      title={`WCAG contrast vs board background (${against}). Below ${WARN_RATIO}:1 is hard to read from the ops room.`}
      style={{
        fontFamily: t.mono,
        fontSize: 11.5,
        fontWeight: 700,
        color: low ? '#b45309' : t.faint,
        background: low ? '#fef3e2' : t.subtle,
        borderRadius: 6,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {ratio.toFixed(2)}:1{low ? ' ⚠' : ''}
    </span>
  );
}

/** A miniature pill row rendered purely from the resolved tokens. */
function PreviewPill({ c }) {
  const hatch = `repeating-linear-gradient(45deg, ${withAlpha(c.hatchLight, 0.9)} 0px, ${withAlpha(
    c.hatchLight,
    0.9
  )} 6px, ${withAlpha(c.hatchDark, 0.9)} 6px, ${withAlpha(c.hatchDark, 0.9)} 10px)`;
  return (
    <div
      style={{
        background: c.boardBg,
        borderRadius: 12,
        padding: '18px 16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: t.mono,
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
        <div style={{ position: 'relative', flex: 1, maxWidth: 320, height: 22 }}>
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
      <div style={{ display: 'flex', gap: 12, fontSize: 11.5, paddingLeft: 26 }}>
        <span style={{ color: c.textTimes }}>T/O 13:22</span>
        <span style={{ color: c.textDeltaLate, fontWeight: 800 }}>+22</span>
        <span style={{ color: c.textTimes }}>LDG 15:35</span>
        <span style={{ color: c.textDeltaEarly, fontWeight: 800 }}>−5</span>
        <span style={{ color: c.textIcao, fontWeight: 700 }}>LEBL→LIPB</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 26 }}>
        {[
          ['Not departed', c.stateScheduled],
          ['Airborne', c.stateAirborne],
          ['Delayed', c.stateDelayed],
          ['CTOT', c.stateCtot],
          ['Arrived', c.stateArrived],
        ].map(([label, fill]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 20, height: 10, borderRadius: 3, background: fill }} />
            <span style={{ color: c.sidebarText, fontSize: 10.5, fontFamily: 'inherit' }}>{label}</span>
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 20,
              height: 10,
              borderRadius: 3,
              border: `2px solid ${c.estimatedOutline}`,
              background: 'transparent',
            }}
          />
          <span style={{ color: c.sidebarText, fontSize: 10.5 }}>Estimated</span>
        </span>
      </div>
    </div>
  );
}

function distinctnessWarnings(c) {
  const states = [
    ['Not departed', c.stateScheduled],
    ['Airborne', c.stateAirborne],
    ['Delayed', c.stateDelayed],
    ['CTOT', c.stateCtot],
    ['Arrived', c.stateArrived],
  ];
  const out = [];
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      if (rgbDistance(states[i][1], states[j][1]) < NEAR_IDENTICAL_DIST) {
        out.push(`"${states[i][0]}" and "${states[j][0]}" fills are nearly identical`);
      }
    }
  }
  if (contrastRatio(c.hatchLight, c.hatchDark) < 2 || rgbDistance(c.hatchLight, c.hatchDark) < NEAR_IDENTICAL_DIST) {
    out.push('The two delay-hatch stripes are too close — the hatch pattern will vanish');
  }
  if (rgbDistance(c.mvtRing, c.stateScheduled) < NEAR_IDENTICAL_DIST) {
    out.push('MVT flash ring is nearly invisible against the "Not departed" fill');
  }
  return out;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function ColoursCard({ deviceId }) {
  const [overrides, setOverrides] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [hexDrafts, setHexDrafts] = useState({});
  const timersRef = useRef({});
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => setOverrides(payload.settings?.colors ?? {}))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
    const timers = timersRef.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, [deviceId]);

  const resolved = useMemo(() => resolveWallColors(overrides), [overrides]);
  const warnings = useMemo(() => distinctnessWarnings(resolved), [resolved]);
  const overriddenKeys = Object.keys(overrides).filter(
    (k) => k in WALL_COLOR_DEFAULTS && overrides[k] !== WALL_COLOR_DEFAULTS[k]
  );

  function persist(key, value, message) {
    clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(async () => {
      try {
        const payload = await saveDisplaySettings({ colors: { [key]: value } }, deviceId);
        setOverrides(payload.settings?.colors ?? {});
        flash(message);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 400);
  }

  function setColor(key, hex) {
    setOverrides((prev) => ({ ...prev, [key]: hex }));
    persist(key, hex, `${key} → ${hex} — wall updates in seconds`);
  }

  function resetColor(key) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setHexDrafts((prev) => ({ ...prev, [key]: undefined }));
    persist(key, null, `${key} reset to default`);
  }

  async function resetAll() {
    try {
      const clears = Object.fromEntries(Object.keys(overrides).map((k) => [k, null]));
      const payload = await saveDisplaySettings({ colors: clears }, deviceId);
      setOverrides(payload.settings?.colors ?? {});
      setHexDrafts({});
      flash('All colours reset to the shipped defaults');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Wall colours</h3>
          <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
            Every colour the wall renders, as editable tokens. Changes apply to the wall within
            seconds. Semantics never change — only the hue. Contrast is measured against the board
            background; anything under {WARN_RATIO}:1 is flagged (the wall is read from metres away).
          </p>
        </div>
        <Button size="sm" variant="soft" disabled={!loaded || overriddenKeys.length === 0} onClick={resetAll}>
          Reset all colours
        </Button>
      </div>
      <ErrorBanner>{error}</ErrorBanner>
      {!loaded && <LoadingState>Loading colours…</LoadingState>}
      {loaded && (
        <>
          <PreviewPill c={resolved} />
          {warnings.length > 0 && (
            <div
              style={{
                marginTop: 12,
                border: '1px solid #f0d4d4',
                background: '#fdf2f2',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                color: '#a12a2e',
              }}
            >
              {warnings.map((w) => (
                <div key={w}>⚠ {w}</div>
              ))}
            </div>
          )}
          {WALL_COLOR_GROUPS.map((group) => (
            <div key={group.id} style={{ marginTop: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '.1em',
                  color: t.faint,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                {group.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
                {group.tokens.map((token) => {
                  const value = resolved[token.key];
                  const overridden = overrides[token.key] && overrides[token.key] !== token.def;
                  const draft = hexDrafts[token.key];
                  return (
                    <div
                      key={token.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        border: `1px solid ${t.borderInner}`,
                        borderRadius: 10,
                        padding: '8px 11px',
                        background: overridden ? '#f8fbff' : t.card,
                      }}
                    >
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => setColor(token.key, e.target.value)}
                        style={{
                          width: 34,
                          height: 26,
                          padding: 0,
                          border: `1px solid ${t.borderInner}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: 'transparent',
                        }}
                        aria-label={`${token.label} colour picker`}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {token.label}
                        </div>
                        <input
                          value={draft ?? value}
                          onChange={(e) => {
                            const next = e.target.value.trim();
                            setHexDrafts((prev) => ({ ...prev, [token.key]: next }));
                            if (HEX_RE.test(next)) setColor(token.key, next.toLowerCase());
                          }}
                          onBlur={() => setHexDrafts((prev) => ({ ...prev, [token.key]: undefined }))}
                          spellCheck={false}
                          style={{
                            fontFamily: t.mono,
                            fontSize: 12,
                            color: draft && !HEX_RE.test(draft) ? '#b91c1c' : t.muted,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            width: 84,
                          }}
                          aria-label={`${token.label} hex value`}
                        />
                      </div>
                      {(token.onBoard || token.text) && <ContrastBadge hex={value} against={resolved.boardBg} />}
                      {overridden ? (
                        <Button size="sm" variant="soft" onClick={() => resetColor(token.key)}>
                          Reset
                        </Button>
                      ) : (
                        <span style={{ fontSize: 11, color: t.ghost, whiteSpace: 'nowrap' }}>default</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}
