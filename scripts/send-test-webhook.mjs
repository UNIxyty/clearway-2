#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, basename } from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const OUTPUT_DIR = process.env.TEST_RESULTS_DIR || "test-results";
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || process.env.WEBHOOK_URL || "";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const REPORTS_BUCKET = process.env.AWS_S3_BUCKET || "myapp-notams-prod";
const REPORTS_PREFIX = process.env.E2E_REPORTS_S3_PREFIX || "e2e-reports";
const PRESIGN_EXPIRES_SECONDS = Number(process.env.E2E_REPORT_URL_EXPIRES_IN || 259200); // 72h

function latestFile(dir, ext) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .map((name) => ({ path: join(dir, name), mtimeMs: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.path ?? null;
}

function parseArg(name) {
  const full = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(full));
  return arg ? arg.slice(full.length) : "";
}

function getS3Client() {
  return new S3Client({ region: AWS_REGION });
}

async function uploadReportToS3(reportPath) {
  if (!existsSync(reportPath)) {
    throw new Error(`Report file not found: ${reportPath}`);
  }
  const key = `${REPORTS_PREFIX.replace(/\/$/, "")}/${basename(reportPath)}`;
  const body = readFileSync(reportPath, "utf8");
  const client = getS3Client();
  await client.send(new PutObjectCommand({
    Bucket: REPORTS_BUCKET,
    Key: key,
    Body: body,
    ContentType: "text/markdown; charset=utf-8",
  }));
  return key;
}

async function getPresignedReportUrl(key) {
  const client = getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: REPORTS_BUCKET,
      Key: key,
      ResponseContentType: "text/markdown; charset=utf-8",
    }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS }
  );
}

async function getReportUrl(reportPath) {
  const explicit = parseArg("report-url") || process.env.REPORT_URL || "";
  if (explicit) return explicit;
  if (!REPORTS_BUCKET) return "";
  const key = await uploadReportToS3(reportPath);
  const url = await getPresignedReportUrl(key);
  console.log(`Uploaded report to s3://${REPORTS_BUCKET}/${key}`);
  return url;
}

function readSummary(rawJsonPath) {
  if (!rawJsonPath || !existsSync(rawJsonPath)) {
    return { total: 0, passed: 0, failed: 0 };
  }
  const json = JSON.parse(readFileSync(rawJsonPath, "utf8"));
  return {
    total: Number(json?.summary?.totalAirports || 0),
    passed: Number(json?.summary?.passedAirports || 0),
    failed: Number(json?.summary?.failedAirports || 0),
  };
}

async function main() {
  if (!WEBHOOK_URL) {
    throw new Error("Missing webhook URL. Set N8N_WEBHOOK_URL or WEBHOOK_URL.");
  }

  const reportPath = parseArg("report-path") || latestFile(OUTPUT_DIR, ".md");
  if (!reportPath) {
    throw new Error("No report markdown found. Generate report first or pass --report-path=...");
  }
  const rawJsonPath = parseArg("raw-json-path") || latestFile(join(OUTPUT_DIR, "raw"), ".json");
  const summary = readSummary(rawJsonPath);
  const reportUrl = await getReportUrl(reportPath);

  const payload = {
    event: "e2e_test_complete",
    timestamp: new Date().toISOString(),
    summary,
    reportUrl,
    reportFile: basename(reportPath),
    rawResultsFile: rawJsonPath ? basename(rawJsonPath) : null,
  };

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Webhook failed (${response.status}): ${responseText || response.statusText}`);
  }

  console.log("Webhook sent successfully.");
  console.log(`Report file: ${reportPath}`);
  console.log(`Report URL: ${reportUrl || "(not provided)"}`);
  if (responseText) console.log(`Response: ${responseText}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
