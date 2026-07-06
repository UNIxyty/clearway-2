// CheckWX (checkwxapi.com) decoded-METAR client + the wall's weather state.
//
// This replaces the old portal /api/weather METAR/TAF scrape entirely. WX is
// acknowledgment-only on the wall: per-airport flight_category markers on the
// pills and a decoded block in the side overlay — no page, no emails, no
// acking (unlike NOTAMs).
//
// Auth: X-API-Key from CHECKWX_API_KEY (never committed). A missing key
// degrades to "no weather data" values — the wall keeps rendering.
// CHECKWX_BASE_URL exists so tests can point at a local stub.

import { JsonFileStore } from "./json-store.mjs";

const DEFAULT_TTL_MS = 30 * 60 * 1000; // CheckWX METARs refresh ~each 30-60 min

function baseUrl() {
  return String(process.env.CHECKWX_BASE_URL || "https://api.checkwx.com").trim().replace(/\/+$/, "");
}

function apiKey() {
  return String(process.env.CHECKWX_API_KEY || "").trim();
}

export function checkwxConfigured() {
  return Boolean(apiKey());
}

function ttlMs() {
  const parsed = Number(process.env.CHECKWX_CACHE_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

const cache = new Map(); // icao -> { value, expiresAtMs }

/**
 * Decoded METAR for one ICAO.
 * Returns { ok: true, data: <decoded station> | null } — data null means the
 * station has no METAR (CheckWX results: 0), which is a value, not an error.
 * Returns { ok: false, error } on transport/API failures.
 */
export async function getMetar(icao, { fresh = false } = {}) {
  const code = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return { ok: false, error: `Invalid ICAO: ${icao}` };
  if (!checkwxConfigured()) return { ok: false, error: "CHECKWX_API_KEY is not configured." };

  const hit = cache.get(code);
  if (!fresh && hit && Date.now() < hit.expiresAtMs) return hit.value;

  let result;
  try {
    const response = await fetch(`${baseUrl()}/metar/${code}/decoded`, {
      headers: { "X-API-Key": apiKey() },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.text();
      result = { ok: false, error: `CheckWX ${response.status}: ${body.slice(0, 200)}` };
    } else {
      const payload = await response.json();
      result = { ok: true, data: payload?.data?.[0] ?? null };
    }
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  // Failures cache briefly so a down API isn't re-hit per pill render.
  cache.set(code, { value: result, expiresAtMs: Date.now() + (result.ok ? ttlMs() : 60_000) });
  return result;
}

/** Compact summary of a decoded CheckWX station for the overlay/pills. */
export function summarizeMetar(decoded) {
  if (!decoded) return null;
  const category = String(decoded.flight_category || "").toUpperCase() || null;
  return {
    category, // VFR | MVFR | IFR | LIFR
    station: decoded.station?.name ?? null,
    windDegrees: decoded.wind?.degrees ?? null,
    windSpeedKts: decoded.wind?.speed_kts ?? null,
    windGustKts: decoded.wind?.gust_kts ?? null,
    visibilityMeters: decoded.visibility?.meters_float ?? decoded.visibility?.meters ?? null,
    visibilityMiles: decoded.visibility?.miles ?? null,
    ceilingFeet: decoded.ceiling?.feet ?? null,
    temperatureC: decoded.temperature?.celsius ?? null,
    dewpointC: decoded.dewpoint?.celsius ?? null,
    qnhHpa: decoded.barometer?.hpa ?? null,
    humidityPercent: decoded.humidity?.percent ?? null,
    observed: decoded.observed ?? null,
    rawText: decoded.raw_text ?? null,
  };
}

/**
 * Wall-side weather state: per-ICAO decoded summaries, refreshed alongside
 * the daily NOTAM check (same deduplicated airports, one CheckWX call per
 * unique ICAO per run) and per-airport on resync. Persisted so the pills
 * keep their categories across restarts.
 */
export class CheckwxWeatherService {
  constructor({ sseHub = null } = {}) {
    this.sseHub = sseHub;
    this.store = new JsonFileStore("weather.json", { byIcao: {} });
    this.byIcao = {};
  }

  async load() {
    const payload = await this.store.read();
    this.byIcao = payload.byIcao && typeof payload.byIcao === "object" ? payload.byIcao : {};
  }

  /** Refresh a set of ICAOs (sequential — be gentle; responses are cached). */
  async refreshFor(icaos, { fresh = true } = {}) {
    if (!checkwxConfigured()) {
      console.log("[checkwx] CHECKWX_API_KEY not set — WX refresh skipped.");
      return { ok: false, refreshed: 0 };
    }
    const unique = [...new Set((icaos ?? []).map((i) => String(i || "").trim().toUpperCase()).filter((i) => /^[A-Z0-9]{4}$/.test(i)))];
    let refreshed = 0;
    for (const icao of unique) {
      const result = await getMetar(icao, { fresh });
      this.byIcao[icao] = {
        ...(result.ok ? summarizeMetar(result.data) ?? { category: null } : { category: null }),
        error: result.ok ? null : result.error,
        noData: result.ok && !result.data ? true : undefined,
        fetchedAt: new Date().toISOString(),
      };
      refreshed += 1;
    }
    await this.store.write({ byIcao: this.byIcao, updatedAt: new Date().toISOString() });
    this.sseHub?.broadcast({ type: "weather.changed", airports: unique.length });
    console.log(`[checkwx] refreshed decoded METARs for ${refreshed} airport(s)`);
    return { ok: true, refreshed };
  }

  /** flight_category for the pill markers (null = unknown/no data). */
  categoryOf(icao) {
    return this.byIcao[String(icao || "").trim().toUpperCase()]?.category ?? null;
  }

  /** Full decoded summary for the overlay (may be null). */
  summaryOf(icao) {
    return this.byIcao[String(icao || "").trim().toUpperCase()] ?? null;
  }
}
