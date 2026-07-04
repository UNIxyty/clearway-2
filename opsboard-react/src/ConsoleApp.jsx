import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthGate';
import Icon from './components/console/icons';
import {
  Avatar,
  ConsoleStyles,
  t,
  timeAgo,
  ToastProvider,
} from './components/console/ui';
import AircraftPage from './components/console/AircraftPage';
import NotamCheckPage from './components/console/NotamCheckPage';
import FlightsPage from './components/console/FlightsPage';
import ImportantPage from './components/console/ImportantPage';
import LimitationsPage from './components/console/LimitationsPage';
import OperatorsPage from './components/console/OperatorsPage';
import SettingsPage from './components/console/SettingsPage';
import {
  fetchImportant,
  fetchNotamCheckToday,
  fetchOverlay,
  fetchPresence,
  fetchSyncStatus,
  fetchTimelineRaw,
} from './services/timelineApi';
import { subscribeWallStream } from './services/wallStream';

const NAV = [
  { key: 'flights', label: 'Flights', icon: 'plane' },
  { key: 'notam-check', label: 'NOTAM Check', icon: 'clipboard-check' },
  { key: 'operators', label: 'Operators', icon: 'users' },
  { key: 'aircraft', label: 'Aircraft', icon: 'navigation' },
  { key: 'limitations', label: 'Limitations', icon: 'alert-triangle' },
  { key: 'important', label: 'Important', icon: 'star' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

function initialsOf(user) {
  if (!user) return '??';
  if (user.initials) return user.initials;
  const name = user.name || user.email || '';
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/**
 * The Display Console shell (approved Claude Design "Display Console"):
 * white top bar with the wall-live pill + presence stack + account chip,
 * 236px left nav with the sync-status card, content pane per page.
 */
export default function ConsoleApp({ page, navigate }) {
  const { user } = useAuth();
  const [overlay, setOverlay] = useState({ open: false });
  const [wallFlight, setWallFlight] = useState(null);
  const [presence, setPresence] = useState([]);
  const [needsReview, setNeedsReview] = useState(0);
  const [notamSign, setNotamSign] = useState('NONE');
  const [sync, setSync] = useState(null);
  const [, setTick] = useState(0); // re-render "ago" labels

  // Overlay state + the callsign of whatever is on the wall.
  useEffect(() => {
    let cancelled = false;

    async function resolveWallFlight(state) {
      if (!state?.open || !state.flightNid) {
        setWallFlight(null);
        return;
      }
      try {
        const payload = await fetchTimelineRaw({ refresh: false });
        if (cancelled) return;
        for (const group of payload.aircraft || []) {
          for (const flight of group.flights || []) {
            if (String(flight.flightNid) === String(state.flightNid)) {
              setWallFlight({
                callsign: flight.flightNo,
                route: `${flight.adep?.icao ?? 'UNK'} → ${flight.ades?.icao ?? 'UNK'}`,
              });
              return;
            }
          }
        }
        setWallFlight({ callsign: `#${state.flightNid}`, route: '' });
      } catch {
        setWallFlight({ callsign: `#${state.flightNid}`, route: '' });
      }
    }

    fetchOverlay()
      .then((payload) => {
        if (cancelled) return;
        setOverlay(payload.overlay || { open: false });
        resolveWallFlight(payload.overlay);
      })
      .catch(() => {});

    const unsub = subscribeWallStream(
      'display.command',
      (event) => {
        const state = event.overlay || { open: false };
        setOverlay(state);
        resolveWallFlight(state);
      },
      { surface: 'console' }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Presence stack.
  useEffect(() => {
    fetchPresence().then((p) => setPresence(p.users || [])).catch(() => {});
    return subscribeWallStream('presence.changed', (event) => setPresence(event.users || []), {
      surface: 'console',
    });
  }, []);

  // Important needs-review badge.
  useEffect(() => {
    async function load() {
      try {
        const payload = await fetchImportant({ includeInactive: true });
        setNeedsReview((payload.entries || []).filter((e) => !e.reviewed).length);
      } catch {
        /* keep last */
      }
    }
    load();
    return subscribeWallStream('important.changed', load, { surface: 'console' });
  }, []);

  // NOTAM check-state indicator on the nav entry.
  useEffect(() => {
    fetchNotamCheckToday().then((p) => setNotamSign(p.sign || 'NONE')).catch(() => {});
    return subscribeWallStream('notam-check.changed', (event) => setNotamSign(event.sign || 'NONE'), {
      surface: 'console',
    });
  }, []);

  // Sync status card (poll lightly; "ago" label ticks every 15s).
  useEffect(() => {
    const load = () => fetchSyncStatus().then(setSync).catch(() => {});
    load();
    const pollId = setInterval(load, 60_000);
    const tickId = setInterval(() => setTick((v) => v + 1), 15_000);
    return () => {
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, []);

  const wallPill = useMemo(() => {
    if (overlay.open) {
      return {
        bg: t.greenTint,
        border: t.greenBorder,
        dot: t.green,
        glow: 'rgba(22,163,74,.15)',
        color: t.greenDeep,
        label: `Wall live · ${wallFlight?.callsign ?? '…'} on screen`,
      };
    }
    return {
      bg: '#f1f2f4',
      border: t.border,
      dot: t.faint,
      glow: 'rgba(154,160,168,.15)',
      color: t.muted,
      label: 'Wall idle · no flight',
    };
  }, [overlay.open, wallFlight]);

  const healthy = sync ? sync.healthy !== false : null;

  function renderPage() {
    switch (page) {
      case 'notam-check':
        return <NotamCheckPage />;
      case 'operators':
        return <OperatorsPage />;
      case 'aircraft':
        return <AircraftPage />;
      case 'limitations':
        return <LimitationsPage />;
      case 'important':
        return <ImportantPage />;
      case 'settings':
        return <SettingsPage />;
      case 'flights':
      default:
        return <FlightsPage />;
    }
  }

  return (
    <ToastProvider>
      <div className="cw-console" style={s.shell}>
        <ConsoleStyles />

        {/* ── Top bar ── */}
        <div style={s.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={s.logoMark}>
              <div style={s.logoDot} />
            </div>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>clearway</span>
            <span style={{ width: 1, height: 22, background: t.border, margin: '0 4px' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: t.muted }}>Display Console</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: wallPill.bg,
                border: `1px solid ${wallPill.border}`,
                padding: '7px 13px',
                borderRadius: 999,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: wallPill.dot,
                  boxShadow: `0 0 0 4px ${wallPill.glow}`,
                }}
              />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: wallPill.color }}>{wallPill.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex' }}>
                {presence.slice(0, 5).map((p) => (
                  <Avatar
                    key={p.userId}
                    name={`${p.name}${p.email ? ` · ${p.email}` : ''} · ${(p.surfaces || []).join(', ')}`}
                    initials={p.initials}
                    seed={p.userId}
                    style={{ border: '2px solid #fff', marginLeft: -8 }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 12.5, color: t.muted, marginLeft: 10 }}>
                {presence.length} online
              </span>
            </div>
            <span style={{ width: 1, height: 26, background: t.border }} />
            <div className="cw-hover-surface" style={s.accountChip} title={user?.email || ''}>
              <Avatar name={user?.name} initials={initialsOf(user)} seed={user?.userId} size={30} />
              <div style={{ lineHeight: 1.15 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name || user?.email || 'Signed in'}</div>
                <div style={{ fontSize: 11, color: t.faint }}>Account</div>
              </div>
              <Icon name="chevron-down" size={15} color={t.faint} />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* ── Left nav ── */}
          <div style={s.nav}>
            <div style={s.navLabel}>CONSOLE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {NAV.map((item) => {
                const on = item.key === page;
                const badge = item.key === 'important' && needsReview > 0 ? needsReview : null;
                const notamDot = item.key === 'notam-check' && notamSign !== 'NONE' ? notamSign : null;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={on ? '' : 'cw-hover-surface'}
                    onClick={() => navigate({ surface: 'console', page: item.key })}
                    style={{
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 11px',
                      border: 'none',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontSize: 14.5,
                      fontWeight: on ? 700 : 500,
                      background: on ? t.blueTint : 'transparent',
                      color: on ? t.blueDeep : t.body,
                    }}
                  >
                    <Icon name={item.icon} size={18} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {badge && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: t.red,
                          background: t.redTint,
                          padding: '2px 7px',
                          borderRadius: 6,
                        }}
                      >
                        {badge}
                      </span>
                    )}
                    {notamDot && (
                      <span
                        title={notamDot === 'CHECKED' ? 'All airports checked' : 'NOTAMs need checking'}
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: notamDot === 'CHECKED' ? t.greenDeep : t.red,
                          background: notamDot === 'CHECKED' ? t.greenTint : t.redTint,
                          padding: '2px 7px',
                          borderRadius: 6,
                        }}
                      >
                        {notamDot === 'CHECKED' ? '✓' : '!'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1 }} />
            <div style={s.syncCard}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
                Sync status
                <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: healthy === null ? t.border : healthy ? t.green : t.red }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.border }} />
                </span>
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.45, color: t.faint }}>
                {sync
                  ? healthy
                    ? `Leon feed healthy · last sync ${timeAgo(sync.lastRunAt)}`
                    : `Sync error · ${sync.lastError || 'see Operators page'}`
                  : 'Checking sync status…'}
              </div>
            </div>
          </div>

          {/* ── Content ── */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: t.surface }}>
            <div style={{ padding: '30px 34px', maxWidth: 1240 }}>
              <div key={page} className="cw-fade">
                {renderPage()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}

const s = {
  shell: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: t.surface,
  },
  topBar: {
    height: 64,
    background: t.card,
    borderBottom: `1px solid ${t.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 22px',
    flex: 'none',
  },
  logoMark: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: `2px solid ${t.ink}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoDot: { width: 9, height: 9, borderRadius: '50%', background: t.ink },
  accountChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 12px 6px 8px',
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    cursor: 'default',
    background: t.card,
  },
  nav: {
    width: 236,
    background: t.card,
    borderRight: `1px solid ${t.border}`,
    flex: 'none',
    display: 'flex',
    flexDirection: 'column',
    padding: '18px 14px',
  },
  navLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '0.13em',
    color: '#9aa0a8',
    padding: '0 10px 12px',
  },
  syncCard: {
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    padding: '13px 14px',
    background: t.subtle,
  },
};
