// Server-side client for the main Clearway portal's NOTAM / weather / AIP
// endpoints (see aip-notam-investigation.md). The display and the alert
// scanner both go through this proxy so:
//  - portal auth is handled once (x-debug-runner-secret internal header),
//  - per-ICAO responses are cached (the portal endpoints are scrape-backed,
//    slow and rate-limited — never hammer them per UI poll),
//  - the wall degrades gracefully when the portal is down (errors are
//    returned as values, never thrown).

import { errorDetail, REASONS } from "./public-error.mjs";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

// Every { ok: false, error } this module returns is shown on the console, the wall's flight tab or in an email, so
// it is one of our sentences (lib/public-error.mjs). The portal's own answer (status, body — it can carry setup
// text such as "Set NOTAM_SYNC_URL…") and network errors go to the log under [portal].
function logPortal(what, detail) {
  console.error(`[portal] ${what}`, detail === undefined ? "" : detail);
}

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

/** { ok, data } | { ok: false, code: "not-connected" | "http" | "unreachable", status? } — the detail is logged. */
async function portalJson(path, { timeoutMs = 45_000 } = {}) {
  if (!portalConfigured()) {
    logPortal(`${path} skipped: PORTAL_BASE_URL is not set`);
    return { ok: false, code: "not-connected" };
  }
  try {
    const response = await fetch(`${portalBaseUrl()}${path}`, {
      headers: portalHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text();
      logPortal(`${path} failed (${response.status})`, body.slice(0, 500));
      return { ok: false, code: "http", status: response.status };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    logPortal(`${path} failed`, errorDetail(error));
    return { ok: false, code: "unreachable" };
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
 * "NOTAM source unavailable" — shown as our "source is not available" sentence (the portal text is logged), no
 * silent fallback.
 */
export async function getNotams(icao, { fresh = false } = {}) {
  const code = String(icao || "").toUpperCase();
  if (!validIcao(code)) return { ok: false, error: REASONS.badIcao() };
  const key = `notam:${code}`;
  if (fresh) {
    // Explicit per-airport resync: skip (and evict) the cached result —
    // otherwise a retry inside the 60s failure-cache window is a no-op.
    cache.delete(key);
  } else {
    const cached = cacheGet(key);
    if (cached) return cached;
  }
  const answer = await portalJson(`/api/notams?icao=${code}&scraper=crewbriefing`);
  const result = answer.ok
    ? answer
    : {
        ok: false,
        error:
          answer.code === "not-connected"
            ? REASONS.notamsNotConnected()
            : answer.status === 503
              ? REASONS.notamsSourceDown()
              : REASONS.notamsUnavailable({ icao: code }),
      };
  // Cache failures briefly too, so a down portal isn't re-hit on every call.
  cacheSet(key, result, result.ok ? ttlMs() : 60_000);
  return result;
}

// AIP source resolution is delegated to the portal's own logic
// (GET /api/aip/resolve — the same ASECNA -> scraper -> USA -> EAD selection
// the AIP page uses), so page and wall never disagree. The wall keeps NO
// AIP cache of its own: cached PDFs are read from the portal's shared
// /storage volume via /files/<key> (a copy fetched earlier by ANY user,
// page or overlay, is reused), and only a genuine miss goes through the
// portal's normal per-source PDF route — which performs the download and
// writes the same shared cache for the next reader.
//
// We deliberately do NOT probe or call sync-triggering routes just to test
// availability: live EAD syncs can hang or fail from datacenter IPs
// (EUROCONTROL blocks them with IB-101), so availability checks must be
// storage-existence checks only.

/**
 * Ask the portal which source serves an ICAO and whether the AD-2 PDF is
 * already in the shared cache. Returns
 * { available, source, cached, filesPath, pdfPath } (available=false only
 * when the portal is unreachable/unresolvable). Cached results: 6h when the
 * PDF is cached (it stays on disk), 5min when not (someone may fetch it).
 */
export async function resolveAipPdf(icao) {
  const code = String(icao || "").toUpperCase();
  if (!validIcao(code) || !portalConfigured()) return { available: false };
  const key = `aip:${code}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const result = await portalJson(`/api/aip/resolve?icao=${code}`, { timeoutMs: 20_000 });
  if (!result.ok) {
    const value = { available: false, error: result.code === "not-connected" ? REASONS.docsNotConnected() : REASONS.aipUnavailable({ icao: code }) };
    cacheSet(key, value, 60_000);
    return value;
  }
  const value = {
    available: true,
    source: result.data.source,
    cached: Boolean(result.data.cached),
    filesPath: result.data.filesPath,
    pdfPath: result.data.pdfPath,
  };
  cacheSet(key, value, value.cached ? 6 * 3600_000 : 5 * 60_000);
  return value;
}

/**
 * Fetch an AD-2 AIP PDF into a Buffer (for email attachments): resolve via
 * the portal, serve the shared-cache copy when present, otherwise go through
 * the portal's normal per-source route (which downloads and writes the same
 * shared cache). Returns { ok, buffer, source, cached, filename } |
 * { ok:false, error }.
 */
export async function fetchAipPdfBuffer(icao) {
  const code = String(icao || "").toUpperCase();
  const resolved = await resolveAipPdf(code);
  if (!resolved.available) {
    return { ok: false, error: resolved.error || REASONS.aipUnavailable({ icao: code }) };
  }
  const path = resolved.cached && resolved.filesPath ? resolved.filesPath : `${resolved.pdfPath}&inline=1`;
  try {
    const response = await fetch(`${portalBaseUrl()}${path}`, {
      headers: portalHeaders(),
      signal: AbortSignal.timeout(resolved.cached ? 30_000 : 180_000),
    });
    if (!response.ok) {
      logPortal(`AIP PDF for ${code} failed: portal returned ${response.status} from ${resolved.source}`);
      return { ok: false, error: REASONS.aipUnavailable({ icao: code }) };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 500) {
      logPortal(`AIP PDF for ${code}: ${resolved.source} returned no usable PDF (${buffer.length} bytes)`);
      return { ok: false, error: REASONS.aipUnavailable({ icao: code }) };
    }
    if (!resolved.cached) cache.delete(`aip:${code}`);
    return { ok: true, buffer, source: resolved.source, cached: Boolean(resolved.cached), filename: `${code}-AD2.pdf` };
  } catch (error) {
    logPortal(`AIP PDF for ${code} failed`, errorDetail(error));
    return { ok: false, error: REASONS.aipUnavailable({ icao: code }) };
  }
}

/**
 * Fetch the country-level GEN 1.2 PDF for an airport into a Buffer, via the
 * portal's normal GEN-by-ICAO route (cache-first in shared /storage,
 * download on genuine miss — same shared-cache model as AIP).
 */
export async function fetchGenPdfBuffer(icao) {
  const code = String(icao || "").toUpperCase();
  if (!validIcao(code)) return { ok: false, error: REASONS.badIcao() };
  if (!portalConfigured()) {
    logPortal(`GEN 1.2 for ${code} skipped: PORTAL_BASE_URL is not set`);
    return { ok: false, error: REASONS.docsNotConnected() };
  }
  try {
    const response = await fetch(`${portalBaseUrl()}/api/aip/gen/pdf?icao=${code}`, {
      headers: portalHeaders(),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const body = await response.text();
      logPortal(`GEN 1.2 for ${code} failed (${response.status})`, body.slice(0, 500));
      return { ok: false, error: REASONS.genUnavailable({ icao: code }) };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 500) {
      logPortal(`GEN 1.2 for ${code}: no usable PDF produced (${buffer.length} bytes)`);
      return { ok: false, error: REASONS.genUnavailable({ icao: code }) };
    }
    return { ok: true, buffer, source: "gen", cached: null, filename: `${code.slice(0, 2)}-GEN-1.2.pdf` };
  } catch (error) {
    logPortal(`GEN 1.2 for ${code} failed`, errorDetail(error));
    return { ok: false, error: REASONS.genUnavailable({ icao: code }) };
  }
}

/**
 * Stream an AIP PDF to the given response. Cached copy -> served straight
 * from the shared /files/<key> (never triggers a sync). Miss -> the portal's
 * normal per-source route fetches it and populates the shared cache.
 */
export async function streamAipPdf(icao, res, { inline = true } = {}) {
  const code = String(icao || "").toUpperCase();
  const resolved = await resolveAipPdf(code);
  if (!resolved.available) {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({ ok: false, error: resolved.error || REASONS.aipUnavailable({ icao: code }) })
    );
    return;
  }

  const path = resolved.cached && resolved.filesPath
    ? resolved.filesPath
    : `${resolved.pdfPath}&inline=${inline ? "1" : "0"}`;

  try {
    const response = await fetch(`${portalBaseUrl()}${path}`, {
      headers: portalHeaders(),
      // Cached /files reads are quick; a real download (EAD login etc.) is not.
      signal: AbortSignal.timeout(resolved.cached ? 30_000 : 180_000),
    });
    if (!response.ok || !response.body) {
      res.writeHead(503, { "content-type": "application/json; charset=utf-8" }); // not 502: Cloudflare swaps 502 bodies
      logPortal(`AIP PDF stream for ${code} failed: portal returned ${response.status} from ${resolved.source}`);
      res.end(JSON.stringify({ ok: false, error: REASONS.aipUnavailable({ icao: code }) }));
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
    // The portal route just wrote the PDF into the shared cache — remember.
    if (!resolved.cached) cache.delete(`aip:${code}`);
  } catch (error) {
    logPortal(`AIP PDF stream for ${code} failed`, errorDetail(error));
    if (!res.headersSent) {
      res.writeHead(503, { "content-type": "application/json; charset=utf-8" }); // not 502: Cloudflare swaps 502 bodies
      res.end(JSON.stringify({ ok: false, error: REASONS.aipUnavailable({ icao: code }) }));
    } else {
      res.end();
    }
  }
}
