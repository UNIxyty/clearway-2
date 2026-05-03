#!/usr/bin/env node
/**
 * EAD Basic – list all AD "Document Name" values per country.
 * Logs in, opens AIP Library, then for each country: selects authority, AIP part AD,
 * runs search (empty = all), paginates through all result pages and collects
 * the "Document Name" column value from every row.
 *
 * Requires: EAD_USER, EAD_PASSWORD or EAD_PASSWORD_ENC (env or .env).
 * Usage: xvfb-run -a node scripts/ead-list-document-names-by-country.mjs [--output data/ead-document-names-by-country.json] [--no-skip] [--retry-from-log <path>]
 *
 * Output: JSON { "countries": { "Albania (LA)": ["LA_AD_2_LAKU_24 -5_EN.pdf", ...], ... } }
 */

import { join, dirname } from 'path';
const pathDirname = dirname;
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = pathDirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

try {
  const envPath = join(PROJECT_ROOT, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
} catch (_) {}

const BASE = 'https://www.ead.eurocontrol.int';
const LOGIN_URL = BASE + '/cms-eadbasic/opencms/en/login/ead-basic/';
const AIP_OVERVIEW_URL = BASE + '/fwf-eadbasic/restricted/user/aip/aip_overview.faces';

const PREFIX_TO_COUNTRY = {
  LA: 'Albania (LA)',
  UD: 'Armenia (UD)',
  LO: 'Austria (LO)',
  UB: 'Azerbaijan (UB)',
  EB: 'Belgium (EB)',
  LQ: 'Bosnia/Herzeg. (LQ)',
  LB: 'Bulgaria (LB)',
  LD: 'Croatia (LD)',
  LC: 'Cyprus (LC)',
  LK: 'Czech Republic (LK)',
  EK: 'Denmark (EK)',
  EE: 'Estonia (EE)',
  XX: 'Faroe Islands (XX)',
  EF: 'Finland (EF)',
  LF: 'France (LF)',
  UG: 'Georgia (UG)',
  ED: 'Germany (ED)',
  LG: 'Greece (LG)',
  BG: 'Greenland (BG)',
  LH: 'Hungary (LH)',
  BI: 'Iceland (BI)',
  EI: 'Ireland (EI)',
  LI: 'Italy (LI)',
  OJ: 'Jordan (OJ)',
  BK: 'KFOR SECTOR (BK)',
  UA: 'Kazakhstan (UA)',
  UC: 'Kyrgyzstan (UC)',
  EV: 'Latvia (EV)',
  EY: 'Lithuania (EY)',
  LM: 'Malta (LM)',
  LU: 'Moldova (LU)',
  EH: 'Netherlands (EH)',
  EN: 'Norway (EN)',
  RP: 'Philippines (RP)',
  EP: 'Poland (EP)',
  LP: 'Portugal (LP)',
  LW: 'Republic of North Macedonia (LW)',
  LR: 'Romania (LR)',
  LY: 'Serbia and Montenegro (LY)',
  LZ: 'Slovakia (LZ)',
  LJ: 'Slovenia (LJ)',
  LE: 'Spain (LE)',
  ES: 'Sweden (ES)',
  LS: 'Switzerland (LS)',
  LT: 'Turkey (LT)',
  UK: 'Ukraine (UK)',
  EG: 'United Kingdom (EG)',
};

function log(msg) {
  console.log('[EAD]', msg);
}

function jsfId(id) {
  return `[id="${id}"]`;
}

async function dismissIdleDialog(page) {
  try {
    const mask = page.locator('#idleDialog_modal').or(page.locator('.ui-widget-overlay.ui-dialog-mask'));
    const visible = await mask.isVisible().catch(() => false);
    if (visible) {
      await page.locator('#idleDialog').locator('button').first().click({ timeout: 3000, force: true }).catch(() => {});
      await page.waitForTimeout(800);
    }
  } catch (_) {}
}

async function dismissTermsDialog(page) {
  try {
    const termsBtn = page.locator('#acceptTCButton').or(page.locator('#termsDialog_modal .ui-dialog-buttonset button')).first();
    if (await termsBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await termsBtn.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  } catch (_) {}
}

async function loginAndOpenAip(page, user, password) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByLabel(/user name/i).fill(user);
  await page.getByLabel(/password/i).fill(password);
  await page.locator('input[type="submit"][value="Login"]').click();
  await page.waitForURL(/cmscontent\.faces|eadbasic/, { timeout: 15000 });
  await dismissTermsDialog(page);
  await page.goto(AIP_OVERVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await dismissTermsDialog(page);
}

async function ensureAuthoritySelect(page, countryLabel, user, password) {
  const authoritySelect = page
    .locator(jsfId('mainForm:selectAuthorityCode_input'))
    .or(page.locator('select[id$="selectAuthorityCode_input"]'))
    .or(page.locator('select').filter({ has: page.getByRole('option', { name: countryLabel }) }))
    .first();

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await dismissIdleDialog(page);
      await dismissTermsDialog(page);
      await authoritySelect.waitFor({ state: 'visible', timeout: 15000 });
      return authoritySelect;
    } catch (err) {
      lastErr = err;
      const currentUrl = page.url().toLowerCase();
      log(`  Authority selector not ready (attempt ${attempt}/3), recovering page state...`);
      if (currentUrl.includes('session_expired') || currentUrl.includes('/login/')) {
        await loginAndOpenAip(page, user, password);
      } else {
        await page.goto(AIP_OVERVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await dismissTermsDialog(page);
        await page.waitForTimeout(1000);
      }
    }
  }
  throw lastErr || new Error(`Country selector not ready for ${countryLabel}`);
}

function failedCountriesFromLog(logPath) {
  if (!logPath || !existsSync(logPath)) return [];
  const raw = readFileSync(logPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const failed = new Set();
  let currentCountry = '';
  for (const line of lines) {
    const countryMatch = line.match(/\[EAD\]\s+Country:\s+(.+)$/);
    if (countryMatch) {
      currentCountry = countryMatch[1].trim();
      continue;
    }
    if (!currentCountry) continue;
    if (/\[EAD\]\s+Error:|\[EAD\]\s+Fatal:|\[EAD\]\s{2,}Error:/.test(line)) {
      failed.add(currentCountry);
    }
  }
  return [...failed];
}

async function main() {
  const user = process.env.EAD_USER;
  let password = process.env.EAD_PASSWORD;
  if (!password && process.env.EAD_PASSWORD_ENC) {
    try {
      password = Buffer.from(process.env.EAD_PASSWORD_ENC, 'base64').toString('utf8');
    } catch (_) {
      password = '';
    }
  }
  if (!user || !password) {
    console.error('Set EAD_USER and EAD_PASSWORD (or EAD_PASSWORD_ENC) in .env or environment.');
    process.exit(1);
  }

  const outArg = process.argv.indexOf('--output');
  const outputPath = outArg !== -1 && process.argv[outArg + 1]
    ? join(process.cwd(), process.argv[outArg + 1])
    : join(PROJECT_ROOT, 'data', 'ead-document-names-by-country.json');

  const onlyFailedArg = process.argv.indexOf('--only-failed');
  const onlyFailed = onlyFailedArg !== -1;
  const noSkip = process.argv.includes('--no-skip');
  const retryFromLogArg = process.argv.indexOf('--retry-from-log');
  const retryFromLogPath = retryFromLogArg !== -1 ? process.argv[retryFromLogArg + 1] : null;

  const stopAfterArg = process.argv.indexOf('--stop-after');
  const stopAfter = stopAfterArg !== -1 ? process.argv[stopAfterArg + 1] : null;

  let countryLabels = [...new Set(Object.values(PREFIX_TO_COUNTRY))];
  let results = { countries: {}, scrapedAt: new Date().toISOString() };

  if (existsSync(outputPath)) {
    const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
    results = existing;
    results.scrapedAt = new Date().toISOString();
    if (retryFromLogPath) {
      const failedCountries = failedCountriesFromLog(join(process.cwd(), retryFromLogPath));
      countryLabels = countryLabels.filter((c) => failedCountries.includes(c));
      log('Retry-from-log mode, running failed countries only (' + countryLabels.length + '): ' + countryLabels.join(', '));
    } else if (onlyFailed) {
      const failedCountries = Object.entries(existing.countries)
        .filter(([_, docs]) => docs.length === 0)
        .map(([country, _]) => country);
      countryLabels = failedCountries;
      log('Running only failed countries (' + failedCountries.length + '): ' + failedCountries.join(', '));
    } else if (!noSkip) {
      const toSkip = Object.entries(existing.countries)
        .filter(([_, docs]) => docs.length > 0)
        .map(([country, _]) => country);
      countryLabels = countryLabels.filter(c => !toSkip.includes(c));
      log('Skipping ' + toSkip.length + ' countries with data, running ' + countryLabels.length + ' remaining');
    } else {
      log('No-skip mode enabled: running all ' + countryLabels.length + ' countries');
    }
  }

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    log('Opening login page');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByLabel(/user name/i).fill(user);
    await page.getByLabel(/password/i).fill(password);
    await page.locator('input[type="submit"][value="Login"]').click();
    await page.waitForURL(/cmscontent\.faces|eadbasic/, { timeout: 15000 });

    const termsBtn = page.locator('#acceptTCButton');
    await termsBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await termsBtn.isVisible()) {
      log('Accepting terms');
      await termsBtn.click();
      await page.waitForTimeout(500);
    }

    log('Opening AIP Library');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    try {
      await page.goto(AIP_OVERVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (_) {}
    if (!page.url().includes('aip_overview')) {
      const aipLink = page.getByRole('link', { name: /aip\s*library/i }).or(page.locator('a').filter({ hasText: /aip\s*library/i })).first();
      await aipLink.click({ timeout: 60000 });
      await page.waitForURL(/aip_overview\.faces/, { timeout: 20000 });
    }
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').textContent().catch(() => '');
    if (/Access denied|IB-101/i.test(bodyText)) {
      throw new Error('EAD returned Access denied (e.g. datacenter IP). Run from your PC or a non-datacenter network.');
    }

    for (const countryLabel of countryLabels) {
      log('Country: ' + countryLabel);
      const documentNames = [];

      try {
        await dismissIdleDialog(page);
        
        // —— Authority (country) ——
        const authoritySelect = await ensureAuthoritySelect(page, countryLabel, user, password);
        await authoritySelect.selectOption({ label: countryLabel }).catch(() => null);
        await page.waitForTimeout(1200);

        // —— Language: English ——
        await page.evaluate((id) => {
          const el = document.querySelector(`[id="${id}"]`);
          if (el && el.tagName === 'SELECT') {
            const opt = [...el.options].find((o) => o.textContent.trim() === 'English');
            if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }
        }, 'mainForm:selectLanguage_input');
        await page.waitForTimeout(600);

        // —— AIP Part: AD (stays same for all countries) ——
        await page.evaluate((id) => {
          const el = document.querySelector(`[id="${id}"]`);
          if (el && el.tagName === 'SELECT') {
            const opt = [...el.options].find((o) => o.textContent.trim() === 'AD');
            if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }
        }, 'mainForm:selectAipPart_input');
        await page.waitForTimeout(1000);

        // —— Open Advanced Search, leave empty, press Search ——
        log('  Opening Advanced Search and searching');
        let searchFormReady = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await dismissIdleDialog(page);
            const advSearchBtn = page.getByText('Advanced Search').first();
            await advSearchBtn.waitFor({ state: 'visible', timeout: 10000 });
            await advSearchBtn.click();
            await page.waitForTimeout(1200);
            const docHeaderInput = page.locator(jsfId('mainForm:documentHeader')).or(page.locator('input[id$="documentHeader"]'));
            await docHeaderInput.waitFor({ state: 'visible', timeout: 15000 });
            await docHeaderInput.fill('');
            await page.waitForTimeout(300);
            await page.getByRole('button', { name: 'Search' }).click();
            await page.waitForTimeout(3000);
            searchFormReady = true;
            break;
          } catch (e) {
            if (attempt === 0) {
              log('  Advanced Search form timeout, retrying...');
              await page.getByText('Simple Search').first().click().catch(() => {});
              await page.waitForTimeout(800);
            } else {
              throw e;
            }
          }
        }
        if (!searchFormReady) throw new Error('Advanced Search form not ready after retries');

        // —— Results table: div#mainForm:searchResults > div.ui-datatable-tablewrapper > table, tbody#mainForm:searchResults_data
        // Columns: 0=Effective Date, 1=Document Name, 2=eAIP AIRAC, 3=Document Heading
        let pageNum = 1;
        let hasMore = true;
        while (hasMore) {
          const table = page.locator('#mainForm\\:searchResults_data');
          await table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
          const rows = page.locator('#mainForm\\:searchResults_data tr');
          const rowCount = await rows.count();

          for (let i = 0; i < rowCount; i++) {
            const cells = rows.nth(i).locator('td');
            const cellCount = await cells.count();
            if (cellCount < 2) continue;
            // Document Name = column index 1; prefer link text (filename), else cell text
            const docNameCell = cells.nth(1);
            const link = docNameCell.locator('a.wrap-data').first();
            const linkText = await link.textContent().catch(() => null);
            const name = (linkText && linkText.trim()) || ((await docNameCell.textContent().catch(() => '')) || '').trim();
            if (name) documentNames.push(name);
          }

          log('  Page ' + pageNum + ': ' + rowCount + ' rows (total names so far: ' + documentNames.length + ')');

          // Next page: a.ui-paginator-next, aria-label="Next Page"
          const nextBtn = page.locator('a.ui-paginator-next').first();
          const nextVisible = await nextBtn.isVisible().catch(() => false);
          const nextDisabled = await nextBtn.evaluate((el) => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('ui-state-disabled')).catch(() => true);
          if (!nextVisible || nextDisabled) {
            hasMore = false;
            break;
          }
          await dismissIdleDialog(page);
          await nextBtn.click();
          await page.waitForTimeout(1500);
          pageNum += 1;
        }

        results.countries[countryLabel] = documentNames;
        log('  Document names: ' + results.countries[countryLabel].length);
      } catch (err) {
        log('  Error: ' + err.message);
        results.countries[countryLabel] = [];
      }

      // Save progress after each country
      try {
        mkdirSync(pathDirname(outputPath), { recursive: true });
        const json = JSON.stringify(results, null, 2);
        writeFileSync(outputPath, json, 'utf8');
      } catch (e) {
        log('  Warning: failed to save progress: ' + e.message);
      }
    }

    mkdirSync(pathDirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
    log('Wrote ' + outputPath);
  } catch (err) {
    log('Fatal: ' + err.message);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
