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
