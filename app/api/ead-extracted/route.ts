import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const EXTRACTED_PATH = join(process.cwd(), "data", "ead-aip-extracted.json");

export type EADExtractedAirport = {
  "Airport Code": string;
  "Airport Name": string;
  "AD2.2 Types of Traffic Permitted": string;
  "AD2.2 Remarks": string;
  "AD2.3 AD Operator": string;
  "AD 2.3 Customs and Immigration": string;
  "AD2.3 ATS": string;
  "AD2.3 Remarks": string;
  "AD2.6 AD category for fire fighting": string;
  _source?: string;
};

export async function GET() {
  try {
    const raw = await readFile(EXTRACTED_PATH, "utf8");
    const data = JSON.parse(raw) as { source?: string; extracted?: string; airports?: EADExtractedAirport[] };
    return NextResponse.json({ ok: true, ...data });
  } catch {
    return NextResponse.json({ ok: false, airports: [], source: null });
  }
}
