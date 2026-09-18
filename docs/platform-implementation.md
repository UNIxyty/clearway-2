# Clearway Platform Redesign — Implementation Record (Aug 2026)

Companion to docs/platform-audit.md. What shipped in the five phases
(commits 9f24a8c..<phase5>), what stayed on the separate track.

## Final routing table
| Route | Serves | Notes |
|---|---|---|
| / | redirect → /dashboard | /?icao=X → /aip?icao=X → /aip/X |
| /dashboard | landing: recents, service status, server health (admin), changelog | Phase 3 |
| /aip | airport search (wizard, suggestions, recents) | old / |
| /aip/<ICAO> | deep-linkable ONE-PAGE airport view (document + GEN + NOTAM/weather rail; main sidebar, no deep context) | /gen /notam /weather redirect here |
| /aip/service-status | country service statuses | /status = redirect |
| /account/{profile,notifications,search-stats,guide} | account pages (guide = in-shell iframe) | old paths redirect |
| /admin/{users,maintenance,email-tools,email/logs,debug,debug/raw,service-status,airports/deleted} | admin; debug trio = deep context | country-service-status + debug/email-logs redirect |
| /digital-wall/* , /pickem/*, /playoffs | UNCHANGED (§3 / deferred) | |
Legacy retired (404): /backend-test, /operators.html, /aircrafts.html.

## Health checks (lib/service-checker.ts; /api/service-checks + POST recheck)
portal-health 1m · aip-resolve 5m · notams-cached 10m · weather 10m ·
notam-sync / weather-sync / aip-sync workers (/health) 2m · wall-health
(/api/health on wall) 1m · leon-feed (wall sync-status) 2m ·
checkwx/crewbriefing/ead freshness (cache age, degraded >24h) 30m.
States operational/degraded/down/unknown + lastError + latency; results
persisted under storage key service-checks/. Self-probes (portal-health,
aip-resolve, notams-cached, weather) resolve their base via candidates
(PORTAL_SELF_URL -> 127.0.0.1 -> $HOSTNAME) with a cached winner and
re-resolution on connection failure — Next standalone binds
HOSTNAME||0.0.0.0 and Docker always sets HOSTNAME, so loopback refuses
inside the container (the post-deploy false-unhealthy bug).

## Server metrics (/api/admin/metrics, requireAdmin)
docker stats, /proc/loadavg, /sys/class/hwmon k10temp, free, df per
volume; warnings at disk>=80% and non-running/unhealthy containers
(surfaces the audit's root-disk-85% + unhealthy-pickem findings).
Graceful available:false sections off-Linux.

## Security state after Phase 5
- Auth FAILS CLOSED both apps: portal middleware missing-env/auth-throw
  → 503 (API) / /maintenance (pages), health + secret-header + testing
  bypasses preserved; wall auth misconfig → deny, with a read-only
  DISPLAY whitelist (timeline/limitations/settings GET + SSE) so the
  ops-room display survives an auth outage (writes/roles all 401).
- /api/asecna/job/[id] session-gated (was reachable via the extension
  bypass); telegram webhook keeps its own secret; /api/health public.
- SEPARATE TRACK (unchanged, still open): the /files/* extension bypass
  (any dotted URL skips login) + the x-debug-runner-secret master key —
  fix together with a wall-side authed fetch (§3 note); /api/unsubscribe
  behind login (email links bounce — needs signed tokens); GET
  /api/bug-reports returns all users' reports to any session; telegram
  bypass is a prefix match.
- Deferred by decision: container unification + /playoffs rename;
  changelog schema additions (airports/user_preferences updated_by etc.).

## Notes
- Shared tokens: shared/design-tokens.json (portal tailwind cw.* +
  lib/tokens.ts; console ui.jsx). Nav topology: components/portal/nav.ts.
- Force re-sync: force=1 propagates to the sync workers for EAD/scraper/
  ASECNA; USA has no live source.
- NEXT_PUBLIC_* env is inlined into the middleware bundle at build time:
  the env-missing branch protects builds without env; runtime env loss
  surfaces as getUser failures (also denied).

## Help Centre (Sep 2026) — console + developer inbox + Telegram mini app

Design source: claude.ai/design project "Help Centre.dc.html" + README Part 1.
The idea preserved in the data model, not just styling: a REPORT is filed and
carries a status; a CHAT means someone is waiting and carries presence, always
stated in words with a timestamp.

### Data model (migrations/20260917_create_help_centre.sql, service-role only, RLS deny-all)
- `help_threads` — reference (generated `RPT-`/`CHT-` + identity, the shared
  key on every surface), type (`bug|request|question|urgent|chat`), title,
  status from EXACTLY the wall Reports vocabulary
  (`untouched|under_process|done|impossible`), status_reason, owner
  (user_id/email/name), context jsonb (six fixed fields), presence
  (`none|not_notified|notified|joining|present|no_answer`) + presence_at,
  linked_from, telegram message ids, ops/dev last-read stamps.
- `help_messages` — author ops|developer, structured `blocks` jsonb (heading,
  subheading, paragraph, quote, bullet, numbered, checklist, code, divider,
  attachment — never rendered HTML), client_key unique per thread for
  offline-resend dedupe.
- `help_events` — system events distinct from messages (opened,
  status_changed, joined, chat_closed, nudged, linked_report,
  presence_changed); rendered as one line with a dot on every surface.
- `help_attachments` — 10 MB / allow-listed mime guard, stored under
  /storage `help-attachments/`, served ONLY via authed routes (never /files/*).
- `help_saved_replies` — text + optional paired status + honest use_count
  (five starters seeded).
- Apply with `node scripts/tools/create-help-centre-tables.mjs` (mgmt API /
  DATABASE_URL) or paste the SQL in the Supabase SQL editor.

### Rules enforced in the backend, not the UI
- Impossible cannot be saved without a written reason (store throws; API 400).
- Done closes the thread to new replies after 48 h (API 409 `{closed:true}`;
  clients then file a LINKED report via `linkedFrom`, keeping what was typed).
- Presence `no_answer` is computed at read time (notified + 5 min), so no cron.
- Ops only ever see their own threads (list scoped by user_id; GET by id
  404s for non-owners). `/api/bug-reports` GET is now caller-scoped too —
  closing the audit's data-exposure finding — and its POST files a help
  thread (the old path folded in, one report path).

### The developer gate — a flag, not an admin tier
- Resolution (lib/admin-auth.ts): DEVELOPER_EMAILS env, metadata
  role/is_developer, or user_preferences.is_developer. `ADMIN_EMAILS` now
  confers ADMIN ONLY (it used to grant developer — that would have opened the
  inbox to anyone listed there).
- Same flag gates all three: the Developer nav group (Shell fetches
  /api/admin/status, fail closed), the /developer/* routes (server layout →
  redirect /forbidden, fail closed on thrown checks), and the API scope
  (requireDeveloper on /api/help/inbox and /api/help/saved-replies).
- On Telegram, the equivalent gate is TELEGRAM_DEVELOPER_USER_IDS against
  HMAC-validated initData (lib/help/telegram-webapp.ts).

### Live updates
Portal SSE hub (lib/help/stream.ts, /api/help/stream): per-user routing —
events reach the thread owner and developers, nobody else. Frames match the
platform's SSE conventions (data JSON + comment heartbeats). The mini app
polls (EventSource cannot carry the initData header).

### Telegram
Reuses the bug bot + TELEGRAM_BUG_CHAT_ID; `help:set`/`help:join` callbacks in
the existing /api/telegram/debug webhook (Impossible deliberately absent from
the keyboard — needs a written reason). Mini app at /telegram/support; setup +
new env vars in docs/help-centre-telegram-setup.md
(TELEGRAM_HELP_MINIAPP_URL, TELEGRAM_DEVELOPER_USER_IDS, DEVELOPER_EMAILS).

### Cross-surface parity (console ↔ /developer/inbox ↔ mini app)
| Behaviour | Shared | Shell-specific |
| --- | --- | --- |
| Reference, type chip hues, status words | identical everywhere | — |
| Inbox groups | Needs you now (red waiting) / Waiting | — |
| Filters | same four statuses + five types | chips+dropdowns on desk, sheet on phone |
| Quick actions | status / Mark done / Go live | thread header vs above-thread row |
| Canned replies | same list, paired status, use counts | ⇧⏎ popover vs chip row + sheet |
| Reply composer | plain text + ``` code + attachments (dev side) | ops side gets the full block editor |
| Auto-collected context | six fields, two red-when-problem | grid (ops, collapsed) / strip (desk) / grid-first (phone) |
| Live chat | join from either marks present on both | presence prose (ops) vs red waiting time (dev) |
| Closing out | Done/Impossible + system event + 48 h close | — |

### Known deviations from the design (reasoned)
- ⇧? cannot be a distinct shortcut (? already carries Shift): ⌘?/Ctrl+? opens
  the pre-filled bug report instead.
- "Developer available · last seen HH:MMZ" pill derives from the stated
  reading window (06:00–22:00Z), not a tracked last-seen.
- Go live appears on chat/urgent threads only — reports never carry presence
  (the design's own data rule wins over the one artboard showing it on a bug).
- Image thumbnails serve the original scaled by CSS (≤10 MB uploads) rather
  than a generated thumbnail file.
- Typing indicators are not implemented (no realtime typing channel); read
  receipts derive from the other side's last-read stamp.

### Help Centre fixes (Sep 2026)
- **The developer is a role, not a name**: DEVELOPER_NAME = "Developer"; all
  author labels, presence strings, events, notification copy and avatars (DEV)
  are role-based. Zero occurrences of the personal name remain in the repo.
- **Drafts** (`/api/help/drafts`): server-side, one per route per user, stored
  on the portal's persistent /storage volume (`help-drafts/<user>/<route>.json`)
  — survives devices and cleared browsers without a Supabase migration; the
  trade-off vs a DB table is that drafts live outside DB backups, which is
  acceptable for pre-send scratch content. Debounced 3s autosave + flush on
  blur/tab-hide; blocks, route, Which-screen and uploaded-attachment refs all
  round-trip; quiet restore notice + Saved HH:MMZ state; send deletes, discard
  confirms; legacy localStorage drafts migrate up once.
- **Inline images**: block type `{type:'image', id, originalId?, caption?}` —
  `id` is the DISPLAYED file (the annotated composite once drawn on),
  `originalId` the untouched upload so annotation is redoable, never
  destructive. Placement: paste at cursor, /image at cursor, drop at position;
  blocks move/caption/delete like any other. Annotator: pen/rect/arrow, four
  colours, undo, discard-keeps-original; output is a flattened PNG uploaded as
  a new attachment. Both surfaces render inline in position (BlockRenderer +
  mini app via media token). Non-image attachments keep the chip treatment.
- Saved replies self-seed on first read if the migration's seed block wasn't
  run; developer-inbox layout normalised to the console's 36px/radius-9
  controls with pane-owned scrolling (site footer suppressed via the new
  PortalShell `footer={false}`).
