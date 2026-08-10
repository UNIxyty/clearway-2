import { useEffect, useState } from 'react';
import { fetchFlightInfo, postFlightCheck } from '../services/timelineApi';
import { WX_CATEGORY_COLORS } from './FlightPill';

// Retractable info tab (bug report item 1): opens IN PLACE under a flight's
// lanes — the aircraft row grows to hold it, so it never obscures other
// flights — and shows the flight's actual IMP / NOTAM / WX / CAA content
// with a per-type "Checked" button (plus Check all). Acks persist per
// flight+type with who/when, broadcast over SSE, and reset with the daily
// check cycle. Click-driven (no hover): the wall is a display, but its
// browser has a pointer for exactly this.

const TYPE_LABEL = { imp: 'Important', ntm: 'NOTAM', wx: 'Weather', caa: 'CAA' };

export default function FlightInfoTab({ flight, left, top, width, height, onClose }) {
  const [busy, setBusy] = useState('');
  const [info, setInfo] = useState(null); // flight-info fan-out (decoded WX, NOTAM counts)

  useEffect(() => {
    let alive = true;
    fetchFlightInfo({ flightNid: flight.flightNid, oprId: flight.oprId })
      .then((payload) => { if (alive) setInfo(payload); })
      .catch(() => {});
    return () => { alive = false; };
  }, [flight.flightNid, flight.oprId]);

  const lims = flight.limitations || [];
  const impEntries = lims.filter((l) => l.type === 'IMP');
  const caaEntries = lims.filter((l) => l.type === 'CAA');
  const ntmEntries = lims.filter((l) => l.source === 'alert' && l.type === 'NTM');
  const wxAlertEntries = lims.filter((l) => l.source === 'alert' && l.type === 'WX');
  const hasWx = Boolean(flight.wxDep || flight.wxArr || wxAlertEntries.length);
  const checks = flight.checks || {};

  async function check(types) {
    setBusy(Array.isArray(types) ? types.join(',') : types);
    try {
      await postFlightCheck({ flightNid: flight.flightNid, oprId: flight.oprId, types });
      // SSE flight.changed repaints the payload; the section disappears then.
    } catch { /* surface stays; next click retries */ }
    setBusy('');
  }

  const s = styles();
  const checkedLine = Object.entries(checks)
    .map(([type, c]) => `${TYPE_LABEL[type]} ✓${c.by ? ` ${String(c.by).split('@')[0]}` : ''} ${String(c.at || '').slice(11, 16)}`)
    .join(' · ');

  function Section({ typeKey, title, children }) {
    return (
      <div style={s.section}>
        <div style={s.sectionHead}>
          <span style={s.sectionTitle}>{title}</span>
          <button
            type="button"
            style={{ ...s.checkBtn, opacity: busy ? 0.6 : 1 }}
            disabled={Boolean(busy)}
            onClick={(e) => { e.stopPropagation(); check([typeKey]); }}
          >
            {busy === typeKey ? '…' : 'Checked ✓'}
          </button>
        </div>
        {children}
      </div>
    );
  }

  const anyContent = impEntries.length || ntmEntries.length || hasWx || caaEntries.length;

  return (
    <div style={{ ...s.tab, left, top, width, maxHeight: height }} onClick={(e) => e.stopPropagation()}>
      <div style={s.head}>
        <span style={s.headTitle}>{flight.fn} · {flight.dep}→{flight.arr}</span>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          {anyContent ? (
            <button
              type="button"
              style={{ ...s.checkBtn, ...s.checkAllBtn }}
              disabled={Boolean(busy)}
              onClick={(e) => { e.stopPropagation(); check('all'); }}
            >
              {busy === 'all' ? '…' : 'Check all ✓'}
            </button>
          ) : null}
          <button type="button" style={s.closeBtn} onClick={(e) => { e.stopPropagation(); onClose(); }}>✕</button>
        </span>
      </div>
      <div style={s.bodyScroll}>
        {impEntries.length > 0 && (
          <Section typeKey="imp" title={`IMPORTANT (${impEntries.length})`}>
            {impEntries.map((entry) => (
              <div key={entry.id} style={s.entry}>
                <div style={s.entryTitle}>{entry.title}</div>
                {entry.description && <div style={s.entryBody}>{entry.description}</div>}
              </div>
            ))}
          </Section>
        )}
        {ntmEntries.length > 0 && (
          <Section typeKey="ntm" title={`NOTAM (${ntmEntries.length})`}>
            {ntmEntries.map((entry) => (
              <div key={entry.id} style={s.entry}>
                <div style={s.entryTitle}>{entry.icao ? `${entry.icao} — ` : ''}{entry.title}</div>
                {entry.description && <div style={s.entryBody}>{entry.description}</div>}
              </div>
            ))}
            {info?.notams && (
              <div style={s.meta}>
                Portal NOTAMs: {flight.dep} {info.notams.dep?.ok ? (info.notams.dep.notams?.length ?? 0) : '—'} ·{' '}
                {flight.arr} {info.notams.arr?.ok ? (info.notams.arr.notams?.length ?? 0) : '—'} (full text on the NOTAM Check page)
              </div>
            )}
          </Section>
        )}
        {hasWx && (
          <Section typeKey="wx" title="WEATHER">
            {[['dep', flight.dep, flight.wxDep], ['arr', flight.arr, flight.wxArr]].map(([side, icao, cat]) => {
              const summary = info?.weather?.[side];
              if (!cat && !summary) return null;
              return (
                <div key={side} style={s.entry}>
                  <div style={s.entryTitle}>
                    {icao}{' '}
                    {cat && <span style={{ color: WX_CATEGORY_COLORS[cat] || '#aeb9d6' }}>{cat}</span>}
                  </div>
                  {summary?.text && <div style={s.entryBody}>{summary.text}</div>}
                  {!summary?.text && summary?.raw && <div style={s.entryBody}>{summary.raw}</div>}
                </div>
              );
            })}
            {wxAlertEntries.map((entry) => (
              <div key={entry.id} style={s.entry}>
                <div style={s.entryTitle}>{entry.icao ? `${entry.icao} — ` : ''}{entry.title}</div>
                {entry.description && <div style={s.entryBody}>{entry.description}</div>}
              </div>
            ))}
          </Section>
        )}
        {caaEntries.length > 0 && (
          <Section typeKey="caa" title={`CAA (${caaEntries.length})`}>
            {caaEntries.map((entry) => {
              const caa = entry.caa || {};
              return (
                <div key={entry.id} style={s.entry}>
                  <div style={s.entryTitle}>{caa.authorityName || caa.country || entry.title}</div>
                  {caa.validity && <div style={s.entryBody}>Validity: {caa.validity}</div>}
                  {(caa.phones || []).length > 0 && <div style={s.entryBody}>☎ {(caa.phones || []).join(' · ')}</div>}
                  {(caa.mail || []).length > 0 && <div style={s.entryBody}>✉ {(caa.mail || []).join(' · ')}</div>}
                  {caa.contact && <div style={s.entryBody}>{caa.contact}</div>}
                </div>
              );
            })}
          </Section>
        )}
        {!anyContent && <div style={s.allDone}>All checked for this flight ✓</div>}
        {checkedLine && <div style={s.meta}>Checked: {checkedLine}</div>}
      </div>
    </div>
  );
}

function styles() {
  return {
    tab: {
      position: 'absolute',
      zIndex: 40,
      background: '#141a29',
      border: '1px solid #2e3a58',
      borderRadius: 10,
      boxShadow: '0 10px 28px rgba(0,0,0,.5)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    head: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', borderBottom: '1px solid #232e45', background: '#182034',
    },
    headTitle: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, color: '#e7ecf7' },
    closeBtn: {
      border: '1px solid #37426b', background: 'transparent', color: '#9fb0d6',
      borderRadius: 7, width: 24, height: 24, cursor: 'pointer', fontSize: 12, lineHeight: 1,
    },
    checkBtn: {
      border: '1px solid rgba(74,222,128,.45)', background: 'rgba(74,222,128,.12)',
      color: '#86efac', borderRadius: 7, padding: '3px 10px', cursor: 'pointer',
      fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
    },
    checkAllBtn: { background: 'rgba(74,222,128,.2)' },
    bodyScroll: { overflowY: 'auto', padding: '6px 12px 10px' },
    section: { marginTop: 8 },
    sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    sectionTitle: { fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', color: '#8fa0c4' },
    entry: { marginBottom: 6 },
    entryTitle: { fontSize: 12.5, fontWeight: 700, color: '#e7ecf7', lineHeight: 1.35 },
    entryBody: { fontSize: 12, color: '#b7c2dc', lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
    meta: { fontSize: 11, color: '#7a89ad', marginTop: 6 },
    allDone: { fontSize: 12.5, color: '#86efac', fontWeight: 700, padding: '8px 0' },
  };
}
