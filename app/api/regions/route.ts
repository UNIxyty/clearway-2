import { NextResponse } from "next/server";
import regionsData from "@/data/regions.json";
import eadIcaosFromDocNames from "@/data/ead-icaos-from-document-names.json";

type RegionEntry = { region: string; countries: string[] };

const EAD_REGIONS: Record<string, string[]> = {
  "EAD — Northern Europe": [
    "Denmark (EK)",
    "Estonia (EE)",
    "Finland (EF)",
    "Ireland (EI)",
    "Latvia (EV)",
    "Lithuania (EY)",
    "Sweden (ES)",
  ],
  "EAD — Western Europe": [
    "Belgium (EB)",
    "France (LF)",
    "Germany (ED)",
    "Luxembourg (EL)",
    "Netherlands (EH)",
  ],
  "EAD — Southern Europe": [
    "Albania (LA)",
    "Greece (LG)",
    "Italy (LI)",
    "Malta (LM)",
    "Portugal (LP)",
    "Spain (LE)",
    "Spain (GC)",
  ],
  "EAD — Central Europe": [
    "Austria (LO)",
    "Bulgaria (LB)",
    "Czech Republic (LK)",
    "Hungary (LH)",
    "Poland (EP)",
    "Romania (LR)",
    "Slovakia (LZ)",
    "Slovenia (LJ)",
  ],
};

export async function GET() {
  const regions = regionsData as RegionEntry[];
  const eadCountryKeys = Object.keys((eadIcaosFromDocNames as { countries?: Record<string, unknown> }).countries ?? {});
  const eadRegionEntries: RegionEntry[] = Object.entries(EAD_REGIONS).map(([region, countries]) => ({
    region,
    countries: countries.filter((c) => eadCountryKeys.includes(c)),
  }));
  const withEad: RegionEntry[] = [...eadRegionEntries, ...regions];
  return NextResponse.json({ regions: withEad });
}
