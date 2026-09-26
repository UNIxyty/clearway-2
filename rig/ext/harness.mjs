// Real Chrome with the unpacked extension. Exposes helpers for the test scripts.
import { chromium } from "/Users/whae/Clearway2/clearway-2/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
export const S = process.env.RIG_SCRATCH || path.join(path.dirname(new URL(import.meta.url).pathname), ".scratch");
export const DIST = "/Users/whae/Clearway2/clearway-2/extension/dist";
export const SHOTS = path.join(S, "ext-shots");
export const FIX = "http://127.0.0.1:3997";
export async function launch({ profile = "ext-profile", fresh = false, audioFile = null } = {}) {
  const dir = path.join(S, profile); if (fresh) fs.rmSync(dir, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(dir, {
    headless: false, viewport: null,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--no-first-run", "--no-default-browser-check", "--window-size=1400,900", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", ...(audioFile ? [`--use-file-for-fake-audio-capture=${audioFile}`] : [])],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  await context.grantPermissions(["microphone"], { origin: `chrome-extension://${extId}` }).catch(() => {});
  return { context, sw, extId };
}
export async function panelPage(context, extId, width = 380) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 760 });
  await page.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: "load" });
  return page;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function shot(page, name) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); return path.join(SHOTS, `${name}.png`); }
export function proxyLog() { const f = path.join(S, "rig-proxy.log"); return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []; }
export async function swEval(sw, fn, arg) { return sw.evaluate(fn, arg); }
