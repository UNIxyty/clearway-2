#!/usr/bin/env node
/**
 * EAD Basic – list all AD 2 ICAO codes per country.
 * Logs in, opens AIP Library, then for each country: selects authority, opens AD part,
 * runs search (empty = all), paginates through results and extracts ICAO from each row.
 *
 * Requires: EAD_USER, EAD_PASSWORD or EAD_PASSWORD_ENC (env or .env).
 * Usage: xvfb-run -a node scripts/ead-list-icaos-by-country.mjs [--output data/ead-all-icaos.json]
 *
 * Output: JSON { "countries": { "Sweden (ES)": ["ESGG", "ESSA", ...], ... } }
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
  LO: 'Austria (LO)',
  EB: 'Belgium (EB)',
  LB: 'Bulgaria (LB)',
  LK: 'Czech Republic (LK)',
  EK: 'Denmark (EK)',
  EE: 'Estonia (EE)',
  EF: 'Finland (EF)',
  LF: 'France (LF)',
  ED: 'Germany (ED)',
  LG: 'Greece (LG)',
  LH: 'Hungary (LH)',
  EI: 'Ireland (EI)',
  LI: 'Italy (LI)',
  EV: 'Latvia (EV)',
  EY: 'Lithuania (EY)',
  EL: 'Luxembourg (EL)',
  LM: 'Malta (LM)',
  EH: 'Netherlands (EH)',
  EP: 'Poland (EP)',
  LP: 'Portugal (LP)',
  LR: 'Romania (LR)',
  LZ: 'Slovakia (LZ)',
  LJ: 'Slovenia (LJ)',
  LE: 'Spain (LE)',
  ES: 'Sweden (ES)',
  GC: 'Spain (GC)', // Canary Islands
};

function log(msg) {
  console.log('[EAD]', msg);
}

function jsfId(id) {
  return `[id="${id}"]`;
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
    : join(PROJECT_ROOT, 'data', 'ead-all-icaos-by-country.json');

  const countryLabels = [...new Set(Object.values(PREFIX_TO_COUNTRY))];
  const results = { countries: {}, scrapedAt: new Date().toISOString() };

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
      const icaos = new Set();

      try {
        const authoritySelect = page
          .locator(jsfId('mainForm:selectAuthorityCode_input'))
          .or(page.locator('select[id$="selectAuthorityCode_input"]'))
          .or(page.locator('select').filter({ has: page.getByRole('option', { name: countryLabel }) }))
          .first();
        await authoritySelect.waitFor({ state: 'visible', timeout: 15000 });
        await authoritySelect.selectOption({ label: countryLabel }).catch(() => null);
        await page.waitForTimeout(600);

        await page.evaluate((id) => {
          const el = document.querySelector(`[id="${id}"]`);
          if (el && el.tagName === 'SELECT') {
            const opt = [...el.options].find((o) => o.textContent.trim() === 'English');
            if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }
        }, 'mainForm:selectLanguage_input');
        await page.waitForTimeout(400);

        await page.evaluate((id) => {
          const el = document.querySelector(`[id="${id}"]`);
          if (el && el.tagName === 'SELECT') {
            const opt = [...el.options].find((o) => o.textContent.trim() === 'AD');
            if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }
        }, 'mainForm:selectAipPart_input');
        await page.waitForTimeout(600);

        log('  Opening Advanced Search');
        await page.getByText('Advanced Search').first().click();
        await page.waitForTimeout(800);
        await page.locator(jsfId('mainForm:documentHeader')).fill('');
        await page.getByRole('button', { name: 'Search' }).click();
        await page.waitForTimeout(2500);

        let hasMore = true;
        while (hasMore) {
          const table = page.locator('#mainForm\\:searchResults_data');
          await table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
          const rows = page.locator('#mainForm\\:searchResults_data tr');
          const rowCount = await rows.count();

          for (let i = 0; i < rowCount; i++) {
            const cells = rows.nth(i).locator('td');
            const cellCount = await cells.count();
            if (cellCount < 4) continue;
            const docHeading = await cells.nth(3).textContent().catch(() => '') || '';
            const m = docHeading.match(/\bAD\s*2\s+([A-Z0-9]{4})\b/i) || docHeading.match(/\b([A-Z][A-Z0-9]{3})\b/);
            if (m) icaos.add(m[1].toUpperCase());
            const link = rows.nth(i).locator('a.wrap-data').first();
            const linkText = await link.getAttribute('href').catch(() => '') || await link.textContent().catch(() => '') || '';
            const fm = linkText.match(/_AD_2_([A-Z0-9]{4})_/i);
            if (fm) icaos.add(fm[1].toUpperCase());
          }

          const nextBtn = page.locator('a').filter({ hasText: /Next|»|›/ }).first();
          const nextVisible = await nextBtn.isVisible().catch(() => false);
          const nextDisabled = await nextBtn.evaluate((el) => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('ui-state-disabled')).catch(() => true);
          if (!nextVisible || nextDisabled) {
            hasMore = false;
            break;
          }
          await nextBtn.click();
          await page.waitForTimeout(1500);
        }

        results.countries[countryLabel] = [...icaos].sort();
        log('  ICAOs: ' + results.countries[countryLabel].length);
      } catch (err) {
        log('  Error: ' + err.message);
        results.countries[countryLabel] = [];
      }
    }

    mkdirSync(pathDirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
    log('Wrote ' + outputPath);
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    log('Fatal: ' + err.message);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
