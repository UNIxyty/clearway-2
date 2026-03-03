import { NextResponse } from "next/server";
import usaByState from "@/data/usa-aip-icaos-by-state.json";

type USAByState = { by_state?: Record<string, unknown[]> };

export async function GET() {
  const data = usaByState as USAByState;
  const states = data.by_state ? Object.keys(data.by_state).sort() : [];
  return NextResponse.json({ states });
}
