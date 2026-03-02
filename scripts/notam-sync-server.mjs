#!/usr/bin/env node
/**
 * NOTAM sync server – run on EC2. Receives sync requests and runs the NOTAM scraper,
 * then returns the result (from S3). Used by the portal so "sync" triggers a live scrape.
 *
 * Usage: AWS_S3_BUCKET=your-bucket SYNC_SECRET=your-secret node scripts/notam-sync-server.mjs
 * Port: 3001 (or NOTAM_SYNC_PORT)
 */

import { createServer } from "http";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const PORT = Number(process.env.NOTAM_SYNC_PORT) || 3001;
const SYNC_SECRET = process.env.SYNC_SECRET || "";
const RUN_TIMEOUT_MS = 120_000;

function requireAuth(req) {
  if (!SYNC_SECRET) return true;
  const header = req.headers["x-sync-secret"];
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const querySecret = url.searchParams.get("secret");
  return (header && header === SYNC_SECRET) || (querySecret && querySecret === SYNC_SECRET);
}

async function runScraper(icao) {
  const env = {
    ...process.env,
    USE_HEADED: "1",
    CHROME_CHANNEL: process.env.CHROME_CHANNEL || "chrome",
  };
  return new Promise((resolve, reject) => {
    const child = spawn(
      "xvfb-run",
      ["-a", "-s", "-screen 0 1920x1080x24", "node", "scripts/notam-scraper.mjs", "--json", icao],
      { cwd: PROJECT_ROOT, env, stdio: ["ignore", "pipe", "pipe"] }
    );
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Scraper timed out"));
    }, RUN_TIMEOUT_MS);
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Scraper exited ${code}: ${stderr.slice(-500)}`));
      else resolve();
    });
  });
}

async function readFromS3(icao) {
  const bucket = process.env.AWS_S3_BUCKET;
  const prefix = process.env.AWS_S3_PREFIX || "notams";
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) throw new Error("AWS_S3_BUCKET not set");
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: `${prefix}/${icao}.json` })
  );
  const body = await res.Body.transformToString();
  return JSON.parse(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const icao = url.searchParams.get("icao")?.trim().toUpperCase() || "";
  const stream = url.searchParams.get("stream") === "1" || url.searchParams.get("stream") === "true";

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

  if (stream) {
    // SSE stream: send progress steps then final result
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (obj) => res.write("data: " + JSON.stringify(obj) + "\n\n");

    const env = { ...process.env, USE_HEADED: "1", CHROME_CHANNEL: process.env.CHROME_CHANNEL || "chrome" };
    const child = spawn(
      "xvfb-run",
      ["-a", "-s", "-screen 0 1920x1080x24", "node", "scripts/notam-scraper.mjs", "--json", icao],
      { cwd: PROJECT_ROOT, env, stdio: ["ignore", "pipe", "pipe"] }
    );
    let stderrBuf = "";
    const flushProgress = () => {
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        const m = line.match(/^PROGRESS:(.*)$/);
        if (m) send({ step: m[1].trim() });
      }
    };
    child.stderr?.on("data", (chunk) => {
      stderrBuf += chunk.toString();
      flushProgress();
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      send({ error: "Scraper timed out" });
      res.end();
    }, RUN_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timeout);
      flushProgress();
      if (code !== 0) {
        send({ error: "Scraper failed", detail: "Exit code " + code });
        res.end();
        return;
      }
      readFromS3(icao)
        .then((data) => {
          send({
            done: true,
            icao: data.icao ?? icao,
            notams: data.notams ?? [],
            updatedAt: data.updatedAt ?? null,
          });
          res.end();
        })
        .catch((err) => {
          send({ error: "S3 read failed", detail: err.message });
          res.end();
        });
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      send({ error: err.message });
      res.end();
    });
    return;
  }

  res.setHeader("Content-Type", "application/json");
  try {
    await runScraper(icao);
    const data = await readFromS3(icao);
    res.writeHead(200);
    res.end(JSON.stringify({ icao: data.icao ?? icao, notams: data.notams ?? [], updatedAt: data.updatedAt ?? null }));
  } catch (err) {
    console.error("Sync failed for", icao, err);
    res.writeHead(502);
    res.end(JSON.stringify({ error: "Sync failed", detail: err.message }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("NOTAM sync server listening on port", PORT);
});
