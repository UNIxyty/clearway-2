import { CONSOLE_PAGES } from './router';
import { useAuth } from './AuthGate';
import AircraftPage from './components/console/AircraftPage';
import ImportantPage from './components/console/ImportantPage';
import LimitationsPage from './components/console/LimitationsPage';
import OperatorsPage from './components/console/OperatorsPage';
import SettingsPage from './components/console/SettingsPage';

const PAGE_LABELS = {
  flights: 'Flights',
  operators: 'Operators',
  aircraft: 'Aircraft',
  limitations: 'Limitations',
  important: 'Important',
  settings: 'Settings',
};

function PlaceholderPage({ title }) {
  return (
    <div style={{ padding: 24, color: '#8090b8', fontSize: 13 }}>
      {title} — coming in a later phase of this rollout.
    </div>
  );
}

/**
 * The Display Console — the management app operators use on their own
 * machines: Operators, Aircraft, Limitations, Important, Settings, plus the
 * Flights list used to drive the wall overlay.
 */
export default function ConsoleApp({ page, navigate }) {
  const { user } = useAuth();

  function renderPage() {
    switch (page) {
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
        return <PlaceholderPage title="Flights" />;
    }
  }

  return (
    <div style={s.shell}>
      <div style={s.topBar}>
        <div style={s.brand}>
          <span style={s.brandName}>CLEARWAY</span>
          <span style={s.brandSub}>DISPLAY CONSOLE</span>
        </div>
        <nav style={s.nav}>
          {CONSOLE_PAGES.map((key) => (
            <button
              key={key}
              style={{ ...s.tab, ...(page === key ? s.tabActive : {}) }}
              onClick={() => navigate({ surface: 'console', page: key })}
            >
              {PAGE_LABELS[key]}
            </button>
          ))}
        </nav>
        <div style={s.rightTools}>
          {user && <span style={s.userChip}>{user.name || user.email}</span>}
          <button
            style={s.tab}
            onClick={() => navigate({ surface: 'display' })}
            title="Open the wall display view"
          >
            Open Display →
          </button>
        </div>
      </div>
      <div style={s.content}>{renderPage()}</div>
    </div>
  );
}

const s = {
  shell: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#0f1420',
  },
  topBar: {
    height: 52,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: '0 16px',
    background: '#141926',
    borderBottom: '1px solid #222840',
  },
  brand: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 130 },
  brandName: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 11,
    color: '#9bb0dd',
    letterSpacing: '1.5px',
  },
  brandSub: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 8,
    color: '#404d6e',
    letterSpacing: '1px',
  },
  nav: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 },
  rightTools: { display: 'flex', alignItems: 'center', gap: 10 },
  userChip: {
    fontSize: 11,
    color: '#8ea1cb',
    border: '1px solid #2a395c',
    borderRadius: 999,
    padding: '3px 10px',
    background: '#111626',
  },
  tab: {
    fontSize: 11.5,
    color: '#9bb0dd',
    background: '#1a2030',
    border: '1px solid #2a395c',
    borderRadius: 6,
    padding: '5px 12px',
    cursor: 'pointer',
  },
  tabActive: {
    color: '#e8f2ff',
    background: '#223251',
    borderColor: '#41639e',
  },
  content: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
};
