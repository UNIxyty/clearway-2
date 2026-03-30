import { NextResponse } from "next/server";
import { resolveKoreaKocaEaipPackageRoot } from "@/lib/korea-koca-eaip-resolve";

export const revalidate = 300;

export async function GET() {
  try {
    const resolved = await resolveKoreaKocaEaipPackageRoot();
    return NextResponse.json(resolved);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
