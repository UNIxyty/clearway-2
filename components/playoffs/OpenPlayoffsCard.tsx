'use client';

import { useEffect, useState } from 'react';
import { usePlayoffsLaunchState } from '@/lib/hooks/usePlayoffsLaunchState';

// ISO → value for <input type="datetime-local"> (local time, no seconds).
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Admin: open playoffs to regular users + set/update the prediction deadline. */
export function OpenPlayoffsCard() {
  const { openedAt, deadline, openedByName, refresh } = usePlayoffsLaunchState();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const alreadyOpen = !!openedAt;

  useEffect(() => { setValue(toLocalInput(deadline)); }, [deadline]);

  async function submit() {
    if (!value) { setMsg('Pick a prediction deadline first.'); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/playoffs/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadline: new Date(value).toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) { setMsg(`Error: ${json.error ?? 'failed'}`); return; }
      await refresh();
      setMsg(alreadyOpen ? 'Deadline updated.' : 'Playoffs opened to all users.');
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : 'failed'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-white border border-black/[0.09] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <h3 className="text-[15px] font-black text-navy">Open Playoffs to Users</h3>
      <p className="text-[12.5px] font-semibold text-black/45 mt-1 leading-snug">
        Once opened, all users will be able to view and predict on the playoffs bracket until this deadline. This action can be changed later if needed.
      </p>

      <label className="block mt-4 text-[11px] font-extrabold uppercase tracking-wide text-black/40">Predictions close at</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="h-10 px-3 rounded-lg border-2 border-black/12 text-[13px] font-semibold text-navy outline-none focus:border-bk-blue"
        />
        <button
          onClick={submit}
          disabled={busy}
          className="h-10 px-5 rounded-lg bg-bk-amber hover:bg-bk-amber-dark text-white text-[13px] font-extrabold transition disabled:opacity-50"
        >
          {busy ? 'Saving…' : alreadyOpen ? 'Update Deadline' : 'Open Playoffs'}
        </button>
      </div>

      {alreadyOpen && (
        <p className="mt-3 text-[12px] font-semibold text-black/40">
          Playoffs opened on {fmt(openedAt)}{openedByName ? ` by ${openedByName}` : ''} · Predictions close {fmt(deadline)}
        </p>
      )}
      {msg && <p className="mt-2 text-[12px] font-bold text-bk-blue-dark">{msg}</p>}
    </div>
  );
}
