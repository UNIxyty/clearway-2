// A person sees what happened and what to do; the detail goes to the log (lib/public-error.ts). This fails when source
// code puts text nobody on the team wrote where a person can see it:
//   · a response or shown field (error/detail/message/reason/why/note/lastError/summary) built from an exception
//     (.message, String(e)), stderr/stdout, or a raw response body (.text(), snippet())
//   · an on-screen error setter fed the same way (setError(e.message), toast with err.message …)
//   · a shown message that names a setting (NOTAM_SYNC_URL, RESEND_API_KEY …): setup instructions are for the log
// A line that is deliberately fine says why with `public-error-ok: <reason>`.
// Left out on purpose: Flight intake (not to be changed now), the developer-only debug runner, test/HITL routes, the
// rig guard and the developer Telegram bot.
//   node rig/check-error-text.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIRS = ["app", "components", "lib", "agent/server.mjs", "agent/lib", "digital-wall/server.mjs", "digital-wall/lib", "opsboard-react/src"];
const EXT = /\.(tsx?|jsx?|mjs)$/;
const SKIP = [
  /node_modules/, /\.test\./, /\/__tests__\//,
  /^agent\/lib\/intake\//, /^components\/agent\/intake\//, /^app\/intake\//, // Flight intake
  /^app\/admin\/debug\//, /^lib\/debug-runner\//, // developer-only debug runner
  /^app\/api\/(aip-test|rus-aip-test|aip-meta-compare)\//, /^app\/api\/[^/]*hitl[^/]*\//, /^app\/api\/[^/]*package-root\//,
  /^app\/[^/]*-hitl-auto-test\//, /^components\/hitl-country-auto-test-page\.tsx$/, // test and captcha tooling
  /^app\/api\/telegram\/debug\//, /^lib\/telegram-bug-actions\.ts$/, // developer Telegram bot
  /^lib\/rig-guard\.mjs$/, /^middleware\.ts$/, // the rig guard
  /^lib\/public-error\.ts$/,
];

function* files(p) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return;
  if (fs.statSync(abs).isFile()) { yield p; return; }
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const rel = path.join(p, e.name);
    if (e.isDirectory()) yield* files(rel); else if (EXT.test(e.name)) yield rel;
  }
}

const SHOWN_FIELD = /\b(error|detail|message|reason|why|note|lastError|lastSyncError|lastRunError|summary|statusText|diagnostic)\s*:/;
const SETTER = /\b(set[A-Z]\w*(Error|Message|Note|Problem|Notice|Flash|Status)|toast(\.\w+)?|showAlert|flash|fail|setSendError|setPwError|setSaveError|setLoadError)\s*\(/;
const RAW = /(\b(e|err|error|ex|exc|caught|reason|cause)\??\.message\b|String\(\s*(e|err|error|ex|caught)\s*\)|\bstderr\b|\bstdout\b|\.text\(\)|\bsnippet\(|\$\{\s*(e|err|error)\s*\})/;
const SETTING = /["'`][^"'`\n]*\b[A-Z][A-Z0-9]*_[A-Z0-9_]*(URL|KEY|SECRET|TOKEN|PASSWORD|USERNAME|ENC|TO|BASE|ID)\b[^"'`\n]*["'`]/;
const LOGGING = /\b(console\.(error|warn|log|info|debug)|logFailure|logError|log\.(error|warn|info)|logger\.)\s*\(/;

const problems = [];
let checked = 0;
for (const dir of DIRS) {
  for (const rel of files(dir)) {
    if (SKIP.some((re) => re.test(rel))) continue;
    checked++;
    const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      if (/public-error-ok:/.test(line) || LOGGING.test(line)) return;
      if ((SHOWN_FIELD.test(line) || SETTER.test(line)) && RAW.test(line)) problems.push(`${rel}:${i + 1}  raw text into a shown field  · ${t.slice(0, 120)}`);
      else if ((SHOWN_FIELD.test(line) || SETTER.test(line)) && SETTING.test(line)) problems.push(`${rel}:${i + 1}  a setting named in a shown message  · ${t.slice(0, 120)}`);
    });
  }
}

// A response status of 502 or 504 never reaches a person in production: Cloudflare replaces the origin's body with its
// own error page (seen 2026-10-14). An upstream failure answers 503 with upstreamStatus (lib/public-error.ts
// upstreamFailure / surfaceStatus); our own failure answers 500. Every file of the three services, tools included.
const GATEWAY = /(status:\s*50[24]\b|failure\(\s*50[24]\b|writeHead\(\s*50[24]\b|statusCode\s*\|\|\s*50[24]\b|,\s*50[24]\s*\)\s*;|\?\s*50[24]\s*:\s*\w|:\s*50[24]\s*\}|\?\?\s*50[24]\b|let status = 50[24]\b)/;
let gatewayChecked = 0;
for (const dir of DIRS) {
  for (const rel of files(dir)) {
    if (/node_modules|\.test\.|\/__tests__\//.test(rel) || /^lib\/public-error\.ts$/.test(rel)) continue;
    gatewayChecked++;
    fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n").forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || /public-error-ok:/.test(line)) return;
      if (GATEWAY.test(line)) problems.push(`${rel}:${i + 1}  answers 502 or 504, which Cloudflare replaces with its own page — answer 503 (upstream) or 500 (ours)  · ${t.slice(0, 110)}`);
    });
  }
}

if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`);
  console.log(`\n${problems.length} FAILED · ${checked} files checked. Log the detail (lib/public-error.ts) and show our own words, or say why with public-error-ok:.`);
  process.exit(1);
}
console.log(`PASS  no raw error text or setting names in shown fields (${checked} files)\nPASS  no response answers 502 or 504 (${gatewayChecked} files)\n\nALL PASSED`);
