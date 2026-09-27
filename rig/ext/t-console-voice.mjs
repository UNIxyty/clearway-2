// The console (not the extension): voice must load the worklet from /voice-worklet.js and run without warnings.
import { chromium } from "../../node_modules/playwright/index.mjs";
const S = process.env.RIG_SCRATCH; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${S}/voice-2plus2.wav`] });
const ctx = await b.newContext({ permissions: ["microphone"] }); const page = await ctx.newPage(); const found = [];
const all = [];
page.on("console", (m) => { all.push(`${m.type()}: ${m.text().slice(0, 160)}`); if (["error", "warning"].includes(m.type())) found.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
page.on("request", (r) => { if (/voice|worklet|realtime/.test(r.url())) all.push(`request: ${r.url().slice(0, 120)}`); });
page.on("response", (r) => { if (/voice-worklet/.test(r.url())) found.push(`worklet request: HTTP ${r.status()}`); });
await page.goto("http://127.0.0.1:3999/agent", { waitUntil: "load" }); await sleep(4000);
await page.screenshot({ path: `${S}/ext-shots/console-agent-page.png` });
console.log("buttons:", (await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.textContent?.trim()).filter(Boolean).slice(0, 40))).join(" | "));
await page.getByRole("button", { name: "Talk", exact: true }).click(); await sleep(4000);
await page.screenshot({ path: `${S}/ext-shots/console-voice-listening.png` });
await page.getByRole("button", { name: /Send what you said|Talk/ }).first().click().catch(() => {}); await sleep(9000);
console.log("voice unavailable card:", await page.evaluate(() => /Voice unavailable/.test(document.body.innerText)), "| transcript sent:", await page.evaluate(() => /two plus two/i.test(document.body.innerText)));
console.log(found.join("\n") || "no errors or warnings");
console.log("all:", all.slice(0, 15).join(" || "));
await b.close();
