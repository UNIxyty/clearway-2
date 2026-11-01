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

// Media tokens: <img> tags cannot send headers, so an attachment GET carries a token in its URL. Per file and per person
// (2026-11-02): each token names ONE attachment and the ONE Telegram account it was issued to, expires after 15 minutes,
// and is refused for anything else. (Until then one hourly code opened every help attachment for up to two hours.)
//   <expiry, unix seconds>.<telegram user id>.<HMAC-SHA256(bot token, "help-media:v2:<attachment>:<user>:<expiry>")>
export const MEDIA_TTL_S = 15 * 60;
const mediaSig = (attachmentId: string, userId: number, exp: number) => createHmac("sha256", botToken()).update(`help-media:v2:${attachmentId}:${userId}:${exp}`).digest("base64url");

export function mediaTokenFor(attachmentId: string, userId: number, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + MEDIA_TTL_S;
  return `${exp}.${userId}.${mediaSig(attachmentId, userId, exp)}`;
}

/** The Telegram user the token was issued to, when it is valid for THIS attachment, unexpired, and that person is still
 *  on the developer list; otherwise null. */
export function validateMediaToken(token: string, attachmentId: string, now = Date.now()): number | null {
  if (!token || !botToken() || !attachmentId) return null;
  const m = /^(\d{10})\.(\d{1,20})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return null;
  const exp = Number(m[1]), userId = Number(m[2]);
  if (!Number.isSafeInteger(userId) || exp * 1000 < now || exp * 1000 > now + MEDIA_TTL_S * 1000 + 60_000) return null;
  const want = Buffer.from(mediaSig(attachmentId, userId, exp)), got = Buffer.from(m[3]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return isDeveloperTelegramUser(userId) ? userId : null;
}
