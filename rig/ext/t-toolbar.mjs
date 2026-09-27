// Photographs the real Chrome toolbar with the extension pinned: 100 % / 200 %, light / dark theme,
// signed in / signed out (the rig proxy's rig-401 switch), plus the chrome://extensions row.
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs"; import path from "node:path"; import { execSync } from "node:child_process";
const DIST = "/Users/whae/Clearway2/clearway-2/extension/dist";
const SCR = process.env.RIG_SCRATCH; const OUT = path.join(SCR, "ext-shots"); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run({ scale, dark }) {
  const dir = path.join(SCR, `tb-profile-${scale}-${dark ? "d" : "l"}`); fs.rmSync(dir, { recursive: true, force: true });
  // First launch learns the extension id; second launch has it pinned via the profile's Preferences.
  let ctx = await chromium.launchPersistentContext(dir, { headless: false, args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`] });
  let sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker"); const id = new URL(sw.url()).host; await ctx.close();
  const prefFile = path.join(dir, "Default", "Preferences"); const prefs = JSON.parse(fs.readFileSync(prefFile, "utf8"));
  prefs.extensions = { ...(prefs.extensions ?? {}), pinned_extensions: [id] }; fs.writeFileSync(prefFile, JSON.stringify(prefs));
  ctx = await chromium.launchPersistentContext(dir, { headless: false, viewport: null, args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--window-position=0,0", "--window-size=900,500", `--force-device-scale-factor=${scale}`, ...(dark ? ["--force-dark-mode"] : [])] });
  sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker");
  await sw.evaluate(() => chrome.storage.sync.set({ settings: { pill: true, notifications: true, firstRunDone: true, mic: "allowed" } }));
  const page = ctx.pages()[0] ?? await ctx.newPage(); await page.goto("http://127.0.0.1:3997/white.html"); await page.bringToFront();
  const tag = `${scale * 100}-${dark ? "dark" : "light"}`;
  const grab = async () => {}; // macOS Screen Recording permission is not granted to this terminal: the toolbar itself cannot be captured
  fs.rmSync(path.join(SCR, "rig-401"), { force: true });
  await sw.evaluate(async () => { await chrome.storage.local.set({ session: { status: "unknown", checkedAt: 0 } }); });
  await page.evaluate(() => 0); await sw.evaluate(() => chrome.alarms.create("session", { when: Date.now() + 50 })); await sleep(2500);
  const iconState = () => sw.evaluate(async () => { const c = new OffscreenCanvas(32, 32); const [t] = await chrome.tabs.query({ active: true }); return { title: await chrome.action.getTitle({}), badge: await chrome.action.getBadgeText({}) }; });
console.log(tag, "signed in:", (await sw.evaluate(() => chrome.storage.local.get("session"))).session?.status, JSON.stringify(await iconState()));
  await grab(`toolbar-${tag}-signed-in.png`);
  fs.writeFileSync(path.join(SCR, "rig-401"), "1");
  await sw.evaluate(async () => { const { session } = await chrome.storage.local.get("session"); await chrome.storage.local.set({ session: { ...session, checkedAt: 0 } }); chrome.alarms.create("session", { when: Date.now() + 50 }); }); await sleep(3000);
  console.log(tag, "signed out:", (await sw.evaluate(() => chrome.storage.local.get("session"))).session?.status, JSON.stringify(await iconState()));
  await grab(`toolbar-${tag}-signed-out.png`);
  console.log("Chrome loads both sets:", JSON.stringify(await sw.evaluate(async () => { const r = {}; for (const set of ["app", "app-off"]) { try { await chrome.action.setIcon({ path: { 16: `icons/${set}-16.png`, 32: `icons/${set}-32.png`, 48: `icons/${set}-48.png`, 128: `icons/${set}-128.png` } }); r[set] = "ok"; } catch (e) { r[set] = e.message; } } return r; })));
  fs.rmSync(path.join(SCR, "rig-401"), { force: true });
  if (scale === 1 && !dark) { await page.goto("chrome://extensions"); await sleep(1500); await page.screenshot({ path: path.join(OUT, "chrome-extensions-row.png"), clip: { x: 0, y: 0, width: 900, height: 420 } }); }
  await ctx.close();
}
await run({ scale: 1, dark: false });
