import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { readFile as readStoredFile } from "@/lib/storage";
import { logError } from "@/lib/utils/logger";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";
import { TRY_AGAIN, failure, publicEventStream } from "@/lib/public-error";

// What a person sees when NOTAMs cannot be fetched. The detail goes to the log.
const NOT_SET_UP = "Getting new NOTAMs is not set up on this server. Report it from Help & support.";
const NO_ANSWER = `The NOTAM service did not answer. ${TRY_AGAIN}`;
const FAILED = `The NOTAM service could not get NOTAMs for this airport. ${TRY_AGAIN}`;
const TIMED_OUT = `The NOTAM service took too long to answer. ${TRY_AGAIN}`;

const NOTAM_SCRAPER = (process.env.NOTAM_SCRAPER || "skylink").toLowerCase();

const SCRAPER_SCRIPTS: Record<string, string> = {
  faa: "notam-scraper.mjs",
  crewbriefing: "crewbriefing-opmet-notams.mjs",
  skylink: "skylink-notams.mjs",
};

// Callers may pin the NOTAM source with ?scraper= (the Digital Wall always
// sends scraper=crewbriefing — CrewBriefing output is the operationally
// intended set: it already applies the "CLEARWAY company policy" and
// military-NOTAM exclusions upstream). Without the param, the env-configured
// scraper is used (route default: skylink).
function resolveScraper(requested: string | null): string {
  const value = (requested || "").trim().toLowerCase();
  return value && SCRAPER_SCRIPTS[value] ? value : NOTAM_SCRAPER;
}

function scraperScriptPath(scraper: string): string {
  return join(process.cwd(), "scripts", SCRAPER_SCRIPTS[scraper] ?? SCRAPER_SCRIPTS.skylink);
}
const RUN_TIMEOUT_MS = 90_000;
const SYNC_TIMEOUT_MS = 120_000;
const NOTAMS_PREFIX = "notam";
const NOTAM_SYNC_URL = process.env.NOTAM_SYNC_URL?.replace(/\/$/, ""); // base URL of EC2 sync server
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";

export type NotamItem = {
  location: string;
  number: string;
  class: string;
  startDateUtc: string;
  endDateUtc: string;
  created?: string; // release/creation date when the source exposes one
  condition: string;
};

async function getFromStorage(icao: string): Promise<{ icao: string; notams: NotamItem[]; updatedAt: string | null } | null> {
  try {
    const key = `${NOTAMS_PREFIX}/${icao}.json`;
    const bytes = await readStoredFile(key);
    const body = bytes?.toString("utf8");
    if (!body) return null;
    const data = JSON.parse(body) as { icao?: string; notams?: NotamItem[]; updatedAt?: string };
    return {
      icao: data.icao ?? icao,
      notams: data.notams ?? [],
      updatedAt: data.updatedAt ?? null,
    };
  } catch (e: unknown) {
    logError("NOTAM-API", "Local NOTAM read failed", e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!hasInternalDebugAccess(request)) {
    const auth = await requireAuthenticatedUser();
    if ("error" in auth) return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = searchParams.get("sync") === "1" || searchParams.get("sync") === "true";
  const stream = searchParams.get("stream") === "1" || searchParams.get("stream") === "true";
  const scraper = resolveScraper(searchParams.get("scraper"));

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json(
      { error: "Valid 4-letter ICAO code required" },
      { status: 400 }
    );
  }

  // When sync=1 we must run the scraper on sync server; do not return stale cache
  if (sync) {
    if (!NOTAM_SYNC_URL) {
      return failure(503, NOT_SET_UP, { tag: "NOTAM-API", what: "NOTAM sync requested but NOTAM_SYNC_URL is not set" }, { code: "not_configured" });
    }
    const syncUrl = `${NOTAM_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}${stream ? "&stream=1" : ""}`;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
    try {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      request.signal.addEventListener("abort", onAbort, { once: true });
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
      const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timeoutId);
      request.signal.removeEventListener("abort", onAbort);
      // Stream mode: forward SSE from sync service to client (no buffering)
      if (stream && res.ok && res.body) {
        return new Response(publicEventStream(res.body, "NOTAM-API", FAILED), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }
      if (res.ok) {
        const data = (await res.json()) as { icao?: string; notams?: NotamItem[]; updatedAt?: string };
        return NextResponse.json({
          icao: data.icao ?? icao,
          notams: data.notams ?? [],
          updatedAt: data.updatedAt ?? null,
        });
      }
      const errBody = await res.text();
      logError("NOTAM-API", `NOTAM sync failed with status ${res.status}: ${errBody.slice(0, 200)}`);
      return failure(502, FAILED);
    } catch (e) {
      if (request.signal.aborted) {
        return NextResponse.json({ error: "Request cancelled by client" }, { status: 499 });
      }
      logError("NOTAM-API", "NOTAM sync request failed", e);
      return failure(502, NO_ANSWER);
    }
  }

  const fromStorage = await getFromStorage(icao);
  if (fromStorage) {
    return NextResponse.json({
      icao: fromStorage.icao,
      notams: fromStorage.notams,
      updatedAt: fromStorage.updatedAt,
    });
  }

  // Cache miss: delegate to the dedicated sync worker when configured. The
  // portal runner image is a pruned Next standalone — spawning the Playwright
  // scraper here dies resolving its imports (the intermittent per-airport
  // 502 with an ESM defaultResolve stack, e.g. LGIR). The notam-sync worker
  // ships the full repo + chromium and also persists the result to storage,
  // so the next request is a cache hit. Local spawn below stays as the dev
  // fallback only.
  if (NOTAM_SYNC_URL) {
    const syncUrl = `${NOTAM_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}`;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
      const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = (await res.json()) as { icao?: string; notams?: NotamItem[]; updatedAt?: string };
        return NextResponse.json({
          icao: data.icao ?? icao,
          notams: data.notams ?? [],
          updatedAt: data.updatedAt ?? null,
        });
      }
      const errBody = await res.text();
      logError("NOTAM-API", `NOTAM cache-miss sync for ${icao} failed (${res.status}): ${errBody.slice(0, 300)}`);
      return failure(502, FAILED);
    } catch (e) {
      logError("NOTAM-API", `NOTAM cache-miss sync for ${icao} unreachable`, e);
      return failure(502, NO_ANSWER);
    }
  }

  const scriptPath = scraperScriptPath(scraper);
  if (!existsSync(scriptPath)) {
    return failure(503, NOT_SET_UP, { tag: "NOTAM-API", what: `NOTAM scraper script not found: ${scriptPath}` }, { code: "not_configured" });
  }

  // Never silently fall back to a different source: if the pinned scraper is
  // CrewBriefing and its credentials are absent, fail loudly instead.
  if (
    scraper === "crewbriefing" &&
    (!process.env.CREWBRIEFING_USERNAME || !process.env.CREWBRIEFING_PASSWORD)
  ) {
    return failure(503, NOT_SET_UP, {
      tag: "NOTAM-API",
      what: "CrewBriefing NOTAM source requested but CREWBRIEFING_USERNAME / CREWBRIEFING_PASSWORD are not configured",
    }, { code: "not_configured" });
  }

  return new Promise<NextResponse>((resolve) => {
    const args = [scriptPath, "--json", icao];
    if (scraper === "crewbriefing") args.push("--mode", "notam");
    const child = spawn(
      process.execPath,
      args,
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(
        NextResponse.json({ error: TIMED_OUT }, { status: 504 })
      );
    }, RUN_TIMEOUT_MS);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve(failure(500, FAILED, { tag: "NOTAM-API", what: `NOTAM scraper for ${icao} could not start`, detail: err }));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !stdout) {
        // The full stderr goes to the log, never to the caller.
        logError("NOTAM-API", `NOTAM scraper subprocess for ${icao} exited ${code}: ${stderr.slice(-800)}`);
        // A module-resolution crash means this runtime cannot run the scraper at all (NOTAM_SYNC_URL is needed).
        const moduleCrash = /ERR_MODULE_NOT_FOUND|Cannot find (module|package)|esm\/resolve/i.test(stderr);
        resolve(moduleCrash ? failure(502, NOT_SET_UP, undefined, { code: "not_configured" }) : failure(502, FAILED));
        return;
      }
      try {
        const lastLine = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
        const parsed = JSON.parse(lastLine) as
          | NotamItem[]
          | { notams?: NotamItem[] };
        const notams: NotamItem[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.notams)
            ? parsed.notams
            : [];
        resolve(NextResponse.json({ icao, notams, updatedAt: null }));
      } catch {
        logError("NOTAM-API", `NOTAM scraper for ${icao} printed no JSON: ${stdout.slice(-300)}`);
        resolve(failure(502, FAILED));
      }
    });
  });
}
