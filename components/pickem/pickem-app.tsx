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

type ActiveView = "home" | "groups" | "matches" | "standings";

const NAVY = "#0f1e3c";
const PRIMARY = "#1a56db";
const ACCENT = "#f97316";

function fmtDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function outcomeLabel(home: number, away: number): "Home Win" | "Away Win" | "Draw" {
  if (home === away) return "Draw";
  return home > away ? "Home Win" : "Away Win";
}

function AvatarChip({ name }: { name: string }) {
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold text-white"
      style={{ background: PRIMARY }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function PickemApp() {
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload>({
    viewerSubmitted: false,
    rows: [],
  });
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
        teamByGroup.set(
          group.code,
          payload.teams.filter((team) => team.groupCode === group.code).map((team) => team.id),
        );
      }
      for (const prediction of payload.userPredictions.groupPredictions) {
        const current = teamByGroup.get(prediction.groupCode) || [];
        const without = current.filter((teamId) => teamId !== prediction.teamId);
        without.splice(Math.max(0, prediction.predictedPosition - 1), 0, prediction.teamId);
        teamByGroup.set(prediction.groupCode, without);
      }
      setGroupOrder(Object.fromEntries(teamByGroup.entries()));

      const scoreMap: Record<string, { home: number; away: number }> = {};
      for (const prediction of payload.userPredictions.matchPredictions) {
        scoreMap[prediction.matchId] = {
          home: prediction.predictedHomeScore,
          away: prediction.predictedAwayScore,
        };
      }
      setMatchScores(scoreMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown pickem error");
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

  const groupMatches = useMemo(
    () =>
      (data?.matches || [])
        .filter((match) => match.stage === "group")
        .sort((a, b) => +new Date(a.kickoffAt) - +new Date(b.kickoffAt)),
    [data],
  );

  const groupsComplete = useMemo(() => {
    if (!data) return false;
    return data.groups.every((group) => {
      const groupTeams = data.teams.filter((team) => team.groupCode === group.code);
      const ordered = groupOrder[group.code] || [];
      return groupTeams.length > 0 && ordered.length === groupTeams.length;
    });
  }, [data, groupOrder]);

  const matchesComplete = useMemo(() => {
    return groupMatches.every((match) => {
      const score = matchScores[match.id];
      return !!score && Number.isInteger(score.home) && Number.isInteger(score.away);
    });
  }, [groupMatches, matchScores]);

  const viewerSubmitted = Boolean(data?.userPredictions.submission?.submittedAt);
  const nowTs = Date.now();
  const groupLocked = data ? nowTs >= new Date(data.competition.groupLockAt).getTime() : false;

  const totalGroupMatches = groupMatches.length;
  const predictedGroupMatches = groupMatches.filter((match) => {
    const score = matchScores[match.id];
    return score && Number.isInteger(score.home) && Number.isInteger(score.away);
  }).length;

  const groupsSetCount = data
    ? data.groups.filter((group) => {
        const total = data.teams.filter((team) => team.groupCode === group.code).length;
        return (groupOrder[group.code] || []).length === total;
      }).length
    : 0;

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save group predictions");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save match predictions");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
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

  if (loading) {
    return <div className="rounded-xl border border-black/10 bg-white p-6">Loading Pickem...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  if (!data) return null;

  const myRow =
    leaderboard.rows.find((row) => row.userId === data.userPredictions.groupPredictions[0]?.userId) ||
    leaderboard.rows[0] ||
    null;

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900">
      <nav className="sticky top-0 z-20 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-4">
          <button type="button" onClick={() => setActiveView("home")} className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md" style={{ background: NAVY }}>
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
            </span>
            <span className="text-lg font-black tracking-wide" style={{ color: NAVY }}>
              CLEARWAY
            </span>
          </button>
          <div className="flex items-center gap-1.5">
            {[
              { id: "home", label: "Dashboard" },
              { id: "groups", label: "Groups" },
              { id: "matches", label: "Matches" },
              { id: "standings", label: "Standings" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id as ActiveView)}
                className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                  activeView === item.id ? "text-white" : "text-slate-700 hover:bg-black/5"
                }`}
                style={activeView === item.id ? { background: PRIMARY } : undefined}
              >
                {item.label}
              </button>
            ))}
            <div className="ml-1.5 flex items-center gap-2 rounded-full border border-black/10 bg-white px-2 py-1">
              <AvatarChip name={myRow?.displayName || "Me"} />
              <span className="hidden text-sm font-bold text-slate-800 sm:inline">
                {myRow?.displayName || "Player"}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1120px] space-y-7 px-4 pb-14 pt-6">
        {activeView === "home" && (
          <>
            <section className="overflow-hidden rounded-3xl" style={{ background: NAVY }}>
              <div className="grid gap-8 px-6 py-9 text-white md:grid-cols-[1.5fr_1fr] md:px-9">
                <div>
                  <div className="text-xs font-bold tracking-[0.2em] text-amber-400">FIFA WORLD CUP 2026</div>
                  <h1 className="mt-2 text-4xl font-black leading-none md:text-5xl">Your Predictions</h1>
                  <p className="mt-3 max-w-xl text-sm font-medium text-white/70">
                    Predict group standings and all group-stage match scorelines. Your picks lock at kickoff,
                    and standings update automatically from official results.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs font-bold">
                    <span className="rounded-full bg-white/10 px-3 py-1">
                      Group lock: {fmtDate(data.competition.groupLockAt)}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 ${
                        viewerSubmitted ? "bg-emerald-500/25 text-emerald-100" : "bg-white/10"
                      }`}
                    >
                      {viewerSubmitted ? "Submitted" : "Draft"}
                    </span>
                  </div>
                </div>
                <div className="grid content-start gap-3 text-sm">
                  <div className="rounded-xl bg-white/10 p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-white/60">Groups</div>
                    <div className="mt-1 text-3xl font-black">
                      {groupsSetCount} <span className="text-base text-white/65">/ {data.groups.length}</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/10 p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-white/60">Matches</div>
                    <div className="mt-1 text-3xl font-black">
                      {predictedGroupMatches}{" "}
                      <span className="text-base text-white/65">/ {totalGroupMatches}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView("groups")}
                    className="mt-1 rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
                    style={{ background: PRIMARY }}
                  >
                    Continue Picks
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {activeView === "groups" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black" style={{ color: NAVY }}>
                  Group Stage Predictions
                </h2>
                <p className="text-sm font-semibold text-slate-500">
                  Set finishing order for each group. Top 2 are highlighted as qualified.
                </p>
              </div>
              <button
                type="button"
                disabled={groupLocked || savingGroup}
                onClick={saveGroupPredictions}
                className="rounded-lg px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: groupLocked ? "#94a3b8" : PRIMARY }}
              >
                {savingGroup ? "Saving..." : groupLocked ? "Locked" : "Save Group Picks"}
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.groups.map((group) => {
                const ordered = groupOrder[group.code] || [];
                return (
                  <article
                    key={group.id}
                    className="rounded-xl border bg-white p-4 shadow-sm"
                    style={{ borderColor: "rgba(15,30,60,0.15)" }}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-extrabold tracking-wider" style={{ color: NAVY }}>
                        GROUP {group.code}
                      </h3>
                      <span className="text-xs font-bold text-slate-500">Manual order</span>
                    </div>
                    <div className="space-y-2">
                      {ordered.map((teamId, idx) => {
                        const team = teamsById.get(teamId);
                        const isTopTwo = idx < 2;
                        return (
                          <div
                            key={teamId}
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                              isTopTwo ? "bg-blue-50" : "bg-slate-50"
                            }`}
                            style={{ borderColor: "rgba(15,30,60,0.08)" }}
                          >
                            <span
                              className={`w-5 text-center text-sm font-black ${
                                isTopTwo ? "text-blue-700" : "text-slate-400"
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <span className="flex-1 truncate text-sm font-semibold" style={{ color: NAVY }}>
                              {team?.name || "Team"}
                            </span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={groupLocked || idx === 0}
                                onClick={() => moveTeam(group.code, idx, idx - 1)}
                                className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-40"
                                style={{ borderColor: "rgba(15,30,60,0.25)" }}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={groupLocked || idx === ordered.length - 1}
                                onClick={() => moveTeam(group.code, idx, idx + 1)}
                                className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-40"
                                style={{ borderColor: "rgba(15,30,60,0.25)" }}
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

        {activeView === "matches" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black" style={{ color: NAVY }}>
                  Match Predictions
                </h2>
                <p className="text-sm font-semibold text-slate-500">
                  Predict final score for each match. Outcome points and exact-score bonus are calculated
                  automatically.
                </p>
              </div>
              <button
                type="button"
                disabled={savingMatch}
                onClick={saveMatchPredictions}
                className="rounded-lg px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40"
                style={{ background: ACCENT }}
              >
                {savingMatch ? "Saving..." : "Save Match Predictions"}
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {groupMatches.map((match) => {
                const locked = new Date(match.kickoffAt).getTime() <= nowTs;
                const home = teamsById.get(match.homeTeamId);
                const away = teamsById.get(match.awayTeamId);
                const prediction = matchScores[match.id];
                const predicted =
                  prediction && Number.isInteger(prediction.home) && Number.isInteger(prediction.away);
                return (
                  <article key={match.id} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Group {match.groupCode || "-"} · {fmtDate(match.kickoffAt)}
                        </div>
                        <h3 className="mt-1 text-base font-extrabold" style={{ color: NAVY }}>
                          {home?.name || "Home"} vs {away?.name || "Away"}
                        </h3>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          locked ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {locked ? "Locked" : "Open"}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        disabled={locked}
                        value={prediction?.home ?? ""}
                        onChange={(e) =>
                          setMatchScores((prev) => ({
                            ...prev,
                            [match.id]: {
                              home: Number(e.target.value),
                              away: prev[match.id]?.away ?? 0,
                            },
                          }))
                        }
                        className="h-11 w-14 rounded-lg border-2 border-black/10 text-center text-lg font-black"
                      />
                      <span className="px-1 text-base font-black text-slate-400">-</span>
                      <input
                        type="number"
                        min={0}
                        disabled={locked}
                        value={prediction?.away ?? ""}
                        onChange={(e) =>
                          setMatchScores((prev) => ({
                            ...prev,
                            [match.id]: {
                              home: prev[match.id]?.home ?? 0,
                              away: Number(e.target.value),
                            },
                          }))
                        }
                        className="h-11 w-14 rounded-lg border-2 border-black/10 text-center text-lg font-black"
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-black/10 pt-3 text-xs font-semibold text-slate-500">
                      <span>
                        {predicted
                          ? `Predicted: ${outcomeLabel(prediction.home, prediction.away)}`
                          : "No prediction yet"}
                      </span>
                      {match.homeScore !== null && match.awayScore !== null && (
                        <span className="font-bold text-emerald-700">
                          Final: {match.homeScore}-{match.awayScore}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeView === "standings" && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black" style={{ color: NAVY }}>
                Standings
              </h2>
              {!leaderboard.viewerSubmitted && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                  Submit picks to unlock others&apos; predictions
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
              <table className="w-full min-w-[620px]">
                <thead>
                  <tr className="border-b border-black/10 bg-black/5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3 text-right">Points</th>
                    <th className="px-4 py-3 text-right">Predictions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.rows.map((row) => (
                    <tr key={row.userId} className="border-b border-black/5 last:border-none">
                      <td className="px-4 py-3 text-sm font-extrabold">{row.rank}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AvatarChip name={row.displayName} />
                          <span className="text-sm font-bold">{row.displayName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-base font-black" style={{ color: NAVY }}>
                        {row.points}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => viewUserPredictions(row)}
                          className="rounded-full px-3 py-1.5 text-xs font-bold text-white"
                          style={{ background: PRIMARY }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedUser && selectedUserPredictions && (
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-black" style={{ color: NAVY }}>
                    {selectedUser.displayName} predictions
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setSelectedUserPredictions(null);
                    }}
                    className="rounded-lg border border-black/20 px-3 py-1.5 text-xs font-bold"
                  >
                    Close
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      Group picks
                    </h4>
                    <div className="space-y-1.5">
                      {selectedUserPredictions.groupPredictions.map((gp) => (
                        <div key={`${gp.groupCode}-${gp.teamId}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          <span className="font-bold" style={{ color: NAVY }}>
                            Group {gp.groupCode}
                          </span>{" "}
                          · {teamsById.get(gp.teamId)?.name} — #{gp.predictedPosition}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      Match picks
                    </h4>
                    <div className="space-y-1.5">
                      {selectedUserPredictions.matchPredictions.map((mp) => (
                        <div key={mp.matchId} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          {teamsById.get(groupMatches.find((m) => m.id === mp.matchId)?.homeTeamId || "")?.shortName ||
                            "Home"}{" "}
                          {mp.predictedHomeScore}-{mp.predictedAwayScore}{" "}
                          {teamsById.get(groupMatches.find((m) => m.id === mp.matchId)?.awayTeamId || "")?.shortName ||
                            "Away"}{" "}
                          · <span className="font-bold">{outcomeLabel(mp.predictedHomeScore, mp.predictedAwayScore)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={!groupsComplete || !matchesComplete || submitting}
            onClick={submitAll}
            className="rounded-xl px-5 py-3 text-sm font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: ACCENT }}
          >
            {submitting ? "Submitting..." : viewerSubmitted ? "Resubmit All Picks" : "Submit All Picks"}
          </button>
        </div>
      </main>
    </div>
  );
}
