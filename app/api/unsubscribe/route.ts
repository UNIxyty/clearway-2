import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyToken } from '@/server/utils/unsubscribeToken';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return new NextResponse('Missing token.', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const userId = verifyToken(token);
  if (!userId) {
    return new NextResponse('Invalid or expired link.', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const supabase = createSupabaseAdminClient();
  await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, email_opt_out: true }, { onConflict: 'user_id' });

  return new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Unsubscribed</title>
<style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;}
.card{background:#fff;border-radius:8px;padding:40px;max-width:420px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.1);}
h1{color:#0f1e3c;margin:0 0 12px;}p{color:#6b7280;line-height:1.6;margin:0;}</style>
</head><body><div class="card"><h1>✓ Unsubscribed</h1>
<p>You've been removed from WC2026 Pick'em emails. You won't receive any more prediction emails.</p>
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  );
}
