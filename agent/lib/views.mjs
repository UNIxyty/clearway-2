// Data for the agent's supporting views (design spec §9–§12) and the
// composer's live suggestions (§4.22). Every function runs AS the requester:
// what is returned is what that person may see, decided here, not in the UI.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { rest as knowledgeRest } from "./knowledge/retrieval.mjs";
import { listAccess, agentEnabled } from "./store.mjs";
import { wallGet } from "./tools/http.mjs";
import { loadModelConfig } from "./models.mjs";
import { extractText } from "./knowledge/ingest.mjs";

const url = () => String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
async function rest(pathAndQuery, init = {}) {
  const headers = { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers ?? {}) };
  const response = await fetch(`${url()}/rest/v1/${pathAndQuery}`, { ...init, headers, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathAndQuery} -> ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const isPrivileged = (user) => user.agentRole === "admin" || user.agentRole === "developer";

// ── Activity log (§11) ────────────────────────────────────────────────────────
//
// One row per tool the agent ran. Everyone sees their own rows; admins and
// developers see everyone's. The KIND badge is derived from what the tool
// does, not from its name alone, so a new tool lands in the right column.
const KIND_OF = (toolName, row) => {
  if (/^(send_email|email_document)$/.test(toolName)) return "SEND";
  if (/^generate_file$/.test(toolName)) return "FILE";
  if (row.confirmation_status === "pending" || row.confirmation_status === "confirmed" || row.confirmation_status === "rejected") return "WRITE";
  if (/^(create_|update_|delete_|restore_|purge_|set_|undo_)/.test(toolName)) return "WRITE";
  return "READ";
};
function resultLine(row, kind) {
  if (row.tool_name === "citation.check") return row.success ? { text: "Citation verified", tone: "ok" } : { text: "Citation not found", tone: "danger" };
  if (row.tool_name === "verbatim.check") return row.success ? { text: "Quoted text matches", tone: "ok" } : { text: "Data error · text differs", tone: "danger" };
  const r = row.tool_result ?? {};
  if (row.confirmation_status === "pending") return { text: "Awaiting confirmation", tone: "muted" };
  if (row.confirmation_status === "rejected") return { text: "Not run", tone: "muted" };
  if (row.success === false) {
    const err = String(row.error ?? "");
    if (/NO_PERMISSION|403/.test(err)) return { text: "Denied · 403", tone: "danger" };
    if (/CONFIRMATION_/.test(err)) return { text: "Not run", tone: "muted" };
    return { text: err.split(":")[0].slice(0, 40) || "Failed", tone: "danger" };
  }
  if (kind === "SEND") return { text: r.sent ? "Delivered" : r.needsConfirmation ? "Not sent" : "Sent", tone: r.sent ? "ok" : "muted" };
  if (kind === "FILE") return { text: r.file ? `1 file · ${Math.max(1, Math.round((r.file.bytes ?? 0) / 1024))} KB` : "1 file", tone: "ok" };
  if (kind === "WRITE") return { text: "Applied", tone: "ok" };
  if (typeof r.count === "number") return { text: `${r.count} result${r.count === 1 ? "" : "s"}`, tone: "ok" };
  if (r.cached === true && r.available === false) return { text: "Cached · source down", tone: "warn" };
  return { text: "ok", tone: "ok" };
}
export async function listActivity(user, { filter = "all", person = null, tool = null, date = null, limit = 60, before = null } = {}) {
  const parts = ["kind=in.(tool.call,citation.check,verbatim.check)", "select=id,created_at,user_id,user_email,tool_name,tool_args,tool_result,confirmation_status,success,error,latency_ms,conversation_id,detail", "order=created_at.desc", `limit=${Math.min(Number(limit) || 60, 200)}`];
  if (!isPrivileged(user)) parts.push(`user_id=eq.${encodeURIComponent(user.userId)}`);
  else if (person) parts.push(`user_email=eq.${encodeURIComponent(person)}`);
  if (tool) parts.push(`tool_name=eq.${encodeURIComponent(tool)}`);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { parts.push(`created_at=gte.${date}T00:00:00Z`); parts.push(`created_at=lte.${date}T23:59:59Z`); }
  if (before) parts.push(`created_at=lt.${encodeURIComponent(before)}`);
  const rows = (await rest(`agent_audit_log?${parts.join("&")}`)) ?? [];
  const mapped = rows.map((row) => {
    const kind = KIND_OF(row.tool_name, row);
    const result = resultLine(row, kind);
    const confirmed = row.confirmation_status === "confirmed" ? { text: `Confirmed ${hms(row.created_at)}`, tone: "ok" }
      : row.confirmation_status === "rejected" ? { text: `Declined ${hms(row.created_at)}`, tone: "muted" }
      : row.confirmation_status === "pending" ? { text: "Awaiting", tone: "warn" }
      : kind === "READ" ? { text: "Not required", tone: "faint" } : { text: "—", tone: "faint" };
    return {
      id: row.id, at: row.created_at, who: row.user_email ?? "—", kind, tool: row.tool_name, args: row.tool_args ?? {},
      result, confirmed, conversationId: row.conversation_id ?? null, latencyMs: row.latency_ms ?? null,
      hasRecord: kind !== "READ" || row.success === false,
      full: { args: row.tool_args ?? {}, result: row.tool_result ?? null, error: row.error ?? null, confirmationStatus: row.confirmation_status ?? null, level: row.detail?.level ?? null },
    };
  });
  const filtered = mapped.filter((r) => filter === "changes" ? r.kind === "WRITE" : filter === "sent" ? r.kind === "SEND" : filter === "denied" ? /Denied|Not run/.test(r.result.text) || r.confirmed.text.startsWith("Declined") : true);
  const people = isPrivileged(user) ? [...new Set(mapped.map((r) => r.who))].sort() : [user.email];
  const tools = [...new Set(mapped.map((r) => r.tool))].sort();
  return { rows: filtered, people, tools, nextBefore: rows.length ? rows[rows.length - 1].created_at : null };
}
const hms = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}Z`; };

/** The request behind a record: the last user message before it in that thread. */
export async function requestBehind(conversationId, at, user) {
  if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) return null;
  const conv = (await rest(`agent_conversations?id=eq.${conversationId}${isPrivileged(user) ? "" : `&user_id=eq.${user.userId}`}&select=id,title&limit=1`).catch(() => null))?.[0];
  if (!conv) return null;
  const msgs = await rest(`agent_messages?conversation_id=eq.${conversationId}&role=eq.user&created_at=lte.${encodeURIComponent(at)}&select=content,created_at&order=created_at.desc&limit=1`).catch(() => []);
  return { conversationId, title: conv.title, text: msgs?.[0]?.content ?? null };
}
export function activityCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return ["time,who,kind,tool,arguments,result,confirmed", ...rows.map((r) => [r.at, r.who, r.kind, r.tool, JSON.stringify(r.args), r.result.text, r.confirmed.text].map(esc).join(","))].join("\n");
}

// ── Settings (§12) ────────────────────────────────────────────────────────────
//
// Capabilities are rows in agent_settings (id = cap:<key>), so no schema
// change. Toggling one is a write the audit log records. The write switch
// removes the capability; it cannot remove confirmation -- there is no
// "don't ask" mode, by design.
export const CAPABILITIES = [
  { key: "web_search", label: "Web search", description: "Public sources, shown in amber with URL and time. Off: company and internal only.", default: true },
  { key: "voice", label: "Voice", description: "Push-to-talk and the ⌥ Space keybind. Audio is discarded after transcription.", default: true },
  { key: "write_actions", label: "Write actions", description: "Wall, NOTAM Check, limitations. Always asks first; this switch only removes the ability.", default: true },
  { key: "send_email", label: "Send email", description: "Through Resend, signed with the requester's name. Always asks first.", default: true },
  { key: "auto_approve_reference", label: "Auto-approve reference uploads", description: "Authoritative uploads always need an approver regardless.", default: false },
  { key: "reasoning_routing", label: "High-knowledge model", description: "The router may send heavy tasks (multi-source briefings, conflicting rules, multi-record changes) to the reasoning model. Off: fast and standard only.", default: true },
];
let capCache = { at: 0, values: null };
export async function capabilities({ reload = false } = {}) {
  if (!reload && capCache.values && Date.now() - capCache.at < 30_000) return capCache.values;
  const rows = (await rest("agent_settings?id=like.cap%3A*&select=id,enabled").catch(() => [])) ?? [];
  const values = {};
  for (const c of CAPABILITIES) values[c.key] = c.default;
  for (const r of rows) { const k = String(r.id).slice(4); if (k in values) values[k] = r.enabled === true; }
  capCache = { at: Date.now(), values };
  return values;
}
export async function setCapability(key, enabled, user) {
  if (!CAPABILITIES.some((c) => c.key === key)) throw new Error(`Unknown capability ${key}`);
  await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: `cap:${key}`, enabled: Boolean(enabled), updated_at: new Date().toISOString(), updated_by: user.userId, updated_by_email: user.email ?? null, reason: `${enabled ? "enabled" : "disabled"} by ${user.email}` }]) });
  capCache = { at: 0, values: null };
  return capabilities({ reload: true });
}
// ── Keyboard shortcuts (§15, made editable) ──────────────────────────────────
// Organisation-wide, admins only. Stored in the existing agent_settings row
// `keybinds`: `enabled` = separate Mac/Windows sets, `reason` = the JSON.
// (A jsonb column would be cleaner; that is DDL the operator has to run.)
// A bind is "Mod+Shift+K": Mod means ⌘ on Mac and Ctrl on Windows; Meta/Ctrl
// are literal and only make sense in the per-platform sets. Esc is not editable.
export const KEYBIND_ACTIONS = [
  { key: "open", label: "Open or close the panel", description: "Anywhere in the console and on the wall console." },
  { key: "expand", label: "Expand to the full page · back to the panel", description: "Carries the thread with it." },
  { key: "confirm", label: "Confirm a standard change", description: "Only while a confirmation card is showing. Destructive changes have no keyboard confirm." },
  { key: "voice", label: "Push to talk (hold)", description: "Hold to speak, release to send. Shown in the composer; voice itself is not wired yet." },
];
export const KEYBIND_DEFAULTS = { open: "Mod+J", expand: "Mod+Shift+J", confirm: "Mod+Enter", voice: "Alt+Space" };
const BIND_RE = /^((Mod|Meta|Ctrl|Alt|Shift)\+)+(Enter|Space|Escape|[A-Z0-9]|F[1-9]|F1[0-2]|Arrow(Up|Down|Left|Right)|[\[\]\\;',./`=-])$/;
export function normalizeKeybinds(input) {
  const out = { perPlatform: Boolean(input?.perPlatform), shared: {}, mac: {}, windows: {} };
  for (const set of ["shared", "mac", "windows"]) {
    for (const a of KEYBIND_ACTIONS) {
      const raw = String(input?.[set]?.[a.key] ?? KEYBIND_DEFAULTS[a.key]).trim();
      if (!BIND_RE.test(raw)) throw new Error(`Invalid shortcut for ${a.key}: ${raw}`);
      out[set][a.key] = raw;
    }
    const seen = new Set();
    for (const a of KEYBIND_ACTIONS) { if (seen.has(out[set][a.key])) throw new Error(`Two actions share ${out[set][a.key]}.`); seen.add(out[set][a.key]); }
  }
  return out;
}
let bindCache = { at: 0, values: null };
export async function keybinds({ reload = false } = {}) {
  if (!reload && bindCache.values && Date.now() - bindCache.at < 30_000) return bindCache.values;
  const row = (await rest("agent_settings?id=eq.keybinds&select=enabled,reason").catch(() => []))?.[0];
  let values;
  try { values = normalizeKeybinds(row ? { perPlatform: row.enabled === true, ...JSON.parse(row.reason || "{}") } : null); } catch { values = normalizeKeybinds(null); }
  bindCache = { at: Date.now(), values };
  return values;
}
export async function setKeybinds(input, user) {
  const values = normalizeKeybinds(input);
  const { perPlatform, ...sets } = values;
  await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: "keybinds", enabled: perPlatform, reason: JSON.stringify(sets), updated_at: new Date().toISOString(), updated_by: user.userId, updated_by_email: user.email ?? null }]) });
  bindCache = { at: 0, values: null };
  return values;
}

/** Who can do what -- from the allowlist and each person's role, read-only here. */
export async function permissionsMatrix() {
  const rows = await listAccess({ includeRevoked: false });
  return rows.map((r) => {
    const role = String(r.note ?? "").match(/role:(\w+)/)?.[1] ?? null;
    return { userId: r.user_id, email: r.user_email, name: r.user_email, read: "yes", wall: "ask", sendEmail: "ask", approveKb: role === "developer" ? "yes" : "no" };
  });
}

// ── Usage (§12) ───────────────────────────────────────────────────────────────
export async function usageThisMonth() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const cfg = loadModelConfig();
  const pricing = cfg.pricing ?? {};
  const rows = (await rest(`agent_audit_log?kind=eq.chat.response&created_at=gte.${encodeURIComponent(from)}&select=user_email,model_id,input_tokens,output_tokens,detail&limit=5000`).catch(() => [])) ?? [];
  const toolRows = (await rest(`agent_audit_log?kind=eq.tool.call&created_at=gte.${encodeURIComponent(from)}&select=id&limit=1`, { headers: { Prefer: "count=exact" } }).catch(() => null));
  const rate = (modelId) => { const k = Object.keys(pricing).find((p) => String(modelId ?? "").includes(p)); return pricing[k] ?? pricing.default ?? { input: 3, output: 15, cacheRead: 0.3 }; };
  let eur = 0; const perUser = {};
  for (const r of rows) {
    const p = rate(r.model_id); const inTok = r.input_tokens ?? 0, outTok = r.output_tokens ?? 0, cr = r.detail?.cacheReadTokens ?? 0;
    const usd = (inTok / 1e6) * p.input + (outTok / 1e6) * p.output + (cr / 1e6) * (p.cacheRead ?? p.input * 0.1);
    const e = usd * Number(process.env.AGENT_USD_TO_EUR || 0.92); eur += e; perUser[r.user_email ?? "—"] = (perUser[r.user_email ?? "—"] ?? 0) + e;
  }
  const heaviest = Object.entries(perUser).sort((a, b) => b[1] - a[1])[0] ?? null;
  const toolCalls = await rest(`agent_audit_log?kind=eq.tool.call&created_at=gte.${encodeURIComponent(from)}&select=id`).then((r) => (r ?? []).length).catch(() => 0);
  return {
    month: now.toLocaleString("en-GB", { month: "long", timeZone: "UTC" }).toUpperCase(),
    spendEur: Math.round(eur * 100) / 100, capEur: Number(process.env.AGENT_MONTHLY_CAP_EUR || 250),
    replies: rows.length, toolCalls,
    heaviest: heaviest ? { email: heaviest[0], eur: Math.round(heaviest[1] * 100) / 100 } : null,
    model: String(cfg.tiers?.standard?.id ?? "").split(".").slice(-1)[0].replace(/-\d{8}.*$/, "") || null,
    voice: (await capabilities()).voice,
  };
}

// ── Knowledge base (§10) ──────────────────────────────────────────────────────
export async function knowledgeStats() {
  const docs = (await knowledgeRest("agent_documents?select=id,tier,status,proposed_tier,created_at").catch(() => [])) ?? [];
  const clauses = (await knowledgeRest("agent_tier1_records?retired_at=is.null&select=id").catch(() => [])) ?? [];
  const waiting = docs.filter((d) => d.status === "awaiting_approval" || d.status === "classified" || d.status === "uploaded");
  const oldest = waiting.map((d) => Date.now() - new Date(d.created_at).getTime()).sort((a, b) => b - a)[0] ?? null;
  return {
    authoritative: docs.filter((d) => d.tier === "tier1" && (d.status === "approved" || d.status === "indexed")).length,
    clauses: clauses.length,
    reference: docs.filter((d) => d.tier === "tier2" && (d.status === "approved" || d.status === "indexed")).length,
    awaiting: waiting.length, oldestWaitingDays: oldest != null ? Math.floor(oldest / 86_400_000) : null,
    failed: docs.filter((d) => d.status === "failed").length,
  };
}
/** Proposed clauses from a document's text: numbered paragraphs, for the approver to check one by one. */
export async function proposedClauses(documentId) {
  const doc = (await knowledgeRest(`agent_documents?id=eq.${encodeURIComponent(documentId)}&select=id,storage_key,mime,filename,title&limit=1`))?.[0];
  if (!doc) return null;
  const root = process.env.STORAGE_ROOT || "/storage";
  let text = null;
  try { text = extractText(await readFile(path.resolve(root, doc.storage_key)), doc.mime, doc.filename); } catch { text = null; }
  if (!text) return { documentId, clauses: [], extracted: false };
  const clauses = [];
  const re = /^\s*(\d+(?:\.\d+)+)\s+([\s\S]*?)(?=^\s*\d+(?:\.\d+)+\s|\Z)/gm;
  let m; while ((m = re.exec(text)) && clauses.length < 200) clauses.push({ reference: m[1], text: `${m[1]}  ${m[2].trim().replace(/\s*\n\s*/g, " ")}` });
  if (clauses.length === 0) text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 40).slice(0, 60).forEach((p, i) => clauses.push({ reference: `¶${i + 1}`, text: p }));
  return { documentId, clauses, extracted: true, title: doc.title };
}

// ── History (§9) ──────────────────────────────────────────────────────────────
export async function searchConversations(user, { q = "", filter = [], limit = 80 } = {}) {
  const convs = (await rest(`agent_conversations?user_id=eq.${encodeURIComponent(user.userId)}&archived_at=is.null&select=id,title,context,created_at,last_message_at&order=last_message_at.desc&limit=${Math.min(limit, 200)}`)) ?? [];
  if (convs.length === 0) return { conversations: [], total: 0 };
  const ids = convs.map((c) => c.id);
  const msgs = (await rest(`agent_messages?conversation_id=in.(${ids.join(",")})&select=conversation_id,role,content,blocks,tool_activity,created_at&order=created_at.asc&limit=${Math.min(ids.length * 60, 4000)}`)) ?? [];
  const byConv = new Map();
  for (const m of msgs) { if (!byConv.has(m.conversation_id)) byConv.set(m.conversation_id, []); byConv.get(m.conversation_id).push(m); }
  const needle = String(q ?? "").trim().toLowerCase();
  const out = [];
  for (const c of convs) {
    const list = byConv.get(c.id) ?? [];
    const last = list[list.length - 1];
    const changes = list.reduce((n, m) => n + (m.blocks?.actions?.length ?? 0), 0);
    const files = list.reduce((n, m) => n + (m.blocks?.files?.length ?? 0), 0);
    const voice = list.some((m) => /^\[voice\]/.test(m.content ?? ""));
    const sent = list.reduce((n, m) => n + (m.tool_activity ?? []).filter((t) => /^(send_email|email_document)$/.test(t.name) && t.ok).length, 0);
    const entities = new Set();
    for (const m of list) for (const e of String(m.content ?? "").match(/\b(?:[A-Z]{4}|[A-Z]{2,3}\d{2,4}[A-Z]?|[A-Z]{1,2}-[A-Z]{3,4}|LIM-[A-Z0-9]+)\b/g) ?? []) entities.add(e);
    const hay = `${c.title ?? ""} ${list.map((m) => m.content ?? "").join(" ")}`.toLowerCase();
    if (needle && !hay.includes(needle)) continue;
    if (filter.includes("changes") && changes === 0) continue;
    if (filter.includes("files") && files === 0) continue;
    if (filter.includes("voice") && !voice) continue;
    out.push({ id: c.id, title: c.title, context: c.context ?? null, lastMessageAt: c.last_message_at ?? c.created_at, createdAt: c.created_at, messageCount: list.length, changes, files, sent, voice, snippet: String(last?.content ?? "").replace(/\s+/g, " ").slice(0, 160), entities: [...entities].slice(0, 6) });
  }
  return { conversations: out, total: convs.length };
}

// ── Suggested questions (§4.22, §6.6) — from what is happening now ────────────
export async function suggestions(user, context) {
  const wall = await wallGet("/api/timeline/flights", user, { timeoutMs: 8_000 }).catch(() => null);
  const flights = Array.isArray(wall?.flights) ? wall.flights : Array.isArray(wall?.aircraft) ? wall.aircraft.flatMap((a) => a.flights ?? []) : [];
  const delayed = flights.filter((f) => (f.delayMinutes ?? f.delay ?? 0) > 0 || /delay/i.test(String(f.status ?? "")));
  const notam = await wallGet("/api/notam-check/today", user, { timeoutMs: 8_000 }).catch(() => null);
  const outstanding = notam?.outstandingCount ?? (Array.isArray(notam?.outstanding) ? notam.outstanding.length : null);
  const recent = (await rest(`agent_conversations?user_id=eq.${encodeURIComponent(user.userId)}&archived_at=is.null&select=id,title,last_message_at&order=last_message_at.desc&limit=2`).catch(() => [])) ?? [];
  const firstName = String(user.name || user.email || "").split(/[\s@.]/)[0] || null;
  const hour = new Date().getUTCHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  return {
    greeting: firstName ? `${greeting}, ${firstName}.` : `${greeting}.`,
    flightsToday: flights.length, delayed: delayed.length, delayedCallsigns: delayed.slice(0, 2).map((f) => f.callsign ?? f.flightNid).filter(Boolean),
    notamOutstanding: outstanding,
    recent: recent.map((c) => ({ id: c.id, title: c.title, at: c.last_message_at })),
    context: context ?? null,
  };
}

// ── Attachments (§4.18) ───────────────────────────────────────────────────────
//
// Real uploads: bytes on the agent's storage volume, metadata in a sidecar,
// text extracted for the formats the platform can read. A PDF or image is
// attached to the question by name only -- honestly, with no text -- until
// the platform's PDF pipeline is wired to it.
const ATTACH_MAX = 25 * 1024 * 1024;
const ATTACH_TYPES = /\.(pdf|png|jpe?g|gif|webp|csv|xlsx|txt|md|json)$/i;
export async function storeAttachment({ name, buffer, mime, user }) {
  if (!ATTACH_TYPES.test(name)) throw new Error("Only PDF, images, CSV, XLSX and TXT can be attached.");
  if (buffer.length > ATTACH_MAX) throw new Error(`${name} is ${(buffer.length / 1048576).toFixed(1)} MB — over the 25 MB limit.`);
  const id = randomUUID();
  const safe = String(name).replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const dir = path.resolve(process.env.STORAGE_ROOT || "/storage", "attachments", id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safe), buffer);
  const text = extractText(buffer, mime, safe);
  const meta = { id, name: safe, mime: mime ?? null, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex"), userId: user.userId, uploadedAt: new Date().toISOString(), hasText: Boolean(text), chars: text ? text.length : 0 };
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
  if (text) await writeFile(path.join(dir, "text.txt"), text.slice(0, 200_000));
  return meta;
}
export async function loadAttachment(id, user) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const dir = path.resolve(process.env.STORAGE_ROOT || "/storage", "attachments", id);
  try {
    const meta = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8"));
    if (meta.userId !== user.userId) return null;
    const text = meta.hasText ? await readFile(path.join(dir, "text.txt"), "utf8").catch(() => null) : null;
    return { ...meta, text };
  } catch { return null; }
}
