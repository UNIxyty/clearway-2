// Record and retrieve generated files.

import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { generatedPath } from "./generate.mjs";

const REST_TIMEOUT_MS = 10_000;

function url() { return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""); }
function key() { return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(); }

async function rest(pathAndQuery, init = {}) {
  const headers = { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers ?? {}) };
  const response = await fetch(`${url()}/rest/v1/${pathAndQuery}`, { ...init, headers, signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathAndQuery} -> ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function recordGeneratedFile({ file, user, conversationId, kind, title, sources, generatedMs }) {
  try {
    await rest("agent_generated_files", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        id: file.id,
        user_id: user?.userId ?? null,
        user_email: user?.email ?? null,
        conversation_id: /^[0-9a-f-]{36}$/i.test(String(conversationId ?? "")) ? conversationId : null,
        kind, filename: file.filename, storage_key: file.storageKey,
        mime: file.mime, bytes: file.bytes, sha256: file.sha256,
        title: title ?? null, sources: sources ?? [], generated_ms: generatedMs ?? null,
      }]),
    });
  } catch (error) {
    process.stderr.write(`[agent-files] FAILED to record ${file.filename}: ${error.message}\n`);
  }
}

/** The dispatcher's own generated files, newest first — what "the brief I made earlier" resolves against. */
export async function listGeneratedFiles(user, { limit = 30, query = "" } = {}) {
  const rows = (await rest(
    `agent_generated_files?user_id=eq.${encodeURIComponent(user.userId)}&expired_at=is.null&select=id,filename,title,kind,mime,bytes,created_at,conversation_id&order=created_at.desc&limit=${Math.min(limit, 100)}`
  ).catch(async () => rest(`agent_generated_files?user_id=eq.${encodeURIComponent(user.userId)}&select=id,filename,title,kind,mime,bytes,created_at,conversation_id&order=created_at.desc&limit=${Math.min(limit, 100)}`).catch(() => []))) ?? [];
  const q = String(query ?? "").trim().toLowerCase();
  return rows.filter((r) => !q || `${r.filename} ${r.title ?? ""}`.toLowerCase().includes(q));
}

/**
 * Resolve "that file" the way a person names it: a generated-file id, or a
 * filename / title (the newest match wins). The model regularly passes the
 * filename it saw in an earlier reply; refusing that produced "No generated
 * file weekly_flights_brief.pdf" for a file that was sitting on disk.
 */
export async function findGeneratedFile(ref, user) {
  const raw = String(ref ?? "").trim();
  if (/^[0-9a-f-]{36}$/i.test(raw)) return readGeneratedFile(raw, user);
  const name = raw.replace(/^.*\//, "").toLowerCase();
  if (!name) return null;
  const rows = await listGeneratedFiles(user, { limit: 100 });
  const hit = rows.find((r) => r.filename.toLowerCase() === name) ?? rows.find((r) => r.filename.toLowerCase().startsWith(name.replace(/\.[a-z0-9]+$/, ""))) ?? rows.find((r) => String(r.title ?? "").toLowerCase() === name);
  return hit ? readGeneratedFile(hit.id, user) : null;
}

/**
 * Read a generated file back — only for the user who generated it. Ownership is
 * part of the query, so one dispatcher cannot fetch another's briefing by id.
 */
export async function readGeneratedFile(id, user) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const rows = await rest(
    `agent_generated_files?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.userId)}&select=*&limit=1`
  ).catch(() => null);
  const row = rows?.[0];
  if (!row) return null;
  try {
    return { ...row, buffer: await readFile(generatedPath(row.storage_key)) };
  } catch {
    return null;
  }
}

/**
 * Retention. Generated files are briefings and exports, not records: the
 * record of what was generated (who, when, from what) stays in
 * agent_generated_files with the file's hash, and the bytes go after
 * AGENT_FILE_RETENTION_DAYS (default 30). Without this they accumulated until
 * a container rebuild wiped them all at once -- which is the worst of both:
 * unbounded growth, then sudden loss with the rows still pointing at nothing.
 *
 * The row is kept and marked, never deleted, so a later "where is my briefing"
 * gets "expired on <date>" rather than "never existed".
 */
export async function sweepGeneratedFiles({ now = Date.now() } = {}) {
  const days = Number(process.env.AGENT_FILE_RETENTION_DAYS || 30);
  if (!Number.isFinite(days) || days <= 0) return { swept: 0, skipped: "retention disabled" };
  const cutoff = new Date(now - days * 86_400_000).toISOString();
  let rows;
  try {
    rows = await rest(`agent_generated_files?created_at=lt.${encodeURIComponent(cutoff)}&expired_at=is.null&select=id,storage_key&limit=500`);
  } catch (error) {
    process.stderr.write(`[agent-files] retention sweep could not list files: ${error.message}\n`);
    return { swept: 0, error: error.message };
  }
  let swept = 0;
  for (const row of rows ?? []) {
    const target = generatedPath(row.storage_key);
    try {
      await rm(path.dirname(target), { recursive: true, force: true });
      await rest(`agent_generated_files?id=eq.${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ expired_at: new Date(now).toISOString() }) });
      swept += 1;
    } catch (error) {
      process.stderr.write(`[agent-files] could not expire ${row.id}: ${error.message}\n`);
    }
  }
  if (swept) process.stdout.write(`[agent-files] retention: expired ${swept} generated file(s) older than ${days} days\n`);
  return { swept };
}
