"use client";

import { useEffect, useMemo, useState } from "react";
import type { PickemCompetition, PickemMatch, PickemTeam } from "@/lib/pickem-shared";

type AdminPayload = {
  competition: PickemCompetition;
  teams: PickemTeam[];
  matches: PickemMatch[];
  isDeveloper: boolean;
};

type EditState = Record<string, { home: string; away: string; status: string }>;

const ADMIN_API_CANDIDATES = ["/pickem/api/admin/matches", "/api/pickem/admin/matches"];

function fmtKickoff(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Riga",
    timeZoneName: "short",
  });
}

export function PickemAdminClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AdminPayload | null>(null);
  const [edits, setEdits] = useState<EditState>({});

  async function fetchAdminApi(
    init?: RequestInit,
  ): Promise<{ res: Response; json: any }> {
    let lastJson: any = {};
    let lastRes: Response | null = null;
    for (const url of ADMIN_API_CANDIDATES) {
      const res = await fetch(url, init);
      const json = await res.json().catch(() => ({}));
      if (res.ok) return { res, json };
      lastRes = res;
      lastJson = json;
      if (res.status !== 404) break;
    }
    if (!lastRes) {
      throw new Error("Failed to reach admin API.");
    }
    throw new Error(lastJson.error || `Failed to load admin data (${lastRes.status}).`);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { json } = await fetchAdminApi({ cache: "no-store" });
      setPayload(json as AdminPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const teamById = useMemo(() => {
    const map = new Map<string, PickemTeam>();
    for (const team of payload?.teams || []) map.set(team.id, team);
    return map;
  }, [payload]);

  const matches = useMemo(
    () =>
      [...(payload?.matches || [])].sort(
        (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime(),
      ),
    [payload],
  );

  async function saveMatch(match: PickemMatch) {
    const edit = edits[match.id];
    if (!edit) return;
    const homeScore = edit.home === "" ? null : Number(edit.home);
    const awayScore = edit.away === "" ? null : Number(edit.away);
    setSaving(match.id);
    setError(null);
    try {
      const { json } = await fetchAdminApi({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          homeScore,
          awayScore,
          status: edit.status || undefined,
        }),
      });
      setPayload((prev) => (prev ? { ...prev, matches: (json.matches || prev.matches) as PickemMatch[] } : prev));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save match update.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-black/10 bg-white p-6">Loading Pickem admin...</div>;
  }

  if (!payload) {
    return <div className="rounded-xl border border-red-200 bg-white p-6 text-sm font-semibold text-red-700">{error || "No data."}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-black/10 bg-white p-5">
        <h1 className="text-2xl font-black text-slate-900">Pickem Admin</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Manual score updates for {payload.competition.name}. Saving a match recalculates all user points.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-black/10 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">Kickoff</th>
              <th className="px-3 py-2">Group</th>
              <th className="px-3 py-2">Home</th>
              <th className="px-3 py-2">Away</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const home = teamById.get(match.homeTeamId);
              const away = teamById.get(match.awayTeamId);
              const edit = edits[match.id] || {
                home: match.homeScore === null ? "" : String(match.homeScore),
                away: match.awayScore === null ? "" : String(match.awayScore),
                status: match.status || "scheduled",
              };
              return (
                <tr key={match.id} className="border-b border-black/5 last:border-none">
                  <td className="px-3 py-2 text-sm font-semibold text-slate-600">{fmtKickoff(match.kickoffAt)}</td>
                  <td className="px-3 py-2 text-sm font-bold text-slate-700">{match.groupCode || "-"}</td>
                  <td className="px-3 py-2 text-sm font-bold text-slate-900">{home?.name || "Home"}</td>
                  <td className="px-3 py-2 text-sm font-bold text-slate-900">{away?.name || "Away"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={edit.status}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [match.id]: { ...edit, status: e.target.value },
                        }))
                      }
                      className="rounded-md border border-black/15 px-2 py-1 text-sm"
                    >
                      <option value="scheduled">scheduled</option>
                      <option value="live">live</option>
                      <option value="finished">finished</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={edit.home}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [match.id]: { ...edit, home: String(e.target.value).replace(/[^0-9]/g, "").slice(0, 2) },
                          }))
                        }
                        className="h-9 w-12 rounded-md border border-black/15 text-center text-sm font-bold"
                        inputMode="numeric"
                      />
                      <span className="text-slate-400">-</span>
                      <input
                        value={edit.away}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [match.id]: { ...edit, away: String(e.target.value).replace(/[^0-9]/g, "").slice(0, 2) },
                          }))
                        }
                        className="h-9 w-12 rounded-md border border-black/15 text-center text-sm font-bold"
                        inputMode="numeric"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        void saveMatch(match);
                      }}
                      disabled={saving === match.id}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {saving === match.id ? "Saving..." : "Save + Recompute"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

