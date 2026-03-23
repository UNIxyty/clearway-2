#!/usr/bin/env node
/**
 * EAD Basic - robust AD document-name extractor.
 *
 * Flow:
 * 1) Login to EAD
 * 2) Open AIP Library overview
 * 3) Iterate countries with retries
 * 4) Scrape all paginator pages for AD document names
 * 5) Guard against suspiciously low extraction and retry
 * 6) Write output JSON + raw run JSON
 * 7) Generate markdown report + send webhook payload
 */

import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const BASE = "https://www.ead.eurocontrol.int";
const LOGIN_URL = BASE + "/cms-eadbasic/opencms/en/login/ead-basic/";
const AIP_OVERVIEW_URL = BASE + "/fwf-eadbasic/restricted/user/aip/aip_overview.faces";

const PREFIX_TO_COUNTRY = {
  LA: "Albania (LA)",
  UD: "Armenia (UD)",
  LO: "Austria (LO)",
  UB: "Azerbaijan (UB)",
  EB: "Belgium (EB)",
  LQ: "Bosnia/Herzeg. (LQ)",
  LB: "Bulgaria (LB)",
  LD: "Croatia (LD)",
  LC: "Cyprus (LC)",
  LK: "Czech Republic (LK)",
  EK: "Denmark (EK)",
  EE: "Estonia (EE)",
  XX: "Faroe Islands (XX)",
  EF: "Finland (EF)",
  LF: "France (LF)",
  UG: "Georgia (UG)",
  ED: "Germany (ED)",
  LG: "Greece (LG)",
  BG: "Greenland (BG)",
  LH: "Hungary (LH)",
  BI: "Iceland (BI)",
  EI: "Ireland (EI)",
  LI: "Italy (LI)",
  OJ: "Jordan (OJ)",
  BK: "KFOR SECTOR (BK)",
  UA: "Kazakhstan (UA)",
  UC: "Kyrgyzstan (UC)",
  EV: "Latvia (EV)",
  EY: "Lithuania (EY)",
  LM: "Malta (LM)",
  LU: "Moldova (LU)",
  EH: "Netherlands (EH)",
  EN: "Norway (EN)",
  RP: "Philippines (RP)",
  EP: "Poland (EP)",
  LP: "Portugal (LP)",
  LW: "Republic of North Macedonia (LW)",
  LR: "Romania (LR)",
  LY: "Serbia and Montenegro (LY)",
  LZ: "Slovakia (LZ)",
  LJ: "Slovenia (LJ)",
  LE: "Spain (LE)",
  ES: "Sweden (ES)",
  LS: "Switzerland (LS)",
  LT: "Turkey (LT)",
  UK: "Ukraine (UK)",
  EG: "United Kingdom (EG)",
};

function log(msg) {
  console.log("[EAD-AD]", msg);
}

function jsfId(id) {
  return `[id="${id}"]`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadDotEnvIfPresent() {
  try {
    const envPath = join(PROJECT_ROOT, ".env");
    if (!existsSync(envPath)) return;
    const content = readFileSync(envPath, "utf8");
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
      const m = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].replace(/^["']|["']$/g, "").trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (_) {}
}

function parseArgValue(flagName, fallback = "") {
  const idx = process.argv.indexOf(`--${flagName}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  const inline = process.argv.find((a) => a.startsWith(`--${flagName}=`));
  if (inline) return inline.slice(`--${flagName}=`.length);
  return fallback;
}

function hasArg(flagName) {
  return process.argv.includes(`--${flagName}`);
}

function toNumber(input, fallback) {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function uniqueStrings(arr) {
  return [...new Set(arr.filter(Boolean).map((x) => String(x).trim()).filter(Boolean))];
}

function stampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function dismissIdleDialog(page) {
  try {
    const mask = page.locator("#idleDialog_modal").or(page.locator(".ui-widget-overlay.ui-dialog-mask"));
    const visible = await mask.isVisible().catch(() => false);
    if (!visible) return;
    await page.locator("#idleDialog").locator("button").first().click({ timeout: 3000, force: true }).catch(() => {});
    await page.waitForTimeout(700);
  } catch (_) {}
}

async function ensureAipOverviewReady(page) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await dismissIdleDialog(page);
      if (!page.url().includes("aip_overview.faces")) {
        try {
          await page.goto(AIP_OVERVIEW_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
        } catch (_) {}
      }
      if (!page.url().includes("aip_overview.faces")) {
        const aipLink = page
          .getByRole("link", { name: /aip\s*library/i })
          .or(page.locator("a").filter({ hasText: /aip\s*library/i }))
          .first();
        await aipLink.click({ timeout: 30000 });
        await page.waitForURL(/aip_overview\.faces/, { timeout: 30000 });
      }

      const authoritySelect = page
        .locator(jsfId("mainForm:selectAuthorityCode_input"))
        .or(page.locator('select[id$="selectAuthorityCode_input"]'))
        .first();
      await authoritySelect.waitFor({ state: "visible", timeout: 15000 });
      return;
    } catch (error) {
      lastErr = error;
      await sleep(1000 * attempt);
    }
  }
  throw new Error(`AIP overview not ready after retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

async function setSelectToLabel(page, id, label) {
  await page.evaluate(
    ({ fieldId, wanted }) => {
      const el = document.querySelector(`[id="${fieldId}"]`);
      if (!el || el.tagName !== "SELECT") return false;
      const option = [...el.options].find((o) => (o.textContent || "").trim() === wanted);
      if (!option) return false;
      el.value = option.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { fieldId: id, wanted: label },
  );
}

async function openAdvancedSearchAndRun(page) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await dismissIdleDialog(page);
      const advSearchBtn = page.getByText("Advanced Search").first();
      await advSearchBtn.waitFor({ state: "visible", timeout: 10000 });
      await advSearchBtn.click();
      await page.waitForTimeout(1000);

      const docHeaderInput = page
        .locator(jsfId("mainForm:documentHeader"))
        .or(page.locator('input[id$="documentHeader"]'))
        .first();
      await docHeaderInput.waitFor({ state: "visible", timeout: 15000 });
      await docHeaderInput.fill("");
      await page.waitForTimeout(250);
      await page.getByRole("button", { name: "Search" }).click();
      await page.waitForTimeout(2500);
      return;
    } catch (error) {
      lastErr = error;
      await page.getByText("Simple Search").first().click().catch(() => {});
      await page.waitForTimeout(700);
      await sleep(750 * attempt);
    }
  }
  throw new Error(`Advanced Search not ready after retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

async function scrapeCountry(page, countryLabel) {
  await ensureAipOverviewReady(page);
  await dismissIdleDialog(page);

  const authoritySelect = page
    .locator(jsfId("mainForm:selectAuthorityCode_input"))
    .or(page.locator('select[id$="selectAuthorityCode_input"]'))
    .or(page.locator("select").filter({ has: page.getByRole("option", { name: countryLabel }) }))
    .first();
  await authoritySelect.waitFor({ state: "visible", timeout: 15000 });
  const didSelect = await authoritySelect.selectOption({ label: countryLabel }).then(() => true).catch(() => false);
  if (!didSelect) throw new Error(`Could not select authority "${countryLabel}"`);
  await page.waitForTimeout(1200);

  await setSelectToLabel(page, "mainForm:selectLanguage_input", "English");
  await page.waitForTimeout(600);
  await setSelectToLabel(page, "mainForm:selectAipPart_input", "AD");
  await page.waitForTimeout(900);

  await openAdvancedSearchAndRun(page);

  const names = [];
  let pagesVisited = 0;
  let rowsCollected = 0;

  while (true) {
    const table = page.locator("#mainForm\\:searchResults_data");
    await table.waitFor({ state: "visible", timeout: 15000 });
    const rows = page.locator("#mainForm\\:searchResults_data tr");
    const rowCount = await rows.count();
    pagesVisited += 1;
    rowsCollected += rowCount;

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator("td");
      const cellCount = await cells.count();
      if (cellCount < 2) continue;
      const docNameCell = cells.nth(1);
      const link = docNameCell.locator("a.wrap-data").first();
      const linkText = await link.textContent().catch(() => null);
      const name = (linkText && linkText.trim()) || ((await docNameCell.textContent().catch(() => "")) || "").trim();
      if (name) names.push(name);
    }

    const nextBtn = page.locator("a.ui-paginator-next").first();
    const nextVisible = await nextBtn.isVisible().catch(() => false);
    const nextDisabled = await nextBtn
      .evaluate((el) => el.getAttribute("aria-disabled") === "true" || el.classList.contains("ui-state-disabled"))
      .catch(() => true);
    if (!nextVisible || nextDisabled) break;

    await dismissIdleDialog(page);
    await nextBtn.click();
    await page.waitForTimeout(1300);
  }

  const documentNames = uniqueStrings(names);
  return { documentNames, pagesVisited, rowsCollected };
}

function assessLowExtraction({ pagesVisited, rowsCollected, documentCount, previousCount, minRows, minPages, countDropRatio }) {
  const reasons = [];
  if (rowsCollected < minRows) reasons.push(`rows below minimum (${rowsCollected} < ${minRows})`);
  if (pagesVisited < minPages) reasons.push(`pages below minimum (${pagesVisited} < ${minPages})`);
  if (previousCount > 0) {
    const minAllowed = Math.floor(previousCount * countDropRatio);
    if (documentCount < minAllowed) {
      reasons.push(`document count dropped vs previous (${documentCount} < ${minAllowed}, prev=${previousCount}, ratio=${countDropRatio})`);
    }
  }
  return reasons;
}

function buildOutputResults(existingOutput) {
  return {
    scrapedAt: new Date().toISOString(),
    countries: { ...(existingOutput?.countries || {}) },
  };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

async function uploadResultToS3(localPath) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    log("AWS_S3_BUCKET not set; skipping extractor JSON upload.");
    return null;
  }
  const region = process.env.AWS_REGION || "us-east-1";
  const key =
    process.env.EAD_AD_NAMES_S3_KEY ||
    join(process.env.EAD_AD_NAMES_S3_PREFIX || "ead-extract", basename(localPath)).replace(/\\/g, "/");

  const body = readFileSync(localPath);
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );
  log(`Uploaded extractor output to s3://${bucket}/${key}`);
  return { bucket, key };
}

async function main() {
  loadDotEnvIfPresent();

  const user = process.env.EAD_USER;
  let password = process.env.EAD_PASSWORD;
  if (!password && process.env.EAD_PASSWORD_ENC) {
    try {
      password = Buffer.from(process.env.EAD_PASSWORD_ENC, "base64").toString("utf8");
    } catch (_) {
      password = "";
    }
  }
  if (!user || !password) {
    console.error("Set EAD_USER and EAD_PASSWORD (or EAD_PASSWORD_ENC) in .env or environment.");
    process.exit(1);
  }

  const outputPath = join(
    process.cwd(),
    parseArgValue("output", join("data", "ad_document_names.json")),
  );
  const onlyFailed = hasArg("only-failed");
  const stopAfter = parseArgValue("stop-after", "");
  const skipWebhook = hasArg("skip-webhook");

  const maxRetries = Math.max(1, toNumber(process.env.EAD_COUNTRY_MAX_RETRIES, 3));
  const minRows = Math.max(0, toNumber(process.env.EAD_MIN_ROWS_PER_COUNTRY, 5));
  const minPages = Math.max(0, toNumber(process.env.EAD_MIN_PAGES_PER_COUNTRY, 1));
  const countDropRatio = Math.max(0, toNumber(process.env.EAD_COUNT_DROP_RATIO, 0.6));

  let existingOutput = { countries: {} };
  if (existsSync(outputPath)) {
    try {
      existingOutput = JSON.parse(readFileSync(outputPath, "utf8"));
    } catch (_) {}
  }

  let countryLabels = [...new Set(Object.values(PREFIX_TO_COUNTRY))];
  if (onlyFailed) {
    countryLabels = countryLabels.filter((country) => {
      const prev = existingOutput?.countries?.[country];
      return !Array.isArray(prev) || prev.length === 0;
    });
    log(`Running only failed countries (${countryLabels.length})`);
  }

  const startedAt = new Date().toISOString();
  const outputResults = buildOutputResults(existingOutput);
  const runCountries = [];

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    log("Opening login page");
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByLabel(/user name/i).fill(user);
    await page.getByLabel(/password/i).fill(password);
    await page.locator('input[type="submit"][value="Login"]').click();
    await page.waitForURL(/cmscontent\.faces|eadbasic/, { timeout: 30000 });

    const termsBtn = page.locator("#acceptTCButton");
    await termsBtn.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    if (await termsBtn.isVisible().catch(() => false)) {
      log("Accepting terms");
      await termsBtn.click();
      await page.waitForTimeout(500);
    }

    await ensureAipOverviewReady(page);
    const bodyText = await page.locator("body").textContent().catch(() => "");
    if (/Access denied|IB-101/i.test(bodyText)) {
      throw new Error("EAD returned Access denied (often datacenter IP restrictions).");
    }

    for (const countryLabel of countryLabels) {
      log(`Country: ${countryLabel}`);
      const previousNames = Array.isArray(existingOutput?.countries?.[countryLabel])
        ? existingOutput.countries[countryLabel]
        : [];
      const previousCount = previousNames.length;

      const countryRun = {
        country: countryLabel,
        status: "failed",
        attempts: 0,
        pagesVisited: 0,
        rowsCollected: 0,
        documentCount: 0,
        previousCount,
        errors: [],
        lowExtractionReasons: [],
      };

      let bestAttempt = null;
      let success = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        countryRun.attempts = attempt;
        try {
          log(`  Attempt ${attempt}/${maxRetries}`);
          const attemptResult = await scrapeCountry(page, countryLabel);
          const lowReasons = assessLowExtraction({
            pagesVisited: attemptResult.pagesVisited,
            rowsCollected: attemptResult.rowsCollected,
            documentCount: attemptResult.documentNames.length,
            previousCount,
            minRows,
            minPages,
            countDropRatio,
          });

          countryRun.pagesVisited = attemptResult.pagesVisited;
          countryRun.rowsCollected = attemptResult.rowsCollected;
          countryRun.documentCount = attemptResult.documentNames.length;
          countryRun.lowExtractionReasons = lowReasons;
          bestAttempt = attemptResult;

          if (lowReasons.length > 0) {
            const reason = `Suspiciously low extraction: ${lowReasons.join("; ")}`;
            countryRun.errors.push(reason);
            log(`  ${reason}`);
            if (attempt < maxRetries) {
              await ensureAipOverviewReady(page);
              await sleep(1200 * attempt);
              continue;
            }
          } else {
            success = true;
          }
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          countryRun.errors.push(`Attempt ${attempt}: ${message}`);
          log(`  Attempt ${attempt} failed: ${message}`);
          if (attempt < maxRetries) {
            await ensureAipOverviewReady(page).catch(() => {});
            await sleep(1500 * attempt);
            continue;
          }
        }
      }

      if (success && bestAttempt) {
        outputResults.countries[countryLabel] = bestAttempt.documentNames;
        countryRun.status = "succeeded";
      } else {
        if (previousCount > 0) {
          outputResults.countries[countryLabel] = previousNames;
          countryRun.errors.push("Preserved previous output because retries exhausted.");
        } else if (bestAttempt) {
          outputResults.countries[countryLabel] = bestAttempt.documentNames;
        } else {
          outputResults.countries[countryLabel] = [];
        }
      }

      runCountries.push(countryRun);
      outputResults.scrapedAt = new Date().toISOString();
      writeJson(outputPath, outputResults);

      log(
        `  Done (${countryRun.status}) docs=${outputResults.countries[countryLabel].length}, pages=${countryRun.pagesVisited}, rows=${countryRun.rowsCollected}`,
      );

      if (stopAfter && countryLabel === stopAfter) {
        log(`Stop requested after country: ${stopAfter}`);
        break;
      }
    }
  } finally {
    await browser.close();
  }

  outputResults.scrapedAt = new Date().toISOString();
  writeJson(outputPath, outputResults);

  const endedAt = new Date().toISOString();
  const succeededCountries = runCountries.filter((c) => c.status === "succeeded").length;
  const failedCountries = runCountries.length - succeededCountries;
  const totalDocuments = runCountries.reduce((sum, c) => sum + Number(c.documentCount || 0), 0);
  const totalPages = runCountries.reduce((sum, c) => sum + Number(c.pagesVisited || 0), 0);
  const totalRows = runCountries.reduce((sum, c) => sum + Number(c.rowsCollected || 0), 0);

  const runSummary = {
    testType: "ead-ad-document-names",
    startedAt,
    endedAt,
    outputPath,
    settings: {
      maxRetries,
      minRows,
      minPages,
      countDropRatio,
      onlyFailed,
      stopAfter: stopAfter || null,
    },
    summary: {
      totalCountries: runCountries.length,
      succeededCountries,
      failedCountries,
      totalDocuments,
      totalPages,
      totalRows,
      // Compatibility keys for existing webhook script summary parser
      totalAirports: runCountries.length,
      passedAirports: succeededCountries,
      failedAirports: failedCountries,
    },
    countries: runCountries,
  };

  const outputDir = process.env.TEST_RESULTS_DIR || join(PROJECT_ROOT, "test-results");
  const rawDir = join(outputDir, "raw");
  const rawPath = join(rawDir, `ead-ad-${stampForFile()}.json`);
  writeJson(rawPath, runSummary);
  log(`Wrote output JSON: ${outputPath}`);
  log(`Wrote raw run JSON: ${rawPath}`);

  await uploadResultToS3(outputPath).catch((error) => {
    log(`S3 upload warning: ${error instanceof Error ? error.message : String(error)}`);
  });

  // Generate markdown report
  let reportPath = "";
  try {
    const reportStdout = execFileSync(
      "node",
      [join(PROJECT_ROOT, "scripts", "generate-ead-ad-report.mjs"), `--input=${rawPath}`],
      { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] },
    );
    const reportMatch = reportStdout.match(/Report generated:\s*(.+)\s*$/m);
    if (reportMatch?.[1]) reportPath = reportMatch[1].trim();
    for (const line of reportStdout.split(/\r?\n/).filter(Boolean)) console.log(line);
  } catch (error) {
    log(`Report generation warning: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!skipWebhook) {
    try {
      const args = [join(PROJECT_ROOT, "scripts", "send-test-webhook.mjs")];
      if (reportPath) args.push(`--report-path=${reportPath}`);
      args.push(`--raw-json-path=${rawPath}`);
      execFileSync("node", args, { stdio: "inherit" });
    } catch (error) {
      log(`Webhook warning: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    log("Skipping webhook because --skip-webhook was provided.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
