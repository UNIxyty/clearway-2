#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { join } from "path";
import {
  asecnaAd2AirportBasename,
  createAsecnaFetch,
  htmlUrlToPdfUrl,
  resolveAsecnaHtmlUrl,
} from "../scripts/asecna/asecna-eaip-http.mjs";

const ROOT = process.cwd();
const ASECNA_JSON = join(ROOT, "data", "asecna-airports.json");
const BUCKET = process.env.AWS_S3_BUCKET || process.env.AWS_NOTAMS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const POLL_MS = Number(process.env.ASECNA_WORKER_POLL_MS || "5000");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadAsecnaDb() {
  const json = JSON.parse(readFileSync(ASECNA_JSON, "utf8"));
  const map = new Map();
  for (const country of json.countries || []) {
    for (const airport of country.airports || []) {
      map.set(String(airport.icao || "").toUpperCase(), {
        countryCode: airport.countryCode || country.code,
      });
    }
  }
  return {
    menuBasename: json.menuBasename || "FR-menu-fr-FR.html",
    menuUrl: json.menuUrl || "https://aim.asecna.aero/html/eAIP/FR-menu-fr-FR.html",
    airports: map,
  };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) throw new Error("Missing Supabase env");
  if (!BUCKET) throw new Error("Missing AWS_S3_BUCKET/AWS_NOTAMS_BUCKET");

  const db = loadAsecnaDb();
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const s3 = new S3Client({ region: REGION });
  const http = createAsecnaFetch("WORKER");
  const menuDirUrl = `${new URL(db.menuUrl).origin}/html/eAIP/`;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: jobs, error } = await supabase
      .from("asecna_jobs")
      .select("id,icao,country_code")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(3);
    if (error) {
      console.error("[ASECNA worker] queue read error:", error.message);
      await sleep(POLL_MS);
      continue;
    }
    if (!jobs || jobs.length === 0) {
      await sleep(POLL_MS);
      continue;
    }
    for (const job of jobs) {
      const icao = String(job.icao || "").toUpperCase();
      const byMap = db.airports.get(icao);
      const countryCode = String(job.country_code || byMap?.countryCode || "").padStart(2, "0");
      if (!/^[A-Z0-9]{4}$/.test(icao) || !/^\d{2}$/.test(countryCode)) {
        await supabase
          .from("asecna_jobs")
          .update({ status: "failed", error: "Missing ICAO/country code", updated_at: new Date().toISOString() })
          .eq("id", job.id);
        continue;
      }
      await supabase
        .from("asecna_jobs")
        .update({ status: "running", last_heartbeat: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", job.id);
      try {
        const htmlFile = asecnaAd2AirportBasename(countryCode, icao, db.menuBasename);
        const htmlUrl = resolveAsecnaHtmlUrl(htmlFile, menuDirUrl);
        const pdfUrl = htmlUrlToPdfUrl(htmlUrl);
        const res = await http.fetchAsecna(pdfUrl, {}, { strictTls: false });
        if (!res.ok) throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const s3Key = `aip/asecna-pdf/${icao}.pdf`;
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: s3Key,
            Body: bytes,
            ContentType: "application/pdf",
          }),
        );
        const pdfUrlPublic = `s3://${BUCKET}/${s3Key}`;
        await supabase
          .from("asecna_jobs")
          .update({
            status: "completed",
            s3_key: s3Key,
            pdf_url: pdfUrlPublic,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        await supabase
          .from("airports")
          .update({
            source: "asecna_dynamic",
            source_type: "ASECNA",
            dynamic_updated: true,
            updated_at: new Date().toISOString(),
          })
          .eq("icao", icao);
      } catch (err) {
        await supabase
          .from("asecna_jobs")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    }
  }
}

main().catch((err) => {
  console.error("[ASECNA worker] fatal:", err.message || err);
  process.exit(1);
});
