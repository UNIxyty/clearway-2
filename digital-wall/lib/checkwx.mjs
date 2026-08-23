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
    // Daily flight-weather refresh (00:01 UTC): last UTC day it ran, so a
    // restart later the same day doesn't re-burn CheckWX calls.
    this.dailyFiredFor = null;
    this.dailyInterval = null;
    this.lastDailyRun = null; // { day, airports, ok, error?, at }
  }

  async load() {
    const payload = await this.store.read();
    this.byIcao = payload.byIcao && typeof payload.byIcao === "object" ? payload.byIcao : {};
    this.dailyFiredFor = typeof payload.dailyFiredFor === "string" ? payload.dailyFiredFor : null;
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
    await this.store.write({ byIcao: this.byIcao, dailyFiredFor: this.dailyFiredFor, updatedAt: new Date().toISOString() });
    this.sseHub?.broadcast({ type: "weather.changed", airports: unique.length });
    console.log(`[checkwx] refreshed decoded METARs for ${refreshed} airport(s)`);
    return { ok: true, refreshed };
  }

  /**
   * Daily flight-weather refresh. Every day at 00:01 UTC it pulls fresh
   * decoded METARs for EVERY airport touched by a flight from today
   * 00:01 UTC through the END OF TOMORROW (flights are already synced two
   * days ahead), overwriting whatever yesterday's run stored for those
   * airports. `listIcaos` is injected (the server collects dep/arr ICAOs
   * from the flight cache) so this class stays Leon-free.
   */
  async runDailyFlightRefresh(listIcaos, { reason = "scheduled" } = {}) {
    const day = new Date().toISOString().slice(0, 10);
    let icaos = [];
    try {
      icaos = await listIcaos();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[checkwx] daily flight-weather refresh (${reason}): airport list failed: ${message}`);
      this.lastDailyRun = { day, airports: 0, ok: false, error: message, at: new Date().toISOString() };
      return { ok: false, error: message };
    }
    const result = await this.refreshFor(icaos, { fresh: true });
    if (result.ok) {
      // Mark the UTC day only on success — a missing API key or a down
      // CheckWX keeps the minute-poll retrying instead of skipping the day.
      this.dailyFiredFor = day;
      await this.store.write({ byIcao: this.byIcao, dailyFiredFor: this.dailyFiredFor, updatedAt: new Date().toISOString() });
    }
    this.lastDailyRun = { day, airports: result.refreshed ?? 0, ok: result.ok, error: result.ok ? null : "refresh skipped/failed", at: new Date().toISOString() };
    console.log(`[checkwx] daily flight-weather refresh (${reason}) for ${day}: ${result.ok ? `${result.refreshed} airport(s)` : "did not run"}`);
    return result;
  }

  /**
   * Minute-poll scheduler, same self-healing shape as the NOTAM check: fires
   * once per UTC day as soon as the clock passes 00:01, including catch-up
   * after a restart or downtime (a boot at 09:00 still runs that day's pull).
   */
  startDailyFlightScheduler(listIcaos) {
    this.dailyInterval = setInterval(() => {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const minutesIntoDay = now.getUTCHours() * 60 + now.getUTCMinutes();
      if (minutesIntoDay >= 1 && this.dailyFiredFor !== day) {
        this.runDailyFlightRefresh(listIcaos, { reason: "scheduled" }).catch((error) => {
          console.error("[checkwx] daily flight-weather refresh crashed:", error?.message || error);
        });
      }
    }, 60_000);
    if (typeof this.dailyInterval.unref === "function") this.dailyInterval.unref();
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
