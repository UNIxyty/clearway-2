import { NextRequest, NextResponse } from "next/server";
import { isUsaAipIcao } from "@/lib/usa-aip";
import { readJsonFromStorage, storageObjectExists, writeJsonToStorage } from "@/lib/aip-storage";
import { failure } from "@/lib/public-error";
import { requirePermission } from "@/lib/permissions/server";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";

// What a person sees; the detail (a missing file path) goes to the log.
const noPdf = (icao: string) => `There is no stored AIP document for ${icao} yet. If you need it, report it from Help & support.`;

const PDF_PREFIX = "aip/usa-pdf";
const JSON_PREFIX = "aip/usa";

async function hasPdf(icao: string): Promise<boolean> {
  return storageObjectExists(`${PDF_PREFIX}/${icao}.pdf`);
}

async function getCachedJson(icao: string): Promise<{ airports: unknown[]; updatedAt: string | null } | null> {
  const data = await readJsonFromStorage<{ airports?: unknown[]; updatedAt?: string | null }>(
    `${JSON_PREFIX}/${icao}.json`,
  );
  if (!data) return null;
  return { airports: Array.isArray(data.airports) ? data.airports : [], updatedAt: data.updatedAt ?? null };
}

async function putCachedJson(icao: string, payload: { airports: unknown[]; updatedAt: string }) {
  await writeJsonToStorage(`${JSON_PREFIX}/${icao}.json`, payload);
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

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }
  if (!isUsaAipIcao(icao)) {
    return NextResponse.json({ airports: [], updatedAt: null }, { status: 200 });
  }

  // No model reads the AD 2 PDF into fields any more (2026-11-03): the PDF is the AIP, served as it is (/api/aip/usa/pdf).
  // Rows a model extracted earlier are not served either. `extract` is accepted and ignored.
  void extract;
  if (!sync) {
    const fromStorage = await getCachedJson(icao);
    return NextResponse.json({ airports: [], updatedAt: fromStorage?.updatedAt ?? null });
  }
  const exists = await hasPdf(icao);
  if (!exists) {
    if (stream) return sse([{ error: noPdf(icao), code: "not_found" }]);
    return failure(404, noPdf(icao), { tag: "AIP-USA", what: `USA AD 2 PDF missing: ${PDF_PREFIX}/${icao}.pdf` }, { code: "not_found" });
  }
  const updatedAt = new Date().toISOString();
  await putCachedJson(icao, { airports: [], updatedAt });
  const done = { done: true, airports: [], updatedAt, pdfReady: true };
  return stream ? sse([{ step: "USA AD 2 PDF ready." }, done]) : NextResponse.json(done);
}

function sse(events: unknown[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" } });
}
