import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useCanAction } from './AuthGate';
import Icon from './components/console/icons';
import {
  Avatar,
  ConsoleStyles,
  t,
  timeAgo,
  ToastProvider, initialsOf, ViewOnly, ViewOnlyNote, PermissionsProvider } from './components/console/ui';
import { MOBILE } from './components/console/mobile';
import { Skel } from './components/console/ui';
import PageSkeleton from './components/console/PageSkeleton';
import { usePortalTheme } from './theme/portalTheme';
import useViewport from './hooks/useViewport';
import AircraftPage from './components/console/AircraftPage';
import NotamCheckPage from './components/console/NotamCheckPage';
import FlightsPage from './components/console/FlightsPage';
import CaaPage from './components/console/CaaPage';
import WebhooksPage from './components/console/WebhooksPage';
import ReportsPage from './components/console/ReportsPage';
import ImportantPage from './components/console/ImportantPage';
import LimitationsPage from './components/console/LimitationsPage';
import OperatorsPage from './components/console/OperatorsPage';
import SettingsPage from './components/console/SettingsPage';
import DeviceApprovalPopup from './components/console/DeviceApprovalPopup';
import { AgentNavRow } from './components/console/AgentDock';
import { useAgentDock } from './hooks/useAgentDock';
import {
  fetchImportant,
  fetchNotamCheckToday,
  fetchOverlay,
  fetchPresence,
  fetchSyncStatus,
  fetchTimelineRaw,
} from './services/timelineApi';
import { subscribeWallStream } from './services/wallStream';
import { windowCheckLine, windowRepairLine } from './services/windowCheck';

// Brand assets — opsboard-react/public/assets/ (SVG, crisp on retina), each in a light and a white variant: the
// portal's --cw-show-light / --cw-show-dark tokens pick the one for the theme (the portal's Shell does the same with
// the same files, public/brand/). Until the files exist, the components fall back to text.
const CLEARWAY_LOGO = `${import.meta.env.BASE_URL}assets/clearway-logo.svg`;
const CLEARWAY_LOGO_DARK = `${import.meta.env.BASE_URL}assets/clearway-logo-white.svg`;
// Footer credit: pre-resampled variants (125x22 / 250x44 / 375x66) — the
// original 1500x264 raster downscaled ~16:1 by the browser is what made the
// footer logo blurry; srcset picks the right density so retina stays crisp
// without ever upscaling past native resolution.
const VERXYL_FOOTER_1X = `${import.meta.env.BASE_URL}assets/verxyl-footer.png`;
const VERXYL_FOOTER_2X = `${import.meta.env.BASE_URL}assets/verxyl-footer@2x.png`;
const VERXYL_FOOTER_3X = `${import.meta.env.BASE_URL}assets/verxyl-footer@3x.png`;
const VERXYL_FOOTER_DARK = [1, 2, 3].map((n) => `${import.meta.env.BASE_URL}assets/verxyl-footer-white${n > 1 ? `@${n}x` : ''}.png`);
const VERXYL_SRCSET = `${VERXYL_FOOTER_1X} 1x, ${VERXYL_FOOTER_2X} 2x, ${VERXYL_FOOTER_3X} 3x`;
const VERXYL_SRCSET_DARK = VERXYL_FOOTER_DARK.map((u, i) => `${u} ${i + 1}x`).join(', ');
const VERXYL_URL = ''; // set when a link target is provided

function BrandLogo({ src, srcSet, srcDark, srcSetDark, alt, height, width, fallback }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  const img = (s, set, show) => (
    <img key={s} src={s} srcSet={set} alt={alt} width={width} height={height} style={{ height, width: width ?? 'auto', display: show }} onError={() => setFailed(true)} />
  );
  if (!srcDark) return img(src, srcSet, 'block');
  return <>{img(src, srcSet, 'var(--cw-show-light)')}{img(srcDark, srcSetDark, 'var(--cw-show-dark)')}</>;
}

const NAV = [
  { key: 'flights', label: 'Flights', icon: 'plane' },
  { key: 'notam-check', label: 'NOTAM Check', icon: 'clipboard-check' },
  { key: 'operators', label: 'Operators', icon: 'users' },
  { key: 'aircraft', label: 'Aircraft', icon: 'navigation' },
  { key: 'limitations', label: 'Limitations', icon: 'alert-triangle' },
  { key: 'important', label: 'Important', icon: 'star' },
  { key: 'caa', label: 'CAA details', icon: 'landmark' },
  { key: 'webhooks', label: 'Webhooks', icon: 'radar' },
  { key: 'reports', label: 'Reports', icon: 'clipboard-check' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

// initialsOf comes from ui.jsx — ONE derivation shared with the portal.

const PORTAL_HOME = '/'; // Phase 2: /dashboard

// Deep-context nav item (also used for the back / Open wall / collapse rows).
// Collapsed rail: icon-only centered, tooltip carries the label; the
// needs-review badge / NOTAM dot stay visible beside the icon.
function navItemStyle(on, collapsed) {
  return {
    fontFamily: 'inherit',
    width: '100%',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'flex-start',
    gap: collapsed ? 4 : 10,
    padding: collapsed ? '8px 0' : '8px 9px',
    border: 'none',
    borderRadius: 9,
    cursor: 'pointer',
    fontSize: 13.5,
    fontWeight: on ? 700 : 500,
    background: on ? t.blueTint : 'transparent',
    color: on ? t.blueDeep : t.body,
  };
}

/**
 * The boundary, drawn: the wall display is not themed by the portal. It keeps this ops room's own colours and font
 * (wall settings), so the card that opens it is dashed, tagged OWN COLOURS, and sits at the foot of the nav
 * ("Console Screen.dc.html"). Collapsed rail: the same, as one icon with the full text as its tooltip.
 */
function WallDisplayCard({ collapsed }) {
  const open = () => window.open('/digital-wall/timeline/', '_blank');
  if (collapsed) {
    return (
      <button type="button" className="cw-hover-surface" title="Wall display · its own colours, not the portal's theme · open" onClick={open} style={{ ...navItemStyle(false, true), border: `1.5px dashed ${t.borderStrong}`, marginBottom: 10 }}>
        <Icon name="monitor" size={17} />
      </button>
    );
  }
  // Compact (a title row and a tag line), so the ten pages, this card, the sync card and the badge all fit a 900 px screen.
  return (
    <div data-wall-display-card style={{ border: `1.5px dashed ${t.borderStrong}`, borderRadius: 12, padding: '9px 10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="monitor" size={15} color={t.body} />
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1, whiteSpace: 'nowrap' }}>Wall display</span>
        <button type="button" className="cw-hover-surface" title="Open the wall display" aria-label="Open the wall display" onClick={open} style={{ fontFamily: 'inherit', width: 26, height: 26, borderRadius: 8, border: `1px solid ${t.borderInput}`, background: t.card, color: t.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
          <Icon name="arrow-up-right" size={14} />
        </button>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, lineHeight: 1.4, color: t.muted }}>
        <span style={{ height: 18, padding: '0 5px', borderRadius: 5, border: `1px solid ${t.borderInput}`, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.03em', color: t.muted, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', flex: 'none' }}>OWN COLOURS</span>
        Not themed by the portal.
      </span>
    </div>
  );
}

/**
 * User badge pinned to the sidebar bottom — the platform deep-context
 * pattern. Click opens the REDUCED account menu as a white card ABOVE the
 * badge: identity header + Profile / Notification settings / Search
 * statistics / Guide / Sign out. Portal paths are full navigations (the
 * shared gateway session carries).
 */
function UserBadge({ user, collapsed, booting = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const go = (path) => () => window.location.assign(path);
  // Sign out for real: the portal ends the session on the server and lands on sign-in. (Going to /login alone
  // bounced a signed-in person straight back.) A POST, so nothing but this menu can trigger it.
  const signOut = () => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/sign-out';
    document.body.appendChild(form);
    form.submit();
  };
  const item = (label, icon, onClick) => (
    <button
      key={label}
      type="button"
      className="cw-hover-surface"
      onClick={onClick}
      style={{
        fontFamily: 'inherit',
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 11px',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
        color: t.body,
        background: 'transparent',
      }}
    >
      <Icon name={icon} size={17} color={t.muted} />
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );

  // Booting: the slot holds its space (the design's role-gated skeleton), so the sidebar never shifts when the person arrives.
  if (booting) {
    return (
      <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, padding: collapsed ? '6px 0' : '6px 8px' }}>
        <Skel w={28} h={28} round={14} still />
        {!collapsed && <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}><Skel w={110} h={10} /><Skel w={54} h={8} still /></span>}
      </div>
    );
  }
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="cw-hover-surface"
        onClick={() => setOpen((v) => !v)}
        title={user?.email || ''}
        style={{
          fontFamily: 'inherit',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          padding: collapsed ? '6px 0' : '6px 8px',
          border: 'none',
          borderRadius: 10,
          cursor: 'pointer',
          background: 'transparent',
          textAlign: 'left',
        }}
      >
        <Avatar name={user?.name} initials={initialsOf(user?.name || user?.email)} seed={user?.userId} size={28} color={t.blue} />
        {!collapsed && (
          <>
            <div style={{ lineHeight: 1.15, minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || user?.email || 'Signed in'}
              </div>
              <div style={{ fontSize: 11, color: t.faint }}>{user?.role || 'Account'}</div>
            </div>
            <Icon name={open ? 'chevron-down' : 'chevron-up'} size={15} color={t.faint} />
          </>
        )}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: 0,
            width: 240,
            background: t.raised,
            border: `1px solid ${t.border}`,
            borderRadius: 14,
            boxShadow: t.shadowPop,
            padding: 7,
            zIndex: 200,
          }}
        >
          <div style={{ padding: '8px 11px 6px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{user?.name || user?.email || 'Signed in'}</div>
            {user?.email && (
              <div style={{ fontFamily: t.mono, fontSize: 11.5, color: t.faint, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
              </div>
            )}
          </div>
          <div style={{ height: 1, background: t.borderInner, margin: '2px 4px 7px' }} />
          {item('Profile', 'user', go('/account/profile'))}
          {item('Guide', 'book-open', () => window.open('/digital-wall/guide/', '_blank', 'noopener,noreferrer'))}
          {item('Sign out', 'log-out', signOut)}
        </div>
      )}
    </div>
  );
}

/**
 * The Display Console shell: white top bar with the wall-live pill +
 * presence stack, and the platform DEEP-CONTEXT sidebar — back to All
 * services, Digital Wall context head, Open wall + console pages,
 * sync-status card, user badge, collapse rail (248px / 68px).
 */
export default function ConsoleApp({ page, navigate }) {
  const { user, booting } = useAuth();
  // The portal's theme: data-theme on <html> before the first paint, then kept current (theme/portalTheme.js).
  usePortalTheme();
  const can = useCanAction();
  // Ops Agent side panel (⌘J) — hosted from the portal, see AgentDock.
  const agent = useAgentDock({ page, label: NAV.find((n) => n.key === page)?.label });
  // Breakpoints (design section E, width only — the console ignores rotation):
  //   <1024        drawer navigation + 56px top bar (C1/C2, D2)
  //   1024–1279    desktop shape, rail DEFAULTS collapsed to 68px (D1)
  //   ≥1280        today's behaviour, byte-identical (persisted preference)
  const { width } = useViewport();
  const isMobile = width < 1024;
  const isTabletLandscape = width >= 1024 && width < 1280;
  const [drawerOpen, setDrawerOpen] = useState(false);
  // D1: at 1024–1279 the rail defaults to collapsed because expanding it
  // would push the detail under 500px — still user-toggleable, but the
  // session override never touches the persisted desktop preference.
  const [tabletExpanded, setTabletExpanded] = useState(false);
  const [collapsedPref, setCollapsedPref] = useState(() => {
    try {
      return localStorage.getItem('cw-console-collapsed') === '1';
    } catch {
      return false;
    }
  });
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
        glow: t.greenTint,
        color: t.greenDeep,
        label: `Wall live · ${wallFlight?.callsign ?? '…'} on screen`,
      };
    }
    return {
      bg: t.subtle,
      border: t.border,
      dot: t.faint,
      glow: t.wash,
      color: t.muted,
      label: 'Wall idle · no flight',
    };
  }, [overlay.open, wallFlight]);

  const healthy = sync ? sync.healthy !== false : null;
  // Second dot + line: the flight-count check (bug report 7 follow-up item 2).
  const countLine = windowCheckLine(sync?.windowCheck ?? null);
  const repairLine = windowRepairLine(sync?.windowCheck ?? null);
  const countDot = !countLine ? t.border : countLine.level === 'error' ? t.red : countLine.level === 'warn' ? (t.amber ?? t.red) : t.green;

  // What the rail actually renders at: tablet landscape overrides the
  // persisted preference (default collapsed), ≥1280 is exactly the pref —
  // the desktop tree below keeps reading `collapsed` unchanged.
  const collapsed = isTabletLandscape ? !tabletExpanded : collapsedPref;

  function toggleCollapsed() {
    if (isTabletLandscape) {
      setTabletExpanded((v) => !v);
      return;
    }
    setCollapsedPref((v) => {
      const next = !v;
      try {
        localStorage.setItem('cw-console-collapsed', next ? '1' : '0');
      } catch {
        /* storage unavailable — state still toggles for the session */
      }
      return next;
    });
  }

  // Drawer closes on navigation (C2).
  function go(pageKey) {
    setDrawerOpen(false);
    navigate({ surface: 'console', page: pageKey });
  }

  // Everyone sees these pages; each control that changes something asks for its own permission (Admin → Permissions
  // in the portal). With none of a page's permissions, the page says it is view only. The wall server checks every
  // write itself regardless.
  const PAGE_ACTIONS = {
    operators: ['wall.operators.create', 'wall.operators.edit', 'wall.operators.delete'],
    aircraft: ['wall.aircraft.visibility', 'wall.aircraft.delete'],
    limitations: ['wall.limitations.create', 'wall.limitations.edit', 'wall.limitations.delete', 'wall.limitations.restore', 'wall.limitations.purge'],
    important: ['wall.imp.create', 'wall.imp.edit', 'wall.imp.delete', 'wall.imp.attachments', 'wall.imp.restore', 'wall.imp.purge'],
    caa: ['wall.caa.create', 'wall.caa.edit', 'wall.caa.delete'],
    webhooks: ['wall.webhooks.toggle', 'wall.webhooks.reregister', 'wall.webhooks.delete'],
  };
  const adminPage = (node, key) => {
    const none = !PAGE_ACTIONS[key].some(can);
    return (
      <ViewOnly when={none}>
        <ViewOnlyNote />
        {node}
      </ViewOnly>
    );
  };

  function renderPage() {
    if (booting) return <PageSkeleton page={page} />;
    switch (page) {
      case 'notam-check':
        return <NotamCheckPage navigate={navigate} />;
      case 'operators':
        return adminPage(<OperatorsPage />, 'operators');
      case 'aircraft':
        return adminPage(<AircraftPage />, 'aircraft');
      case 'limitations':
        return adminPage(<LimitationsPage />, 'limitations');
      case 'important':
        return adminPage(<ImportantPage />, 'important');
      case 'caa':
        return adminPage(<CaaPage />, 'caa');
      case 'webhooks':
        return adminPage(<WebhooksPage />, 'webhooks');
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'flights':
      default:
        return <FlightsPage />;
    }
  }

  // ── <1024: drawer navigation + 56px top bar (design C1/C2, D2) ──────────
  if (isMobile) {
    const activeNav = NAV.find((item) => item.key === page) || NAV[0];
    const drawerRow = ({ key, label, icon, on = false, onClick, badge = null, badgeStyle = null }) => (
      <button
        key={key}
        type="button"
        className={on ? '' : 'cw-hover-surface'}
        onClick={onClick}
        style={{
          fontFamily: 'inherit',
          height: 44,
          borderRadius: 10,
          padding: '0 11px',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          background: on ? t.card : 'transparent',
          color: on ? t.ink : t.body,
          fontSize: 14,
          fontWeight: on ? 700 : 500,
          textAlign: 'left',
          flex: 'none',
        }}
      >
        <Icon name={icon} size={17} color={on ? t.blue : t.muted} />
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        {badge && (
          <span
            style={{
              fontFamily: t.mono,
              fontSize: 10.5,
              fontWeight: 700,
              borderRadius: 8,
              padding: '1px 6px',
              ...badgeStyle,
            }}
          >
            {badge}
          </span>
        )}
      </button>
    );
    return (
      <PermissionsProvider can={can}>
      <ToastProvider>
        <div className="cw-console" style={{ ...s.shell, background: t.subtle }}>
          <ConsoleStyles />
          {can('wall.devices.approve') && <DeviceApprovalPopup />}

          {/* 56px top bar: 44px hamburger, page title + service context. */}
          <div
            style={{
              flex: 'none',
              height: 56,
              background: t.card,
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 8px 0 6px',
              gap: 4,
            }}
          >
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setDrawerOpen(true)}
              style={{
                fontFamily: 'inherit',
                width: 44,
                height: 44,
                borderRadius: 11,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                flex: 'none',
              }}
            >
              <span style={{ width: 17, height: 2, borderRadius: 2, background: t.ink }} />
              <span style={{ width: 17, height: 2, borderRadius: 2, background: t.ink }} />
              <span style={{ width: 17, height: 2, borderRadius: 2, background: t.ink }} />
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: t.ink, letterSpacing: '-0.01em' }}>{activeNav.label}</span>
              <span style={{ fontSize: 11.5, color: t.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Digital Wall · Riga ops room
              </span>
            </div>
            {/* Compact wall state — the desktop pill condensed to its dot. */}
            <span
              title={wallPill.label}
              style={{
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: wallPill.dot,
                  boxShadow: `0 0 0 4px ${wallPill.glow}`,
                }}
              />
            </span>
          </div>

          {/* Content column (page + footer share the scroll). */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--cw-bg-page)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', flex: 1, minWidth: 0 }}>
              <div key={page} className="cw-fade">
                {renderPage()}
              </div>
            </div>
            <div style={s.footer}>
              <span style={{ fontSize: 11.5, color: t.faint }}>Built by</span>
              <BrandLogo
                src={VERXYL_FOOTER_1X}
                srcSet={VERXYL_SRCSET}
                srcDark={VERXYL_FOOTER_DARK[0]}
                srcSetDark={VERXYL_SRCSET_DARK}
                alt="Verxyl"
                width={125}
                height={22}
                fallback={<span style={s.footerBrand}>VERXYL</span>}
              />
            </div>
          </div>

          {/* ── Drawer + scrim (C2): 300px, same grey and same order as the
                 desktop sidebar; closes on scrim tap and on navigation. ── */}
          {drawerOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex' }}>
              <div
                style={{
                  width: 300,
                  flex: 'none',
                  background: 'var(--cw-bg-sidebar)',
                  borderRight: `1px solid ${t.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px 10px 12px',
                  overflowY: 'auto',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 10px' }}>
                  <BrandLogo
                    src={CLEARWAY_LOGO}
                    srcDark={CLEARWAY_LOGO_DARK}
                    alt="Clearway"
                    height={26}
                    fallback={<span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>clearway</span>}
                  />
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setDrawerOpen(false)}
                    style={{
                      fontFamily: 'inherit',
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: t.muted,
                    }}
                  >
                    <Icon name="x" size={18} />
                  </button>
                </div>

                {/* Back to the platform home — pinned top, as on desktop. */}
                <button
                  type="button"
                  className="cw-hover-surface"
                  onClick={() => window.location.assign(PORTAL_HOME)}
                  style={{
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 44,
                    background: t.card,
                    border: `1px solid ${t.border}`,
                    borderRadius: 10,
                    padding: '9px 11px',
                    cursor: 'pointer',
                    marginBottom: 10,
                    flex: 'none',
                  }}
                >
                  <Icon name="arrow-left" size={15} color={t.faint} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.body }}>All services</span>
                </button>

                <div
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: '0.11em',
                    color: t.faint,
                    padding: '8px 10px 6px',
                  }}
                >
                  DIGITAL WALL
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {NAV.map((item) => {
                    const badge = !booting && item.key === 'important' && needsReview > 0 ? String(needsReview) : null;
                    const notamDot = !booting && item.key === 'notam-check' && notamSign !== 'NONE' ? notamSign : null;
                    return drawerRow({
                      key: item.key,
                      label: item.label,
                      icon: item.icon,
                      on: item.key === page,
                      onClick: () => go(item.key),
                      badge: badge || (notamDot ? (notamDot === 'CHECKED' ? '✓' : '!') : null),
                      badgeStyle: badge
                        ? { color: t.red, background: t.redTint }
                        : notamDot === 'CHECKED'
                          ? { color: t.greenDeep, background: t.greenTint }
                          : { color: t.red, background: t.redTint },
                    });
                  })}
                </div>
                <div style={{ flex: 1, minHeight: 12 }} />
                <WallDisplayCard collapsed={false} />
                <div style={{ ...s.syncCard, marginBottom: 10, flex: 'none' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Sync status
                    <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: healthy === null ? t.border : healthy ? t.green : t.red }} />
                      <span title="Flight count check (Leon vs wall)" style={{ width: 8, height: 8, borderRadius: '50%', background: countDot }} />
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.45, color: t.faint }}>
                    {sync
                      ? healthy
                        ? `Leon feed healthy · last sync ${timeAgo(sync.lastRunAt)}`
                        : `Sync error · ${sync.lastError || 'see Operators page'}`
                      : <Skel w="82%" h={10} style={{ margin: '3px 0' }} />}
                  </div>
                  {countLine && <div style={{ fontSize: 11.5, lineHeight: 1.45, marginTop: 4, color: countLine.level === 'error' ? t.red : countLine.level === 'warn' ? t.amber ?? t.red : t.faint, fontWeight: countLine.level === 'ok' ? 400 : 700 }}>{countLine.text}</div>}
                  {repairLine && <div style={{ fontSize: 11, lineHeight: 1.4, marginTop: 3, color: t.faint }}>{repairLine}</div>}
                </div>
                {/* User badge pinned at the bottom — exactly the desktop badge. */}
                <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 10, flex: 'none' }}>
                  <UserBadge user={user} collapsed={false} booting={booting} />
                </div>
              </div>
              <div onClick={() => setDrawerOpen(false)} style={{ flex: 1, background: MOBILE.scrim }} />
            </div>
          )}
        </div>
      </ToastProvider>
      </PermissionsProvider>
    );
  }

  return (
    <PermissionsProvider can={can}>
    <ToastProvider>
      <div className="cw-console" style={s.shell}>
        <ConsoleStyles />
        {can('wall.devices.approve') && <DeviceApprovalPopup />}

        {/* ── Top bar ── */}
        <div style={s.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BrandLogo
              src={CLEARWAY_LOGO}
              srcDark={CLEARWAY_LOGO_DARK}
              alt="Clearway"
              height={30}
              fallback={
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={s.logoMark}>
                    <span style={s.logoDot} />
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>clearway</span>
                </span>
              }
            />
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
                    style={{ border: `2px solid ${t.card}`, marginLeft: -8 }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 12.5, color: t.muted, marginLeft: 10 }}>
                {presence.length} online
              </span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* ── Sidebar: platform deep-context nav ── */}
          <div className="cw-rail" style={{ ...s.nav, width: collapsed ? 68 : 248 }}>
            {/* The rail sits on the sidebar tone, which is also the quiet hover, so rail items hover one step deeper. */}
            <style>{'.cw-console .cw-rail .cw-hover-surface:hover { background: var(--cw-bg-active) !important; }'}</style>

            {/* Back to the platform home */}
            <button
              type="button"
              className="cw-hover-surface"
              title="All services"
              onClick={() => window.location.assign(PORTAL_HOME)}
              style={{ ...navItemStyle(false, collapsed), color: t.muted, fontWeight: 600 }}
            >
              <Icon name="arrow-left" size={17} />
              {!collapsed && <span style={{ flex: 1 }}>All services</span>}
            </button>

            {/* Context head — which service this sidebar belongs to */}
            {collapsed ? (
              <div style={{ height: 10, flex: 'none' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 9px 12px' }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    background: t.blueTint,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name="monitor" size={17} color={t.blueDeep} />
                </span>
                <div style={{ minWidth: 0, lineHeight: 1.3 }}>
                  <div style={{ fontFamily: t.mono, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>Digital Wall</div>
                  <div style={{ fontSize: 12, color: t.muted }}>Riga ops room</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', overflowX: 'hidden' }}>
              {NAV.map((item) => {
                const on = item.key === page;
                const badge = !booting && item.key === 'important' && needsReview > 0 ? needsReview : null;
                const notamDot = !booting && item.key === 'notam-check' && notamSign !== 'NONE' ? notamSign : null;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={on ? '' : 'cw-hover-surface'}
                    title={item.label}
                    onClick={() => navigate({ surface: 'console', page: item.key })}
                    style={navItemStyle(on, collapsed)}
                  >
                    <Icon name={item.icon} size={17} />
                    {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                    {badge && (
                      <span
                        style={{
                          fontSize: collapsed ? 9.5 : 11,
                          fontWeight: 700,
                          color: t.red,
                          background: t.redTint,
                          padding: collapsed ? '1px 4px' : '2px 7px',
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
                          fontSize: collapsed ? 8.5 : 10,
                          fontWeight: 800,
                          color: notamDot === 'CHECKED' ? t.greenDeep : t.red,
                          background: notamDot === 'CHECKED' ? t.greenTint : t.redTint,
                          padding: collapsed ? '1px 4px' : '2px 7px',
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
            <WallDisplayCard collapsed={collapsed} />
            {!collapsed && (
              <div style={{ ...s.syncCard, marginBottom: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Sync status
                  <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: healthy === null ? t.border : healthy ? t.green : t.red }} />
                    <span title="Flight count check (Leon vs wall)" style={{ width: 8, height: 8, borderRadius: '50%', background: countDot }} />
                  </span>
                </div>
                <div style={{ fontSize: 11.5, lineHeight: 1.45, color: t.faint }}>
                  {sync
                    ? healthy
                      ? `Leon feed healthy · last sync ${timeAgo(sync.lastRunAt)}`
                      : `Sync error · ${sync.lastError || 'see Operators page'}`
                    : <Skel w="82%" h={10} style={{ margin: '3px 0' }} />}
                </div>
                {countLine && <div style={{ fontSize: 11.5, lineHeight: 1.45, marginTop: 4, color: countLine.level === 'error' ? t.red : countLine.level === 'warn' ? t.amber ?? t.red : t.faint, fontWeight: countLine.level === 'ok' ? 400 : 700 }}>{countLine.text}</div>}
                {repairLine && <div style={{ fontSize: 11, lineHeight: 1.4, marginTop: 3, color: t.faint }}>{repairLine}</div>}
              </div>
            )}
            {agent.available && <AgentNavRow collapsed={collapsed} open={agent.open} onClick={agent.toggle} keycap={agent.keycap} />}
            <UserBadge user={user} collapsed={collapsed} booting={booting} />
            <button
              type="button"
              className="cw-hover-surface"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={toggleCollapsed}
              style={{ ...navItemStyle(false, collapsed), color: t.muted, marginTop: 8 }}
            >
              <Icon name={collapsed ? 'panel-left-open' : 'panel-left-close'} size={17} />
              {!collapsed && <span style={{ flex: 1 }}>Collapse</span>}
            </button>
          </div>

          {/* ── Ops Agent dock (right of the content: order 9) ── */}
          {agent.dock}
          {/* ── Content ── */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--cw-bg-page)', display: 'flex', flexDirection: 'column' }}>
            {/* Full-bleed content: no max-width column — pages flex to the
                viewport (minus nav) so tables and detail panels use the
                whole screen on ops monitors. Padding keeps it readable. */}
            <div style={{ padding: '30px 38px', flex: 1, minWidth: 0 }}>
              <div key={page} className="cw-fade">
                {renderPage()}
              </div>
            </div>
            {/* "Built by" footer — subtle, never overlaps content (own row
                below the page, inside the scroll container). */}
            <div style={s.footer}>
              <span style={{ fontSize: 11.5, color: t.faint }}>Built by</span>
              {VERXYL_URL ? (
                <a href={VERXYL_URL} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', textDecoration: 'none' }}>
                  <BrandLogo
                    src={VERXYL_FOOTER_1X}
                    srcSet={VERXYL_SRCSET}
                srcDark={VERXYL_FOOTER_DARK[0]}
                srcSetDark={VERXYL_SRCSET_DARK}
                    alt="Verxyl"
                    width={125}
                    height={22}
                    fallback={<span style={s.footerBrand}>VERXYL</span>}
                  />
                </a>
              ) : (
                <BrandLogo
                  src={VERXYL_FOOTER_1X}
                  srcSet={VERXYL_SRCSET}
                srcDark={VERXYL_FOOTER_DARK[0]}
                srcSetDark={VERXYL_SRCSET_DARK}
                  alt="Verxyl"
                  width={125}
                  height={22}
                  fallback={<span style={s.footerBrand}>VERXYL</span>}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
    </PermissionsProvider>
  );
}

const s = {
  shell: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--cw-bg-page)',
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
  nav: {
    // width set inline: 248 expanded / 68 collapsed rail
    background: 'var(--cw-bg-sidebar)',
    borderRight: `1px solid ${t.border}`,
    flex: 'none',
    display: 'flex',
    flexDirection: 'column',
    padding: '14px 10px 12px',
    transition: 'width .18s ease',
    minHeight: 0,
  },
  syncCard: {
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    padding: '13px 14px',
    background: t.subtle,
  },
  footer: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '18px 34px 22px',
    borderTop: `1px solid ${t.borderInner}`,
    marginTop: 24,
    opacity: 0.85,
  },
  footerBrand: {
    fontFamily: t.mono,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '2.5px',
    color: t.muted,
  },
};
