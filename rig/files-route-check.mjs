// /files serves an ALLOW-list (2026-11-02): only the published AIP PDF folders, to any signed-in person, with no owner
// check. Everything else is 404 — a sibling .json, another storage folder, a folder nobody has added yet, another
// person's help draft. Tried from outside, as two different signed-in people, through the sign-in proxy (:3989).
//   node --env-file=.env.rig rig/files-route-check.mjs
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const ROOT = process.env.STORAGE_ROOT;
if (!ROOT || !existsSync(ROOT)) { console.error("CANNOT TELL: STORAGE_ROOT is not set or missing"); process.exit(2); }
const B = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const PW = JSON.parse(readFileSync("rig/dark-audit.mjs", "utf8").match(/token\?grant_type=password[^\n]*?password: ("[^"]+")/)[1]);
const session = async (email) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: PW }) })).json();
const ck = (s) => `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const get = (p, s) => fetch(`${B}${p}`, { headers: { cookie: ck(s) }, redirect: "manual" });

const owner = await session("rig-access-user@rig.invalid"), other = await session("rig-access-admin@rig.invalid");
ok(Boolean(owner.access_token && other.access_token), "two rig people sign in");

// 1. a listed path, owned by nobody, serves
const aip = readdirSync(path.join(ROOT, "aip", "ead-pdf")).find((f) => /^[A-Z0-9]{4}\.pdf$/.test(f));
let r = await get(`/files/aip/ead-pdf/${aip}`, other);
ok(r.status === 200 && (r.headers.get("content-type") ?? "").includes("pdf"), `a listed AIP copy serves to anyone signed in (aip/ead-pdf/${aip})`, `${r.status} ${r.headers.get("content-type")}`);

// 2. what is not listed: a sibling record, an existing folder, a folder nobody has thought about
const made = [];
const put = (rel, body) => { const f = path.join(ROOT, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, body); made.push(f); };
put("aip/ead-pdf/RIGX.json", "{}");
put("notam/rig-files-probe.json", "{}");
put("rig-new-folder-nobody-listed/probe.pdf", "%PDF-1.4 rig probe");
put("aip/rig-new-subfolder/RIGX.pdf", "%PDF-1.4 rig probe");
for (const [p, what] of [["/files/aip/ead-pdf/RIGX.json", "a .json beside the AIP copies"], ["/files/notam/rig-files-probe.json", "an existing storage folder that is not listed (notam/)"], ["/files/rig-new-folder-nobody-listed/probe.pdf", "a new top-level folder nobody added a rule for"], ["/files/aip/rig-new-subfolder/RIGX.pdf", "a new folder inside aip/ nobody added a rule for"]]) {
  r = await get(p, other);
  ok(r.status === 404, `not served: ${what}`, r.status);
}

// 3. another person's help draft
r = await fetch(`${B}/api/help/drafts`, { method: "PUT", headers: { "content-type": "application/json", cookie: ck(owner) }, body: JSON.stringify({ route: "question", title: "Rig files-route probe (invented)", blocks: [] }) });
ok(r.ok, "the owner saves a help draft", r.status);
r = await get(`/api/help/drafts?route=question`, owner);
ok(r.status === 200, "the owner reads it through the help route", r.status);
r = await get(`/files/help-drafts/${owner.user.id}/question.json`, other);
ok(r.status === 404, "another person cannot read it through /files", r.status);
await fetch(`${B}/api/help/drafts?route=question`, { method: "DELETE", headers: { cookie: ck(owner) } });

for (const f of made) rmSync(f, { force: true });
for (const d of ["rig-new-folder-nobody-listed", "aip/rig-new-subfolder"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
