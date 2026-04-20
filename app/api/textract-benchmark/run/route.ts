import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Textract benchmark endpoint is disabled in self-hosted mode. AWS-specific benchmarking was removed during migration.",
    },
    { status: 410 },
  );
}
