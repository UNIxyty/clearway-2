/**
 * SkyLink METAR weather fetcher for sync server + local storage.
 * Replaces CrewBriefing browser scraping with API-based retrieval.
 *
 * Env:
 *  - SKYLINK_API_KEY (required)
 *  - SKYLINK_API_HOST (optional, default skylink-api.p.rapidapi.com)
 *  - SKYLINK_API_BASE_URL (optional, default https://skylink-api.p.rapidapi.com)
 *  - WEATHER_PROGRESS_FILE (optional SSE progress sink)
 *
 * Usage: node scripts/crewbriefing-weather.mjs [--json] <ICAO>
 */

import { appendFileSync } from "fs";
import { saveFile } from "../lib/storage.mjs";

let jsonMode = false;

function progress(msg) {
  const line = "PROGRESS:" + msg + "\n";
  if (process.env.WEATHER_PROGRESS_FILE) {
    try {
      appendFileSync(process.env.WEATHER_PROGRESS_FILE, line);
    } catch (_) {}
  }
  if (jsonMode) console.error(line.trim());
}

function extractWeatherText(payload, icao) {
  if (!payload) return "";
  if (typeof payload === "string") return payload.trim();

  const candidates = [
    payload.raw,
    payload.metar,
    payload.weather,
    payload?.data?.raw,
    payload?.data?.metar,
    payload?.data?.weather,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  // Keep response human-readable for current UI by rendering one-line JSON when no raw field exists.
  return JSON.stringify(payload);
}

async function fetchSkylinkWeather(icao) {
  const apiKey = process.env.SKYLINK_API_KEY || process.env.RAPIDAPI_KEY || "";
  if (!apiKey) {
    throw new Error("SKYLINK_API_KEY (or RAPIDAPI_KEY) is required.");
  }
  const host = process.env.SKYLINK_API_HOST || "skylink-api.p.rapidapi.com";
  const baseUrl = (process.env.SKYLINK_API_BASE_URL || "https://skylink-api.p.rapidapi.com").replace(/\/$/, "");
  const candidates = [
    `${baseUrl}/weather/metar/${encodeURIComponent(icao)}?parsed=false`,
    `${baseUrl}/weather/metar/${encodeURIComponent(icao.toLowerCase())}?parsed=false`,
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
      return JSON.parse(text);
    } catch {
      return { raw: text, icao };
    }
  }
  throw new Error(`SkyLink weather request failed: ${lastError}`);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  jsonMode = process.argv.includes("--json");
  const icao = (args[0] || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    console.error("Usage: node scripts/crewbriefing-weather.mjs [--json] <ICAO>");
    process.exit(1);
  }

  progress(`Fetching METAR from SkyLink API for ${icao}`);
  const response = await fetchSkylinkWeather(icao);
  const weatherText = extractWeatherText(response, icao);
  const payload = {
    icao,
    weather: weatherText,
    updatedAt: new Date().toISOString(),
  };

  progress("Saving weather to storage");
  const key = `weather/${icao}.json`;
  await saveFile(key, JSON.stringify(payload));

  progress("Done");
  if (jsonMode) console.log(JSON.stringify(payload));
  else console.log(weatherText);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

