"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { computePredictedGroupTable } from "@/lib/pickem-group-table";
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
  return new Date(value).toLocaleString("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Riga",
    timeZoneName: "short",
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

function isLiveMatchStatus(status: string): boolean {
  const normalized = String(status || "").trim().toLowerCase();
  return (
    normalized === "live" ||
    normalized === "inplay" ||
    normalized === "in_play" ||
    normalized === "in-progress" ||
    normalized === "in_progress" ||
    normalized === "1h" ||
    normalized === "2h" ||
    normalized === "ht"
  );
}

function flagEmojiOf(team?: PickemTeam): string {
  if (!team) return "🏳️";
  return TEAM_FLAGS[(team.shortName || team.name || "").toUpperCase()] || "🏳️";
}

function emojiToCodepoint(emoji: string): string {
  return Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter((part): part is string => Boolean(part))
    .join("-")
    .replace(/-fe0f/g, "");
}

function flagSvgSrc(team?: PickemTeam): string {
  const emoji = flagEmojiOf(team);
  const codepoint = emojiToCodepoint(emoji);
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoint}.svg`;
}

function TeamFlag({ team, className = "h-4 w-4" }: { team?: PickemTeam; className?: string }) {
  const emoji = flagEmojiOf(team);
  return (
    <>
      <img
        src={flagSvgSrc(team)}
        alt={team?.name ? `${team.name} flag` : "Flag"}
        title={team?.name || undefined}
        className={`inline-block rounded-[2px] object-cover align-[-2px] ${className}`}
        loading="lazy"
        decoding="async"
        onError={(event) => {
          const image = event.currentTarget;
          image.style.display = "none";
          const sibling = image.nextElementSibling as HTMLElement | null;
          if (sibling) sibling.style.display = "inline";
        }}
      />
      <span style={{ display: "none" }}>{emoji}</span>
    </>
  );
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
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload>({
    viewerSubmitted: false,
    rows: [],
  });
  const [savingMatch, setSavingMatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingConfirmation, setSendingConfirmation] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PickemLeaderboardRow | null>(null);
  const [selectedUserPredictions, setSelectedUserPredictions] = useState<{
    matchPredictions: PickemMatchPrediction[];
  } | null>(null);
  const [selectedProfileTab, setSelectedProfileTab] = useState<"groups" | "matches">("groups");
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

  const matchesComplete = useMemo(() => {
    return groupMatches.every((match) => {
      const score = matchScores[match.id];
      return !!score && Number.isInteger(score.home) && Number.isInteger(score.away);
    });
  }, [groupMatches, matchScores]);

  const viewerSubmitted = Boolean(data?.userPredictions.submission?.submittedAt);
  const nowTs = Date.now();
  const firstGroupKickoffTs = groupMatches.length ? new Date(groupMatches[0].kickoffAt).getTime() : null;
  const allPicksLocked =
    firstGroupKickoffTs !== null && Number.isFinite(firstGroupKickoffTs) ? nowTs >= firstGroupKickoffTs : false;
  const groupsComplete = matchesComplete;

  const totalGroupMatches = groupMatches.length;
  const predictedGroupMatches = groupMatches.filter((match) => {
    const score = matchScores[match.id];
    return score && Number.isInteger(score.home) && Number.isInteger(score.away);
  }).length;

  const scoreByMatchId = useMemo(() => new Map(Object.entries(matchScores)), [matchScores]);
  const groupsWithComputedTable = useMemo(() => {
    if (!data) return 0;
    const groupMatchesByCode = new Map<string, number>();
    for (const match of groupMatches) {
      const code = String(match.groupCode || "");
      if (!code) continue;
      groupMatchesByCode.set(code, (groupMatchesByCode.get(code) || 0) + 1);
    }
    return data.groups.filter((group) => {
      const table = computePredictedGroupTable({
        groupCode: group.code,
        groups: data.groups,
        teams: data.teams,
        matches: data.matches,
        scoreByMatchId,
      });
      const playedSum = table.reduce((sum, row) => sum + row.played, 0);
      const predictedMatchesInGroup = playedSum / 2;
      return predictedMatchesInGroup >= (groupMatchesByCode.get(group.code) || 0);
    }).length;
  }, [data, groupMatches, scoreByMatchId]);

  const liveGroupMatches = groupMatches.filter((match) => {
    if (isLiveMatchStatus(match.status)) return true;
    if (String(match.status || "").toLowerCase() === "finished") return false;
    const kickoffTs = new Date(match.kickoffAt).getTime();
    if (!Number.isFinite(kickoffTs)) return false;
    // Fallback "live window" for sources that do not mark explicit live statuses.
    return nowTs >= kickoffTs && nowTs <= kickoffTs + 2 * 60 * 60 * 1000;
  });

  const dashboardTopRows = leaderboard.rows.slice(0, 8);

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

  async function sendConfirmationEmail() {
    setSendingConfirmation(true);
    setError(null);
    try {
      const res = await fetch("/pickem/api/confirmation-email", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to send confirmation email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send confirmation email.");
    } finally {
      setSendingConfirmation(false);
    }
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

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
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
          <button type="button" onClick={() => setActiveView("home")} className="flex items-center">
            <img
              src="/header_logo_white.svg"
              alt="Clearway"
              className="h-8 w-auto object-contain [filter:brightness(0)] transition-transform duration-200 hover:scale-[1.02]"
            />
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
              <button
                type="button"
                onClick={() => {
                  void signOut();
                }}
                className="rounded-md border border-black/10 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Logout
              </button>
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
                    Predict all group-stage match scorelines. Group standings are auto-calculated from your score picks
                    using FIFA tie-breakers.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs font-bold">
                    <span className="rounded-full bg-white/10 px-3 py-1">
                      Lock (Riga): {fmtDate(groupMatches[0]?.kickoffAt || data.competition.groupLockAt)}
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
                      {groupsWithComputedTable} <span className="text-base text-white/65">/ {data.groups.length}</span>
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
                    onClick={() => setActiveView("matches")}
                    className="mt-1 rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
                    style={{ background: PRIMARY }}
                  >
                    Continue Picks
                  </button>
                  {viewerSubmitted && (
                    <button
                      type="button"
                      disabled={sendingConfirmation}
                      onClick={() => {
                        void sendConfirmationEmail();
                      }}
                      className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-50"
                    >
                      {sendingConfirmation ? "Sending email..." : "Send confirmation email"}
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black" style={{ color: NAVY }}>
                  Live Games
                </h2>
                <span className="text-xs font-bold text-slate-500">Now playing</span>
              </div>
              {liveGroupMatches.length ? (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {liveGroupMatches.map((match) => {
                    const home = teamsById.get(match.homeTeamId);
                    const away = teamsById.get(match.awayTeamId);
                    const homeScore = match.homeScore ?? 0;
                    const awayScore = match.awayScore ?? 0;
                    return (
                      <article
                        key={`live-${match.id}`}
                        className="min-w-[260px] rounded-xl border border-black/10 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          <span>Group {match.groupCode || "-"}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                            {String(match.status || "live").toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-bold" style={{ color: NAVY }}>
                              <TeamFlag team={home} /> {home?.name || "Home"}
                            </span>
                            <span className="text-base font-black" style={{ color: NAVY }}>
                              {homeScore}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-bold" style={{ color: NAVY }}>
                              <TeamFlag team={away} /> {away?.name || "Away"}
                            </span>
                            <span className="text-base font-black" style={{ color: NAVY }}>
                              {awayScore}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">{fmtDate(match.kickoffAt)}</p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-black/15 bg-white px-4 py-3 text-sm font-semibold text-slate-500">
                  No matches live right now.
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black" style={{ color: NAVY }}>
                  Standings
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveView("standings")}
                  className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-white"
                >
                  Open full table
                </button>
              </div>
              <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-black/10 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2.5">Rank</th>
                      <th className="px-3 py-2.5">Player</th>
                      <th className="px-3 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardTopRows.map((row) => (
                      <tr key={`home-row-${row.userId}`} className="border-b border-black/5 last:border-none">
                        <td className="px-3 py-2.5 text-sm font-extrabold">{row.rank}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <AvatarChip name={row.displayName} />
                            <span className="text-sm font-bold">
                              {row.displayName}
                              {row.userId === data.viewer.userId ? " (You)" : ""}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-black" style={{ color: NAVY }}>
                          {row.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeView === "groups" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black" style={{ color: NAVY }}>
                  Group Standings (Auto)
                </h2>
                <p className="text-sm font-semibold text-slate-500">
                  This view is locked. Standings are calculated automatically from your predicted match scores.
                </p>
              </div>
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                Derived from score picks
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.groups.map((group) => {
                const table = computePredictedGroupTable({
                  groupCode: group.code,
                  groups: data.groups,
                  teams: data.teams,
                  matches: data.matches,
                  scoreByMatchId,
                });
                const allGroupMatches = groupMatches.filter((match) => match.groupCode === group.code).length;
                const predictedInGroup = table.reduce((sum, row) => sum + row.played, 0) / 2;
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
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {predictedInGroup}/{allGroupMatches} matches predicted
                      </span>
                    </div>
                    <div className="space-y-2">
                      {table.map((row, idx) => {
                        const team = teamsById.get(row.teamId);
                        const isTopTwo = idx < 2;
                        return (
                          <div
                            key={row.teamId}
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
                            <span className="text-base">
                              <TeamFlag team={team} className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold" style={{ color: NAVY }}>
                                {team?.name || "Team"}
                              </p>
                              <p className="text-[11px] font-bold text-slate-500">
                                P {row.played} · W {row.wins} · D {row.draws} · L {row.losses} · GF {row.goalsFor} ·
                                {" "}GA {row.goalsAgainst}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-slate-500">{row.points} pts · GD {row.goalDiff}</span>
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
                disabled={allPicksLocked || savingMatch}
                onClick={saveMatchPredictions}
                className="rounded-lg px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40"
                style={{ background: ACCENT }}
              >
                {savingMatch ? "Saving..." : allPicksLocked ? "Locked after kickoff" : "Save Match Predictions"}
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {groupMatches.map((match) => {
                const locked = allPicksLocked || new Date(match.kickoffAt).getTime() <= nowTs;
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
                          <TeamFlag team={home} /> {home?.name || "Home"} vs <TeamFlag team={away} />{" "}
                          {away?.name || "Away"}
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
                          const selectedScoreByMatchId = new Map(
                            selectedUserPredictions.matchPredictions.map((prediction) => [
                              prediction.matchId,
                              { home: prediction.predictedHomeScore, away: prediction.predictedAwayScore },
                            ]),
                          );
                          const table = computePredictedGroupTable({
                            groupCode: group.code,
                            groups: data.groups,
                            teams: data.teams,
                            matches: data.matches,
                            scoreByMatchId: selectedScoreByMatchId,
                          });
                          if (!table.length) return null;
                          return (
                            <div key={group.id} className="rounded-xl border border-black/10 bg-slate-50/70 p-3">
                              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                Group {group.code}
                              </p>
                              <div className="space-y-2">
                                {table.map((row, idx) => {
                                  const team = teamsById.get(row.teamId);
                                  return (
                                    <div
                                      key={`${group.code}-${row.teamId}`}
                                      className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2"
                                    >
                                      <span className="flex items-center gap-2 truncate text-sm font-semibold" style={{ color: NAVY }}>
                                        <span className="w-4 text-[11px] font-black text-slate-400">{idx + 1}</span>
                                        <span>
                                          <TeamFlag team={team} />
                                        </span>
                                        <span className="truncate">{team?.name || "Team"}</span>
                                      </span>
                                      <div className="text-right">
                                        <p className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
                                          {row.points} pts · GD {row.goalDiff}
                                        </p>
                                        <p className="mt-1 text-[10px] font-bold text-slate-500">
                                          P {row.played} W {row.wins} D {row.draws} L {row.losses} GF {row.goalsFor} GA {row.goalsAgainst}
                                        </p>
                                      </div>
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
                                    <TeamFlag team={homeTeam} /> {homeTeam?.name || "Home"}
                                  </p>
                                  <div className="rounded-md bg-white px-2.5 py-1 text-sm font-black text-slate-700">
                                    {mp.predictedHomeScore} - {mp.predictedAwayScore}
                                  </div>
                                  <p className="truncate text-right text-sm font-bold" style={{ color: NAVY }}>
                                    {awayTeam ? (
                                      <>
                                        {awayTeam.name} <TeamFlag team={awayTeam} />
                                      </>
                                    ) : (
                                      "Away"
                                    )}
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
                                    {points === null
                                      ? "-"
                                      : exact
                                        ? "+1 result +3 exact"
                                        : points === 1
                                          ? "+1 result"
                                          : "Missed"}
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
