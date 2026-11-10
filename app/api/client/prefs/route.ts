import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requireClient } from "@/lib/admin-auth";
import { failure } from "@/lib/public-error";

export const dynamic = "force-dynamic";

// A client's own view preferences (design "Client View v2", 2026-11-10): the start page they chose after setting
// their password (timeline | flights | null = never chose, which means Timeline) and the operators and aircraft they
// hid on their own screen. Saved on their account (user_metadata.client_prefs, written with the service key) so the
// choice follows them to the phone. A view filter and nothing more: it changes what their pages DRAW, never what the
// wall backend sends — that is their scope, decided by ops, and these keys are never read anywhere near it.
type Prefs = { start: "timeline" | "flights" | null; hidden: { operators: string[]; registrations: string[] } };

const list = (v: unknown, upper: boolean) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter((x) => x && x.length <= 16).map((x) => (upper ? x.toUpperCase() : x.toLowerCase())))].slice(0, 200) : []);
function normalisePrefs(p: unknown): Prefs {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  const hidden = (o.hidden && typeof o.hidden === "object" ? o.hidden : {}) as Record<string, unknown>;
  return { start: o.start === "flights" ? "flights" : o.start === "timeline" ? "timeline" : null, hidden: { operators: list(hidden.operators, false), registrations: list(hidden.registrations, true) } };
}

export async function GET() {
  const auth = await requireClient();
  if ("error" in auth) return auth.error;
  const meta = (auth.user.user_metadata ?? {}) as Record<string, unknown>; // metadata-ok: the person's own view preferences, nothing that grants
  return NextResponse.json({ ok: true, prefs: normalisePrefs(meta.client_prefs) });
}

export async function PUT(request: Request) {
  const auth = await requireClient();
  if ("error" in auth) return auth.error;
  const service = createSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const meta = (auth.user.user_metadata ?? {}) as Record<string, unknown>; // metadata-ok: see above
  const current = normalisePrefs(meta.client_prefs);
  const next: Prefs = { ...current };
  if ("start" in body) next.start = body.start === "flights" ? "flights" : body.start === "timeline" ? "timeline" : null;
  if ("hidden" in body) next.hidden = normalisePrefs({ hidden: body.hidden }).hidden;
  const { error } = await service.auth.admin.updateUserById(auth.user.id, { user_metadata: { ...meta, client_prefs: next } });
  if (error) return failure(503, "The choice could not be saved. Try again.", { tag: "client-prefs", what: "could not save a client's view preferences", detail: error }, { ok: false });
  return NextResponse.json({ ok: true, prefs: next });
}
