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

  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');

  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WC2026 Pick'em</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      background-color: #0f1e3c;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .logo { display: block; margin: 0 auto 24px; }
    .wordmark {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.5);
      text-align: center;
      margin-bottom: 48px;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      padding: 40px 36px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .icon {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 22px;
    }
    h1 {
      font-size: 18px;
      font-weight: 700;
      color: #0f1e3c;
      margin-bottom: 10px;
    }
    p {
      font-size: 14px;
      color: #6b7280;
      line-height: 1.65;
    }
    .divider {
      width: 40px;
      height: 2px;
      background: #f59e0b;
      margin: 16px auto;
    }
    .footer {
      margin-top: 36px;
      font-size: 11px;
      color: rgba(255,255,255,0.3);
      text-align: center;
    }
  </style>
</head>
<body>
  <img src="${base}/wc2026-logo.png" width="64" height="99" alt="WC2026" class="logo">
  <p class="wordmark">Pick'em</p>

  <div class="card">
    <div class="icon">🔕</div>
    <h1>You're unsubscribed</h1>
    <div class="divider"></div>
    <p>You've been removed from WC2026 Pick'em emails and won't receive any more prediction updates.</p>
  </div>

  <p class="footer">WC2026 Pick'em &mdash; powered by Clearway &amp; Verxyl</p>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  );
}
