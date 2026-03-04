#!/usr/bin/env node
/**
 * Open EAD login in a browser on EC2.
 *
 * With display (ssh -X from Mac):  node scripts/ead-manual-browse.mjs
 *   → Visible window; log in and click through.
 *
 * Without display (Tabby or no X11):  node scripts/ead-manual-browse.mjs
 *   → Runs headless, fills credentials, clicks Login, saves a screenshot so you can see the result.
 *   → Download:  scp -i key.pem ubuntu@EC2_IP:~/clearway-2/data/ead-aip/ead-manual-browse.png ./
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, mkdirSync } from 'fs';

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

const LOGIN_URL = 'https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/login/ead-basic/';
const SCREENSHOT_DIR = join(PROJECT_ROOT, 'data', 'ead-aip');
const SCREENSHOT_PATH = join(SCREENSHOT_DIR, 'ead-manual-browse.png');

async function main() {
  const forceHeadless = process.env.EAD_HEADLESS === '1' || process.env.EAD_HEADLESS === 'true';
  let hasDisplay = !!process.env.DISPLAY && !forceHeadless;
  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({
      headless: !hasDisplay,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    if (hasDisplay && /XServer|DISPLAY|has been closed/i.test(String(err && err.message))) {
      console.log('Headed launch failed (no usable display). Running headless and saving a screenshot.');
      hasDisplay = false;
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } else {
      throw err;
    }
  }

  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  if (hasDisplay) {
    console.log('Opening EAD login in browser. Use the window to log in and browse. Close the browser to exit.');
  } else {
    console.log('No DISPLAY – running headless. Will open login, fill credentials, click Login, then save a screenshot.');
  }

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const user = process.env.EAD_USER;
  let password = process.env.EAD_PASSWORD;
  if (!password && process.env.EAD_PASSWORD_ENC) {
    try {
      password = Buffer.from(process.env.EAD_PASSWORD_ENC, 'base64').toString('utf8');
    } catch (_) {}
  }
  if (user && password) {
    await page.getByLabel(/user name/i).fill(user);
    await page.getByLabel(/password/i).fill(password);
    await page.locator('input[type="submit"][value="Login"]').click();
    await page.waitForTimeout(5000);
    if (!hasDisplay) {
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
      console.log('Screenshot saved to:', SCREENSHOT_PATH);
      console.log('Download to your Mac:  scp -i your-key.pem ubuntu@YOUR_EC2_IP:~/clearway-2/data/ead-aip/ead-manual-browse.png ./');
      await browser.close();
      return;
    }
    console.log('Credentials filled and Login clicked. Use the browser window.');
  } else {
    if (!hasDisplay) {
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
      console.log('No credentials in .env. Screenshot of login page saved to:', SCREENSHOT_PATH);
      await browser.close();
      return;
    }
    console.log('No EAD_USER/EAD_PASSWORD_ENC in .env – enter credentials in the browser.');
  }

  await page.waitForTimeout(60 * 60 * 1000).catch(() => {});
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
