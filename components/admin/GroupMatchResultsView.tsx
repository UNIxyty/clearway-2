'use client';

/* =============================================================================
 * GroupMatchResultsView — enter & publish GROUP STAGE match scores.
 *
 * Extracted verbatim from the "Match Results" tab of the legacy
 * app/pickem/admin/admin-page-client.tsx so it can mount inside the unified
 * Admin Console (?section=match-results). This is the group-stage scoring path
 * (PATCH /api/pickem/admin/matches → recompute leaderboard points); it is
 * distinct from the playoff ResultsView. All fetching/mutations are unchanged —
 * only the surrounding chrome differs via the `embedded` prop.
 * ===========================================================================*/
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PickemCompetition, PickemMatch, PickemTeam } from '@/lib/pickem-shared';

type AdminPayload = {
  competition: PickemCompetition;
  teams: PickemTeam[];
  matches: PickemMatch[];
  isDeveloper: boolean;
  viewer?: { id: string; email: string | null; name: string | null };
};
type EditState = Record<string, { home: string; away: string; live: boolean }>;

const ADMIN_API_URL = '/api/pickem/admin/matches';

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

async function fetchAdminApi(init?: RequestInit): Promise<{ res: Response; json: Record<string, unknown> }> {
  const res = await fetch(ADMIN_API_URL, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { res, json };
  throw new Error((json.error as string) || `Failed to load admin data (${res.status}).`);
}

export function GroupMatchResultsView({ embedded = false }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modalMatchId, setModalMatchId] = useState<string | null>(null);
  const [payload, setPayload] = useState<AdminPayload | null>(null);
  const [edits, setEdits] = useState<EditState>({});
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { json } = await fetchAdminApi({ cache: 'no-store' });
      setPayload(json as unknown as AdminPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const matches = useMemo(
    () =>
      [...(payload?.matches || [])].sort(
        (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime(),
      ),
    [payload],
  );

  const teamById = useMemo(() => {
    const map = new Map<string, PickemTeam>();
    for (const team of payload?.teams || []) map.set(team.id, team);
    return map;
  }, [payload]);

  const scoredMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          Number.isInteger(m.homeScore) &&
          Number.isInteger(m.awayScore) &&
          String(m.status || '').toLowerCase() === 'finished',
      ),
    [matches],
  );

  const pendingMatches = matches.length - scoredMatches.length;
  const playersInPool = useMemo(() => {
    // No dedicated preview endpoint yet, so keep this as an informative placeholder metric.
    return payload ? payload.teams.length * 10 : 0;
  }, [payload]);

  function flash(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }

  function getEditForMatch(match: PickemMatch): { home: string; away: string; live: boolean } {
    return (
      edits[match.id] || {
        home: match.homeScore === null ? '' : String(match.homeScore),
        away: match.awayScore === null ? '' : String(match.awayScore),
        live: String(match.status || '').toLowerCase() === 'live',
      }
    );
  }

  async function saveMatch(match: PickemMatch, status: 'live' | 'finished') {
    const edit = getEditForMatch(match);
    const homeScore = edit.home === '' ? null : Number(edit.home);
    const awayScore = edit.away === '' ? null : Number(edit.away);
    setSaving(match.id);
    setError(null);
    try {
      const { json } = await fetchAdminApi({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matchId: match.id, homeScore, awayScore, status }),
      });
      setPayload((prev) => (prev ? { ...prev, matches: ((json.matches as PickemMatch[]) || prev.matches) } : prev));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      const homeLabel = homeScore === null ? '-' : homeScore;
      const awayLabel = awayScore === null ? '-' : awayScore;
      if (status === 'finished') {
        flash(`Published ${homeLabel}-${awayLabel} and recomputed leaderboard points.`);
      } else {
        flash(`Updated live score to ${homeLabel}-${awayLabel}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save match update.');
    } finally {
      setSaving(null);
      if (status === 'finished') setModalMatchId(null);
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-black/10 bg-white p-6">Loading group matches...</div>;
  }

  if (!payload) {
    return <div className="rounded-xl border border-red-200 bg-white p-6 text-sm font-semibold text-red-700">{error || 'No data.'}</div>;
  }

  const modalMatch = modalMatchId ? matches.find((m) => m.id === modalMatchId) ?? null : null;

  return (
    <div className="space-y-5">
      {!embedded && (
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Group Stage Matches</h1>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Matches scored</div>
          <div className="mt-1 text-3xl font-black text-slate-900 tabular-nums">
            {scoredMatches.length}
            <span className="ml-1 text-sm text-slate-500">/ {matches.length}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Pending matches</div>
          <div className="mt-1 text-3xl font-black text-slate-900 tabular-nums">{pendingMatches}</div>
        </div>
        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Players in pool</div>
          <div className="mt-1 text-3xl font-black text-slate-900 tabular-nums">{playersInPool}</div>
        </div>
      </section>

      <section className="space-y-4">
        {matches.map((match) => {
          const home = teamById.get(match.homeTeamId);
          const away = teamById.get(match.awayTeamId);
          const edit = getEditForMatch(match);
          const published =
            Number.isInteger(match.homeScore) &&
            Number.isInteger(match.awayScore) &&
            String(match.status || '').toLowerCase() === 'finished';
          const isLive = String(match.status || '').toLowerCase() === 'live';
          const liveChecked = edit.live;
          return (
            <article
              key={match.id}
              className={`rounded-xl border bg-white p-4 sm:p-5 ${
                published ? 'border-emerald-300 shadow-[0_1px_3px_rgba(22,163,74,0.10)]' : 'border-black/[0.08]'
              }`}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-700">
                  Group {match.groupCode || '-'} · {fmtKickoff(match.kickoffAt)}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] ${
                    published ? 'bg-emerald-100 text-emerald-800' : 'bg-black/[0.05] text-slate-500'
                  }`}
                >
                  {published ? 'SCORED' : 'PENDING'}
                </span>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex-1 text-sm font-bold text-slate-900">{home?.name || 'Home'}</div>
                <input
                  value={edit.home}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      [match.id]: { ...edit, home: String(e.target.value).replace(/[^0-9]/g, '').slice(0, 2) },
                    }))
                  }
                  className="h-11 w-12 rounded-lg border-2 border-black/15 text-center text-lg font-extrabold"
                  inputMode="numeric"
                  disabled={!liveChecked && !published}
                />
                <span className="text-lg font-black text-black/25">-</span>
                <input
                  value={edit.away}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      [match.id]: { ...edit, away: String(e.target.value).replace(/[^0-9]/g, '').slice(0, 2) },
                    }))
                  }
                  className="h-11 w-12 rounded-lg border-2 border-black/15 text-center text-lg font-extrabold"
                  inputMode="numeric"
                  disabled={!liveChecked && !published}
                />
                <div className="flex-1 text-right text-sm font-bold text-slate-900">{away?.name || 'Away'}</div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={liveChecked}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [match.id]: { ...edit, live: e.target.checked },
                        }))
                      }
                    />
                    Live
                  </label>
                  <span className="text-xs font-semibold text-slate-500">
                    {published
                      ? 'Published. You can edit and republish final.'
                      : isLive || liveChecked
                        ? 'Live match updates enabled'
                        : 'Enable Live to edit'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void saveMatch(match, 'live')}
                    disabled={saving === match.id || edit.home === '' || edit.away === '' || !liveChecked}
                    className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Update Live
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalMatchId(match.id)}
                    disabled={
                      saving === match.id ||
                      edit.home === '' ||
                      edit.away === '' ||
                      (!liveChecked && !published)
                    }
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {published ? 'Republish Final' : 'Publish Final'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {modalMatch && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-[460px] sm:rounded-2xl">
            <h3 className="text-sm font-extrabold uppercase tracking-[0.1em] text-blue-700">Confirm publish</h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Save this score and recompute all player points for {payload.competition.name}?
            </p>
            <div className="mt-3 rounded-lg border border-black/[0.08] bg-black/[0.02] p-3 text-sm font-bold text-slate-800">
              {(teamById.get(modalMatch.homeTeamId)?.name || 'Home') +
                ' ' +
                getEditForMatch(modalMatch).home +
                ' - ' +
                getEditForMatch(modalMatch).away +
                ' ' +
                (teamById.get(modalMatch.awayTeamId)?.name || 'Away')}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setModalMatchId(null)}
                className="h-10 flex-1 rounded-lg border border-black/15 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveMatch(modalMatch, 'finished')}
                disabled={saving === modalMatch.id}
                className="h-10 flex-1 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving === modalMatch.id ? 'Saving...' : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

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
