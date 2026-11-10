import { NextRequest, NextResponse } from "next/server";
import { ENR_ENABLED, ENR_PAUSED_TEXT } from "@/lib/aip-enr.mjs";
import { resolveGenPrefix } from "@/lib/ead-gen-prefix";
import { storageObjectExists } from "@/lib/aip-storage";
import { readAipRevision } from "@/lib/aip-revision";
import { stat } from "node:fs/promises";
import { storagePathForKey } from "@/lib/storage";
import { staffGate } from "@/lib/admin-auth";

// Is there a cached ENR 1.1 copy for this prefix, and from which cycle (the same answer shape as GEN's exists route).
export async function GET(request: NextRequest) {
  const notStaff = await staffGate(request); if (notStaff) return notStaff;
  if (!ENR_ENABLED) return NextResponse.json({ ok: false, exists: false, error: ENR_PAUSED_TEXT, code: "enr-paused" }, { status: 503 });   // ENR is paused (lib/aip-enr.mjs)
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const prefix = resolveGenPrefix(icao, request.nextUrl.searchParams.get("prefix")?.trim().toUpperCase() ?? "");
  if (!/^[A-Z]{2}$/.test(prefix)) return NextResponse.json({ error: "Valid 2-letter prefix required" }, { status: 400 });
  const key = `aip/enr-pdf/${prefix}-ENR-1.1.pdf`;
  const exists = await storageObjectExists(key);
  const revision = await readAipRevision(exists ? key : null);
  let copyFetchedAt: string | null = revision.fetchedAt ?? null;
  if (!copyFetchedAt && exists) { try { copyFetchedAt = (await stat(storagePathForKey(key))).mtime.toISOString(); } catch { copyFetchedAt = null; } }
  return NextResponse.json({ exists, source: exists ? (revision as { source?: string | null }).source ?? "enr" : null, storageKey: exists ? key : null, revision, copyFetchedAt });
}
