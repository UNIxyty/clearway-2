import { recomputePickemPoints } from "@/lib/pickem-scoring";
import { listTeams, replaceGroupResults, upsertMatchesFromSync } from "@/lib/pickem-store";

type ProviderFixture = {
  fixture?: { id?: number | string; date?: string; venue?: { name?: string | null }; status?: { short?: string } };
  league?: { round?: string | null };
  teams?: {
    home?: { id?: number | string | null; name?: string | null };
    away?: { id?: number | string | null; name?: string | null };
  };
  goals?: { home?: number | null; away?: number | null };
};

type ProviderStanding = {
  group?: string | null;
  rank?: number | null;
  team?: { id?: number | string | null; name?: string | null };
};

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function asStatus(short: string | undefined): string {
  const v = String(short || "").toUpperCase();
  if (["FT", "AET", "PEN"].includes(v)) return "finished";
  if (["NS", "TBD"].includes(v)) return "scheduled";
  return "in_progress";
}

function parseGroupCode(group: string | null | undefined): string | null {
  if (!group) return null;
  const match = group.match(/group\s+([a-z0-9]+)/i);
  if (!match) return null;
  return match[1] ? match[1].toUpperCase() : null;
}

export async function syncPickemFromFootballApi(competitionId: string): Promise<{
  matchRows: number;
  groupResultRows: number;
}> {
  const baseUrl = process.env.FOOTBALL_API_BASE_URL;
  const apiKey = process.env.FOOTBALL_API_KEY;
  const season = process.env.FOOTBALL_API_SEASON || "2026";
  const leagueId = process.env.FOOTBALL_API_LEAGUE_ID;
  if (!baseUrl || !apiKey || !leagueId) {
    throw new Error("Missing FOOTBALL_API_BASE_URL, FOOTBALL_API_KEY, or FOOTBALL_API_LEAGUE_ID");
  }

  const headers: HeadersInit = {
    Accept: "application/json",
    "x-apisports-key": apiKey,
  };
  const [fixturesRes, standingsRes, teams] = await Promise.all([
    fetch(`${baseUrl.replace(/\/$/, "")}/fixtures?league=${encodeURIComponent(leagueId)}&season=${encodeURIComponent(season)}`, { headers }),
    fetch(`${baseUrl.replace(/\/$/, "")}/standings?league=${encodeURIComponent(leagueId)}&season=${encodeURIComponent(season)}`, { headers }),
    listTeams(competitionId),
  ]);
  if (!fixturesRes.ok) throw new Error(`Football fixtures fetch failed: ${fixturesRes.status}`);
  if (!standingsRes.ok) throw new Error(`Football standings fetch failed: ${standingsRes.status}`);

  const fixturesJson = (await fixturesRes.json().catch(() => ({}))) as { response?: ProviderFixture[] };
  const standingsJson = (await standingsRes.json().catch(() => ({}))) as {
    response?: Array<{ league?: { standings?: ProviderStanding[][] } }>;
  };

  const teamByProviderId = new Map<string, string>();
  const teamByName = new Map<string, string>();
  for (const team of teams) {
    if (team.fifaTeamId) teamByProviderId.set(String(team.fifaTeamId), team.id);
    teamByName.set(normalizeText(team.name), team.id);
    teamByName.set(normalizeText(team.shortName), team.id);
  }

  const findTeamId = (providerId: unknown, name: unknown): string | null => {
    const byProvider = providerId ? teamByProviderId.get(String(providerId)) : null;
    if (byProvider) return byProvider;
    const byName = teamByName.get(normalizeText(String(name || "")));
    return byName || null;
  };

  const matchRows = (fixturesJson.response || [])
    .map((fixture) => {
      const apiMatchId = fixture.fixture?.id ? String(fixture.fixture.id) : "";
      const homeTeamId = findTeamId(fixture.teams?.home?.id, fixture.teams?.home?.name);
      const awayTeamId = findTeamId(fixture.teams?.away?.id, fixture.teams?.away?.name);
      if (!apiMatchId || !homeTeamId || !awayTeamId) return null;

      const roundLabel = fixture.league?.round || null;
      const groupCode = parseGroupCode(roundLabel);
      return {
        apiMatchId,
        stage: groupCode ? ("group" as const) : ("knockout" as const),
        roundLabel,
        groupCode,
        homeTeamId,
        awayTeamId,
        kickoffAt: fixture.fixture?.date || new Date().toISOString(),
        venue: fixture.fixture?.venue?.name || null,
        homeScore:
          fixture.goals?.home === null || fixture.goals?.home === undefined
            ? null
            : Number(fixture.goals.home),
        awayScore:
          fixture.goals?.away === null || fixture.goals?.away === undefined
            ? null
            : Number(fixture.goals.away),
        status: asStatus(fixture.fixture?.status?.short),
      };
    })
    .filter(Boolean) as Array<{
    apiMatchId: string;
    stage: "group" | "knockout";
    roundLabel: string | null;
    groupCode: string | null;
    homeTeamId: string;
    awayTeamId: string;
    kickoffAt: string;
    venue: string | null;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
  }>;

  const standingGroups = standingsJson.response?.[0]?.league?.standings || [];
  const groupResultRows = standingGroups
    .flatMap((group) => group)
    .map((standing) => {
      const groupCode = parseGroupCode(standing.group || "");
      const teamId = findTeamId(standing.team?.id, standing.team?.name);
      const finalPosition = Number(standing.rank || 0);
      if (!groupCode || !teamId || !finalPosition) return null;
      return {
        groupCode,
        teamId,
        finalPosition,
      };
    })
    .filter(Boolean) as Array<{ groupCode: string; teamId: string; finalPosition: number }>;

  await upsertMatchesFromSync({ competitionId, rows: matchRows });
  await replaceGroupResults({ competitionId, rows: groupResultRows });
  await recomputePickemPoints(competitionId);
  return { matchRows: matchRows.length, groupResultRows: groupResultRows.length };
}
