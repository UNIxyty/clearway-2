/**
 * CrewBriefing OPMET weather scraper for sync server + local storage.
 * Login -> Extra WX -> OPMET tab -> search ICAO -> extract weather text.
 *
 * Env: CREWBRIEFING_USER, CREWBRIEFING_PASSWORD
 *      Or dedicated weather account: CREWBRIEFING_WEATHER_USER, CREWBRIEFING_WEATHER_PASSWORD
 *      (second CrewBriefing user on same IP for parallel NOTAM vs weather sync servers)
 *      STORAGE_ROOT/CACHE_ROOT for local storage layer.
 *      WEATHER_PROGRESS_FILE (optional progress file for SSE streaming)
 *
 * Usage: node scripts/crewbriefing-weather.mjs [--json] <ICAO>
 */

import { appendFileSync, existsSync } from "fs";
import { saveFile } from "../lib/storage.mjs";

const LOGIN_URL = "https://www.crewbriefing.com/LoginSSL.aspx";
const EXTRA_WX_URL = "https://www.crewbriefing.com/Cb_Extra/2.5.19/NOTAM/Notams.aspx";

let jsonMode = false;

function resolveChromiumExecutablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  const candidates = ["/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];
  return candidates.find((p) => existsSync(p)) || null;
}

async function findSearchInput(page, timeoutMs = 12000) {
  const selectors = [
    'input[name*="ICAO" i]',
    'input[id*="ICAO" i]',
    'input[name*="airport" i]',
    'input[id*="airport" i]',
    'input[type="text"]',
  ];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const locator = page.locator(sel).first();
      if (await locator.count()) return locator;
    }
    await page.waitForTimeout(300);
  }
  return null;
}

function progress(msg) {
  const line = "PROGRESS:" + msg + "\n";
  if (process.env.WEATHER_PROGRESS_FILE) {
    try {
      appendFileSync(process.env.WEATHER_PROGRESS_FILE, line);
    } catch (_) {}
  }
  if (jsonMode) console.error(line.trim());
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  jsonMode = process.argv.includes("--json");
  const icao = (args[0] || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    console.error("Usage: node scripts/crewbriefing-weather.mjs [--json] <ICAO>");
    process.exit(1);
  }

  const user =
    process.env.CREWBRIEFING_WEATHER_USER || process.env.CREWBRIEFING_USER || "";
  const password =
    process.env.CREWBRIEFING_WEATHER_PASSWORD || process.env.CREWBRIEFING_PASSWORD || "";
  if (!user || !password) {
    console.error(
      "Set CREWBRIEFING_WEATHER_USER/PASSWORD (weather-only server) or CREWBRIEFING_USER/PASSWORD."
    );
    process.exit(1);
  }

  progress("Initializing browser");
  const { chromium } = await import("playwright");
  const useHeaded = process.env.USE_HEADED === "1" || process.env.DISPLAY;
  const executablePath = resolveChromiumExecutablePath();
  const launchOptions = {
    headless: !useHeaded,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
  if (executablePath) launchOptions.executablePath = executablePath;
  else if (process.env.CHROME_CHANNEL) launchOptions.channel = process.env.CHROME_CHANNEL;
  const browser = await chromium.launch(launchOptions).catch(() => {
    progress("Primary browser launch failed, retrying with Playwright defaults");
    return chromium.launch({ headless: !useHeaded, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let weatherText = "";
  try {
    progress("Logging in");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.fill('input[type="text"]', user);
    await page.fill('input[type="password"]', password);
    await page.click('input[type="submit"], button[type="submit"], input[value="Login"]');
    await page.waitForURL(/Main\.aspx/, { timeout: 15000 });

    progress("Opening OPMET tab");
    await page.goto(EXTRA_WX_URL, { waitUntil: "domcontentloaded", timeout: 20000 });

    let workPage = page;
    let opmetTab = workPage.locator("table.TabMenuItem", { hasText: "OPMET" }).first();
    if (!(await opmetTab.count())) {
      progress("Direct weather page missing OPMET tab, retrying via Extra WX popup");
      const [extraPage] = await Promise.all([
        context.waitForEvent("page", { timeout: 12000 }),
        page.click('a:has-text("Extra WX")'),
      ]);
      await extraPage.waitForLoadState("domcontentloaded");
      await extraPage.goto(EXTRA_WX_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
      workPage = extraPage;
      opmetTab = workPage.locator("table.TabMenuItem", { hasText: "OPMET" }).first();
    }
    await opmetTab.click({ timeout: 10000 });
    await workPage.waitForTimeout(1200);

    progress("Searching weather for " + icao);
    const searchInput = await findSearchInput(workPage, 12000);
    if (!searchInput) {
      throw new Error("Could not locate CrewBriefing ICAO search field on OPMET page.");
    }
    await searchInput.fill(icao);
    await workPage.click('input[type="submit"], input[value="View"], input[value="Search"], button:has-text("View"), button:has-text("Search")');
    await workPage.waitForTimeout(3500);

    weatherText = (
      await workPage.evaluate(() => {
        const target = document.querySelector("#ResultTable td");
        return (target?.textContent || "").trim();
      })
    ) || "";
  } finally {
    await browser.close();
  }

  const payload = {
    icao,
    weather: weatherText,
    updatedAt: new Date().toISOString(),
  };

  progress("Saving weather to storage");
  try {
    const key = `weather/${icao}.json`;
    await saveFile(key, JSON.stringify(payload));
  } catch (e) {
    if (!jsonMode) console.error("Weather storage write failed:", e instanceof Error ? e.message : String(e));
  }
  if (process.env.AWS_S3_BUCKET) {
    progress("S3 env found but ignored in local mode");
    try {
      // no-op to preserve backward-compatible logs when legacy env remains set
    } catch (e) {
      if (!jsonMode) console.error("Ignored legacy AWS env warning:", e instanceof Error ? e.message : String(e));
    }
  }

  progress("Done");
  if (jsonMode) {
    console.log(JSON.stringify(payload));
  } else {
    console.log(weatherText);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

