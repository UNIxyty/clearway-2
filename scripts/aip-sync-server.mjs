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
import { readFileSync, existsSync, readdirSync, statSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const EAD_AIP_DIR = join(PROJECT_ROOT, "data", "ead-aip");
const EAD_GEN_DIR = join(PROJECT_ROOT, "data", "ead-gen");
const PORT = Number(process.env.AIP_SYNC_PORT) || 3002;
const SYNC_SECRET = process.env.SYNC_SECRET || "";
const RUN_TIMEOUT_MS = 300_000; // 5 min per step (download + extract can be slow)

const DOWNLOAD_SCRIPT = "scripts/ead-download-aip-pdf.mjs";
const GEN_SCRIPT = "scripts/ead-download-gen-pdf.mjs";
const EXTRACT_SCRIPT_AI = "scripts/ead-extract-aip-from-pdf-ai.mjs";
const EXTRACT_SCRIPT_REGEX = "scripts/ead-extract-aip-from-pdf.mjs";
const EXTRACTED_PATH = join(PROJECT_ROOT, "data", "ead-aip-extracted.json");

function requireAuth(req) {
  if (!SYNC_SECRET) return true;
  const header = req.headers["x-sync-secret"];
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const querySecret = url.searchParams.get("secret");
  return (header && header === SYNC_SECRET) || (querySecret && querySecret === SYNC_SECRET);
}

function run(cmd, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: PROJECT_ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
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
      if (code !== 0) reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`));
      else resolve();
    });
  });
}

async function runDownload(icao) {
  await run("xvfb-run", ["-a", "-s", "-screen 0 1920x1200x24", "node", DOWNLOAD_SCRIPT, icao]);
}

async function runExtract(useAi = true) {
  const script = useAi ? EXTRACT_SCRIPT_AI : EXTRACT_SCRIPT_REGEX;
  await run("node", [script]);
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

function readGenText(prefix) {
  const txtPath = join(EAD_GEN_DIR, `${prefix}-GEN-1.2.txt`);
  if (!existsSync(txtPath)) return null;
  return readFileSync(txtPath, "utf8").trim() || null;
}

/** Split full GEN 1.2 text into GENERAL (usually first) and Part 4 (Private / Non scheduled flights). Only these parts are shown and rewritten. */
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

/** Rewrite a single GEN section (GENERAL or Part 4) with OpenAI. */
async function rewriteGenWithAI(rawText, apiKey) {
  if (!rawText || !rawText.trim()) return "";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
            "You are an aviation AIP editor. Rewrite the given AIP GEN 1.2 section for clarity and consistency. Preserve all regulatory information, requirements, and references. Output only the rewritten text, no preamble.",
        },
        { role: "user", content: rawText.slice(0, 120000) },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${err}`);
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
  "Extracting with AI…",
  "Uploading to S3…",
];

// GEN-only sync steps (sent when /sync/gen stream=1)
const GEN_STEPS = [
  "Downloading GEN PDF…",
  "Extracting text…",
  "Rewriting with AI…",
  "Uploading GEN to S3…",
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const icao = url.searchParams.get("icao")?.trim().toUpperCase() || "";
  const stream = url.searchParams.get("stream") === "1" || url.searchParams.get("stream") === "true";
  const useAi = url.searchParams.get("extract") !== "regex";

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
      if (stream) send({ step: GEN_STEPS[1] });
      const raw = readGenText(prefix);
      if (raw) {
        const { general: generalRaw, part4: part4Raw } = splitGenIntoParts(raw);
        if (stream) send({ step: GEN_STEPS[2] });
        const apiKey = process.env.OPENAI_API_KEY;
        const generalRewritten = generalRaw && apiKey ? await rewriteGenWithAI(generalRaw, apiKey) : generalRaw;
        const part4Rewritten = part4Raw && apiKey ? await rewriteGenWithAI(part4Raw, apiKey) : part4Raw;
        if (process.env.AWS_S3_BUCKET) {
          if (stream) send({ step: GEN_STEPS[3] });
          await uploadGenToS3(prefix, {
            general: { raw: generalRaw, rewritten: generalRewritten || generalRaw },
            part4: { raw: part4Raw, rewritten: part4Rewritten || part4Raw },
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
      if (stream) {
        send({ error: "GEN sync failed", detail: genErr.message });
        res.end();
      } else {
        res.writeHead(502);
        res.end(JSON.stringify({ error: "GEN sync failed", detail: genErr.message }));
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
    send({ step: AIP_STEPS[2] });
    await runExtract(useAi);
    const data = readExtracted();
    send({ step: AIP_STEPS[3] });
    if (process.env.AWS_S3_BUCKET) {
      await uploadToS3();
      await uploadPerIcaoToS3(icao, data);
      await uploadPdfToS3(icao);
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
    if (stream) {
      send({ error: "Sync failed", detail: err.message });
      res.end();
    } else {
      res.writeHead(502);
      res.end(JSON.stringify({ error: "Sync failed", detail: err.message }));
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("AIP sync server listening on port", PORT, "| download:", DOWNLOAD_SCRIPT, "| extract: AI");
});
