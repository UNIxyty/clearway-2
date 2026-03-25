#!/usr/bin/env node
/**
 * EAD Basic - download one AD AIP PDF per country (one airport file each).
 *
 * Usage:
 *   node scripts/ead-download-one-ad-per-country.mjs
 *   node scripts/ead-download-one-ad-per-country.mjs --max-countries 5 --headful
 *   node scripts/ead-download-one-ad-per-country.mjs --output-dir data/ead-aip-sample
 *   node scripts/ead-download-one-ad-per-country.mjs --dump-authorities data/ead-aip-authority-prefixes-portal.json
 *
 * Requires:
 *   EAD_USER and EAD_PASSWORD (or EAD_PASSWORD_ENC) in environment or .env
 */

import { join, dirname } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  argValueFromArgv,
  hasFlagInArgv,
  isAd2Heading,
  isAd2DocumentName,
  isAd2AirportDocumentName,
  isAd2SectionZeroBundle,
  isPreferredAd2AerodromeFile,
  extractIcaoFromAd2Filename,
  icaoPrefixFromAuthorityLabel,
} from './ead-download-one-ad-per-country-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const BASE = 'https://www.ead.eurocontrol.int';
const LOGIN_URL = BASE + '/cms-eadbasic/opencms/en/login/ead-basic/';
const AIP_OVERVIEW_URL = BASE + '/fwf-eadbasic/restricted/user/aip/aip_overview.faces';

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

function log(msg) {
  console.log('[EAD]', msg);
}

function sanitizePathPart(v) {
  return String(v || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function loadManifest(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Score rows so we download a real aerodrome PDF, not AD 2 section 0 / ENRT stubs.
 * Higher = better. -1 = skip.
 */
function ad2RowMatchScore(combinedName, headingCol3, headingCol4) {
  if (isAd2SectionZeroBundle(combinedName)) return -1;
  if (isPreferredAd2AerodromeFile(combinedName)) return 4;
  if (isAd2AirportDocumentName(combinedName)) return 2;
  if (isAd2DocumentName(combinedName)) return 1;
  if (isAd2Heading(headingCol3) || isAd2Heading(headingCol4)) return 0;
  return -1;
}

async function ensureAipOverviewPage(page, logFn) {
  const url = page.url();
  if (!url.includes('aip_overview.faces')) {
    logFn('Recovering: opening AIP Library overview');
    await page.goto(AIP_OVERVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1000);
  }
  const sel = page.locator('select[id$="selectAuthorityCode_input"]').first();
  await sel.waitFor({ state: 'visible', timeout: 45000 });
  return sel;
}

async function setLanguageAndAipPart(page) {
  const lang = page.locator('select[id$="selectLanguage_input"]').first();
  await lang.waitFor({ state: 'attached', timeout: 20000 });
  try {
    await lang.selectOption({ label: 'English' });
  } catch (_) {
    const count = await lang.locator('option').count();
    for (let i = 0; i < count; i++) {
      const t = ((await lang.locator('option').nth(i).textContent()) || '').trim();
      if (/^English$/i.test(t)) {
        const v = await lang.locator('option').nth(i).getAttribute('value');
        if (v) await lang.selectOption(v);
        break;
      }
    }
  }
  await page.waitForTimeout(400);

  const aip = page.locator('select[id$="selectAipPart_input"]').first();
  await aip.waitFor({ state: 'attached', timeout: 20000 });
  try {
    await aip.selectOption({ label: 'AD' });
  } catch (_) {
    const count = await aip.locator('option').count();
    for (let i = 0; i < count; i++) {
      const t = ((await aip.locator('option').nth(i).textContent()) || '').trim();
      if (t === 'AD') {
        const v = await aip.locator('option').nth(i).getAttribute('value');
        if (v) await aip.selectOption(v);
        break;
      }
    }
  }
  await page.waitForTimeout(700);
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

  const outDir = argValueFromArgv(process.argv, '--output-dir', join(PROJECT_ROOT, 'data', 'ead-aip-one-per-country'));
  const manifestPath = join(outDir, 'manifest.json');
  const maxCountriesRaw = argValueFromArgv(process.argv, '--max-countries', '');
  const maxCountries = maxCountriesRaw ? Number(maxCountriesRaw) : 0;
  const headful = hasFlagInArgv(process.argv, '--headful');
  const resume = !hasFlagInArgv(process.argv, '--no-resume');
  const dumpAuthoritiesPath = argValueFromArgv(
    process.argv,
    '--dump-authorities',
    ''
  );

  mkdirSync(outDir, { recursive: true });

  const existingManifest = resume ? loadManifest(manifestPath) : null;
  const downloadedByLabel = new Set(
    Array.isArray(existingManifest?.results)
      ? existingManifest.results.filter((r) => r.status === 'downloaded').map((r) => r.countryLabel)
      : []
  );

  const runManifest = {
    generatedAt: new Date().toISOString(),
    outputDir: outDir,
    options: { maxCountries, headful, resume },
    results: [],
  };

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: !headful,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    log('Opening login page');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByLabel(/user name/i).fill(user);
    await page.getByLabel(/password/i).fill(password);
    await page.locator('input[type="submit"][value="Login"]').click();
    await page.waitForURL(/cmscontent\.faces|eadbasic/, { timeout: 20000 });

    const termsBtn = page.locator('#acceptTCButton');
    await termsBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await termsBtn.isVisible()) {
      log('Accepting terms');
      await termsBtn.click();
      await page.waitForTimeout(600);
    }

    log('Opening AIP Library');
    try {
      await page.goto(AIP_OVERVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (_) {}
    if (!page.url().includes('aip_overview')) {
      const aipLink = page.getByRole('link', { name: /aip\s*library/i }).or(page.locator('a').filter({ hasText: /aip\s*library/i })).first();
      await aipLink.click({ timeout: 60000 });
      await page.waitForURL(/aip_overview\.faces/, { timeout: 20000 });
    }
    await page.waitForTimeout(1200);

    const bodyText = await page.locator('body').textContent().catch(() => '');
    if (/Access denied|IB-101/i.test(bodyText)) {
      throw new Error('EAD returned Access denied. Run locally from a normal desktop network (not datacenter IP).');
    }

    let authoritySelect = await ensureAipOverviewPage(page, log);

    const countryOptions = await authoritySelect.evaluate((el) => {
      return [...el.options]
        .map((o) => ({ value: o.value, label: (o.textContent || '').trim() }))
        .filter((o) => o.value && o.label && !/^Select/i.test(o.label));
    });

    if (!countryOptions.length) {
      throw new Error('No country options found in authority dropdown.');
    }

    if (dumpAuthoritiesPath) {
      const authorities = countryOptions.map((c) => ({
        label: c.label,
        value: c.value,
        icaoPrefix: icaoPrefixFromAuthorityLabel(c.label),
      }));
      const payload = {
        generatedAt: new Date().toISOString(),
        source: 'EAD AIP Library authority dropdown',
        count: authorities.length,
        authorities,
      };
      mkdirSync(dirname(dumpAuthoritiesPath), { recursive: true });
      writeFileSync(dumpAuthoritiesPath, JSON.stringify(payload, null, 2), 'utf8');
      log(`Wrote ${authorities.length} authorities to ${dumpAuthoritiesPath}`);
      return;
    }

    let selectedCountries = countryOptions;
    if (maxCountries > 0) selectedCountries = selectedCountries.slice(0, maxCountries);
    log(`Countries available: ${countryOptions.length}. Running: ${selectedCountries.length}.`);

    async function openAdvancedSearchAndRun() {
      const ADV_ATTEMPTS = 6;
      for (let attempt = 0; attempt < ADV_ATTEMPTS; attempt++) {
        try {
          const adv = page.getByText('Advanced Search').first();
          await adv.scrollIntoViewIfNeeded().catch(() => {});
          await adv.click({ timeout: 15000 });
          await page.waitForTimeout(700);

          const input = page
            .locator('[id="mainForm:documentHeader"]')
            .or(page.locator('input[id*="documentHeader"]'))
            .first();
          await input.waitFor({ state: 'visible', timeout: 15000 });
          await input.click({ timeout: 5000 }).catch(() => {});
          await input.fill('AD 2', { timeout: 5000 });

          await page.getByRole('button', { name: 'Search' }).click();
          await page.waitForTimeout(1800);
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          return;
        } catch (_) {
          await page.getByText('Simple Search').first().click().catch(() => {});
          await page.waitForTimeout(600);
        }
      }
      throw new Error('Advanced Search input did not become available after retries.');
    }

    for (const country of selectedCountries) {
      if (downloadedByLabel.has(country.label)) {
        log(`Skipping already downloaded country: ${country.label}`);
        runManifest.results.push({
          countryLabel: country.label,
          countryValue: country.value,
          status: 'skipped_already_downloaded',
        });
        continue;
      }

      log(`Country: ${country.label}`);
      const rowResult = {
        countryLabel: country.label,
        countryValue: country.value,
        icaoPrefix: icaoPrefixFromAuthorityLabel(country.label),
        resolvedIcao: null,
        status: 'failed',
        savedPath: null,
        sourceFilename: null,
        error: null,
      };

      try {
        authoritySelect = await ensureAipOverviewPage(page, log);
        await authoritySelect.selectOption({ value: country.value });
        await page.waitForTimeout(1200);
        await page.waitForLoadState('load').catch(() => {});

        await setLanguageAndAipPart(page);

        await openAdvancedSearchAndRun();

        const table = page.locator('#mainForm\\:searchResults_data');
        await table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

        const MAX_PAGES = 10;
        let linkToDownload = null;

        for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
          const rows = page.locator('#mainForm\\:searchResults_data tr');
          const rowCount = await rows.count();

          if (!rowCount && pageNum === 0) {
            rowResult.status = 'no_results';
            break;
          }

          let bestScore = -1;
          let bestLink = null;

          for (let i = 0; i < rowCount; i++) {
            const row = rows.nth(i);
            const cells = row.locator('td');
            const cellCount = await cells.count();
            if (cellCount < 2) continue;

            const headingCol3 = cellCount > 3 ? (((await cells.nth(3).textContent().catch(() => '')) || '').trim()) : '';
            const headingCol4 = cellCount > 4 ? (((await cells.nth(4).textContent().catch(() => '')) || '').trim()) : '';
            const link = row.locator('a.wrap-data').first();
            if ((await link.count()) === 0) continue;

            const linkText = ((await link.textContent().catch(() => '')) || '').trim();
            const linkHref = ((await link.getAttribute('href').catch(() => '')) || '').trim();
            const combinedName = `${linkText} ${linkHref}`;

            const score = ad2RowMatchScore(combinedName, headingCol3, headingCol4);
            if (score > bestScore) {
              bestScore = score;
              bestLink = link;
            }
          }

          if (bestScore >= 0 && bestLink) {
            linkToDownload = bestLink;
            break;
          }

          const nextBtn = page.locator('.ui-paginator-next:not(.ui-state-disabled)').first();
          if ((await nextBtn.count()) === 0) break;
          await nextBtn.click();
          await page.waitForTimeout(800);
          await table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        }

        if (!linkToDownload) {
          if (rowResult.status !== 'no_results') rowResult.status = 'no_ad2_results';
          runManifest.results.push(rowResult);
          writeFileSync(manifestPath, JSON.stringify(runManifest, null, 2), 'utf8');
          continue;
        }

        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 25000 }),
          linkToDownload.click(),
        ]);

        const sourceFilename = sanitizePathPart(download.suggestedFilename() || 'aip.pdf');
        const countryDir = join(outDir, sanitizePathPart(country.label));
        mkdirSync(countryDir, { recursive: true });
        const savePath = join(countryDir, sourceFilename);
        await download.saveAs(savePath);

        rowResult.status = 'downloaded';
        rowResult.savedPath = savePath;
        rowResult.sourceFilename = sourceFilename;
        rowResult.resolvedIcao = extractIcaoFromAd2Filename(sourceFilename);
        runManifest.results.push(rowResult);
        writeFileSync(manifestPath, JSON.stringify(runManifest, null, 2), 'utf8');
        log(`Saved: ${savePath}`);
      } catch (err) {
        rowResult.error = err?.message || String(err);
        runManifest.results.push(rowResult);
        writeFileSync(manifestPath, JSON.stringify(runManifest, null, 2), 'utf8');
        log(`Error for ${country.label}: ${rowResult.error}`);
      }
    }

    const downloadedCount = runManifest.results.filter((r) => r.status === 'downloaded').length;
    const failedCount = runManifest.results.filter((r) => r.status === 'failed').length;
    const noResultsCount = runManifest.results.filter((r) => r.status === 'no_results').length;
    const skippedCount = runManifest.results.filter((r) => r.status === 'skipped_already_downloaded').length;

    log(
      `Done. downloaded=${downloadedCount}, failed=${failedCount}, no_results=${noResultsCount}, skipped=${skippedCount}.`
    );
    log(`Manifest: ${manifestPath}`);
  } catch (err) {
    log(`Fatal: ${err?.message || String(err)}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
