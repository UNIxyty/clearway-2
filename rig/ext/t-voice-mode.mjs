import { launch, sleep, swEval, FIX, S } from "./harness.mjs";
const API = "http://127.0.0.1:3999/agent/api"; const H = { "content-type": "application/json", "x-clearway-client": "console" };
const mode = process.argv[2] || "text";
await fetch(`${API}/settings/me`, { method: "PATCH", headers: H, body: JSON.stringify({ replyMode: mode }) });
const { context, sw } = await launch({ fresh: true, profile: "ext-profile-vm", audioFile: `${S}/${process.argv[3] || "voice-q2.wav"}` });
sw.on("console", (m) => console.log("SW:", m.text().slice(0, 160)));
await sleep(1500);
await swEval(sw, () => chrome.storage.sync.set({ settings: { pill: true, notifications: true, firstRunDone: true, mic: "allowed" } }));
const site = await context.newPage(); await site.goto(`${FIX}/white.html`, { waitUntil: "load" }); await sleep(800);
// wait until the worker has a signed-in session (its own poll)
for (let i = 0; i < 20; i++) { const s = (await swEval(sw, () => chrome.storage.local.get("session"))).session; if (s?.status === "signed-in") break; await sleep(500); }
console.log("session replyMode:", (await swEval(sw, () => chrome.storage.local.get("session"))).session?.replyMode);
await swEval(sw, async () => { await chrome.storage.local.remove(["voiceTrace", "voiceAnswer", "voice"]); const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); chrome.commands.onCommand.dispatch("voice-toggle", t); });
let final = null;
for (let i = 0; i < 150; i++) { await sleep(500); if (i === 16) await swEval(sw, async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); chrome.commands.onCommand.dispatch("voice-toggle", t); }); const v = await swEval(sw, () => chrome.storage.local.get(["voice", "voiceAnswer", "voiceTrace"])); if (v.voice?.phase === "answer" || v.voice?.phase === "error" || (i > 6 && !v.voice)) { final = v; break; } }
console.log(`${mode}: phase ${final?.voice?.phase ?? "gone"} · speaking ${final?.voiceAnswer?.speaking} · duration ${final?.voiceAnswer?.duration} · needsPanel ${final?.voiceAnswer?.needsPanel} · text ${(final?.voiceAnswer?.text ?? "").slice(0, 80)}`);
console.log("trace:", JSON.stringify(final?.voiceTrace ?? []));
await sleep(1500); await site.screenshot({ path: `${S}/ext-shots/replymode-${mode}.png` });
await context.close();
