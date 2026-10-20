// The permissions check (docs/permissions.md): no write endpoint, no read endpoint that changes something, and no agent
// tool without an entry in the catalogue; no entry without its code; no action unknown; the database seed in step with
// the defaults. Every endpoint of the three services is examined, whatever its method: a GET that calls a sync
// service, writes to the database or disk, starts a process, posts elsewhere or sends a message needs an entry too
// (2026-10-14: GET /api/aip/sync started AIP syncs for any signed-in account, and this check only looked at writes). Fails the portal's image build
// (Dockerfile) and refuses the wall's and the agent's startup (they run their own part: checkCodeRoutes, checkTools).
//   node lib/permissions/check.mjs          exit 1 and the reasons, or "permissions check: ok"
//   node lib/permissions/check.mjs --code   the code only, not the SQL seed (the portal image has no docs/)
import fs from "node:fs";
import path from "node:path";
import { ACTIONS, AGENT_TOOLS, ENDPOINTS, GROUPS, MANAGE, PINNED, ROLES, endpointFor } from "./catalogue.mjs";

const WRITE = "(POST|PUT|PATCH|DELETE)";
const ANY = "(GET|HEAD|POST|PUT|PATCH|DELETE)";

/** Write routes as a service's code tests them: "/x" (===), "/x/*" (startsWith), "re:^…$" (regex). */
export function extractCodeRoutes(source) {
  const out = [];
  const re = new RegExp(String.raw`(?:(?:pathname|P)\s*===\s*"([^"]+)"|(?:pathname|P)\.startsWith\("([^"]+)"\)|(?:\(\w+\s*=\s*)?/(\^\\/.*?)/\.(?:test|exec)\((?:pathname|P)\)\)?)\s*&&\s*\(?\s*req\.method\s*===\s*"${WRITE}"`, "g");
  for (const m of source.matchAll(re)) out.push({ method: m[4], route: m[1] ?? (m[2] ? `${m[2]}*` : `re:${m[3]}`) });
  return out;
}

const key = (e) => `${e.method} ${e.route}`;

/** What makes a read endpoint change something: the database, files, a process, another service, a message. */
export const EFFECT = new RegExp([
  String.raw`\.(insert|upsert)\(`, String.raw`\.update\(\s*\{`, String.raw`\.delete\(\)`,
  String.raw`\b(writeFile|writeFileSync|appendFile|appendFileSync|mkdirSync|unlink|unlinkSync|rmSync|renameSync|copyFileSync)\(`,
  String.raw`\bfsp?\.(writeFile|appendFile|mkdir|rm|rename|unlink|copyFile)\(`, String.raw`\bfs\.promises\.(writeFile|rm|unlink|mkdir)\(`,
  String.raw`\b(spawn|execFile|execFileSync|execSync|fork)\(`,
  String.raw`method:\s*["'` + "`" + String.raw`](POST|PUT|PATCH|DELETE)["'` + "`" + String.raw`]`,
  String.raw`\b(AIP_SYNC_URL|NOTAM_SYNC_URL|WEATHER_SYNC_URL)\b`, String.raw`[?&]sync=1`,
  String.raw`\bsend(Email|Mail|Telegram)\w*\(`, String.raw`\bnotifyTelegram\w*\(`,
  String.raw`\b(?!sendJson|sendFile|sendError|sendFailure|sendText|sendHtml|writeHead|setHeader|setUTC|setTimeout|setInterval|setStatus|setAll\b|clearTimeout|clearInterval)(save|write|persist|record|upsert|insert|update|delete|remove|set|refresh|resync|run|trigger|register|clear|reset|mark|touch|bump)[A-Z]\w*\(`,
].join("|"));

/** A module's top-level functions, name → source (exported or not). */
function topLevelFunctions(src) {
  const out = new Map();
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/gm;
  const starts = [...src.matchAll(re)].map((m) => ({ name: m[1] ?? m[2], at: m.index }));
  starts.forEach((s, i) => out.set(s.name, src.slice(s.at, starts[i + 1]?.at ?? src.length)));
  return out;
}

/** Functions a portal route can call: its own file's, and those it imports from local modules (@/… or relative). */
function reachableFunctions(root, file, src, cache = new Map()) {
  const out = new Map();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](@\/[^"']+|\.{1,2}\/[^"']+)["']/g)) {
    const names = m[1].split(",").map((x) => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()).filter(Boolean);
    const base = m[2].startsWith("@/") ? path.join(root, m[2].slice(2)) : path.join(path.dirname(file), m[2]);
    const mod = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, path.join(base, "index.ts")].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!mod) continue;
    if (!cache.has(mod)) cache.set(mod, topLevelFunctions(fs.readFileSync(mod, "utf8")));
    for (const n of names) if (cache.get(mod).has(n)) out.set(n, cache.get(mod).get(n));
  }
  for (const [n, b] of topLevelFunctions(src)) out.set(n, b);
  return out;
}

/** Module constants that hold a sync service's address (`const U = process.env.AIP_SYNC_URL…`): using one is an effect. */
export function syncConstants(src) {
  return [...src.matchAll(/(?:const|let)\s+(\w+)\s*=[^;\n]*\b(AIP_SYNC_URL|NOTAM_SYNC_URL|WEATHER_SYNC_URL)\b/g)].map((m) => m[1]);
}

/** The first thing in `body` (or a function it calls, two levels down) that changes something; null when none. */
export function effectIn(body, fns = new Map(), depth = 2, seen = new Set(), consts = []) {
  const hit = body.match(EFFECT);
  if (hit) return hit[0];
  const c = consts.find((name) => new RegExp(String.raw`\b${name}\b`).test(body));
  if (c) return `${c} (a sync service's address)`;
  if (!depth) return null;
  for (const [name, b] of fns) {
    if (seen.has(name) || !new RegExp(String.raw`\b${name}\s*\(`).test(body)) continue;
    seen.add(name);
    const h = effectIn(b, fns, depth - 1, seen, consts);
    if (h) return `${name}() → ${h}`;
  }
  return null;
}

/** Every route of a Node service (wall, agent), any method: the method(s) its condition tests, its route, its body.
 * Handles `if (cond) { … }` and one-line `if (cond) return …;`, conditions with regex literals, and a method test nested
 * inside a route's block (`if (req.method === "PUT")`), which takes the route of the block around it. */
export function codeRouteBlocks(source) {
  // `const xMatch = /^…$/.exec(pathname)` or `pathname.match(/^…$/)`: a condition that tests xMatch has that route.
  const vars = new Map();
  for (const v of source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:\/(\^\\\/.*?)\/i?\.(?:exec|test)\((?:pathname|P)\)|(?:pathname|P)\.match\(\/(\^\\\/.*?)\/i?\))/g)) vars.set(v[1], `re:${v[2] ?? v[3]}`);
  const ifs = [];
  for (const m of source.matchAll(/\bif\s*\(/g)) {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < source.length; i++) { if (source[i] === "(") depth++; else if (source[i] === ")" && --depth === 0) break; }
    const cond = source.slice(m.index + m[0].length, i);
    let j = i + 1; while (/\s/.test(source[j] ?? "")) j++;
    let end;
    if (source[j] === "{") { let d = 0, k = j; for (; k < source.length; k++) { if (source[k] === "{") d++; else if (source[k] === "}" && --d === 0) break; } end = k + 1; }
    else { const nl = source.indexOf("\n", j); end = nl < 0 ? source.length : nl; }
    const route = cond.match(/(?:pathname|P)\s*===\s*"([^"]+)"/)?.[1]
      ?? (cond.match(/(?:pathname|P)\.startsWith\("([^"]+)"\)/) ? `${cond.match(/(?:pathname|P)\.startsWith\("([^"]+)"\)/)[1]}*` : null)
      ?? (cond.match(/\/(\^\\\/.*?)\/\.(?:test|exec)\((?:pathname|P)\)/) ? `re:${cond.match(/\/(\^\\\/.*?)\/\.(?:test|exec)\((?:pathname|P)\)/)[1]}` : null)
      ?? ([...vars.keys()].find((name) => new RegExp(String.raw`\b${name}\b`).test(cond)) ? vars.get([...vars.keys()].find((name) => new RegExp(String.raw`\b${name}\b`).test(cond))) : null);
    const methods = [...cond.matchAll(/req\.method\s*===\s*"(GET|HEAD|POST|PUT|PATCH|DELETE)"/g)].map((x) => x[1]);
    ifs.push({ at: m.index, end, cond, route, methods, body: source.slice(m.index, end) });
  }
  const out = [];
  for (const b of ifs) {
    if (!b.methods.length) continue;
    let route = b.route;
    if (!route) { // a method test inside a route's block: the innermost enclosing block with a route
      const outer = ifs.filter((o) => o.route && o.at < b.at && o.end >= b.end).sort((x, y) => y.at - x.at)[0];
      route = outer?.route ?? `(${b.cond.trim().slice(0, 50)})`;
    }
    out.push({ methods: b.methods, route, body: b.body });
  }
  return out;
}

/** Catalogue sanity: actions, defaults, endpoints and tools all refer to things that exist. */
export function checkCatalogue() {
  const errors = [];
  const seen = new Set();
  for (const g of GROUPS) for (const a of g.actions) {
    if (seen.has(a.key)) errors.push(`action listed twice: ${a.key}`);
    seen.add(a.key);
    for (const r of a.default ?? []) if (!ROLES.includes(r)) errors.push(`${a.key}: default role "${r}" is not a role`);
    if (a.requires && !ACTIONS.has(a.requires)) errors.push(`${a.key}: requires unknown action ${a.requires}`);
  }
  if (!ACTIONS.has(MANAGE)) errors.push(`${MANAGE} is missing`);
  for (const [r, a] of PINNED) if (!ROLES.includes(r) || !ACTIONS.has(a)) errors.push(`pinned grant ${r} × ${a} is not real`);
  for (const [service, list] of Object.entries(ENDPOINTS)) {
    const dup = new Set();
    for (const e of list) {
      if (dup.has(key(e))) errors.push(`${service}: ${key(e)} listed twice`);
      dup.add(key(e));
      if (e.read !== undefined) {
        if (!["GET", "HEAD"].includes(e.method)) errors.push(`${service}: ${key(e)} is marked read but is not a GET or HEAD`);
        if (!String(e.read).trim()) errors.push(`${service}: ${key(e)} is marked read without saying why`);
        continue;
      }
      if (!e.public) for (const a of e.any ?? [e.action]) if (!ACTIONS.has(a)) errors.push(`${service}: ${key(e)} → unknown action ${a}`);
      if (e.public !== undefined && !String(e.public).trim()) errors.push(`${service}: ${key(e)} is public without saying how it checks`);
    }
  }
  for (const [tool, a] of Object.entries(AGENT_TOOLS)) if (a !== null && !ACTIONS.has(a)) errors.push(`agent tool ${tool} → unknown action ${a}`);
  return errors;
}

/** A Node service's own source (wall: server.mjs; agent: server.mjs + the intake and passenger apis): every write route catalogued, every entry real. */
export function checkCodeRoutes(service, sources) {
  const errors = [];
  const listed = new Map((ENDPOINTS[service] ?? []).map((e) => [key(e), e]));
  const all = sources.join("\n");
  // Every route, any shape (if-blocks, one-liners, regex conditions, xMatch variables, nested method tests).
  const writes = new Set([...extractCodeRoutes(all).map(key), ...codeRouteBlocks(all).flatMap((blk) => blk.methods.filter((m) => !["GET", "HEAD"].includes(m)).map((m) => `${m} ${blk.route}`))]);
  for (const k of writes) {
    if (!listed.has(k)) errors.push(`${service}: ${k} has no entry in lib/permissions/catalogue.mjs — add it (a new action starts switched off)`);
  }
  for (const blk of codeRouteBlocks(all)) {
    if (blk.methods.some((m) => !["GET", "HEAD"].includes(m))) continue; // shared with a write: its entry covers it
    const effect = effectIn(blk.body);
    if (!effect) continue;
    for (const m of blk.methods) if (!listed.has(`${m} ${blk.route}`)) errors.push(`${service}: ${m} ${blk.route} changes something (${effect}) but has no entry in lib/permissions/catalogue.mjs — give it an action`);
  }
  for (const e of listed.values()) {
    const literal = e.route.startsWith("re:") ? e.route.slice(3) : e.route.endsWith("*") ? `"${e.route.slice(0, -1)}"` : `"${e.route}"`;
    if (!all.includes(literal)) errors.push(`${service}: catalogue entry ${key(e)} matches no route in the code`);
  }
  return errors;
}

/** Every registered agent tool is in AGENT_TOOLS (an action, or null for a read), and nothing listed is gone. */
export function checkTools(names) {
  const errors = [];
  for (const n of names) if (!(n in AGENT_TOOLS)) errors.push(`agent tool ${n} is not in AGENT_TOOLS — give it an action, or null if it only reads`);
  for (const n of Object.keys(AGENT_TOOLS)) if (!names.includes(n)) errors.push(`AGENT_TOOLS lists ${n}, which is not a registered tool`);
  return errors;
}

function walk(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out); else if (d.name === "route.ts" || d.name === "route.js") out.push(p);
  }
  return out;
}

/** The portal: every exported write handler under app/ is catalogued and checks its permission itself. */
export function checkPortal(root) {
  const errors = [];
  const listed = new Map(ENDPOINTS.portal.map((e) => [key(e), e]));
  const found = new Set();
  for (const file of walk(path.join(root, "app"))) {
    const rel = path.relative(path.join(root, "app"), path.dirname(file)).split(path.sep).filter((s) => !/^\(.+\)$/.test(s));
    const route = `/${rel.join("/")}`;
    const src = fs.readFileSync(file, "utf8");
    const handlers = [...src.matchAll(new RegExp(String.raw`export\s+(?:async\s+)?function\s+${ANY}\b|export\s+const\s+${ANY}\s*=`, "g"))];
    const fns = reachableFunctions(root, file, src);
    handlers.forEach((m, i) => {
      const method = m[1] ?? m[2];
      const k = `${method} ${route}`;
      found.add(k);
      let body = src.slice(m.index, handlers[i + 1]?.index ?? src.length);
      const alias = body.match(/^export\s+const\s+\w+\s*=\s*(\w+)\s*;/); // export const HEAD = GET;
      if (alias && fns.has(alias[1])) body = fns.get(alias[1]);
      const e = listed.get(k);
      const read = method === "GET" || method === "HEAD";
      if (!e) {
        if (!read) { errors.push(`portal: ${k} (${path.relative(root, file)}) has no entry in lib/permissions/catalogue.mjs`); return; }
        const effect = effectIn(body, fns, 2, new Set(), syncConstants(src));
        if (effect) errors.push(`portal: ${k} (${path.relative(root, file)}) changes something (${effect}) but has no entry in lib/permissions/catalogue.mjs — give it an action`);
        return;
      }
      if (e.public || e.read) return;
      if (!/requirePermission\(/.test(body)) errors.push(`portal: ${k} does not call requirePermission(...) itself`);
    });
  }
  for (const k of listed.keys()) if (!found.has(k)) errors.push(`portal: catalogue entry ${k} matches no route handler`);
  return errors;
}

/**
 * The other direction: every action must still guard something. An action is live when a write endpoint or an agent
 * tool names it, or server code checks it by name (a handler's finer check, e.g. wall.bigscreen.settings). An action
 * pointing at nothing — its pages removed — is a switch in the grid that does nothing, and fails the check.
 */
export function checkActionsLive(root, keys = [...ACTIONS.keys()]) {
  const errors = [];
  const named = new Set();
  for (const list of Object.values(ENDPOINTS)) for (const e of list) for (const a of e.any ?? (e.action ? [e.action] : [])) named.add(a);
  for (const a of Object.values(AGENT_TOOLS)) if (a) named.add(a);
  const skip = /(^|\/)(node_modules|\.next|data|upstream|dist|permissions)(\/|$)/;
  const files = [];
  const collect = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (skip.test(path.relative(root, p))) continue;
      if (d.isDirectory()) collect(p);
      else if (/\.(m?js|tsx?)$/.test(d.name)) files.push(p);
    }
  };
  for (const dir of ["app", "lib", "agent/lib", "digital-wall/lib"]) collect(path.join(root, dir));
  for (const f of ["middleware.ts", "agent/server.mjs", "digital-wall/server.mjs"]) if (fs.existsSync(path.join(root, f))) files.push(path.join(root, f));
  const code = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  for (const key of keys) {
    if (named.has(key) || code.includes(`"${key}"`) || code.includes(`'${key}'`)) continue;
    errors.push(`action ${key} guards nothing: no endpoint, agent tool or server check names it — remove it from lib/permissions/catalogue.mjs (and its grant rows), or wire it up`);
  }
  return errors;
}

/** docs/supabase-permissions.sql (and the rig's copy) carry the generated seed. */
export async function checkSeed(root) {
  const { seedSql, SEED_BEGIN, SEED_END } = await import("./sql.mjs");
  const errors = [];
  for (const f of ["docs/supabase-permissions.sql", "rig/supabase/migrations/0018_permissions.sql"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) { errors.push(`${f} is missing`); continue; }
    const s = fs.readFileSync(p, "utf8");
    const a = s.indexOf(SEED_BEGIN); const b = s.indexOf(SEED_END);
    if (a < 0 || b < 0 || s.slice(a, b + SEED_END.length) !== seedSql()) errors.push(`${f}: the seed differs from the catalogue's defaults — regenerate it with node lib/permissions/sql.mjs`);
  }
  return errors;
}

export async function checkAll(root, { seed = true } = {}) {
  const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  return [
    ...checkCatalogue(),
    ...checkPortal(root),
    ...checkCodeRoutes("wall", [read("digital-wall/server.mjs")]),
    ...checkCodeRoutes("agent", [read("agent/server.mjs"), read("agent/lib/intake/api.mjs"), read("agent/lib/passengers/api.mjs")]),
    ...checkActionsLive(root),
    ...checkMetadataReads(metadataSources(root)),
    ...(seed ? await checkSeed(root) : []),
  ];
}

/**
 * No authorization decision may read user_metadata (2026-10-20, docs/security-metadata-roles.md): Supabase lets a person
 * edit their own, so a role or an approval kept there is a claim, not a grant. Every line of every service that mentions
 * user_metadata / userMetadata must say why it is fine with `metadata-ok: <reason>` (a display name, a type, a stub) —
 * a line without one fails the build and the service's start, like an endpoint missing from the catalogue.
 * `sources`: [{ file, text }] — the portal's tree at build time, each service's own files at its start.
 */
export function checkMetadataReads(sources) {
  const errors = [];
  for (const { file, text } of sources) {
    text.split("\n").forEach((line, i) => {
      if (!/user_metadata|userMetadata/.test(line)) return; // metadata-ok: the check itself
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      if (/metadata-ok:\s*\S/.test(line)) return;
      errors.push(`${file}:${i + 1} reads user_metadata without saying why (metadata-ok: <reason>) — authorization never comes from it`);
    });
  }
  return errors;
}

/** The three services' source files for checkMetadataReads, from the repo root. */
export function metadataSources(root) {
  const out = [];
  const walk = (dir) => { for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, d.name); if (d.isDirectory()) { if (!/node_modules|\.next|dist|\.scratch/.test(d.name)) walk(p); } else if (/\.(ts|tsx|mjs|js|jsx)$/.test(d.name)) out.push({ file: path.relative(root, p), text: fs.readFileSync(p, "utf8") }); } };
  for (const f of ["middleware.ts"]) if (fs.existsSync(path.join(root, f))) out.push({ file: f, text: fs.readFileSync(path.join(root, f), "utf8") });
  for (const d of ["lib", "app", "components", "agent/lib", "agent/server.mjs", "digital-wall/lib", "digital-wall/server.mjs"]) {
    const p = path.join(root, d); if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) walk(p); else out.push({ file: d, text: fs.readFileSync(p, "utf8") });
  }
  return out;
}

/** How many endpoints exist, and how the check treats each: every one is examined; these say which need an entry. */
export function coverage(root) {
  const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  const out = {};
  // Portal: every exported handler under app/.
  const p = { endpoints: 0, writes: 0, readsThatChange: 0, readsListedAsRead: 0, plainReads: 0, withEntry: 0 };
  const listed = new Map(ENDPOINTS.portal.map((e) => [key(e), e]));
  for (const file of walk(path.join(root, "app"))) {
    const route = `/${path.relative(path.join(root, "app"), path.dirname(file)).split(path.sep).filter((x) => !/^\(.+\)$/.test(x)).join("/")}`;
    const src = fs.readFileSync(file, "utf8");
    const fns = reachableFunctions(root, file, src);
    const hs = [...src.matchAll(new RegExp(String.raw`export\s+(?:async\s+)?function\s+${ANY}\b|export\s+const\s+${ANY}\s*=`, "g"))];
    hs.forEach((m, i) => {
      const method = m[1] ?? m[2]; p.endpoints++;
      const e = listed.get(`${method} ${route}`); if (e) p.withEntry++;
      if (!["GET", "HEAD"].includes(method)) { p.writes++; return; }
      let body = src.slice(m.index, hs[i + 1]?.index ?? src.length);
      const alias = body.match(/^export\s+const\s+\w+\s*=\s*(\w+)\s*;/); if (alias && fns.has(alias[1])) body = fns.get(alias[1]);
      if (e?.read) p.readsListedAsRead++; else if (e || effectIn(body, fns, 2, new Set(), syncConstants(src))) p.readsThatChange++; else p.plainReads++;
    });
  }
  out.portal = p;
  // Wall and agent: every route block in their servers (a block may answer several methods).
  for (const [service, files] of [["wall", ["digital-wall/server.mjs"]], ["agent", ["agent/server.mjs", "agent/lib/intake/api.mjs", "agent/lib/passengers/api.mjs"]]]) {
    const all = files.map(read).join("\n");
    const l = new Map((ENDPOINTS[service] ?? []).map((e) => [key(e), e]));
    const c = { endpoints: 0, writes: 0, readsThatChange: 0, readsListedAsRead: 0, plainReads: 0, withEntry: 0 };
    for (const blk of codeRouteBlocks(all)) for (const m of blk.methods) {
      c.endpoints++;
      const e = l.get(`${m} ${blk.route}`) ?? endpointFor(service, m, blk.route.replace(/\*$/, "x")); if (e) c.withEntry++;
      if (!["GET", "HEAD"].includes(m)) { c.writes++; continue; }
      if (e?.read) c.readsListedAsRead++;
      else if (blk.methods.some((x) => !["GET", "HEAD"].includes(x))) c.plainReads++; // shares its write's entry
      else if (e || effectIn(blk.body)) c.readsThatChange++; else c.plainReads++;
    }
    out[service] = c;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--coverage")) {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
    const c = coverage(root);
    let total = 0, examined = 0, needEntry = 0;
    for (const [service, x] of Object.entries(c)) {
      total += x.endpoints; examined += x.endpoints; needEntry += x.writes + x.readsThatChange;
      console.log(`${service}: ${x.endpoints} endpoints examined — ${x.writes} writes and ${x.readsThatChange} reads that change something need a permission entry; ${x.readsListedAsRead} reads listed with a reason; ${x.plainReads} plain reads; ${x.withEntry} have an entry`);
    }
    console.log(`all: ${examined} of ${total} endpoints examined; ${needEntry} need a permission entry`);
    process.exit(0);
  }
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const errors = await checkAll(root, { seed: !process.argv.includes("--code") });
  if (errors.length) { console.error(`permissions check: ${errors.length} problem(s)\n  ${errors.join("\n  ")}`); process.exit(1); }
  console.log("permissions check: ok");
}
