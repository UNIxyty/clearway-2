// The maintenance page's logos follow the theme (2026-10-28): the Clearway logo is drawn in currentColor and the
// visible Verxyl file is the dark one in light and the white one in dark. Before, the white Clearway file was inverted
// to black and Verxyl was black, so on the dark theme both were black on a dark card. Real browser, both themes, 1440
// and 390; the logo's colour is measured against the card it sits on (contrast ≥ 3, the bar for large graphics).
//   node rig/maintenance-logos-check.mjs
import { chromium } from "playwright";
const BASE = process.env.RIG_SIGNIN_URL || "http://127.0.0.1:3989";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/maintenance`, { waitUntil: "load" }); await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const lum = (c) => { const unit = /^color\(srgb/.test(c) ? 1 : 255; const v = c.replace(/^color\(srgb/, "").match(/[\d.]+/g).slice(0, 3).map((x) => { x = Number(x) / unit; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const svg = document.querySelector('svg[aria-label="Clearway"]');
    let bgEl = svg?.parentElement; let bg = "rgba(0, 0, 0, 0)";
    while (bgEl && (bg = getComputedStyle(bgEl).backgroundColor) && /rgba\(.*, 0\)$/.test(bg)) bgEl = bgEl.parentElement;
    const fg = svg ? getComputedStyle(svg).color : null;
    const ratio = fg ? (() => { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); })() : 0;
    const visible = [...document.querySelectorAll('img[alt="Verxyl"]')].filter((i) => i.getBoundingClientRect().width > 0).map((i) => i.currentSrc.replace(location.origin, ""));
    const inverted = [...document.querySelectorAll("img")].some((i) => /invert/.test(getComputedStyle(i).filter));
    return { fg, bg, ratio, visible, inverted, svgW: svg?.getBoundingClientRect().width ?? 0 };
  });
  ok(m.svgW > 0 && m.ratio >= 3, `${theme} ${width}: the Clearway logo stands out from its card`, `${m.fg} on ${m.bg} · ${m.ratio.toFixed(1)}:1`);
  ok(m.visible.length === 1 && (theme === "dark" ? /verxyl-footer-white/.test(m.visible[0]) : /verxyl-footer(@\dx)?\.png/.test(m.visible[0]) && !/white/.test(m.visible[0])), `${theme} ${width}: one Verxyl logo shows, the ${theme === "dark" ? "white" : "dark"} file`, m.visible.join(", "));
  ok(!m.inverted, `${theme} ${width}: no logo is drawn by inverting a file`);
  if (width === 1440) await page.screenshot({ path: `rig/.scratch/shots/maintenance-${theme}.png` });
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED"); process.exit(failures ? 1 : 0);
