// Verification rule: after any change, the side panel's console and a content script's console on a real page
// must be clean. Every console message, page error, failed request and CSP violation is printed; exit 1 if any.
import { launch, panelPage, shot, sleep, swEval, FIX, S } from "./harness.mjs";
const { context, sw, extId } = await launch({ fresh: true, profile: "ext-profile-console", audioFile: `${S}/voice-2plus2.wav` });
await sleep(1200);
await swEval(sw, () => chrome.storage.sync.set({ settings: { pill: true, notifications: true, firstRunDone: true, mic: "allowed" } }));
await fetch("http://127.0.0.1:3999/agent/api/extension/sites/add", { method: "POST", headers: { "content-type": "application/json", "x-clearway-client": "extension" }, body: JSON.stringify({ host: "127.0.0.1", includeSubdomains: false }) });
const findings = [];
const watch = (p, label) => {
  p.on("console", (m) => { if (["error", "warning"].includes(m.type()) || /Deprecation|Content Security Policy/.test(m.text())) findings.push(`${label} console.${m.type()}: ${m.text().slice(0, 300)}`); });
  p.on("pageerror", (e) => findings.push(`${label} pageerror: ${e.message.slice(0, 300)}`));
  p.on("requestfailed", (r) => findings.push(`${label} requestfailed: ${r.url().slice(0, 160)} ${r.failure()?.errorText}`));
  p.on("response", (r) => { if (r.status() >= 400) findings.push(`${label} HTTP ${r.status()}: ${r.url().slice(0, 160)}`); });
};
// A real page with a favicon, the content scripts on it.
const site = await context.newPage(); watch(site, "PAGE"); await site.goto(`${FIX}/white.html`, { waitUntil: "load" }); await sleep(600);
const panel = await panelPage(context, extId); watch(panel, "PANEL");
const cdp = await context.newCDPSession(panel); await cdp.send("Log.enable"); cdp.on("Log.entryAdded", ({ entry }) => findings.push(`PANEL log.${entry.level} [${entry.source}]: ${entry.text.slice(0, 300)}${entry.url ? ` (${entry.url.slice(0, 120)})` : ""}`));
await sleep(2500); await site.bringToFront(); await sleep(300); await panel.bringToFront(); await sleep(1200);
await panel.evaluate(() => { const p = chrome.runtime.connect({ name: "sidepanel" }); p.postMessage({ type: "session.refresh" }); }); await sleep(1500);
// Exercise the states that render the missing icons, the pill and the capture overlay on the page, and voice in the panel.
await swEval(sw, async () => { const [t] = await chrome.tabs.query({ url: "http://127.0.0.1:3997/*" }); chrome.commands.onCommand.dispatch("capture-region", t); }); await sleep(800);
await site.keyboard.press("Escape").catch(() => {});
const box = await site.locator("#p1").boundingBox(); await site.mouse.move(box.x + 2, box.y + 5); await site.mouse.down(); await site.mouse.move(box.x + 300, box.y + 20, { steps: 5 }); await site.mouse.up(); await sleep(700);
await panel.bringToFront(); await sleep(500);
await panel.getByRole("button", { name: "Talk", exact: false }).first().click().catch((e) => findings.push("TEST could not click Talk: " + e.message.split("\n")[0]));
await sleep(3500); await panel.getByRole("button", { name: /Send what you said|Talk/ }).first().click().catch(() => {}); await sleep(6000);
await shot(panel, process.argv[2] || "console-check");
console.log(findings.length ? findings.join("\n") : "CLEAN: no console errors, warnings, CSP violations or failed requests in the side panel or on the page");
await context.close();
process.exit(findings.length ? 1 : 0);
