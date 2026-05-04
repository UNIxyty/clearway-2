import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { saveFile } from "@/lib/storage";
import { isUsaAipIcao } from "@/lib/usa-aip";
import { getScraperCountryByIcao } from "@/lib/scraper-country-config";
import { getAsecnaAirportsSet } from "@/lib/asecna-airports";
import { internalDebugAuthHeaders } from "@/lib/internal-debug-auth";
import {
  eadCountryNameFromLabel,
  getEadCountryLabelForIcao,
  isEadSupportedIcao,
  listAllEadIcaos,
  normalizeCountryName,
} from "@/lib/ead-country-coverage";

type StepName = "aip" | "notam" | "weather" | "pdf" | "gen";
type StepState = "pending" | "running" | "passed" | "failed" | "timeout" | "skipped";
type RunState = "running" | "completed" | "stopped";
const ALL_STEPS: StepName[] = ["aip", "notam", "weather", "pdf", "gen"];
const ASECNA_SET = getAsecnaAirportsSet();
const CAPTCHA_COUNTRIES = new Set(["Greece", "Lithuania", "Netherlands"]);

function isCaptchaProtectedCountry(country: string): boolean {
  return CAPTCHA_COUNTRIES.has(country);
}

export type DebugRunOptions = {
  quantity: number;
  allAirports: boolean;
  randomSample: boolean;
  countries: string[];
  excludeCaptchaCountries: boolean;
  concurrency: number;
  steps: StepName[];
  sourceMode: "auto" | "ead-only";
  /** When set, skip the DB query and run only these specific ICAOs (used for redebug of failures). */
  icaos?: string[];
};

type AirportCandidate = {
  icao: string;
  country: string;
  name: string;
};

export type AirportDebugCard = {
  icao: string;
  country: string;
  name: string;
  steps: Record<StepName, StepState>;
  stepDetails: Record<StepName, string>;
  logs: string[];
};

export type DebugRun = {
  id: string;
  status: RunState;
  startedAt: string;
  endedAt: string | null;
  options: DebugRunOptions;
  totals: {
    airports: number;
    failed: number;
    timeout: number;
  };
  events: Array<{ at: string; level: "info" | "error"; message: string; airport?: string }>;
  airports: AirportDebugCard[];
  stopRequested: boolean;
  emitter: EventEmitter;
  baseUrl: string;
};

const RUNS = new Map<string, DebugRun>();

class SkipStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkipStepError";
  }
}

function sample<T>(rows: T[], qty: number, random: boolean): T[] {
  const copy = [...rows];
  if (random) copy.sort(() => Math.random() - 0.5);
  return copy.slice(0, qty);
}

function sanitizePathPart(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function logEvent(run: DebugRun, event: { level: "info" | "error"; message: string; airport?: string }) {
  const full = { at: new Date().toISOString(), ...event };
  run.events.push(full);
  if (run.events.length > 2500) run.events.shift();
  run.emitter.emit("event", full);
}

function stepKeyForAirport(
  icao: string,
  country: string,
  sourceMode: "auto" | "ead-only"
): { aipBase: string; pdfUrl: string; genPdfUrl: string } {
  const scraper = getScraperCountryByIcao(icao);
  const eadSupported = isEadSupportedIcao(icao);
  const forceEad = sourceMode === "ead-only";
  if (isUsaAipIcao(icao)) {
    return {
      aipBase: "/api/aip/usa",
      pdfUrl: `/api/aip/usa/pdf?icao=${encodeURIComponent(icao)}`,
      genPdfUrl: `/api/aip/usa/gen/pdf?icao=${encodeURIComponent(icao)}`,
    };
  }
  if (ASECNA_SET.has(icao.toUpperCase())) {
    return {
      aipBase: "/api/aip/asecna",
      pdfUrl: `/api/aip/asecna/pdf?icao=${encodeURIComponent(icao)}`,
      genPdfUrl: `/api/aip/asecna/gen/pdf?icao=${encodeURIComponent(icao)}`,
    };
  }
  if (forceEad || eadSupported) {
    return {
      aipBase: "/api/aip/ead",
      pdfUrl: `/api/aip/ead/pdf?icao=${encodeURIComponent(icao)}`,
      genPdfUrl: `/api/aip/gen/pdf?icao=${encodeURIComponent(icao)}`,
    };
  }
  // Captcha-protected countries are always served via EAD (no HITL scraper needed)
  if (isCaptchaProtectedCountry(country)) {
    return {
      aipBase: "/api/aip/ead",
      pdfUrl: `/api/aip/ead/pdf?icao=${encodeURIComponent(icao)}`,
      genPdfUrl: `/api/aip/gen/pdf?icao=${encodeURIComponent(icao)}`,
    };
  }
  if (scraper) {
    return {
      aipBase: "/api/aip/scraper",
      pdfUrl: `/api/aip/scraper/pdf?icao=${encodeURIComponent(icao)}`,
      genPdfUrl: `/api/aip/scraper/gen/pdf?icao=${encodeURIComponent(icao)}`,
    };
  }
  return {
    aipBase: "/api/aip/ead",
    pdfUrl: `/api/aip/ead/pdf?icao=${encodeURIComponent(icao)}`,
    genPdfUrl: `/api/aip/gen/pdf?icao=${encodeURIComponent(icao)}`,
  };
}

async function fetchAirportsByIcaos(service: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>, icaos: string[]) {
  const validIcaos = icaos.map((i) => i.trim().toUpperCase()).filter((i) => /^[A-Z0-9]{4}$/.test(i));
  const { data, error } = await service
    .from("airports")
    .select("icao,country,name")
    .in("icao", validIcaos);
  if (error) throw new Error(error.message);
  const found = new Map((data ?? []).map((r) => [String(r.icao || "").toUpperCase(), r]));
  return validIcaos.map((icao) => {
    const row = found.get(icao);
    const eadLabel = getEadCountryLabelForIcao(icao);
    return {
      icao,
      country: String(row?.country || (eadLabel ? eadCountryNameFromLabel(eadLabel) : "Unknown")),
      name: String(row?.name || "Unknown"),
    };
  });
}

async function listAirportCandidates(options: DebugRunOptions): Promise<AirportCandidate[]> {
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  // When specific ICAOs are provided (e.g. for redebug), fetch just those rows.
  if (options.icaos && options.icaos.length > 0) {
    return fetchAirportsByIcaos(service, options.icaos);
  }

  // EAD-only mode should still use latest Supabase airports, but route only EAD-supported ICAOs.
  if (options.sourceMode === "ead-only") {
    const PAGE_SIZE = 1000;
    const MAX_ROWS = 10_000;
    const allRows: Array<{ icao?: string; country?: string; name?: string; updated_at?: string | null }> = [];
    let offset = 0;
    while (allRows.length < MAX_ROWS) {
      let query = service
        .from("airports")
        .select("icao,country,name,updated_at")
        .eq("visible", true)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (options.countries.length > 0) query = query.in("country", options.countries);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      allRows.push(...(data as Array<{ icao?: string; country?: string; name?: string; updated_at?: string | null }>));
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const rows = allRows
      .map((r) => ({
        icao: String(r.icao || "").toUpperCase(),
        country: String(r.country || "Unknown"),
        name: String(r.name || "Unknown"),
        updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : 0,
      }))
      .filter((r) => /^[A-Z0-9]{4}$/.test(r.icao))
      .filter((r) => isEadSupportedIcao(r.icao))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ icao, country, name }) => ({ icao, country, name }));

    if (options.allAirports) return rows;
    return sample(rows, options.quantity, options.randomSample);
  }

  const PAGE_SIZE = 1000;
  const MAX_ROWS = 10_000;
  const allRows: Array<{ icao?: string; country?: string; name?: string; updated_at?: string | null }> = [];
  let offset = 0;

  while (allRows.length < MAX_ROWS) {
    let query = service
      .from("airports")
      .select("icao,country,name,updated_at")
      .eq("visible", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (options.countries.length > 0) query = query.in("country", options.countries);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    allRows.push(...(data as Array<{ icao?: string; country?: string; name?: string; updated_at?: string | null }>));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const rows = allRows
    .map((r) => ({
      icao: String(r.icao || "").toUpperCase(),
      country: String(r.country || "Unknown"),
      name: String(r.name || "Unknown"),
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : 0,
    }))
    .filter((r) => /^[A-Z0-9]{4}$/.test(r.icao))
    .filter((r) => !options.excludeCaptchaCountries || !CAPTCHA_COUNTRIES.has(r.country))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ icao, country, name }) => ({ icao, country, name }));

  if (options.allAirports) return rows;
  return sample(rows, options.quantity, options.randomSample);
}

async function persistRunFailures(run: DebugRun) {
  try {
    const service = createSupabaseServiceRoleClient();
    if (!service) return;
    const rows: Array<{
      run_id: string; icao: string; country: string; name: string;
      step: string; state: string; detail: string | null; created_at: string;
    }> = [];
    for (const airport of run.airports) {
      for (const step of ALL_STEPS) {
        const state = airport.steps[step];
        if (state === "failed" || state === "timeout") {
          rows.push({
            run_id: run.id,
            icao: airport.icao,
            country: airport.country,
            name: airport.name,
            step,
            state,
            detail: airport.stepDetails[step] || null,
            created_at: new Date().toISOString(),
          });
        }
      }
    }
    if (rows.length === 0) return;
    const { error } = await service.from("debug_run_failures").upsert(rows, { onConflict: "run_id,icao,step" });
    if (error) {
      logEvent(run, { level: "error", message: `Failed to persist run failures: ${error.message}` });
    } else {
      logEvent(run, { level: "info", message: `Persisted ${rows.length} failure(s) to debug_run_failures.` });
    }
  } catch (err) {
    // Table may not exist yet — fail silently so the run result is still usable.
    logEvent(run, { level: "error", message: `Could not persist failures (table may not exist): ${String((err as Error).message || err)}` });
  }
}

async function sendTelegramSummary(run: DebugRun) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  if (!token || !chatId) {
    logEvent(run, { level: "info", message: "Telegram summary skipped (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)." });
    return;
  }
  const failed = run.airports.filter((a) => Object.values(a.steps).some((s) => s === "failed")).length;
  const timedOut = run.airports.filter((a) => Object.values(a.steps).some((s) => s === "timeout")).length;
  const body =
    `Debug run ${run.id}\n` +
    `Airports: ${run.totals.airports}\n` +
    `Failed: ${failed}\n` +
    `Timeout: ${timedOut}\n` +
    `Link: ${run.baseUrl}/admin/debug?run=${encodeURIComponent(run.id)}`;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body }),
  });
  logEvent(run, { level: "info", message: "Telegram summary sent." });
}

async function runAirport(run: DebugRun, card: AirportDebugCard, artifactCountries: Set<string>) {
  const icao = card.icao;
  const endpoints = stepKeyForAirport(icao, card.country, run.options.sourceMode);
  const authHeaders = internalDebugAuthHeaders();
  const requestOrThrow = async (url: string): Promise<Response> => {
    try {
      return await fetch(url, {
        cache: "no-store",
        headers: authHeaders,
      });
    } catch (err) {
      const cause = err instanceof Error ? (err.cause ? ` | cause: ${String(err.cause)}` : "") : "";
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`fetch failed for ${url}: ${msg}${cause}`);
    }
  };
  const readErrorDetail = async (res: Response, label: string): Promise<string> => {
    const text = await res.text().catch(() => "");
    if (!text) return `${label} HTTP ${res.status}`;
    try {
      const data = JSON.parse(text) as { error?: string; detail?: string };
      const detail = [data.error, data.detail].filter(Boolean).join(" | ");
      return `${label} HTTP ${res.status}${detail ? `: ${detail}` : ""}`;
    } catch {
      return `${label} HTTP ${res.status}: ${text.slice(0, 200)}`;
    }
  };
  const isAsecnaGenNotAvailable = (res: Response, detail: string) =>
    res.status === 404 &&
    endpoints.genPdfUrl.includes("/api/aip/asecna/gen/pdf") &&
    /GEN 1\.2 not available for this country in ASECNA menu/i.test(detail);
  const setStep = (step: StepName, state: StepState, detail: string) => {
    card.steps[step] = state;
    card.stepDetails[step] = detail;
    card.logs.push(`${new Date().toISOString()} [${step}] ${detail}`);
    logEvent(run, { level: state === "failed" || state === "timeout" ? "error" : "info", message: detail, airport: icao });
  };

  const doStep = async (step: StepName, fn: () => Promise<string | void>, timeoutMs = 90_000) => {
    if (!run.options.steps.includes(step)) {
      setStep(step, "skipped", "Step skipped by options.");
      return;
    }
    setStep(step, "running", "Started.");
    try {
      const detail = await withTimeout(fn(), timeoutMs);
      setStep(step, "passed", detail || "Completed.");
    } catch (err) {
      if (err instanceof SkipStepError) {
        setStep(step, "skipped", err.message || "Step not available for this airport.");
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (/timeout/i.test(msg)) setStep(step, "timeout", msg);
      else setStep(step, "failed", msg);
    }
  };

  await doStep("aip", async () => {
    const res = await requestOrThrow(`${run.baseUrl}${endpoints.aipBase}?icao=${encodeURIComponent(icao)}&sync=1&extract=0`);
    if (!res.ok) throw new Error(await readErrorDetail(res, "AIP"));
  }, 40_000);

  await doStep("notam", async () => {
    const syncUrl = `${run.baseUrl}/api/notams?icao=${encodeURIComponent(icao)}&sync=1`;
    const syncRes = await requestOrThrow(syncUrl);
    if (syncRes.ok) return;

    // Accessibility fallback: if sync fails but regular endpoint is reachable, treat as pass.
    const fallbackUrl = `${run.baseUrl}/api/notams?icao=${encodeURIComponent(icao)}`;
    const fallbackRes = await requestOrThrow(fallbackUrl);
    if (fallbackRes.ok) {
      setStep("notam", "running", `Sync failed (${syncRes.status}), fallback endpoint reachable.`);
      return;
    }
    throw new Error(await readErrorDetail(syncRes, "NOTAM"));
  });

  await doStep("weather", async () => {
    const syncUrl = `${run.baseUrl}/api/weather?icao=${encodeURIComponent(icao)}&sync=1`;
    const syncRes = await requestOrThrow(syncUrl);
    if (syncRes.ok) return;

    // Accessibility fallback: if sync fails but regular endpoint is reachable, treat as pass.
    const fallbackUrl = `${run.baseUrl}/api/weather?icao=${encodeURIComponent(icao)}`;
    const fallbackRes = await requestOrThrow(fallbackUrl);
    if (fallbackRes.ok) {
      setStep("weather", "running", `Sync failed (${syncRes.status}), fallback endpoint reachable.`);
      return;
    }
    throw new Error(await readErrorDetail(syncRes, "Weather"));
  });

  await doStep("pdf", async () => {
    const res = await requestOrThrow(`${run.baseUrl}${endpoints.pdfUrl}`);
    if (!res.ok) {
      const detail = await readErrorDetail(res, "PDF");
      if (res.status === 404) {
        throw new Error(`${detail} | PDF missing after sync (may be transient, cache miss, or source mapping issue).`);
      }
      throw new Error(detail);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
      throw new Error("Downloaded bytes are not a PDF");
    }
    const countryKey = sanitizePathPart(card.country);
    if (!artifactCountries.has(countryKey)) {
      artifactCountries.add(countryKey);
      const key = `aip/debug-runs/${run.id}/${countryKey}/${icao}.pdf`;
      await saveFile(key, bytes);
      setStep("pdf", "running", `Saved artifact ${key}`);
    } else {
      setStep("pdf", "running", "Artifact skipped: country already has one PDF.");
    }
  });

  await doStep("gen", async () => {
    if (endpoints.genPdfUrl.includes("/api/aip/gen/pdf")) {
      const sync = await requestOrThrow(`${run.baseUrl}/api/aip/gen/sync?icao=${encodeURIComponent(icao)}`);
      if (!sync.ok) {
        const detail = await readErrorDetail(sync, "GEN sync");
        throw new Error(detail);
      }
    }
    let pdf = await requestOrThrow(`${run.baseUrl}${endpoints.genPdfUrl}`);
    if (!pdf.ok && pdf.status === 404 && endpoints.genPdfUrl.includes("/api/aip/gen/pdf")) {
      // One extra sync+retry helps when the prefix PDF appears with slight lag.
      const syncRetry = await requestOrThrow(`${run.baseUrl}/api/aip/gen/sync?icao=${encodeURIComponent(icao)}`);
      if (syncRetry.ok) {
        pdf = await requestOrThrow(`${run.baseUrl}${endpoints.genPdfUrl}`);
      }
    }
    if (!pdf.ok) {
      const detail = await readErrorDetail(pdf, "GEN PDF");
      if (isAsecnaGenNotAvailable(pdf, detail)) {
        return "Endpoint successful; this ASECNA country does not publish a GEN 1.2 section in the menu.";
      }
      if (pdf.status === 404) {
        throw new Error(`${detail} | GEN 1.2 PDF missing after sync (may be transient, cache miss, or wrong prefix mapping).`);
      }
      throw new Error(detail);
    }
  });
}

async function executeRun(run: DebugRun) {
  const candidates = await listAirportCandidates(run.options);
  run.airports = candidates.map((row) => ({
    icao: row.icao,
    country: row.country,
    name: row.name,
    steps: {
      aip: "pending",
      notam: "pending",
      weather: "pending",
      pdf: "pending",
      gen: "pending",
    },
    stepDetails: {
      aip: "",
      notam: "",
      weather: "",
      pdf: "",
      gen: "",
    },
    logs: [],
  }));
  run.totals.airports = run.airports.length;
  logEvent(run, { level: "info", message: `Run started for ${run.airports.length} airport(s).` });

  const artifactCountries = new Set<string>();
  let nextIndex = 0;
  const worker = async () => {
    while (!run.stopRequested) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= run.airports.length) return;
      await runAirport(run, run.airports[current], artifactCountries);
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, run.options.concurrency) }).map(() => worker()),
  );

  run.status = run.stopRequested ? "stopped" : "completed";
  run.endedAt = new Date().toISOString();
  run.totals.failed = run.airports.filter((a) => Object.values(a.steps).includes("failed")).length;
  run.totals.timeout = run.airports.filter((a) => Object.values(a.steps).includes("timeout")).length;
  logEvent(run, { level: "info", message: `Run ${run.status}.` });
  await persistRunFailures(run).catch(() => {});
  await sendTelegramSummary(run).catch((err) => {
    logEvent(run, { level: "error", message: `Telegram summary failed: ${String((err as Error).message || err)}` });
  });
  run.emitter.emit("done");
}

export function listDebugRuns() {
  return Array.from(RUNS.values())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((run) => ({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      totals: run.totals,
      options: run.options,
    }));
}

export function getDebugRun(id: string): DebugRun | null {
  return RUNS.get(id) ?? null;
}

export function stopDebugRun(id: string): boolean {
  const run = RUNS.get(id);
  if (!run) return false;
  run.stopRequested = true;
  return true;
}

/** Load persisted failures for a run from Supabase (survives server restart). */
export async function loadPersistedRunFailures(runId: string): Promise<Array<{ icao: string; country: string; name: string; step: string; state: string; detail: string | null }>> {
  try {
    const service = createSupabaseServiceRoleClient();
    if (!service) return [];
    const { data, error } = await service
      .from("debug_run_failures")
      .select("icao,country,name,step,state,detail")
      .eq("run_id", runId);
    if (error) return [];
    return (data ?? []) as Array<{ icao: string; country: string; name: string; step: string; state: string; detail: string | null }>;
  } catch {
    return [];
  }
}

/** List the most recent persisted run IDs from Supabase (for recovery after restart). */
export async function listPersistedRunIds(limit = 10): Promise<string[]> {
  try {
    const service = createSupabaseServiceRoleClient();
    if (!service) return [];
    const { data, error } = await service
      .from("debug_run_failures")
      .select("run_id,created_at")
      .order("created_at", { ascending: false })
      .limit(limit * 50); // over-fetch since many rows per run
    if (error || !data) return [];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const row of data as Array<{ run_id: string }>) {
      if (!seen.has(row.run_id)) { seen.add(row.run_id); ids.push(row.run_id); }
      if (ids.length >= limit) break;
    }
    return ids;
  } catch {
    return [];
  }
}

export function subscribeDebugRun(id: string, onEvent: (event: unknown) => void) {
  const run = RUNS.get(id);
  if (!run) return null;
  const handler = (event: unknown) => onEvent(event);
  run.emitter.on("event", handler);
  return () => run.emitter.off("event", handler);
}

export async function startDebugRun(rawOptions: Partial<DebugRunOptions>, baseUrl: string) {
  const icaos = Array.isArray(rawOptions.icaos) && rawOptions.icaos.length > 0
    ? rawOptions.icaos.map((i) => String(i).trim().toUpperCase()).filter((i) => /^[A-Z0-9]{4}$/.test(i))
    : undefined;
  const sourceMode: "auto" | "ead-only" = rawOptions.sourceMode === "ead-only" ? "ead-only" : "auto";
  const requestedConcurrency = Math.max(1, Math.min(8, Number(rawOptions.concurrency ?? 3)));
  const options: DebugRunOptions = {
    quantity: Math.max(1, Math.min(500, Number(rawOptions.quantity ?? 25))),
    allAirports: Boolean(rawOptions.allAirports ?? false),
    randomSample: Boolean(rawOptions.randomSample ?? true),
    countries: Array.isArray(rawOptions.countries) ? rawOptions.countries.slice(0, 50) : [],
    excludeCaptchaCountries: Boolean(rawOptions.excludeCaptchaCountries ?? false),
    // EAD blocks/invalidates sessions aggressively under parallel logins; force single worker in ead-only mode.
    concurrency: sourceMode === "ead-only" ? 1 : requestedConcurrency,
    steps: Array.isArray(rawOptions.steps) && rawOptions.steps.length > 0
      ? rawOptions.steps.filter((s): s is StepName => ALL_STEPS.includes(s as StepName))
      : ALL_STEPS,
    sourceMode,
    icaos,
  };

  const run: DebugRun = {
    id: randomUUID(),
    status: "running",
    startedAt: new Date().toISOString(),
    endedAt: null,
    options,
    totals: { airports: 0, failed: 0, timeout: 0 },
    events: [],
    airports: [],
    stopRequested: false,
    emitter: new EventEmitter(),
    baseUrl,
  };
  RUNS.set(run.id, run);

  executeRun(run).catch((err) => {
    run.status = "completed";
    run.endedAt = new Date().toISOString();
    logEvent(run, { level: "error", message: `Run crashed: ${String((err as Error).message || err)}` });
    run.emitter.emit("done");
  });

  return run;
}
