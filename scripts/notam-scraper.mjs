/**
 * FAA NOTAM Scraper
 * 1. Navigate to https://notams.aim.faa.gov/notamSearch/nsapp.html#/
 * 2. Accept consent if disclaimer is shown
 * 3. Enter airport ICAO code in search
 * 4. Click "Select all" then Excel export to download all NOTAMs
 * 5. Parse the Excel file and output NOTAM data
 *
 * Usage: node scripts/notam-scraper.mjs [ICAO]
 * Example: node scripts/notam-scraper.mjs KJFK
 */

import { join } from 'path';
import { existsSync, appendFileSync } from 'fs';

const NOTAM_SEARCH_URL = 'https://notams.aim.faa.gov/notamSearch/nsapp.html#/';
const DEFAULT_ICAO = 'KJFK';

function log(...args) {
  if (jsonMode) console.error(...args);
  else console.log(...args);
}

/** Emit a progress step for sync server. Uses progress file if set (flushed immediately); else stderr. */
function progress(msg) {
  const line = "PROGRESS:" + msg + "\n";
  if (process.env.NOTAM_PROGRESS_FILE) {
    try {
      appendFileSync(process.env.NOTAM_PROGRESS_FILE, line);
    } catch (_) {}
  }
  if (jsonMode) console.error(line.trim());
}

let jsonMode = false;
let notamsOutput = [];

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--json');
  jsonMode = process.argv.includes('--json');
  const icao = (args[0] || DEFAULT_ICAO).toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    console.error('Usage: node scripts/notam-scraper.mjs [--json] <ICAO>\nExample: node scripts/notam-scraper.mjs --json KJFK');
    process.exit(1);
  }

  progress("Initializing browser");
  const { chromium } = await import('playwright');
  const useHeaded = process.env.USE_HEADED === '1' || process.env.DISPLAY;
  const browser = await chromium.launch({
    headless: !useHeaded,
    channel: process.env.CHROME_CHANNEL || 'chrome',
    args: useHeaded ? ['--no-sandbox', '--disable-setuid-sandbox'] : undefined,
  }).catch(() => chromium.launch({ headless: !useHeaded, args: ['--no-sandbox', '--disable-setuid-sandbox'] }));
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    acceptDownloads: true,
    viewport: useHeaded ? { width: 1920, height: 1080 } : null,
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  const downloadDir = join(process.cwd(), 'scripts');

  try {
    progress("Navigating to FAA NOTAM Search");
    log('Navigating to FAA NOTAM Search...');
    await page.goto(NOTAM_SEARCH_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Step 1: Handle consent / disclaimer if present
    const disclaimerUrl = 'disclaimer.html';
    if (page.url().includes(disclaimerUrl)) {
      progress("Accepting consent / disclaimer");
      log('Disclaimer page detected. Looking for consent control...');
      await page.waitForTimeout(2000);

      // Try checkbox first (I've read and understood), then continue button
      const tryClick = async (locator, label) => {
        try {
          const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
          if (await el.isVisible({ timeout: 1500 })) {
            await el.click();
            log('Clicked:', label);
            return true;
          }
        } catch (_) {}
        return false;
      };

      await tryClick('input[type="checkbox"]', 'checkbox') ||
        tryClick(page.getByText(/I've read and understood/i), "I've read checkbox/label") ||
        tryClick(page.getByRole('button', { name: /accept|I've read/i }), 'accept button');

      await page.waitForTimeout(500);

      const continueBtn = page.getByRole('button', { name: /NOTAM Search|Continue|Submit/i }).or(page.getByRole('link', { name: /NOTAM Search/i }));
      if (await continueBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await continueBtn.first().click();
        log('Clicked continue/NOTAM Search.');
      }

      await page.waitForURL(/nsapp\.html/, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    // Ensure we're on the search app
    if (!page.url().includes('nsapp')) {
      await page.goto(NOTAM_SEARCH_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
    }

    // Step 2: Find search bar and enter ICAO
    progress("Entering " + icao);
    log('Searching for ICAO:', icao);
    const searchSelectors = [
      'input[placeholder*="ICAO"]',
      'input[placeholder*="Location"]',
      'input[type="search"]',
      'input[name*="icao"]',
      'input[name*="location"]',
      'input[aria-label*="search"]',
      'input[id*="search"]',
      'input[class*="search"]',
    ];

    let searchFilled = false;
    for (const sel of searchSelectors) {
      try {
        const input = page.locator(sel).first();
        if (await input.isVisible({ timeout: 1500 })) {
          await input.fill(icao);
          searchFilled = true;
          log('Filled search with', icao);
          break;
        }
      } catch (_) {}
    }

    if (!searchFilled) {
      // Fallback: first visible text input
      const anyInput = page.locator('input[type="text"]').first();
      if (await anyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await anyInput.fill(icao);
        searchFilled = true;
      }
    }

    if (!searchFilled) {
      log('Could not find search input. Page snapshot (partial):');
      const body = await page.locator('body').innerText().catch(() => '');
      log(body.slice(0, 1500));
    } else {
      // Step 3: Trigger search (button or Enter)
      progress("Running search");
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);

      // Step 4: Click "Select all" (checkbox/button in panel-heading .btn-group)
      progress("Selecting all NOTAMs");
      const selectAllBtn = page.locator('.panel-heading .pull-right .btn-group .btn').first();
      if (await selectAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await selectAllBtn.click();
        log('Clicked Select all.');
        await page.waitForTimeout(800);
      } else {
        await page.locator('.panel-heading .btn-group span.btn img').first().click().catch(() => {});
        await page.waitForTimeout(800);
      }

      // Step 5: Click Excel export and wait for download
      progress("Exporting to Excel");
      const excelBtn = page.locator('.panel-heading .pull-right .btn').filter({ has: page.locator('.icon-excel') });
      let downloadedPath = null;
      if (await excelBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
        await excelBtn.first().click();
        try {
          const download = await downloadPromise;
          const filename = download.suggestedFilename() || `notams-${icao}.xlsx`;
          downloadedPath = join(downloadDir, filename);
          await download.saveAs(downloadedPath);
          log('Downloaded:', filename);
        } catch (e) {
          console.warn('Download wait failed:', e.message);
        }
      } else {
        await page.locator('.panel-heading .btn .icon-excel').first().click().catch(() => {});
        const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        const download = await downloadPromise;
        if (download) {
          const filename = download.suggestedFilename() || `notams-${icao}.xlsx`;
          downloadedPath = join(downloadDir, filename);
          await download.saveAs(downloadedPath);
          log('Downloaded:', filename);
        }
      }

      // Step 6: Parse Excel and extract NOTAMs
      progress("Parsing NOTAMs");
      if (downloadedPath && existsSync(downloadedPath)) {
        const xlsx = await import('xlsx');
        const lib = xlsx.default || xlsx;
        const readFile = lib.readFile || lib.readFileSync;
        const workbook = readFile(downloadedPath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = (lib.utils || xlsx.utils).sheet_to_json(sheet, { header: 1, defval: '' });
        const notams = [];
        let headerRowIdx = 0;
        for (let r = 0; r < Math.min(10, rows.length); r++) {
          const row = (rows[r] || []).map((c) => String(c ?? '').trim());
          if (row.some((c) => /^location$/i.test(c)) && row.some((c) => /^class$/i.test(c))) {
            headerRowIdx = r;
            break;
          }
        }
        const header = (rows[headerRowIdx] || []).map((h) => String(h || '').trim());
        const locIdx = header.findIndex((h) => /^location$/i.test(h));
        const numIdx = header.findIndex((h) => /^number$/i.test(h) || /notam\s*#?/i.test(h));
        const classIdx = header.findIndex((h) => /^class$/i.test(h));
        const issueIdx = header.findIndex((h) => /issue\s*date|effective\s*date/i.test(h));
        const effectiveIdx = header.findIndex((h) => /effective\s*date/i.test(h));
        const expirIdx = header.findIndex((h) => /expir/i.test(h));
        const itemIdx = header.findIndex((h) => /^item$|condition|notam\s*text|description/i.test(h));
        const get = (row, idx) => (idx >= 0 && row[idx] != null ? String(row[idx]).trim() : '');
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row) || row.length < 2) continue;
          const loc = get(row, locIdx >= 0 ? locIdx : 0);
          if (!loc || loc.length > 6 || /filter|used|date/i.test(loc)) continue;
          notams.push({
            location: loc,
            number: get(row, numIdx >= 0 ? numIdx : 1),
            class: get(row, classIdx >= 0 ? classIdx : 2),
            startDateUtc: get(row, issueIdx >= 0 ? issueIdx : effectiveIdx >= 0 ? effectiveIdx : 3),
            endDateUtc: get(row, expirIdx >= 0 ? expirIdx : 4),
            condition: get(row, itemIdx >= 0 ? itemIdx : Math.max(5, header.length - 1)),
          });
        }
        notamsOutput = notams;
        if (!jsonMode) {
          log('NOTAMs from Excel:', notams.length);
          notams.slice(0, 15).forEach((n, i) => {
            log(`\n--- NOTAM ${i + 1} ---`);
            log(JSON.stringify(n, null, 2));
          });
          if (notams.length > 15) log(`\n... and ${notams.length - 15} more.`);
          log('\nFull Excel saved to:', downloadedPath);
        }
      } else if (!downloadedPath) {
        if (!jsonMode) log('Excel download not received. Falling back to table scrape.');
        const tableRows = page.locator('table tbody tr, [role="table"] [role="row"]').filter({ hasNot: page.locator('th') });
        const rowCount = await tableRows.count().catch(() => 0);
        const notams = [];
        for (let i = 0; i < Math.min(rowCount, 100); i++) {
          const cells = tableRows.nth(i).locator('td, [role="cell"]');
          const cellCount = await cells.count();
          if (cellCount >= 6) {
            const values = await Promise.all(Array.from({ length: cellCount }, (_, j) => cells.nth(j).innerText().then((t) => t.trim())));
            const startIdx = values[0] ? 0 : 1;
            notams.push({
              location: values[startIdx] || '',
              number: values[startIdx + 1] || '',
              class: values[startIdx + 2] || '',
              startDateUtc: values[startIdx + 3] || '',
              endDateUtc: values[startIdx + 4] || '',
              condition: (values[startIdx + 5] != null ? values[startIdx + 5] : values.slice(startIdx + 5).join(' ')).replace(/\s+/g, ' ').trim(),
            });
          }
        }
        notamsOutput = notams;
        if (!jsonMode) {
          log('NOTAMs (table fallback):', notams.length);
          notams.slice(0, 10).forEach((n, i) => log(JSON.stringify(n)));
        }
      }
    }

    if (!jsonMode) {
      await page.screenshot({ path: 'scripts/notam-search-screenshot.png' }).catch(() => {});
      log('\nScreenshot saved to scripts/notam-search-screenshot.png');
    }
  } finally {
    await browser.close();
  }
  progress("Done");
  if (jsonMode && notamsOutput.length >= 0) {
    console.log(JSON.stringify(notamsOutput));
  }

  if (process.env.AWS_S3_BUCKET && notamsOutput.length >= 0) {
    progress("Uploading to S3");
    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const bucket = process.env.AWS_S3_BUCKET;
      const prefix = process.env.AWS_S3_PREFIX || 'notams';
      const key = `${prefix}/${icao}.json`;
      const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify({ icao, notams: notamsOutput, updatedAt: new Date().toISOString() }),
          ContentType: 'application/json',
        })
      );
      log('Uploaded to s3://' + bucket + '/' + key);
    } catch (e) {
      if (!jsonMode) console.error('S3 upload failed:', e.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
