import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { getClient } from "@/lib/clients/admin";
import { sendSetPasswordLink } from "@/lib/clients/onboarding";
import { appUrl } from "@/lib/mail/send";
import { TRY_AGAIN, failure } from "@/lib/public-error";

export const dynamic = "force-dynamic";
const NOT_SENT = `The link was not sent. ${TRY_AGAIN}`;

// Send an approved client who has not set a password yet a fresh link (2026-11-02). The older links stop working.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("clients.manage");
    if ("error" in auth) return auth.error;
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_SENT, { tag: "ADMIN-CLIENTS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    const { id } = await params;
    const row = await getClient(service, id);
    if (!row) return NextResponse.json({ ok: false, error: "No such client." }, { status: 404 });
    if (row.status !== "approved" || row.user_id) return NextResponse.json({ ok: false, error: row.user_id ? "They have set a password already; they sign in with it." : "Only an approved client gets a set-password link." }, { status: 409 });
    const sent = await sendSetPasswordLink(service, row, appUrl(request), auth.user.email ?? null);
    return NextResponse.json({ ok: sent.ok, email: sent, ...(sent.ok ? {} : { error: "The mail service did not accept the email. It is in Mailbox › Sent as failed." }) }, { status: sent.ok ? 200 : 500 });
  } catch (error) { return failure(500, NOT_SENT, { tag: "ADMIN-CLIENTS", what: "link failed", detail: error }); }
}
