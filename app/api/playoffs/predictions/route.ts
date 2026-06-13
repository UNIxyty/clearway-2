import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('playoff_predictions')
    .select('id, match_id, winner_team_id, home_score, away_score, points_awarded, scored_at')
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ predictions: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    matchId: string;
    winnerId: string;
    homeScore?: number | null;
    awayScore?: number | null;
  };

  const { matchId, winnerId, homeScore, awayScore } = body;
  if (!matchId || !winnerId) return NextResponse.json({ error: 'matchId and winnerId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('playoff_predictions')
    .upsert(
      {
        user_id: user.id,
        match_id: matchId,
        winner_team_id: winnerId,
        home_score: homeScore ?? null,
        away_score: awayScore ?? null,
      },
      { onConflict: 'user_id,match_id' },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prediction: data });
}
