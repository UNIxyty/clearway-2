import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions/server";

export const runtime = "nodejs";

export async function POST() {
  const permission = await requirePermission("portal.aip.fetch");
  if ("error" in permission) return permission.error;
  return NextResponse.json(
    {
      ok: false,
      error:
        "Textract benchmark endpoint is disabled in self-hosted mode. AWS-specific benchmarking was removed during migration.",
    },
    { status: 410 },
  );
}
