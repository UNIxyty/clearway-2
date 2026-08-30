// Periodic service checker (platform audit §6.4).
//
// Implements the audit's availability inventory: every check must PROVE the
// service works (validated response shapes), not just that something answered
// HTTP 200 — the wall backend, for instance, answers ANY unknown /api/* path
// with an empty {} 200, so a naive status probe would always pass.
//
// Lifecycle: a module-level singleton (stored on globalThis so dev hot-reload
// doesn't stack timers) started lazily by the /api/service-checks routes.
// A 30s tick runs whichever checks are due per their own cadence. Results are
// kept in memory and persisted as JSON through the portal's storage helpers
// (key: service-checks/results.json) — no Supabase involvement.

import path from "path";
import { readdir, stat } from "fs/promises";
import { STORAGE_ROOT, readFile as readStoredFile, saveFile } from "@/lib/storage";
import { internalDebugAuthHeaders } from "@/lib/internal-debug-auth";
import { logError } from "@/lib/utils/logger";

export type CheckState = "operational" | "degraded" | "down" | "unknown";

export type ServiceCheck = {
  id: string;
  label: string;
  state: CheckState;
  lastChecked: string | null;
  lastError: string | null;
  latencyMs: number | null;
};

export type ServiceChecksSnapshot = {
  checks: ServiceCheck[];
  lastSweep: string | null;
};

type Outcome = { state: CheckState; error?: string | null };

type CheckDef = {
  id: string;
  label: string;
  intervalMs: number;
  run: () => Promise<Outcome>;
};

const RESULTS_KEY = "service-checks/results.json";
const PROBE_TIMEOUT_MS = 15_000;
const TICK_MS = 30_000;
const PROBE_ICAO = "EVRA";
const MIN = 60_000;
const FRESHNESS_DEGRADED_MS = 24 * 60 * 60 * 1000; // audit: degraded when older than 24h

// ── Service base URLs ───────────────────────────────────────────────────────
// Internal (docker-network) URLs; defaults mirror docker-compose.yml service
// names/ports. The worker probes reuse the URL scheme already used by
// scripts/check-sync-services.mjs.

function portalBase(): string {
  return (process.env.PORTAL_SELF_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/+$/, "");
}
function notamSyncBase(): string {
  return (process.env.NOTAM_SYNC_URL || "http://notam-sync:3001").replace(/\/+$/, "");
}
function weatherSyncBase(): string {
  return (process.env.WEATHER_SYNC_URL || process.env.NOTAM_SYNC_URL || "http://weather-sync:3001").replace(/\/+$/, "");
}
function aipSyncBase(): string {
  return (process.env.AIP_SYNC_URL || "http://aip-sync:3002").replace(/\/+$/, "");
}
function wallBase(): string {
  // docker-compose.yml: service `digital-wall-backend`, PORT 5174.
  return (process.env.DIGITAL_WALL_INTERNAL_URL || "http://digital-wall-backend:5174").replace(/\/+$/, "");
}

// ── HTTP probe helpers ──────────────────────────────────────────────────────

type ProbeResponse = { status: number; json: unknown; text: string };

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    const cause = e.cause ? ` (${String((e.cause as { code?: string })?.code || e.cause)})` : "";
    return `${e.message}${cause}`;
  }
  return String(e);
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<ProbeResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", headers, signal: controller.signal });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON body — checks treat json === null as a shape failure */
    }
    return { status: res.status, json, text };
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`timed out after ${PROBE_TIMEOUT_MS}ms: ${url}`);
    }
    throw new Error(`fetch failed for ${url}: ${errorMessage(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function snippet(r: ProbeResponse): string {
  return (r.text || "").replace(/\s+/g, " ").slice(0, 180);
}

const OK: Outcome = { state: "operational", error: null };
function downBecause(detail: string): Outcome {
  return { state: "down", error: detail };
}

/** Portal data APIs are session-authed; internally we use the debug-runner
 * secret header (same server-to-server mechanism the debug runner uses).
 * If the secret isn't configured the service may well be fine — we just
 * can't prove it, so that maps to `unknown`, not `down`. */
function probeAuthHeaders(): Record<string, string> {
  return { ...(internalDebugAuthHeaders() as Record<string, string>) };
}

function unauthenticatedOutcome(r: ProbeResponse): Outcome {
  return {
    state: "unknown",
    error:
      `probe not authorized (HTTP ${r.status}) — set DEBUG_RUNNER_INTERNAL_SECRET so the checker ` +
      `can call session-authed portal APIs server-to-server`,
  };
}

// ── Individual checks ───────────────────────────────────────────────────────

async function checkPortalHealth(): Promise<Outcome> {
  const r = await getJson(`${portalBase()}/api/health`);
  const body = asRecord(r.json);
  if (r.status === 200 && body?.ok === true && body.service === "portal") return OK;
  return downBecause(`unexpected /api/health response (HTTP ${r.status}): ${snippet(r)}`);
}

async function checkAipResolve(): Promise<Outcome> {
  const r = await getJson(`${portalBase()}/api/aip/resolve?icao=${PROBE_ICAO}`, probeAuthHeaders());
  if (r.status === 401 || r.status === 403) return unauthenticatedOutcome(r);
  const body = asRecord(r.json);
  // Proof of function: the resolver must actually name a source for EVRA.
  if (r.status === 200 && typeof body?.source === "string" && body.source.length > 0) return OK;
  return downBecause(`resolve did not return a source (HTTP ${r.status}): ${snippet(r)}`);
}

async function checkNotamsCachedRead(): Promise<Outcome> {
  const r = await getJson(`${portalBase()}/api/notams?icao=${PROBE_ICAO}`, probeAuthHeaders());
  if (r.status === 401 || r.status === 403) return unauthenticatedOutcome(r);
  const body = asRecord(r.json);
  if (r.status === 200 && body?.icao === PROBE_ICAO && Array.isArray(body.notams)) return OK;
  return downBecause(`unexpected NOTAM response (HTTP ${r.status}): ${snippet(r)}`);
}

async function checkWeatherRead(): Promise<Outcome> {
  const r = await getJson(`${portalBase()}/api/weather?icao=${PROBE_ICAO}`, probeAuthHeaders());
  if (r.status === 401 || r.status === 403) return unauthenticatedOutcome(r);
  const body = asRecord(r.json);
  if (r.status === 200 && body?.icao === PROBE_ICAO && typeof body.weather === "string") return OK;
  return downBecause(`unexpected weather response (HTTP ${r.status}): ${snippet(r)}`);
}

function makeWorkerHealthCheck(base: () => string, expectedService: string): () => Promise<Outcome> {
  return async () => {
    const r = await getJson(`${base()}/health`);
    const body = asRecord(r.json);
    if (r.status === 200 && body?.ok === true && body.service === expectedService) return OK;
    // A 404 here means an old worker image without the /health route — the
    // process answers but we cannot prove the deployed version, hence unknown.
    if (r.status === 404) {
      return { state: "unknown", error: `worker answered but has no /health route (old image?): HTTP 404` };
    }
    return downBecause(`unexpected /health response (HTTP ${r.status}): ${snippet(r)}`);
  };
}

async function checkWallHealth(): Promise<Outcome> {
  const r = await getJson(`${wallBase()}/api/health`);
  const body = asRecord(r.json);
  // The wall answers unknown /api/* paths with an empty {} 200 — the
  // distinctive service field is what actually proves the real route exists.
  if (r.status === 200 && body?.ok === true && body.service === "digital-wall") return OK;
  return downBecause(`unexpected /api/health response (HTTP ${r.status}): ${snippet(r)}`);
}

function leonOutcomeFromStatus(st: Record<string, unknown>): Outcome {
  if (st.configured === false) {
    return { state: "degraded", error: "Leon sync is not configured on the wall backend" };
  }
  if (st.healthy === false) {
    const detail = typeof st.lastError === "string" && st.lastError ? `: ${st.lastError}` : "";
    return { state: "degraded", error: `Leon sync reports unhealthy${detail}` };
  }
  return OK;
}

async function checkLeonFeed(): Promise<Outcome> {
  const r = await getJson(`${wallBase()}/api/timeline/sync-status`);
  if (r.status === 200) {
    const body = asRecord(r.json);
    if (body && ("healthy" in body || "configured" in body)) return leonOutcomeFromStatus(body);
    return downBecause(`sync-status returned an unexpected shape: ${snippet(r)}`);
  }
  if (r.status === 401 || r.status === 403) {
    // sync-status is session-gated in production; the wall's /api/health
    // (added for this checker, pre-auth) mirrors the Leon summary.
    const h = await getJson(`${wallBase()}/api/health`);
    const leon = asRecord(asRecord(h.json)?.leon);
    if (h.status === 200 && leon) return leonOutcomeFromStatus(leon);
    return downBecause(`sync-status HTTP ${r.status} and health fallback failed (HTTP ${h.status}): ${snippet(h)}`);
  }
  return downBecause(`unexpected sync-status response (HTTP ${r.status}): ${snippet(r)}`);
}

/** External-dependency freshness: age of the newest cached file the external
 * source feeds. If syncs keep landing new files, the external service works. */
function makeFreshnessCheck(relDir: string, sourceLabel: string): () => Promise<Outcome> {
  return async () => {
    const dir = path.join(STORAGE_ROOT, relDir);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (e) {
      return { state: "unknown", error: `cannot read ${dir}: ${errorMessage(e)}` };
    }
    let newestMs: number | null = null;
    for (const name of names) {
      try {
        const s = await stat(path.join(dir, name));
        if (s.isFile()) newestMs = Math.max(newestMs ?? 0, s.mtimeMs);
      } catch {
        /* file vanished mid-scan — ignore */
      }
    }
    if (newestMs === null) {
      return { state: "unknown", error: `no cached ${sourceLabel} files under ${relDir}/ yet` };
    }
    const ageMs = Date.now() - newestMs;
    if (ageMs > FRESHNESS_DEGRADED_MS) {
      const hours = Math.round(ageMs / 3_600_000);
      return {
        state: "degraded",
        error: `newest ${sourceLabel} cache file is ~${hours}h old (threshold 24h) — syncs may be failing upstream`,
      };
    }
    return OK;
  };
}

// ── Check inventory (audit §6.4 cadences) ───────────────────────────────────

const CHECK_DEFS: CheckDef[] = [
  { id: "portal-health", label: "Portal (/api/health)", intervalMs: 1 * MIN, run: checkPortalHealth },
  { id: "aip-resolve", label: `AIP lookup (/api/aip/resolve ${PROBE_ICAO})`, intervalMs: 5 * MIN, run: checkAipResolve },
  { id: "notams-cached", label: `NOTAM cached read (/api/notams ${PROBE_ICAO})`, intervalMs: 10 * MIN, run: checkNotamsCachedRead },
  { id: "weather", label: `Weather (/api/weather ${PROBE_ICAO})`, intervalMs: 10 * MIN, run: checkWeatherRead },
  { id: "notam-sync", label: "NOTAM sync worker (/health)", intervalMs: 2 * MIN, run: makeWorkerHealthCheck(notamSyncBase, "notam-sync") },
  { id: "weather-sync", label: "Weather sync worker (/health)", intervalMs: 2 * MIN, run: makeWorkerHealthCheck(weatherSyncBase, "weather-sync") },
  { id: "aip-sync", label: "AIP sync worker (/health)", intervalMs: 2 * MIN, run: makeWorkerHealthCheck(aipSyncBase, "aip-sync") },
  { id: "wall-health", label: "Digital Wall backend (/api/health)", intervalMs: 1 * MIN, run: checkWallHealth },
  { id: "leon-feed", label: "Leon feed (wall sync-status)", intervalMs: 2 * MIN, run: checkLeonFeed },
  { id: "checkwx-freshness", label: "CheckWX cache freshness (weather/)", intervalMs: 30 * MIN, run: makeFreshnessCheck("weather", "CheckWX weather") },
  { id: "crewbriefing-freshness", label: "CrewBriefing cache freshness (notam/)", intervalMs: 30 * MIN, run: makeFreshnessCheck("notam", "CrewBriefing NOTAM") },
  { id: "ead-freshness", label: "EAD cache freshness (aip/ead-pdf/)", intervalMs: 30 * MIN, run: makeFreshnessCheck("aip/ead-pdf", "EAD AIP") },
];

// ── Singleton runner ────────────────────────────────────────────────────────

type CheckerState = {
  results: Map<string, ServiceCheck>;
  lastRunMs: Map<string, number>;
  lastSweep: string | null;
  timer: NodeJS.Timeout | null;
  sweeping: Promise<void> | null;
  loaded: boolean;
};

const globalStore = globalThis as typeof globalThis & { __clearwayServiceChecker?: CheckerState };

function getState(): CheckerState {
  if (!globalStore.__clearwayServiceChecker) {
    globalStore.__clearwayServiceChecker = {
      results: new Map(),
      lastRunMs: new Map(),
      lastSweep: null,
      timer: null,
      sweeping: null,
      loaded: false,
    };
  }
  return globalStore.__clearwayServiceChecker;
}

async function loadPersisted(s: CheckerState): Promise<void> {
  try {
    const raw = (await readStoredFile(RESULTS_KEY))?.toString("utf8");
    if (!raw) return;
    const data = JSON.parse(raw) as { lastSweep?: string | null; checks?: ServiceCheck[] };
    if (Array.isArray(data.checks)) {
      for (const check of data.checks) {
        if (check && typeof check.id === "string") s.results.set(check.id, check);
      }
    }
    if (typeof data.lastSweep === "string") s.lastSweep = data.lastSweep;
  } catch (e) {
    logError("SERVICE-CHECKS", "Failed to load persisted results", e);
  }
}

async function persist(s: CheckerState): Promise<void> {
  try {
    await saveFile(RESULTS_KEY, JSON.stringify({ version: 1, lastSweep: s.lastSweep, checks: snapshotChecks(s) }, null, 2));
  } catch (e) {
    // Storage may be absent in local dev (no /storage mount) — keep serving
    // from memory rather than failing the sweep.
    logError("SERVICE-CHECKS", "Failed to persist results", e);
  }
}

function snapshotChecks(s: CheckerState): ServiceCheck[] {
  return CHECK_DEFS.map(
    (def) =>
      s.results.get(def.id) ?? {
        id: def.id,
        label: def.label,
        state: "unknown" as CheckState,
        lastChecked: null,
        lastError: null,
        latencyMs: null,
      },
  );
}

async function runOne(s: CheckerState, def: CheckDef): Promise<void> {
  s.lastRunMs.set(def.id, Date.now());
  const started = Date.now();
  let outcome: Outcome;
  try {
    outcome = await def.run();
  } catch (e) {
    outcome = { state: "down", error: errorMessage(e) };
  }
  s.results.set(def.id, {
    id: def.id,
    label: def.label,
    state: outcome.state,
    lastChecked: new Date().toISOString(),
    lastError: outcome.error ?? null,
    latencyMs: Date.now() - started,
  });
}

async function runChecks(force: boolean): Promise<void> {
  const s = getState();
  if (s.sweeping) {
    await s.sweeping;
    if (!force) return;
  }
  const sweep = (async () => {
    const now = Date.now();
    const due = CHECK_DEFS.filter((def) => force || now - (s.lastRunMs.get(def.id) ?? 0) >= def.intervalMs);
    if (due.length === 0) return;
    await Promise.all(due.map((def) => runOne(s, def)));
    s.lastSweep = new Date().toISOString();
    await persist(s);
  })();
  const wrapped: Promise<void> = sweep.finally(() => {
    if (s.sweeping === wrapped) s.sweeping = null;
  });
  s.sweeping = wrapped;
  await wrapped;
}

/** Lazily start the checker: load persisted results and arm the 30s tick.
 * Safe to call on every request; guarded against duplicate timers (including
 * across dev hot reloads via the globalThis store). */
export async function ensureCheckerStarted(): Promise<void> {
  const s = getState();
  if (!s.loaded) {
    s.loaded = true;
    await loadPersisted(s);
  }
  if (!s.timer) {
    s.timer = setInterval(() => {
      runChecks(false).catch((e) => logError("SERVICE-CHECKS", "Scheduled sweep failed", e));
    }, TICK_MS);
    s.timer.unref?.();
  }
}

/** Run every check that is due right now (force=true: run ALL checks). */
export async function runSweep(force = false): Promise<void> {
  await ensureCheckerStarted();
  await runChecks(force);
}

export function getSnapshot(): ServiceChecksSnapshot {
  const s = getState();
  return { checks: snapshotChecks(s), lastSweep: s.lastSweep };
}

/** True once at least one check has ever produced a result (persisted or live). */
export function hasResults(): boolean {
  return getState().results.size > 0;
}
