import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const EAD_AIP_DIR = join(process.cwd(), "data", "ead-aip");

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename")?.trim() ?? "";
  if (!filename || !/^[A-Za-z0-9_\-.]+\.pdf$/i.test(filename)) {
    return NextResponse.json({ error: "Valid filename required (e.g. ES_AD_2_ESGG_en_2026-01-22.pdf)" }, { status: 400 });
  }
  const path = join(EAD_AIP_DIR, filename);
  if (!path.startsWith(EAD_AIP_DIR)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  try {
    const buf = await readFile(path);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
