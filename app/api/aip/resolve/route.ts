import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";
import { storageObjectExists } from "@/lib/aip-storage";
import { getAsecnaAirportsSet } from "@/lib/asecna-airports";
import { getScraperCountryByIcao } from "@/lib/scraper-country-config";
import { isUsaAipIcao } from "@/lib/usa-aip";
import { isEadSupportedIcao } from "@/lib/ead-country-coverage";

// Resolve which AIP source serves an ICAO and whether its AD-2 PDF is
// already in the shared /storage cache — WITHOUT triggering any sync.
//
// This is the same source-selection logic the AIP page uses client-side
// (ASECNA set -> national scraper -> USA static -> EAD default), exposed for
// server-to-server consumers (the Digital Wall overlay proxies through it),
// so page and wall always agree on the source and share one cached PDF copy.

const SOURCE_PREFIXES: Record<string, string[]> = {
  // ASECNA PDFs are read EAD-prefix-first by the asecna pdf route.
  asecna: ["aip/ead-pdf", "aip/asecna-pdf"],
  scraper: ["aip/scraper-pdf"],
  usa: ["aip/usa-pdf"],
  ead: ["aip/ead-pdf"],
};

function resolveSource(icao: string): string {
  if (getAsecnaAirportsSet().has(icao)) return "asecna";
  if (getScraperCountryByIcao(icao)) return "scraper";
  if (isUsaAipIcao(icao)) return "usa";
  return "ead"; // page default for everything else
}

export async function GET(request: NextRequest) {
  if (!hasInternalDebugAccess(request)) {
    const auth = await requireAuthenticatedUser();
    if ("error" in auth) return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO code required" }, { status: 400 });
  }

  const source = resolveSource(icao);

  // Cached-copy check: the resolved source's keyspaces first, then any other
  // keyspace (a copy fetched earlier by ANY user through ANY surface counts).
  const orderedPrefixes = [
    ...SOURCE_PREFIXES[source],
    ...Object.values(SOURCE_PREFIXES)
      .flat()
      .filter((prefix) => !SOURCE_PREFIXES[source].includes(prefix)),
  ];
  let storageKey: string | null = null;
  for (const prefix of orderedPrefixes) {
    const key = `${prefix}/${icao}.pdf`;
    if (await storageObjectExists(key)) {
      storageKey = key;
      break;
    }
  }

  return NextResponse.json({
    icao,
    source,
    eadSupported: isEadSupportedIcao(icao),
    cached: Boolean(storageKey),
    storageKey,
    // Where a cached copy is served from (no sync) / the normal fetch route
    // (downloads on miss and writes the shared cache).
    filesPath: storageKey ? `/files/${storageKey}` : null,
    pdfPath: `/api/aip/${source}/pdf?icao=${encodeURIComponent(icao)}`,
  });
}
