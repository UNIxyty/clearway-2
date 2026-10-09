import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requirePermission } from "@/lib/permissions/server";

export async function POST(req: NextRequest) {
  const permission = await requirePermission("portal.pickem.admin");
  if ("error" in permission) return permission.error;
  const supabase = await createSupabaseServerClient();

  // Who may: Admin → Permissions (portal.pickem.admin), checked above.

  const body = await req.json() as { matchId: string };
  if (!body.matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });

  const { error } = await supabase.rpc('calculate_playoff_points', { p_match_id: body.matchId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
