// The client's display settings (2026-11-11): the same knobs the ops wall's Settings hold for looks — display scale,
// hour spacing, vertical and horizontal sizing, the chips on the pills, colours, the font (with its slashed zero) —
// drawn by the ops console's own cards (components/console/LookCards.jsx, ColoursCard, FontCard), on this account's
// profile only (the wall's /api/client/view). A live preview of their own timeline sits above the cards and follows
// every change (the save broadcasts config.changed; ClientApp re-reads the view). Reset puts back the ops wall's default.
import { useState } from 'react';
import { DeviceCtx } from '../components/console/deviceCtx';
import { DisplayScaleCard, HourSpacingCard, VerticalSizingCard, HorizontalSizingCard, ChipsCard } from '../components/console/LookCards';
import ColoursCard from '../components/console/ColoursCard';
import FontCard from '../components/console/FontCard';
import { ToastProvider } from '../components/console/ui';
import Board from '../components/Board';
import { resetView, viewApi } from './clientApi';

const CTX = { deviceId: null, device: null, api: viewApi };

export default function ClientSettings({ visible, windowStartUtc, windowEndUtc, view, onViewChanged, phone, goPage }) {
  const [resetting, setResetting] = useState(false);
  const [said, setSaid] = useState('');
  const s = view?.settings ?? {};
  const reset = async () => {
    setResetting(true); setSaid('');
    try { const r = await resetView(); onViewChanged?.(r); setSaid('Back to the default look.'); }
    catch (e) { setSaid(e?.message || 'The reset did not go through. Try again.'); }
    finally { setResetting(false); }
  };
  const preview = visible.slice(0, phone ? 2 : 3);
  return (
    <DeviceCtx.Provider value={CTX}>
      <ToastProvider>
        <div className="cws" data-client-settings="" data-view-source={view?.source ?? ''}>
          <div className="cws-head">
            <div>
              <h1 className="cwd-title">Display settings</h1>
              <p className="cwd-muted">How your timeline looks: size, spacing, colours and the font. Saved on your account, so your phone follows. Nothing here changes anyone else's view.</p>
            </div>
            <div className="cws-actions">
              <button type="button" className="cwd-btn" onClick={() => goPage('timeline')} data-back-to-timeline="">Back to the timeline</button>
              <button type="button" className="cwd-btn is-primary" onClick={reset} disabled={resetting} data-reset-view="">{resetting ? 'Resetting…' : 'Reset to default'}</button>
            </div>
          </div>
          {said && <p className="cwd-muted" data-reset-said="">{said}</p>}
          <section className="cwd-card cws-preview" data-view-preview="">
            <div className="cwd-card-head"><b>Preview</b><span className="cwd-muted">{preview.length ? 'Your own flights, as the timeline draws them with these settings.' : 'The preview shows your flights once there are some.'}</span></div>
            <div className="cwd-board" style={{ height: phone ? 220 : 300 }}>
              {preview.length > 0 && (
                <Board aircraft={preview} limitations={[]} windowStartUtc={windowStartUtc} windowEndUtc={windowEndUtc}
                  scale={Number.isFinite(s.scale) ? s.scale : 1.3} timeZoom={Number.isFinite(s.timeZoom) ? s.timeZoom : 1} rowZoom={Number.isFinite(s.rowZoom) ? s.rowZoom : 1}
                  pillHeight={Number.isFinite(s.pillHeight) ? s.pillHeight : 1} markerScale={Number.isFinite(s.markerScale) ? s.markerScale : 1} labelScale={Number.isFinite(s.labelScale) ? s.labelScale : 1}
                  acColScale={Number.isFinite(s.acColScale) ? s.acColScale : 1} autoFitRows={s.autoFitRows === true}
                  hideSidebar rowHeightPx={Math.round((phone ? 78 : 96) * (Number.isFinite(s.rowZoom) ? s.rowZoom : 1))} viewportHoursOverride={phone ? 6 : 12} autoReturnToNow={false} showUnconfirmedRing={false} touchHitMinPx={44} maxMarkers={2} />
              )}
            </div>
          </section>
          <div className="cws-cards">
            <DisplayScaleCard />
            <HourSpacingCard />
            <VerticalSizingCard />
            <HorizontalSizingCard />
            <ChipsCard />
            <ColoursCard deviceId={null} />
            <FontCard deviceId={null} />
          </div>
        </div>
      </ToastProvider>
    </DeviceCtx.Provider>
  );
}

