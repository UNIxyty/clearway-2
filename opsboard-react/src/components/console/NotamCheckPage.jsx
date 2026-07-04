import { useEffect, useState } from 'react';
import {
  ackNotamCheck,
  fetchAlertRules,
  fetchNotamCheckToday,
  runNotamCheck,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import NotamText, { buildHighlightGroups } from '../NotamText';
import Icon from './icons';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  t,
  useToast,
} from './ui';

// NOTAM Check — its own console page (Item 3). Functional build on the
// current UI kit; the dedicated visual design (Claude Design "NOTAM Check")
// can re-skin it later. Endpoints and SSE are unchanged
// (/api/notam-check/*, notam-check.changed).

function NotamRecord({ notam, groups, muted = false }) {
  const color = notam.matches?.[0]?.color || '#9aa0a8';
  return (
    <div
      style={{
        fontFamily: t.mono,
        fontSize: 12.5,
        lineHeight: 1.5,
        background: '#fff',
        border: `1px solid ${t.borderInner}`,
        borderLeft: `3px solid ${muted ? t.border : color}`,
        borderRadius: 8,
        padding: '9px 12px',
        color: t.body,
        opacity: muted ? 0.75 : 1,
      }}
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: t.ink }}>{notam.number || '(no number)'}</span>
        <span style={{ color: t.faint, fontSize: 11 }}>class {notam.class || '—'}</span>
        <span style={{ color: t.faint, fontSize: 11 }}>
          {notam.validFrom} → {notam.validTill}
        </span>
        {!notam.inWindow && <span style={{ color: t.faint, fontSize: 11 }}>outside today +24h</span>}
      </div>
      <NotamText text={notam.condition} groups={groups} />
    </div>
  );
}

export default function NotamCheckPage() {
  const [state, setState] = useState(null);
  const [groups, setGroups] = useState([]);
  const [showAll, setShowAll] = useState({});
  const [running, setRunning] = useState(false);
  const [ackBusy, setAckBusy] = useState('');
  const [error, setError] = useState('');
  const flash = useToast();

  async function load() {
    try {
      setState(await fetchNotamCheckToday());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    load();
    fetchAlertRules()
      .then((payload) => setGroups(buildHighlightGroups(payload.rules?.notamGroups)))
      .catch(() => {});
    return subscribeWallStream('notam-check.changed', load, { surface: 'console' });
  }, []);

  async function runNow() {
    setRunning(true);
    setError('');
    try {
      const payload = await runNotamCheck();
      setState(payload);
      flash(`NOTAM check complete · ${payload.total} airports, notification ${payload.emailedTo ? `sent to ${payload.emailedTo}` : 'not sent'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function ack(icao) {
    setAckBusy(icao);
    setError('');
    try {
      const payload = await ackNotamCheck(icao);
      setState(payload);
      if (payload.sign === 'CHECKED') flash('All airports checked — wall sign flipped to NOTAM CHECKED');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAckBusy('');
    }
  }

  const airports = state?.airports || [];
  const sign = state?.sign || 'NONE';

  return (
    <div>
      <PageHeader
        title="NOTAM Check"
        desc={
          <>
            Runs automatically at {state?.checkHour ?? 10}:00 {state?.timeZone || 'Europe/Riga'} over today's flights
            (airports deduplicated), filters by the OPS keyword set and validity (now → +24 h, PERM included), raises
            the wall sign and sends a notification email — no NOTAM content leaves this page. Press CHECKED per airport
            once reviewed.
          </>
        }
        descMax={680}
        actions={
          <Button icon="radar" spin={running} onClick={runNow}>
            {running ? 'Checking…' : 'Run check now'}
          </Button>
        }
      />

      <Card className="cw-fade">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {sign !== 'NONE' && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: sign === 'CHECKED' ? t.greenDeep : t.red,
                  background: sign === 'CHECKED' ? t.greenTint : t.redTint,
                  padding: '7px 14px',
                  borderRadius: 8,
                }}
              >
                {sign === 'CHECKED' ? 'NOTAM CHECKED' : '!!! CHECK NOTAM !!!'}
              </span>
            )}
            <span style={{ fontSize: 13, color: t.faint }}>
              {state ? `${state.done} of ${state.total} airports checked · wall mirrors this state` : 'Loading…'}
            </span>
          </div>
          {state?.emailedTo && (
            <span style={{ fontSize: 12.5, color: t.faint }}>Last notification: {state.emailedTo}</span>
          )}
        </div>

        <ErrorBanner>{error}</ErrorBanner>
        {state && !state.day && (
          <EmptyState icon="clipboard-check" title="No check has run today yet">
            It runs automatically at {state.checkHour}:00 {state.timeZone} — or run it now.
          </EmptyState>
        )}
        {state && state.day && airports.length === 0 && (
          <EmptyState icon="clipboard-check" title="No flights today">No airports to check.</EmptyState>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {airports.map((airport) => {
            const checked = Boolean(airport.checked);
            const expanded = Boolean(showAll[airport.icao]);
            const visible = expanded ? airport.all : airport.filtered;
            return (
              <div
                key={airport.icao}
                style={{
                  border: `1px solid ${checked ? t.greenBorder : t.amberBorder}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: checked ? '#f4faf6' : t.amberWash,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: t.mono, fontSize: 16, fontWeight: 700 }}>{airport.icao}</span>
                  <span style={{ fontSize: 13, color: t.muted }}>{airport.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.amber, background: t.amberTint, padding: '3px 9px', borderRadius: 999 }}>
                    {airport.filtered.length} flagged
                  </span>
                  {airport.flights?.length > 0 && (
                    <span style={{ fontSize: 12, color: t.faint, fontFamily: t.mono }}>{airport.flights.join(' · ')}</span>
                  )}
                  {checked && (
                    <span style={{ fontSize: 11.5, color: t.greenDeep }}>checked by {airport.checked.by}</span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => setShowAll((prev) => ({ ...prev, [airport.icao]: !expanded }))}
                    style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: t.blue, background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {expanded ? 'Show flagged only' : `Show all NOTAMs (${airport.all.length})`}
                    <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
                  </button>
                  <Button
                    variant={checked ? 'successSoft' : 'primary'}
                    size="sm"
                    icon={checked ? 'check-check' : 'check'}
                    spin={ackBusy === airport.icao}
                    style={{ fontWeight: 700 }}
                    onClick={() => ack(airport.icao)}
                  >
                    {checked ? 'CHECKED' : 'Mark checked'}
                  </Button>
                </div>
                <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {airport.error && <ErrorBanner>Fetch error: {airport.error}</ErrorBanner>}
                  {visible.length === 0 && (
                    <div style={{ fontSize: 12.5, color: t.faint }}>
                      {expanded ? 'No NOTAMs on file for this airport.' : 'No keyword-flagged NOTAMs in the next 24 h.'}
                    </div>
                  )}
                  {visible.map((notam, index) => (
                    <NotamRecord
                      key={`${notam.number || index}`}
                      notam={notam}
                      groups={groups}
                      muted={expanded && notam.matches.length === 0}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
