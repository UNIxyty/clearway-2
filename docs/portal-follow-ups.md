# Portal follow-ups

Things decided as "later", so they are not lost. Each line says what it is and why it waits. Started 2026-10-11.

- **Browser notifications.** Turned off on 2026-10-11 (Part B): the settings page was deleted, so nobody could switch
  them on and the one person who had them could not switch them off. If anyone asks for them, they belong in Settings,
  built properly. The six `user_preferences.notify_*` columns are kept, unused.
- **Page context for the agent.** The agent sees only the page's label, so "Asking about" shows only where it is true
  (airport pages, the document viewer). Real page context is about a day's work and must keep passenger data on the
  intake and mailbox screens away from the agent.
- **Three Settings preferences left out of Stage 4:** a local-time column beside UTC, a date format, and where AIP
  documents open. Each touches many screens, so each is its own job.
- **Help & support colours in dark.** Fixed in Part A without a reproduction on the rig. If it is still seen after
  that deploy, find why the rig and production differ (the compiled stylesheet matches; look at the account's saved
  theme, a cached page, browser extensions) rather than patching again.
- **`user_preferences.notify_*` and `search_events`.** Whether to drop the notify columns is a separate decision
  (`search_events` still feeds the dashboard's Recently used, so it stays).
- **Old bug reports in Telegram.** `/api/telegram/debug` still acts on rows of the old `bug_reports` table (empty in
  production). It can go when the Telegram bot's old buttons are retired.
- **`digital-wall/backend/` needs real secrets if it is ever deployed.** It reads `LEON_WEBHOOK_SECRET` and
  `LEON_SYNC_CRON_SECRET`. Their production values were slices of the public Supabase anon key and protected
  nothing, so they were deleted from the server's `.env` on 2026-10-12. The live wall (`digital-wall/server.mjs`)
  does not read them; it verifies Leon's own signed webhook tokens. Deploying the backend means generating new
  values (`scripts/rotate-secret.sh NAME --generate`), never reusing anything.
- **`/account/guide` goes when the docs are written** (decided 2026-10-12). It overlaps with the docs site. It stays
  until step 10 (the writing) is done; then it is deleted and the Account → Guide nav item points into `/docs`.
