#!/usr/bin/env node
/**
 * Quick test client for SkyLink NOTAM API.
 *
 * Usage:
 *   SKYLINK_API_KEY=... node scripts/test-skylink-notam.mjs EVRA
 *
 * Optional env:
 *   SKYLINK_API_HOST=skylink-api.p.rapidapi.com
 *   SKYLINK_API_BASE_URL=https://skylink-api.p.rapidapi.com
 */

const icao = (process.argv[2] || "EVRA").trim().toUpperCase();
if (!/^[A-Z0-9]{4}$/.test(icao)) {
  console.error("Usage: SKYLINK_API_KEY=... node scripts/test-skylink-notam.mjs <ICAO>");
  process.exit(1);
}

const apiKey = process.env.SKYLINK_API_KEY || process.env.RAPIDAPI_KEY || "";
if (!apiKey) {
  console.error("Missing API key. Set SKYLINK_API_KEY (or RAPIDAPI_KEY).");
  process.exit(1);
}

const host = process.env.SKYLINK_API_HOST || "skylink-api.p.rapidapi.com";
const baseUrl = (process.env.SKYLINK_API_BASE_URL || "https://skylink-api.p.rapidapi.com").replace(/\/$/, "");
const endpointCandidates = [
  `${baseUrl}/v3/notams/${encodeURIComponent(icao)}`,
  `${baseUrl}/notams/${encodeURIComponent(icao)}`,
  `${baseUrl}/notams/${encodeURIComponent(icao.toLowerCase())}`,
];

async function main() {
  let text = "";
  let successUrl = "";
  let lastStatus = 0;
  let lastBody = "";
  for (const url of endpointCandidates) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": host,
        Accept: "application/json",
      },
    });
    text = await res.text();
    if (res.ok) {
      successUrl = url;
      break;
    }
    lastStatus = res.status;
    lastBody = text;
  }

  if (!successUrl) {
    console.error(`SkyLink request failed for all known endpoints. Last HTTP: ${lastStatus}`);
    console.error(lastBody.slice(0, 1000));
    console.error("Tried endpoints:");
    for (const u of endpointCandidates) console.error(`- ${u}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("SkyLink returned non-JSON response:");
    console.error(text.slice(0, 1000));
    process.exit(1);
  }

  const notams = Array.isArray(data.notams) ? data.notams : [];
  console.log(`Endpoint: ${successUrl}`);
  console.log(`ICAO: ${data.icao || icao}`);
  console.log(`Total NOTAMs: ${data.total_count ?? notams.length}`);
  console.log("");

  for (const n of notams.slice(0, 10)) {
    console.log(`[${n.notam_id || "unknown"}] ${n.type || "?"} ${n.location || icao}`);
    console.log(`  Effective: ${n.effective || "n/a"}  Expires: ${n.expiration || "n/a"}`);
    console.log(`  ${String(n.body || "").slice(0, 220)}`);
    console.log("");
  }

  if (notams.length > 10) {
    console.log(`... ${notams.length - 10} more NOTAM(s) omitted`);
  }
}

main().catch((err) => {
  console.error("Script failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

