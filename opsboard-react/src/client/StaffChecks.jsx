// The staff additions to the shared phone flight page (design "Phone Views" › Staff, 2026-11-11): the five checks of the
// wall (Important, NOTAM, Weather, CAA, Limitations) as chips, each marked checked with one normal tap through the
// wall's own /api/flight-checks (the same marks the desk and the ops wall show), and the NOTAM check as a link to the
// NOTAM Check page, where NOTAMs are acknowledged per airport. A client never sees this: ClientPhone draws it for
// role="staff" only. Nothing here recomputes a check — openChecksOf is the wall's own reading (shared/wall-facts.mjs).
import { useState } from 'react';
import { openChecksOf } from '../../../shared/wall-facts.mjs';
import { postFlightCheck } from '../services/timelineApi';

const KEYS = [['imp', 'Important', 'IMP'], ['ntm', 'NOTAM', 'NTM'], ['wx', 'Weather', 'WX'], ['caa', 'CAA', 'CAA'], ['lim', 'Limitations', 'LIM']];
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '✓';

export function openCheckChips(flight) { return openChecksOf(flight).map((k) => k.toUpperCase()); }

export default function StaffChecks({ p, onChanged }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const open = new Set(openChecksOf(p));
  const checks = p.checks || {};
  const mark = async (k) => {
    setBusy(k); setError('');
    try { await postFlightCheck({ flightNid: p.flightNid, oprId: p.oprId, types: [k.toUpperCase()], checked: true }); onChanged?.(); }
    catch (e) { setError(e?.message || 'The check could not be saved. Try again.'); }
    finally { setBusy(''); }
  };
  const openAll = [...open].filter((k) => k !== 'ntm');
  return (
    <section data-section="checks" className="cwc-checks">
      <h3>Checks</h3>
      <div className="cwc-checkgrid">
        {KEYS.map(([k, label, short]) => {
          const ch = checks[k]; const isOpen = open.has(k);
          const state = ch ? 'done' : isOpen ? 'open' : 'none';
          return (
            <div key={k} className={`cwc-check is-${state}`} data-check={short} data-check-state={state}>
              <span className="cwc-check-k">{short}</span>
              <span className="cwc-check-l"><b>{label}</b><small>{ch ? `Checked by ${initials(ch.by)}${ch.at ? ` at ${String(ch.at).slice(11, 16)}Z` : ''}` : isOpen ? 'To check' : 'Nothing on this flight'}</small></span>
              {isOpen && k !== 'ntm' && <button type="button" className="cwd-btn" disabled={busy === k} onClick={() => mark(k)} data-mark-check={short}>{busy === k ? 'Saving…' : 'Mark checked'}</button>}
              {isOpen && k === 'ntm' && <a className="cwd-btn" href="/m/notam-check" target="_top" data-open-notam-check="">NOTAM check</a>}
            </div>
          );
        })}
      </div>
      {openAll.length > 1 && <button type="button" className="cwd-btn is-primary" disabled={Boolean(busy)} onClick={async () => { setBusy('all'); setError(''); try { await postFlightCheck({ flightNid: p.flightNid, oprId: p.oprId, types: openAll.map((k) => k.toUpperCase()), checked: true }); onChanged?.(); } catch (e) { setError(e?.message || 'The checks could not be saved.'); } finally { setBusy(''); } }} data-mark-all="">{busy === 'all' ? 'Saving…' : `Mark ${openAll.length} checked`}</button>}
      {error && <p className="cwc-muted" role="alert">{error}</p>}
    </section>
  );
}
