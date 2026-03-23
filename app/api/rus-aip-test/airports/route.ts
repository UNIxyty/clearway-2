import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const AIRPORT_DB = join(process.cwd(), "data", "rus-aip-international-airports.json");

type AirportRow = {
  icao: string;
  airport_name: string;
};

export async function GET() {
  try {
    const raw = await readFile(AIRPORT_DB, "utf8");
    const parsed = JSON.parse(raw) as { airports?: AirportRow[] };
    const airports = Array.isArray(parsed.airports) ? parsed.airports : [];
    return NextResponse.json({ ok: true, airports });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e), airports: [] },
      { status: 500 }
    );
  }
}
