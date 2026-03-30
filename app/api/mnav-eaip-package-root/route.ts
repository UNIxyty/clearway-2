import { NextResponse } from "next/server";
import { resolveMnavNorthMacedoniaEaip } from "@/lib/mnav-north-macedonia-eaip-resolve";

export const revalidate = 300;

export async function GET() {
  try {
    const resolved = await resolveMnavNorthMacedoniaEaip();
    return NextResponse.json({
      packageRoot: resolved.packageRoot,
      currentIndexUrl: resolved.currentIndexUrl,
      effectiveDateLabel: resolved.effectiveDateLabel,
      startPageUrl: resolved.startPageUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
