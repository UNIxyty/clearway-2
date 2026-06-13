import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  // Admin check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('is_admin')
    .eq('user_id', user.id)
    .single();

  if (!prefs?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { matchId: string };
  if (!body.matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });

  const { error } = await supabase.rpc('calculate_playoff_points', { p_match_id: body.matchId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
