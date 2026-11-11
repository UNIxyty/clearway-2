// The Digital Wall on a staff phone (design "Phone Views" › Staff, built 2026-11-12): the wall app's own phone app at
// /digital-wall/timeline/ for a signed-in person on a phone, with the design's five tabs — Timeline, NOTAM, Limits,
// Important, More. Staff and clients share one surface: the Timeline tab IS the client phone (ClientPhone) with the
// staff parts on — every section, the unconfirmed ring, both markers, the open checks as chips, the five checks on the
// flight page (StaffChecks) and the passengers with their documents in the shared viewer (shared/passenger-viewer.jsx,
// one normal tap to show a document). The NOTAM, Limits and Important tabs and the More pages are the console's own
// pages (NotamCheckPage, LimitationsPage, ImportantPage, Operators, Aircraft, CAA, Reports, Settings), loaded only when
// opened; the portal's remaining phone pages (Users, Maintenance, Agent, Intake…) are reached from More as links.
// Follows the portal's theme and tokens, as the design says. The look is this person's own display profile.
//
// Deep links: ?flight=<id> opens that flight; #notam / #limits / #important / #more open a tab. The old /m/wall door
// keeps the October phone wall (phone/PhoneWall.jsx) until the move is complete — see the 2026-11-12 report.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { WallColorsProvider } from '../theme/WallColorsContext';
import { useWallDisplay } from '../theme/WallDisplayContext';
import { useAuth, useCanAction } from '../AuthGate';
import { ConsoleStyles, PermissionsProvider, ToastProvider } from '../components/console/ui';
import PassengerViewer from '../../../shared/passenger-viewer.jsx';
import { useClientTheme } from './ClientApp';
import { clientWallColors } from './clientColors';
import ClientPhone from './ClientPhone';
import StaffChecks, { openCheckChips } from './StaffChecks';
import { readView } from './clientApi';
import '../../../shared/portal-tokens.css';
import '../../../shared/client-tokens.css';
import '../../../shared/timeline-tokens.css';
import './client.css';

const NotamCheckPage = lazy(() => import('../components/console/NotamCheckPage'));
const LimitationsPage = lazy(() => import('../components/console/LimitationsPage'));
const ImportantPage = lazy(() => import('../components/console/ImportantPage'));
const OperatorsPage = lazy(() => import('../components/console/OperatorsPage'));
const AircraftPage = lazy(() => import('../components/console/AircraftPage'));
const CaaPage = lazy(() => import('../components/console/CaaPage'));
const ReportsPage = lazy(() => import('../components/console/ReportsPage'));
const SettingsPage = lazy(() => import('../components/console/SettingsPage'));

// staff see every section a client could, and passengers with their documents
const STAFF = { switches: ['flight_board', 'weather', 'notams', 'limitations', 'important', 'caa', 'radar', 'service_status', 'notam_check_status'], passengerLevel: 'documents' };
const NO_HIDE = { start: 'timeline', hidden: { operators: [], registrations: [] } };
const TABS = [['timeline', 'Timeline', 'chart-gantt'], ['notam', 'NOTAM', 'file-check'], ['limits', 'Limits', 'triangle-alert'], ['important', 'Important', 'megaphone'], ['more', 'More', 'menu']];
const MORE = [
  { k: 'operators', t: 'Operators', line: 'Who flies on the wall', page: OperatorsPage },
  { k: 'aircraft', t: 'Aircraft', line: 'Tails, hidden ones too', page: AircraftPage },
  { k: 'caa', t: 'CAA details', line: 'Authorities and their numbers', page: CaaPage },
  { k: 'reports', t: 'Reports', line: 'Reports sent from the wall', page: ReportsPage },
  { k: 'settings', t: 'Wall settings', line: 'Read on the phone; change them at a desk', page: SettingsPage },
  { k: 'users', t: 'Users', line: 'The portal', href: '/m/users' }, { k: 'maintenance', t: 'Maintenance', line: 'The portal', href: '/m/maintenance' },
  { k: 'agent', t: 'Agent', line: 'The portal', href: '/m/agent' }, { k: 'intake', t: 'Flight intake', line: 'The portal', href: '/m/intake' },
  { k: 'mailbox', t: 'Mailbox', line: 'The portal', href: '/m/mailbox' }, { k: 'airport', t: 'Airport search', line: 'The portal', href: '/m/airport' },
  { k: 'profile', t: 'Profile', line: 'The portal', href: '/m/profile' }, { k: 'webhooks', t: 'Webhooks', line: 'Desk', href: '/digital-wall/console/webhooks', desk: true },
];

const agentJson = async (path, init) => { const r = await fetch(`/agent/api${path}`, { credentials: 'same-origin', cache: 'no-store', ...init }); const j = await r.json().catch(() => null); if (!r.ok || j?.ok === false) { const e = new Error(typeof j?.message === 'string' ? j.message : `The agent answered ${r.status}.`); e.shown = true; throw e; } return j; };

/** The passengers sheet for staff: the shared viewer, names first, a document on one tap, in the portal's calm colours. */
// the viewer's icons from the portal's own set (public/icons, the same files the tab bar uses), drawn as a mask
const paxIcon = (name, size, color) => <span className="cwsp-icon" style={{ width: size, height: size, background: color || 'currentColor', WebkitMaskImage: `url(/icons/${name}.svg)`, maskImage: `url(/icons/${name}.svg)` }} aria-hidden />;

function StaffPax({ p, onClose }) {
  const { user } = useAuth();
  const id = `${p.oprId}:${p.flightNid}`;
  return (
    <>
      <div className="cwp-scrim" onClick={onClose} />
      <div className="cwp-sheet" role="dialog" aria-label="Passengers" data-pax-sheet="">
        <div className="cwp-handle" />
        <div className="cwp-sheet-head"><span><b>Passengers</b><small className="cwd-mono">{p.fn} · {p.dep} → {p.arr}</small></span><button type="button" className="cwd-icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="cwp-sheet-body">
          <PassengerViewer phone icon={paxIcon} viewer={{ name: user?.name || user?.email || 'Viewer' }} api={{ list: () => agentJson(`/flights/${encodeURIComponent(id)}/passengers`), reveal: (pid) => agentJson(`/flights/${encodeURIComponent(id)}/passengers/${encodeURIComponent(pid)}/reveal`, { method: 'POST' }) }} />
        </div>
      </div>
    </>
  );
}

function tabFromHash() { const h = (window.location.hash || '').replace('#', ''); return TABS.some(([k]) => k === h) ? h : 'timeline'; }

export default function StaffPhone({ aircraft = [], windowStartUtc, windowEndUtc, clocks = [], loadedOnce, error, onReload, settings = {}, initialFlightId = null }) {
  const theme = useClientTheme();
  const can = useCanAction();
  const [tab, setTab] = useState(tabFromHash);
  const [page, setPage] = useState('timeline');
  const [more, setMore] = useState(null);
  const display = useWallDisplay();
  useEffect(() => { document.documentElement.classList.add('cw-client-doc', 'cw-staff-phone-doc'); return () => document.documentElement.classList.remove('cw-client-doc', 'cw-staff-phone-doc'); }, []);
  useEffect(() => { const on = () => setTab(tabFromHash()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const go = (k) => { setTab(k); setMore(null); if (window.location.hash !== `#${k}`) window.history.replaceState(null, '', k === 'timeline' ? window.location.pathname + window.location.search : `#${k}`); window.scrollTo(0, 0); };
  const colors = useMemo(() => ({ ...clientWallColors(theme), ...(display?.colors ?? {}) }), [theme, display]);
  const look = useMemo(() => { const n = (k, d) => (Number.isFinite(settings[k]) ? settings[k] : d); return { scale: n('scale', 1.3), timeZoom: n('timeZoom', 1), rowZoom: n('rowZoom', 1), pillHeight: n('pillHeight', 1), markerScale: n('markerScale', 1), labelScale: n('labelScale', 1), acColScale: n('acColScale', 1), autoFitRows: settings.autoFitRows === true }; }, [settings]);
  const staffParts = useMemo(() => ({ Checks: StaffChecks, openChips: openCheckChips, Pax: StaffPax }), []);
  // a deep link to a flight (?flight=) opens it once, unless the person already moved inside
  const initialOpenId = useMemo(() => (initialFlightId && !readView().openId ? initialFlightId : null), [initialFlightId]);
  const consolePage = (node) => <PermissionsProvider can={can}><ConsoleStyles /><div className="cw-kit cws-console" data-staff-console="">{node}</div></PermissionsProvider>;
  const moreItem = MORE.find((m) => m.k === more);
  return (
    <WallColorsProvider colors={colors}>
      <ToastProvider>
        <div data-client-surface="phone" data-staff-phone="" data-staff-tab={tab} data-theme={theme} className="cw-client cw-staff-phone">
          <div className="cwsp-body">
            {tab === 'timeline' && (
              <ClientPhone role="staff" staffParts={staffParts} page={page} goPage={setPage} me={STAFF} prefs={NO_HIDE} setHidden={() => {}} aircraft={aircraft} visible={aircraft}
                windowStartUtc={windowStartUtc} windowEndUtc={windowEndUtc} clocks={clocks} loadedOnce={loadedOnce} error={error} feed={null} serviceOn={false} onReload={onReload} look={look} initialOpenId={initialOpenId} />
            )}
            <Suspense fallback={<p className="cwd-muted" style={{ padding: 24 }}>Loading…</p>}>
              {tab === 'notam' && consolePage(<NotamCheckPage navigate={() => go('timeline')} />)}
              {tab === 'limits' && consolePage(<LimitationsPage />)}
              {tab === 'important' && consolePage(<ImportantPage />)}
              {tab === 'more' && !moreItem && (
                <div className="cwsp-more" data-staff-more="">
                  <h1>More</h1>
                  {MORE.map((m) => m.href
                    ? <a key={m.k} className="cwsp-row" href={m.href} data-more-item={m.k}><span><b>{m.t}</b><small>{m.line}</small></span><span className="cwd-muted">{m.desk ? 'Desk' : '›'}</span></a>
                    : <button key={m.k} type="button" className="cwsp-row" onClick={() => setMore(m.k)} data-more-item={m.k}><span><b>{m.t}</b><small>{m.line}</small></span><span className="cwd-muted">›</span></button>)}
                </div>
              )}
              {tab === 'more' && moreItem && (
                <div data-staff-more-page={moreItem.k}>
                  <div className="cwp-bar"><button type="button" className="cwp-back" onClick={() => setMore(null)} aria-label="Back to More" data-back="">‹</button><span className="cwp-bar-title"><b>{moreItem.t}</b><small>{moreItem.line}</small></span></div>
                  {consolePage(<moreItem.page />)}
                </div>
              )}
            </Suspense>
          </div>
          <nav className="cwsp-tabs" aria-label="Sections" data-staff-tabs="">
            {TABS.map(([k, label, icon]) => <button key={k} type="button" className={tab === k ? 'is-on' : ''} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined} data-tab={k}><span className="cwsp-icon" style={{ WebkitMaskImage: `url(/icons/${icon}.svg)`, maskImage: `url(/icons/${icon}.svg)` }} aria-hidden /><span>{label}</span></button>)}
          </nav>
        </div>
      </ToastProvider>
    </WallColorsProvider>
  );
}
