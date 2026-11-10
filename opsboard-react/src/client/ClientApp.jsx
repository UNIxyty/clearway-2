// The client's Timeline and Flights (2026-11-10, designs "Client View v2" and "Phone Views"). This is the wall app's
// third surface, framed by the portal's client shell at /client and /client/flights (?in=client). It is the ops
// display with things taken away: the same Board, the same fetches, the same live stream, fed by the wall backend's
// client-scoped answers (digital-wall/lib/client-scope.mjs decides what a client is sent; nothing here filters for
// safety). What the client takes away for themselves — hiding an operator or an aircraft on screen — is a view
// filter saved on their account through the portal (clientApi.js), never a change to what the server sends.
//
// Below PHONE_MAX the phone views draw (ClientPhone); above, the desk (ClientDesk). Both read the same state here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDisplayClocks, fetchTimelineAircraft } from '../services/timelineApi';
import { subscribeWallStream } from '../services/wallStream';
import { WallColorsProvider } from '../theme/WallColorsContext';
import { WallDisplayProvider } from '../theme/WallDisplayContext';
import { applyPortalTheme, readChoice, THEME_KEY } from '../theme/portalTheme';
import { FALLBACK_CLOCKS } from '../components/Header';
import { errorText } from '../services/errorText';
import { PHONE_MAX, applyHidden, fetchMe, fetchPrefs, fetchSyncStatus, normalisePrefs, onShellMessage, savePrefs, tellShell } from './clientApi';
import { clientWallColors } from './clientColors';
import ClientDesk from './ClientDesk';
import ClientPhone from './ClientPhone';
import '../../../shared/portal-tokens.css';
import '../../../shared/client-tokens.css';
import '../../../shared/timeline-tokens.css';
import './client.css';

const POLL_MS = 60_000;

/**
 * The client's theme: the portal's choice on this device (localStorage cw-theme, shared with the shell on the same
 * origin) or the system's. Never the staff hook (usePortalTheme), which asks /api/user/preferences — a staff route a
 * client may not reach (the request walk found it, 2026-11-10).
 */
function useClientTheme() {
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

function pageFromLocation() {
  const p = new URLSearchParams(window.location.search).get('page');
  return p === 'flights' ? 'flights' : 'timeline';
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
  const [width, setWidth] = useState(() => window.innerWidth);
  const loadingRef = useRef(false);

  // the shell's sidebar changes the page; a change made inside tells the shell
  useEffect(() => onShellMessage((m) => { if (m.type === 'page' && (m.page === 'timeline' || m.page === 'flights')) setPage(m.page); }), []);
  const goPage = useCallback((next) => { setPage(next); tellShell({ type: 'page', page: next }); }, []);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
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

  // hide switches: saved on the account; applied here as a view filter only
  const setHidden = useCallback((hidden) => {
    const next = { ...prefs, hidden };
    setPrefs(next);
    savePrefs({ hidden }).then((saved) => setPrefs((cur) => ({ ...cur, hidden: saved.hidden }))).catch(() => {});
  }, [prefs]);

  const visible = useMemo(() => applyHidden(aircraft, prefs.hidden), [aircraft, prefs.hidden]);
  const colors = useMemo(() => clientWallColors(theme), [theme]);
  const shared = {
    page, goPage, me, prefs, prefsLoaded, setHidden, aircraft, visible, windowStartUtc, windowEndUtc, clocks, loadedOnce, error,
    dataUpdatedAt, feed, serviceOn, onReload: loadTimeline, theme,
  };

  return (
    <WallColorsProvider colors={colors}>
      <WallDisplayProvider settings={{}}>
        {/* the portal's tokens come with this chunk's stylesheet, so the client surface follows the portal's theme */}
        <div data-client-surface={width <= PHONE_MAX ? 'phone' : 'desk'} data-theme={theme} className="cw-client">
          {width <= PHONE_MAX ? <ClientPhone {...shared} /> : <ClientDesk {...shared} />}
        </div>
      </WallDisplayProvider>
    </WallColorsProvider>
  );
}
