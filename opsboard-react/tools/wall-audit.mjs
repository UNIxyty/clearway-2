#!/usr/bin/env node
// Wall/console screenshot + overlap audit harness.
//
//   node tools/wall-audit.mjs --out <dir> [--views desktop|all|mobile] [--base http://127.0.0.1:4173]
//
// Serves the built SPA (vite preview must already be running, or pass --base
// to any server that serves it), intercepts every /api/* call with the frozen
// fixtures from tools/fixtures.mjs, pins the clock to FROZEN_NOW, screenshots
// each view, and runs a text-overlap audit (pairwise intersection of visible
// leaf text rects). Byte-stable across runs, so before/after PNG comparison
// proves the desktop wall unchanged.
//
// Run from opsboard-react/ (playwright resolves from the repo root's
// node_modules via the workspace).

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { FROZEN_NOW_MS, buildFixtures } from "./fixtures.mjs";

const argvOf = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const OUT = path.resolve(argvOf("out", "audit-out"));
const BASE = argvOf("base", "http://127.0.0.1:4173").replace(/\/$/, "");
const VIEWS_ARG = argvOf("views", "all");

const DESKTOP_VIEWS = [
  { name: "wall-1920", url: "/timeline", width: 1920, height: 1080 },
  { name: "wall-2560", url: "/timeline", width: 2560, height: 1440 },
  { name: "console-flights-1440", url: "/console/flights", width: 1440, height: 900 },
];
const MOBILE_VIEWS = [
  { name: "wall-phone-390", url: "/timeline", width: 390, height: 844 },
  { name: "wall-phone-land-844", url: "/timeline", width: 844, height: 390 },
  { name: "wall-tablet-1024", url: "/timeline", width: 1024, height: 768 },
  { name: "console-phone-390", url: "/console/flights", width: 390, height: 844 },
  { name: "console-tablet-1024", url: "/console/flights", width: 1024, height: 768 },
  { name: "console-tablet-768", url: "/console/flights", width: 768, height: 1024 },
];
const VIEWS =
  VIEWS_ARG === "desktop" ? DESKTOP_VIEWS : VIEWS_ARG === "mobile" ? MOBILE_VIEWS : [...DESKTOP_VIEWS, ...MOBILE_VIEWS];

// Pairwise overlap of visible leaf text rects. Two texts may share a row
// (chips beside labels) — a finding is only real when boxes INTERSECT.
async function overlapAudit(page) {
  return page.evaluate(() => {
    const rects = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = (node.textContent || "").trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      rects.push({ text: text.slice(0, 40), left: r.left, top: r.top, right: r.right, bottom: r.bottom, el: el.tagName });
    }
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        // >2px intersection in both axes = a real collision, not AA fuzz.
        if (w > 2 && h > 2) overlaps.push({ a: a.text, b: b.text, w: Math.round(w), h: Math.round(h) });
      }
    }
    return { textNodes: rects.length, overlaps };
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const fixtures = buildFixtures();
  const browser = await chromium.launch();
  const report = [];

  for (const view of VIEWS) {
    const context = await browser.newContext({
      viewport: { width: view.width, height: view.height },
      deviceScaleFactor: 1,
      hasTouch: view.width < 1024,
      reducedMotion: "reduce",
    });
    await context.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const key = Object.keys(fixtures).find((k) => url.pathname.endsWith(k));
      if (key) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures[key]) });
      } else if (url.pathname.endsWith("/api/stream")) {
        // Keep SSE pending forever: connection "open", no events.
        await new Promise(() => {});
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
    });
    const page = await context.newPage();
    await page.clock.install({ time: FROZEN_NOW_MS });
    await page.goto(`${BASE}${view.url}`, { waitUntil: "domcontentloaded" });
    // Let data render; clock is frozen so the paint settles deterministically.
    await page.clock.runFor(3000);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `${view.name}.png`), fullPage: false });
    const audit = await overlapAudit(page);
    report.push({ view: view.name, width: view.width, height: view.height, ...audit });
    console.log(`${view.name}: ${audit.textNodes} text nodes, ${audit.overlaps.length} overlaps`);
    for (const o of audit.overlaps.slice(0, 8)) console.log(`   ✗ "${o.a}" × "${o.b}" (${o.w}×${o.h}px)`);
    await context.close();
  }

  await browser.close();
  writeFileSync(path.join(OUT, "overlap-report.json"), JSON.stringify(report, null, 2));
  const total = report.reduce((n, r) => n + r.overlaps.length, 0);
  console.log(`\nTotal overlaps: ${total} · report + PNGs in ${OUT}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
