// The developers' alert: a Telegram message to the chat the AIP refresh alerts (TELEGRAM_BUG_ALLOWED_CHAT_IDS).
// Returns true only when Telegram accepted it for at least one chat — never because a token is set.
import { logDetail } from "./public-errors.mjs";

export async function alertDevelopers(text, tag = "alert") {
  const token = String(process.env.TELEGRAM_BUG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chats = String(process.env.TELEGRAM_BUG_ALLOWED_CHAT_IDS || process.env.TELEGRAM_DEBUG_ALLOWED_CHAT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !chats.length) { logDetail(tag, "alert NOT sent", "no Telegram bot token or chat configured"); return false; }
  let sent = 0;
  for (const chat_id of chats) {
    try {
      const r = await fetch(`${String(process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "")}/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id, text }), signal: AbortSignal.timeout(10_000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) sent += 1; else logDetail(tag, "alert refused by Telegram", `${r.status} ${j?.description ?? ""}`);
    } catch (e) { logDetail(tag, "alert NOT sent", e); }
  }
  return sent > 0;
}
