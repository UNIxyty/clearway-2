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
  viewer: {
    userId: string;
    email: string | null;
    displayName: string;
  };
  groups: PickemGroup[];
  teams: PickemTeam[];
  matches: PickemMatch[];
  groupResults: Array<{ groupCode: string; teamId: string; finalPosition: number }>;
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
const TEAM_FLAGS: Record<string, string> = {
  MEX: "🇲🇽",
  RSA: "🇿🇦",
  KOR: "🇰🇷",
  CZE: "🇨🇿",
  CAN: "🇨🇦",
  BIH: "🇧🇦",
  QAT: "🇶🇦",
  SUI: "🇨🇭",
  BRA: "🇧🇷",
  MAR: "🇲🇦",
  HAI: "🇭🇹",
  SCO: "🏴",
  USA: "🇺🇸",
  PAR: "🇵🇾",
  AUS: "🇦🇺",
  TUR: "🇹🇷",
  GER: "🇩🇪",
  CUW: "🇨🇼",
  CIV: "🇨🇮",
  ECU: "🇪🇨",
  NED: "🇳🇱",
  JPN: "🇯🇵",
  SWE: "🇸🇪",
  TUN: "🇹🇳",
  BEL: "🇧🇪",
  EGY: "🇪🇬",
  IRN: "🇮🇷",
  NZL: "🇳🇿",
  ESP: "🇪🇸",
  CPV: "🇨🇻",
  KSA: "🇸🇦",
  URU: "🇺🇾",
  FRA: "🇫🇷",
  SEN: "🇸🇳",
  IRQ: "🇮🇶",
  NOR: "🇳🇴",
  ARG: "🇦🇷",
  ALG: "🇩🇿",
  AUT: "🇦🇹",
  JOR: "🇯🇴",
  POR: "🇵🇹",
  COD: "🇨🇩",
  UZB: "🇺🇿",
  COL: "🇨🇴",
  ENG: "🏴",
  CRO: "🇭🇷",
  GHA: "🇬🇭",
  PAN: "🇵🇦",
};

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

function outcomeKey(home: number, away: number): "home" | "away" | "draw" {
  if (home === away) return "draw";
  return home > away ? "home" : "away";
}

function flagOf(team?: PickemTeam): string {
  if (!team) return "🏳️";
  return TEAM_FLAGS[(team.shortName || team.name || "").toUpperCase()] || "🏳️";
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
  const [selectedProfileTab, setSelectedProfileTab] = useState<"groups" | "matches">("groups");
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

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => {
      setError(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

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

  const matchById = useMemo(() => {
    const map = new Map<string, PickemMatch>();
    for (const match of data?.matches || []) map.set(match.id, match);
    return map;
  }, [data]);

  const groupFinalPositionByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data?.groupResults || []) {
      map.set(`${row.groupCode}:${row.teamId}`, row.finalPosition);
    }
    return map;
  }, [data]);

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

  async function persistGroupPredictions(options?: { reload?: boolean }) {
    if (!data) return;
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
    if (options?.reload !== false) await loadAll();
  }

  async function saveGroupPredictions() {
    if (!data) return;
    setSavingGroup(true);
    setError(null);
    try {
      await persistGroupPredictions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save group predictions");
    } finally {
      setSavingGroup(false);
    }
  }

  async function persistMatchPredictions(options?: { reload?: boolean }) {
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
    if (options?.reload !== false) await loadAll();
  }

  async function saveMatchPredictions() {
    setSavingMatch(true);
    setError(null);
    try {
      await persistMatchPredictions();
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
      if (groupsComplete) {
        await persistGroupPredictions({ reload: false });
      }
      if (matchesComplete) {
        await persistMatchPredictions({ reload: false });
      }
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

  function reorderByDrag(groupCode: string, draggedTeamId: string, targetTeamId: string) {
    setGroupOrder((prev) => {
      const current = [...(prev[groupCode] || [])];
      const fromIdx = current.indexOf(draggedTeamId);
      const toIdx = current.indexOf(targetTeamId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const [moved] = current.splice(fromIdx, 1);
      current.splice(toIdx, 0, moved);
      return { ...prev, [groupCode]: current };
    });
  }

  async function viewUserPredictions(row: PickemLeaderboardRow) {
    setSelectedUser(row);
    setSelectedUserPredictions(null);
    setSelectedProfileTab("groups");
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

  if (!data) return null;

  const myRow =
    leaderboard.rows.find((row) => row.userId === data.viewer.userId) ||
    leaderboard.rows[0] ||
    null;

  const activeProfileUser = selectedUser;

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
                {data.viewer.displayName || myRow?.displayName || "Player"}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1120px] space-y-7 px-4 pb-14 pt-6">
        {error && (
          <div className="sticky top-20 z-30">
            <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-orange-600">
                  !
                </span>
                <div className="flex-1">
                  <h2 className="text-sm font-extrabold" style={{ color: NAVY }}>
                    Pickem error
                  </h2>
                  <p className="mt-0.5 text-sm font-semibold text-slate-600">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="rounded px-2 py-1 text-xs font-bold text-slate-500 hover:bg-black/5"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

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
                            draggable={!groupLocked}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/pickem-team-id", teamId);
                              event.dataTransfer.setData("text/pickem-group", group.code);
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (groupLocked) return;
                              const draggedGroup = event.dataTransfer.getData("text/pickem-group");
                              const draggedTeamId = event.dataTransfer.getData("text/pickem-team-id");
                              if (!draggedTeamId || draggedGroup !== group.code) return;
                              reorderByDrag(group.code, draggedTeamId, teamId);
                            }}
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
                            <span className="text-base">{flagOf(team)}</span>
                            <span className="flex-1 truncate text-sm font-semibold" style={{ color: NAVY }}>
                              {team?.name || "Team"}
                            </span>
                            <span className="text-xs font-bold text-slate-400">drag</span>
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
                          {flagOf(home)} {home?.name || "Home"} vs {flagOf(away)} {away?.name || "Away"}
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
                        type="text"
                        inputMode="numeric"
                        disabled={locked}
                        value={prediction?.home ?? ""}
                        onChange={(e) =>
                          setMatchScores((prev) => ({
                            ...prev,
                            [match.id]: {
                              home: Number(String(e.target.value || "0").replace(/[^0-9]/g, "").slice(0, 2)),
                              away: prev[match.id]?.away ?? 0,
                            },
                          }))
                        }
                        className="h-11 w-14 rounded-lg border-2 border-black/10 text-center text-lg font-black"
                      />
                      <span className="px-1 text-base font-black text-slate-400">-</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={locked}
                        value={prediction?.away ?? ""}
                        onChange={(e) =>
                          setMatchScores((prev) => ({
                            ...prev,
                            [match.id]: {
                              home: prev[match.id]?.home ?? 0,
                              away: Number(String(e.target.value || "0").replace(/[^0-9]/g, "").slice(0, 2)),
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-black" style={{ color: NAVY }}>
                  Standings
                </h2>
                <p className="text-sm font-semibold text-slate-500">
                  {leaderboard.rows.length.toLocaleString()} participants
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
                  leaderboard.viewerSubmitted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    leaderboard.viewerSubmitted ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {leaderboard.viewerSubmitted ? "Picks submitted" : "Submit picks to view others"}
              </span>
            </div>

            <div className={`grid gap-4 ${activeProfileUser ? "lg:grid-cols-[minmax(0,1fr)_350px]" : "grid-cols-1"}`}>
              <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
                <table className="w-full min-w-[840px]">
                  <thead>
                    <tr className="border-b border-black/10 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3 text-right">Group pts</th>
                      <th className="px-4 py-3 text-right">Match pts</th>
                      <th className="px-4 py-3 text-right">Exact score</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.rows.map((row) => {
                      const selected = activeProfileUser?.userId === row.userId;
                      return (
                        <tr
                          key={row.userId}
                          className={`cursor-pointer border-b border-black/5 last:border-none ${
                            selected ? "bg-blue-50/80" : "hover:bg-slate-50"
                          }`}
                          onClick={() => {
                            void viewUserPredictions(row);
                          }}
                        >
                          <td className="px-4 py-3 text-sm font-extrabold">{row.rank}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <AvatarChip name={row.displayName} />
                              <span className="text-sm font-bold">
                                {row.displayName}
                                {row.userId === data.viewer.userId ? " (You)" : ""}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-extrabold text-slate-600">{row.groupPoints}</td>
                          <td className="px-4 py-3 text-right text-sm font-extrabold text-slate-600">{row.matchPoints}</td>
                          <td className="px-4 py-3 text-right text-sm font-extrabold text-slate-600">{row.exactPoints}</td>
                          <td className="px-4 py-3 text-right text-base font-black" style={{ color: NAVY }}>
                            {row.points}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {activeProfileUser && (
                <aside className="rounded-2xl border border-black/10 bg-white p-4">
                  <>
                    <div className="flex items-start gap-3">
                      <AvatarChip name={activeProfileUser.displayName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-black" style={{ color: NAVY }}>
                          {activeProfileUser.displayName}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          Rank #{activeProfileUser.rank} · {leaderboard.rows.length.toLocaleString()} players
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(null);
                          setSelectedUserPredictions(null);
                          setSelectedProfileTab("groups");
                        }}
                        className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
                      >
                        Close
                      </button>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-4xl font-black" style={{ color: NAVY }}>
                        {activeProfileUser.points}
                      </span>
                      <span className="text-sm font-bold text-slate-500">pts</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs font-bold text-slate-500">
                      <span>Group {activeProfileUser.groupPoints}</span>
                      <span>Match {activeProfileUser.matchPoints}</span>
                      <span>Exact {activeProfileUser.exactPoints}</span>
                    </div>

                    <div className="mt-4 rounded-lg border border-black/10 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setSelectedProfileTab("groups")}
                        className={`w-1/2 rounded-md px-3 py-2 text-xs font-bold ${
                          selectedProfileTab === "groups" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                        }`}
                      >
                        Group Picks
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedProfileTab("matches")}
                        className={`w-1/2 rounded-md px-3 py-2 text-xs font-bold ${
                          selectedProfileTab === "matches" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                        }`}
                      >
                        Match Predictions
                      </button>
                    </div>

                    <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                      {!selectedUserPredictions || selectedUser?.userId !== activeProfileUser.userId ? (
                        <button
                          type="button"
                          onClick={() => {
                            void viewUserPredictions(activeProfileUser);
                          }}
                          className="w-full rounded-lg border border-dashed border-black/20 px-3 py-4 text-center text-sm font-semibold text-slate-500 hover:bg-slate-50"
                        >
                          Load picks for this player
                        </button>
                      ) : selectedProfileTab === "groups" ? (
                        data.groups.map((group) => {
                          const picks = selectedUserPredictions.groupPredictions
                            .filter((gp) => gp.groupCode === group.code)
                            .sort((a, b) => a.predictedPosition - b.predictedPosition);
                          if (!picks.length) return null;
                          return (
                            <div key={group.id} className="rounded-xl border border-black/10 bg-slate-50/70 p-3">
                              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                Group {group.code}
                              </p>
                              <div className="space-y-2">
                                {picks.map((gp) => {
                                  const team = teamsById.get(gp.teamId);
                                  const finalPos = groupFinalPositionByTeam.get(`${gp.groupCode}:${gp.teamId}`);
                                  const points = finalPos ? (finalPos === gp.predictedPosition ? 2 : 0) : null;
                                  return (
                                    <div
                                      key={`${gp.groupCode}-${gp.teamId}`}
                                      className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2"
                                    >
                                      <span className="flex items-center gap-2 truncate text-sm font-semibold" style={{ color: NAVY }}>
                                        <span className="w-4 text-[11px] font-black text-slate-400">{gp.predictedPosition}</span>
                                        <span>{flagOf(team)}</span>
                                        <span className="truncate">{team?.name || "Team"}</span>
                                      </span>
                                      <span
                                        className={`rounded-md px-2 py-0.5 text-[11px] font-black ${
                                          points === null
                                            ? "bg-slate-100 text-slate-500"
                                            : points > 0
                                              ? "bg-emerald-100 text-emerald-700"
                                              : "bg-slate-200 text-slate-500"
                                        }`}
                                      >
                                        {points === null ? "-" : `+${points}`}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        selectedUserPredictions.matchPredictions
                          .slice()
                          .sort(
                            (a, b) =>
                              new Date(matchById.get(a.matchId)?.kickoffAt || 0).getTime() -
                              new Date(matchById.get(b.matchId)?.kickoffAt || 0).getTime(),
                          )
                          .map((mp) => {
                            const match = matchById.get(mp.matchId);
                            if (!match) return null;
                            const homeTeam = teamsById.get(match.homeTeamId);
                            const awayTeam = teamsById.get(match.awayTeamId);
                            const hasActual = match.homeScore !== null && match.awayScore !== null;
                            const exact = hasActual && mp.predictedHomeScore === match.homeScore && mp.predictedAwayScore === match.awayScore;
                            const correctOutcome =
                              hasActual &&
                              outcomeKey(mp.predictedHomeScore, mp.predictedAwayScore) ===
                                outcomeKey(match.homeScore as number, match.awayScore as number);
                            const points = !hasActual ? null : exact ? 4 : correctOutcome ? 1 : 0;
                            return (
                              <div key={mp.matchId} className="rounded-xl border border-black/10 bg-slate-50/70 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="truncate text-sm font-bold" style={{ color: NAVY }}>
                                    {flagOf(homeTeam)} {homeTeam?.name || "Home"}
                                  </p>
                                  <div className="rounded-md bg-white px-2.5 py-1 text-sm font-black text-slate-700">
                                    {mp.predictedHomeScore} - {mp.predictedAwayScore}
                                  </div>
                                  <p className="truncate text-right text-sm font-bold" style={{ color: NAVY }}>
                                    {awayTeam ? `${awayTeam.name} ${flagOf(awayTeam)}` : "Away"}
                                  </p>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                                  <span>{hasActual ? `Actual ${match.homeScore}-${match.awayScore}` : "No official result"}</span>
                                  <span
                                    className={`rounded-md px-2 py-0.5 font-bold ${
                                      points === null
                                        ? "bg-slate-100 text-slate-500"
                                        : points > 0
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-slate-200 text-slate-500"
                                    }`}
                                  >
                                    {points === null ? "-" : exact ? "+4 exact score" : points === 1 ? "+1 result" : "Missed"}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </>
                </aside>
              )}
            </div>
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
