'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AdminRoute } from '@/components/AdminRoute';
import { CheckIcon } from '@/components/playoffs/icons';
import {
  R32_LEFT_IDS, R32_RIGHT_IDS, R16_LEFT_IDS, R16_RIGHT_IDS,
  QF_LEFT_IDS, QF_RIGHT_IDS, MATCHES,
} from '@/lib/playoffs/bracketData';
import type { PlayoffRound } from '@/lib/playoffs/types';

// Fallback flag emoji map keyed by team short_name
const FLAG_BY_CODE: Record<string, string> = {
  MEX:'🇲🇽', RSA:'🇿🇦', KOR:'🇰🇷', CZE:'🇨🇿', CAN:'🇨🇦', BIH:'🇧🇦', QAT:'🇶🇦', SUI:'🇨🇭',
  BRA:'🇧🇷', MAR:'🇲🇦', HAI:'🇭🇹', SCO:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', USA:'🇺🇸', PAR:'🇵🇾', AUS:'🇦🇺', TUR:'🇹🇷',
  GER:'🇩🇪', CUW:'🇨🇼', CIV:'🇨🇮', ECU:'🇪🇨', NED:'🇳🇱', JPN:'🇯🇵', SWE:'🇸🇪', TUN:'🇹🇳',
  BEL:'🇧🇪', EGY:'🇪🇬', IRN:'🇮🇷', NZL:'🇳🇿', ESP:'🇪🇸', CPV:'🇨🇻', KSA:'🇸🇦', URU:'🇺🇾',
  FRA:'🇫🇷', SEN:'🇸🇳', IRQ:'🇮🇶', NOR:'🇳🇴', ARG:'🇦🇷', ALG:'🇩🇿', AUT:'🇦🇹', JOR:'🇯🇴',
  POR:'🇵🇹', COD:'🇨🇩', UZB:'🇺🇿', COL:'🇨🇴', ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', CRO:'🇭🇷', GHA:'🇬🇭', PAN:'🇵🇦',
};

const ROUND_TABS: Array<{ id: string; label: string; ids: string[] }> = [
  { id: 'R32',   label: 'R32',          ids: [...R32_LEFT_IDS, ...R32_RIGHT_IDS] },
  { id: 'R16',   label: 'R16',          ids: [...R16_LEFT_IDS, ...R16_RIGHT_IDS] },
  { id: 'QF',    label: 'Quarterfinal', ids: [...QF_LEFT_IDS, ...QF_RIGHT_IDS]   },
  { id: 'SF',    label: 'Semifinal',    ids: ['SF_M01', 'SF_M02']                },
  { id: 'FINAL', label: 'Final',        ids: ['FINAL_M01']                       },
  { id: 'THIRD', label: 'Third Place',  ids: ['THIRD_M01']                       },
];

interface Team {
  id: string;
  name: string;
  shortName: string;
  flagEmoji: string;
  groupCode: string;
  crestUrl: string | null;
}

interface MatchRow {
  id: string | null;
  matchCode: string;
  homeTeamId: string;
  awayTeamId: string;
  venue: string;
  city: string;
  kickoffAt: string;
  isLocked: boolean;
}

// ─── Flag image using Twemoji CDN ────────────────────────────────────────────

function FlagImg({ emoji, size = 20 }: { emoji: string; size?: number }) {
  if (!emoji) return <span className="inline-block rounded-sm bg-black/[0.07]" style={{ width: size, height: Math.round(size * 0.75) }} />;
  const pts = [...emoji].map(c => c.codePointAt(0)!.toString(16)).join('-');
  return (
    <img
      src={`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${pts}.png`}
      alt={emoji}
      width={size}
      height={Math.round(size * 0.75)}
      className="object-contain rounded-sm shrink-0"
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

// ─── Custom team select ───────────────────────────────────────────────────────

function TeamSelect({
  value, teams, onChange, placeholder,
}: {
  value: string;
  teams: Team[];
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = teams.find(t => t.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return teams;
    return teams.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.shortName.toLowerCase().includes(q) ||
      t.groupCode.toLowerCase().includes(q)
    );
  }, [teams, search]);

  // Group filtered teams by groupCode for sectioned list
  const grouped = useMemo(() => {
    const map = new Map<string, Team[]>();
    filtered.forEach(t => {
      if (!map.has(t.groupCode)) map.set(t.groupCode, []);
      map.get(t.groupCode)!.push(t);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div className={`w-full h-11 px-3 rounded-xl border-2 bg-white flex items-center gap-2.5 transition cursor-pointer ${open ? 'border-bk-blue ring-2 ring-bk-blue/15' : 'border-black/[0.12] hover:border-black/25'}`}
        onClick={() => setOpen(o => !o)}
      >
        {selected ? (
          <>
            <FlagImg emoji={selected.flagEmoji} size={22} />
            <span className="flex-1 text-[13.5px] font-bold text-navy truncate">{selected.name}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-extrabold tracking-widest text-black/35">GRP {selected.groupCode}</span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}
                className="w-5 h-5 rounded-full bg-black/[0.07] hover:bg-black/20 flex items-center justify-center transition"
                title="Clear"
              >
                <svg className="w-2.5 h-2.5 text-black/50" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <span className="flex-1 text-[13px] font-semibold text-black/35">{placeholder}</span>
        )}
        <svg className={`w-4 h-4 text-black/35 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-50 bg-white rounded-xl border border-black/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.14)] overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-black/[0.07]">
            <div className="flex items-center gap-2 px-2.5 h-9 rounded-lg bg-black/[0.04]">
              <svg className="w-3.5 h-3.5 text-black/35 shrink-0" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search teams…"
                className="flex-1 bg-transparent text-[13px] font-semibold text-navy outline-none placeholder:text-black/30"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-black/35 hover:text-black/60">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="max-h-[280px] overflow-y-auto py-1">
            {/* Clear option */}
            {value && (
              <button
                type="button"
                onClick={() => pick('')}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-black/[0.04] transition"
              >
                <span className="w-[22px] h-[17px] rounded-sm bg-black/[0.07] border border-dashed border-black/20 shrink-0" />
                <span className="text-[12.5px] font-semibold text-black/40 italic">Clear selection</span>
              </button>
            )}

            {grouped.length === 0 && (
              <div className="px-4 py-5 text-center text-[13px] font-semibold text-black/35">No teams found</div>
            )}

            {grouped.map(([group, groupTeams]) => (
              <div key={group}>
                <div className="px-3 pt-2 pb-0.5">
                  <span className="text-[10px] font-extrabold tracking-[0.12em] text-black/30">GROUP {group}</span>
                </div>
                {groupTeams.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pick(t.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${t.id === value ? 'bg-bk-blue/[0.07]' : 'hover:bg-black/[0.03]'}`}
                  >
                    <FlagImg emoji={t.flagEmoji} size={22} />
                    <span className={`flex-1 text-[13.5px] font-bold truncate ${t.id === value ? 'text-bk-blue' : 'text-navy'}`}>{t.name}</span>
                    {t.id === value && (
                      <CheckIcon className="w-4 h-4 text-bk-blue shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
  const [teams, setTeams] = useState<Team[]>([]);
  const [rows, setRows] = useState<Record<string, MatchRow>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkClearing, setBulkClearing] = useState(false);

  // Load teams via dedicated endpoint (includes flag_emoji)
  useEffect(() => {
    fetch('/api/playoffs/teams', { cache: 'no-store' })
      .then(r => r.json())
      .then((payload: { teams?: Array<{ id: string; name: string; short_name: string; flag_emoji: string; group_code: string; crest_url: string | null }> }) => {
        if (!payload.teams?.length) {
          // Fallback to admin matches API (no flag_emoji)
          return fetch('/api/pickem/admin/matches', { cache: 'no-store' })
            .then(r => r.json())
            .then((p: { teams?: Array<{ id: string; name: string; shortName: string; groupCode: string; crestUrl: string | null }> }) => {
              if (!p.teams?.length) { setLoadError('No teams found.'); return; }
              setTeams(p.teams.map(t => ({ id: t.id, name: t.name, shortName: t.shortName, flagEmoji: FLAG_BY_CODE[t.shortName] || '', groupCode: t.groupCode, crestUrl: t.crestUrl ?? null })));
            });
        }
        setTeams(payload.teams.map(t => ({
          id: t.id,
          name: t.name,
          shortName: t.short_name || t.name,
          flagEmoji: t.flag_emoji || FLAG_BY_CODE[t.short_name] || '',
          groupCode: t.group_code,
          crestUrl: t.crest_url ?? null,
        })));
      })
      .catch(e => setLoadError(`Failed to load teams: ${e.message}`));
  }, []);

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
            homeTeamId: (row.home_team_id as string) ?? '',
            awayTeamId: (row.away_team_id as string) ?? '',
            venue: (row.venue as string) ?? '',
            city: (row.city as string) ?? '',
            kickoffAt: (row.kickoff_at as string) ?? '',
            isLocked: (row.is_locked as boolean) ?? false,
          };
        });
        setRows(init);
      });
  }, [supabase]);

  const loadFromGroupResults = useCallback(async () => {
    setBulkLoading(true);
    try {
      const res = await fetch('/api/admin/playoffs/populate-r32', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setToast(`Error: ${json.error}`); return; }
      setToast(`Loaded ${json.filled}/${json.total} R32 matchups from group results`);
      // Reload rows from DB
      const { data } = await supabase.from('playoff_matches').select('*');
      if (data) {
        const updated: Record<string, MatchRow> = { ...rows };
        data.forEach((row: Record<string, unknown>) => {
          updated[row.match_code as string] = {
            id: row.id as string,
            matchCode: row.match_code as string,
            homeTeamId: (row.home_team_id as string) ?? '',
            awayTeamId: (row.away_team_id as string) ?? '',
            venue: (row.venue as string) ?? '',
            city: (row.city as string) ?? '',
            kickoffAt: (row.kickoff_at as string) ?? '',
            isLocked: (row.is_locked as boolean) ?? false,
          };
        });
        setRows(updated);
      }
    } finally {
      setBulkLoading(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [supabase, rows]);

  const clearR32Teams = useCallback(async () => {
    setBulkClearing(true);
    try {
      const res = await fetch('/api/admin/playoffs/clear-r32', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setToast(`Error: ${json.error}`); return; }
      setToast(`Cleared all ${json.cleared} R32 team assignments`);
      setRows(prev => {
        const next = { ...prev };
        [...R32_LEFT_IDS, ...R32_RIGHT_IDS].forEach(code => {
          if (next[code]) next[code] = { ...next[code], homeTeamId: '', awayTeamId: '' };
        });
        return next;
      });
    } finally {
      setBulkClearing(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, []);

  const currentIds = ROUND_TABS.find(t => t.id === activeTab)?.ids ?? [];

  const getRow = useCallback((code: string): MatchRow => (
    rows[code] ?? { id: null, matchCode: code, homeTeamId: '', awayTeamId: '', venue: '', city: '', kickoffAt: '', isLocked: false }
  ), [rows]);

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
      {loadError && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 text-[13px] font-semibold text-amber-800">
          ⚠️ {loadError}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-black/[0.07]">
        <div className="max-w-5xl mx-auto px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-bk-amber-dark bg-bk-amber/15 px-2 py-1 rounded-md">ADMIN</span>
            <h1 className="text-[22px] font-black tracking-tight text-navy">Bracket Setup</h1>
          </div>
          <p className="text-[13px] font-semibold text-black/45">
            Assign qualifying teams to each knockout match slot.
          </p>
        </div>

        {/* Tabs */}
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

      <main className="max-w-5xl mx-auto px-5 py-6">
        {activeTab === 'R32' && (
          <div className="flex items-center gap-3 mb-5 p-4 bg-white rounded-xl border border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex-1">
              <p className="text-[13px] font-bold text-navy">Auto-populate from group stage</p>
              <p className="text-[12px] font-semibold text-black/45 mt-0.5">Loads actual group results and fills all 16 R32 matchups. 3rd-place slots use best-third ranking.</p>
            </div>
            <button
              onClick={clearR32Teams}
              disabled={bulkClearing || bulkLoading}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 text-[13px] font-bold transition disabled:opacity-50 whitespace-nowrap"
            >
              {bulkClearing && <div className="w-3 h-3 rounded-full border-2 border-red-300 border-t-red-600 animate-spin" />}
              Clear R32
            </button>
            <button
              onClick={loadFromGroupResults}
              disabled={bulkLoading || bulkClearing}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-bk-blue hover:bg-bk-blue-dark text-white text-[13px] font-bold transition disabled:opacity-50 whitespace-nowrap"
            >
              {bulkLoading && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
              Load from Groups
            </button>
          </div>
        )}
        <div className="space-y-4">
          {currentIds.map(code => {
            const row = getRow(code);
            const isSaving = saving[code];
            const isSaved = saved[code];
            return (
              <div key={code} className="bg-white rounded-xl border border-black/[0.08] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {/* Match header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-extrabold tracking-widest text-navy/60 bg-navy/[0.07] px-2 py-1 rounded">{code}</span>
                    {(row.venue || row.city) && (
                      <span className="text-[12px] font-semibold text-black/40">
                        📍 {row.venue}{row.city ? `, ${row.city}` : ''}
                      </span>
                    )}
                    {row.kickoffAt && (
                      <span className="text-[12px] font-semibold text-black/40">
                        · {new Date(row.kickoffAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                      </span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={row.isLocked}
                      onChange={e => setField(code, 'isLocked', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-[12px] font-semibold text-black/55">Lock</span>
                  </label>
                </div>

                {/* Team selects */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div>
                    <div className="text-[10.5px] font-extrabold tracking-widest text-black/30 mb-1.5">HOME</div>
                    <TeamSelect
                      value={row.homeTeamId}
                      teams={teams}
                      onChange={id => setField(code, 'homeTeamId', id)}
                      placeholder="Select home team"
                    />
                  </div>

                  <div className="hidden sm:flex items-center justify-center mt-5">
                    <span className="text-[15px] font-black text-black/20">vs</span>
                  </div>

                  <div>
                    <div className="text-[10.5px] font-extrabold tracking-widest text-black/30 mb-1.5">AWAY</div>
                    <TeamSelect
                      value={row.awayTeamId}
                      teams={teams}
                      onChange={id => setField(code, 'awayTeamId', id)}
                      placeholder="Select away team"
                    />
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
