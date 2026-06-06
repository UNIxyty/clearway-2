"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  PickemCompetition,
  PickemGroup,
  PickemGroupPrediction,
  PickemLeaderboardRow,
  PickemMatch,
  PickemMatchPrediction,
  PickemTeam,
} from "@/lib/pickem-shared";

type BootstrapPayload = {
  competition: PickemCompetition;
  groups: PickemGroup[];
  teams: PickemTeam[];
  matches: PickemMatch[];
  userPredictions: {
    groupPredictions: PickemGroupPrediction[];
    matchPredictions: PickemMatchPrediction[];
    submission: { submittedAt: string } | null;
  };
};

type LeaderboardPayload = {
  viewerSubmitted: boolean;
  rows: PickemLeaderboardRow[];
};

function fmtDate(value: string) {
  return new Date(value).toLocaleString();
}

function outcomeLabel(home: number, away: number): "Home" | "Away" | "Draw" {
  if (home === away) return "Draw";
  return home > away ? "Home" : "Away";
}

export function PickemApp() {
  const [activeTab, setActiveTab] = useState<"groups" | "matches" | "leaderboard">("groups");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload>({ viewerSubmitted: false, rows: [] });
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingMatch, setSavingMatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PickemLeaderboardRow | null>(null);
  const [selectedUserPredictions, setSelectedUserPredictions] = useState<{
    groupPredictions: PickemGroupPrediction[];
    matchPredictions: PickemMatchPrediction[];
  } | null>(null);
  const [groupOrder, setGroupOrder] = useState<Record<string, string[]>>({});
  const [matchScores, setMatchScores] = useState<Record<string, { home: number; away: number }>>({});

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [bootstrapRes, leaderboardRes] = await Promise.all([
        fetch("/pickem/api/bootstrap", { cache: "no-store" }),
        fetch("/pickem/api/leaderboard", { cache: "no-store" }),
      ]);
      const bootstrapJson = await bootstrapRes.json();
      const leaderboardJson = await leaderboardRes.json();
      if (!bootstrapRes.ok) throw new Error(bootstrapJson.error || "Failed to load pickem.");
      if (!leaderboardRes.ok) throw new Error(leaderboardJson.error || "Failed to load leaderboard.");
      const payload = bootstrapJson as BootstrapPayload;
      setData(payload);
      setLeaderboard(leaderboardJson as LeaderboardPayload);

      const teamByGroup = new Map<string, string[]>();
      for (const group of payload.groups) {
        teamByGroup.set(group.code, payload.teams.filter((t) => t.groupCode === group.code).map((t) => t.id));
      }
      for (const p of payload.userPredictions.groupPredictions) {
        const current = teamByGroup.get(p.groupCode) || [];
        const filtered = current.filter((teamId) => teamId !== p.teamId);
        filtered.splice(Math.max(0, p.predictedPosition - 1), 0, p.teamId);
        teamByGroup.set(p.groupCode, filtered);
      }
      setGroupOrder(Object.fromEntries(teamByGroup.entries()));

      const scoreMap: Record<string, { home: number; away: number }> = {};
      for (const p of payload.userPredictions.matchPredictions) {
        scoreMap[p.matchId] = { home: p.predictedHomeScore, away: p.predictedAwayScore };
      }
      setMatchScores(scoreMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown pickem error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const teamsById = useMemo(() => {
    const map = new Map<string, PickemTeam>();
    for (const team of data?.teams || []) map.set(team.id, team);
    return map;
  }, [data]);

  const nowTs = Date.now();
  const groupLocked = data ? nowTs >= new Date(data.competition.groupLockAt).getTime() : false;
  const groupMatches = useMemo(
    () => (data?.matches || []).filter((m) => m.stage === "group").sort((a, b) => +new Date(a.kickoffAt) - +new Date(b.kickoffAt)),
    [data],
  );
  const groupsComplete = useMemo(() => {
    if (!data) return false;
    return data.groups.every((g) => {
      const groupTeams = data.teams.filter((t) => t.groupCode === g.code);
      const ordered = groupOrder[g.code] || [];
      return groupTeams.length > 0 && ordered.length === groupTeams.length;
    });
  }, [data, groupOrder]);

  const matchesComplete = useMemo(() => {
    return groupMatches.every((m) => {
      const score = matchScores[m.id];
      return !!score && Number.isInteger(score.home) && Number.isInteger(score.away);
    });
  }, [groupMatches, matchScores]);

  const viewerSubmitted = Boolean(data?.userPredictions.submission?.submittedAt);

  async function saveGroupPredictions() {
    if (!data) return;
    setSavingGroup(true);
    setError(null);
    try {
      const rows = data.groups.flatMap((group) =>
        (groupOrder[group.code] || []).map((teamId, idx) => ({
          groupCode: group.code,
          teamId,
          predictedPosition: idx + 1,
        })),
      );
      const res = await fetch("/pickem/api/predictions/group", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save group predictions");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save group predictions");
    } finally {
      setSavingGroup(false);
    }
  }

  async function saveMatchPredictions() {
    setSavingMatch(true);
    setError(null);
    try {
      const rows = Object.entries(matchScores).map(([matchId, score]) => ({
        matchId,
        predictedHomeScore: score.home,
        predictedAwayScore: score.away,
      }));
      const res = await fetch("/pickem/api/predictions/match", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save match predictions");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save match predictions");
    } finally {
      setSavingMatch(false);
    }
  }

  async function submitAll() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/pickem/api/submit", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Submission failed");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  function moveTeam(groupCode: string, fromIdx: number, toIdx: number) {
    setGroupOrder((prev) => {
      const current = [...(prev[groupCode] || [])];
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= current.length || toIdx >= current.length) return prev;
      const [entry] = current.splice(fromIdx, 1);
      current.splice(toIdx, 0, entry);
      return { ...prev, [groupCode]: current };
    });
  }

  async function viewUserPredictions(row: PickemLeaderboardRow) {
    setSelectedUser(row);
    setSelectedUserPredictions(null);
    const res = await fetch(`/pickem/api/users/${row.userId}/predictions`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Unable to view predictions");
      return;
    }
    setSelectedUserPredictions(json);
  }

  if (loading) return <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">Loading Pickem...</div>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-100">
        {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/40 p-4 shadow-lg shadow-cyan-900/20 transition-all duration-300">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">FIFA 2026 Pickem</h1>
            <p className="text-sm text-slate-300">
              Lock for groups: <span className="text-cyan-300">{fmtDate(data.competition.groupLockAt)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-3 py-1 ${groupsComplete ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-100"}`}>
              Groups {groupsComplete ? "complete" : "incomplete"}
            </span>
            <span className={`rounded-full px-3 py-1 ${matchesComplete ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-100"}`}>
              Matches {matchesComplete ? "complete" : "incomplete"}
            </span>
            <span className={`rounded-full px-3 py-1 ${viewerSubmitted ? "bg-cyan-500/20 text-cyan-100" : "bg-slate-500/20 text-slate-100"}`}>
              {viewerSubmitted ? "Submitted" : "Draft"}
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["groups", "matches", "leaderboard"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-2 text-sm capitalize transition-all duration-200 ${
                activeTab === tab
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "groups" && (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/30 p-4 transition-all duration-300">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Group Positions (2 points each exact place)</h2>
            <button
              type="button"
              disabled={groupLocked || savingGroup}
              onClick={saveGroupPredictions}
              className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingGroup ? "Saving..." : groupLocked ? "Locked" : "Save Groups"}
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.groups.map((group) => {
              const ordered = groupOrder[group.code] || [];
              return (
                <article key={group.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                  <div className="mb-2 text-sm font-semibold text-cyan-200">{group.name}</div>
                  <div className="space-y-2">
                    {ordered.map((teamId, idx) => {
                      const team = teamsById.get(teamId);
                      return (
                        <div
                          key={teamId}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-800/70 px-2 py-1.5 text-sm transition-all duration-150 hover:border-cyan-400/50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-xs text-cyan-200">{idx + 1}</span>
                            <span className="text-slate-100">{team?.shortName || team?.name || "Unknown"}</span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={groupLocked || idx === 0}
                              onClick={() => moveTeam(group.code, idx, idx - 1)}
                              className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={groupLocked || idx === ordered.length - 1}
                              onClick={() => moveTeam(group.code, idx, idx + 1)}
                              className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "matches" && (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/30 p-4 transition-all duration-300">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Group Matches (+1 result, +3 exact score)</h2>
            <button
              type="button"
              disabled={savingMatch}
              onClick={saveMatchPredictions}
              className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:opacity-40"
            >
              {savingMatch ? "Saving..." : "Save Matches"}
            </button>
          </div>
          <div className="space-y-3">
            {groupMatches.map((match) => {
              const locked = new Date(match.kickoffAt).getTime() <= nowTs;
              const home = teamsById.get(match.homeTeamId);
              const away = teamsById.get(match.awayTeamId);
              const prediction = matchScores[match.id];
              return (
                <div
                  key={match.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-3 transition-all duration-150 hover:border-cyan-400/40"
                >
                  <div className="min-w-64 flex-1">
                    <div className="text-sm text-slate-100">
                      {home?.shortName || home?.name} vs {away?.shortName || away?.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {match.groupCode ? `Group ${match.groupCode}` : "Knockout"} · {fmtDate(match.kickoffAt)}
                    </div>
                    {match.homeScore !== null && match.awayScore !== null && (
                      <div className="mt-1 text-xs text-emerald-200">
                        Final: {match.homeScore}-{match.awayScore}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      disabled={locked}
                      value={prediction?.home ?? ""}
                      onChange={(e) =>
                        setMatchScores((prev) => ({
                          ...prev,
                          [match.id]: { home: Number(e.target.value), away: prev[match.id]?.away ?? 0 },
                        }))
                      }
                      className="h-9 w-16 rounded border border-white/10 bg-slate-800 px-2 text-center text-slate-100"
                    />
                    <span className="text-slate-300">-</span>
                    <input
                      type="number"
                      min={0}
                      disabled={locked}
                      value={prediction?.away ?? ""}
                      onChange={(e) =>
                        setMatchScores((prev) => ({
                          ...prev,
                          [match.id]: { home: prev[match.id]?.home ?? 0, away: Number(e.target.value) },
                        }))
                      }
                      className="h-9 w-16 rounded border border-white/10 bg-slate-800 px-2 text-center text-slate-100"
                    />
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${locked ? "bg-rose-500/20 text-rose-200" : "bg-cyan-500/20 text-cyan-100"}`}
                    >
                      {locked ? "Locked" : "Open"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "leaderboard" && (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/30 p-4 transition-all duration-300">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Leaderboard (Top 3 win prizes)</h2>
            {!leaderboard.viewerSubmitted && (
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-100">
                Submit your picks to unlock other users&apos; predictions
              </span>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/80 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Rank</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-right">Points</th>
                  <th className="px-3 py-2 text-right">Picks</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.rows.map((row) => (
                  <tr key={row.userId} className="border-t border-white/5 bg-slate-900/60 text-slate-100">
                    <td className="px-3 py-2">{row.rank}</td>
                    <td className="px-3 py-2">{row.displayName}</td>
                    <td className="px-3 py-2 text-right font-semibold text-cyan-200">{row.points}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => viewUserPredictions(row)}
                        className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {!leaderboard.rows.length && (
                  <tr>
                    <td className="px-3 py-4 text-slate-400" colSpan={4}>
                      No points yet. Scores appear automatically after results sync.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedUser && selectedUserPredictions && (
            <div className="rounded-xl border border-cyan-500/20 bg-slate-900/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-cyan-100">{selectedUser.displayName} picks</h3>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setSelectedUserPredictions(null);
                  }}
                  className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600"
                >
                  Close
                </button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Group positions</div>
                  <ul className="space-y-1 text-sm text-slate-200">
                    {selectedUserPredictions.groupPredictions.map((gp) => (
                      <li key={`${gp.groupCode}-${gp.teamId}`} className="rounded bg-slate-800/70 px-2 py-1">
                        Group {gp.groupCode}: {teamsById.get(gp.teamId)?.name} - #{gp.predictedPosition}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Match picks</div>
                  <ul className="space-y-1 text-sm text-slate-200">
                    {selectedUserPredictions.matchPredictions.map((mp) => (
                      <li key={mp.matchId} className="rounded bg-slate-800/70 px-2 py-1">
                        {teamsById.get(groupMatches.find((m) => m.id === mp.matchId)?.homeTeamId || "")?.shortName || "Home"}{" "}
                        {mp.predictedHomeScore}-{mp.predictedAwayScore}{" "}
                        {teamsById.get(groupMatches.find((m) => m.id === mp.matchId)?.awayTeamId || "")?.shortName || "Away"} (
                        {outcomeLabel(mp.predictedHomeScore, mp.predictedAwayScore)})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!groupsComplete || !matchesComplete || submitting}
          onClick={submitAll}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Submitting..." : viewerSubmitted ? "Resubmit Picks" : "Submit All Picks"}
        </button>
      </div>
    </div>
  );
}
