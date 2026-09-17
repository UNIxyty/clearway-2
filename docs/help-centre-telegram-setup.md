# Help Centre — Telegram setup

The Help Centre reuses the existing bug bot (`TELEGRAM_BUG_BOT_TOKEN` /
`TELEGRAM_BOT_TOKEN`, notifications to `TELEGRAM_BUG_CHAT_ID`, webhook at
`/api/telegram/debug` validated by the existing secret header). New thread
notifications carry inline buttons — `Join chat` (chats/urgent), `Under
process` / `Done` (Impossible is deliberately absent: it requires a written
reason, which a keyboard tap cannot carry), and `Open in inbox` (the mini app).

## One-time registration (BotFather)

1. `/newapp` in BotFather → pick the bug bot → name it (e.g. "Clearway
   Support"), short name e.g. `support`.
2. Web App URL: `https://<portal-domain>/telegram/support`.
3. That yields the mini app link `https://t.me/<bot_username>/support`.

## New environment variables (portal container)

| Var | What |
| --- | --- |
| `TELEGRAM_HELP_MINIAPP_URL` | The t.me link from BotFather, e.g. `https://t.me/<bot_username>/support`. Enables the "Open in inbox" button and `startapp` deep links into a thread. |
| `TELEGRAM_DEVELOPER_USER_IDS` | Comma-separated Telegram **user ids** allowed into the mini app (the developer gate on this surface). Get yours from @userinfobot. Fail closed: unset = nobody. |
| `DEVELOPER_EMAILS` | Comma-separated emails that resolve to the developer flag in the portal (see Phase 2 — `ADMIN_EMAILS` no longer confers developer). |

No new secrets are required: mini-app auth validates Telegram's HMAC-signed
`initData` against the existing bot token, and attachment `<img>` loads use a
short-lived token derived from it.

## How auth works on this surface

- `/telegram/support` (the page) is session-exempt in `middleware.ts` — it is
  an empty shell until the app authenticates.
- Every `/api/telegram/support` call carries `x-telegram-init-data`; the server
  recomputes the HMAC (per Telegram's spec), rejects stale data (>24h), and
  checks the user id against `TELEGRAM_DEVELOPER_USER_IDS`. Anything else is
  401 — including admins.
- The webhook additions (`help:set:*`, `help:join:*` callbacks) run inside the
  existing `/api/telegram/debug` handler and its secret-token validation.

## The mini app follows Telegram's conventions

Main button only where there is exactly one thing to confirm (Send reply, Join
chat, Save status, the filter sheet's "Show N conversations") — the inbox has
none. Telegram's back button handles every step back. Colours come from
`themeParams` (light and dark); only the type chips and mono code blocks keep
fixed hues.
