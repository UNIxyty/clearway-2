// The client's display settings (2026-11-11; sections, a side list, per-section reset and a sticky preview on
// 2026-11-12): the same knobs the ops wall's Settings hold for looks, in the ops page's own sections, names and order
// — Display scale, Hour spacing, Vertical sizing, Horizontal sizing, Chips on the pills, Colours, Font — drawn by the
// ops console's own cards (components/console/LookCards.jsx, ColoursCard, FontCard) on this account's profile only
// (the wall's /api/client/view). A live preview of their own timeline follows every change (the save broadcasts
// config.changed; ClientApp re-reads the view) and stays in view while the desk scrolls. Reset to default puts the
// ops wall's default back, for the whole page or for one section (that section's keys only).
import { useEffect, useMemo, useRef, useState } from 'react';
import { DeviceCtx } from '../components/console/deviceCtx';
import { DisplayScaleCard, HourSpacingCard, VerticalSizingCard, HorizontalSizingCard, ChipsCard } from '../components/console/LookCards';
import ColoursCard from '../components/console/ColoursCard';
import FontCard from '../components/console/FontCard';
import { ToastProvider } from '../components/console/ui';
import Board from '../components/Board';
import { resetView, saveView, viewApi } from './clientApi';

const CTX = { deviceId: null, device: null, api: viewApi };

// the ops Settings page's sections, in its order, each with the keys it owns (for a section's own reset)
export const SECTIONS = [
  { id: 'scale', title: 'Display scale', line: 'How big everything is drawn: text, pills and the hour row together.', keys: ['scale'], Card: DisplayScaleCard },
  { id: 'hour', title: 'Hour spacing', line: 'How many hours fit across the screen: wider for the next few hours, narrower for the whole day.', keys: ['timeZoom'], Card: HourSpacingCard },
  { id: 'vertical', title: 'Vertical sizing', line: 'The height of each aircraft row, the pills, the markers and the labels on them.', keys: ['rowZoom', 'pillHeight', 'markerScale', 'labelScale', 'autoFitRows'], Card: VerticalSizingCard },
  { id: 'horizontal', title: 'Horizontal sizing', line: 'What sits beside a pill on its row: the flight number, the route, the chips, the gaps and the shortest pill.', keys: ['callsignScale', 'routeScale', 'chipSpacing', 'minPillMinutes', 'pillPadding', 'laneGap', 'autoFitHorizontal'], Card: HorizontalSizingCard },
  { id: 'chips', title: 'Chips on the pills', line: 'Which of the small marks a pill may carry: notice, CAA, NOTAM and weather.', keys: ['chipImp', 'chipCaa', 'chipNtm', 'chipWx'], Card: ChipsCard },
  { id: 'colours', title: 'Colours', line: 'The colours of the pills by their state, the now line, the rows and the text.', keys: ['colors'], Card: () => <ColoursCard deviceId={null} /> },
  { id: 'font', title: 'Font', line: 'The text font of the timeline, and whether the zero carries a dot or a slash.', keys: ['font', 'zeroStyle'], Card: () => <FontCard deviceId={null} /> },
];

function Section({ s, phone, open, onToggle, epoch, onReset, resetting }) {
  const body = (
    <>
      <div className="cws-section-head">
        <div><h2 id={`cws-${s.id}`}>{s.title}</h2><p className="cwd-muted">{s.line}</p></div>
        <button type="button" className="cwd-btn" disabled={resetting} onClick={() => onReset(s)} data-reset-section={s.id}>{resetting === s.id ? 'Resetting…' : 'Reset this section'}</button>
      </div>
      <div className="cws-section-body"><s.Card key={`${s.id}-${epoch}`} /></div>
    </>
  );
  if (!phone) return <section className="cws-section" data-settings-section={s.id}>{body}</section>;
  return (
    <section className={`cws-section is-collapsible${open ? ' is-open' : ''}`} data-settings-section={s.id} data-open={open ? '1' : '0'}>
      <button type="button" className="cws-section-toggle" onClick={onToggle} aria-expanded={open} aria-controls={`cws-body-${s.id}`}><span><b>{s.title}</b><small className="cwd-muted">{s.line}</small></span><span className="cws-chev" aria-hidden>{open ? '▴' : '▾'}</span></button>
      {open && <div id={`cws-body-${s.id}`}>{body}</div>}
    </section>
  );
}

export default function ClientSettings({ visible, windowStartUtc, windowEndUtc, view, onViewChanged, phone, goPage }) {
  const [resetting, setResetting] = useState('');
  const [said, setSaid] = useState('');
  const [epoch, setEpoch] = useState(0);            // bumping it remounts the cards so they re-read the profile
  const [open, setOpen] = useState(() => ({ scale: true }));
  const [current, setCurrent] = useState('scale');
  const s = view?.settings ?? {};
  const defaults = view?.defaults ?? {};
  const wrap = useRef(null);
  // the side list follows the scroll (desk)
  useEffect(() => {
    if (phone) return undefined;
    const heads = SECTIONS.map((x) => document.getElementById(`cws-${x.id}`)).filter(Boolean);
    const io = new IntersectionObserver((entries) => { const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (hit) setCurrent(hit.target.id.replace('cws-', '')); }, { rootMargin: '-20% 0px -70% 0px' });
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [phone, epoch]);
  const resetAll = async () => {
    setResetting('all'); setSaid('');
    try { const r = await resetView(); onViewChanged?.(r); setEpoch((e) => e + 1); setSaid('Back to the default look.'); }
    catch (e) { setSaid(e?.message || 'The reset did not go through. Try again.'); }
    finally { setResetting(''); }
  };
  const resetSection = async (sec) => {
    setResetting(sec.id); setSaid('');
    try {
      const patch = {}; for (const k of sec.keys) patch[k] = k === 'colors' ? Object.fromEntries(Object.keys(s.colors ?? {}).map((c) => [c, null])) : defaults[k];
      const r = await saveView(patch); onViewChanged?.(r); setEpoch((e) => e + 1); setSaid(`${sec.title}: back to the default.`);
    } catch (e) { setSaid(e?.message || 'The reset did not go through. Try again.'); }
    finally { setResetting(''); }
  };
  const jump = (id) => { const el = document.getElementById(`cws-${id}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setCurrent(id); } };
  const preview = useMemo(() => visible.slice(0, phone ? 2 : 3), [visible, phone]);
  const n = (k, d) => (Number.isFinite(s[k]) ? s[k] : d);
  return (
    <DeviceCtx.Provider value={CTX}>
      <ToastProvider>
        <div className="cws" ref={wrap} data-client-settings="" data-view-source={view?.source ?? ''}>
          <div className="cws-head">
            <div>
              <h1 className="cwd-title">Display settings</h1>
              <p className="cwd-muted">How your timeline looks: size, spacing, colours and the font. Saved on your account, so your phone follows. Nothing here changes anyone else's view.</p>
            </div>
            <div className="cws-actions">
              <button type="button" className="cwd-btn" onClick={() => goPage('timeline')} data-back-to-timeline="">Back to the timeline</button>
              <button type="button" className="cwd-btn is-primary" onClick={resetAll} disabled={Boolean(resetting)} data-reset-view="">{resetting === 'all' ? 'Resetting…' : 'Reset to default'}</button>
            </div>
          </div>
          {said && <p className="cwd-muted" data-reset-said="" role="status">{said}</p>}
          <div className={`cws-grid${phone ? ' is-phone' : ''}`}>
            {!phone && (
              <nav className="cws-side" aria-label="Settings sections" data-settings-nav="">
                {SECTIONS.map((x) => <button key={x.id} type="button" className={current === x.id ? 'is-on' : ''} onClick={() => jump(x.id)} aria-current={current === x.id ? 'true' : undefined} data-jump={x.id}>{x.title}</button>)}
              </nav>
            )}
            <div className="cws-main">
              <section className="cwd-card cws-preview" data-view-preview="">
                <div className="cwd-card-head"><b>Preview</b><span className="cwd-muted">{preview.length ? 'Your own flights, as the timeline draws them with these settings.' : 'The preview shows your flights once there are some.'}</span></div>
                <div className="cwd-board" style={{ height: phone ? 200 : 200 }}>
                  {preview.length > 0 && (
                    <Board aircraft={preview} limitations={[]} windowStartUtc={windowStartUtc} windowEndUtc={windowEndUtc}
                      scale={n('scale', 1.3)} timeZoom={n('timeZoom', 1)} rowZoom={n('rowZoom', 1)} pillHeight={n('pillHeight', 1)} markerScale={n('markerScale', 1)} labelScale={n('labelScale', 1)} acColScale={n('acColScale', 1)} autoFitRows={s.autoFitRows === true}
                      hideSidebar rowHeightPx={Math.round((phone ? 72 : 80) * n('rowZoom', 1))} viewportHoursOverride={phone ? 6 : 12} autoReturnToNow={false} showUnconfirmedRing={false} touchHitMinPx={44} maxMarkers={2} />
                  )}
                </div>
              </section>
              <div className="cws-cards">
                {SECTIONS.map((x) => <Section key={x.id} s={x} phone={phone} open={Boolean(open[x.id])} onToggle={() => setOpen((o) => ({ ...o, [x.id]: !o[x.id] }))} epoch={epoch} onReset={resetSection} resetting={resetting} />)}
              </div>
            </div>
          </div>
        </div>
      </ToastProvider>
    </DeviceCtx.Provider>
  );
}
