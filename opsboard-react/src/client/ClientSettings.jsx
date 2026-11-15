// The client's Settings page (2026-11-15): the ops wall's Settings page itself, for this account's own view. The same
// page header, the same tabs (Display & sizing, Colours, Font) and the same cards in the ops order, drawn by the ops
// console's own pieces (components/console/LookCards.jsx, ColoursCard, FontCard, ui.jsx). Everything saves to the
// client's own profile through the wall's /api/client/view (the cards take it from DeviceCtx `api`), so it never
// changes the ops room wall or another client's view; the save broadcasts config.changed and ClientApp re-reads the view,
// so the Timeline follows.
// Where the ops page has something only the ops room has, this copy leaves it out with no gap: the "Whose view" card and
// the boundary note, the Wall content and NOTAM/alerts/WX tabs, Chips on the pills, the Upcoming Flight Table, the
// overlay, MVT flash and unconfirmed-outline rows, the minimums and their wall check, the marker size, and the colours
// of IMP/CAA/NOTAM markers, limitation circles, the MVT and unconfirmed rings and the flight table.
// This file must never import components/console/SettingsPage.jsx: that is console code, and a client's browser
// downloads none (rig/lib/bundle-sweep.mjs).
import { useState } from 'react';
import { DeviceCtx } from '../components/console/deviceCtx';
import { DisplayScaleCard, HourSpacingCard, VerticalSizingCard, HorizontalSizingCard, PanelScalesCard } from '../components/console/LookCards';
import ColoursCard from '../components/console/ColoursCard';
import FontCard from '../components/console/FontCard';
import { Button, PageHeader, Segmented, ToastProvider } from '../components/console/ui';
import ErrorBoundary from '../components/ErrorBoundary';
import { resetView, viewApi } from './clientApi';

const CTX = { deviceId: null, device: null, api: viewApi };
// The cards' save notes speak of the room's wall. A client's note speaks of the account.
const clientWords = (m) => m.replace(/wall updates in seconds/g, 'saved on your account').replace(/^Wall font/, 'Font');
// colours a client's timeline never draws (no markers, no limitation circles, no MVT or unconfirmed ring, no table)
export const CLIENT_HIDDEN_COLOURS = Object.freeze(['markerImp', 'markerNtm', 'markerCaa', 'limUnchecked', 'limChecked', 'mvtRing', 'unconfirmedRing', 'tableText', 'tableRed', 'tableOrange', 'tableGreen']);

const TABS = [
  { value: 'display', label: 'Display & sizing' },
  { value: 'colours', label: 'Colours' },
  { value: 'font', label: 'Font' },
];

// the Display & sizing tab: the ops cards in the ops order, each in its own boundary (one broken card says so, the
// others keep working)
const DISPLAY = [
  ['scale', DisplayScaleCard],
  ['hour', HourSpacingCard],
  ['vertical', VerticalSizingCard],
  ['horizontal', HorizontalSizingCard],
  ['panels', () => <PanelScalesCard client />],
];

function Part({ id, epoch, children }) {
  return (
    <div data-settings-section={id}>
      <ErrorBoundary where={`client/settings/${id}`} resetKey={epoch} compact>{children}</ErrorBoundary>
    </div>
  );
}

export default function ClientSettings({ view, onViewChanged, phone }) {
  const [tab, setTab] = useState('display');
  const [resetting, setResetting] = useState(false);
  const [said, setSaid] = useState('');
  const [epoch, setEpoch] = useState(0);   // bumping it remounts the cards so they re-read the profile
  const resetAll = async () => {
    setResetting(true); setSaid('');
    try { const r = await resetView(); onViewChanged?.(r); setEpoch((e) => e + 1); setSaid('Back to the default look.'); }
    catch (e) { setSaid(e?.message || 'The reset did not go through. Try again.'); }
    finally { setResetting(false); }
  };
  return (
    <DeviceCtx.Provider value={CTX}>
      <ToastProvider rewrite={clientWords}>
        <div className={`cws-ops${phone ? ' is-phone' : ''}`} data-client-settings="" data-view-source={view?.source ?? ''} data-settings-tab={tab}>
          <PageHeader
            title="Settings"
            desc="How your timeline looks: size, spacing, colours and the font. Saved on your account, so your phone follows. Nothing here changes the ops room wall or anyone else's view."
            descMax={600}
            actions={<Button size="sm" variant="secondary" disabled={resetting} onClick={resetAll} data-reset-view="">{resetting ? 'Resetting…' : 'Reset to default'}</Button>}
          />
          {said && <p className="cws-said" data-reset-said="" role="status">{said}</p>}
          <div style={{ margin: '0 0 18px', display: 'inline-block', maxWidth: '100%' }} data-settings-tabs="">
            <Segmented value={tab} onChange={setTab} options={TABS} />
          </div>
          <div key={`${tab}-${epoch}`}>
            {tab === 'display' && DISPLAY.map(([id, Card]) => <Part key={id} id={id} epoch={epoch}><Card /></Part>)}
            {tab === 'colours' && <Part id="colours" epoch={epoch}><ColoursCard deviceId={null} hideKeys={CLIENT_HIDDEN_COLOURS} /></Part>}
            {tab === 'font' && <Part id="font" epoch={epoch}><FontCard deviceId={null} /></Part>}
          </div>
        </div>
      </ToastProvider>
    </DeviceCtx.Provider>
  );
}
