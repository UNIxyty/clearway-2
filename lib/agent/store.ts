// Portal-side agent store. Mirrors agent/lib/store.mjs, which the agent service
// uses; both talk to the same three tables (docs/supabase-agent-foundation.sql).
// The API layer is the access control — every caller is authenticated by
// lib/admin-auth first, and RLS denies PostgREST outright.

import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import type { AgentAccessRow, AgentKillSwitch } from "@/lib/agent/shared";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

function mapAccess(r: Row): AgentAccessRow {
  return {
    id: Number(r.id),
    userId: String(r.user_id),
    userEmail: s(r.user_email),
    grantedBy: s(r.granted_by),
    grantedByEmail: s(r.granted_by_email),
    grantedAt: String(r.granted_at ?? ""),
    revokedAt: s(r.revoked_at),
    revokedBy: s(r.revoked_by),
    revokedByEmail: s(r.revoked_by_email),
    note: s(r.note),
  };
}

export async function listAgentAccess(includeRevoked = false): Promise<AgentAccessRow[]> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return [];
  let query = service.from("agent_access").select("*").order("granted_at", { ascending: false }).limit(500);
  if (!includeRevoked) query = query.is("revoked_at", null);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Row[]).map(mapAccess);
}

export async function hasAgentAccess(userId: string): Promise<boolean> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return false; // fail closed
  const { data, error } = await service
    .from("agent_access")
    .select("id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .limit(1);
  if (error) return false; // fail closed
  return Array.isArray(data) && data.length > 0;
}

export async function grantAgentAccess(input: {
  userId: string;
  userEmail: string | null;
  actorId: string;
  actorEmail: string | null;
  note?: string | null;
}): Promise<{ row: AgentAccessRow | null; created: boolean }> {
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Supabase service role is not configured");
  if (await hasAgentAccess(input.userId)) {
    const rows = await listAgentAccess(false);
    return { row: rows.find((r) => r.userId === input.userId) ?? null, created: false };
  }
  const { data, error } = await service
    .from("agent_access")
    .insert({
      user_id: input.userId,
      user_email: input.userEmail,
      granted_by: input.actorId,
      granted_by_email: input.actorEmail,
      note: input.note ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { row: data ? mapAccess(data as Row) : null, created: true };
}

/** Soft revoke: the row stays so "who had access, when, granted by whom" survives. */
export async function revokeAgentAccess(input: {
  userId: string;
  actorId: string;
  actorEmail: string | null;
}): Promise<number> {
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Supabase service role is not configured");
  const { data, error } = await service
    .from("agent_access")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: input.actorId,
      revoked_by_email: input.actorEmail,
    })
    .eq("user_id", input.userId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.length : 0;
}

/** Fails CLOSED: an unreadable switch reads as disabled. */
export async function getKillSwitch(): Promise<AgentKillSwitch> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return { enabled: false, reason: "Supabase is not configured — failing closed.", updatedAt: null, updatedByEmail: null };
  const { data, error } = await service
    .from("agent_settings")
    .select("enabled,reason,updated_at,updated_by_email")
    .eq("id", "global")
    .maybeSingle();
  if (error || !data) {
    return {
      enabled: false,
      reason: error ? `Agent settings unreadable — failing closed: ${error.message}` : "Agent settings row is missing — failing closed.",
      updatedAt: null,
      updatedByEmail: null,
    };
  }
  const row = data as Row;
  return {
    enabled: row.enabled === true,
    reason: s(row.reason),
    updatedAt: s(row.updated_at),
    updatedByEmail: s(row.updated_by_email),
  };
}

export async function setKillSwitch(input: {
  enabled: boolean;
  actorId: string;
  actorEmail: string | null;
  reason: string | null;
}): Promise<AgentKillSwitch> {
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Supabase service role is not configured");
  const { error } = await service
    .from("agent_settings")
    .update({
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
      updated_by: input.actorId,
      updated_by_email: input.actorEmail,
      reason: input.reason,
    })
    .eq("id", "global");
  if (error) throw new Error(error.message);
  return getKillSwitch();
}

/** Append one audit row. Never throws — logging must not take a request down. */
export async function auditAgent(entry: {
  kind: string;
  userId?: string | null;
  userEmail?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  detail?: unknown;
  success?: boolean | null;
  error?: string | null;
}): Promise<void> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return;
  const { error } = await service.from("agent_audit_log").insert({
    kind: entry.kind,
    user_id: entry.userId ?? null,
    user_email: entry.userEmail ?? null,
    actor_id: entry.actorId ?? null,
    actor_email: entry.actorEmail ?? null,
    success: entry.success ?? true,
    error: entry.error ?? null,
    detail: (entry.detail ?? null) as never,
  });
  if (error) console.error("[agent-audit] failed to persist", entry.kind, error.message);
}
