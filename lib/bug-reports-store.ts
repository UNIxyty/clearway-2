import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import {
  BUG_REPORT_STATUSES,
  type BugReportRow,
  type BugReportStatus,
} from "@/lib/bug-reports-shared";

function mapRow(row: {
  id?: string;
  user_id?: string;
  user_email?: string | null;
  airport_icao?: string;
  description?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  status_updated_at?: string;
  status_updated_by?: string | null;
}): BugReportRow {
  const statusRaw = String(row.status || "sent");
  const status = BUG_REPORT_STATUSES.includes(statusRaw as BugReportStatus)
    ? (statusRaw as BugReportStatus)
    : "sent";
  return {
    id: String(row.id || ""),
    userId: String(row.user_id || ""),
    userEmail: row.user_email ?? null,
    airportIcao: String(row.airport_icao || "").toUpperCase(),
    description: String(row.description || ""),
    status,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    statusUpdatedAt: String(row.status_updated_at || row.updated_at || ""),
    statusUpdatedBy: row.status_updated_by ?? null,
  };
}

export async function createBugReport(input: {
  userId: string;
  userEmail?: string | null;
  airportIcao: string;
  description: string;
}): Promise<BugReportRow> {
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Missing Supabase service role configuration");
  const now = new Date().toISOString();
  const payload = {
    user_id: input.userId,
    user_email: input.userEmail ?? null,
    airport_icao: String(input.airportIcao || "").trim().toUpperCase(),
    description: String(input.description || "").trim(),
    status: "sent" as const,
    created_at: now,
    updated_at: now,
    status_updated_at: now,
    status_updated_by: input.userEmail ?? input.userId,
  };
  const { data, error } = await service
    .from("bug_reports")
    .insert(payload)
    .select("id,user_id,user_email,airport_icao,description,status,created_at,updated_at,status_updated_at,status_updated_by")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to create bug report");
  return mapRow(data as Parameters<typeof mapRow>[0]);
}

export async function listBugReportsForUser(userId: string): Promise<BugReportRow[]> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return [];
  const { data, error } = await service
    .from("bug_reports")
    .select("id,user_id,user_email,airport_icao,description,status,created_at,updated_at,status_updated_at,status_updated_by")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return (data as Array<Parameters<typeof mapRow>[0]>).map(mapRow);
}

export async function listBugReports(options?: {
  status?: BugReportStatus;
  limit?: number;
}): Promise<BugReportRow[]> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return [];
  let query = service
    .from("bug_reports")
    .select("id,user_id,user_email,airport_icao,description,status,created_at,updated_at,status_updated_at,status_updated_by")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(options?.limit || 100, 500)));
  if (options?.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Array<Parameters<typeof mapRow>[0]>).map(mapRow);
}

export async function updateBugReportStatus(input: {
  id: string;
  status: BugReportStatus;
  statusUpdatedBy: string;
}): Promise<BugReportRow> {
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Missing Supabase service role configuration");
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("bug_reports")
    .update({
      status: input.status,
      updated_at: now,
      status_updated_at: now,
      status_updated_by: input.statusUpdatedBy,
    })
    .eq("id", input.id)
    .select("id,user_id,user_email,airport_icao,description,status,created_at,updated_at,status_updated_at,status_updated_by")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to update bug report");
  return mapRow(data as Parameters<typeof mapRow>[0]);
}

export async function setBugReportTelegramMessage(input: {
  id: string;
  chatId: string;
  messageId: number;
}): Promise<void> {
  const service = createSupabaseServiceRoleClient();
  if (!service) return;
  await service
    .from("bug_reports")
    .update({
      telegram_chat_id: input.chatId,
      telegram_message_id: input.messageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
}
