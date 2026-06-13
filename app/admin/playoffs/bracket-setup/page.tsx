'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AdminRoute } from '@/components/AdminRoute';
import { CheckIcon } from '@/components/playoffs/icons';
import {
  R32_LEFT_IDS, R32_RIGHT_IDS, R16_LEFT_IDS, R16_RIGHT_IDS,
  QF_LEFT_IDS, QF_RIGHT_IDS, MATCHES,
} from '@/lib/playoffs/bracketData';
import type { BracketTeam, PlayoffRound } from '@/lib/playoffs/types';

const ROUND_TABS: Array<{ id: string; label: string; ids: string[] }> = [
  { id: 'R32',   label: 'R32',         ids: [...R32_LEFT_IDS, ...R32_RIGHT_IDS] },
  { id: 'R16',   label: 'R16',         ids: [...R16_LEFT_IDS, ...R16_RIGHT_IDS] },
  { id: 'QF',    label: 'Quarterfinal',ids: [...QF_LEFT_IDS, ...QF_RIGHT_IDS]   },
  { id: 'SF',    label: 'Semifinal',   ids: ['SF_M01','SF_M02']                  },
  { id: 'FINAL', label: 'Final',       ids: ['FINAL_M01']                        },
  { id: 'THIRD', label: 'Third Place', ids: ['THIRD_M01']                        },
];

interface MatchRow {
  id: string | null;
  matchCode: string;
  homeTeamId: string;
  awayTeamId: string;
  venue: string;     // read-only, seeded by migration
  city: string;      // read-only, seeded by migration
  kickoffAt: string; // read-only, seeded by migration
  isLocked: boolean;
}

export default function BracketSetupPage() {
  return (
    <AdminRoute>
      <BracketSetupContent />
    </AdminRoute>
  );
}

function BracketSetupContent() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [activeTab, setActiveTab] = useState('R32');
  const [teams, setTeams] = useState<BracketTeam[]>([]);
  const [rows, setRows] = useState<Record<string, MatchRow>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  // Load all pickem_teams for the team selects
  useEffect(() => {
    (async () => {
      const { data: comp } = await supabase
        .from('pickem_competitions')
        .select('id')
        .eq('slug', 'wc-2026')
        .single();
      if (!comp) return;
      const { data } = await supabase
        .from('pickem_teams')
        .select('id, name, short_name, group_code, crest_url')
        .eq('competition_id', comp.id)
        .order('group_code')
        .order('sort_order');
      if (!data) return;
      setTeams(data.map((t: Record<string, unknown>) => ({
        id: t.id as string,
        name: t.name as string,
        shortName: (t.short_name as string) || (t.name as string),
        flag: '',
        groupCode: t.group_code as string,
        crestUrl: t.crest_url as string | null,
      })));
    })();
  }, [supabase]);

  // Load existing playoff_matches
  useEffect(() => {
    supabase
      .from('playoff_matches')
      .select('*')
      .then(({ data }) => {
        if (!data) return;
        const init: Record<string, MatchRow> = {};
        data.forEach((row: Record<string, unknown>) => {
          init[row.match_code as string] = {
            id: row.id as string,
            matchCode: row.match_code as string,
            homeTeamId: row.home_team_id as string ?? '',
            awayTeamId: row.away_team_id as string ?? '',
            venue: row.venue as string ?? '',
            city: row.city as string ?? '',
            kickoffAt: row.kickoff_at as string ?? '',
            isLocked: row.is_locked as boolean ?? false,
          };
        });
        setRows(init);
      });
  }, [supabase]);

  const currentIds = ROUND_TABS.find(t => t.id === activeTab)?.ids ?? [];

  const getRow = useCallback((code: string): MatchRow => {
    return rows[code] ?? {
      id: null, matchCode: code, homeTeamId: '', awayTeamId: '',
      venue: '', city: '', kickoffAt: '', isLocked: false,
    };
  }, [rows]);

  const setField = useCallback((code: string, field: keyof MatchRow, value: string | boolean) => {
    setRows(prev => ({ ...prev, [code]: { ...getRow(code), [field]: value } }));
    setSaved(prev => ({ ...prev, [code]: false }));
  }, [getRow]);

  const save = useCallback(async (code: string) => {
    const row = getRow(code);
    const def = MATCHES[code];
    setSaving(prev => ({ ...prev, [code]: true }));
    try {
      const matchNumber = parseInt(code.replace(/\D/g, ''), 10) || 0;
      const payload = {
        match_number: matchNumber,
        round: def.round as PlayoffRound,
        match_code: code,
        home_team_id: row.homeTeamId || null,
        away_team_id: row.awayTeamId || null,
        is_locked: row.isLocked,
      };

      if (row.id) {
        await supabase.from('playoff_matches').update(payload).eq('id', row.id);
      } else {
        const { data } = await supabase.from('playoff_matches').insert(payload).select('id').single();
        if (data) setRows(prev => ({ ...prev, [code]: { ...prev[code], id: (data as Record<string, unknown>).id as string } }));
      }

      setSaved(prev => ({ ...prev, [code]: true }));
      setToast(`${code} saved`);
      setTimeout(() => setToast(null), 2000);
    } finally {
      setSaving(prev => ({ ...prev, [code]: false }));
    }
  }, [getRow, supabase]);

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <div className="bg-white border-b border-black/[0.07]">
        <div className="max-w-5xl mx-auto px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-bk-amber-dark bg-bk-amber/15 px-2 py-1 rounded-md">ADMIN</span>
            <h1 className="text-[22px] font-black tracking-tight text-navy">Bracket Setup</h1>
          </div>
          <p className="text-[13px] font-semibold text-black/45">
            Assign teams to each knockout match slot. R32 matches require selecting teams from the group stage draw.
          </p>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-5 flex gap-0.5 pb-0">
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

      <main className="max-w-5xl mx-auto px-5 py-6">
        <div className="space-y-4">
          {currentIds.map(code => {
            const row = getRow(code);
            const isSaving = saving[code];
            const isSaved = saved[code];
            return (
              <div key={code} className="bg-white rounded-xl border border-black/[0.08] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-extrabold tracking-widest text-navy/60 bg-navy/[0.07] px-2 py-1 rounded">{code}</span>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={row.isLocked}
                      onChange={e => setField(code, 'isLocked', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-[12px] font-semibold text-black/55">Lock predictions</span>
                  </label>
                </div>

                {/* Static info badge */}
                {(row.venue || row.city || row.kickoffAt) && (
                  <div className="mb-3 flex flex-wrap gap-2 text-[12px] font-semibold text-black/45">
                    {row.venue && <span>📍 {row.venue}{row.city ? `, ${row.city}` : ''}</span>}
                    {row.kickoffAt && (
                      <span>🕐 {new Date(row.kickoffAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Home team */}
                  <div>
                    <label className="block text-[11px] font-bold text-black/40 mb-1.5">HOME TEAM</label>
                    <select
                      value={row.homeTeamId}
                      onChange={e => setField(code, 'homeTeamId', e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-black/[0.12] bg-white text-[13px] font-semibold text-navy outline-none focus:border-bk-blue"
                    >
                      <option value="">— Select team —</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name} (Group {t.groupCode})</option>
                      ))}
                    </select>
                  </div>

                  {/* Away team */}
                  <div>
                    <label className="block text-[11px] font-bold text-black/40 mb-1.5">AWAY TEAM</label>
                    <select
                      value={row.awayTeamId}
                      onChange={e => setField(code, 'awayTeamId', e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-black/[0.12] bg-white text-[13px] font-semibold text-navy outline-none focus:border-bk-blue"
                    >
                      <option value="">— Select team —</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name} (Group {t.groupCode})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => save(code)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 h-9 px-5 rounded-lg bg-bk-blue hover:bg-bk-blue-dark text-white text-[13px] font-bold transition active:scale-[0.97] disabled:opacity-50"
                  >
                    {isSaving ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : isSaved ? (
                      <CheckIcon className="w-3.5 h-3.5" />
                    ) : null}
                    {isSaving ? 'Saving…' : isSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
