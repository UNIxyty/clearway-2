// Ingest: upload → classify (propose a tier) → human approval → index.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: nothing enters Tier 1 without a person
// approving it. Classification only ever PROPOSES. `approveDocument` is the
// single path into the verbatim tier and it requires a named approver, which
// the schema makes not-nullable so the rule survives a future code change.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { converseOnce } from "../bedrock.mjs";
import { embed, activeEmbeddingModel } from "./embeddings.mjs";
import { rest } from "./retrieval.mjs";

// Originals live on the mounted storage volume, never the root disk.
const STORAGE_ROOT = process.env.STORAGE_ROOT || "/storage";
const DOC_PREFIX = "agent-knowledge";

export function documentPath(storageKey) {
  return path.resolve(STORAGE_ROOT, storageKey);
}

/** Store the original, unchanged, and record it. Retrievable by name forever. */
export async function storeDocument({ filename, mime, buffer, metadata, user }) {
  const id = randomUUID();
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const safeName = String(filename).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  const storageKey = `${DOC_PREFIX}/${id}/${safeName}`;
  const target = documentPath(storageKey);

  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
  } catch (error) {
    // A missing STORAGE_ROOT is a deployment problem, and "Unexpected server
    // error" sends whoever hits it looking in the wrong place entirely.
    throw new Error(
      `Could not write the document to ${target}: ${error.code ?? error.message}. ` +
      `STORAGE_ROOT is "${STORAGE_ROOT}" — it must exist and be writable ` +
      `(/mnt/hdd-storage on the server, mounted as /storage in the container).`
    );
  }

  const rows = await rest("agent_documents", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      id,
      title: metadata.title || safeName,
      filename: safeName,
      mime: mime ?? null,
      bytes: buffer.length,
      storage_key: storageKey,
      sha256,
      source: metadata.source ?? null,
      version: metadata.version ?? null,
      effective_date: metadata.effectiveDate ?? null,
      country: metadata.country ?? null,
      icao: metadata.icao ? String(metadata.icao).toUpperCase() : null,
      tags: metadata.tags ?? [],
      status: "uploaded",
      uploaded_by: user.userId,
      uploaded_by_email: user.email ?? null,
    }]),
  });
  return rows?.[0] ?? null;
}

export async function readDocumentFile(storageKey) {
  return readFile(documentPath(storageKey));
}

/** Plain text from the upload. PDFs are handed to the portal's existing extractor. */
export function extractText(buffer, mime, filename) {
  const name = String(filename || "").toLowerCase();
  if (mime?.startsWith("text/") || /\.(txt|md|csv)$/.test(name)) return buffer.toString("utf8");
  if (mime === "application/json" || name.endsWith(".json")) return buffer.toString("utf8");
  // A PDF's text extraction lives in the Python pipeline the platform already
  // uses; re-implementing it here would be a second parser to keep in step.
  return null;
}

/**
 * Chunk on structure first, length second: a procedure split mid-clause reads
 * as two different instructions, which in this domain is worse than a chunk
 * that is slightly too long.
 */
export function chunkText(text, { target = 1200, overlap = 150 } = {}) {
  const paragraphs = String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  let heading = null;

  for (const paragraph of paragraphs) {
    const asHeading = /^(#{1,4}\s+.+|[A-Z0-9][A-Z0-9 .\-]{3,60})$/.test(paragraph) && paragraph.length < 80;
    if (asHeading) heading = paragraph.replace(/^#+\s*/, "");
    if ((current + "\n\n" + paragraph).length > target && current) {
      chunks.push({ text: current.trim(), heading });
      current = current.slice(Math.max(0, current.length - overlap));
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  if (current.trim()) chunks.push({ text: current.trim(), heading });
  return chunks.map((c, i) => ({ ...c, ordinal: i }));
}

/**
 * PROPOSE a tier. Never decides. The distinction it is asked to make is narrow
 * and concrete — "is this operative regulatory wording, or is it guidance?" —
 * because a vaguer question produces a confident guess, and a confident guess
 * about Tier 1 is the failure mode this whole design exists to avoid.
 */
export async function classifyDocument({ title, source, sample }) {
  const prompt =
    `A flight-operations document has been uploaded to a knowledge base with two tiers.\n\n` +
    `TIER 1 (verbatim): operative rules that must be quoted exactly — limitations, permit ` +
    `requirements, airport restrictions, civil-aviation-authority instructions, country entry ` +
    `requirements. Text where changing a word changes the obligation.\n\n` +
    `TIER 2 (reference): SOPs, handling procedures, manuals, guidance, training material. ` +
    `Text a person may reasonably summarise.\n\n` +
    `Title: ${title}\nSource: ${source ?? "unknown"}\n\nFirst part of the document:\n"""\n${String(sample).slice(0, 6000)}\n"""\n\n` +
    `Reply with JSON only: {"tier":"tier1"|"tier2","confidence":0-1,"reason":"one sentence"}`;

  try {
    const { text } = await converseOnce({
      tier: "standard",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 300,
      temperature: 0,
    });
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) throw new Error("no JSON in classifier reply");
    const parsed = JSON.parse(match[0]);
    return {
      tier: parsed.tier === "tier1" ? "tier1" : "tier2",
      confidence: Number(parsed.confidence) || 0,
      reason: String(parsed.reason ?? "").slice(0, 400),
    };
  } catch (error) {
    // An unclassifiable document is proposed as tier 2: the safe default is the
    // one that does NOT put unreviewed text where it will be quoted as law.
    return { tier: "tier2", confidence: 0, reason: `Could not classify automatically (${error.message}); defaulted to reference.` };
  }
}

/** Embed and store chunks. Tier 2 only — tier 1 records are indexed on approval. */
export async function indexDocument(document, text) {
  const chunks = chunkText(text);
  if (chunks.length === 0) return { chunks: 0 };
  const model = activeEmbeddingModel();

  for (let i = 0; i < chunks.length; i += 48) {
    const slice = chunks.slice(i, i + 48);
    const vectors = await embed(slice.map((c) => c.text), { purpose: "document", model });
    await rest("agent_chunks", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(slice.map((c, j) => ({
        document_id: document.id,
        ordinal: c.ordinal,
        text: c.text,
        heading: c.heading ?? null,
        embedding: vectors[j],
        embedding_model: model,
      }))),
    });
  }
  return { chunks: chunks.length };
}

/**
 * The ONLY path into Tier 1. Requires a named approver — the schema's
 * approved_by is not-nullable, so this cannot be bypassed by a future caller
 * that forgets to pass one.
 */
export async function approveTier1Record({ document, record, approver }) {
  if (!approver?.userId || !approver?.email) throw new Error("A named approver is required for Tier 1.");
  const [vector] = await embed(`${record.title}\n\n${record.text}`, { purpose: "document" });
  const rows = await rest("agent_tier1_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      document_id: document?.id ?? null,
      reference: record.reference,
      title: record.title,
      // Stored exactly as supplied. Never rewritten here or anywhere else.
      text: record.text,
      source_document: record.sourceDocument ?? document?.title ?? "unknown",
      version: record.version ?? document?.version ?? null,
      effective_date: record.effectiveDate ?? document?.effective_date ?? null,
      expires_date: record.expiresDate ?? null,
      country: record.country ?? document?.country ?? null,
      icao: record.icao ? String(record.icao).toUpperCase() : document?.icao ?? null,
      tags: record.tags ?? [],
      approved_by: approver.userId,
      approved_by_email: approver.email,
      embedding: vector,
    }]),
  });
  return rows?.[0] ?? null;
}
