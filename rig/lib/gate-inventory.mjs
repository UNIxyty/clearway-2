// What the gate walk walks (2026-11-05), from the code: every portal address (each handler of every route file, and
// every page), and every wall and agent endpoint with a path made for it. rig/client-gate-check.mjs walks it on the rig;
// scripts/prod-checks/client-gate-walk.mjs walks the same list on production, from inside the portal container, which
// has no sources: so the list is also written to scripts/prod-checks/gate-inventory.json, and the rig walk fails when
// that copy is not what the code says today.
//   node rig/lib/gate-inventory.mjs --write     (rewrite the copy)
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UNGATED } from "../../lib/permissions/route-gates.mjs";
import { CLIENT_PAGES, CLIENT_APIS } from "../../lib/clients/allow.mjs";
import { codeRouteBlocks } from "../../lib/permissions/check.mjs";
import { CLIENT_READS } from "../../digital-wall/lib/client-scope.mjs";
import { SWITCH_KEYS } from "../../lib/clients/switches.mjs";

export const COPY = "scripts/prod-checks/gate-inventory.json";
const UUID = "00000000-0000-4000-8000-000000000000";

/** Every portal address: { kind: "api"|"page", method, route, file, ungated, onList } — sign-out last. */
export function portalAddresses(root = ".") {
  const docsSection = readdirSync(path.join(root, "content/docs")).filter((d) => /^\d+-admin$/.test(d))[0];
  const docsPage = readdirSync(path.join(root, `content/docs/${docsSection}`)).filter((f) => /^\d+-.+\.md$/.test(f))[0];
  // a sample value per dynamic segment, real where the page would otherwise 404 for everyone (and prove nothing)
  const SEGMENT = { "[icao]": "EGLL", "[section]": docsSection.replace(/^\d+-/, ""), "[page]": docsPage.replace(/^\d+-/, "").replace(/\.md$/, ""), "[n]": "1", "[[...tab]]": null, "[...path]": "aip/ead-pdf/RIGX.pdf" };
  const toAddress = (rel) => "/" + path.dirname(rel).replace(/^app\/?/, "").split("/").filter((x) => !/^\(.+\)$/.test(x)).map((x) => (x in SEGMENT ? SEGMENT[x] : x.startsWith("[") ? UUID : x)).filter((x) => x !== null).join("/");
  const files = []; const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === "route.ts" || n === "page.tsx") files.push(p); } };
  walk(path.join(root, "app"));
  const out = [];
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join("/");
    const route = toAddress(rel).replace(/\/$/, "") || "/";
    if (rel.endsWith("/page.tsx")) { out.push({ kind: "page", method: "GET", route, file: rel, ungated: false, onList: CLIENT_PAGES.some((e) => e.path === route) }); continue; }
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\b|^export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\s*=/gm)) {
      const method = m[1] ?? m[2];
      out.push({ kind: "api", method, route, file: rel, ungated: Boolean(UNGATED[rel]), onList: CLIENT_APIS.some((e) => e.path === route && e.methods.includes(method)) });
    }
  }
  // signing out ends the session a walk is using: it goes last
  return out.sort((a, b) => (a.route === "/auth/sign-out") - (b.route === "/auth/sign-out"));
}

// A route pattern → one concrete path that the pattern itself accepts, or null (named, never skipped silently).
function sample(route) {
  if (!route.startsWith("re:")) return route.endsWith("*") ? `${route.slice(0, -1)}rig-gate-probe` : route;
  const src = route.slice(3);
  const p = src.replace(/^\^/, "").replace(/\$$/, "").replace(/\(\?:\\\/[^()]*(?:\([^()]*\)[^()]*)*\)\?/g, "").replace(/\[0-9\]\+/g, "1").replace(/\\\//g, "/")
    .replace(/\(\[0-9a-f-\]\{36\}\)/g, UUID)
    .replace(/\(\\d\+\)|\(\\d\{1,\d+\}\)/g, "1")
    .replace(/\((?:\?:)?([a-z0-9_-]+(?:\|[a-z0-9_-]+)+)\)/gi, (_m, alts) => alts.split("|")[0])
    .replace(/\(\[\^\/\]\+\)|\(\.\+\)|\(\.\*\)|\[\^\/\]\+/g, "rigx").replace(/\(\[[a-z0-9_\-]+\]\+\)/gi, "rigx").replace(/\(\?:\/\)\?|\/\?$/g, "").replace(/\\\./g, ".");
  try { return new RegExp(src).test(p) ? p : null; } catch { return null; }
}

/** The wall's and the agent's endpoints: { name, prefix, walk: [{ method, path, clientMay, public }], unmade: [] }. */
export function serviceEndpoints(root = ".") {
  const routesOf = (files) => { const out = []; for (const b of codeRouteBlocks(files.map((f) => readFileSync(path.join(root, f), "utf8")).join("\n"))) for (const m of b.methods) out.push({ method: m, route: b.route }); return out; };
  // the wall routes the permissions inventory misses (no method test, or second in an `a || b`)
  const WALL_EXTRA = ["/api/timeline/flights", "/api/timeline/aircraft", "/api/timeline/sync-status", "/api/flights/data", "/api/limitations", "/api/users/me", "/api/geo/airports", "/api/geo/countries"].map((route) => ({ method: "GET", route }));
  // answered before the wall's session gate, on purpose (digital-wall/server.mjs › Device registration): an unpaired
  // ops-room screen has no session; it may announce itself and poll its own approval, nothing more
  const WALL_PUBLIC = new Set(["/api/device/announce", "/api/device/state", "/api/health"]);
  const defs = [
    { name: "wall", prefix: "/digital-wall", routes: [...routesOf(["digital-wall/server.mjs"]), ...WALL_EXTRA], clientMay: (m, p) => m === "GET" && p in CLIENT_READS, isPublic: (p) => WALL_PUBLIC.has(p) },
    { name: "agent", prefix: "/agent", routes: routesOf(["agent/server.mjs", "agent/lib/intake/api.mjs", "agent/lib/passengers/api.mjs"]), clientMay: (m, p) => /^\/api\/flights\/[^/]+\/passengers/.test(p), isPublic: (p) => p === "/api/health" },
  ];
  return defs.map((d) => {
    const seen = new Set(), walk = [], unmade = [];
    for (const r of d.routes) {
      const p = sample(r.route);
      if (!p) { unmade.push(`${r.method} ${r.route}`); continue; }
      const k = `${r.method} ${p}`;
      if (!seen.has(k)) { seen.add(k); walk.push({ method: r.method, path: p, clientMay: d.clientMay(r.method, p), public: d.isPublic(p) }); }
    }
    return { name: d.name, prefix: d.prefix, walk, unmade };
  });
}

// clientSwitches: every switch there is, so a production check client holds the most a client can
export const inventory = (root = ".") => ({ portal: portalAddresses(root), services: serviceEndpoints(root), clientSwitches: SWITCH_KEYS });

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--write")) {
  const inv = inventory();
  writeFileSync(COPY, JSON.stringify(inv, null, 1) + "\n");
  console.log(`${COPY}: ${inv.portal.length} portal addresses, ${inv.services.map((s) => `${s.name} ${s.walk.length}`).join(", ")}`);
}
