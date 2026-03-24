#!/usr/bin/env node
/**
 * AIP sync server – run on EC2. Receives sync requests and runs EAD download + extract,
 * then returns the result (and optionally uploads to S3). Uses the same SYNC_SECRET as
 * the NOTAM sync server so the portal can use NOTAM_SYNC_SECRET for both.
 *
 * Usage: SYNC_SECRET=your-secret EAD_USER=... EAD_PASSWORD_ENC=... node scripts/aip-sync-server.mjs
 * Port: 3002 (or AIP_SYNC_PORT)
 */

import { createServer } from "http";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const EAD_AIP_DIR = join(PROJECT_ROOT, "data", "ead-aip");
const EAD_GEN_DIR = join(PROJECT_ROOT, "data", "ead-gen");
const PORT = Number(process.env.AIP_SYNC_PORT) || 3002;
const SYNC_SECRET = process.env.SYNC_SECRET || "";
const RUN_TIMEOUT_MS = 300_000; // 5 min per step (download + extract can be slow)
const DISABLE_AI_FOR_TESTING = String(process.env.DISABLE_AI_FOR_TESTING || "").toLowerCase() === "true";

const DOWNLOAD_SCRIPT = "scripts/ead-download-aip-pdf.mjs";
const GEN_SCRIPT = "scripts/ead-download-gen-pdf.mjs";
const META_EXTRACT_SCRIPT = join(PROJECT_ROOT, "aip-meta-extractor.py");
const EXTRACTED_PATH = join(PROJECT_ROOT, "data", "ead-aip-extracted.json");

function requireAuth(req) {
  if (!SYNC_SECRET) return true;
  const header = req.headers["x-sync-secret"];
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const querySecret = url.searchParams.get("secret");
  return (header && header === SYNC_SECRET) || (querySecret && querySecret === SYNC_SECRET);
}

/** Map thrown errors to client-facing payload; detect OpenRouter insufficient credits (402). */
function syncFailurePayload(err) {
  const msg = err?.message ?? String(err);
  const base = { error: "Sync failed", detail: msg };
  if (/OpenRouter API 402\b/.test(msg) || /"code"\s*:\s*402/.test(msg) || /Insufficient credits/i.test(msg)) {
    let shortDetail = "Insufficient credits — add credits at https://openrouter.ai/settings/credits";
    const um = msg.match(/"message"\s*:\s*"([^"]+)"/);
    if (um) shortDetail = um[1];
    return { error: "Insufficient API credits", detail: shortDetail, code: 402 };
  }
  return base;
}

function run(cmd, args, env = process.env, onStdoutLine = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: PROJECT_ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (typeof onStdoutLine === "function") {
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        for (const line of lines) onStdoutLine(line);
      }
    });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timeout: ${cmd} ${args.join(" ")}`));
    }, RUN_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`${cmd} exited ${code}: ${(stderr || stdout).slice(-500)}`));
      else resolve();
    });
  });
}

async function runDownload(icao) {
  await run("xvfb-run", ["-a", "-s", "-screen 0 1920x1200x24", "node", DOWNLOAD_SCRIPT, icao]);
}

function mapMetaToAirportRow(meta, icao) {
  return {
    "Publication Date": meta.publication_date || "NIL",
    "Airport Code": meta.airport_code || icao,
    "Airport Name": meta.airport_name || "NIL",
    "AD2.2 Types of Traffic Permitted": meta.ad2_2_types_of_traffic || "NIL",
    "AD2.2 Remarks": meta.ad2_2_remarks || "NIL",
    "AD2.2 AD Operator": meta.ad2_2_operator_name || "NIL",
    "AD2.2 Address": meta.ad2_2_address || "NIL",
    "AD2.2 Telephone": meta.ad2_2_telephone || "NIL",
    "AD2.2 Telefax": meta.ad2_2_telefax || "NIL",
    "AD2.2 E-mail": meta.ad2_2_email || "NIL",
    "AD2.2 AFS": meta.ad2_2_afs || "NIL",
    "AD2.2 Website": meta.ad2_2_website || "NIL",
    "AD2.3 AD Operator": meta.ad2_3_ad_operator || "NIL",
    "AD 2.3 Customs and Immigration": meta.ad2_3_customs_immigration || "NIL",
    "AD2.3 ATS": meta.ad2_3_ats || "NIL",
    "AD2.3 Remarks": meta.ad2_3_remarks || "NIL",
    "AD2.6 AD category for fire fighting": meta.ad2_6_fire_fighting_category || "NIL",
    "AD2.12 Runway Number":
      meta.ad2_12_runway_number || meta.ad2_12_runway_designators || "NIL",
    "AD2.12 Runway Dimensions": meta.ad2_12_runway_dimensions || "NIL",
  };
}

async function runExtract(icao, progress = null) {
  const pdfPath = findDownloadedPdf(icao);
  if (!pdfPath) {
    throw new Error(`Downloaded PDF not found for ${icao}`);
  }
  const tempOut = join(PROJECT_ROOT, "data", "ead-aip", `${icao}-meta.json`);
  await run(
    "python3",
    [META_EXTRACT_SCRIPT, pdfPath, "--out", tempOut, "--quiet"],
    process.env,
    (line) => {
      if (!progress) return;
      progress(line);
    }
  );
  const metaRaw = readFileSync(tempOut, "utf8");
  const meta = JSON.parse(metaRaw);
  try {
    unlinkSync(tempOut);
  } catch (_) {}

  const airportRow = mapMetaToAirportRow(meta, icao);
  const out = {
    source: "EAD AD 2 PDFs (unified meta extractor)",
    extracted: new Date().toISOString(),
    airports: [airportRow],
  };
  writeFileSync(EXTRACTED_PATH, JSON.stringify(out, null, 2), "utf8");
}

function readExtracted() {
  if (!existsSync(EXTRACTED_PATH)) return null;
  const raw = readFileSync(EXTRACTED_PATH, "utf8");
  return JSON.parse(raw);
}

async function uploadToS3() {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) return;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const body = readFileSync(EXTRACTED_PATH, "utf8");
  const client = new S3Client({ region });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: "aip/ead-aip-extracted.json",
      Body: body,
      ContentType: "application/json",
    })
  );
}

async function deleteOldFromS3(icao) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) return;
  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const keys = [`aip/ead/${icao}.json`, `aip/ead-pdf/${icao}.pdf`];
  for (const Key of keys) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
    } catch (_) {}
  }
}

function findDownloadedPdf(icao) {
  if (!existsSync(EAD_AIP_DIR)) return null;
  const icaoUpper = icao.toUpperCase();
  const files = readdirSync(EAD_AIP_DIR).filter((f) => f.endsWith(".pdf") && f.toUpperCase().includes(icaoUpper));
  if (files.length === 0) return null;
  files.sort((a, b) => {
    try {
      return statSync(join(EAD_AIP_DIR, b)).mtimeMs - statSync(join(EAD_AIP_DIR, a)).mtimeMs;
    } catch (_) {
      return 0;
    }
  });
  return join(EAD_AIP_DIR, files[0]);
}

async function uploadPdfToS3(icao) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) return;
  const pdfPath = findDownloadedPdf(icao);
  if (!pdfPath) return;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const body = readFileSync(pdfPath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `aip/ead-pdf/${icao}.pdf`,
      Body: body,
      ContentType: "application/pdf",
    })
  );
}

async function uploadPerIcaoToS3(icao, data) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket || !data?.airports) return;
  const match = data.airports.find((a) => (a["Airport Code"] ?? "").toUpperCase() === icao);
  if (!match) return;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const body = JSON.stringify({
    airports: [match],
    updatedAt: new Date().toISOString(),
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `aip/ead/${icao}.json`,
      Body: body,
      ContentType: "application/json",
    })
  );
}

async function runGenDownload(prefix) {
  await run("xvfb-run", ["-a", "-s", "-screen 0 1920x1200x24", "node", GEN_SCRIPT, prefix]);
}

async function uploadGenPdfToS3(prefix) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) return;
  const pdfPath = join(EAD_GEN_DIR, `${prefix}-GEN-1.2.pdf`);
  if (!existsSync(pdfPath)) return;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const body = readFileSync(pdfPath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `aip/gen-pdf/${prefix}-GEN-1.2.pdf`,
      Body: body,
      ContentType: "application/pdf",
    })
  );
}

function readGenText(prefix) {
  const txtPath = join(EAD_GEN_DIR, `${prefix}-GEN-1.2.txt`);
  if (!existsSync(txtPath)) return null;
  return readFileSync(txtPath, "utf8").trim() || null;
}

/** Match "Non scheduled" / "Non-scheduled" / "3.\tNON-SCHEDULED COMMERCIAL FLIGHTS" type headings. Allow optional dot after number. */
const NON_SCHEDULED_RE = /Part\s+[0-9]+\s*(?:Non[- ]scheduled|non[- ]scheduled)|^(?:Non[- ]scheduled\s+flights?|Non[- ]scheduled\s+commercial)\b|^\s*[0-9]+\s*\.?\s*Non[- ]scheduled/im;
/** Match "Private flights" / "4. PRIVATE FLIGHTS" type headings. */
const PRIVATE_FLIGHTS_RE = /Part\s+4\b|4\.\s*Private|^(?:Private\s+flights?|Private\s+aviation)\b|^\s*[0-9]+\s*\.?\s*Private\s+flights/im;

/** Split full GEN 1.2 into GENERAL, Non scheduled flights, and Private flights. Non scheduled and Private are distinct; if only one is present the other is left blank. */
function splitGenIntoThreeParts(fullText) {
  if (!fullText || typeof fullText !== "string") return { general: "", nonScheduled: "", privateFlights: "" };
  const trimmed = fullText.trim();
  const lines = trimmed.split(/\r?\n/);
  let idxNonSched = -1;
  let idxPrivate = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (idxNonSched < 0 && NON_SCHEDULED_RE.test(line)) idxNonSched = i;
    if (idxPrivate < 0 && PRIVATE_FLIGHTS_RE.test(line)) idxPrivate = i;
  }
  const indices = [idxNonSched, idxPrivate].filter((i) => i >= 0).sort((a, b) => a - b);
  const firstIdx = indices[0];
  const secondIdx = indices[1];
  if (firstIdx === undefined) {
    return { general: trimmed, nonScheduled: "", privateFlights: "" };
  }
  const general = lines.slice(0, firstIdx).join("\n").trim();
  const firstBlock = secondIdx !== undefined ? lines.slice(firstIdx, secondIdx).join("\n").trim() : lines.slice(firstIdx).join("\n").trim();
  const secondBlock = secondIdx !== undefined ? lines.slice(secondIdx).join("\n").trim() : "";
  const nonScheduled = idxNonSched === firstIdx ? firstBlock : idxNonSched === secondIdx ? secondBlock : "";
  const privateFlights = idxPrivate === firstIdx ? firstBlock : idxPrivate === secondIdx ? secondBlock : "";
  return { general, nonScheduled, privateFlights };
}

/** Rewrite a single GEN section with AI. Routes to OpenRouter for anthropic/ and google/ models. */
async function rewriteGenWithAI(rawText, _unused, modelOverride = null) {
  if (!rawText || !rawText.trim()) return "";
  const model = modelOverride || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const isOpenRouter = model.includes("/");
  const apiUrl = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const apiKey = isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(isOpenRouter ? "OPENROUTER_API_KEY not set on server" : "OPENAI_API_KEY not set on server");
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an aviation AIP editor. Rewrite the given AIP GEN 1.2 section into continuous prose. Preserve all regulatory information, requirements, and references. Output format: flowing paragraphs only — no section numbers (e.g. 1.1.1, 1.1.2), no headings, no bullet or numbered lists; convert lists and subsections into clear sentences and paragraphs. Keep contact details (addresses, phone, email, URLs) where they are part of procedures. Output only the rewritten text, no preamble or commentary.",
        },
        { role: "user", content: rawText.slice(0, 120000) },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${isOpenRouter ? "OpenRouter" : "OpenAI"} API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function uploadGenToS3(prefix, payload) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) return;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `aip/gen/${prefix}.json`,
      Body: JSON.stringify(payload),
      ContentType: "application/json",
    })
  );
}

// AIP-only sync steps (sent when stream=1)
const AIP_STEPS = [
  "Deleting old from S3…",
  "Downloading AIP PDF…",
  "PDF uploaded to S3…",
  "Extracting with unified AIP parser…",
  "Uploading to S3…",
];

// GEN-only sync steps (sent when /sync/gen stream=1)
const GEN_STEPS = [
  "Downloading GEN PDF…",
  "GEN PDF uploaded to S3…",
  "Extracting text…",
  DISABLE_AI_FOR_TESTING ? "Rewriting skipped (AI disabled for testing)…" : "Rewriting with AI…",
  "Uploading GEN to S3…",
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const icao = url.searchParams.get("icao")?.trim().toUpperCase() || "";
  const stream = url.searchParams.get("stream") === "1" || url.searchParams.get("stream") === "true";
  const modelOverride = url.searchParams.get("model")?.trim() || null;

  // —— /sync/gen: GEN-only sync (separate from AIP) ——
  if (url.pathname === "/sync/gen" || url.pathname === "/sync/gen/") {
    const prefix = icao.length >= 2 ? icao.slice(0, 2).toUpperCase() : (url.searchParams.get("prefix")?.trim().toUpperCase() || "");
    if (!/^[A-Z]{2}$/.test(prefix)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Valid icao or prefix required (e.g. icao=EDQA or prefix=ED)" }));
      return;
    }
    if (!requireAuth(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    const send = (obj) => {
      if (!stream) return;
      res.write("data: " + JSON.stringify(obj) + "\n\n");
    };
    if (stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      send({ step: GEN_STEPS[0] });
    } else {
      res.setHeader("Content-Type", "application/json");
    }
    try {
      await runGenDownload(prefix);
      if (process.env.AWS_S3_BUCKET) {
        await uploadGenPdfToS3(prefix);
        if (stream) {
          send({ step: GEN_STEPS[1] });
          send({ step: "PDF ready", pdfReady: true, type: "gen", prefix });
        }
      }
      if (stream) send({ step: GEN_STEPS[2] });
      const raw = readGenText(prefix);
      if (raw) {
        const { general: generalRaw, nonScheduled: nonSchedRaw, privateFlights: privateRaw } = splitGenIntoThreeParts(raw);
        if (stream) send({ step: GEN_STEPS[3] });
        const hasKey = !DISABLE_AI_FOR_TESTING
          && (modelOverride?.includes("/") ? !!process.env.OPENROUTER_API_KEY : !!process.env.OPENAI_API_KEY);
        const generalRewritten = generalRaw && hasKey ? await rewriteGenWithAI(generalRaw, null, modelOverride) : generalRaw;
        const nonSchedRewritten = nonSchedRaw && hasKey ? await rewriteGenWithAI(nonSchedRaw, null, modelOverride) : nonSchedRaw;
        const privateRewritten = privateRaw && hasKey ? await rewriteGenWithAI(privateRaw, null, modelOverride) : privateRaw;
        if (process.env.AWS_S3_BUCKET) {
          if (stream) send({ step: GEN_STEPS[4] });
          await uploadGenToS3(prefix, {
            general: { raw: generalRaw, rewritten: generalRewritten || generalRaw },
            nonScheduled: { raw: nonSchedRaw, rewritten: nonSchedRewritten || nonSchedRaw },
            privateFlights: { raw: privateRaw, rewritten: privateRewritten || privateRaw },
            updatedAt: new Date().toISOString(),
          });
        }
      }
      if (stream) {
        send({ done: true, prefix });
        res.end();
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, prefix }));
      }
    } catch (genErr) {
      console.error("GEN sync failed for", prefix, genErr.message);
      const fail = syncFailurePayload(genErr);
      const payload =
        fail.code === 402
          ? { error: "GEN sync failed", detail: fail.detail, code: 402 }
          : { error: "GEN sync failed", detail: genErr.message };
      if (stream) {
        send(payload);
        res.end();
      } else {
        res.writeHead(fail.code === 402 ? 402 : 502);
        res.end(JSON.stringify(payload));
      }
    }
    return;
  }

  // —— /sync: AIP-only sync ——
  if (url.pathname !== "/sync" && url.pathname !== "/sync/") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Valid 4-letter ICAO required (query: icao=XXXX)" }));
    return;
  }

  if (!requireAuth(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const send = (obj) => {
    if (!stream) return;
    res.write("data: " + JSON.stringify(obj) + "\n\n");
  };

  if (stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  } else {
    res.setHeader("Content-Type", "application/json");
  }

  try {
    send({ step: AIP_STEPS[0] });
    if (process.env.AWS_S3_BUCKET) await deleteOldFromS3(icao);
    send({ step: AIP_STEPS[1] });
    await runDownload(icao);
    if (process.env.AWS_S3_BUCKET) {
      await uploadPdfToS3(icao);
      send({ step: AIP_STEPS[2] });
      send({ step: "PDF ready", pdfReady: true, type: "aip", icao });
    }
    send({ step: AIP_STEPS[3] });
    await runExtract(icao, (line) => {
      const cleaned = line.replace(/^[-•]\s*/, "").trim();
      if (!cleaned) return;
      send({ step: cleaned });
    });
    const data = readExtracted();
    send({ step: AIP_STEPS[4] });
    if (process.env.AWS_S3_BUCKET) {
      await uploadToS3();
      await uploadPerIcaoToS3(icao, data);
    }
    const payload = {
      done: true,
      ok: true,
      icao,
      airports: data?.airports ?? [],
      source: data?.source ?? null,
    };
    if (stream) {
      send(payload);
      res.end();
    } else {
      res.writeHead(200);
      res.end(JSON.stringify(payload));
    }
  } catch (err) {
    console.error("AIP sync failed for", icao, err);
    const fail = syncFailurePayload(err);
    if (stream) {
      send(fail);
      res.end();
    } else {
      res.writeHead(fail.code === 402 ? 402 : 502);
      res.end(JSON.stringify(fail));
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    "AIP sync server listening on port",
    PORT,
    "| download:",
    DOWNLOAD_SCRIPT,
    "| extract: unified parser"
  );
});
