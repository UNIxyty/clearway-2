/**
 * Batch GEN 1.2 + AD 2 PDFs for countries that **passed** the AIM probe (HTTP OK + HTML),
 * using only providers that already have CLI scripts (INAC Venezuela, M-NAV North Macedonia).
 *
 * The probe list has 70+ HTML "passes", but most are ASECNA / Eurocontrol / SPA — those are
 * reported as skipped until separate integrations exist. Extend `data/aim-batch-ad2-icao.json`
 * and the SUPPORTED set below as you add providers.
 *
 * Usage:
 *   node scripts/aim-batch-gen12-ad2-from-probe.mjs
 *   node scripts/aim-batch-gen12-ad2-from-probe.mjs --probe test-results/aim-links-probe-report.json
 *   node scripts/aim-batch-gen12-ad2-from-probe.mjs --dry-run
 *   node scripts/aim-batch-gen12-ad2-from-probe.mjs --insecure-inac
 *
 * Outputs: same dirs as underlying CLIs (`downloads/inac-venezuela-eaip/`, `downloads/mnav-north-macedonia-eaip/`).
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

/** `suggestedIntegration` values we can run today (see aim-links-probe.mjs). */
const SUPPORTED = new Set(["inac-venezuela-eaip-cli", "mnav-north-macedonia-eaip-cli"]);

const DEFAULT_PROBE = join(PROJECT_ROOT, "test-results", "aim-links-probe-report.json");
const DEFAULT_ICAO_MAP = join(PROJECT_ROOT, "data", "aim-batch-ad2-icao.json");
const MANIFEST_DIR = join(PROJECT_ROOT, "downloads", "aim-batch-gen12-ad2");
const NODE = process.execPath;

function parseArgs(argv) {
  let probePath = DEFAULT_PROBE;
  let icaoMapPath = DEFAULT_ICAO_MAP;
  let dryRun = false;
  let insecureInac = false;
  /** If true, run INAC/M-NAV rows even when probe failed (e.g. TLS). */
  let includeIntegrationFailures = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--probe" && argv[i + 1]) probePath = argv[++i];
    else if (a === "--icao-map" && argv[i + 1]) icaoMapPath = argv[++i];
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--insecure-inac") insecureInac = true;
    else if (a === "--include-integration-failures") includeIntegrationFailures = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/aim-batch-gen12-ad2-from-probe.mjs [options]

Options:
  --probe PATH                      aim-links-probe-report.json (${DEFAULT_PROBE})
  --icao-map PATH                   country name -> ICAO for AD2 (${DEFAULT_ICAO_MAP})
  --dry-run                         Print planned spawns only
  --insecure-inac                   Set INAC_TLS_INSECURE=1 for Venezuela steps
  --include-integration-failures  Also run INAC/M-NAV when probe failed (e.g. inac.gob.ve TLS)

By default only probe OK + HTML rows are used. The 70+ HTML passes are mostly ASECNA/others —
only INAC and M-NAV are implemented here; see skipped histogram.`);
      process.exit(0);
    }
  }
  return { probePath, icaoMapPath, dryRun, insecureInac, includeIntegrationFailures };
}

function isPassedHtml(row) {
  const p = row.probe;
  if (!p || p.classification === "no-url") return false;
  if (!p.ok) return false;
  return p.classification === "html" || p.classification === "html-error-status";
}

function runNodeScript(relScript, args, envExtra = {}) {
  const scriptPath = join(PROJECT_ROOT, relScript);
  const env = { ...process.env, ...envExtra };
  const r = spawnSync(NODE, [scriptPath, ...args], { cwd: PROJECT_ROOT, env, stdio: "inherit" });
  return r.status === 0;
}

function main() {
  const { probePath, icaoMapPath, dryRun, insecureInac, includeIntegrationFailures } = parseArgs(
    process.argv,
  );

  const report = JSON.parse(readFileSync(probePath, "utf8"));
  const icaoByCountry = JSON.parse(readFileSync(icaoMapPath, "utf8"));
  if (typeof icaoByCountry !== "object" || icaoByCountry === null) {
    throw new Error("ICAO map must be a JSON object");
  }

  const rows = report.rows || [];
  const passedHtml = rows.filter(isPassedHtml);
  let supportedRows = passedHtml.filter((r) => SUPPORTED.has(r.suggestedIntegration));
  if (includeIntegrationFailures) {
    const failedButSupported = rows.filter(
      (r) => SUPPORTED.has(r.suggestedIntegration) && !isPassedHtml(r),
    );
    const seen = new Set(supportedRows.map((r) => r.country));
    for (const r of failedButSupported) {
      if (!seen.has(r.country)) {
        supportedRows.push(r);
        seen.add(r.country);
      }
    }
    console.error(
      `--include-integration-failures: added ${failedButSupported.length} row(s) (deduped by country) for INAC/M-NAV.\n`,
    );
  }

  const skippedByIntegration = new Map();
  for (const r of passedHtml) {
    if (SUPPORTED.has(r.suggestedIntegration)) continue;
    const k = r.suggestedIntegration || "unknown";
    skippedByIntegration.set(k, (skippedByIntegration.get(k) || 0) + 1);
  }

  console.error(`\nProbe: ${probePath}`);
  console.error(`Passed (HTML, ok): ${passedHtml.length} / ${rows.length} rows`);
  console.error(`Supported integrations (${[...SUPPORTED].join(", ")}): ${supportedRows.length} row(s) to run\n`);

  const manifest = {
    generatedAt: new Date().toISOString(),
    probePath,
    ran: [],
    skippedIntegrationHistogram: Object.fromEntries([...skippedByIntegration.entries()].sort((a, b) => b[1] - a[1])),
  };

  for (const row of supportedRows) {
    const country = row.country;
    const integration = row.suggestedIntegration;
    const icao = icaoByCountry[country];
    const entry = { country, integration, icao: icao ?? null, gen12: false, ad2: false };

    console.error(`--- ${country} (${integration}) ---`);

    if (integration === "inac-venezuela-eaip-cli") {
      const env = insecureInac ? { INAC_TLS_INSECURE: "1" } : {};
      const genArgs = ["--only", "GEN 1.2"];
      console.error(`  GEN 1.2: node scripts/inac-venezuela-eaip-gen-download.mjs ${genArgs.join(" ")}`);
      if (!dryRun) {
        entry.gen12 = runNodeScript("scripts/inac-venezuela-eaip-gen-download.mjs", genArgs, env);
      } else {
        entry.gen12 = true;
      }

      if (icao && /^[A-Z]{4}$/i.test(icao)) {
        const adArgs = ["--icao", icao.toUpperCase()];
        console.error(`  AD 2.1: node scripts/inac-venezuela-eaip-ad2-download.mjs ${adArgs.join(" ")}`);
        if (!dryRun) {
          entry.ad2 = runNodeScript("scripts/inac-venezuela-eaip-ad2-download.mjs", adArgs, env);
        } else {
          entry.ad2 = true;
        }
      } else {
        console.error(`  AD 2.1: skipped (add "${country}" to data/aim-batch-ad2-icao.json)`);
      }
    }

    if (integration === "mnav-north-macedonia-eaip-cli") {
      const genArgs = ["--only", "GEN 1.2"];
      console.error(`  GEN 1.2: node scripts/mnav-north-macedonia-eaip-gen-download.mjs ${genArgs.join(" ")}`);
      if (!dryRun) {
        entry.gen12 = runNodeScript("scripts/mnav-north-macedonia-eaip-gen-download.mjs", genArgs);
      } else {
        entry.gen12 = true;
      }

      if (icao && /^[A-Z]{4}$/i.test(icao)) {
        const adArgs = ["--icao", icao.toUpperCase()];
        console.error(`  AD 2 Textpages: node scripts/mnav-north-macedonia-eaip-ad2-download.mjs ${adArgs.join(" ")}`);
        if (!dryRun) {
          entry.ad2 = runNodeScript("scripts/mnav-north-macedonia-eaip-ad2-download.mjs", adArgs);
        } else {
          entry.ad2 = true;
        }
      } else {
        console.error(`  AD 2: skipped (add "${country}" to data/aim-batch-ad2-icao.json)`);
      }
    }

    manifest.ran.push(entry);
    console.error("");
  }

  console.error("Skipped passed-HTML rows by integration hint (add scrapers to clear these):");
  for (const [k, n] of [...skippedByIntegration.entries()].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${n}\t${k}`);
  }

  mkdirSync(MANIFEST_DIR, { recursive: true });
  const mfPath = join(MANIFEST_DIR, `manifest-${Date.now()}.json`);
  writeFileSync(mfPath, JSON.stringify(manifest, null, 2), "utf8");
  console.error(`\nWrote ${mfPath}`);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
