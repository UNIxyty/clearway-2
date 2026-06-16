import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { R32_LEFT_IDS, R32_RIGHT_IDS } from '@/lib/playoffs/bracketData';

export const dynamic = 'force-dynamic';

export async function POST() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const supabase = createSupabaseAdminClient();
  const r32Codes = [...R32_LEFT_IDS, ...R32_RIGHT_IDS];

  const { error } = await supabase
    .from('playoff_matches')
    .update({ home_team_id: null, away_team_id: null })
    .in('match_code', r32Codes);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, cleared: r32Codes.length });
}
