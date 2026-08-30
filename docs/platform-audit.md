# Clearway Platform Audit

**Prepared for:** platform-wide redesign (new console-style shell, restructured routing, a new dashboard)
**Prepared:** 30 August 2026
**Status:** Read-only investigation. **No code, routes, config, or data were changed.**

This document describes the Clearway platform exactly as it exists today, so the redesign can be
planned without breaking anything that operations depends on. It is written for a designer who does
not know the codebase. Start with the **Glossary** if any term is unfamiliar; every internal name is
defined there and on first use.

Where something could not be fully confirmed from the code, it is marked **[needs verification]**.
No secrets, keys, or tokens are included.

---

## Glossary — the internal names you'll meet

| Name | Plain-language meaning |
|---|---|
| **Portal** (also "AIP Portal", "main portal") | The main website at `clearway.verxyl.com`. A flight-operations reference tool: search an airport, read its official aeronautical documents (AIP/GEN), see NOTAMs and weather. Built with Next.js. |
| **AIP** | *Aeronautical Information Publication* — the official regulatory document a country publishes about each airport (runways, procedures, contacts). "AD 2" is the per-airport section; "GEN" is the country-wide general section. |
| **NOTAM** | *Notice to Air Missions* — a short official bulletin about a temporary hazard or change at an airport (closed runway, broken light). Time-critical. |
| **METAR / TAF / OPMET** | Standard coded weather reports/forecasts for an airport. |
| **Digital Wall** (also "the wall", "Ops wall") | A large always-on screen in the operations room showing a live timeline of today's flights, plus limitations and a "check the NOTAMs" sign. A read-only display. |
| **Console** (also "Display Console") | The staff control panel that feeds the Digital Wall — where operators manage flights, operators/aircraft, limitations, CAA contacts, and settings. Same app as the wall, different screens. |
| **Timeline** | The main wall screen: the horizontal flight schedule. |
| **Guide** | An in-house HTML instruction manual for the wall/console, served under `/digital-wall/guide/`. |
| **Pickem / Playoffs** | A FIFA World Cup 2026 prediction game bolted onto the platform for staff and invited guests. Unrelated to aviation; its own look and feel. |
| **Leon** | An external flight-operations system (leon.aero). The source of the flight schedule shown on the wall. |
| **EAD / Eurocontrol** | The European AIP database — the primary source for airport documents. |
| **CrewBriefing** | An external service the platform scrapes for NOTAMs and some weather. |
| **CheckWX** | An external weather API the wall uses directly for METAR/TAF. |
| **Resend** | The email-sending service used for all product email. |
| **Supabase** | The hosted database + login system (Postgres + auth). Stores users, airports, bug reports, the game, etc. |
| **Sync workers** | Small background containers (`notam-sync`, `weather-sync`, `aip-sync`) that do the slow scraping so the portal stays responsive. |
| **Debug runner** | An admin tool that mass-tests document retrieval across many airports and reports failures. |
| **HITL** | *Human-in-the-loop.* For a few countries whose sites use a CAPTCHA, a person solves the CAPTCHA in a remote browser view (noVNC) so the scrape can continue. |
| **ASECNA** | The shared air-navigation agency for ~17 francophone African states; one scraper covers many countries. |
| **Gateway** | An nginx container that routes `/digital-wall/*` traffic to the right wall container and strips the prefix. |
| **cloudflared** | Cloudflare's tunnel. The public front door — it decides which container each URL goes to. |
| **n8n** | A standalone workflow-automation tool running on its own subdomain. Not wired into the platform. |
| **opsboard-react** | The folder/codebase that builds the wall **and** the console (one app, two screens). |
| **Storage / Cache roots** | Two disks on the server: `/mnt/hdd-storage` (durable — cached PDFs, NOTAMs, weather) and `/mnt/ssd-cache` (scratch). |

---

## How to read this document

- **§1 Route inventory** — every page and where it lives, with access control flagged.
- **§2 Services** — what each feature actually does, end to end.
- **§3 Cross-app dependencies** — the wiring between apps that a routing change could sever. **Read this before moving any URL.**
- **§4 Navigation today** — what's in each menu, and an honest assessment.
- **§5 Routing problems + proposed structure** — old → new.
- **§6 Dashboard feasibility** — for each thing you want to show, does the data exist?
- **§7 Design-system reality** — who uses the console look, and the blast radius of a shared shell.
- **§8 Risks & constraints** — what must not go down.
- **Open questions** — decisions for you before design starts.

---

## The big picture (one page)

Everything lives under one domain, **`clearway.verxyl.com`**, but it is **four separate applications**
in one code repository, glued together at the edge by cloudflared. They do **not** share a UI
framework or a component library — matching looks are maintained by hand-copying.

```
                        cloudflared (public front door, clearway.verxyl.com)
                                        │
        ┌───────────────┬──────────────┴──────────────┬────────────────────┐
        │               │                              │                    │
   /digital-wall/*   /pickem  /pickem/*          (everything else)     other subdomains
        │               │                              │                (n8n, novnc, blackroom)
   Wall gateway     "pickem"                       "portal"
   (nginx :8088)    container :3010                container :3000
        │                                              │
  ┌─────┴─────┐                            The Portal Next.js app:
  │           │                            • AIP/NOTAM/weather search  (main page "/")
 wall        wall                          • account, settings, status, stats
 frontend    backend                       • admin (users, maintenance, debug, etc.)
 (React SPA) (Node,                        • ALSO contains a full copy of Pickem + all of Playoffs
             server.mjs)                   • serves /files/* (cached PDFs) — the wall reads these
        │
        └── talks back to the Portal for NOTAMs, AIP lookups and PDFs
            (using one shared secret header)

   Behind the portal, three sync-worker containers do the slow scraping:
   notam-sync · weather-sync · aip-sync   (+ a shared selenium browser for CAPTCHA countries)
```

**Three facts that shape the whole redesign:**

1. **The apps are only separated by URL prefix at the edge.** The "pickem" container actually only
   serves `/pickem/*`; **all of Playoffs and every `/api/*` path fall through to the portal
   container**, which contains a complete second copy of the game. Moving a URL prefix can silently
   change which container answers.
2. **The wall depends on the portal at runtime** for NOTAMs, AIP resolution, and PDFs, authenticated
   by a single shared secret. These specific paths (`/api/notams`, `/api/aip/resolve`,
   `/api/aip/gen/pdf`, `/files/*`) are load-bearing — see §3.
3. **The "console design system" is defined three separate times** (once per app) with no shared
   package. A shared sidebar has real cost — see §7.

---

# §1 — Complete route inventory

Notes on the "Who can see it" column:

- **Public** — no login needed.
- **Signed-in** — any logged-in, approved account.
- **Admin / Developer** — an elevated role (see §2.1).
- **Temporary** — a guest account that can *only* reach Pickem/Playoffs.
- **Enforcement** tells you *where* the rule is applied. This matters: several admin pages are
  protected only by the API they call, not by the page itself, so the page renders for anyone who
  types the URL (they just see errors or empty data).

> **Access-control terms used below**
> **Middleware** = one gatekeeper file (`middleware.ts`) that runs on nearly every request and
> handles login/approval/temporary checks. It does **not** check admin role.
> **API-gated** = the page itself has no guard; only the data endpoints it calls enforce the role.
> **Client-only check** = the page hides controls in the browser if you're not admin, but still
> renders — real enforcement is the API.

## 1.1 Portal — main user pages

| Path | What it's for | Who can see it | Enforcement | Reached how | Used? |
|---|---|---|---|---|---|
| `/` | The main event: search/browse an airport, read its AIP/GEN, NOTAMs, weather; download PDFs; file a bug. | Signed-in | Middleware | Logo, sidebar "Search" | **Core** |
| `/status` | Read-only board of per-country service health (≈106 countries), refreshes every 10s. | Signed-in | Middleware | Sidebar "Service status", top-bar health pill | Yes |
| `/stats` | Your own search history/statistics. | Signed-in (own data only) | Middleware + server redirect | Sidebar "Search statistics", account menu | Yes |
| `/profile` | Account: display name, change email, change password. | Signed-in | Middleware | Account menu | Yes |
| `/settings/notifications` | Toggle web-notification preferences. | Signed-in | Middleware | Account menu | Yes |

## 1.2 Portal — auth & gate pages (public or transitional)

| Path | What it's for | Who | Enforcement | Reached how | Used? |
|---|---|---|---|---|---|
| `/login` | Sign-in card. | Public | Middleware (bounces you away if already in) | Redirect when not logged in | Yes |
| `/signup` | Request an account (name + work email). | Public | Middleware | Link from login | Yes |
| `/auth/confirm` | Set your password after clicking the email link. | Public (token) | Token in URL | Email link | Yes (orphan from nav) |
| `/auth/reset` | Password recovery. | Public (token) | Token in URL | Email link | Yes (orphan from nav) |
| `/pending-approval` | "Waiting for approval" screen; polls until an admin approves. | Signed-in, unapproved | Middleware redirect | Middleware | Yes (orphan) |
| `/access-blocked` | "You're a guest — Pickem only" screen. | Temporary users | Middleware redirect | Middleware | Yes (orphan) |
| `/maintenance` | Public "we're down for maintenance" splash. | Public | Middleware redirect | Middleware when maintenance on | Yes (orphan otherwise) |
| `/forbidden` | Generic 403 page. | Signed-in | — | Redirect from admin client-guard | Yes (orphan) |
| `/not-found` | 404 page. | Public | — | Fallback | Yes |

## 1.3 Portal — admin pages ⚠️ role **not** enforced by middleware

The single most important access-control finding: **middleware does not check admin role on any
`/admin/*` page.** Each page relies on the API it calls to return 403, or on a browser-only check.
The pages still render their layout to any signed-in user.

| Path | What it's for | Who *should* see it | Actual enforcement | Reached how | Notes |
|---|---|---|---|---|---|
| `/admin` | — | Admin | Server redirect only | Old bookmarks | Redirect → `/pickem/admin` |
| `/admin/maintenance` | Turn the maintenance banner on/off; clear the AIP PDF cache. | Developer | **Client-only** check hides controls; real gate is the API | Account menu "Admin" | Renders for anyone |
| `/admin/users` | List users; grant/revoke admin/developer/approval. | Admin | **API-gated** only (page has no guard) | Account menu "Admin users" | Renders for anyone; API returns 403 |
| `/admin/airports/deleted` | List and restore soft-deleted (hidden) airports. | Admin | **API-gated** only | **Portal sidebar — shown to every user** | Mis-placed in main nav |
| `/admin/country-service-status` | Editor for per-country service state + notes. | Admin | **API-gated** only | Links from other admin pages (not in sidebar) | Reachable by URL |
| `/admin/debug` | **Debug runner** UI: mass-test AIP/NOTAM/weather/PDF retrieval, watch progress. | Admin | **Client-only** check | **No nav link** — typed URL only | Orphaned but functional |
| `/admin/debug/raw` | Live raw log stream of a debug run. | Admin | **None in page** beyond login | Link from `/admin/debug` | Streams from admin API |
| `/admin/debug/email-logs` | Last 200 email send attempts. | Admin | **Proper** client guard (`AdminRoute`) → `/forbidden` | **No nav link** | The only admin page with a real client guard |
| `/admin/email-tools` | — | Admin | Server redirect | Old bookmarks | Redirect → `/pickem/admin?section=email-tools` |

**Take-away for the redesign:** admin pages are scattered (`/admin/*`, but also the real admin home
is `/pickem/admin` — see §1.5), inconsistently protected, and several are orphaned or mis-placed in
the main sidebar. This is a prime candidate for a single, properly-gated "Admin" section.

## 1.4 Portal — experimental / captcha viewer pages

| Path | What it's for | Who | Enforcement | Reached how |
|---|---|---|---|---|
| `/greece-hitl-auto-test/viewer` | noVNC window to solve Greece's AIP CAPTCHA during a scrape. | Signed-in | Middleware | Pop-up opened by the search page during a blocked-country sync |
| `/lithuania-hitl-auto-test/viewer` | Same, Lithuania. | Signed-in | Middleware | Same pop-up flow |
| `/netherlands-hitl-auto-test/viewer` | Same, Netherlands. | Signed-in | Middleware | Same pop-up flow |

These are not abandoned, but they are invisible except during a specific manual sync. **[needs
verification]** whether they're still exercised now that CAPTCHA countries are routed to EAD instead
(see §2.4).

## 1.5 Pickem & Playoffs pages

**Important routing reality:** the "pickem" container only serves `/pickem/*`. Everything below
that is *not* under `/pickem` — including all of Playoffs and the admin pages — is served by the
**portal** container.

| Path | Served by | What it's for | Who | Enforcement |
|---|---|---|---|---|
| `/pickem` | pickem container | Player dashboard: predict group scores, view standings. | Signed-in incl. Temporary | Middleware |
| `/pickem/admin` | pickem container | **The real unified admin console** (9 sections: overview, bracket setup, results, email tools, email logs, guide, standings, matches, locks). | Admin | Proper client guard + API |
| `/pickem/admin/legacy` | pickem container | Older tabbed admin, kept because it's the **only** home of developer "Dev Mode" bracket-simulation tools. | Developer | Server-side `requireAdmin` |
| `/playoffs` | **portal container** | Knockout bracket picks + champion pick (tabbed). | Signed-in incl. Temporary | Middleware + gate |
| `/playoffs/bracket` | **portal container** | Full bracket view. | Signed-in | Middleware + gate |
| `/playoffs/champion` | **portal container** | World-champion pick. | Signed-in | Middleware + gate |
| `/admin/playoffs/bracket-setup` | portal | Dead stub → redirects to `/pickem/admin?section=bracket-setup`. | Admin | Redirect only |
| `/admin/playoffs/results` | portal | Dead stub → redirects to `/pickem/admin?section=results`. | Admin | Redirect only |

**Flag:** `/pickem` is marked search-engine-indexable (`robots: index`) despite being login-gated —
worth fixing regardless of the redesign.

## 1.6 Digital Wall (served under `/digital-wall/*`, prefix stripped by the gateway)

The wall and console are **one React app** with two "surfaces" chosen by the URL tail. Routing is
hand-rolled (no router library).

| Path (as served) | Surface | What it's for | Who | Enforcement |
|---|---|---|---|---|
| `/digital-wall/timeline/` | Display | The read-only ops-room wall: clock bar + flight timeline + limitations + NOTAM sign. | Signed-in (shared portal session) | Gated by portal session; degrades to visible if the auth check errors, so a flaky login service can't blank the wall |
| `/digital-wall/console/flights` | Console | Show/close a flight on the wall; today's NOTAM workflow; send AIP/GEN docs. | Signed-in | Session |
| `/digital-wall/console/notam-check` | Console | Daily per-airport NOTAM check/acknowledge; drives the wall's CHECK/CHECKED sign. | Signed-in | Session |
| `/digital-wall/console/operators` | Console | Manage Leon operators feeding the wall; sync health. | Signed-in | Session |
| `/digital-wall/console/aircraft` | Console | Choose which aircraft tails appear on the wall. | Signed-in | Session |
| `/digital-wall/console/limitations` | Console | Author manual text limitations shown on the wall. | Signed-in | Session |
| `/digital-wall/console/important` | Console | Standing "IMP" bulletins; matching flights get a "!" marker. | Signed-in | Session |
| `/digital-wall/console/caa` | Console | Civil Aviation Authority contacts / permit processes. | Signed-in | Session |
| `/digital-wall/console/webhooks` | Console | Leon push-subscription health per operator. | Signed-in | Session |
| `/digital-wall/console/reports` | Console | Internal issue tracker (routed to inboxes via email). | Signed-in | Session |
| `/digital-wall/console/settings` | Console | Wall clocks, NOTAM/alert digest config, per-account display sizing, registered devices, and the **Colours** tab. | Signed-in | Session |
| `/digital-wall/guide/` | (static) | The instruction manual. | Signed-in | Session (redirects to `/login?next=…`) |
| `/digital-wall/leon/webhook/:oprId` | (backend) | Receives push events from Leon. | **Public path** | Verified by Leon's signed token (RS512 JWT), not a session — must stay public |
| `/digital-wall/aircrafts` `/operators` `/limitations` | Console | Legacy tab URLs; auto-redirect into the console equivalents. | Signed-in | Session |
| `/digital-wall/backend-test`, `/operators.html`, `/aircrafts.html` | (static) | Legacy dev/admin HTML shells. | **No auth on the page itself** | ⚠️ served above the login gate (data still gated) |

## 1.7 Other subdomains (not `clearway.verxyl.com`, but in the same stack)

| URL | What | Access |
|---|---|---|
| `n8n.verxyl.com` | Standalone workflow-automation tool. Not integrated with the platform code. | Its own login |
| `novnc.verxyl.com` | The remote-browser view used for CAPTCHA solving. | **[needs verification]** — appears unauthenticated at the tunnel |
| `blackroom.verxyl.com` | An unrelated service on the same host (port 8090). | Out of scope |

## 1.8 Routes flagged explicitly

- **Reachable only by typing the URL (orphaned from all navigation):** `/admin/debug`,
  `/admin/debug/email-logs`, `/admin/country-service-status`, `/forbidden`, `/pending-approval`,
  `/access-blocked`, `/maintenance`, `/auth/confirm`, `/auth/reset`, the three `*-hitl-auto-test`
  viewers, and the four `/admin/*` redirect stubs.
- **No access control at all (page or endpoint):** the three legacy wall HTML pages
  (`/backend-test`, `/operators.html`, `/aircrafts.html`) render above the login gate; **many
  portal `/api/*` endpoints have no auth** (see §2.9 and §8); and any `/files/*.pdf` URL bypasses the
  login check entirely (see §3).
- **Duplicate / overlapping:** the entire Pickem + Playoffs surface exists in **both** the portal
  and pickem containers; the real admin home is `/pickem/admin` while `/admin/*` are mostly redirect
  stubs; `/admin/debug/email-logs` (portal) overlaps with the "Email Logs" section inside
  `/pickem/admin`.
- **Looks abandoned:** `/api/aip-test/*`, `/api/*-eaip-package-root`, `/api/asecna/trigger-ad2` +
  `/api/asecna/job/*` (queue worker isn't deployed — see §2.5), `/api/textract-benchmark/run` (a
  410 tombstone). None are linked from any page.

---

# §2 — Services and how they work

## 2.1 Accounts, roles & login (Supabase)

- **Login** is Supabase Auth with cookie sessions. Both the portal and the wall trust the same
  session cookie, which is why signing in on the portal signs you into the console too.
- **Roles** are resolved in this order: an explicit role on the Supabase user record → an
  `ADMIN_EMAILS` list (grants *developer*) → an `is_admin`/`is_developer` flag in a
  `user_preferences` table. Three levels matter: **signed-in**, **admin**, **developer** (developer
  is the highest and can do everything admin can).
- **Approval:** new accounts are created **unapproved** and see `/pending-approval` until an admin
  approves them — approval currently happens **through a Telegram chat**, not a web screen (see 2.8).
- **Temporary users:** a guest role that can reach only Pickem/Playoffs. Also granted via Telegram.
- **Fail-open risk:** if the Supabase environment variables go missing, the wall backend treats
  everyone as a mock **admin**, and the portal middleware allows everything. A config regression
  silently unauthenticates the platform. **This should be on the redesign's risk list.**

## 2.2 AIP lookup (the core service)

**Who uses it:** everyone on the portal, and the wall's flight detail panel.
**What happens when you open an airport:**

1. The portal figures out *which source* serves that airport (`/api/aip/resolve`): USA static PDFs →
   ASECNA → Eurocontrol EAD (the default for most of the world) → a per-country scraper (~70
   countries have bespoke scrapers) → a few special cases (Russia, Rwanda).
2. If the document isn't already cached, the portal asks the **aip-sync worker** to fetch it. The
   worker runs a headless browser, downloads the PDF, optionally extracts structured data with AI,
   and saves everything to the durable disk (`/mnt/hdd-storage/aip/...`).
3. The portal serves the cached PDF/JSON on the next request instantly.

**External dependencies:** Eurocontrol EAD (primary), ~70 national AIP websites, OpenAI/OpenRouter
(for text extraction and GEN "rewrite into prose"), Anthropic (an experimental metadata comparison
tool). **If EAD is down**, most of the world's AIP lookups fail (with a single scraper fallback).

## 2.3 NOTAMs and weather

- **NOTAMs:** the portal reads a cache; on a miss it asks the **notam-sync worker**, which logs into
  **CrewBriefing** and scrapes. CrewBriefing is the only configured source (a SkyLink fallback
  exists in code but is deliberately disabled). The wall pulls NOTAMs from the portal.
- **Weather (portal):** the **weather-sync worker** scrapes OPMET/METAR/TAF, also via CrewBriefing.
- **Weather (wall):** the wall no longer uses the portal for weather — it calls **CheckWX** directly.
  So there are **two independent weather paths** on the platform.

## 2.4 The Digital Wall (timeline, console, alerts)

**Who uses it:** the ops-room dispatcher (the wall) and operators (the console).
**How the flight data flows:** a background sync (`leon-sync.mjs`) pulls the flight schedule from
**Leon** every ~2 minutes as a fallback, but the primary path is **Leon webhooks** — Leon pushes an
event, the wall re-pulls that flight and broadcasts the change to every open screen over a live
**SSE** (server-sent events) stream. The wall keeps rendering from a local cache
(`timeline-cache.json`) even if Leon is unreachable, isolating one bad operator token from the rest.

**Everything the console edits** (limitations, IMP bulletins, CAA contacts, reports, clocks, display
settings, colours) is stored in **local JSON files** on the wall backend (`digital-wall/data/*.json`),
*not* in Supabase. These survive container rebuilds only because of one disk mount (see §8).

**Alerts:** the wall scans upcoming flights' NOTAMs against keyword rules and decorates the pills;
it does not email anyone. Separately, "webhooks" here means **inbound** Leon subscriptions, not
outbound notifications.

## 2.5 Sync workers & the ASECNA queue

- The three sync workers (`notam-sync`, `weather-sync`, `aip-sync`) are **passive** — they do
  nothing on a timer; they scrape only when the portal asks. They spawn a headless browser per
  request and write results to the shared disk.
- **No health endpoints, no restart policy, no failure alerts.** If a worker crashes it stays down
  silently; a user just sees a 502 at lookup time. The only proactive check that exists,
  `scripts/check-sync-services.mjs`, is not wired to anything. (See §6 for what a real checker would
  need to hit.)
- **ASECNA queue worker is not deployed.** `POST /api/asecna/trigger-ad2` enqueues jobs into a
  Supabase table that **nothing consumes** (the worker isn't in the compose stack). The live ASECNA
  path is the synchronous one inside the AIP routes. The trigger endpoint is also unauthenticated.

## 2.6 The debug runner

**Who uses it:** admins/developers.
**What it does:** mass-tests document retrieval across up to ~10,000 airports. For each airport it
runs five steps (aip → notam → weather → pdf → gen) by **calling the portal's own API over
loopback**, which is why the shared secret in §3 exists. Failures are written to a Supabase table
(`debug_run_failures`) and a summary is posted to Telegram at the end. Run state otherwise lives in
memory and is lost on restart.

## 2.7 The scheduled NOTAM check (the one real timer)

The wall backend runs a **daily NOTAM check at 10:00 Europe/Riga** (configurable). It gathers
today's flights' airports, fetches their NOTAMs, filters to what's relevant in the next 24h, and
flips the wall's sign to **"!!! CHECK NOTAM !!!"** until an operator acknowledges every airport, at
which point it shows **CHECKED**. It emails a reminder (via Resend) every ~2 hours while anything is
unchecked. This is **operationally critical** and self-healing (a late boot still runs the missed
check).

## 2.8 Email, bug reports & Telegram

- **Email:** all product email goes through **Resend**, and every send (success or failure) is
  logged to a Supabase `email_logs` table. Signup confirmation is the exception — it uses Supabase's
  own invite email.
- **Bug reports:** filed from the portal search page, stored in Supabase, and pushed to a **Telegram**
  chat with status buttons an admin can tap.
- **Telegram is a control surface, not just notifications.** One webhook endpoint drives two bots:
  one starts debug runs; the other approves/declines new signups **and assigns roles including
  developer, and can delete accounts**. Whoever can post in that chat holds real power. Worth noting
  for anyone reasoning about "who can change what".

## 2.9 A note on API auth (feeds §8)

Many portal API endpoints have **no authentication of their own** and rely entirely on middleware —
which itself has two holes: a shared-secret header that bypasses *all* API auth, and any URL ending
in a file extension skipping the login check. Some unauthenticated endpoints spawn subprocesses,
accept caller-supplied credentials, or make billable AI calls. These are security findings, not
redesign blockers, but the redesign is the right moment to fix them. Details in §8.

---

# §3 — Cross-app dependencies (do not sever these)

These are the exact wiring points where one app calls another. **A routing change that moves or
renames any of these paths, or changes how the shared session/secret is passed, will break the
Digital Wall or the game.** Every one of these should get a redirect or be explicitly preserved.

## 3.1 The Digital Wall → the Portal

The wall backend calls the portal for anything document-related, always attaching **one shared
secret header** (`x-debug-runner-secret`) that bypasses the portal's login:

| Wall calls this portal path | For | Breaks if changed |
|---|---|---|
| `GET /api/notams?icao=…&scraper=crewbriefing` | NOTAMs for a flight's airports; the daily NOTAM check; alert scans | The 10:00 NOTAM check and all wall NOTAM markers |
| `GET /api/aip/resolve?icao=…` | Which source serves an airport + whether a PDF is cached. **This endpoint exists solely for the wall.** | The wall's AIP document panel |
| `GET /api/aip/gen/pdf?icao=…` | The country GEN 1.2 PDF | GEN document sends |
| `GET /files/<storage-key>` | Streams an already-cached PDF directly | Fast-path PDF delivery on the wall |
| Per-source PDF routes `/api/aip/{ead,scraper,usa,asecna}/pdf` | Cache-miss fallback for PDFs | PDF delivery on a cache miss |

**Two dependencies that are easy to break by accident:**

1. **The shared secret** (`x-debug-runner-secret` / `DEBUG_RUNNER_INTERNAL_SECRET`). It is the *only*
   credential the wall uses to reach the portal. If it is rotated on the portal and not the wall,
   the daily NOTAM check, all NOTAM markers, and every AIP send break at once — surfacing only as
   per-airport errors in the console. Any redesign that touches auth must keep this in sync.
2. **The `/files/*` extension bypass.** The wall relies on `/files/<key>.pdf` being reachable. Today
   that works *because* any URL with a file extension skips the login check — which is also a
   security hole (see §8). If you close the hole, you must give the wall an authenticated way to
   fetch `/files/*`, or its fast path breaks. **Fix the hole and the dependency together.**

**Note:** `/api/weather` is **no longer** a cross-app dependency — the wall moved to CheckWX. Don't
be misled by old references.

## 3.2 The Portal → the sync workers

The portal reaches the workers by internal container URLs (`NOTAM_SYNC_URL`, `WEATHER_SYNC_URL`,
`AIP_SYNC_URL`) with a `X-Sync-Secret` header. These are internal (not exposed publicly) but are
still a dependency: renaming a worker service or changing the secret breaks lookups.

## 3.3 The shared login session across portal ↔ wall ↔ pickem

All three trust the **same Supabase session cookie** on the `clearway.verxyl.com` domain. This is
why cross-app links work without a second login. **Consequence for the redesign:** as long as
everything stays on one domain and one path root, the session survives. If the redesign moves an app
to a **different subdomain**, the shared cookie (and every browser-stored preference — see §8) is
lost.

## 3.4 The pickem/portal container split

Because only `/pickem/*` goes to the pickem container and everything else (including `/playoffs` and
all `/api/*`) goes to the portal, the game already spans two containers. The account menu uses
full-page navigations (not in-app links) to cross the boundary deliberately. **Any change to the
cloudflared path rules can reroute half the game.** This is fragile and worth simplifying (see §5).

---

# §4 — Navigation and information architecture today

## 4.1 Every navigation surface, exactly

**Portal — left sidebar** (only shown on ≥ large screens; there is **no mobile nav at all**):
Search (`/`) · Service status (`/status`) · Deleted airports (`/admin/airports/deleted`) · Search
statistics (`/stats`). Plus a health pill (→ `/status`) and a logo (→ `/`).

**Portal — account dropdown** (top-right "user badge"): Profile · Notification Settings · Stats ·
Pickem · Pickem Admin *(admin only)* · **Digital Wall** group (Digital Wall, Digital Wall Console,
Guide) · Deleted airports · Admin users *(admin)* · Admin *(admin)* · Sign out.

**Console — left sidebar** (fixed 236px, headed "CONSOLE"): Flights · NOTAM Check · Operators ·
Aircraft · Limitations · Important · CAA details · Webhooks · Reports · Settings. A live sync-status
card is pinned at the bottom.

**Console — top bar:** Clearway logo + "Display Console" · a "Wall live/idle" pill · a presence
avatar stack ("N online") · a Guide link · the account dropdown.

**Console — account dropdown:** Profile · Notification Settings · Stats · **AIP Data Portal** group
(AIP Data Portal, Service status, Deleted airports, Admin users, Admin) · **Digital Wall** group ·
Pickem · Pickem Admin. **Note: no "Sign out"** — you have to go to the portal to log out.

**Wall (display):** no navigation at all — a clock bar and the timeline. Pure output.

**Pickem:** its own top bar with Dashboard / Groups / Matches / Standings tabs and a "Playoffs" link.
**No link back to the portal.** Playoffs has a "← Dashboard" link back to `/pickem`.

**`/pickem/admin`:** its own 9-section left sidebar, separate from everything above.

## 4.2 Honest assessment

- **Two different account menus** (portal vs console) list overlapping-but-not-identical
  destinations, and the console's omits Sign out. The cross-app link inventory is maintained in
  **three** places (portal account menu, console account menu, portal sidebar) that have already
  drifted.
- **The main service (AIP search) has almost no nav** — the portal sidebar has four items, one of
  which (**Deleted airports**) is an admin tool that shouldn't be there, and the deep AIP experience
  lives entirely on one page (`/`) with in-page state.
- **Admin has no coherent home.** Real admin tools are split between `/admin/*` (mostly redirect
  stubs and orphans) and `/pickem/admin` (the actual console). Several admin pages are reachable
  only by typing the URL.
- **The console has a good, complete sidebar** (10 clear items) — it's the closest thing to the
  target pattern and a useful model.
- **Pickem/Playoffs is an island** — its own look, its own nav, no way back to the portal, and split
  across two containers.
- **No mobile story anywhere** — the portal nav simply disappears on small screens; the console is
  fixed-height desktop-only.
- **Things with no home:** the Guide (only reachable via account menu / console top bar), the debug
  runner, country-service-status editor, email logs, and the stats page all lack a natural nav slot.

## 4.3 Proposed grouping (recommendation, not implementation)

A single Cloudflare-style left sidebar with expandable top-level topics. "Deep contexts" are screens
that deserve their own focused sub-nav plus a back-arrow to the main list.

| Top-level topic | Sub-items | Deep context? |
|---|---|---|
| **Dashboard** | (the new landing page — see §6) | No |
| **AIP & Documents** | Airport search · Country service status · (per-airport view = deep context with its own AIP/GEN/NOTAM/weather tabs + back-arrow) | The airport view is deep |
| **Digital Wall** | Open wall (new tab) · Flights · NOTAM Check · Operators · Aircraft · Limitations · Important · CAA details · Webhooks · Reports · Wall settings (incl. Colours) | The whole console is a deep context |
| **Weather** | (if surfaced as its own area; otherwise a tab inside the airport view) | — |
| **Reports & Issues** | Bug reports · Console reports | No |
| **Admin** | Users · Approvals · Maintenance · Email tools · Email logs · Debug runner · Country service status (editor) | Debug runner is deep |
| **Pickem** *(guests see only this)* | Play · Admin (with its existing 9 sub-sections as a deep context) | Admin is deep |
| **Account** | Profile · Notification settings · Search statistics · Guide · Sign out | No |

The account dropdown shrinks to just the identity + "Account" items; everything else moves into the
sidebar so there is one source of truth for navigation.

---

# §5 — Routing problems and a proposed structure

## 5.1 What's wrong today

1. **Top-level pages that should be nested.** `/status`, `/stats`, `/profile`, `/signup` all sit at
   the root next to the main app. There's no `/dashboard` — the root `/` is the AIP search tool,
   so there's nowhere neutral to land.
2. **Admin is scattered across two roots.** `/admin/*` (mostly redirect stubs + orphans) and the
   real console at `/pickem/admin`. A user's mental model of "admin" maps to two unrelated URLs.
3. **The pickem/portal container split is invisible and fragile.** `/pickem/*` → one container,
   `/playoffs` and `/api/*` → another, based on a single edge regex. Names don't reflect the split.
4. **Names that don't match behaviour.** `/admin/debug/email-logs` duplicates a section already
   inside `/pickem/admin`. `/digital-wall/aircrafts` (plural) redirects to console `aircraft`
   (singular). "Webhooks" in the console means *inbound Leon subscriptions*, not outbound hooks.
5. **Deep AIP contexts can't be deep-linked.** The entire airport experience is in-page state on
   `/` — you can't bookmark "EVRA's GEN tab". The wall's "Recently opened" equivalent is
   browser-only (see §6).
6. **Mixed prefixes.** Wall pages are under `/digital-wall/{timeline,console}`; game pages split
   between `/pickem` and `/playoffs`; admin between `/admin` and `/pickem/admin`.

## 5.2 Proposed URL structure (recommendation)

- Introduce **`/dashboard`** as the post-login landing page.
- Nest each service under a clear prefix. Keep the wall where it is (its prefix is a hard dependency
  — §3).
- Consolidate admin under `/admin/*` and make `/pickem/admin` an alias.
- Make the airport view deep-linkable: `/aip/<ICAO>` with sub-tabs.

### Old → New

| Today | Proposed | Redirect needed? |
|---|---|---|
| `/` (AIP search) | `/aip` (search); `/dashboard` becomes the new landing | Yes — `/` → `/dashboard` |
| *(in-page airport state)* | `/aip/<ICAO>` (+ `/aip/<ICAO>/gen`, `/notam`, `/weather`) | New capability |
| `/status` | `/aip/service-status` (or `/status` kept as alias) | Keep alias |
| `/stats` | `/account/search-stats` | Redirect |
| `/profile` | `/account/profile` | Redirect |
| `/settings/notifications` | `/account/notifications` | Redirect |
| `/admin` (stub) | `/admin` (real overview) | Already redirects |
| `/admin/airports/deleted` | `/admin/airports/deleted` (remove from main sidebar) | No (nav change only) |
| `/admin/country-service-status` | `/admin/service-status` | Redirect |
| `/admin/debug` | `/admin/debug` (give it a nav home) | No |
| `/admin/debug/email-logs` | `/admin/email/logs` (merge with pickem console's section) | Redirect |
| `/admin/email-tools` (stub) | `/admin/email` | Already redirects |
| `/pickem/admin` | `/admin/pickem` **or** keep as the canonical + alias from `/admin/pickem` | Alias both ways |
| `/admin/playoffs/*` (stubs) | fold into `/admin/pickem` | Already redirect |
| `/playoffs`, `/playoffs/*` | `/pickem/playoffs`, `/pickem/playoffs/*` **only if** the container routing is unified first | ⚠️ see below |
| `/digital-wall/*` | **unchanged** | Must not move (§3) |

### Redirects specifically required to avoid breakage

- **Bookmarks:** `/` → `/dashboard`; `/stats`, `/profile`, `/settings/notifications` → their new
  `/account/*` homes; `/admin/country-service-status` → `/admin/service-status`.
- **Cross-app (§3) — must be preserved verbatim, not redirected:** `/api/notams`,
  `/api/aip/resolve`, `/api/aip/gen/pdf`, `/api/aip/{ead,scraper,usa,asecna}/pdf`, `/files/*`, and
  the whole `/digital-wall/*` tree. If any of these *must* move, add a permanent server-side redirect
  **and** update the wall backend in the same change.
- **The `/playoffs` → `/pickem/playoffs` move is not safe on its own** — today `/playoffs` is served
  by the *portal* container and `/pickem/*` by the *pickem* container. Moving the URL without first
  unifying the containers (recommended: serve the whole game from one container and drop the split)
  would change which process answers. **Decide the container question before renaming.**

---

# §6 — What a dashboard could show (feasibility)

Verdicts: ✅ data exists and is queryable · 🟡 partial / needs work · 🔴 not available today.

## 6.1 Recently used services (e.g. "EVRA — AIP Portal")

**🟡 Partial.** Two kinds of history exist, both incomplete:

- The portal logs **every search** to Supabase (`search_events`, stamped with user + query + time) —
  this **is** queryable per user and already powers `/stats`.
- But the portal's **"Recently opened" airports** list is **browser-only** (`localStorage`,
  `portal-recents`) — there is **no server copy**, so it can't feed a server-rendered dashboard and
  is lost if the user changes browser or the app moves to a new domain.

**To build "recently used" properly:** either surface it from `search_events` (server-side, already
there) or start persisting "airport opened" events server-side. The raw material for the search-based
version exists today.

## 6.2 Service status

**✅ / 🟡.** A per-country service-status system already exists (`country_service_statuses` in
Supabase, shown on `/status`), but it is **manually curated by admins** — it reflects someone's
judgement, not live probes. Per-service **up/down** is **not** tracked automatically today (see 6.4).

## 6.3 Changelog of edits and errors (audit trail)

**🟡 Partial — six sources already carry "who + when", many actions carry nothing.**

Already stamped with an actor and timestamp (usable immediately):

| Event | Where | Actor recorded |
|---|---|---|
| Airport hidden / restored | Supabase `deleted_airports` | Yes (`deleted_by`, reason, timestamps) |
| Search performed | Supabase `search_events` | Yes (user id) |
| Bug filed / status changed | Supabase `bug_reports` | Yes (`user_email`, `status_updated_by`) |
| Maintenance banner toggled | Supabase `maintenance` | Yes (`updated_by`) |
| IMP bulletin added/confirmed | wall `important.json` | Yes (`addedBy`/`confirmedBy`) |
| Console report created/edited/emailed | wall `reports.json` | Yes (`createdBy`/`updatedBy`) |
| Leon webhook received / fired | Supabase `leon_webhook_events` + wall `webhook-log.json` | Partial (system, not human) |
| Email sent | Supabase `email_logs` | Recipient + status |
| Debug-run failures | Supabase `debug_run_failures` | Run id only (no human) |

**Leaves no trace at all** (would need new columns/logging before they can appear in a changelog):
airport edits/imports (the `airports` table has **no** per-change history or `updated_by`), EAD
web-AIP link changes, user preference/role changes (role escalations are untracked), **wall colour
changes**, display/clock/device edits, country-service-status `updated_by` (the column exists but the
code doesn't fill it), and storage-file deletions.

**Verdict:** a changelog is buildable *today* from the six actor-stamped sources; make it genuinely
useful by adding `updated_by`/`created_by` to `airports`, `user_preferences`, and
`ead_web_aip_links`, and by filling the `country_service_statuses.updated_by` that already exists.

## 6.4 Automated availability checks

**🔴 None today.** There are **no health endpoints** on the portal or any sync worker; only the
pickem container has one (and it currently reports its container *unhealthy* even though the endpoint
answers — see §8). A periodic checker would need to *prove each service works*, not just that the
container is up. Recommended checks and cadence:

| Service | What to hit to prove it works | Suggested cadence |
|---|---|---|
| Portal | `/api/pickem/health` (exists) or a new `/api/health` | 1 min |
| AIP lookup | `/api/aip/resolve?icao=EVRA` returns a source | 5 min |
| NOTAM path | `/api/notams?icao=EVRA` (cached read) | 10 min |
| Weather (portal) | `/api/weather?icao=EVRA` | 10 min |
| aip-sync / notam-sync / weather-sync | Add a `/health` to each worker (none exists) | 1–2 min |
| Wall backend | Add a `/api/health`; today an unknown path returns empty 200, so a real one is needed | 1 min |
| Leon feed | wall `/api/timeline/sync-status` (exists) | 2 min |
| CheckWX / CrewBriefing / EAD (external) | A cached-freshness check (age of newest cached file) | 15–30 min |

The script `scripts/check-sync-services.mjs` already probes all three workers for one ICAO and exits
non-zero on failure — it's a ready-made building block that just needs a scheduler and a place to
record results.

## 6.5 Server metrics (CPU, temperature, RAM, disk, containers)

**✅ Available — I verified this directly on the host.** This is a self-hosted Linux server (not a
restricted cloud sandbox), so real metrics are obtainable:

| Metric | Available? | Source | Verified reading |
|---|---|---|---|
| Container states | ✅ | `docker ps` | 15 containers up; **pickem shows "unhealthy"** |
| Per-container CPU / RAM | ✅ | `docker stats` | e.g. portal 99 MB, wall backend 45 MB |
| Host CPU load | ✅ | `/proc/loadavg`, `uptime` | load ~0.3, 24 cores |
| **CPU temperature** | ✅ | `/sys/class/hwmon` (`k10temp`) | ~41 °C (also NVMe ~40 °C, GPU ~36 °C) |
| RAM | ✅ | `free` | 14 GB total, ~11 GB available |
| Disk | ✅ | `df` | **root 85% full**; ssd-cache 1%; hdd-storage <1% |

**What it would take:** a tiny collector (a shell/Node script reading `docker stats`, `/proc`,
`/sys/class/hwmon`, `df`) exposed behind an admin-only endpoint, polled by the dashboard. No host
sensors are missing. **Two live issues the dashboard would immediately surface:** the pickem
container is flagged unhealthy (its in-container health probe fails even though the endpoint returns
200 from the host — a false alarm sitting for days), and the **root disk is 85% full** while the
dedicated cache/storage disks are nearly empty.

---

# §7 — Design-system reality check

## 7.1 What "the console design system" is, and who uses it

The target look — **light theme, white cards, Public Sans (UI) + IBM Plex Mono (data/numbers), blue
`#2563eb`** — originated in the **console**. Here's who actually uses it:

| Surface | On the console look? | Notes |
|---|---|---|
| Console (`opsboard-react`) | ✅ Fully | The origin. |
| Guide | ✅ Fully | Plus a working dark mode (the only surface with one). |
| Portal — **8 of ~33 pages** | ✅ Partial | Only pages using the `PortalShell` component: search, status, profile, stats, notifications, deleted airports, country-service-status, users. |
| Portal — the other ~25 pages | 🔴 No | All auth pages, most admin pages, all error pages. |
| Portal login/signup | 🟡 Adjacent | Deliberately **dark** navy backdrop, but same fonts + accent. |
| Wall (the display) | 🔴 No — **intentionally dark** | Its own colour system; must stay dark. Do not fold into the light shell. |
| Legacy wall HTML (`aircrafts.html`, `operators.html`) | 🔴 No | A completely different **dark, Inter, sky-blue** system (`admin-common.css`). Loudest inconsistency; likely legacy. |
| Pickem / Playoffs | 🔴 No — **deliberately separate** | A light sports-bracket brand (navy/amber/orange, heavy fonts). Shares only the font. **Should stay outside the shell.** |

## 7.2 Where tokens/fonts live — and the duplication problem

**The console look is defined three separate times, in three technologies, with no shared source:**

1. **Console** — a JavaScript token object (`opsboard-react/src/components/console/ui.jsx`) applied
   as inline styles. **This is the de-facto source of truth.** Fonts loaded from Google Fonts at
   runtime.
2. **Portal** — the same values **hand-copied** into Tailwind (partly as CSS variables, partly as
   hard-coded hex like `bg-[#2563eb]`). Fonts self-hosted via Next. The portal also carries a second,
   largely-unused token layer (shadcn HSL variables + a dead dark-mode block) that can't yet be
   deleted because a few unconverted pages still use it.
3. **Guide** — the same values **again**, as CSS custom properties in one HTML file.

`#2563eb` alone is written literally in ~15 files across the apps. There is **no shared component
package** — the three apps have separate builds and nothing imports across them. Keeping them in
sync is manual and has already drifted (e.g. the console top bar is 64px, the portal's is 60px).

**A trap for the redesign:** there's a **stale duplicate wall app** under `digital-wall/src/` (with
its *own* tailwind config and a *different* dark palette) that is no longer used — the live wall is
`opsboard-react/`. Anyone grepping for wall colours will hit the dead copy first and get wrong
answers.

## 7.3 Blast radius of a shared sidebar

The files that define page chrome today — what a common sidebar must slot into:

| App | Layout file(s) | Reach |
|---|---|---|
| Portal | `components/portal/Shell.tsx` (+ `app/layout.tsx` for fonts) | Only the **8** pages that opt in |
| Console | `opsboard-react/src/ConsoleApp.jsx` (one file: top bar + 236px nav + content) | The whole console |
| Wall display | `opsboard-react/src/DisplayApp.jsx` | Deliberately **no** sidebar |
| Guide | `digital-wall/guide/index.html` (one generated file) | Guide only |
| Legacy HTML | `digital-wall/admin-common.css` | Two legacy pages |

**Practical obstacles, in order of pain:**

1. **No shared package, and incompatible styling tech** — portal is Tailwind classes, console is
   inline-style objects. One React component can't serve both cleanly; the only common denominator
   is inline styles, or you create a shared package with new build wiring for both Next and Vite.
2. **Portal shell is opt-in per page** — a sidebar added to `Shell.tsx` reaches only 8 of 33 pages;
   the other 25 need converting.
3. **Nav data is duplicated in three places** (portal sidebar, portal account menu, console account
   menu) that have already diverged — a shared sidebar wants **one** registry.
4. **Two routing models** — Next `<Link>` vs the console's hand-rolled history API. A shared sidebar
   needs a navigation adapter injected.
5. **No mobile handling** anywhere to inherit.
6. **The Guide and legacy HTML pages can't host a React sidebar** without being rewritten.

**Recommendation:** treat the console's `ui.jsx` token set as the canonical design system, extract
it into a genuinely shared source (even a small published token file both builds import), and convert
the portal's remaining 25 pages onto the shell before—or as part of—introducing the sidebar. Keep
the wall display and Pickem/Playoffs explicitly outside it.

---

# §8 — Risks and constraints

## 8.1 Operationally critical — must not go down

- **The ops-room wall** (`/digital-wall/timeline/`) and its live Leon feed. It already degrades
  gracefully (renders from cache if Leon or auth is flaky), and that resilience must be preserved.
- **The daily 10:00 Riga NOTAM check.** It's the platform's one real safety timer; it drives the
  wall's CHECK/CHECKED sign and emails reminders.
- **AIP lookup** (portal search + the wall's document panel), which depends on EAD and the sync
  workers.
- The **cross-app paths in §3** — moving any of them breaks the wall.

## 8.2 Stateful things a rebuild could lose

- **Wall JSON stores** (`digital-wall/data/*.json`) — IMP bulletins, CAA contacts, console reports,
  webhook logs, display/colour settings. These have **no Supabase copy** and survive rebuilds **only**
  because of one bind mount (`./digital-wall/data:/app/data`). `docker compose down` is fine;
  deleting or moving that host directory loses them permanently. **Back this directory up before any
  restructure.**
- **localStorage-only features** (lost if an app moves to a **different domain**; path changes are
  safe): the portal's "Recently opened" airports, the wall **device identity** (`dw-device-id`, which
  keys server-side display profiles), a country-scraper tracker grid and bug-triage remarks in two
  standalone HTML tools, and the colour-picker's recent swatches.
- **Cached artefacts safe to lose** (regenerable): everything under `/mnt/hdd-storage` (NOTAMs,
  weather, PDFs), `downloads/`, `usa-aip/`, `aips/`. **One folder is NOT regenerable:** `edited/` —
  hand-edited source PDFs. Treat it as source, not cache.
- **Debug-run state** is in memory — a portal restart loses in-flight runs (only failures persist).

## 8.3 Known fragilities worth not reintroducing

- **Auth fails open on misconfiguration.** Missing Supabase env → the wall backend treats everyone
  as admin and the portal lets everything through. Any auth rework must fail *closed*.
- **One shared secret** (`x-debug-runner-secret`) is effectively an API master key: it bypasses
  *all* portal API auth (including "start a debug run"), and it's the wall's only credential. Rotating
  it in one place and not the other breaks the wall silently.
- **The `/files/*.pdf` login bypass** (any URL with a file extension skips the login check) is both a
  security hole *and* the mechanism the wall relies on to fetch cached PDFs — fix them together.
- **Many portal API endpoints have no auth of their own** — including some that spawn subprocesses,
  accept caller-supplied credentials, or make billable AI calls; and `GET /api/bug-reports` returns
  every user's reports (with emails) to any signed-in user.
- **No monitoring or restart policy** on the sync workers or the wall backend — a crash is silent and
  permanent until someone notices a 502.
- **Hard-coded AIRAC-dated URLs** in the CAPTCHA/HITL scrapers (e.g. `02_16Apr2026`,
  `2026APR20`) will silently break at the next aeronautical-data cycle rollover.
- **Container split fragility** — the pickem/portal split is one edge regex away from misrouting; the
  pickem container is currently flagged unhealthy by a false-alarm health probe.
- **Case-sensitive tenant keys** in the wall's `webhooks.json` orphan a Leon operator's
  registration state if the operator id's case ever changes.

---

# Open questions for you to decide before design starts

1. **Container topology.** Keep the pickem/portal container split, or serve the whole platform from
   one container? This gates whether `/playoffs` can be safely renamed and simplifies the routing
   plan. **Recommendation: unify, then rename.**
2. **Domain strategy.** Will every app stay under the single `clearway.verxyl.com` origin? Moving any
   app to its own subdomain breaks the shared login session **and** every browser-stored preference
   listed in §8.2. **Recommendation: stay single-origin.**
3. **Design-system ownership.** Are you willing to fund a genuinely shared token source (and
   converting the portal's remaining ~25 pages), or should the redesign accept maintaining the look
   in parallel copies for now?
4. **Scope of the shell.** Confirm the wall *display* and Pickem/Playoffs stay outside the shared
   sidebar (recommended). Should the Guide and the legacy `aircrafts.html`/`operators.html` pages be
   retired or brought into the shell?
5. **Dashboard "recently used".** Base it on the existing server-side search log, or invest in
   recording "airport opened" events server-side for a truer history?
6. **Audit trail depth.** How far do you want the changelog to go? A basic version ships from six
   existing sources today; a complete one needs new `updated_by` columns on airports, preferences,
   and AIP links (a schema change).
7. **Health & metrics.** Do you want the dashboard to include live server metrics (CPU/temp/RAM/disk/
   containers)? It's feasible here and would immediately surface the two live issues (unhealthy
   pickem probe, 85%-full root disk) — but it needs a small collector behind an admin gate.
8. **Security fixes as part of the redesign.** The auth-fails-open behaviour, the shared-secret master
   key, the `/files/*` bypass, and the unauthenticated API endpoints are all touched by any routing/
   auth rework. Fix them in the redesign, or track them separately?

---

*End of audit. This document is descriptive and read-only; no recommendation here has been
implemented.*
