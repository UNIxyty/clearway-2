// Conversation persistence. History is SERVER-side by design: the panel, the
// full page and a reload on another machine must all show the same thread, and
// the audit trail and what the user sees should be one story rather than two.
//
// Every read is scoped to the calling user's id in the query itself — not
// filtered after fetching — so one dispatcher can never load another's thread.

const REST_TIMEOUT_MS = 10_000;

function url() {
  return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
}
function key() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}
export function conversationsConfigured() {
  return Boolean(url() && key());
}

async function rest(pathAndQuery, { method = "GET", body = null, prefer = null } = {}) {
  const headers = { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${url()}/rest/v1/${pathAndQuery}`, {
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

const MESSAGE_COLS = "id,conversation_id,role,content,blocks,sources,tool_activity,model_id,model_tier,input_tokens,output_tokens,error,created_at";

function mapMessage(r) {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content ?? "",
    blocks: r.blocks ?? null,
    sources: r.sources ?? [],
    toolActivity: r.tool_activity ?? [],
    modelId: r.model_id ?? null,
    modelTier: r.model_tier ?? null,
    inputTokens: r.input_tokens ?? null,
    outputTokens: r.output_tokens ?? null,
    error: r.error ?? null,
    createdAt: r.created_at,
  };
}

function mapConversation(r) {
  return {
    id: r.id,
    title: r.title ?? "New conversation",
    context: r.context ?? null,
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
  };
}

/** A conversation the caller owns, or null. Ownership is part of the query. */
export async function getConversation(id, userId) {
  const rows = await rest(
    `agent_conversations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&archived_at=is.null&select=*&limit=1`
  );
  return rows?.[0] ? mapConversation(rows[0]) : null;
}

export async function listConversations(userId, limit = 30) {
  const rows = await rest(
    `agent_conversations?user_id=eq.${encodeURIComponent(userId)}&archived_at=is.null&select=*&order=last_message_at.desc&limit=${Math.min(limit, 100)}`
  );
  return (rows ?? []).map(mapConversation);
}

export async function createConversation({ userId, userEmail, title, context }) {
  const rows = await rest("agent_conversations", {
    method: "POST",
    prefer: "return=representation",
    body: [{
      user_id: userId,
      user_email: userEmail ?? null,
      // A title from the opening question beats "New conversation" in a list.
      title: title ? String(title).slice(0, 120) : null,
      context: context ?? null,
    }],
  });
  return rows?.[0] ? mapConversation(rows[0]) : null;
}

export async function listMessages(conversationId, userId, limit = 200) {
  // Ownership is proven before any message is read.
  const conversation = await getConversation(conversationId, userId);
  if (!conversation) return null;
  const rows = await rest(
    `agent_messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=${MESSAGE_COLS}&order=created_at.asc&limit=${Math.min(limit, 500)}`
  );
  return { conversation, messages: (rows ?? []).map(mapMessage) };
}

export async function appendMessage(input) {
  const rows = await rest("agent_messages", {
    method: "POST",
    prefer: "return=representation",
    body: [{
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content ?? "",
      blocks: input.blocks ?? null,
      sources: input.sources ?? null,
      tool_activity: input.toolActivity ?? null,
      model_id: input.modelId ?? null,
      model_tier: input.modelTier ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      error: input.error ?? null,
    }],
  });
  return rows?.[0] ? mapMessage(rows[0]) : null;
}

export async function archiveConversation(id, userId) {
  await rest(`agent_conversations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { archived_at: new Date().toISOString() },
  });
}

/** A short, honest title from the opening question. */
export function titleFrom(text) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 80 ? `${clean.slice(0, 79)}…` : clean;
}
