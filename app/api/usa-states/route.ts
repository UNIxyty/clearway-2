import { NextResponse } from "next/server";
import usaByState from "@/data/usa-aip-icaos-by-state.json";
import { staffGate } from "@/lib/admin-auth";

type USAByState = { by_state?: Record<string, unknown[]> };

export async function GET(request: Request) {
  const notStaff = await staffGate(request); if (notStaff) return notStaff; // staff (or the platform's own services) only, checked here (2026-11-02)
  const data = usaByState as USAByState;
  const states = data.by_state ? Object.keys(data.by_state).sort() : [];
  return NextResponse.json({ states });
}
