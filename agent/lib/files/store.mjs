// Record and retrieve generated files.

import { readFile } from "node:fs/promises";
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
