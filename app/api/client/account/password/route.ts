import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireClient } from "@/lib/admin-auth";
import { hourlyLimit } from "@/lib/caller-address.mjs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { failure, logFailure } from "@/lib/public-error";
import { appUrl, sendPortalEmail, templateEmail } from "@/lib/mail/send";

export const dynamic = "force-dynamic";

// A client changes their own password (2026-11-09, the client Account page). On the client allow-list
// (lib/clients/allow.mjs). The current password is checked HERE, on the server, against the session's own address —
// a session left open on someone's screen cannot set a new password without it. Ten characters, as when the account
// was made (lib/clients/onboarding.ts). The change signs out every session of the account; the page signs this device
// back in with the new password. The client gets an email from us saying it happened (recorded in Mailbox › Sent): if
// it was not them, they know.
// Eight tries an hour per account, right or wrong.
const NOT_CHANGED = "The password was not changed. Try again in a few minutes.";
const tries = hourlyLimit(8);

export async function POST(request: Request) {
  const auth = await requireClient();   // clients only; staff and unknown roles get 404
  if ("error" in auth) return auth.error;
  const meta = (auth.user.app_metadata ?? {}) as Record<string, unknown>;
  if (String(meta.client_status ?? "") !== "approved") return NextResponse.json({ error: "That is not on your account." }, { status: 404 });
  const email = String(auth.user.email ?? "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = createSupabaseServiceRoleClient();
  if (!url || !anonKey || !service || !email) return failure(503, NOT_CHANGED, { tag: "CLIENT-PASSWORD", what: "Supabase settings or the account's address missing" });
  if (!tries.take(auth.user.id)) return NextResponse.json({ error: "Too many tries in the last hour. Wait a while, then try again." }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { current?: unknown; next?: unknown };
  const current = typeof body.current === "string" ? body.current : "", next = typeof body.next === "string" ? body.next : "";
  if (!current) return NextResponse.json({ error: "Enter your current password.", field: "current" }, { status: 400 });
  if (next.length < 10) return NextResponse.json({ error: "The new password needs at least 10 characters.", field: "next" }, { status: 400 });
  if (next.length > 200) return NextResponse.json({ error: "The new password is too long (200 characters at most).", field: "next" }, { status: 400 });
  if (next === current) return NextResponse.json({ error: "The new password is the same as the current one.", field: "next" }, { status: 400 });

  // the current password, checked with a sign-in of its own that keeps nothing and is signed out again at once
  const probe = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: signed, error: wrong } = await probe.auth.signInWithPassword({ email, password: current });
  if (wrong || !signed?.session) {
    const bad = wrong?.code === "invalid_credentials" || /invalid login credentials/i.test(wrong?.message ?? "");
    if (!bad) logFailure("CLIENT-PASSWORD", "the current password could not be checked", wrong?.message);
    return bad ? NextResponse.json({ error: "That isn't your current password.", field: "current" }, { status: 400 }) : failure(503, NOT_CHANGED);
  }
  await probe.auth.signOut({ scope: "local" }).catch(() => {});

  const { error } = await service.auth.admin.updateUserById(auth.user.id, { password: next });
  if (error) return failure(500, NOT_CHANGED, { tag: "CLIENT-PASSWORD", what: "updateUserById failed", detail: error });

  // Changing a password this way ends EVERY session of the account, this one included (the auth service's rule for a
  // change made with the service key). The page signs this device in again with the new password; every other device
  // has to sign in with it too, which is the point.
  const mail = await templateEmail("12-client-password-changed", { email, changedAt: new Date(), device: request.headers.get("user-agent")?.slice(0, 80) || "", resetLink: `${appUrl(request)}/login?forgot=1` }, request);
  const sent = await sendPortalEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, kind: "client-password-changed", by: email, ref: null }).catch(() => ({ ok: false }));
  return NextResponse.json({ ok: true, noticeSent: Boolean(sent.ok) });
}
