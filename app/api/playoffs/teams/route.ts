import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { flagFor } from '@/lib/playoffs/flags';

export async function GET() {
  const supabase = createSupabaseAdminClient();
  const { data: comp } = await supabase
    .from('pickem_competitions')
    .select('id')
    .eq('slug', 'wc-2026')
    .single();
  if (!comp) return NextResponse.json({ error: 'Competition not found' }, { status: 404 });

  // NOTE: pickem_teams has no flag_emoji column — derive it from short_name.
  const { data, error } = await supabase
    .from('pickem_teams')
    .select('id, name, short_name, group_code, crest_url')
    .eq('competition_id', comp.id)
    .order('group_code')
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const teams = (data ?? []).map(t => ({
    ...t,
    flag_emoji: flagFor(t.short_name as string),
  }));
  return NextResponse.json({ teams });
}
