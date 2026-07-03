// Server-side client for the main Clearway portal's NOTAM / weather / AIP
// endpoints (see aip-notam-investigation.md). The display and the alert
// scanner both go through this proxy so:
//  - portal auth is handled once (x-debug-runner-secret internal header),
//  - per-ICAO responses are cached (the portal endpoints are scrape-backed,
//    slow and rate-limited — never hammer them per UI poll),
//  - the wall degrades gracefully when the portal is down (errors are
//    returned as values, never thrown).

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function portalBaseUrl() {
  return String(process.env.PORTAL_BASE_URL || "").trim().replace(/\/+$/, "");
}

export function portalConfigured() {
  return Boolean(portalBaseUrl());
}

function portalHeaders() {
  const headers = {};
  const secret = String(process.env.PORTAL_INTERNAL_SECRET || process.env.DEBUG_RUNNER_INTERNAL_SECRET || "").trim();
  if (secret) headers["x-debug-runner-secret"] = secret;
  return headers;
}

function ttlMs() {
  const parsed = Number(process.env.FLIGHT_INFO_CACHE_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

const cache = new Map(); // key -> { value, expiresAtMs }

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAtMs) return hit.value;
  cache.delete(key);
  return undefined;
}

function cacheSet(key, value, ttl = ttlMs()) {
  cache.set(key, { value, expiresAtMs: Date.now() + ttl });
  if (cache.size > 2000) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function validIcao(icao) {
  return /^[A-Z0-9]{4}$/.test(String(icao || "").toUpperCase());
}

async function portalJson(path, { timeoutMs = 45_000 } = {}) {
  if (!portalConfigured()) {
    return { ok: false, error: "PORTAL_BASE_URL is not configured." };
  }
  try {
    const response = await fetch(`${portalBaseUrl()}${path}`, {
      headers: portalHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Portal ${path} failed (${response.status}): ${body.slice(0, 200)}` };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * NOTAMs for one ICAO: { ok, data: { icao, notams[], updatedAt } } | { ok:false, error }.
 *
 * Source policy: CrewBriefing ONLY — never SkyLink/FAA. `scraper=crewbriefing`
 * pins the portal's cache-miss scrape path (the portal env should also set
 * NOTAM_SCRAPER=crewbriefing; both are in place so neither default drifts).
 * CrewBriefing already applies the "CLEARWAY company policy" and US-military
 * NOTAM exclusions upstream — that filtered set is intended. It is
 * Playwright-based and slow, hence the per-ICAO TTL cache here and the
 * scanner's one-lookup-per-ICAO-per-scan throttle; do not parallelize hard.
 * If CrewBriefing credentials are missing the portal replies 503
 * "NOTAM source unavailable" — surfaced as-is, no silent fallback.
 */
export async function getNotams(icao) {
  const code = String(icao || "").toUpperCase();
  if (!validIcao(code)) return { ok: false, error: `Invalid ICAO: ${icao}` };
  const key = `notam:${code}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const result = await portalJson(`/api/notams?icao=${code}&scraper=crewbriefing`);
  // Cache failures briefly too, so a down portal isn't re-hit on every call.
  cacheSet(key, result, result.ok ? ttlMs() : 60_000);
  return result;
}

/** Weather (raw METAR/TAF text) for one ICAO. */
export async function getWeather(icao) {
  const code = String(icao || "").toUpperCase();
  if (!validIcao(code)) return { ok: false, error: `Invalid ICAO: ${icao}` };
  const key = `weather:${code}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const result = await portalJson(`/api/weather?icao=${code}`);
  cacheSet(key, result, result.ok ? ttlMs() : 60_000);
  return result;
}

// AIP PDF source precedence per ICAO (documented in the AIP report):
// USA static for K*/P*, then EAD, then national scraper, then ASECNA.
const AIP_SOURCES = [
  { source: "usa", path: (icao) => `/api/aip/usa/pdf?icao=${icao}`, applies: (icao) => /^[KP]/.test(icao) },
  { source: "ead", path: (icao) => `/api/aip/ead/pdf?icao=${icao}`, applies: () => true },
  { source: "scraper", path: (icao) => `/api/aip/scraper/pdf?icao=${icao}`, applies: () => true },
  { source: "asecna", path: (icao) => `/api/aip/asecna/pdf?icao=${icao}`, applies: () => true },
];

/**
 * Resolve which AIP source serves an ICAO by HEAD-probing in precedence
 * order. Returns { available, source?, path? }; cached for 6h.
 */
export async function resolveAipPdf(icao) {
  const code = String(icao || "").toUpperCase();
  if (!validIcao(code)) return { available: false };
  const key = `aip:${code}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (!portalConfigured()) return { available: false };

  for (const candidate of AIP_SOURCES) {
    if (!candidate.applies(code)) continue;
    try {
      const response = await fetch(`${portalBaseUrl()}${candidate.path(code)}`, {
        method: "HEAD",
        headers: portalHeaders(),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        const value = { available: true, source: candidate.source, path: candidate.path(code) };
        cacheSet(key, value, 6 * 3600_000);
        return value;
      }
    } catch {
      /* try the next source */
    }
  }
  const value = { available: false };
  cacheSet(key, value, 30 * 60_000);
  return value;
}

/**
 * Stream an AIP PDF from the portal to the given response. Resolves the
 * source first (cached), then pipes bytes through.
 */
export async function streamAipPdf(icao, res, { inline = true } = {}) {
  const code = String(icao || "").toUpperCase();
  const resolved = await resolveAipPdf(code);
  if (!resolved.available) {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: `No AIP PDF available for ${code}.` }));
    return;
  }
  try {
    const separator = resolved.path.includes("?") ? "&" : "?";
    const response = await fetch(
      `${portalBaseUrl()}${resolved.path}${separator}inline=${inline ? "1" : "0"}`,
      { headers: portalHeaders(), signal: AbortSignal.timeout(120_000) }
    );
    if (!response.ok || !response.body) {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: `Portal PDF fetch failed (${response.status}).` }));
      return;
    }
    res.writeHead(200, {
      "content-type": response.headers.get("content-type") || "application/pdf",
      "content-disposition":
        response.headers.get("content-disposition") ||
        `${inline ? "inline" : "attachment"}; filename="${code}-AD2.pdf"`,
      "cache-control": "private, max-age=300",
      "x-aip-source": resolved.source,
    });
    for await (const chunk of response.body) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    } else {
      res.end();
    }
  }
}
