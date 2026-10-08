# Portal inventory, navigation, and what is Clearway-specific

Read from the code at commit `467c12a` (2026-10-08), plus a read-only look at the production server on 2026-10-09
(running containers, the Cloudflare tunnel's ingress). Nothing was changed. File references are `path:line`. Where the
code and `docs-inventory-draft.md` disagree, the code is what is described here; §1.5 lists the differences.

---

## What surprised me

1. **The portal is four applications behind one hostname, joined by a Cloudflare tunnel — not by nginx.** The host's
   nginx serves only its default page. `/etc/cloudflared/config.yml` on the server routes by path: `^/digital-wall/.*`
   → the wall gateway (:8088), `^/agent/.*` → agent-service (:8089), `/pickem` and `/pickem/.*` → the Pickem container
   (:3010), everything else → the Next portal (:3000). The repo only has an example of this file
   (`deploy/digital-wall/cloudflared-config.example.yml`), and it has no `/pickem` rule.
2. **Every Ops Agent page takes two hops.** The tunnel's `^/agent/.*` rule was meant for `/agent/api`, but it also
   catches the portal's own `/agent/history`, `/agent/intake`, … pages. agent-service passes anything that is not an
   API call back to the portal (`agent/server.mjs:225-245`, `passToPortal`). It works, at the cost of an extra hop on
   every page load and every client navigation inside the agent.
3. **Inside the Next portal, navigation is client-side — but it looks like a reload because every page mounts its own
   copy of the shell.** The root layout renders no shell (`app/layout.tsx:46-52`). Sixteen pages wrap themselves in
   `<PortalShell>`, so the sidebar unmounts and remounts on every click. The root `app/loading.tsx` replaces the whole
   shell with a skeleton during the transition. The remounted shell then refetches identity, so the Admin and Ops Agent
   groups appear late on every page. `components/portal/Shell.tsx:160-163` says so itself: "The shell still mounts
   per-page."
4. **Pickem is not gone.** The draft says it is off the nav, its containers stopped and archived. In fact the
   `clearway-2-pickem-1` container is running, the tunnel routes `/pickem` to it, and the nav still has a Pickem topic
   (`components/portal/nav.ts:131-140`). Two portal entries also lead into it:
   - **Admin → Email tools** redirects to `/pickem/admin?section=email-tools`, the World Cup email console
     (`app/admin/email-tools/page.tsx:2`).
   - **`/admin`** redirects to `/pickem/admin` (`app/admin/page.tsx:11`).
5. **There is no "clearway" role.** Roles come from `ADMIN_EMAILS` / `DEVELOPER_EMAILS` and user metadata or preferences
   (`lib/admin-auth.ts:41-69`). Nothing grants anything to `@clearway.aero`.
6. **Access control is thinner than the nav suggests.**
   - Most Admin pages have no page-level gate. They only fail when their API call fails, so a non-admin who types the
     URL gets the shell with an error box, not `/forbidden`.
   - The Digital Wall console has no role checks at all. Any signed-in person can delete an operator, approve a kiosk,
     or edit the big screen (`digital-wall/server.mjs:240-249`).
   - The dashboard changelog shows every signed-in user data drawn from all users' activity: agent audit rows, email
     logs and bug reports (`app/api/dashboard/changelog/route.ts:10`, "admin NOT required").
7. **Maintenance mode locks out sign-in.** The maintenance redirect runs before the login page is considered
   (`middleware.ts:148-171`). A developer who is not already signed in cannot reach `/login` to turn maintenance off.
8. **Several nav entries mislead.**
   - **Reports & Issues → Bug reports** is shown to every user but goes to the admin-only **debug runner**
     (`nav.ts:98`). Regular users see "Admin access required."
   - **Admin → Deleted airports** is not an admin tool. It lists the airports *you* hid from your own search; every
     user's hides are separate.
   - In the console, **Sign out** does not sign out. It navigates to `/login`, which sends a signed-in user straight
     back to the dashboard (`opsboard-react/src/ConsoleApp.jsx:216`, `middleware.ts:196-203`).
9. **No tenant column exists anywhere.** None of the ~45 tables has an organisation id.
10. **There is no demo dataset for the portal**, and the existing guide screenshots were taken against production
    (`docs/guide-shots/INDEX.md:3-6`).

---

## 1 — The complete page inventory

### 1.0 How access works (read once; the tables refer to it)

- **Signed in**: `middleware.ts` requires a Supabase session for every page except `/login`, `/signup`, `/auth/*`,
  `/maintenance`, `/intake/answer`, `/telegram/support` (`middleware.ts:89-214`). An account with
  `is_approved === false` goes to `/pending-approval` (:216-226). A **temporary** user (metadata `temporary`) can only
  reach Pickem/Playoffs and the auth pages (:7-35, :228-236).
- **admin**: `requireAdmin()` lets in admin **or developer** (`lib/admin-auth.ts:109-125`). Admin comes from
  `ADMIN_EMAILS`, metadata or `user_preferences.is_admin`.
- **developer**: a flag, not a tier (`DEVELOPER_EMAILS`, metadata, `user_preferences.is_developer`). An admin does not
  see Developer items. `app/developer/layout.tsx:12-21` gates on the server and sends others to `/forbidden`.
- **agent**: the Ops Agent topic appears only for people on the agent allowlist (`agent_access`) while the global
  kill switch is on (`agent/lib/access.mjs:19-43`; nav `agentOnly`). Every agent API call checks it again.
- **mailbox**: admins, developers and the emails in the intake setting "Agent mailbox access"
  (`agent/lib/intake/api.mjs:33`).
- **"guest"** is never assigned by the sidebar (`Shell.tsx:65,69`), so the Pickem topic (`roles: admin, guest`) shows
  only to admins and developers.
- **Digital Wall console**: any valid portal session; no role checks (`digital-wall/lib/auth.mjs:113-216`). The wall
  display also accepts an approved **device token** (kiosk).

**Status** below: *live* · *URL only* (works, nothing in the nav links to it) · *redirect* · *dead* (code that never
runs).

### 1.1 Next portal (`app/`, served at `/` by the portal container)

| Route | Section · nav label | Role | Status | Notes |
|---|---|---|---|---|
| `/` | — | signed in | redirect | → `/dashboard`, or `/aip?icao=` (`app/page.tsx:15-16`) |
| `/dashboard` | Dashboard | signed in | live | Server health card admin-only |
| `/aip` | AIP & Documents · Airport search | signed in | live | |
| `/aip/[ICAO]` (+ legacy `/gen` `/notam` `/weather`) | from search, recents | signed in | live | Legacy tabs redirect |
| `/aip/service-status` | AIP & Documents · Service status | signed in | live | Read-only |
| `/status` | — | signed in | redirect | → `/aip/service-status` |
| `/admin` | — | signed in | redirect | → `/pickem/admin` (Pickem console) |
| `/admin/users` | Admin · Users | page ungated; API admin | live | Non-admin: shell + error |
| `/admin/agent-sites` | Admin · Agent sites | page ungated; API admin | live | |
| `/admin/maintenance` | Admin · Maintenance | page ungated; GET admin, toggle developer | live | |
| `/admin/email-tools` | Admin · Email tools | admin (target) | redirect | → Pickem email console |
| `/admin/email/logs` | Admin · Email logs | admin (client `AdminRoute`) | live | Hides the whole shell while checking |
| `/admin/debug` | Admin · Debug runner; Developer · Debug runner; **Reports & Issues · Bug reports** | admin (client check) | live | "Bug reports" label is wrong; users are refused |
| `/admin/debug/raw` | — (link from debug run) | page ungated; stream admin | URL only | Empty without `?run=` |
| `/admin/service-status` | Admin · Service status editor | page ungated; API admin | live | |
| `/admin/airports/deleted` | Admin · Deleted airports | **any signed-in user** | live | Per-user hidden airports, not an admin tool |
| `/admin/playoffs/bracket-setup`, `/results` | — | — | redirect | → Pickem console sections |
| `/admin/country-service-status`, `/admin/debug/email-logs` | — | — | dead | `next.config.mjs:6-10` redirects first; the page files never run |
| `/developer/inbox` | Developer · Inbox | developer | live | |
| `/developer/saved-replies` | Developer · Saved replies | developer | live | |
| `/developer/agent-access` | Developer · Agent access | developer | live | |
| `/developer/knowledge` | — | developer | redirect | → `/agent/knowledge` |
| `/account/profile` | Account · Profile | signed in | live | |
| `/account/notifications` | Account · Notification settings | signed in | live | |
| `/account/search-stats` | Account · Search statistics | signed in | live | Read-only |
| `/account/guide` | Account · Guide | signed in | live | Iframe of `/digital-wall/guide/` |
| `/profile`, `/settings/notifications`, `/stats` | — | — | dead | Config redirects to `/account/*`; page files never run |
| `/help` | sidebar "Help & support" (not a nav topic), `?` key | signed in | live | |
| `/help/new` | from `/help`, ⌘? / Ctrl+? | signed in | live | |
| `/help/[ref]` | from `/help` history | owner or developer | live | |
| `/pickem` | Pickem · Play | signed in (incl. temporary) | live | Pickem container in production |
| `/pickem/admin` | Pickem · Admin | admin | live | 9 sections by `?section=` |
| `/pickem/admin/legacy` | — | admin | URL only | Only home of Dev Mode |
| `/playoffs`, `/playoffs/bracket` | Pickem app nav; email link | `PlayoffsGate` | live | |
| `/playoffs/champion` | — | `PlayoffsGate` | URL only | Duplicates a `/playoffs` tab |
| `/login`, `/signup`, `/auth/confirm`, `/auth/reset` | — | public | live | |
| `/maintenance`, `/pending-approval`, `/access-blocked`, `/forbidden` | — | middleware targets | live | |
| `/telegram/support` | — (Telegram mini-app URL) | public page; API checks Telegram ids | live | Developer support inbox inside Telegram |
| `/intake/answer` | — (email link) | public; single-use token | live | One-tap answer page (E1) |
| `/greece-hitl-auto-test/viewer`, `/lithuania-…/viewer`, `/netherlands-…/viewer` | — (popup from AirportView) | signed in | live, test-named | Their "Back to … test" links 404 (no parent page) |
| `app/debug_run_1.md` | — | — | stray file | Not a page |

### 1.2 Ops Agent (`/agent/*` — Next pages reached through agent-service)

| Route | Nav label | Role | Status | Notes |
|---|---|---|---|---|
| `/agent` | Ops Agent · Chat | agent | live | Full-page chat |
| `/agent/t/[id]` | — (Chat stays highlighted) | agent | URL only | A thread's permalink: History rows, Activity, "Expand" |
| `/agent/history` | Ops Agent · History | agent | live | |
| `/agent/knowledge` | Ops Agent · Knowledge base (badge) | agent; upload/approve **developer** | live | |
| `/agent/intake` | Ops Agent · Flight intake (badge) | agent | live | No further role check: any agent user can send to Leon |
| `/agent/mailbox` | Ops Agent · Mailbox (badge, lock) | agent + mailbox | live | |
| `/agent/activity` | Ops Agent · Activity log | agent (users see their own rows) | live | |
| `/agent/settings` | Ops Agent · Settings | agent; organisation sections admin/developer | live | |
| `/agent/panel` | — | agent | URL only | The side panel as an iframe page for the wall console (`opsboard-react/src/hooks/useAgentDock.jsx:120`) |
| `/agent/doc` | — | (viewer needs agent) | URL only | Standalone document viewer for the console panel and the Chrome extension; a non-agent user sees "Opening the document…" forever |

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
| `/digital-wall/console/operators` | Operators | any session | live | |
| `/digital-wall/console/aircraft` | Aircraft | any session | live | |
| `/digital-wall/console/limitations` | Limitations | any session | live | |
| `/digital-wall/console/important` | Important | any session | live | |
| `/digital-wall/console/caa` | CAA details | any session | live | |
| `/digital-wall/console/webhooks` | Webhooks | any session | live | |
| `/digital-wall/console/reports` | Reports (also portal "Console reports") | any session | live | |
| `/digital-wall/console/settings` | Settings | any session | live | 5 sections, not linkable by URL |
| `/digital-wall/console/<anything else>` | — | — | — | Silently shows Flights; never 404s |
| `/digital-wall/(operators\|aircrafts\|limitations)` | — | — | redirect | Old URLs → console pages |
| `/digital-wall/leon/webhook/*` | — | Leon (signed JWT) | live | Webhook receiver, not a page |
| other `/digital-wall/<path>` | — | — | **dead, still served** | The backend's catch-all serves an old copied site (`digital-wall/server.mjs:51-63, 2363-2420`), injecting fake admin tokens into localStorage and `wall-menu.js`, whose only link (`/timeline`) is dead. The copied site's directory is not in git |

The console has **no** Users, Airports or Devices page. Devices live inside Settings. `digital-wall/src/`,
`digital-wall/index.html` and `digital-wall/dist/` are an old prototype that nothing builds or serves.

### 1.4 Actions, page by page

Written at manual level. "Admin" includes developers. Every page in the portal shell also has: open or close the agent
panel (⌘J, agent users), Help & support (`?`), report a bug about this page (⌘?), collapse the sidebar, sign out.

#### Dashboard — `/dashboard`
- Re-check all services.
- Retry a card: Recents, Service status, Changelog, Server health.
- Filter the changelog: All / Edits / Errors.
- Open a recently used item.
- Server health is view-only and admin-only.

#### AIP & Documents
**Airport search — `/aip`**
- Search by ICAO, name or country; stop a search.
- Browse region → country → (US) state → pick airports → open them.
- Hide an airport from your own search, and close a result tab.
- Open a result or a recent airport.
- Admins only: go to "Restore deleted airports", and delete a fixed bug report from the banner.

**Airport page — `/aip/[ICAO]`**
- Download the AD 2 PDF, and re-sync it from the source (not the USA).
- Download the GEN PDF.
- Open the official Web AIP (after a consent dialog).
- Refresh NOTAMs; refresh weather.
- Start a captcha verification for a blocked country. This opens the HITL viewer popup.
- Report a problem for this airport.
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

"Mine" is shown but does nothing (`HistoryPage.tsx:29`).

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
    - Show personal data for 60 s (audited).
    - Add a crew member or passenger, or remove a hand-added one.
    - Correct a passenger's surname/given-name split (✎).
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
- Everyone: default model tier; skip confirmation for low-risk actions.
- Admins and developers:
  - **Routing**: model per tier, escalation rules, lock "skip confirmation" for everyone.
  - **Capabilities**: web search, voice, write actions, send email, auto-approve reference uploads, high-knowledge
    model.
  - **Keyboard shortcuts**, organisation-wide.
  - Who can do what (read-only), Usage (read-only), Sites summary.
  - **Flight intake**: receiving addresses, intake recipients, mailbox readers, mail retention.

Non-admin agent users see an empty "Who can do what" and an empty Usage card (`SettingsPage.tsx:49-50,147`).

**One-tap answer — `/intake/answer`** (public, from email)
- Yes, process it / No, skip it.
- Yes, cancel in Leon / No, keep the flights.

#### Digital Wall
**The wall — `/digital-wall/timeline/`**
- Click a flight to open its info. Mark sections checked, or Check all.
  - On a kiosk device token the check fails: tokens are read-only (`digital-wall/server.mjs:551-576`).
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
- User menu: Profile, Notification settings, Search statistics, Guide, Sign out — which does not sign out.
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
- Approve a pending account.
- Make admin / remove admin.
- Make developer / remove developer (developers only).

There is no invite, remove, password-reset or filter action.

**Agent sites — `/admin/agent-sites`**
- Approve or decline an extension site request.
- Add a site (optionally with its subdomains).
- Revoke a site.

**Maintenance — `/admin/maintenance`**
- Turn maintenance on or off with a message and ETA (developers).
- Clear all cached AIP PDFs (admin).

**Email logs — `/admin/email/logs`**
- Refresh. View only.

**Debug runner — `/admin/debug`**
- Start a run: quantity, concurrency, airports, EAD-only, country, steps.
- Stop a run. Re-run failures. Re-run from saved failures.
- Open the raw stream. Download the raw JSON.

**Service status editor — `/admin/service-status`**
- Set a country's status and note.

**Deleted airports — `/admin/airports/deleted`**
- Restore one or several of your own hidden airports.

**Email tools**
- These are the Pickem console's tools; see Pickem.

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
- **Notification settings**: browser notifications, on/off overall and per event.
- **Search statistics**: view only.
- **Guide**: the wall guide, full screen.

#### Pickem (still live — see the summary)
- **`/pickem`**: predict scores, submit or resubmit picks, confirmation email, standings, view others' picks.
- **`/playoffs`**: bracket picks, world champion pick; admins get Admin tools (open playoffs, deadline).
- **`/pickem/admin`**, nine sections:
  - Bracket setup (set matches, load from groups, confirm R32 and email).
  - Results (live / publish).
  - **Email tools** (send test, to admins, to all; custom broadcast) and Email logs.
  - Guide.
  - Group standings, group matches.
  - Pick locks (per-user unlocks, early playoff access).
- **`/pickem/admin/legacy`**: the same actions as tabs, plus **Dev Mode** (simulate the group stage, fill R32, clear).

#### Sign-in and system pages
- **Login**: sign in, forgot password, create account.
- **Signup**: request access (name, work email), resend.
- **`/auth/confirm`**: set a password.
- **`/auth/reset`**: set a new password.
- **Maintenance**: try again.
- **Pending approval**: sign out; it moves on automatically once approved.
- **Access blocked**: open Pickem, sign out.
- **Forbidden** and **404**: go home.

### 1.5 Flags

**Reachable by URL but not linked from the nav**
- `/agent/t/[id]`, `/agent/panel`, `/agent/doc` — by design (permalinks, iframe pages).
- `/pickem/admin/legacy` (the only home of Dev Mode).
- `/playoffs/champion`.
- `/playoffs/bracket` (email link only).
- `/admin/debug/raw`.
- `/telegram/support`, `/intake/answer` — by design.
- `/digital-wall/timeline/?debug=viewport`.
- Redirect stubs nothing links to: `/status`, `/admin`, `/admin/playoffs/*`, `/developer/knowledge`.

**Nobody can reach at all (dead code)**
- Page files shadowed by `next.config.mjs` redirects:
  - `app/profile/page.tsx`, `app/settings/notifications/page.tsx`, `app/stats/page.tsx`
  - `app/admin/country-service-status/page.tsx`, `app/admin/debug/email-logs/page.tsx`
- `digital-wall/src/`, `digital-wall/index.html`, `digital-wall/dist/`, `digital-wall/current.html.save`.
- `components/clearway-clone/*`, which holds real staff names and emails.
- `components/hitl-country-auto-test-page.tsx`.
- In the agent: `ConfirmationModal` (`thread/Confirmation.tsx:235`, never used) and the History "Mine" chip.
- In Pickem: the in-app "playoffs" view (`components/pickem/pickem-app.tsx:1802`).
- The wall backend's catch-all serving an old copied site (§1.3). Unreachable from any nav, but it still answers.

**In the nav and misleading, erroring or 404-ing**
- **Reports & Issues → Bug reports** (all users) goes to the admin-only debug runner. Users get "Admin access required".
  Admins get a debug runner, not bug triage.
- **Admin → Email tools** leaves the portal for the World Cup Pickem email console.
- **Admin → Deleted airports** is per-user, not an admin tool.
- **Console → Sign out** does not sign out.
- **"Open in Flights"** on an agent flight card adds `?flight=`, which the console ignores. It lands on an unselected
  Flights page.
- **HITL viewer "Back to … test"** links 404 (no parent page).
- **Open … in Leon** (intake duplicate box) is always disabled: "Leon link not configured".
- Nothing in the nav points at a page that does not exist.

### 1.6 Against `docs-inventory-draft.md`

**What the draft got wrong**

| Draft | The code |
|---|---|
| Pickem: off the nav, containers stopped, archived | The Pickem topic is still in the nav (admins and developers). The container runs. The tunnel routes `/pickem`. Admin → Email tools and `/admin` lead into it |
| Users: "the new automatic **clearway** role for `@clearway.aero`" | No such role or rule exists |
| Users: inviting and removing a user | There is no invite or remove. Sign-up is self-service and an admin **approves** it. Actions are approve, make/remove admin, make/remove developer |
| Admin: "Email tools" as portal email tools | They are the Pickem World Cup email tools |
| Reports & Issues | Its "Bug reports" item is the debug runner. Real bug reports arrive through Help & support and the developer inbox |
| Help Center → Saved replies "moved from Developer" | Help & support exists (`/help`, `/help/new`, `/help/[ref]`, the ⌘? bug report). Saved replies are still under Developer |
| Digital Wall → "Airports ?" | There is no airports page in the console |
| Console reports "stays here" | It does, but it is also linked from the portal's Reports & Issues |
| Aircraft → "Aircraft type and ICAO mapping ✓" | There is no type editing in the console. The only ICAO type mapping is the intake's aircraft-name table (`agent/lib/intake/notification.mjs:35`) |
| Wall → "The voice readout ✓" | It exists, but it is read-only: it shows a console's agent voice session to the room. The wall does not speak |
| AIP → "Charts ?" | There is no charts view |
| OPS Agent → History "Pinning a chat" | Does not exist (listed as →, i.e. not built) |
| Developer → "This section may not need to exist" | It holds four items: Inbox, Saved replies, Agent access (incl. the global agent kill switch), Debug runner |
| Agent settings → "Agent access (moved from Developer)", "Agent sites (moved from Admin)" | Not moved. Agent access is at `/developer/agent-access`; Agent sites at `/admin/agent-sites` (Settings shows only a summary) |
| Settings section (Customisation, Appearance) | No portal Settings page exists |
| Dashboard → choosing and rearranging blocks | Not built. The dashboard has four fixed cards |

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
  - Service status editor; Deleted airports; Debug runner (still under Admin as well as Developer).
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
- **Account**
  - Notification settings and Search statistics are still live.
- **System pages**
  - Signup with admin approval, password reset, pending approval, access blocked, maintenance, forbidden.
- **Telegram mini-app**
  - The developer inbox inside Telegram (`/telegram/support`).
- **Chrome extension**
  - Its own surface (side panel, site list, insert, voice), separate from the portal.
- **Answers to the draft's questions**
  1. Help Center today: report urgent / bug / suggestion / question / chat, thread history, the ⌘? bug report. The
     developer works it from the Developer inbox and Telegram.
  2. Developer still holds four things.
  3. The console has no airports, users or device-management pages; devices are in Settings.
  4. External APIs: the agent service's API is used by the Chrome extension. The wall receives Leon webhooks
     (`/digital-wall/leon/webhook/*`). Kiosks use the device-token API. No public API is offered to customers.

---

## 2 — Why does clicking the nav reload the page?

### 2.1 The applications

| # | Application | Serves | Code | Process |
|---|---|---|---|---|
| 1 | **Portal** (Next 14, React 18) | `/`, `/dashboard`, `/aip/**`, `/admin/**`, `/account/**`, `/help/**`, `/developer/**`, `/playoffs/**`, `/api/**`, `/files/**`, and the `/agent/*` *pages* | `app/`, `components/` | container `clearway-2-portal-1`, :3000 |
| 2 | **Pickem** (the same Next build, second container) | `/pickem`, `/pickem/**` | same repo | container `clearway-2-pickem-1`, :3010 |
| 3 | **Digital Wall**: gateway (nginx) → frontend (`opsboard-react`, Vite SPA, React 19) and backend (Node) | `/digital-wall/**` | `deploy/digital-wall/nginx-gateway.conf`, `opsboard-react/`, `digital-wall/server.mjs` | containers `digital-wall-gateway` :8088, `digital-wall-frontend`, `digital-wall-backend` |
| 4 | **agent-service** (Node) | `/agent/api/**`; passes other `/agent/*` to the portal | `agent/server.mjs` | container `agent-service`, :8089 |

**Stitched by the Cloudflare tunnel** (`/etc/cloudflared/config.yml` on the server; the host's nginx is unused):
- `^/digital-wall/.*` → :8088
- `^/agent/.*` → :8089
- `/pickem`, `/pickem/.*` → :3010
- everything else → :3000

There are no Next rewrites (`next.config.mjs` has only redirects). The wall's gateway then splits `/digital-wall/**`
between the SPA and the backend (`nginx-gateway.conf:16-118`). The console embeds the agent panel as a same-origin
iframe of `/agent/panel`.

### 2.2 Does the nav link across applications?

Yes, for the Digital Wall and Pickem groups.
- Every Digital Wall item, Reports & Issues → Console reports, and both Pickem items are `external: true`
  (`nav.ts:60-70, 99, 137-138`). The shell sends them with `window.location.assign` (`Shell.tsx:286-290`).
- From the console, every way back to the portal is also a full load:
  - All services: `location.assign('/')` (`ConsoleApp.jsx:79, 621, 793`).
  - The user menu items (`:124`).
  - The sign-in links.
- Admin → Email tools looks internal (a client push) but redirects into the Pickem container. That is a different
  application, so it ends in a full load.

A hop between two applications is a document load. No per-page work removes it.

### 2.3 Within the portal: client-side navigation that looks like a reload

The sidebar does use client-side navigation. Rows are buttons calling `router.push` (`Shell.tsx:286-290`). `Link` is
imported but unused (`:13`).

What makes it look and feel like a reload:

1. **No shared layout: each page mounts its own shell.**
   - `app/layout.tsx:46-52` renders only `<Providers>`.
   - Sixteen pages (and about nineteen components) render `<PortalShell>` themselves, e.g. `app/dashboard/page.tsx:13`,
     `app/aip/page.tsx:673`, `app/admin/users/page.tsx:101`.
   - On every route change the whole sidebar and header unmount and mount again (`Shell.tsx:160-163`).
   - The only exception is `/aip/[ICAO]` → `/aip/[ICAO]`, which shares `app/aip/[icao]/layout.tsx:40-54`.
2. **The loading skeleton replaces the shell.**
   - `app/loading.tsx` (and `app/aip/loading.tsx`, `app/dashboard/loading.tsx`) sit above the page.
   - While a navigation is pending, the sidebar is swapped for an empty sidebar-shaped spacer
     (`components/portal/RouteSkeleton.tsx:26-32`).
   - That is the visible flash.
3. **Identity and badges refetch on every mount.**
   - `useIdentity` (`Shell.tsx:43-87`) starts each page as role `user` without the agent, then fetches four endpoints.
     So **Admin and Ops Agent pop in late on every page**, and the name changes from email to display name.
   - Help threads, knowledge-base stats and intake/mailbox counts refetch too (`:189-267`).
4. **The agent panel closes on every navigation.** Its open state lives in the remounted shell
   (`components/agent/panel/AgentPanel.tsx:29-30`).
5. **No prefetch.**
   - Nothing calls `<Link>` or `router.prefetch`, so every click waits for the server round trip behind the skeleton.
   - `force-dynamic` on the developer layout, all agent pages and help.
   - `/agent/*` page requests take the extra hop through agent-service.
6. **`AdminRoute`** renders a full-screen spinner without the shell while it checks (`components/AdminRoute.tsx:26-31`).
   So on `/admin/email/logs` the sidebar disappears entirely.

### 2.4 What the Digital Wall console does differently

- One persistent shell, and a tiny router of its own. There is no router library (`opsboard-react/package.json`: React
  only).
- `opsboard-react/src/router.js:55-83`:
  - `useRoute()` keeps the route in React state.
  - `navigate()` updates it and calls `history.pushState`.
  - A `popstate` listener handles back and forward.
  - The `/digital-wall` base is detected at runtime (`:20-23`).
- `App.jsx:9-20` always renders `ConsoleApp` for the console. `ConsoleApp` draws the sidebar and top bar **once**. Only
  the content area switches (`renderPage()`, `ConsoleApp.jsx:408-432`), inside `<div key={page}>`.
- So the chrome, SSE subscriptions, the agent iframe and toasts persist. Each page refetches its own data. URLs carry
  only the page, never a selection or filter.

**In Next terms, the pattern is one shared `layout.tsx` that owns the shell, with pages that render only content.**

### 2.5 Options and their real cost

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
  - The page title "Clearway AIP Data Lookup Portal" (`app/layout.tsx:23`).
  - Login and auth logos with alt "Clearway Handling & Operations" (`app/login/page.tsx:25-26`,
    `app/auth/ui/auth-kit.tsx:18-19`).
  - "Request access to the Clearway suite" (`app/signup/page.tsx:114`).
  - "States are set by the Clearway team" (`app/aip/service-status/page.tsx:98`).
  - "Sends to the Clearway team" (`components/bug-report-modal.tsx:44`).
  - "Reports go to the developer who builds Clearway…" (`components/help/HelpHome.tsx:59`).
  - Console `<title>` "Clearway Display Console" (`opsboard-react/index.html:11`).
  - "Digital Wall · Riga ops room" (`ConsoleApp.jsx:525, 821`).
  - "available to signed-in Clearway users only" (`AuthGate.jsx:231`).
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
- The values are generic, but the token source is named for Clearway (`shared/design-tokens.json:2`).
- The Tailwind namespace is `cw-*` (about 290 uses).
- The wall font "CW Slashed Sans" is described as "Clearway build" (`opsboard-react/src/theme/wallFont.js:39-40`).

**Domains and hosts**
- `https://clearway.verxyl.com` as a default in Pickem pages and emails, the wall's public / webhook / mailer URLs
  (`digital-wall/server.mjs:1060`, `lib/leon-webhooks.mjs:224`, `lib/mailer.mjs:30`), and the extension build
  (`extension/src/shared/config.ts:4`).
- `https://console.clearway.aero` in intake emails (`agent/lib/intake/notify.mjs:21`).
- `handling@agent.verxyl.com`, the default intake address (`agent/lib/intake/settings.mjs:29`).
- Clearway's Supabase project host for email and auth images (`agent/lib/email/template.mjs:40`,
  `digital-wall/templates/*.html`, login and auth pages).
- The server IP `164.92.164.35` (`digital-wall/server.mjs:52, 2419`; a directory of that name at the repo root).
- `cnair.efficens.es` (`agent/lib/intake/providers/cnair.mjs:17`).
- `n8n.verxyl.com`.

**Email addresses and senders**
- `ops@clearway.aero`:
  - **The main wall account** (`digital-wall/server.mjs:250`, `opsboard-react/.../SettingsPage.jsx:28`).
  - The intake empty-state text (`IntakePage.tsx:148`).
- `local@clearway.aero` (`server.mjs:539`).
- Senders: "Clearway AI Agent <agent@verxyl.com>", "Clearway Digital Wall <no-reply@clearway.verxyl.com>", "Clearway
  Pickem".
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
- Default wall clocks (`digital-wall/server.mjs:193-199`, `opsboard-react/src/components/Header.jsx:12-15`).
- Station time zone and NOTAM check at 10:00 Riga (`server.mjs:206`, `digital-wall/lib/notam-check.mjs:3,45`).
- The service checker probes EVRA (`lib/service-checker.ts:48`).
- Agent prompts and examples ("Riga's runway layout", EVRA, BTI472, KLJ7350).
- Pickem shows times in Riga.

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
- `components/clearway-clone/mockData.ts`: real staff names, emails and Riga office addresses (dead code).
- `extension/clearway-ops-agent.zip`.

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
- Signup approvals go to one Telegram chat (`app/api/auth/email/confirm/route.ts:72-95`).
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

- **Pickem and Playoffs, entirely:**
  - Pages, the Pickem nav topic, `/admin` → Pickem, Admin → Email tools.
  - The Pickem APIs and email templates, about 40 migrations, the demo users seed.
  - The public `public/wc2026-*` files.
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
- **Static files served without a session** (middleware treats any path with an extension as an asset,
  `middleware.ts:68-69,103`):
  - `public/bug-report.html`, `public/country-scraper-tracker.html`, `public/ead-countries-web-aip.html`,
    `public/wc2026-*`.
- **The dashboard changelog**: all users see Clearway-wide audit, email-log and bug-report activity
  (`app/api/dashboard/changelog/route.ts`).
- **The wall backend's old copied site**, which injects fake admin tokens (§1.3).
- **Not to ship:**
  - Tooling: `rig/`, `opsboard-react/rig`, `opsboard-react/tools`, `scripts/agent-verify-*`, the benchmarks.
  - Archives and dumps: `digital-wall/investigations.tar.gz`, `extension/clearway-ops-agent.zip`,
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
- **The rig's proxy does not serve the console SPA** (`rig/proxy.mjs:11-15`). A cross-app capture needs a gateway that
  serves all four applications, like production's tunnel.
- **The wall's Leon client always calls the real Leon** (`digital-wall/leon-sync.mjs:909-911`). There is no base-URL
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
  - intake crew and passenger tables (names readable; documents and dates masked until "Show personal data")
  - passenger manifests

  **Passenger names are visible on the intake review screen even before "Show personal data".** Only dates of birth and
  document numbers are masked. Any capture of an intake request must use invented people.
- **Earlier guide screenshots were taken on production** with real data (`docs/guide-shots/INDEX.md:3-6`), so they must
  be re-captured before the docs go public.
