import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { readFile as readStoredFile } from "@/lib/storage";
import { logError } from "@/lib/utils/logger";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";
import { TRY_AGAIN, failure, logFailure, publicEventStream, upstreamFailure } from "@/lib/public-error";
import { requirePermission } from "@/lib/permissions/server";

// What a person sees when the weather cannot be fetched. The detail goes to the log.
const NOT_SET_UP = "Getting new weather is not set up on this server. Report it from Help & support.";
const NO_ANSWER = `The weather service did not answer. ${TRY_AGAIN}`;
const FAILED = `The weather service could not get the weather for this airport. ${TRY_AGAIN}`;
const TIMED_OUT = `The weather service took too long to answer. ${TRY_AGAIN}`;

const WEATHER_PREFIX = "weather";
const NOTAM_SYNC_URL = process.env.NOTAM_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
/** Dedicated weather sync host (second tmux / second port). Falls back to NOTAM_SYNC_URL. */
const WEATHER_SYNC_URL =
  process.env.WEATHER_SYNC_URL?.replace(/\/$/, "") || NOTAM_SYNC_URL;
const WEATHER_SYNC_SECRET = process.env.WEATHER_SYNC_SECRET ?? NOTAM_SYNC_SECRET;
const SYNC_TIMEOUT_MS = 120_000;
const RUN_TIMEOUT_MS = 90_000;
const NOTAM_SCRAPER = (process.env.NOTAM_SCRAPER || "skylink").toLowerCase();
const LOCAL_WEATHER_SCRIPT = join(
  process.cwd(),
  "scripts",
  NOTAM_SCRAPER === "crewbriefing"
    ? "crewbriefing-opmet-notams.mjs"
    : "skylink-weather.mjs",
);

type WeatherPayload = {
  icao: string;
  weather: string;
  updatedAt: string | null;
};

async function getFromStorage(icao: string): Promise<WeatherPayload | null> {
  try {
    const key = `${WEATHER_PREFIX}/${icao}.json`;
    const body = (await readStoredFile(key))?.toString("utf8");
    if (!body) return null;
    const data = JSON.parse(body) as { icao?: string; weather?: string; updatedAt?: string };
    return {
      icao: data.icao ?? icao,
      weather: data.weather ?? "",
      updatedAt: data.updatedAt ?? null,
    };
  } catch (e: unknown) {
    logError("WEATHER-API", "Local weather read failed", e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!hasInternalDebugAccess(request)) {
    const auth = await requirePermission("portal.aip.fetch");
    if ("error" in auth) return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = searchParams.get("sync") === "1" || searchParams.get("sync") === "true";
  const stream = searchParams.get("stream") === "1" || searchParams.get("stream") === "true";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO code required" }, { status: 400 });
  }

  if (sync) {
    if (!WEATHER_SYNC_URL) {
      return failure(503, NOT_SET_UP, { tag: "WEATHER-API", what: "Weather sync requested but WEATHER_SYNC_URL / NOTAM_SYNC_URL is not set" }, { code: "not_configured" });
    }
    const syncUrl = `${WEATHER_SYNC_URL}/sync/weather?icao=${encodeURIComponent(icao)}${stream ? "&stream=1" : ""}`;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (WEATHER_SYNC_SECRET) headers["X-Sync-Secret"] = WEATHER_SYNC_SECRET;
    try {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      request.signal.addEventListener("abort", onAbort, { once: true });
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
      const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timeoutId);
      request.signal.removeEventListener("abort", onAbort);

      if (stream && res.ok && res.body) {
        return new Response(publicEventStream(res.body, "WEATHER-API", FAILED), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }
      const text = await res.text().catch(() => "");
      let data = {} as { weather?: string; updatedAt?: string };
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        return upstreamFailure(FAILED, res.status, { tag: "WEATHER-API", what: `Weather sync for ${icao} returned ${res.status}`, detail: text.slice(0, 500) });
      }
      return NextResponse.json({ icao, weather: data.weather ?? "", updatedAt: data.updatedAt ?? null });
    } catch (e) {
      if (request.signal.aborted) {
        return NextResponse.json({ error: "Request cancelled by client" }, { status: 499 });
      }
      return upstreamFailure(NO_ANSWER, "unreachable", { tag: "WEATHER-API", what: `Weather sync for ${icao} unreachable`, detail: e });
    }
  }

  const fromStorage = await getFromStorage(icao);
  if (fromStorage) return NextResponse.json(fromStorage);
  if (!existsSync(LOCAL_WEATHER_SCRIPT)) {
    return NextResponse.json({ icao, weather: "", updatedAt: null });
  }

  return new Promise<NextResponse>((resolve) => {
    const args = [LOCAL_WEATHER_SCRIPT, "--json", icao];
    if (NOTAM_SCRAPER === "crewbriefing") args.push("--mode", "weather");
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(NextResponse.json({ error: TIMED_OUT, upstreamStatus: "timeout" }, { status: 503 }));
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
      resolve(failure(500, FAILED, { tag: "WEATHER-API", what: `Weather scraper for ${icao} could not start`, detail: err }));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !stdout) {
        logFailure("WEATHER-API", `Weather scraper for ${icao} exited ${code}`, stderr.slice(-800));
        resolve(failure(500, FAILED)); // our own scraper process, not a gateway
        return;
      }
      try {
        const lastLine = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
        const parsed = JSON.parse(lastLine) as { weather?: string; updatedAt?: string };
        resolve(
          NextResponse.json({
            icao,
            weather: parsed.weather ?? "",
            updatedAt: parsed.updatedAt ?? null,
          }),
        );
      } catch {
        resolve(NextResponse.json({ icao, weather: "", updatedAt: null }));
      }
    });
  });
}

