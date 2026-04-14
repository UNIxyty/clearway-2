#!/usr/bin/env node
/**
 * AIP sync server – run on EC2. Receives sync requests and runs EAD download + extract,
 * then returns the result (and optionally uploads to S3). Uses the same SYNC_SECRET as
 * the NOTAM sync server so the portal can use NOTAM_SYNC_SECRET for both.
 *
 * Usage: SYNC_SECRET=your-secret EAD_USER=... EAD_PASSWORD_ENC=... node scripts/aip-sync-server.mjs
 * Port: 3002 (or AIP_SYNC_PORT)
 */

import { createServer } from "http";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const EAD_AIP_DIR = join(PROJECT_ROOT, "data", "ead-aip");
const EAD_GEN_DIR = join(PROJECT_ROOT, "data", "ead-gen");
const RUS_AIP_RUNS_DIR = join(PROJECT_ROOT, "downloads", "rus-aip", "by-icao");
const PORT = Number(process.env.AIP_SYNC_PORT) || 3002;
const SYNC_SECRET = process.env.SYNC_SECRET || "";
const RUN_TIMEOUT_MS = 600_000; // 10 min per step (large AD2 PDFs can be slow on source hosts)

const DOWNLOAD_SCRIPT = "scripts/ead-download-aip-pdf.mjs";
const RUS_DOWNLOAD_SCRIPT = join(PROJECT_ROOT, "scripts", "rus_aip_download_by_icao.py");
const GEN_SCRIPT = "scripts/ead-download-gen-pdf.mjs";
const META_EXTRACT_SCRIPT = join(PROJECT_ROOT, "aip-meta-extractor.py");
const EXTRACTED_PATH = join(PROJECT_ROOT, "data", "ead-aip-extracted.json");
const RUSSIA_ICAO_PREFIXES = new Set(["UE", "UH", "UI", "UL", "UN", "UR", "US", "UU", "UW"]);
const RWANDA_ICAO_PREFIX = "HR";
const SPAIN_LE_GEN_ALIAS_ICAOS = new Set([
  "GCFV",
  "GCGM",
  "GCHI",
  "GCLA",
  "GCLP",
  "GCRR",
  "GCTS",
  "GCXM",
  "GCXO",
  "GEML",
  "GSAI",
  "GSVO",
]);
const RWANDA_FR_MENU_URL = "https://aim.asecna.aero/html/eAIP/FR-menu-fr-FR.html";
const SCRAPER_COUNTRY_SPECS = [
  {
    country: "Bahrain",
    prefixes: ["OB"],
    script: "scripts/web-table-scrapers/bahrain-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "bahrain-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "bahrain-eaip", "GEN"),
  },
  {
    country: "Belarus",
    prefixes: ["UM"],
    script: "scripts/web-table-scrapers/belarus-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "belarus-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "belarus-eaip", "GEN"),
  },
  {
    country: "Bhutan",
    prefixes: ["VQ"],
    script: "scripts/web-table-scrapers/bhutan-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "bhutan-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "bhutan-aip", "GEN"),
  },
  {
    country: "Bosnia and Herzegovina",
    prefixes: ["LQ"],
    script: "scripts/web-table-scrapers/bosnia-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "bosnia-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "bosnia-eaip", "GEN"),
  },
  {
    country: "Republic of Cabo Verde",
    prefixes: ["GV"],
    script: "scripts/web-table-scrapers/cabo-verde-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "cabo-verde-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "cabo-verde-eaip", "GEN"),
  },
  {
    country: "Chile",
    prefixes: ["SC"],
    script: "scripts/web-table-scrapers/chile-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "chile-aip", "AD2A"),
    genDir: join(PROJECT_ROOT, "downloads", "chile-aip", "GEN"),
  },
  {
    country: "Costa Rica",
    prefixes: ["MR"],
    script: "scripts/web-table-scrapers/costa-rica-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "costa-rica-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "costa-rica-eaip", "GEN"),
  },
  {
    country: "Cuba",
    prefixes: ["MU"],
    script: "scripts/web-table-scrapers/cuba-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "cuba-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "cuba-aip", "GEN"),
  },
  {
    country: "Ecuador",
    prefixes: ["SE"],
    script: "scripts/web-table-scrapers/ecuador-ifis3-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "ecuador-ifis3", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "ecuador-ifis3", "GEN"),
  },
  {
    country: "El Salvador",
    prefixes: ["MS"],
    script: "scripts/web-table-scrapers/el-salvador-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "el-salvador-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "el-salvador-eaip", "GEN"),
  },
  {
    country: "Guatemala",
    prefixes: ["MG"],
    script: "scripts/web-table-scrapers/guatemala-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "guatemala-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "guatemala-eaip", "GEN"),
  },
  {
    country: "Honduras",
    prefixes: ["MH"],
    script: "scripts/web-table-scrapers/honduras-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "honduras-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "honduras-eaip", "GEN"),
  },
  {
    country: "Hong Kong",
    prefixes: ["VH", "VM"],
    script: "scripts/web-table-scrapers/hong-kong-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "hong-kong-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "hong-kong-eaip", "GEN"),
  },
  {
    country: "India",
    prefixes: ["VA", "VE", "VI", "VO"],
    script: "scripts/web-table-scrapers/india-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "india-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "india-eaip", "GEN"),
  },
  {
    country: "Israel",
    prefixes: ["LL"],
    script: "scripts/web-table-scrapers/israel-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "israel-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "israel-eaip", "GEN"),
  },
  {
    country: "South Korea",
    prefixes: ["RK"],
    script: "scripts/web-table-scrapers/korea-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "korea-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "korea-eaip", "GEN"),
  },
  {
    country: "Kosovo",
    prefixes: ["BK"],
    script: "scripts/web-table-scrapers/kosovo-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "kosovo-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "kosovo-eaip", "GEN"),
  },
  {
    country: "Kuwait",
    prefixes: ["OK"],
    script: "scripts/web-table-scrapers/kuwait-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "kuwait-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "kuwait-aip", "GEN"),
  },
  {
    country: "Libya",
    prefixes: ["HL"],
    script: "scripts/web-table-scrapers/libya-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "libya-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "libya-aip", "GEN"),
  },
  {
    country: "Malaysia",
    prefixes: ["WM", "WB"],
    excludedIcaos: ["WBSB"],
    script: "scripts/web-table-scrapers/malaysia-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "malaysia-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "malaysia-aip", "GEN"),
  },
  {
    country: "Maldives",
    prefixes: ["VR"],
    script: "scripts/web-table-scrapers/maldives-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "maldives-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "maldives-aip", "GEN"),
  },
  {
    country: "Mongolia",
    prefixes: ["ZM"],
    script: "scripts/web-table-scrapers/mongolia-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "mongolia-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "mongolia-eaip", "GEN"),
  },
  {
    country: "Myanmar",
    prefixes: ["VY"],
    script: "scripts/web-table-scrapers/myanmar-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "myanmar-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "myanmar-eaip", "GEN"),
  },
  {
    country: "Nepal",
    prefixes: ["VN"],
    script: "scripts/web-table-scrapers/nepal-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "nepal-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "nepal-aip", "GEN"),
  },
  {
    country: "North Macedonia",
    prefixes: ["LW"],
    script: "scripts/web-table-scrapers/north-macedonia-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "north-macedonia-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "north-macedonia-eaip", "GEN"),
  },
  {
    country: "Pakistan",
    prefixes: ["OP"],
    script: "scripts/web-table-scrapers/pakistan-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "pakistan-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "pakistan-eaip", "GEN"),
  },
  {
    country: "Panama",
    prefixes: ["MP"],
    script: "scripts/web-table-scrapers/panama-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "panama-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "panama-aip", "GEN"),
  },
  {
    country: "Qatar",
    prefixes: ["OT"],
    script: "scripts/web-table-scrapers/qatar-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "qatar-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "qatar-eaip", "GEN"),
  },
  {
    country: "Rwanda",
    prefixes: ["HR"],
    script: "scripts/web-table-scrapers/rwanda-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "rwanda-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "rwanda-eaip", "GEN"),
  },
  {
    country: "Saudi Arabia",
    prefixes: ["OE"],
    script: "scripts/web-table-scrapers/saudi-arabia-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "saudi-arabia-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "saudi-arabia-eaip", "GEN"),
  },
  {
    country: "Somalia",
    prefixes: ["HC"],
    script: "scripts/web-table-scrapers/somalia-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "somalia-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "somalia-eaip", "GEN"),
  },
  {
    country: "Sri Lanka",
    prefixes: ["VC"],
    script: "scripts/web-table-scrapers/sri-lanka-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "sri-lanka-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "sri-lanka-aip", "GEN"),
  },
  {
    country: "Taiwan",
    prefixes: ["RC"],
    script: "scripts/web-table-scrapers/taiwan-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "taiwan-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "taiwan-eaip", "GEN"),
  },
  {
    country: "Tajikistan",
    prefixes: [],
    extraIcaos: ["UTDD", "UTDK", "UTDL", "UTDT"],
    script: "scripts/web-table-scrapers/tajikistan-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "tajikistan-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "tajikistan-aip", "GEN"),
  },
  {
    country: "Thailand",
    prefixes: ["VT"],
    script: "scripts/web-table-scrapers/thailand-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "thailand-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "thailand-eaip", "GEN"),
  },
  {
    country: "Turkmenistan",
    prefixes: [],
    extraIcaos: ["UTAA", "UTAE", "UTAK", "UTAM", "UTAN", "UTAT", "UTAV"],
    script: "scripts/web-table-scrapers/turkmenistan-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "turkmenistan-aip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "turkmenistan-aip", "GEN"),
  },
  {
    country: "United Arab Emirates",
    aliases: ["UAE"],
    prefixes: ["OM"],
    script: "scripts/web-table-scrapers/uae-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "uae-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "uae-eaip", "GEN"),
  },
  {
    country: "Uzbekistan",
    prefixes: ["UZ"],
    script: "scripts/web-table-scrapers/uzbekistan-ais-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "uzbekistan-ais", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "uzbekistan-ais", "GEN"),
  },
  {
    country: "Venezuela",
    prefixes: ["SV"],
    script: "scripts/web-table-scrapers/venezuela-eaip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "venezuela-eaip", "AD2"),
    genDir: join(PROJECT_ROOT, "downloads", "venezuela-eaip", "GEN"),
  },
  {
    country: "Japan",
    prefixes: ["RJ", "RO"],
    script: "scripts/web-table-scrapers/japan-aip-interactive.mjs",
    ad2Dir: join(PROJECT_ROOT, "downloads", "japan-aip", "FULL"),
    genDir: join(PROJECT_ROOT, "downloads", "japan-aip", "FULL"),
  },
];

function requireAuth(req) {
  if (!SYNC_SECRET) return true;
  const header = req.headers["x-sync-secret"];
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const querySecret = url.searchParams.get("secret");
  return (header && header === SYNC_SECRET) || (querySecret && querySecret === SYNC_SECRET);
}

/** Map thrown errors to client-facing payload; detect OpenRouter insufficient credits (402). */
function syncFailurePayload(err) {
  const msg = err?.message ?? String(err);
  const base = { error: "Sync failed", detail: msg };
  if (/OpenRouter API 402\b/.test(msg) || /"code"\s*:\s*402/.test(msg) || /Insufficient credits/i.test(msg)) {
    let shortDetail = "Insufficient credits — add credits at https://openrouter.ai/settings/credits";
    const um = msg.match(/"message"\s*:\s*"([^"]+)"/);
    if (um) shortDetail = um[1];
    return { error: "Insufficient API credits", detail: shortDetail, code: 402 };
  }
  return base;
}

function run(cmd, args, env = process.env, onStdoutLine = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: PROJECT_ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const emitLines = (text) => {
      if (typeof onStdoutLine !== "function") return;
      const lines = String(text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) onStdoutLine(line);
    };
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      emitLines(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      // Some scraper progress logs are printed to stderr (e.g., chunk progress).
      // Forward them so portal loading UI can show live download progress.
      emitLines(text);
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timeout: ${cmd} ${args.join(" ")}`));
    }, RUN_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`${cmd} exited ${code}: ${(stderr || stdout).slice(-500)}`));
      else resolve();
    });
  });
}

async function runDownload(icao) {
  const scraper = getScraperSpecByIcao(icao);
  if (scraper) {
    const args = [scraper.script, "--download-ad2", resolveScraperDownloadIcao(icao)];
    if (scraper.country === "Nepal" || scraper.country === "Pakistan" || scraper.country === "Sri Lanka" || scraper.country === "Venezuela") args.push("--insecure");
    await run("node", args, process.env);
    return;
  }
  if (isRussiaIcao(icao)) {
    await run("python3", [RUS_DOWNLOAD_SCRIPT, "--icao", icao], process.env);
    return;
  }
  if (isRwandaIcao(icao)) {
    // Rwanda uses ASECNA HTTP flow in ead-download-aip-pdf.mjs, no browser required.
    await run("node", [DOWNLOAD_SCRIPT, icao], process.env);
    return;
  }
  await run("xvfb-run", ["-a", "-s", "-screen 0 1920x1200x24", "node", DOWNLOAD_SCRIPT, icao]);
}

function mapMetaToAirportRow(meta, icao) {
  return {
    "Publication Date": meta.publication_date || "NIL",
    "Airport Code": meta.airport_code || icao,
    "Airport Name": meta.airport_name || "NIL",
    "AD2.2 Types of Traffic Permitted": meta.ad2_2_types_of_traffic || "NIL",
    "AD2.2 Remarks": meta.ad2_2_remarks || "NIL",
    "AD2.2 AD Operator": meta.ad2_2_operator_name || "NIL",
    "AD2.2 Address": meta.ad2_2_address || "NIL",
    "AD2.2 Telephone": meta.ad2_2_telephone || "NIL",
    "AD2.2 Telefax": meta.ad2_2_telefax || "NIL",
    "AD2.2 E-mail": meta.ad2_2_email || "NIL",
    "AD2.2 AFS": meta.ad2_2_afs || "NIL",
    "AD2.2 Website": meta.ad2_2_website || "NIL",
    "AD2.3 AD Operator": meta.ad2_3_ad_operator || "NIL",
    "AD 2.3 Customs and Immigration": meta.ad2_3_customs_immigration || "NIL",
    "AD2.3 ATS": meta.ad2_3_ats || "NIL",
    "AD2.3 Remarks": meta.ad2_3_remarks || "NIL",
    "AD2.6 AD category for fire fighting": meta.ad2_6_fire_fighting_category || "NIL",
    "AD2.12 Runway Number":
      meta.ad2_12_runway_number || meta.ad2_12_runway_designators || "NIL",
    "AD2.12 Runway Dimensions": meta.ad2_12_runway_dimensions || "NIL",
  };
}

async function runExtract(icao, progress = null) {
  const pdfPath = findDownloadedPdf(icao);
  if (!pdfPath) {
    throw new Error(`Downloaded PDF not found for ${icao}`);
  }
  const tempOut = join(PROJECT_ROOT, "data", "ead-aip", `${icao}-meta.json`);
  await run(
    "python3",
    [META_EXTRACT_SCRIPT, pdfPath, "--out", tempOut, "--quiet"],
    process.env,
    (line) => {
      if (!progress) return;
      progress(line);
    }
  );
  const metaRaw = readFileSync(tempOut, "utf8");
  const meta = JSON.parse(metaRaw);
  try {
    unlinkSync(tempOut);
  } catch (_) {}

  const airportRow = mapMetaToAirportRow(meta, icao);
  const out = {
    source: "EAD AD 2 PDFs (unified meta extractor)",
    extracted: new Date().toISOString(),
    airports: [airportRow],
  };
  writeFileSync(EXTRACTED_PATH, JSON.stringify(out, null, 2), "utf8");
}

function readExtracted() {
  if (!existsSync(EXTRACTED_PATH)) return null;
  const raw = readFileSync(EXTRACTED_PATH, "utf8");
  return JSON.parse(raw);
}

async function uploadToS3() {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) return;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const body = readFileSync(EXTRACTED_PATH, "utf8");
  const client = new S3Client({ region });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: "aip/ead-aip-extracted.json",
      Body: body,
      ContentType: "application/json",
    })
  );
}

async function deleteOldFromS3(icao, namespace = "ead") {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) return;
  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const keys = namespace === "scraper"
    ? [`aip/scraper/${icao}.json`, `aip/scraper-pdf/${icao}.pdf`]
    : [`aip/ead/${icao}.json`, `aip/ead-pdf/${icao}.pdf`];
  for (const Key of keys) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
    } catch (_) {}
  }
}

function findDownloadedPdf(icao) {
  const scraper = getScraperSpecByIcao(icao);
  if (scraper) {
    if (!existsSync(scraper.ad2Dir)) return null;
    const requested = String(icao || "").toUpperCase();
    const alias = resolveScraperDownloadIcao(requested);
    const matchCodes = Array.from(new Set([requested, alias]));
    const files = readdirSync(scraper.ad2Dir).filter((f) => {
      if (!f.endsWith(".pdf")) return false;
      const upper = f.toUpperCase();
      return matchCodes.some((code) => upper.includes(code));
    });
    if (files.length === 0) return null;
    files.sort((a, b) => {
      try {
        return statSync(join(scraper.ad2Dir, b)).mtimeMs - statSync(join(scraper.ad2Dir, a)).mtimeMs;
      } catch {
        return 0;
      }
    });
    return join(scraper.ad2Dir, files[0]);
  }

  if (isRussiaIcao(icao)) {
    if (!existsSync(RUS_AIP_RUNS_DIR)) return null;
    const icaoUpper = icao.toUpperCase();
    const runDirs = readdirSync(RUS_AIP_RUNS_DIR)
      .filter((name) => name.toUpperCase().endsWith(`_${icaoUpper}`))
      .map((name) => join(RUS_AIP_RUNS_DIR, name))
      .filter((dirPath) => {
        try {
          return statSync(dirPath).isDirectory();
        } catch {
          return false;
        }
      });

    runDirs.sort((a, b) => {
      try {
        return statSync(b).mtimeMs - statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    });

    for (const dir of runDirs) {
      const pdf = join(dir, "airport", "aip-main.pdf");
      if (existsSync(pdf)) return pdf;
    }
    return null;
  }

  if (!existsSync(EAD_AIP_DIR)) return null;
  const icaoUpper = icao.toUpperCase();
  const files = readdirSync(EAD_AIP_DIR).filter((f) => f.endsWith(".pdf") && f.toUpperCase().includes(icaoUpper));
  if (files.length === 0) return null;
  files.sort((a, b) => {
    try {
      return statSync(join(EAD_AIP_DIR, b)).mtimeMs - statSync(join(EAD_AIP_DIR, a)).mtimeMs;
    } catch (_) {
      return 0;
    }
  });
  return join(EAD_AIP_DIR, files[0]);
}

async function uploadPdfToS3(icao, namespace = "ead") {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) return null;
  const pdfPath = findDownloadedPdf(icao);
  if (!pdfPath) {
    throw new Error(`Downloaded PDF not found for ${icao}`);
  }
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const body = readFileSync(pdfPath);
  if (body.length < 32 || !body.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`Invalid PDF artifact for ${icao}: ${pdfPath}`);
  }
  const key = namespace === "scraper" ? `aip/scraper-pdf/${icao}.pdf` : `aip/ead-pdf/${icao}.pdf`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/pdf",
    })
  );
  return key;
}

async function uploadPerIcaoToS3(icao, data, namespace = "ead") {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket || !data?.airports) return;
  const match = data.airports.find((a) => (a["Airport Code"] ?? "").toUpperCase() === icao);
  if (!match) return;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const body = JSON.stringify({
    airports: [match],
    updatedAt: new Date().toISOString(),
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: namespace === "scraper" ? `aip/scraper/${icao}.json` : `aip/ead/${icao}.json`,
      Body: body,
      ContentType: "application/json",
    })
  );
}

async function runGenDownload(prefix) {
  await run("xvfb-run", ["-a", "-s", "-screen 0 1920x1200x24", "node", GEN_SCRIPT, prefix]);
}

function isRussiaIcao(icao) {
  const upper = String(icao || "").trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(upper) && RUSSIA_ICAO_PREFIXES.has(upper.slice(0, 2));
}

function isRwandaIcao(icao) {
  const upper = String(icao || "").trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(upper) && upper.slice(0, 2) === RWANDA_ICAO_PREFIX;
}

function isBahrainIcao(icao) {
  return isScraperIcao(icao);
}

function getScraperSpecByIcao(icao) {
  const upper = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(upper)) return null;
  for (const s of SCRAPER_COUNTRY_SPECS) {
    if ((s.extraIcaos || []).includes(upper) && !(s.excludedIcaos || []).includes(upper)) return s;
  }
  const prefix = upper.slice(0, 2);
  return SCRAPER_COUNTRY_SPECS.find((s) => s.prefixes.includes(prefix) && !(s.excludedIcaos || []).includes(upper)) || null;
}

function resolveScraperDownloadIcao(icao) {
  const upper = String(icao || "").trim().toUpperCase();
  // Pakistan package currently publishes Islamabad as OPIS. OPRN is legacy.
  if (upper === "OPRN") return "OPIS";
  return upper;
}

function isScraperIcao(icao) {
  return Boolean(getScraperSpecByIcao(icao));
}

function resolveRwandaTocUrl(menuHtmlWithButton) {
  const m =
    menuHtmlWithButton.match(/id\s*=\s*["']AIP_RWANDA["'][\s\S]*?href\s*=\s*["']([^"']+)["']/i) ||
    menuHtmlWithButton.match(/href\s*=\s*["']([^"']+)["'][\s\S]*?id\s*=\s*["']AIP_RWANDA["']/i);
  const raw = (m?.[1] || "").replace(/\\/g, "/");
  if (!raw) throw new Error("AIP RWANDA link not found in FR menu.");
  return new URL(raw, "https://aim.asecna.aero/html/eAIP/").href;
}

function resolveRwandaMenuUrl(tocFramesetHtml, tocUrl) {
  const m =
    tocFramesetHtml.match(/<frame[^>]*name=["']eAISNavigation["'][^>]*src=["']([^"']+)["']/i) ||
    tocFramesetHtml.match(/<frame[^>]*src=["']([^"']*menu\.html[^"']*)["']/i);
  const src = m?.[1];
  if (!src) throw new Error("Rwanda menu frame URL not found.");
  return new URL(src, tocUrl).href;
}

function parseRwandaGen12Href(menuHtml) {
  const m = menuHtml.match(/href=['"]([^'"]*GEN[^'"]*1\.2[^'"]*)['"]/i);
  if (!m?.[1]) throw new Error("GEN 1.2 link not found in Rwanda menu.");
  return m[1];
}

function rwandaHtmlToPdfUrl(htmlUrl) {
  let out = htmlUrl.replace(/#.*$/, "");
  out = out.replace("-en-GB", "");
  out = out.replace(".html", ".pdf");
  out = out.replace("/eAIP/", "/documents/PDF/");
  return out;
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(filePath, bytes);
}

async function runRwandaGenDownload() {
  const frMenu = await (await fetch(RWANDA_FR_MENU_URL)).text();
  const tocUrl = resolveRwandaTocUrl(frMenu);
  const tocFrameset = await (await fetch(tocUrl)).text();
  const menuUrl = resolveRwandaMenuUrl(tocFrameset, tocUrl);
  const menuHtml = await (await fetch(menuUrl)).text();
  const gen12Href = parseRwandaGen12Href(menuHtml);
  const gen12HtmlUrl = new URL(gen12Href, menuUrl).href;
  const gen12PdfUrl = rwandaHtmlToPdfUrl(gen12HtmlUrl);
  mkdirSync(EAD_GEN_DIR, { recursive: true });
  const outPath = join(EAD_GEN_DIR, `${RWANDA_ICAO_PREFIX}-GEN-1.2.pdf`);
  await downloadToFile(gen12PdfUrl, outPath);
}

async function runGenDownloadForIcao(icao, prefix) {
  const scraper = getScraperSpecByIcao(icao);
  if (scraper) {
    const args = [scraper.script, "--download-gen12"];
    if (scraper.country === "Nepal" || scraper.country === "Pakistan" || scraper.country === "Sri Lanka" || scraper.country === "Venezuela") args.push("--insecure");
    await run("node", args, process.env);
    return;
  }
  if (isRussiaIcao(icao)) {
    await run("python3", [RUS_DOWNLOAD_SCRIPT, "--icao", icao], process.env);
    return;
  }
  if (String(prefix || "").toUpperCase() === RWANDA_ICAO_PREFIX || isRwandaIcao(icao)) {
    await runRwandaGenDownload();
    return;
  }
  const upperIcao = String(icao || "").trim().toUpperCase();
  const normalizedPrefix = SPAIN_LE_GEN_ALIAS_ICAOS.has(upperIcao) ? "LE" : prefix;
  await runGenDownload(normalizedPrefix);
}

function findDownloadedGenPdf(icao, prefix) {
  const scraper = getScraperSpecByIcao(icao);
  if (scraper) {
    if (!existsSync(scraper.genDir)) return null;
    const files = readdirSync(scraper.genDir).filter((f) => f.endsWith(".pdf") && /GEN[-_. ]?1[._-]?2/i.test(f));
    if (!files.length) return null;
    files.sort((a, b) => {
      try {
        return statSync(join(scraper.genDir, b)).mtimeMs - statSync(join(scraper.genDir, a)).mtimeMs;
      } catch {
        return 0;
      }
    });
    return join(scraper.genDir, files[0]);
  }
  if (isRussiaIcao(icao)) {
    if (!existsSync(RUS_AIP_RUNS_DIR)) return null;
    const icaoUpper = icao.toUpperCase();
    const runDirs = readdirSync(RUS_AIP_RUNS_DIR)
      .filter((name) => name.toUpperCase().endsWith(`_${icaoUpper}`))
      .map((name) => join(RUS_AIP_RUNS_DIR, name))
      .filter((dirPath) => {
        try {
          return statSync(dirPath).isDirectory();
        } catch {
          return false;
        }
      });
    runDirs.sort((a, b) => {
      try {
        return statSync(b).mtimeMs - statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    });
    for (const dir of runDirs) {
      const genPdf = join(dir, "gen", "gen-1.2.pdf");
      if (existsSync(genPdf)) return genPdf;
    }
    return null;
  }
  const eadGenPdf = join(EAD_GEN_DIR, `${prefix}-GEN-1.2.pdf`);
  return existsSync(eadGenPdf) ? eadGenPdf : null;
}

async function uploadGenPdfToS3(icao, prefix, namespace = "gen-pdf") {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) return null;
  const pdfPath = findDownloadedGenPdf(icao, prefix);
  if (!pdfPath) {
    throw new Error(`Downloaded GEN PDF not found for ${icao || prefix}`);
  }
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const body = readFileSync(pdfPath);
  if (body.length < 32 || !body.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`Invalid GEN PDF artifact for ${icao || prefix}: ${pdfPath}`);
  }
  const key = namespace === "scraper-gen-pdf" ? `aip/scraper-gen-pdf/${icao}-GEN-1.2.pdf` : `aip/gen-pdf/${prefix}-GEN-1.2.pdf`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/pdf",
    })
  );
  return key;
}

// AIP-only sync steps (sent when stream=1)
const AIP_STEPS = [
  "Deleting old from S3…",
  "Downloading AIP PDF…",
  "PDF uploaded to S3…",
  "Extracting with unified AIP parser…",
  "Uploading to S3…",
];

// GEN-only sync steps (sent when /sync/gen stream=1) – PDF only, no AI rewrite.
const GEN_STEPS = [
  "Downloading GEN PDF…",
  "GEN PDF uploaded to S3…",
  "GEN PDF ready.",
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const icao = url.searchParams.get("icao")?.trim().toUpperCase() || "";
  const stream = url.searchParams.get("stream") === "1" || url.searchParams.get("stream") === "true";
  const shouldExtract = !(url.searchParams.get("extract") === "0" || url.searchParams.get("extract") === "false");
  const scraperRequested = url.searchParams.get("scraper") === "1" || url.searchParams.get("scraper") === "true";
  // —— /sync/gen: GEN-only sync (separate from AIP) ——
  if (url.pathname === "/sync/gen" || url.pathname === "/sync/gen/") {
    const prefix = icao.length >= 2 ? icao.slice(0, 2).toUpperCase() : (url.searchParams.get("prefix")?.trim().toUpperCase() || "");
    const effectivePrefix = SPAIN_LE_GEN_ALIAS_ICAOS.has(icao) ? "LE" : prefix;
    if (!/^[A-Z]{2}$/.test(prefix)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Valid icao or prefix required (e.g. icao=EDQA or prefix=ED)" }));
      return;
    }
    if (!requireAuth(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    const useScraperFlow = scraperRequested || isScraperIcao(icao);
    const send = (obj) => {
      if (!stream) return;
      res.write("data: " + JSON.stringify(obj) + "\n\n");
    };
    if (stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      send({ step: GEN_STEPS[0] });
    } else {
      res.setHeader("Content-Type", "application/json");
    }
    try {
      await runGenDownloadForIcao(icao, effectivePrefix);
      if (process.env.AWS_S3_BUCKET) {
        const uploadedGenKey = await uploadGenPdfToS3(icao, effectivePrefix, useScraperFlow ? "scraper-gen-pdf" : "gen-pdf");
        if (stream) {
          send({ step: GEN_STEPS[1] });
          send({ step: `GEN PDF uploaded: ${uploadedGenKey}` });
          send({ step: "PDF ready", pdfReady: true, type: "gen", prefix: effectivePrefix });
        }
      }
      if (stream) send({ step: GEN_STEPS[2] });
      if (stream) {
        send({ done: true, prefix: effectivePrefix });
        res.end();
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, prefix: effectivePrefix }));
      }
    } catch (genErr) {
      console.error("GEN sync failed for", effectivePrefix, genErr.message);
      const fail = syncFailurePayload(genErr);
      const payload =
        fail.code === 402
          ? { error: "GEN sync failed", detail: fail.detail, code: 402 }
          : { error: "GEN sync failed", detail: genErr.message };
      if (stream) {
        send(payload);
        res.end();
      } else {
        res.writeHead(fail.code === 402 ? 402 : 502);
        res.end(JSON.stringify(payload));
      }
    }
    return;
  }

  // —— /sync: AIP-only sync ——
  if (url.pathname !== "/sync" && url.pathname !== "/sync/") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Valid 4-letter ICAO required (query: icao=XXXX)" }));
    return;
  }

  if (!requireAuth(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const send = (obj) => {
    if (!stream) return;
    res.write("data: " + JSON.stringify(obj) + "\n\n");
  };

  if (stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  } else {
    res.setHeader("Content-Type", "application/json");
  }

  try {
    const useScraperFlow = scraperRequested || isScraperIcao(icao);
    const aipNamespace = useScraperFlow ? "scraper" : "ead";
    send({ step: AIP_STEPS[0] });
    if (process.env.AWS_S3_BUCKET && shouldExtract) await deleteOldFromS3(icao, aipNamespace);
    send({ step: AIP_STEPS[1] });
    await runDownload(icao);
    if (process.env.AWS_S3_BUCKET) {
      const uploadedPdfKey = await uploadPdfToS3(icao, aipNamespace);
      send({ step: AIP_STEPS[2] });
      send({ step: `PDF uploaded: ${uploadedPdfKey}` });
      send({ step: "PDF ready", pdfReady: true, type: "aip", icao });
    }
    let data = null;
    if (shouldExtract) {
      send({ step: AIP_STEPS[3] });
      await runExtract(icao, (line) => {
        const cleaned = line.replace(/^[-•]\s*/, "").trim();
        if (!cleaned) return;
        send({ step: cleaned });
      });
      data = readExtracted();
      send({ step: AIP_STEPS[4] });
      if (process.env.AWS_S3_BUCKET) {
        await uploadToS3();
        await uploadPerIcaoToS3(icao, data, aipNamespace);
      }
    } else {
      send({ step: "Extraction skipped (PDF only)." });
    }
    const payload = {
      done: true,
      ok: true,
      icao,
      airports: data?.airports ?? [],
      source: data?.source ?? null,
    };
    if (stream) {
      send(payload);
      res.end();
    } else {
      res.writeHead(200);
      res.end(JSON.stringify(payload));
    }
  } catch (err) {
    console.error("AIP sync failed for", icao, err);
    const fail = syncFailurePayload(err);
    if (stream) {
      send(fail);
      res.end();
    } else {
      res.writeHead(fail.code === 402 ? 402 : 502);
      res.end(JSON.stringify(fail));
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    "AIP sync server listening on port",
    PORT,
    "| download:",
    DOWNLOAD_SCRIPT,
    "| extract: unified parser"
  );
});
