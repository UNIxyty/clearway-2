#!/usr/bin/env node
/**
 * NOTAM sync server – run on EC2/self-hosted. Receives sync requests and runs the NOTAM/Weather sync scripts,
 * then returns the result from local storage. Used by the portal so "sync" triggers live refresh.
 *
 * Usage: SYNC_SECRET=your-secret node scripts/notam-sync-server.mjs
 * Port: 3001 (or NOTAM_SYNC_PORT)
 *
 * Split NOTAM vs weather:
 *   SYNC_SERVER_MODE=notam   → only GET /sync  (NOTAM)
 *   SYNC_SERVER_MODE=weather → only GET /sync/weather
 *   SYNC_SERVER_MODE=all     → both (default)
 * Sync scripts currently use SkyLink API sources. FAA browser scraper remains as optional fallback.
 */

import { createServer } from "http";
import { spawn, spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { readFile as readStorageFile } from "../lib/storage.mjs";
import { logError, logInfo } from "../lib/utils/logger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const PORT = Number(process.env.NOTAM_SYNC_PORT) || 3001;
const SYNC_SECRET = process.env.SYNC_SECRET || "";
const RUN_TIMEOUT_MS = 120_000;

// skylink = API-based sync (default), faa = FAA fallback, crewbriefing = browser scrape.
const NOTAM_SCRAPER = (process.env.NOTAM_SCRAPER || "skylink").toLowerCase();
const SCRAPER_SCRIPT =
  NOTAM_SCRAPER === "faa"
    ? "scripts/notam-scraper.mjs"
    : NOTAM_SCRAPER === "crewbriefing"
      ? "scripts/crewbriefing-opmet-notams.mjs"
      : "scripts/skylink-notams.mjs";
const WEATHER_SCRIPT =
  NOTAM_SCRAPER === "crewbriefing"
    ? "scripts/crewbriefing-opmet-notams.mjs"
    : "scripts/skylink-weather.mjs";

const SYNC_SERVER_MODE = (process.env.SYNC_SERVER_MODE || "all").toLowerCase();
const ALLOW_NOTAM = SYNC_SERVER_MODE === "all" || SYNC_SERVER_MODE === "notam";
const ALLOW_WEATHER = SYNC_SERVER_MODE === "all" || SYNC_SERVER_MODE === "weather";
let hasXvfbRunBinary = null;

/** Pass through environment for weather sync child process. */
function envForWeatherScraper(base = process.env) {
  return { ...base };
}

function requireAuth(req) {
  if (!SYNC_SECRET) return true;
  const header = req.headers["x-sync-secret"];
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const querySecret = url.searchParams.get("secret");
  return (header && header === SYNC_SECRET) || (querySecret && querySecret === SYNC_SECRET);
}

/** Linux EC2 uses xvfb-run; macOS and SYNC_USE_XVFB=0 use plain node (headless Playwright). */
function useXvfb() {
  if (process.env.SYNC_USE_XVFB === "0" || process.env.SYNC_USE_XVFB === "false") return false;
  if (process.platform === "darwin") return false;
  if (hasXvfbRunBinary === null) {
    const probe = spawnSync("xvfb-run", ["--help"], { stdio: "ignore" });
    hasXvfbRunBinary = !probe.error;
    if (!hasXvfbRunBinary) {
      logInfo("SYNC-SERVER", "xvfb-run not found; falling back to headless node execution.");
    }
  }
  if (!hasXvfbRunBinary) return false;
  return true;
}

function buildScraperEnv(forWeather) {
  const src = forWeather ? envForWeatherScraper(process.env) : process.env;
  const base = { ...src, CHROME_CHANNEL: process.env.CHROME_CHANNEL || "chromium" };
  const defaultHeaded = useXvfb() ? "1" : "0";
  return { ...base, USE_HEADED: process.env.USE_HEADED ?? defaultHeaded };
}

function buildScriptArgs(scriptRel, icao, mode) {
  const args = [scriptRel, "--json", icao];
  if (scriptRel === "scripts/crewbriefing-opmet-notams.mjs") {
    args.push("--mode", mode);
  }
  return args;
}

function spawnScraperChild(scriptRel, icao, env, mode) {
  const scriptArgs = buildScriptArgs(scriptRel, icao, mode);
  if (useXvfb()) {
    return spawn(
      "xvfb-run",
      ["-a", "-s", "-screen 0 1920x1080x24", "node", ...scriptArgs],
      { cwd: PROJECT_ROOT, env, stdio: ["ignore", "pipe", "pipe"] }
    );
  }
  return spawn("node", scriptArgs, {
    cwd: PROJECT_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runScraper(icao) {
  const env = buildScraperEnv(false);
  return new Promise((resolve, reject) => {
    const child = spawnScraperChild(SCRAPER_SCRIPT, icao, env, "notam");
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
      if (code !== 0) {
        const trimmed = stderr.trim();
        const prefix = trimmed.slice(0, 600);
        const suffix = trimmed.slice(-900);
        reject(new Error(`Scraper exited ${code}: ${prefix}${trimmed.length > 1500 ? " ... " : ""}${suffix}`));
      }
      else resolve();
    });
  });
}

async function readFromS3(icao) {
  const bytes = await readStorageFile(`notam/${icao}.json`);
  if (!bytes) throw new Error(`Missing local NOTAM payload for ${icao}`);
  return JSON.parse(bytes.toString("utf8"));
}

async function runWeatherScraper(icao) {
  const env = buildScraperEnv(true);
  return new Promise((resolve, reject) => {
    const child = spawnScraperChild(WEATHER_SCRIPT, icao, env, "weather");
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Weather scraper timed out"));
    }, RUN_TIMEOUT_MS);
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const trimmed = stderr.trim();
        const prefix = trimmed.slice(0, 600);
        const suffix = trimmed.slice(-900);
        reject(new Error(`Weather scraper exited ${code}: ${prefix}${trimmed.length > 1500 ? " ... " : ""}${suffix}`));
      }
      else resolve();
    });
  });
}

async function readWeatherFromS3(icao) {
  const bytes = await readStorageFile(`weather/${icao}.json`);
  if (!bytes) throw new Error(`Missing local weather payload for ${icao}`);
  return JSON.parse(bytes.toString("utf8"));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const icao = url.searchParams.get("icao")?.trim().toUpperCase() || "";
  const stream = url.searchParams.get("stream") === "1" || url.searchParams.get("stream") === "true";
  const isWeatherPath = url.pathname === "/sync/weather" || url.pathname === "/sync/weather/";
  const isNotamPath = url.pathname === "/sync" || url.pathname === "/sync/";

  if (!isWeatherPath && !isNotamPath) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  if (isWeatherPath && !ALLOW_WEATHER) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", detail: "Weather disabled (SYNC_SERVER_MODE=notam)" }));
    return;
  }
  if (isNotamPath && !ALLOW_NOTAM) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", detail: "NOTAM sync disabled (SYNC_SERVER_MODE=weather)" }));
    return;
  }

  const isWeather = isWeatherPath;

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
      "X-Accel-Buffering": "no",
    });
    const send = (obj) => res.write("data: " + JSON.stringify(obj) + "\n\n");

    // Send first step immediately
    send({ step: isWeather ? "Starting weather scrape…" : "Starting NOTAM scrape…" });

    const progressFile = join(PROJECT_ROOT, "scripts", `${isWeather ? ".weather-progress" : ".notam-progress"}-${icao}-${Date.now()}`);
    const env = {
      ...buildScraperEnv(isWeather),
      ...(isWeather ? { WEATHER_PROGRESS_FILE: progressFile } : { NOTAM_PROGRESS_FILE: progressFile }),
    };
    const scriptRel = isWeather ? WEATHER_SCRIPT : SCRAPER_SCRIPT;
    const child = spawnScraperChild(scriptRel, icao, env, isWeather ? "weather" : "notam");
    let lastProgressSize = 0;
    const pollProgress = () => {
      try {
        if (!existsSync(progressFile)) return;
        const content = readFileSync(progressFile, "utf8");
        const newPart = content.slice(lastProgressSize);
        lastProgressSize = content.length;
        const lines = newPart.split("\n");
        for (const line of lines) {
          const m = line.match(/^PROGRESS:(.*)$/);
          if (m) send({ step: m[1].trim() });
        }
      } catch (_) {}
    };
    const progressInterval = setInterval(pollProgress, 280);
    const stopProgressPoll = () => {
      clearInterval(progressInterval);
      try {
        if (existsSync(progressFile)) unlinkSync(progressFile);
      } catch (_) {}
    };
    // Also read stderr in case progress file isn't used (e.g. old scraper)
    let stderrBuf = "";
    const flushStderr = () => {
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        const m = line.match(/^PROGRESS:(.*)$/);
        if (m) send({ step: m[1].trim() });
      }
    };
    child.stderr?.on("data", (chunk) => {
      stderrBuf += chunk.toString();
      flushStderr();
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      stopProgressPoll();
      send({ error: "Scraper timed out" });
      res.end();
    }, RUN_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timeout);
      stopProgressPoll();
      pollProgress(); // one last read
      flushStderr();
      if (code !== 0) {
        send({ error: isWeather ? "Weather scraper failed" : "Scraper failed", detail: "Exit code " + code });
        res.end();
        return;
      }
      (isWeather ? readWeatherFromS3(icao) : readFromS3(icao))
        .then((data) => {
          if (isWeather) {
            send({
              done: true,
              icao: data.icao ?? icao,
              weather: data.weather ?? "",
              updatedAt: data.updatedAt ?? null,
            });
          } else {
            send({
              done: true,
              icao: data.icao ?? icao,
              notams: data.notams ?? [],
              updatedAt: data.updatedAt ?? null,
            });
          }
          res.end();
        })
        .catch((err) => {
          send({ error: "Storage read failed", detail: err.message });
          res.end();
        });
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      stopProgressPoll();
      send({ error: err.message });
      res.end();
    });
    return;
  }

  res.setHeader("Content-Type", "application/json");
  try {
    if (isWeather) {
      await runWeatherScraper(icao);
    } else {
      await runScraper(icao);
    }
    const data = isWeather ? await readWeatherFromS3(icao) : await readFromS3(icao);
    res.writeHead(200);
    if (isWeather) {
      res.end(JSON.stringify({ icao: data.icao ?? icao, weather: data.weather ?? "", updatedAt: data.updatedAt ?? null }));
    } else {
      res.end(JSON.stringify({ icao: data.icao ?? icao, notams: data.notams ?? [], updatedAt: data.updatedAt ?? null }));
    }
  } catch (err) {
    logError(isWeather ? "WEATHER-SYNC" : "NOTAM-SYNC", `Sync failed for ${icao}`, err);
    res.writeHead(502);
    res.end(JSON.stringify({ error: isWeather ? "Weather sync failed" : "Sync failed", detail: err.message }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  logInfo(
    "SYNC-SERVER",
    `Listening on ${PORT} mode=${SYNC_SERVER_MODE} scraper=${NOTAM_SCRAPER} allow_notam=${ALLOW_NOTAM} allow_weather=${ALLOW_WEATHER} script=${SCRAPER_SCRIPT}`,
  );
});
