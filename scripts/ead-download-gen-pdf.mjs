/**
 * EAD Basic – download GEN 1.2 (English) AIP PDF for a given country.
 * Same flow as AIP AD: login → accept terms → AIP Library → select country,
 * but AIP Part = GEN, then find document "GEN 1.2" en and download. Shows extracted text.
 *
 * Requires: EAD_USER, EAD_PASSWORD or EAD_PASSWORD_ENC (env or .env).
 * Usage: node scripts/ead-download-gen-pdf.mjs [COUNTRY]
 *   COUNTRY = 2-letter prefix (e.g. ED) or full label (e.g. "Germany (ED)")
 *
 * Output: PDF saved to data/ead-gen/<prefix>-GEN-1.2.pdf; text printed to stdout.
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
const EAD_COUNTRY_ICAOS_PATH = join(PROJECT_ROOT, 'data', 'ead-country-icaos.json');

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
  BI: 'Iceland (BI)',
  LH: 'Hungary (LH)',
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

function loadSpainLeSpecialIcaos() {
  try {
    if (!existsSync(EAD_COUNTRY_ICAOS_PATH)) return new Set();
    const raw = readFileSync(EAD_COUNTRY_ICAOS_PATH, 'utf8');
    const data = JSON.parse(raw);
    const rows = Array.isArray(data?.['Spain (LE)']) ? data['Spain (LE)'] : [];
    return new Set(
      rows
        .map((x) => String(x || '').trim().toUpperCase())
        .filter((icao) => /^(GC|GE|GS)[A-Z0-9]{2}$/.test(icao)),
    );
  } catch {
    return new Set();
  }
}

const SPAIN_LE_SPECIAL_ICAOS = loadSpainLeSpecialIcaos();

function log(msg) {
  console.error('[EAD GEN]', msg);
}

function jsfId(id) {
  return `[id="${id}"]`;
}

function resolveCountryLabel(arg) {
  const raw = (arg || 'ED').trim();
  const maybeIcao = raw.toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(maybeIcao) && SPAIN_LE_SPECIAL_ICAOS.has(maybeIcao)) {
    return 'Spain (LE)';
  }
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

  const outDir = join(PROJECT_ROOT, 'data', 'ead-gen');
  mkdirSync(outDir, { recursive: true });

  log(`Downloading GEN 1.2 (en) for ${countryLabel}`);

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
      await page.waitForTimeout(200);
    }

    // —— AIP Library ——
    log('Opening AIP Library');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(400);
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
    await page.waitForTimeout(600);

    const bodyText = await page.locator('body').textContent().catch(() => '');
    if (/Access denied|IB-101/i.test(bodyText)) {
      throw new Error(
        'EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.'
      );
    }

    // —— Authority (country) ——
    log('Selecting country: ' + countryLabel);
    const authoritySelect = page
      .locator(jsfId('mainForm:selectAuthorityCode_input'))
      .or(page.locator('select[id$="selectAuthorityCode_input"]'))
      .or(page.locator('select').filter({ has: page.getByRole('option', { name: countryLabel }) }))
      .first();
    await authoritySelect.waitFor({ state: 'visible', timeout: 45000 });
    let resolvedCountryLabel = countryLabel;
    const optionTexts = (await authoritySelect.locator('option').allTextContents())
      .map((text) => text.trim())
      .filter(Boolean);
    if (!optionTexts.includes(countryLabel)) {
      const byPrefix = optionTexts.find((text) => new RegExp(`\\(${prefix}\\)\\s*$`, 'i').test(text));
      if (byPrefix) {
        resolvedCountryLabel = byPrefix;
        log(`Country label fallback used: "${countryLabel}" -> "${resolvedCountryLabel}"`);
      }
    }
    await authoritySelect.selectOption({ label: resolvedCountryLabel });
    await page.waitForTimeout(300);

    // —— Language: English ——
    await page.evaluate((id) => {
      const el = document.querySelector(`[id="${id}"]`);
      if (el && el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.textContent.trim() === 'English');
        if (opt) {
          el.value = opt.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, 'mainForm:selectLanguage_input');
    await page.waitForTimeout(250);

    // —— AIP Part: GEN ——
    log('Selecting AIP Part: GEN');
    await page.evaluate((id) => {
      const el = document.querySelector(`[id="${id}"]`);
      if (el && el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.textContent.trim() === 'GEN');
        if (opt) {
          el.value = opt.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, 'mainForm:selectAipPart_input');
    await page.waitForTimeout(400);

    // —— Advanced Search + "1.2" then wait for results table ——
    log('Opening Advanced Search and searching for GEN 1.2');
    await page.getByText('Advanced Search').first().click();
    await page.waitForTimeout(350);
    const docHeader = page.locator(jsfId('mainForm:documentHeader')).or(page.locator('input[id$="documentHeader"]'));
    await docHeader.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await docHeader.fill('GEN 1.2');
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Search' }).click();
    // Wait for results table instead of fixed long delay
    await page.locator('#mainForm\\:searchResults_data').waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(400);

    // —— Results: find and rank GEN 1.2 candidates; avoid AD/chart artifacts ——
    // Columns: 0=Effective Date, 1=Document Name, 2=eAIP, 3=AIRAC, 4=Document Heading
    const table = page.locator('#mainForm\\:searchResults_data');
    await table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

    const docHeadingCol = 4;
    const gen12Re = /GEN\s*1\.2/i;
    const enRe = /_en\.pdf$/i;
    const badNameRe = /\bAD[_\-\s]?(2|3|4)\b|AERODROME\s*CHART|CHART\b|SID\b|STAR\b/i;
    const preferredNameRe = new RegExp(`(^|_)${prefix}_GEN[_\\-. ]?1[_\\-. ]?2`, 'i');

    async function collectCandidates() {
      const out = [];
      const rows = page.locator('#mainForm\\:searchResults_data tr');
      const rowCount = await rows.count();
      for (let i = 0; i < rowCount; i++) {
        const cells = rows.nth(i).locator('td');
        const cellCount = await cells.count();
        if (cellCount <= docHeadingCol) continue;
        const docHeading = (await cells.nth(docHeadingCol).textContent().catch(() => '')) || '';
        const link = rows.nth(i).locator('a.wrap-data').first();
        if ((await link.count()) === 0) continue;
        const linkText = ((await link.textContent().catch(() => '')) || '').trim();
        const href = await link.getAttribute('href');
        if (!href) continue;
        out.push({ docHeading, linkText, href });
      }
      return out;
    }

    function scoreCandidate(row) {
      const heading = String(row.docHeading || '');
      const name = String(row.linkText || '');
      let score = 0;
      if (gen12Re.test(heading)) score += 120;
      if (/^GEN\s*1\.2\s*$/i.test(heading.trim())) score += 80;
      if (enRe.test(name)) score += 30;
      if (preferredNameRe.test(name)) score += 60;
      if (/GEN[_\-. ]?1[_\-. ]?2/i.test(name)) score += 30;
      if (badNameRe.test(name) || badNameRe.test(heading)) score -= 300;
      return score;
    }

    let candidates = (await collectCandidates()).filter((row) => gen12Re.test(row.docHeading) && enRe.test(row.linkText));
    if (!candidates.length) {
      // Fallback: broader search if filtered query returned nothing.
      await docHeader.fill('');
      await page.getByRole('button', { name: 'Search' }).click();
      await page.locator('#mainForm\\:searchResults_data').waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(400);
      candidates = (await collectCandidates()).filter((row) => gen12Re.test(row.docHeading) && enRe.test(row.linkText));
    }

    candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    if (!candidates.length) {
      throw new Error('No GEN 1.2 (en) document found for ' + countryLabel);
    }

    const savePath = join(outDir, `${prefix}-GEN-1.2.pdf`);
    let extractedText = '';
    let selectedCandidate = null;
    for (const candidate of candidates) {
      const fullUrl = candidate.href.startsWith('http') ? candidate.href : new URL(candidate.href, BASE).href;
      log(`Trying GEN candidate: ${candidate.linkText} | ${candidate.docHeading}`);
      const res = await context.request.get(fullUrl, { timeout: 30000 });
      if (!res.ok) {
        log(`Skip candidate (HTTP ${res.status()}): ${candidate.linkText}`);
        continue;
      }
      const bytes = Buffer.from(await res.body());
      if (bytes.length < 32 || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        log(`Skip candidate (not PDF): ${candidate.linkText}`);
        continue;
      }
      writeFileSync(savePath, bytes);
      const text = await extractPdfText(savePath);
      const up = String(text || '').toUpperCase();
      const looksLikeGen = /GEN\s*1\.2/.test(up) || /ENTRY[, ]+TRANSIT[, ]+AND[, ]+DEPARTURE/.test(up);
      const looksLikeChart = /\bAD\s*4\b|\bAERODROME\s+CHART\b|\bSID\b|\bSTAR\b/.test(up);
      if (!looksLikeGen || looksLikeChart) {
        log(`Reject candidate (likely chart/non-GEN): ${candidate.linkText}`);
        continue;
      }
      extractedText = text;
      selectedCandidate = candidate;
      break;
    }

    if (!selectedCandidate) {
      throw new Error(`GEN 1.2 candidates found for ${countryLabel}, but all were rejected as non-GEN/chart artifacts.`);
    }
    log(`Selected GEN candidate: ${selectedCandidate.linkText}`);
    log('Saved: ' + savePath);

    // —— Extract and show content ——
    const txtPath = join(outDir, `${prefix}-GEN-1.2.txt`);
    if (extractedText) {
      writeFileSync(txtPath, extractedText, 'utf8');
      log('Text saved: ' + txtPath);
      console.log('--- GEN 1.2 content ---');
      console.log(extractedText);
      console.log('--- end ---');
    }

    console.log(savePath);
  } catch (err) {
    log('Error: ' + err.message);
    if (process.env.DEBUG) console.error(err);
    try {
      const debugPath = join(outDir, 'ead-gen-debug.png');
      await page.screenshot({ path: debugPath, fullPage: true });
      log('Screenshot: ' + debugPath);
      log('Page URL: ' + (await page.url()));
    } catch (_) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
