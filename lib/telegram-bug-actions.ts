import {
  BUG_REPORT_STATUS_META,
  BUG_REPORT_STATUSES,
  type BugReportRow,
  type BugReportStatus,
} from "@/lib/bug-reports-shared";
import { setBugReportTelegramMessage } from "@/lib/bug-reports-store";

export const TELEGRAM_BUG_CALLBACK_PREFIX = "bug:";

function bugBotToken(): string {
  return String(process.env.TELEGRAM_BUG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

export function bugChatId(): string {
  return String(process.env.TELEGRAM_BUG_CHAT_ID || "").trim();
}

export function bugStatusKeyboard(reportId: string) {
  const rows = BUG_REPORT_STATUSES.map((status) => ({
    text: BUG_REPORT_STATUS_META[status].label,
    callback_data: `${TELEGRAM_BUG_CALLBACK_PREFIX}set:${reportId}:${status}`,
  }));
  return {
    inline_keyboard: [
      rows.slice(0, 2),
      rows.slice(2, 4),
      rows.slice(4, 5),
    ],
  };
}

export function formatBugReportMessage(report: BugReportRow): string {
  return [
    "New bug report",
    `Airport: ${report.airportIcao}`,
    `Reporter: ${report.userEmail || report.userId}`,
    `Bug ID: ${report.id.slice(0, 8)}`,
    "",
    `Description: ${report.description}`,
  ].join("\n");
}

export function formatBugReportShort(report: BugReportRow): string {
  return `${report.id.slice(0, 8)} | ${report.airportIcao} | ${report.description}`;
}

export function parseBugCallbackData(value: string): {
  reportId: string;
  status: BugReportStatus;
} | null {
  const parts = String(value || "").split(":");
  if (parts.length !== 4) return null;
  if (parts[0] !== "bug" || parts[1] !== "set") return null;
  const reportId = String(parts[2] || "").trim();
  const statusRaw = String(parts[3] || "").trim();
  if (!reportId) return null;
  if (!BUG_REPORT_STATUSES.includes(statusRaw as BugReportStatus)) return null;
  return { reportId, status: statusRaw as BugReportStatus };
}

async function telegramApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = bugBotToken();
  if (!token) throw new Error("TELEGRAM_BUG_BOT_TOKEN (or TELEGRAM_BOT_TOKEN) is not configured.");
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null) as
    | (T & { description?: string; ok?: boolean })
    | null;
  if (!res.ok) {
    const detail = body && typeof body === "object" ? String((body as { description?: string }).description || "") : "";
    throw new Error(`Telegram API ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  if (!body) throw new Error("Telegram API returned empty response.");
  if (typeof body === "object" && "ok" in body && body.ok === false) {
    const detail = String((body as { description?: string }).description || "Unknown Telegram API error");
    throw new Error(detail);
  }
  return body as T;
}

export async function notifyTelegramBugReport(report: BugReportRow): Promise<void> {
  const chatId = bugChatId();
  if (!chatId) {
    throw new Error("TELEGRAM_BUG_CHAT_ID is not configured.");
  }
  const payload = {
    chat_id: chatId,
    text: formatBugReportMessage(report),
    disable_web_page_preview: true,
    reply_markup: bugStatusKeyboard(report.id),
  };
  const response = await telegramApi<{
    ok?: boolean;
    result?: { message_id?: number; chat?: { id?: number | string } };
    description?: string;
  }>("sendMessage", payload);
  const messageId = Number(response?.result?.message_id || 0);
  if (messageId > 0) {
    await setBugReportTelegramMessage({
      id: report.id,
      chatId: String(response?.result?.chat?.id || chatId),
      messageId,
    });
  }
}
