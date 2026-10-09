// The permissions check (docs/permissions.md): no write endpoint or agent tool without an entry in the catalogue, no
// entry without its code, no action unknown, the database seed in step with the defaults. Fails the portal's image build
// (Dockerfile) and refuses the wall's and the agent's startup (they run their own part: checkCodeRoutes, checkTools).
//   node lib/permissions/check.mjs          exit 1 and the reasons, or "permissions check: ok"
//   node lib/permissions/check.mjs --code   the code only, not the SQL seed (the portal image has no docs/)
import fs from "node:fs";
import path from "node:path";
import { ACTIONS, AGENT_TOOLS, ENDPOINTS, GROUPS, MANAGE, PINNED, ROLES } from "./catalogue.mjs";

const WRITE = "(POST|PUT|PATCH|DELETE)";

/** Write routes as a service's code tests them: "/x" (===), "/x/*" (startsWith), "re:^…$" (regex). */
export function extractCodeRoutes(source) {
  const out = [];
  const re = new RegExp(String.raw`(?:(?:pathname|P)\s*===\s*"([^"]+)"|(?:pathname|P)\.startsWith\("([^"]+)"\)|(?:\(\w+\s*=\s*)?/(\^\\/.*?)/\.(?:test|exec)\((?:pathname|P)\)\)?)\s*&&\s*\(?\s*req\.method\s*===\s*"${WRITE}"`, "g");
  for (const m of source.matchAll(re)) out.push({ method: m[4], route: m[1] ?? (m[2] ? `${m[2]}*` : `re:${m[3]}`) });
  return out;
}

const key = (e) => `${e.method} ${e.route}`;

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
      if (!e.public) for (const a of e.any ?? [e.action]) if (!ACTIONS.has(a)) errors.push(`${service}: ${key(e)} → unknown action ${a}`);
      if (e.public !== undefined && !String(e.public).trim()) errors.push(`${service}: ${key(e)} is public without saying how it checks`);
    }
  }
  for (const [tool, a] of Object.entries(AGENT_TOOLS)) if (a !== null && !ACTIONS.has(a)) errors.push(`agent tool ${tool} → unknown action ${a}`);
  return errors;
}

/** A Node service's own source (wall: server.mjs; agent: server.mjs + intake api): every write route catalogued, every entry real. */
export function checkCodeRoutes(service, sources) {
  const errors = [];
  const listed = new Map((ENDPOINTS[service] ?? []).map((e) => [key(e), e]));
  const all = sources.join("\n");
  for (const r of extractCodeRoutes(all)) {
    if (!listed.has(key(r))) errors.push(`${service}: ${key(r)} has no entry in lib/permissions/catalogue.mjs — add it (a new action starts switched off)`);
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
    const handlers = [...src.matchAll(new RegExp(String.raw`export\s+(?:async\s+)?function\s+${WRITE}\b|export\s+const\s+${WRITE}\s*=`, "g"))];
    handlers.forEach((m, i) => {
      const method = m[1] ?? m[2];
      const k = `${method} ${route}`;
      found.add(k);
      const e = listed.get(k);
      if (!e) { errors.push(`portal: ${k} (${path.relative(root, file)}) has no entry in lib/permissions/catalogue.mjs`); return; }
      if (e.public) return;
      const body = src.slice(m.index, handlers[i + 1]?.index ?? src.length);
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
    ...checkCodeRoutes("agent", [read("agent/server.mjs"), read("agent/lib/intake/api.mjs")]),
    ...checkActionsLive(root),
    ...(seed ? await checkSeed(root) : []),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const errors = await checkAll(root, { seed: !process.argv.includes("--code") });
  if (errors.length) { console.error(`permissions check: ${errors.length} problem(s)\n  ${errors.join("\n  ")}`); process.exit(1); }
  console.log("permissions check: ok");
}
