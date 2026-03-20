/**
 * CrewBriefing OPMET weather scraper for sync server + S3.
 * Login -> Extra WX -> OPMET tab -> search ICAO -> extract weather text.
 *
 * Env: CREWBRIEFING_USER, CREWBRIEFING_PASSWORD
 *      AWS_S3_BUCKET, AWS_REGION, WEATHER_S3_PREFIX (optional, default "weather")
 *      WEATHER_PROGRESS_FILE (optional progress file for SSE streaming)
 *
 * Usage: node scripts/crewbriefing-weather.mjs [--json] <ICAO>
 */

import { appendFileSync } from "fs";

const LOGIN_URL = "https://www.crewbriefing.com/LoginSSL.aspx";
const EXTRA_WX_URL = "https://www.crewbriefing.com/Cb_Extra/2.5.19/NOTAM/Notams.aspx";

let jsonMode = false;

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

  const user = process.env.CREWBRIEFING_USER || "";
  const password = process.env.CREWBRIEFING_PASSWORD || "";
  if (!user || !password) {
    console.error("CREWBRIEFING_USER and CREWBRIEFING_PASSWORD must be set.");
    process.exit(1);
  }

  progress("Initializing browser");
  const { chromium } = await import("playwright");
  const useHeaded = process.env.USE_HEADED === "1" || process.env.DISPLAY;
  const browser = await chromium
    .launch({
      headless: !useHeaded,
      channel: process.env.CHROME_CHANNEL || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    .catch(() => chromium.launch({ headless: !useHeaded, args: ["--no-sandbox", "--disable-setuid-sandbox"] }));

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

    progress("Opening Extra WX");
    const [extraPage] = await Promise.all([
      context.waitForEvent("page"),
      page.click('a:has-text("Extra WX")'),
    ]);
    await extraPage.waitForLoadState("networkidle");

    progress("Opening OPMET tab");
    await extraPage.goto(EXTRA_WX_URL, { waitUntil: "networkidle", timeout: 15000 });
    const opmetTab = extraPage.locator("table.TabMenuItem", { hasText: "OPMET" }).first();
    await opmetTab.click({ timeout: 10000 });
    await extraPage.waitForTimeout(1200);

    progress("Searching weather for " + icao);
    const searchInput = extraPage.locator('input[type="text"]').first();
    await searchInput.fill(icao);
    await extraPage.click('input[type="submit"], input[value="View"], input[value="Search"]');
    await extraPage.waitForTimeout(3500);

    weatherText = (
      await extraPage.evaluate(() => {
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

  if (process.env.AWS_S3_BUCKET) {
    progress("Uploading weather to S3");
    try {
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const bucket = process.env.AWS_S3_BUCKET;
      const prefix = process.env.WEATHER_S3_PREFIX || "weather";
      const key = `${prefix}/${icao}.json`;
      const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(payload),
          ContentType: "application/json",
        }),
      );
    } catch (e) {
      if (!jsonMode) console.error("Weather S3 upload failed:", e instanceof Error ? e.message : String(e));
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

