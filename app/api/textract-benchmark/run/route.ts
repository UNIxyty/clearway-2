import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { join } from "path";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  parseAipFieldsFromOpenAiJson,
  parseAipFieldsFromText,
  SCHEMA_KEYS,
  type AipExtractRecord,
} from "@/lib/aip-extract-from-text";

export const runtime = "nodejs";

const TEXTRACT_SCRIPT = join(process.cwd(), "aws_textract_to_json.py");
const CROP_SCRIPT = join(process.cwd(), "scripts", "extract-pdf-pages.py");
const PY_TIMEOUT_MS = 8 * 60_000;
const MAX_PAGES = 5;
const TMP_DIR = join(process.cwd(), "test-results", "bench-tmp");

function nowMs(): number {
  return Date.now();
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function streamToString(body: unknown): Promise<string> {
  if (!body) return "";
  const b = body as { transformToString?: () => Promise<string> };
  if (typeof b.transformToString === "function") return b.transformToString();
  const rs = body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    rs.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    rs.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    rs.on("error", reject);
  });
}

function extractOrderedTextFromTextract(doc: Record<string, unknown>): string {
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  const lines = blocks.filter(
    (b): b is Record<string, unknown> =>
      typeof b === "object" &&
      b !== null &&
      b.BlockType === "LINE" &&
      typeof b.Text === "string"
  );

  lines.sort((a, b) => {
    const pa = Number(a.Page ?? 0);
    const pb = Number(b.Page ?? 0);
    if (pa !== pb) return pa - pb;
    const ta = Number(
      (a.Geometry as { BoundingBox?: { Top?: number } })?.BoundingBox?.Top ?? 0
    );
    const tb = Number(
      (b.Geometry as { BoundingBox?: { Top?: number } })?.BoundingBox?.Top ?? 0
    );
    if (ta !== tb) return ta - tb;
    const la = Number(
      (a.Geometry as { BoundingBox?: { Left?: number } })?.BoundingBox?.Left ?? 0
    );
    const lb = Number(
      (b.Geometry as { BoundingBox?: { Left?: number } })?.BoundingBox?.Left ?? 0
    );
    return la - lb;
  });

  return lines.map((x) => String(x.Text)).join("\n");
}

type TextractRel = { Type?: string; Ids?: string[] };
type TextractBlock = {
  Id?: string;
  BlockType?: string;
  Text?: string;
  RowIndex?: number;
  ColumnIndex?: number;
  Relationships?: TextractRel[];
  SelectionStatus?: string;
};

function normalizeInline(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function childIds(block: TextractBlock, relType = "CHILD"): string[] {
  const rels = Array.isArray(block.Relationships) ? block.Relationships : [];
  const ids: string[] = [];
  for (const rel of rels) {
    if (!rel || rel.Type !== relType || !Array.isArray(rel.Ids)) continue;
    ids.push(...rel.Ids);
  }
  return ids;
}

function cellText(cell: TextractBlock, byId: Map<string, TextractBlock>): string {
  const parts: string[] = [];
  for (const id of childIds(cell, "CHILD")) {
    const child = byId.get(id);
    if (!child) continue;
    if (child.BlockType === "WORD" && typeof child.Text === "string") {
      parts.push(child.Text);
    } else if (
      child.BlockType === "SELECTION_ELEMENT" &&
      child.SelectionStatus === "SELECTED"
    ) {
      parts.push("X");
    }
  }
  if (parts.length > 0) return normalizeInline(parts.join(" "));
  return normalizeInline(String(cell.Text || ""));
}

function canonicalRunwayDim(value: string): string {
  return normalizeInline(value.replace(/×/g, "x").replace(/\s*x\s*/gi, " X "));
}

function extractRunwayNumbersFromCell(value: string): string[] {
  const v = normalizeInline(value).replace(/\s*\/\s*/g, "/");
  if (/^\d{2}[LRC]?(?:\/\d{2}[LRC]?)?$/i.test(v)) return [v.toUpperCase()];
  return [];
}

function extractRunwayNumbersFromContext(value: string): string[] {
  const out: string[] = [];
  const txt = normalizeInline(value);
  for (const m of txt.matchAll(
    /(?:RWY|THR|designation|runway|rwy\s*nr)\D{0,12}(\d{2}[LRC]?(?:\s*\/\s*\d{2}[LRC]?)?)/gi
  )) {
    const v = m[1].replace(/\s*\/\s*/g, "/").toUpperCase();
    if (/^\d{2}[LRC]?(?:\/\d{2}[LRC]?)?$/.test(v)) out.push(v);
  }
  return out;
}

function extractRunwayDims(value: string): string[] {
  const out: string[] = [];
  for (const m of normalizeInline(value).matchAll(
    /\b(\d{1,2}(?:[ .]\d{3})?\s*[x×]\s*\d{2,3})\b/gi
  )) {
    out.push(canonicalRunwayDim(m[1]));
  }
  return out;
}

function uniqPreserve(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function extractRunwaysFromTextractTables(doc: Record<string, unknown>): {
  runwayNumbers: string[];
  runwayDimensions: string[];
} {
  const blocks = (Array.isArray(doc.blocks) ? doc.blocks : []) as TextractBlock[];
  const byId = new Map<string, TextractBlock>();
  for (const b of blocks) {
    if (b?.Id) byId.set(b.Id, b);
  }

  const runwayNumbers: string[] = [];
  const runwayDimensions: string[] = [];

  const tables = blocks.filter((b) => b?.BlockType === "TABLE");
  for (const table of tables) {
    const cells = childIds(table, "CHILD")
      .map((id) => byId.get(id))
      .filter((b): b is TextractBlock => !!b && b.BlockType === "CELL")
      .map((cell) => ({
        row: Number(cell.RowIndex || 0),
        col: Number(cell.ColumnIndex || 0),
        text: cellText(cell, byId),
      }))
      .filter((c) => c.row > 0 && c.col > 0);
    if (cells.length === 0) continue;

    const joined = cells
      .map((c) => c.text.toLowerCase())
      .join(" ");
    const isRunwayTable =
      joined.includes("runway") &&
      (joined.includes("physical") ||
        joined.includes("designation") ||
        joined.includes("rwy") ||
        joined.includes("dim") ||
        joined.includes("rozmery"));
    if (!isRunwayTable) continue;

    const maxRow = Math.max(...cells.map((c) => c.row));
    const headerRows = Math.min(maxRow, 4);
    const colHeaders = new Map<number, string>();
    for (const c of cells) {
      if (c.row > headerRows) continue;
      colHeaders.set(c.col, `${colHeaders.get(c.col) || ""} ${c.text}`.trim());
    }

    let runwayCol: number | null = null;
    let dimCol: number | null = null;
    for (const [col, header] of colHeaders.entries()) {
      const h = header.toLowerCase();
      if (
        runwayCol === null &&
        /(designation|rwy\s*nr|runway\s*(nr|number)?)/.test(h) &&
        !/(bearing|coordinate|elev|pcn|surface)/.test(h)
      ) {
        runwayCol = col;
      }
      if (dimCol === null && /(dim|dimension|rozmery)/.test(h)) {
        dimCol = col;
      }
    }

    const byRow = new Map<number, Array<{ col: number; text: string }>>();
    for (const c of cells) {
      if (!byRow.has(c.row)) byRow.set(c.row, []);
      byRow.get(c.row)?.push({ col: c.col, text: c.text });
    }

    for (const [row, rowCells] of byRow.entries()) {
      if (row <= headerRows) continue;
      const rowText = rowCells
        .sort((a, b) => a.col - b.col)
        .map((x) => x.text)
        .join(" ");

      const runwayCellText =
        runwayCol === null
          ? ""
          : rowCells.find((x) => x.col === runwayCol)?.text || "";
      const dimCellText =
        dimCol === null ? "" : rowCells.find((x) => x.col === dimCol)?.text || "";

      const nums = runwayCellText
        ? extractRunwayNumbersFromCell(runwayCellText)
        : extractRunwayNumbersFromContext(rowText);
      const dims = dimCellText ? extractRunwayDims(dimCellText) : extractRunwayDims(rowText);

      runwayNumbers.push(...nums);
      runwayDimensions.push(...dims);
    }
  }

  return {
    runwayNumbers: uniqPreserve(runwayNumbers),
    runwayDimensions: uniqPreserve(runwayDimensions),
  };
}

function inferIcaoHint(text: string): string {
  const m = text.match(/\b([A-Z]{4})\s+AD\s+2\.1\b/i);
  return m ? m[1].toUpperCase() : "NIL";
}

function runCmd(
  command: string,
  args: string[],
  timeoutMs = PY_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command timed out: ${command}`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited ${code}`));
    });
  });
}

async function getPdfPageCount(path: string): Promise<number> {
  const { stdout } = await runCmd("python3", [
    "-c",
    "from pypdf import PdfReader; import sys; print(len(PdfReader(sys.argv[1]).pages))",
    path,
  ]);
  const n = Number(stdout.trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error("Failed to read PDF page count.");
  return n;
}

async function cropPdfToMaxPages(path: string, maxPages = MAX_PAGES): Promise<{ cropped: boolean; originalPages: number; finalPages: number }> {
  const originalPages = await getPdfPageCount(path);
  if (originalPages <= maxPages) {
    return { cropped: false, originalPages, finalPages: originalPages };
  }
  await runCmd("python3", [CROP_SCRIPT, path, "--pages", `1-${maxPages}`, "--overwrite"], 120_000);
  const finalPages = await getPdfPageCount(path);
  return { cropped: true, originalPages, finalPages };
}

async function extractLocalPdfText(path: string): Promise<string> {
  const { stdout } = await runCmd("python3", [
    "-c",
    "from pypdf import PdfReader; import sys; p=PdfReader(sys.argv[1]); print('\\n'.join((pg.extract_text() or '') for pg in p.pages))",
    path,
  ]);
  return stdout;
}

async function runOpenAiExtraction(
  text: string,
  icaoHint: string,
  apiKey: string,
  model: string
): Promise<AipExtractRecord> {
  const prompt = `You are a precise data extractor. Given plain text from an ICAO AIP AD 2 PDF, output a single JSON object with exactly these keys (use "NIL" for empty or not applicable):\n${SCHEMA_KEYS.map((k) => `- "${k}"`).join("\n")}\nWrite all output values in English only. If source text is non-English, translate extracted values to concise English.\nOutput only valid JSON, no markdown or extra text.`;

  const trimmed = text.slice(0, 16_000);
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1024,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `ICAO code from filename/text: ${icaoHint}\n\nExtract airport fields from this text:\n\n${trimmed}`,
        },
      ],
    }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI API ${resp.status}: ${await resp.text()}`);
  }
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("OpenAI response did not contain JSON.");
  return parseAipFieldsFromOpenAiJson(JSON.parse(match[0]));
}

function runPythonTextract(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [TEXTRACT_SCRIPT, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Textract script timed out."));
    }, PY_TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `textract script failed (${code})`));
    });
  });
}

type Mode = "aws_textract_full" | "local_fast_hybrid" | "compare_both";

async function runLocalFastHybrid(params: {
  pdfPath: string;
  openaiApiKey: string;
  openaiModel: string;
}) {
  const t0 = nowMs();
  const localText = await extractLocalPdfText(params.pdfPath);
  const tText = nowMs();
  const icaoHint = inferIcaoHint(localText);

  const scriptStart = nowMs();
  const scriptResult = parseAipFieldsFromText(localText, icaoHint);
  const scriptEnd = nowMs();

  const aiStart = nowMs();
  let aiResult: AipExtractRecord | null = null;
  let aiError: string | null = null;
  if (params.openaiApiKey) {
    try {
      const fullAi = await runOpenAiExtraction(
        localText,
        icaoHint,
        params.openaiApiKey,
        params.openaiModel
      );
      // Only fill missing fields from AI; keep script-provided values.
      aiResult = { ...scriptResult };
      for (const k of SCHEMA_KEYS) {
        if ((aiResult[k] || "").trim().toUpperCase() === "NIL") {
          aiResult[k] = fullAi[k];
        }
      }
    } catch (e) {
      aiError = e instanceof Error ? e.message : "OpenAI extraction failed";
    }
  } else {
    aiError = "OpenAI key not provided.";
  }
  const aiEnd = nowMs();

  return {
    ok: true,
    timingsMs: {
      localTextExtract: tText - t0,
      scriptExtract: scriptEnd - scriptStart,
      aiFill: aiEnd - aiStart,
      endToEnd: aiEnd - t0,
    },
    scriptResult,
    aiResult,
    aiError,
    metadata: {
      icaoHint,
      linesCount: localText ? localText.split("\n").length : 0,
      model: params.openaiModel,
    },
  };
}

async function runAwsTextractFull(params: {
  pdfBuffer: Buffer;
  fileName: string;
  region: string;
  inBucket: string;
  outBucket: string;
  openaiApiKey: string;
  openaiModel: string;
}) {
  const t0 = nowMs();
  const keyPrefix = `bench/${new Date().toISOString().slice(0, 10)}`;
  const inKey = `${keyPrefix}/${randomUUID()}-${sanitizeName(params.fileName)}`;
  const outKey = `${keyPrefix}/${randomUUID()}-${sanitizeName(params.fileName)}.textract.json`;
  const s3 = new S3Client({ region: params.region });

  await s3.send(
    new PutObjectCommand({
      Bucket: params.inBucket,
      Key: inKey,
      Body: params.pdfBuffer,
      ContentType: "application/pdf",
    })
  );
  await runPythonTextract([
    "--region",
    params.region,
    "--in-bucket",
    params.inBucket,
    "--out-bucket",
    params.outBucket,
    "--pdf-key",
    inKey,
    "--out-key",
    outKey,
  ]);
  const tTextract = nowMs();

  const outObj = await s3.send(new GetObjectCommand({ Bucket: params.outBucket, Key: outKey }));
  const textractJsonText = await streamToString(outObj.Body);
  const textractJson = JSON.parse(textractJsonText) as Record<string, unknown>;
  const orderedText = extractOrderedTextFromTextract(textractJson);
  const icaoHint = inferIcaoHint(orderedText);

  const scriptStart = nowMs();
  const scriptResult = parseAipFieldsFromText(orderedText, icaoHint);
  const tableRunway = extractRunwaysFromTextractTables(textractJson);
  if (tableRunway.runwayNumbers.length > 0) {
    scriptResult["AD2.12 Runway Number"] = tableRunway.runwayNumbers.join(", ");
  }
  if (tableRunway.runwayDimensions.length > 0) {
    scriptResult["AD2.12 Runway Dimensions"] = tableRunway.runwayDimensions.join("; ");
  }
  const scriptEnd = nowMs();

  const aiStart = nowMs();
  let aiResult: AipExtractRecord | null = null;
  let aiError: string | null = null;
  if (params.openaiApiKey) {
    try {
      aiResult = await runOpenAiExtraction(
        orderedText,
        icaoHint,
        params.openaiApiKey,
        params.openaiModel
      );
    } catch (e) {
      aiError = e instanceof Error ? e.message : "OpenAI extraction failed";
    }
  } else {
    aiError = "OpenAI key not provided.";
  }
  const aiEnd = nowMs();

  return {
    ok: true,
    upload: { bucket: params.inBucket, key: inKey },
    textractOutput: { bucket: params.outBucket, key: outKey },
    timingsMs: {
      textractTotal: tTextract - t0,
      scriptExtract: scriptEnd - scriptStart,
      aiExtract: aiEnd - aiStart,
      endToEnd: aiEnd - t0,
    },
    scriptResult,
    aiResult,
    aiError,
    metadata: {
      model: params.openaiModel,
      icaoHint,
      linesCount: orderedText ? orderedText.split("\n").length : 0,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "Only PDF files are supported." }, { status: 400 });
    }

    const mode = String(form.get("mode") || "compare_both") as Mode;

    const openaiApiKey = String(form.get("openaiApiKey") || process.env.OPENAI_API_KEY || "").trim();
    const openaiModel = String(form.get("openaiModel") || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();

    await mkdir(TMP_DIR, { recursive: true });
    const tmpPath = join(TMP_DIR, `${randomUUID()}-${sanitizeName(file.name)}`);
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpPath, originalBuffer);

    const crop = await cropPdfToMaxPages(tmpPath, MAX_PAGES);
    const croppedBuffer = await readFile(tmpPath);

    const runs: Record<string, unknown> = {};

    if (mode === "local_fast_hybrid" || mode === "compare_both") {
      try {
        runs.local_fast_hybrid = await runLocalFastHybrid({
          pdfPath: tmpPath,
          openaiApiKey,
          openaiModel,
        });
      } catch (e) {
        runs.local_fast_hybrid = {
          ok: false,
          error: e instanceof Error ? e.message : "Local fast hybrid failed",
        };
      }
    }

    if (mode === "aws_textract_full" || mode === "compare_both") {
      const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "";
      const inBucket = process.env.IN_BUCKET || "";
      const outBucket = process.env.OUT_BUCKET || "";
      if (!region || !inBucket || !outBucket) {
        runs.aws_textract_full = {
          ok: false,
          error:
            "Missing AWS env vars. Set AWS_REGION, IN_BUCKET, OUT_BUCKET in your server environment.",
        };
      } else {
        try {
          runs.aws_textract_full = await runAwsTextractFull({
            pdfBuffer: croppedBuffer,
            fileName: file.name,
            region,
            inBucket,
            outBucket,
            openaiApiKey,
            openaiModel,
          });
        } catch (e) {
          runs.aws_textract_full = {
            ok: false,
            error: e instanceof Error ? e.message : "AWS Textract run failed",
          };
        }
      }
    }

    await unlink(tmpPath).catch(() => {});

    return NextResponse.json({
      ok: true,
      mode,
      crop,
      runs,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unexpected failure",
      },
      { status: 500 }
    );
  }
}
