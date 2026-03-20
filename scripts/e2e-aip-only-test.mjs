#!/usr/bin/env node
/**
 * AIP-only E2E test (EAD airports only).
 *
 * Preserves the existing pipeline structure:
 * - same auth flow (magic link/storage state)
 * - same country/airport traversal
 * - same raw JSON shape at top-level
 * - same screenshot capture + webhook flow
 *
 * Focus:
 * - pageLoad: AIP card appears after search
 * - aip: loading UI appears (auto-sync or manual click path)
 * - screenshot: captured
 *
 * Excluded from checks:
 * - map, notams, gen, weather
+ */

import { chromium } from "playwright";
import readline from "readline";
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

const PORTAL_URL = (process.env.PORTAL_URL || "http://localhost:3000").replace(/\/$/, "");
const HEADLESS = process.env.HEADLESS !== "false";
const MAX_AIRPORTS = Number(process.env.MAX_AIRPORTS || 0);
const COUNTRY_FILTER = process.env.COUNTRY_FILTER || "";
const OUTPUT_DIR = process.env.TEST_RESULTS_DIR || "test-results";
const STORAGE_STATE_PATH = process.env.PLAYWRIGHT_STORAGE_STATE_PATH || join(OUTPUT_DIR, "auth-state.json");
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || "";
const MAGIC_LINK_URL = (process.env.MAGIC_LINK_URL || "").trim();
const DISABLE_AUTH_FOR_TESTING = String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
const DISABLE_AI_FOR_TESTING = String(process.env.DISABLE_AI_FOR_TESTING || "").toLowerCase() === "true";

// How long to wait for loading text after manual sync click.
const AIP_LOADING_TIMEOUT_MS = Number(process.env.AIP_LOADING_TIMEOUT_MS || 10000);
// First EAD visit auto-starts sync; Sync button may stay disabled until auto run starts/finishes.
const AIP_SYNC_READY_TIMEOUT_MS = Number(process.env.AIP_SYNC_READY_TIMEOUT_MS || 120000);

/**
 * EAD portal auto-fetches AIP with sync=1 when there is no cache, so Sync can be disabled.
 * Wait until loading UI appears (auto path) or Sync becomes enabled (manual click path).
 * @returns {"auto"|"click"}
 */
async function waitForAipSyncClickableOrLoading(page, timeoutMs = AIP_SYNC_READY_TIMEOUT_MS) {
  const syncButton = page.locator('button[title*="Sync: fetch from EC2"]').first();
  const loading = page.getByText(/Syncing AIP from server|Loading AIP/i).first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await loading.isVisible().catch(() => false)) return "auto";
    if ((await syncButton.isVisible().catch(() => false)) && (await syncButton.isEnabled().catch(() => false))) {
      return "click";
    }
    await page.waitForTimeout(300);
  }
  throw new Error(
    `AIP: sync button stayed disabled and no loading UI within ${timeoutMs}ms (auto-sync stuck or UI changed).`,
  );
}

const MAGIC_LINK_FILE = join(OUTPUT_DIR, "magic-link.txt");

const EAD_ICAO_PREFIXES = new Set([
  "LA", "LO", "EB", "LB", "LK", "EK", "EE", "EF", "LF", "ED", "LG", "LH", "EI", "LI",
  "EV", "EY", "EL", "LM", "EH", "EP", "LP", "LR", "LZ", "LJ", "LE", "ES", "GC",
]);

function isEadIcao(icao) {
  return icao?.length >= 2 && EAD_ICAO_PREFIXES.has(icao.slice(0, 2).toUpperCase());
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function sanitize(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getEadCountryAirports() {
  const regionsData = await fetchJson(`${PORTAL_URL}/api/regions`);
  const regions = Array.isArray(regionsData?.regions) ? regionsData.regions : [];
  const countries = [];
  for (const region of regions) {
    for (const country of Array.isArray(region?.countries) ? region.countries : []) {
      if (!countries.includes(country)) countries.push(country);
    }
  }
  const targetCountries = COUNTRY_FILTER
    ? countries.filter((c) => c.toLowerCase().includes(COUNTRY_FILTER.toLowerCase()))
    : countries;

  const result = [];
  for (const country of targetCountries) {
    const data = await fetchJson(`${PORTAL_URL}/api/airports?country=${encodeURIComponent(country)}`);
    const airports = (Array.isArray(data?.results) ? data.results : []).filter((a) =>
      isEadIcao(String(a?.icao || "").toUpperCase()),
    );
    if (airports.length > 0) result.push({ country, airports });
  }
  return result;
}

function promptForMagicLink() {
  return new Promise((resolve) => {
    ensureDir(OUTPUT_DIR);
    const magicLinkPath = join(process.cwd(), MAGIC_LINK_FILE);
    const msg = [
      "",
      "================================================================================",
      "  MAGIC LINK SENT. Paste the link here and press Enter.",
      `  Or, in ANOTHER terminal: echo 'YOUR_LINK' > ${magicLinkPath}`,
      "================================================================================",
      "> ",
    ].join("\n");
    process.stdout.write(msg);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", (answer) => {
      clearInterval(interval);
      rl.close();
      resolve((answer || "").trim());
    });

    const interval = setInterval(() => {
      try {
        if (existsSync(MAGIC_LINK_FILE)) {
          const link = String(readFileSync(MAGIC_LINK_FILE, "utf8")).trim();
          if (link.startsWith("http")) {
            unlinkSync(MAGIC_LINK_FILE);
            clearInterval(interval);
            rl.close();
            resolve(link);
          }
        }
      } catch (_) {}
    }, 500);
    rl.on("close", () => clearInterval(interval));
  });
}

async function ensureAuthenticated(page, context) {
  await page.goto(PORTAL_URL, { waitUntil: "load" });
  if (!page.url().includes("/login")) return;

  if (MAGIC_LINK_URL && MAGIC_LINK_URL.startsWith("http")) {
    console.log("Using MAGIC_LINK_URL from environment.");
    await page.goto(MAGIC_LINK_URL, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(2000);
    if (page.url().includes("/login")) {
      throw new Error("Authentication failed. The magic link may have expired or already been used.");
    }
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log(`Saved auth storage state to ${STORAGE_STATE_PATH}`);
    return;
  }

  if (TEST_USER_EMAIL && !MAGIC_LINK_URL) {
    const emailInput = page.locator("#email");
    if (await emailInput.count()) {
      await emailInput.waitFor({ state: "visible", timeout: 10000 });
      await emailInput.click();
      await emailInput.clear();
      await emailInput.pressSequentially(TEST_USER_EMAIL, { delay: 30 });
      const signInButton = page.getByRole("button", { name: /send sign-in link/i });
      await signInButton.waitFor({ state: "visible", timeout: 10000 });
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (await signInButton.isEnabled()) break;
        await page.waitForTimeout(200);
      }
      if (!(await signInButton.isEnabled())) {
        throw new Error("Send sign-in link button did not become enabled in time.");
      }
      await signInButton.click();
    }
  }

  if (HEADLESS) {
    throw new Error(
      "Not authenticated and running headless. Provide PLAYWRIGHT_STORAGE_STATE_PATH from a logged-in session, or run with HEADLESS=false for manual login.",
    );
  }

  const magicLink = MAGIC_LINK_URL || (await promptForMagicLink());
  if (!magicLink || !magicLink.startsWith("http")) {
    throw new Error("Invalid magic link URL. Must start with http:// or https://");
  }
  console.log("Navigating to magic link...");
  await page.goto(magicLink, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2000);
  if (page.url().includes("/login")) {
    throw new Error("Authentication failed. The magic link may have expired or already been used.");
  }
  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved auth storage state to ${STORAGE_STATE_PATH}`);
}

async function runOneAirport(page, airport, country, screenshotRoot) {
  const icao = String(airport?.icao || "").toUpperCase();
  const result = {
    icao,
    name: airport?.name || "",
    country,
    isEad: true,
    startedAt: nowIso(),
    checks: {
      pageLoad: { pass: false },
      aip: { pass: false, skippedAi: DISABLE_AI_FOR_TESTING },
      screenshot: { pass: false, path: "" },
    },
    errors: [],
  };

  try {
    await page.goto(PORTAL_URL, { waitUntil: "load" });
    await page.locator("#search").first().waitFor({ state: "visible", timeout: 15000 });
    await page.locator("#search").fill(icao);
    await page.getByRole("button", { name: /^find$/i }).click();

    const eadTitle = page.getByText(`AIP (EAD) — ${icao}`, { exact: false });
    const selectedHint = page.getByText(`AIP data for ${icao} below.`, { exact: false });
    await Promise.race([
      eadTitle.waitFor({ state: "visible", timeout: 15000 }),
      selectedHint.waitFor({ state: "visible", timeout: 15000 }),
    ]);
    result.checks.pageLoad.pass = true;
  } catch (error) {
    result.errors.push(`Page load failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (result.checks.pageLoad.pass) {
    try {
      const syncButton = page.locator('button[title*="Sync: fetch from EC2"]').first();
      const syncButtonVisible = await syncButton.isVisible({ timeout: 5000 }).catch(() => false);
      if (!syncButtonVisible) {
        result.errors.push("AIP check failed: sync button not found.");
      } else {
        const mode = await waitForAipSyncClickableOrLoading(page, AIP_SYNC_READY_TIMEOUT_MS);
        if (mode === "click") {
          await syncButton.click();
        }
        const loadingSeen =
          mode === "auto"
            ? true
            : await Promise.race([
                page
                  .getByText("Syncing AIP from server", { exact: false })
                  .first()
                  .waitFor({ state: "visible", timeout: AIP_LOADING_TIMEOUT_MS })
                  .then(() => true)
                  .catch(() => false),
                page
                  .getByText("Loading AIP", { exact: false })
                  .first()
                  .waitFor({ state: "visible", timeout: AIP_LOADING_TIMEOUT_MS })
                  .then(() => true)
                  .catch(() => false),
              ]);
        result.checks.aip.pass = Boolean(loadingSeen);
        if (!loadingSeen) {
          result.errors.push(
            `AIP check failed: loading UI did not appear within ${AIP_LOADING_TIMEOUT_MS / 1000}s after sync became clickable.`,
          );
        }
      }
    } catch (error) {
      result.errors.push(`AIP check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const countryDir = join(screenshotRoot, sanitize(country));
    ensureDir(countryDir);
    const shotPath = join(countryDir, `${sanitize(icao)}.png`);
    await page.screenshot({ path: shotPath, fullPage: true, timeout: 10000 });
    result.checks.screenshot.pass = true;
    result.checks.screenshot.path = shotPath;
  } catch (error) {
    result.errors.push(`Screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  result.finishedAt = nowIso();
  return result;
}

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(join(OUTPUT_DIR, "screenshots"));
  ensureDir(join(OUTPUT_DIR, "raw"));

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawOutputPath = join(OUTPUT_DIR, "raw", `e2e-results-${timestamp}.json`);

  console.log("Fetching EAD airport list from portal...");
  const countries = await getEadCountryAirports();
  console.log(`Found ${countries.reduce((n, c) => n + c.airports.length, 0)} EAD airports across ${countries.length} countries.`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext(
    existsSync(STORAGE_STATE_PATH)
      ? { storageState: STORAGE_STATE_PATH, viewport: { width: 1600, height: 1200 } }
      : { viewport: { width: 1600, height: 1200 } },
  );
  const page = await context.newPage();

  if (!DISABLE_AUTH_FOR_TESTING) {
    await ensureAuthenticated(page, context);
  } else {
    await page.goto(PORTAL_URL, { waitUntil: "load" });
  }

  const output = {
    startedAt: nowIso(),
    portalUrl: PORTAL_URL,
    testType: "aip-only",
    disableAuthForTesting: DISABLE_AUTH_FOR_TESTING,
    disableAiForTesting: DISABLE_AI_FOR_TESTING,
    countries: [],
    summary: {
      totalCountries: 0,
      totalAirports: 0,
      passedAirports: 0,
      failedAirports: 0,
    },
  };

  let seen = 0;
  for (const { country, airports } of countries) {
    const countryResult = { country, airports: [] };
    for (const airport of airports) {
      if (MAX_AIRPORTS > 0 && seen >= MAX_AIRPORTS) break;
      seen += 1;
      const icao = String(airport?.icao || "").toUpperCase();
      console.log(`[${seen}] Testing ${country} :: ${icao}`);
      const airportResult = await runOneAirport(page, airport, country, join(OUTPUT_DIR, "screenshots"));
      const pass = airportResult.checks.pageLoad.pass && airportResult.checks.aip.pass;
      console.log(`       ${pass ? "PASS" : "FAIL"}${airportResult.errors.length ? " — " + airportResult.errors[0] : ""}`);
      countryResult.airports.push(airportResult);
      if (countryResult.airports.length > 0 && !output.countries.some((c) => c.country === country)) {
        output.countries.push(countryResult);
      }
      writeFileSync(rawOutputPath, JSON.stringify(output, null, 2));
    }
    if (MAX_AIRPORTS > 0 && seen >= MAX_AIRPORTS) break;
  }

  output.summary.totalCountries = output.countries.length;
  output.summary.totalAirports = output.countries.reduce((n, c) => n + c.airports.length, 0);
  for (const country of output.countries) {
    for (const airport of country.airports) {
      const pass = airport.checks.pageLoad.pass && airport.checks.aip.pass;
      if (pass) output.summary.passedAirports += 1;
      else output.summary.failedAirports += 1;
    }
  }
  output.finishedAt = nowIso();
  writeFileSync(rawOutputPath, JSON.stringify(output, null, 2));

  await context.close();
  await browser.close();

  console.log(`\nE2E AIP-only run complete. Raw results: ${rawOutputPath}`);
  console.log(`Summary: ${output.summary.totalAirports} airports | ${output.summary.passedAirports} passed | ${output.summary.failedAirports} failed`);

  console.log("\nGenerating report...");
  try {
    execFileSync(process.execPath, ["scripts/generate-aip-only-report.mjs"], {
      stdio: "inherit",
      env: { ...process.env, E2E_RESULTS_JSON: rawOutputPath },
    });
  } catch (e) {
    console.error("Report generation failed:", e instanceof Error ? e.message : String(e));
  }

  if (process.env.N8N_WEBHOOK_URL || process.env.WEBHOOK_URL) {
    console.log("\nSending webhook...");
    try {
      execFileSync(process.execPath, ["scripts/send-test-webhook.mjs"], {
        stdio: "inherit",
        env: { ...process.env, E2E_RESULTS_JSON: rawOutputPath },
      });
    } catch (e) {
      console.error("Webhook send failed:", e instanceof Error ? e.message : String(e));
    }
  } else {
    console.log("\nNo N8N_WEBHOOK_URL set — skipping webhook.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
