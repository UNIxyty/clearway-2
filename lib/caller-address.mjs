// The caller's address, for a limiter (2026-11-05). Only what the caller cannot write.
//
// Until today the signed-out limiters keyed on the FIRST x-forwarded-for value. Cloudflare appends to that header; it
// does not replace it, so the first value is whatever the visitor wrote: a fresh bucket on every request, and "8 an hour"
// was unlimited. On /api/client-requests every request that lands emails the ops notify list.
//
//   cf-connecting-ip, and nothing else. Cloudflare sets it on every request it forwards and overwrites any a visitor
//   sent. Production's portal is published on the server's loopback only (docker-compose.yml): every outside request
//   comes through Cloudflare's tunnel, and the wall's nginx passes the header on. The rig's proxy sets it the same way
//   (rig/proxy.mjs).
//   Without it: null, and the route refuses. Not the last x-forwarded-for either: Next's server adds no value of its
//   own, so with no proxy of ours in front every value in it is the caller's (2026-11-05, measured: ten direct requests
//   with ten invented values, none refused). A request without Cloudflare's header did not come through our front door.
//
// Plain module: route handlers and checks import it alike.

/** @param {{ get(name: string): string | null }} headers @returns {string | null} */
export function callerAddress(headers) {
  const cf = String(headers.get("cf-connecting-ip") ?? "").trim();
  return cf || null;
}

/** At most `max` per key in a rolling hour, in this process. `take(key)` → true when allowed (and counts it). */
export function hourlyLimit(max) {
  const seen = new Map();
  return {
    take(key) {
      const now = Date.now();
      const hits = (seen.get(key) ?? []).filter((t) => now - t < 3600e3);
      if (hits.length >= max) { seen.set(key, hits); return false; }
      seen.set(key, [...hits, now]);
      if (seen.size > 10_000) for (const [k, v] of seen) if (!v.some((t) => now - t < 3600e3)) seen.delete(k);   // keep it small
      return true;
    },
  };
}

/** The answer for a request with no address of ours on it. */
export const NO_ADDRESS = "This request did not come through the portal's own address, so it was not accepted.";

// The alarm (2026-11-05, the user): refusing a request without Cloudflare's address is right, and it is also silent —
// if the header ever stops arriving (a tunnel change, a route change, the origin exposed), every sign-up, password reset
// and access request answers 403, and that looks exactly like nobody signing up. So the refusals are counted, and a
// handful in an hour (NO_ADDRESS_ALARM_AT) is a configuration fault: the developers are told on Telegram, the same chat
// as the other alarms, then again at most every six hours while it lasts. "Told" means Telegram accepted it.
export const NO_ADDRESS_ALARM_AT = 3;
const REPEAT_MS = 6 * 3600e3;
const seenNoAddress = []; let lastAlarmAt = -Infinity;

async function telegram(text) {
  const token = String(process.env.TELEGRAM_BUG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chats = String(process.env.TELEGRAM_BUG_ALLOWED_CHAT_IDS || process.env.TELEGRAM_DEBUG_ALLOWED_CHAT_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!token || !chats.length) { console.error("[caller-address] alarm NOT sent: no Telegram bot token or chat configured"); return false; }
  let sent = 0;
  for (const chat_id of chats) {
    try {
      const r = await fetch(`${String(process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "")}/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(10_000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) sent += 1; else console.error(`[caller-address] alarm refused by Telegram: ${r.status}`);
    } catch (e) { console.error(`[caller-address] alarm NOT sent: ${e?.message ?? e}`); }
  }
  return sent > 0;
}

/**
 * Count a refusal for want of Cloudflare's address; raise the alarm when they pile up. Never throws, never waits on
 * Telegram for the caller (the refusal answers at once). Returns { count, alarm: Promise<boolean> | null } for checks.
 * @param route  which form was refused (named in the alarm)
 * @param opts   { now, send } — a check's clock and sender
 */
export function noAddressRefused(route, { now = Date.now(), send = telegram } = {}) {
  seenNoAddress.push({ at: now, route });
  while (seenNoAddress.length && now - seenNoAddress[0].at > 3600e3) seenNoAddress.shift();
  const count = seenNoAddress.length;
  if (count < NO_ADDRESS_ALARM_AT || now - lastAlarmAt < REPEAT_MS) return { count, alarm: null };
  lastAlarmAt = now;
  const routes = [...new Set(seenNoAddress.map((x) => x.route))].join(", ");
  const text = `Clearway portal: ${count} signed-out request(s) in the last hour arrived without Cloudflare's address (cf-connecting-ip) and were refused (${routes}). Every sign-up, password reset and access request answers 403 until this is fixed: a tunnel or route change, or the origin reached directly? lib/caller-address.mjs`;
  console.error(`[caller-address] ${text}`);
  const alarm = Promise.resolve(send(text)).catch(() => false);
  return { count, alarm };
}

/** For checks only: forget the counts and the last alarm. */
export function resetNoAddressAlarm() { seenNoAddress.length = 0; lastAlarmAt = -Infinity; }
