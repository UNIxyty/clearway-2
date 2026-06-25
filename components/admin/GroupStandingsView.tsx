'use client';

/* =============================================================================
 * GroupStandingsView — drag-to-sort final group positions (pickem_group_results).
 *
 * Extracted verbatim from the "Group Standings" tab of the legacy
 * app/pickem/admin/admin-page-client.tsx so it can mount inside the unified
 * Admin Console (?section=group-standings). All data fetching, mutations and
 * business logic are unchanged — only the surrounding chrome differs via the
 * `embedded` prop. Endpoints: GET/PATCH /api/pickem/admin/groups (+ preview).
 * ===========================================================================*/
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PickemCompetition, PickemGroup, PickemTeam } from '@/lib/pickem-shared';
import { GroupSortable } from '@/components/pickem/GroupSortable';

type GroupPreview = { points: number; correctPlacements: number } | 'loading';
type GroupResultRow = { groupCode: string; teamId: string; finalPosition: number };
type GroupsPayload = {
  competition: PickemCompetition;
  groups: PickemGroup[];
  teams: PickemTeam[];
  groupResults: GroupResultRow[];
};

const GROUP_API_URL = '/api/pickem/admin/groups';

async function fetchGroupApi(init?: RequestInit): Promise<{ res: Response; json: Record<string, unknown> }> {
  const res = await fetch(GROUP_API_URL, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { res, json };
  throw new Error((json.error as string) || `Failed to load group standings (${res.status}).`);
}

export function GroupStandingsView({ embedded = false }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [groupsPayload, setGroupsPayload] = useState<GroupsPayload | null>(null);
  const [groupOrders, setGroupOrders] = useState<Record<string, string[]>>({});
  const [groupPreview, setGroupPreview] = useState<Record<string, GroupPreview>>({});
  const previewTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const { json } = await fetchGroupApi({ cache: 'no-store' });
        const nextPayload = json as unknown as GroupsPayload;
        setGroupsPayload(nextPayload);
        setGroupOrders(() => {
          const grouped = new Map<string, PickemTeam[]>();
          for (const team of nextPayload.teams || []) {
            const arr = grouped.get(team.groupCode) || [];
            arr.push(team);
            grouped.set(team.groupCode, arr);
          }
          for (const arr of grouped.values()) {
            arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
          }

          const resultByGroup = new Map<string, GroupResultRow[]>();
          for (const row of nextPayload.groupResults || []) {
            const arr = resultByGroup.get(row.groupCode) || [];
            arr.push(row);
            resultByGroup.set(row.groupCode, arr);
          }
          const orders: Record<string, string[]> = {};
          for (const group of nextPayload.groups || []) {
            const resultRows = (resultByGroup.get(group.code) || []).sort(
              (a, b) => a.finalPosition - b.finalPosition,
            );
            const orderedFromResult = resultRows.map((row) => row.teamId);
            const fallback = (grouped.get(group.code) || []).map((team) => team.id);
            orders[group.code] = orderedFromResult.length === 4 ? orderedFromResult : fallback;
          }
          return orders;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load group standings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function flash(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }

  async function publishGroup(groupCode: string) {
    if (!groupsPayload) return;
    const orderTeamIds = groupOrders[groupCode] || [];
    if (orderTeamIds.length !== 4) {
      setError(`Group ${groupCode} must contain 4 teams.`);
      return;
    }
    setSaving(`group:${groupCode}`);
    setError(null);
    try {
      const { json } = await fetchGroupApi({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupCode, orderTeamIds }),
      });
      setGroupsPayload((prev) =>
        prev ? { ...prev, groupResults: ((json.groupResults as GroupResultRow[]) || prev.groupResults) } : prev,
      );
      flash(`Published Group ${groupCode} and recomputed leaderboard points.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to publish Group ${groupCode}.`);
    } finally {
      setSaving(null);
    }
  }

  async function unpublishGroup(groupCode: string) {
    setSaving(`group:${groupCode}:clear`);
    setError(null);
    try {
      const { json } = await fetchGroupApi({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupCode, clear: true }),
      });
      setGroupsPayload((prev) =>
        prev ? { ...prev, groupResults: ((json.groupResults as GroupResultRow[]) || prev.groupResults) } : prev,
      );
      flash(`Cleared Group ${groupCode} standings and recomputed points.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to clear Group ${groupCode}.`);
    } finally {
      setSaving(null);
    }
  }

  // Debounced dry-run preview: how many group-position points the current
  // (unsaved) order would award. Writes nothing until the admin Publishes.
  function previewGroup(groupCode: string, orderTeamIds: string[]) {
    if (orderTeamIds.length !== 4) return;
    if (previewTimers.current[groupCode]) clearTimeout(previewTimers.current[groupCode]);
    setGroupPreview((prev) => ({ ...prev, [groupCode]: 'loading' }));
    previewTimers.current[groupCode] = setTimeout(() => {
      fetch('/api/pickem/admin/groups/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupCode, orderTeamIds }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (j && j.ok) setGroupPreview((prev) => ({ ...prev, [groupCode]: { points: j.points, correctPlacements: j.correctPlacements } }));
          else setGroupPreview((prev) => { const n = { ...prev }; delete n[groupCode]; return n; });
        })
        .catch(() => setGroupPreview((prev) => { const n = { ...prev }; delete n[groupCode]; return n; }));
    }, 250);
  }

  // Drag-sort commit: set the new order + refresh the preview.
  function commitGroupOrder(groupCode: string, orderedIds: string[]) {
    setGroupOrders((prev) => ({ ...prev, [groupCode]: orderedIds }));
    previewGroup(groupCode, orderedIds);
  }

  const groupTeamsByCode = useMemo(() => {
    const map = new Map<string, PickemTeam[]>();
    for (const team of groupsPayload?.teams || []) {
      const arr = map.get(team.groupCode) || [];
      arr.push(team);
      map.set(team.groupCode, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    return map;
  }, [groupsPayload]);

  const groupResultCountByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of groupsPayload?.groupResults || []) {
      map.set(row.groupCode, (map.get(row.groupCode) || 0) + 1);
    }
    return map;
  }, [groupsPayload]);

  const totalGroups = groupsPayload?.groups.length ?? 12;
  const finalizedGroups = (groupsPayload?.groups || []).filter(
    (g) => (groupResultCountByCode.get(g.code) || 0) === 4,
  ).length;

  if (loading) {
    return <div className="rounded-xl border border-black/10 bg-white p-6">Loading group standings...</div>;
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Group Standings</h1>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Publish-progress reminder — finalize all groups before Confirm R32. */}
      {groupsPayload && finalizedGroups >= totalGroups ? (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-[13px] font-bold text-emerald-700">All {totalGroups} groups finalized ✓</span>
          <a href="/pickem/admin?section=bracket-setup" className="shrink-0 text-[12.5px] font-bold text-emerald-700 hover:underline">
            Go to Bracket Setup →
          </a>
        </div>
      ) : finalizedGroups > 0 ? (
        <div className="sticky top-0 z-10 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-800">
          {finalizedGroups} of {totalGroups} groups have final positions set. Set all {totalGroups} before confirming the R32 bracket.
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(groupsPayload?.groups || []).map((group) => {
          const teamOrder = groupOrders[group.code] || (groupTeamsByCode.get(group.code) || []).map((t) => t.id);
          const teamObjs = teamOrder
            .map((teamId) => groupsPayload?.teams.find((team) => team.id === teamId))
            .filter((team): team is PickemTeam => Boolean(team));
          const isPublished = (groupResultCountByCode.get(group.code) || 0) === 4;
          return (
            <article key={group.code} className="rounded-2xl border border-black/[0.08] bg-slate-900 p-4 text-white">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-extrabold tracking-[0.14em]">GROUP {group.code}</h2>
                <span
                  className={`rounded px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] ${
                    isPublished ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60'
                  }`}
                >
                  {isPublished ? 'FINAL' : 'DRAFT'}
                </span>
              </div>
              <GroupSortable
                items={teamObjs.map((t) => ({ id: t.id, name: t.name, shortName: t.shortName }))}
                onCommit={(ids) => commitGroupOrder(group.code, ids)}
                disabled={isPublished}
              />
              {!isPublished && (() => {
                const pv = groupPreview[group.code];
                return (
                  <div className="mt-2 flex items-center justify-between text-[11.5px] font-semibold text-white/55">
                    <span>
                      {pv === 'loading'
                        ? 'Calculating…'
                        : pv
                          ? `${pv.correctPlacements} correct placement${pv.correctPlacements === 1 ? '' : 's'}`
                          : 'Drag to set the finishing order — preview updates on change'}
                    </span>
                    {pv && pv !== 'loading' && (
                      <span className="text-emerald-300 font-extrabold tabular-nums">≈ +{pv.points} pts to distribute</span>
                    )}
                  </div>
                );
              })()}
              <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={() => void publishGroup(group.code)}
                  disabled={saving === `group:${group.code}`}
                  className="h-9 flex-1 rounded-lg bg-blue-600 text-xs font-bold text-white disabled:opacity-50"
                >
                  {saving === `group:${group.code}` ? 'Publishing...' : 'Publish Standings'}
                </button>
                <button
                  type="button"
                  onClick={() => void unpublishGroup(group.code)}
                  disabled={saving === `group:${group.code}:clear`}
                  className="h-9 rounded-lg border border-white/25 px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {saving === `group:${group.code}:clear` ? 'Clearing...' : 'Clear'}
                </button>
              </div>
            </article>
          );
        })}
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
