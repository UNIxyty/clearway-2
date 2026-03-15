import { NextResponse } from "next/server";
import regionsData from "@/data/regions.json";
import eadCountryIcaos from "@/lib/ead-country-icaos.generated.json";

export const dynamic = "force-dynamic";

function getEadCountryIcaos(): Record<string, unknown> {
  return eadCountryIcaos as Record<string, unknown>;
}

type RegionEntry = { region: string; countries: string[] };

/** Map EAD country label (e.g. "Croatia (LD)") to world region name. Used to merge EAD into existing regions. */
const EAD_COUNTRY_TO_REGION: Record<string, string> = {
  "Albania (LA)": "Europe",
  "Armenia (UD)": "Asia",
  "Austria (LO)": "Europe",
  "Azerbaijan (UB)": "Asia",
  "Belgium (EB)": "Europe",
  "Bosnia/Herzeg. (LQ)": "Europe",
  "Bulgaria (LB)": "Europe",
  "Croatia (LD)": "Europe",
  "Cyprus (LC)": "Europe",
  "Czech Republic (LK)": "Europe",
  "Denmark (EK)": "Europe",
  "Estonia (EE)": "Europe",
  "Faroe Islands (XX)": "Europe",
  "Finland (EF)": "Europe",
  "France (LF)": "Europe",
  "Georgia (UG)": "Asia",
  "Germany (ED)": "Europe",
  "Greece (LG)": "Europe",
  "Greenland (BG)": "North America & Caribbean",
  "Hungary (LH)": "Europe",
  "Iceland (BI)": "Europe",
  "Ireland (EI)": "Europe",
  "Italy (LI)": "Europe",
  "Jordan (OJ)": "Asia",
  "KFOR SECTOR (BK)": "Europe",
  "Kazakhstan (UA)": "Asia",
  "Kyrgyzstan (UC)": "Asia",
  "Latvia (EV)": "Europe",
  "Lithuania (EY)": "Europe",
  "Malta (LM)": "Europe",
  "Moldova (LU)": "Europe",
  "Netherlands (EH)": "Europe",
  "Norway (EN)": "Europe",
  "Philippines (RP)": "Asia",
  "Poland (EP)": "Europe",
  "Portugal (LP)": "Europe",
  "Republic of North Macedonia (LW)": "Europe",
  "Romania (LR)": "Europe",
  "Serbia and Montenegro (LY)": "Europe",
  "Slovakia (LZ)": "Europe",
  "Slovenia (LJ)": "Europe",
  "Spain (LE)": "Europe",
  "Sweden (ES)": "Europe",
  "Switzerland (LS)": "Europe",
  "Turkey (LT)": "Europe",
  "Ukraine (UK)": "Europe",
  "United Kingdom (EG)": "Europe",
};

export async function GET() {
  const regions = regionsData as RegionEntry[];
  const eadCountries = getEadCountryIcaos();
  const eadCountryKeys = Object.keys(eadCountries);

  const regionByName = new Map<string, string[]>();
  for (const r of regions) {
    regionByName.set(r.region, [...r.countries]);
  }

  for (const eadLabel of eadCountryKeys) {
    const region = EAD_COUNTRY_TO_REGION[eadLabel];
    if (!region) continue;
    const list = regionByName.get(region);
    if (list && !list.includes(eadLabel)) list.push(eadLabel);
    else if (!list) regionByName.set(region, [eadLabel]);
  }

  const withEad: RegionEntry[] = [...regions].map((r) => ({
    region: r.region,
    countries: regionByName.get(r.region) ?? r.countries,
  }));

  return NextResponse.json(
    { regions: withEad },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
