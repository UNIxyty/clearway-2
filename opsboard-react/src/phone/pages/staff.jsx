// Staff pages of the phone app (v3): NOTAM check, Limits, Important, More, the console pages a phone can open, Wall
// settings and Service status. This file is loaded lazily and only for a staff session: it pulls in console code, and
// a client's browser must never download that. Each page draws its own kit Page; Back is ctx.back().
// Rule kept in every page: a mark, switch or reset shows as done only after the server answered; every failure has
// words on the page; nothing here opens a browser dialog.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import { c, MONO, SAFE_BOTTOM, Btn, Msg, Skel, Group, Row, Sheet, Page, Switch, Segmented, BrandFoot } from '../kit';
import { STAFF_PAGES } from './names';
import { footLine } from './common';
import './console-embed.css';
import {
  buildApiUrl, fetchNotamCheckToday, ackNotamCheck, resyncNotamCheckAirport,
  fetchLimitations, setLimitationActive, fetchImportant, updateImportant,
  fetchOperators, fetchReports, fetchDisplaySettings, saveDisplaySettings, fetchDisplayDevices,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import { errorText } from '../../services/errorText';
import { ConsoleStyles, PermissionsProvider, ToastProvider, ViewOnly, ViewOnlyNote } from '../../components/console/ui';
import { DeviceCtx, DisplayScaleCard, HourSpacingCard, VerticalSizingCard, HorizontalSizingCard, ChipsCard } from '../../components/console/LookCards';
import ColoursCard from '../../components/console/ColoursCard';
import FontCard from '../../components/console/FontCard';
import { resolveWallFont } from '../../theme/wallFont';
import { parseNotam, validityText } from '../../../../shared/notam-parse.mjs';

export { STAFF_PAGES };

const NotamCheckPage = lazy(() => import('../../components/console/NotamCheckPage'));
const LimitationsPage = lazy(() => import('../../components/console/LimitationsPage'));
const ImportantPage = lazy(() => import('../../components/console/ImportantPage'));
const OperatorsPage = lazy(() => import('../../components/console/OperatorsPage'));
const AircraftPage = lazy(() => import('../../components/console/AircraftPage'));
const CaaPage = lazy(() => import('../../components/console/CaaPage'));
const ReportsPage = lazy(() => import('../../components/console/ReportsPage'));
const ConsoleSettingsPage = lazy(() => import('../../components/console/SettingsPage'));

// ───────────────────────────────────────────────────────────────────────────────────────────── small helpers
const two = (n) => String(n).padStart(2, '0');
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ms = (v) => (typeof v === 'number' ? v : Date.parse(v));
const hmZ = (v) => { const d = new Date(ms(v)); return Number.isFinite(d.getTime()) ? `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}Z` : ''; };
const hmsZ = (v) => { const d = new Date(ms(v)); return Number.isFinite(d.getTime()) ? `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}Z` : ''; };
const dayZ = (v) => { const d = new Date(ms(v)); return Number.isFinite(d.getTime()) ? `${two(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}` : ''; };
const stampZ = (v) => [dayZ(v), hmZ(v)].filter(Boolean).join(' ');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A person as the lists show them: the name as given, or the part of an address before the @, never longer than 14. */
const who = (v) => { const s = String(v || '').trim(); const base = s.includes('@') ? s.split('@')[0] : s; return base.length > 14 ? `${base.slice(0, 13)}…` : base; };
const canOf = (ctx) => (action) => Boolean(ctx?.me?.can?.[action]);
/** "Couldn’t load <title>" in lower case, short forms kept in capitals. */
const lowerTitle = (title) => String(title).toLowerCase().replace(/\bnotam\b/g, 'NOTAM').replace(/\bcaa\b/g, 'CAA');

/**
 * One read with the three states every page has. `data` stays on a failed refresh (the page then says it is old);
 * a first read that fails gives phase 'failed'. reload() shows the skeleton again only when there is nothing to show.
 */
function useLoad(read) {
  const readRef = useRef(read); readRef.current = read;
  const [st, setSt] = useState({ phase: 'loading', data: null, triedAt: 0, okAt: 0, old: false });
  const alive = useRef(true); const seq = useRef(0);
  const run = useCallback(async (quiet) => {
    const my = ++seq.current;
    if (!quiet) setSt((s) => (s.data == null ? { ...s, phase: 'loading' } : s));
    try {
      const data = await readRef.current();
      if (alive.current && my === seq.current) setSt({ phase: 'ready', data, triedAt: Date.now(), okAt: Date.now(), old: false });
    } catch {
      if (alive.current && my === seq.current) setSt((s) => (s.data != null ? { ...s, old: true, triedAt: Date.now() } : { phase: 'failed', data: null, triedAt: Date.now(), okAt: 0, old: false }));
    }
  }, []);
  useEffect(() => { alive.current = true; run(false); return () => { alive.current = false; }; }, [run]);
  const reload = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);
  const set = useCallback((data) => { seq.current += 1; setSt({ phase: 'ready', data, triedAt: Date.now(), okAt: Date.now(), old: false }); }, []);
  return { ...st, reload, refresh, set };
}

function Failed({ title, at, onRetry }) {
  return (
    <Msg data-load-failed="" title={<span style={{ color: c('bad') }}>Couldn’t load {lowerTitle(title)}</span>}
      body={`The wall service didn’t answer.${at ? ` Last tried ${hmsZ(at)}.` : ''}`} action="Try again" onAction={onRetry} primary />
  );
}
/** The line a list shows when a later read failed and it still draws the earlier answer. */
function OldNote({ load }) {
  if (!load.old) return null;
  return (
    <div data-load-old="" role="status" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${c('l1')}`, background: c('bg2'), fontSize: 13, lineHeight: 1.45, color: c('warn') }}>
      <span style={{ flex: 1, minWidth: 0 }}>Couldn’t refresh. This is what the wall service said at {hmsZ(load.okAt)}.</span>
      <Btn kind="line" height={44} block={false} onClick={load.reload} style={{ fontSize: 13 }}>Try again</Btn>
    </div>
  );
}
function Note({ words, kind, ...rest }) {
  if (!words) return null;
  return <div role="status" aria-live="polite" {...rest} style={{ fontSize: 13, lineHeight: 1.45, color: kind === 'ok' ? c('ok') : kind === 'bad' ? c('bad') : kind === 'warn' ? c('warn') : c('t3'), overflowWrap: 'anywhere' }}>{words}</div>;
}
const Strong = ({ children, t = 'warn' }) => <span style={{ fontWeight: 600, color: c(t), whiteSpace: 'nowrap' }}>{children}</span>;
const MonoVal = ({ children, t = 't3' }) => <span style={{ ...MONO, color: c(t), whiteSpace: 'nowrap' }}>{children}</span>;
/** Text block inside a sheet: a small caps label and the words under it. */
function Block({ label, children, ...rest }) {
  return (
    <div {...rest} style={{ padding: '12px 16px', borderBottom: `1px solid ${c('l1')}`, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {label ? <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: c('t3') }}>{label}</span> : null}
      <div style={{ fontSize: 16, lineHeight: 1.45, color: c('t1'), overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── console embed
const MIRRORED = ['bg', 'bg2', 's1', 's2', 'skel', 'l1', 'l2', 't1', 't2', 't3', 't4', 'inv', 'on-inv', 'scrim', 'ok', 'warn', 'bad', 'air', 'show-light', 'show-dark', 'font', 'mono'];
let embeds = 0; let themeBefore = null;

/**
 * While a console part is on the page, the phone's colours are copied onto <body>: the console draws its own sheets
 * and pushed pages straight under <body>, outside the phone app, and console-embed.css gives them the same colours
 * from these values. Counted, so two embeds at once leave the body clean only when the last one goes.
 */
function useBodyMirror(ref, theme) {
  useEffect(() => {
    const body = document.body; const el = ref.current;
    if (!el || !body) return undefined;
    if (embeds === 0) themeBefore = body.getAttribute('data-theme');
    embeds += 1;
    const cs = getComputedStyle(el);
    for (const n of MIRRORED) { const v = cs.getPropertyValue(`--c-${n}`); if (v) body.style.setProperty(`--c-${n}`, v.trim()); }
    body.setAttribute('data-cw3-embed', theme);
    body.setAttribute('data-theme', theme);
    return () => {
      embeds -= 1;
      if (embeds > 0) return;
      for (const n of MIRRORED) body.style.removeProperty(`--c-${n}`);
      body.removeAttribute('data-cw3-embed');
      if (themeBefore == null) body.removeAttribute('data-theme'); else body.setAttribute('data-theme', themeBefore);
      themeBefore = null;
    };
  }, [ref, theme]);
}

/**
 * A piece of the ops console inside a phone page, in two parts.
 * ConsoleRoot: once per page. The console's permission context and its style sheet, and the body mirror above.
 * ConsoleBox: the wrapper that console-embed.css paints with the phone's colours; it holds the console's toasts (so
 * a toast is drawn in the phone's colours too) and the view-only state. A page may hold several boxes under one root.
 */
function ConsoleRoot({ ctx, children }) {
  const ref = useRef(null);
  const theme = ctx?.resolvedTheme === 'light' ? 'light' : 'dark';
  const me = ctx?.me;
  const can = useMemo(() => (action) => Boolean(me?.can?.[action]), [me]);
  useBodyMirror(ref, theme);
  return (
    <PermissionsProvider can={can}>
      <ConsoleStyles />
      <span ref={ref} hidden />
      {children}
    </PermissionsProvider>
  );
}
function ConsoleBox({ ctx, viewOnly = false, flush = false, children, ...rest }) {
  const theme = ctx?.resolvedTheme === 'light' ? 'light' : 'dark';
  return (
    <div className={`cw-kit cws-console cw3-console${flush ? ' cw3-console-flush' : ''}`} data-staff-console="" data-theme={theme} {...rest}>
      <ToastProvider>
        <ViewOnly when={viewOnly}>
          <Suspense fallback={<Skel />}>{children}</Suspense>
        </ViewOnly>
      </ToastProvider>
    </div>
  );
}
/** One whole console page. `actions` = the console's own list for that page: with none of them it is view only. */
function Embed({ ctx, actions, children }) {
  const can = canOf(ctx);
  const viewOnly = Array.isArray(actions) ? !actions.some(can) : false;
  return (
    <ConsoleRoot ctx={ctx}>
      <ConsoleBox ctx={ctx} viewOnly={viewOnly}><ViewOnlyNote />{children}</ConsoleBox>
    </ConsoleRoot>
  );
}

const CONSOLE = {
  operators: { title: 'Operators', Comp: OperatorsPage, actions: ['wall.operators.create', 'wall.operators.edit', 'wall.operators.delete'] },
  aircraft: { title: 'Aircraft', Comp: AircraftPage, actions: ['wall.aircraft.visibility', 'wall.aircraft.delete'] },
  caa: { title: 'CAA details', Comp: CaaPage, actions: ['wall.caa.create', 'wall.caa.edit', 'wall.caa.delete'] },
  reports: { title: 'Reports', Comp: ReportsPage, actions: null },
};
const LIMIT_ACTIONS = ['wall.limitations.create', 'wall.limitations.edit', 'wall.limitations.delete', 'wall.limitations.restore', 'wall.limitations.purge'];
const IMP_ACTIONS = ['wall.imp.create', 'wall.imp.edit', 'wall.imp.delete', 'wall.imp.attachments', 'wall.imp.restore', 'wall.imp.purge'];

/** A whole console page under the phone's bar. */
function ConsolePage({ name, title, back, onBack, ctx, actions, children }) {
  return (
    <Page name={name} title={title} back={back} onBack={onBack} data-full="">
      <Embed ctx={ctx} actions={actions}>{children}</Embed>
    </Page>
  );
}
/** The last row of a native list: the same thing as the console draws it, with every action. */
const FullRow = ({ label, sub, onClick }) => <Row icon="maximize-2" label={label} sub={sub} chevron onClick={onClick} data-full-row="" />;

// ───────────────────────────────────────────────────────────────────────────────────────────── NOTAM check
const OLD_AFTER_H = 6;
const notamAgeH = (a) => { const t = Date.parse(a?.notamsAsOf || ''); return Number.isFinite(t) ? (Date.now() - t) / 3600e3 : NaN; };
function airportSub(a) {
  const all = a.all?.length || 0; const flagged = a.filtered?.length || 0;
  const first = a.error ? 'Fetch failed' : all === 0 ? 'No NOTAMs returned' : `${plural(all, 'NOTAM')} · ${flagged} flagged`;
  const age = notamAgeH(a);
  const old = !a.error && Number.isFinite(age) && age > OLD_AFTER_H ? `read ${hmZ(a.notamsAsOf)}, old data` : '';
  const flights = Array.isArray(a.flights) && a.flights.length ? a.flights.slice(0, 3).join(' · ') + (a.flights.length > 3 ? ` +${a.flights.length - 3}` : '') : '';
  return [first, old, flights].filter(Boolean).join(' · ');
}

const LINE = { fontSize: 13, lineHeight: 1.5, color: c('t2'), overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' };
function NotamItem({ n }) {
  const f = n?.fields?.id !== undefined ? n.fields : parseNotam(n);
  const groups = (n.matches || []).map((m) => m.group).filter(Boolean);
  const line = (key, value, style) => (value ? <div style={{ display: 'flex', gap: 8, minWidth: 0 }}><span style={{ ...MONO, flex: 'none', width: 20, fontSize: 13, color: c('t4') }}>{key})</span><span style={{ ...LINE, flex: 1, minWidth: 0, ...style }}>{value}</span></div> : null);
  return (
    <article data-notam={f.id || n.number || ''} style={{ padding: '12px 16px', borderBottom: `1px solid ${c('l1')}`, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '2px 12px' }}>
        <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: c('t1') }}>{f.id || n.number || 'NOTAM'}{f.type === 'R' ? ' · replaces' : f.type === 'C' ? ' · cancels' : ''}{f.refers ? ` ${f.refers}` : ''}</span>
        <span style={{ ...MONO, fontSize: 13, color: c('t3') }}>{validityText(f)}</span>
      </div>
      {groups.length ? <div data-notam-flags="" style={{ ...MONO, fontSize: 13, color: c('warn'), overflowWrap: 'anywhere' }}>Flagged: {groups.join(' · ')}</div> : null}
      {n.inWindow === false ? <div style={{ fontSize: 13, color: c('t3') }}>Not in force while the flights are there.</div> : null}
      {f.parsed === false ? <div style={{ ...MONO, ...LINE }}>{f.raw || n.condition || n.text || ''}</div> : (
        <>
          {line('Q', f.q, { ...MONO, color: c('t4') })}
          {line('A', f.a, MONO)}
          {line('D', f.d)}
          {line('E', f.e, { fontSize: 16, lineHeight: 1.45, color: c('t1') })}
          {line('F', f.f, MONO)}
          {line('G', f.g, MONO)}
        </>
      )}
    </article>
  );
}

function NotamSheet({ airport, can, onClose, onState }) {
  const [busy, setBusy] = useState(''); const [note, setNote] = useState(null); const [showAll, setShowAll] = useState(false);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const flagged = airport.filtered || []; const all = airport.all || [];
  const list = showAll || flagged.length === 0 ? all : flagged;
  const age = notamAgeH(airport); const old = Number.isFinite(age) && age > OLD_AFTER_H;
  const checked = Boolean(airport.checked);
  const blocked = !checked && (airport.error ? 'The NOTAM fetch for this airport failed. Fetch the NOTAMs again first.' : old ? 'This NOTAM data is more than 6 hours old. Fetch the NOTAMs again first.' : '');
  const act = async (kind) => {
    if (busy) return;
    setBusy(kind); setNote(null);
    try {
      const payload = kind === 'ack' ? await ackNotamCheck(airport.icao) : await resyncNotamCheckAirport(airport.icao);
      if (!Array.isArray(payload?.airports)) throw new Error('no state');
      onState(payload);
      if (!alive.current) return;
      if (kind === 'resync') { const now = payload.airports.find((x) => x.icao === airport.icao); setNote(now?.error ? { kind: 'bad', words: 'The fetch failed again. Try once more in a few minutes.' } : { kind: 'ok', words: `Fetched again at ${hmZ(Date.now())}.` }); }
    } catch (err) {
      if (alive.current) setNote({ kind: 'bad', words: errorText(err, kind === 'ack' ? 'The check was not saved. Try again.' : 'The NOTAMs could not be fetched again. Try again.') });
    } finally { if (alive.current) setBusy(''); }
  };
  const foot = (
    <>
      <Note words={note?.words} kind={note?.kind} data-notam-note="" />
      {checked ? <div data-notam-done="" style={{ fontSize: 13, color: c('ok') }}>✓ Checked {hmZ(airport.checked.at)} by {who(airport.checked.by) || 'ops'}</div> : null}
      {!checked && blocked ? <Note words={blocked} kind="warn" data-notam-blocked="" /> : null}
      {!can('wall.notam.ack') ? <Note words="You can read these. Marking an airport checked needs the NOTAM check permission." data-notam-view-only="" /> : checked
        ? <Btn kind="line" onClick={() => act('ack')} disabled={Boolean(busy)} data-notam-undo="">{busy === 'ack' ? 'Saving…' : 'Mark as not checked'}</Btn>
        : <Btn onClick={() => act('ack')} disabled={Boolean(busy) || Boolean(blocked)} data-notam-ack="">{busy === 'ack' ? 'Saving…' : 'Mark checked'}</Btn>}
      {can('wall.notam.resync') ? <Btn kind="line" onClick={() => act('resync')} disabled={Boolean(busy)} data-notam-resync="">{busy === 'resync' ? 'Fetching…' : 'Fetch the NOTAMs again'}</Btn> : null}
    </>
  );
  return (
    <Sheet name="notam-airport" z={30} title={`${airport.icao}${airport.name ? ` · ${airport.name}` : ''}`} sub={airportSub(airport)} onClose={onClose} foot={foot} height="88%" data-notam-sheet={airport.icao}>
      {flagged.length > 0 && all.length > flagged.length ? (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c('l1')}` }}>
          <Segmented label="Which NOTAMs" value={showAll ? 'all' : 'flagged'} onChange={(v) => setShowAll(v === 'all')} options={[{ value: 'flagged', label: `Flagged ${flagged.length}` }, { value: 'all', label: `All ${all.length}` }]} data-notam-which="" />
        </div>
      ) : null}
      {airport.error ? <Msg title="The NOTAM fetch failed" body="Nothing could be read for this airport in this round." data-notam-error="" /> : null}
      {!airport.error && all.length === 0 ? <Msg title="No NOTAMs returned" body="The source gave no NOTAMs for this airport." data-notam-none="" /> : null}
      {!airport.error && all.length > 0 && flagged.length === 0 ? <div style={{ padding: '10px 16px', fontSize: 13, color: c('t3'), borderBottom: `1px solid ${c('l1')}` }}>None is flagged by the alert filter. All {all.length} are below.</div> : null}
      {list.map((n, i) => <NotamItem key={`${n.number || 'n'}-${i}`} n={n} />)}
    </Sheet>
  );
}

function NotamPage({ ctx }) {
  const can = canOf(ctx);
  const load = useLoad(fetchNotamCheckToday);
  const [open, setOpen] = useState(null); const [full, setFull] = useState(false);
  useEffect(() => subscribeWallStream('notam-check.changed', load.refresh, { surface: 'console' }), [load.refresh]);
  if (full) {
    return (
      <ConsolePage name="notam" title="NOTAM check" back="List" onBack={() => { setFull(false); load.refresh(); }} ctx={ctx}>
        <NotamCheckPage navigate={(to) => (to?.page === 'reports' ? ctx.go('reports') : setFull(false))} />
      </ConsolePage>
    );
  }
  const airports = Array.isArray(load.data?.airports) ? load.data.airports : [];
  const todo = airports.filter((a) => !a.checked); const done = airports.filter((a) => a.checked);
  const openAirport = open ? airports.find((a) => a.icao === open) : null;
  const row = (a) => (
    <Row key={a.icao} tag={a.icao} label={a.name || a.icao} sub={airportSub(a)} chevron onClick={() => setOpen(a.icao)} data-notam-row={a.icao} data-notam-state={a.checked ? 'checked' : 'todo'}
      value={a.checked ? <MonoVal t="ok">✓ {[who(a.checked.by), hmZ(a.checked.at).replace('Z', '')].filter(Boolean).join(' ')}</MonoVal> : <Strong>To check</Strong>} />
  );
  return (
    <>
      <Page name="notam" title="NOTAM check" back="Wall" onBack={ctx.back}>
        {load.phase === 'loading' ? <Skel /> : load.phase === 'failed' ? <Failed title="NOTAM check" at={load.triedAt} onRetry={load.reload} /> : (
          <>
            <OldNote load={load} />
            {airports.length === 0 ? (load.data?.day
              ? <Msg data-empty="" title="No airports to check" body="There are no flights in the next 24 hours, so this round has no airports." />
              : <Msg data-empty="no-round" title="No check has run yet" body="The NOTAM check runs once a day. Open the full page to run it now." />
            ) : (
              <>
                <div data-notam-hero="" data-done={done.length} data-total={airports.length} style={{ padding: 16, borderBottom: `1px solid ${c('l1')}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ ...MONO, fontSize: 22, fontWeight: 700, lineHeight: 1, color: c('t1') }}>{done.length} / {airports.length}</span>
                    <span style={{ fontSize: 13, color: c('t3') }}>airports checked this round</span>
                  </div>
                  <div aria-hidden="true" style={{ display: 'flex', gap: airports.length > 40 ? 1 : 4 }}>
                    {[...done, ...todo].map((a) => <span key={a.icao} style={{ flex: 1, minWidth: 0, height: 4, background: a.checked ? c('ok') : c('s2') }} />)}
                  </div>
                  {load.data?.lastRunError ? <Note kind="warn" words="The last NOTAM fetch did not finish. Open the full page to run it again." data-notam-run-failed="" /> : load.data?.ranAt ? <span style={{ fontSize: 13, color: c('t4') }}>Round read {stampZ(load.data.ranAt)}</span> : null}
                </div>
                {todo.length ? <Group label="To check" count={todo.length} data-notam-group="todo">{todo.map(row)}</Group> : null}
                {done.length ? <Group label="Checked" count={done.length} data-notam-group="checked">{done.map(row)}</Group> : null}
              </>
            )}
            <Group label="Full page">
              <FullRow label="Full NOTAM check page" sub="Keyword highlights, run the check, report a wrong NOTAM" onClick={() => setFull(true)} />
            </Group>
          </>
        )}
      </Page>
      {openAirport ? <NotamSheet key={openAirport.icao} airport={openAirport} can={can} onClose={() => setOpen(null)} onState={load.set} /> : null}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── Limits
const CLAMP3 = { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
/** '2026-12-31' → '31 DEC' (with the year when it is not this year); anything else comes back as it is. */
function shortDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return String(value || '');
  const year = Number(m[1]); const month = MONTHS[Number(m[2]) - 1] || m[2];
  return `${m[3]} ${month}${year === new Date().getUTCFullYear() ? '' : ` ${m[1]}`}`;
}
const limitScope = (item) => { const m = item.match || item; return [...(m.flights || []).map((f) => f.label || f.nid), ...(m.airportIcaos || []), ...(m.countries || [])].filter(Boolean).map(String); };
const limitTag = (item) => (item.isPermanent ? 'PERM' : item.endDate ? `to ${shortDate(item.endDate)}` : item.startDate ? `from ${shortDate(item.startDate)}` : 'ALWAYS');
const limitWindow = (item) => (item.isPermanent ? 'Permanent' : [item.startDate ? `From ${shortDate(item.startDate)}` : '', item.endDate ? `${item.startDate ? 'until' : 'Until'} ${shortDate(item.endDate)}` : ''].filter(Boolean).join(' ') || 'Always');
const readLimits = async () => { const p = await fetchLimitations({ withMatches: true }); return (p.limitations || []).filter((item) => item.source === 'custom' || !item.source); };

/** A switch that tells the server first: it moves only after the answer, and says so when the answer is no. */
function ServerSwitch({ label, sub, on, allowed, denied, save, k }) {
  const [busy, setBusy] = useState(false); const [note, setNote] = useState(null);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const flip = async (next) => {
    if (busy || !allowed) return;
    setBusy(true); setNote(null);
    try { await save(next); if (alive.current) setNote({ kind: 'ok', words: 'Saved.' }); }
    catch (err) { if (alive.current) setNote({ kind: 'bad', words: errorText(err, 'The change was not saved. Try again.') }); }
    finally { if (alive.current) setBusy(false); }
  };
  return (
    <div data-server-switch={k} style={{ padding: '8px 16px', borderBottom: `1px solid ${c('l1')}`, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 16, color: c('t1') }}>{label}</span>
        <Switch on={on} label={label} disabled={busy || !allowed} onChange={flip} />
      </div>
      {sub ? <div style={{ fontSize: 13, lineHeight: 1.45, color: c('t3') }}>{sub}</div> : null}
      <Note words={busy ? 'Saving…' : !allowed ? denied : note?.words} kind={busy || !allowed ? undefined : note?.kind} data-server-switch-note={k} />
    </div>
  );
}

function LimitSheet({ item, can, onClose, onSaved }) {
  const scope = limitScope(item); const n = item.matchedFlightCount;
  return (
    <Sheet name="limit" z={30} title={item.title || 'Limitation'} sub={limitWindow(item)} onClose={onClose} data-limit-sheet={item.id}>
      <Block label="Applies to" data-limit-scope="">{scope.length ? scope.join(' · ') : 'No flight, airport or country is set, so it matches nothing.'}</Block>
      {item.description ? <Block label="What it says">{item.description}</Block> : null}
      {Number.isFinite(n) ? <Block label="On the wall now">{n === 0 ? 'No flight on the wall matches it.' : `${plural(n, 'flight')} on the wall ${n === 1 ? 'matches' : 'match'} it.`}</Block> : null}
      <ServerSwitch k="limit-active" label="Shown on the wall" sub="Off keeps the limitation but takes it off the flights."
        on={item.isActive !== false} allowed={can('wall.limitations.edit')} denied="You can read this. Changing it needs the limitations permission."
        save={async (next) => { await setLimitationActive(item.id, next); onSaved(item.id, next); }} />
    </Sheet>
  );
}

function LimitsPage({ ctx }) {
  const can = canOf(ctx);
  const load = useLoad(readLimits);
  const [open, setOpen] = useState(null); const [full, setFull] = useState(false);
  useEffect(() => subscribeWallStream('limitations.changed', load.refresh, { surface: 'console' }), [load.refresh]);
  if (full) {
    return <ConsolePage name="limits" title="Limits" back="List" onBack={() => { setFull(false); load.refresh(); }} ctx={ctx} actions={LIMIT_ACTIONS}><LimitationsPage /></ConsolePage>;
  }
  const items = load.data || [];
  const active = items.filter((i) => i.isActive !== false); const off = items.filter((i) => i.isActive === false);
  const groups = [];
  for (const item of active) {
    const scope = limitScope(item);
    const label = scope.length ? scope.slice(0, 3).join(' · ') + (scope.length > 3 ? ` +${scope.length - 3}` : '') : 'No target set';
    const g = groups.find((x) => x.label === label) || (groups.push({ label, rows: [] }), groups[groups.length - 1]);
    g.rows.push(item);
  }
  const openItem = open != null ? items.find((i) => i.id === open) : null;
  const row = (item) => (
    <Row key={item.id} label={item.title || 'Limitation'} sub={item.description ? <span style={CLAMP3}>{item.description}</span> : null} value={<MonoVal>{limitTag(item)}</MonoVal>}
      onClick={() => setOpen(item.id)} data-limit-row={item.id} />
  );
  return (
    <>
      <Page name="limits" title="Limits" back="Wall" onBack={ctx.back}>
        {load.phase === 'loading' ? <Skel /> : load.phase === 'failed' ? <Failed title="Limits" at={load.triedAt} onRetry={load.reload} /> : (
          <>
            <OldNote load={load} />
            {active.length === 0 ? <Msg data-empty="" title="No limitations are active" body="Limitations appear here when one applies to a flight, airport or aircraft on the wall." /> : null}
            {groups.map((g) => <Group key={g.label} label={g.label} count={g.rows.length} data-limit-group={g.label}>{g.rows.map(row)}</Group>)}
            {off.length ? <Group label="Switched off" count={off.length} data-limit-group="off">{off.map(row)}</Group> : null}
            <Group label="Full page">
              <FullRow label="Full limitations editor" sub="Add, change, delete and bring back limitations" onClick={() => setFull(true)} />
            </Group>
          </>
        )}
      </Page>
      {openItem ? <LimitSheet key={openItem.id} item={openItem} can={can} onClose={() => setOpen(null)}
        onSaved={(id, next) => { load.set(items.map((i) => (i.id === id ? { ...i, isActive: next } : i))); load.refresh(); }} /> : null}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── Important
const DIRECTION = { arr: 'arrivals only', arrival: 'arrivals only', dep: 'departures only', departure: 'departures only' };
function impScope(entry) {
  const m = entry.match || {};
  return [...(m.registrations || []), ...(m.operators || []), ...(m.airportIcaos || []), ...(m.countries || [])].filter(Boolean).map(String);
}
const impWhen = (entry) => entry.addedAt ?? entry.createdAt;
const impSub = (entry) => [who(entry.addedBy), stampZ(impWhen(entry))].filter(Boolean).join(' · ');
const readImportant = async () => { const p = await fetchImportant({ includeInactive: true, withMatches: true }); return p.entries || []; };

function ImportantSheet({ entry, can, onClose, onReviewed }) {
  const [busy, setBusy] = useState(false); const [note, setNote] = useState(null);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const scope = impScope(entry); const m = entry.match || {};
  const extra = [DIRECTION[String(m.direction || '').toLowerCase()], m.validFrom ? `from ${shortDate(m.validFrom)}` : '', m.validTo ? `until ${shortDate(m.validTo)}` : ''].filter(Boolean);
  const files = Array.isArray(entry.attachments) ? entry.attachments.length : 0;
  const review = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    try { await updateImportant(entry.id, { reviewed: true }); onReviewed(entry.id); }
    catch (err) { if (alive.current) setNote({ kind: 'bad', words: errorText(err, 'It was not marked reviewed. Try again.') }); }
    finally { if (alive.current) setBusy(false); }
  };
  const added = [stampZ(impWhen(entry)), who(entry.addedBy) ? `by ${who(entry.addedBy)}` : ''].filter(Boolean).join(' ');
  const confirmed = [stampZ(entry.confirmedAt), who(entry.confirmedBy) ? `by ${who(entry.confirmedBy)}` : ''].filter(Boolean).join(' ');
  const foot = (
    <>
      <Note words={note?.words} kind={note?.kind} data-important-note="" />
      {entry.reviewed ? <div data-important-done="" style={{ fontSize: 13, color: c('ok') }}>✓ Reviewed{confirmed ? ` ${confirmed}` : ''}</div>
        : can('wall.imp.edit') ? <Btn onClick={review} disabled={busy} data-important-review="">{busy ? 'Saving…' : 'Mark reviewed'}</Btn>
          : <Note words="You can read this. Marking it reviewed needs the Important permission." data-important-view-only="" />}
    </>
  );
  return (
    <Sheet name="important" z={30} title={entry.title || scope[0] || 'Important'} sub={entry.reviewed ? (entry.isActive === false ? 'Switched off' : 'Active') : 'Needs review'} onClose={onClose} foot={foot} data-important-sheet={entry.id}>
      {entry.body ? <Block label="Note">{entry.body}</Block> : null}
      <Block label="Applies to" data-important-scope="">{scope.length ? [scope.join(' · '), ...extra].join(' · ') : extra.length ? extra.join(' · ') : 'No operator, aircraft, airport or country is set.'}</Block>
      <Block label="History">{`Added ${added || '—'}\n${entry.reviewed ? `Reviewed ${confirmed || '—'}` : 'Not yet reviewed'}`}</Block>
      {files ? <Block label="Files">{`${plural(files, 'file')}. Open ${files === 1 ? 'it' : 'them'} from the full Important editor.`}</Block> : null}
    </Sheet>
  );
}

function ImportantPhonePage({ ctx }) {
  const can = canOf(ctx);
  const load = useLoad(readImportant);
  const [open, setOpen] = useState(null); const [full, setFull] = useState(false);
  useEffect(() => subscribeWallStream('important.changed', load.refresh, { surface: 'console' }), [load.refresh]);
  if (full) {
    return <ConsolePage name="important" title="Important" back="List" onBack={() => { setFull(false); load.refresh(); }} ctx={ctx} actions={IMP_ACTIONS}><ImportantPage /></ConsolePage>;
  }
  const entries = load.data || [];
  const on = entries.filter((e) => e.isActive !== false);
  const review = on.filter((e) => !e.reviewed); const active = on.filter((e) => e.reviewed); const off = entries.filter((e) => e.isActive === false);
  const openEntry = open != null ? entries.find((e) => e.id === open) : null;
  const row = (entry) => (
    <Row key={entry.id} tag={impScope(entry)[0] || 'ALL'} label={<span style={CLAMP3}>{entry.title || entry.body || 'Important note'}</span>} sub={impSub(entry)}
      value={!entry.reviewed ? <Strong>Review</Strong> : null} onClick={() => setOpen(entry.id)} data-important-row={entry.id} data-important-state={!entry.reviewed ? 'review' : entry.isActive === false ? 'off' : 'active'} />
  );
  return (
    <>
      <Page name="important" title="Important" back="Wall" onBack={ctx.back}>
        {load.phase === 'loading' ? <Skel /> : load.phase === 'failed' ? <Failed title="Important" at={load.triedAt} onRetry={load.reload} /> : (
          <>
            <OldNote load={load} />
            {on.length === 0 ? <Msg data-empty="" title="Nothing is marked important" body="Notes that ops flag on a flight, airport or aircraft are listed here." /> : null}
            {review.length ? <Group label="Needs review" count={review.length} data-important-group="review">{review.map(row)}</Group> : null}
            {active.length ? <Group label="Active" count={active.length} data-important-group="active">{active.map(row)}</Group> : null}
            {off.length ? <Group label="Switched off" count={off.length} data-important-group="off">{off.map(row)}</Group> : null}
            <Group label="Full page">
              <FullRow label="Full Important editor" sub="Add, change, attach files, delete and bring back notes" onClick={() => setFull(true)} />
            </Group>
          </>
        )}
      </Page>
      {openEntry ? <ImportantSheet key={openEntry.id} entry={openEntry} can={can} onClose={() => setOpen(null)}
        onReviewed={(id) => { load.set(entries.map((e) => (e.id === id ? { ...e, reviewed: true } : e))); load.refresh(); }} /> : null}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── Service status
const SVC_TTL_MS = 60000; const SVC_MAX = 30; const SVC_AT_ONCE = 4;
const svcCache = new Map();
const svcKind = (caption) => {
  const s = String(caption || '').toLowerCase();
  if (/not\s*applicable|^n\/?a$/.test(s)) return 'na';
  if (/^\?$|request|sent|pending|await|wait|asked|in progress/.test(s)) return 'await';
  return 'other';
};
async function readServices(nid, opr) {
  const q = new URLSearchParams({ flightNid: String(nid) }); if (opr) q.set('oprId', String(opr));
  const r = await fetch(buildApiUrl(`/api/flight-services?${q}`), { credentials: 'same-origin', cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok === false) throw new Error('services');
  const kinds = (j.items || []).map((it) => svcKind(it.caption));
  return { awaiting: kinds.filter((k) => k === 'await').length, total: kinds.filter((k) => k !== 'na').length };
}
/** The flights still to fly, soonest first, with what the services read needs. */
function upcomingFlights(flights) {
  const now = Date.now();
  return (Array.isArray(flights) ? flights : [])
    .map((f) => ({ f, id: f.id, nid: f.raw?.flightNid ?? f.flightNid, opr: f.raw?.oprId ?? f.oprId, dep: Number(f.depMs), arr: Number(f.arrMs) }))
    .filter((x) => x.nid != null && Number.isFinite(x.dep) && (Number.isFinite(x.arr) ? x.arr : x.dep) > now)
    .sort((a, b) => a.dep - b.dep);
}
/** Reads the services of each flight, a few at a time; an answer is kept for a minute so More and the page share it. */
async function readAllServices(list, fresh) {
  const out = new Array(list.length); let next = 0;
  const one = async () => {
    while (next < list.length) {
      const i = next; next += 1; const x = list[i]; const key = `${x.opr || ''}:${x.nid}`;
      const hit = svcCache.get(key);
      if (!fresh && hit && Date.now() - hit.at < SVC_TTL_MS) { out[i] = hit.value; continue; }
      try { const value = await readServices(x.nid, x.opr); svcCache.set(key, { at: Date.now(), value }); out[i] = value; }
      catch { out[i] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SVC_AT_ONCE, list.length) }, one));
  return out;
}
function useServiceStatus(flights) {
  const all = useMemo(() => upcomingFlights(flights), [flights]);
  const list = useMemo(() => all.slice(0, SVC_MAX), [all]);
  const key = list.map((x) => `${x.opr || ''}:${x.nid}`).join('|');
  const [st, setSt] = useState({ key: null, results: null, at: 0 });
  const [turn, setTurn] = useState(0); const fresh = useRef(false);
  useEffect(() => {
    let alive = true; const wantFresh = fresh.current; fresh.current = false;
    if (list.length === 0) { setSt({ key, results: [], at: Date.now() }); return undefined;
    }
    readAllServices(list, wantFresh).then((results) => { if (alive) setSt({ key, results, at: Date.now() }); });
    return () => { alive = false; };
    // the list is rebuilt on every feed tick: only a change of its flights (the key) or a retry reads again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, turn]);
  const ready = st.key === key && Array.isArray(st.results);
  const rows = ready ? list.map((x, i) => ({ ...x, svc: st.results[i] })) : [];
  return { ready, rows, at: st.at, more: all.length - list.length, retry: () => { fresh.current = true; setSt((s) => ({ ...s, key: null })); setTurn((n) => n + 1); } };
}

function ServiceStatusPage({ ctx }) {
  const svc = useServiceStatus(ctx.flights);
  const feedFailed = Boolean(ctx.error) && !(ctx.flights || []).length;
  const loading = !feedFailed && (!ctx.loadedOnce || !svc.ready);
  const failed = svc.rows.filter((r) => !r.svc); const read = svc.rows.filter((r) => r.svc);
  const waiting = read.filter((r) => r.svc.awaiting > 0); const calm = read.filter((r) => r.svc.awaiting === 0);
  const allFailed = svc.ready && svc.rows.length > 0 && read.length === 0;
  const row = (r) => (
    <Row key={r.id ?? r.nid} tag={r.f.cs || r.f.fn || ''} label={`${r.f.adep || '····'} → ${r.f.ades || '····'}`} sub={`Departs ${hmZ(r.dep)} · ${dayZ(r.dep)}`} chevron
      onClick={() => ctx.openFlight(r.id)} data-service-row={r.id ?? r.nid} data-service-awaiting={r.svc ? r.svc.awaiting : ''}
      value={!r.svc ? <Strong t="bad">Not read</Strong> : r.svc.awaiting > 0 ? <Strong>{r.svc.awaiting} awaiting</Strong> : r.svc.total === 0 ? 'No services' : <MonoVal t="ok">✓ none awaiting</MonoVal>} />
  );
  return (
    <Page name="service-status" title="Service status" back="More" onBack={ctx.back}>
      {loading ? <Skel /> : feedFailed ? <Failed title="Service status" at={Date.now()} onRetry={() => ctx.reload?.()} /> : allFailed ? <Failed title="Service status" at={svc.at} onRetry={svc.retry} /> : svc.rows.length === 0 ? (
        <Msg data-empty="" title="No flights to come" body="Service status appears here when a flight is on the schedule." />
      ) : (
        <>
          {failed.length ? (
            <div data-service-partial="" role="status" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${c('l1')}`, background: c('bg2'), fontSize: 13, lineHeight: 1.45, color: c('warn') }}>
              <span style={{ flex: 1, minWidth: 0 }}>The services of {plural(failed.length, 'flight')} could not be read.</span>
              <Btn kind="line" height={44} block={false} onClick={svc.retry} style={{ fontSize: 13 }}>Try again</Btn>
            </div>
          ) : null}
          {waiting.length ? <Group label="Awaiting a reply" count={waiting.length} data-service-group="awaiting">{waiting.map(row)}</Group> : null}
          {failed.length ? <Group label="Not read" count={failed.length} data-service-group="failed">{failed.map(row)}</Group> : null}
          {calm.length ? <Group label="Nothing awaiting" count={calm.length} data-service-group="calm">{calm.map(row)}</Group> : null}
          <div style={{ padding: '12px 16px', fontSize: 13, color: c('t4') }}>
            Read {hmsZ(svc.at)}.{svc.more > 0 ? ` The next ${SVC_MAX} flights are listed; ${svc.more} later ${svc.more === 1 ? 'one is' : 'ones are'} not.` : ''} Tap a flight for its services.
          </div>
        </>
      )}
    </Page>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── More
const MORE_WALL = [
  { k: 'operators', label: 'Operators', icon: 'building-2' },
  { k: 'aircraft', label: 'Aircraft', icon: 'plane' },
  { k: 'caa', label: 'CAA details', icon: 'landmark' },
  { k: 'reports', label: 'Reports', icon: 'message-square-warning' },
  { k: 'wall-settings', label: 'Wall settings', icon: 'monitor' },
  { k: 'service-status', label: 'Service status', icon: 'list-checks' },
  { k: 'notifications', label: 'Notifications', icon: 'bell' },
  { k: 'settings', label: 'Phone settings', icon: 'smartphone' },
];
const MORE_PORTAL = [
  { k: 'users', label: 'Users', icon: 'users', href: '/m/users' },
  { k: 'maintenance', label: 'Maintenance', icon: 'wrench', href: '/m/maintenance' },
  { k: 'agent', label: 'Agent', icon: 'bot', href: '/m/agent' },
  { k: 'intake', label: 'Flight intake', icon: 'inbox', href: '/m/intake' },
  { k: 'mailbox', label: 'Mailbox', icon: 'mail', href: '/m/mailbox' },
  { k: 'airport', label: 'Airport search', icon: 'search', href: '/m/airport' },
  { k: 'profile', label: 'Profile', icon: 'circle-user', href: '/m/profile' },
  { k: 'webhooks', label: 'Webhooks', icon: 'webhook', href: '/digital-wall/console/webhooks', sub: 'A desk page' },
];
const OPEN_REPORT = new Set(['untouched', 'under_process']);

function MorePage({ ctx }) {
  const [counts, setCounts] = useState({});
  const svc = useServiceStatus(ctx.flights);
  useEffect(() => {
    let alive = true;
    const put = (k, v) => { if (alive) setCounts((prev) => ({ ...prev, [k]: v })); };
    // a count is an extra: when its read fails the row simply shows none, and the page behind it says why
    fetchOperators().then((p) => put('operators', (p.operators || []).filter((o) => o.isActive !== false).length)).catch(() => {});
    fetchReports().then((p) => put('reports', (p.reports || []).filter((r) => OPEN_REPORT.has(r.status)).length)).catch(() => {});
    return () => { alive = false; };
  }, []);
  const awaiting = svc.ready ? svc.rows.filter((r) => r.svc && r.svc.awaiting > 0).length : null;
  const unread = Number(ctx.unread) || 0;
  const value = (k) => {
    if (k === 'operators') return Number.isFinite(counts.operators) ? String(counts.operators) : null;
    if (k === 'aircraft') return Array.isArray(ctx.aircraft) && ctx.loadedOnce ? String(ctx.aircraft.length) : null;
    if (k === 'reports') return Number.isFinite(counts.reports) && counts.reports > 0 ? `${counts.reports} open` : null;
    if (k === 'service-status') return awaiting ? <Strong>{awaiting} awaiting</Strong> : null;
    if (k === 'notifications') return unread > 0 ? `${unread} new` : null;
    return null;
  };
  return (
    <Page name="more" title="More" back="Wall" onBack={ctx.back}>
      <Group label="Wall" data-more-group="wall">
        {MORE_WALL.map((it) => <Row key={it.k} icon={it.icon} label={it.label} value={value(it.k)} chevron onClick={() => ctx.go(it.k)} data-more-item={it.k} />)}
      </Group>
      <Group label="Portal" data-more-group="portal">
        {MORE_PORTAL.map((it) => <Row key={it.k} icon={it.icon} label={it.label} sub={it.sub} external href={it.href} data-more-item={it.k} />)}
      </Group>
      <BrandFoot line={footLine(ctx)} />
      <div style={{ height: 24 }} />
    </Page>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── Wall settings
const X = (v, d) => `${(Number.isFinite(v) ? v : d).toFixed(2)}×`;
const CHIP_KEYS = ['chipImp', 'chipCaa', 'chipNtm', 'chipWx'];
// The seven display sections of the console's settings page, with the server's own defaults for a reset.
const WALL_SECTIONS = [
  { k: 'scale', title: 'Display scale', word: 'display scale', card: () => <DisplayScaleCard />, sum: (s) => X(s.scale, 1.3), defaults: () => ({ scale: 1.3 }) },
  { k: 'hour', title: 'Hour spacing', word: 'hour spacing', card: () => <HourSpacingCard />, sum: (s) => X(s.timeZoom, 1), defaults: () => ({ timeZoom: 1 }) },
  { k: 'vertical', title: 'Vertical sizing', word: 'vertical sizing', card: () => <VerticalSizingCard />, sum: (s) => X(s.rowZoom, 1), defaults: () => ({ rowZoom: 1, pillHeight: 1, markerScale: 1, labelScale: 1, autoFitRows: false }) },
  { k: 'horizontal', title: 'Horizontal sizing', word: 'horizontal sizing', card: () => <HorizontalSizingCard />, sum: (s) => (s.autoFitHorizontal ? 'Auto-fit' : 'Manual'), defaults: () => ({ callsignScale: 1, routeScale: 1, chipSpacing: 1, minPillMinutes: 45, pillPadding: 1, laneGap: 1, autoFitHorizontal: false }) },
  { k: 'chips', title: 'Chips on the pills', word: 'chips', card: () => <ChipsCard />, sum: (s) => (CHIP_KEYS.some((key) => s[key] === false) ? 'Some hidden' : 'All shown'), defaults: () => Object.fromEntries(CHIP_KEYS.map((key) => [key, true])) },
  { k: 'colours', title: 'Colours', word: 'colours', card: (account) => <ColoursCard deviceId={account} />, sum: (s) => { const n = Object.values(s.colors || {}).filter((v) => v != null && v !== '').length; return n ? plural(n, 'change') : 'Default'; }, defaults: (s) => ({ colors: Object.fromEntries(Object.keys(s.colors || {}).map((key) => [key, null])) }) },
  { k: 'font', title: 'Font', word: 'font', card: (account) => <FontCard deviceId={account} />, sum: (s) => resolveWallFont(s.font)?.label || 'Default', defaults: () => ({ font: '', zeroStyle: '' }) },
];

function WallSection({ sec, ctx, open, onToggle, settings, account, allowed, onChanged }) {
  const seen = useRef(open); if (open) seen.current = true;
  const [epoch, setEpoch] = useState(0); const [ask, setAsk] = useState(false); const [busy, setBusy] = useState(false); const [note, setNote] = useState(null);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!open) { setAsk(false); setNote(null); } }, [open]);
  const reset = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      await saveDisplaySettings(sec.defaults(settings || {}), account);
      if (!alive.current) return;
      setEpoch((n) => n + 1); setAsk(false); setNote({ kind: 'ok', words: 'Reset. The wall follows in a few seconds.' });
      onChanged();
    } catch (err) {
      if (alive.current) setNote({ kind: 'bad', words: errorText(err, 'The reset was not saved. Try again.') });
    } finally { if (alive.current) setBusy(false); }
  };
  return (
    <section data-wall-section={sec.k} data-open={open ? 'true' : 'false'} style={{ borderBottom: `1px solid ${c('l1')}` }}>
      <button type="button" className="cw3-press" data-wall-head="" aria-expanded={open} onClick={onToggle}
        style={{ width: '100%', minHeight: 52, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} color={c('t3')} />
        <span style={{ flex: 'none', fontSize: 16, fontWeight: 600, color: c('t1') }}>{sec.title}</span>
        <span data-wall-summary="" style={{ ...MONO, flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13, color: c('t3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{open || !settings ? '' : sec.sum(settings)}</span>
      </button>
      {seen.current ? (
        <div hidden={!open} data-wall-body="">
          <ConsoleBox ctx={ctx} viewOnly={!allowed}>
            <fieldset disabled={!allowed} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <div key={epoch}>{sec.card(account)}</div>
            </fieldset>
          </ConsoleBox>
          {allowed ? (
            <div style={{ padding: '0 16px 12px 44px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ask ? (
                <div data-wall-reset-ask="" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 13, lineHeight: 1.45, color: c('t2') }}>Put the wall’s {sec.word} back to the defaults?</span>
                  <Btn kind="line" height={44} block={false} onClick={() => setAsk(false)} disabled={busy} style={{ fontSize: 13 }} data-wall-reset-keep="">Keep</Btn>
                  <Btn height={44} block={false} onClick={reset} disabled={busy} style={{ fontSize: 13 }} data-wall-reset-yes="">{busy ? 'Saving…' : 'Reset'}</Btn>
                </div>
              ) : (
                <button type="button" className="cw3-press" data-wall-reset="" onClick={() => { setAsk(true); setNote(null); }}
                  style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: c('t2'), textAlign: 'left' }}>
                  <Icon name="rotate-ccw" size={16} color={c('t3')} /><span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>Reset {sec.word} to defaults</span>
                </button>
              )}
              <Note words={note?.words} kind={note?.kind} data-wall-reset-note="" />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The main wall's account and its settings. The account comes from the server: without it no card is drawn. */
async function readWall() {
  const own = await fetchDisplaySettings();
  const account = typeof own?.mainWallAccount === 'string' ? own.mainWallAccount : '';
  if (!account) throw new Error('no main wall');
  const [wall, devices] = await Promise.all([own.isMainWall ? own : fetchDisplaySettings(account), fetchDisplayDevices().catch(() => null)]);
  return { account, settings: wall?.settings || {}, device: (devices?.devices || []).find((d) => d.surface === 'wall') || null };
}

function WallSettingsPage({ ctx }) {
  const allowed = canOf(ctx)('wall.bigscreen.settings');
  const load = useLoad(readWall);
  const [open, setOpen] = useState(''); const [full, setFull] = useState(false);
  useEffect(() => subscribeWallStream('config.changed', load.refresh, { surface: 'console' }), [load.refresh]);
  const device = useMemo(() => ({ deviceId: load.data?.account || null, device: load.data?.device || null }), [load.data?.account, load.data?.device]);
  if (full) {
    return <ConsolePage name="wall-settings" title="Wall settings" back="Sections" onBack={() => { setFull(false); load.refresh(); }} ctx={ctx}><ConsoleSettingsPage /></ConsolePage>;
  }
  const ready = load.phase === 'ready' && Boolean(load.data?.account);
  const foot = !ready ? null : (
    <div data-wall-foot="" style={{ fontSize: 13, lineHeight: 1.45, color: c('t3') }}>
      {allowed ? 'Each change is saved as you make it. The wall follows in a few seconds.' : 'View only. You can read the wall’s settings; changing them needs the wall settings permission.'}
    </div>
  );
  return (
    <Page name="wall-settings" title="Wall settings" back="More" onBack={ctx.back} foot={foot} data-wall-allowed={allowed ? 'true' : 'false'}
      notice="These change the wall in the ops room, for everyone. Nothing here changes this phone.">
      {load.phase === 'loading' ? <Skel /> : !ready ? <Failed title="Wall settings" at={load.triedAt} onRetry={load.reload} /> : (
        <ConsoleRoot ctx={ctx}>
          <OldNote load={load} />
          <DeviceCtx.Provider value={device}>
            {WALL_SECTIONS.map((sec) => (
              <WallSection key={sec.k} sec={sec} ctx={ctx} open={open === sec.k} onToggle={() => setOpen(open === sec.k ? '' : sec.k)}
                settings={load.data.settings} account={load.data.account} allowed={allowed} onChanged={load.refresh} />
            ))}
          </DeviceCtx.Provider>
          <Group label="Full page">
            <FullRow label="Full wall settings page" sub="Clocks, the flight table, alerts, weather and the screens" onClick={() => setFull(true)} />
          </Group>
        </ConsoleRoot>
      )}
    </Page>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── the switch
const NATIVE = { notam: NotamPage, limits: LimitsPage, important: ImportantPhonePage, more: MorePage, 'wall-settings': WallSettingsPage, 'service-status': ServiceStatusPage };

export default function StaffPage({ name, ctx }) {
  // fail closed: this file is for staff; any other session gets nothing from it
  if (!ctx || ctx.role !== 'staff') return null;
  const Native = NATIVE[name];
  if (Native) return <Native ctx={ctx} />;
  const page = CONSOLE[name];
  if (page) {
    const { Comp } = page;
    return <ConsolePage name={name} title={page.title} back="More" onBack={ctx.back} ctx={ctx} actions={page.actions}><Comp /></ConsolePage>;
  }
  return (
    <Page name={name || 'unknown'} title="Not found" back="Back" onBack={ctx.back}>
      <Msg data-empty="" title="There’s no such page" body="Go back and pick another one." />
    </Page>
  );
}
