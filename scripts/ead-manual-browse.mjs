#!/usr/bin/env node
/**
 * Open EAD login in a visible browser on EC2. Use with SSH X11 forwarding so you see the window on your Mac.
 *
 * On your Mac:  brew install --cask xquartz   (then start XQuartz or log out/in)
 *              ssh -X -i your-key.pem ubuntu@EC2_IP
 * On EC2:      cd ~/clearway-2 && node scripts/ead-manual-browse.mjs
 *
 * Browser will open; you can log in and click through manually. Close the browser window to exit.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

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

async function main() {
  if (!process.env.DISPLAY) {
    console.error('No display (DISPLAY not set). To see the browser on your Mac:');
    console.error('  1. On Mac: install XQuartz:  brew install --cask xquartz');
    console.error('  2. Quit Terminal, reopen it, start XQuartz once.');
    console.error('  3. Connect with X11 forwarding:  ssh -X -i your-key.pem ubuntu@YOUR_EC2_IP');
    console.error('  4. On EC2 run:  cd ~/clearway-2 && node scripts/ead-manual-browse.mjs');
    console.error('');
    console.error('If you run without -X, the browser has nowhere to draw. Use ssh -X from your PC.');
    process.exit(1);
  }

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  console.log('Opening EAD login in browser. Use the window to log in and browse. Close the browser to exit.');
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
    console.log('Credentials filled from .env. Click Login in the browser.');
  } else {
    console.log('No EAD_USER/EAD_PASSWORD_ENC in .env – enter credentials in the browser.');
  }

  await page.waitForTimeout(60 * 60 * 1000).catch(() => {}); // keep open up to 1 hour
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
