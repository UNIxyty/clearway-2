// Screen 3 — this phone's settings (mobile-design-spec.md §4), with one change from the design, made on 2026-10-27:
// the font and the colours are NOT this phone's. The phone wall draws from the room's own wall settings, exactly as
// the display does, so on a phone and on the 55-inch screen it reads the same way; the two rows say where they come
// from. What this phone does keep for itself: the world clocks, the view and range it opens in, keeping the screen
// awake. The room's settings are reached for admins through the amber row (the portal's Wall settings page).
import { useState } from 'react';
import { useCanAction } from '../../../AuthGate';
import { v } from './tokens';
import { CITY_CHOICES, MAX_CLOCKS, codeFor, hmIn, offsetLabel } from './prefs';
import { Icon, Label, Scroll, Segmented, Sheet, Toggle } from './ui';

const FONT_NAME = (stack) => String(stack || '').split(',')[0].replace(/['"]/g, '').replace(/^var\(--wall-font-sans/, '').trim();

function Group({ label, children, edit = false }) {
  return (
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Label style={{ paddingLeft: 4 }}>{label}</Label>
      <div style={{ borderRadius: 14, background: v('surface-2'), border: `1px solid ${edit ? v('wall-edit') : v('line-2')}`, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
function Row({ label, sub, subColor, right, onClick, first }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} style={{ width: '100%', minHeight: 54, padding: '8px 12px 8px 14px', borderTop: first ? 'none' : `1px solid ${v('line-1')}`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: v('text-1') }}>{label}</span>
        {sub && <span style={{ fontSize: 12.5, lineHeight: 1.4, color: subColor || v('text-3'), textWrap: 'pretty' }}>{sub}</span>}
      </span>
      {right}
    </Tag>
  );
}
const Value = ({ children }) => <span style={{ fontSize: 14, fontWeight: 700, color: v('text-3'), whiteSpace: 'nowrap' }}>{children}</span>;
const Chev = () => <span style={{ fontSize: 20, color: v('text-4') }}>›</span>;

export default function PhoneSettings({ prefs, setPrefs, nowMs, onClose, onApply }) {
  const [page, setPage] = useState('main'); // main | clocks
  const can = useCanAction();
  const admin = can('wall.bigscreen.settings'); // the room's (big screen's) settings — admins by default
  const font = FONT_NAME(getComputedStyle(document.documentElement).getPropertyValue('--wall-font-sans')) || 'Nunito';
  const back = page === 'main' ? onClose : () => setPage('main');
  const set = (patch) => { setPrefs(patch); onApply?.(patch); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Phone settings" style={{ position: 'absolute', inset: 0, zIndex: 25, background: v('bg-1'), display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', height: 52, marginTop: 'env(safe-area-inset-top)', display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px 0 6px', borderBottom: `1px solid ${v('line-1')}` }}>
        <button type="button" onClick={back} style={{ height: 44, padding: '0 10px 0 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 800, color: v('accent-text'), whiteSpace: 'nowrap' }}><span style={{ fontSize: 22, lineHeight: 1 }}>‹</span>{page === 'main' ? 'Flights' : 'Settings'}</button>
        <h2 style={{ flex: 1, margin: 0, textAlign: 'center', fontSize: 17, fontWeight: 900, color: v('text-1'), paddingRight: 64, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{page === 'main' ? 'Settings' : 'World clocks'}</h2>
      </div>
      <Scroll innerStyle={{ padding: '14px 14px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {page === 'main' && <>
          <div style={{ flex: 'none', display: 'flex', gap: 11, alignItems: 'flex-start', padding: '12px 13px', borderRadius: 12, background: v('accent-soft'), border: `1px solid ${v('accent-line')}` }}>
            <span style={{ color: v('accent-text'), marginTop: 1 }}><Icon name="phone" size={18} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 14.5, fontWeight: 900, color: v('text-1') }}>The wall’s look, this phone’s clocks.</span>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: v('text-2'), textWrap: 'pretty' }}>Colours and font come from the wall in the ops room, so this phone reads the same as the screen. The clocks, the view and the range below are this phone’s only; the wall never sees them.</span>
            </span>
          </div>
          <Group label="Display — from the wall">
            <Row first label="Font" sub="The wall’s font, with its zero, as the display draws it" right={<Value>{font}</Value>} />
            <Row label="Colours" sub="The wall’s palette. Status colours keep their meaning everywhere." right={<Value>From the wall</Value>} />
          </Group>
          <Group label="Flight list on this phone">
            <Row first label="World clocks" onClick={() => setPage('clocks')} right={<><Value>{prefs.clocksOn ? `${prefs.clocks.length} cities` : 'Off'}</Value><Chev /></>} />
            <Row label="Opens in" right={<Segmented label="Opens in" height={40} size={13} minSeg={44} radius={10} bg={v('bg-1')} options={[{ value: 'timeline', label: 'Timeline' }, { value: 'cards', label: 'Cards' }]} value={prefs.view} onChange={(x) => set({ view: x })} />} />
            <Row label="Default range" right={<Segmented label="Default range" height={40} size={13} minSeg={44} radius={10} bg={v('bg-1')} options={['6H', '12H', 'DAY'].map((x) => ({ value: x, label: x }))} value={prefs.range} onChange={(x) => set({ range: x })} />} />
          </Group>
          <Group label="This phone only">
            <Row first label="Keep screen awake" sub="While the flight list is open" onClick={() => set({ awake: !prefs.awake })} right={<Toggle on={prefs.awake} />} />
            <Row label="Passenger data" sub="Always hidden until you open one passenger. Not adjustable." right={<Value>Masked</Value>} />
          </Group>
          {admin && (
            <Group label="The ops-room wall" edit>
              <Row first label="Wall settings" sub="Seen by everyone in the ops room. Admins only." subColor={v('wall-edit')} onClick={() => { (window.top || window).location.href = '/m/wall-settings'; }} right={<Chev />} />
            </Group>
          )}
        </>}
        {page === 'clocks' && <ClocksPage prefs={prefs} setPrefs={setPrefs} nowMs={nowMs} />}
      </Scroll>
    </div>
  );
}

function ClocksPage({ prefs, setPrefs, nowMs }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const clocks = prefs.clocks;
  const full = clocks.length >= MAX_CLOCKS;
  const save = (list) => setPrefs({ clocks: list });
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= clocks.length) return; const l = clocks.slice(); [l[i], l[j]] = [l[j], l[i]]; save(l); };
  const remove = (i) => save(clocks.filter((_, k) => k !== i));
  const rename = (i) => { const name = draft.trim().toUpperCase().slice(0, 12); if (name) save(clocks.map((c, k) => (k === i ? { ...c, name, code: codeFor(name, c.timeZone) } : c))); setEditing(null); };
  const choices = CITY_CHOICES.filter((c) => !clocks.some((x) => x.timeZone === c.timeZone));
  return (
    <>
      <div style={{ flex: 'none', borderRadius: 14, background: v('surface-2'), border: `1px solid ${v('line-2')}` }}>
        <Row first label="Show world clocks" sub={prefs.clocksOn ? 'Shown above the flight list' : 'Hidden. The flight list moves up and UTC shows in the title bar.'} onClick={() => setPrefs({ clocksOn: !prefs.clocksOn })} right={<Toggle on={prefs.clocksOn} />} />
      </div>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 7, opacity: prefs.clocksOn ? 1 : 0.4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}><Label>Cities · {clocks.length} of {MAX_CLOCKS}</Label><span style={{ fontSize: 11.5, fontWeight: 700, color: v('text-4') }}>Arrows to reorder</span></div>
        <div style={{ borderRadius: 14, background: v('surface-2'), border: `1px solid ${v('line-2')}`, overflow: 'hidden' }}>
          {clocks.map((c, i) => (
            <div key={`${c.timeZone}-${i}`} data-clock-row={c.code} style={{ minHeight: 60, padding: '6px 4px', borderTop: i ? `1px solid ${v('line-1')}` : 'none', display: 'flex', alignItems: 'center', gap: 4, background: c.utc ? v('utc-soft') : 'transparent' }}>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(i, -1)} style={{ width: 36, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: i === 0 ? v('line-3') : v('text-3') }}><Icon name="up" size={16} /></button>
                <button type="button" aria-label={`Move ${c.name} down`} disabled={i === clocks.length - 1} onClick={() => move(i, 1)} style={{ width: 36, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: i === clocks.length - 1 ? v('line-3') : v('text-3') }}><Icon name="down" size={16} /></button>
              </span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {editing === i ? (
                  <form onSubmit={(e) => { e.preventDefault(); rename(i); }} style={{ height: 36, padding: '0 10px', borderRadius: 9, background: v('bg-1'), border: `2px solid ${v('accent')}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input autoFocus value={draft} maxLength={12} onChange={(e) => setDraft(e.target.value.toUpperCase())} onBlur={() => rename(i)} aria-label="City name"
                      style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: v('text-1'), font: 'inherit', fontSize: 15, fontWeight: 900, letterSpacing: '0.06em' }} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: v('text-4') }}>{draft.length}/12</span>
                  </form>
                ) : (
                  <button type="button" disabled={c.utc} onClick={() => { setEditing(i); setDraft(c.name); }} style={{ textAlign: 'left', fontSize: 15, fontWeight: 900, letterSpacing: '0.06em', color: c.utc ? v('utc') : v('text-1'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</button>
                )}
                <span style={{ fontSize: 12, fontWeight: 700, color: v('text-3') }}>{c.utc ? 'Always shown · highlighted' : `${c.code} · ${offsetLabel(nowMs, c.timeZone)}`}</span>
              </div>
              <span style={{ flex: 'none', fontSize: 16, fontWeight: 900, color: c.utc ? v('utc') : v('text-2'), padding: '0 4px' }}>{hmIn(nowMs, c.timeZone)}</span>
              {c.utc
                ? <span aria-label="UTC cannot be removed" style={{ flex: 'none', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: v('text-4') }}><Icon name="lock" size={16} /></span>
                : <button type="button" aria-label={`Remove ${c.name}`} onClick={() => remove(i)} style={{ flex: 'none', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 24, height: 24, borderRadius: 12, background: v('bad-soft'), border: `1px solid ${v('bad-line')}`, color: v('bad'), fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>−</span></button>}
            </div>
          ))}
          <button type="button" disabled={full} onClick={() => setAdding(true)} style={{ width: '100%', minHeight: 54, padding: '0 14px', borderTop: `1px solid ${v('line-1')}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 24, borderRadius: 12, background: full ? v('surface-3') : v('accent'), color: full ? v('text-4') : v('on-accent'), fontSize: 17, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: full ? v('text-4') : v('text-1') }}>{full ? `${MAX_CLOCKS} of ${MAX_CLOCKS} · remove one to add` : 'Add city'}</span>
          </button>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: v('text-3'), padding: '0 4px', textWrap: 'pretty' }}>UTC is always shown and always highlighted. Names up to 12 characters; each city also has a 3-letter code used when the names don’t fit.</div>
      </div>
      {adding && (
        <Sheet title="Add a city" sub={`${clocks.length} of ${MAX_CLOCKS}`} onClose={() => setAdding(false)} maxHeight="78%">
          <Scroll style={{ borderTop: `1px solid ${v('line-1')}` }}>
            {choices.map((c) => (
              <button key={c.timeZone} type="button" onClick={() => { save([...clocks, c]); setAdding(false); }} style={{ width: '100%', minHeight: 56, padding: '6px 16px 6px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${v('line-1')}` }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '0.06em', color: v('text-1') }}>{c.name}</span><span style={{ fontSize: 12, fontWeight: 700, color: v('text-3') }}>{c.code} · {offsetLabel(nowMs, c.timeZone)}</span></span>
                <span style={{ fontSize: 16, fontWeight: 900, color: v('text-2') }}>{hmIn(nowMs, c.timeZone)}</span>
              </button>
            ))}
          </Scroll>
        </Sheet>
      )}
    </>
  );
}
