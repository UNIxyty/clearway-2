import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";
import { staffGate } from "@/lib/admin-auth";

const EAD_AIP_DIR = join(process.cwd(), "data", "ead-aip");

export async function GET(request: Request) {
  const notStaff = await staffGate(request); if (notStaff) return notStaff; // staff (or the platform's own services) only, checked here (2026-11-02)
  try {
    const names = await readdir(EAD_AIP_DIR).catch(() => []);
    const files = names.filter((n) => n.endsWith(".pdf")).sort();
    return NextResponse.json({ ok: true, files });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), files: [] }, { status: 500 });
  }
}
