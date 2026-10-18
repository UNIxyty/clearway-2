// A slice of the wall — callsign, route, registration, times — in the chosen font, on the wall's own colours
// (components/wall-preview/PreviewPill.jsx says the rule). The caption is set in the previewed font too: everything
// inside the frame is the wall's.
export default function FontPreview({ font, sample, colors: c, probe }) {
  return (
    <div data-wall-display="true" style={{ background: c.boardBg, borderRadius: 12, padding: '16px 18px 14px', border: `1px solid ${c.gridLines}`, fontFamily: font.stack }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: c.sidebarText }}>PREVIEW · {font.label.toUpperCase()}</span>
        {probe && <span style={{ fontSize: 11.5, color: probe.fallback ? c.textDeltaLate : c.sidebarText }}>{probe.fallback ? `Rendering ${probe.rendered ?? 'the system sans-serif'} on this machine, not ${font.label}` : `Renders as ${probe.rendered}`}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: '6px 18px', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: c.textRegistration, lineHeight: 1.1 }}>{sample.reg}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: c.textOperator, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sample.operator}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: c.textCallsign, whiteSpace: 'nowrap' }}>{sample.callsign}</span>
          <div style={{ flex: 1, maxWidth: 340, height: 24, borderRadius: 99, background: c.stateAirborne, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontSize: 12.5, fontWeight: 700, color: c.boardBg }}>
            <span>{sample.route.split(' → ')[0]}</span><span>{sample.route.split(' → ')[1]}</span>
          </div>
        </div>
        <span style={{ fontSize: 11, color: c.textTicks, fontWeight: 600, letterSpacing: '0.04em' }}>09:00 10:00 11:00 12:00</span>
        <div style={{ display: 'flex', gap: 14, fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: c.textTimes }}>{sample.time}</span>
          <span style={{ color: c.textIcao }}>{sample.route}</span>
          <span style={{ color: c.textTimes }}>{sample.eta}</span>
          <span style={{ color: c.textDeltaLate }}>+12</span>
          <span style={{ color: c.textDeltaEarly }}>−04</span>
        </div>
      </div>
    </div>
  );
}
