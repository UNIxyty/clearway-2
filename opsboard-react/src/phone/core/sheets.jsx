// The three sheets of the first screen (design "Mobile Flight List v3"): Operators and aircraft, Notifications, and the
// staff "Wall" menu. Each closes by Close, by a tap on the scrim, by Escape (the kit's Sheet).
import { Btn, MONO, Msg, Row, Sheet, Switch, c, tone } from '../kit';
import { hm } from './util';

/**
 * groups: [{ key, name, aircraft: [{ id, reg, note, on }] }]. An operator's switch is on while any of its aircraft is
 * shown; turning it off hides them all. `failed` are the words when a client's change could not be kept.
 */
export function FilterSheet({ groups, hiddenCount, total, onAircraft, onOperator, onShowAll, onClose, failed, busy }) {
  const shown = total - hiddenCount;
  return (
    <Sheet name="filter" title="Operators and aircraft" sub={hiddenCount > 0 ? `${hiddenCount} aircraft hidden of ${total}` : `Showing all ${total} aircraft`}
      action={hiddenCount > 0 ? 'Show all' : null} onAction={onShowAll} onClose={onClose}
      foot={<Btn data-filter-done="" onClick={onClose}>{hiddenCount > 0 ? `Show ${shown} aircraft` : 'Done'}</Btn>}>
      {failed ? <div role="alert" data-filter-failed="" style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.45, color: c('bad'), borderBottom: `1px solid ${c('l1')}` }}>{failed}</div> : null}
      {total === 0 ? <Msg title="No aircraft yet" body="Aircraft show up here when they have flights on the schedule." /> : null}
      {groups.map((g) => {
        const anyOn = g.aircraft.some((a) => a.on);
        return (
          <section key={g.key} data-filter-operator={g.key}>
            <div style={{ minHeight: 44, padding: '0 8px 0 16px', display: 'flex', alignItems: 'center', gap: 12, background: c('bg2'), borderBottom: `1px solid ${c('l1')}` }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: c('t1'), overflowWrap: 'anywhere' }}>{g.name}</span>
              <span style={{ flex: 'none', fontSize: 11, color: c('t4') }}>{g.aircraft.length} aircraft</span>
              <Switch on={anyOn} disabled={busy} label={`${g.name}, all aircraft`} onChange={(v) => onOperator(g, v)} data-filter-switch="operator" />
            </div>
            {g.aircraft.map((a) => (
              <div key={a.id} data-filter-aircraft={a.reg} style={{ minHeight: 52, padding: '0 8px 0 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${c('l1')}` }}>
                <span style={{ ...MONO, flex: 'none', fontSize: 13, fontWeight: 700, color: a.on ? c('t1') : c('t3') }}>{a.reg}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c('t3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.note}</span>
                <Switch on={a.on} disabled={busy} label={`Show ${a.reg}`} onChange={(v) => onAircraft(g, a, v)} data-filter-switch="aircraft" />
              </div>
            ))}
          </section>
        );
      })}
    </Sheet>
  );
}

const when = (at, nowMs) => {
  const min = Math.floor((nowMs - at) / 60_000);
  if (min < 1) return 'now';
  return min < 60 ? `${min} min` : `${hm(at)}Z`;
};

/** Flight events since the app opened. One tap marks the item read, closes the sheet and opens its flight. `z` lifts it over a page. */
export function NotifSheet({ events, nowMs, onPick, onMarkAll, onClose, role, z }) {
  const unread = events.some((e) => !e.read);
  return (
    <Sheet name="notifications" z={z} title="Notifications" sub="Flight events only" action={unread ? 'Mark all read' : null} onAction={onMarkAll} onClose={onClose}>
      {events.length === 0 ? (
        <Msg data-notif-empty="" title="Nothing new" body={role === 'staff'
          ? 'Delays, departures, landings, cancellations and NOTAMs to check show up here while the app is open.'
          : 'Delays, departures and landings of your flights show up here while the app is open.'} />
      ) : events.map((e) => (
        <button key={e.key} type="button" data-notif={e.kind} data-unread={e.read ? undefined : ''} onClick={() => onPick(e)} className="cw3-press"
          style={{ width: '100%', minHeight: 56, padding: '8px 16px', display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', alignItems: 'center', columnGap: 12, borderBottom: `1px solid ${c('l1')}`, textAlign: 'left' }}>
          <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: e.tone === 'plain' ? c('t2') : tone(e.tone), whiteSpace: 'nowrap', overflow: 'hidden' }}>{e.icon}</span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: e.read ? 400 : 600, color: e.read ? c('t2') : c('t1'), overflowWrap: 'anywhere' }}>{e.title}</span>
            <span style={{ ...MONO, fontSize: 11, color: c('t3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.sub}</span>
          </span>
          <span style={{ ...MONO, fontSize: 11, color: c('t4'), whiteSpace: 'nowrap' }}>{when(e.at, nowMs)}</span>
        </button>
      ))}
    </Sheet>
  );
}

/** Staff: the "Wall" menu behind the third rail button. rows: [{ key, icon, label, value, warn }] */
export function MenuSheet({ rows, onPick, onClose }) {
  return (
    <Sheet name="menu" title="Wall" onClose={onClose}>
      {rows.map((r) => (
        <Row key={r.key} data-menu-row={r.key} icon={r.icon} label={r.label} value={r.value} valueTone={r.warn ? 'warn' : 'muted'} chevron onClick={() => onPick(r.key)} />
      ))}
    </Sheet>
  );
}
