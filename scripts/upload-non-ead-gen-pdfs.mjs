#!/usr/bin/env node
/**
 * Upload non-EAD GEN 1.2 PDFs from the `edited/` folder to S3.
 *
 * S3 key pattern: aip/non-ead-gen-pdf/{PREFIX}-GEN-1.2.pdf
 *
 * Usage:
 *   AWS_S3_BUCKET=myapp-notams-prod node scripts/upload-non-ead-gen-pdfs.mjs
 *   node scripts/upload-non-ead-gen-pdfs.mjs --dry-run   # list what would be uploaded
 *
 * Reads AWS credentials from env or ~/.aws/credentials.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const EDITED_DIR = join(PROJECT_ROOT, "edited");

try {
  const envPath = join(PROJECT_ROOT, ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
} catch (_) {}

/**
 * Filename → ICAO 2-letter prefix mapping.
 * Built from first airport ICAO in aip-data.json for each country,
 * plus manual entries for countries not in aip-data.
 */
const FILE_TO_PREFIX = {
  "Afganistan_GEN_edited.pdf": "OA",
  "Andorra GEN.pdf": "AD",       // Andorra has no ICAO airports in data; use conventional prefix
  "Angola_GEN_edited.pdf": "FN",
  "Bahrain GEN.pdf": "OB",
  "Bangladesh_GEN_edited.pdf": "VG",
  "Belarus GEN.pdf": "UM",
  "Benin GEN.pdf": "DB",
  "Bhutan GEN.pdf": "VQ",
  "Burkina Faso GEN.pdf": "DF",
  "Cabo-Verde GEN.pdf": "GV",
  "Canada GEN-GEN1.2-only.pdf": "CY",
  "Central African Republic GEN.pdf": "FE",
  "Comoros GEN.pdf": "FM",
  "Congo GEN.pdf": "FC",
  "Costa-Rica GEN.pdf": "MR",
  "Cuba GEN.pdf": "MU",
  "Djibouti_GEN_edited.pdf": "HD",
  "Equatorial Guinea GEN.pdf": "FG",
  "Ethiopia_GEN_edited.pdf": "HA",
  "Gabon GEN.pdf": "FO",
  "Haiti_GEN_edited.pdf": "MT",
  "Hong-kong GEN.pdf": "VH",
  "India GEN.pdf": "VI",
  "Israel GEN.pdf": "LL",
  "Ivory Coast (C\u00f4te d\u2019Ivoire) GEN.pdf": "DI",
  "Ivory Coast (Côte d'Ivoire) GEN.pdf": "DI",
  "Kosovo GEN.pdf": "BK",
  "Lybia GEN.pdf": "HL",
  "MAURITANIE GEN.pdf": "GQ",
  "Macau_GEN_edited.pdf": "VM",
  "Maldives GEN.pdf": "VR",
  "Mali GEN.pdf": "GA",
  "Mongolia GEN.pdf": "ZM",
  "Nepal GEN.pdf": "VN",
  "Niger GEN.pdf": "DR",
  "Pakistan GEN.pdf": "OP",
  "Qatar GEN.pdf": "OT",
  "Rwanda GEN.pdf": "HR",
  "Saudi Arabia GEN.pdf": "OE",
  "Singapore GEN.pdf": "WS",
  "Somalia GEN.pdf": "HC",
  "South Korea GEN.pdf": "RK",
  "South_Africa_GEN_edited.pdf": "FA",
  "South_Sudan_GEN_edited.pdf": "HS",
  "Sri-lanka GEN.pdf": "VC",
  "Sudan_GEN_edited.pdf": "SU",  // Sudan: use SU to avoid collision with South Sudan (HS)
  "Taiwan GEN.pdf": "RC",
  "Tajikistan GEN.pdf": "UT",
  "Tchad GEN.pdf": "FT",
  "Thailand GEN.pdf": "VT",
  "Togo GEN.pdf": "DX",
  "Turkmennistan GEN.pdf": "TM",  // Turkmenistan: use TM to avoid collision with Tajikistan (UT)
  "UAE GEN.pdf": "OM",
  "canada_edited.pdf": "CY",     // duplicate Canada; skip if CY already uploaded
  "seychelles_GEN_edited.pdf": "FS",
};

const S3_PREFIX = "aip/non-ead-gen-pdf";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";

  if (!bucket && !dryRun) {
    console.error("Set AWS_S3_BUCKET (or use --dry-run)");
    process.exit(1);
  }

  if (!existsSync(EDITED_DIR)) {
    console.error(`Directory not found: ${EDITED_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(EDITED_DIR).filter((f) => f.endsWith(".pdf"));
  const uploaded = new Set();
  let count = 0;

  let client;
  if (!dryRun) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    client = new S3Client({ region });
  }

  for (const file of files) {
    const prefix = FILE_TO_PREFIX[file];
    if (!prefix) {
      console.warn(`  SKIP (no mapping): ${file}`);
      continue;
    }
    if (uploaded.has(prefix)) {
      console.warn(`  SKIP (duplicate prefix ${prefix}): ${file}`);
      continue;
    }

    const key = `${S3_PREFIX}/${prefix}-GEN-1.2.pdf`;
    const localPath = join(EDITED_DIR, file);

    if (dryRun) {
      console.log(`  [DRY] ${file} → s3://${bucket || "BUCKET"}/${key}`);
    } else {
      const body = readFileSync(localPath);
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: "application/pdf",
        })
      );
      console.log(`  ✓ ${file} → s3://${bucket}/${key} (${(body.length / 1024).toFixed(0)} KB)`);
    }
    uploaded.add(prefix);
    count++;
  }

  console.log(`\nDone: ${count} PDFs ${dryRun ? "would be" : ""} uploaded.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
