#!/usr/bin/env node
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const PROJECT_ROOT = process.cwd();
const EAD_ICAOS_PATH = path.join(PROJECT_ROOT, "data", "ead-country-icaos.json");
const AIP_SYNC_SERVER_PATH = path.join(PROJECT_ROOT, "scripts", "aip-sync-server.mjs");
const OUT_DIR = path.join(PROJECT_ROOT, "test-results");

function parseArgs(argv) {
  const out = {
    concurrency: 12,
    timeoutMs: 90000,
    mode: "pdf", // pdf | sync | fast
    limit: 0,
    baseUrl: process.env.PORTAL_BASE_URL || "http://127.0.0.1:3000",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--sync") out.mode = "sync";
    else if (a === "--fast") out.mode = "fast";
    else if (a === "--pdf" || a === "--download-pdf") out.mode = "pdf";
    else if (a.startsWith("--concurrency=")) out.concurrency = Number(a.split("=")[1] || out.concurrency);
    else if (a.startsWith("--timeout-ms=")) out.timeoutMs = Number(a.split("=")[1] || out.timeoutMs);
    else if (a.startsWith("--limit=")) out.limit = Number(a.split("=")[1] || 0);
    else if (a.startsWith("--base-url=")) out.baseUrl = a.split("=")[1] || out.baseUrl;
  }
  out.concurrency = Number.isFinite(out.concurrency) && out.concurrency > 0 ? Math.floor(out.concurrency) : 12;
  out.timeoutMs = Number.isFinite(out.timeoutMs) && out.timeoutMs > 0 ? Math.floor(out.timeoutMs) : 90000;
  out.limit = Number.isFinite(out.limit) && out.limit > 0 ? Math.floor(out.limit) : 0;
  return out;
}

async function loadDotEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) return;
  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseQuotedItems(listSource) {
  return Array.from(String(listSource || "").matchAll(/["']([A-Z0-9]{2,4})["']/g))
    .map((m) => m[1].toUpperCase());
}

async function loadScraperRules() {
  const src = await readFile(AIP_SYNC_SERVER_PATH, "utf8");
  const prefixes = new Set();
  const extras = new Set();
  const excluded = new Set();
  for (const m of src.matchAll(/prefixes:\s*\[([^\]]*)\]/g)) {
    for (const p of parseQuotedItems(m[1])) {
      if (p.length === 2) prefixes.add(p);
    }
  }
  for (const m of src.matchAll(/extraIcaos:\s*\[([^\]]*)\]/g)) {
    for (const icao of parseQuotedItems(m[1])) {
      if (icao.length === 4) extras.add(icao);
    }
  }
  for (const m of src.matchAll(/excludedIcaos:\s*\[([^\]]*)\]/g)) {
    for (const icao of parseQuotedItems(m[1])) {
      if (icao.length === 4) excluded.add(icao);
    }
  }
  return { prefixes, extras, excluded };
}

async function loadPortalIcaos() {
  const raw = await readFile(EAD_ICAOS_PATH, "utf8");
  const data = JSON.parse(raw);
  const set = new Set();
  for (const list of Object.values(data)) {
    if (!Array.isArray(list)) continue;
    for (const v of list) {
      const icao = String(v || "").trim().toUpperCase();
      if (/^[A-Z0-9]{4}$/.test(icao)) set.add(icao);
    }
  }
  return Array.from(set).sort();
}

function buildAirportSets(eadIcaos, scraperRules) {
  const scraperIcaos = new Set();
  for (const icao of eadIcaos) {
    const prefix = icao.slice(0, 2);
    if (scraperRules.prefixes.has(prefix) && !scraperRules.excluded.has(icao)) {
      scraperIcaos.add(icao);
    }
  }
  for (const icao of scraperRules.extras) {
    if (!scraperRules.excluded.has(icao)) scraperIcaos.add(icao);
  }
  const all = new Set(eadIcaos);
  for (const icao of scraperIcaos) all.add(icao);
  return { allIcaos: Array.from(all).sort(), scraperIcaos };
}

function endpointSetForIcao(baseUrl, icao, isScraper, mode) {
  const jsonRoute = isScraper ? "/api/aip/scraper" : "/api/aip/ead";
  const pdfRoute = isScraper ? "/api/aip/scraper/pdf" : "/api/aip/ead/pdf";
  const syncParams = new URLSearchParams({
    icao,
    sync: "1",
    force: mode === "pdf" ? "1" : "0",
    extract: "0",
  });
  const fastParams = new URLSearchParams({ icao });
  const pdfParams = new URLSearchParams({ icao, inline: "1" });
  return {
    syncUrl: `${baseUrl}${jsonRoute}?${syncParams.toString()}`,
    fastUrl: `${baseUrl}${jsonRoute}?${fastParams.toString()}`,
    pdfUrl: `${baseUrl}${pdfRoute}?${pdfParams.toString()}`,
  };
}

async function fetchWithTimeout(url, timeoutMs) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    return { res, ms: Date.now() - started, timeout: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      res: null,
      ms: Date.now() - started,
      timeout: msg.toLowerCase().includes("aborted"),
      error: msg,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text.slice(0, 600) };
  }
}

async function probeOne(task, timeoutMs, mode) {
  try {
    if (mode === "fast") {
      const one = await fetchWithTimeout(task.fastUrl, timeoutMs);
      if (!one.res) {
        return {
          icao: task.icao,
          scraper: task.scraper,
          status: 0,
          ok: false,
          ms: one.ms,
          updatedAt: null,
          pdfDownloaded: false,
          pdfBytes: 0,
          error: one.timeout ? `Timeout after ${timeoutMs}ms` : (one.error || "Network error"),
        };
      }
      const body = await parseJsonSafe(one.res);
      const err = !one.res.ok || body?.error ? (body?.detail || body?.error || `HTTP ${one.res.status}`) : null;
      return {
        icao: task.icao,
        scraper: task.scraper,
        status: one.res.status,
        ok: one.res.ok && !body?.error,
        ms: one.ms,
        updatedAt: body?.updatedAt ?? null,
        pdfDownloaded: false,
        pdfBytes: 0,
        error: err,
      };
    }

    // Step 1: force/live sync
    const syncCall = await fetchWithTimeout(task.syncUrl, timeoutMs);
    if (!syncCall.res) {
      return {
        icao: task.icao,
        scraper: task.scraper,
        status: 0,
        ok: false,
        ms: syncCall.ms,
        updatedAt: null,
        pdfDownloaded: false,
        pdfBytes: 0,
        error: syncCall.timeout ? `Sync timeout after ${timeoutMs}ms` : (syncCall.error || "Sync network error"),
      };
    }
    const syncBody = await parseJsonSafe(syncCall.res);
    if (!syncCall.res.ok || syncBody?.error) {
      return {
        icao: task.icao,
        scraper: task.scraper,
        status: syncCall.res.status,
        ok: false,
        ms: syncCall.ms,
        updatedAt: syncBody?.updatedAt ?? null,
        pdfDownloaded: false,
        pdfBytes: 0,
        error: syncBody?.detail || syncBody?.error || `Sync HTTP ${syncCall.res.status}`,
      };
    }

    // Step 2: actually download PDF bytes from portal
    const pdfCall = await fetchWithTimeout(task.pdfUrl, timeoutMs);
    if (!pdfCall.res) {
      return {
        icao: task.icao,
        scraper: task.scraper,
        status: 0,
        ok: false,
        ms: syncCall.ms + pdfCall.ms,
        updatedAt: syncBody?.updatedAt ?? null,
        pdfDownloaded: false,
        pdfBytes: 0,
        error: pdfCall.timeout ? `PDF timeout after ${timeoutMs}ms` : (pdfCall.error || "PDF network error"),
      };
    }
    const bytes = Buffer.from(await pdfCall.res.arrayBuffer());
    const isPdf = bytes.length >= 32 && bytes.subarray(0, 5).equals(Buffer.from("%PDF-"));
    const contentType = pdfCall.res.headers.get("content-type") || "";
    const pdfOk = pdfCall.res.ok && isPdf && /application\/pdf/i.test(contentType);
    return {
      icao: task.icao,
      scraper: task.scraper,
      status: pdfCall.res.status,
      ok: pdfOk,
      ms: syncCall.ms + pdfCall.ms,
      updatedAt: syncBody?.updatedAt ?? null,
      pdfDownloaded: true,
      pdfBytes: bytes.length,
      error: pdfOk ? null : `Invalid PDF response (status=${pdfCall.res.status}, contentType=${contentType}, bytes=${bytes.length})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      icao: task.icao,
      scraper: task.scraper,
      status: 0,
      ok: false,
      ms: 0,
      updatedAt: null,
      pdfDownloaded: false,
      pdfBytes: 0,
      error: msg,
    };
  }
}

async function runPool(tasks, concurrency, timeoutMs, mode) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= tasks.length) break;
      results[current] = await probeOne(tasks[current], timeoutMs, mode);
      if ((current + 1) % 100 === 0 || current + 1 === tasks.length) {
        process.stdout.write(`\rChecked ${current + 1}/${tasks.length} airports...`);
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  process.stdout.write("\n");
  return results;
}

async function sendTelegramSummary(summary, logPath, failedIcaos) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  if (!token || !chatId) return { sent: false, reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing" };
  const snippet = failedIcaos.slice(0, 30).join(", ");
  const text = [
    "Airport sync test finished.",
    `Mode: ${summary.mode}`,
    `Total: ${summary.total}`,
    `Passed: ${summary.passed}`,
    `Failed: ${summary.failed}`,
    `PDF downloaded: ${summary.pdfDownloaded}`,
    `Downloaded bytes: ${summary.totalDownloadedBytes}`,
    `Duration: ${summary.durationMs}ms`,
    `Log: ${logPath}`,
    snippet ? `Failed ICAOs (first ${Math.min(30, failedIcaos.length)}): ${snippet}` : "Failed ICAOs: none",
  ].join("\n");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram send failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return { sent: true };
}

async function main() {
  const args = parseArgs(process.argv);
  await loadDotEnv();
  const eadIcaos = await loadPortalIcaos();
  const scraperRules = await loadScraperRules();
  const { allIcaos, scraperIcaos } = buildAirportSets(eadIcaos, scraperRules);
  const selectedIcaos = args.limit > 0 ? allIcaos.slice(0, args.limit) : allIcaos;

  const tasks = selectedIcaos.map((icao) => {
    const scraper = scraperIcaos.has(icao);
    const endpoints = endpointSetForIcao(args.baseUrl, icao, scraper, args.mode);
    return {
      icao,
      scraper,
      ...endpoints,
    };
  });

  console.log(`Starting airport probe: ${tasks.length} airports, mode=${args.mode}, concurrency=${args.concurrency}`);
  const started = Date.now();
  const results = await runPool(tasks, args.concurrency, args.timeoutMs, args.mode);
  const durationMs = Date.now() - started;

  const failed = results.filter((r) => !r.ok);
  const passed = results.length - failed.length;
  const downloaded = results.filter((r) => r.pdfDownloaded).length;
  const downloadedBytes = results.reduce((sum, r) => sum + (r.pdfBytes || 0), 0);
  const summary = {
    mode: args.mode,
    total: results.length,
    passed,
    failed: failed.length,
    pdfDownloaded: downloaded,
    totalDownloadedBytes: downloadedBytes,
    durationMs,
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    concurrency: args.concurrency,
    timeoutMs: args.timeoutMs,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(OUT_DIR, `airport-sync-check-${stamp}.json`);
  const txtPath = path.join(OUT_DIR, `airport-sync-check-${stamp}.log`);
  await writeFile(jsonPath, JSON.stringify({ summary, failed, results }, null, 2), "utf8");
  const lines = [
    `Mode: ${summary.mode}`,
    `Total: ${summary.total}`,
    `Passed: ${summary.passed}`,
    `Failed: ${summary.failed}`,
    `PDF downloaded: ${summary.pdfDownloaded}`,
    `Downloaded bytes: ${summary.totalDownloadedBytes}`,
    `DurationMs: ${summary.durationMs}`,
    `BaseURL: ${summary.baseUrl}`,
    "",
    "Failed Airports:",
    ...failed.map((r) => `${r.icao}\t${r.scraper ? "scraper" : "ead"}\tstatus=${r.status}\t${r.error || "unknown error"}`),
  ];
  await writeFile(txtPath, lines.join("\n"), "utf8");

  console.log(`Done. Passed ${passed}/${results.length}. Failed ${failed.length}.`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`LOG:  ${txtPath}`);

  try {
    const tg = await sendTelegramSummary(summary, txtPath, failed.map((f) => f.icao));
    if (tg.sent) console.log("Telegram notification sent.");
    else console.log(`Telegram not sent: ${tg.reason}`);
  } catch (e) {
    console.error("Telegram notification error:", e instanceof Error ? e.message : String(e));
  }

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Airport probe failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

