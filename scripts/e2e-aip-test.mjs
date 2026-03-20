#!/usr/bin/env node

import { chromium } from "playwright";
import { existsSync } from "fs";
import { join } from "path";

const PORTAL_URL = (process.env.PORTAL_URL || "http://localhost:3000").replace(/\/$/, "");
const HEADLESS = process.env.HEADLESS !== "false";
const STORAGE_STATE_PATH = process.env.PLAYWRIGHT_STORAGE_STATE_PATH || join("test-results", "auth-state.json");
const MAX_AIRPORTS = Number(process.env.MAX_AIRPORTS || 0);
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || process.env.WEBHOOK_URL || "";

const EAD_ICAO_PREFIXES = new Set([
  "LA", "LO", "EB", "LB", "LK", "EK", "EE", "EF", "LF", "ED", "LG", "LH", "EI", "LI",
  "EV", "EY", "EL", "LM", "EH", "EP", "LP", "LR", "LZ", "LJ", "LE", "ES", "GC",
]);

function isEadIcao(icao) {
  return icao?.length >= 2 && EAD_ICAO_PREFIXES.has(icao.slice(0, 2).toUpperCase());
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function listEadAirports() {
  const regionsData = await fetchJson(`${PORTAL_URL}/api/regions`);
  const regions = Array.isArray(regionsData?.regions) ? regionsData.regions : [];
  const out = [];
  for (const region of regions) {
    for (const country of region?.countries || []) {
      const data = await fetchJson(`${PORTAL_URL}/api/airports?country=${encodeURIComponent(country)}`);
      const airports = (data?.results || []).filter((a) => isEadIcao(String(a?.icao || "").toUpperCase()));
      if (airports.length > 0) out.push({ country, airports });
    }
  }
  return out;
}

async function runOneAirport(page, country, airport) {
  const icao = String(airport?.icao || "").toUpperCase();
  const result = { icao, country, pass: false, error: "" };
  try {
    await page.goto(PORTAL_URL, { waitUntil: "load" });
    await page.locator("#search").first().waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#search").fill(icao);
    await page.getByRole("button", { name: /^find$/i }).click();

    const aipTitle = page.getByText(`AIP (EAD) — ${icao}`, { exact: false });
    await aipTitle.waitFor({ state: "visible", timeout: 15000 });

    // Start AIP scrape and quickly assert if loading UI appears.
    const syncButton = page.locator('button[title*="Sync: fetch from EC2"]').first();
    await syncButton.click({ timeout: 5000 });
    const loadingSeen = await Promise.race([
      page.getByText("Syncing AIP from server", { exact: false }).first().waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false),
      page.getByText("Loading AIP", { exact: false }).first().waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false),
    ]);
    result.pass = Boolean(loadingSeen);
    if (!loadingSeen) result.error = "AIP loading UI did not appear within 10s";
  } catch (e) {
    result.pass = false;
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

async function sendWebhook(payload) {
  if (!WEBHOOK_URL) return;
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook failed ${res.status}: ${text || res.statusText}`);
  }
}

async function main() {
  const countries = await listEadAirports();
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext(
    existsSync(STORAGE_STATE_PATH) ? { storageState: STORAGE_STATE_PATH, viewport: { width: 1600, height: 1200 } } : { viewport: { width: 1600, height: 1200 } }
  );
  const page = await context.newPage();

  const results = [];
  let tested = 0;
  for (const entry of countries) {
    for (const airport of entry.airports) {
      if (MAX_AIRPORTS > 0 && tested >= MAX_AIRPORTS) break;
      tested += 1;
      console.log(`[${tested}] ${entry.country} :: ${airport.icao}`);
      const one = await runOneAirport(page, entry.country, airport);
      results.push(one);
    }
    if (MAX_AIRPORTS > 0 && tested >= MAX_AIRPORTS) break;
  }

  await context.close();
  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const payload = {
    event: "aip_ui_debug_test",
    timestamp: new Date().toISOString(),
    source: "scripts/e2e-aip-test.mjs",
    summary: { total: results.length, passed, failed },
    results,
  };

  try {
    await sendWebhook(payload);
    console.log("Webhook sent.");
  } catch (e) {
    console.error("Webhook send failed:", e instanceof Error ? e.message : String(e));
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

