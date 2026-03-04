import { NextResponse } from "next/server";
import regionsData from "@/data/regions.json";
import eadIcaosFromDocNames from "@/data/ead-icaos-from-document-names.json";

type RegionEntry = { region: string; countries: string[] };

export async function GET() {
  const regions = regionsData as RegionEntry[];
  const eadCountries = Object.keys((eadIcaosFromDocNames as { countries?: Record<string, unknown> }).countries ?? {});
  const withEad: RegionEntry[] = [
    { region: "EAD (EU AIP)", countries: eadCountries },
    ...regions,
  ];
  return NextResponse.json({ regions: withEad });
}
