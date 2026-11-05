// The knowledge base round trip (2026-11-05, the user's four answers), through a real agent server and its routes:
//   1. an upload is indexed as reference at once: no approval, no job anyone must remember
//   2. the agent finds it and cites it (on the real model with the rig key; skipped with a reason without one)
//   3. approval is never the uploader's: refused for them, allowed for another approver, and a reference decision on an
//      indexed document does not index it twice
//   4. Remove takes it out of answers at once and is recorded: who, when, which document
// Invented document, removed at the end. The rig's grants are seeded first (docs/supabase-permissions.sql, as the
// runner does), so the new remove action has its rows.
//   node --env-file=.env.rig rig/knowledge-roundtrip-check.mjs
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" ? `  · ${String(d).slice(0, 240)}` : ""}`); if (!c) failures += 1; };
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY, H = { apikey: K, authorization: `Bearer ${K}`, "content-type": "application/json" };
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const db = async (p, init = {}) => { const r = await fetch(`${SB}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } }); return r.status === 204 ? null : r.json(); };
execFileSync("docker", ["exec", "-i", "supabase_db_rig", "psql", "-U", "postgres", "-q"], { input: fs.readFileSync("docs/supabase-permissions.sql", "utf8") });
const withKey = Boolean(String(process.env.ANTHROPIC_API_KEY || "").trim());

const PORT = 5196, B = `http://127.0.0.1:${PORT}`, STORE = `${process.cwd()}/rig/.scratch/kb-roundtrip-storage`;
const child = spawn("node", ["--env-file=.env.rig", "agent/server.mjs"], { env: { ...process.env, PORT: String(PORT), DISABLE_AUTH_FOR_TESTING: "true", AGENT_TEST_ROLE: "developer", MODEL_PROVIDER: "anthropic", SMOKE_DISABLED: "1", AGENT_RIG_KB_WRITES: "1", STORAGE_ROOT: STORE }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; child.stdout.on("data", (d) => { log += d; }); child.stderr.on("data", (d) => { log += d; });
const post = async (p, body) => { const r = await fetch(`${B}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const chat = async (message) => { const r = await fetch(`${B}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) }); for (const f of (await r.text()).split("\n\n")) if (/^event: done$/m.test(f)) return JSON.parse(/^data: (.+)$/m.exec(f)[1]); return null; };
let id = null;
try {
  for (let i = 0; i < 80; i += 1) { await new Promise((r) => setTimeout(r, 250)); try { if ((await fetch(`${B}/health`)).status < 500) break; } catch { /* starting */ } }
  const run = Date.now().toString(36);
  const text = `Rig Ground Handling Notes (invented, ${run})\n\n1. Towing\nTowing of a heavy aircraft requires the handler's blue tug, booked 45 minutes ahead on frequency 131.725.\n\n2. De-icing\nType IV fluid only, applied on request.`;
  // ── 1. an upload is indexed as reference at once ──
  const up = await post("/api/knowledge/documents", { filename: `rig-ghn-${run}.txt`, mime: "text/plain", title: `Rig Ground Handling Notes ${run}`, source: "Rig (invented)", contentBase64: Buffer.from(text).toString("base64") });
  id = up.body?.document?.id;
  const row = id ? (await db(`agent_documents?id=eq.${id}&select=status,tier,proposed_tier,approved_by`))[0] : null;
  const chunks = id ? (await db(`agent_chunks?document_id=eq.${id}&select=id`)).length : 0;
  ok(up.status === 200 && up.body?.indexed === true && row?.status === "indexed" && row.tier === "tier2" && !row.approved_by && chunks > 0, "an upload is indexed as reference at once, with no approval", `${up.status} · ${row?.status}/${row?.tier}, proposed ${row?.proposed_tier} · ${chunks} chunk(s)`);
  const audit = (await db(`agent_audit_log?kind=eq.knowledge.uploaded&detail->>documentId=eq.${id}&select=detail`))[0]?.detail;
  ok(audit?.indexedOnUpload === true && audit.chunks === chunks, "the upload's audit row says it was indexed on upload, and how much", JSON.stringify({ indexedOnUpload: audit?.indexedOnUpload, chunks: audit?.chunks }));
  const q = "In our Rig Ground Handling Notes, how far ahead must the blue tug be booked for towing a heavy aircraft, and on which frequency?";
  // ── 2. the agent finds it and cites it ──
  if (withKey) {
    const a = await chat(q);
    ok((a?.sources ?? []).some((s) => s.documentId === id) && /45/.test(a?.content ?? "") && /131\.725/.test(a?.content ?? ""), "the agent answers from it at once and cites it (real model)", (a?.content ?? "").replace(/\s+/g, " ").slice(0, 120));
  } else console.log("SKIP  the agent's answer (no ANTHROPIC_API_KEY in .env.rig): the search is still checked below");
  const { searchKnowledge } = await import("../agent/lib/knowledge/retrieval.mjs");
  const found = await searchKnowledge(q, { limit: 5 }).catch((e) => ({ error: e.message }));
  ok((found.tier2 ?? []).some((s) => s.documentId === id || s.document_id === id || JSON.stringify(s).includes(id)), "the search finds it as reference", found.error ?? `${(found.tier2 ?? []).length} reference hit(s)`);
  // ── 3. approval is never the uploader's ──
  const own = await post(`/api/knowledge/documents/${id}/approve`, { tier: "tier2" });
  ok(own.status === 403 && /another admin or developer/i.test(own.body?.message ?? ""), "the uploader cannot approve their own document (refused by the server, not only the page)", `${own.status} · ${own.body?.message ?? ""}`);
  const ownReject = await post(`/api/knowledge/documents/${id}/reject`, { reason: "rig" });
  ok(ownReject.status === 403, "…nor reject it (they remove it instead)", ownReject.status);
  await db(`agent_documents?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ uploaded_by: "00000000-0000-4000-8000-0000000000bb", uploaded_by_email: "rig-other-uploader@rig.invalid" }) });
  const other = await post(`/api/knowledge/documents/${id}/approve`, { tier: "tier2" });
  const after = (await db(`agent_chunks?document_id=eq.${id}&select=id`)).length;
  ok(other.status === 200 && after === chunks, "another approver may decide; keeping it as reference does not index it a second time", `${other.status} · ${after} chunk(s), was ${chunks}`);
  // ── 4. Remove: out of answers at once, and recorded ──
  const rm = await post(`/api/knowledge/documents/${id}/remove`, {});
  const gone = (await db(`agent_chunks?document_id=eq.${id}&select=id`)).length;
  const rrow = (await db(`agent_documents?id=eq.${id}&select=status,rejected_reason`))[0];
  ok(rm.status === 200 && gone === 0 && rrow?.status === "rejected" && /^Removed from answers by \S+ on \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z$/.test(rrow.rejected_reason ?? ""), "Remove takes it out at once: no chunks left, and the record says who removed it and when", `${rm.status} · ${gone} chunk(s) · ${rrow?.rejected_reason ?? ""}`);
  const ra = (await db(`agent_audit_log?kind=eq.knowledge.removed&detail->>documentId=eq.${id}&select=user_email,created_at,detail`))[0];
  ok(Boolean(ra?.user_email && ra.created_at && ra.detail?.title?.startsWith("Rig Ground Handling Notes")), "…and an audit row: who, when, which document", ra ? `knowledge.removed · ${ra.detail.chunksDeleted} chunk(s) deleted` : "no row");
  const again = await searchKnowledge(q, { limit: 5 }).catch((e) => ({ error: e.message }));
  ok(!JSON.stringify(again.tier2 ?? []).includes(id), "the search no longer finds it");
  if (withKey) {
    const a2 = await chat(q);
    ok(!(a2?.sources ?? []).some((s) => s.documentId === id) && !/131\.725/.test(a2?.content ?? ""), "the agent no longer uses it (real model)", (a2?.content ?? "").replace(/\s+/g, " ").slice(0, 120));
  }
} finally {
  child.kill();
  if (id) { await db(`agent_chunks?document_id=eq.${id}`, { method: "DELETE" }); await db(`agent_documents?id=eq.${id}`, { method: "DELETE" }); }
  fs.rmSync(STORE, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
