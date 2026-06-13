import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: comp } = await supabase
    .from('pickem_competitions')
    .select('id')
    .eq('slug', 'wc-2026')
    .single();
  if (!comp) return NextResponse.json({ error: 'Competition not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('pickem_teams')
    .select('id, name, short_name, flag_emoji, group_code, crest_url')
    .eq('competition_id', comp.id)
    .order('group_code')
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data });
}
