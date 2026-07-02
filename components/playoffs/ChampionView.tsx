'use client';

/* =============================================================================
 * World Champion prediction — pick the team you think lifts the trophy (+6 pts).
 * Four states (see useChampionPrediction): pick / saved / locked / result.
 * ===========================================================================*/
import { useMemo, useState } from 'react';
import { useChampionPrediction, type ChampionTeam } from '@/lib/hooks/useChampionPrediction';
import { FlagImage } from '@/components/FlagImage';
import { flagCdnCodeFor, flagFor } from '@/lib/playoffs/flags';
import { WORLD_CHAMPION_POINTS } from '@/lib/playoffs/scoring-constants';
import { PointsBreakdownTooltip } from '@/components/playoffs/PointsBreakdownTooltip';

function Flag({ shortName, size = 22 }: { shortName: string; size?: number }) {
  return <FlagImage countryCode={flagCdnCodeFor(shortName)} emoji={flagFor(shortName)} size={size} alt={shortName} />;
}

function fmtRiga(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Riga', timeZoneName: 'short',
  });
}

function TrophyBadge() {
  return (
    <div className="mx-auto flex flex-col items-center gap-1">
      <span className="text-[40px] leading-none">🏆</span>
      <span className="inline-flex items-center rounded-full bg-bk-amber/15 px-3 py-1 text-[15px] font-black text-bk-amber-dark">
        +{WORLD_CHAMPION_POINTS} pts
      </span>
    </div>
  );
}

export function ChampionView({ embedded = false }: { embedded?: boolean }) {
  const { data, loading, error, saving, isLocked, savePrediction } = useChampionPrediction();
  const [selecting, setSelecting] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string | null>(null);

  const teamById = useMemo(() => {
    const m = new Map<string, ChampionTeam>();
    for (const t of data?.teams ?? []) m.set(t.id, t);
    return m;
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const teams = [...(data?.teams ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    return q ? teams.filter(t => t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q)) : teams;
  }, [data, query]);

  if (loading) {
    return (
      <div className={`${embedded ? 'min-h-[360px]' : 'min-h-screen'} bg-page flex items-center justify-center`}>
        <div className="w-8 h-8 rounded-full border-2 border-bk-blue/30 border-t-bk-blue animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className={`${embedded ? 'min-h-[360px]' : 'min-h-screen'} bg-page flex items-center justify-center`}>
        <p className="text-red-600 font-semibold">{error ?? 'Failed to load.'}</p>
      </div>
    );
  }

  const pickedId = data.prediction?.predictedTeamId ?? null;
  const picked = pickedId ? teamById.get(pickedId) ?? null : null;
  const champion = data.championTeamId ? teamById.get(data.championTeamId) ?? null : null;
  const wrap = embedded ? '' : 'min-h-screen';

  // ── STATE 4 — Final played, result known ──
  if (data.finalPlayed) {
    const correct = pickedId !== null && pickedId === data.championTeamId;
    return (
      <div className={`${wrap} bg-page`}>
        <div className="max-w-[640px] mx-auto px-4 py-8">
          <div className="rounded-2xl border border-black/[0.08] bg-white p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {correct ? (
              <>
                <PointsBreakdownTooltip lines={[{ ok: true, label: 'Correct champion' }]} total={WORLD_CHAMPION_POINTS}>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-[15px] font-black text-emerald-700">
                    🏆 Correct! +{WORLD_CHAMPION_POINTS} pts
                  </div>
                </PointsBreakdownTooltip>
                {picked && (
                  <div className="mt-5 flex items-center justify-center gap-3">
                    <Flag shortName={picked.shortName} size={34} />
                    <span className="text-[22px] font-black text-navy">{picked.name}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <PointsBreakdownTooltip lines={[{ ok: false, label: 'Champion missed' }]} total={0}>
                  <div className="rounded-xl bg-black/[0.04] px-4 py-3 text-[14px] font-bold text-black/55">Missed — +0 pts</div>
                </PointsBreakdownTooltip>
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-black/35 mb-1.5">Your pick</div>
                    {picked ? (
                      <div className="flex items-center justify-center gap-2 opacity-60">
                        <Flag shortName={picked.shortName} size={26} />
                        <span className="text-[16px] font-bold text-black/55 line-through">{picked.name}</span>
                      </div>
                    ) : <span className="text-[14px] font-semibold text-black/40">No pick made</span>}
                  </div>
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-600 mb-1.5">World Champion</div>
                    {champion && (
                      <div className="flex items-center justify-center gap-2">
                        <Flag shortName={champion.shortName} size={26} />
                        <span className="text-[16px] font-black text-emerald-700">{champion.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── STATE 3 — Locked, tournament ongoing ──
  if (isLocked) {
    return (
      <div className={`${wrap} bg-page`}>
        <div className="max-w-[640px] mx-auto px-4 py-8">
          <div className="rounded-2xl border border-black/[0.08] bg-white p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div className="inline-flex items-center gap-2 text-[13px] font-bold text-black/50">
              <span className="text-[16px]">🔒</span> Picks are locked
            </div>
            <div className="mt-5">
              {picked ? (
                <div className="flex items-center justify-center gap-3">
                  <Flag shortName={picked.shortName} size={32} />
                  <span className="text-[20px] font-black text-navy">{picked.name}</span>
                </div>
              ) : <span className="text-[14px] font-semibold text-black/40">You didn&apos;t pick a champion</span>}
            </div>
            <div className="mt-4 inline-flex items-center rounded-full bg-black/[0.05] px-3 py-1 text-[12.5px] font-bold text-black/45">
              {WORLD_CHAMPION_POINTS} pts pending
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STATE 2 — saved, not locked, not changing ──
  if (picked && !selecting) {
    return (
      <div className={`${wrap} bg-page`}>
        <div className="max-w-[640px] mx-auto px-4 py-8">
          <div className="rounded-2xl border border-black/[0.08] bg-white p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-bk-amber-dark">Your World Champion</div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Flag shortName={picked.shortName} size={40} />
              <span className="text-[24px] font-black text-navy">{picked.name}</span>
            </div>
            <div className="mt-3 inline-flex items-center rounded-full bg-bk-amber/15 px-3 py-1 text-[13px] font-black text-bk-amber-dark">
              +{WORLD_CHAMPION_POINTS} pts if correct
            </div>
            <div className="mt-5">
              <button
                onClick={() => { setDraft(pickedId); setSelecting(true); }}
                className="h-9 px-4 rounded-lg border border-black/15 bg-white text-[13px] font-bold text-navy hover:bg-black/[0.03] transition"
              >
                Change Pick
              </button>
            </div>
            {data.deadline && (
              <p className="mt-3 text-[12px] font-semibold text-black/40">Predictions close {fmtRiga(data.deadline)}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── STATE 1 — selector (no pick yet, or changing) ──
  const selected = draft ?? pickedId;
  const selectedTeam = selected ? teamById.get(selected) ?? null : null;
  return (
    <div className={`${wrap} bg-page`}>
      <div className="max-w-[760px] mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-[22px] font-black text-navy">Pick the World Champion</h1>
          <p className="mt-1 text-[14px] font-medium text-black/45">
            Who will lift the trophy? Pick correctly and earn {WORLD_CHAMPION_POINTS} bonus points.
          </p>
          <div className="mt-4"><TrophyBadge /></div>
        </div>

        <div className="mt-6">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search teams…"
            className="h-10 w-full rounded-lg border-2 border-black/12 px-3 text-[14px] font-semibold text-navy outline-none focus:border-bk-blue"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {filtered.map(t => {
            const isSel = selected === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setDraft(t.id)}
                className={`relative flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left transition ${
                  isSel ? 'border-bk-blue ring-2 ring-bk-blue/20' : 'border-black/10 hover:border-black/20'
                }`}
              >
                <Flag shortName={t.shortName} size={22} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-navy">{t.name}</span>
                {isSel && (
                  <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-bk-blue flex items-center justify-center text-white text-[11px] font-black">✓</span>
                )}
              </button>
            );
          })}
        </div>

        {selectedTeam && (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-black/[0.08] bg-white p-5 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-[14px] font-semibold text-black/60">
              You&apos;ve picked <span className="font-black text-navy">{selectedTeam.name}</span> as World Champion
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void savePrediction(selectedTeam.id)}
                disabled={saving}
                className="h-10 px-5 rounded-lg bg-bk-blue hover:bg-bk-blue-dark text-white text-[13px] font-extrabold transition disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Pick'}
              </button>
              {picked && (
                <button
                  onClick={() => { setSelecting(false); setDraft(null); }}
                  className="h-10 px-4 rounded-lg border border-black/15 bg-white text-[13px] font-bold text-navy hover:bg-black/[0.03] transition"
                >
                  Cancel
                </button>
              )}
            </div>
            {data.deadline && (
              <p className="text-[12px] font-semibold text-black/40">Predictions close {fmtRiga(data.deadline)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
