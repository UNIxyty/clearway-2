// The phone pages a client may open too (design "Mobile Pages v3"): Settings, World clocks, Account, the first-run
// choice and the four status screens. CLIENT-SAFE: this file imports the phone kit, the icons and the clock helpers,
// nothing else — no console, no agent, no permissions, no staff page. A client's browser downloads this and stops.
// Nothing here says "saved" or "changed" before the server (or the phone's own store) accepted it.
import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { c, MONO, SAFE_TOP, SAFE_BOTTOM, tone, Btn, BrandFoot, Group, IconBtn, Logo, Page, Row, Segmented, Sheet, Switch } from '../kit';
import { COMMON_PAGES } from './names';
import { CITY_CHOICES, MAX_CLOCKS, clock, clocksOf, codeFor, hmIn, offsetLabel } from './clocks';

export { COMMON_PAGES };

const COMPANY = 'Clearway Handling & Operations';
/** The foot line: the company, and the support address only when the setting holds one. */
export const footLine = (ctx) => (ctx?.supportEmail ? `${COMPANY} · ${ctx.supportEmail}` : COMPANY);
const START_WORD = { timeline: 'Timeline', flights: 'Flights list' };
const START_OPTIONS = [{ value: 'timeline', label: 'Timeline' }, { value: 'flights', label: 'Flights list' }];
const isClient = (ctx) => ctx?.role === 'client';

function useNow(everyMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(id); }, [everyMs]);
  return now;
}

/** A line of words under a control: what happened, in its tone. */
function Note({ words, kind, ...rest }) {
  if (!words) return null;
  return <div role="status" aria-live="polite" {...rest} style={{ fontSize: 13, lineHeight: 1.45, color: tone(kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'muted'), overflowWrap: 'anywhere' }}>{words}</div>;
}

/** One setting: name left, its control right, the explanation and the result below, full width. */
function SetRow({ k, label, sub, note, noteKind, children }) {
  return (
    <div data-settings-row={k} style={{ padding: '8px 16px', minHeight: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, borderBottom: `1px solid ${c('l1')}`, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 16, color: c('t1'), overflowWrap: 'anywhere' }}>{label}</span>
        {children}
      </div>
      {sub ? <div style={{ fontSize: 13, lineHeight: 1.45, color: c('t3'), overflowWrap: 'anywhere' }}>{sub}</div> : null}
      <Note words={note} kind={noteKind} data-settings-note={k} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── Settings
function SettingsPage({ ctx }) {
  const client = isClient(ctx);
  const prefs = ctx.prefs || {};
  const notify = { delays: true, movements: true, services: true, ...(prefs.notify || {}) };
  const [said, setSaid] = useState({});          // per row: { words, kind }
  const [startBusy, setStartBusy] = useState(false);
  const [startSaved, setStartSaved] = useState(null); // the start page the server accepted in this visit (client)
  const say = (k, words, kind) => setSaid((s) => ({ ...s, [k]: words ? { words, kind } : undefined }));

  /** A phone-only preference: kept on this phone. Words only when keeping it failed. */
  async function keep(k, patch) {
    try { await ctx.setPrefs(patch); say(k, ''); }
    catch { say(k, 'That could not be kept on this phone. Try again.', 'bad'); }
  }

  const start = client ? (startSaved ?? ctx.clientPrefs?.start ?? 'timeline') : (prefs.view === 'flights' ? 'flights' : 'timeline');
  async function pickStart(v) {
    if (v === start || startBusy) return;
    if (!client) { await keep('start', { view: v }); return; }
    setStartBusy(true); say('start', 'Saving…');
    try {
      if (typeof ctx.saveClientPrefs !== 'function') throw new Error('no saver');
      await ctx.saveClientPrefs({ start: v });
      setStartSaved(v); say('start', `Saved. ${START_WORD[v]} opens after you sign in.`, 'ok');
    } catch { say('start', 'The choice could not be saved. Try again.', 'bad'); }
    finally { setStartBusy(false); }
  }

  const shown = clocksOf(prefs, ctx.roomClocks).length;
  const range = ['6H', '12H', 'DAY'].includes(prefs.range) ? prefs.range : '12H';
  const theme = ['dark', 'light', 'system'].includes(ctx.theme) ? ctx.theme : 'system';
  const title = client ? 'Settings' : 'Phone settings';

  return (
    <Page name="settings" title={title} back={client ? 'Back' : 'More'} onBack={ctx.back}>
      <Group label="Opening">
        <SetRow k="start" label="Start page" sub={client ? 'What opens after you sign in.' : 'What this phone opens first.'} note={said.start?.words} noteKind={said.start?.kind}>
          <Segmented label="Start page" options={START_OPTIONS} value={start} onChange={pickStart} style={{ flex: 'none', width: 196, opacity: startBusy ? 0.6 : 1 }} data-settings-control="start" aria-busy={startBusy || undefined} />
        </SetRow>
        <SetRow k="range" label="Default range" sub="The timeline keeps whatever range you last chose." note={said.range?.words} noteKind={said.range?.kind}>
          <Segmented label="Default range" options={[{ value: '6H', label: '6H' }, { value: '12H', label: '12H' }, { value: 'DAY', label: 'DAY' }]} value={range} onChange={(v) => keep('range', { range: v })} style={{ flex: 'none', width: 168, ...MONO }} data-settings-control="range" />
        </SetRow>
      </Group>
      <Group label="Display">
        <SetRow k="theme" label="Theme" note={said.theme?.words} noteKind={said.theme?.kind}>
          <Segmented label="Theme" options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} value={theme}
            onChange={(v) => { try { ctx.setTheme(v); say('theme', ''); } catch { say('theme', 'The theme could not be changed. Try again.', 'bad'); } }} style={{ flex: 'none', width: 204 }} data-settings-control="theme" />
        </SetRow>
        <Row data-settings-row="clocks" label="World clocks" sub="UTC is always shown." value={prefs.clocksOn === false ? 'Off' : `${shown} shown`} chevron onClick={() => ctx.go('clocks')} minHeight={60} />
        <SetRow k="awake" label="Keep screen awake" sub="While the timeline is open." note={said.awake?.words} noteKind={said.awake?.kind}>
          <Switch on={Boolean(prefs.awake)} label="Keep screen awake" onChange={(v) => keep('awake', { awake: v })} data-settings-control="awake" />
        </SetRow>
        {client ? <Row data-settings-row="desktop-display" label="Desktop timeline display" sub="Size, spacing, colours and font of the timeline on a computer." href="/client/settings" external minHeight={60} /> : null}
      </Group>
      <Group label="Notifications">
        <SetRow k="notify-delays" label="Delays and cancellations" note={said['notify-delays']?.words} noteKind={said['notify-delays']?.kind}>
          <Switch on={notify.delays !== false} label="Delays and cancellations" onChange={(v) => keep('notify-delays', { notify: { ...notify, delays: v } })} data-settings-control="notify-delays" />
        </SetRow>
        <SetRow k="notify-movements" label="Departures and arrivals" note={said['notify-movements']?.words} noteKind={said['notify-movements']?.kind}>
          <Switch on={notify.movements !== false} label="Departures and arrivals" onChange={(v) => keep('notify-movements', { notify: { ...notify, movements: v } })} data-settings-control="notify-movements" />
        </SetRow>
        {client ? null : (
          <SetRow k="notify-services" label="Service confirmations" note={said['notify-services']?.words} noteKind={said['notify-services']?.kind}>
            <Switch on={notify.services !== false} label="Service confirmations" onChange={(v) => keep('notify-services', { notify: { ...notify, services: v } })} data-settings-control="notify-services" />
          </SetRow>
        )}
      </Group>
      <div style={{ height: `calc(24px + ${SAFE_BOTTOM})` }} />
    </Page>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── World clocks
const FIELD = { width: '100%', height: 48, padding: '0 12px', borderRadius: 8, border: `1px solid ${c('l2')}`, background: c('bg2'), color: c('t1'), fontSize: 16, minWidth: 0 };

function ClocksPage({ ctx }) {
  const prefs = ctx.prefs || {};
  const now = useNow();
  const own = Array.isArray(prefs.clocks);
  const list = clocksOf(prefs, ctx.roomClocks);
  const [editing, setEditing] = useState(null);   // the zone being renamed
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [said, setSaid] = useState(null);

  async function write(patch) {
    try { await ctx.setPrefs(patch); setSaid(null); return true; }
    catch { setSaid('That could not be kept on this phone. Try again.'); return false; }
  }
  const save = (next) => write({ clocks: next.map(clock).filter(Boolean) });
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; save(next); };
  const remove = (k) => { if (k.utc) return; save(list.filter((x) => x.tz !== k.tz)); };
  const rename = async (k) => {
    const label = draft.trim().toUpperCase().slice(0, 12);
    if (!label) { setSaid('Type a name first.'); return; }
    if (await save(list.map((x) => (x.tz === k.tz ? { ...x, label, name: label, code: codeFor(label, x.tz) } : x)))) setEditing(null);
  };
  const full = list.length >= MAX_CLOCKS;
  const choices = CITY_CHOICES.filter((ch) => !list.some((k) => k.tz === ch.tz));
  const add = async (ch) => { if (full) return; if (await save([...list, ch])) setAdding(false); };
  const small = { minHeight: 44, minWidth: 44, padding: '0 12px', borderRadius: 8, border: `1px solid ${c('l2')}`, fontSize: 13, fontWeight: 600, color: c('t1'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };

  return (
    <>
      <Page name="clocks" title="World clocks" back="Settings" onBack={ctx.back}>
        <SetRow k="clocks-on" label="Show world clocks" sub="UTC is always shown.">
          <Switch on={prefs.clocksOn !== false} label="Show world clocks" onChange={(v) => write({ clocksOn: v })} data-settings-control="clocks-on" />
        </SetRow>
        <Group label="Clocks" count={`${list.length} / ${MAX_CLOCKS}`}>
          {list.map((k, i) => (
            <div key={k.tz} data-clock-row={k.code} data-clock-zone={k.tz} style={{ padding: '10px 16px 8px', borderBottom: `1px solid ${c('l1')}`, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ ...MONO, width: 56, flex: 'none', fontSize: 13, fontWeight: 700, color: c('t1') }}>{k.code}</span>
                {editing === k.tz ? (
                  <input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase().slice(0, 12))} maxLength={12} autoFocus aria-label={`New name for ${k.label}`} data-clock-name=""
                    onKeyDown={(e) => { if (e.key === 'Enter') rename(k); if (e.key === 'Escape') setEditing(null); }} style={{ ...FIELD, flex: 1, height: 44 }} />
                ) : (
                  <span style={{ flex: 1, minWidth: 0, fontSize: 16, color: c('t1'), overflowWrap: 'anywhere' }}>{k.label}</span>
                )}
                <span style={{ ...MONO, flex: 'none', fontSize: 13, color: c('t3'), textAlign: 'right' }}>{hmIn(now, k.tz)}{k.utc ? 'Z' : ` · ${offsetLabel(now, k.tz)}`}</span>
              </div>
              {editing === k.tz ? (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="cw3-press" style={small} onClick={() => setEditing(null)} data-clock-cancel="">Cancel</button>
                  <button type="button" className="cw3-press" style={{ ...small, background: c('inv'), color: c('on-inv'), borderColor: c('inv') }} onClick={() => rename(k)} data-clock-save="">Save name</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                  {k.utc ? <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c('t3') }}><Icon name="lock" size={16} color={c('t4')} />Always shown</span> : null}
                  <IconBtn icon="arrow-up" label={`Move ${k.label} up`} onClick={() => move(i, -1)} disabled={i === 0} style={{ opacity: i === 0 ? 0.35 : 1 }} data-clock-up="" />
                  <IconBtn icon="arrow-down" label={`Move ${k.label} down`} onClick={() => move(i, 1)} disabled={i === list.length - 1} style={{ opacity: i === list.length - 1 ? 0.35 : 1 }} data-clock-down="" />
                  {k.utc ? null : <IconBtn icon="pencil" label={`Rename ${k.label}`} onClick={() => { setDraft(k.label); setEditing(k.tz); setSaid(null); }} data-clock-rename="" />}
                  {k.utc ? null : <IconBtn icon="trash-2" label={`Remove ${k.label}`} onClick={() => remove(k)} data-clock-remove="" />}
                </div>
              )}
            </div>
          ))}
          {full
            ? <Row data-clock-add="full" icon="plus" label="Add a city" sub={`${MAX_CLOCKS} of ${MAX_CLOCKS} · remove one to add`} />
            : <Row data-clock-add="" icon="plus" label="Add a city" chevron onClick={() => { setAdding(true); setSaid(null); }} />}
          {own ? <Row data-clock-standard="" icon="rotate-ccw" label="Use the standard clocks" sub="Drops your own list." onClick={() => write({ clocks: null })} /> : null}
        </Group>
        <div style={{ padding: '12px 16px' }}>
          <Note words={said} kind="bad" data-clock-note="" />
          {own ? null : <div style={{ fontSize: 13, lineHeight: 1.45, color: c('t3') }}>These are the standard clocks. A change here makes the list your own, on this phone.</div>}
        </div>
        <div style={{ height: `calc(24px + ${SAFE_BOTTOM})` }} />
      </Page>
      {adding ? (
        <Sheet name="add-clock" title="Add a city" sub={`${list.length} of ${MAX_CLOCKS} shown`} onClose={() => setAdding(false)} z={30}>
          {choices.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: c('t3') }}>Every city on the list is already shown.</div> : null}
          {choices.map((ch) => <Row key={ch.tz} data-clock-choice={ch.code} tag={ch.code} label={ch.label} value={<span style={MONO}>{hmIn(now, ch.tz)} · {offsetLabel(now, ch.tz)}</span>} onClick={() => add(ch)} />)}
          {said ? <div style={{ padding: 16 }}><Note words={said} kind="bad" /></div> : null}
        </Sheet>
      ) : null}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── Account
const first = (...v) => v.map((x) => (x == null ? '' : String(x).trim())).find(Boolean) || '';

/** What a client was granted, read from the feed the server already cut to them: operators with their aircraft. */
function grantsFrom(aircraft) {
  const map = new Map();
  for (const a of Array.isArray(aircraft) ? aircraft : []) {
    const id = first(a?.oprId, a?.operatorId, a?.operatorName, a?.operator).toLowerCase();
    if (!id) continue;
    if (!map.has(id)) map.set(id, { id, name: first(a?.operatorName, a?.operator) || id.toUpperCase(), regs: [] });
    const reg = first(a?.registration, a?.reg);
    if (reg && !map.get(id).regs.includes(reg)) map.get(id).regs.push(reg);
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}

function PasswordSheet({ ctx, onClose }) {
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null); const [done, setDone] = useState(null);
  const email = first(ctx.me?.email);

  async function change(e) {
    e?.preventDefault?.();
    if (busy) return;
    setError(null);
    if (!current) { setError({ text: 'Enter your current password.', field: 'current' }); return; }
    if (next.length < 10) { setError({ text: 'The new password needs at least 10 characters.', field: 'next' }); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/client/account/password', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current, next }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) { setError({ text: (typeof d?.error === 'string' && d.error.trim()) || 'The password was not changed. Try again in a few minutes.', field: d?.field }); return; }
      setCurrent(''); setNext(''); setShow(false); setDone({ noticeSent: Boolean(d.noticeSent) });
    } catch { setError({ text: 'The password was not changed: no connection. Check the network and try again.' }); }
    finally { setBusy(false); }
  }

  const type = show ? 'text' : 'password';
  const label = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: c('t3') };
  const bad = (f) => (error?.field === f ? { borderColor: c('bad') } : null);
  return (
    <Sheet name="password" title="Change password" sub={done ? null : 'At least 10 characters.'} onClose={onClose} z={30}>
      {done ? (
        <div data-password-changed="" role="status" style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: c('ok') }}><Icon name="check" size={20} />Password changed</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: c('t2') }}>
            Every device was signed out, this phone too. Sign in again with the new password.
            {done.noticeSent ? ` A note went to ${email || 'your email address'}.` : ''}
          </div>
          <Btn href="/login" data-password-signin="" style={{ marginTop: 8 }}>Go to sign in</Btn>
        </div>
      ) : (
        <form onSubmit={change} noValidate style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }} data-password-form="">
          <label style={label}>Current password
            <input type={type} name="current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={error?.field === 'current' || undefined} style={{ ...FIELD, ...bad('current') }} />
          </label>
          <label style={label}>New password
            <input type={type} name="next" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={error?.field === 'next' || undefined} style={{ ...FIELD, ...bad('next') }} />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
            <span style={{ fontSize: 16, color: c('t1') }}>Show passwords</span>
            <Switch on={show} label="Show passwords" onChange={setShow} />
          </div>
          {error ? <div role="alert" data-password-error="" style={{ fontSize: 13, lineHeight: 1.45, color: c('bad') }}>{error.text}</div> : null}
          <button type="submit" className="cw3-press" disabled={busy} data-change-password=""
            style={{ height: 48, borderRadius: 8, background: c('inv'), color: c('on-inv'), fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Changing…' : 'Change password'}
          </button>
          <div style={{ fontSize: 13, lineHeight: 1.45, color: c('t3') }}>Changing it signs out every device, this phone too.</div>
        </form>
      )}
    </Sheet>
  );
}

function AccountPage({ ctx }) {
  const client = isClient(ctx);
  const me = ctx.me || {};
  const [pw, setPw] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [said, setSaid] = useState('');
  async function signOut() {
    if (leaving) return;
    setLeaving(true); setSaid('');
    try { await ctx.signOut(); }
    catch { setLeaving(false); setSaid('Sign out did not go through. Try again.'); }
  }
  const name = client ? first(me.personName, me.name) : first(me.name, me.fullName, me.displayName);
  const email = first(me.email);
  const grants = client ? grantsFrom(ctx.aircraft) : [];
  const granted = Array.isArray(me.scopeKinds) && me.scopeKinds.length > 0;
  const level = String(me.passengerLevel || 'off');
  const role = first(me.roleLabel, me.permRole, me.role);

  return (
    <>
      <Page name="account" title="Account" back="Back" onBack={ctx.back} data-account={client ? 'client' : 'staff'}>
        <Group label="You">
          {(name || email) ? <Row icon="circle-user" label={name || email} sub={name ? email : ''} data-account-you="" /> : null}
          {client && first(me.company) ? <Row label="Organisation" value={first(me.company)} data-account-company="" /> : null}
          {client ? <Row label="Access" value="Client · view only" data-account-access="" />
            : role ? <Row label="Access" value={`Staff · ${role.replace(/[_-]+/g, ' ')}`} data-account-access="" /> : <Row label="Access" value="Staff" data-account-access="" />}
        </Group>
        {client ? (
          <>
            <Group label="Operators you can see" count={grants.length || ''}>
              {grants.map((g) => <Row key={g.id} label={g.name} sub={g.regs.join(' · ')} mono={false} data-account-grant={g.id} />)}
              {grants.length === 0 ? (
                <div data-account-grants-empty="" style={{ padding: '14px 16px', fontSize: 13, lineHeight: 1.45, color: c('t3'), borderBottom: `1px solid ${c('l1')}` }}>
                  {!ctx.loadedOnce ? 'Reading…' : granted ? 'Nothing of yours is on the board right now. Flights appear here when Clearway ops has them on the schedule.' : 'No operators or aircraft are on your account yet.'}
                </div>
              ) : null}
              <div style={{ padding: '10px 16px', fontSize: 13, lineHeight: 1.45, color: c('t3'), borderBottom: `1px solid ${c('l1')}`, overflowWrap: 'anywhere' }}>
                Granted by Clearway ops.{ctx.supportEmail ? <> To change it, write to <a href={`mailto:${ctx.supportEmail}`} style={{ display: 'inline-block', padding: '14px 0', margin: '-14px 0', color: c('t1'), textDecoration: 'underline', textUnderlineOffset: 3, overflowWrap: 'anywhere', maxWidth: '100%' }}>{ctx.supportEmail}</a>.</> : null}
              </div>
            </Group>
            <Group label="Shared with you">
              <Row label="Passenger names" value={level === 'off' ? 'Off' : 'On'} valueTone={level === 'off' ? undefined : 'ok'} data-account-passengers={level === 'off' ? 'off' : 'on'} />
            </Group>
          </>
        ) : null}
        <Group label="">
          {client ? <Row icon="key-round" label="Change password" chevron onClick={() => setPw(true)} data-account-password="" />
            : <Row icon="circle-user" label="Profile" sub="Your name and password, in the portal." href="/m/profile" external data-account-profile="" />}
          <Row icon="log-out" label={leaving ? 'Signing out…' : 'Sign out'} chevron onClick={signOut} data-signout="" />
        </Group>
        {said ? <div style={{ padding: '12px 16px' }}><Note words={said} kind="bad" data-account-note="" /></div> : null}
        <BrandFoot line={footLine(ctx)} />
        <div style={{ height: SAFE_BOTTOM }} />
      </Page>
      {pw && client ? <PasswordSheet ctx={ctx} onClose={() => setPw(false)} /> : null}
    </>
  );
}

/** Settings, World clocks and Account, by name. An unknown name draws nothing (the core routes only known names). */
export function CommonPage({ name, ctx }) {
  if (!ctx) return null;
  if (name === 'settings') return <SettingsPage ctx={ctx} />;
  if (name === 'clocks') return <ClocksPage ctx={ctx} />;
  if (name === 'account') return <AccountPage ctx={ctx} />;
  return null;
}

// ───────────────────────────────────────────────────────────────────────────────────────────── First run
const CHOICES = [
  { value: 'timeline', label: 'Timeline', icon: 'align-left', sub: 'Flights laid out against the clock, with a line for now. Best for seeing what is in the air and what departs next.' },
  { value: 'flights', label: 'Flights list', icon: 'list', sub: 'The same flights as rows, grouped by day, with search. Best for finding one flight.' },
];

/** A client's first run, step 3 of 3: where the app opens. onDone(start) only after the server kept the choice. */
export function Onboarding({ ctx, onDone }) {
  const [pick, setPick] = useState(() => (ctx?.clientPrefs?.start === 'flights' ? 'flights' : 'timeline'));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  async function open() {
    if (busy) return;
    setBusy(true); setSaid('');
    try {
      if (typeof ctx?.saveClientPrefs !== 'function') throw new Error('no saver');
      await ctx.saveClientPrefs({ start: pick });
      onDone?.(pick);
    } catch { setSaid('The choice could not be saved. Check the connection and try again.'); setBusy(false); }
  }
  const word = pick === 'flights' ? 'flights list' : 'timeline';
  return (
    <Page name="onboarding" title="Set up" back="Back" onBack={ctx?.back} data-onboarding=""
      foot={<><Note words={said} kind="bad" data-onboarding-note="" /><Btn onClick={open} disabled={busy} data-onboarding-open={pick}>{busy ? 'Saving…' : `Open ${word}`}</Btn></>}>
      <div style={{ padding: '24px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Logo height={20} />
        <span style={{ marginTop: 16, ...MONO, fontSize: 11, color: c('t4') }}>STEP 3 OF 3</span>
        <span style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.25, color: c('t1') }}>Where should Clearway open?</span>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: c('t3') }}>Both show the same flights. You can change this later in Settings.</span>
      </div>
      <div role="radiogroup" aria-label="Where should Clearway open?" style={{ borderBottom: `1px solid ${c('l1')}` }}>
        {CHOICES.map((ch) => {
          const on = pick === ch.value;
          return (
            <button key={ch.value} type="button" role="radio" aria-checked={on} data-onboarding-choice={ch.value} onClick={() => { setPick(ch.value); setSaid(''); }}
              style={{ width: '100%', padding: 16, borderTop: `1px solid ${c('l1')}`, display: 'flex', alignItems: 'flex-start', gap: 12, background: on ? c('s1') : 'transparent', textAlign: 'left', minHeight: 64 }}>
              <span aria-hidden="true" style={{ flex: 'none', width: 20, height: 20, borderRadius: 10, border: `1px solid ${on ? c('t1') : c('l2')}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: on ? c('t1') : 'transparent' }} />
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: c('t1') }}><Icon name={ch.icon} size={20} color={c('t3')} />{ch.label}</span>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: c('t3') }}>{ch.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Page>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── Status screens
const HOME = `${import.meta.env.BASE_URL || '/'}phone/`;
const STATUS = {
  403: { icon: 'ban', code: '403 · NO ACCESS', title: 'Your account can’t open this flight', body: 'It belongs to an operator you haven’t been granted. Ask Clearway ops if you think you should see it.', btn: 'Back to timeline', href: HOME },
  404: { icon: 'search-x', code: '404 · NOT FOUND', title: 'There’s nothing at this address', body: 'The flight may have been removed from the schedule, or the link was copied incompletely.', btn: 'Back to timeline', href: HOME },
  expired: { icon: 'link-2-off', code: 'LINK EXPIRED', title: 'This invitation link has expired', body: 'Links work for 7 days and can be used once. Ask the person who invited you to send a new one.', btn: 'Go to sign in', href: '/login' },
  maintenance: { icon: 'wrench', code: 'MAINTENANCE', title: 'Clearway is down for maintenance', body: 'We are working on the service. Flight data is safe.', btn: '', href: '' },
};

/**
 * A full screen that says why nothing is here. `info` (or ctx.statusInfo) may carry what is known: { path, sent,
 * expired, expectedBack, note } — a line is drawn only for what was given, never a sample value.
 * A client never gets the 403 words: "it belongs to an operator you haven't been granted" would tell them a flight
 * exists outside their grant. For a client, 403 draws the 404 screen.
 */
export function StatusScreen({ kind, ctx, info }) {
  const asked = String(kind || '404');
  const k = STATUS[asked] ? (asked === '403' && isClient(ctx) ? '404' : asked) : '404';
  const s = STATUS[k];
  const i = info || ctx?.statusInfo || {};
  const email = first(ctx?.me?.email);
  let meta = '';
  if (k === '403') meta = email ? `Signed in as ${email}` : '';
  else if (k === '404') meta = first(i.path) || (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '');
  else if (k === 'expired') meta = [i.sent ? `Sent ${i.sent}` : '', i.expired ? `expired ${i.expired}` : ''].filter(Boolean).join(' · ');
  else if (k === 'maintenance') meta = i.expectedBack ? `Expected back: ${i.expectedBack}` : '';
  const body = k === 'maintenance' && first(i.note) ? first(i.note) : s.body;
  return (
    <div data-status-screen={k} data-status-asked={asked} role="main" style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: c('bg'), color: c('t1'), paddingTop: SAFE_TOP, minHeight: 0 }}>
      <div style={{ flex: 'none', height: 52, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: `1px solid ${c('l1')}` }}><Logo height={20} /></div>
      <div className="cw3-scroll" style={{ flex: 1, padding: '72px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
        <Icon name={s.icon} size={20} color={c('t3')} />
        <span data-status-code="" style={{ ...MONO, fontSize: 11, letterSpacing: '.06em', color: c('t4') }}>{s.code}</span>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.25, color: c('t1') }}>{s.title}</h1>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: c('t2') }}>{body}</div>
        {meta ? <div data-status-meta="" style={{ ...MONO, fontSize: 13, lineHeight: 1.5, color: c('t3'), overflowWrap: 'anywhere', maxWidth: '100%' }}>{meta}</div> : null}
        {s.btn ? <Btn href={s.href} block={false} data-status-action="" style={{ marginTop: 12, padding: '0 24px' }}>{s.btn}</Btn> : null}
      </div>
      <div data-status-foot="" style={{ flex: 'none', padding: `14px 24px calc(14px + ${SAFE_BOTTOM})`, borderTop: `1px solid ${c('l1')}`, fontSize: 13, color: c('t3'), overflowWrap: 'anywhere' }}>{footLine(ctx)}</div>
    </div>
  );
}
