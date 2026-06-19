import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import type {
  PickemCompetition,
  PickemGroup,
  PickemGroupPrediction,
  PickemLeaderboardRow,
  PickemMatch,
  PickemMatchPrediction,
  PickemSubmission,
  PickemTeam,
} from "@/lib/pickem-shared";

function service() {
  const client = createSupabaseServiceRoleClient();
  if (!client) throw new Error("Missing Supabase service role configuration");
  return client;
}

function mapCompetition(row: any): PickemCompetition {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    startsAt: String(row.starts_at),
    groupLockAt: String(row.group_lock_at),
    createdAt: String(row.created_at),
  };
}

function mapGroup(row: any): PickemGroup {
  return {
    id: String(row.id),
    competitionId: String(row.competition_id),
    code: String(row.code),
    name: String(row.name),
  };
}

function mapTeam(row: any): PickemTeam {
  return {
    id: String(row.id),
    competitionId: String(row.competition_id),
    groupCode: String(row.group_code),
    fifaTeamId: row.fifa_team_id ? String(row.fifa_team_id) : null,
    name: String(row.name),
    shortName: String(row.short_name || row.name),
    crestUrl: row.crest_url ? String(row.crest_url) : null,
    sortOrder: Number(row.sort_order || 0),
  };
}

function mapMatch(row: any): PickemMatch {
  return {
    id: String(row.id),
    competitionId: String(row.competition_id),
    apiMatchId: row.api_match_id ? String(row.api_match_id) : null,
    stage: row.stage === "knockout" ? "knockout" : "group",
    roundLabel: row.round_label ? String(row.round_label) : null,
    groupCode: row.group_code ? String(row.group_code) : null,
    homeTeamId: String(row.home_team_id),
    awayTeamId: String(row.away_team_id),
    kickoffAt: String(row.kickoff_at),
    venue: row.venue ? String(row.venue) : null,
    homeScore: Number.isFinite(Number(row.home_score)) ? Number(row.home_score) : null,
    awayScore: Number.isFinite(Number(row.away_score)) ? Number(row.away_score) : null,
    status: String(row.status || "scheduled"),
    updatedAt: String(row.updated_at),
  };
}

export async function getActiveCompetition(slug = "wc-2026"): Promise<PickemCompetition | null> {
  const supabase = service();
  const { data, error } = await supabase
    .from("pickem_competitions")
    .select("id,slug,name,starts_at,group_lock_at,created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return mapCompetition(data);
}

export async function listGroups(competitionId: string): Promise<PickemGroup[]> {
  const supabase = service();
  const { data, error } = await supabase
    .from("pickem_groups")
    .select("id,competition_id,code,name")
    .eq("competition_id", competitionId)
    .order("code", { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map(mapGroup);
}

export async function listTeams(competitionId: string): Promise<PickemTeam[]> {
  const supabase = service();
  const { data, error } = await supabase
    .from("pickem_teams")
    .select("id,competition_id,group_code,fifa_team_id,name,short_name,crest_url,sort_order")
    .eq("competition_id", competitionId)
    .order("group_code", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map(mapTeam);
}

export async function listMatches(competitionId: string): Promise<PickemMatch[]> {
  const supabase = service();
  const { data, error } = await supabase
    .from("pickem_matches")
    .select("id,competition_id,api_match_id,stage,round_label,group_code,home_team_id,away_team_id,kickoff_at,venue,home_score,away_score,status,updated_at")
    .eq("competition_id", competitionId)
    .order("kickoff_at", { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map(mapMatch);
}

export async function updateMatchScore(input: {
  competitionId: string;
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  status?: string;
}): Promise<void> {
  const supabase = service();
  const updates: Record<string, unknown> = {
    home_score: input.homeScore,
    away_score: input.awayScore,
    updated_at: new Date().toISOString(),
  };
  if (typeof input.status === "string" && input.status.trim()) {
    updates.status = input.status.trim().toLowerCase();
  }
  const { error } = await supabase
    .from("pickem_matches")
    .update(updates)
    .eq("competition_id", input.competitionId)
    .eq("id", input.matchId);
  if (error) throw new Error(error.message || "Failed to update match score");
}

export async function listGroupResults(competitionId: string): Promise<
  Array<{ groupCode: string; teamId: string; finalPosition: number }>
> {
  const supabase = service();
  const { data, error } = await supabase
    .from("pickem_group_results")
    .select("group_code,team_id,final_position")
    .eq("competition_id", competitionId);
  if (error || !data) return [];
  return (data as any[]).map((row) => ({
    groupCode: String(row.group_code),
    teamId: String(row.team_id),
    finalPosition: Number(row.final_position),
  }));
}

export async function saveGroupPredictions(input: {
  userId: string;
  competitionId: string;
  rows: Array<{ groupCode: string; teamId: string; predictedPosition: number }>;
}): Promise<void> {
  const supabase = service();
  const payload = input.rows.map((row) => ({
    user_id: input.userId,
    competition_id: input.competitionId,
    group_code: row.groupCode,
    team_id: row.teamId,
    predicted_position: row.predictedPosition,
    updated_at: new Date().toISOString(),
  }));
  const groupCodes = [...new Set(input.rows.map((row) => row.groupCode))];
  const { error: delErr } = await supabase
    .from("pickem_user_group_predictions")
    .delete()
    .eq("user_id", input.userId)
    .eq("competition_id", input.competitionId)
    .in("group_code", groupCodes);
  if (delErr) throw new Error(delErr.message || "Failed to reset group predictions");

  const { error: insErr } = await supabase.from("pickem_user_group_predictions").insert(payload);
  if (insErr) throw new Error(insErr.message || "Failed to save group predictions");
}

export async function saveMatchPredictions(input: {
  userId: string;
  competitionId: string;
  rows: Array<{ matchId: string; predictedHomeScore: number; predictedAwayScore: number }>;
}): Promise<void> {
  const supabase = service();
  const payload = input.rows.map((row) => ({
    user_id: input.userId,
    competition_id: input.competitionId,
    match_id: row.matchId,
    predicted_home_score: row.predictedHomeScore,
    predicted_away_score: row.predictedAwayScore,
    predicted_outcome:
      row.predictedHomeScore === row.predictedAwayScore
        ? "draw"
        : row.predictedHomeScore > row.predictedAwayScore
          ? "home"
          : "away",
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("pickem_user_match_predictions")
    .upsert(payload, { onConflict: "user_id,competition_id,match_id" });
  if (error) throw new Error(error.message || "Failed to save match predictions");
}

export async function listUserPredictions(input: {
  userId: string;
  competitionId: string;
}): Promise<{
  groupPredictions: PickemGroupPrediction[];
  matchPredictions: PickemMatchPrediction[];
  submission: PickemSubmission | null;
}> {
  const supabase = service();
  const [groupsRes, matchesRes, submissionRes] = await Promise.all([
    supabase
      .from("pickem_user_group_predictions")
      .select("user_id,competition_id,group_code,team_id,predicted_position")
      .eq("competition_id", input.competitionId)
      .eq("user_id", input.userId),
    supabase
      .from("pickem_user_match_predictions")
      .select("user_id,competition_id,match_id,predicted_home_score,predicted_away_score,predicted_outcome")
      .eq("competition_id", input.competitionId)
      .eq("user_id", input.userId),
    supabase
      .from("pickem_prediction_submissions")
      .select("user_id,competition_id,submitted_at")
      .eq("competition_id", input.competitionId)
      .eq("user_id", input.userId)
      .maybeSingle(),
  ]);

  const groupPredictions: PickemGroupPrediction[] = (groupsRes.data || []).map((row: any) => ({
    userId: String(row.user_id),
    competitionId: String(row.competition_id),
    groupCode: String(row.group_code),
    teamId: String(row.team_id),
    predictedPosition: Number(row.predicted_position),
  }));
  const matchPredictions: PickemMatchPrediction[] = (matchesRes.data || []).map((row: any) => ({
    userId: String(row.user_id),
    competitionId: String(row.competition_id),
    matchId: String(row.match_id),
    predictedHomeScore: Number(row.predicted_home_score),
    predictedAwayScore: Number(row.predicted_away_score),
    predictedOutcome: row.predicted_outcome === "away" ? "away" : row.predicted_outcome === "draw" ? "draw" : "home",
  }));
  const submission =
    submissionRes.data && !submissionRes.error
      ? {
          userId: String((submissionRes.data as any).user_id),
          competitionId: String((submissionRes.data as any).competition_id),
          submittedAt: String((submissionRes.data as any).submitted_at),
        }
      : null;
  return { groupPredictions, matchPredictions, submission };
}

export async function markSubmitted(input: { userId: string; competitionId: string }): Promise<void> {
  const supabase = service();
  const now = new Date().toISOString();
  const { error } = await supabase.from("pickem_prediction_submissions").upsert(
    {
      user_id: input.userId,
      competition_id: input.competitionId,
      submitted_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,competition_id" },
  );
  if (error) throw new Error(error.message || "Failed to submit predictions");
}

export async function hasSubmitted(input: { userId: string; competitionId: string }): Promise<boolean> {
  const supabase = service();
  const { data, error } = await supabase
    .from("pickem_prediction_submissions")
    .select("user_id")
    .eq("competition_id", input.competitionId)
    .eq("user_id", input.userId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function getUserLockOverride(input: {
  userId: string;
  competitionId: string;
}): Promise<{ unlockUntil: string } | null> {
  const supabase = service();
  const { data, error } = await supabase
    .from("pickem_user_lock_overrides")
    .select("unlock_until")
    .eq("competition_id", input.competitionId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error || !data) return null;
  const unlockUntil = String((data as { unlock_until?: string }).unlock_until || "");
  if (!unlockUntil) return null;
  const unlockTs = new Date(unlockUntil).getTime();
  if (!Number.isFinite(unlockTs) || unlockTs <= Date.now()) return null;
  return { unlockUntil };
}

export async function listUserLockOverrides(input: {
  competitionId: string;
}): Promise<Array<{ userId: string; unlockUntil: string; reason: string | null; updatedAt: string }>> {
  const supabase = service();
  const { data, error } = await supabase
    .from("pickem_user_lock_overrides")
    .select("user_id,unlock_until,reason,updated_at")
    .eq("competition_id", input.competitionId)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as any[])
    .map((row) => ({
      userId: String(row.user_id),
      unlockUntil: String(row.unlock_until),
      reason: row.reason ? String(row.reason) : null,
      updatedAt: String(row.updated_at),
    }))
    .filter((row) => {
      const unlockTs = new Date(row.unlockUntil).getTime();
      return Number.isFinite(unlockTs) && unlockTs > Date.now();
    });
}

export async function upsertUserLockOverride(input: {
  userId: string;
  competitionId: string;
  unlockUntil: string;
  reason?: string | null;
  updatedByUserId?: string | null;
}): Promise<void> {
  const supabase = service();
  const unlockTs = new Date(input.unlockUntil).getTime();
  if (!Number.isFinite(unlockTs)) throw new Error("Invalid unlockUntil timestamp");
  const now = new Date().toISOString();
  const { error } = await supabase.from("pickem_user_lock_overrides").upsert(
    {
      user_id: input.userId,
      competition_id: input.competitionId,
      unlock_until: new Date(unlockTs).toISOString(),
      reason: input.reason ? input.reason.trim().slice(0, 300) : null,
      updated_by_user_id: input.updatedByUserId || null,
      updated_at: now,
      created_at: now,
    },
    { onConflict: "user_id,competition_id" },
  );
  if (error) throw new Error(error.message || "Failed to upsert lock override");
}

export async function clearUserLockOverride(input: {
  userId: string;
  competitionId: string;
}): Promise<void> {
  const supabase = service();
  const { error } = await supabase
    .from("pickem_user_lock_overrides")
    .delete()
    .eq("competition_id", input.competitionId)
    .eq("user_id", input.userId);
  if (error) throw new Error(error.message || "Failed to clear lock override");
}

export async function getLeaderboard(competitionId: string): Promise<PickemLeaderboardRow[]> {
  const supabase = service();
  const { data, error } = await supabase
    .from("pickem_points_ledger")
    .select("user_id,source_type,points")
    .eq("competition_id", competitionId);
  if (error) return [];

  const scores = new Map<string, { groupPoints: number; matchPoints: number; exactPoints: number; r32Points: number; points: number }>();
  for (const row of (data || []) as any[]) {
    const userId = String(row.user_id);
    const current = scores.get(userId) || {
      groupPoints: 0,
      matchPoints: 0,
      exactPoints: 0,
      r32Points: 0,
      points: 0,
    };
    const points = Number(row.points || 0);
    current.points += points; // total includes every source type, incl. r32_projection
    const sourceType = String(row.source_type || "");
    if (sourceType === "group_position") current.groupPoints += points;
    else if (sourceType === "match_outcome") current.matchPoints += points;
    else if (sourceType === "match_score") current.exactPoints += points;
    else if (sourceType === "r32_projection") current.r32Points += points;
    scores.set(userId, current);
  }

  const [submissionsRes, groupPredRes, matchPredRes] = await Promise.all([
    supabase
      .from("pickem_prediction_submissions")
      .select("user_id")
      .eq("competition_id", competitionId),
    supabase
      .from("pickem_user_group_predictions")
      .select("user_id")
      .eq("competition_id", competitionId),
    supabase
      .from("pickem_user_match_predictions")
      .select("user_id")
      .eq("competition_id", competitionId),
  ]);

  const participantIds = new Set<string>(scores.keys());
  for (const row of submissionsRes.data || []) {
    participantIds.add(String((row as any).user_id));
  }
  for (const row of groupPredRes.data || []) {
    participantIds.add(String((row as any).user_id));
  }
  for (const row of matchPredRes.data || []) {
    participantIds.add(String((row as any).user_id));
  }

  const userIds = [...participantIds];
  if (!userIds.length) return [];

  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("user_id,display_name")
    .in("user_id", userIds);

  const displayById = new Map<string, string>();
  for (const row of prefs || []) {
    const v = row as any;
    if (v.user_id) displayById.set(String(v.user_id), String(v.display_name || ""));
  }

  const rows = userIds
    .map((userId) => ({
      userId,
      groupPoints: scores.get(userId)?.groupPoints ?? 0,
      matchPoints: scores.get(userId)?.matchPoints ?? 0,
      exactPoints: scores.get(userId)?.exactPoints ?? 0,
      r32Points: scores.get(userId)?.r32Points ?? 0,
      points: scores.get(userId)?.points ?? 0,
      displayName: displayById.get(userId) || `User ${userId.slice(0, 8)}`,
      email: null as string | null,
      rank: 0,
    }))
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));

  rows.forEach((row, idx) => {
    row.rank = idx + 1;
  });
  return rows;
}

export async function replaceGroupResults(input: {
  competitionId: string;
  rows: Array<{ groupCode: string; teamId: string; finalPosition: number }>;
}): Promise<void> {
  const supabase = service();
  const { error: delErr } = await supabase
    .from("pickem_group_results")
    .delete()
    .eq("competition_id", input.competitionId);
  if (delErr) throw new Error(delErr.message || "Failed to clear group results");
  if (!input.rows.length) return;
  const { error } = await supabase.from("pickem_group_results").insert(
    input.rows.map((row) => ({
      competition_id: input.competitionId,
      group_code: row.groupCode,
      team_id: row.teamId,
      final_position: row.finalPosition,
    })),
  );
  if (error) throw new Error(error.message || "Failed to store group results");
}

export async function replaceGroupResultOrder(input: {
  competitionId: string;
  groupCode: string;
  rows: Array<{ teamId: string; finalPosition: number }>;
}): Promise<void> {
  const supabase = service();
  const { error: delErr } = await supabase
    .from("pickem_group_results")
    .delete()
    .eq("competition_id", input.competitionId)
    .eq("group_code", input.groupCode);
  if (delErr) throw new Error(delErr.message || "Failed to clear group result");
  if (!input.rows.length) return;
  const { error } = await supabase.from("pickem_group_results").insert(
    input.rows.map((row) => ({
      competition_id: input.competitionId,
      group_code: input.groupCode,
      team_id: row.teamId,
      final_position: row.finalPosition,
    })),
  );
  if (error) throw new Error(error.message || "Failed to store group result");
}

export async function clearGroupResult(input: {
  competitionId: string;
  groupCode: string;
}): Promise<void> {
  const supabase = service();
  const { error } = await supabase
    .from("pickem_group_results")
    .delete()
    .eq("competition_id", input.competitionId)
    .eq("group_code", input.groupCode);
  if (error) throw new Error(error.message || "Failed to clear group result");
}

export async function upsertMatchesFromSync(input: {
  competitionId: string;
  rows: Array<{
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
}): Promise<void> {
  const supabase = service();
  if (!input.rows.length) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("pickem_matches")
    .upsert(
      input.rows.map((row) => ({
        competition_id: input.competitionId,
        api_match_id: row.apiMatchId,
        stage: row.stage,
        round_label: row.roundLabel,
        group_code: row.groupCode,
        home_team_id: row.homeTeamId,
        away_team_id: row.awayTeamId,
        kickoff_at: row.kickoffAt,
        venue: row.venue,
        home_score: row.homeScore,
        away_score: row.awayScore,
        status: row.status,
        updated_at: now,
      })),
      { onConflict: "competition_id,api_match_id" },
    );
  if (error) throw new Error(error.message || "Failed to upsert synced matches");
}

export async function replacePointsLedger(input: {
  competitionId: string;
  rows: Array<{
    userId: string;
    sourceType: string;
    sourceId: string;
    points: number;
    details: object;
  }>;
}): Promise<void> {
  const supabase = service();
  // SAFETY: never wipe the ledger to empty. A zero-row recompute almost always
  // means it ran in a phase with no scoreable data yet (or a transient/missing
  // source), NOT that every user legitimately dropped to zero. Skip the
  // destructive delete entirely in that case so a mistimed recompute can't erase
  // everyone's points. (Going from many rows to fewer non-zero rows — e.g. an
  // admin correcting a result — is still allowed.)
  if (!input.rows.length) {
    console.warn("[replacePointsLedger] recompute produced 0 rows — skipping ledger replace to avoid wiping existing points", { competitionId: input.competitionId });
    return;
  }
  const { error: delErr } = await supabase
    .from("pickem_points_ledger")
    .delete()
    .eq("competition_id", input.competitionId);
  if (delErr) throw new Error(delErr.message || "Failed to clear points");
  const now = new Date().toISOString();
  const { error } = await supabase.from("pickem_points_ledger").insert(
    input.rows.map((row) => ({
      user_id: row.userId,
      competition_id: input.competitionId,
      source_type: row.sourceType,
      source_id: row.sourceId,
      points: row.points,
      details: row.details,
      awarded_at: now,
    })),
  );
  if (error) throw new Error(error.message || "Failed to write points ledger");
}

// ─── tournament_state (one-time batch guards) ───────────────────────────────

export interface TournamentState {
  r32ConfirmedAt: string | null;
  finalEmailSentAt: string | null;
  playoffsOpenedAt: string | null;
  playoffsPredictionDeadline: string | null;
  playoffsOpenedBy: string | null;
}

export async function getTournamentState(competitionId: string): Promise<TournamentState> {
  const supabase = service();
  const { data } = await supabase
    .from("tournament_state")
    .select("r32_confirmed_at, final_email_sent_at, playoffs_opened_at, playoffs_prediction_deadline, playoffs_opened_by")
    .eq("competition_id", competitionId)
    .maybeSingle();
  return {
    r32ConfirmedAt: (data?.r32_confirmed_at as string) ?? null,
    finalEmailSentAt: (data?.final_email_sent_at as string) ?? null,
    playoffsOpenedAt: (data?.playoffs_opened_at as string) ?? null,
    playoffsPredictionDeadline: (data?.playoffs_prediction_deadline as string) ?? null,
    playoffsOpenedBy: (data?.playoffs_opened_by as string) ?? null,
  };
}

/** Open playoffs to regular users (or update the deadline). Never clears
 * playoffs_opened_at once set — there is no "close playoffs" flow. */
export async function openPlayoffs(input: {
  competitionId: string;
  deadline: string;        // ISO
  adminUserId: string;
}): Promise<void> {
  const supabase = service();
  const existing = await getTournamentState(input.competitionId);
  const row: Record<string, unknown> = {
    competition_id: input.competitionId,
    playoffs_prediction_deadline: input.deadline,
    updated_at: new Date().toISOString(),
  };
  // Stamp opened_at / opened_by only on the FIRST open; later calls just move the deadline.
  if (!existing.playoffsOpenedAt) {
    row.playoffs_opened_at = new Date().toISOString();
    row.playoffs_opened_by = input.adminUserId;
  }
  const { error } = await supabase
    .from("tournament_state")
    .upsert(row, { onConflict: "competition_id", ignoreDuplicates: false });
  if (error) throw new Error(error.message || "Failed to open playoffs");
}

/** Stamp the R32-confirmed time. Callers guard on getTournamentState first so
 * this is only invoked once; re-invoking simply refreshes the timestamp. */
export async function markR32Confirmed(competitionId: string): Promise<void> {
  const supabase = service();
  const { error } = await supabase
    .from("tournament_state")
    .upsert(
      { competition_id: competitionId, r32_confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "competition_id", ignoreDuplicates: false },
    );
  if (error) throw new Error(error.message || "Failed to set tournament state");
}

/** Stamp the final-standings-email-sent time. Set BEFORE the blast so a rapid
 * re-trigger (admin double-publish) can't double-send. Returns true if this call
 * won the guard (was previously unset), false if it was already set. */
export async function claimFinalEmailSend(competitionId: string): Promise<boolean> {
  const supabase = service();
  const existing = await getTournamentState(competitionId);
  if (existing.finalEmailSentAt) return false;
  const { error } = await supabase
    .from("tournament_state")
    .upsert(
      { competition_id: competitionId, final_email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "competition_id", ignoreDuplicates: false },
    );
  if (error) throw new Error(error.message || "Failed to set final email state");
  return true;
}
