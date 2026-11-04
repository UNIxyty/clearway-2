// What a browser is GIVEN, not what it draws (2026-11-04). The staff frame drew nothing on /client and still shipped the
// staff menu in its code; "it renders correctly" said nothing about what was downloaded. This reads every document and
// script a browser actually downloads for a page — scripts loaded at run time included — and counts, per asset, the kinds
// of thing that must not be there for that visitor. Counts and kinds only, never a value: the report is safe to print.
//
// Kinds:
//   sourceMapRef      a sourceMappingURL comment            sourceMapServed  the .map answers 200 (the whole source)
//   staffRoutes       staff page or API addresses            internalHosts    the server's own network names and addresses
//   permissionNames   names from the permissions catalogue   serverEnvNames   names of server-only settings
//   operators         known operator names or ids            registrations    aircraft registrations
//   airportLists      a script holding over 200 ICAO codes   hashes           40-hex strings (commit hashes, build ids)
//   localPaths        /Users/, /home/, /root/ paths          people           developer or staff names and addresses
//   emails            any email address (not *.invalid)      jwtAnon          a JWT with role anon (public by design)
//   jwtPrivileged     a JWT with any other role — a key      comments         block comments left in the code
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);

// not glued to an expression: `${this.url}/admin/users` is the Supabase library's own API, not a page of ours
const STAFF_ROUTE = /(?<![\w.$}-])\/(?:api\/(?!client\/me\b)[a-z][\w-]*(?:\/[\w\-[\].]+)*|(?:admin|developer|agent|aip|dashboard|account|help|files|m)(?:\/[\w\-[\].]+)*|digital-wall\/(?:console|display|timeline)(?:\/[\w\-[\].]+)*)(?=["'`?#\s)/]|$)/g;
const INTERNAL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|portal|agent-service|digital-wall-(?:backend|frontend|gateway)|aip-sync|notam-sync|weather-sync|lithuania-browser|clearway-2)(?::\d+)?|164\.92\.164\.35|\b[\w-]+\.ts\.net\b|\bclearway-2:\d+/g;
const SERVER_ENV = /\b(?:SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|ANTHROPIC_API_KEY|TAVILY_API_KEY|BRAVE_SEARCH_API_KEY|ELEVENLABS_API_KEY|SYNC_SECRET|NOTAM_SYNC_SECRET|TELEGRAM_[A-Z_]+|LEON_[A-Z_]+|CNAIR_(?:USER|PASSWORD)|EAD_[A-Z_]+|AWS_[A-Z_]+|DATABASE_URL|PORTAL_INTERNAL_[A-Z_]+|INTERNAL_DEBUG_[A-Z_]+|AGENT_[A-Z_]+_SECRET|WALL_[A-Z_]+_SECRET)\b/g;
const REG = /\b(?:[A-Z]{1,2}-[A-Z]{3,4}|N\d{1,5}[A-Z]{0,2})\b/g;
const REG_NOT = new Set(["UTF-8", "ISO-8859", "SHA-256", "SHA-1", "AES-256", "X-UA", "IE-EDGE", "A-Z", "ES-ES", "EN-US", "EN-GB", "UTC-12", "X-CW", "N1", "N2"]);
const ICAO = /\b[A-Z]{4}\b/g;
const HASH = /\b[0-9a-f]{40}\b/g;
const PATHS = /(?:\/Users\/[\w.-]+|\/home\/[\w.-]+|\/root\/[\w.-]+)/g;
// people: no name is written here (the rule: no real name in code). The names looked for are read at run time from the
// repository's commit authors and this machine's user (peopleFromHere), plus any address on the company's own domain.
const PEOPLE_FIXED = /@clearway\.aero|ops@/gi;
export function peopleFromHere() {
  const names = new Set();
  try { const { execSync } = require_("node:child_process"); for (const n of execSync("git log --format=%an%n%ae", { encoding: "utf8" }).split("\n")) for (const w of n.split(/[\s@.]+/)) if (w.length >= 4 && !/^(clearway|claude|anthropic|noreply|users|local|github|com|aero)$/i.test(w)) names.add(w.toLowerCase()); } catch { /* no git */ }
  try { const os = require_("node:os"); const u = os.userInfo().username; if (u && u.length >= 3) names.add(u.toLowerCase()); } catch { /* none */ }
  return [...names];
}
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
const JWT = /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}\b/g;
const COMMENT = /\/\*(?![!@#])[\s\S]{40,}?\*\//g;

const uniq = (a) => [...new Set(a)];
function jwtRoles(text) {
  const out = { anon: 0, privileged: 0 };
  for (const t of uniq(text.match(JWT) ?? [])) {
    try { const role = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8"))?.role; if (role === "anon") out.anon += 1; else out.privileged += 1; } catch { out.privileged += 1; }
  }
  return out;
}

/**
 * @param assets   Map(url → text) — the documents and scripts a browser downloaded
 * @param context  { permissionNames, operators, allowedRoutes?: RegExp, fetchMap?, ourRoutes?: string[] (the portal's own
 *                  addresses: a route counts only if it is one of OURS — the Supabase library's "/admin/users" is not),
 *                  publicHosts?: string[] (the build's own public addresses, e.g. its Supabase URL) }
 * @returns [{ url, kind: "document"|"script", counts: { …kind: n } }] and a total per kind
 */
// the Supabase library's own defaults, the same in every app that uses it: not an address of ours
const LIBRARY_HOSTS = new Set(["http://localhost:9999"]);
const PLACEHOLDER_EMAIL = /^(you|name|someone|user)@(company|example)\./i;
export async function sweepAssets(assets, { permissionNames = [], operators = [], allowedRoutes = /^$/, fetchMap = null, ourRoutes = null, publicHosts = [], people = peopleFromHere() } = {}) {
  const PEOPLE = people.length ? new RegExp(`\\b(?:${people.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b|${PEOPLE_FIXED.source}`, "gi") : PEOPLE_FIXED;
  // ours = exactly one of the portal's addresses (a dynamic segment matches one path part)
  const isOurs = (r) => !ourRoutes || ourRoutes.some((o) => r === o || (o.includes("[") && new RegExp(`^${o.replace(/\[\[?\.\.\.[^\]]+\]\]?/g, ".+").replace(/\[[^\]]+\]/g, "[^/]+")}$`).test(r)));
  const rows = [];
  for (const [url, text] of assets) {
    const kind = /\.js(\?|$)/.test(url) ? "script" : "document";
    const counts = {};
    const put = (k, n) => { if (n) counts[k] = n; };
    put("sourceMapRef", (text.match(/sourceMappingURL=/g) ?? []).length);
    if (kind === "script" && fetchMap) { const st = await fetchMap(`${url.split("?")[0]}.map`); if (st === 200) counts.sourceMapServed = 1; }
    put("staffRoutes", uniq((text.match(STAFF_ROUTE) ?? []).filter((r) => !allowedRoutes.test(r) && isOurs(r))).length);
    put("internalHosts", uniq(text.match(INTERNAL) ?? []).filter((h) => !LIBRARY_HOSTS.has(h) && !publicHosts.some((p) => p.startsWith(h))).length);
    put("permissionNames", permissionNames.filter((p) => text.includes(`"${p}"`) || text.includes(`'${p}'`)).length);
    put("serverEnvNames", uniq(text.match(SERVER_ENV) ?? []).length);
    put("operators", operators.filter((o) => o.length >= 4 && new RegExp(`["'\`>\\s]${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`<\\s]`, "i").test(text)).length);
    put("registrations", uniq((text.match(REG) ?? []).filter((r) => !REG_NOT.has(r))).length);
    const icaos = uniq(text.match(ICAO) ?? []); if (icaos.length > 200) counts.airportLists = icaos.length;
    put("hashes", uniq(text.match(HASH) ?? []).length);
    put("localPaths", uniq(text.match(PATHS) ?? []).length);
    put("people", uniq((text.match(PEOPLE) ?? []).map((x) => x.toLowerCase())).length);
    put("emails", uniq((text.match(EMAIL) ?? []).filter((e) => !/\.invalid$|@example\.|@sentry|@[0-9]/.test(e) && !PLACEHOLDER_EMAIL.test(e))).length);
    const j = jwtRoles(text); put("jwtAnon", j.anon); put("jwtPrivileged", j.privileged);
    put("comments", (text.match(COMMENT) ?? []).length);
    rows.push({ url, kind, counts });
  }
  const total = {};
  for (const r of rows) for (const [k, n] of Object.entries(r.counts)) total[k] = (total[k] ?? 0) + n;
  return { rows, total };
}

/** The portal's own addresses, from app/: pages and APIs, dynamic segments kept as [x]. */
export function ourRoutesFrom(appDir = "app") {
  const out = [];
  (function walk(dir, url) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`, e.name.startsWith("(") ? url : `${url}/${e.name}`);
      else if (/^(page|route)\.(tsx|ts|js)$/.test(e.name) && url) out.push(url);
    }
  })(appDir, "");
  return [...new Set(out)];
}

export function permissionNamesFrom(catalogueSrc) {
  return uniq([...catalogueSrc.matchAll(/"([a-z_]+\.[a-z_.]+)"/g)].map((m) => m[1])).filter((n) => !/\.(mjs|js|ts|tsx|json|md|png|pdf|html)$/.test(n));
}

/** Every document and script a browser downloads for these pages (Playwright), with the session cookie if one is given. */
export async function downloadedAssets({ base, pages, cookie = null, waitMs = 3000 }) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const assets = new Map();
  try {
    for (const p of pages) {
      const ctx = await browser.newContext();
      if (cookie) await ctx.addCookies([{ name: cookie.split("=")[0], value: cookie.slice(cookie.indexOf("=") + 1), url: base }]);
      const page = await ctx.newPage();
      page.on("response", async (res) => {
        const u = res.url(); const type = res.request().resourceType();
        if (!u.startsWith(base) || !(type === "document" || type === "script")) return;
        try { assets.set(u, await res.text()); } catch { /* gone */ }
      });
      await page.goto(`${base}${p}`, { waitUntil: "load" }); await page.waitForTimeout(waitMs);
      await ctx.close();
    }
  } finally { await browser.close(); }
  return assets;
}

export function printSweep(label, { rows, total }) {
  console.log(`      ${label}: ${rows.length} assets (${rows.filter((r) => r.kind === "document").length} documents, ${rows.filter((r) => r.kind === "script").length} scripts)`);
  for (const r of rows) { const c = Object.entries(r.counts).map(([k, n]) => `${k} ${n}`).join(", "); if (c) console.log(`        ${r.kind === "document" ? "doc " : "js  "}${r.url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").slice(0, 70).padEnd(70)} ${c}`); }
  console.log(`        total: ${Object.entries(total).map(([k, n]) => `${k} ${n}`).join(", ") || "nothing"}`);
}
export const readCatalogue = () => fs.readFileSync("lib/permissions/catalogue.mjs", "utf8");
