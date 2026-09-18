import { useEffect, useState } from 'react';
import { fetchFlightInfo, postFlightCheck } from '../../services/timelineApi';
import { useWallColors } from '../../theme/WallColorsContext';
import {
  chromeFor,
  limStylesFor,
  markerChipsFor,
  withAlpha,
  wxCategoryColorsFor,
} from '../../theme/wallColors';
import { mvtOverdueOf } from '../FlightPill';
import { MOBILE_CHROME, MONO } from './mobileChrome';
import { STATE_LABEL, STATE_TOKEN, hmZ, spanText } from './mobileUtil';
import { StateChip } from './WallChrome';

// Flight detail sheet (design A2): everything the pill and its info tab
// carry, in reading order — route and times with signed deltas, the IMP body
// in full, the unreviewed NOTAM raw text, weather per airport, then
// limitations and CAA as chips. "Mark checked" is the one primary action and
// uses the SAME endpoint + 'all' semantics as the info tab's Check all.
const TYPE_LABEL = { imp: 'Important', ntm: 'NOTAM', wx: 'Weather', caa: 'CAA', lim: 'Limitations' };

export default function FlightDetailSheet({ flight, limitations = [], stale = false, nowMs, mvtThresholdMin = 15, onClose }) {
  const c = useWallColors();
  const chrome = chromeFor(c);
  const chips = markerChipsFor(c);
  const lim = limStylesFor(c);
  const wxColors = wxCategoryColorsFor(c);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setInfo(null);
    if (flight?.flightNid) {
      fetchFlightInfo({ flightNid: flight.flightNid, oprId: flight.oprId })
        .then((payload) => { if (alive) setInfo(payload); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [flight?.flightNid, flight?.oprId]);

  if (!flight) return null;

  const lims = flight.limitations || [];
  const impEntries = lims.filter((l) => l.type === 'IMP');
  const limEntries = lims.filter((l) => l.type === 'LIM' && l.source === 'custom');
  const caaEntries = lims.filter((l) => l.type === 'CAA');
  const ntmEntries = lims.filter((l) => l.source === 'alert' && l.type === 'NTM');
  const checks = flight.checks || {};
  const anyContent = impEntries.length || ntmEntries.length || caaEntries.length || limEntries.length || flight.wxDep || flight.wxArr;

  const overdue = flight.status !== 'cancelled' && mvtOverdueOf(flight, nowMs, mvtThresholdMin);
  const hollow = flight.estimated === true && (flight.status === 'airborne' || flight.status === 'arrived');
  const stateHex = overdue ? c.mvtRing : c[STATE_TOKEN[flight.status] ?? 'stateScheduled'];
  const stateLabel = overdue ? 'MVT OVERDUE' : STATE_LABEL[flight.status] || String(flight.status || '').toUpperCase();

  // Numbered limitation circles — same index scheme + limStylesFor treatment
  // as FlightPill (solid unchecked / outlined checked, visible after checks).
  const limIndexMap = {};
  limitations.forEach((l, i) => { limIndexMap[l.id] = i + 1; });
  const limIndices = (flight.limitationIds || []).map((id) => limIndexMap[id]).filter(Boolean);
  const limChecked = Boolean(checks.lim);

  const durMs = Math.max(0, Number(flight.endUtcMs) - Number(flight.delayedStartUtcMs));

  const checkedLine = Object.entries(checks)
    .map(([type, ch]) => `${TYPE_LABEL[type] || type} ✓${ch.by ? ` ${String(ch.by).split('@')[0]}` : ''} ${String(ch.at || '').slice(11, 16)}`)
    .join(' · ');

  async function markChecked() {
    if (stale || busy || !anyContent) return;
    setBusy(true);
    try {
      await postFlightCheck({ flightNid: flight.flightNid, oprId: flight.oprId, types: 'all' });
      // SSE flight.changed repaints the flight; the stamps line updates then.
    } catch { /* surface stays; next tap retries */ }
    setBusy(false);
  }

  const Delta = ({ min }) =>
    min ? (
      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: min > 0 ? c.textDeltaLate : c.textDeltaEarly }}>
        {min > 0 ? '+' : '−'}{Math.abs(min)}
      </span>
    ) : null;

  const label = { fontFamily: MONO, fontSize: 10, color: chrome.sidebarMuted, width: 34, flexShrink: 0 };
  const secTitle = { fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: chrome.sidebarMuted };
  const card = { background: chrome.panelBg, border: `1px solid ${chrome.gridLine}`, borderRadius: 12, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 7 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Scrim — tap to dismiss */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
      <div
        style={{
          position: 'relative',
          margin: '0 auto',
          width: '100%',
          maxWidth: 560,
          maxHeight: '88%',
          background: chrome.boardBg,
          borderTop: `1px solid ${chrome.gridLine}`,
          borderRadius: '26px 26px 0 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ flex: 'none', padding: '10px 0 0', display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 40, height: 4, borderRadius: 3, background: chrome.gridLine }} />
        </div>

        {/* Header */}
        <div style={{ flex: 'none', padding: '12px 18px 14px', borderBottom: `1px solid ${chrome.gridLine}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: chrome.headerTime, letterSpacing: '-0.02em', fontStyle: flight.isConfirmed === false ? 'italic' : 'normal' }}>
                {flight.fn}
              </span>
              <StateChip label={stateLabel} colorHex={stateHex} hollow={hollow} withAlphaFn={withAlpha} />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ width: 44, height: 44, borderRadius: 9, background: chrome.insetBg, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: chrome.legendLabel, cursor: 'pointer', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: chrome.legendLabel }}>{flight.__reg}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: chrome.sidebarMuted }} />
            <span style={{ fontSize: 12.5, color: chrome.legendLabel }}>{flight.__operator}</span>
            {limIndices.length > 0 && (
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
                {limIndices.map((n, i) => (
                  <span
                    key={`${n}-${i}`}
                    title={limChecked ? `Limitation ${n} — checked` : `Limitation ${n}`}
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: limChecked ? 'transparent' : lim.uncheckedBg,
                      border: limChecked ? `1.5px solid ${lim.checkedBorder}` : 'none',
                      color: limChecked ? lim.checkedText : lim.uncheckedText,
                      fontSize: 12, fontWeight: 800, fontFamily: MONO,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    }}
                  >
                    {n}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14, ...(stale ? { opacity: 0.68 } : {}) }}>
          {/* Route + times with signed deltas — exact mapFlight fields */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: chrome.headerTime }}>{flight.dep}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={label}>STD</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: chrome.legendLabel }}>{flight.etd}Z</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={label}>{flight.depKind}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: chrome.headerTime }}>{flight.depHm}Z</span>
                  <Delta min={flight.depDeltaMin} />
                </div>
              </div>
            </div>
            <div style={{ flex: 'none', width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, paddingTop: 10 }}>
              <span style={{ fontSize: 16, color: MOBILE_CHROME.linkBlue }}>→</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: chrome.sidebarMuted }}>{spanText(durMs)}</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', textAlign: 'right', minWidth: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: chrome.headerTime }}>{flight.arr}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ ...label, width: 'auto' }}>STA</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: chrome.legendLabel }}>{flight.eta}Z</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ ...label, width: 'auto' }}>{flight.arrKind}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: chrome.headerTime }}>{flight.arrHm}Z</span>
                  <Delta min={flight.arrDeltaMin} />
                </div>
              </div>
            </div>
          </div>

          {flight.estimated === true && (
            <div style={{ fontSize: 12.5, color: chrome.legendLabel }}>Estimated — no flight watch</div>
          )}
          {overdue && (
            <div style={{ ...card, background: MOBILE_CHROME.overdueCardBg, borderColor: MOBILE_CHROME.overdueCardBorder }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: MOBILE_CHROME.overdueBody }}>
                No MVT message since {flight.depKind} {flight.depHm}Z. Expected arrival movement at {flight.arrHm}Z.
              </div>
            </div>
          )}

          <div style={{ height: 1, background: chrome.gridLine, flexShrink: 0 }} />

          {/* IMP — full body (design: the IMP body in full) */}
          {impEntries.map((entry) => (
            <div key={entry.id} style={{ background: chrome.amberBg, border: `1px solid ${chrome.amberBorder}`, borderRadius: 12, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 5, background: chips.IMP.bg, color: chips.IMP.text, border: `1px solid ${chips.IMP.border}`, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>!</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: chrome.amber }}>{entry.title}</span>
              </div>
              {entry.description && <div style={{ fontSize: 13, lineHeight: 1.55, color: chrome.sidebarText, whiteSpace: 'pre-wrap' }}>{entry.description}</div>}
            </div>
          ))}

          {/* Unreviewed NOTAMs — raw text + validity */}
          {ntmEntries.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ ...secTitle, color: chips.NTM.text }}>
                NOTAM{ntmEntries[0]?.icao ? ` · ${ntmEntries[0].icao}` : ''} · {ntmEntries.length} UNREVIEWED
              </div>
              {ntmEntries.map((entry) => (
                <div key={entry.id} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: chrome.headerTime }}>{entry.icao ? `${entry.icao} — ` : ''}{entry.title}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px', borderRadius: 5, background: chips.NTM.bg, color: chips.NTM.text, border: `1px solid ${chips.NTM.border}`, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, flexShrink: 0 }}>NTM</span>
                  </div>
                  {entry.description && (
                    <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.55, color: chrome.sidebarText, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.description}</div>
                  )}
                  {(entry.validFrom || entry.validTill) && (
                    <div style={{ fontSize: 12, color: chrome.sidebarMuted }}>Valid {entry.validFrom || '—'} — {entry.validTill || '—'}</div>
                  )}
                </div>
              ))}
              {info?.notams && (
                <div style={{ fontSize: 11, color: chrome.sidebarMuted }}>
                  Portal NOTAMs: {flight.dep} {info.notams.dep?.ok ? (info.notams.dep.notams?.length ?? 0) : '—'} ·{' '}
                  {flight.arr} {info.notams.arr?.ok ? (info.notams.arr.notams?.length ?? 0) : '—'} (full text on the NOTAM Check page)
                </div>
              )}
            </div>
          )}

          {/* Weather per airport: category dot + raw METAR */}
          {(flight.wxDep || flight.wxArr || info?.weather) && (
            <div style={{ display: 'flex', gap: 10 }}>
              {[['dep', flight.dep, flight.wxDep], ['arr', flight.arr, flight.wxArr]].map(([side, icao, cat]) => {
                const summary = info?.weather?.[side];
                return (
                  <div key={side} style={{ ...card, flex: 1, padding: '11px 12px', gap: 5, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: chrome.legendLabel }}>{icao}</span>
                      {cat && wxColors[cat] && <span title={cat} style={{ width: 8, height: 8, borderRadius: '50%', background: wxColors[cat], flexShrink: 0 }} />}
                      {cat && <span style={{ fontFamily: MONO, fontSize: 10, color: wxColors[cat] || chrome.legendLabel }}>{cat}</span>}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5, color: chrome.sidebarText, overflowWrap: 'anywhere' }}>
                      {summary?.raw || summary?.text || 'No report on file.'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Limitations + CAA as chips */}
          {(limEntries.length > 0 || caaEntries.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={secTitle}>LIMITATIONS AND CAA</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {limEntries.map((entry) => (
                  <span key={entry.id} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 26, padding: '3px 9px', borderRadius: 6, background: chrome.insetBg, color: chrome.sidebarText, border: `1px solid ${chrome.gridLine}`, fontSize: 12, fontWeight: 600 }}>
                    {entry.title}
                  </span>
                ))}
                {caaEntries.map((entry) => (
                  <span key={entry.id} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 26, padding: '3px 9px', borderRadius: 6, background: chips.CAA.bg, color: chips.CAA.text, border: `1px solid ${chips.CAA.border}`, fontFamily: MONO, fontSize: 10.5, fontWeight: 800 }}>
                    CAA · {entry.caa?.authorityName || entry.caa?.country || entry.title}
                  </span>
                ))}
              </div>
              {limEntries.map((entry) => entry.description && (
                <div key={`${entry.id}-body`} style={{ fontSize: 12.5, lineHeight: 1.5, color: chrome.sidebarText, whiteSpace: 'pre-wrap' }}>{entry.description}</div>
              ))}
            </div>
          )}

          {checkedLine && <div style={{ fontSize: 11, color: chrome.sidebarMuted }}>Checked: {checkedLine}</div>}
          {!anyContent && <div style={{ fontSize: 12.5, color: chrome.legendLabel, fontWeight: 700 }}>All checked for this flight ✓</div>}
        </div>

        {/* Action bar */}
        <div style={{ flex: 'none', borderTop: `1px solid ${chrome.gridLine}`, padding: '12px 16px 22px', display: 'flex', flexDirection: 'column', gap: 10, background: chrome.headerBg }}>
          {stale && (
            <div style={{ ...card, background: chrome.panelBg }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: chrome.sidebarText }}>Actions are off while the feed is stale</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: chrome.sidebarMuted }}>
                Mark checked and Show on wall are disabled so nothing is confirmed against data that may already be wrong.
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={markChecked}
            disabled={stale || busy || !anyContent}
            style={{
              height: 48,
              borderRadius: 12,
              border: 'none',
              background: MOBILE_CHROME.actionBlue,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14.5,
              fontWeight: 700,
              color: MOBILE_CHROME.onAccent,
              cursor: stale || busy || !anyContent ? 'default' : 'pointer',
              opacity: stale || !anyContent ? 0.45 : busy ? 0.7 : 1,
            }}
          >
            {busy ? '…' : 'Mark checked'}
          </button>
        </div>
      </div>
    </div>
  );
}
