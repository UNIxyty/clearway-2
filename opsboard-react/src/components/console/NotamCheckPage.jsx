import { useEffect, useState } from 'react';
import {
  ackNotamCheck,
  fetchAlertRules,
  fetchNotamCheckToday,
  resyncNotamCheckAirport,
  runNotamCheck,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import NotamText, { buildHighlightGroups } from '../NotamText';
import Icon from './icons';
import { Button, ErrorBanner, HelpBanner, PageHeader, t, useToast } from './ui';

// NOTAM Check — visual treatment from Claude Design "NOTAM Check.dc.html"
// applied to the functional page. Endpoints and SSE are unchanged
// (/api/notam-check/*, notam-check.changed); ack() toggles, so the design's
// Undo button maps straight onto it.

function zTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

/** 6-digit hex + alpha suffix for category chip tints; safe fallback. */
function tint(hex, alpha = '22') {
  return /^#[0-9a-f]{6}$/i.test(String(hex || '')) ? `${hex}${alpha}` : t.segment;
}

const mono = { fontFamily: t.mono };

function NotamRecord({ notam, groups, muted = false }) {
  const top = notam.matches?.[0] || null;
  const color = top?.color || t.faint;
  const validity = notam.validTill === 'PERM' ? 'PERM' : `${notam.validFrom}  →  ${notam.validTill}`;
  return (
    <div
      style={{
        border: `1px solid ${t.borderInner}`,
        borderLeft: `3px solid ${muted ? t.border : color}`,
        borderRadius: 10,
        background: '#fff',
        overflow: 'hidden',
        opacity: muted ? 0.72 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderBottom: '1px solid #f4f5f7', flexWrap: 'wrap' }}>
        <span style={{ ...mono, fontSize: 13.5, fontWeight: 600, color: t.ink }}>{notam.number || '(no number)'}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: t.muted, background: '#eef1f5', padding: '3px 8px', borderRadius: 6 }}>
          {notam.class || '—'}
        </span>
        {top && (
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em', color, background: tint(color), padding: '3px 9px', borderRadius: 6 }}>
            {String(top.group || '').toUpperCase()}
          </span>
        )}
        {notam.status === 'expired' && (
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em', color: t.redDeep, background: t.redTint, padding: '3px 9px', borderRadius: 6 }}>
            EXPIRED
          </span>
        )}
        {notam.status === 'future' && !notam.inWindow && (
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em', color: t.muted, background: t.segment, padding: '3px 9px', borderRadius: 6 }}>
            STARTS {notam.validFrom}
          </span>
        )}
        {notam.status !== 'expired' && notam.status !== 'future' && !notam.inWindow && (
          <span style={{ fontSize: 11, color: t.faint }}>outside today +24h</span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 12, color: t.faint }}>{validity}</span>
      </div>
      <div style={{ ...mono, fontSize: 13, lineHeight: 1.65, color: t.body, padding: '11px 13px' }}>
        <NotamText text={notam.condition} groups={groups} />
      </div>
    </div>
  );
}

function SignBanner({ sign, done, total, ranAt, running, onRun }) {
  const checked = sign === 'CHECKED';
  const v = checked
    ? {
        border: t.greenBorder, bg: '#f1faf4', icon: 'shield-check', iconBg: '#dcf1e3', iconColor: '#1a9455',
        plateBorder: '#22343e', plateBg: '#10151a', signColor: '#5ee79b', dot: '#4ade80', anim: false,
        sub: '#4a8f66', detail: `All ${total} airports reviewed today · the wall is showing the green all-clear sign`,
        text: 'NOTAM CHECKED',
      }
    : {
        border: '#f1d4d4', bg: '#fdf4f4', icon: 'alert-triangle', iconBg: '#fbe0e0', iconColor: '#d33f45',
        plateBorder: '#3a252b', plateBg: '#14131a', signColor: '#ff6167', dot: '#ff5a5f', anim: true,
        sub: '#a85757', detail: `${total - done} airport${total - done === 1 ? '' : 's'} still to review · the wall is showing the attention sign`,
        text: 'CHECK NOTAM',
      };
  return (
    <div style={{ border: `1px solid ${v.border}`, background: v.bg, borderRadius: 15, padding: '16px 20px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: v.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icon name={v.icon} size={22} color={v.iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: t.faint, marginBottom: 7 }}>TODAY'S WALL SIGN</div>
        <div
          className={v.anim ? 'cw-motion-decor' : undefined}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 11, background: v.plateBg,
            border: `1px solid ${v.plateBorder}`, borderRadius: 10, padding: '9px 16px',
            animation: v.anim ? 'cwglow 2.4s ease-in-out infinite' : 'none',
          }}
        >
          <span
            className={v.anim ? 'cw-motion-decor' : undefined}
            style={{ width: 9, height: 9, borderRadius: '50%', background: v.dot, flex: 'none', animation: v.anim ? 'cwpulseDot 2s ease-out infinite' : 'none' }}
          />
          <span style={{ ...mono, fontSize: 16, fontWeight: 600, letterSpacing: '0.16em', color: v.signColor }}>{v.text}</span>
        </div>
        <div style={{ fontSize: 13, color: v.sub, marginTop: 9 }}>{v.detail}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 'none' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: t.faint }}>LAST RUN</div>
          <div style={{ ...mono, fontSize: 15, fontWeight: 600, color: t.body, marginTop: 2 }}>{zTime(ranAt)}</div>
        </div>
        <Button icon={running ? 'loader' : 'refresh-cw'} spin={running} onClick={onRun}>
          {running ? 'Running…' : 'Run check now'}
        </Button>
      </div>
    </div>
  );
}

function ProgressCard({ done, total, legend }) {
  const allChecked = done === total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = allChecked ? t.green : done > 0 ? t.blue : t.red;
  return (
    <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 14, padding: '16px 20px', marginBottom: 20, boxShadow: t.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>{done} of {total} airports checked</span>
          <span style={{ fontSize: 13, color: t.faint }}>{allChecked ? 'complete' : `· ${total - done} remaining`}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {legend.map((g) => (
            <span key={g.group} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: t.muted }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: g.color }} />{g.group}
            </span>
          ))}
        </div>
      </div>
      <div style={{ height: 9, borderRadius: 999, background: t.segment, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, transition: 'width .3s ease' }} />
      </div>
    </div>
  );
}

function AirportCard({ airport, groups, expanded, onToggleAll, onAck, ackBusy, onResync, resyncBusy }) {
  const checked = Boolean(airport.checked);
  const noneFlagged = airport.filtered.length === 0;
  const visible = expanded ? airport.all : airport.filtered;
  const c = checked
    ? { border: t.greenBorder, headBg: '#f4faf6', headBorder: '#dcefe2', iconBg: t.greenTint, iconColor: t.greenDeep }
    : noneFlagged
      ? { border: t.border, headBg: t.subtle, headBorder: t.borderInner, iconBg: '#eef1f5', iconColor: t.muted }
      : { border: t.amberBorder, headBg: t.amberWash, headBorder: '#f5e2ce', iconBg: '#fdf1e8', iconColor: '#c2703b' };
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 15, overflow: 'hidden', background: '#fff', boxShadow: t.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px', background: c.headBg, borderBottom: `1px solid ${c.headBorder}`, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: c.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="plane" size={20} color={c.iconColor} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ ...mono, fontSize: 19, fontWeight: 700, letterSpacing: '0.02em' }}>{airport.icao}</span>
            <span style={{ fontSize: 15, color: t.muted }}>{airport.name}</span>
          </div>
          {airport.flights?.length > 0 && (
            <div style={{ fontSize: 12.5, color: t.faint, marginTop: 2 }}>{airport.flights.join(' · ')}</div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', padding: '6px 12px', borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            color: airport.error ? t.redDeep : noneFlagged ? t.greenDeep : t.amber,
            background: airport.error ? t.redTint : noneFlagged ? t.greenTint : t.amberTint,
          }}
        >
          <Icon name={airport.error ? 'wifi-off' : noneFlagged ? 'check' : 'flag'} size={14} />
          {airport.error ? 'Fetch failed' : noneFlagged ? 'All clear' : `${airport.filtered.length} flagged`}
        </span>
        {checked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: t.greenDeep, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check-check" size={15} />CHECKED
              </div>
              <div style={{ fontSize: 11.5, color: t.faint }}>{airport.checked.by} · {zTime(airport.checked.at)}</div>
            </div>
            <Button variant="soft" size="sm" spin={ackBusy} onClick={onAck}>Undo</Button>
          </div>
        ) : (
          <Button variant="primary" size="sm" icon="check" spin={ackBusy} style={{ fontWeight: 700 }} onClick={onAck}>
            Mark checked
          </Button>
        )}
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {airport.error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fdf0f0', border: '1px solid #f6d8d8', borderRadius: 10, padding: '10px 13px' }}>
            <Icon name="wifi-off" size={16} color={t.red} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: t.redDeep, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
              Fetch failed: {airport.error}
            </span>
            {/* Retry lives ONLY on failed airports — successful ones keep their cached fetch. */}
            <Button size="sm" icon="rotate-cw" spin={resyncBusy} disabled={resyncBusy} onClick={onResync}>
              {resyncBusy ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        )}
        {!expanded && noneFlagged && !airport.error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: t.greenDeep, background: '#f4faf6', border: '1px solid #d8ecdf', borderRadius: 10, padding: '11px 14px' }}>
            <Icon name="shield-check" size={16} />No keyword-flagged NOTAMs for today. Full list available below.
          </div>
        )}
        {expanded && visible.length === 0 && (
          <div style={{ fontSize: 12.5, color: t.faint }}>No NOTAMs on file for this airport.</div>
        )}
        {visible.map((notam, index) => (
          <NotamRecord
            key={`${notam.number || index}`}
            notam={notam}
            groups={groups}
            muted={expanded && (notam.matches.length === 0 || !notam.inWindow || notam.status === 'expired')}
          />
        ))}
        <button
          type="button"
          onClick={onToggleAll}
          style={{ fontFamily: 'inherit', alignSelf: 'flex-start', fontSize: 13, fontWeight: 600, color: t.blue, background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 2px' }}
        >
          {expanded ? 'Show flagged only' : `Show all NOTAMs (${airport.all.length})`}
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={15} />
        </button>
      </div>
    </div>
  );
}

/** Status strip above the state cards (loading / error / empty variants). */
function StateStrip({ tone, title, body, spinner = false, icon }) {
  const tones = {
    blue: { border: t.blueBorder, accent: t.blue, bg: t.blueWash, title: t.blueDeep, body: t.blueInk },
    red: { border: t.redBorder, accent: t.red, bg: '#fdf0f0', title: '#c0392f', body: '#8a3a3a' },
    gray: { border: t.border, accent: t.faint, bg: t.subtle, title: t.body, body: t.muted },
  };
  const v = tones[tone];
  return (
    <div style={{ border: `1px solid ${v.border}`, borderLeft: `5px solid ${v.accent}`, background: v.bg, borderRadius: 15, padding: '18px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
      {spinner ? (
        <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #bcd2f7', borderTopColor: t.blue, animation: 'cwspin .7s linear infinite', flex: 'none' }} />
      ) : (
        <Icon name={icon} size={22} color={v.accent} style={{ flexShrink: 0 }} />
      )}
      <div>
        <div style={{ ...mono, fontSize: 18, fontWeight: 600, color: v.title }}>{title}</div>
        <div style={{ fontSize: 13.5, color: v.body, marginTop: 4 }}>{body}</div>
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ border: `1px solid ${t.border}`, borderRadius: 15, background: '#fff', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div className="cw-skel" style={{ width: 44, height: 44, borderRadius: 11 }} />
            <div style={{ flex: 1 }}>
              <div className="cw-skel" style={{ width: 130, height: 15, marginBottom: 8 }} />
              <div className="cw-skel" style={{ width: 90, height: 11 }} />
            </div>
            <div className="cw-skel" style={{ width: 120, height: 38, borderRadius: 10 }} />
          </div>
          <div className="cw-skel" style={{ width: '100%', height: 44, marginBottom: 9 }} />
          <div className="cw-skel" style={{ width: '82%', height: 44 }} />
        </div>
      ))}
    </div>
  );
}

export default function NotamCheckPage({ navigate }) {
  const [state, setState] = useState(null);
  const [groups, setGroups] = useState([]);
  const [legend, setLegend] = useState([]);
  const [showAll, setShowAll] = useState({});
  const [running, setRunning] = useState(false);
  const [ackBusy, setAckBusy] = useState('');
  const [resyncBusy, setResyncBusy] = useState('');
  const [error, setError] = useState('');
  const flash = useToast();

  async function load() {
    try {
      setState(await fetchNotamCheckToday());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    load();
    fetchAlertRules()
      .then((payload) => {
        const raw = payload.rules?.notamGroups || [];
        setGroups(buildHighlightGroups(raw));
        setLegend(raw.map((g) => ({ group: g.group, color: g.color })));
      })
      .catch(() => {});
    return subscribeWallStream('notam-check.changed', load, { surface: 'console' });
  }, []);

  async function runNow() {
    if (running) return;
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

  async function resync(icao) {
    if (resyncBusy) return; // one in-flight retry at a time; button is disabled too
    setResyncBusy(icao);
    try {
      const payload = await resyncNotamCheckAirport(icao);
      setState(payload);
      const airport = payload.airports.find((a) => a.icao === icao);
      if (airport && !airport.error) flash(`${icao} resynced · ${airport.filtered.length} flagged`);
      else flash(`${icao} still failing`, '#f87171');
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err), '#f87171');
    } finally {
      setResyncBusy('');
    }
  }

  async function ack(icao) {
    setAckBusy(icao);
    setError('');
    try {
      const wasChecked = Boolean(state?.airports?.find((a) => a.icao === icao)?.checked);
      const payload = await ackNotamCheck(icao);
      setState(payload);
      if (payload.sign === 'CHECKED') flash('All airports checked — wall sign flipped to NOTAM CHECKED');
      else if (wasChecked) flash(`${icao} unchecked`, '#f87171');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAckBusy('');
    }
  }

  const airports = state?.airports || [];
  const loading = state === null && !error;
  const busy = loading || running;

  return (
    <div>
      <PageHeader
        title="NOTAM Check"
        desc={
          <>
            The daily NOTAM triage for today's airports. Review the keyword-flagged notices per airport and press
            CHECKED — the wall sign flips to <strong style={{ color: t.ink, fontWeight: 600 }}>NOTAM CHECKED</strong> once
            every airport is done.
          </>
        }
        descMax={640}
      />

      <HelpBanner
        title="How this check works"
        items={[
          {
            title: 'Airports for today',
            body: `every departure and arrival across today's flights, deduplicated to one card per airport. It runs automatically at ${state?.checkHour ?? 10}:00 ${state?.timeZone || 'Europe/Riga'} and sends a notification email — no NOTAM content leaves this page.`,
          },
          {
            title: 'Flagged NOTAMs',
            body: 'notices matching the keyword filter and valid now → +24 h (PERM included) are shown first, with matched words highlighted in their category colour. Use Show all NOTAMs to read the full unfiltered list.',
          },
          {
            title: 'CHECKED',
            body: 'press per airport once reviewed; your name and time are recorded. When all airports are checked the wall sign turns green. Undo is there for mis-clicks.',
          },
        ]}
      />

      {busy && (
        <div className="cw-fade">
          <StateStrip
            tone="blue"
            spinner
            title="FETCHING NOTAMS…"
            body="Pulling today's airports from the flight schedule and querying the NOTAM source."
          />
          <SkeletonCards />
        </div>
      )}

      {!busy && error && (
        <div className="cw-fade">
          <StateStrip
            tone="red"
            icon="wifi-off"
            title="CHECK UNAVAILABLE"
            body="The NOTAM source did not respond. Today's flagged notices can't be verified — the wall sign stays on CHECK NOTAM until this clears."
          />
          <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', boxShadow: t.shadow, marginBottom: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: '#fdecec', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="server-off" size={26} color={t.red} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Couldn't reach the NOTAM source</div>
            <div style={{ fontSize: 14, color: t.muted, maxWidth: 440, margin: '0 auto 8px', lineHeight: 1.55 }}>
              {state?.ranAt ? <>Last successful run was <strong style={{ color: t.ink }}>{zTime(state.ranAt)}</strong>. </> : null}
              This is usually a transient upstream timeout — retry the check.
            </div>
            <div style={{ ...mono, fontSize: 12, color: '#b3383c', background: '#fdf0f0', border: '1px solid #f6d8d8', borderRadius: 8, padding: '8px 12px', display: 'inline-block', marginBottom: 20, maxWidth: '100%', overflowWrap: 'anywhere' }}>
              {error}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Button variant="primary" icon="rotate-cw" onClick={runNow}>Retry check</Button>
            </div>
          </div>
        </div>
      )}

      {!busy && state && !state.day && !error && (
        <div className="cw-fade">
          <StateStrip
            tone="gray"
            icon="calendar-check-2"
            title="NO CHECK YET TODAY"
            body={`It runs automatically at ${state.checkHour}:00 ${state.timeZone} — or run it now.`}
          />
          <div style={{ background: '#fff', border: `1.5px dashed ${t.borderInput}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ width: 58, height: 58, borderRadius: 15, background: t.wash, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="clipboard-check" size={27} color={t.ghost} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>No check has run today yet</div>
            <div style={{ fontSize: 14, color: t.muted, maxWidth: 430, margin: '0 auto 20px', lineHeight: 1.55 }}>
              The daily run collects today's airports, filters the NOTAMs and raises the wall sign. You can start it
              manually without waiting for the schedule.
            </div>
            <Button icon="refresh-cw" onClick={runNow}>Run check now</Button>
          </div>
        </div>
      )}

      {!busy && state && state.day && airports.length === 0 && !error && (
        <div className="cw-fade">
          <StateStrip
            tone="gray"
            icon="calendar-check-2"
            title="NOTHING TO CHECK"
            body="No flights are scheduled for today, so there are no airports to review."
          />
          <div style={{ background: '#fff', border: `1.5px dashed ${t.borderInput}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ width: 58, height: 58, borderRadius: 15, background: t.wash, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="plane-takeoff" size={27} color={t.ghost} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>No airports for today</div>
            <div style={{ fontSize: 14, color: t.muted, maxWidth: 430, margin: '0 auto 20px', lineHeight: 1.55 }}>
              The check populates automatically from the day's departures and arrivals. When the first flight is
              scheduled, its airports appear here for triage.
            </div>
            {navigate && (
              <Button variant="ghost" icon="plane" onClick={() => navigate({ surface: 'console', page: 'flights' })}>
                Go to Flights
              </Button>
            )}
          </div>
        </div>
      )}

      {!busy && state && state.day && airports.length > 0 && (
        <div className="cw-fade">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {state.lastRunError && <ErrorBanner>Last scheduled run failed: {state.lastRunError}</ErrorBanner>}
          <SignBanner
            sign={state.sign}
            done={state.done}
            total={state.total}
            ranAt={state.ranAt}
            running={running}
            onRun={runNow}
          />
          <ProgressCard done={state.done} total={state.total} legend={legend} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {airports.map((airport) => (
              <AirportCard
                key={airport.icao}
                airport={airport}
                groups={groups}
                expanded={Boolean(showAll[airport.icao])}
                onToggleAll={() => setShowAll((prev) => ({ ...prev, [airport.icao]: !prev[airport.icao] }))}
                onAck={() => ack(airport.icao)}
                ackBusy={ackBusy === airport.icao}
                onResync={() => resync(airport.icao)}
                resyncBusy={resyncBusy === airport.icao}
              />
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: t.faint, marginTop: 14, textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            {state.emailedTo && (
              <span>Notification email sent to {state.emailedTo}{state.emailedAt ? ` at ${zTime(state.emailedAt)}` : ''}</span>
            )}
            {state.remindersSent > 0 && (
              <span>
                {state.remindersSent} reminder{state.remindersSent === 1 ? '' : 's'} sent
                {state.lastReminderAt ? ` · last at ${zTime(state.lastReminderAt)}` : ''} · every {state.reminderIntervalMin} min until all checked
              </span>
            )}
            {state.emailError && (
              <span style={{ color: t.redDeep, fontWeight: 600 }}>Email problem: {state.emailError}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
