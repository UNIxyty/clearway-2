#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const USA_DIR = join(ROOT, "usa-aip");
const AD2_PREFIX = "aip/usa-pdf";
const GEN_KEY = "aip/usa-gen-pdf/GEN-1.2.pdf";

function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] != null) continue;
    const value = line.slice(eq + 1).replace(/^["']|["']$/g, "").trim();
    process.env[key] = value;
  }
}

function isAd2Pdf(name) {
  return /^[A-Z0-9]{4}_ad2\.pdf$/i.test(name);
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const bucket = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";

  if (!existsSync(USA_DIR)) {
    throw new Error(`Folder not found: ${USA_DIR}`);
  }
  if (!bucket && !dryRun) {
    throw new Error("Set AWS_NOTAMS_BUCKET or AWS_S3_BUCKET before uploading.");
  }

  const names = readdirSync(USA_DIR).filter((n) => n.toLowerCase().endsWith(".pdf"));
  const ad2 = names.filter(isAd2Pdf);
  const gen = names.find((n) => n.toUpperCase() === "GEN1.2.PDF");
  if (!gen) throw new Error("Missing usa-aip/GEN1.2.pdf");

  let client = null;
  let PutObjectCommand = null;
  if (!dryRun) {
    const mod = await import("@aws-sdk/client-s3");
    client = new mod.S3Client({ region });
    PutObjectCommand = mod.PutObjectCommand;
  }

  console.log(`[usa-aip-upload] ad2=${ad2.length} gen=1 dryRun=${dryRun ? "yes" : "no"}`);

  for (const file of ad2) {
    const icao = file.slice(0, 4).toUpperCase();
    const key = `${AD2_PREFIX}/${icao}.pdf`;
    const body = readFileSync(join(USA_DIR, file));
    if (dryRun) {
      console.log(`[DRY] ${file} -> s3://${bucket || "BUCKET"}/${key}`);
      continue;
    }
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/pdf",
      }),
    );
    console.log(`[OK] ${file} -> s3://${bucket}/${key}`);
  }

  const genBody = readFileSync(join(USA_DIR, gen));
  if (dryRun) {
    console.log(`[DRY] ${gen} -> s3://${bucket || "BUCKET"}/${GEN_KEY}`);
  } else {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: GEN_KEY,
        Body: genBody,
        ContentType: "application/pdf",
      }),
    );
    console.log(`[OK] ${gen} -> s3://${bucket}/${GEN_KEY}`);
  }
}

main().catch((err) => {
  console.error("[usa-aip-upload] failed:", err?.message || err);
  process.exit(1);
});
