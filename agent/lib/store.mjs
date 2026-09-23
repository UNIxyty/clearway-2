// Supabase access for the agent service: allowlist, kill switch, audit log.
// Service-role key, used only AFTER the caller has been authenticated — the
// same arrangement as the Help Centre store (RLS denies PostgREST outright).

const REST_TIMEOUT_MS = 10_000;

function supabaseUrl() {
  return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
}
function serviceKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}
export function storeConfigured() {
  return Boolean(supabaseUrl() && serviceKey());
}

async function rest(pathAndQuery, { method = "GET", body = null, prefer = null } = {}) {
  if (!storeConfigured()) throw new Error("Supabase is not configured for the agent service.");
  const headers = {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${supabaseUrl()}/rest/v1/${pathAndQuery}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(REST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Supabase ${method} ${pathAndQuery} -> ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ── Kill switch ────────────────────────────────────────────────────────────

/**
 * The global switch. FAILS CLOSED: if the setting cannot be read, the agent is
 * treated as disabled. An aviation-ops tool must not stay up because its own
 * off-switch is unreachable.
 */
export async function agentEnabled() {
  try {
    const rows = await rest("agent_settings?id=eq.global&select=enabled,reason,updated_at,updated_by_email");
    const row = rows?.[0];
    if (!row) return { enabled: false, reason: "Agent settings row is missing — failing closed." };
    return { enabled: row.enabled === true, reason: row.reason ?? null, updatedAt: row.updated_at, updatedBy: row.updated_by_email };
  } catch (error) {
    return { enabled: false, reason: `Agent settings unreadable — failing closed: ${error.message}` };
  }
}

export async function setAgentEnabled({ enabled, actorId, actorEmail, reason }) {
  await rest("agent_settings?id=eq.global", {
    method: "PATCH",
    prefer: "return=representation",
    body: {
      enabled: Boolean(enabled),
      updated_at: new Date().toISOString(),
      updated_by: actorId ?? null,
      updated_by_email: actorEmail ?? null,
      reason: reason ?? null,
    },
  });
  return agentEnabled();
}

// ── Allowlist ──────────────────────────────────────────────────────────────

/** True only for a user with a live (un-revoked) grant. Fails CLOSED. */
export async function hasAgentAccess(userId) {
  if (!userId) return false;
  try {
    const rows = await rest(
      `agent_access?user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&select=id&limit=1`
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function listAccess({ includeRevoked = false } = {}) {
  const filter = includeRevoked ? "" : "&revoked_at=is.null";
  return (
    (await rest(
      `agent_access?select=id,user_id,user_email,granted_by,granted_by_email,granted_at,revoked_at,revoked_by,revoked_by_email,note${filter}&order=granted_at.desc&limit=500`
    )) ?? []
  );
}

export async function grantAccess({ userId, userEmail, actorId, actorEmail, note }) {
  // Re-granting someone who already has live access is a no-op, not a duplicate
  // row (the partial unique index would reject it anyway).
  if (await hasAgentAccess(userId)) {
    const rows = await rest(`agent_access?user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&select=*&limit=1`);
    return { row: rows?.[0] ?? null, created: false };
  }
  const rows = await rest("agent_access", {
    method: "POST",
    prefer: "return=representation",
    body: [{
      user_id: userId,
      user_email: userEmail ?? null,
      granted_by: actorId ?? null,
      granted_by_email: actorEmail ?? null,
      note: note ?? null,
    }],
  });
  return { row: rows?.[0] ?? null, created: true };
}

/** Soft revoke — keeps the history of who had access and when. */
export async function revokeAccess({ userId, actorId, actorEmail }) {
  const rows = await rest(`agent_access?user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null`, {
    method: "PATCH",
    prefer: "return=representation",
    body: {
      revoked_at: new Date().toISOString(),
      revoked_by: actorId ?? null,
      revoked_by_email: actorEmail ?? null,
    },
  });
  return { revoked: Array.isArray(rows) ? rows.length : 0 };
}

// ── Audit ──────────────────────────────────────────────────────────────────

/**
 * Append one audit row. Never throws: a failure to log must not take the agent
 * down, but it must be visible, so it goes to stderr.
 */
export async function audit(entry) {
  const row = {
    kind: entry.kind,
    user_id: entry.userId ?? null,
    user_email: entry.userEmail ?? null,
    actor_id: entry.actorId ?? null,
    actor_email: entry.actorEmail ?? null,
    conversation_id: entry.conversationId ?? null,
    model_tier: entry.modelTier ?? null,
    model_id: entry.modelId ?? null,
    tool_name: entry.toolName ?? null,
    tool_args: entry.toolArgs ?? null,
    tool_result: entry.toolResult ?? null,
    confirmation_status: entry.confirmationStatus ?? null,
    success: entry.success ?? null,
    error: entry.error ?? null,
    latency_ms: entry.latencyMs ?? null,
    input_tokens: entry.inputTokens ?? null,
    output_tokens: entry.outputTokens ?? null,
    detail: entry.detail ?? null,
  };
  try {
    await rest("agent_audit_log", { method: "POST", prefer: "return=minimal", body: [row] });
  } catch (error) {
    process.stderr.write(`[agent-audit] FAILED to persist ${entry.kind}: ${error.message}\n`);
  }
}

export async function listAudit({ limit = 100, userId = null, conversationId = null } = {}) {
  const parts = [`select=*`, `order=created_at.desc`, `limit=${Math.min(Number(limit) || 100, 500)}`];
  if (userId) parts.push(`user_id=eq.${encodeURIComponent(userId)}`);
  if (conversationId) parts.push(`conversation_id=eq.${encodeURIComponent(conversationId)}`);
  return (await rest(`agent_audit_log?${parts.join("&")}`)) ?? [];
}
