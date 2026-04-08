import fs from "node:fs";
import path from "node:path";

function stripQuotes(value) {
  const v = String(value || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export function loadEnvFromProjectRoot(cwd = process.cwd()) {
  const envPath = path.join(cwd, ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] != null) continue;
    const value = stripQuotes(line.slice(eq + 1));
    process.env[key] = value;
  }
}
