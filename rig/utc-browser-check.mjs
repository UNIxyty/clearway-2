// Every time a page shows is UTC with a Z. Opens each portal page as a Developer (who sees every page) and fails on a
// rendered time that is not: AM/PM, a slashed date (10/14/2026), "GMT", or a clock time with no Z (13:28, 13:28:00).
// The docs pages are left out: they quote emails, wall labels and settings that are not times the portal renders.
// Needs the sign-in rig (proxy :3989). rig/check-utc-times.mjs checks the source; this checks what a person sees.
//   node --env-file=.env.rig rig/utc-browser-check.mjs
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = [
  "/dashboard", "/dashboard/changelog", "/aip", "/aip/EVRA", "/aip/service-status", "/admin/airports/deleted",
  "/admin/users", "/admin/permissions", "/admin/maintenance", "/admin/service-status",
  "/admin/agent-sites", "/developer/inbox", "/developer/agent-access", "/developer/saved-replies", "/help", "/settings",
  "/account/profile", "/agent", "/agent/history", "/agent/intake", "/agent/mailbox", "/agent/activity",
  "/agent/knowledge", "/agent/settings",
];

// A clock time with no Z: HH:MM or HH:MM:SS not followed by Z, a digit or another ":".
const BAD = [
  [/\b\d{1,2}:\d{2}(?::\d{2})?\s?(AM|PM|am|pm)\b/g, "AM/PM"],
  [/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "slashed date"],
  [/\bGMT\b/g, "GMT"],
  [/(?<![\d:.])\d{2}:\d{2}(?::\d{2})?(?![\dZ:])/g, "clock time with no Z"],
];
// Text that looks like a time but is not one shown to a person as a time.
const NOT_A_TIME = [
  /\b\d{2}:\d{2}(?=\s?[–-]\s?\d{2}:\d{2}Z)/g, // "06:00–22:00Z": a range whose end carries the Z
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z/g, // an ISO instant ends in Z: UTC
];

function findBad(text) {
  let t = text;
  for (const re of NOT_A_TIME) t = t.replace(re, "··:··");
  const out = [];
  for (const [re, what] of BAD) for (const m of t.matchAll(re)) out.push(`${what}: "${t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20).replace(/\s+/g, " ")}"`);
  return out;
}

const problems = [];
let pass = 0;
const ok = (cond, label, detail = "") => { if (cond) { pass++; console.log(`PASS  ${label}`); } else { problems.push(label); console.log(`FAIL  ${label}${detail ? `  · ${detail}` : ""}`); } };

const b = await chromium.launch();
try {
  const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-dev@rig.invalid", password: "rig-access-check-only" }) })).json();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 }, timezoneId: "America/New_York", locale: "en-US" });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]);
  const page = await ctx.newPage();
  for (const p of PAGES) {
    await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await sleep(2500);
    const text = await page.locator("body").innerText().catch(() => "");
    const bad = findBad(text);
    ok(bad.length === 0, `${p}: every time shown is UTC with a Z (browser in New York time, en-US)`, bad.slice(0, 3).join(" | "));
  }
} finally {
  await b.close();
}
console.log(problems.length ? `\n${problems.length} FAILED` : `\nALL PASSED (${pass})`);
process.exit(problems.length ? 1 : 0);
