import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendBracketConfirmation } from '@/server/emails/triggers/sendBracketConfirmation';
import { sendPredictionUpdateEmail, type PredictionChange } from '@/server/emails/triggers/sendPredictionUpdateEmail';
import {
  resolveSlotServer, resolveWinnerServer,
  type ResolveContext, type ServerMatch, type ServerTeam, type ServerPrediction,
} from '@/lib/playoffs/resolveBracketServer';

export const dynamic = 'force-dynamic';

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'FINAL', 'THIRD'];

interface ChangeRow {
  matchId: string;
  oldWinnerId: string | null;
  oldHomeScore: number | null;
  oldAwayScore: number | null;
}

function formatPick(team: ServerTeam | null, hs: number | null, as_: number | null): string {
  const name = team?.name ?? 'No pick';
  const flag = team?.flag ?? '';
  const score = (hs !== null && as_ !== null) ? `, ${hs}–${as_}` : '';
  return `${flag} ${name} to win${score}`.trim();
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if ('error' in auth) return auth.error;
  if (!auth.user.email) {
    return NextResponse.json({ error: 'No email on account.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const isFirstSubmit: boolean = body.isFirstSubmit !== false;
  const changeRows: ChangeRow[] = Array.isArray(body.changes) ? body.changes : [];
  const deadline = String(body.deadline ?? '');

  const displayName =
    String(auth.user.user_metadata?.display_name || auth.user.user_metadata?.name || '').trim() ||
    String(auth.user.email).split('@')[0];

  // ── Load the full bracket + this user's freshly-saved predictions from the DB ──
  const supabase = createSupabaseAdminClient();

  const [{ data: matchRows }, { data: predRows }] = await Promise.all([
    supabase
      .from('playoff_matches')
      .select('id, match_code, round, match_number, home_team_id, away_team_id'),
    supabase
      .from('playoff_predictions')
      .select('match_id, predicted_winner_id, predicted_home_score, predicted_away_score')
      .eq('user_id', auth.user.id),
  ]);

  const matches = matchRows ?? [];
  const preds = predRows ?? [];

  // Resolve every team referenced by an R32 slot or a predicted winner
  const teamIds = new Set<string>();
  matches.forEach(m => {
    if (m.home_team_id) teamIds.add(m.home_team_id as string);
    if (m.away_team_id) teamIds.add(m.away_team_id as string);
  });
  preds.forEach(p => { if (p.predicted_winner_id) teamIds.add(p.predicted_winner_id as string); });

  const teamsById = new Map<string, ServerTeam>();
  if (teamIds.size > 0) {
    const { data: teamRows } = await supabase
      .from('pickem_teams')
      .select('id, name, short_name, flag_emoji')
      .in('id', [...teamIds]);
    (teamRows ?? []).forEach(t => {
      teamsById.set(t.id as string, {
        id: t.id as string,
        name: (t.name as string) ?? (t.short_name as string) ?? 'TBD',
        flag: (t.flag_emoji as string) ?? '',
      });
    });
  }

  const matchesByCode: Record<string, ServerMatch> = {};
  const matchById = new Map<string, ServerMatch>();
  matches.forEach(m => {
    const sm: ServerMatch = {
      id: m.id as string,
      matchCode: m.match_code as string,
      round: m.round as string,
      matchNumber: (m.match_number as number) ?? null,
      homeTeamId: (m.home_team_id as string) ?? null,
      awayTeamId: (m.away_team_id as string) ?? null,
    };
    matchesByCode[sm.matchCode] = sm;
    matchById.set(sm.id, sm);
  });

  const predsByMatchId = new Map<string, ServerPrediction>();
  preds.forEach(p => {
    predsByMatchId.set(p.match_id as string, {
      predictedWinnerId: (p.predicted_winner_id as string) ?? null,
      predictedHomeScore: (p.predicted_home_score as number) ?? null,
      predictedAwayScore: (p.predicted_away_score as number) ?? null,
    });
  });

  const ctx: ResolveContext = { matchesByCode, predsByMatchId, teamsById };

  if (isFirstSubmit) {
    // Confirmation email — list every predicted match with resolved teams
    const picked = matches
      .filter(m => predsByMatchId.get(m.id as string)?.predictedWinnerId)
      .sort((a, b) =>
        (ROUND_ORDER.indexOf(a.round as string) - ROUND_ORDER.indexOf(b.round as string)) ||
        ((a.match_number as number) - (b.match_number as number)));

    const picks = picked.map(m => {
      const code = m.match_code as string;
      const home = resolveSlotServer(code, 'home', ctx);
      const away = resolveSlotServer(code, 'away', ctx);
      const pred = predsByMatchId.get(m.id as string)!;
      if (!home || !away) {
        // Observable signal: a predicted match could not resolve both teams from
        // the feeder graph. For R16+ this means an upstream pick is missing; if it
        // fires for an R32 match the bracket data is out of sync (a real bug).
        console.warn('[bracket-email] unresolved team in confirmation', {
          userId: auth.user.id, matchCode: code, round: m.round,
          homeResolved: !!home, awayResolved: !!away,
        });
      }
      return {
        round: m.round as string,
        homeName: home?.name ?? 'TBD',
        awayName: away?.name ?? 'TBD',
        homeFlag: home?.flag ?? '',
        awayFlag: away?.flag ?? '',
        homeScore: pred.predictedHomeScore,
        awayScore: pred.predictedAwayScore,
      };
    });

    const submittedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Riga',
    });

    sendBracketConfirmation({
      userId: auth.user.id,
      email: auth.user.email,
      displayName,
      picks,
      submittedAt,
      deadline,
    });
  } else if (changeRows.length > 0) {
    // Change email — render previous → updated for each changed match
    const changes: PredictionChange[] = changeRows.flatMap(ch => {
      const m = matchById.get(ch.matchId);
      if (!m) return [];
      const code = m.matchCode;
      const home = resolveSlotServer(code, 'home', ctx);
      const away = resolveSlotServer(code, 'away', ctx);
      const newWinner = resolveWinnerServer(code, ctx);
      const newPred = predsByMatchId.get(m.id);
      const oldWinner = ch.oldWinnerId ? (teamsById.get(ch.oldWinnerId) ?? null) : null;
      return [{
        round: m.round,
        matchLabel: m.matchNumber ? `Match ${m.matchNumber}` : code,
        teamA: `${home?.flag ?? ''} ${home?.name ?? 'TBD'}`.trim(),
        teamB: `${away?.flag ?? ''} ${away?.name ?? 'TBD'}`.trim(),
        previousPick: formatPick(oldWinner, ch.oldHomeScore, ch.oldAwayScore),
        updatedPick: formatPick(newWinner, newPred?.predictedHomeScore ?? null, newPred?.predictedAwayScore ?? null),
      }];
    });

    if (changes.length > 0) {
      const unchangedCount = preds.filter(p => p.predicted_winner_id).length - changes.length;
      sendPredictionUpdateEmail({
        userId: auth.user.id,
        email: auth.user.email,
        displayName,
        changes,
        unchangedCount: Math.max(0, unchangedCount),
        deadline,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
