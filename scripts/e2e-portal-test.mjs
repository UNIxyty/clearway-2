#!/usr/bin/env node

import { chromium } from "playwright";
import readline from "readline";
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { dirname, join } from "path";

const PORTAL_URL = (process.env.PORTAL_URL || "http://localhost:3000").replace(/\/$/, "");
const HEADLESS = process.env.HEADLESS !== "false";
const AUTH_TIMEOUT_MS = Number(process.env.AUTH_TIMEOUT_MS || 300000);
const MAX_AIRPORTS = Number(process.env.MAX_AIRPORTS || 0);
const COUNTRY_FILTER = process.env.COUNTRY_FILTER || "";
const OUTPUT_DIR = process.env.TEST_RESULTS_DIR || "test-results";
const STORAGE_STATE_PATH = process.env.PLAYWRIGHT_STORAGE_STATE_PATH || join(OUTPUT_DIR, "auth-state.json");
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || "";
const MAGIC_LINK_URL = (process.env.MAGIC_LINK_URL || "").trim();
const DISABLE_AI_FOR_TESTING = String(process.env.DISABLE_AI_FOR_TESTING || "").toLowerCase() === "true";

const MAGIC_LINK_FILE = join(OUTPUT_DIR, "magic-link.txt");

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

async function getCountryAirports() {
  const regionsData = await fetchJson(`${PORTAL_URL}/api/regions`);
  const regions = Array.isArray(regionsData?.regions) ? regionsData.regions : [];
  const countries = [];
  for (const region of regions) {
    const list = Array.isArray(region?.countries) ? region.countries : [];
    for (const country of list) {
      if (!countries.includes(country)) countries.push(country);
    }
  }
  const targetCountries = COUNTRY_FILTER
    ? countries.filter((c) => c.toLowerCase().includes(COUNTRY_FILTER.toLowerCase()))
    : countries;

  const result = [];
  for (const country of targetCountries) {
    const data = await fetchJson(`${PORTAL_URL}/api/airports?country=${encodeURIComponent(country)}`);
    const airports = Array.isArray(data?.results) ? data.results : [];
    result.push({ country, airports });
  }
  return result;
}

async function ensureAuthenticated(page, context) {
  await page.goto(PORTAL_URL, { waitUntil: "load" });
  if (!page.url().includes("/login")) return;

  // If MAGIC_LINK_URL is set, skip email/send and go straight to the link
  if (MAGIC_LINK_URL && MAGIC_LINK_URL.startsWith("http")) {
    console.log("Using MAGIC_LINK_URL from environment.");
    const magicLink = MAGIC_LINK_URL;
    await page.goto(magicLink, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(2000);
    if (page.url().includes("/login")) {
      throw new Error("Authentication failed. The magic link may have expired or already been used.");
    }
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log(`Saved auth storage state to ${STORAGE_STATE_PATH}`);
    return;
  }

  // Only fill and send magic link when we don't already have the link
  if (TEST_USER_EMAIL && !MAGIC_LINK_URL) {
    const emailInput = page.locator("#email");
    if (await emailInput.count()) {
      await emailInput.waitFor({ state: "visible", timeout: 10000 });
      await emailInput.click();
      await emailInput.clear();
      // Use pressSequentially to trigger React's onChange (controlled input)
      await emailInput.pressSequentially(TEST_USER_EMAIL, { delay: 30 });

      const signInButton = page.getByRole("button", { name: /send sign-in link/i });
      await signInButton.waitFor({ state: "visible", timeout: 10000 });
      // Wait for button to become enabled (React state: disabled when !email.trim())
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (await signInButton.isEnabled()) break;
        await page.waitForTimeout(200);
      }
      if (!(await signInButton.isEnabled())) {
        throw new Error("Send sign-in link button did not become enabled in time. Check email format and page load.");
      }
      await signInButton.click();
    }
  }

  if (HEADLESS) {
    throw new Error(
      "Not authenticated and running headless. Provide PLAYWRIGHT_STORAGE_STATE_PATH from a logged-in session, or run with HEADLESS=false for manual login."
    );
  }

  // Use MAGIC_LINK_URL if provided (avoids interactive prompt; useful when terminal stdin doesn't work)
  const magicLink = MAGIC_LINK_URL || (await promptForMagicLink());
  if (!magicLink || !magicLink.startsWith("http")) {
    throw new Error("Invalid magic link URL. Must start with http:// or https://");
  }
  console.log("Navigating to magic link...");
  await page.goto(magicLink, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2000); // Allow auth callback redirect to complete
  if (page.url().includes("/login")) {
    throw new Error("Authentication failed. The magic link may have expired or already been used.");
  }
  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved auth storage state to ${STORAGE_STATE_PATH}`);
}

async function waitForQuiet(page, busyTexts, timeout = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    let busy = false;
    for (const text of busyTexts) {
      if (await page.getByText(text, { exact: false }).first().isVisible().catch(() => false)) {
        busy = true;
        break;
      }
    }
    if (!busy) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function runOneAirport(page, airport, country, screenshotRoot) {
  const icao = String(airport?.icao || "").toUpperCase();
  const result = {
    icao,
    name: airport?.name || "",
    country,
    isEad: isEadIcao(icao),
    startedAt: nowIso(),
    checks: {
      pageLoad: { pass: false },
      map: { pass: false, hasCoords: false },
      notams: { pass: false, skipped: false },
      aip: { pass: false, skippedAi: false },
      gen: { pass: false, skipped: false, skippedAi: false },
      screenshot: { pass: false, path: "" },
    },
    errors: [],
  };

  try {
    await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#search").fill(icao);
    await page.getByRole("button", { name: /^find$/i }).click();

    const eadTitle = page.getByText(`AIP (EAD) — ${icao}`, { exact: false });
    const stdTitle = page.getByText(`AIP — ${icao}`, { exact: false });
    const selectedHint = page.getByText(`AIP data for ${icao} below.`, { exact: false });
    await Promise.race([
      eadTitle.waitFor({ state: "visible", timeout: 15000 }),
      stdTitle.waitFor({ state: "visible", timeout: 15000 }),
      selectedHint.waitFor({ state: "visible", timeout: 15000 }),
    ]);
    result.checks.pageLoad.pass = true;
  } catch (error) {
    result.errors.push(`Page load failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const mapVisible = await page.locator(".leaflet-container").first().isVisible({ timeout: 4000 }).catch(() => false);
    const noCoord = await page.getByText("Coordinates will appear after AIP sync or when available from data.", { exact: false }).first().isVisible().catch(() => false);
    result.checks.map.hasCoords = mapVisible;
    result.checks.map.pass = mapVisible && !noCoord;
    if (!result.checks.map.pass && noCoord) {
      result.errors.push("Map check failed: no coordinates available.");
    }
  } catch (error) {
    result.errors.push(`Map check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const notamSyncButton = page.locator('button[title*="Sync now: scrape FAA"]').first();
    if (await notamSyncButton.count()) {
      await notamSyncButton.click();
      await waitForQuiet(page, ["Syncing live from FAA", "Loading NOTAMs"], 45000);
      const unavailable = await page.getByText("NOTAMs unavailable", { exact: false }).first().isVisible().catch(() => false);
      if (unavailable) {
        result.checks.notams.pass = false;
        result.errors.push("NOTAM check failed: NOTAMs unavailable.");
      } else {
        result.checks.notams.pass = true;
      }
    } else {
      result.checks.notams.pass = false;
      result.errors.push("NOTAM check failed: sync button not found.");
    }
  } catch (error) {
    result.errors.push(`NOTAM check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (result.isEad) {
    try {
      const aipSyncButton = page.locator('button[title*="Sync: fetch from EC2"]').first();
      await aipSyncButton.click();
      await waitForQuiet(page, ["Syncing AIP from server", "Loading AIP"], 70000);
      const aipError = await page.locator("text=/No AI model selected|Sync failed|AIP sync request failed/").first().isVisible().catch(() => false);
      result.checks.aip.pass = !aipError;
      result.checks.aip.skippedAi = DISABLE_AI_FOR_TESTING;
      if (aipError) result.errors.push("AIP check failed: sync returned error state.");
    } catch (error) {
      result.errors.push(`AIP check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const genSyncButton = page.locator('button[title*="Sync GEN 1.2 from server"]').first();
      await genSyncButton.click();
      await waitForQuiet(page, ["Syncing GEN from server", "Loading GEN"], 70000);
      const genError = await page.locator("text=/GEN sync failed|No AI model selected/").first().isVisible().catch(() => false);
      result.checks.gen.pass = !genError;
      result.checks.gen.skipped = false;
      result.checks.gen.skippedAi = DISABLE_AI_FOR_TESTING;
      if (genError) result.errors.push("GEN check failed: sync returned error state.");
    } catch (error) {
      result.errors.push(`GEN check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    result.checks.aip.pass = result.checks.pageLoad.pass;
    result.checks.aip.skippedAi = true;
    result.checks.gen.pass = true;
    result.checks.gen.skipped = true;
    result.checks.gen.skippedAi = true;
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

  const countries = await getCountryAirports();
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext(
    existsSync(STORAGE_STATE_PATH)
      ? { storageState: STORAGE_STATE_PATH, viewport: { width: 1600, height: 1200 } }
      : { viewport: { width: 1600, height: 1200 } }
  );
  const page = await context.newPage();

  await ensureAuthenticated(page, context);

  const output = {
    startedAt: nowIso(),
    portalUrl: PORTAL_URL,
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
      countryResult.airports.push(airportResult);
      writeFileSync(rawOutputPath, JSON.stringify(output, null, 2));
    }
    if (countryResult.airports.length > 0) {
      output.countries.push(countryResult);
    }
    if (MAX_AIRPORTS > 0 && seen >= MAX_AIRPORTS) break;
  }

  output.summary.totalCountries = output.countries.length;
  output.summary.totalAirports = output.countries.reduce((n, c) => n + c.airports.length, 0);
  for (const country of output.countries) {
    for (const airport of country.airports) {
      const allPass = airport.checks.pageLoad.pass
        && airport.checks.map.pass
        && airport.checks.notams.pass
        && airport.checks.aip.pass
        && airport.checks.gen.pass
        && airport.checks.screenshot.pass;
      if (allPass) output.summary.passedAirports += 1;
      else output.summary.failedAirports += 1;
    }
  }
  output.finishedAt = nowIso();
  writeFileSync(rawOutputPath, JSON.stringify(output, null, 2));

  await context.close();
  await browser.close();

  console.log(`E2E run complete. Raw results: ${rawOutputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
