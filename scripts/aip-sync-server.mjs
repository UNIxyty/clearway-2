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
import { readFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const PORT = Number(process.env.AIP_SYNC_PORT) || 3002;
const SYNC_SECRET = process.env.SYNC_SECRET || "";
const RUN_TIMEOUT_MS = 180_000; // download + extract can be slow

const DOWNLOAD_SCRIPT = "scripts/ead-download-aip-pdf.mjs";
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
  await run("xvfb-run", ["-a", "-s", "-screen 0 1920x1080x24", "node", DOWNLOAD_SCRIPT, icao]);
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const icao = url.searchParams.get("icao")?.trim().toUpperCase() || "";
  const useAi = url.searchParams.get("extract") !== "regex";

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

  res.setHeader("Content-Type", "application/json");
  try {
    await runDownload(icao);
    await runExtract(useAi);
    const data = readExtracted();
    if (process.env.AWS_S3_BUCKET) await uploadToS3();
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ok: true,
        icao,
        airports: data?.airports ?? [],
        source: data?.source ?? null,
      })
    );
  } catch (err) {
    console.error("AIP sync failed for", icao, err);
    res.writeHead(502);
    res.end(JSON.stringify({ error: "Sync failed", detail: err.message }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("AIP sync server listening on port", PORT, "| download:", DOWNLOAD_SCRIPT, "| extract: AI");
});
