import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { readFile as readStoredFile } from "@/lib/storage";
import { logError } from "@/lib/utils/logger";

const NOTAM_SCRAPER = (process.env.NOTAM_SCRAPER || "crewbriefing").toLowerCase();
const SCRIPT_PATH = join(
  process.cwd(),
  "scripts",
  NOTAM_SCRAPER === "faa" ? "notam-scraper.mjs" : "crewbriefing-notams.mjs"
);
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
  const { searchParams } = new URL(request.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = searchParams.get("sync") === "1" || searchParams.get("sync") === "true";
  const stream = searchParams.get("stream") === "1" || searchParams.get("stream") === "true";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json(
      { error: "Valid 4-letter ICAO code required" },
      { status: 400 }
    );
  }

  // When sync=1 we must run the scraper on sync server; do not return stale cache
  if (sync) {
    if (!NOTAM_SYNC_URL) {
      return NextResponse.json(
        {
          error: "Sync not configured",
          detail: "Set NOTAM_SYNC_URL to your self-hosted NOTAM sync service (e.g. http://notam-sync:3001).",
        },
        { status: 503 }
      );
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
        return new Response(res.body, {
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
      return NextResponse.json(
        {
          error: "Sync failed",
          detail: `Sync server returned ${res.status}. Ensure notam-sync container is running and scraper completes. ${errBody.slice(0, 200)}`,
        },
        { status: 502 }
      );
    } catch (e) {
      if (request.signal.aborted) {
        return NextResponse.json({ error: "Request cancelled by client" }, { status: 499 });
      }
      const msg = e instanceof Error ? e.message : String(e);
      logError("NOTAM-API", "NOTAM sync request failed", e);
      return NextResponse.json(
        {
          error: "Sync server unreachable",
          detail: `Cannot reach sync server at NOTAM_SYNC_URL. Check: (1) notam-sync container is running. (2) service network/port is reachable. (3) NOTAM_SYNC_URL is correct. ${msg}`,
        },
        { status: 502 }
      );
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

  if (!existsSync(SCRIPT_PATH)) {
    return NextResponse.json(
      { error: "NOTAM scraper script not found.", detail: "Run NOTAMs locally: npm run notam " + icao },
      { status: 503 }
    );
  }

  return new Promise<NextResponse>((resolve) => {
    const child = spawn(
      process.execPath,
      [SCRIPT_PATH, "--json", icao],
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
        NextResponse.json(
          { error: "NOTAM search timed out. Try again or run the scraper locally." },
          { status: 504 }
        )
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
      resolve(
        NextResponse.json(
          { error: "Failed to run NOTAM scraper.", detail: String(err.message) },
          { status: 500 }
        )
      );
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !stdout) {
        resolve(
          NextResponse.json(
            {
              error: "NOTAM scraper failed.",
              detail: stderr.slice(-500) || `Exit code ${code}`,
            },
            { status: 502 }
          )
        );
        return;
      }
      try {
        const lastLine = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
        const notams: NotamItem[] = JSON.parse(lastLine);
        resolve(NextResponse.json({ icao, notams, updatedAt: null }));
      } catch {
        resolve(
          NextResponse.json(
            { error: "Invalid NOTAM response.", detail: stdout.slice(-300) },
            { status: 502 }
          )
        );
      }
    });
  });
}
