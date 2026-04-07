#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCRAPERS_DIR = path.join(ROOT, "scripts", "web-table-scrapers");
const OUT_DEFAULT = path.join(ROOT, "data", "dynamic-packages.json");

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function titleCaseFromSlug(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function toIcaoFromFilename(name) {
  const up = String(name || "").toUpperCase();
  const m = up.match(/\b([A-Z0-9]{4})\b/);
  return m ? m[1] : null;
}

async function listPdfFiles(dir) {
  try {
    const rows = await fs.readdir(dir, { withFileTypes: true });
    return rows
      .filter((d) => d.isFile() && /\.pdf$/i.test(d.name))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function parseOutDirFromSource(src, kind) {
  const rx =
    kind === "GEN"
      ? /const\s+OUT_GEN\s*=\s*join\([^)]*"downloads"\s*,\s*"([^"]+)"\s*,\s*"GEN"\s*\)/i
      : /const\s+OUT_AD2\s*=\s*join\([^)]*"downloads"\s*,\s*"([^"]+)"\s*,\s*"AD2"\s*\)/i;
  const m = src.match(rx);
  return m?.[1] ?? null;
}

async function collectOne(scriptFile) {
  const scriptPath = path.join(SCRAPERS_DIR, scriptFile);
  const src = await fs.readFile(scriptPath, "utf8");
  const slug = scriptFile.replace(/-interactive\.mjs$/i, "");
  const countryName = titleCaseFromSlug(slug.replace(/-(eaip|aip|ais|ifis3)$/i, ""));

  const outBaseGen = parseOutDirFromSource(src, "GEN");
  const outBaseAd2 = parseOutDirFromSource(src, "AD2");
  const genDir = outBaseGen ? path.join(ROOT, "downloads", outBaseGen, "GEN") : null;
  const ad2Dir = outBaseAd2 ? path.join(ROOT, "downloads", outBaseAd2, "AD2") : null;
  const genFiles = genDir ? await listPdfFiles(genDir) : [];
  const ad2Files = ad2Dir ? await listPdfFiles(ad2Dir) : [];

  const ad2Icaos = Array.from(
    new Set(
      ad2Files
        .map(toIcaoFromFilename)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return {
    countrySlug: slug,
    countryName,
    scriptPath: `scripts/web-table-scrapers/${scriptFile}`,
    runCommand: `node scripts/web-table-scrapers/${scriptFile}`,
    outputDirs: {
      gen: genDir ? path.relative(ROOT, genDir) : null,
      ad2: ad2Dir ? path.relative(ROOT, ad2Dir) : null,
    },
    genFiles,
    ad2Files,
    ad2Icaos,
    generatedFromDownloads: true,
  };
}

async function main() {
  const outPath = argValue("--out", OUT_DEFAULT);
  const rows = await fs.readdir(SCRAPERS_DIR);
  const scraperFiles = rows.filter((f) => f.endsWith("-interactive.mjs")).sort((a, b) => a.localeCompare(b));
  const countries = [];
  for (const f of scraperFiles) {
    countries.push(await collectOne(f));
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "scripts/web-table-scrapers",
    countries,
  };
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[collect-all-packages] wrote ${countries.length} countries -> ${outPath}`);
}

main().catch((err) => {
  console.error("[collect-all-packages] failed:", err?.message || err);
  process.exit(1);
});
