#!/usr/bin/env node
// Is a secret inside the BUILT image? (2026-11-02.) Opens the image's own filesystem from the outside — `docker create`
// then `docker export`, never the build context and never the Dockerfile — and fails (exit 1) on:
//   · a .env or .env.* file anywhere (.env.example is allowed)
//   · a .git directory anywhere
//   · an SSH private key file by name (id_rsa, id_dsa, id_ecdsa, id_ed25519; the .pub halves are fine)
//   · a *.pem / *.key / *.p12 / *.pfx file that holds a private key (read; public CA certificates pass), outside the
//     system's own certificate store
//   · then scripts/check-image-secrets.mjs over the image's app folder (/app, or the one given) (secret SHAPES in text: service-role JWT, API keys,
//     private key blocks…), on the extracted copy
// Prints paths and the KIND of finding only, never a value or a fragment. Exit 0 clean, 1 finding, 2 cannot tell (a
// gate fails closed: no image, no listing, nothing read → 2, never "clean").
//   node scripts/check-image-contents.mjs <image> [app folder, default /app; the wall's nginx pages: /usr/share/nginx/html]
// Run by scripts/check-image-runs.sh after each build and before the container is started.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, lstatSync, readlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const image = process.argv[2];
const appRoot = String(process.argv[3] || "/app").replace(/^\/+|\/+$/g, "");   // the folder the service's own files live in
if (!image) { console.error("usage: node scripts/check-image-contents.mjs <image>"); process.exit(2); }
const here = path.dirname(new URL(import.meta.url).pathname);
const cannot = (why) => { console.error(`check-image-contents: CANNOT TELL for ${image} — ${why}`); process.exit(2); };

const name = `imgcontents-${process.pid}`;
const tmp = mkdtempSync(path.join(tmpdir(), "imgcontents-"));
const tarFile = path.join(tmp, "image.tar");
let exitCode = 0;
try {
  try { execFileSync("docker", ["create", "--name", name, image], { stdio: "pipe" }); } catch { cannot("docker create failed (no such image?)"); }
  const exp = spawnSync("docker", ["export", "-o", tarFile, name], { stdio: "pipe" });
  if (exp.status !== 0 || !existsSync(tarFile)) cannot("docker export failed");
  const listing = spawnSync("tar", ["-tf", tarFile], { maxBuffer: 1 << 30 });
  if (listing.status !== 0) cannot("the image's file list could not be read");
  const entries = listing.stdout.toString().split("\n").filter(Boolean).map((e) => e.replace(/^\.?\//, ""));
  if (entries.length < 100) cannot(`only ${entries.length} entries listed`);

  const findings = [];
  // the public CA stores: Debian's folders, OpenSSL's cert.pem links, Alpine's /etc/ssl/cert.pem and /etc/ssl1.1/cert.pem
const systemCerts = /^(?:(?:etc\/ssl\/certs|usr\/share\/ca-certificates|usr\/lib\/ssl\/certs|etc\/ca-certificates|usr\/local\/share\/ca-certificates)\/|(?:usr\/lib\/ssl|etc\/ssl|etc\/ssl1\.1)\/cert\.pem$)/;
  const keyCandidates = [];
  for (const e of entries) {
    const clean = e.replace(/\/$/, "");
    const base = path.posix.basename(clean);
    const parts = clean.split("/");
    if (/^\.env(\..+)?$/.test(base) && base !== ".env.example" && !e.endsWith("/")) findings.push(`/${clean}: .env file`);
    if (parts.includes(".git")) { const at = parts.slice(0, parts.indexOf(".git") + 1).join("/"); if (!findings.includes(`/${at}: .git directory`)) findings.push(`/${at}: .git directory`); }
    if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) findings.push(`/${clean}: SSH private key file`);
    if (/\.(pem|key|p12|pfx)$/i.test(base) && !e.endsWith("/") && !systemCerts.test(clean)) keyCandidates.push(clean);
  }

  // key-named files: read them (extracted to the temp dir) — a public certificate passes, a private key does not
  if (keyCandidates.length) {
    const listFile = path.join(tmp, "keys.txt"); writeFileSync(listFile, keyCandidates.join("\n") + "\n");
    const keysDir = path.join(tmp, "keys"); execFileSync("mkdir", ["-p", keysDir]);
    spawnSync("tar", ["-xf", tarFile, "-C", keysDir, "-T", listFile], { stdio: "pipe" });
    for (const k of keyCandidates) {
      const f = path.join(keysDir, k);
      if (!existsSync(f)) {
        // a symlink whose target was not extracted: fine only when it points into the system's public certificate store
        // (OpenSSL's /usr/lib/ssl/cert.pem → /etc/ssl/certs/ca-certificates.crt); anything else is a finding
        let target = null; try { if (lstatSync(f).isSymbolicLink()) { const to = readlinkSync(f); target = path.posix.normalize(to.startsWith("/") ? to : path.posix.join(path.posix.dirname(`/${k}`), to)).replace(/^\//, ""); } } catch { /* not there at all */ }
        if (target && systemCerts.test(target)) continue;
        findings.push(`/${k}: key-named file that could not be read${target ? ` (a link to /${target})` : ""} (treated as a finding)`); continue;
      }
      const buf = readFileSync(f);
      if (/\.(p12|pfx)$/i.test(k)) findings.push(`/${k}: PKCS#12 bundle (holds a private key)`);
      else if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(buf.toString("latin1"))) findings.push(`/${k}: private key`);
    }
  }

  // the app folder, extracted without node_modules, through the same secret-shape scan the Dockerfile runs
  const appDir = path.join(tmp, "root");
  execFileSync("mkdir", ["-p", appDir]);
  const x = spawnSync("tar", ["-xf", tarFile, "-C", appDir, "--exclude", `${appRoot}/node_modules`, appRoot], { stdio: "pipe" });
  if (x.status !== 0 || !existsSync(path.join(appDir, appRoot))) cannot(`the image has no /${appRoot} to read`);
  const shapes = spawnSync("node", [path.join(here, "check-image-secrets.mjs"), path.join(appDir, appRoot)], { encoding: "utf8" });
  if (shapes.status === 2) cannot("the secret-shape scan read nothing");
  if (shapes.status !== 0) for (const l of String(shapes.stderr).split("\n").filter((l) => /^\s+\//.test(l))) findings.push(`${l.trim().replace(path.join(appDir), "")} (secret shape)`);

  if (findings.length) {
    console.error(`check-image-contents: ${image} — ${findings.length} finding(s); the image must not run:`);
    for (const f of findings.slice(0, 60)) console.error(`  ${f}`);
    exitCode = 1;
  } else {
    console.log(`check-image-contents: ${image} is clean — ${entries.length} entries listed, ${keyCandidates.length} key-named file(s) read (no private key), /${appRoot} scanned for secret shapes; no .env, no .git, no SSH key`);
  }
} finally {
  spawnSync("docker", ["rm", "-f", name], { stdio: "pipe" });
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(exitCode);
