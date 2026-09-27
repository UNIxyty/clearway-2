// Composite of the toolbar icon as Chrome draws it: a 16 dp icon in a 28 dp button, fed the 16 px PNG at 100 %
// and the 32 px PNG at 200 % (rendered here with deviceScaleFactor 2, so the 32 px file maps pixel-for-pixel).
// Used because the real browser toolbar cannot be screen-captured without macOS Screen Recording permission.
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs";
const I = "/Users/whae/Clearway2/clearway-2/extension/dist/icons", out = process.argv[2];
const png = (f) => `data:image/png;base64,${fs.readFileSync(`${I}/${f}`).toString("base64")}`;
const THEMES = [{ name: "Light theme", bar: "#ffffff", omni: "#f1f3f4", fg: "#5f6368" }, { name: "Dark theme", bar: "#35363a", omni: "#202124", fg: "#9aa0a6" }];
const bar = (t, file, state) => `<div style="display:flex;align-items:center;gap:8px;background:${t.bar};padding:6px 10px;border-radius:0">
  <div style="flex:1;height:28px;border-radius:14px;background:${t.omni};color:${t.fg};font:13px system-ui;display:flex;align-items:center;padding:0 12px">127.0.0.1:3997/white.html</div>
  <div title="${state}" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center"><img src="${png(file)}" style="width:16px;height:16px"></div>
  <div style="width:16px;height:16px;border:2px solid ${t.fg};border-radius:3px;opacity:.7"></div></div>`;
const html = (scale) => `<body style="margin:0;font:600 11px system-ui;background:#e8eaed">${THEMES.map((t) => ["in", "out"].map((st) => `<div style="padding:4px 10px;color:#3c4043">${t.name} · signed ${st} · ${scale * 100}% (uses app${st === "out" ? "-off" : ""}-${16 * scale}.png)</div>${bar(t, `app${st === "out" ? "-off" : ""}-${16 * scale}.png`, st)}`).join("")).join("")}</body>`;
const b = await chromium.launch();
for (const scale of [1, 2]) { const p = await b.newPage({ viewport: { width: 420, height: 100 }, deviceScaleFactor: scale }); await p.setContent(html(scale)); await p.screenshot({ path: `${out}/toolbar-composite-${scale * 100}.png`, fullPage: true }); await p.close(); }
await b.close();
