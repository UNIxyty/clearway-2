'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AdminRoute } from '@/components/AdminRoute';
import { CheckIcon } from '@/components/playoffs/icons';
import {
  R32_LEFT_IDS, R32_RIGHT_IDS, R16_LEFT_IDS, R16_RIGHT_IDS,
  QF_LEFT_IDS, QF_RIGHT_IDS,
} from '@/lib/playoffs/bracketData';

const ROUND_TABS = [
  { id: 'R32',   label: 'R32',         ids: [...R32_LEFT_IDS, ...R32_RIGHT_IDS] },
  { id: 'R16',   label: 'R16',         ids: [...R16_LEFT_IDS, ...R16_RIGHT_IDS] },
  { id: 'QF',    label: 'Quarterfinal',ids: [...QF_LEFT_IDS, ...QF_RIGHT_IDS]   },
  { id: 'SF',    label: 'Semifinal',   ids: ['SF_M01','SF_M02']                  },
  { id: 'FINAL', label: 'Final',       ids: ['FINAL_M01']                        },
  { id: 'THIRD', label: 'Third Place', ids: ['THIRD_M01']                        },
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
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [scoring, setScoring] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('playoff_matches')
      .select(`
        id, match_code, home_score, away_score, winner_team_id,
        home_team_id, away_team_id,
        homeTeam:pickem_teams!home_team_id(name),
        awayTeam:pickem_teams!away_team_id(name)
      `)
      .then(({ data }) => {
        if (!data) return;
        const init: Record<string, MatchResult> = {};
        data.forEach((row: Record<string, unknown>) => {
          const code = row.match_code as string;
          const homeTeam = (row.homeTeam as Record<string, unknown> | null);
          const awayTeam = (row.awayTeam as Record<string, unknown> | null);
          init[code] = {
            id: row.id as string,
            matchCode: code,
            homeTeamName: (homeTeam?.name as string) ?? '—',
            awayTeamName: (awayTeam?.name as string) ?? '—',
            homeTeamId: row.home_team_id as string ?? '',
            awayTeamId: row.away_team_id as string ?? '',
            homeScore: row.home_score != null ? String(row.home_score) : '',
            awayScore: row.away_score != null ? String(row.away_score) : '',
            winnerTeamId: row.winner_team_id as string ?? '',
          };
        });
        setResults(init);
      });
  }, [supabase]);

  const currentIds = ROUND_TABS.find(t => t.id === activeTab)?.ids ?? [];

  const setScore = useCallback((code: string, side: 'homeScore' | 'awayScore', v: string) => {
    setResults(prev => {
      const row = prev[code];
      if (!row) return prev;
      // Auto-set winner
      const hs = side === 'homeScore' ? v : row.homeScore;
      const as_ = side === 'awayScore' ? v : row.awayScore;
      let winnerId = row.winnerTeamId;
      if (hs !== '' && as_ !== '') {
        const h = parseInt(hs, 10), a = parseInt(as_, 10);
        if (h > a) winnerId = row.homeTeamId;
        else if (a > h) winnerId = row.awayTeamId;
        // draw → keep existing winner (admin can override with dropdown)
      }
      return { ...prev, [code]: { ...row, [side]: v, winnerTeamId: winnerId } };
    });
  }, []);

  const setWinner = useCallback((code: string, teamId: string) => {
    setResults(prev => ({ ...prev, [code]: { ...prev[code], winnerTeamId: teamId } }));
  }, []);

  const saveResult = useCallback(async (code: string) => {
    const row = results[code];
    if (!row?.id) return;
    setSaving(prev => ({ ...prev, [code]: true }));
    try {
      await supabase
        .from('playoff_matches')
        .update({
          home_score: row.homeScore !== '' ? parseInt(row.homeScore, 10) : null,
          away_score: row.awayScore !== '' ? parseInt(row.awayScore, 10) : null,
          winner_team_id: row.winnerTeamId || null,
          is_locked: true,
        })
        .eq('id', row.id);
      setToast(`${code} result saved`);
      setTimeout(() => setToast(null), 2000);
    } finally {
      setSaving(prev => ({ ...prev, [code]: false }));
    }
  }, [results, supabase]);

  const calculatePoints = useCallback(async (code: string) => {
    const row = results[code];
    if (!row?.id) return;
    setScoring(prev => ({ ...prev, [code]: true }));
    try {
      const { error } = await supabase.rpc('calculate_playoff_points', { p_match_id: row.id });
      if (error) throw error;
      setToast(`Points calculated for ${code}`);
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setToast(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setScoring(prev => ({ ...prev, [code]: false }));
    }
  }, [results, supabase]);

  return (
    <div className="min-h-screen bg-page">
      <div className="bg-white border-b border-black/[0.07]">
        <div className="max-w-5xl mx-auto px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-bk-amber-dark bg-bk-amber/15 px-2 py-1 rounded-md">ADMIN</span>
            <h1 className="text-[22px] font-black tracking-tight text-navy">Playoff Results</h1>
          </div>
          <p className="text-[13px] font-semibold text-black/45">
            Enter final scores and calculate points for each knockout match.
          </p>
        </div>

        <div className="max-w-5xl mx-auto px-5 flex gap-0.5">
          {ROUND_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`h-10 px-4 text-[13px] font-bold transition border-b-[2px] whitespace-nowrap ${activeTab === t.id ? 'text-bk-blue border-bk-blue' : 'text-black/45 border-transparent hover:text-navy'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-5 py-6 space-y-4">
        {currentIds.map(code => {
          const row = results[code];
          if (!row) {
            return (
              <div key={code} className="bg-white rounded-xl border border-black/[0.08] p-5">
                <span className="text-[12px] font-semibold text-black/35">{code} — not set up yet. Add teams in Bracket Setup first.</span>
              </div>
            );
          }

          const isDraw = row.homeScore !== '' && row.awayScore !== '' &&
            parseInt(row.homeScore, 10) === parseInt(row.awayScore, 10);

          return (
            <div key={code} className="bg-white rounded-xl border border-black/[0.08] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[11px] font-extrabold tracking-widest text-navy/60 bg-navy/[0.07] px-2 py-1 rounded">{code}</span>
                <div className="flex-1 flex items-center justify-center gap-4 text-[15px] font-bold text-navy">
                  <span className="flex-1 text-right truncate">{row.homeTeamName}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={row.homeScore}
                      onChange={e => setScore(code, 'homeScore', e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                      className="w-12 h-12 text-center text-[20px] font-extrabold tabular-nums rounded-lg border-2 border-black/12 bg-white text-navy outline-none focus:border-bk-blue focus:ring-2 focus:ring-bk-blue/20"
                    />
                    <span className="text-[18px] font-black text-black/25">–</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={row.awayScore}
                      onChange={e => setScore(code, 'awayScore', e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                      className="w-12 h-12 text-center text-[20px] font-extrabold tabular-nums rounded-lg border-2 border-black/12 bg-white text-navy outline-none focus:border-bk-blue focus:ring-2 focus:ring-bk-blue/20"
                    />
                  </div>
                  <span className="flex-1 truncate">{row.awayTeamName}</span>
                </div>
              </div>

              {/* Draw → manual winner selection */}
              {isDraw && (
                <div className="mb-4 p-3 rounded-lg bg-bk-amber/10 border border-bk-amber/30">
                  <div className="text-[11.5px] font-bold text-bk-amber-dark mb-2">Draw — select winner (e.g. via penalties)</div>
                  <div className="flex gap-3">
                    {[{ id: row.homeTeamId, name: row.homeTeamName }, { id: row.awayTeamId, name: row.awayTeamName }].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setWinner(code, t.id)}
                        className={`flex-1 h-9 rounded-lg text-[13px] font-bold transition ${row.winnerTeamId === t.id ? 'bg-bk-blue text-white' : 'bg-white border border-black/12 text-navy hover:border-bk-blue'}`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5">
                <button
                  onClick={() => calculatePoints(code)}
                  disabled={scoring[code] || !row.winnerTeamId}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-black/12 text-[13px] font-bold text-navy hover:border-bk-blue hover:text-bk-blue transition disabled:opacity-40"
                >
                  {scoring[code] && <div className="w-3.5 h-3.5 rounded-full border-2 border-bk-blue/30 border-t-bk-blue animate-spin" />}
                  Calculate Points
                </button>
                <button
                  onClick={() => saveResult(code)}
                  disabled={saving[code]}
                  className="inline-flex items-center gap-2 h-9 px-5 rounded-lg bg-bk-blue hover:bg-bk-blue-dark text-white text-[13px] font-bold transition disabled:opacity-50"
                >
                  {saving[code] && <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                  Save Result
                </button>
              </div>
            </div>
          );
        })}
      </main>

      {toast && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center px-4 pointer-events-none z-50">
          <div className="bg-navy text-white text-[13px] font-semibold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5">
            <CheckIcon className="w-4 h-4 text-emerald-400" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
