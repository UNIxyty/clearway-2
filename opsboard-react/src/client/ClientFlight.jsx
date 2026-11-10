// A flight, as a client reads it (design "Client View v2" › A flight opened; "Phone Views" › flight page). The ops
// overlay without the ops parts: status in plain words, the route, the times, weather at both ends, the NOTAMs for the
// flight (read-only, the one NOTAM card), the notices ops chose to share, and passengers only when the passengers
// switch is on. There is no checklist, no notes, no names of who checked what, and nothing to edit. Everything comes
// from /api/flight-info, which the wall backend cut to this client before answering.
import { useEffect, useMemo, useState } from 'react';
import { fetchFlightInfo } from '../services/timelineApi';
import { errorText } from '../services/errorText';
import { STATUS_WORD, statusSentence, fetchPassengers } from './clientApi';
import { prepareNotams } from '../../../shared/notam-parse.mjs';
import { notamCardHtml } from '../../../shared/notam-card.mjs';
import notamCardCss from '../../../shared/notam-card.css?raw';

const SW = { scheduled: 'var(--tl-scheduled)', delayed: 'var(--tl-delayed)', ctot: 'var(--tl-ctot)', airborne: 'var(--tl-flying)', arrived: 'var(--tl-arrived)', cancelled: 'transparent' };

export function StatusChip({ status, word }) {
  return <span className="cwc-status"><span className="cwc-sw" data-status={status} style={{ background: SW[status] || SW.scheduled }} />{word || STATUS_WORD[status] || status}</span>;
}

/** The flight's own facts: route, times (scheduled / estimated / actual), from the pill's record. */
export function useFlightInfo(p) {
  const [info, setInfo] = useState({ state: 'loading', data: null, error: '' });
  useEffect(() => {
    if (!p?.flightNid) { setInfo({ state: 'ok', data: null, error: '' }); return undefined; }
    let stop = false;
    setInfo({ state: 'loading', data: null, error: '' });
    fetchFlightInfo({ flightNid: p.flightNid, oprId: p.oprId })
      .then((d) => { if (!stop) setInfo({ state: 'ok', data: d, error: '' }); })
      .catch((e) => { if (!stop) setInfo({ state: 'failed', data: null, error: errorText(e) }); });
    return () => { stop = true; };
  }, [p?.flightNid, p?.oprId]);
  return info;
}

function TimesTable({ p }) {
  const rows = [
    ['Scheduled', p.etd, p.eta],
    [p.status === 'ctot' ? 'Slot' : 'Estimated', p.depKind !== 'STD' && p.depKind !== 'T/O' ? p.depHm : null, p.arrKind !== 'STA' && p.arrKind !== 'LDG' ? p.arrHm : null],
    ['Actual', p.atdHm, p.ataHm],
  ];
  const canc = p.status === 'cancelled';
  return (
    <div className="cwc-times" data-card="times">
      <div className="cwc-times-head"><span /><span>DEPARTURE</span><span>ARRIVAL</span></div>
      {rows.map(([k, a, b], i) => (
        <div key={k} className={`cwc-times-row${i === 2 ? ' is-actual' : ''}${canc ? ' is-cancelled' : ''}`}><span className="cwc-k">{k}</span><span className={a ? '' : 'is-none'}>{a ? `${a}` : '—'}</span><span className={b ? '' : 'is-none'}>{b ? `${b}` : '—'}</span></div>
      ))}
    </div>
  );
}

const CAT_TOKEN = { VFR: 'success', MVFR: 'info', IFR: 'danger', LIFR: 'danger' };
function Weather({ icao, role, w }) {
  if (!w || w.error) return <div className="cwc-wx" data-card="weather"><div className="cwc-wx-head"><span className="cwc-icao">{icao}</span><span className="cwc-role">{role}</span></div><p className="cwc-muted">{w?.error || 'No weather on file for this airport right now.'}</p></div>;
  const rows = [
    ['Wind', w.windDegrees != null ? `${String(w.windDegrees).padStart(3, '0')}° ${w.windSpeedKts ?? '—'} kt${w.windGustKts ? ` G${w.windGustKts}` : ''}` : '—'],
    ['Visibility', w.visibilityMeters != null ? (w.visibilityMeters >= 9999 ? '10 km+' : `${Math.round(w.visibilityMeters)} m`) : '—'],
    ['Ceiling', w.ceilingFeet != null ? `${w.ceilingFeet} ft` : 'None'],
    ['Temp / Dew', w.temperatureC != null ? `${w.temperatureC}° / ${w.dewpointC ?? '—'}°` : '—'],
    ['QNH', w.qnhHpa != null ? `${w.qnhHpa} hPa` : '—'],
  ];
  const obs = w.observed ? String(w.observed).slice(11, 16) : '';
  return (
    <div className="cwc-wx" data-card="weather">
      <div className="cwc-wx-head"><span className="cwc-icao">{icao}</span>{w.category && <span className={`cwc-cat is-${CAT_TOKEN[w.category] || 'neutral'}`}>{w.category}</span>}<span className="cwc-role">{role}</span>{obs && <span className="cwc-obs">obs {obs}Z</span>}</div>
      <div className="cwc-wx-grid">{rows.map(([k, val]) => <span key={k}><span className="cwc-k">{k}</span><span className="cwc-v">{val}</span></span>)}</div>
    </div>
  );
}

function Notams({ icao, payload }) {
  const prepared = useMemo(() => (payload?.ok ? prepareNotams(payload.data?.notams || payload.notams || []) : null), [payload]);
  if (!payload) return null;
  if (!payload.ok) return <p className="cwc-muted">NOTAMs for {icao} could not be read right now.</p>;
  if (!prepared.items.length) return <p className="cwc-muted">No NOTAMs in force at {icao}.</p>;
  return <div className="cwc-notams" data-notams={icao} dangerouslySetInnerHTML={{ __html: prepared.items.map((it) => notamCardHtml(it.fields)).join('') + (prepared.unparsed ? `<p class="cw-nc-note">${prepared.unparsed} shown as received.</p>` : '') }} />;
}

function Passengers({ p }) {
  const [st, setSt] = useState({ state: 'loading', rows: [], error: '' });
  useEffect(() => {
    let stop = false;
    fetchPassengers(p.flightNid, p.oprId).then((d) => { if (!stop) setSt({ state: 'ok', rows: d.passengers || [], error: '' }); }).catch((e) => { if (!stop) setSt({ state: 'failed', rows: [], error: e.message }); });
    return () => { stop = true; };
  }, [p.flightNid, p.oprId]);
  if (st.state === 'loading') return <p className="cwc-muted">Reading the passenger list…</p>;
  if (st.state === 'failed') return <p className="cwc-muted">{st.error || 'The passenger list could not be read.'}</p>;
  if (!st.rows.length) return <p className="cwc-muted">No passengers entered for this flight.</p>;
  return (
    <div className="cwc-pax" data-card="passengers">
      {st.rows.map((r, i) => <div key={r.id || i} className="cwc-pax-row"><span className="cwc-k">{i + 1}</span><span>{r.name}</span></div>)}
      <p className="cwc-muted cwc-pax-foot">Names as entered in Leon, shared by Clearway ops.</p>
    </div>
  );
}

/** The body: the same sections on a desk panel and a phone page. `p` is the pill's flight record (timelineApi.mapFlight). */
export default function ClientFlightBody({ p, me, names = {}, info, extraTop = null }) {
  const sw = me?.switches || [];
  const on = (k) => sw.includes(k);
  const f = info.data?.flight;
  const canc = p.status === 'cancelled';
  const notes = Array.isArray(f?.limitations) ? f.limitations : [];
  const important = notes.filter((n) => n.type === 'IMP');
  const lims = notes.filter((n) => n.type === 'LIM');
  const caa = notes.filter((n) => n.type === 'CAA');
  const paxOn = (me?.passengerLevel && me.passengerLevel !== 'off') && !canc;
  return (
    <div className="cwc-body">
      <style>{notamCardCss}</style>
      <div className="cwc-top">
        <StatusChip status={p.status} />
        <p className="cwc-sentence">{statusSentence(p, names)}</p>
        <span className="cwc-muted">Operated by {p.__operator || p.oprId}</span>
      </div>
      {extraTop}
      {canc && <div className="cwc-note" data-card="cancelled">This flight was cancelled. It stays here for 7 days so you can see what was planned.</div>}
      <div className="cwc-route" data-card="route">
        <span><b>{p.dep}</b><small>{names[p.dep] || ''}</small></span>
        <span className="cwc-arrow" aria-hidden>→</span>
        <span className="is-right"><b>{p.arr}</b><small>{names[p.arr] || ''}</small></span>
      </div>
      <section><h3>Times (UTC)</h3><TimesTable p={p} /></section>
      {!canc && on('weather') && (
        <section data-section="weather"><h3>Weather</h3>
          {info.state === 'loading' && <p className="cwc-muted">Reading…</p>}
          {info.state === 'failed' && <p className="cwc-muted">{info.error}</p>}
          {info.state === 'ok' && <><Weather icao={p.dep} role="Departure" w={info.data?.weather?.dep} /><Weather icao={p.arr} role="Arrival" w={info.data?.weather?.arr} /></>}
        </section>
      )}
      {!canc && on('notams') && info.state === 'ok' && (
        <section data-section="notams"><h3>NOTAMs for this flight</h3><Notams icao={p.dep} payload={info.data?.notams?.dep} /><Notams icao={p.arr} payload={info.data?.notams?.arr} /></section>
      )}
      {!canc && on('limitations') && (
        <section data-section="limitations" data-card="limitations"><h3>Limitations</h3>{lims.length ? lims.map((n) => <div key={n.id} className="cwc-note is-lim"><b>{n.title}</b>{n.description && <span>{n.description}</span>}</div>) : <p className="cwc-muted">No limitations apply to this flight.</p>}</section>
      )}
      {!canc && on('important') && (
        <section data-section="important" data-card="important"><h3>Notice from Clearway</h3>{important.length ? important.map((n) => <div key={n.id} className="cwc-note is-imp"><b>{n.title}</b>{n.description && <span>{n.description}</span>}</div>) : <p className="cwc-muted">No notices for this flight.</p>}</section>
      )}
      {!canc && on('caa') && caa.length > 0 && (
        <section data-section="caa" data-card="caa"><h3>Authority contacts</h3>{caa.map((n) => <div key={n.id} className="cwc-note"><b>{n.caa?.authorityName || n.caa?.country || n.title}</b>{n.caa?.functionText && <span>{n.caa.functionText}</span>}{n.caa?.contact && <span>{n.caa.contact}</span>}{n.caa?.phones && <span>{String(n.caa.phones)}</span>}{n.caa?.mail && <span>{String(n.caa.mail)}</span>}</div>)}</section>
      )}
      {paxOn && <section data-section="passengers"><h3>Passengers{Number.isFinite(p.passengerCount) ? ` · ${p.passengerCount}` : ''}</h3><Passengers p={p} /></section>}
    </div>
  );
}
