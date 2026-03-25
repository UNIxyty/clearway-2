import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    accountId?: string;
    username?: string;
    password?: string;
    confirmPassword?: string;
    temporaryPassword?: string;
  };

  const accountId = (body.accountId ?? "").trim();
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";
  const temporaryPassword = body.temporaryPassword ?? "";

  if (!accountId || !username || !password || !confirmPassword || !temporaryPassword) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const { data: account, error: accountErr } = await supabase
    .from("corporate_accounts")
    .select("id, temp_password_hash, requires_credential_setup")
    .eq("id", accountId)
    .maybeSingle();

  if (accountErr || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (!account.requires_credential_setup || !account.temp_password_hash) {
    return NextResponse.json({ error: "Temporary credentials are already inactive" }, { status: 400 });
  }
  if (sha256(temporaryPassword) !== account.temp_password_hash) {
    return NextResponse.json({ error: "Temporary credentials are invalid" }, { status: 401 });
  }

  const { error: updateErr } = await supabase
    .from("corporate_accounts")
    .update({
      username,
      password_hash: sha256(password),
      temp_password_hash: null,
      requires_credential_setup: false,
    })
    .eq("id", accountId);

  if (updateErr) {
    const msg = (updateErr.message || "").toLowerCase();
    if (msg.includes("duplicate key value")) {
      return NextResponse.json({ error: "Username is already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

