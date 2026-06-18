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
    lockOverrideUntil: string | null;
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
  groupResultsFinalized?: boolean;
  rows: PickemLeaderboardRow[];
};

type PlayoffLeaderboardRow = {
  rank: number;
  userId: string;
  displayName: string;
  totalPoints: number;
  correctPicks: number;
};

type PlayoffLeaderboardPayload = {
  viewerSubmitted: boolean;
  rows: PlayoffLeaderboardRow[];
};

type PlayoffUserPrediction = {
  matchCode: string;
  round: string;
  homeTeamName: string;
  homeTeamFlag: string;
  awayTeamName: string;
  awayTeamFlag: string;
  predictedWinnerId: string | null;
  predictedWinnerName: string | null;
  predictedWinnerFlag: string | null;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  isLocked: boolean;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  winnerTeamId: string | null;
  pointsAwarded: number;
};

type ActiveView = "home" | "groups" | "matches" | "standings" | "playoffs";

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
  SCO: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
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
  ENG: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  CRO: "🇭🇷",
  GHA: "🇬🇭",
  PAN: "🇵🇦",
};

const WC2026_SOURCE_TIME_LABELS: Record<string, string> = {
  "A|MEX|RSA": "11 Jun 1:00 PM UTC-6",
  "A|KOR|CZE": "11 Jun 8:00 PM UTC-6",
  "A|CZE|RSA": "18 Jun 12:00 PM UTC-4",
  "A|MEX|KOR": "18 Jun 7:00 PM UTC-6",
  "A|CZE|MEX": "24 Jun 7:00 PM UTC-6",
  "A|RSA|KOR": "24 Jun 7:00 PM UTC-6",
  "B|CAN|BIH": "12 Jun 3:00 PM UTC-4",
  "B|QAT|SUI": "13 Jun 12:00 PM UTC-7",
  "B|SUI|BIH": "18 Jun 12:00 PM UTC-7",
  "B|CAN|QAT": "18 Jun 3:00 PM UTC-7",
  "B|SUI|CAN": "24 Jun 12:00 PM UTC-7",
  "B|BIH|QAT": "24 Jun 12:00 PM UTC-7",
  "C|BRA|MAR": "13 Jun 6:00 PM UTC-4",
  "C|HAI|SCO": "13 Jun 9:00 PM UTC-4",
  "C|SCO|MAR": "19 Jun 6:00 PM UTC-4",
  "C|BRA|HAI": "19 Jun 8:30 PM UTC-4",
  "C|SCO|BRA": "24 Jun 6:00 PM UTC-4",
  "C|MAR|HAI": "24 Jun 6:00 PM UTC-4",
  "D|USA|PAR": "12 Jun 6:00 PM UTC-7",
  "D|AUS|TUR": "13 Jun 9:00 PM UTC-7",
  "D|USA|AUS": "19 Jun 12:00 PM UTC-7",
  "D|TUR|PAR": "19 Jun 8:00 PM UTC-7",
  "D|TUR|USA": "25 Jun 7:00 PM UTC-7",
  "D|PAR|AUS": "25 Jun 7:00 PM UTC-7",
  "E|GER|CUW": "14 Jun 12:00 PM UTC-5",
  "E|CIV|ECU": "14 Jun 7:00 PM UTC-4",
  "E|GER|CIV": "20 Jun 4:00 PM UTC-4",
  "E|ECU|CUW": "20 Jun 7:00 PM UTC-5",
  "E|CUW|CIV": "25 Jun 4:00 PM UTC-4",
  "E|ECU|GER": "25 Jun 4:00 PM UTC-4",
  "F|NED|JPN": "14 Jun 3:00 PM UTC-5",
  "F|SWE|TUN": "14 Jun 8:00 PM UTC-6",
  "F|NED|SWE": "20 Jun 12:00 PM UTC-5",
  "F|TUN|JPN": "20 Jun 10:00 PM UTC-6",
  "F|JPN|SWE": "25 Jun 6:00 PM UTC-5",
  "F|TUN|NED": "25 Jun 6:00 PM UTC-5",
  "G|BEL|EGY": "15 Jun 12:00 PM UTC-7",
  "G|IRN|NZL": "15 Jun 6:00 PM UTC-7",
  "G|BEL|IRN": "21 Jun 12:00 PM UTC-7",
  "G|NZL|EGY": "21 Jun 6:00 PM UTC-7",
  "G|EGY|IRN": "26 Jun 8:00 PM UTC-7",
  "G|NZL|BEL": "26 Jun 8:00 PM UTC-7",
  "H|ESP|CPV": "15 Jun 12:00 PM UTC-4",
  "H|KSA|URU": "15 Jun 6:00 PM UTC-4",
  "H|ESP|KSA": "21 Jun 12:00 PM UTC-4",
  "H|URU|CPV": "21 Jun 6:00 PM UTC-4",
  "H|CPV|KSA": "26 Jun 7:00 PM UTC-5",
  "H|URU|ESP": "26 Jun 6:00 PM UTC-6",
  "I|FRA|SEN": "16 Jun 3:00 PM UTC-4",
  "I|IRQ|NOR": "16 Jun 6:00 PM UTC-4",
  "I|FRA|IRQ": "22 Jun 5:00 PM UTC-4",
  "I|NOR|SEN": "22 Jun 8:00 PM UTC-4",
  "I|NOR|FRA": "26 Jun 3:00 PM UTC-4",
  "I|SEN|IRQ": "26 Jun 3:00 PM UTC-4",
  "J|ARG|ALG": "16 Jun 8:00 PM UTC-5",
  "J|AUT|JOR": "16 Jun 9:00 PM UTC-7",
  "J|ARG|AUT": "22 Jun 12:00 PM UTC-5",
  "J|JOR|ALG": "22 Jun 8:00 PM UTC-7",
  "J|ALG|AUT": "27 Jun 9:00 PM UTC-5",
  "J|JOR|ARG": "27 Jun 9:00 PM UTC-5",
  "K|POR|COD": "17 Jun 12:00 PM UTC-5",
  "K|UZB|COL": "17 Jun 8:00 PM UTC-6",
  "K|POR|UZB": "23 Jun 12:00 PM UTC-5",
  "K|COL|COD": "23 Jun 8:00 PM UTC-6",
  "K|COL|POR": "27 Jun 7:30 PM UTC-4",
  "K|COD|UZB": "27 Jun 7:30 PM UTC-4",
  "L|ENG|CRO": "17 Jun 3:00 PM UTC-5",
  "L|GHA|PAN": "17 Jun 7:00 PM UTC-4",
  "L|ENG|GHA": "23 Jun 4:00 PM UTC-4",
  "L|PAN|CRO": "23 Jun 7:00 PM UTC-4",
  "L|PAN|ENG": "27 Jun 5:00 PM UTC-4",
  "L|CRO|GHA": "27 Jun 5:00 PM UTC-4",
};

function fmtDate(value: string): string {
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return value;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm} UTC`;
}

function fmtDateRiga(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Riga",
    timeZoneName: "short",
  });
}

function fmtMatchKickoff(
  match: PickemMatch,
  teamsById: Map<string, PickemTeam>,
): string {
  const home = teamsById.get(match.homeTeamId)?.shortName || "";
  const away = teamsById.get(match.awayTeamId)?.shortName || "";
  const key = `${match.groupCode || ""}|${home}|${away}`;
  return WC2026_SOURCE_TIME_LABELS[key] || fmtDate(match.kickoffAt);
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

// ─── Playoffs view (sub-switch between R32 Draw and Full Bracket) ─────────────

function PlayoffsView() {
  const [subView, setSubView] = useState<"r32" | "bracket">("r32");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-xl bg-black/[0.04] p-1 w-fit">
        <button
          type="button"
          onClick={() => setSubView("r32")}
          className={`h-9 rounded-lg px-4 text-sm font-bold transition ${
            subView === "r32" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          R32 Draw
        </button>
        <button
          type="button"
          onClick={() => setSubView("bracket")}
          className={`h-9 rounded-lg px-4 text-sm font-bold transition ${
            subView === "bracket" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Full Bracket
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a
          href={subView === "r32" ? "/playoffs/r32-draw" : "/playoffs/bracket"}
          className="flex flex-col gap-3 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-black/20 transition group"
        >
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-extrabold tracking-[0.1em] text-slate-400 uppercase">
                {subView === "r32" ? "Round of 32" : "Full Bracket"}
              </span>
              <span className="text-[18px] font-black text-slate-900">
                {subView === "r32" ? "R32 Draw" : "Full Bracket"}
              </span>
            </div>
            <span className="text-[22px] select-none">{subView === "r32" ? "🏟️" : "🏆"}</span>
          </div>
          <p className="text-[13px] font-semibold text-slate-500 leading-snug">
            {subView === "r32"
              ? "See all 16 Round of 32 matchups auto-filled from group standings."
              : "Pick winners for every knockout round from R32 to the Final."}
          </p>
          <span
            className="inline-flex items-center gap-1 text-[13px] font-extrabold transition"
            style={{ color: PRIMARY }}
          >
            Open →
          </span>
        </a>

        <div className="flex flex-col gap-3 rounded-2xl border border-black/[0.08] bg-white p-5">
          <div className="text-[11px] font-extrabold tracking-[0.1em] text-slate-400 uppercase mb-1">How it works</div>
          {subView === "r32" ? (
            <ul className="space-y-2 text-[13px] font-semibold text-slate-600">
              <li className="flex gap-2"><span>1.</span> Groups A–L produce 2 qualifiers each + 8 best third-place teams</li>
              <li className="flex gap-2"><span>2.</span> 16 R32 matchups are auto-set by FIFA bracket rules</li>
              <li className="flex gap-2"><span>3.</span> The draw page shows who plays who</li>
            </ul>
          ) : (
            <ul className="space-y-2 text-[13px] font-semibold text-slate-600">
              <li className="flex gap-2"><span>1.</span> Click a team to pick them as the winner</li>
              <li className="flex gap-2"><span>2.</span> Optionally enter a predicted scoreline for bonus points</li>
              <li className="flex gap-2"><span>3.</span> Picks cascade — changing an R32 pick clears later rounds</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────

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
  const [standingsTab, setStandingsTab] = useState<"groups" | "playoffs">("groups");
  const [playoffLeaderboard, setPlayoffLeaderboard] = useState<PlayoffLeaderboardPayload>({ viewerSubmitted: false, rows: [] });
  const [playoffSelectedUser, setPlayoffSelectedUser] = useState<PlayoffLeaderboardRow | null>(null);
  const [playoffUserPredictions, setPlayoffUserPredictions] = useState<PlayoffUserPrediction[] | null>(null);
  const [playoffPredictionsLoading, setPlayoffPredictionsLoading] = useState(false);
  const [playoffPredictionsError, setPlayoffPredictionsError] = useState<string | null>(null);
  const [playoffStandingsError, setPlayoffStandingsError] = useState<string | null>(null);

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
    if (activeView === "standings" && standingsTab === "playoffs") {
      void loadPlayoffStandings();
    }
  }, [activeView, standingsTab]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => {
      setError(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const nowTs = Date.now();
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
  const lockTs = new Date(data?.competition.groupLockAt || "").getTime();
  const overrideTs = new Date(data?.viewer.lockOverrideUntil || "").getTime();
  const viewerLockOverrideActive = Number.isFinite(overrideTs) ? nowTs < overrideTs : false;
  const allPicksLocked = Number.isFinite(lockTs) ? nowTs >= lockTs && !viewerLockOverrideActive : false;
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

  // Map groupCode+teamId → actual final position (from admin-published group results)
  const groupResultsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.groupResults ?? []) {
      m.set(`${r.groupCode}-${r.teamId}`, r.finalPosition);
    }
    return m;
  }, [data]);

  const liveGroupMatches = groupMatches.filter((match) => isLiveMatchStatus(match.status));

  const scheduledUpcomingMatches = groupMatches
    .filter((match) => {
      const kickoffTs = new Date(match.kickoffAt).getTime();
      if (!Number.isFinite(kickoffTs)) return false;
      if (String(match.status || "").toLowerCase() === "finished") return false;
      if (isLiveMatchStatus(match.status)) return false;
      return true;
    })
    .sort((a, b) => {
      const aTs = new Date(a.kickoffAt).getTime();
      const bTs = new Date(b.kickoffAt).getTime();
      const aFuture = aTs >= nowTs;
      const bFuture = bTs >= nowTs;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      if (aFuture) return aTs - bTs;
      return bTs - aTs;
    })
    .slice(0, 2);

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

  async function loadPlayoffStandings() {
    setPlayoffStandingsError(null);
    try {
      const res = await fetch("/api/playoffs/standings", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setPlayoffLeaderboard(json as PlayoffLeaderboardPayload);
      } else {
        console.error("[playoff-standings] load failed", res.status, json);
        setPlayoffStandingsError((json as { error?: string }).error ?? "Unable to load standings");
      }
    } catch (err) {
      console.error("[playoff-standings] load threw", err);
      setPlayoffStandingsError("Unable to load standings");
    }
  }

  async function viewPlayoffUserPredictions(row: PlayoffLeaderboardRow) {
    setPlayoffSelectedUser(row);
    setPlayoffUserPredictions(null);
    setPlayoffPredictionsError(null);
    setPlayoffPredictionsLoading(true);
    try {
      const res = await fetch(`/api/playoffs/user-predictions?userId=${row.userId}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setPlayoffUserPredictions((json as { predictions: PlayoffUserPrediction[] }).predictions ?? []);
      } else {
        console.error("[playoff-picks] load failed", res.status, json);
        setPlayoffPredictionsError((json as { error?: string }).error ?? "Unable to load predictions");
      }
    } catch (err) {
      console.error("[playoff-picks] load threw", err);
      setPlayoffPredictionsError("Unable to load predictions");
    } finally {
      setPlayoffPredictionsLoading(false);
    }
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
              { id: "playoffs", label: "Playoffs" },
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
                      Lock (Riga): {fmtDateRiga(data.competition.groupLockAt)}
                    </span>
                    {viewerLockOverrideActive && (
                      <span className="rounded-full bg-emerald-500/25 px-3 py-1 text-emerald-100">
                        Unlocked for you until {fmtDateRiga(data.viewer.lockOverrideUntil || "")}
                      </span>
                    )}
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
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">
                          {fmtMatchKickoff(match, teamsById)}
                        </p>
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
                  Next Scheduled Matches
                </h2>
                <span className="text-xs font-bold text-slate-500">Auto-updates at kickoff</span>
              </div>
              {scheduledUpcomingMatches.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {scheduledUpcomingMatches.map((match) => {
                    const home = teamsById.get(match.homeTeamId);
                    const away = teamsById.get(match.awayTeamId);
                    return (
                      <article
                        key={`today-next-${match.id}`}
                        className="rounded-xl border border-black/10 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          <span>Group {match.groupCode || "-"}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">SCHEDULED</span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          <div className="text-sm font-bold" style={{ color: NAVY }}>
                            <TeamFlag team={home} /> {home?.name || "Home"}
                          </div>
                          <div className="text-sm font-bold" style={{ color: NAVY }}>
                            <TeamFlag team={away} /> {away?.name || "Away"}
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">
                          {fmtMatchKickoff(match, teamsById)}
                        </p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-black/15 bg-white px-4 py-3 text-sm font-semibold text-slate-500">
                  No scheduled matches available.
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
            {/* Testing banner */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <span className="mt-0.5 text-lg leading-none">🧪</span>
              <p className="text-sm font-semibold text-amber-900">
                <span className="font-extrabold">Testing group points.</span> We are currently testing how group placement
                point distribution works. All points awarded during this test period will be{" "}
                <span className="font-extrabold">reverted to normal</span> once testing is complete.
              </p>
            </div>

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
                const groupPts = table.reduce((sum, row, idx) => {
                  const actual = groupResultsMap.get(`${group.code}-${row.teamId}`);
                  return sum + (actual !== undefined && actual === idx + 1 ? 1 : 0);
                }, 0);
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
                      <div className="flex items-center gap-1.5">
                        {groupPts > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">
                            +{groupPts} pt{groupPts !== 1 ? "s" : ""}
                          </span>
                        )}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {predictedInGroup}/{allGroupMatches} predicted
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {table.map((row, idx) => {
                        const team = teamsById.get(row.teamId);
                        const isTopTwo = idx < 2;
                        const actualPosition = groupResultsMap.get(`${group.code}-${row.teamId}`);
                        const hasResult = actualPosition !== undefined;
                        const correct = hasResult && actualPosition === idx + 1;
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
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs font-bold text-slate-500">{row.points} pts · GD {row.goalDiff}</span>
                              {hasResult && (
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                                    correct
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-slate-200 text-slate-500"
                                  }`}
                                >
                                  {correct ? "+1 pt" : `actual ${actualPosition}${["st","nd","rd","th"][Math.min(actualPosition-1,3)]}`}
                                </span>
                              )}
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
                const locked = allPicksLocked;
                const resultPublished =
                  String(match.status || "").toLowerCase() === "finished" &&
                  match.homeScore !== null &&
                  match.awayScore !== null;
                const home = teamsById.get(match.homeTeamId);
                const away = teamsById.get(match.awayTeamId);
                const prediction = matchScores[match.id];
                const predicted =
                  prediction && Number.isInteger(prediction.home) && Number.isInteger(prediction.away);
                const exactHit =
                  Boolean(resultPublished && predicted) &&
                  prediction!.home === match.homeScore &&
                  prediction!.away === match.awayScore;
                const outcomeHit =
                  Boolean(resultPublished && predicted) &&
                  outcomeKey(prediction!.home, prediction!.away) ===
                    outcomeKey(match.homeScore as number, match.awayScore as number);
                return (
                  <article key={match.id} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Group {match.groupCode || "-"} · {fmtMatchKickoff(match, teamsById)}
                        </div>
                        <h3 className="mt-1 text-base font-extrabold" style={{ color: NAVY }}>
                          <TeamFlag team={home} /> {home?.name || "Home"} vs <TeamFlag team={away} />{" "}
                          {away?.name || "Away"}
                        </h3>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          resultPublished ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {resultPublished ? "Final" : "Awaiting results"}
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
                      {resultPublished && (
                        <span className="flex items-center gap-2">
                          <span className="font-bold text-emerald-700">
                            Final: {match.homeScore}-{match.awayScore}
                          </span>
                          {predicted ? (
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                exactHit
                                  ? "bg-emerald-100 text-emerald-700"
                                  : outcomeHit
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {exactHit ? "+1 result +2 exact" : outcomeHit ? "+1 result" : "Miss"}
                            </span>
                          ) : (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                              No pick
                            </span>
                          )}
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
            {/* Testing banner */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <span className="mt-0.5 text-lg leading-none">🧪</span>
              <p className="text-sm font-semibold text-amber-900">
                <span className="font-extrabold">Testing group points.</span> We are currently testing how group placement
                point distribution works. All points awarded during this test period will be{" "}
                <span className="font-extrabold">reverted to normal</span> once testing is complete.
              </p>
            </div>

            {/* Group / Playoffs toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/[0.05] w-fit">
              {(["groups", "playoffs"] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setStandingsTab(tab); setPlayoffSelectedUser(null); setPlayoffUserPredictions(null); }}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                    standingsTab === tab ? "bg-white shadow-sm text-navy" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab === "groups" ? "Groups" : "Playoffs"}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-black" style={{ color: NAVY }}>
                  {standingsTab === "groups" ? "Standings" : "Playoff Standings"}
                </h2>
                <p className="text-sm font-semibold text-slate-500">
                  {standingsTab === "groups" ? leaderboard.rows.length.toLocaleString() : playoffLeaderboard.rows.length.toLocaleString()} participants
                </p>
              </div>
              {standingsTab === "groups" && (
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
              )}
              {standingsTab === "playoffs" && !playoffLeaderboard.viewerSubmitted && (
                <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold bg-amber-100 text-amber-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  Submit playoff picks to view others
                </span>
              )}
            </div>

            {standingsTab === "groups" && (
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
                          <td className="px-4 py-3 text-right text-sm font-extrabold text-slate-600">
                            {leaderboard.groupResultsFinalized ? row.groupPoints : <span className="text-slate-300" title="Group positions not finalized yet">—</span>}
                          </td>
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
                      <span>Group {leaderboard.groupResultsFinalized ? activeProfileUser.groupPoints : "—"}</span>
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
                          const groupPts = table.reduce((sum, row, idx) => {
                            const actual = groupResultsMap.get(`${group.code}-${row.teamId}`);
                            return sum + (actual !== undefined && actual === idx + 1 ? 1 : 0);
                          }, 0);
                          return (
                            <div key={group.id} className="rounded-xl border border-black/10 bg-slate-50/70 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                                  Group {group.code}
                                </p>
                                {groupPts > 0 && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                                    +{groupPts} pt{groupPts !== 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-2">
                                {table.map((row, idx) => {
                                  const team = teamsById.get(row.teamId);
                                  const actualPosition = groupResultsMap.get(`${group.code}-${row.teamId}`);
                                  const hasResult = actualPosition !== undefined;
                                  const correct = hasResult && actualPosition === idx + 1;
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
                                      <div className="flex flex-col items-end gap-1">
                                        <p className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
                                          {row.points} pts · GD {row.goalDiff}
                                        </p>
                                        {hasResult ? (
                                          <span
                                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                                              correct
                                                ? "bg-emerald-100 text-emerald-700"
                                                : "bg-slate-200 text-slate-500"
                                            }`}
                                          >
                                            {correct ? "+1 pt" : `actual ${actualPosition}${["st","nd","rd","th"][Math.min(actualPosition-1,3)]}`}
                                          </span>
                                        ) : (
                                          <p className="text-[10px] font-bold text-slate-500">
                                            P {row.played} W {row.wins} D {row.draws} L {row.losses} GF {row.goalsFor} GA {row.goalsAgainst}
                                          </p>
                                        )}
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
                            const hasActual =
                              String(match.status || "").toLowerCase() === "finished" &&
                              match.homeScore !== null &&
                              match.awayScore !== null;
                            const exact = hasActual && mp.predictedHomeScore === match.homeScore && mp.predictedAwayScore === match.awayScore;
                            const correctOutcome =
                              hasActual &&
                              outcomeKey(mp.predictedHomeScore, mp.predictedAwayScore) ===
                                outcomeKey(match.homeScore as number, match.awayScore as number);
                            const points = !hasActual ? null : exact ? 3 : correctOutcome ? 1 : 0;
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
                                        ? "+1 result +2 exact"
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
            )}

            {standingsTab === "playoffs" && (
            <div className={`grid gap-4 ${playoffSelectedUser ? "lg:grid-cols-[minmax(0,1fr)_350px]" : "grid-cols-1"}`}>
              <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
                {playoffStandingsError ? (
                  <div className="px-6 py-12 text-center text-sm font-semibold text-red-500">
                    {playoffStandingsError}
                    <button
                      type="button"
                      onClick={() => void loadPlayoffStandings()}
                      className="mt-2 block mx-auto text-xs font-bold text-blue-600 hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : !playoffLeaderboard.viewerSubmitted ? (
                  <div className="px-6 py-12 text-center text-sm font-semibold text-slate-400">
                    Submit your playoff picks to see the standings.
                  </div>
                ) : (
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-black/10 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Rank</th>
                        <th className="px-4 py-3">Player</th>
                        <th className="px-4 py-3 text-right">Correct picks</th>
                        <th className="px-4 py-3 text-right">Total pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playoffLeaderboard.rows.map((row) => {
                        const selected = playoffSelectedUser?.userId === row.userId;
                        return (
                          <tr
                            key={row.userId}
                            className={`cursor-pointer border-b border-black/5 last:border-none ${selected ? "bg-blue-50/80" : "hover:bg-slate-50"}`}
                            onClick={() => void viewPlayoffUserPredictions(row)}
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
                            <td className="px-4 py-3 text-right text-sm font-extrabold text-slate-600">{row.correctPicks}</td>
                            <td className="px-4 py-3 text-right text-base font-black" style={{ color: NAVY }}>{row.totalPoints}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {playoffSelectedUser && (
                <aside className="rounded-2xl border border-black/10 bg-white p-4">
                  <div className="flex items-start gap-3 mb-4">
                    <AvatarChip name={playoffSelectedUser.displayName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-black" style={{ color: NAVY }}>{playoffSelectedUser.displayName}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        Rank #{playoffSelectedUser.rank} · {playoffLeaderboard.rows.length} players · {playoffSelectedUser.totalPoints} pts
                      </p>
                    </div>
                    <button type="button" onClick={() => { setPlayoffSelectedUser(null); setPlayoffUserPredictions(null); }}
                      className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
                  </div>
                  {playoffPredictionsLoading ? (
                    <div className="text-center text-sm text-slate-400 py-8">Loading picks…</div>
                  ) : playoffPredictionsError ? (
                    <div className="text-center text-sm font-semibold text-red-500 py-8">
                      {playoffPredictionsError}
                      <button
                        type="button"
                        onClick={() => { if (playoffSelectedUser) void viewPlayoffUserPredictions(playoffSelectedUser); }}
                        className="mt-2 block mx-auto text-xs font-bold text-blue-600 hover:underline"
                      >
                        Retry
                      </button>
                    </div>
                  ) : playoffUserPredictions === null ? null : playoffUserPredictions.length === 0 ? (
                    <div className="text-center text-sm text-slate-400 py-8">This user hasn&apos;t made predictions yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {playoffUserPredictions.map((pred) => {
                        // Scored once the real result is published (actual score set) and a
                        // winner is decided — gate on that, not is_locked (mirrors Full Bracket).
                        const scored = pred.actualHomeScore !== null && !!pred.winnerTeamId;
                        const winnerCorrect = pred.winnerTeamId && pred.predictedWinnerId === pred.winnerTeamId;
                        const scoreCorrect = winnerCorrect && pred.actualHomeScore !== null &&
                          pred.predictedHomeScore === pred.actualHomeScore && pred.predictedAwayScore === pred.actualAwayScore;
                        return (
                          <div key={pred.matchCode} className={`rounded-lg border p-3 ${scored ? (winnerCorrect ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/30") : "border-black/[0.07] bg-white"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-extrabold tracking-widest text-slate-400">{pred.round} · {pred.matchCode}</span>
                              {scored && (
                                <span className={`text-[10.5px] font-extrabold ${winnerCorrect ? "text-emerald-600" : "text-red-500"}`}>
                                  {winnerCorrect ? `${scoreCorrect ? "★ " : ""}+${pred.pointsAwarded} ${pred.pointsAwarded === 1 ? "pt" : "pts"}` : "miss"}
                                </span>
                              )}
                            </div>
                            <div className="text-[12.5px] font-bold text-navy">
                              {pred.predictedWinnerFlag} {pred.predictedWinnerName ?? "—"}
                              {pred.predictedHomeScore !== null && pred.predictedAwayScore !== null && (
                                <span className="text-slate-400 font-semibold ml-1.5">({pred.predictedHomeScore}–{pred.predictedAwayScore})</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {pred.homeTeamFlag} {pred.homeTeamName} vs {pred.awayTeamFlag} {pred.awayTeamName}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </aside>
              )}
            </div>
            )}
          </section>
        )}

        {activeView === "playoffs" && (
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-black" style={{ color: NAVY }}>Playoffs</h2>
              <p className="text-sm font-semibold text-slate-500">WC 2026 knockout bracket — Round of 32 to the Final</p>
            </div>
            <PlayoffsView />
          </section>
        )}

        {activeView !== "playoffs" && (
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
        )}
      </main>
    </div>
  );
}
