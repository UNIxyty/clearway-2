// Dashboard changelog (platform redesign Phase 3, audit §6.3): a single
// newest-first feed assembled from the six actor-stamped sources that exist
// TODAY — no schema changes. Supabase: deleted_airports, bug_reports,
// maintenance, email_logs (failed → ERROR), debug_run_failures (→ ERROR).
// Wall JSON stores (read via fs, absent files skipped silently in dev):
// important.json, reports.json, webhook-log.json (failures → ERROR).
// Session-authed like other portal routes; admin NOT required.
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const CAP = 60;

export type ChangelogEntry = {
  kind: "edit" | "error";
  source: string;
  summary: string;
  actor: string | null;
  at: string; // ISO
};

function iso(value: unknown): string | null {
  if (!value) return null;
  const dt = new Date(String(value));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function byActor(actor: string | null | undefined): string {
  return actor ? ` by ${actor}` : "";
}

async function readWallJson<T>(file: string): Promise<T | null> {
  const dir = process.env.DIGITAL_WALL_DATA_DIR || "./digital-wall/data";
  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), dir, file), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null; // absent in dev — skip silently
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
    }

    const cookieStore = cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const disableAuthForTesting =
      String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
    if (!user?.id && !disableAuthForTesting) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const filterParam = request.nextUrl.searchParams.get("filter");
    const filter: "all" | "edits" | "errors" =
      filterParam === "edits" || filterParam === "errors" ? filterParam : "all";

    const entries: ChangelogEntry[] = [];
    const service = createSupabaseServiceRoleClient();

    // --- Supabase sources (each independently fail-safe: a missing table or
    // unreachable Supabase must not blank the whole changelog). ---
    if (service) {
      const tasks: Array<Promise<void>> = [];

      // 1. Airports hidden / restored.
      tasks.push(
        (async () => {
          const { data } = await service
            .from("deleted_airports")
            .select("icao, deleted_by, deleted_reason, deleted_at, restored_at")
            .order("deleted_at", { ascending: false })
            .limit(25);
          for (const row of (data ?? []) as Array<Record<string, unknown>>) {
            const icao = String(row.icao ?? "").toUpperCase();
            const actor = row.deleted_by ? String(row.deleted_by) : null;
            const deletedAt = iso(row.deleted_at);
            if (deletedAt) {
              const reason = row.deleted_reason ? ` — ${String(row.deleted_reason)}` : "";
              entries.push({
                kind: "edit",
                source: "Airports",
                summary: `Airport ${icao} hidden${byActor(actor)}${reason}`,
                actor,
                at: deletedAt,
              });
            }
            const restoredAt = iso(row.restored_at);
            if (restoredAt) {
              entries.push({
                kind: "edit",
                source: "Airports",
                summary: `Airport ${icao} restored`,
                actor,
                at: restoredAt,
              });
            }
          }
        })(),
      );

      // 2. Bug reports filed / status changed.
      tasks.push(
        (async () => {
          const { data } = await service
            .from("bug_reports")
            .select("id, user_email, airport_icao, status, created_at, status_updated_at, status_updated_by")
            .order("created_at", { ascending: false })
            .limit(25);
          for (const row of (data ?? []) as Array<Record<string, unknown>>) {
            const icao = String(row.airport_icao ?? "").toUpperCase();
            const createdAt = iso(row.created_at);
            const filedBy = row.user_email ? String(row.user_email) : null;
            if (createdAt) {
              entries.push({
                kind: "edit",
                source: "Bug reports",
                summary: `Bug report filed for ${icao || "the portal"}${byActor(filedBy)}`,
                actor: filedBy,
                at: createdAt,
              });
            }
            const statusAt = iso(row.status_updated_at);
            if (statusAt && statusAt !== createdAt) {
              const statusBy = row.status_updated_by ? String(row.status_updated_by) : null;
              entries.push({
                kind: "edit",
                source: "Bug reports",
                summary: `Bug report for ${icao || "the portal"} marked "${String(row.status ?? "updated")}"${byActor(statusBy)}`,
                actor: statusBy,
                at: statusAt,
              });
            }
          }
        })(),
      );

      // 3. Maintenance banner toggles.
      tasks.push(
        (async () => {
          const { data } = await service
            .from("maintenance")
            .select("enabled, message, updated_by, updated_at")
            .order("updated_at", { ascending: false })
            .limit(10);
          for (const row of (data ?? []) as Array<Record<string, unknown>>) {
            const at = iso(row.updated_at);
            if (!at) continue;
            const actor = row.updated_by ? String(row.updated_by) : null;
            entries.push({
              kind: "edit",
              source: "Maintenance",
              summary: `Maintenance banner turned ${row.enabled ? "on" : "off"}${byActor(actor)}`,
              actor,
              at,
            });
          }
        })(),
      );

      // 4. Failed emails → ERROR.
      tasks.push(
        (async () => {
          const { data } = await service
            .from("email_logs")
            .select("recipient_email, email_type, subject, error_message, created_at")
            .eq("status", "failed")
            .order("created_at", { ascending: false })
            .limit(20);
          for (const row of (data ?? []) as Array<Record<string, unknown>>) {
            const at = iso(row.created_at);
            if (!at) continue;
            const detail = row.error_message ? ` — ${String(row.error_message).slice(0, 140)}` : "";
            entries.push({
              kind: "error",
              source: "Email",
              summary: `Email (${String(row.email_type ?? "unknown")}) to ${String(row.recipient_email ?? "unknown recipient")} failed${detail}`,
              actor: null,
              at,
            });
          }
        })(),
      );

      // 5. Debug-run failures → ERROR.
      tasks.push(
        (async () => {
          const { data } = await service
            .from("debug_run_failures")
            .select("run_id, icao, step, state, detail, created_at")
            .order("created_at", { ascending: false })
            .limit(20);
          for (const row of (data ?? []) as Array<Record<string, unknown>>) {
            const at = iso(row.created_at);
            if (!at) continue;
            const detail = row.detail ? ` — ${String(row.detail).slice(0, 140)}` : "";
            entries.push({
              kind: "error",
              source: "Debug runner",
              summary: `Debug run: ${String(row.icao ?? "?").toUpperCase()} ${String(row.step ?? "step")} ${String(row.state ?? "failed")}${detail}`,
              actor: null,
              at,
            });
          }
        })(),
      );

      // Failures are per-source no-ops (table missing, network down, …).
      await Promise.all(tasks.map((t) => t.catch(() => {})));
    }

    // --- Wall JSON stores (fs; audit §6.3 stamped sources). ---

    // 6. IMP bulletins (important.json: addedBy/addedAt + confirmedBy/confirmedAt).
    const important = await readWallJson<{ entries?: Array<Record<string, unknown>> }>("important.json");
    if (important?.entries) {
      const recent = [...important.entries]
        .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
        .slice(0, 15);
      for (const entry of recent) {
        const title = String(entry.title ?? entry.id ?? "bulletin");
        const addedAt = iso(entry.addedAt ?? entry.createdAt);
        const addedBy = entry.addedBy ? String(entry.addedBy) : null;
        if (addedAt) {
          entries.push({
            kind: "edit",
            source: "Wall — Important",
            summary: `IMP bulletin "${title}" added${byActor(addedBy)}`,
            actor: addedBy,
            at: addedAt,
          });
        }
        const confirmedAt = iso(entry.confirmedAt);
        if (confirmedAt) {
          const confirmedBy = entry.confirmedBy ? String(entry.confirmedBy) : null;
          entries.push({
            kind: "edit",
            source: "Wall — Important",
            summary: `IMP bulletin "${title}" confirmed${byActor(confirmedBy)}`,
            actor: confirmedBy,
            at: confirmedAt,
          });
        }
      }
    }

    // 7. Console reports (reports.json: createdBy/updatedBy).
    const reportsPayload = await readWallJson<{ reports?: Array<Record<string, unknown>> }>("reports.json");
    if (reportsPayload?.reports) {
      const recent = [...reportsPayload.reports]
        .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
        .slice(0, 15);
      for (const report of recent) {
        const title = String(report.title ?? report.id ?? "report");
        const createdAt = iso(report.createdAt);
        const createdBy = report.createdBy ? String(report.createdBy) : null;
        if (createdAt) {
          entries.push({
            kind: "edit",
            source: "Wall — Reports",
            summary: `Report "${title}" created${byActor(createdBy)}`,
            actor: createdBy,
            at: createdAt,
          });
        }
        const updatedAt = iso(report.updatedAt);
        if (updatedAt && updatedAt !== createdAt) {
          const updatedBy = report.updatedBy ? String(report.updatedBy) : null;
          entries.push({
            kind: "edit",
            source: "Wall — Reports",
            summary: `Report "${title}" updated${byActor(updatedBy)}`,
            actor: updatedBy,
            at: updatedAt,
          });
        }
      }
    }

    // 8. Leon webhook log (webhook-log.json: { logs: { "opr:event": [entries] } };
    // action === "error" → ERROR).
    const webhookLog = await readWallJson<{ logs?: Record<string, Array<Record<string, unknown>>> }>(
      "webhook-log.json",
    );
    if (webhookLog?.logs) {
      const flat: Array<{ event: string; at: string; entry: Record<string, unknown> }> = [];
      for (const [key, list] of Object.entries(webhookLog.logs)) {
        const event = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
        for (const entry of Array.isArray(list) ? list : []) {
          const at = iso(entry.at);
          if (at) flat.push({ event, at, entry });
        }
      }
      flat.sort((a, b) => b.at.localeCompare(a.at));
      for (const { event, at, entry } of flat.slice(0, 20)) {
        const isError = String(entry.action ?? "") === "error";
        const flight = entry.callsign
          ? ` (${String(entry.callsign)})`
          : entry.flightNid
            ? ` (flight ${String(entry.flightNid)})`
            : "";
        const change = entry.change ? ` — ${String(entry.change).slice(0, 140)}` : "";
        entries.push({
          kind: isError ? "error" : "edit",
          source: "Wall — Leon webhooks",
          summary: `Webhook ${event}${flight}${isError ? " failed" : " processed"}${change}`,
          actor: null,
          at,
        });
      }
    }

    // Assemble: newest first, apply filter, cap.
    entries.sort((a, b) => b.at.localeCompare(a.at));
    const filtered =
      filter === "all"
        ? entries
        : entries.filter((e) => (filter === "errors" ? e.kind === "error" : e.kind === "edit"));

    return NextResponse.json({
      filter,
      entries: filtered.slice(0, CAP),
      generatedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed" },
      { status: 500 },
    );
  }
}
