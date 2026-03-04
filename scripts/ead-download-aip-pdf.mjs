/**
 * EAD Basic – download AD 2 AIP PDF for a given ICAO.
 * Runs full flow: login → accept terms → AIP Library → search by ICAO → download PDF.
 *
 * Requires: EAD_USER, EAD_PASSWORD or EAD_PASSWORD_ENC (env or .env). Use scripts/ead-encode-password.mjs to create enc.
 * Usage: node scripts/ead-download-aip-pdf.mjs [ICAO]
 *
 * Output: PDF saved to data/ead-aip/<filename>.pdf
 */

import { join, dirname } from 'path';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Load .env from project root if present (so EAD_USER/EAD_PASSWORD can live there)
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
const AIP_OVERVIEW_PATH = '/fwf-eadbasic/restricted/user/aip/aip_overview.faces';
const AIP_OVERVIEW_URL = BASE + AIP_OVERVIEW_PATH;

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

  const prefix = icao.slice(0, 2);
  const countryLabel = PREFIX_TO_COUNTRY[prefix] || `${prefix} (${prefix})`;
  const outDir = join(PROJECT_ROOT, 'data', 'ead-aip');
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

    // —— AIP Library —— try direct URL first (avoids menu link); fallback: click "AIP Library"
    log('Opening AIP Library');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    let wentToAip = false;
    try {
      await page.goto(AIP_OVERVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      wentToAip = page.url().includes('aip_overview');
    } catch (_) {}
    if (!wentToAip) {
      const aipLink = page
        .getByRole('link', { name: /aip\s*library/i })
        .or(page.locator('a').filter({ hasText: /aip\s*library/i }))
        .first();
      await aipLink.click({ timeout: 60000 });
      await page.waitForURL(/aip_overview\.faces/, { timeout: 20000 });
    }
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle').catch(() => {});

    const bodyText = await page.locator('body').textContent().catch(() => '');
    if (/Access denied|IB-101/i.test(bodyText)) {
      throw new Error(
        'EAD returned "Access denied" (often when running from a datacenter/cloud IP like EC2). Run the download script from your PC or a non-datacenter network instead, then copy data/ead-aip/*.pdf to the server for extract. See scripts/AIP-AWS-SETUP.md.'
      );
    }

    // —— Authority (country) —— JSF may render select after AJAX; id can be mainForm:... or j_idtX:... on server
    log('Selecting country: ' + countryLabel);
    const authoritySelect = page
      .locator(jsfId('mainForm:selectAuthorityCode_input'))
      .or(page.locator('select[id$="selectAuthorityCode_input"]'))
      .or(page.locator('select').filter({ has: page.getByRole('option', { name: countryLabel }) }))
      .first();
    await authoritySelect.waitFor({ state: 'visible', timeout: 45000 });
    await authoritySelect.selectOption({ label: countryLabel });
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

    // —— Results: find row with Document Heading ~ "AD 2 <ICAO>" and prefer base AIP file (no variation number) ——
    // Base: ES_AD_2_ESGG_en.pdf. Reject variation: ES_AD_2_ESGG_4_en.pdf. Match heading flexibly (spacing/format).
    const table = page.locator('#mainForm\\:searchResults_data');
    await table.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    const rows = page.locator('#mainForm\\:searchResults_data tr');
    const rowCount = await rows.count();
    const variationRe = new RegExp(`_${icao}_\\d+_en`, 'i');
    const headingNorm = (s) => (s || '').trim().replace(/\s+/g, ' ');
    const isAd2Row = (s) => {
      const n = headingNorm(s);
      return n === `AD 2 ${icao}` || (n.includes('AD 2') && n.toUpperCase().includes(icao));
    };
    let pdfLink = null;
    let fallbackLink = null;
    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator('td');
      const cellCount = await cells.count();
      if (cellCount < 4) continue;
      const docHeading = await cells.nth(3).textContent().catch(() => '');
      if (!isAd2Row(docHeading)) continue;
      const link = rows.nth(i).locator('a.wrap-data').first();
      if ((await link.count()) === 0) continue;
      const linkText = await link.textContent().catch(() => '') || '';
      if (variationRe.test(linkText)) {
        if (!fallbackLink) fallbackLink = link;
        continue;
      }
      pdfLink = link;
      break;
    }

    if (!pdfLink || (await pdfLink.count()) === 0) {
      // Fallback: pick by filename (any row with _AD_2_<ICAO> in link; prefer base over variation)
      const ad2LinkRe = new RegExp(`_AD_2_${icao}_`, 'i');
      for (let i = 0; i < rowCount; i++) {
        const link = rows.nth(i).locator('a.wrap-data').first();
        if ((await link.count()) === 0) continue;
        const linkText = await link.textContent().catch(() => '') || '';
        if (!ad2LinkRe.test(linkText)) continue;
        if (variationRe.test(linkText)) {
          if (!fallbackLink) fallbackLink = link;
          continue;
        }
        pdfLink = link;
        break;
      }
      if (!pdfLink || (await pdfLink.count()) === 0) {
        pdfLink = fallbackLink || page.locator('#mainForm\\:searchResults_data tr').first().locator('a.wrap-data').first();
        if (fallbackLink) log('Only variation file(s) found for AD 2 ' + icao + '; using first matching row.');
        else log('No row with AD 2 ' + icao + ' link; using first result row.');
      } else {
        log('Using base AIP file (no variation number).');
      }
    } else {
      log('Using base AIP file (no variation number).');
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
    try {
      const debugPath = join(outDir, 'ead-aip-debug.png');
      await page.screenshot({ path: debugPath, fullPage: true });
      log('Screenshot saved to ' + debugPath + ' – check what the page looks like after login.');
      log('Page URL was: ' + (await page.url()));
    } catch (_) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
