import { NextRequest, NextResponse } from "next/server";
import { createAsecnaFetch, asecnaFormattedLeafBasename, resolveAsecnaHtmlUrl, htmlUrlToPdfUrl } from "@/scripts/asecna-eaip-http.mjs";
import { getAsecnaAirportByIcao, getAsecnaData } from "@/lib/asecna-airports";

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  const airport = getAsecnaAirportByIcao(icao);
  if (!airport) {
    return NextResponse.json({ error: "ICAO not found in ASECNA list" }, { status: 404 });
  }

  const data = getAsecnaData();
  const country = (data.countries || []).find((c) => c.code === airport.countryCode);
  if (!country?.gen12?.anchor) {
    return NextResponse.json(
      { error: "GEN 1.2 not available for this country in ASECNA menu" },
      { status: 404 },
    );
  }

  const menuDir = data.menuUrl.replace(/[^/]+$/, "");
  const htmlFile = asecnaFormattedLeafBasename(country.gen12.anchor, data.menuBasename || "FR-menu-fr-FR.html");
  const htmlUrl = resolveAsecnaHtmlUrl(htmlFile, menuDir);
  const pdfUrl = htmlUrlToPdfUrl(htmlUrl);

  const fetcher = createAsecnaFetch("GEN");
  const res = await fetcher.fetchAsecna(pdfUrl, {}, { strictTls: false });
  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to download ASECNA GEN PDF", detail: `${res.status} ${res.statusText}` },
      { status: 502 },
    );
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${icao}_ASECNA_GEN_1.2.pdf"`,
    },
  });
}
