/**
 * CrewBriefing NOTAM scraper for sync server + local storage.
 * Login → Extra WX → NOTAM page → search ICAO → extract ResultTable → parse → save JSON.
 * Same JSON shape as FAA scraper: { location, number, class, startDateUtc, endDateUtc, condition }.
 *
 * Env: CREWBRIEFING_USER, CREWBRIEFING_PASSWORD (required on server).
 *      STORAGE_ROOT/CACHE_ROOT for local storage layer.
 *      NOTAM_PROGRESS_FILE for sync server progress.
 *
 * Usage: node scripts/crewbriefing-notams.mjs [--json] <ICAO>
 */

import { appendFileSync, existsSync } from 'fs';
import { saveFile } from "../lib/storage.mjs";

const LOGIN_URL = 'https://www.crewbriefing.com/loginssl.aspx';
const NOTAMS_URL = 'https://www.crewbriefing.com/Cb_Extra/2.5.19/NOTAM/Notams.aspx';

function progress(msg) {
  const line = 'PROGRESS:' + msg + '\n';
  if (process.env.NOTAM_PROGRESS_FILE) {
    try {
      appendFileSync(process.env.NOTAM_PROGRESS_FILE, line);
    } catch (_) {}
  }
  if (jsonMode) console.error(line.trim());
}

/** Remove CrewBriefing footer lines (company policy / US Military excluded). */
function stripFooterLines(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\s*NOTAMs excluded in accordance with FSP CLEARWAY company policy\s*/gi, '')
    .replace(/\s*US Military NOTAMs excluded\.?\s*/gi, '')
    .replace(/(\n---\s*)+$/g, '')
    .replace(/^\s*---\s*\n?/g, '')
    .trim();
}

/** Parse CrewBriefing NOTAM table text into same shape as FAA scraper. */
function parseNotamText(rawText, icao) {
  const notams = [];
  if (!rawText || typeof rawText !== 'string') return notams;

  const cleaned = stripFooterLines(rawText);

  // Split into blocks: |#n| or line starting with A\d{4}/\d{2} NOTAM
  const blocks = cleaned
    .split(/\|\#\d+\|\s*\-+/)
    .map((b) => b.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const location = (block.match(/A\)\s*([A-Z0-9]{4})/)?.[1] || icao).trim();
    const numMatch = block.match(/^(A\d{4}\/\d{2})\s+(NOTAM[NRC]?)/m);
    const number = numMatch ? numMatch[1].trim() : '';
    const notamClass = numMatch ? numMatch[2].trim() : '';

    let startDateUtc = '';
    let endDateUtc = '';
    const bMatch = block.match(/B\)\s*(\d{10,12})/);
    const cMatch = block.match(/C\)\s*(\d{10,12})/);
    if (bMatch) startDateUtc = formatNotamDate(bMatch[1]);
    if (cMatch) endDateUtc = formatNotamDate(cMatch[1]);

    const eMatch = block.match(/E\)\s*([\s\S]*?)(?=\n[A-Z]\)|$)/);
    let condition = (eMatch ? eMatch[1].replace(/\s+/g, ' ').trim() : block).slice(0, 2000);
    condition = stripFooterLines(condition);

    if (!block.includes('A)')) continue; // skip header/footer
    notams.push({
      location,
      number,
      class: notamClass,
      startDateUtc,
      endDateUtc,
      condition: condition || block.slice(0, 500),
    });
  }

  return notams;
}

/** e.g. 2603160700 -> 2026-03-16 07:00 UTC */
function formatNotamDate(s) {
  if (!s || s.length < 10) return s;
  const yy = s.slice(0, 2);
  const year = parseInt(yy, 10) >= 90 ? '19' + yy : '20' + yy;
  const month = s.slice(2, 4);
  const day = s.slice(4, 6);
  const hour = s.slice(6, 8);
  const min = s.length >= 10 ? s.slice(8, 10) : '00';
  return `${year}-${month}-${day} ${hour}:${min} UTC`;
}

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

async function openExtraWxSurface(page, context, timeoutMs = 12000) {
  const extraWxLink = page.getByRole('link', { name: /Extra\s*WX/i }).first();
  if (!(await extraWxLink.count())) return page;

  const popupPromise = context.waitForEvent('page', { timeout: timeoutMs }).catch(() => null);
  const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => null);
  await extraWxLink.click({ timeout: timeoutMs }).catch(() => {});

  const popup = await popupPromise;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    return popup;
  }

  await navPromise;
  return page;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--json');
  jsonMode = process.argv.includes('--json');
  const icao = (args[0] || 'DBBB').toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    console.error('Usage: node scripts/crewbriefing-notams.mjs [--json] <ICAO>');
    process.exit(1);
  }

  const user = process.env.CREWBRIEFING_USER || '';
  const password = process.env.CREWBRIEFING_PASSWORD || '';
  if (!user || !password) {
    console.error('CREWBRIEFING_USER and CREWBRIEFING_PASSWORD must be set.');
    process.exit(1);
  }

  progress('Initializing browser');
  const { chromium } = await import('playwright');
  const useHeaded = process.env.USE_HEADED === '1' || process.env.DISPLAY;
  const executablePath = resolveChromiumExecutablePath();
  const launchOptions = {
    headless: !useHeaded,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (executablePath) launchOptions.executablePath = executablePath;
  else if (process.env.CHROME_CHANNEL) launchOptions.channel = process.env.CHROME_CHANNEL;
  const browser = await chromium.launch(launchOptions).catch(() => {
    progress('Primary browser launch failed, retrying with Playwright defaults');
    return chromium.launch({ headless: !useHeaded, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let notamText = null;
  try {
    progress('Logging in');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="text"]', user);
    await page.fill('input[type="password"]', password);
    await page.click('input[type="submit"], button[type="submit"], input[value="Login"]');
    await page.waitForURL(/Main\.aspx/, { timeout: 15000 });

    progress('Going to NOTAM page');
    await page.goto(NOTAMS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

    progress('Searching for ' + icao);
    let workPage = page;
    let searchInput = await findSearchInput(workPage, 8000);
    if (!searchInput) {
      progress('Direct NOTAM page had no textbox, retrying via Extra WX popup');
      const extraPage = await openExtraWxSurface(page, context, 12000);
      await extraPage.waitForLoadState('domcontentloaded');
      await extraPage.goto(NOTAMS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      workPage = extraPage;
      searchInput = await findSearchInput(workPage, 12000);
      if (!searchInput) {
        throw new Error('Could not locate CrewBriefing ICAO search field on NOTAM page.');
      }
    }
    await searchInput.fill(icao);
    await workPage.click('input[type="submit"], input[value="View"], button:has-text("View"), button:has-text("Search")');
    await workPage.waitForTimeout(4000);

    notamText = await workPage.evaluate(() => {
      const table = document.getElementById('ResultTable');
      if (!table) return null;
      const cells = table.querySelectorAll('td');
      return Array.from(cells)
        .map((td) => td.innerText || td.textContent || '')
        .join('\n---\n');
    });
  } finally {
    await browser.close();
  }

  progress('Parsing NOTAMs');
  const notams = parseNotamText(notamText || '', icao);

  if (notams.length >= 0) {
    progress('Saving NOTAMs to storage');
    try {
      const key = `notam/${icao}.json`;
      await saveFile(key, JSON.stringify({ icao, notams, updatedAt: new Date().toISOString() }));
      if (!jsonMode) console.error('Saved to /storage/' + key);
    } catch (e) {
      if (!jsonMode) console.error('Storage write failed:', e?.message || String(e));
    }
  }

  progress('Done');
  if (jsonMode) {
    console.log(JSON.stringify(notams));
  } else if (notamText) {
    console.log(notamText);
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
