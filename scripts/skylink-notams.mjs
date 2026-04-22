#!/usr/bin/env node
/**
 * SkyLink NOTAM fetcher for sync server + local storage.
 *
 * Env:
 *  - SKYLINK_API_KEY (required)
 *  - SKYLINK_API_HOST (optional, default skylink-api.p.rapidapi.com)
 *  - SKYLINK_API_BASE_URL (optional, default https://skylink-api.p.rapidapi.com)
 *  - NOTAM_PROGRESS_FILE (optional SSE progress sink)
 *
 * Usage: node scripts/skylink-notams.mjs [--json] <ICAO>
 */

import { appendFileSync } from "fs";
import { saveFile } from "../lib/storage.mjs";

let jsonMode = false;

function progress(msg) {
  const line = `PROGRESS:${msg}\n`;
  if (process.env.NOTAM_PROGRESS_FILE) {
    try {
      appendFileSync(process.env.NOTAM_PROGRESS_FILE, line);
    } catch {}
  }
  if (jsonMode) console.error(line.trim());
}

function formatTime(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{12}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)} UTC`;
  }
  if (/^\d{10}$/.test(text)) {
    const yy = text.slice(0, 2);
    const year = Number(yy) >= 90 ? `19${yy}` : `20${yy}`;
    return `${year}-${text.slice(2, 4)}-${text.slice(4, 6)} ${text.slice(6, 8)}:${text.slice(8, 10)} UTC`;
  }
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toISOString().replace("T", " ").replace(".000Z", " UTC");
  return text;
}

function normalizeNotam(raw, icao) {
  return {
    location: raw?.location || raw?.icao || icao,
    number: raw?.notam_id || raw?.id || raw?.number || "",
    class: raw?.type || raw?.class || "",
    startDateUtc: formatTime(raw?.effective || raw?.start || raw?.startDateUtc),
    endDateUtc: formatTime(raw?.expiration || raw?.end || raw?.endDateUtc),
    condition: String(raw?.body || raw?.raw || raw?.text || "").trim(),
  };
}

function extractNotamArray(payload) {
  if (Array.isArray(payload?.notams)) return payload.notams;
  if (Array.isArray(payload?.data?.notams)) return payload.data.notams;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function fetchSkylinkNotams(icao) {
  const apiKey = process.env.SKYLINK_API_KEY || process.env.RAPIDAPI_KEY || "";
  if (!apiKey) {
    throw new Error("SKYLINK_API_KEY (or RAPIDAPI_KEY) is required.");
  }
  const host = process.env.SKYLINK_API_HOST || "skylink-api.p.rapidapi.com";
  const baseUrl = (process.env.SKYLINK_API_BASE_URL || "https://skylink-api.p.rapidapi.com").replace(/\/$/, "");
  const candidates = [
    `${baseUrl}/v3/notams/${encodeURIComponent(icao)}`,
    `${baseUrl}/notams/${encodeURIComponent(icao)}`,
    `${baseUrl}/notams/${encodeURIComponent(icao.toLowerCase())}`,
  ];

  let lastError = "unknown error";
  for (const url of candidates) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": host,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      lastError = `HTTP ${res.status} @ ${url}: ${text.slice(0, 300)}`;
      continue;
    }
    try {
      const payload = JSON.parse(text);
      const rows = extractNotamArray(payload);
      return rows.map((n) => normalizeNotam(n, icao));
    } catch {
      lastError = `Non-JSON response @ ${url}: ${text.slice(0, 300)}`;
    }
  }
  throw new Error(`SkyLink NOTAM request failed: ${lastError}`);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  jsonMode = process.argv.includes("--json");
  const icao = (args[0] || "EVRA").toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    console.error("Usage: node scripts/skylink-notams.mjs [--json] <ICAO>");
    process.exit(1);
  }

  progress("Fetching NOTAMs from SkyLink API");
  const notams = await fetchSkylinkNotams(icao);

  progress("Saving NOTAMs to storage");
  const key = `notam/${icao}.json`;
  await saveFile(key, JSON.stringify({ icao, notams, updatedAt: new Date().toISOString() }));

  progress("Done");
  if (jsonMode) console.log(JSON.stringify(notams));
  else console.log(`Saved ${notams.length} NOTAM(s) to /storage/${key}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

