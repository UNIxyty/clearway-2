import { NextResponse } from "next/server";
import {
  INAC_HISTORY_PAGE_URL,
  indexUrlFromPackageRoot,
  resolveInacEaipPackageRoot,
} from "@/lib/inac-venezuela-eaip-resolve";

export const revalidate = 300;

export async function GET() {
  try {
    const packageRoot = await resolveInacEaipPackageRoot();
    return NextResponse.json({
      packageRoot,
      historyPageUrl: INAC_HISTORY_PAGE_URL,
      indexUrl: indexUrlFromPackageRoot(packageRoot),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
