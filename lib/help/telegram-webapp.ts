// Telegram mini-app auth. The web app has no Supabase session; every request
// carries Telegram's initData, which is HMAC-signed with the bot token
// (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// The developer gate on this surface: the validated Telegram user id must be
// listed in TELEGRAM_DEVELOPER_USER_IDS. Fail closed on anything else.

import { createHmac, timingSafeEqual } from "crypto";

const INIT_DATA_MAX_AGE_S = 24 * 60 * 60;

function botToken(): string {
  return String(process.env.TELEGRAM_BUG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

export type TelegramWebAppUser = { id: number; username?: string; firstName?: string; startParam?: string };

export function validateInitData(initData: string): TelegramWebAppUser | null {
  const token = botToken();
  if (!token || !initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash") || "";
    if (!hash) return null;
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");
    const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
    const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const authDate = Number(params.get("auth_date") || 0);
    if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_S) return null;

    const userRaw = params.get("user");
    if (!userRaw) return null;
    const user = JSON.parse(userRaw) as { id?: number; username?: string; first_name?: string };
    if (!user.id) return null;
    return {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      startParam: params.get("start_param") || undefined,
    };
  } catch {
    return null;
  }
}

export function isDeveloperTelegramUser(userId: number): boolean {
  const ids = String(process.env.TELEGRAM_DEVELOPER_USER_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return ids.includes(String(userId));
}

/** Validate + gate in one step for the /api/telegram/support routes. */
export function requireTelegramDeveloper(request: Request): TelegramWebAppUser | null {
  const initData = request.headers.get("x-telegram-init-data") || "";
  const user = validateInitData(initData);
  if (!user || !isDeveloperTelegramUser(user.id)) return null;
  return user;
}

// Media token: <img> tags cannot send headers, so attachment GETs carry a
// short-lived HMAC derived from the bot token instead (valid this hour and
// the previous one).
function mediaTokenFor(hourBucket: number): string {
  return createHmac("sha256", botToken()).update(`help-media:${hourBucket}`).digest("hex").slice(0, 32);
}

export function currentMediaToken(): string {
  return mediaTokenFor(Math.floor(Date.now() / 3_600_000));
}

export function validateMediaToken(token: string): boolean {
  if (!token || !botToken()) return false;
  const bucket = Math.floor(Date.now() / 3_600_000);
  return token === mediaTokenFor(bucket) || token === mediaTokenFor(bucket - 1);
}
