// Help Centre → Telegram. Reuses the existing bug-bot transport and env vars
// (TELEGRAM_BUG_BOT_TOKEN / TELEGRAM_BOT_TOKEN, TELEGRAM_BUG_CHAT_ID) — this is
// the fold-in of the old bug-report notification path, not a second bot.
//
// Callback vocabulary (handled in app/api/telegram/debug/route.ts):
//   help:set:<threadId>:<status>   — status change (Impossible is NOT offered
//                                    here: it requires a written reason, which a
//                                    keyboard tap cannot carry; use the inbox)
//   help:join:<threadId>           — join a live chat (presence → present)

import {
  HELP_STATUS_META,
  HELP_TYPE_META,
  type HelpContext,
  type HelpStatus,
  type HelpThread,
  HELP_CONTEXT_ORDER,
} from "@/lib/help/shared";
import { setThreadTelegramMessage } from "@/lib/help/store";

export const HELP_CALLBACK_PREFIX = "help:";

function botToken(): string {
  return String(process.env.TELEGRAM_BUG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

export function helpChatId(): string {
  return String(process.env.TELEGRAM_BUG_CHAT_ID || "").trim();
}

/** t.me deep link into the mini app for one thread (Phase 5); empty when unset. */
export function miniAppLink(reference: string): string {
  const base = String(process.env.TELEGRAM_HELP_MINIAPP_URL || "").trim(); // e.g. https://t.me/<bot>/<app>
  return base ? `${base}?startapp=${encodeURIComponent(reference)}` : "";
}

async function telegramApi(method: string, payload: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown }> {
  const token = botToken();
  if (!token) return { ok: false };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown } | null;
    return { ok: Boolean(body?.ok), result: body?.result };
  } catch {
    return { ok: false };
  }
}

function contextLines(context: HelpContext): string[] {
  const lines: string[] = [];
  for (const { key, label } of HELP_CONTEXT_ORDER) {
    const value = String(context[key] || "").trim();
    if (value) lines.push(`${label}: ${value}`);
  }
  return lines;
}

export function helpStatusKeyboard(thread: HelpThread) {
  const statusRow = (["under_process", "done"] as HelpStatus[]).map((status) => ({
    text: HELP_STATUS_META[status].label,
    callback_data: `help:set:${thread.id}:${status}`,
  }));
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
  if (thread.type === "chat" || thread.type === "urgent") {
    rows.push([{ text: "Join chat", callback_data: `help:join:${thread.id}` }]);
  }
  rows.push(statusRow);
  const link = miniAppLink(thread.reference);
  if (link) rows.push([{ text: "Open in inbox", url: link }]);
  return { inline_keyboard: rows };
}

/**
 * New-thread notification. Urgent and chat push with the waiting framing;
 * everything else is the filed-report framing. Best-effort — a Telegram
 * failure never fails the request that created the thread.
 */
export async function notifyTelegramNewThread(thread: HelpThread, firstMessageText: string): Promise<boolean> {
  const chatId = helpChatId();
  if (!chatId) return false;
  const meta = HELP_TYPE_META[thread.type];
  const who = thread.userName || thread.userEmail || "someone in ops";
  const head =
    thread.type === "chat" ? `${who} wants to chat now`
    : thread.type === "urgent" ? `URGENT — ${who} is blocked`
    : `New ${meta.label.toLowerCase()} from ${who}`;
  const lines = [
    head,
    `${thread.reference} · ${meta.chip} · ${HELP_STATUS_META[thread.status].chip}`,
    "",
    thread.title,
  ];
  const body = firstMessageText.trim();
  if (body && body !== thread.title) lines.push("", body.slice(0, 800));
  const ctx = contextLines(thread.context);
  if (ctx.length) lines.push("", ...ctx);
  const sent = await telegramApi("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    disable_web_page_preview: true,
    reply_markup: helpStatusKeyboard(thread),
  });
  if (sent.ok && sent.result && typeof sent.result === "object") {
    const result = sent.result as { message_id?: number; chat?: { id?: number | string } };
    if (result.message_id) {
      await setThreadTelegramMessage({
        id: thread.id,
        chatId: String(result.chat?.id ?? chatId),
        messageId: result.message_id,
      }).catch(() => {});
    }
  }
  return sent.ok;
}

/** Reply / nudge notifications on an existing thread. */
export async function notifyTelegramThreadActivity(thread: HelpThread, text: string): Promise<boolean> {
  const chatId = thread.userId && helpChatId();
  if (!chatId) return false;
  const sent = await telegramApi("sendMessage", {
    chat_id: chatId,
    text: `${thread.reference} · ${text}`.slice(0, 1000),
    disable_web_page_preview: true,
    reply_markup: helpStatusKeyboard(thread),
  });
  return sent.ok;
}

export function parseHelpCallbackData(value: string):
  | { action: "set"; threadId: string; status: HelpStatus }
  | { action: "join"; threadId: string }
  | null {
  const parts = String(value || "").split(":");
  if (parts[0] !== "help") return null;
  if (parts[1] === "join" && parts[2]) return { action: "join", threadId: parts[2] };
  if (parts[1] === "set" && parts[2] && parts[3]) {
    const status = parts[3] as HelpStatus;
    if (status === "under_process" || status === "done") return { action: "set", threadId: parts[2], status };
  }
  return null;
}
