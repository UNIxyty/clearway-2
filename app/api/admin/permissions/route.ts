// Admin → Permissions (docs/permissions.md): read the grid, and change cells. Both need permissions.manage.
// Every rule that stops this becoming a hole is checked here, on the server, before the database function
// (public.permission_apply) — which checks the lock-outs again and logs each change in the same transaction.
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { currentPerson, holds, requirePermission } from "@/lib/permissions/server";
import { ACTIONS, GROUPS, MANAGE, PINNED, ROLES, ROLE_LABELS, defaultGrants } from "@/lib/permissions/catalogue.mjs";
import { invalidateGrants } from "@/lib/permissions/grants.mjs";

export const dynamic = "force-dynamic";

type Row = { role: string; action: string; allowed: boolean; updated_at: string | null; updated_by_email: string | null };
type Change = { role: string; action: string; allowed: boolean };

async function readState() {
  const service = createSupabaseServiceRoleClient();
  if (!service) return { ok: false as const, error: "Missing SUPABASE_SERVICE_ROLE_KEY" };
  const [grants, log] = await Promise.all([
    service.from("permission_grants").select("role, action, allowed, updated_at, updated_by_email"),
    service.from("permission_changes").select("id, at, actor_email, role, action, allowed, previous, via").order("at", { ascending: false }).limit(400),
  ]);
  if (grants.error) return { ok: false as const, error: `Permissions could not be read: ${grants.error.message}` };
  return { ok: true as const, rows: (grants.data ?? []) as Row[], log: log.data ?? [] };
}

function view(rows: Row[]) {
  const d = defaultGrants();
  const grants: Record<string, Record<string, { allowed: boolean | null; default: boolean; pinned: boolean; at: string | null; by: string | null }>> = {};
  for (const role of ROLES) {
    grants[role] = {};
    for (const action of ACTIONS.keys()) {
      const row = rows.find((r) => r.role === role && r.action === action);
      grants[role][action] = {
        allowed: row ? row.allowed : null, // null: no row yet — an action added after the last decision; it counts as off
        default: d[role].has(action),
        pinned: PINNED.some(([r, a]) => r === role && a === action),
        at: row?.updated_at ?? null,
        by: row?.updated_by_email ?? null,
      };
    }
  }
  return grants;
}

export async function GET() {
  const who = await currentPerson();
  if ("error" in who) return who.error;
  if (!(await holds(who.role, MANAGE))) return NextResponse.json({ error: "Managing permissions needs the Manage permissions permission." }, { status: 403 });
  const state = await readState();
  if (!state.ok) return NextResponse.json({ error: state.error, groups: GROUPS, roles: ROLES }, { status: 503 });
  return NextResponse.json({
    roles: ROLES, roleLabels: ROLE_LABELS, groups: GROUPS, manage: MANAGE,
    grants: view(state.rows), log: state.log,
    me: { email: who.user.email ?? null, role: who.role },
  });
}

export async function POST(request: Request) {
  const auth = await requirePermission(MANAGE);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { changes?: Change[] };
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (!changes.length || changes.length > 1000) return NextResponse.json({ error: "Send 1 to 1000 changes." }, { status: 400 });
  for (const c of changes) {
    if (!ROLES.includes(c?.role) || !ACTIONS.has(c?.action) || typeof c?.allowed !== "boolean") {
      return NextResponse.json({ error: "Each change needs a known role, a known action and allowed true or false." }, { status: 400 });
    }
    // Rule 4a: the developer role always manages permissions.
    if (!c.allowed && PINNED.some(([r, a]) => r === c.role && a === c.action)) {
      return NextResponse.json({ error: `${ROLE_LABELS[c.role as keyof typeof ROLE_LABELS]} always keeps "${ACTIONS.get(c.action)?.label}". It cannot be switched off.` }, { status: 409 });
    }
    // Rule 4b: nobody removes their own ability to manage permissions.
    if (!c.allowed && c.action === MANAGE && c.role === auth.role) {
      return NextResponse.json({ error: "You cannot take Manage permissions away from your own role." }, { status: 409 });
    }
  }
  const state = await readState();
  if (!state.ok) return NextResponse.json({ error: state.error }, { status: 503 });
  // Rule 4c: at least one role keeps Manage permissions after this batch.
  const after = new Set(state.rows.filter((r) => r.action === MANAGE && r.allowed).map((r) => r.role));
  for (const c of changes) if (c.action === MANAGE) (c.allowed ? after.add(c.role) : after.delete(c.role));
  for (const [r, a] of PINNED) if (a === MANAGE) after.add(r);
  if (after.size === 0) return NextResponse.json({ error: "At least one role must keep Manage permissions." }, { status: 409 });

  const service = createSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  const { data, error } = await service.rpc("permission_apply", {
    p_changes: changes, p_actor_id: auth.user.id, p_actor_email: auth.user.email ?? null, p_via: "screen",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 409 : 500 });
  invalidateGrants();
  const fresh = await readState();
  return NextResponse.json({ ok: true, changed: data, grants: fresh.ok ? view(fresh.rows) : null, log: fresh.ok ? fresh.log : [] });
}
