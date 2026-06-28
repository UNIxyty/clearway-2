'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { FlagImage } from '@/components/FlagImage';
import { flagCdnCode } from '@/lib/playoffs/flags';
import { CheckIcon } from '@/components/playoffs/icons';
import {
  R32_LEFT_IDS, R32_RIGHT_IDS, R16_LEFT_IDS, R16_RIGHT_IDS,
  QF_LEFT_IDS, QF_RIGHT_IDS, OFFICIAL_MATCH_NUMBER,
} from '@/lib/playoffs/bracketData';
import { useAdminStats } from '@/hooks/useAdminStats';
import { useTournamentState } from '@/hooks/useTournamentState';

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

// ─── Flag image via flagcdn (shared component) ───────────────────────────────

function FlagImg({ emoji, size = 20 }: { emoji: string; size?: number }) {
  return <FlagImage countryCode={flagCdnCode(emoji)} emoji={emoji} size={size} />;
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

interface BracketSetupViewProps { embedded?: boolean; initialAction?: 'confirm-r32' | 'open-playoffs' | null }

export function BracketSetupView({ embedded = false, initialAction = null }: BracketSetupViewProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [activeTab, setActiveTab] = useState('R32');
  const [teams, setTeams] = useState<Team[]>([]);
  const [rows, setRows] = useState<Record<string, MatchRow>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  // Optional actionable link rendered inside the toast (e.g. jump to a section).
  const [toastLink, setToastLink] = useState<{ href: string; label: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Prerequisite status (read from the shared, module-cached console fetch — no
  // new queries). groupsFinalized 0..12; r32ConfirmedAt for the confirm chip.
  const stats = useAdminStats();
  const { state: tState } = useTournamentState();
  // R32 slots filled is computed from the live local rows so it updates as the
  // admin edits, without refetching.
  const r32Filled = useMemo(
    () => [...R32_LEFT_IDS, ...R32_RIGHT_IDS].filter(c => {
      const r = rows[c];
      return !!(r?.homeTeamId && r?.awayTeamId);
    }).length,
    [rows],
  );
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkClearing, setBulkClearing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Confirm-R32 email-audience modal.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [audience, setAudience] = useState<'all' | 'test' | 'none'>('all');
  const [recipientsInput, setRecipientsInput] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // initialAction='confirm-r32' (Overview shortcut): jump to R32, scroll the
  // R32 action bar into view, pulse it briefly. Purely visual — never triggers it.
  const r32BarRef = useRef<HTMLDivElement>(null);
  const [highlightConfirm, setHighlightConfirm] = useState(false);
  useEffect(() => {
    if (initialAction !== 'confirm-r32') return;
    setActiveTab('R32');
    const t = setTimeout(() => {
      r32BarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightConfirm(true);
      setTimeout(() => setHighlightConfirm(false), 2400);
    }, 150);
    return () => clearTimeout(t);
  }, [initialAction]);

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
    setToastLink(null);
    let persist = false;
    try {
      const res = await fetch('/api/admin/playoffs/populate-r32', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setToast(`Error: ${json.error}`); return; }
      if (json.filled === 0) {
        // Nothing to fill = group standings aren't published yet. Don't no-op
        // silently; tell the admin the missing prerequisite + link to fix it.
        setToast('Cannot auto-fill R32 — group standings are not yet published. Set final positions for all 12 groups first.');
        setToastLink({ href: '/pickem/admin?section=group-standings', label: 'Go to Group Standings →' });
        persist = true;
        return;
      }
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
      // Keep the prerequisite toast on screen (it has an action link); otherwise
      // auto-dismiss as usual.
      if (!persist) setTimeout(() => setToast(null), 3000);
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

  // Open the in-app confirm modal (audience chooser). No native dialogs.
  const openConfirm = useCallback(() => {
    setConfirmError(null);
    setConfirmOpen(true);
  }, []);

  // Run the actual confirm using the modal's selected audience.
  const runConfirm = useCallback(async (force = false) => {
    let bodyExtra: { recipients?: string[]; scoreOnly?: boolean; force?: boolean } = {};
    if (audience === 'test') {
      const recipients = recipientsInput.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
      if (recipients.length === 0 || !recipients.every(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) {
        setConfirmError('Enter one or more valid email addresses, separated by commas.');
        return;
      }
      bodyExtra = { recipients };
    } else if (audience === 'none') {
      bodyExtra = { scoreOnly: true };
    }
    if (force) bodyExtra.force = true;

    const describe = (j: { emailMode?: string; emailRecipients?: string[] | null }) =>
      j.emailMode === 'all' ? 'emailed all users'
        : j.emailMode === 'test' ? `emailed ${j.emailRecipients?.length ?? 0} test recipient(s)`
          : 'no email sent (score only)';

    setConfirmError(null);
    setConfirming(true);
    try {
      const res = await fetch('/api/admin/playoffs/confirm-r32', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyExtra),
      });
      const json = await res.json();
      if (!res.ok) { setConfirmError(json.error ?? 'Confirm failed'); return; }
      if (json.alreadyConfirmed && !force) {
        // Surface re-run as an inline confirm step inside the same modal.
        setConfirmError('__ALREADY_CONFIRMED__');
        return;
      }
      setConfirmOpen(false);
      setToast(`R32 confirmed · scored all users · ${describe(json)}`);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : 'Confirm failed');
    } finally {
      setConfirming(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, [audience, recipientsInput]);

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
    setSaving(prev => ({ ...prev, [code]: true }));
    try {
      // Write through a server endpoint (service role) so admins granted via
      // ADMIN_EMAILS / auth metadata aren't silently blocked by the
      // playoff_matches RLS policy (which only checks user_preferences.is_admin).
      const res = await fetch('/api/admin/playoffs/set-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchCode: code,
          homeTeamId: row.homeTeamId || null,
          awayTeamId: row.awayTeamId || null,
          isLocked: row.isLocked,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(`${code}: ${json.error ?? 'save failed'}`);
        setTimeout(() => setToast(null), 3000);
        return;
      }
      if (json.id) {
        setRows(prev => ({ ...prev, [code]: { ...prev[code], id: json.id as string } }));
      }
      setSaved(prev => ({ ...prev, [code]: true }));
      setToast(`${code} saved`);
      setTimeout(() => setToast(null), 2000);
    } catch (e) {
      setToast(`${code}: ${e instanceof Error ? e.message : 'save failed'}`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(prev => ({ ...prev, [code]: false }));
    }
  }, [getRow]);

  return (
    <div className={embedded ? '' : 'min-h-screen bg-page'}>
      {loadError && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 text-[13px] font-semibold text-amber-800">
          ⚠️ {loadError}
        </div>
      )}

      {/* Header — title hidden when embedded (the console owns it); tabs stay. */}
      <div className={embedded ? '' : 'bg-white border-b border-black/[0.07]'}>
        {!embedded && (
        <div className="max-w-5xl mx-auto px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-bk-amber-dark bg-bk-amber/15 px-2 py-1 rounded-md">ADMIN</span>
            <h1 className="text-[22px] font-black tracking-tight text-navy">Bracket Setup</h1>
          </div>
          <p className="text-[13px] font-semibold text-black/45">
            Assign qualifying teams to each knockout match slot.
          </p>
        </div>
        )}

        {/* Tabs */}
        <div className={`${embedded ? '' : 'max-w-5xl mx-auto'} px-5 flex gap-0.5`}>
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

      <main className={embedded ? 'pt-5' : 'max-w-5xl mx-auto px-5 py-6'}>
        {/* Prerequisite status — read-only, non-blocking (admin can still enter
            teams manually). Data from the shared console fetch + live rows. */}
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className={`rounded-xl border px-3 py-2.5 ${stats.groupsFinalized >= 12 ? 'border-emerald-200 bg-emerald-50' : stats.groupsFinalized > 0 ? 'border-amber-200 bg-amber-50' : 'border-black/10 bg-black/[0.02]'}`}>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-black/40">Group standings</div>
            <div className={`mt-0.5 text-[13px] font-extrabold ${stats.groupsFinalized >= 12 ? 'text-emerald-700' : stats.groupsFinalized > 0 ? 'text-amber-700' : 'text-black/50'}`}>
              {stats.groupsFinalized} / 12 finalized
            </div>
          </div>
          <div className={`rounded-xl border px-3 py-2.5 ${r32Filled >= 16 ? 'border-emerald-200 bg-emerald-50' : r32Filled > 0 ? 'border-amber-200 bg-amber-50' : 'border-black/10 bg-black/[0.02]'}`}>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-black/40">R32 slots filled</div>
            <div className={`mt-0.5 text-[13px] font-extrabold ${r32Filled >= 16 ? 'text-emerald-700' : r32Filled > 0 ? 'text-amber-700' : 'text-black/50'}`}>
              {r32Filled} / 16
            </div>
          </div>
          <div className={`rounded-xl border px-3 py-2.5 ${tState.r32ConfirmedAt ? 'border-emerald-200 bg-emerald-50' : 'border-black/10 bg-black/[0.02]'}`}>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-black/40">Confirm R32</div>
            <div className={`mt-0.5 text-[13px] font-extrabold ${tState.r32ConfirmedAt ? 'text-emerald-700' : 'text-black/50'}`}>
              {tState.r32ConfirmedAt
                ? `Confirmed ${new Date(tState.r32ConfirmedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
                : 'Not yet confirmed'}
            </div>
          </div>
        </div>
        {activeTab === 'R32' && (
          <div ref={r32BarRef} className={`flex items-center gap-3 mb-5 p-4 bg-white rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all ${highlightConfirm ? 'border-emerald-400 ring-2 ring-emerald-300 animate-pulse' : 'border-black/[0.08]'}`}>
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
            <button
              onClick={openConfirm}
              disabled={confirming || bulkLoading || bulkClearing}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold transition disabled:opacity-50 whitespace-nowrap"
              title="Score every user's R32 projection against these real pairs, then choose who gets the email. Run once."
            >
              {confirming && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
              Confirm R32 Bracket
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
                    <span className="text-[11px] font-extrabold tracking-widest text-navy/60 bg-navy/[0.07] px-2 py-1 rounded">
                      {OFFICIAL_MATCH_NUMBER[code] ? `MATCH ${OFFICIAL_MATCH_NUMBER[code]}` : code}
                    </span>
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

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-[460px] rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-[15px] font-extrabold text-navy">Confirm R32 Bracket</h3>
            <p className="mt-1 text-[12.5px] font-semibold text-black/50">
              Scoring runs for every user. Choose who receives the Group Stage Complete email.
            </p>

            <div className="mt-4 space-y-2">
              {([
                { id: 'all', title: 'Email everyone', sub: 'Go live — all registered users (except opt-outs).' },
                { id: 'test', title: 'Test recipients only', sub: 'Send to specific addresses (you + admins).' },
                { id: 'none', title: 'Score only', sub: 'Run scoring, send no email.' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setAudience(opt.id); setConfirmError(null); }}
                  className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition ${audience === opt.id ? 'border-bk-blue bg-bk-blue/[0.06]' : 'border-black/10 hover:bg-black/[0.02]'}`}
                >
                  <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${audience === opt.id ? 'border-bk-blue bg-bk-blue' : 'border-black/25'}`} />
                  <span>
                    <span className="block text-[13px] font-bold text-navy">{opt.title}</span>
                    <span className="block text-[12px] font-semibold text-black/45">{opt.sub}</span>
                  </span>
                </button>
              ))}
            </div>

            {audience === 'test' && (
              <div className="mt-3">
                <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-black/45 mb-1">Recipient emails</label>
                <input
                  value={recipientsInput}
                  onChange={e => { setRecipientsInput(e.target.value); setConfirmError(null); }}
                  placeholder="you@example.com, dev@example.com"
                  className="h-10 w-full rounded-lg border border-black/15 px-3 text-[13px] font-semibold text-slate-800"
                  autoFocus
                />
                <p className="mt-1 text-[11.5px] font-semibold text-black/40">Comma-separated. Must be real accounts to receive the personalized email.</p>
              </div>
            )}

            {confirmError && confirmError !== '__ALREADY_CONFIRMED__' && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{confirmError}</div>
            )}

            {confirmError === '__ALREADY_CONFIRMED__' ? (
              <div className="mt-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
                  R32 was already confirmed. Re-run scoring and re-send the email with this audience?
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button type="button" onClick={() => setConfirmOpen(false)} disabled={confirming} className="h-10 flex-1 rounded-lg border border-black/15 text-[13px] font-bold text-slate-700 disabled:opacity-50">Cancel</button>
                  <button type="button" onClick={() => void runConfirm(true)} disabled={confirming} className="h-10 flex-1 rounded-lg bg-amber-500 text-[13px] font-bold text-white disabled:opacity-50 inline-flex items-center justify-center gap-2">
                    {confirming && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                    Re-run &amp; re-send
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-2">
                <button type="button" onClick={() => setConfirmOpen(false)} disabled={confirming} className="h-10 flex-1 rounded-lg border border-black/15 text-[13px] font-bold text-slate-700 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => void runConfirm(false)} disabled={confirming} className="h-10 flex-1 rounded-lg bg-emerald-600 text-[13px] font-bold text-white disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {confirming && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                  {audience === 'none' ? 'Score only' : audience === 'test' ? 'Score & send test' : 'Score & email everyone'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 inset-x-0 flex justify-center px-4 z-50 ${toastLink ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className="bg-navy text-white text-[13px] font-semibold px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 max-w-[92vw]">
            <span className="flex items-center gap-2.5">
              <CheckIcon className="w-4 h-4 shrink-0 text-emerald-400" />
              {toast}
            </span>
            {toastLink && (
              <>
                <a href={toastLink.href} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-bold transition hover:bg-white/25">
                  {toastLink.label}
                </a>
                <button
                  type="button"
                  onClick={() => { setToast(null); setToastLink(null); }}
                  aria-label="Dismiss"
                  className="shrink-0 text-white/55 transition hover:text-white"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
