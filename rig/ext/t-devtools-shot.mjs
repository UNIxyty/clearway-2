// Opens Chrome's own DevTools for the side-panel page (via the remote-debugging port) and screenshots its Console.
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs"; import path from "node:path";
const DIST = "/Users/whae/Clearway2/clearway-2/extension/dist", S = process.env.RIG_SCRATCH;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = path.join(S, "devtools-profile"); fs.rmSync(dir, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(dir, { headless: false, args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--remote-debugging-port=9333", "--remote-allow-origins=*", `--use-file-for-fake-audio-capture=${S}/voice-2plus2.wav`, "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker"); const id = new URL(sw.url()).host;
await ctx.grantPermissions(["microphone"], { origin: `chrome-extension://${id}` }).catch(() => {});
await sw.evaluate(() => chrome.storage.sync.set({ settings: { pill: true, notifications: true, firstRunDone: true, mic: "allowed" } }));
const site = await ctx.newPage(); await site.goto("http://127.0.0.1:3997/white.html"); await sleep(500);
const panel = await ctx.newPage(); await panel.setViewportSize({ width: 380, height: 700 }); await panel.goto(`chrome-extension://${id}/sidepanel.html`); await sleep(2500);
// Voice first; DevTools attached afterwards replays every console message the page produced (incl. warnings).
await panel.bringToFront(); await panel.getByRole("button", { name: "Talk", exact: false }).first().click(); await sleep(4000);
await panel.getByRole("button", { name: /Send what you said|Talk/ }).first().click().catch(() => {}); await sleep(9000);
await panel.evaluate(() => console.info("console check: voice turn finished — any error or warning above would be a finding"));
const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
const t = targets.find((x) => x.url.includes("sidepanel.html"));
const dt = await ctx.newPage(); await dt.setViewportSize({ width: 1100, height: 520 });
await dt.goto(`http://127.0.0.1:9333/devtools/inspector.html?ws=127.0.0.1:9333/devtools/page/${t.id}&panel=console`); await sleep(4000);
await dt.screenshot({ path: path.join(S, "ext-shots", "sidepanel-devtools-console.png") });
await panel.screenshot({ path: path.join(S, "ext-shots", "sidepanel-after-voice.png") });
console.log("devtools opened for", t.url);
await ctx.close();
