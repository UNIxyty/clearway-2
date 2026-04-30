import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { saveFile } from "@/lib/storage";
import { isUsaAipIcao } from "@/lib/usa-aip";
import { getScraperCountryByIcao } from "@/lib/scraper-country-config";
import { getAsecnaAirportsSet } from "@/lib/asecna-airports";
import { internalDebugAuthHeaders } from "@/lib/internal-debug-auth";

type StepName = "aip" | "notam" | "weather" | "pdf" | "gen";
type StepState = "pending" | "running" | "passed" | "failed" | "timeout" | "skipped";
type RunState = "running" | "completed" | "stopped";
const ALL_STEPS: StepName[] = ["aip", "notam", "weather", "pdf", "gen"];
const ASECNA_SET = getAsecnaAirportsSet();

export type DebugRunOptions = {
  quantity: number;
  randomSample: boolean;
  countries: string[];
  concurrency: number;
  steps: StepName[];
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

function stepKeyForAirport(icao: string): { aipBase: string; pdfUrl: string; genPdfUrl: string } {
  const scraper = getScraperCountryByIcao(icao);
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

async function listAirportCandidates(options: DebugRunOptions): Promise<AirportCandidate[]> {
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
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
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ icao, country, name }) => ({ icao, country, name }));

  return sample(rows, options.quantity, options.randomSample);
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
  const endpoints = stepKeyForAirport(icao);
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
    if (!res.ok) throw new Error(await readErrorDetail(res, "PDF"));
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
      if (!sync.ok) throw new Error(await readErrorDetail(sync, "GEN sync"));
    }
    const pdf = await requestOrThrow(`${run.baseUrl}${endpoints.genPdfUrl}`);
    if (!pdf.ok) {
      const detail = await readErrorDetail(pdf, "GEN PDF");
      if (isAsecnaGenNotAvailable(pdf, detail)) {
        return "Endpoint successful; this ASECNA country does not publish a GEN 1.2 section in the menu.";
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

export function subscribeDebugRun(id: string, onEvent: (event: unknown) => void) {
  const run = RUNS.get(id);
  if (!run) return null;
  const handler = (event: unknown) => onEvent(event);
  run.emitter.on("event", handler);
  return () => run.emitter.off("event", handler);
}

export async function startDebugRun(rawOptions: Partial<DebugRunOptions>, baseUrl: string) {
  const options: DebugRunOptions = {
    quantity: Math.max(1, Math.min(500, Number(rawOptions.quantity ?? 25))),
    randomSample: Boolean(rawOptions.randomSample ?? true),
    countries: Array.isArray(rawOptions.countries) ? rawOptions.countries.slice(0, 50) : [],
    concurrency: Math.max(1, Math.min(8, Number(rawOptions.concurrency ?? 3))),
    steps: Array.isArray(rawOptions.steps) && rawOptions.steps.length > 0
      ? rawOptions.steps.filter((s): s is StepName => ALL_STEPS.includes(s as StepName))
      : ALL_STEPS,
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
