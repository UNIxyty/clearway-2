/**
 * EAD Basic – download AD 2 AIP PDF for a given ICAO.
 * Runs full flow: login → accept terms → AIP Library → search by ICAO → download PDF.
 *
 * Requires: EAD_USER, EAD_PASSWORD environment variables.
 * Usage: node scripts/ead-download-aip-pdf.mjs [ICAO]
 * Example: EAD_USER=ClearWay EAD_PASSWORD='...' node scripts/ead-download-aip-pdf.mjs EVAD
 *
 * Output: PDF saved to data/ead-aip/<filename>.pdf
 */

import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const BASE = 'https://www.ead.eurocontrol.int';
const LOGIN_URL = BASE + '/cms-eadbasic/opencms/en/login/ead-basic/';
const AIP_OVERVIEW_PATH = '/fwf-eadbasic/restricted/user/aip/aip_overview.faces';

// ICAO prefix (first 2 letters) → EAD authority label, e.g. EV → "Latvia (EV)"
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
};

function log(msg) {
  console.log('[EAD]', msg);
}

function jsfId(id) {
  return `[id="${id}"]`;
}

async function main() {
  const icao = (process.argv[2] || 'EVAD').toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    console.error('Usage: EAD_USER=user EAD_PASSWORD=pass node scripts/ead-download-aip-pdf.mjs [ICAO]');
    process.exit(1);
  }

  const user = process.env.EAD_USER;
  const password = process.env.EAD_PASSWORD;
  if (!user || !password) {
    console.error('Set EAD_USER and EAD_PASSWORD environment variables.');
    process.exit(1);
  }

  const prefix = icao.slice(0, 2);
  const countryLabel = PREFIX_TO_COUNTRY[prefix] || `${prefix} (${prefix})`;
  const outDir = join(process.cwd(), 'data', 'ead-aip');
  mkdirSync(outDir, { recursive: true });

  log(`Downloading AD 2 PDF for ICAO ${icao} (country: ${countryLabel})`);

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
    // —— Login ——
    log('Opening login page');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByLabel(/user name/i).fill(user);
    await page.getByLabel(/password/i).fill(password);
    await page.locator('input[type="submit"][value="Login"]').click();
    await page.waitForURL(/cmscontent\.faces|eadbasic/, { timeout: 15000 });

    // —— Accept terms ——
    const termsBtn = page.locator('#acceptTCButton');
    await termsBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await termsBtn.isVisible()) {
      log('Accepting terms and conditions');
      await termsBtn.click();
      await page.waitForTimeout(500);
    }

    // —— AIP Library ——
    log('Opening AIP Library');
    await page.getByRole('link', { name: 'AIP Library' }).click();
    await page.waitForURL(/aip_overview\.faces/, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // —— Authority (country) —— native select with id mainForm:selectAuthorityCode_input
    log('Selecting country: ' + countryLabel);
    await page.locator(jsfId('mainForm:selectAuthorityCode_input')).selectOption({ label: countryLabel });
    await page.waitForTimeout(500);

    // —— Language: English —— (hidden select; set value and trigger change)
    await page.evaluate((id) => {
      const el = document.querySelector(`[id="${id}"]`);
      if (el && el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.textContent.trim() === 'English');
        if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    }, 'mainForm:selectLanguage_input');
    await page.waitForTimeout(400);

    // —— AIP Part: AD ——
    await page.evaluate((id) => {
      const el = document.querySelector(`[id="${id}"]`);
      if (el && el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.textContent.trim() === 'AD');
        if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    }, 'mainForm:selectAipPart_input');
    await page.waitForTimeout(400);

    // —— Advanced Search + ICAO ——
    log('Opening Advanced Search and entering ICAO');
    await page.getByText('Advanced Search').first().click();
    await page.waitForTimeout(800);
    await page.locator(jsfId('mainForm:documentHeader')).fill(icao);

    // —— Search ——
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForTimeout(2000);

    // —— Results: find row with Document Heading = "AD 2 <ICAO>" (exact match) ——
    const headingText = `AD 2 ${icao}`;
    const table = page.locator('#mainForm\\:searchResults_data');
    await table.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    const rows = page.locator('#mainForm\\:searchResults_data tr');
    const rowCount = await rows.count();
    let pdfLink = null;
    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator('td');
      const cellCount = await cells.count();
      if (cellCount < 4) continue;
      const docHeading = await cells.nth(3).textContent().catch(() => '');
      if (docHeading.trim() !== headingText) continue;
      pdfLink = rows.nth(i).locator('a.wrap-data').first();
      break;
    }

    if (!pdfLink || (await pdfLink.count()) === 0) {
      log('No row with Document Heading "' + headingText + '", using first result row.');
      pdfLink = page.locator('#mainForm\\:searchResults_data tr').first().locator('a.wrap-data').first();
    }

    const href = await pdfLink.getAttribute('href');
    const fullUrl = href.startsWith('http') ? href : new URL(href, BASE).href;
    log('Downloading PDF: ' + fullUrl);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      pdfLink.click(),
    ]);
    const filename = download.suggestedFilename();
    const savePath = join(outDir, filename);
    await download.saveAs(savePath);
    log('Saved: ' + savePath);

    console.log(savePath);
  } catch (err) {
    log('Error: ' + err.message);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
