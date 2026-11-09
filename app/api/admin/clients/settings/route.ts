import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { NOT_READY, notifyList, onboardingReady, setNotifyList, setSupportEmail, supportEmail } from "@/lib/clients/onboarding";
import { TRY_AGAIN, failure } from "@/lib/public-error";

export const dynamic = "force-dynamic";
const NOT_SAVED = `The setting was not saved. ${TRY_AGAIN}`;

// Who is told about new client requests (2026-11-02): app_settings 'clients.notify_to', edited on Admin › Clients.
// And the address clients write to (2026-11-09): 'clients.support_email', shown on their Account and holding pages.
// PUT saves what it is given: `emails` (the whole notify list), `supportEmail` (one address, or "" for none), or both.
export async function GET() {
  try {
    const auth = await requirePermission("clients.manage"); if ("error" in auth) return auth.error;
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_SAVED, { tag: "ADMIN-CLIENTS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    if (!(await onboardingReady(service))) return NextResponse.json({ ok: false, error: NOT_READY, notReady: true }, { status: 503 }); // migration 0028 not applied yet
    return NextResponse.json({ ok: true, emails: await notifyList(service), supportEmail: await supportEmail(service) });
  } catch (error) { return failure(500, NOT_SAVED, { tag: "ADMIN-CLIENTS", what: "settings read failed", detail: error }); }
}
export async function PUT(request: Request) {
  try {
    const auth = await requirePermission("clients.manage"); if ("error" in auth) return auth.error;
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_SAVED, { tag: "ADMIN-CLIENTS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    if (!(await onboardingReady(service))) return NextResponse.json({ ok: false, error: NOT_READY, notReady: true }, { status: 503 }); // migration 0028 not applied yet
    const body = (await request.json().catch(() => ({}))) as { emails?: unknown; supportEmail?: unknown };
    const by = auth.user.email ?? null;
    if (typeof body.supportEmail === "string") {
      const s = await setSupportEmail(service, body.supportEmail, by);
      if ("problems" in s) return NextResponse.json({ ok: false, error: s.problems!.join(" ") }, { status: 400 });
      if (body.emails === undefined) return NextResponse.json({ ok: true, emails: await notifyList(service), supportEmail: s.email });
    }
    const out = await setNotifyList(service, Array.isArray(body.emails) ? body.emails.map(String) : [], by);
    if ("problems" in out) return NextResponse.json({ ok: false, error: out.problems!.join(" ") }, { status: 400 });
    return NextResponse.json({ ok: true, emails: out.emails, supportEmail: await supportEmail(service) });
  } catch (error) { return failure(500, NOT_SAVED, { tag: "ADMIN-CLIENTS", what: "settings save failed", detail: error }); }
}
