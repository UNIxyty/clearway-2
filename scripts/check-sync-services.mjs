#!/usr/bin/env node
/**
 * Quick health/debug checker for portal + sync services.
 *
 * Usage:
 *   node scripts/check-sync-services.mjs EVRA
 *
 * Reads:
 *   NOTAM_SYNC_URL, WEATHER_SYNC_URL, AIP_SYNC_URL
 *   NOTAM_SYNC_SECRET, WEATHER_SYNC_SECRET (or NOTAM_SYNC_SECRET)
 */

const icao = (process.argv[2] || "EVRA").trim().toUpperCase();
if (!/^[A-Z0-9]{4}$/.test(icao)) {
  console.error("Usage: node scripts/check-sync-services.mjs <ICAO>");
  process.exit(1);
}

const notamUrl = (process.env.NOTAM_SYNC_URL || "http://notam-sync:3001").replace(/\/$/, "");
const weatherUrl = (process.env.WEATHER_SYNC_URL || notamUrl).replace(/\/$/, "");
const aipUrl = (process.env.AIP_SYNC_URL || "http://aip-sync:3002").replace(/\/$/, "");
const notamSecret = process.env.NOTAM_SYNC_SECRET || "";
const weatherSecret = process.env.WEATHER_SYNC_SECRET || notamSecret;

async function requestJson(url, secret) {
  const headers = secret ? { "X-Sync-Secret": secret } : {};
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { ok: res.ok, status: res.status, text, json };
}

function printResult(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`HTTP ${result.status} ${result.ok ? "OK" : "FAIL"}`);
  if (result.json) {
    console.log(JSON.stringify(result.json, null, 2).slice(0, 1200));
  } else {
    console.log((result.text || "").slice(0, 1200));
  }
}

async function main() {
  const notam = await requestJson(`${notamUrl}/sync?icao=${encodeURIComponent(icao)}`, notamSecret);
  printResult("NOTAM sync", notam);

  const weather = await requestJson(`${weatherUrl}/sync/weather?icao=${encodeURIComponent(icao)}`, weatherSecret);
  printResult("Weather sync", weather);

  const aip = await requestJson(`${aipUrl}/sync?icao=${encodeURIComponent(icao)}&extract=0`, notamSecret);
  printResult("AIP sync (download-only)", aip);

  const bad = [notam, weather, aip].some((r) => !r.ok);
  if (bad) process.exit(1);
}

main().catch((err) => {
  console.error("Service check failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

