// Passenger manifest — the command, in the real console on the rig (rig/start.sh + rig/manifest/start.sh).
// Fake passengers only (mock Leon :3993, stub wall :3992). Screenshots go to rig/.scratch/manifest-shots/.
//   node rig/manifest/browser.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "../../node_modules/playwright/index.mjs";

const BASE = "http://127.0.0.1:3999";
const SHOTS = new URL("../.scratch/manifest-shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (cond, what) => { results.push(`${cond ? "PASS" : "FAIL"}  ${what}`); console.log(results.at(-1)); };
// Every fake passenger value the fixtures can produce — none may appear in the chat or the conversation record.
const PII = /TEST\d{5}|Testville|Sampleton|Exampleburg|Mockford|Demotown|Fakesby|\bEXAMPLE\b|\bSPECIMEN\b|PLACEHOLDER|Example|Specimen|Alice|Bruno|Carla|Dmitri|Elena|Felix|Greta/;

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${new URL("../.scratch/voice-pax-manifest.wav", import.meta.url).pathname}`] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });

// Leon links: cwy-cwy only (the rig user's own token, mock Leon).
await page.request.put(`${BASE}/agent/api/leon/links/cwy-cwy`, { data: { refreshToken: "rig-refresh-token-cwy-0001" } });
await page.goto(`${BASE}/agent/settings`, { waitUntil: "load" }); await sleep(2500);
const leonCard = page.getByRole("region", { name: "Leon access" });
await leonCard.screenshot({ path: `${SHOTS}01-settings-leon-access.png` }).catch(() => {});
ok(/cwy-cwy/.test(await leonCard.innerText().catch(() => "")), "Settings → Leon access lists the linked operator (token never shown)");
ok(!/rig-refresh-token/.test(await page.content()), "the refresh token is nowhere in the settings page");

const composer = () => page.getByRole("textbox", { name: "Message" });
const picker = () => page.locator("[data-manifest-picker]");
const pickerRows = async () => (await picker().getByRole("option").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
async function openPicker() {
  await composer().click(); await composer().fill("/manifest"); await sleep(400);
  await page.keyboard.press("Enter"); await sleep(1500);
}
await page.goto(`${BASE}/agent`, { waitUntil: "load" }); await sleep(3000);

// ── States: loading and search failed (the search route held / aborted for these two only)
await page.route("**/agent/api/tools/invoke", async (r) => { await sleep(2500); await r.continue().catch(() => {}); });
await openPicker();
ok(/Loading flights/.test(await picker().innerText()), "loading state is drawn");
await picker().screenshot({ path: `${SHOTS}02-picker-loading.png` });
await page.keyboard.press("Escape"); await page.unroute("**/agent/api/tools/invoke");
await page.route("**/agent/api/tools/invoke", (r) => r.abort().catch(() => {}));
await openPicker();
ok(/search failed/i.test(await picker().innerText()), "search-failed state is drawn, with Try again");
await picker().screenshot({ path: `${SHOTS}03-picker-failed.png` });
await page.keyboard.press("Escape"); await page.unroute("**/agent/api/tools/invoke");
ok(await picker().count() === 0, "Escape closes the picker");
consoleErrors.length = 0; // the two failures above were caused on purpose (held / aborted search)

// ── Upcoming flights with no typing, distinguishable rows
await openPicker(); await sleep(1000);
let rows = await pickerRows();
await picker().screenshot({ path: `${SHOTS}04-picker-upcoming-no-typing.png` });
ok(rows[0].startsWith("Blank form"), "first row is the blank form");
ok(rows.length >= 6, `upcoming flights listed without typing (${rows.length - 1} flights)`);
const oro = rows.filter((r) => r.includes("ORO2151"));
ok(oro.length === 2 && oro[0] !== oro[1] && oro.every((r) => /EC-OMU/.test(r) && /→/.test(r) && /\d{2}:\d{2}Z/.test(r)), `same callsign twice today, rows differ: ${oro.map((r) => r.replace(/ CWY-CWY$/, "")).join("  ≠  ")}`);
ok(!rows.some((r) => r.includes("ORO2150")), "a flight from two days ago is not in the no-typing list");
// keyboard
const sel = async () => (await picker().locator('[aria-selected="true"]').innerText()).replace(/\s+/g, " ");
await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
ok(/ORO2151|KLJ|BTI/.test(await sel()), `↓↓ moves the highlight (${(await sel()).slice(0, 40)})`);
await page.keyboard.press("ArrowUp");

// ── Search: registration, route, natural words, no matches
const search = async (q) => { const input = picker().getByRole("combobox"); await input.fill(q); await sleep(700); return pickerRows(); };
rows = await search("EC-OMU");
ok(rows.slice(1).length >= 2 && rows.slice(1).every((r) => r.includes("EC-OMU")), `registration search "EC-OMU" → ${rows.length - 1} rows, all EC-OMU`);
await picker().screenshot({ path: `${SHOTS}05-picker-search-registration.png` });
rows = await search("LIML LEBL");
ok(rows.slice(1).length >= 1 && rows.slice(1).every((r) => /LIML|LEBL/.test(r)), `route search "LIML LEBL" → ${rows.slice(1).map((r) => r.slice(0, 40)).join(" | ")}`);
await picker().screenshot({ path: `${SHOTS}06-picker-search-route.png` });
rows = await search("the Riga one this evening");
ok(rows.slice(1).length >= 1 && rows.slice(1).every((r) => /EVRA/.test(r)), `"the Riga one this evening" → ${rows.slice(1).map((r) => r.slice(0, 50)).join(" | ")}`);
await picker().screenshot({ path: `${SHOTS}07-picker-search-riga-evening.png` });
rows = await search("zzz9");
ok(/No flight matches/.test(await picker().innerText()), "no-matches state is drawn");
await picker().screenshot({ path: `${SHOTS}08-picker-no-matches.png` });

// ── Generate: KLJ7351 (warnings). Progress is shown while it builds; the PDF opens in the viewer; warnings sit above.
const chatStream = page.waitForResponse((r) => r.url().includes("/agent/api/chat") && r.request().method() === "POST", { timeout: 120_000 }).then((r) => r.text()).catch(() => "");
rows = await search("KLJ7351");
await page.keyboard.press("Enter");
let sawProgress = false;
for (let i = 0; i < 1200 && !sawProgress; i += 1) {
  await sleep(100);
  const t = await page.locator("main, body").first().innerText();
  if (/Checking your Leon access|Reading the flight from Leon|Filling the form|Laying out|Saving the file/.test(t)) { sawProgress = true; await page.screenshot({ path: `${SHOTS}09-building-progress.png` }); }
}
ok(sawProgress, "the build shows named progress steps on screen (not a blank wait)");
const streamText = await chatStream;
const steps = [...streamText.matchAll(/event: tool_progress\ndata: (.+)/g)].map((m) => JSON.parse(m[1])).filter((p) => p.name === "make_passenger_manifest").map((p) => p.step);
ok(steps.length >= 4, `the server streamed the build's steps: ${steps.join(" → ")}`);
await page.waitForSelector('[aria-label^="Document viewer · PAX-Manifest_KLJ7351"]', { timeout: 120_000 }).catch(() => {});
await sleep(2500);
const viewerOpen = await page.locator('[aria-label^="Document viewer · PAX-Manifest_KLJ7351"]').count();
ok(viewerOpen > 0, "the finished PDF opened in the document viewer by itself");
await page.screenshot({ path: `${SHOTS}10-done-viewer-and-warnings.png` });
const order = await page.evaluate(() => {
  const n = document.querySelector('[aria-label="Passenger manifest — read before sending"]');
  const f = document.querySelector('[aria-label^="Generated file PAX-Manifest"]');
  return n && f ? Boolean(n.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
});
ok(order === true, "the warnings card is ABOVE the file card");
const notice = await page.locator('[aria-label="Passenger manifest — read before sending"]').last().innerText();
await page.locator('[aria-label="Passenger manifest — read before sending"]').last().screenshot({ path: `${SHOTS}11-warnings-card.png` });
ok(/row 2 on page 1: no place of birth, passport expiry/.test(notice) && /arrival document differs/.test(notice) && /cut short/.test(notice) && /CWY_CWY/.test(notice), "missing fields, differing arrival document, truncation and the operator note are all in the chat");
ok(await page.getByRole("link", { name: /Download/ }).count() + await page.getByRole("button", { name: "Download" }).count() > 0, "a download is offered alongside");

// ── The transcript carries no passenger detail (thread DOM outside the viewer, and the stored conversation)
const threadText = await page.evaluate(() => { const v = document.querySelector('[aria-label^="Document viewer"]'); const clone = document.body.cloneNode(true); clone.querySelectorAll('[aria-label^="Document viewer"], object, iframe').forEach((e) => e.remove()); void v; return clone.innerText; });
ok(!PII.test(threadText), "no passenger name or document number anywhere in the chat");
const convs = await (await page.request.get(`${BASE}/agent/api/conversations`)).json();
const conv = await (await page.request.get(`${BASE}/agent/api/conversations/${convs.conversations?.[0]?.id}`)).json();
ok(!PII.test(JSON.stringify(conv)), "no passenger detail in the stored conversation (text, blocks, tool activity)");

// ── Zero passengers: still a document, and the agent says so plainly
await openPicker(); await search("KLJ7352"); await page.keyboard.press("Enter");
await page.waitForSelector('[aria-label^="Generated file PAX-Manifest_KLJ7352"]', { timeout: 120_000 }).catch(() => {});
await sleep(3000);
const zeroText = await page.locator('[aria-label="Passenger manifest — read before sending"]').last().innerText().catch(() => "");
ok(/0 passengers/.test(zeroText) && /lists no passengers/.test(zeroText), "a flight with no passengers still generates, and says plainly there were none");
await page.screenshot({ path: `${SHOTS}12-zero-passengers.png` });

// ── A flight the user's Leon account cannot see: refused, no document
await openPicker(); await search("BTI472"); await page.keyboard.press("Enter");
await sleep(20000);
ok(await page.locator('[aria-label^="Generated file PAX-Manifest_BTI472"]').count() === 0, "a flight Leon will not show this account produces no manifest");
await page.screenshot({ path: `${SHOTS}13-no-access.png` });

// ── Typed "pax manifest for KLJ7350" reaches the same picker, filtered (the voice path calls the same function)
await composer().fill("pax manifest for KLJ7350"); await page.keyboard.press("Enter"); await sleep(1500);
rows = await pickerRows();
ok(await picker().count() === 1 && rows.slice(1).length >= 1 && rows.slice(1).every((r) => r.includes("KLJ7350")), `typed "pax manifest for KLJ7350" opens the picker filtered → ${rows.slice(1).map((r) => r.slice(0, 40)).join(" | ")}`);
await picker().screenshot({ path: `${SHOTS}14-typed-phrase-picker.png` });
await page.keyboard.press("Escape");

// ── Voice: speak it (fake microphone plays "Pax manifest for KLJ 7350"); real speech-to-text; same picker
await page.getByRole("button", { name: "Talk", exact: true }).click(); await sleep(5500);
await page.getByRole("button", { name: /Send what you said|Talk/ }).first().click().catch(() => {}); await sleep(9000);
const voicePicker = await picker().count();
rows = voicePicker ? await pickerRows() : [];
ok(voicePicker === 1 && rows.slice(1).some((r) => r.includes("KLJ7350")), `voice reaches the same picker, filtered: ${voicePicker ? JSON.stringify(await picker().getByRole("combobox").inputValue()) : "picker not open"}`);
await page.screenshot({ path: `${SHOTS}15-voice-picker.png` });
if (voicePicker) await page.keyboard.press("Escape");

// ── Blank form from the picker's first row
await openPicker(); await page.keyboard.press("Enter");
await page.waitForSelector('[aria-label^="Generated file PAX-Manifest_blank"]', { timeout: 120_000 }).catch(() => {});
ok(await page.locator('[aria-label^="Generated file PAX-Manifest_blank"]').count() > 0, "the blank form is one keypress from the picker");
await page.screenshot({ path: `${SHOTS}16-blank-form.png` });

ok(consoleErrors.length === 0, `browser console errors: ${consoleErrors.length ? consoleErrors.join(" | ") : "none"}`);
await browser.close();
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
