// Knowledge search on Postgres full text (2026-11-03), replacing Bedrock embeddings that had failed every search since
// 31 Oct. Seeds an invented reference document (through the real indexing path, which works again) and invented verbatim
// records into the rig database, searches, and removes them. No model is needed for the search itself; the rerank
// is skipped (a single tier-2 candidate) or falls back to search order, and says so.
//   node --env-file=.env.rig rig/knowledge-fts-check.mjs
import { randomUUID } from "node:crypto";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 180)}` : ""}`); if (!c) failures += 1; };
const { rest, searchKnowledge, queryTerms, coverage, SEARCH_METHOD } = await import("../agent/lib/knowledge/retrieval.mjs");
const { indexDocument } = await import("../agent/lib/knowledge/ingest.mjs");
const run = Date.now().toString(36);
const docId = randomUUID(); const recIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const approver = { approved_by: "00000000-0000-4000-8000-0000000000aa", approved_by_email: "rig-approver@rig.invalid" };
try {
  await rest("agent_documents", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ id: docId, title: `Rig ground handling manual ${run}`, filename: "rig-ghm.txt", storage_key: `rig/${run}`, status: "indexed", tier: "tier2", source: "Rig GHM (invented)" }]) });
  const text = `1. De-icing\nDe-icing fluid type IV is applied by the handler on request. Holdover times follow the current season's tables.\n\n2. Towing ${run}\nTowing of aircraft above 5,700 kg requires a licensed tug driver and a wing walker on each side.\n\n3. Catering\nCatering orders close 12 hours before departure.`;
  const r = await indexDocument({ id: docId }, text);
  const chunks = await rest(`agent_chunks?document_id=eq.${docId}&select=id,embedding`);
  ok(r.chunks > 0 && chunks.length === r.chunks && chunks.every((c) => c.embedding == null), "an upload indexes again: chunks stored, no embedding needed", `${r.chunks} chunk(s)`);
  const rec = (o) => ({ icao: null, expires_date: null, retired_at: null, ...o });
  await rest("agent_tier1_records", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([
    rec({ id: recIds[0], reference: `RIG-LIM-${run} §1`, title: "Night restriction (invented)", text: `Aircraft above 5,700 kg shall not land at RIGX between 2300 and 0500 UTC without prior permission (${run}).`, source_document: "Rig limitations (invented)", icao: "RIGX", ...approver }),
    rec({ id: recIds[1], reference: `RIG-LIM-${run} §2`, title: "Expired night restriction (invented)", text: `Night landings at RIGX were suspended (${run}).`, source_document: "Rig limitations (invented)", icao: "RIGX", expires_date: "2020-01-01", ...approver }),
    rec({ id: recIds[2], reference: `RIG-LIM-${run} §3`, title: "Retired rule (invented)", text: `Night landing permission at RIGX was granted by fax (${run}).`, source_document: "Rig limitations (invented)", retired_at: new Date().toISOString(), ...approver }),
    rec({ id: recIds[3], reference: `RIG-LIM-${run} §4`, title: "Another airport (invented)", text: `Night landing at RIGY is unrestricted (${run}).`, source_document: "Rig limitations (invented)", icao: "RIGY", ...approver }),
  ]) });

  ok(JSON.stringify(queryTerms("What are the night restrictions at RIGX?")) === JSON.stringify(["night", "restrictions", "rigx"]), "the question's words, without the filler", JSON.stringify(queryTerms("What are the night restrictions at RIGX?")));
  ok(coverage("Night restriction applies at RIGX", ["night", "restrictions", "rigx"]) > coverage("Night flights", ["night", "restrictions", "rigx"]), "a passage holding more of the words scores higher (restrictions matches restriction)");

  let s = await searchKnowledge(`night landing restrictions RIGX ${run}`, { icao: "RIGX" });
  const refs = s.tier1.map((x) => x.reference);
  ok(s.failures.length === 0 && s.embeddingModel === SEARCH_METHOD, "the search runs, with no failures, and says how it searched", s.embeddingModel);
  ok(refs.includes(`RIG-LIM-${run} §1`) && s.tier1[0].verbatim === true && s.tier1[0].text.includes("5,700 kg"), "the current verbatim record is found, word for word", refs.join(", "));
  ok(!refs.includes(`RIG-LIM-${run} §2`) && !refs.includes(`RIG-LIM-${run} §3`), "an expired record and a retired one are not returned");
  ok(!refs.includes(`RIG-LIM-${run} §4`), "a record for another airport is not returned when the question is scoped to RIGX");
  s = await searchKnowledge(`towing wing walker ${run}`, {});
  ok(s.tier2.some((x) => x.documentId === docId && /wing walker/.test(x.text) && x.title?.startsWith("Rig ground handling manual")), "a reference passage is found, with its document", s.tier2.map((x) => x.title).join(", "));
  s = await searchKnowledge("zzqx unrelated vocabulary nobody wrote", {});
  ok(s.tier1.length === 0 && s.tier2.length === 0 && s.failures.length === 0, "a question nothing answers: empty, and not a failure");
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  s = await searchKnowledge("night restrictions", {});
  process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  ok(s.failures.length === 2, "the database unreachable: both tiers reported as FAILED, never as empty", s.failures.join(" | ").slice(0, 120));
} finally {
  await rest(`agent_tier1_records?id=in.(${recIds.join(",")})`, { method: "DELETE" }).catch(() => {});
  await rest(`agent_documents?id=eq.${docId}`, { method: "DELETE" }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
