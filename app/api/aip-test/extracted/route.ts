import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const EXTRACTED_PATH = join(process.cwd(), "data", "ead-aip-extracted.json");

export async function GET() {
  try {
    const raw = await readFile(EXTRACTED_PATH, "utf8");
    const data = JSON.parse(raw) as { source?: string; extracted?: string; airports?: unknown[] };
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), airports: [] }, { status: 200 });
  }
}
