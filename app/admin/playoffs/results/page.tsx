'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AdminRoute } from '@/components/AdminRoute';
import { CheckIcon } from '@/components/playoffs/icons';
import {
  R32_LEFT_IDS, R32_RIGHT_IDS, R16_LEFT_IDS, R16_RIGHT_IDS,
  QF_LEFT_IDS, QF_RIGHT_IDS, MATCHES,
} from '@/lib/playoffs/bracketData';

/*
 * ── MANUAL QA CHECKLIST — verify after changing publish/scoring logic ──────────
 * Bug 6 (publish → points + progression). Steps:
 *  1. Bracket Setup → R32 tab → "Load from Groups" so R32 has real teams.
 *  2. Results → R32 tab → enter a score for one match, pick a winner, "Publish Final".
 *     Expect toast "published · N predictions scored" with N = users who picked it.
 *  3. As a test user on /playoffs/bracket, refocus the tab → that R32 card shows a
 *     green "+1 pt" (or "miss") badge; Standings → Playoffs reflects new totals.
 *  4. Back in Results, switch to the R16 tab: the downstream match that this winner
 *     feeds now shows the advanced team name (no longer "—") and can be scored.
 *  5. Republish with a different winner → downstream slot updates to the new team.
 * ──────────────────────────────────────────────────────────────────────────────
 */

const ROUND_TABS = [
  { id: 'R32',   label: 'R32',          ids: [...R32_LEFT_IDS, ...R32_RIGHT_IDS] },
  { id: 'R16',   label: 'R16',          ids: [...R16_LEFT_IDS, ...R16_RIGHT_IDS] },
  { id: 'QF',    label: 'Quarterfinal', ids: [...QF_LEFT_IDS, ...QF_RIGHT_IDS]   },
  { id: 'SF',    label: 'Semifinal',    ids: ['SF_M01', 'SF_M02']                 },
  { id: 'FINAL', label: 'Final',        ids: ['FINAL_M01']                        },
  { id: 'THIRD', label: 'Third Place',  ids: ['THIRD_M01']                        },
];

interface MatchResult {
  id: string;
  matchCode: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: string;
  awayScore: string;
  winnerTeamId: string;
  isLocked: boolean;
  kickoffAt: string | null;
  // local UI state
  liveChecked: boolean;
}

function fmtKickoff(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export default function PlayoffResultsPage() {
  return (
    <AdminRoute>
      <ResultsContent />
    </AdminRoute>
  );
}

function ResultsContent() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [activeTab, setActiveTab] = useState('R32');
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [savingLive, setSavingLive] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  const [modalCode, setModalCode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    const { data, error } = await supabase
      .from('playoff_matches')
      .select(`
        id, match_code, home_score, away_score, winner_team_id, is_locked,
        kickoff_at, home_team_id, away_team_id,
        homeTeam:pickem_teams!home_team_id(name),
        awayTeam:pickem_teams!away_team_id(name)
      `);
    if (error) {
      console.error('[playoff-results] failed to load matches', error);
      return;
    }
    if (!data) return;
    setResults(prev => {
      const init: Record<string, MatchResult> = {};
      data.forEach((row: Record<string, unknown>) => {
        const code = row.match_code as string;
        const homeTeam = row.homeTeam as Record<string, unknown> | null;
        const awayTeam = row.awayTeam as Record<string, unknown> | null;
        const locked = Boolean(row.is_locked);
        // Preserve the admin's in-progress local edits (live checkbox) across reloads.
        const existing = prev[code];
        init[code] = {
          id: row.id as string,
          matchCode: code,
          homeTeamName: (homeTeam?.name as string) ?? '—',
          awayTeamName: (awayTeam?.name as string) ?? '—',
          homeTeamId: (row.home_team_id as string) ?? '',
          awayTeamId: (row.away_team_id as string) ?? '',
          homeScore: row.home_score != null ? String(row.home_score) : '',
          awayScore: row.away_score != null ? String(row.away_score) : '',
          winnerTeamId: (row.winner_team_id as string) ?? '',
          isLocked: locked,
          kickoffAt: (row.kickoff_at as string) ?? null,
          liveChecked: existing?.liveChecked || locked,
        };
      });
      return init;
    });
  }, [supabase]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const currentIds = useMemo(() => {
    const ids = ROUND_TABS.find(t => t.id === activeTab)?.ids ?? [];
    // Sort by kickoff date so the earliest match shows first
    return [...ids].sort((a, b) => {
      const ta = results[a]?.kickoffAt ? new Date(results[a].kickoffAt as string).getTime() : Infinity;
      const tb = results[b]?.kickoffAt ? new Date(results[b].kickoffAt as string).getTime() : Infinity;
      return ta - tb;
    });
  }, [activeTab, results]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  const setScore = useCallback((code: string, side: 'homeScore' | 'awayScore', v: string) => {
    setResults(prev => {
      const row = prev[code];
      if (!row) return prev;
      const hs = side === 'homeScore' ? v : row.homeScore;
      const as_ = side === 'awayScore' ? v : row.awayScore;
      let winnerId = row.winnerTeamId;
      if (hs !== '' && as_ !== '') {
        const h = parseInt(hs, 10), a = parseInt(as_, 10);
        if (h > a) winnerId = row.homeTeamId;
        else if (a > h) winnerId = row.awayTeamId;
        // draw — keep existing winner; admin selects manually
      }
      return { ...prev, [code]: { ...row, [side]: v, winnerTeamId: winnerId } };
    });
  }, []);

  const setWinner = useCallback((code: string, teamId: string) => {
    setResults(prev => ({ ...prev, [code]: { ...prev[code], winnerTeamId: teamId } }));
  }, []);

  const toggleLive = useCallback((code: string, checked: boolean) => {
    setResults(prev => ({ ...prev, [code]: { ...prev[code], liveChecked: checked } }));
  }, []);

  // Save scores only — no is_locked, no RPC
  const updateLive = useCallback(async (code: string) => {
    const row = results[code];
    if (!row?.id) return;
    setSavingLive(prev => ({ ...prev, [code]: true }));
    try {
      await supabase
        .from('playoff_matches')
        .update({
          home_score: row.homeScore !== '' ? parseInt(row.homeScore, 10) : null,
          away_score: row.awayScore !== '' ? parseInt(row.awayScore, 10) : null,
          winner_team_id: row.winnerTeamId || null,
        })
        .eq('id', row.id);
      flash(`${code} live score updated`);
    } finally {
      setSavingLive(prev => ({ ...prev, [code]: false }));
    }
  }, [results, supabase]);

  // Propagate the published match's winner (and, for the bronze match, the loser)
  // into the downstream match slot(s) it feeds. R16+ rows store null home/away
  // team ids until the feeding match is decided, so without this step the next
  // round can never be scored (no teams → no winner → 0 points for everyone).
  const advanceWinner = useCallback(async (code: string, row: MatchResult) => {
    const winnerId = row.winnerTeamId;
    if (!winnerId) return;
    const loserId = winnerId === row.homeTeamId ? row.awayTeamId : row.homeTeamId;

    // Downstream matches are those whose feeders include this match code.
    const downstream = Object.values(MATCHES).filter(d => d.feeders?.includes(code));
    for (const def of downstream) {
      const slotIndex = def.feeders!.indexOf(code); // 0 → home slot, 1 → away slot
      const teamForSlot = def.losers ? loserId : winnerId;
      if (!teamForSlot) continue;
      const downRow = results[def.id];
      if (!downRow?.id) continue;
      const field = slotIndex === 0 ? 'home_team_id' : 'away_team_id';
      const { error } = await supabase
        .from('playoff_matches')
        .update({ [field]: teamForSlot })
        .eq('id', downRow.id);
      if (error) {
        console.error('[playoff-results] failed to advance winner to downstream slot', {
          from: code, to: def.id, field, error: error.message,
        });
      }
    }
  }, [results, supabase]);

  // Save scores + is_locked=true + call RPC, then advance the winner downstream.
  const publishFinal = useCallback(async (code: string) => {
    const row = results[code];
    if (!row?.id) return;
    setPublishing(prev => ({ ...prev, [code]: true }));
    try {
      const { error: updateErr } = await supabase
        .from('playoff_matches')
        .update({
          home_score: row.homeScore !== '' ? parseInt(row.homeScore, 10) : null,
          away_score: row.awayScore !== '' ? parseInt(row.awayScore, 10) : null,
          winner_team_id: row.winnerTeamId || null,
          is_locked: true,
        })
        .eq('id', row.id);
      if (updateErr) throw updateErr;

      const { error: rpcErr } = await supabase.rpc('calculate_playoff_points', { p_match_id: row.id });
      if (rpcErr) throw rpcErr;

      // How many predictions were scored, for an informative confirmation.
      const { count } = await supabase
        .from('playoff_predictions')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', row.id);

      // Advance the winner into the next round so it becomes scoreable.
      await advanceWinner(code, row);

      setResults(prev => ({
        ...prev,
        [code]: { ...prev[code], isLocked: true, liveChecked: true },
      }));
      // Reload so downstream rows pick up their newly-assigned team names.
      await loadResults();
      flash(`${code} published · ${count ?? 0} prediction${count === 1 ? '' : 's'} scored`);
    } catch (err) {
      console.error('[playoff-results] publish failed', { code, err });
      flash(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setPublishing(prev => ({ ...prev, [code]: false }));
      setModalCode(null);
    }
  }, [results, supabase, advanceWinner, loadResults]);

  const modalRow = modalCode ? results[modalCode] ?? null : null;

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <div className="bg-white border-b border-black/[0.07]">
        <div className="max-w-5xl mx-auto px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-bk-amber-dark bg-bk-amber/15 px-2 py-1 rounded-md">
              ADMIN
            </span>
            <h1 className="text-[22px] font-black tracking-tight text-navy">Playoff Results</h1>
          </div>
          <p className="text-[13px] font-semibold text-black/45">
            Enter scores and publish final results for each knockout match.
          </p>
        </div>

        {/* Round tabs */}
        <div className="max-w-5xl mx-auto px-5 flex gap-0.5 overflow-x-auto">
          {ROUND_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`h-10 px-4 text-[13px] font-bold transition border-b-[2px] whitespace-nowrap ${
                activeTab === t.id
                  ? 'text-bk-blue border-bk-blue'
                  : 'text-black/45 border-transparent hover:text-navy'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Match cards */}
      <main className="max-w-5xl mx-auto px-5 py-6 space-y-4">
        {currentIds.map(code => {
          const row = results[code];

          if (!row) {
            return (
              <div key={code} className="rounded-xl border border-black/[0.08] bg-white p-4 sm:p-5">
                <span className="text-[12px] font-semibold text-black/35">
                  {code} — not set up yet. Add teams in Bracket Setup first.
                </span>
              </div>
            );
          }

          const published = row.isLocked && (row.homeScore !== '' || row.awayScore !== '');
          const canEdit = row.liveChecked || published;
          const isDraw =
            row.homeScore !== '' &&
            row.awayScore !== '' &&
            parseInt(row.homeScore, 10) === parseInt(row.awayScore, 10);
          const canSave = canEdit && row.homeScore !== '' && row.awayScore !== '';
          const canPublish = canEdit && row.homeScore !== '' && row.awayScore !== '' && Boolean(row.winnerTeamId);

          return (
            <article
              key={code}
              className={`rounded-xl border bg-white p-4 sm:p-5 ${
                published
                  ? 'border-emerald-300 shadow-[0_1px_3px_rgba(22,163,74,0.10)]'
                  : 'border-black/[0.08]'
              }`}
            >
              {/* Card header */}
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-700">
                  {code}
                  {row.kickoffAt && (
                    <span className="text-black/45 font-semibold">
                      {' '}· {fmtKickoff(row.kickoffAt)}
                    </span>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] ${
                    published
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-black/[0.05] text-slate-500'
                  }`}
                >
                  {published ? 'SCORED' : 'PENDING'}
                </span>
              </div>

              {/* Score row: Home [X] – [Y] Away */}
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex-1 text-right text-sm font-bold text-slate-900 truncate">
                  {row.homeTeamName}
                </div>
                <input
                  value={row.homeScore}
                  onChange={e =>
                    setScore(code, 'homeScore', e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
                  }
                  className="h-11 w-12 rounded-lg border-2 border-black/15 bg-white text-center text-lg font-extrabold tabular-nums text-navy outline-none focus:border-bk-blue focus:ring-2 focus:ring-bk-blue/20 disabled:bg-black/[0.03] disabled:text-black/30"
                  inputMode="numeric"
                  disabled={!canEdit}
                />
                <span className="text-lg font-black text-black/25">–</span>
                <input
                  value={row.awayScore}
                  onChange={e =>
                    setScore(code, 'awayScore', e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
                  }
                  className="h-11 w-12 rounded-lg border-2 border-black/15 bg-white text-center text-lg font-extrabold tabular-nums text-navy outline-none focus:border-bk-blue focus:ring-2 focus:ring-bk-blue/20 disabled:bg-black/[0.03] disabled:text-black/30"
                  inputMode="numeric"
                  disabled={!canEdit}
                />
                <div className="flex-1 text-sm font-bold text-slate-900 truncate">
                  {row.awayTeamName}
                </div>
              </div>

              {/* Draw winner selection */}
              {isDraw && canEdit && (
                <div className="mt-3 rounded-lg border border-bk-amber/30 bg-bk-amber/10 p-3">
                  <div className="mb-2 text-[11.5px] font-bold text-bk-amber-dark">
                    Draw — select winner (e.g. via penalties)
                  </div>
                  <div className="flex gap-3">
                    {[
                      { id: row.homeTeamId, name: row.homeTeamName },
                      { id: row.awayTeamId, name: row.awayTeamName },
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setWinner(code, t.id)}
                        className={`flex-1 h-9 rounded-lg text-[13px] font-bold transition ${
                          row.winnerTeamId === t.id
                            ? 'bg-bk-blue text-white'
                            : 'border border-black/12 bg-white text-navy hover:border-bk-blue'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer row: Live checkbox + buttons */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={row.liveChecked}
                      onChange={e => toggleLive(code, e.target.checked)}
                      className="rounded"
                    />
                    Live
                  </label>
                  <span className="text-xs font-semibold text-slate-500">
                    {published
                      ? 'Published. You can edit and republish.'
                      : row.liveChecked
                        ? 'Live editing enabled'
                        : 'Enable Live to edit'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateLive(code)}
                    disabled={savingLive[code] || !canSave}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {savingLive[code] && (
                      <div className="h-3 w-3 rounded-full border-2 border-blue-300 border-t-blue-700 animate-spin" />
                    )}
                    Update Live
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalCode(code)}
                    disabled={publishing[code] || !canPublish}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-blue-700 transition"
                  >
                    {publishing[code] && (
                      <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    )}
                    {published ? 'Republish Final' : 'Publish Final'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </main>

      {/* Publish confirmation modal */}
      {modalRow && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-[460px] sm:rounded-2xl">
            <h3 className="text-sm font-extrabold uppercase tracking-[0.1em] text-blue-700">
              Confirm publish
            </h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Save this score, lock the match, and calculate playoff points?
            </p>
            <div className="mt-3 rounded-lg border border-black/[0.08] bg-black/[0.02] p-3 text-sm font-bold text-slate-800">
              {modalRow.homeTeamName} {modalRow.homeScore} – {modalRow.awayScore} {modalRow.awayTeamName}
              {modalRow.winnerTeamId && (
                <span className="ml-2 text-[11px] font-extrabold text-emerald-700">
                  (winner:{' '}
                  {modalRow.winnerTeamId === modalRow.homeTeamId
                    ? modalRow.homeTeamName
                    : modalRow.awayTeamName}
                  )
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setModalCode(null)}
                className="h-10 flex-1 rounded-lg border border-black/15 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => publishFinal(modalCode!)}
                disabled={publishing[modalCode!]}
                className="h-10 flex-1 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-50 hover:bg-blue-700 transition"
              >
                {publishing[modalCode!] ? 'Publishing...' : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 transition-all duration-300 ${
          toast ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div className="flex items-center gap-2.5 rounded-xl bg-navy px-4 py-3 text-[13px] font-semibold text-white shadow-xl max-w-[90vw]">
          <CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
          {toast || ''}
        </div>
      </div>
    </div>
  );
}
