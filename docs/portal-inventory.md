# Portal inventory, navigation, and what is Clearway-specific

Read from the code at commit `467c12a` (2026-10-08), plus a read-only look at the production server on 2026-10-09
(running containers, the Cloudflare tunnel's ingress). Brought up to date with the code at `dd81c104` and a read-only
look at the server on 2026-10-12. Nothing was changed. File references are `path:line`. Where the code and
`docs-inventory-draft.md` disagree, the code is what is described here; §1.6 lists the differences.

---

## Reachable by URL only, on purpose (updated 2026-10-11, Part B)

These have no nav entry by design. The nav is for the people who use the product; a tool that exists to help us build
or debug has a URL, a role check and a line here, so nobody later files it as a lost page.

- **`/admin/debug`** (and `/admin/debug/raw`) — the debug runner. Developer role only, checked on the server
  (`app/admin/debug/layout.tsx`); starting a run is `portal.debug.run`, developer only. Run notifications link here.
- **`/developer/components`** — the component sheet: the kit in every state, light and dark. Developer role only
  (`app/developer/layout.tsx`). The design reference is `Portal Components.dc.html` in the design project.

Deleted in Part B, with nothing moved: the Reports & Issues section (its Bug reports item was a link to Help & support;
Console reports is in the wall console), and the Search statistics and Notification settings pages (with their nav
items, the wall console's account-menu links, and the old `/stats` and `/settings/notifications` redirects).

---

## What surprised me

1. **The portal is three applications behind one hostname, joined by a Cloudflare tunnel — not by nginx.** The host's
   nginx serves only its default page. `/etc/cloudflared/config.yml` on the server routes by path: `^/digital-wall/.*`
   → the wall gateway (:8088), `^/agent/api(/.*)?$` → agent-service (:8089), everything else → the Next portal (:3000).
   The repo only has an example of this file (`deploy/digital-wall/cloudflared-config.example.yml`). Until Pick'em was
   retired there was a fourth: the tunnel sent `/pickem` to a Pickem container (:3010). `scripts/pickem-retire.sh` has
   run (checked 2026-10-12): the tunnel has no `/pickem` rule and the container is gone. The portal answers 410 for
   `/pickem` and `/playoffs` (`middleware.ts:114-118`).
2. **Every Ops Agent page took two hops, until 2026-10-12.** The tunnel's `^/agent/.*` rule was meant for `/agent/api`,
   but it also caught the portal's own `/agent/history`, `/agent/intake`, … pages. agent-service passed anything that is
   not an API call back to the portal (`agent/server.mjs:229-243`, `passToPortal`, called at :276), at the cost of an
   extra hop on every page load inside the agent. `scripts/tunnel-agent-api.sh` narrowed the rule to
   `^/agent/api(/.*)?$` (checked 2026-10-12), so agent pages now go straight to the portal. `passToPortal` is still in
   the code but no longer used by the tunnel.
3. **Inside the Next portal, navigation is client-side and the frame stays.** `<PortalFrame>` in the root layout
   (`app/layout.tsx:61`, `components/portal/Shell.tsx:718-722`) mounts the sidebar, top bar, identity, badges, agent
   panel and document viewer once. Pages still render `<PortalShell>`. Inside the frame it draws only the page's header,
   content and footer (`Shell.tsx:698-707`). The loading skeleton covers only the content. Sign-in and system pages,
   `/intake/answer`, `/telegram/*`, `/agent/panel`, `/docs` and the HITL viewers have no frame (`Shell.tsx:712`).
4. **Pick'em is retired.** Every `/pickem` and `/playoffs` path, page or API, answers 410 Gone, signed in or not
   (`middleware.ts:114-118`). Its pages, APIs, admin console, the World Cup email console (once "Admin → Email tools")
   and its nav section are removed. `/admin` opens Users (`app/admin/page.tsx:8`). The tables are kept; see
   `docs/pickem-archive.md`.
5. **There is no "clearway" role.** Roles come from `ADMIN_EMAILS` / `DEVELOPER_EMAILS` and user metadata or preferences
   (`lib/role-resolve.ts:16-61`). Nothing grants anything to `@clearway.aero`. What each role may do is a separate
   table, `permission_grants`, set on Admin → Permissions.
6. **Pages gate unevenly; writes are gated everywhere.**
   - Every write in the portal, the agent and the wall must be an action in `lib/permissions/catalogue.mjs`, and the
     person's role must hold it (`middleware.ts:279-291`, `digital-wall/server.mjs:842-856`). An endpoint not in the
     list is refused. Admin → Permissions changes who holds what.
   - Users, Agent sites, Maintenance and Permissions show a locked card to someone without access. Email logs and the
     debug runner send them to `/forbidden`. The Service status editor still shows the shell with an "HTTP 403" box
     (`app/admin/service-status/page.tsx:34, 117`).
   - Anyone signed in can view every Digital Wall console page. Writes on Operators, Aircraft, Limitations, Important,
     CAA details and Webhooks are admin by default; others see those pages view-only
     (`opsboard-react/src/ConsoleApp.jsx:419-435`).
   - The dashboard changelog shows each user their own entries. Admins and developers see everyone's, labelled
     (`app/api/dashboard/changelog/route.ts:10-13`).
7. **Maintenance mode keeps sign-in open.** `/login` and `/auth/*` stay reachable. An admin or developer who signs in is
   sent to `/admin/maintenance`. Everyone else sees `/maintenance`, which links to sign-in (`middleware.ts:154-210`).
   From the server, `MAINTENANCE_FORCE_OFF=true` or `scripts/maintenance-off.sh` turns it off (`docs/maintenance.md`).
8. **The nav entries that misled are fixed.**
   - Reports & Issues is gone (Part B).
   - Deleted airports is now AIP & Documents → Hidden airports, for everyone (`nav.ts:56`).
   - Console → Sign out ends the session (`POST /auth/sign-out`, `opsboard-react/src/ConsoleApp.jsx:125-133`).
9. **No tenant column exists anywhere.** None of the ~45 tables has an organisation id.
10. **There is no demo dataset for the portal**, and the existing guide screenshots were taken against production
    (`docs/guide-shots/INDEX.md:3-6`).

---

## 1 — The complete page inventory

### 1.0 How access works (read once; the tables refer to it)

- **Signed in**: `middleware.ts` requires a Supabase session for every page except `/login`, `/signup`, `/auth/*`,
  `/maintenance`, `/intake/answer`, `/telegram/support`, and `/docs` when `content/docs/site.json` says
  `"public": true` (it says `false` today) (`middleware.ts:55-255`). An account with `is_approved === false` goes to
  `/pending-approval` (:257-267). A **temporary** user (metadata `temporary`) reaches only the auth pages,
  `/pending-approval`, `/access-blocked` and `/maintenance`. Anything else sends them to `/access-blocked`, which says
  Pick'em was retired (:12-36, :269-277).
- **admin**: `requireAdmin()` lets in admin **or developer** (`lib/admin-auth.ts:53-70`). Admin comes from
  `ADMIN_EMAILS`, metadata or `user_preferences.is_admin`.
- **developer**: a flag, not a tier (`DEVELOPER_EMAILS`, metadata, `user_preferences.is_developer`). An admin does not
  see Developer items. `app/developer/layout.tsx:12-21` gates on the server and sends others to `/forbidden`.
- **permissions**: every write is an action in `lib/permissions/catalogue.mjs`. Which role holds it is data
  (`permission_grants`), changed on Admin → Permissions (`/admin/permissions`, needs `permissions.manage`, admin and
  developer by default). Defaults: `U` everyone, `A` admin and developer, `D` developer (`catalogue.mjs:20-22`).
- **agent**: the Ops Agent topic appears only for people on the agent allowlist (`agent_access`) while the global
  kill switch is on (`agent/lib/access.mjs:19-43`; nav `agentOnly`). Every agent API call checks it again.
- **mailbox**: admins, developers and the emails in the intake setting "Agent mailbox access"
  (`agent/lib/intake/api.mjs:33`).
- **"guest"** is never assigned by the sidebar (`Shell.tsx:100`). Account and Settings list it, but no topic depends
  on it.
- **Digital Wall console**: any valid portal session can view (`digital-wall/lib/auth.mjs:114-224`). Writes need the
  permission for their action, with the role worked out the portal's way (`digital-wall/lib/roles.mjs`,
  `digital-wall/server.mjs:842-856`). The wall display also accepts an approved **device token** (kiosk), read-only.

**Status** below: *live* · *URL only* (works, nothing in the nav links to it) · *redirect* · *dead* (code that never
runs) · *deleted* (404) · *410 Gone* (retired).

### 1.1 Next portal (`app/`, served at `/` by the portal container)

| Route | Section · nav label | Role | Status | Notes |
|---|---|---|---|---|
| `/` | — | signed in | redirect | → the start page chosen in Settings, default `/dashboard` (`middleware.ts:293-311`); `/?icao=` → `/aip?icao=` (`app/page.tsx:14-15`) |
| `/dashboard` | Dashboard | signed in | live | Server health block admin-only |
| `/dashboard/changelog` | from the dashboard's Changelog block | signed in | live | Own entries; everyone's for admins |
| `/settings` | Settings (last in the sidebar) | signed in | live | Appearance, Customisation (pinned tabs, dashboard blocks), Preferences (density, start page, motion) |
| `/aip` | AIP & Documents · Airport search | signed in | live | |
| `/aip/[ICAO]` (+ legacy `/gen` `/notam` `/weather`) | from search, recents | signed in | live | Legacy tabs redirect |
| `/aip/service-status` | AIP & Documents · Service status | signed in | live | Read-only |
| `/status` | — | signed in | redirect | → `/aip/service-status` |
| `/admin` | — | signed in | redirect | → `/admin/users` |
| `/admin/users` | Admin · Users | locked card on 403; API admin | live | Approve, roles, password reset (single and bulk), copy ID |
| `/admin/agent-sites` | Admin · Agent sites | locked card on 403; API admin | live | |
| `/admin/permissions` | Admin · Permissions | `permissions.manage` (admin, developer) | live | Grid of role × action, change log |
| `/admin/maintenance` | Admin · Maintenance | locked card on 403; GET admin; turn on developer, turn off admin (permissions) | live | |
| ~~`/admin/email-tools`~~ | — | — | deleted (Pick'em retired) | 404 |
| `/admin/debug` | — URL only, on purpose (see the top) | developer (server) | live | Was in the nav twice and under Reports & Issues; removed 2026-10-11 |
| `/admin/debug/raw` | — (link from debug run) | developer (server) | URL only | Without `?run=` it says no run is selected and links to the runner |
| `/developer/components` | — URL only, on purpose (see the top) | developer (server) | live | The kit sheet; off the nav 2026-10-11 |
| `/admin/service-status` | Admin · Service status editor | page ungated; API admin | live | Non-admin: shell + "HTTP 403" box |
| `/admin/airports/deleted` | AIP & Documents · Hidden airports | **any signed-in user** | live | "Airports you hid"; also linked from the search browse panel |
| ~~`/admin/playoffs/*`~~ | — | — | deleted | 404 |
| `/admin/country-service-status` | — | — | redirect | `next.config.mjs:19` → `/admin/service-status` (the page file was removed) |
| `/developer/inbox` | Developer · Inbox | developer | live | |
| `/developer/saved-replies` | Developer · Saved replies | developer | live | |
| `/developer/agent-access` | Developer · Agent access | developer | live | |
| `/developer/knowledge` | — | developer | redirect | → `/agent/knowledge` |
| `/account/profile` | Account · Profile | signed in | live | |
| ~~`/account/notifications`~~ | — | — | deleted 2026-10-11 | Columns `user_preferences.notify_*` kept; see Part B |
| ~~`/account/search-stats`~~ | — | — | deleted 2026-10-11 | Table `search_events` still feeds the dashboard's Recently used |
| `/account/guide` | Account · Guide | signed in | live | Iframe of `/digital-wall/guide/` |
| `/profile` | — | — | redirect | → `/account/profile` (`next.config.mjs:18`). `/settings/notifications` and `/stats` were removed in Part B (404) |
| `/help` | sidebar "Help & support" (not a nav topic), `?` key | signed in | live | |
| `/help/new` | from `/help`, ⌘? / Ctrl+? | signed in | live | |
| `/help/[ref]` | from `/help` history | owner or developer | live | |
| `/docs`, `/docs/[section]`, `/docs/[section]/[page]` | linked from Help & support | signed in unless `content/docs/site.json` says `"public": true` | live | Own frame (`components/docs/DocsFrame`), not the portal shell. Pages from `content/docs/` |
| `/pickem/**`, `/playoffs/**` (and `/api/…`) | — | everyone | 410 Gone | Retired; `middleware.ts:114-118`, `docs/pickem-archive.md` |
| `/login`, `/signup`, `/auth/confirm`, `/auth/reset` | — | public | live | Also `/auth/sign-out` (POST, ends the session; used by the console) |
| `/maintenance`, `/pending-approval`, `/access-blocked`, `/forbidden` | — | middleware targets | live | |
| `/telegram/support` | — (Telegram mini-app URL) | public page; API checks Telegram ids | live | Developer support inbox inside Telegram |
| `/intake/answer` | — (email link) | public; single-use token | live | One-tap answer page (E1) |
| `/greece-hitl-auto-test/viewer`, `/lithuania-…/viewer`, `/netherlands-…/viewer` | — (popup from AirportView) | signed in | live, test-named | Back closes the popup and returns to the airport (`components/hitl-country-viewer-client.tsx:13`) |
| `app/debug_run_1.md` | — | — | stray file | Not a page |

### 1.2 Ops Agent (`/agent/*` — Next pages; only `/agent/api/*` goes to agent-service)

| Route | Nav label | Role | Status | Notes |
|---|---|---|---|---|
| `/agent` | Ops Agent · Chat | agent | live | Full-page chat |
| `/agent/t/[id]` | — (Chat stays highlighted) | agent | URL only | A thread's permalink: History rows, Activity, "Expand" |
| `/agent/history` | Ops Agent · History | agent | live | |
| `/agent/knowledge` | Ops Agent · Knowledge base (badge) | agent; upload/approve **developer** | live | |
| `/agent/intake` | Ops Agent · Flight intake (badge) | agent | live | Sending to Leon is `intake.send` (everyone by default). Showing passengers' personal data is `intake.people.reveal` (admins by default) |
| `/agent/mailbox` | Ops Agent · Mailbox (badge, lock) | agent + mailbox | live | |
| `/agent/activity` | Ops Agent · Activity log | agent (users see their own rows) | live | |
| `/agent/settings` | Ops Agent · Settings | agent; organisation sections admin/developer | live | |
| `/agent/panel` | — | agent | URL only | The side panel as an iframe page for the wall console (`opsboard-react/src/hooks/useAgentDock.jsx:120`) |
| `/agent/doc` | — | (viewer needs agent) | URL only | Standalone document viewer for the console panel and the Chrome extension; says when the document cannot be opened (`components/agent/viewer/StandaloneDocument.tsx:41`) |

Related, outside `/agent`: **Agent access** is `/developer/agent-access` and **Agent sites** is `/admin/agent-sites`.
The **Chrome extension** (`extension/`) is a separate client of the agent service.

### 1.3 Digital Wall (`/digital-wall/*` — the `opsboard-react` single-page app, plus the wall backend)

| Route | Console nav label | Role | Status | Notes |
|---|---|---|---|---|
| `/digital-wall`, `/digital-wall/` | — | — | redirect | → `/digital-wall/timeline/` (gateway). Bare `/digital-wall` without a slash misses the tunnel rule and hits Next |
| `/digital-wall/timeline/` | portal "Open wall" | session or approved device token | live | The wall. The same URL is the phone view (Now / Attention / Timeline, 2H/6H/DAY) and the tablet view, chosen by width |
| `/digital-wall/timeline/?debug=viewport` | — | as above | URL only | Viewport debug panel |
| `/digital-wall/guide/` | console user menu · Guide | session | live | Static guide, also iframed at `/account/guide` |
| `/digital-wall/console` | — | — | redirect | → `/console/flights` |
| `/digital-wall/console/flights` | Flights | any session | live | Default page |
| `/digital-wall/console/notam-check` | NOTAM Check | any session | live | |
| `/digital-wall/console/operators` | Operators | any session views; writes admin by default (view-only note for others) | live | |
| `/digital-wall/console/aircraft` | Aircraft | any session views; writes admin by default (view-only note for others) | live | |
| `/digital-wall/console/limitations` | Limitations | any session views; writes admin by default (view-only note for others) | live | |
| `/digital-wall/console/important` | Important | any session views; writes admin by default (view-only note for others) | live | |
| `/digital-wall/console/caa` | CAA details | any session views; writes admin by default (view-only note for others) | live | |
| `/digital-wall/console/webhooks` | Webhooks | any session views; writes admin by default (view-only note for others) | live | |
| `/digital-wall/console/reports` | Reports | any session | live | |
| `/digital-wall/console/settings` | Settings | any session | live | 5 sections, not linkable by URL |
| `/digital-wall/console/<anything else>` | — | — | — | Silently shows Flights; never 404s |
| `/digital-wall/(operators\|aircrafts\|limitations)` | — | — | redirect | Old URLs → console pages |
| `/digital-wall/leon/webhook/*` | — | Leon (signed JWT) | live | Webhook receiver, not a page |
| other `/digital-wall/<path>` | — | — | 404 | The backend answers "Not found." The old copied site is gone (`digital-wall/server.mjs:2394-2405`) |

The console has **no** Users, Airports or Devices page. Devices live inside Settings. The old prototype
(`digital-wall/src/`, `digital-wall/index.html`) was removed in portal foundations 4.2. A leftover `digital-wall/dist/`
may exist locally; it is git-ignored.

### 1.4 Actions, page by page

Written at manual level. "Admin" includes developers. Every page in the portal shell also has: open or close the agent
panel (⌘J, agent users), Help & support (`?`), report a bug about this page (⌘?), collapse the sidebar, sign out.
The top bar adds page search (⌘K), the theme menu and pinned tabs.

#### Dashboard — `/dashboard`
- Six blocks: Today, Recently used, Service monitors (Re-check now), Server health (admins), Quick links, Changelog.
  Each retries on its own.
- Open a recently used item.
- Customise: move, resize (S / M / L), add, remove, reset. Saved to the account.
- Changelog: the full list is at `/dashboard/changelog`.
- Server health is view-only and admin-only.

#### AIP & Documents
**Airport search — `/aip`**
- Search by ICAO, name or country; stop a search.
- Browse region → country → (US) state → pick airports → open them.
- Hide an airport from your own search, and close a result tab.
- Open a result or a recent airport.
- "Airports you hid" (everyone) opens Hidden airports.

**Airport page — `/aip/[ICAO]`**
- Download the AD 2 PDF, and re-sync it from the source (not the USA).
- Open GEN 1.2 in the viewer's GEN tab (⋯ menu).
- Open the official Web AIP (after a consent dialog).
- Refresh NOTAMs; refresh weather.
- Start a captcha verification for a blocked country. This opens the HITL viewer popup.
- Report a problem (⋯ menu). This opens Help & support's bug form with the airport as the page.
- "Ask about" with the agent.
- Back to search.

There is no charts view.

**Service status — `/aip/service-status`**
- Filter countries by text and by status. Read-only.

#### Ops Agent
**Everywhere (agent users)**
- ⌘J opens or closes the panel; ⌘⇧J switches between the full page and the panel; ⌥⇧Space talks (voice).
- "Ask about this" on a page header.
- In the panel: History, New thread, Open full page, Minimise, Close, resize, recent threads, search history.

**Chat — `/agent`, `/agent/t/[id]`**
- Start a new chat. Switch to the side panel. Ask a suggested question. Continue a stopped reply. Dismiss an error.
- Clear the context chip.
- Composer:
  - Send (Enter) and stop generating (Esc).
  - Attach a file (paperclip, paste or drop): PDF, Word, spreadsheet or text up to 25 MB; images up to about 3.75 MB.
  - @-mention a flight, airport, operator, aircraft, limitation or document.
  - Set a one-message model tier.
- **Slash commands** (`agent/config/commands.json`; each shown only to users with the tool):
  - Flights and wall: `/flights`, `/flight`, `/wall`, `/clock`, `/colours`.
  - AIP and briefing: `/aip`, `/gen`, `/notam`, `/wx`, `/caa`, `/brief`.
  - Wall content: `/limitation`, `/important`.
  - Manifests: `/manifest` (flight picker) and `/blank-manifest`.
  - Knowledge base: `/search`, `/doc`.
  - Everything else: `/email`, `/undo`, `/model`, `/help`.
- **Voice**:
  - Talk and send.
  - Reply mode spoken / text / auto.
  - Correct a misheard word.
  - Show the reply instead, or stop speaking.
  - Allow the microphone.
- **On replies**:
  - Flight card: Open in Flights.
  - Documents and files: Open, Download, Email, Send.
  - Tables: Show all, Export CSV, full view.
  - Copy a verbatim clause.
  - Open a citation at its page.
  - Undo an auto-confirmed change.
  - Cancel a file being built.
- **Confirmation cards**:
  - Apply or Cancel.
  - Confirm / Create / Confirm and send (⌘Enter).
  - Hold to delete (2 s).
- **Document viewer**:
  - Ask about it, attach it to a reply, email it, download it, open the source.
  - Edit a knowledge record's title, version, effective date and tags (approvers).
  - Thumbnails, page navigation, zoom.
  - On selected text: Ask, Limitation…, IMPORTANT…, Note….

**History — `/agent/history`**
- Search. Filter: With changes, With files, Voice.
- Open a thread. Start a new chat.

"Mine" is shown but does nothing (`HistoryPage.tsx:30`).

**Knowledge base — `/agent/knowledge`**
- Upload a document (developers): file, title, source, version, effective date, country, ICAO.
- Open a document.
- Approve a pending document (developers):
  - Step through its clauses.
  - **Approve as authoritative** (Tier 1), **Reference only** (Tier 2), or **Reject with a note**.
- Download the original. Re-upload a missing file (developers).

**Flight intake — `/agent/intake`**
- List view:
  - Tabs: All, Needs attention, In progress, Loaded, Closed. Filters: Type, Stage, From. Search.
  - Open a request. Keys: `/`, j/k, Enter, Esc.
- Request detail:
  - Open the original email (o).
  - Duplicates: "Close · I will update Leon by hand", "Not a duplicate · review it". "Open … in Leon" is always disabled.
  - Cancellation (from the provider): Cancel in Leon / Keep the flights.
  - Scheduled flights: Process it / Skip it / Process anyway, and Look up now.
  - Re-extract, Mark handled manually, Cancel request.
- Review:
  - Use another attachment as the request.
  - Enter details by hand, add a leg, remove or undo a leg.
  - Set the time zone (UTC / local).
  - Edit any field. Mark a value as looking right. Resend a value Leon refused. Choose between differing sources.
  - Services: Provide / To confirm / Decline (keys 1/2/3), our answer, add a missed service.
  - Crew and passengers:
    - Show personal data for 60 s (audited; `intake.people.reveal`, admins by default). Names are masked too.
    - Add a crew member or passenger, or remove a hand-added one.
    - Correct a passenger's surname/given-name split (✎). Shown only to those who can show personal data.
  - Confirm: "Review and create in Leon" → the confirm dialog → **Create / Send / Resend to Leon**.
- What was sent to Leon:
  - Send passengers to Leon (per leg, with confirmation).
  - Check Leon for an unknown leg, or mark it "not in Leon".
  - Show the raw request and response, and copy them.
- Emails the agent sent for this request open in the mailbox.

**Mailbox — `/agent/mailbox`** (mailbox access)
- List view:
  - Received / Sent. Views: Needs attention, All, Processed, Replies, Ignored.
  - Search. Filters: address, status, range, attachments.
- Reader (actions depend on status):
  - Process as handling request; Process as flight notification (enter a reference).
  - Mark as ignored (reason, note). Reprocess. Not ignored · reprocess.
  - Forward to a person. Open the request.
  - Switch rendered / plain text; show or block images; open a link (after a confirm step).
  - Show personal data for 60 s.
  - Open or download attachments (logged).
  - Show the raw source, copy it, or download the `.eml` (logged).
- Sent reader: open the request, copy the Resend id.

**Activity log — `/agent/activity`**
- Tabs: All, Answers, Changes, Sent, Denied. Filters: person, tool, date.
- Export CSV. Expand a row. Open its thread. Load more.

**Settings — `/agent/settings`**
- Five tabs. Each shows only to people the agent allows (`components/agent/pages/SettingsPage.tsx:26-31, 100`).
  `?tab=` opens one.
- **Your preferences** (everyone): default model tier; skip confirmation for low-risk actions.
- Admins and developers by default:
  - **Model tiers**: model per tier, escalation rules, lock "skip confirmation" for everyone. Edits collect in a draft
    with a save bar.
  - **Capabilities**: web search, voice, write actions, send email, auto-approve reference uploads, high-knowledge
    model; the organisation's keyboard shortcuts.
  - **Access & sites**: who can do what (read-only), sites summary.
  - **Flight intake**: receiving addresses, intake recipients, mailbox readers, mail retention.
- Usage this month is in the page header, when the person may see it.

**One-tap answer — `/intake/answer`** (public, from email)
- Yes, process it / No, skip it.
- Yes, cancel in Leon / No, keep the flights.

#### Digital Wall
**The wall — `/digital-wall/timeline/`**
- Click a flight to open its info. Mark sections checked, or Check all.
  - On a kiosk device token the check fails: tokens are read-only (`digital-wall/server.mjs:548-579`).
- Expand a limitation.
- Open IMP attachments.
- Phone: Now / Attention / Timeline, with zoom 2H / 6H / DAY.
- Tablet: legend drawer, link to settings.
- The voice readout is a read-only strip showing a console's agent voice session to the room.

**Kiosk pairing**
- A screen without a session shows a 4-character code.
- Someone approves it in Console → Settings → Wall content → Devices, or in the approval pop-up.
- Revoke it there too.
- Setup notes: `deploy/digital-wall/KIOSK.md`.

**Console (every page)**
- Switch pages, collapse the sidebar, open the wall in a new tab, All services.
- User menu: Profile, Guide, Sign out.
- Approve or postpone a new screen from the pop-up.

**Flights**
- Search; filter by operator and airport; Today / All; sort.
- Open a flight. Show it on the wall, or close it there.
- Email AIP / GEN for departure and/or arrival.

**NOTAM Check**
- Run the check now.
- For each airport: mark checked or undo, expand its NOTAMs, retry an airport in error.

**Operators**
- Add an operator (name, Leon subdomain, refresh token).
- Edit it (a blank token keeps the current one).
- Activate or pause.
- Delete, with a confirm step. This purges its flights.
- Force sync.

**Aircraft**
- Search; filter by operator.
- Show or hide each aircraft on the wall; Show all / Hide all.
- Delete, with a confirm step.
- There is no type editing.

**Limitations**
- Create or edit: title, description, match by flight / airport / country / mixed, dates, permanent.
- Activate. Delete (permanent ones cannot be deleted).

**Important**
- New entry.
- Search; show only unreviewed.
- Edit the title, body, review state, countries, airports, operators, registrations, direction, valid window, flight
  type and load.
- Attachments: add, download, remove.
- Activate. Delete (no confirm step). Mark reviewed.

**CAA details**
- New authority.
- Search and filter.
- Edit the authority, function, addresses (AFTN, SITA…), phones, scope.
- Activate. Delete. Mark reviewed.

**Webhooks**
- Refresh health. Re-register all for an operator.
- Per event: toggle on or off, see trigger history, delete the registration.

**Reports**
- New report (category, title, description, status).
- Search and filter. Quick status change. Edit.
- Send by email. Delete. Edit recipient presets.

**Settings**
1. *Display & sizing*:
   - "My view" or "Main wall (ops room)", and Reset main wall.
   - Display scale, hour spacing.
   - Vertical sizing (auto-fit rows, row spacing, pill height, marker size, label size).
   - Horizontal sizing (auto-fit; callsign, route and time sizes; chip spacing; pill length and padding; gap; text and
     spacing minimums; viewing distance, Record wall check).
   - Overlay and sidebar sizes, MVT flash, unconfirmed outline.
   - Chips on pills (IMP, CAA, NTM, WX).
   - Upcoming flight table.
2. *Colours*:
   - Per-token colour, search, only overridden.
   - Reset one, or reset all.
3. *Font*:
   - Wall font.
   - Zero style: dotted, slashed or plain.
   - Reset.
4. *Wall content*:
   - Flight visibility window (global).
   - Wall clocks: add, reorder, set local, remove.
   - Devices: approve, name, revoke.
5. *NOTAM, alerts & WX*:
   - NOTAM digest recipients, check hour (Europe/Riga), reminder interval.
   - Fetch weather now.
   - Alert filter terms (friendly or raw JSON), save, run scan now.

#### Admin
**Users — `/admin/users`**
- Tabs by role, search, Role and Last sign-in filters.
- Approve a pending account.
- Make admin / remove admin.
- Make developer / remove developer (developers only).
- Send a password reset; bulk password reset.
- Copy a user ID.

There is no invite or remove action.

**Permissions — `/admin/permissions`**
- Grant or take away an action per role.
- Filter "Differs from default". Expand or collapse groups.
- Read the change log.

**Agent sites — `/admin/agent-sites`**
- Approve or decline an extension site request.
- Add a site (optionally with its subdomains).
- Revoke a site.

**Maintenance — `/admin/maintenance`**
- Turn maintenance on (developers) or off (admins), with a message and ETA. Turning it off asks you to type OFF.
- Clear all cached AIP PDFs (admin).

**Debug runner — `/admin/debug`**
- Start a run: quantity, concurrency, airports, EAD-only, country, steps.
- Stop a run. Re-run failures. Re-run from saved failures.
- Open the raw stream. Download the raw JSON.

**Service status editor — `/admin/service-status`**
- Set a country's status and note.

**Hidden airports — `/admin/airports/deleted`** (under AIP & Documents)
- Restore one or several of your own hidden airports.

#### Developer
**Inbox — `/developer/inbox`**
- Filter threads. Change status (Impossible needs a reason). Mark done.
- Go live in a chat, or end it.
- Reply, with saved replies and code blocks. Copy the context.

**Saved replies — `/developer/saved-replies`**
- Add, edit or delete.

**Agent access — `/developer/agent-access`**
- Grant access by email (with a note). Revoke. Show revoked grants.
- **Turn the agent off for everyone** (with a reason), or back on.

#### Help & support (sidebar button, not a nav topic)
- `/help`: report something urgent, report a bug, make a suggestion, ask how to, chat with the developer; open past
  threads.
- `/help/new`:
  - Block editor with pasted images and annotations; autosaved draft.
  - Suggested guide articles. Edit "which screen". Send, or discard.
- `/help/[ref]`: reply, nudge, file as a report, ask the developer to come live, retry a failed message.
- `/telegram/support` (developers, inside Telegram): the same inbox in Telegram.

#### Account
- **Profile**: display name, change email, change password (by reset email), sign out.
- **Guide**: the wall guide, full screen.

#### Settings — `/settings`
- **Appearance**: match this device, light or dark.
- **Customisation**: pinned tabs (up to five pages or airports, beside search in the top bar); the dashboard's blocks.
- **Preferences**: table density, start page, motion.

#### Pick'em — retired
- Every `/pickem` and `/playoffs` path answers 410. See `docs/pickem-archive.md`.

#### Sign-in and system pages
- **Login**: sign in, forgot password, create account.
- **Signup**: request access (name, work email), resend.
- **`/auth/confirm`**: set a password.
- **`/auth/reset`**: set a new password.
- **Maintenance**: try again; sign in to turn maintenance off.
- **Pending approval**: sign out; it moves on automatically once approved.
- **Access blocked**: says Pick'em was retired; sign out.
- **Forbidden** and **404**: go home.

### 1.5 Flags

**Reachable by URL but not linked from the nav**
- `/agent/t/[id]`, `/agent/panel`, `/agent/doc` — by design (permalinks, iframe pages).
- `/admin/debug`, `/admin/debug/raw`, `/developer/components` — by design (see the top).
- `/telegram/support`, `/intake/answer` — by design.
- `/digital-wall/timeline/?debug=viewport`.
- Redirect stubs nothing links to: `/status`, `/admin` (→ Users), `/developer/knowledge`, `/profile`,
  `/admin/country-service-status`.
- Admin › Email logs was removed on 2026-10-14: nothing had written to `email_logs` since Pick'em was retired
  (2026-10-10), so it could only show old rows. The dashboard's changelog still reads the table.

**Nobody can reach at all (dead code)**
- A local, git-ignored `digital-wall/dist/`.
- `components/hitl-country-auto-test-page.tsx`.
- In the agent: `ConfirmationModal` (`thread/Confirmation.tsx:236`, never used) and the History "Mine" chip.

**In the nav and misleading, erroring or 404-ing**
- **Open … in Leon** (intake duplicate box) is always disabled: "Leon link not configured"
  (`components/agent/intake/intake-detail.tsx:374`).
- Nothing in the nav points at a page that does not exist.
- Fixed in portal foundations Group 2 and Part B: Bug reports (went to the debug runner), Admin → Email tools (Pick'em),
  Deleted airports (now Hidden airports), Console → Sign out, "Open in Flights" (`?flight=` is now read), and the HITL
  viewer's Back link.

### 1.6 Against `docs-inventory-draft.md`

**What the draft got wrong**

| Draft | The code |
|---|---|
| Pickem: off the nav, containers stopped, archived | True since portal foundations 4.1: paths answer 410, the nav section, compose service, container and tunnel route are gone, the tables are archived (`docs/pickem-archive.md`). `/admin` opens Users |
| Users: "the new automatic **clearway** role for `@clearway.aero`" | No such role or rule exists |
| Users: inviting and removing a user | There is no invite or remove. Sign-up is self-service and an admin **approves** it. Actions are approve, make/remove admin, make/remove developer, and send a password reset (single or bulk) |
| Admin: "Email tools" as portal email tools | They were the Pickem World Cup email tools, and were removed with Pick'em |
| Reports & Issues | Deleted in Part B. Bug reports are filed in Help & support and worked from the developer inbox |
| Help Center → Saved replies "moved from Developer" | Help & support exists (`/help`, `/help/new`, `/help/[ref]`, the ⌘? bug report). Saved replies are still under Developer |
| Digital Wall → "Airports ?" | There is no airports page in the console |
| Console reports "stays here" | It does. The portal links it only from the Digital Wall group |
| Aircraft → "Aircraft type and ICAO mapping ✓" | There is no type editing in the console. The only ICAO type mapping is the intake's aircraft-name table (`agent/lib/intake/notification.mjs:36`) |
| Wall → "The voice readout ✓" | It exists, but it is read-only: it shows a console's agent voice session to the room. The wall does not speak |
| AIP → "Charts ?" | There is no charts view |
| OPS Agent → History "Pinning a chat" | Does not exist (listed as →, i.e. not built) |
| Developer → "This section may not need to exist" | It holds three nav items: Inbox, Saved replies, Agent access (incl. the global agent kill switch). The debug runner and the component sheet are reachable by URL only |
| Agent settings → "Agent access (moved from Developer)", "Agent sites (moved from Admin)" | Not moved. Agent access is at `/developer/agent-access`; Agent sites at `/admin/agent-sites` (Settings shows only a summary) |
| Settings section (Customisation, Appearance) | Built in redesign stage 4: `/settings` with Appearance, Customisation and Preferences |
| Dashboard → choosing and rearranging blocks | Built: six blocks on a 12-column grid, customisable, saved to the account |

**What the draft missed**

- **Ops Agent**
  - Activity log (`/agent/activity`).
  - Mailbox access as its own permission.
  - Slash commands as a list; @-mentions.
  - Confirmation levels and Undo. Selection actions in the viewer.
  - The one-tap answer page as a public page.
  - Intake actions beyond the main path: Re-extract, Mark handled manually, Cancel request, Use another attachment,
    Enter details by hand, time-zone choice, Check Leon for an unknown leg, Send passengers to Leon, raw request and
    response.
  - Agent settings in full: Routing, Capabilities, Keyboard shortcuts, Usage, Who can do what, Flight intake
    (addresses, recipients, mailbox readers, retention).
- **Admin**
  - Service status editor; Hidden airports (now under AIP & Documents); Debug runner (developer only, by URL).
  - Maintenance's "Clear all cached AIP PDFs".
- **Developer**
  - Agent access's global kill switch.
- **Digital Wall**
  - NOTAM Check, Limitations, Important, CAA details, Webhooks as console pages.
  - Settings in full: Font with zero style, Wall content (flight visibility window, clocks, devices), and the NOTAM
    digest / alert filter / weather section.
  - The kiosk approval pop-up.
  - The tablet view.
  - The flight info panel's "Checked" actions, and that they fail on a kiosk.
  - Email AIP/GEN from Flights.
- **AIP**
  - Re-sync from source, the Web AIP consent dialog, the HITL captcha verification for blocked countries.
  - Hiding airports from your own search, and restoring them.
- **System pages**
  - Signup with admin approval, password reset, pending approval, access blocked, maintenance, forbidden.
- **Telegram mini-app**
  - The developer inbox inside Telegram (`/telegram/support`).
- **Chrome extension**
  - Its own surface (side panel, site list, insert, voice), separate from the portal.
- **Answers to the draft's questions**
  1. Help Center today: report urgent / bug / suggestion / question / chat, thread history, the ⌘? bug report. The
     developer works it from the Developer inbox and Telegram.
  2. Developer holds three nav items.
  3. The console has no airports, users or device-management pages; devices are in Settings.
  4. External APIs: the agent service's API is used by the Chrome extension. The wall receives Leon webhooks
     (`/digital-wall/leon/webhook/*`). Kiosks use the device-token API. No public API is offered to customers.

---

## 2 — Why does clicking the nav reload the page?

### 2.1 The applications

| # | Application | Serves | Code | Process |
|---|---|---|---|---|
| 1 | **Portal** (Next 14, React 18) | `/`, `/dashboard`, `/aip/**`, `/admin/**`, `/account/**`, `/help/**`, `/developer/**`, `/settings`, `/docs/**`, `/api/**`, `/files/**`, and the `/agent/*` *pages*; the 410 for `/pickem` and `/playoffs` | `app/`, `components/` | container `clearway-2-portal-1`, :3000 |
| 2 | **Pickem** — retired. `scripts/pickem-retire.sh` has run: no container, no tunnel route (checked 2026-10-12) | — | removed from the repo; archive in `docs/pickem-archive.md` | — |
| 3 | **Digital Wall**: gateway (nginx) → frontend (`opsboard-react`, Vite SPA, React 19) and backend (Node) | `/digital-wall/**` | `deploy/digital-wall/nginx-gateway.conf`, `opsboard-react/`, `digital-wall/server.mjs` | containers `digital-wall-gateway` :8088, `digital-wall-frontend`, `digital-wall-backend` |
| 4 | **agent-service** (Node) | `/agent/api/**` (it would pass other `/agent/*` to the portal, but the tunnel no longer sends them) | `agent/server.mjs` | container `agent-service`, :8089 |

**Stitched by the Cloudflare tunnel** (`/etc/cloudflared/config.yml` on the server; the host's nginx is unused; checked
2026-10-12):
- `^/digital-wall/.*` → :8088
- `^/agent/api(/.*)?$` → :8089 (was `^/agent/.*` until `scripts/tunnel-agent-api.sh`)
- everything else → :3000 (the `/pickem` → :3010 routes were removed by `scripts/pickem-retire.sh`)

There are no Next rewrites (`next.config.mjs` has only redirects). The wall's gateway then splits `/digital-wall/**`
between the SPA and the backend (`nginx-gateway.conf:16-113`). The console embeds the agent panel as a same-origin
iframe of `/agent/panel`.

### 2.2 Does the nav link across applications?

Yes, for the Digital Wall group.
- Every Digital Wall item is `external: true` (`nav.ts:65-75`), and so is a pinned tab under `/digital-wall`
  (`Shell.tsx:581`). The shell sends them with `window.location.assign` (`Shell.tsx:308-313`).
- From the console, every way back to the portal is also a full load:
  - All services: `location.assign('/')` (`ConsoleApp.jsx:79, 651, 825`).
  - The user menu items (`:124`).
  - The sign-in links.

A hop between two applications is a document load. No per-page work removes it.

### 2.3 Within the portal: client-side navigation, one frame

Changed in portal foundations Group 3 (5b329cda). Before it, every page mounted its own shell, so the sidebar flashed,
identity and badges refetched, and the agent panel closed on every click.

- Sidebar rows are buttons calling `router.push` inside a transition, which drives a slim progress bar
  (`Shell.tsx:308-313`). `Link` is used only for the logo (`:377, 380`).
- The frame is mounted once in the root layout and survives navigation (`app/layout.tsx:61`, `Shell.tsx:718-722`). The
  sidebar, badges and agent panel stay. Its open state lives in the frame (`Shell.tsx:264`).
- The identity is cached per tab, so role-gated groups do not pop in after the first page (`Shell.tsx:64-120`).
- `loading.tsx` draws only the content (`components/portal/RouteSkeleton.tsx`).
- The extra hop through agent-service for `/agent/*` pages is gone: the tunnel sends only `/agent/api` there (checked
  2026-10-12).

What is left:
1. **No prefetch.** Nothing calls `<Link>` or `router.prefetch` on sidebar rows, so a click waits for the server.
2. **`force-dynamic`** on the developer and debug layouts and on every agent page.
3. **`AdminRoute`** still shows a spinner while it checks, now only in the content area
   (`components/AdminRoute.tsx:26-31`).

### 2.4 What the Digital Wall console does differently

- One persistent shell, and a tiny router of its own. There is no router library (`opsboard-react/package.json`: React
  only).
- `opsboard-react/src/router.js:55-83`:
  - `useRoute()` keeps the route in React state.
  - `navigate()` updates it and calls `history.pushState`.
  - A `popstate` listener handles back and forward.
  - The `/digital-wall` base is detected at runtime (`:20-23`).
- `App.jsx:9-20` always renders `ConsoleApp` for the console. `ConsoleApp` draws the sidebar and top bar **once**. Only
  the content area switches (`renderPage()`, `ConsoleApp.jsx:437-461`), inside `<div key={page}>` (:585, :961).
- So the chrome, SSE subscriptions, the agent iframe and toasts persist. Each page refetches its own data. URLs carry
  the page; Flights also keeps `?flight=`.

**In Next terms, the pattern is one shared `layout.tsx` that owns the shell, with pages that render only content.**

### 2.5 Options and their real cost

Status 2026-10-12: A is done, as one frame in the root layout (`PortalFrame`) rather than a route group. A+ is done
except prefetch. B is done (`scripts/tunnel-agent-api.sh`, run on the server). The table is kept as it was costed.

| Option | What it fixes | What it leaves | Rough size |
|---|---|---|---|
| **A. Shared shell inside the portal**: a route-group layout (`app/(portal)/layout.tsx`) renders `PortalShell` once; pages hand it their title / crumb / header actions through context | The remount, the sidebar flash, the agent panel closing, the badge refetch on every page | Cross-app hops (wall, Pickem) | **1.5–3 days** (about 35 call sites; same pattern as `app/aip/[icao]/layout.tsx`) |
| A+. With A: make `loading.tsx` content-only (0.25 d); lift identity and badges into a provider above the pages, or render the role on the server (0.5 d); `<Link prefetch>` or hover prefetch for sidebar rows (0.5 d); gate admin pages inside the shell instead of a full-screen spinner (0.25 d); keep the panel's open state in context (0.25 d); point Email tools at Pickem directly as external, or remove it (<0.1 d) | Pop-in of Admin/Agent, wait on click | — | **about 2 days** on top of A; prefetch alone does nothing without A |
| B. Narrow the tunnel rule to `^/agent/api/.*` | The extra hop on every agent page | — | **<0.5 day**, server config (the example file already says so) |
| **C. Move the console into the portal** as Next pages under the same shell (the display/kiosk SPA can stay separate) | Wall ↔ portal reloads for the console | Opening the wall itself is still a separate app | **10–20 days** (about 21k lines of JSX; console auth to middleware; SSE; replace the agent iframe with the native panel). **Plus 2–5 days** if the code moves as-is: the console is React 19, the portal React 18 / Next 14.2 |
| D. Shared shell across apps (web component, module federation, single-spa) | Identical chrome both sides | A hop still reloads the document unless both apps run in one document | 5–10 days |
| E. Leave cross-app hops as reloads but make them seamless: identical chrome on both sides, persisted sidebar state, prefetch hints | Perceived jump | The reload itself | 0.5–2 days (the console already mirrors `nav.ts` by hand) |

A is the only one that changes the experience everywhere inside the portal. C is the only one that removes the
wall/console reload.

---

## 3 — What is hardcoded to Clearway

A list, not a plan. Counts exclude `node_modules`, `dist`, `rig` and `*.md`.

### 3.1 Company details

**Name in UI text**
- "Clearway" appears in about 30 portal UI strings, about 23 in the console, about 46 in the extension, the agent's
  prompts and emails, and about 42 times in the wall guide.
- "Verxyl" (the builder) appears 142 times across UI, emails and footers.
- Most visible:
  - The page title "Clearway AIP Data Lookup Portal" (`app/layout.tsx:26`).
  - Login and auth logos with alt "Clearway Handling & Operations" (sign-in: the inline `ClearwayLogo` since 2026-10-28,
    `app/auth/ui/auth-kit.tsx:18-20`).
  - "Request access to the Clearway suite" (`app/signup/page.tsx:114`).
  - "States are set by the Clearway team" (`app/aip/service-status/page.tsx:102`).
  - "Reports go to the developer who builds Clearway…" (`components/help/HelpHome.tsx:54`).
  - Console `<title>` "Clearway Display Console" (`opsboard-react/index.html:11`).
  - "Digital Wall · Riga ops room" (`ConsoleApp.jsx:555, 853`).
  - "available to signed-in Clearway users only" (`AuthGate.jsx:240`).
  - The extension name "Clearway Ops Agent", "Ask Clearway about…" (`extension/manifest.template.json`).
  - "Clearway Ops Agent · Flight intake" (`app/intake/answer/client.tsx:110`).

**Logos and brand**
- `public/brand/clearway-logo.svg`, `clearway-mark.svg`; `public/email/clearway-*.png`; `public/PFP.png` (favicon).
- The **ring mark** is the agent's identity everywhere: orb, panel, voice, extension
  (`components/agent/ui/Orb.tsx:3-5`).
- Copies in `opsboard-react/public/assets/`, `digital-wall/guide/assets/` and `extension/public/icons/`.
- The **passenger manifest** embeds Clearway's handling-ops logo (`agent/lib/manifest/render.mjs:26,127`).
- Verxyl footers on the shell, console, emails and auth pages.

**Colours**
- The values are generic, but the portal's token source is named for Clearway (`shared/portal-tokens.json:2`).
  `shared/design-tokens.json` is the wall's.
- The Tailwind namespace is `cw-*` (about 2,000 uses in `app/`, `components/` and `lib/`).
- The wall font "CW Slashed Sans" is described as "Clearway build" (`opsboard-react/src/theme/wallFont.js:39-40`).

**Domains and hosts**
- `https://clearway.verxyl.com` as a default in `/api/unsubscribe` (`app/api/unsubscribe/route.ts:21`), the docs site
  (`content/docs/site.json`), the wall's public / webhook / mailer URLs
  (`digital-wall/server.mjs:1060`, `lib/leon-webhooks.mjs:224`, `lib/mailer.mjs:30`), and the extension build
  (`extension/src/shared/config.ts:4`).
- `https://console.clearway.aero` in intake emails (`agent/lib/intake/notify.mjs:21`).
- `handling@agent.verxyl.com`, the default intake address (`agent/lib/intake/settings.mjs:29`).
- Clearway's Supabase project host for email and auth images (`agent/lib/email/template.mjs:40`,
  `digital-wall/templates/*.html`, login and auth pages).
- A directory named after the server IP `164.92.164.35` at the repo root (untracked; excluded in `.dockerignore`).
- `cnair.efficens.es` (`agent/lib/intake/providers/cnair.mjs:17`).
- `n8n.verxyl.com`.

**Email addresses and senders**
- `ops@clearway.aero`:
  - **The main wall account** (`digital-wall/server.mjs:252`, `opsboard-react/.../SettingsPage.jsx:28`).
  - The intake empty-state text (`IntakePage.tsx:149`).
- `local@clearway.aero` (`server.mjs:541`).
- Senders: "Clearway AI Agent <agent@verxyl.com>", "Clearway Digital Wall <no-reply@clearway.verxyl.com>".
- Footers:
  - Agent emails: "Sent by the Clearway Ops Agent", "Built by Verxyl" (`agent/lib/email/template.mjs:217-270`).
  - Wall emails: "Riga, Latvia · Operational flight-data services" (`digital-wall/templates/*.html`).
- Placeholders `person@clearway.aero` and `email@clearway.aero`.

**Leon and providers**
- **`cwy-cwy`** is the default intake Leon account (`agent/lib/intake/leon-client.mjs:10`). Passengers go into
  "cwy-cwy's address book" (`leon-pax.mjs`, the intake confirm dialog).
- The marker `CWY-INTAKE <id>/<leg>` and the words "recorded by the Clearway Ops Agent" are **written into the
  customer's Leon** OPS notes (`agent/lib/intake/send.mjs:39`, `leon-people.mjs`).
- **CNAIR** is the only notification provider (`agent/lib/intake/classify.mjs:21`), with its portal window name
  `cn_clearway` (`providers/cnair.mjs:22`).
- The CrewBriefing NOTAMs come from Clearway's account with its "company policy" applied (`app/api/notams/route.ts:20`).

**Home base: Riga / EVRA**
- Default wall clocks (`digital-wall/server.mjs:195-201`, `opsboard-react/src/components/Header.jsx:12-15`).
- Station time zone and NOTAM check at 10:00 Riga (`server.mjs:206`, `digital-wall/lib/notam-check.mjs:3,45`).
- The service checker probes EVRA (`lib/service-checker.ts:48`).
- Agent prompts and examples ("Riga's runway layout", EVRA, BTI472, KLJ7350).

**The agent's identity**
- "You are the Clearway Ops Agent … inside the Clearway console" (`agent/config/system-prompt.md:1-2`).
- The intake extraction prompt: "You read handling-request emails for Clearway, an aviation ground-handling and
  operations company" (`agent/lib/intake/extract.mjs:36`).
- Knowledge tools say "Clearway's own documents".
- The extension token salt is `"clearway-extension-token-v1"`.
- Request headers `x-clearway-client` / `x-clearway-page-host`.

**Clearway's own data committed in the repo**
- `digital-wall/data/caa.json` (e.g. "FOR CWY FLIGHTS: USE ops@…").
- `digital-wall/data/important.json` and `seeds/important-seed.json`: 65 bulletin entries from Clearway's internal
  "IMPORTANT.docx", naming operators.

### 3.2 Single-tenant assumptions

**Data**
- **No table has an organisation id.** None of `org_id`, `tenant_id` or `company_id` appears anywhere, in code or SQL.
- That covers users and preferences, airports and deleted airports, service statuses, bug reports, email logs, help
  threads, every `agent_*` table, every `intake_*` table, `leon_operators` / `leon_flights` / `leon_aircraft`, devices
  and sessions.
- One Supabase project per deployment, shared by the portal, wall and agent.
- One `/storage`, `/cache` and `/intake` volume.

**Portal auth**
- Roles come from global env lists. Every admin is admin of everything.
- The developer flag is the **vendor's** super-user: help inbox, agent access and kill switch, maintenance toggle.
- Signup approvals go to one Telegram chat (`app/api/auth/email/confirm/route.ts:72-124`).
- One global maintenance row.

**AIP / NOTAM**
- One EAD account, one CrewBriefing account, one CheckWX and Skylink key.
- One global country service-status table "set by the Clearway team".

**Digital Wall**
- **One wall per deployment.** The main wall account is fixed, and all kiosks are pinned to it.
- One overlay ("only one flight is live at a time").
- Global JSON stores: display settings, clocks, devices, NOTAM digest and check, reports, important, CAA, alert rules,
  weather, webhooks.
- One NOTAM digest list and hour. One station time zone.
- `leon_operators` holds every operator's token under one encryption key.

**Agent**
- Global `agent_settings` rows: kill switch, routing, capabilities, shortcuts, extension sites, intake settings.
- One allowlist. One knowledge base, whose "company" tier is Clearway's.
- Any agent user can use every operator's Leon credentials (`agent/lib/leon-operators.mjs`).
- One email sender, one Bedrock account, one system prompt.

**Intake**
- **One Leon account writes flights and contacts** (`LEON_INTAKE_OPR_ID`, default `cwy-cwy`).
- One set of receiving addresses, notification recipients, mailbox readers and retention.
- One Resend webhook secret. One CNAIR login.
- The provider registry has one entry.

**Passenger manifest**
- One fixed layout and logo: Clearway's border-authority form.

**Help and support**
- Every user's help threads and bug reports go to the vendor's developers and Telegram.

**Extension**
- The console origin is compiled in (`CW_CONSOLE_ORIGIN`), so each customer needs their own extension build.
- One site list "set by Clearway".

**Deployment**
- One compose file, one server, `/root/clearway-2`, one n8n.

### 3.3 Internal-only pages a customer must never see

- **Pick'em leftovers** (the game itself is retired):
  - Its Supabase tables and about 40 migrations.
  - `/api/unsubscribe`, `public/wc2026-logo.png`, and old Pick'em types in `email_logs`.
- **Developer:**
  - Inbox, Saved replies, Agent access and the kill switch.
  - The Telegram mini-app `/telegram/support`.
- **Admin internals:**
  - Debug runner (incl. raw), Email logs, Service status editor, Maintenance toggle, Users.
  - Whether a customer admin should see their own users is a product decision; today it would see everyone.
- **Test and benchmark surfaces** (any signed-in user can call these):
  - The three `*-hitl-auto-test/viewer` pages.
  - `app/api/aip-test/*`, `rus-aip-test/*`, `textract-benchmark`, `aip-meta-compare`, `ead-extracted`,
    `lithuania-hitl-*`, `blocked-hitl-vnc`.
  - The `*-eaip-package-root` routes.
- **Static files served without a session**: only images, fonts, styles and scripts (`middleware.ts:69-72, 104`), e.g.
  `public/wc2026-logo.png`. `public/bug-report.html`, `country-scraper-tracker.html` and `ead-countries-web-aip.html`
  now need sign-in.
- **The dashboard changelog** for admins: Clearway-wide audit, email-log and bug-report activity
  (`app/api/dashboard/changelog/route.ts`).
- **Not to ship:**
  - Tooling: `rig/`, `opsboard-react/rig`, `opsboard-react/tools`, `scripts/agent-verify-*`, the benchmarks.
  - Archives and dumps on disk, not in git: `digital-wall/investigations.tar.gz`, `extension/clearway-ops-agent.zip`,
    `cursor-chat-export/`, `brag-output*/`.
  - The n8n service.

---

## Capture data

**Is there a demo or seed dataset today?** Partly, and not for the portal.
- **The wall and console have one.**
  - `opsboard-react/tools/fixtures.mjs` serves deterministic API fixtures with a frozen clock (2026-09-17 11:38Z),
    covering every flight-pill state.
  - `opsboard-react/tools/wall-audit.mjs` is already a re-runnable Playwright screenshot harness. It intercepts
    `/api/**`, blocks web fonts and pins the clock.
  - The fixture passengers and people are invented.
- **The agent and intake have mocks.**
  - Mock Leon, CNAIR and Resend (`rig/intake/`, `rig/manifest/`).
  - Invented passengers (`rig/intake/make-people-fixture.mjs`, `rig/manifest/fixtures.mjs`).
  - Redacted request fixtures (`rig/fixtures/intake`, `rig/fixtures/cnair`).
- **The portal (dashboard, AIP, admin, help, account) has nothing.**
  - The rig's local database is filled either by hand or with `rig/seed-from-production.mjs`, which copies **real
    production rows** after a typed confirmation phrase.
  - `digital-wall/seeds/important-seed.json` is real Clearway content, not demo data.

**What a demo dataset would take.**
- **Portal database seed** (the rig Supabase migrations already exist), in invented rows:
  - airports and AIP metadata, service statuses, users with each role
  - help threads, bug reports, email logs
  - agent conversations, knowledge documents, activity
  - intake requests with invented people
- **Wall:** extend the existing fixtures into the backend's JSON stores (important, CAA, limitations, reports, operators
  and aircraft).
- **Files:** a small set of AIP PDFs that are safe to show (public AIP pages are fine), plus one invented knowledge
  document.
- Rough size: **3–5 days** for a coherent fictional operator and a fortnight of flights across all of it.

**What would make scripted, re-runnable capture against another data source hard** (seen now):
- **The portal build bakes in the Supabase URL** (`NEXT_PUBLIC_*`). Capture against another source needs its own build
  (`rig/build-portal.sh`).
- **The rig's proxy does not serve the console SPA** (`rig/proxy.mjs:13-17`). A cross-app capture needs a gateway that
  serves all three applications, like production's tunnel.
- **The wall's Leon client always calls the real Leon** (`digital-wall/leon-sync.mjs:838-840`). There is no base-URL
  override, unlike the agent's `LEON_OPERATOR_API_BASE`. Any live wall capture shows real flights unless syncing is
  off and the stores are seeded.
- **The wall backend calls the portal for NOTAMs, AIP and PDFs** (`digital-wall/lib/portal-client.mjs`). Data-source
  swaps must cover both.
- **Live external calls:** EAD, CrewBriefing, CheckWX, flag images from `flagcdn.com`, links to official AIP sites.
- **Time-dependent views:**
  - the wall's now-line and clocks
  - "today" NOTAM checks
  - relative times on the dashboard
  - self-refreshing service status
  - 60-second badge polling
  
  The wall harness's clock pinning would need extending to the portal.
- **The nav depends on who is signed in.** Admin, Developer, Agent and Mailbox groups appear only with the right flags.
  Capture needs one account per role.
- **Personal data on screen** (the thing to keep out of every image):
  - the signed-in user's name and email in the shell badge
  - Admin → Users, Email logs
  - console presence avatars and NOTAM acknowledgement names
  - Help and Developer inbox threads
  - agent conversations, the mailbox
  - intake crew and passenger tables (names, dates of birth and document numbers masked until "Show personal data")
  - passenger manifests

  Passenger names are masked with the rest of their personal data until shown (portal foundations 1.4). A capture
  that reveals them must use invented people.
- **Earlier guide screenshots were taken on production** with real data (`docs/guide-shots/INDEX.md:3-6`), so they must
  be re-captured before the docs go public.
