// Fix 3: a reply-mode change in the console reaches the extension on the next turn. Fix 4: Region only where it works.
import { launch, panelPage, shot, sleep, swEval, FIX, S } from "./harness.mjs";
const API = "http://127.0.0.1:3999/agent/api"; const H = { "content-type": "application/json", "x-clearway-client": "console" };
const { context, sw, extId } = await launch({ fresh: true, profile: "ext-profile-rm", audioFile: `${S}/../../.scratch/voice-q2.wav` });
await sleep(800);
await swEval(sw, () => chrome.storage.sync.set({ settings: { pill: true, notifications: true, firstRunDone: true, mic: "allowed" } }));
const site = await context.newPage(); await site.goto(`${FIX}/white.html`, { waitUntil: "load" }); await sleep(600);
const panel = await panelPage(context, extId); await sleep(2000); // the panel keeps a port open: session refreshes go through it
const refresh = async () => { await panel.evaluate(() => { const p = chrome.runtime.connect({ name: "sidepanel" }); p.postMessage({ type: "session.refresh" }); }); await sleep(1500); };
await site.bringToFront(); await sleep(300);
const voiceTurn = async (label) => {
  await swEval(sw, async () => { await chrome.storage.local.remove(["voiceTrace", "voiceAnswer"]); const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); chrome.commands.onCommand.dispatch("voice-toggle", t); });
  let final = null;
  for (let i = 0; i < 150; i++) { await sleep(500); if (i === 16) await swEval(sw, async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); chrome.commands.onCommand.dispatch("voice-toggle", t); }); const v = await swEval(sw, () => chrome.storage.local.get(["voice", "voiceAnswer"])); if (v.voice?.phase === "answer" || v.voice?.phase === "error" || !v.voice) { final = v; break; } }
  const spoke = /voice\/speak/.test(JSON.stringify(final)) ; void spoke;
  console.log(`${label}: phase ${final?.voice?.phase ?? "gone"} · speaking ${final?.voiceAnswer?.speaking} · duration ${final?.voiceAnswer?.duration} · needsPanel ${final?.voiceAnswer?.needsPanel}`);
  await site.screenshot({ path: `${S}/ext-shots/replymode-${label}.png` });
  await swEval(sw, () => chrome.storage.local.remove("voice"));
  await swEval(sw, async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); try { await chrome.tabs.sendMessage(t.id, { type: "voicebar.state", state: "hidden" }); } catch {} });
};
let panelOpenPage = panel;
const set = async (mode) => { const r = await fetch(`${API}/settings/me`, { method: "PATCH", headers: H, body: JSON.stringify({ replyMode: mode }) }); const b = await r.json(); console.log(`console PATCH replyMode=${mode} → ${r.status} ${b.replyMode ?? JSON.stringify(b).slice(0, 80)}`); await refresh(); await site.bringToFront(); await sleep(300); };
await set("text"); await panelOpenPage.close(); await sleep(500); await voiceTurn("text");
console.log("   session.replyMode seen by the extension:", (await swEval(sw, () => chrome.storage.local.get("session"))).session?.replyMode);
panelOpenPage = await panelPage(context, extId); await sleep(1500);
const refresh2 = async () => { await panelOpenPage.evaluate(() => { const p = chrome.runtime.connect({ name: "sidepanel" }); p.postMessage({ type: "session.refresh" }); }); await sleep(1500); };
{ const r = await fetch(`${API}/settings/me`, { method: "PATCH", headers: H, body: JSON.stringify({ replyMode: "spoken" }) }); console.log(`console PATCH replyMode=spoken → ${r.status}`); await refresh2(); }
await panelOpenPage.close(); await sleep(500); await site.bringToFront(); await voiceTurn("spoken");
console.log("   session.replyMode seen by the extension:", (await swEval(sw, () => chrome.storage.local.get("session"))).session?.replyMode);
// Region button gating
const panel2 = await panelPage(context, extId); await sleep(1500); await site.bringToFront(); await sleep(300); await panel2.bringToFront(); await sleep(800);
await panel2.evaluate(() => { const p = chrome.runtime.connect({ name: "sidepanel" }); p.postMessage({ type: "session.refresh" }); }); await sleep(1500);
const panelRef = panel2;
const regionState = () => panelRef.evaluate(() => { const b = [...document.querySelectorAll("[data-tab-bar] button")].find((x) => /Region/.test(x.textContent)); return { disabled: b?.hasAttribute("disabled"), hint: document.querySelector("[data-tab-bar]")?.innerText.match(/Nothing on this page[^\n]*/)?.[0] }; });
console.log("region, panel opened without a gesture on this tab:", JSON.stringify(await regionState()));
await shot(panelRef, "region-disabled");
await swEval(sw, async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, url: "http://127.0.0.1:3997/*" }); chrome.commands.onCommand.dispatch("ask-selection", t); }); await sleep(1500);
await panelRef.evaluate(() => { const p = chrome.runtime.connect({ name: "sidepanel" }); p.postMessage({ type: "panel.action", action: "tab" }); }); await sleep(800);
console.log("region, after a gesture on this tab:", JSON.stringify(await regionState()));
await shot(panelRef, "region-enabled");
await context.close();
