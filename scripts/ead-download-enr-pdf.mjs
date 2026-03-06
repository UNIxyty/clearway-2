/**
 * EAD Basic – download ENR 1.1 (English) AIP PDF for a given country.
 * Same flow as GEN: login → accept terms → AIP Library → select country,
 * but AIP Part = ENR, then find document "ENR 1.1" en and download. Shows extracted text.
 *
 * Requires: EAD_USER, EAD_PASSWORD or EAD_PASSWORD_ENC (env or .env).
 * Usage: node scripts/ead-download-enr-pdf.mjs [COUNTRY]
 *   COUNTRY = 2-letter prefix (e.g. ED) or full label (e.g. "Germany (ED)")
 *
 * Output: PDF saved to data/ead-enr/<prefix>-ENR-1.1.pdf; text printed to stdout.
 */

import { join, dirname } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
  LA: 'Albania (LA)', LO: 'Austria (LO)', EB: 'Belgium (EB)', LB: 'Bulgaria (LB)',
  LK: 'Czech Republic (LK)', EK: 'Denmark (EK)', EE: 'Estonia (EE)', EF: 'Finland (EF)',
  LF: 'France (LF)', ED: 'Germany (ED)', LG: 'Greece (LG)', LH: 'Hungary (LH)',
  EI: 'Ireland (EI)', LI: 'Italy (LI)', EV: 'Latvia (EV)', EY: 'Lithuania (EY)',
  EL: 'Luxembourg (EL)', LM: 'Malta (LM)', EH: 'Netherlands (EH)', EP: 'Poland (EP)',
  LP: 'Portugal (LP)', LR: 'Romania (LR)', LZ: 'Slovakia (LZ)', LJ: 'Slovenia (LJ)',
  LE: 'Spain (LE)', ES: 'Sweden (ES)', GC: 'Spain (GC)',
};

function log(msg) {
  console.error('[EAD ENR]', msg);
}

function jsfId(id) {
  return `[id="${id}"]`;
}

function resolveCountryLabel(arg) {
  const raw = (arg || 'ED').trim();
  if (raw.includes('(')) return raw;
  const prefix = raw.toUpperCase().slice(0, 2);
  return PREFIX_TO_COUNTRY[prefix] || `${prefix} (${prefix})`;
}

async function extractPdfText(pdfPath) {
  try {
    const { PDFParse } = await import('pdf-parse');
    const buf = readFileSync(pdfPath);
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    await parser.destroy?.();
    return typeof result?.text === 'string' ? result.text : (result?.pages && result.pages.map((p) => p.text).join('\n')) || '';
  } catch (e) {
    log('Could not extract PDF text: ' + e.message);
    return '';
  }
}

async function main() {
  const countryArg = process.argv[2] || 'ED';
  const countryLabel = resolveCountryLabel(countryArg);
  const prefix = countryLabel.includes('(') ? countryLabel.replace(/.*\((\w+)\)\s*$/, '$1') : countryArg.slice(0, 2);

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

  const outDir = join(PROJECT_ROOT, 'data', 'ead-enr');
  mkdirSync(outDir, { recursive: true });

  log(`Downloading ENR 1.1 (en) for ${countryLabel}`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByLabel(/user name/i).fill(user);
    await page.getByLabel(/password/i).fill(password);
    await page.locator('input[type="submit"][value="Login"]').click();
    await page.waitForURL(/cmscontent\.faces|eadbasic/, { timeout: 15000 });

    const termsBtn = page.locator('#acceptTCButton');
    await termsBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await termsBtn.isVisible()) {
      log('Accepting terms and conditions');
      await termsBtn.click();
      await page.waitForTimeout(500);
    }

    log('Opening AIP Library');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    let wentToAip = false;
    try {
      await page.goto(AIP_OVERVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      wentToAip = page.url().includes('aip_overview');
    } catch (_) {}
    if (!wentToAip) {
      const aipLink = page.getByRole('link', { name: /aip\s*library/i }).or(page.locator('a').filter({ hasText: /aip\s*library/i })).first();
      await aipLink.click({ timeout: 60000 });
      await page.waitForURL(/aip_overview\.faces/, { timeout: 20000 });
    }
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle').catch(() => {});

    const bodyText = await page.locator('body').textContent().catch(() => '');
    if (/Access denied|IB-101/i.test(bodyText)) {
      throw new Error('EAD returned "Access denied". Run from your PC or a non-datacenter network.');
    }

    log('Selecting country: ' + countryLabel);
    const authoritySelect = page
      .locator(jsfId('mainForm:selectAuthorityCode_input'))
      .or(page.locator('select[id$="selectAuthorityCode_input"]'))
      .or(page.locator('select').filter({ has: page.getByRole('option', { name: countryLabel }) }))
      .first();
    await authoritySelect.waitFor({ state: 'visible', timeout: 45000 });
    await authoritySelect.selectOption({ label: countryLabel });
    await page.waitForTimeout(500);

    await page.evaluate((id) => {
      const el = document.querySelector(`[id="${id}"]`);
      if (el && el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.textContent.trim() === 'English');
        if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    }, 'mainForm:selectLanguage_input');
    await page.waitForTimeout(400);

    log('Selecting AIP Part: ENR');
    await page.evaluate((id) => {
      const el = document.querySelector(`[id="${id}"]`);
      if (el && el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.textContent.trim() === 'ENR');
        if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    }, 'mainForm:selectAipPart_input');
    await page.waitForTimeout(800);

    log('Opening Advanced Search and searching for ENR 1.1');
    await page.getByText('Advanced Search').first().click();
    await page.waitForTimeout(800);
    const docHeader = page.locator(jsfId('mainForm:documentHeader')).or(page.locator('input[id$="documentHeader"]'));
    await docHeader.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await docHeader.fill('1.1');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForTimeout(2000);

    const table = page.locator('#mainForm\\:searchResults_data');
    await table.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    const rows = page.locator('#mainForm\\:searchResults_data tr');
    const rowCount = await rows.count();
    const enr11Re = /ENR\s*1\.1/i;
    const enRe = /_en\.pdf$/i;
    let pdfLink = null;
    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator('td');
      if ((await cells.count()) < 4) continue;
      const docHeading = await cells.nth(3).textContent().catch(() => '');
      if (!enr11Re.test(docHeading)) continue;
      const link = rows.nth(i).locator('a.wrap-data').first();
      if ((await link.count()) === 0) continue;
      const linkText = (await link.textContent().catch(() => '')) || '';
      if (!enRe.test(linkText)) continue;
      pdfLink = link;
      break;
    }

    if (!pdfLink || (await pdfLink.count()) === 0) {
      await docHeader.fill('');
      await page.getByRole('button', { name: 'Search' }).click();
      await page.waitForTimeout(2000);
      const rows2 = page.locator('#mainForm\\:searchResults_data tr');
      for (let i = 0; i < (await rows2.count()); i++) {
        const cells = rows2.nth(i).locator('td');
        if ((await cells.count()) < 4) continue;
        const docHeading = await cells.nth(3).textContent().catch(() => '');
        if (!enr11Re.test(docHeading)) continue;
        const link = rows2.nth(i).locator('a.wrap-data').first();
        const linkText = (await link.textContent().catch(() => '')) || '';
        if (!enRe.test(linkText)) continue;
        pdfLink = link;
        break;
      }
    }

    if (!pdfLink || (await pdfLink.count()) === 0) {
      throw new Error('No ENR 1.1 (en) document found for ' + countryLabel);
    }

    const href = await pdfLink.getAttribute('href');
    const fullUrl = href.startsWith('http') ? href : new URL(href, BASE).href;
    log('Downloading PDF: ' + fullUrl);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      pdfLink.click(),
    ]);
    const savePath = join(outDir, `${prefix}-ENR-1.1.pdf`);
    await download.saveAs(savePath);
    log('Saved: ' + savePath);

    const text = await extractPdfText(savePath);
    const txtPath = join(outDir, `${prefix}-ENR-1.1.txt`);
    if (text) {
      writeFileSync(txtPath, text, 'utf8');
      log('Text saved: ' + txtPath);
      console.log('--- ENR 1.1 content ---');
      console.log(text);
      console.log('--- end ---');
    }

    console.log(savePath);
  } catch (err) {
    log('Error: ' + err.message);
    if (process.env.DEBUG) console.error(err);
    try {
      await page.screenshot({ path: join(outDir, 'ead-enr-debug.png'), fullPage: true });
      log('Screenshot: ' + join(outDir, 'ead-enr-debug.png'));
    } catch (_) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
