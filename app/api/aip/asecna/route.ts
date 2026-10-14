import { NextRequest, NextResponse } from "next/server";
import { getAsecnaAirportByIcao, getAsecnaData } from "@/lib/asecna-airports";
import { readJsonFromStorage, writeJsonToStorage } from "@/lib/aip-storage";
import { saveFile } from "@/lib/storage";
import {
  asecnaAd2AirportBasename,
  createAsecnaFetch,
  htmlUrlToPdfUrl,
  parseAsecnaCli,
  resolveAsecnaHtmlUrl,
} from "@/scripts/asecna/asecna-eaip-http.mjs";
import { failure, logFailure, publicEventStream } from "@/lib/public-error";
import { AIP_FAILED, AIP_NOT_SET_UP, AIP_NO_ANSWER, aipSyncFailure } from "@/lib/aip-sync-failure";
import { requirePermission } from "@/lib/permissions/server";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";

/** Thrown when the sync worker answered with an error; its event is kept for choosing our wording. */
class SyncWorkerError extends Error {
  constructor(readonly event: { error?: string; detail?: string; code?: number }, readonly status: number) {
    super(`${event.error ?? "Sync failed"}${event.detail ? `: ${event.detail}` : ""}`);
  }
}

/** Our wording for a failed ASECNA download; the detail is logged. */
function asecnaFailure(icao: string, err: unknown) {
  logFailure("AIP-ASECNA", `ASECNA AD 2 sync for ${icao} failed`, err);
  return err instanceof SyncWorkerError ? aipSyncFailure({ ...err.event, status: err.status }) : { error: AIP_FAILED };
}

const JSON_PREFIX = "aip/asecna";
const PDF_PREFIX = "aip/asecna-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 600_000;

function rwandaHtmlToPdfUrl(htmlUrl: string): string {
  let out = htmlUrl.replace(/#.*$/, "");
  out = out.replace("-en-GB", "");
  out = out.replace(".html", ".pdf");
  out = out.replace("/eAIP/", "/documents/PDF/");
  return out;
}

async function saveJson(icao: string, payload: { updatedAt: string }) {
  await writeJsonToStorage(`${JSON_PREFIX}/${icao}.json`, payload);
}

async function readJson(icao: string): Promise<{ updatedAt: string | null } | null> {
  const json = await readJsonFromStorage<{ updatedAt?: string }>(`${JSON_PREFIX}/${icao}.json`);
  return json ? { updatedAt: json.updatedAt ?? null } : null;
}

async function downloadAsecnaPdfToStorage(icao: string, countryCode: string) {
  const airport = getAsecnaAirportByIcao(icao);
  if (!airport) throw new Error("ICAO not found in ASECNA metadata");
  const data = getAsecnaData();
  const menuBasename = data.menuBasename || "FR-menu-fr-FR.html";
  const menuDirUrl = `${new URL(data.menuUrl).origin}/html/eAIP/`;
  const htmlUrl = airport.ad2HtmlUrl
    || resolveAsecnaHtmlUrl(asecnaAd2AirportBasename(countryCode, icao, menuBasename), menuDirUrl);
  const pdfUrl = /\/eAIP_Rwanda\//i.test(htmlUrl) ? rwandaHtmlToPdfUrl(htmlUrl) : htmlUrlToPdfUrl(htmlUrl);

  const cli = parseAsecnaCli(process.argv);
  const strictTls = cli.strictTls && !cli.insecureTls;
  if (cli.insecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const http = createAsecnaFetch("API");
  const res = await http.fetchAsecna(pdfUrl, {}, { strictTls });
  if (!res.ok) throw new Error(`ASECNA PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (
    bytes.length < 32 ||
    bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 || bytes[4] !== 0x2d
  ) {
    throw new Error(`ASECNA PDF for ${icao} is not a valid PDF (got ${bytes.length} bytes; Content-Type: ${res.headers.get("content-type") ?? "unknown"})`);
  }
  await saveFile(`${PDF_PREFIX}/${icao}.pdf`, bytes);
}

export async function GET(request: NextRequest) {
  if (!hasInternalDebugAccess(request)) {
    const auth = await requirePermission("portal.aip.fetch");
    if ("error" in auth) return auth.error;
  }
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = request.nextUrl.searchParams.get("sync") === "1" || request.nextUrl.searchParams.get("sync") === "true";
  const stream = request.nextUrl.searchParams.get("stream") === "1" || request.nextUrl.searchParams.get("stream") === "true";
  const extract = !(request.nextUrl.searchParams.get("extract") === "0" || request.nextUrl.searchParams.get("extract") === "false");
  const force = request.nextUrl.searchParams.get("force") === "1" || request.nextUrl.searchParams.get("force") === "true";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }
  const airport = getAsecnaAirportByIcao(icao);
  if (!airport) return NextResponse.json({ airports: [], updatedAt: null }, { status: 200 });

  if (!sync) {
    const meta = await readJson(icao);
    return NextResponse.json({ airports: [], updatedAt: meta?.updatedAt ?? null });
  }

  // For AI extract flow, delegate to the existing sync-server pipeline.
  if (extract) {
    if (!AIP_SYNC_URL) {
      return failure(503, AIP_NOT_SET_UP, { tag: "AIP-ASECNA", what: "ASECNA extract sync requested but AIP_SYNC_URL is not set" }, { code: "not_configured" });
    }
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
    // force=1 propagates to the sync worker so it refetches from the source and
    // overwrites the stored JSON/PDF instead of serving its own cached copy.
    const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}${stream ? "&stream=1" : ""}&extract=1${force ? "&force=1" : ""}`;

    try {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      request.signal.addEventListener("abort", onAbort, { once: true });
      const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
      const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", onAbort);

      if (stream && res.ok && res.body) {
        return new Response(publicEventStream(res.body, "AIP-ASECNA", (e) => aipSyncFailure(e)), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      const data = (await res.json().catch(() => ({}))) as {
        airports?: unknown[];
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        logFailure("AIP-ASECNA", `ASECNA extract sync for ${icao} returned ${res.status}`, { error: data.error, detail: data.detail });
        return NextResponse.json(aipSyncFailure({ ...data, status: res.status }), { status: res.status >= 400 && res.status < 600 ? res.status : 502 });
      }
      const updatedAt = new Date().toISOString();
      await saveJson(icao, { updatedAt });
      return NextResponse.json({ airports: Array.isArray(data.airports) ? data.airports : [], updatedAt, pdfReady: true });
    } catch (err) {
      if (request.signal.aborted) {
        return NextResponse.json({ error: "Request cancelled by client" }, { status: 499 });
      }
      return failure(502, AIP_NO_ANSWER, { tag: "AIP-ASECNA", what: `ASECNA extract sync for ${icao} failed`, detail: err });
    }
  }

  // PDF-only sync: delegate to sync server (Playwright) when available,
  // so it can render the HTML page as PDF even when static PDF URLs return 404.
  // Fall back to direct HTTP only when no sync server is configured.
  async function downloadPdfForIcao() {
    if (AIP_SYNC_URL) {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
      const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}&extract=0${force ? "&force=1" : ""}`;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      request.signal.addEventListener("abort", onAbort, { once: true });
      const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
      try {
        const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string; detail?: string; code?: number };
          throw new SyncWorkerError(data, res.status);
        }
      } finally {
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", onAbort);
      }
    } else {
      await downloadAsecnaPdfToStorage(icao, airport!.countryCode);
    }
  }

  if (!stream) {
    try {
      await downloadPdfForIcao();
    } catch (err) {
      return NextResponse.json(asecnaFailure(icao, err), { status: 500 });
    }
    const updatedAt = new Date().toISOString();
    await saveJson(icao, { updatedAt });
    return NextResponse.json({ done: true, airports: [], updatedAt, pdfReady: true });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        send({ step: "Resolving ASECNA AD 2 source…" });
        await downloadPdfForIcao();
        const updatedAt = new Date().toISOString();
        await saveJson(icao, { updatedAt });
        send({ step: "ASECNA AD 2 PDF saved to storage." });
        send({ done: true, airports: [], updatedAt, pdfReady: true });
      } catch (err) {
        send(asecnaFailure(icao, err));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
