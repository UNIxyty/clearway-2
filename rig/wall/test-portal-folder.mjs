// What the portal can read of the wall's data: only data/portal/, and only the changelog's three files in it.
//   node rig/wall/test-portal-folder.mjs
//   · the wall's JSON store moves a file from its old place under data/ to data/portal/ once, losing nothing; if both
//     exist, the new one wins and the old one is left alone
//   · docker-compose.yml mounts data/portal into the portal, never data/ itself
//   · the only stores kept in data/portal/ are the changelog's three files (no device sign-ins, no webhook registrations)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
let failures = 0;
const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };

// ── the move, in a scratch working folder (the store resolves data/ from the working folder, as the wall does) ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wall-portal-"));
fs.mkdirSync(path.join(tmp, "data"));
fs.writeFileSync(path.join(tmp, "data", "important.json"), JSON.stringify({ entries: [{ id: "old" }] }));
fs.writeFileSync(path.join(tmp, "data", "reports.json"), JSON.stringify({ reports: [{ id: "old" }] }));
fs.mkdirSync(path.join(tmp, "data", "portal"));
fs.writeFileSync(path.join(tmp, "data", "portal", "reports.json"), JSON.stringify({ reports: [{ id: "new" }] }));
const script = `
  const { JsonFileStore, PORTAL_SHARED } = await import(${JSON.stringify(path.join(ROOT, "digital-wall/lib/json-store.mjs"))});
  const imp = new JsonFileStore(PORTAL_SHARED + "/important.json", { entries: [] }, { movedFrom: "important.json" });
  const rep = new JsonFileStore(PORTAL_SHARED + "/reports.json", { reports: [] }, { movedFrom: "reports.json" });
  const log = new JsonFileStore(PORTAL_SHARED + "/webhook-log.json", { logs: {} }, { movedFrom: "webhook-log.json" });
  const a = await imp.read(); const b = await rep.read(); await log.write({ logs: { x: [] } });
  console.log(JSON.stringify({ imp: a.entries.map((e) => e.id), rep: b.reports.map((r) => r.id) }));`;
const out = JSON.parse(execFileSync("node", ["--input-type=module", "-e", script], { cwd: tmp, encoding: "utf8" }).trim().split("\n").pop());
const has = (p) => fs.existsSync(path.join(tmp, "data", p));
ok(out.imp.join() === "old" && has("portal/important.json") && !has("important.json"), "a file in its old place is moved to data/portal/ with its contents", JSON.stringify(out));
ok(out.rep.join() === "new" && has("reports.json"), "if both exist, data/portal/ wins and the old file is left alone", JSON.stringify(out));
ok(has("portal/webhook-log.json") && !has("webhook-log.json"), "a new file is written in data/portal/");
fs.rmSync(tmp, { recursive: true, force: true });

// ── compose mounts data/portal only ──
const compose = fs.readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
const wallMounts = [...compose.matchAll(/^\s*-\s*(\.\/digital-wall\/data[^\s:]*):([^\s:]+)/gm)].map((m) => [m[1], m[2]]);
const intoPortal = wallMounts.filter(([, to]) => to === "/wall-data");
ok(intoPortal.length === 1 && intoPortal[0][0] === "./digital-wall/data/portal", "the portal mounts ./digital-wall/data/portal, never the whole data folder", JSON.stringify(wallMounts));
ok(/\/wall-data:ro/.test(compose), "read-only");
// Any other container that reads the wall's data (the AIP sync worker, 2026-10-25) reads the same folder, read-only.
const others = wallMounts.filter(([, to]) => to !== "/wall-data" && to !== "/app/data");
ok(others.every(([from, to]) => from === "./digital-wall/data/portal" && new RegExp(`${to}:ro`).test(compose)), "every other reader of the wall's data mounts data/portal only, read-only", JSON.stringify(others));

// ── only the changelog's three stores live in data/portal/ ──
const shared = execFileSync("git", ["grep", "-h", "-o", "-E", "PORTAL_SHARED\\}/[a-z-]+\\.json", "--", "digital-wall"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter(Boolean).map((l) => l.replace("PORTAL_SHARED}/", ""));
const allowed = ["important.json", "reports.json", "webhook-log.json", "upcoming-airports.json"]; // the last: ICAO codes with flights in 7 days, for the AIP refresh
ok(shared.length > 0 && shared.every((f) => allowed.includes(f)), `data/portal/ holds only ${allowed.join(", ")}`, [...new Set(shared)].join(", "));
const read = fs.readFileSync(path.join(ROOT, "app/api/dashboard/changelog/route.ts"), "utf8").matchAll(/readWallJson<[\s\S]*?\(\s*"([a-z-]+\.json)"/g);
const names = [...read].map((m) => m[1]);
ok(names.length === 3 && names.every((f) => allowed.slice(0, 3).includes(f)), "the changelog reads exactly the first three", names.join(", "));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
