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
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  asecnaAd2AirportBasename,
  createAsecnaFetch,
  htmlUrlToPdfUrl,
  parseAsecnaCli,
  resolveAsecnaHtmlUrl,
} from './asecna/asecna-eaip-http.mjs';

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
const ASECNA_JSON_PATH = join(PROJECT_ROOT, 'data', 'asecna-airports.json');
const EAD_COUNTRY_ICAOS_PATH = join(PROJECT_ROOT, 'data', 'ead-country-icaos.json');

// ICAO prefix (first 2 letters) → EAD authority label, e.g. EV → "Latvia (EV)"
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

// ICAO-level overrides when a shared prefix belongs to a different authority.
// Keep prefix EK mapped to Denmark, but route EKVG to Faroe Islands only.
const ICAO_TO_COUNTRY = {
  EKVG: 'Faroe Islands (XX)',
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

function resolveCountryLabelForIcao(icao) {
  if (ICAO_TO_COUNTRY[icao]) return ICAO_TO_COUNTRY[icao];
  if (SPAIN_LE_SPECIAL_ICAOS.has(icao)) return 'Spain (LE)';
  const prefix = icao.slice(0, 2);
  return PREFIX_TO_COUNTRY[prefix] || `${prefix} (${prefix})`;
}

function log(msg) {
  console.log('[EAD]', msg);
}

function filenameFromUrl(u, fallback = 'ead-ad2.pdf') {
  try {
    const parsed = new URL(u);
    const name = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim();
    return name || fallback;
  } catch {
    return fallback;
  }
}

function normalizePdfFilename(name, icao, fallback = `${icao}_AD2.pdf`) {
  const raw = String(name || '').trim();
  let normalized = raw || fallback;
  if (normalized.toLowerCase() === 'redirect') normalized = fallback;
  if (!normalized.toLowerCase().endsWith('.pdf')) normalized = `${normalized}.pdf`;
  if (!normalized.toUpperCase().includes(icao)) normalized = `${icao}_${normalized}`;
  return normalized.replace(/[^A-Za-z0-9._-]+/g, '_');
}

async function fetchPdfBytesWithSession(context, page, fullUrl) {
  const attempts = [];
  attempts.push(fullUrl);
  try {
    const parsed = new URL(fullUrl);
    if (parsed.pathname.includes('/aip/redirect')) {
      const rawLink = parsed.searchParams.get('link');
      if (rawLink) attempts.push(new URL(rawLink, BASE).href);
    }
  } catch {}

  for (const url of attempts) {
    try {
      const resp = await context.request.get(url, { timeout: 30000 });
      if (!resp.ok()) continue;
      const bytes = Buffer.from(await resp.body());
      if (bytes.length >= 32 && bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        return bytes;
      }
    } catch {}
  }

  // Last fallback: navigate page directly to URL under same browser session.
  try {
    const nav = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (nav && nav.ok()) {
      const bytes = Buffer.from(await nav.body());
      if (bytes.length >= 32 && bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        return bytes;
      }
    }
  } catch {}

  return null;
}

function resolveChromiumExecutablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  const candidates = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  return candidates.find((p) => existsSync(p)) || null;
}

function loadAsecnaAirportCountryCodeMap() {
  try {
    if (!existsSync(ASECNA_JSON_PATH)) return { map: new Map(), menuUrl: null, menuBasename: null };
    const raw = readFileSync(ASECNA_JSON_PATH, 'utf8');
    const data = JSON.parse(raw);
    const map = new Map();
    for (const country of (data.countries || [])) {
      for (const airport of (country.airports || [])) {
        const icao = String(airport.icao || '').toUpperCase();
        const countryCode = String(airport.countryCode || country.code || '').trim().toUpperCase();
        const ad2HtmlUrl = typeof airport.ad2HtmlUrl === 'string' ? airport.ad2HtmlUrl : null;
        if (/^[A-Z0-9]{4}$/.test(icao)) {
          map.set(icao, { countryCode, ad2HtmlUrl });
        }
      }
    }
    return {
      map,
      menuUrl: typeof data.menuUrl === 'string' ? data.menuUrl : null,
      menuBasename: typeof data.menuBasename === 'string' ? data.menuBasename : null,
    };
  } catch (_) {
    return { map: new Map(), menuUrl: null, menuBasename: null };
  }
}

function rwandaHtmlToPdfUrl(htmlUrl) {
  let out = htmlUrl.replace(/#.*$/, '');
  out = out.replace('-en-GB', '');
  out = out.replace('.html', '.pdf');
  out = out.replace('/eAIP/', '/documents/PDF/');
  return out;
}

async function resolveRwandaAd2HtmlUrl(icao) {
  const frMenuUrl = 'https://aim.asecna.aero/html/eAIP/FR-menu-fr-FR.html';
  const frMenuHtml = await (await fetch(frMenuUrl)).text();
  const m =
    frMenuHtml.match(/id\s*=\s*["']AIP_RWANDA["'][\s\S]*?href\s*=\s*["']([^"']+)["']/i) ||
    frMenuHtml.match(/href\s*=\s*["']([^"']+)["'][\s\S]*?id\s*=\s*["']AIP_RWANDA["']/i);
  const rawHref = (m?.[1] || '').replace(/\\/g, '/');
  if (!rawHref) throw new Error('AIP RWANDA button link not found in FR menu.');
  const tocUrl = new URL(rawHref, 'https://aim.asecna.aero/html/eAIP/').href;
  const tocHtml = await (await fetch(tocUrl)).text();
  const fm =
    tocHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i) ||
    tocHtml.match(/<frame[^>]*src=["']([^"']*menu\.html[^"']*)["']/i);
  const menuSrc = fm?.[1];
  if (!menuSrc) throw new Error('Rwanda menu frame link not found.');
  const menuUrl = new URL(menuSrc, tocUrl).href;
  const menuHtml = await (await fetch(menuUrl)).text();
  const re = new RegExp(`href=['"]([^'"]*AD\\s*2\\s*${icao}[^'"]*\\.html#[^'"]*)['"]`, 'i');
  const ad2Match = menuHtml.match(re);
  if (!ad2Match?.[1]) throw new Error(`Rwanda AD2 link for ${icao} not found in menu.`);
  return new URL(ad2Match[1], menuUrl).href;
}

function jsfId(id) {
  return `[id="${id}"]`;
}

function isRecoverableAuthError(errorMessage, currentUrl = "") {
  const msg = String(errorMessage || "").toLowerCase();
  const url = String(currentUrl || "").toLowerCase();
  return (
    msg.includes("access denied") ||
    msg.includes("session_expired") ||
    msg.includes("login") ||
    url.includes("session_expired.faces") ||
    url.includes("/login/")
  );
}

async function main() {
  const icao = (process.argv[2] || 'EVAD').toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    console.error('Usage: EAD_USER=user EAD_PASSWORD=pass node scripts/ead-download-aip-pdf.mjs [ICAO]');
    process.exit(1);
  }

  const outDir = join(PROJECT_ROOT, 'data', 'ead-aip');
  mkdirSync(outDir, { recursive: true });

  // ASECNA path (same script, no EAD login required).
  const asecnaMeta = loadAsecnaAirportCountryCodeMap();
  const asecnaAirportMeta = asecnaMeta.map.get(icao);
  if (asecnaAirportMeta || icao.startsWith('HR')) {
    const cli = parseAsecnaCli(process.argv);
    if (cli.insecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const strictTls = cli.strictTls && !cli.insecureTls;
    const countryCode = String(asecnaAirportMeta?.countryCode || 'RW');
    const menuBasename = cli.menuBasename || asecnaMeta.menuBasename || 'FR-menu-fr-FR.html';
    const menuDirUrl = asecnaMeta.menuUrl
      ? asecnaMeta.menuUrl.replace(/[^/]+$/, '')
      : 'https://aim.asecna.aero/html/eAIP/';
    const htmlUrl = asecnaAirportMeta.ad2HtmlUrl
      ? asecnaAirportMeta.ad2HtmlUrl
      : (/^\d{2}$/.test(countryCode)
        ? resolveAsecnaHtmlUrl(asecnaAd2AirportBasename(countryCode, icao, menuBasename), menuDirUrl)
        : null);
    const resolvedHtmlUrl = htmlUrl || (icao.startsWith('HR') ? await resolveRwandaAd2HtmlUrl(icao) : null);
    if (!resolvedHtmlUrl) {
      throw new Error(`ASECNA metadata for ${icao} is missing AD2 URL/country code. Run services/asecna/asecna-sync.mjs first.`);
    }
    const pdfUrl = /\/eAIP_Rwanda\//i.test(resolvedHtmlUrl) ? rwandaHtmlToPdfUrl(resolvedHtmlUrl) : htmlUrlToPdfUrl(resolvedHtmlUrl);
    const savePath = join(outDir, `${icao}_ASECNA_AD2.pdf`);

    log(`ASECNA ICAO detected (${icao}, country code ${countryCode || 'n/a'})`);
    log('Downloading ASECNA AD 2 PDF: ' + pdfUrl);
    const http = createAsecnaFetch('EAD-SCRIPT');
    await http.downloadPdfToFile(pdfUrl, savePath, `ASECNA AD2 ${icao}`, { strictTls });
    log('Saved: ' + savePath);
    console.log(savePath);
    return;
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

  const countryLabel = resolveCountryLabelForIcao(icao);

  log(`Downloading AD 2 PDF for ICAO ${icao} (country: ${countryLabel})`);

  const { chromium } = await import('playwright');
  const maxAuthAttempts = Math.max(1, Number(process.env.EAD_AUTH_RETRY_ATTEMPTS || 2));
  let finalError = null;

  for (let attempt = 1; attempt <= maxAuthAttempts; attempt += 1) {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    const executablePath = resolveChromiumExecutablePath();
    if (executablePath) launchOptions.executablePath = executablePath;
    else if (process.env.CHROME_CHANNEL) launchOptions.channel = process.env.CHROME_CHANNEL;
    const browser = await chromium.launch(launchOptions).catch(() =>
      chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
    );
    const context = await browser.newContext({
      acceptDownloads: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    try {
      // —— Login ——
      log(`Opening login page (attempt ${attempt}/${maxAuthAttempts})`);
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

      // —— AIP Library —— try direct URL first (avoids menu link); fallback: click "AIP Library"
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
      await page.waitForTimeout(350);
      await page.locator(jsfId('mainForm:documentHeader')).fill(icao);

      // —— Search ——
      await page.getByRole('button', { name: 'Search' }).click();
      await page.locator('#mainForm\\:searchResults_data').waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(400);

      // —— Results: find row with Document Heading ~ "AD 2 <ICAO>" and prefer base AIP file (no variation number) ——
      // Paginate through results if not found on the first page (up to MAX_PAGES).
      const MAX_PAGES = 10;
      const variationRe = new RegExp(`_${icao}_\\d+_en`, 'i');
      const ad2LinkRe = new RegExp(`_AD_2_${icao}_`, 'i');
      const docHeadingCol = 4;
      const headingNorm = (s) => (s || '').trim().replace(/\s+/g, ' ');
      const isAd2Row = (s) => {
        const n = headingNorm(s);
        return n === `AD 2 ${icao}` || (n.includes('AD 2') && n.toUpperCase().includes(icao));
      };

      async function scanCurrentPage() {
        const rows = page.locator('#mainForm\\:searchResults_data tr');
        const rowCount = await rows.count();
        let found = null;
        let fallback = null;
        for (let i = 0; i < rowCount; i++) {
          const cells = rows.nth(i).locator('td');
          const cellCount = await cells.count();
          if (cellCount <= docHeadingCol) continue;
          const docHeading = await cells.nth(docHeadingCol).textContent().catch(() => '');
          if (!isAd2Row(docHeading)) continue;
          const link = rows.nth(i).locator('a.wrap-data').first();
          if ((await link.count()) === 0) continue;
          const linkText = await link.textContent().catch(() => '') || '';
          if (variationRe.test(linkText)) {
            if (!fallback) fallback = link;
            continue;
          }
          found = link;
          break;
        }
        if (!found) {
          for (let i = 0; i < rowCount; i++) {
            const link = rows.nth(i).locator('a.wrap-data').first();
            if ((await link.count()) === 0) continue;
            const linkText = await link.textContent().catch(() => '') || '';
            if (!ad2LinkRe.test(linkText)) continue;
            if (variationRe.test(linkText)) {
              if (!fallback) fallback = link;
              continue;
            }
            found = link;
            break;
          }
        }
        return { found, fallback };
      }

      const table = page.locator('#mainForm\\:searchResults_data');
      await table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

      let pdfLink = null;
      let fallbackLink = null;

      for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
        const { found, fallback } = await scanCurrentPage();
        if (found) { pdfLink = found; break; }
        if (fallback && !fallbackLink) fallbackLink = fallback;

        const nextBtn = page.locator('.ui-paginator-next:not(.ui-state-disabled)').first();
        if ((await nextBtn.count()) === 0) break;
        log(`AD 2 ${icao} not on page ${pageNum + 1}, going to next page…`);
        await nextBtn.click();
        await page.waitForTimeout(800);
        await table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      }

      if (!pdfLink || (await pdfLink.count()) === 0) {
        if (fallbackLink) {
          pdfLink = fallbackLink;
          log('Only variation file(s) found for AD 2 ' + icao + '; using first matching row.');
        } else {
          throw new Error(`AD 2 ${icao} not found in search results after paginating ${MAX_PAGES} pages. The airport may not exist in EAD for this country.`);
        }
      } else {
        log('Using base AIP file (no variation number).');
      }

      const href = await pdfLink.getAttribute('href');
      const fullUrl = href.startsWith('http') ? href : new URL(href, BASE).href;
      log('Downloading PDF: ' + fullUrl);

      let savePath = join(outDir, normalizePdfFilename(filenameFromUrl(fullUrl, `${icao}_AD2.pdf`), icao));
      try {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 20000 }),
          pdfLink.click(),
        ]);
        const filename = normalizePdfFilename(download.suggestedFilename(), icao);
        savePath = join(outDir, filename);
        await download.saveAs(savePath);
        const bytes = readFileSync(savePath);
        if (bytes.length < 32 || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
          throw new Error(`Download did not return a valid PDF: ${filename}`);
        }
      } catch (downloadErr) {
        log('Playwright download event timed out; trying authenticated direct fetch fallback');
        const bytes = await fetchPdfBytesWithSession(context, page, fullUrl);
        if (!bytes) {
          throw new Error(`Fallback PDF fetch failed or returned non-PDF: ${fullUrl}`);
        }
        writeFileSync(savePath, bytes);
      }
      log('Saved: ' + savePath);
      console.log(savePath);
      await browser.close();
      return;
    } catch (err) {
      finalError = err;
      const currentUrl = await page.url().catch(() => "");
      const errMsg = err?.message || String(err);
      const recoverable = isRecoverableAuthError(errMsg, currentUrl);
      log(`Error on attempt ${attempt}/${maxAuthAttempts}: ${errMsg}`);
      if (process.env.DEBUG) console.error(err);
      try {
        const debugPath = join(outDir, `ead-aip-debug-attempt-${attempt}.png`);
        await page.screenshot({ path: debugPath, fullPage: true });
        log('Screenshot saved to ' + debugPath + ' – check what the page looks like after login.');
        log('Page URL was: ' + currentUrl);
      } catch (_) {}
      await browser.close();
      if (recoverable && attempt < maxAuthAttempts) {
        log("Detected authentication/session issue. Re-logging and retrying...");
        continue;
      }
      break;
    }
  }

  const msg = finalError?.message || String(finalError || "Unknown EAD download error");
  log('Error: ' + msg);
  process.exit(1);
}

main();
