// Help Centre store — service-role Supabase CRUD. The API layer is the access
// control (RLS denies PostgREST); every caller must have been authenticated by
// lib/admin-auth first. The two status rules from the design are enforced HERE,
// not in any UI: Impossible cannot be saved without a written reason, and Done
// closes the thread to new replies after 48 hours.

import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import {
  HELP_BLOCK_TYPES,
  HELP_STATUSES,
  type HelpAttachment,
  type HelpBlock,
  type HelpContext,
  type HelpEvent,
  type HelpEventKind,
  type HelpMessage,
  type HelpPresence,
  type HelpStatus,
  type HelpThread,
  type HelpThreadType,
  helpThreadIsClosed,
} from "@/lib/help/shared";

const THREAD_COLS =
  "id,reference,type,title,status,status_reason,user_id,user_email,user_name,context,presence,presence_at,linked_from,ops_last_read_at,dev_last_read_at,last_message_at,created_at,updated_at,status_updated_at,status_updated_by";
const MESSAGE_COLS = "id,thread_id,author,author_id,author_name,blocks,client_key,created_at";
const EVENT_COLS = "id,thread_id,kind,payload,actor,created_at";
const ATTACHMENT_COLS = "id,thread_id,message_id,owner_id,name,size,mime,is_image,storage_key,created_at";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

function mapThread(r: Row): HelpThread {
  return {
    id: String(r.id),
    reference: String(r.reference || ""),
    type: String(r.type) as HelpThreadType,
    title: String(r.title || ""),
    status: String(r.status) as HelpStatus,
    statusReason: s(r.status_reason),
    userId: String(r.user_id),
    userEmail: s(r.user_email),
    userName: s(r.user_name),
    context: (r.context || {}) as HelpContext,
    presence: String(r.presence || "none") as HelpPresence,
    presenceAt: s(r.presence_at),
    linkedFrom: s(r.linked_from),
    opsLastReadAt: s(r.ops_last_read_at),
    devLastReadAt: s(r.dev_last_read_at),
    lastMessageAt: String(r.last_message_at || r.created_at || ""),
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || ""),
    statusUpdatedAt: String(r.status_updated_at || r.created_at || ""),
    statusUpdatedBy: s(r.status_updated_by),
  };
}

function mapMessage(r: Row): HelpMessage {
  return {
    id: String(r.id),
    threadId: String(r.thread_id),
    author: (r.author === "developer" ? "developer" : "ops"),
    authorId: s(r.author_id),
    authorName: s(r.author_name),
    blocks: sanitizeBlocks(r.blocks),
    clientKey: s(r.client_key),
    createdAt: String(r.created_at || ""),
  };
}

function mapEvent(r: Row): HelpEvent {
  return {
    id: String(r.id),
    threadId: String(r.thread_id),
    kind: String(r.kind) as HelpEventKind,
    payload: (r.payload || {}) as Record<string, unknown>,
    actor: s(r.actor),
    createdAt: String(r.created_at || ""),
  };
}

function mapAttachment(r: Row): HelpAttachment & { storageKey: string } {
  return {
    id: String(r.id),
    threadId: s(r.thread_id),
    messageId: s(r.message_id),
    ownerId: String(r.owner_id),
    name: String(r.name || "file"),
    size: Number(r.size || 0),
    mime: String(r.mime || "application/octet-stream"),
    isImage: Boolean(r.is_image),
    createdAt: String(r.created_at || ""),
    storageKey: String(r.storage_key || ""),
  };
}

const MAX_TEXT = 20_000;
const MAX_ITEMS = 200;

/** Keep only well-formed blocks; length-limit everything. Stored as data, never HTML. */
export function sanitizeBlocks(raw: unknown): HelpBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: HelpBlock[] = [];
  for (const b of raw.slice(0, 200)) {
    if (!b || typeof b !== "object") continue;
    const type = String((b as Row).type || "");
    if (!(HELP_BLOCK_TYPES as readonly string[]).includes(type)) continue;
    if (type === "divider") { out.push({ type: "divider" }); continue; }
    if (type === "attachment") {
      const id = String((b as Row).id || "").trim();
      if (id) out.push({ type: "attachment", id });
      continue;
    }
    if (type === "bullet" || type === "numbered") {
      const items = Array.isArray((b as Row).items)
        ? ((b as Row).items as unknown[]).slice(0, MAX_ITEMS).map((x) => String(x).slice(0, MAX_TEXT))
        : [];
      if (items.length) out.push({ type, items });
      continue;
    }
    if (type === "checklist") {
      const items = Array.isArray((b as Row).items)
        ? ((b as Row).items as unknown[]).slice(0, MAX_ITEMS).map((x) => {
            const it = (x || {}) as Row;
            return { text: String(it.text || "").slice(0, MAX_TEXT), checked: Boolean(it.checked) };
          })
        : [];
      if (items.length) out.push({ type: "checklist", items });
      continue;
    }
    const text = String((b as Row).text || "").slice(0, MAX_TEXT);
    if (text.trim() || type === "code") out.push({ type: type as "paragraph", text });
  }
  return out;
}

function service() {
  const client = createSupabaseServiceRoleClient();
  if (!client) throw new Error("Missing Supabase service role configuration");
  return client;
}

export async function createThread(input: {
  type: HelpThreadType;
  title: string;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
  context: HelpContext;
  linkedFrom?: string | null;
}): Promise<HelpThread> {
  const now = new Date().toISOString();
  const { data, error } = await service()
    .from("help_threads")
    .insert({
      type: input.type,
      title: input.title.slice(0, 300),
      user_id: input.userId,
      user_email: input.userEmail ?? null,
      user_name: input.userName ?? null,
      context: input.context,
      presence: input.type === "chat" || input.type === "urgent" ? "not_notified" : "none",
      linked_from: input.linkedFrom ?? null,
      created_at: now,
      updated_at: now,
      status_updated_at: now,
      last_message_at: now,
    })
    .select(THREAD_COLS)
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to create thread");
  return mapThread(data as Row);
}

export async function getThread(id: string): Promise<HelpThread | null> {
  const { data } = await service().from("help_threads").select(THREAD_COLS).eq("id", id).maybeSingle();
  return data ? mapThread(data as Row) : null;
}

export async function getThreadByReference(reference: string): Promise<HelpThread | null> {
  const { data } = await service()
    .from("help_threads").select(THREAD_COLS).eq("reference", reference.toUpperCase()).maybeSingle();
  return data ? mapThread(data as Row) : null;
}

export async function listThreadsForUser(userId: string, limit = 50): Promise<HelpThread[]> {
  const { data, error } = await service()
    .from("help_threads")
    .select(THREAD_COLS)
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(Math.min(limit, 200));
  if (error || !data) return [];
  return (data as Row[]).map(mapThread);
}

/** Developer inbox: every thread. Gated by requireDeveloper at the route. */
export async function listAllThreads(limit = 200): Promise<HelpThread[]> {
  const { data, error } = await service()
    .from("help_threads")
    .select(THREAD_COLS)
    .order("last_message_at", { ascending: false })
    .limit(Math.min(limit, 500));
  if (error || !data) return [];
  return (data as Row[]).map(mapThread);
}

export async function listMessages(threadId: string): Promise<HelpMessage[]> {
  const { data, error } = await service()
    .from("help_messages").select(MESSAGE_COLS).eq("thread_id", threadId).order("created_at", { ascending: true }).limit(500);
  if (error || !data) return [];
  return (data as Row[]).map(mapMessage);
}

export async function listEvents(threadId: string): Promise<HelpEvent[]> {
  const { data, error } = await service()
    .from("help_events").select(EVENT_COLS).eq("thread_id", threadId).order("created_at", { ascending: true }).limit(500);
  if (error || !data) return [];
  return (data as Row[]).map(mapEvent);
}

/** Latest ops/developer message per thread for list previews (one query, newest first). */
export async function latestMessagesByThread(threadIds: string[]): Promise<Map<string, HelpMessage>> {
  const out = new Map<string, HelpMessage>();
  if (!threadIds.length) return out;
  const { data } = await service()
    .from("help_messages")
    .select(MESSAGE_COLS)
    .in("thread_id", threadIds.slice(0, 200))
    .order("created_at", { ascending: false })
    .limit(1000);
  for (const r of (data || []) as Row[]) {
    const m = mapMessage(r);
    if (!out.has(m.threadId)) out.set(m.threadId, m);
  }
  return out;
}

/** Unread counts for one side of the conversation across many threads. */
export async function unreadCounts(
  threads: HelpThread[],
  forSide: "ops" | "developer",
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!threads.length) return out;
  const { data } = await service()
    .from("help_messages")
    .select("thread_id,author,created_at")
    .in("thread_id", threads.map((t) => t.id).slice(0, 200))
    .order("created_at", { ascending: false })
    .limit(2000);
  const bySince = new Map(threads.map((t) => [t.id, Date.parse((forSide === "ops" ? t.opsLastReadAt : t.devLastReadAt) || "") || 0]));
  const from = forSide === "ops" ? "developer" : "ops";
  for (const r of (data || []) as Row[]) {
    const tid = String(r.thread_id);
    if (String(r.author) !== from) continue;
    if ((Date.parse(String(r.created_at)) || 0) <= (bySince.get(tid) || 0)) continue;
    out.set(tid, (out.get(tid) || 0) + 1);
  }
  return out;
}

export class ThreadClosedError extends Error {
  constructor() { super("Thread is closed to new replies"); this.name = "ThreadClosedError"; }
}

export async function addMessage(input: {
  thread: HelpThread;
  author: "ops" | "developer";
  authorId?: string | null;
  authorName?: string | null;
  blocks: HelpBlock[];
  clientKey?: string | null;
}): Promise<HelpMessage> {
  // Done closes the thread to new replies after 48 hours — backend rule, not UI.
  if (helpThreadIsClosed(input.thread)) throw new ThreadClosedError();
  const blocks = sanitizeBlocks(input.blocks);
  if (!blocks.length) throw new Error("Message has no content");
  const now = new Date().toISOString();
  const insert = await service()
    .from("help_messages")
    .insert({
      thread_id: input.thread.id,
      author: input.author,
      author_id: input.authorId ?? null,
      author_name: input.authorName ?? null,
      blocks,
      client_key: input.clientKey ?? null,
      created_at: now,
    })
    .select(MESSAGE_COLS)
    .single();
  if (insert.error || !insert.data) {
    // Unique violation on (thread_id, client_key): the offline queue resent an
    // already-delivered message — return the original instead of duplicating.
    if (input.clientKey && String(insert.error?.code) === "23505") {
      const { data } = await service()
        .from("help_messages").select(MESSAGE_COLS)
        .eq("thread_id", input.thread.id).eq("client_key", input.clientKey).single();
      if (data) return mapMessage(data as Row);
    }
    throw new Error(insert.error?.message || "Failed to add message");
  }
  await service().from("help_threads")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", input.thread.id);
  return mapMessage(insert.data as Row);
}

export async function addEvent(input: {
  threadId: string;
  kind: HelpEventKind;
  payload?: Record<string, unknown>;
  actor?: string | null;
}): Promise<HelpEvent> {
  const { data, error } = await service()
    .from("help_events")
    .insert({ thread_id: input.threadId, kind: input.kind, payload: input.payload || {}, actor: input.actor ?? null })
    .select(EVENT_COLS)
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to add event");
  return mapEvent(data as Row);
}

export class ReasonRequiredError extends Error {
  constructor() { super("Impossible requires a written reason"); this.name = "ReasonRequiredError"; }
}

export async function setStatus(input: {
  thread: HelpThread;
  status: HelpStatus;
  reason?: string | null;
  actor: string;
}): Promise<{ thread: HelpThread; event: HelpEvent }> {
  if (!HELP_STATUSES.includes(input.status)) throw new Error("Invalid status");
  // Impossible cannot be saved without a written reason — backend rule, not UI.
  const reason = String(input.reason || "").trim();
  if (input.status === "impossible" && reason.length < 5) throw new ReasonRequiredError();
  const now = new Date().toISOString();
  const { data, error } = await service()
    .from("help_threads")
    .update({
      status: input.status,
      status_reason: input.status === "impossible" ? reason : input.thread.statusReason,
      status_updated_at: now,
      status_updated_by: input.actor,
      updated_at: now,
    })
    .eq("id", input.thread.id)
    .select(THREAD_COLS)
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to set status");
  const event = await addEvent({
    threadId: input.thread.id,
    kind: "status_changed",
    payload: { from: input.thread.status, to: input.status, ...(input.status === "impossible" ? { reason } : {}) },
    actor: input.actor,
  });
  return { thread: mapThread(data as Row), event };
}

export async function setPresence(input: {
  threadId: string;
  presence: HelpPresence;
  presenceAt?: string;
}): Promise<HelpThread | null> {
  const now = new Date().toISOString();
  const { data } = await service()
    .from("help_threads")
    .update({ presence: input.presence, presence_at: input.presenceAt ?? now, updated_at: now })
    .eq("id", input.threadId)
    .select(THREAD_COLS)
    .single();
  return data ? mapThread(data as Row) : null;
}

export async function markRead(threadId: string, side: "ops" | "developer"): Promise<void> {
  const now = new Date().toISOString();
  await service()
    .from("help_threads")
    .update(side === "ops" ? { ops_last_read_at: now } : { dev_last_read_at: now })
    .eq("id", threadId);
}

export async function setThreadTelegramMessage(input: { id: string; chatId: string; messageId: number }): Promise<void> {
  await service()
    .from("help_threads")
    .update({ telegram_chat_id: input.chatId, telegram_message_id: input.messageId, updated_at: new Date().toISOString() })
    .eq("id", input.id);
}

// ── Attachments ─────────────────────────────────────────────────────────────

export async function createAttachment(input: {
  ownerId: string;
  name: string;
  size: number;
  mime: string;
  isImage: boolean;
  storageKey: string;
}): Promise<HelpAttachment> {
  const { data, error } = await service()
    .from("help_attachments")
    .insert({
      owner_id: input.ownerId,
      name: input.name.slice(0, 200),
      size: input.size,
      mime: input.mime,
      is_image: input.isImage,
      storage_key: input.storageKey,
    })
    .select(ATTACHMENT_COLS)
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to record attachment");
  return mapAttachment(data as Row);
}

export async function getAttachment(id: string): Promise<(HelpAttachment & { storageKey: string }) | null> {
  const { data } = await service().from("help_attachments").select(ATTACHMENT_COLS).eq("id", id).maybeSingle();
  return data ? mapAttachment(data as Row) : null;
}

export async function listAttachments(ids: string[]): Promise<Array<HelpAttachment & { storageKey: string }>> {
  if (!ids.length) return [];
  const { data } = await service().from("help_attachments").select(ATTACHMENT_COLS).in("id", ids.slice(0, 50));
  return ((data || []) as Row[]).map(mapAttachment);
}

/** Bind pre-uploaded attachments to a message; only the uploader's own unbound files bind. */
export async function bindAttachments(input: { ids: string[]; ownerId: string; threadId: string; messageId: string }): Promise<void> {
  if (!input.ids.length) return;
  await service()
    .from("help_attachments")
    .update({ thread_id: input.threadId, message_id: input.messageId })
    .in("id", input.ids.slice(0, 50))
    .eq("owner_id", input.ownerId)
    .is("message_id", null);
}

// ── Saved replies ───────────────────────────────────────────────────────────

export type HelpSavedReply = {
  id: string; text: string; setsStatus: HelpStatus | null; useCount: number; createdAt: string; updatedAt: string;
};

function mapSavedReply(r: Row): HelpSavedReply {
  return {
    id: String(r.id),
    text: String(r.text || ""),
    setsStatus: (r.sets_status ? String(r.sets_status) : null) as HelpStatus | null,
    useCount: Number(r.use_count || 0),
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || ""),
  };
}

export async function listSavedReplies(): Promise<HelpSavedReply[]> {
  const { data } = await service()
    .from("help_saved_replies").select("id,text,sets_status,use_count,created_at,updated_at")
    .order("use_count", { ascending: false }).limit(50);
  return ((data || []) as Row[]).map(mapSavedReply);
}

export async function upsertSavedReply(input: { id?: string; text: string; setsStatus?: HelpStatus | null }): Promise<HelpSavedReply> {
  const now = new Date().toISOString();
  const payload = { text: input.text.slice(0, 2000), sets_status: input.setsStatus ?? null, updated_at: now };
  const q = input.id
    ? service().from("help_saved_replies").update(payload).eq("id", input.id)
    : service().from("help_saved_replies").insert({ ...payload, created_at: now });
  const { data, error } = await q.select("id,text,sets_status,use_count,created_at,updated_at").single();
  if (error || !data) throw new Error(error?.message || "Failed to save reply");
  return mapSavedReply(data as Row);
}

export async function deleteSavedReply(id: string): Promise<void> {
  await service().from("help_saved_replies").delete().eq("id", id);
}

export async function bumpSavedReplyUse(id: string): Promise<void> {
  const { data } = await service().from("help_saved_replies").select("use_count").eq("id", id).maybeSingle();
  if (!data) return;
  await service().from("help_saved_replies").update({ use_count: Number((data as Row).use_count || 0) + 1 }).eq("id", id);
}
