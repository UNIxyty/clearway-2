import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import {
  isValidPassword,
  normalizeEmail,
  sha256Hex,
} from "@/lib/auth-email-flow-utils.mjs";

function createSupabaseFromCookies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // No-op for API handler reads.
      },
    },
  });
}

async function loadConfirmation(token: string) {
  const service = createSupabaseServiceRoleClient();
  if (!service) return { error: "Missing SUPABASE_SERVICE_ROLE_KEY", row: null };
  const tokenHash = sha256Hex(token);
  const { data, error } = await service
    .from("email_confirmations")
    .select("id, email, purpose, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return { error: "Invalid or expired token.", row: null };
  if (!String(data.purpose || "").startsWith("signup")) {
    return { error: "Invalid confirmation token purpose.", row: null };
  }
  if (data.used_at) return { error: "Token has already been used.", row: null };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { error: "Token has expired.", row: null };
  return { error: null, row: data };
}

function parseUserIdFromPurpose(purpose: string | null | undefined): string | null {
  const value = String(purpose || "");
  if (!value.startsWith("signup:")) return null;
  const maybeUserId = value.slice("signup:".length).trim();
  return maybeUserId || null;
}

async function findUserIdByEmail(email: string) {
  const service = createSupabaseServiceRoleClient();
  if (!service) return { error: "Missing SUPABASE_SERVICE_ROLE_KEY", userId: null as string | null };

  const targetEmail = normalizeEmail(email);
  const perPage = 200;
  // Safety bound to avoid unbounded scans in very large user sets.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) return { error: error.message, userId: null as string | null };

    const users = data?.users ?? [];
    const match = users.find((u) => normalizeEmail(u.email) === targetEmail);
    if (match?.id) return { error: null, userId: match.id };
    if (users.length < perPage) break;
  }
  return { error: "User account not found for this confirmation token.", userId: null as string | null };
}

async function notifyApprovalNeeded(userId: string, email: string): Promise<void> {
  const botToken = String(
    process.env.TELEGRAM_BUG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || ""
  ).trim();
  if (!botToken) return;
  const chatIds = String(
    process.env.TELEGRAM_BUG_ALLOWED_CHAT_IDS || process.env.TELEGRAM_DEBUG_ALLOWED_CHAT_IDS || ""
  )
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!chatIds.length) return;

  const service = createSupabaseServiceRoleClient();
  let name = "";
  if (service) {
    const { data: ud } = await service.auth.admin.getUserById(userId);
    const meta = (ud?.user?.user_metadata ?? {}) as Record<string, unknown>;
    name =
      (typeof meta.full_name === "string" ? meta.full_name : null) ??
      (typeof meta.name === "string" ? meta.name : null) ??
      "";
  }

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dateStr = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const text = [
    "<b>New account pending approval</b>",
    `Name: ${esc(name || "-")}`,
    `Email: ${esc(email)}`,
    `ID: ${userId}`,
    `Date: ${dateStr}`,
  ].join("\n");
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "Confirm", callback_data: `approval:approve:${userId}` },
        { text: "Decline", callback_data: `approval:decline:${userId}` },
      ],
    ],
  };

  for (const chatId of chatIds) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup: replyMarkup }),
    }).catch(() => undefined);
  }
}

async function syncDisplayNameFromMetadata(userId: string) {
  const service = createSupabaseServiceRoleClient();
  if (!service) return;

  const { data: userData } = await service.auth.admin.getUserById(userId);
  const metadata = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const rawName =
    (typeof metadata.full_name === "string" ? metadata.full_name : null) ??
    (typeof metadata.name === "string" ? metadata.name : null);
  const displayName = rawName?.trim();
  if (!displayName) return;

  const { error } = await service
    .from("user_preferences")
    .upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id" });
  if (error) {
    console.warn("[auth/email/confirm] could not sync display_name", { userId, error: error.message });
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ error: "Token is required." }, { status: 400 });

  const confirmation = await loadConfirmation(token);
  if (confirmation.error || !confirmation.row) {
    return NextResponse.json({ error: confirmation.error ?? "Invalid token." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, email: confirmation.row.email });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");
  if (!token) return NextResponse.json({ error: "Token is required." }, { status: 400 });
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const confirmation = await loadConfirmation(token);
  if (confirmation.error || !confirmation.row) {
    return NextResponse.json({ error: confirmation.error ?? "Invalid token." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });

  let targetUserId: string | null = null;
  const userIdFromPurpose = parseUserIdFromPurpose(confirmation.row.purpose);
  if (userIdFromPurpose) {
    targetUserId = userIdFromPurpose;
  }
  const supabase = createSupabaseFromCookies();
  if (!targetUserId && supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id && normalizeEmail(user.email) === normalizeEmail(confirmation.row.email)) {
      targetUserId = user.id;
    }
  }
  if (!targetUserId) {
    const lookup = await findUserIdByEmail(confirmation.row.email);
    if (lookup.error || !lookup.userId) {
      return NextResponse.json({ error: lookup.error ?? "Unable to locate invited user." }, { status: 404 });
    }
    targetUserId = lookup.userId;
  }

  const { error: updateError } = await service.auth.admin.updateUserById(targetUserId, {
    password,
    email_confirm: true,
  });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await syncDisplayNameFromMetadata(targetUserId);

  // Mark account as pending approval and notify Telegram.
  await service.auth.admin.updateUserById(targetUserId, {
    user_metadata: { is_approved: false },
  });
  await service
    .from("user_preferences")
    .upsert({ user_id: targetUserId, is_approved: false }, { onConflict: "user_id" });
  await notifyApprovalNeeded(targetUserId, confirmation.row.email);

  const { error: markUsedError } = await service
    .from("email_confirmations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", confirmation.row.id);
  if (markUsedError) {
    return NextResponse.json({ error: markUsedError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
