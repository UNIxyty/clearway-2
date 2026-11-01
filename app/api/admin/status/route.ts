import { NextResponse } from "next/server";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/admin-auth";

// What the shell builds its menu from. It names the role (2026-11-02): "admin", "user" (ordinary staff) or "none" — a
// client, an unknown role or nobody — so the shell never has to guess "user" from a missing admin flag.
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!("error" in admin)) return NextResponse.json({ isAdmin: true, isDeveloper: admin.isDeveloper, role: "admin" });
    const staff = await requireAuthenticatedUser();
    // not staff → the gate's refusal (404 for a client or an unknown role), never a 200; the shell reads it as "none"
    if ("error" in staff) return staff.error;
    return NextResponse.json({ isAdmin: false, isDeveloper: false, role: "user" });
  } catch {
    return NextResponse.json({ isAdmin: false, isDeveloper: false, role: "none" });
  }
}
