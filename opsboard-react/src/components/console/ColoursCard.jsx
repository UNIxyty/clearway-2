import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchDisplaySettings, saveDisplaySettings } from '../../services/timelineApi';
import {
  WALL_COLOR_GROUPS,
  WALL_COLOR_DEFAULTS,
  resolveWallColors,
  contrastRatio,
  withAlpha,
} from '../../theme/wallColors';
import ColorPicker from './ColorPickerPopover';
import Icon from './icons';
import { Button, Card, ErrorBanner, LoadingState, SearchBox, Toggle, t, useToast } from './ui';

// Colours tab — presentation rebuilt around a custom design-system picker
// (no native OS dialog), collapsible groups with mini-swatch previews,
// search + show-only-overridden, a sticky preview pill, and inline
// guardrails. All data behaviour is unchanged: per-key merge-safe PUTs,
// null = reset one override, config.changed repaints the wall in ~1-2s,
// defaults render byte-identically.

const WARN_RATIO = 4.5;
const NEAR_IDENTICAL_DIST = 60;

function rgbDistance(a, b) {
  const pa = parseInt(String(a).slice(1), 16);
  const pb = parseInt(String(b).slice(1), 16);
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
  const db = (pa & 255) - (pb & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Where each token appears on the wall — plain language, shown under the
// label. Presentation-only copy; the registry itself is untouched.
const TOKEN_DESC = {
  stateScheduled: 'Pill fill before departure ("Not departed" in the legend)',
  stateAirborne: 'Pill fill while the flight is in the air',
  stateDelayed: 'Pill fill for a delayed, not-yet-departed flight',
  stateCtot: 'Pill fill while a CTOT slot governs the departure',
  stateArrived: 'Pill fill after landing',
  stateAog: 'The red diagonal hatch on aircraft-on-ground rows',
  estimatedOutline: 'The outlined "Estimated" chip in the sidebar legend',
  stateCancelled: 'Fill of cancelled flights (rendered translucent)',
  textCancelled: 'Text on cancelled flights',
  hatchLight: 'Delay hatch — light stripe of the segment before a late pill',
  hatchDark: 'Delay hatch — dark stripe of the segment before a late pill',
  textCallsign: 'Callsign in front of the pill when Leon sends no checklist colour',
  textIcao: 'Airport ICAO codes in the route line under pills',
  textTimes: 'Departure/arrival times under pills',
  textDeltaLate: 'The signed "+minutes" delta when running late',
  textDeltaEarly: 'The signed "−minutes" delta when running early',
  textRegistration: 'Aircraft registration in the left column',
  textOperator: 'Operator name under the registration',
  textTicks: 'Hour labels on the time ruler',
  markerImp: 'IMP marker chips after the pill',
  markerNtm: 'NOTAM marker chips after the pill',
  markerCaa: 'CAA marker chips after the pill',
  limUnchecked: 'Numbered limitation circles before the callsign (unchecked)',
  limChecked: 'The muted outline of limitation circles once checked',
  mvtRing: 'The blinking ring when a movement report is overdue',
  wxVfr: 'VFR — colours airport codes and the sidebar WX agenda',
  wxMvfr: 'MVFR — colours airport codes and the sidebar WX agenda',
  wxIfr: 'IFR — colours airport codes and the sidebar WX agenda',
  wxLifr: 'LIFR — colours airport codes and the sidebar WX agenda',
  boardBg: 'The timeline background (contrast is measured against this)',
  rowAltTint: 'Every second aircraft row is tinted with this',
  gridLines: 'Row separators, column borders and panel borders',
  nowLine: 'The vertical "now" line across the board',
  nowBadgeBg: 'Background of the time badge on the now line',
  sidebarBg: 'Sidebar and aircraft-column background',
  sidebarText: 'Sidebar body text (legend labels, limitation titles)',
  tableText: 'Row text in the Upcoming Flight Table',
  tableRed: 'Table status red (Leon "not done" services map onto this)',
  tableOrange: 'Table status orange (Leon "requested/in progress")',
  tableGreen: 'Table status green (Leon "confirmed")',
};

/** Miniature pill rendered purely from resolved tokens (sticky preview). */
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
        padding: '16px 16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        fontFamily: "'IBM Plex Mono',monospace",
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

/** [{keys:[a,b], message}] — advisory only, never blocking. */
function distinctnessProblems(c) {
  const states = [
    ['stateScheduled', 'Not departed'],
    ['stateAirborne', 'Airborne'],
    ['stateDelayed', 'Delayed'],
    ['stateCtot', 'CTOT'],
    ['stateArrived', 'Arrived'],
  ];
  const out = [];
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      if (rgbDistance(c[states[i][0]], c[states[j][0]]) < NEAR_IDENTICAL_DIST) {
        out.push({
          keys: [states[i][0], states[j][0]],
          message: `Nearly identical to "${states[j][1]}"`,
          reverseMessage: `Nearly identical to "${states[i][1]}"`,
        });
      }
    }
  }
  if (contrastRatio(c.hatchLight, c.hatchDark) < 2 || rgbDistance(c.hatchLight, c.hatchDark) < NEAR_IDENTICAL_DIST) {
    out.push({
      keys: ['hatchLight', 'hatchDark'],
      message: 'Too close to the dark stripe — the hatch pattern will vanish',
      reverseMessage: 'Too close to the light stripe — the hatch pattern will vanish',
    });
  }
  if (rgbDistance(c.mvtRing, c.stateScheduled) < NEAR_IDENTICAL_DIST) {
    out.push({
      keys: ['mvtRing', 'stateScheduled'],
      message: 'Nearly invisible against the "Not departed" fill',
      reverseMessage: 'The MVT flash ring nearly disappears on this fill',
    });
  }
  return out;
}

function ContrastChip({ hex, against }) {
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
      title={`Contrast ${ratio.toFixed(2)}:1 against the board background (${against}). The wall is read from metres away — below ${WARN_RATIO}:1 text washes out on the panel. Advisory only.`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: "'IBM Plex Mono',monospace",
        fontSize: 11.5,
        fontWeight: 700,
        color: low ? '#b45309' : t.greenDeep,
        background: low ? '#fef3e2' : t.greenTint,
        borderRadius: 999,
        padding: '3px 9px',
        whiteSpace: 'nowrap',
        cursor: 'help',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: low ? '#f59e0b' : t.green }} />
      {ratio.toFixed(1)}:1
    </span>
  );
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function ColoursCard({ deviceId }) {
  const [overrides, setOverrides] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [hexDrafts, setHexDrafts] = useState({});
  const [query, setQuery] = useState('');
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set([WALL_COLOR_GROUPS[0].id]));
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
  const problems = useMemo(() => distinctnessProblems(resolved), [resolved]);
  const problemsByKey = useMemo(() => {
    const map = {};
    for (const p of problems) {
      const [a, b] = p.keys;
      (map[a] ||= []).push(p.message);
      (map[b] ||= []).push(p.reverseMessage);
    }
    return map;
  }, [problems]);
  const overriddenKeys = Object.keys(overrides).filter(
    (k) => k in WALL_COLOR_DEFAULTS && overrides[k] !== WALL_COLOR_DEFAULTS[k]
  );

  // The picker's "on the wall now" palette: current resolved values, deduped.
  const wallPalette = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const group of WALL_COLOR_GROUPS) {
      for (const token of group.tokens) {
        const hex = resolved[token.key];
        if (seen.has(hex)) continue;
        seen.add(hex);
        out.push({ hex, label: token.label });
      }
    }
    return out.slice(0, 16);
  }, [resolved]);

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

  const q = query.trim().toLowerCase();
  const matchesQuery = (group, token) =>
    !q ||
    token.label.toLowerCase().includes(q) ||
    token.key.toLowerCase().includes(q) ||
    (TOKEN_DESC[token.key] || '').toLowerCase().includes(q) ||
    group.label.toLowerCase().includes(q);
  const visibleTokens = (group) =>
    group.tokens
      .filter((token) => matchesQuery(group, token))
      .filter((token) => !onlyOverridden || overriddenKeys.includes(token.key));
  const filtering = Boolean(q) || onlyOverridden;

  return (
    <Card style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Wall colours</h3>
          <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 14px', maxWidth: 640 }}>
            Every colour the wall renders, as editable tokens. Changes reach the wall within
            seconds; semantics never change — only the hue. Warnings are advisory, never blocking.
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
          {/* Sticky preview: judge a change without scrolling back up. */}
          <div style={{ position: 'sticky', top: 8, zIndex: 40, background: t.card, borderRadius: 12, boxShadow: '0 6px 18px rgba(16,18,22,.10)' }}>
            <PreviewPill c={resolved} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 12px', flexWrap: 'wrap' }}>
            <SearchBox
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a colour… (token, group or where it appears)"
              style={{ flex: 1, minWidth: 260 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: t.body, cursor: 'pointer' }}>
              <Toggle on={onlyOverridden} onToggle={() => setOnlyOverridden((v) => !v)} size="sm" />
              Show only overridden
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: t.faint }}>
                {overriddenKeys.length}
              </span>
            </label>
          </div>

          {WALL_COLOR_GROUPS.map((group) => {
            const tokens = visibleTokens(group);
            if (filtering && tokens.length === 0) return null;
            const open = filtering || expanded.has(group.id);
            return (
              <div key={group.id} style={{ border: `1px solid ${t.borderInner}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  className="cw-hover-surface"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  }
                  style={{
                    fontFamily: 'inherit',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    border: 'none',
                    background: t.card,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={t.faint} />
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{group.label}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: t.faint }}>
                    {group.tokens.length}
                  </span>
                  <span style={{ flex: 1 }} />
                  {!open && (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      {group.tokens.slice(0, 9).map((token) => (
                        <span
                          key={token.key}
                          title={token.label}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            background: resolved[token.key],
                            border: '1px solid rgba(16,18,22,.14)',
                          }}
                        />
                      ))}
                    </span>
                  )}
                </button>
                {open && (
                  <div style={{ borderTop: `1px solid ${t.borderInner}` }}>
                    {tokens.map((token) => {
                      const value = resolved[token.key];
                      const overridden = overriddenKeys.includes(token.key);
                      const draft = hexDrafts[token.key];
                      const rowProblems = problemsByKey[token.key] ?? [];
                      return (
                        <div
                          key={token.key}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '40px minmax(220px, 1fr) 110px 90px 90px',
                            alignItems: 'center',
                            gap: 12,
                            padding: '9px 14px',
                            borderBottom: `1px solid ${t.borderInner}`,
                            background: overridden ? t.blueTint : 'transparent',
                          }}
                        >
                          <ColorPicker
                            value={value}
                            onChange={(hex) => setColor(token.key, hex)}
                            wallPalette={wallPalette}
                            ariaLabel={`${token.label} colour`}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{token.label}</div>
                            <div style={{ fontSize: 12, color: t.faint, lineHeight: 1.4 }}>
                              {TOKEN_DESC[token.key] || ''}
                            </div>
                            {rowProblems.map((msg) => (
                              <div key={msg} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.red, marginTop: 3, fontWeight: 600 }}>
                                <Icon name="alert-triangle" size={13} color={t.red} />
                                {msg}
                              </div>
                            ))}
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
                            aria-label={`${token.label} hex value`}
                            style={{
                              fontFamily: "'IBM Plex Mono',monospace",
                              fontSize: 12.5,
                              padding: '5px 8px',
                              borderRadius: 7,
                              outline: 'none',
                              border: `1.5px solid ${draft && !HEX_RE.test(draft) ? t.red : t.borderInner}`,
                              background: draft && !HEX_RE.test(draft) ? t.redTint : '#fff',
                              color: draft && !HEX_RE.test(draft) ? t.red : t.body,
                              width: '100%',
                            }}
                          />
                          <div>
                            {(token.onBoard || token.text) && <ContrastChip hex={value} against={resolved.boardBg} />}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {overridden ? (
                              <Button size="sm" variant="soft" onClick={() => resetColor(token.key)}>
                                Reset
                              </Button>
                            ) : (
                              <span style={{ fontSize: 11, color: t.ghost }}>default</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {filtering &&
            WALL_COLOR_GROUPS.every((group) => visibleTokens(group).length === 0) && (
              <div style={{ padding: '22px 0', textAlign: 'center', fontSize: 13.5, color: t.faint }}>
                No colours match{q ? ` "${query.trim()}"` : ''}{onlyOverridden ? ' among the overridden ones' : ''}.
              </div>
            )}
        </>
      )}
    </Card>
  );
}
