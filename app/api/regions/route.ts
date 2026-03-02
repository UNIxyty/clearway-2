import { NextResponse } from "next/server";
import regionsData from "@/data/regions.json";

type RegionEntry = { region: string; countries: string[] };

export async function GET() {
  const regions = regionsData as RegionEntry[];
  return NextResponse.json({ regions });
}
