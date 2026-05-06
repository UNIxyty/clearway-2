import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/admin-auth";
import { BUG_REPORT_STATUSES, type BugReportStatus } from "@/lib/bug-reports-shared";
import { deleteFixedBugReport, updateBugReportStatus } from "@/lib/bug-reports-store";

function isBugStatus(value: string): value is BugReportStatus {
  return BUG_REPORT_STATUSES.includes(value as BugReportStatus);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const id = String(params.id || "").trim();
  if (!id) return NextResponse.json({ error: "Bug report id is required" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const status = String(body.status || "").trim();
  if (!isBugStatus(status)) {
    return NextResponse.json({ error: "Invalid bug status" }, { status: 400 });
  }

  try {
    const row = await updateBugReportStatus({
      id,
      status,
      statusUpdatedBy: auth.user.email || auth.user.id,
    });
    return NextResponse.json({ ok: true, row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update bug report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = String(params.id || "").trim();
  if (!id) return NextResponse.json({ error: "Bug report id is required" }, { status: 400 });

  const adminAuth = await requireAdmin();
  try {
    if (!("error" in adminAuth)) {
      const deleted = await deleteFixedBugReport({ id });
      return NextResponse.json({ ok: true, deleted });
    }
    const auth = await requireAuthenticatedUser();
    if ("error" in auth) return auth.error;
    const deleted = await deleteFixedBugReport({ id, userId: auth.user.id });
    if (!deleted) {
      return NextResponse.json(
        { error: "Only your fixed bug reports can be deleted." },
        { status: 403 }
      );
    }
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete bug report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
