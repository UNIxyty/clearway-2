// The bundle sweep (2026-11-04): what a CLIENT's browser and a SIGNED-OUT visitor's browser download, swept for what must
// not be in it (rig/lib/bundle-sweep.mjs lists the kinds). Counts and kinds per asset, never a value.
// Since 2026-11-10 a client's pages frame the wall app's client surface (/digital-wall/timeline/?in=client), so the
// client's downloads include the frame's chunks under /digital-wall/timeline/assets/. Every one of them — the portal
// pages' scripts and the frame's chunks — must carry nothing of the Ops Agent, the AIP pages, the airport view, the
// NOTAM check page or the console app: those are separate chunks the client route never imports (opsboard-react/src/App.jsx).
//   rig:         node --env-file=.env.rig rig/bundle-sweep.mjs            (starts this build on :3982/:3979, a client account)
//   any portal:  BASE=https://… OPERATORS_FILE=… node rig/bundle-sweep.mjs  (signed-out pages only; read-only GETs)
import fs from "node:fs";
import { spawn } from "node:child_process";
import { sweepAssets, downloadedAssets, permissionNamesFrom, ourRoutesFrom, printSweep, readCatalogue } from "./lib/bundle-sweep.mjs";

const SIGNED_OUT = ["/login", "/request-access", "/welcome", "/forgot-password", "/reset-password"];
const CLIENT = ["/client", "/client/flights", "/client/account", "/client/settings"];
// what a client's own pages legitimately name: their pages, their standing, their preferences, their password, the frame
// and the wall's scoped reads (the client never calls the agent since 2026-11-10: passenger names come from the wall)
const CLIENT_OWN = /^\/(client(\/|$)|api\/client\/(me|account\/password|prefs)$|digital-wall\/(api|timeline)(\/|$))/;
// words that name what a client must not be given the code of: the agent's API and dock, the AIP routes and viewer,
// the airport view, the NOTAM check page, the console app
export const FORBIDDEN_IN_CLIENT_BUNDLE = ["agent/api", "useAgentDock", "Ops Agent", "api/aip", "aip-pdf", "AirportView", "NotamCheckPage", "ConsoleApp"];
const ourRoutes = ourRoutesFrom("app");
const publicHosts = [String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")].filter(Boolean);
const permissionNames = permissionNamesFrom(readCatalogue());
// a .map answers "served" only when it IS a source map (JSON): the wall's single-page app answers its index page for any
// missing file, as production's gateway does (try_files … /index.html), and that is not a leaked source (2026-11-10)
const fetchStatus = async (u) => { try { const r = await fetch(u); if (r.status !== 200) return r.status; const head = (await r.text()).trimStart().slice(0, 1); return head === "{" ? 200 : 404; } catch { return 0; } };

/**
 * Every JS body a client downloaded (portal scripts and the frame's chunks) holding a forbidden word: [{ url, words }].
 * The entry chunk names the chunks it can load, by FILE NAME (`./ConsoleApp-C8gsUUAC.js` in its lazy import and its deps
 * map): Vite names a chunk after its module. That is the name of a file the client's route never imports, not its code,
 * so a chunk file name is blanked before the words are looked for. (To make the literal rule hold, the build would
 * name chunks by hash alone: build.rollupOptions.output.chunkFileNames.)
 */
const CHUNK_FILE_NAME = /(?<=["'`/])[A-Za-z][\w-]*-[\w-]{6,}\.js(?=["'`])/g;
export function forbiddenWordsIn(assets) {
  const hits = [];
  for (const [url, text] of assets) {
    if (!/\.js(\?|$)/.test(url)) continue;
    const code = text.replace(CHUNK_FILE_NAME, "chunk.js");
    const words = FORBIDDEN_IN_CLIENT_BUNDLE.filter((w) => code.includes(w));
    if (words.length) hits.push({ url: url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, ""), words });
  }
  return hits;
}

export async function sweepClientAndSignedOut({ base, cookie, operators }) {
  const out = {};
  if (cookie) {
    // the frame's chunks arrive after the page's own load (a lazy import once the wall app knows the surface): wait longer
    const assets = await downloadedAssets({ base, pages: CLIENT, cookie, waitMs: 6000 });
    out.client = await sweepAssets(assets, { permissionNames, operators, allowedRoutes: CLIENT_OWN, fetchMap: fetchStatus, ourRoutes, publicHosts });
    out.clientAssets = assets;
    out.clientForbidden = forbiddenWordsIn(assets);
  }
  out.signedOut = await sweepAssets(await downloadedAssets({ base, pages: SIGNED_OUT }), { permissionNames, operators, allowedRoutes: /^\/(api\/(auth|client-requests|client-invite)\b)/, fetchMap: fetchStatus, ourRoutes, publicHosts });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };
  const bad = (t) => Object.entries(t ?? {}).filter(([k]) => k !== "jwtAnon").map(([k, n]) => `${k} ${n}`);
  if (process.env.BASE) {
    const operators = process.env.OPERATORS_FILE ? JSON.parse(fs.readFileSync(process.env.OPERATORS_FILE, "utf8")) : [];
    const r = await sweepClientAndSignedOut({ base: process.env.BASE.replace(/\/+$/, ""), cookie: null, operators });
    printSweep(`signed out, ${process.env.BASE}`, r.signedOut);
    ok(bad(r.signedOut.total).length === 0, `a signed-out visitor's bundle (${r.signedOut.rows.length} assets): nothing but the public anon key`, bad(r.signedOut.total).join(", ") || `jwtAnon ${r.signedOut.total.jwtAnon ?? 0}`);
    console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
  }
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
  const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
  const kids = [];
  const run = (args, env) => { const c = spawn(args[0], args.slice(1), { env, stdio: "ignore" }); kids.push(c); };
  const B = "http://127.0.0.1:3979";
  try {
    fs.rmSync(".next/standalone/.next/static", { recursive: true, force: true }); fs.cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
    fs.rmSync(".next/standalone/public", { recursive: true, force: true }); fs.cpSync("public", ".next/standalone/public", { recursive: true });
    run(["node", "--env-file=.env.rig", ".next/standalone/server.js"], { PATH: process.env.PATH, HOME: process.env.HOME, PORT: "3982", HOSTNAME: "127.0.0.1", DISABLE_AUTH_FOR_TESTING: "false", ADMIN_EMAILS: "", DEVELOPER_EMAILS: "" });
    run(["node", "rig/proxy.mjs"], { ...process.env, RIG_PROXY_PORT: "3979", RIG_PORTAL_PORT: "3982", RIG_AGENT_PORT: "5176", RIG_WALL_PORT: "5198" });
    for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`${B}/login`)).status < 500) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
    const ops = (await (await fetch(`${SB}/rest/v1/leon_operators?select=opr_id,name`, { headers: H })).json()).flatMap((o) => [o.opr_id, o.name]).filter(Boolean);
    const EMAIL = "rig-client-allow@rig.invalid", PASSWORD = "rig-access-check-only-client-allow";
    const list = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: H })).json();
    const u = (list.users ?? []).find((x) => x.email === EMAIL);
    if (!u) { console.error("run rig/client-allow-check.mjs once first (it makes the client account)"); process.exit(2); }
    await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: H, body: JSON.stringify({ password: PASSWORD, app_metadata: { role: "client", is_approved: true, client_status: "approved" } }) });
    // every switch that exists (the retired two grant nothing and are not written), passengers by name: the widest client
    const { ACTIVE_SWITCHES } = await import("../lib/clients/switches.mjs");
    await fetch(`${SB}/rest/v1/clients?user_id=eq.${u.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "approved", scope: [{ kind: "operator", value: "cwy-cwy" }], switches: ACTIVE_SWITCHES.map((w) => w.key), passenger_level: "names" }) });
    await new Promise((r) => setTimeout(r, 11_000));   // the scope is cached ten seconds
    const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
    const cookie = `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
    const r = await sweepClientAndSignedOut({ base: B, cookie, operators: ops });
    printSweep("a client (every switch on)", r.client);
    printSweep("signed out", r.signedOut);
    const frameChunks = [...r.clientAssets.keys()].filter((x) => /\/digital-wall\/timeline\/assets\/.*\.js/.test(x));
    const portalScripts = [...r.clientAssets.keys()].filter((x) => /\/_next\/.*\.js/.test(x));
    ok(frameChunks.length >= 1 && portalScripts.length >= 1, `a client's downloads were collected over ${CLIENT.join(", ")}: ${portalScripts.length} portal scripts and ${frameChunks.length} chunks of the frame`, frameChunks.map((x) => x.split("/").pop()).join(" "));
    ok(r.clientForbidden.length === 0, `none of the ${r.clientAssets.size} assets a client downloads carries the agent, the AIP pages, the airport view, the NOTAM check page or the console app (${FORBIDDEN_IN_CLIENT_BUNDLE.length} words looked for)`, r.clientForbidden.map((h) => `${h.url.split("/").pop()}: ${h.words.join(" ")}`).join(" · "));
    ok(bad(r.client.total).length === 0, `a client's bundle (${r.client.rows.length} assets): nothing but the public anon key`, bad(r.client.total).join(", ") || `jwtAnon ${r.client.total.jwtAnon ?? 0}`);
    ok(bad(r.signedOut.total).length === 0, `a signed-out visitor's bundle (${r.signedOut.rows.length} assets): nothing but the public anon key`, bad(r.signedOut.total).join(", ") || `jwtAnon ${r.signedOut.total.jwtAnon ?? 0}`);
    // the control: the probe finds the words where they belong — the console's own chunk, read straight from the build
    const dist = process.env.RIG_DISPLAY_DIST || "rig/.scratch/display-dist";
    const consoleChunk = fs.existsSync(`${dist}/assets`) ? fs.readdirSync(`${dist}/assets`).find((f) => /^ConsoleApp-.*\.js$/.test(f)) : null;
    const control = consoleChunk ? forbiddenWordsIn(new Map([[`file:///${consoleChunk}`, fs.readFileSync(`${dist}/assets/${consoleChunk}`, "utf8")]])) : [];
    ok(Boolean(consoleChunk) && control.length === 1 && control[0].words.includes("Ops Agent") && control[0].words.includes("agent/api"), "control: the same probe finds the Ops Agent and the agent's API in the console's own chunk of the build, so a clean client result means something", consoleChunk ? control[0]?.words.join(" ") : "no console chunk in the display build");
    await fetch(`${SB}/rest/v1/clients?user_id=eq.${u.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "removed", scope: [], switches: [], passenger_level: "off" }) });
    await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: H, body: JSON.stringify({ app_metadata: { role: "client", is_approved: false, client_status: "removed" } }) });
  } finally { for (const k of kids) k.kill(); }
  console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
}
