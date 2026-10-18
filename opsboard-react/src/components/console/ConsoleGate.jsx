import { ConsoleStyles, t } from './ui';
import { usePortalTheme } from '../../theme/portalTheme';
import Icon from './icons';

// The console's "sign in required" screen, in the portal's theme (the display keeps its own device-pairing screens in
// AuthGate.jsx). A plain card: the person is not signed in, so it shows nothing about the wall.
export default function ConsoleGate({ loginHref }) {
  usePortalTheme();
  return (
    <div className="cw-console" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cw-bg-page)', color: t.ink, padding: 20 }}>
      <ConsoleStyles />
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadowPanel, padding: '26px 30px', maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ width: 44, height: 44, borderRadius: 11, background: t.blueTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="key-round" size={20} color={t.blueDeep} /></span>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Sign in required</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: t.body }}>
          The Display Console is for signed-in Clearway users. Sign in through the portal; you will be brought back to this page.
        </div>
        <a href={loginHref} style={{ alignSelf: 'flex-start', marginTop: 4, height: 40, padding: '0 16px', borderRadius: 10, background: t.blue, color: t.onPrimary, fontSize: 14, fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          Go to sign-in<Icon name="arrow-up-right" size={15} />
        </a>
      </div>
    </div>
  );
}
