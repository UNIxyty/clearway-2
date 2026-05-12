import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return NextResponse.json({ isAdmin: false, isDeveloper: false });
    return NextResponse.json({ isAdmin: true, isDeveloper: auth.isDeveloper });
  } catch {
    return NextResponse.json({ isAdmin: false, isDeveloper: false });
  }
}
