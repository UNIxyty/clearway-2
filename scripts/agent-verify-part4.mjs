#!/usr/bin/env node
// Part 4's done-condition: an operational limitation comes back exactly as
// written with its source; a procedure question is answered with citations; an
// unsupported answer is rejected rather than guessed; and the grounding check
// rejects unsupported output.
//
//   node scripts/agent-verify-part4.mjs [--base http://127.0.0.1:5175]
//
// Uploads its own fixtures and removes them afterwards.

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const value = (f, d) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);
const BASE = value("--base", process.env.AGENT_BASE_URL || "http://127.0.0.1:5175").replace(/\/+$/, "");
const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
const SB = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function sb(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const api = (path, init = {}) =>
  fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...init }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const invoke = (name, input = {}) =>
  api("/api/tools/invoke", { method: "POST", body: JSON.stringify({ name, input }) }).then((r) => r.body);

// A short SOP. Reference material — the agent may synthesise across it.
const SOP = `Clearway Ground Handling SOP

DE-ICING COORDINATION

De-icing is requested through the handling agent no later than 45 minutes
before the scheduled off-block time. The request must state the aircraft
registration, the stand, and whether anti-icing is required in addition to
de-icing.

Holdover time begins at the start of the final application, not at its end.
The commander is responsible for confirming the holdover time remains valid at
the point of take-off.

TOWING AND PUSHBACK

Pushback is coordinated on the ground frequency. A headset operator must remain
connected until the nose gear steering bypass pin has been removed and shown to
the flight crew.`;

async function main() {
  console.log(`agent: ${BASE}\n`);
  await sb("agent_settings?id=eq.global", { method: "PATCH", body: JSON.stringify({ enabled: true, reason: "part4 verify" }) });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb("agent_access", { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: MOCK_USER_ID, user_email: "part4@clearway.local" }]) });

  // ── Upload → classification PROPOSES a tier, never decides ──────────────
  const upload = await api("/api/knowledge/documents", {
    method: "POST",
    body: JSON.stringify({
      filename: "clearway-ground-handling-sop.md",
      mime: "text/markdown",
      contentBase64: Buffer.from(SOP, "utf8").toString("base64"),
      title: "Clearway Ground Handling SOP",
      source: "Clearway Operations",
      version: "rev 4",
      effectiveDate: "2026-09-01",
    }),
  });
  const documentId = upload.body?.document?.id;
  check("a document uploads and is stored", upload.status === 200 && Boolean(documentId), documentId ?? JSON.stringify(upload.body).slice(0, 100));
  check("ingest PROPOSES a tier rather than applying one", upload.body?.proposal?.tier === "tier2", `proposed ${upload.body?.proposal?.tier} — "${String(upload.body?.proposal?.reason ?? "").slice(0, 70)}"`);

  const pending = await sb(`agent_documents?id=eq.${documentId}&select=status,tier,proposed_tier`);
  check("it waits for a human, with no tier applied", pending?.[0]?.status === "awaiting_approval" && pending?.[0]?.tier === null, `status=${pending?.[0]?.status} tier=${pending?.[0]?.tier}`);

  // ── Tier 1 demands the records AND a named approver ─────────────────────
  const badTier1 = await api(`/api/knowledge/documents/${documentId}/approve`, { method: "POST", body: JSON.stringify({ tier: "tier1" }) });
  check("Tier 1 approval is refused without explicit records", badTier1.status === 400, `HTTP ${badTier1.status}`);

  // ── Approve as tier 2 → indexed ─────────────────────────────────────────
  const approve = await api(`/api/knowledge/documents/${documentId}/approve`, { method: "POST", body: JSON.stringify({ tier: "tier2" }) });
  check("approval indexes the document", approve.status === 200 && approve.body?.chunks > 0, `${approve.body?.chunks} chunks`);

  // ── Tier 1: an approved verbatim record ─────────────────────────────────
  const tier1 = await api(`/api/knowledge/documents/${documentId}/approve`, {
    method: "POST",
    body: JSON.stringify({
      tier: "tier1",
      records: [{
        reference: "VERIFY-0001 §1",
        title: "LLBG · night curfew",
        text: "Operations at LLBG are NOT PERMITTED between 0100 and 0430 local time, except for medical evacuation flights approved in advance by the airport authority.",
        sourceDocument: "Clearway Ground Handling SOP",
        version: "rev 4",
        effectiveDate: "2026-09-01",
        icao: "LLBG",
      }],
    }),
  });
  const recordId = tier1.body?.records?.[0]?.id;
  check("a Tier 1 record is created with a named approver", tier1.status === 200 && Boolean(recordId), recordId ?? JSON.stringify(tier1.body).slice(0, 120));
  const stored = recordId ? await sb(`agent_tier1_records?id=eq.${recordId}&select=approved_by,approved_by_email,text`) : null;
  check("the approver is recorded on the record", Boolean(stored?.[0]?.approved_by && stored?.[0]?.approved_by_email), stored?.[0]?.approved_by_email ?? "none");

  // ── Retrieval: the limitation comes back EXACTLY as written ─────────────
  const search = await invoke("search_knowledge", { query: "Can we operate into LLBG at 2am?", limit: 6 });
  const verbatimHit = (search.verbatim ?? [])[0];
  check("an operational rule is retrieved as verbatim", Boolean(verbatimHit?.verbatim), verbatimHit ? `${verbatimHit.retrievalType} · ${verbatimHit.reference}` : "none");
  check("the text is byte-for-byte what was approved",
    verbatimHit?.text === stored?.[0]?.text,
    verbatimHit ? `"${String(verbatimHit.text).slice(0, 55)}…"` : "no hit");
  check("it carries source, version and effective date",
    Boolean(verbatimHit?.source && verbatimHit?.version && verbatimHit?.effectiveDate),
    verbatimHit ? `${verbatimHit.source} · ${verbatimHit.version} · ${verbatimHit.effectiveDate}` : "");

  // ── A procedure question is answered from tier 2, with citations ────────
  const procedure = await invoke("search_knowledge", { query: "How far in advance must de-icing be requested?", tier: "tier2", limit: 6 });
  const ref = (procedure.reference ?? [])[0];
  check("a procedure question retrieves reference material", Boolean(ref), ref ? `${ref.title} (${ref.retrievalType})` : "none");
  check("reference results cite a document", Boolean(ref?.source && ref?.documentId), ref ? `${ref.source}` : "");
  check("reranking ran", ["cohere-rerank", "llm-listwise"].includes(procedure.rerankMethod), procedure.rerankMethod);

  // ── Nothing found → says so, does not guess ─────────────────────────────
  const nothing = await invoke("search_knowledge", { query: "What is the refuelling procedure for the Antonov An-225 at Vostok Station?" });
  check("an unsupported question returns verified:false", nothing.ok === true && nothing.verified === false || (nothing.verbatim?.length === 0 && nothing.reference?.length === 0),
    nothing.verified === false ? "verified:false with a do-not-guess note" : `verbatim=${nothing.verbatim?.length} reference=${nothing.reference?.length}`);

  // ── Grounding rejects unsupported output ────────────────────────────────
  const { checkGrounding, groundingConfigured } = await import("../agent/lib/knowledge/grounding.mjs");
  check("a guardrail is configured", groundingConfigured());
  const sources = [{ text: stored?.[0]?.text ?? "" }];
  const good = await checkGrounding({ query: "Can we operate into LLBG at 2am?", answer: "No — LLBG is closed between 0100 and 0430 local, except for pre-approved medical evacuation flights.", sources });
  check("grounding PASSES a supported answer", good.ran && good.verified, good.scores?.map((s) => `${s.type.toLowerCase()} ${s.score?.toFixed(2)}`).join(" · "));
  const bad = await checkGrounding({ query: "Can we operate into LLBG at 2am?", answer: "Yes — LLBG is open 24 hours, and a night surcharge of 400 EUR applies.", sources });
  check("grounding REJECTS an unsupported answer", bad.ran && !bad.verified, bad.reason ?? "");

  // ── The retrieval log can reconstruct what supported an answer ──────────
  // The MOST RECENT retrieval is the deliberately-unanswerable one, which
  // correctly has no sources. Look for any logged retrieval that does.
  const logged = await sb(`agent_retrievals?user_id=eq.${MOCK_USER_ID}&select=query,tier,sources,embedding_model,rerank_model&order=created_at.desc&limit=10`);
  const withSources = (logged ?? []).find((r) => (r.sources ?? []).length > 0);
  check("retrievals are logged with their sources", Boolean(withSources) && Boolean(withSources.embedding_model),
    withSources ? `${withSources.sources.length} sources · ${withSources.embedding_model}` : `${(logged ?? []).length} logged, none with sources`);

  // ── Cleanup ────────────────────────────────────────────────────────────
  if (recordId) await sb(`agent_tier1_records?id=eq.${recordId}`, { method: "DELETE" });
  if (documentId) await sb(`agent_documents?id=eq.${documentId}`, { method: "DELETE" });
  await sb(`agent_retrievals?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nverification aborted: ${e.message}`); process.exit(1); });
