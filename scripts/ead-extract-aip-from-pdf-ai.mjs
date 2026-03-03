/**
 * Extract airport fields from EAD AD 2 PDFs using an LLM (OpenAI).
 * Same output schema as ead-extract-aip-from-pdf.mjs; useful when PDF layout
 * varies by country and regex extraction misses fields.
 *
 * Requires: OPENAI_API_KEY in env or .env
 * Usage: node scripts/ead-extract-aip-from-pdf-ai.mjs [dir]
 *   dir defaults to data/ead-aip
 * Output: data/ead-aip-extracted.json
 */

import { readFile, readdir, writeFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { PDFParse } from "pdf-parse";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DIR = join(process.cwd(), "data", "ead-aip");
const OUT_PATH = join(process.cwd(), "data", "ead-aip-extracted.json");

// Load .env from project root if present
try {
  const envPath = join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
} catch (_) {}

const SCHEMA_KEYS = [
  "Airport Code",
  "Airport Name",
  "AD2.2 Types of Traffic Permitted",
  "AD2.2 Remarks",
  "AD2.3 AD Operator",
  "AD 2.3 Customs and Immigration",
  "AD2.3 ATS",
  "AD2.3 Remarks",
  "AD2.6 AD category for fire fighting",
];

const SYSTEM_PROMPT = `You are a precise data extractor. Given plain text from an ICAO EAD AD 2 (Aerodrome) PDF, output a single JSON object with exactly these keys (use "NIL" for empty or not applicable):
${SCHEMA_KEYS.map((k) => `- "${k}"`).join("\n")}

Rules:
- Airport Code: 4-letter ICAO code (e.g. ESGG, EVAD).
- Airport Name: official aerodrome name from AD 2.1 (e.g. GÖTEBORG/LANDVETTER, ADAZI).
- AD2.2 Types of traffic permitted: e.g. IFR/VFR, VFR by day/night. Use "NIL" if blank.
- AD2.2 Remarks: any remarks in AD 2.2, or "NIL".
- AD2.3 AD Operator: operating hours (e.g. MON-FRI 0700-1530) or "NIL"/"H24".
- AD 2.3 Customs and Immigration: e.g. "NIL", "H24", "H24 Direct transit area".
- AD2.3 ATS: e.g. "NIL", "H24", "AFIS".
- AD2.3 Remarks: or "NIL".
- AD2.6 AD category for fire fighting: e.g. "CAT 9" or short phrase; or "NIL".

Output only valid JSON, no markdown or extra text.`;

function trimToRelevant(text, maxChars = 14000) {
  const ad2Start = text.search(/\b(AD\s+2\.1|[A-Z]{4}\s+2\.1)\b/i);
  const ad27 = text.search(/\b(AD\s+2\.7|[A-Z]{4}\s+2\.7)\b/i);
  let chunk = text;
  if (ad2Start >= 0) chunk = text.slice(ad2Start, ad27 > ad2Start ? ad27 + 200 : undefined);
  return chunk.slice(0, maxChars);
}

async function getTextFromPdf(pdfPath) {
  const buf = await readFile(pdfPath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  return result?.text ?? (result?.pages && result.pages.map((p) => p.text).join("\n")) ?? "";
}

async function extractWithAI(text, icaoHint, apiKey) {
  const trimmed = trimToRelevant(text);
  // Default: gpt-5-nano (fast, cheap). Or set OPENAI_MODEL=gpt-4o-mini, gpt-3.5-turbo, etc.
  const model = process.env.OPENAI_MODEL || "gpt-5-nano";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `ICAO code from filename: ${icaoHint}\n\nExtract the airport record from this AD 2 PDF text:\n\n${trimmed}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${err}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in model response");
  const parsed = JSON.parse(jsonMatch[0]);
  const out = {};
  for (const k of SCHEMA_KEYS) out[k] = String(parsed[k] ?? "NIL").trim() || "NIL";
  return out;
}

async function main() {
  const dir = process.argv[2] || DEFAULT_DIR;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Set OPENAI_API_KEY in .env or environment.");
    process.exit(1);
  }

  const files = await readdir(dir).catch(() => []);
  const pdfs = files.filter((f) => f.endsWith(".pdf"));
  if (pdfs.length === 0) {
    console.error("No PDFs in", dir);
    process.exit(1);
  }

  const records = [];
  for (const f of pdfs) {
    const path = join(dir, f);
    const icaoMatch = f.match(/^[A-Z]{2}_AD_2_([A-Z0-9]{4})_/i);
    const icaoHint = icaoMatch ? icaoMatch[1].toUpperCase() : f.slice(0, 4).toUpperCase();
    try {
      const text = await getTextFromPdf(path);
      const rec = await extractWithAI(text, icaoHint, apiKey);
      rec._source = f;
      records.push(rec);
      console.error("[EAD AI extract]", rec["Airport Code"], rec["Airport Name"] || "(no name)");
    } catch (e) {
      console.error("[EAD AI extract] Error", f, e.message);
    }
  }

  const out = { source: "EAD AD 2 PDFs (AI)", extracted: new Date().toISOString(), airports: records };
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.error("Wrote", records.length, "airports →", OUT_PATH);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
