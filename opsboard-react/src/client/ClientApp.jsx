// The client's Timeline and Flights (2026-11-10; the v3 look 2026-11-13, design "Client Portal v3"). This is the wall app's
// third surface, framed by the portal's client shell at /client and /client/flights (?in=client). It is the ops
// display with things taken away: the same Board, the same fetches, the same live stream, fed by the wall backend's
// client-scoped answers (digital-wall/lib/client-scope.mjs decides what a client is sent; nothing here filters for
// safety). What the client takes away for themselves — hiding an operator or an aircraft on screen — is a view
// filter saved on their account through the portal (clientApi.js), never a change to what the server sends.
//
// This surface is the DESK only (2026-11-13). A client on a phone is sent to the phone app (/digital-wall/phone/) by
// the portal's shell before this frame matters; the one page a phone still opens here is Display settings, which
// folds its sections when the WINDOW is phone-wide (the frame itself is narrower than the window by the sidebar, so
// its own width says nothing about the device).
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDisplayClocks, fetchTimelineAircraft } from '../services/timelineApi';
import { subscribeWallStream } from '../services/wallStream';
import { WallColorsProvider } from '../theme/WallColorsContext';
import { WallDisplayProvider } from '../theme/WallDisplayContext';
import { applyPortalTheme, readChoice, THEME_KEY } from '../theme/portalTheme';
import { FALLBACK_CLOCKS } from '../components/Header';
import { errorText } from '../services/errorText';
import { PHONE_MAX, applyHidden, fetchMe, fetchPrefs, fetchSyncStatus, fetchView, normalisePrefs, onShellMessage, savePrefs, tellShell } from './clientApi';
import { applyWallFont } from '../theme/wallFont';
import { clientWallColors } from './clientColors';
import ClientDesk from './ClientDesk';
import ErrorBoundary from '../components/ErrorBoundary';
// the settings page carries the ops console's look cards: loaded only when opened
const ClientSettings = lazy(() => import('./ClientSettings'));
import '../../../shared/portal-tokens.css';
import '../../../shared/client-tokens.css';
import '../../../shared/timeline-tokens.css';
import './client.css';

const POLL_MS = 60_000;
// a colour of the client's own (Display settings) and the timeline token the legend and the swatches read
const TL_OF = [['stateScheduled', '--tl-scheduled'], ['stateDelayed', '--tl-delayed'], ['stateCtot', '--tl-ctot'], ['stateAirborne', '--tl-flying'], ['stateArrived', '--tl-arrived'], ['stateAog', '--tl-aog'], ['clockUtc', '--tl-clock']];

/**
 * The client's theme: the portal's choice on this device (localStorage cw-theme, shared with the shell on the same
 * origin) or the system's. Never the staff hook (usePortalTheme), which asks /api/user/preferences — a staff route a
 * client may not reach (the request walk found it, 2026-11-10).
 */
export function useClientTheme() {
  const [theme, setTheme] = useState(() => applyPortalTheme(readChoice()));
  useEffect(() => {
    const sync = () => setTheme(applyPortalTheme(readChoice()));
    const onStorage = (e) => { if (e.key === THEME_KEY) sync(); };
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    window.addEventListener('storage', onStorage); window.addEventListener('cw-theme-change', sync); mq?.addEventListener?.('change', sync);
    const id = setInterval(sync, 2000); // the shell's theme button writes localStorage in the parent: storage events do not fire in the writer's own frame, so look every two seconds
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('cw-theme-change', sync); mq?.removeEventListener?.('change', sync); clearInterval(id); };
  }, []);
  return theme;
}

/** The window's width, not the frame's: the shell's sidebar takes 248 px of it, and the layout follows the device. */
function windowWidth() {
  try { return window.top.innerWidth || window.innerWidth; } catch { return window.innerWidth; }
}

function pageFromLocation() {
  const p = new URLSearchParams(window.location.search).get('page');
  return p === 'flights' ? 'flights' : p === 'settings' ? 'settings' : 'timeline';
}

export default function ClientApp() {
  const theme = useClientTheme();
  const [page, setPage] = useState(pageFromLocation);
  const [me, setMe] = useState(null);
  const [prefs, setPrefs] = useState(() => normalisePrefs(null));
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [aircraft, setAircraft] = useState([]);
  const [windowStartUtc, setWindowStartUtc] = useState('');
  const [windowEndUtc, setWindowEndUtc] = useState('');
  const [clocks, setClocks] = useState(FALLBACK_CLOCKS);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [dataUpdatedAt, setDataUpdatedAt] = useState(0);
  const [feed, setFeed] = useState(null);
  const [width, setWidth] = useState(windowWidth);
  const loadingRef = useRef(false);

  // the shell's sidebar changes the page; a change made inside tells the shell
  useEffect(() => onShellMessage((m) => { if (m.type === 'page' && (m.page === 'timeline' || m.page === 'flights' || m.page === 'settings')) setPage(m.page); }), []);

  // the look of their timeline (2026-11-11): their own profile at the wall, re-read when a save broadcasts; the font
  // goes on <html> as the display does it, the rest reaches the Board as props and the chips through WallDisplayProvider
  useEffect(() => { document.documentElement.classList.add('cw-client-doc'); return () => document.documentElement.classList.remove('cw-client-doc'); }, []);
  const [view, setView] = useState(null);
  const loadView = useCallback(() => fetchView().then((v) => { setView(v); applyWallFont(v?.settings?.font, v?.settings?.zeroStyle); }).catch(() => {}), []);
  useEffect(() => { loadView(); return subscribeWallStream('config.changed', (event) => { if (!event.section || event.section === 'settings') loadView(); }); }, [loadView]);
  const goPage = useCallback((next) => { setPage(next); tellShell({ type: 'page', page: next }); }, []);

  useEffect(() => {
    const onResize = () => setWidth(windowWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadTimeline = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const result = await fetchTimelineAircraft({ refresh: false });
      setAircraft(result.aircraft);
      setWindowStartUtc(result.windowStartUtc || '');
      setWindowEndUtc(result.windowEndUtc || '');
      setError('');
      setDataUpdatedAt(Date.now());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoadedOnce(true);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchMe().then((m) => { if (m) setMe(m); });
    fetchPrefs().then((p) => { setPrefs(p); setPrefsLoaded(true); });
    loadTimeline();
    fetchDisplayClocks().then((p) => { if (Array.isArray(p.clocks) && p.clocks.length) setClocks(p.clocks); }).catch(() => {});
    const id = setInterval(loadTimeline, POLL_MS);
    const unsubs = ['limitations.changed', 'important.changed', 'caa.changed', 'roster.changed', 'flight.changed', 'weather.changed']
      .map((ev) => subscribeWallStream(ev, loadTimeline));
    unsubs.push(subscribeWallStream('config.changed', (event) => { if (!event.section || event.section === 'clocks') fetchDisplayClocks().then((p) => { if (Array.isArray(p.clocks) && p.clocks.length) setClocks(p.clocks); }).catch(() => {}); }));
    return () => { clearInterval(id); unsubs.forEach((u) => u()); };
  }, [loadTimeline]);

  // the "not live" line: the feed's own verdict, when the service_status switch lets the client read it
  const serviceOn = Boolean(me?.switches?.includes('service_status'));
  useEffect(() => {
    if (!serviceOn) return undefined;
    let stop = false;
    const read = () => fetchSyncStatus().then((s) => { if (!stop) setFeed(s); });
    read();
    const id = setInterval(read, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [serviceOn]);

  // hide switches: saved on the account; applied here as a view filter only. The screen follows the switch at once
  // (it is only a view); "Remembered for next time" is said only while the last save went through
  const [hideSaveFailed, setHideSaveFailed] = useState(false);
  const setHidden = useCallback((hidden) => {
    const next = { ...prefs, hidden };
    setPrefs(next);
    savePrefs({ hidden }).then((saved) => { setPrefs((cur) => ({ ...cur, hidden: saved.hidden })); setHideSaveFailed(false); }).catch(() => setHideSaveFailed(true));
  }, [prefs]);

  const visible = useMemo(() => applyHidden(aircraft, prefs.hidden), [aircraft, prefs.hidden]);
  // the theme's palette, then the person's own colour overrides on top (the wall's colour keys)
  const colors = useMemo(() => ({ ...clientWallColors(theme), ...(view?.settings?.colors ?? {}) }), [theme, view]);
  // the legend and the status swatches follow a colour the person changed in Display settings (this frame only)
  const ownTokens = useMemo(() => {
    const own = view?.settings?.colors ?? {}; const out = {};
    for (const [k, v] of TL_OF) if (typeof own[k] === 'string' && own[k]) out[v] = own[k];
    return out;
  }, [view]);
  const look = useMemo(() => { const s = view?.settings ?? {}; const n = (k, d) => (Number.isFinite(s[k]) ? s[k] : d); return { scale: n('scale', 1.3), timeZoom: n('timeZoom', 1), rowZoom: n('rowZoom', 1), pillHeight: n('pillHeight', 1), markerScale: n('markerScale', 1), labelScale: n('labelScale', 1), acColScale: n('acColScale', 1), autoFitRows: s.autoFitRows === true }; }, [view]);
  const shared = {
    page, goPage, me, prefs, prefsLoaded, setHidden, hideSaveFailed, aircraft, visible, windowStartUtc, windowEndUtc, clocks, loadedOnce, error,
    dataUpdatedAt, feed, serviceOn, onReload: loadTimeline, theme, look, view, onViewChanged: (v) => { if (v?.settings) { setView((cur) => ({ ...(cur ?? {}), ...v })); applyWallFont(v.settings.font, v.settings.zeroStyle); } },
  };
  const phone = width <= PHONE_MAX;
  const settings = page === 'settings' ? (
    <ErrorBoundary where="client/settings">
      <Suspense fallback={<p className="cwd-loading">Loading the settings…</p>}>
        <ClientSettings visible={visible} windowStartUtc={windowStartUtc} windowEndUtc={windowEndUtc} view={view} onViewChanged={shared.onViewChanged} phone={phone} goPage={goPage} />
      </Suspense>
    </ErrorBoundary>
  ) : null;

  return (
    <WallColorsProvider colors={colors}>
      <WallDisplayProvider settings={view?.settings ?? {}}>
        {/* the portal's tokens come with this chunk's stylesheet, so the client surface follows the portal's theme */}
        <div data-client-surface={phone ? 'phone' : 'desk'} data-theme={theme} className="cw-client" style={ownTokens}>
          {settings ?? <ClientDesk {...shared} />}
        </div>
      </WallDisplayProvider>
    </WallColorsProvider>
  );
}
