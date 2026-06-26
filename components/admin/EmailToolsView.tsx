'use client';

import { useEffect, useState, useCallback } from 'react';

interface Meta { label: string; description: string; subject: string; batch: boolean }
interface Status {
  lastSent: Record<string, string | null>;
  userCount: number;
  guards: Record<string, string | null>;
  meta: Record<string, Meta>;
}

const ORDER = ['group_stage_complete', 'bracket_confirmation', 'prediction_update', 'final_standings'];

function fmt(ts: string | null): string {
  if (!ts) return 'Never sent';
  return 'Last sent: ' + new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function EmailToolsView({ embedded = false }: { embedded?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [testOpen, setTestOpen] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Custom broadcast (one-off email to all users from a custom template).
  const BROADCAST_TEMPLATES = ['apology'];
  const [bcSubject, setBcSubject] = useState('');
  const [bcTemplate, setBcTemplate] = useState('apology');
  const [bcBusy, setBcBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/email-tools', { cache: 'no-store' });
    if (res.ok) setStatus(await res.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  const sendTest = useCallback(async (emailType: string) => {
    if (!recipient.includes('@')) { flash('Enter a valid email address'); return; }
    setBusy(emailType + ':test');
    try {
      const res = await fetch('/api/admin/email-tools', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', emailType, recipient }),
      });
      const json = await res.json();
      flash(res.ok ? `Test sent to ${json.sentTo}` : `Error: ${json.error}`);
      if (res.ok) { setTestOpen(null); setRecipient(''); void load(); }
    } finally { setBusy(null); }
  }, [recipient, load]);

  const sendAll = useCallback(async (emailType: string, label: string) => {
    if (!status) return;
    if (!window.confirm(`This will send "${label}" to all ${status.userCount} users. This cannot be undone.`)) return;
    setBusy(emailType + ':all');
    try {
      let res = await fetch('/api/admin/email-tools', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'all', emailType }),
      });
      let json = await res.json();
      if (res.status === 409 && json.alreadySent) {
        const when = new Date(json.alreadySent).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        if (!window.confirm(`This email was already sent on ${when}. Sending again will override the guard — are you sure?`)) return;
        res = await fetch('/api/admin/email-tools', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'all', emailType, force: true }),
        });
        json = await res.json();
      }
      flash(res.ok ? `${label}: batch send queued` : `Error: ${json.error}`);
      if (res.ok) void load();
    } finally { setBusy(null); }
  }, [status, load]);

  // Review send: only admins/devs receive it; never consumes one-time guards.
  const sendAdmins = useCallback(async (emailType: string, label: string) => {
    if (!window.confirm(`Send "${label}" to ADMINS ONLY (review send)? Regular users won't receive it.`)) return;
    setBusy(emailType + ':admins');
    try {
      const res = await fetch('/api/admin/email-tools', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'all', emailType, audience: 'admins' }),
      });
      const json = await res.json();
      flash(res.ok ? `${label}: sent to admins only` : `Error: ${json.error}`);
      if (res.ok) void load();
    } finally { setBusy(null); }
  }, [load]);

  const runBroadcast = useCallback(async (testOnly: boolean) => {
    if (!bcSubject.trim()) { flash('Enter a subject line'); return; }
    if (!testOnly) {
      if (!status) return;
      if (!window.confirm(`This will send to all ${status.userCount} users. Are you sure?`)) return;
    }
    setBcBusy(testOnly ? 'test' : 'all');
    try {
      const res = await fetch('/api/admin/email-tools/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: bcTemplate, subject: bcSubject.trim(), testOnly }),
      });
      const json = await res.json();
      flash(res.ok
        ? `${testOnly ? 'Test sent' : 'Broadcast complete'} — sent: ${json.sent}, failed: ${json.failed}`
        : `Error: ${json.error}`);
    } finally { setBcBusy(null); }
  }, [bcSubject, bcTemplate, status]);

  return (
    <div className={embedded ? '' : 'min-h-screen bg-page'}>
      {!embedded && (
      <div className="bg-white border-b border-black/[0.07]">
        <div className="max-w-5xl mx-auto px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-bk-amber-dark bg-bk-amber/15 px-2 py-1 rounded-md">ADMIN</span>
            <h1 className="text-[22px] font-black tracking-tight text-navy">Email Tools</h1>
          </div>
          <p className="text-[13px] font-semibold text-black/45">Send a test, or trigger a real batch send. {status ? `${status.userCount} users.` : ''}</p>
        </div>
      </div>
      )}

      <main className={embedded ? 'space-y-4' : 'max-w-5xl mx-auto px-5 py-6 space-y-4'}>
        {status && ORDER.map(type => {
          const meta = status.meta[type];
          if (!meta) return null;
          const guard = status.guards[type];
          return (
            <div key={type} className="bg-white rounded-xl border border-black/[0.08] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <p className="text-[15px] font-black text-navy">{meta.label}</p>
                  <p className="text-[12.5px] font-semibold text-black/45 mt-0.5">{meta.description}</p>
                  <p className="text-[12px] font-semibold text-black/40 mt-1.5">{fmt(status.lastSent[type])}</p>
                  {guard && (
                    <p className="text-[11.5px] font-bold text-amber-700 mt-1">
                      Guard set: {new Date(guard).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setTestOpen(testOpen === type ? null : type)}
                    className="h-9 px-4 rounded-lg border border-black/15 bg-white text-[13px] font-bold text-navy hover:bg-black/[0.03] transition">
                    Send Test
                  </button>
                  {meta.batch && (
                    <button onClick={() => sendAdmins(type, meta.label)} disabled={busy === type + ':admins'}
                      className="h-9 px-4 rounded-lg border border-bk-blue/40 bg-bk-blue/5 text-bk-blue-dark text-[13px] font-bold transition hover:bg-bk-blue/10 disabled:opacity-40"
                      title="Send to admins/devs only (review send — does not consume one-time guard)">
                      {busy === type + ':admins' ? 'Sending…' : 'Send to Admins'}
                    </button>
                  )}
                  <button onClick={() => sendAll(type, meta.label)} disabled={!meta.batch || busy === type + ':all'}
                    className="h-9 px-4 rounded-lg bg-bk-blue hover:bg-bk-blue-dark text-white text-[13px] font-bold transition disabled:opacity-40"
                    title={meta.batch ? 'Send to all users' : 'Per-user email — use Send Test'}>
                    {busy === type + ':all' ? 'Sending…' : 'Send to All'}
                  </button>
                </div>
              </div>

              {testOpen === type && (
                <div className="mt-3 flex items-center gap-2 border-t border-black/[0.06] pt-3">
                  <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="test@example.com"
                    className="flex-1 h-9 px-3 rounded-lg border-2 border-black/12 text-[13px] font-semibold text-navy outline-none focus:border-bk-blue" />
                  <button onClick={() => sendTest(type)} disabled={busy === type + ':test'}
                    className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold transition disabled:opacity-40">
                    {busy === type + ':test' ? 'Sending…' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Custom one-off broadcast (apology + any future templates). */}
        {status && (
          <div className="bg-white rounded-xl border border-black/[0.08] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[15px] font-black text-navy">Custom Broadcast</p>
            <p className="text-[12.5px] font-semibold text-black/45 mt-0.5">Send a one-off email to all users using a custom template</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 block">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-black/40">Subject</span>
                <input
                  value={bcSubject}
                  onChange={e => setBcSubject(e.target.value)}
                  placeholder="A note about our last email"
                  className="h-9 w-full px-3 rounded-lg border-2 border-black/12 text-[13px] font-semibold text-navy outline-none focus:border-bk-blue"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-black/40">Template</span>
                <select
                  value={bcTemplate}
                  onChange={e => setBcTemplate(e.target.value)}
                  className="h-9 w-full px-3 rounded-lg border-2 border-black/12 text-[13px] font-semibold text-navy outline-none focus:border-bk-blue"
                >
                  {BROADCAST_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => runBroadcast(true)}
                disabled={bcBusy !== null}
                className="h-9 px-4 rounded-lg border border-black/15 bg-white text-[13px] font-bold text-navy hover:bg-black/[0.03] transition disabled:opacity-40"
              >
                {bcBusy === 'test' ? 'Sending…' : 'Send Test to Me'}
              </button>
              <button
                onClick={() => runBroadcast(false)}
                disabled={bcBusy !== null}
                className="h-9 px-4 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] text-white text-[13px] font-bold transition disabled:opacity-40"
              >
                {bcBusy === 'all' ? 'Sending…' : `Send to All Users (${status.userCount})`}
              </button>
            </div>
          </div>
        )}

        {!status && <div className="text-center py-10 text-black/40 font-semibold">Loading…</div>}
      </main>

      {toast && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center px-4 z-50">
          <div className="bg-navy text-white text-[13px] font-semibold px-4 py-3 rounded-xl shadow-xl max-w-[90vw]">{toast}</div>
        </div>
      )}
    </div>
  );
}
