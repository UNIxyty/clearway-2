#!/usr/bin/env node
// Fails (exit 1) when a secret, or a file that holds secrets, is inside an image. Run as a build step in every image
// (Dockerfile, agent/Dockerfile, digital-wall/Dockerfile), so a leak stops the build instead of shipping:
//   node check-image-secrets.mjs /app [--skip node_modules]
// Looks for:
//   · files by name: .env and .env.* (not .env.example), *.bak / *.bak-*, display-device-auth.json
//   · secrets by shape, in any text file: a Supabase service-role JWT (the anon key is public by design and allowed),
//     an Anthropic key, an AWS access key id, a private key block, a Telegram bot token, a Resend API key, a webhook
//     signing secret (whsec_)
// Prints file paths and the KIND of secret only, never a value. Configuration belongs in the environment at run time
// (env_file in docker-compose.yml): docs/security-image-secrets.md.
import { readdirSync, lstatSync, openSync, readSync, closeSync } from "node:fs";
import path from "node:path";

const root = process.argv[2] || "/app";
const skipDirs = new Set(["node_modules", ".git", "proc", "sys"]);
for (let i = 3; i < process.argv.length; i += 1) if (process.argv[i] === "--skip" && process.argv[i + 1]) skipDirs.add(process.argv[++i]);

const BAD_NAME = [
  [/^\.env(\..+)?$/, (n) => n !== ".env.example", ".env file"],
  [/\.bak(-.*)?$/, () => true, "backup file"],
  [/^display-device-auth\.json$/, () => true, "wall device keys"],
];
const SHAPES = [
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["AWS access key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["Telegram bot token", /\b\d{8,10}:AA[0-9A-Za-z_-]{33}\b/],
  ["Resend API key", /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}\b/],
  ["webhook signing secret", /\bwhsec_[A-Za-z0-9+/=]{20,}/],
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
const MAX = 20 * 1024 * 1024;

const findings = [];
let files = 0;
function scanFile(p, size) {
  files += 1;
  if (size === 0 || size > MAX) return;
  const buf = Buffer.alloc(size); const fd = openSync(p, "r");
  try { readSync(fd, buf, 0, size, 0); } finally { closeSync(fd); }
  if (buf.subarray(0, 8000).includes(0) && !/\.(js|mjs|json|html|rsc|txt|map|css)$/.test(p)) return;   // binary
  const text = buf.toString("latin1");
  for (const [kind, re] of SHAPES) if (re.test(text)) findings.push(`${p}: ${kind}`);
  for (const m of text.matchAll(JWT)) {
    try { if (JSON.parse(Buffer.from(m[1], "base64url").toString()).role === "service_role") { findings.push(`${p}: Supabase service-role key`); break; } } catch { /* not a JWT */ }
  }
}
function walk(dir) {
  let entries; try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = path.join(dir, name); let st; try { st = lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) { if (!skipDirs.has(name)) walk(p); continue; }
    for (const [re, applies, kind] of BAD_NAME) if (re.test(name) && applies(name)) findings.push(`${p}: ${kind}`);
    scanFile(p, st.size);
  }
}
walk(root);
if (!files) {
  // Nothing read means the root is missing or unreadable, not that it is clean (a gate fails closed, 2026-10-21).
  console.error(`check-image-secrets: REFUSING — no file could be read under ${root}; the image cannot be called clean`);
  process.exit(2);
}
if (findings.length) {
  console.error(`check-image-secrets: ${findings.length} finding(s) in ${root} — the image must not be built:`);
  for (const f of findings.slice(0, 50)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`check-image-secrets: ${root} is clean (${files} files read; secrets come from the environment at run time)`);
