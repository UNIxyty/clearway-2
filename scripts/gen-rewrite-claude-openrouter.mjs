#!/usr/bin/env node
/**
 * GEN 1.2 rewrite using Claude via OpenRouter.
 * Reads a GEN 1.2 text file, splits into GENERAL and Part 4 (Private flights),
 * rewrites each with Claude, and outputs two objects: { general, part4 }.
 *
 * API key: pass it in the command that starts the script (or use .env).
 * Get a key at https://openrouter.ai/keys
 *
 * Usage (run from repo root):
 *   OPENROUTER_API_KEY=sk-or-v1-yourkey node scripts/gen-rewrite-claude-openrouter.mjs EB
 *   OPENROUTER_API_KEY=sk-or-v1-yourkey node scripts/gen-rewrite-claude-openrouter.mjs path/to/GEN-1.2.txt --out result.json
 *   OPENROUTER_API_KEY=sk-or-v1-yourkey node scripts/gen-rewrite-claude-openrouter.mjs /path/to/EB_GEN_1_2_en.pdf --out data/ead-gen/EB-gen-rewritten.json
 *
 *   Input: 2-letter prefix (data/ead-gen/<prefix>-GEN-1.2.txt), or path to .txt or .pdf (GEN 1.2).
 *   Optional: --out file.json writes { general, part4 } to a file instead of stdout.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { PDFParse } from "pdf-parse";
import { join, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const EAD_GEN_DIR = join(PROJECT_ROOT, "data", "ead-gen");

// Load .env from project root
function loadEnv() {
  const envPath = join(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}
loadEnv();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_GEN_MODEL || "anthropic/claude-3.5-sonnet";

const SYSTEM_PROMPT = `You are an aviation AIP editor. Rewrite the given AIP GEN 1.2 section into continuous prose. Preserve all regulatory information, requirements, and references. Output format: flowing paragraphs only — no section numbers (e.g. 1.1.1, 1.1.2), no headings, no bullet or numbered lists; convert lists and subsections into clear sentences and paragraphs. Keep contact details (addresses, phone, email, URLs) where they are part of procedures. Output only the rewritten text, no preamble or commentary.`;

function splitGenIntoParts(fullText) {
  if (!fullText || typeof fullText !== "string") return { general: "", part4: "" };
  const trimmed = fullText.trim();
  const part4HeadingRe = /Part\s+4\b|4\.\s*(?:Private|Non\s*scheduled)|^(?:Private\s+flights|Non\s*scheduled\s+flights)\b/im;
  const lines = trimmed.split(/\r?\n/);
  let part4StartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (part4HeadingRe.test(lines[i].trim())) {
      part4StartIndex = i;
      break;
    }
  }
  if (part4StartIndex >= 0) {
    const general = lines.slice(0, part4StartIndex).join("\n").trim();
    const part4 = lines.slice(part4StartIndex).join("\n").trim();
    return { general, part4 };
  }
  return { general: trimmed, part4: "" };
}

async function rewriteWithClaude(rawText, apiKey) {
  if (!rawText || !rawText.trim()) return "";
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: rawText.slice(0, 120000) },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

function getInputPath(input) {
  if (!input) return null;
  const s = input.trim();
  if (s.length === 2 && /^[A-Za-z]{2}$/.test(s)) {
    return join(EAD_GEN_DIR, `${s.toUpperCase()}-GEN-1.2.txt`);
  }
  if (isAbsolute(s)) return s;
  return join(process.cwd(), s);
}

async function getTextFromPdf(pdfPath) {
  const buf = await readFile(pdfPath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  return result?.text ?? (result?.pages && result.pages.map((p) => p.text).join("\n")) ?? "";
}

async function main() {
  const arg = process.argv[2];
  const outPath = process.argv[3] === "--out" ? process.argv[4] : null;

  if (!arg || (outPath === undefined && process.argv[3] === "--out")) {
    console.error("Usage: OPENROUTER_API_KEY=sk-or-v1-xxx node scripts/gen-rewrite-claude-openrouter.mjs <path-or-prefix> [--out file.json]");
    console.error("  path-or-prefix: path to GEN 1.2 .txt or .pdf, or 2-letter prefix (e.g. EB) for data/ead-gen/<prefix>-GEN-1.2.txt");
    console.error("  API key: pass in the command, e.g. OPENROUTER_API_KEY=sk-or-v1-xxx node scripts/... (or use .env)");
    process.exit(1);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Missing OPENROUTER_API_KEY. Run with the key in the command:");
    console.error("  OPENROUTER_API_KEY=sk-or-v1-yourkey node scripts/gen-rewrite-claude-openrouter.mjs EB");
    console.error("Get a key at https://openrouter.ai/keys");
    process.exit(1);
  }

  const inputPath = getInputPath(arg);
  if (!inputPath || !existsSync(inputPath)) {
    console.error("File not found:", inputPath || arg);
    process.exit(1);
  }

  const fullText = inputPath.toLowerCase().endsWith(".pdf")
    ? (await getTextFromPdf(inputPath)).trim()
    : readFileSync(inputPath, "utf8").trim();
  const { general: generalRaw, part4: part4Raw } = splitGenIntoParts(fullText);

  console.error("Model:", MODEL);
  console.error("GENERAL length:", generalRaw.length, "chars");
  console.error("Part 4 length:", part4Raw.length, "chars");

  const generalRewritten = generalRaw ? await rewriteWithClaude(generalRaw, apiKey) : "";
  const part4Rewritten = part4Raw ? await rewriteWithClaude(part4Raw, apiKey) : "";

  const result = {
    general: { raw: generalRaw, rewritten: generalRewritten || generalRaw },
    part4: { raw: part4Raw, rewritten: part4Rewritten || part4Raw },
    updatedAt: new Date().toISOString(),
  };

  const json = JSON.stringify(result, null, 2);
  if (outPath) {
    writeFileSync(outPath, json, "utf8");
    console.error("Wrote", outPath);
  } else {
    console.log(json);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
