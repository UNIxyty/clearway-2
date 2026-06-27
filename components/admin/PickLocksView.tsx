'use client';

/* =============================================================================
 * PickLocksView — control when predictions open/close (?section=pick-locks).
 *
 * Extracted verbatim from the "Pick Locks" tab of the legacy
 * app/pickem/admin/admin-page-client.tsx (per-user lock overrides:
 * GET/PATCH /api/pickem/admin/locks). All fetching/mutations are unchanged.
 *
 * CHANGE 5 decision — OPTION (a), the least-invasive: the per-user override
 * editor is the only lock control that lived in an isolated tab, so it moves
 * here in full. The OTHER lock mechanisms keep their existing homes (playoff
 * per-match is_locked → Bracket Setup; playoffs prediction deadline →
 * OpenPlayoffsCard on the Playoffs admin tab). This view adds a read-only
 * overview of those states with links to edit them, rather than duplicating
 * their controls. Only the surrounding chrome differs via the `embedded` prop.
 * ===========================================================================*/
import { useEffect, useRef, useState } from 'react';
import type { PickemCompetition } from '@/lib/pickem-shared';
import { usePlayoffsLaunchState } from '@/lib/hooks/usePlayoffsLaunchState';
import { OpenPlayoffsCard } from '@/components/playoffs/OpenPlayoffsCard';

type LockParticipant = { userId: string; displayName: string; rank: number; points: number };
type LockOverrideRow = { userId: string; unlockUntil: string; reason: string | null; updatedAt: string };
type LocksPayload = {
  competition: PickemCompetition;
  participants: LockParticipant[];
  overrides: LockOverrideRow[];
};
type PlayoffAccessRow = { userId: string; accessUntil: string; reason: string | null; updatedAt: string };
type PlayoffAccessPayload = {
  competition: PickemCompetition;
  participants: LockParticipant[];
  globalOpenedAt: string | null;
  globalDeadline: string | null;
  grants: PlayoffAccessRow[];
};

const LOCK_API_URL = '/api/pickem/admin/locks';
const PLAYOFF_ACCESS_API_URL = '/api/pickem/admin/playoff-access';

function fmtKickoff(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Riga',
    timeZoneName: 'short',
  });
}

function toDateTimeLocalValue(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '';
  const dt = new Date(ts);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

async function fetchLockApi(init?: RequestInit): Promise<{ res: Response; json: Record<string, unknown> }> {
  const res = await fetch(LOCK_API_URL, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { res, json };
  throw new Error((json.error as string) || `Failed to load lock overrides (${res.status}).`);
}

async function fetchPlayoffAccessApi(init?: RequestInit): Promise<{ res: Response; json: Record<string, unknown> }> {
  const res = await fetch(PLAYOFF_ACCESS_API_URL, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { res, json };
  throw new Error((json.error as string) || `Failed to load playoff access (${res.status}).`);
}

export function PickLocksView({ embedded = false }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [locksPayload, setLocksPayload] = useState<LocksPayload | null>(null);
  const [selectedLockUserId, setSelectedLockUserId] = useState('');
  const [manualLockUserId, setManualLockUserId] = useState('');
  const [lockUntilLocal, setLockUntilLocal] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [playoffAccessPayload, setPlayoffAccessPayload] = useState<PlayoffAccessPayload | null>(null);
  const [selectedAccessUserId, setSelectedAccessUserId] = useState('');
  const [manualAccessUserId, setManualAccessUserId] = useState('');
  const [accessUntilLocal, setAccessUntilLocal] = useState('');
  const [accessReason, setAccessReason] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read-only state for the "other locks" overview (existing endpoint, no new query).
  const launch = usePlayoffsLaunchState();

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const { json } = await fetchLockApi({ cache: 'no-store' });
        setLocksPayload(json as unknown as LocksPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lock overrides.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedLockUserId || !locksPayload) return;
    const existing = locksPayload.overrides.find((row) => row.userId === selectedLockUserId);
    if (!existing) return;
    setLockUntilLocal(toDateTimeLocalValue(existing.unlockUntil));
    setLockReason(existing.reason || '');
  }, [selectedLockUserId, locksPayload]);

  useEffect(() => {
    void (async () => {
      try {
        const { json } = await fetchPlayoffAccessApi({ cache: 'no-store' });
        setPlayoffAccessPayload(json as unknown as PlayoffAccessPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load playoff access.');
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedAccessUserId || !playoffAccessPayload) return;
    const existing = playoffAccessPayload.grants.find((row) => row.userId === selectedAccessUserId);
    if (!existing) return;
    setAccessUntilLocal(toDateTimeLocalValue(existing.accessUntil));
    setAccessReason(existing.reason || '');
  }, [selectedAccessUserId, playoffAccessPayload]);

  function flash(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }

  const effectiveLockUserId = (manualLockUserId || selectedLockUserId).trim();

  async function saveUserLockOverride() {
    if (!effectiveLockUserId) {
      setError('Select a player or enter a user ID.');
      return;
    }
    const unlockTs = new Date(lockUntilLocal).getTime();
    if (!Number.isFinite(unlockTs)) {
      setError('Pick a valid unlock time.');
      return;
    }
    setSaving(`lock:${effectiveLockUserId}`);
    setError(null);
    try {
      const { json } = await fetchLockApi({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveLockUserId,
          unlockUntil: new Date(unlockTs).toISOString(),
          reason: lockReason || null,
        }),
      });
      setLocksPayload((prev) =>
        prev ? { ...prev, overrides: ((json.overrides as LockOverrideRow[]) || prev.overrides) } : prev,
      );
      flash(`Saved unlock for ${effectiveLockUserId}.`);
      setManualLockUserId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lock override.');
    } finally {
      setSaving(null);
    }
  }

  async function clearUserOverride(userId: string) {
    setSaving(`lock-clear:${userId}`);
    setError(null);
    try {
      const { json } = await fetchLockApi({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, clear: true }),
      });
      setLocksPayload((prev) =>
        prev ? { ...prev, overrides: ((json.overrides as LockOverrideRow[]) || prev.overrides) } : prev,
      );
      flash(`Cleared unlock for ${userId}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear lock override.');
    } finally {
      setSaving(null);
    }
  }

  const effectiveAccessUserId = (manualAccessUserId || selectedAccessUserId).trim();

  async function saveUserPlayoffAccess() {
    if (!effectiveAccessUserId) {
      setError('Select a player or enter a user ID.');
      return;
    }
    const accessTs = new Date(accessUntilLocal).getTime();
    if (!Number.isFinite(accessTs)) {
      setError('Pick a valid access-until time.');
      return;
    }
    setSaving(`access:${effectiveAccessUserId}`);
    setError(null);
    try {
      const { json } = await fetchPlayoffAccessApi({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveAccessUserId,
          accessUntil: new Date(accessTs).toISOString(),
          reason: accessReason || null,
        }),
      });
      setPlayoffAccessPayload((prev) =>
        prev ? { ...prev, grants: ((json.grants as PlayoffAccessRow[]) || prev.grants) } : prev,
      );
      flash(`Granted playoff access to ${effectiveAccessUserId}.`);
      setManualAccessUserId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant playoff access.');
    } finally {
      setSaving(null);
    }
  }

  async function clearUserPlayoffAccess(userId: string) {
    setSaving(`access-clear:${userId}`);
    setError(null);
    try {
      const { json } = await fetchPlayoffAccessApi({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, clear: true }),
      });
      setPlayoffAccessPayload((prev) =>
        prev ? { ...prev, grants: ((json.grants as PlayoffAccessRow[]) || prev.grants) } : prev,
      );
      flash(`Revoked playoff access for ${userId}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke playoff access.');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-black/10 bg-white p-6">Loading pick locks...</div>;
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Pick Locks</h1>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <section className="space-y-4">
        {/* Read-only overview of the lock states that are edited elsewhere. */}
        <article className="rounded-2xl border border-black/[0.08] bg-white p-4">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Other lock controls</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            These lock states are edited from their own sections — shown here read-only for reference.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-black/10 px-3 py-3">
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Playoffs prediction deadline</div>
              <div className="mt-1 text-sm font-bold text-slate-800">
                {launch.loading ? 'Loading…' : launch.deadline ? fmtKickoff(launch.deadline) : 'Not set'}
                {!launch.loading && launch.deadline && (
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.08em] ${launch.isPastDeadline ? 'bg-black/[0.06] text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                    {launch.isPastDeadline ? 'LOCKED' : 'OPEN'}
                  </span>
                )}
              </div>
              <a href="/playoffs?view=admin" className="mt-2 inline-block text-[12px] font-bold text-blue-600 hover:text-blue-700">
                Edit on Playoffs admin →
              </a>
            </div>
            <div className="rounded-xl border border-black/10 px-3 py-3">
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Playoff match locks</div>
              <div className="mt-1 text-sm font-semibold text-slate-600">
                Each playoff match is locked individually when results are entered.
              </div>
              <a href="/pickem/admin?section=bracket-setup" className="mt-2 inline-block text-[12px] font-bold text-blue-600 hover:text-blue-700">
                Manage in Bracket Setup →
              </a>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-black/[0.08] bg-white p-4">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">
            Per-user lock override
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Unlock one player after global lock. This does not change match kickoff dates or lock date.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Pick player</span>
              <select
                value={selectedLockUserId}
                onChange={(e) => setSelectedLockUserId(e.target.value)}
                className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
              >
                <option value="">Select participant</option>
                {(locksPayload?.participants || []).map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.displayName} · #{user.rank} · {user.points} pts
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                Or user id
              </span>
              <input
                value={manualLockUserId}
                onChange={(e) => setManualLockUserId(e.target.value)}
                placeholder="uuid"
                className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Unlocked until</span>
              <input
                type="datetime-local"
                value={lockUntilLocal}
                onChange={(e) => setLockUntilLocal(e.target.value)}
                className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Reason (optional)</span>
              <input
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="Support override"
                className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveUserLockOverride()}
              disabled={!lockUntilLocal || !effectiveLockUserId || saving === `lock:${effectiveLockUserId}`}
              className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              {saving === `lock:${effectiveLockUserId}` ? 'Saving...' : 'Save unlock'}
            </button>
            <button
              type="button"
              onClick={() => {
                setManualLockUserId('');
                setSelectedLockUserId('');
                setLockReason('');
                setLockUntilLocal('');
              }}
              className="h-10 rounded-lg border border-black/15 px-4 text-sm font-bold text-slate-700"
            >
              Clear form
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-black/[0.08] bg-white p-4">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Active overrides</h3>
          <div className="mt-3 space-y-2">
            {(locksPayload?.overrides || []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-black/20 px-3 py-4 text-sm font-semibold text-slate-500">
                No active per-user unlocks.
              </div>
            ) : (
              (locksPayload?.overrides || []).map((row) => {
                const user = (locksPayload?.participants || []).find((p) => p.userId === row.userId);
                return (
                  <div key={row.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {user?.displayName || 'Unknown user'} · {row.userId}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        Until {fmtKickoff(row.unlockUntil)}
                        {row.reason ? ` · ${row.reason}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void clearUserOverride(row.userId)}
                      disabled={saving === `lock-clear:${row.userId}`}
                      className="h-9 rounded-lg border border-black/15 px-3 text-xs font-bold text-slate-700 disabled:opacity-40"
                    >
                      {saving === `lock-clear:${row.userId}` ? 'Clearing...' : 'Remove'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </article>

        {/* ── Playoffs access (open-for-all + per-user, mirrors Pick Locks) ── */}
        <div className="flex items-center gap-3 pt-2">
          <div className="h-px flex-1 bg-black/10" />
          <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Playoffs Access</span>
          <div className="h-px flex-1 bg-black/10" />
        </div>

        {/* Open playoffs to ALL users (sets opened_at + prediction deadline). */}
        <OpenPlayoffsCard />

        <article className="rounded-2xl border border-black/[0.08] bg-white p-4">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">
            Per-user playoff access
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Let one player into the playoffs (interactive) before they&apos;re opened to everyone. Access lasts until the time you set, then they follow the global rules again.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Pick player</span>
              <select
                value={selectedAccessUserId}
                onChange={(e) => setSelectedAccessUserId(e.target.value)}
                className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
              >
                <option value="">Select participant</option>
                {(playoffAccessPayload?.participants || locksPayload?.participants || []).map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.displayName} · #{user.rank} · {user.points} pts
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Or user id</span>
              <input
                value={manualAccessUserId}
                onChange={(e) => setManualAccessUserId(e.target.value)}
                placeholder="uuid"
                className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Access until</span>
              <input
                type="datetime-local"
                value={accessUntilLocal}
                onChange={(e) => setAccessUntilLocal(e.target.value)}
                className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Reason (optional)</span>
              <input
                value={accessReason}
                onChange={(e) => setAccessReason(e.target.value)}
                placeholder="Early access"
                className="h-10 w-full rounded-lg border border-black/15 px-3 text-sm font-semibold text-slate-800"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveUserPlayoffAccess()}
              disabled={!accessUntilLocal || !effectiveAccessUserId || saving === `access:${effectiveAccessUserId}`}
              className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              {saving === `access:${effectiveAccessUserId}` ? 'Saving...' : 'Grant access'}
            </button>
            <button
              type="button"
              onClick={() => {
                setManualAccessUserId('');
                setSelectedAccessUserId('');
                setAccessReason('');
                setAccessUntilLocal('');
              }}
              className="h-10 rounded-lg border border-black/15 px-4 text-sm font-bold text-slate-700"
            >
              Clear form
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-black/[0.08] bg-white p-4">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Active playoff access grants</h3>
          <div className="mt-3 space-y-2">
            {(playoffAccessPayload?.grants || []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-black/20 px-3 py-4 text-sm font-semibold text-slate-500">
                No active per-user playoff grants.
              </div>
            ) : (
              (playoffAccessPayload?.grants || []).map((row) => {
                const user = (playoffAccessPayload?.participants || []).find((p) => p.userId === row.userId);
                return (
                  <div key={row.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {user?.displayName || 'Unknown user'} · {row.userId}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        Until {fmtKickoff(row.accessUntil)}
                        {row.reason ? ` · ${row.reason}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void clearUserPlayoffAccess(row.userId)}
                      disabled={saving === `access-clear:${row.userId}`}
                      className="h-9 rounded-lg border border-black/15 px-3 text-xs font-bold text-slate-700 disabled:opacity-40"
                    >
                      {saving === `access-clear:${row.userId}` ? 'Clearing...' : 'Remove'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </section>

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 transition-all duration-300 ${
          toast ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div className="max-w-[90vw] rounded-xl bg-slate-900 px-4 py-3 text-[13px] font-semibold text-white shadow-xl">
          {toast || ''}
        </div>
      </div>
    </div>
  );
}
