import { NextResponse } from "next/server";
import { resolveKoreaKocaEaipPackageRoot } from "@/lib/korea-koca-eaip-resolve";
import { staffGate } from "@/lib/admin-auth";

export const revalidate = 300;

export async function GET(request: Request) {
  const notStaff = await staffGate(request); if (notStaff) return notStaff; // staff (or the platform's own services) only, checked here (2026-11-02)
  try {
    const resolved = await resolveKoreaKocaEaipPackageRoot();
    return NextResponse.json(resolved);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message, upstreamStatus: "unknown" }, { status: 503 });
  }
}
