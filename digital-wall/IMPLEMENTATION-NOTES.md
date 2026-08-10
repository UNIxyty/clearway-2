# Digital Wall — Feature Rollout Implementation Notes

> Branch: `digital-wall-features` (one commit per phase A–F, plus three follow-up corrections).
> Companion context: `digital-screen-investigation.md`, `aip-notam-investigation.md`.

## Console fixes: live updates, NOTAM notification-only, NOTAM page, logos (2026-07-05)

Four commits, one per item.

**1. Live roster updates.** Operator activate/deactivate/upsert and aircraft
visibility writes broadcast `roster.changed`; the wall refetches with the
cheap cache read and lanes appear/disappear in ~1–2 s (60 s poll stays as the
idempotent fallback). Operators/Aircraft console pages live-reconcile too.

**2. NOTAM notification-only, one daily run.** The 10:00 Europe/Riga check
now emails ONLY a notification ("NOTAMs need to be checked for today's
flights") with a link to the NOTAM Check page — `templates/notam-notify.html`
(simple by design; styled version can replace it); recipient
`NOTAM_DIGEST_TO`, link base `DIGITAL_WALL_PUBLIC_URL` (default
`https://clearway.verxyl.com/digital-wall`). **No NOTAM content in any email**
(verified by capturing the sent payload). Continuous scanning is gone: the
NTM/WX flight markers come from ONE 24 h-look-ahead scan triggered by the
daily check (portal cache still warm) or `POST /api/alerts/scan`.
**Decision: weather was folded into this same daily run** (not left on its
own cadence). Per-finding record emails were removed entirely — this also
stops the old full-record WEATHER emails (flagged, not silent). Retired:
`ALERT_SCAN_INTERVAL_MS`, `ALERT_EMAIL_TO`, rules `windowsDays` (stripped
from stored files on read), `templates/alert-email.html`.

**3. NOTAM Check page.** Moved from the Flights detail area to
`/digital-wall/console/notam-check` with its own left-nav entry carrying the
live check-state indicator (red `!` while the sign is raised, green ✓ when
all airports are acked). Endpoints/SSE unchanged; functional build on the
current UI kit, ready for the Claude Design re-skin.

**4. Logos.** Top bar renders `public/assets/clearway-logo.svg`; a subtle
centered "Built by VERXYL" footer renders `verxyl-logo.svg` below the page
content (never overlapping). Both fall back to text until the SVGs are
dropped into `opsboard-react/public/assets/`; footer links when `VERXYL_URL`
is set in `ConsoleApp.jsx`.

## Wall timeline: Leon-driven pills + ops-room legibility (2026-07-05)

Two commits (A, B). Leon API investigated first (public
`bitbucket.org/leondevteam/api-documentation`); the full field → meaning →
normalized-field map lives in **`digital-wall/LEON-PILL-MAPPING.md`**.

**A — pill semantics from real Leon data.** `leon-sync.mjs` now builds its
`flightList` selection from **schema introspection** per operator (an
unknown field can never break the sync; introspection failure falls back to
the legacy selection) and normalizes: block-off/take-off/landing/block-on,
`isAirborne`/`hasArrived`, `ctot`, `tripStatus` (Leon `FlightStatus`:
CONFIRMED/OPTION/OPPORTUNITY) → `isConfirmed`, `checklistColor` (aggregated
from the flight's checklist items via the OPS `getAvailableDefinitions`
colors — least-complete item wins), and a derived `movementState`. Pills:
**white** scheduled · **yellow** delayed-not-departed · **purple** active
CTOT · **blue** flying · **pink** arrived; delay renders as a **dashed
leading segment** sized to the delay (scheduled ETD label at its start,
actual/estimated departure where solid begins); the flight ID takes the Leon
checklist color (luminance-guarded on the dark board) and is *italic* when
the trip isn't CONFIRMED. ⚠ **CTOT+delayed renders purple (CTOT wins)** —
confirm with ops; one-line swap in `movementStateOf()` flips it.

**B — legibility at 3–5 m.** Everything on the display scales with a global
**display scale** setting (`GET/PUT /api/display/settings`, default 1.3,
range 1.0–2.0, `data/display-settings.json`, live via `config.changed`;
slider on the Console Settings page). Typography roughly ×1.3–1.7 vs before
at default (clock bar 42px+ mono, timing labels 11px+ semibold and brighter,
ICAO 12px+, sidebar 21px titles / 17px text), contrast raised across ticks/
labels/sidebar, and a larger scale shows fewer hours per viewport so wider
pills keep fitting their bigger labels. Anti-overlap thresholds derive from
the actual label metrics; audit at scale 1.3 over a board with every state:
0 collisions across 132 labels.

## Digital Wall fixes — 5 items (2026-07-04)

One commit per item. NOTAMs stay CrewBriefing-only; AIP/GEN stays on the
portal resolve → shared `/storage` cache path.

**1. Full OPS NOTAM filter + daily check.** `lib/notam-rules.mjs` holds the
complete OPS keyword set (incl. the intentional `RESTRICITON` misspelling) as
editable colored groups `{group, color, terms[], patterns[]}` — closure/red,
restriction/orange, availability/green, runway-infra/blue, info/neutral —
with bounded wildcard regexes covering all three real runway forms
(`RWY06R/24L CLSD`, `RWY 06L/24R SHALL BE TEMPORARILY CLSD`, `RWY 11/29
CLSD`, same for `AVBL`). Matched substrings highlight in group colors
wherever NOTAM text renders (console panel + wall overlay, shared
`NotamText` component). Validity: `B)`/`C)` parse as `YYMMDDHHmm` UTC with
`PERM` = never expires; the daily check filters to now→+24 h (PERM included)
and the 7/3/1 scanner never flags expired NOTAMs. **Daily job** at
`NOTAM_CHECK_HOUR` (10) `NOTAM_CHECK_TZ` (Europe/Riga), self-healing after
downtime (`lib/notam-check.mjs`): today's flights → deduplicated airports →
one CrewBriefing fetch per ICAO → wall sign `!!! CHECK NOTAM !!!` (pulsing,
display renders SSE state only) → digest email to `NOTAM_DIGEST_TO` (default
ops@clearway.aero) grouped by airport with number/class/parsed+raw validity/
full E) text/matched keywords. Console: per-airport **CHECKED** acks (who +
when, toggleable), collapsible full NOTAM list per airport, run-now; all
airports checked → sign flips to `NOTAM CHECKED`; state resets at the next
daily run. Endpoints: `GET /api/notam-check/today`, `POST
/api/notam-check/ack {icao}`, `POST /api/notam-check/run`; SSE
`notam-check.changed`; per-day state in `data/notam-check.json`. Legacy flat
rule files migrate automatically to the grouped schema.

**2. Wall sidebar.** Lists ONLY the manual text limitations from the
Limitations page (NTM/WX/IMP removed). Remade for distance reading: 300px
panel, type-color bar, 19px titles, 15px full description always visible (no
truncation or click-to-expand), scrolling panel, compact two-column legend.
Sidebar and pill badges are non-interactive (view-only wall).

**3. Flight pills.** Pixel-aware layout: narrow pills (<110px) swap the
absolute timing labels for one combined `ETD–ETA` label; delay-boundary
labels position by real times and drop instead of colliding (≥34px from
endpoints, ≥40px between the two boundary labels); ADEP/ADES render
both→dep-only→none by measured width so codes never touch; inside badges
move out below 90px. Verified by an automated bounding-box overlap audit
(0 overlaps) over back-to-back 45-min pills and dep+arr-delayed narrow pills.

**4. AIP/GEN send, wall strictly view-only.** All interactive controls
removed from the display (overlay AIP buttons, sidebar/pill clicks, the
board's Now button — the view auto-centers). Console Flights detail panel:
pick dep/arr + AIP/GEN/Both → `POST /api/aip/send` → documents fetched
through the portal's normal shared-cache routes (AIP: resolve → cached
`/files/<key>` → per-source route on genuine miss; GEN 1.2: the portal's
country-level GEN-by-ICAO route) → **emailed to the signed-in user's session
email** with the PDFs attached (`lib/aip-send.mjs`; Resend attachments added
to `lib/mailer.mjs`). Progress is real backend state broadcast per job over
SSE `aip-send.progress` (fetching w/ per-doc status → ready → emailing →
sent/error; `GET /api/aip/send/:jobId` for polling); per-doc failures show
"unavailable: <reason>" while the rest still send.

**5. IMP presentation.** Wall pills show IMP as a single amber `!` icon —
no count, no text. Full details are read in the console: the Flights detail
panel lists each matched entry's title, verbatim body, and criteria chips
with the actually-matching criteria checked. NTM/WX pill markers
intentionally remain small type badges (flagged, not silently changed).

**New env vars:** `NOTAM_DIGEST_TO` (default ops@clearway.aero),
`NOTAM_CHECK_HOUR` (10), `NOTAM_CHECK_TZ` (Europe/Riga). AIP send reuses
`RESEND_API_KEY` / `PORTAL_BASE_URL` / `PORTAL_INTERNAL_SECRET`.

**How to test:**
```bash
# daily NOTAM check: trigger manually, then ack airports and watch the sign
curl -X POST localhost:5174/api/notam-check/run
curl -X POST localhost:5174/api/notam-check/ack -H 'content-type: application/json' -d '{"icao":"EVRA"}'
curl localhost:5174/api/notam-check/today   # sign flips to CHECKED when all acked
# (wall renders the sign top-right; console panel = Flights → Today's NOTAM check)

# AIP+GEN email for a flight (progress streams over /api/stream)
curl -X POST localhost:5174/api/aip/send -H 'content-type: application/json' \
  -d '{"flightNid":"<nid>","airports":["dep","arr"],"docs":["aip","gen"]}'
curl localhost:5174/api/aip/send/<jobId>

# pill layout: put a short (45-min) delayed flight on the board and check
# the combined ETD–ETA label + non-colliding boundary labels
```

## Console redesign from the approved Claude Design (2026-07-04)

The Display Console was rebuilt to match the finalized Claude Design project
("Display Console.dc.html" + "Console Shell & Style Tile", delivered as a
design handoff bundle). The wall display is untouched; no backend contract
changed — every control wires to the existing `timelineApi.js` actions and SSE
events.

**Design screens imported → pages rebuilt (all six were present in the file;
nothing extrapolated):** Flights, Operators, Aircraft, Limitations, Important,
Settings, plus the shared shell (top bar + left nav).

**UI kit** (`src/components/console/ui.jsx`, full rewrite): design tokens
(light surfaces, Public Sans / IBM Plex Mono via Google Fonts with system
fallbacks, blue `#2563eb` primary, the design's status/limitation chip
palettes), and components: Button (primary/secondary/ghost/soft/danger
variants), Toggle, StatusPill, TypeChip, ImpMark, MonoChip, ChipInput (with
async suggestions), SearchBox, Dropdown, Segmented, Card, PageHeader,
InfoBanner, HelpBanner, TableShell (sortable headers), Loading/Empty/Error
states, PendingNote (TODO seams), dark-toast ToastProvider, Avatar/presence
colors. `icons.jsx` inlines the needed lucide v0.454 vector data (the icon set
the design uses) — zero new dependencies.

**Shell** (`ConsoleApp.jsx`): clearway top bar with live wall pill
(overlay state + SSE), presence avatar stack, account chip; left nav with
Important needs-review badge and the sync-status card (live "ago" ticks).

**Per-page notes / adaptations:**
- **Flights**: wall banner with opened-by/ago, Show/Close on wall, Today/All
  segment, operator+airport dropdowns, sortable table, detail panel (timings
  grid, delay chip, IMP verbatim section, AIP/GEN send controls).
  *Seams for in-flight fixes:* NOTAM-check panel derives today's dedup'd
  airports from real flights and shows keyword-coloured flagged records from
  the live alert scanner; per-airport CHECKED is session-local and "show all
  NOTAMs" + wall-sign mirroring are marked pending their backend. The AIP/GEN
  send UI (dep/arr · AIP/GEN/Both · progress affordance) is fully built but
  the Send button is disabled with a pending note until the email backend
  merges.
- **Operators**: sync-health card with 6 stat tiles + force sync; add-operator
  form with write-only token field (eye toggle); status pills + error strips.
- **Aircraft**: design's TYPE column replaced with "UPCOMING (7 DAYS)" — the
  schedule endpoint has no aircraft-type data; Show all / Hide all run the
  one-row visibility endpoint sequentially.
- **Limitations**: manual text limitations only (NTM/IMP stay off this page,
  per the fixes prompt); live dark wall-sidebar preview; matched-flight pills.
- **Important**: list + editor split with reviewed/needs-review + active/
  expired chips, criteria chip editors, direction + valid-window, Mark
  reviewed; needs-review filter; verbatim body.
- **Settings**: clocks with native drag-reorder, home star, live dark clock-
  bar preview; alert filter with friendly keyword-group editor (NOTAM/weather
  keywords + regex groups mapped onto the existing rules schema) and raw-JSON
  mode; scan-windows tile from real rules; daily-check-time tile marked
  pending (NOTAM-check backend).

Verified by driving the dev stack (backend :5174 + vite :5175) with Playwright
screenshots of all pages — real data for Important (65 entries), Settings
(rules + clocks), Operators, and stubbed API responses to exercise the flights
table states, detail panel, IMP section and NOTAM panel. `npm run build`
clean.

## Follow-up corrections (2026-07-03)

1. **NOTAMs come from CrewBriefing only.** The wall proxy sends `scraper=crewbriefing` on every `/api/notams` call, and the portal service env now pins `NOTAM_SCRAPER=crewbriefing` (compose) so the portal's cache-miss local-spawn path can't drift back to the SkyLink route default. If `CREWBRIEFING_USERNAME` / `CREWBRIEFING_PASSWORD` are unset (note: **USERNAME**, not the `CREWBRIEFING_USER` the AWS doc lists), the portal returns **503 "NOTAM source unavailable"** — no silent source fallback. CrewBriefing's upstream "CLEARWAY company policy" + military exclusions are the intended filter. It's Playwright-based and slow, so the wall keeps its per-ICAO TTL cache and the scanner keeps one lookup per ICAO per scan.
2. **AIP PDFs resolve like the AIP page and share one cache.** New portal route `GET /api/aip/resolve?icao=` exposes the page's exact source selection (ASECNA → national scraper → USA → EAD, via the portal's own libs) plus a **no-sync** cached-copy check over the shared `/storage` keyspaces. The wall's `/api/aip-pdf` now: cached → streams straight from `/files/<key>` (a copy fetched earlier by any user, page or overlay); miss → the portal's normal per-source PDF route, which downloads and writes the same shared cache. The old HEAD-probe precedence guessing is gone (it risked triggering live EAD syncs, which datacenter IPs can't do — IB-101). Failures surface as "AIP unavailable: <reason>".
3. **IMPORTANT.docx entries imported.** `seeds/important-seed.json` (65 pre-classified entries) loads via `scripts/import-important-seed.mjs` → `data/important.json` (committed): 63 active, 13 flagged needs-review, 2 dated May-2026 entries inactive, bodies verbatim. Matching was fixed to make them fire: **ISO-code countries resolve from the flight's ICAO prefix** (`lib/icao-country.mjs`) because the airport directory stores `"France (LF)"`-style names and lacks most non-EAD airports (EGLL, UACC…); operator matching is equality-or-containment ("Panaviatic" ↔ "Panaviatic AS"); direction `overfly` is accepted but matches no flights (no route data) while staying visible on the page. **Decisions:** seasonal windows stay absolute (IMP-001 LFTZ Jul 1–Oct 15 needs an annual bump — no year-agnostic recurrence); date-only `validTo` is widened to end-of-day; IMP-038 (KZ weekend permits) stays active-but-needs-review per the seed. Spot-checks verified: FR entries flag a UUEE→LFPG flight, the GB entry flags EGLL, LFTZ flags only inside its window (incl. the last day), Panaviatic/T7-LASER/EYVI-arr-only all behave, and UACC resolves to KZ despite being absent from the directory. Caveat worth a review pass: entries mixing airport + country criteria (e.g. IMP-053: `[EGLF]` + `[IT, CH]`) require **both** groups to match under the AND-across-groups semantics — split them if the intent was "either".

## What changed, per feature

### Infra (Phase A)
- **SSE channel** — `GET /api/stream?surface=display|console` (`lib/sse.mjs`): raw-http `text/event-stream`, 25 s heartbeat, in-process pub/sub. Events broadcast: `limitations.changed`, `important.changed`, `alerts.changed`, `config.changed`, `presence.changed`, `display.command`. Clients keep the 60 s poll as fallback; refetches triggered by events use `refresh=false` (cheap cache read, no forced Leon sync).
- **Real auth** (`lib/auth.mjs`) — every `/api/*` route now requires a Supabase session. The session is read from the portal's `sb-<ref>-auth-token` cookies (chunked/`base64-` formats handled) or an `Authorization: Bearer` header, verified server-side against `{SUPABASE_URL}/auth/v1/user`, cached 60 s. Degrades to the old mock ADMIN user when Supabase env is missing or `DISABLE_AUTH_FOR_TESTING=true` (dev escape hatch, off by default). If Supabase is temporarily unreachable, previously-verified tokens keep working for the cache TTL; unknown tokens fail closed.
- **Mailer** (`lib/mailer.mjs`) — **Resend HTTP API** (the provider the repo already uses in `lib/pickem-email.ts`), so no new dependency in the dependency-free backend. Templates are HTML files with `{{escaped}}` / `{{{raw}}}` placeholders; `templates/alert-email.html` is a clearly-marked placeholder to be replaced by the designed template.
- `lib/json-store.mjs` — atomic local-JSON store (same pattern as `data/aircraft-visibility.json`) backing clocks, Important entries, alert rules and findings.

### Feature 2 — Display / Console split (Phase B)
- `opsboard-react` now has two surfaces: **Display** (`/digital-wall/timeline`) renders only clock bar + board + sidebar + presence pills + overlay; **Display Console** (`/digital-wall/console/{flights|operators|aircraft|limitations|important|settings}`) holds all management.
- Routing stays library-free (`src/router.js`, history API + popstate). Legacy `/digital-wall/{aircrafts|operators|limitations}` URLs redirect into the console.
- `deploy/digital-wall/nginx-gateway.conf`: `/digital-wall/console/*` → frontend SPA; dedicated unbuffered location for `/digital-wall/api/stream` (SSE needs `proxy_buffering off`).
- `src/AuthGate.jsx` gates both surfaces; a 401 shows a sign-in prompt linking to the portal `/login`. Backend-unreachable ≠ blocked: the wall still renders and shows a quiet error notice.

### Feature 1 — Configurable city clocks (Phase C)
- `GET/PUT /api/display/clocks`, persisted in `data/display-clocks.json`, IANA-zone validated, broadcasts `config.changed`. Default set matches the previously hard-coded clocks (Riga home, Paris, New York, Istanbul, UTC).
- `Header.jsx` renders the configured clocks (1 s tick, `Intl` timezone math, adapted from the prototype `WorldClockBar`); Console **Settings** page adds/removes/reorders/renames clocks and marks a "home" clock, with timezone search via `Intl.supportedValuesOf('timeZone')` (no shipped city list).

### Feature 3 — Live limitation sidebar (Phase C)
- Limitation create/toggle/delete broadcasts `limitations.changed`; the display refetches (cache read — the server re-decorates at read time) so the sidebar and `FlightPill` chips update in ~1–2 s. Poll remains the fallback; both paths replace whole state slices → idempotent.

### Feature 4 — Rebuilt Console pages (Phase D)
- All pages moved to `src/components/console/` on a shared UI kit (`ui.jsx`): consistent header/table/card/switch/chips, loading/error/empty states, optimistic toggles that reload on failure and reconcile via SSE.
- **Operators**: global sync-health card (source, last run, last error, storage mode, poll interval, flights cached) + per-operator sync columns + Force-sync button. Refresh token remains write-only.
- **Aircraft**: search + operator filter + next-flight column.
- **Limitations**: type dropdown (existing taxonomy OPS/AOG/WX/CTOT/PAX/CREW), per-limitation **matched-flight count** (`?withMatches=true`).
- Badge system extended in `Board.jsx`: `NTM` (orange) and `IMP` (pink) added; `WEATHER` aliases the existing `WX` blue.

### Feature 7 — Important entries, class `IMP` (Phase D)
- `lib/important-store.mjs` (`data/important.json`): `{id, title, body(verbatim), class:"IMP", match:{countries, airportIcaos, operators, registrations, direction, validFrom, validTo}, isActive, reviewed}`.
- **Matching**: OR within a criteria list, AND across the groups an entry specifies, direction-aware (dep/arr/any), date-window bounded. Operator matching compares against both `oprId` and operator name; registration matching added to the decoration pipeline via per-flight context. Entries with no criteria match nothing (visible on the page, flagged).
- Routes: `GET/POST /api/important`, `PATCH/DELETE /api/important/:id` (+ `withMatches=true` for affects-N-flights counts); broadcasts `important.changed`.
- Console **Important** page: search, needs-review filter/badges, full editor (airport/country/operator/registration chips, direction, date window), active toggles.
- **Importer**: `scripts/import-important-docx.mjs` — two-step: *propose* (extract text via pandoc → python3 → `unzip -p`; split into candidate entries; infer criteria incl. seasonal windows like "1 July until 15 October"; write `data/important-candidates.json` + a human-readable report) then *apply* after review. Auto-imported entries stay `reviewed:false`. Nothing is dropped: no-criteria entries import as active-but-matching-nothing with an import note.
- ⚠️ **`IMPORTANT.docx` was not present in this working copy**, so the store ships empty. On the server: `node scripts/import-important-docx.mjs /path/to/IMPORTANT.docx`, review the candidates file/console output, then `--apply`. (Verified against a synthetic sample: LFTZ seasonal window, Panaviatic/France, T7-LASER/LLBG all inferred correctly.)

### Feature 5 — Presence + remote flight overlay (Phase E)
- **Presence**: SSE connection lifecycle = presence; `GET /api/presence` + `presence.changed`; `PresencePills` on the Display header and Console top bar.
- **Overlay**: backend holds one authoritative overlay state (in-memory by design — appliance state). `POST /api/display/overlay {action:"open"|"close", flightNid, oprId}` validates the flight, records who opened it, broadcasts `display.command`; `GET` restores state when a wall reloads.
- Console **Flights** page: searchable upcoming-flight list (raw feed, keeps `flightNid`), Show-on-wall / Close-on-wall, live banner of the current overlay.
- Display `FlightOverlay`: ADEP/ADES (ICAO/name/city), all timings (STD/STA, ETD/ETA, ATD/ATA, dep/arr delays, delayed dep/arr), active limitation badges, **NOTAMs grouped per airport** (number, class, validity, full condition text), **raw METAR/TAF**, **AIP download buttons** for both airports.
- **Portal proxy** (`lib/portal-client.mjs`): server-side fan-out `GET /api/flight-info?flightNid=&oprId=` → NOTAMs + weather + AIP availability for ADEP/ADES; `GET /api/aip-pdf?icao=` streams the AD-2 PDF. Auth to the portal via the existing internal `x-debug-runner-secret`. Per-ICAO TTL cache (default 10 min; failures cached 60 s); AIP source resolved by HEAD probe in the documented precedence **USA → EAD → scraper → ASECNA**, cached 6 h. Everything returns errors as values — the overlay shows "Unavailable: …" instead of breaking.

### Feature 6 — NTM / WX alert scanner + emails (Phase F)
- `lib/alerts.mjs`: interval scanner (`ALERT_SCAN_INTERVAL_MS`, default 30 min; first run ~20 s after boot; idle unless `PORTAL_BASE_URL` is set). Collects non-cancelled flights departing within the largest window (default 7 days), queries NOTAMs+weather **once per unique ICAO per scan** (sequential + TTL cache — deliberately gentle on the scrape-backed portal), classifies with the rule set, and:
  - **Badges**: findings decorate flights as `NTM` / `WX` chips through the same pipeline as limitations, and appear in the wall sidebar. Pushed live via `alerts.changed`.
  - **Emails**: one per new finding to `ALERT_EMAIL_TO` (comma-separated) with the **entire record** (all NOTAM fields + full condition text, or the full METAR/TAF) + flight context + triggering window. Dedup per (flight, airport, record): re-scans don't re-send; a **material record change** (text hash) updates the finding and re-arms the email. Findings prune after departure.
  - **Rules**: `data/alert-rules.json` — `windowsDays: [7,3,1]` + NOTAM/weather keyword & regex sets; editable via `GET/PUT /api/alerts/rules` (regex-validated) or the Settings page JSON editor (with "Run scan now").

## New endpoints (all on the digital-wall backend, `server.mjs`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stream?surface=` | SSE event stream (auth required) |
| GET | `/api/presence` | Connected users |
| GET/PUT | `/api/display/clocks` | Wall clock config |
| GET/POST | `/api/display/overlay` | Overlay state / open-close commands |
| GET | `/api/flight-info?flightNid=&oprId=` | Flight + NOTAMs + weather + AIP availability |
| GET/HEAD | `/api/aip-pdf?icao=&inline=` | AD-2 PDF proxy (source auto-resolved) |
| GET/POST | `/api/important` · PATCH/DELETE `/api/important/:id` | Important entries CRUD (`withMatches=true` supported) |
| GET/PUT | `/api/alerts/rules` | Alert rule set |
| GET | `/api/alerts/findings` | Current findings + last scan stats |
| POST | `/api/alerts/scan` | Manual scan trigger |
| GET | `/api/timeline/limitations?withMatches=true` | (extended) match counts |
| GET | `/api/user` | (changed) real session user + `authEnabled` |

Portal-side additions/changes (main Next.js app):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/aip/resolve?icao=` | Source + shared-cache status for an ICAO (no sync) — used by the wall's AIP proxy |
| GET | `/api/notams?icao=&scraper=` | (extended) `scraper=` pins the cache-miss scrape source; 503 when CrewBriefing creds are missing |

## New environment variables (documented in `.env.example`)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Verify user sessions (falls back to `SUPABASE_SERVICE_ROLE_KEY`) |
| `DISABLE_AUTH_FOR_TESTING` | Dev-only auth bypass (default off) |
| `PORTAL_BASE_URL` | Main portal base URL (compose: `http://clearway-selfhosted:3000`) |
| `PORTAL_INTERNAL_SECRET` | Portal internal auth (defaults to `DEBUG_RUNNER_INTERNAL_SECRET`) |
| `FLIGHT_INFO_CACHE_TTL_MS` | Per-ICAO portal cache TTL (default 600000) |
| `RESEND_API_KEY` | Email provider key (shared with the portal) |
| `DIGITAL_WALL_EMAIL_FROM` | Alert email From header |
| `ALERT_EMAIL_TO` | Comma-separated alert recipients |
| `ALERT_SCAN_INTERVAL_MS` | Scanner cadence (default 1800000) |

Portal-side env (confirmed / newly pinned):

| Var | Purpose |
|---|---|
| `NOTAM_SCRAPER=crewbriefing` | Pinned on the portal service in compose (workers already had it) |
| `CREWBRIEFING_USERNAME` / `CREWBRIEFING_PASSWORD` | Required for the CrewBriefing NOTAM source — **USERNAME**, not the `CREWBRIEFING_USER` the AWS setup doc lists; missing creds → 503, no fallback |

## Decisions made (where the brief left it open)
- **Real-time transport: SSE** over WebSocket — one-way broadcast onto a raw-http server; EventSource reconnects for free; poll stays as fallback.
- **Routing: no router library** — extended the existing history/segment convention (`src/router.js`); bundle stays lean, base path untouched.
- **Email provider: Resend** — already configured in the repo; avoids adding nodemailer to a zero-dependency backend.
- **Weather badge class: `WX`** — consistent with the existing weather limitation color (`WEATHER` accepted as an alias in the color map).
- **Auth wiring**: verify the portal's Supabase cookies in the wall backend directly (same domain through the gateway) rather than proxying auth through the portal; unconfigured Supabase degrades open with a boot-time warning rather than bricking the wall.
- **New stores are local-JSON** (clocks/important/alert rules/findings) per the aircraft-visibility pattern. If multi-node or DB-backed persistence is ever needed, they sit behind small store classes that can be swapped for Supabase tables.
- **Overlay state is in-memory** — it's shared-appliance state; a backend restart simply closes the overlay.

## Left as TODO
- ~~Run the IMPORTANT.docx import on the server~~ — done via the pre-classified seed (see correction 3); remaining: review the 13 needs-review entries on the Important page, decide the IMP-038 Kazakhstan weekend contradiction, and bump IMP-001's seasonal window annually.
- Replace `templates/alert-email.html` with the designed template (placeholders documented in the file header).
- The `digital-wall-backend` compose service has no volume for `./digital-wall/data` — the JSON stores (clocks, important, alert state) live inside the container. **Add a bind mount (e.g. `./digital-wall/data:/app/data`) before deploying** so config survives container rebuilds.
- Per-operator `last_sync_*` columns are surfaced in the Operators UI but the live backend still only tracks global sync state; wiring per-operator status into `runSyncCycle()` is a small follow-up.
- Presence/pills show all authenticated connections; there is no idle-timeout beyond the SSE disconnect itself.

## Key files
- Backend: `digital-wall/server.mjs`, `digital-wall/lib/{sse,auth,mailer,json-store,important-store,portal-client,alerts}.mjs`, `digital-wall/leon-sync.mjs` (decoration + match counts + flight lookup), `digital-wall/scripts/import-important-docx.mjs`, `digital-wall/templates/alert-email.html`
- Frontend: `opsboard-react/src/{App,DisplayApp,ConsoleApp,AuthGate,router}.jsx|js`, `src/services/{timelineApi,wallStream}.js`, `src/components/{Header,Board,FlightPill,FlightOverlay,PresencePills}.jsx`, `src/components/console/{ui,FlightsPage,OperatorsPage,AircraftPage,LimitationsPage,ImportantPage,SettingsPage}.jsx`
- Deploy: `deploy/digital-wall/nginx-gateway.conf`, `digital-wall/.env.example`

## Run / verify locally
```bash
# backend (auth auto-disabled without Supabase env)
cd digital-wall && PORT=5174 node server.mjs

# frontend dev server (proxies /api -> :5174)
cd opsboard-react && npm run dev
# Display:  http://localhost:5173/timeline
# Console:  http://localhost:5173/console/flights

# exercise SSE
curl -N http://localhost:5174/api/stream?surface=console
# ... then in another shell create a limitation and watch limitations.changed:
curl -X POST http://localhost:5174/api/timeline/limitations \
  -H 'content-type: application/json' -d '{"title":"Test","type":"OPS","airportIcaos":["EGLL"]}'

# overlay
curl -X POST http://localhost:5174/api/display/overlay \
  -H 'content-type: application/json' -d '{"action":"open","flightNid":"<nid-from-cache>"}'

# alert scanner (needs PORTAL_BASE_URL; portal must be reachable)
curl -X POST http://localhost:5174/api/alerts/scan

# Important import (on the server, where IMPORTANT.docx lives)
node scripts/import-important-docx.mjs /path/to/IMPORTANT.docx   # propose
node scripts/import-important-docx.mjs --apply                    # after review
```

## Auth: redirect back to the originating page (cc-3)

Signing in now returns the user to exactly where they started (path + query +
hash) instead of a generic landing page. The mechanics live entirely in the
query/session layer, so the upcoming visual redesign of the auth pages can
replace the markup freely without touching them.

**Where `next` is set**
- Portal middleware (`middleware.ts`): unauthenticated hit on a protected
  route redirects to `/login?next=<pathname+search>` (was already the case).
- Digital Wall `AuthGate` (`opsboard-react/src/AuthGate.jsx`): the gateway
  serves `/digital-wall/*` directly (portal middleware never sees it), so the
  gate's "Go to Clearway sign-in" link is the capture point for wall/console
  deep links. `loginHref()` builds `/login?next=<encoded path+query+hash>` at
  render time — so a session that expires mid-use (the 5-minute re-check
  flips the gate to `unauthorized`) captures the view the user is on *then*.
- Signup keeps the chain: login page forwards `next` to `/signup?next=…`,
  signup's "Back to sign in" link carries it back, and the confirmation-email
  request posts it along (pre-existing).

**How it is validated — `lib/auth-next-path.mjs` (portal `lib/`, plain .mjs +
`.d.ts`, unit-tested in `tests/auth-next-path.test.mjs`)**
`safeNextPath(raw, fallback = "/")` accepts only same-origin relative paths:
must start with `/`, must not start with `//` (protocol-relative), no `\`
anywhere (browsers treat it as `/` when resolving), no control characters or
raw whitespace. Anything else — absolute URLs, `javascript:`, empty/missing —
returns the fallback. Every consumer goes through it; nothing trusts the raw
query value.

**Where it is consumed**
- `app/login/ui/LoginCard.tsx`: after a successful password sign-in,
  `window.location.href = safeNextPath(next)` (was unvalidated → open
  redirect, now closed).
- `middleware.ts`: an **already-authenticated** user hitting `/login` or
  `/signup` is bounced straight to `safeNextPath(next)` without seeing the
  form (login/signup moved out of the blanket public-route early-return so
  the session is checked there).
- `app/auth/callback/route.ts`: `next`/`continue` are validated with the same
  helper before `new URL(next, origin)` — previously `//evil.com` passed the
  old `startsWith("/")` check and resolved off-origin (real open redirect,
  now closed).

Sign-out flows intentionally link to bare `/login` (no `next`) — returning to
the page you just signed out of would bounce you right back to the login wall.

## Claude Design re-skins: NOTAM Check + Sign In (from bundles 2/3)

- **NOTAM Check** (`opsboard-react/.../NotamCheckPage.jsx`): visual treatment
  from "NOTAM Check.dc.html" on the unchanged endpoints/SSE — wall-sign
  banner (dark mono plate, red glow when unchecked), progress bar + rule-group
  legend, status-tinted airport cards with Undo (ack() toggles), category
  chips on records, and distinct loading/error/empty states. New inlined
  lucide icons + cwshimmer/cwpulseDot/cwglow keyframes in the UI kit;
  decorative animations off under prefers-reduced-motion.
- **Sign In** (`app/login/`): "Sign In.dc.html" dropped onto the tested
  redirect-back logic (untouched — LoginCard still signs in and navigates to
  the validated `next`). `AuthBackdrop.tsx` holds the animated gradient mesh
  (5 drifting blobs, 50s conic sweep, dot grid, vignette) and is shared for
  the parked signup/account-flow re-skins. All decorative motion (blobs,
  sweep, fade-up, error shake) is disabled under `prefers-reduced-motion`
  (verified: computed animation-name = none for all seven). The footer pill
  shows the validated return path when `next` is set.
- **Apps Dashboard.dc.html is deliberately NOT implemented** — parked for a
  later routing/dashboard task.

## Fixes: NOTAM notify/resend, per-airport resync, overlay, auth wiring (cc-fixes)

- **Notification delivery (1a)**: root causes were silent — NOTAM_DIGEST_TO
  defaulted to a fabricated ops@clearway.aero and every failure was swallowed.
  Now: no default recipient (unset = visible error), the mailer logs each
  attempt/outcome, and emailError / lastRunError surface on the console NOTAM
  Check page. Server checklist: set NOTAM_DIGEST_TO + RESEND_API_KEY in the
  root .env, verify the DIGITAL_WALL_EMAIL_FROM domain in Resend, then
  `docker logs digital-wall-backend | grep mailer`.
- **Reminder (1b)**: while airports remain unchecked the amber reminder
  re-sends every NOTAM_REMINDER_INTERVAL_MIN (default 120); stops on
  all-checked or Riga midnight; single timer, reset per daily run, re-armed
  on boot and on un-ack. Templates from Email Templates.dc.html
  (notam-notify.html blue / notam-reminder.html amber); logo PNGs at
  portal /email/*.
- **Eligibility (1c)**: per-NOTAM status (active/future/expired/unknown) +
  human validity ("6 Jul 09:00Z"); lists ordered flagged-eligible → eligible
  → future → expired; expired never flags and renders muted with an EXPIRED
  tag; future-outside-window shows STARTS <time>.
- **Resync (Item 2)**: POST /api/notam-check/resync {icao} refetches one
  failed airport with the portal client's failure cache bypassed; console
  Retry appears only on errored cards, debounced, keeps acks.
- **Overlay (Item 3)**: scales with the display scale setting (430px base);
  shows flight info + IMP + limitations only — NOTAM, weather AND the
  NOTAM/weather-derived NTM/WX alert markers removed; view-only.
- **Auth wiring (Item 4)**: /signup, /auth/confirm, /auth/reset and
  /pending-approval all rebuilt on the shared AuthBackdrop + app/auth/ui/
  auth-kit.tsx (Auth Flow.dc.html): signup keeps the confirmation-first
  mechanics (name + email; password created on /auth/confirm with the
  strength meter), reset gains the "Password updated" success card,
  pending-approval shows the verified/admin-review checklist and now returns
  to the validated `next` deep link on approval (middleware carries it).
  /auth/confirm's `continue` param is validated with safeNextPath (was raw).
  Forgot-password stays inline on the sign-in card (same mechanics, already
  new-styled). No route lands on the old light-theme UI anymore.

## Leon pills: real-data fixes, softer palette, check-gated markers (cc Leon prompt)

- **Part 1 (verified on live cwy-cwy data)**: delayed-until instants now equal
  the actual times (were estimate+delay — NUM221 rendered a 30-min-too-long
  hatch); checklist colors arrive as bare hex and are '#'-normalized; the
  pill's contrast guard lightens dark checklist colors instead of dropping
  them (red = unfinished stays red); healCachedFlight() repairs pre-Part-A
  cache entries on load (derives movementState, clamps ±48h, recomputes
  delayed instants) — that is what fixes the permanently-white stale pills.
  Full findings in LEON-PILL-MAPPING.md. Temp creds lived only in the local
  scratchpad; diffs grepped clean before each commit.
- **Part 2**: fills desaturated to dusty tones (scheduled #dde1ea, delayed
  #c9ab62, ctot #9d8cc2, airborne #7d9cc4, arrived #bd8ba4 dusty mauve);
  contrast measured 5.6–12.7:1 at scale 1.3. Delay segments are a 45°
  diagonal hatch (the hatch reproduced cleanly; the dashed fallback wasn't
  needed).
- **Part 3**: NTM/WX markers mean "unreviewed" — flight decoration drops a
  finding once its airport has today's CHECKED ack (per-airport: ADEP acked
  but ADES not = ADES marker stays; undo re-flags; daily run resets). Wall
  pills re-read on notam-check.changed (~1–2s); the overlay regained the
  markers as an "Unreviewed alerts" badge row (type·ICAO chips only — no
  NOTAM/weather text) refreshed silently on the same event.
- **Overlap audit**: occlusion-aware bounding-box audit at scale 1.3 over a
  dense 8-lane board: 0 label collisions across 129 visible labels. (The only
  flagged case is a pill clipped by the frozen aircraft-label column mid
  horizontal scroll — inherent frozen-column behavior, text concealed by the
  opaque sticky label.)

## How the NOTAM check + notification actually work (Item 1 investigation)

**The daily job.** A minute-interval scheduler compares the Riga clock
(`NOTAM_CHECK_TZ`, default Europe/Riga) against `NOTAM_CHECK_HOUR` (10).
When it fires it collects TODAY's flights from the Leon cache, dedupes their
ADEP/ADES into one card per airport, fetches each airport's NOTAMs through
the portal proxy (CrewBriefing only), filters them by the OPS keyword groups
+ validity (now → +24 h, PERM included), stores everything per-Riga-day in
`data/notam-check.json`, raises the wall sign, and emails the notification.
"CHECKED" is a per-airport acknowledgment given on the console page; the wall
sign flips to NOTAM CHECKED when every airport of the day is acked.

**Notification vs reminder.** The 10:00 email is a notification-only "start
of day" prompt to `NOTAM_DIGEST_TO` (no NOTAM content, just counts + a link).
Separately, while any airport remains unchecked, a reminder re-sends every
`NOTAM_REMINDER_INTERVAL_MIN` (default 120) until all airports are acked or
the Riga day ends. Skip conditions for both: no flights today, recipient or
Resend key unset (both now surface as a visible emailError), template or API
failure (logged + surfaced).

**Why 04:40 checking killed the 10:00 email (the bug).** The scheduler's
guard was `state.day !== today`. ANY run today — including pressing "Run
check now" at 04:40 — set `state.day = today`, so the 10:00 scheduled run
never fired at all: no run, no email. (Had it fired anyway, the old run also
wiped the 04:40 acks, because every run reset `checked: null`.) Plumbing was
ruled out: the send path, recipient config and scheduler were verified
working in isolation.

**The fix (chosen behavior).**
- The scheduler now fires on a dedicated `dailyFiredFor` per-day marker, so
  a pre-10:00 manual run cannot suppress the scheduled 10:00 run. The 10:00
  notification ALWAYS sends when there are flights today, regardless of
  pre-10:00 acks — it reports "X / N CHECKED" honestly.
- Same-day re-runs (scheduled or manual) refresh the NOTAM data but PRESERVE
  today's acknowledgments; acks reset only when the Riga day changes.
- A manual run at/after the check hour counts as the daily send (prevents a
  double email one minute later); a manual run before the hour does not.
- Every decision is logged: "[notam-check] scheduled run for <day>: N
  airport(s), M flight(s), X pre-checked — sending daily notification" /
  "no airports today — email skipped" / exact skip reasons.
- Reminder loop unchanged: it still only chases airports that remain
  unchecked.

## Investigations + fixes round (NOTAM timing, IDs, emails, 502, zoom, timings)

- **Item 1** — see "How the NOTAM check + notification actually work" above:
  the 04:40 manual check suppressed the whole 10:00 scheduled run (guard was
  state.day). Now a dedicated dailyFiredFor marker drives the scheduler, the
  10:00 send always fires when there are flights (honest done/N count),
  same-day re-runs preserve acks, and every decision is logged.
- **Item 2** — trip status/ID colour verified correct against 126 live
  flights (2 real OPTIONs italic; checklist colour = least-complete item,
  lightened only to the contrast threshold). See LEON-PILL-MAPPING.md.
- **Item 3** — the email logo PNGs were screenshots of broken img elements
  (chromium blocks file:// subresources from about:blank). Regenerated and
  hosted at absolute Supabase-public URLs (same bucket as the login logos);
  all templates carry explicit width/height/alt; AIP delivery rebuilt on the
  designed template. Remote-image loading verified in-browser; send a real
  test from the server with:
  curl -s -X POST https://clearway.verxyl.com/digital-wall/api/notam-check/run
- **Item 4** — the intermittent NOTAM 502 was the portal (pruned Next
  standalone image) spawning the CrewBriefing scraper on storage-cache
  misses; the subprocess died on ESM resolution (reproduced:
  ERR_MODULE_NOT_FOUND lib/storage.mjs). Cache misses now delegate to the
  notam-sync worker (NOTAM_SYNC_URL); local spawn is dev-only with readable
  errors. The per-airport Retry clears it on success.
- **Item 5** — timeZoom display setting (0.5–2.5): px-per-hour zoom for the
  timeline, slider in console Settings, persisted with display settings
  (PUT now merges partial updates), live via config.changed.
- **Item 6** — delayed pills show ETD at the start, ATD at the hatch end,
  ETA at the arrival boundary and ATA at the right end (real Leon actuals;
  plain time when an actual doesn't exist yet). Anti-overlap clearances
  account for the wider tagged labels.

## Trip-status filtering + CheckWX weather (cc trip-status/weather prompt)

- **Statusless flights dropped**: only CONFIRMED/OPTION/OPPORTUNITY reach the
  wall/console (filtered at initial+incremental sync and cache load; modified
  flights that lose their status are evicted; counts logged per sync cycle).
  Verified live: 230/230 real cwy-cwy flights kept, synthetic
  null/empty/DRAFT dropped.
- **Old weather system REMOVED**: the portal /api/weather METAR/TAF scrape
  (portal-client.getWeather), the weather keyword/regex rules
  (DEFAULT_RULES.weather + the Settings weather chips UI) and WX findings
  from the alert scan are gone; legacy WX findings purge on load. The alerts
  service is NOTAM-only now.
- **New: lib/checkwx.mjs** — CheckWX decoded METAR client (X-API-Key auth,
  per-ICAO TTL cache, errors-as-values) + CheckwxWeatherService (persisted
  per-ICAO summaries in data/weather.json, broadcast weather.changed). NEW
  ENV: CHECKWX_API_KEY (required for WX; never committed);
  CHECKWX_CACHE_TTL_MS optional; CHECKWX_BASE_URL for test stubs.
- WX refreshes with every NOTAM check run (same deduplicated airports, one
  call per unique ICAO) and per-airport on resync. Acknowledgment-only: no
  page, no emails, no acking.
- **Pill markers**: per-airport flight_category dots at BOTH ends of the pill
  (ADEP left of its ICAO, ADES right of its ICAO). Colour map
  (WX_CATEGORY_COLORS in FlightPill.jsx) uses the STANDARD aviation
  convention — VFR green, MVFR amber, IFR red, LIFR deep magenta — i.e. the
  request's inverted "VFR red / IFR green" spec was corrected (flagged; good
  weather is never red, bad never green). "MIFR" does not exist; MVFR is the
  middle state.
- **Overlay**: concise decoded block per airport (category chip, wind,
  visibility, ceiling, temp/dew, QNH, observed) — not the old raw METAR dump;
  NOTAM text stays out; view-only; scales with the display setting.

## Digital Wall items 1–10 (cc wall-changes prompt)

1. Display header shows the Clearway logo (console asset, forced white,
   scale-aware, text fallback).
2. Wall pages use the portal's favicon (/PFP.png — same origin, same file).
3. Auto-return to "now": AUTO_RETURN_TO_NOW_MS (10s) idle after a USER
   gesture while off-center → smooth scroll back; gestures reset/cancel;
   never fights initial centering.
4. **Flight-cache clear**: POST /api/admin/clear-flight-cache (auth-gated) —
   drops cached flights + sync checkpoints (next sync = full initialSync with
   current normalization), kicks a sync, logs/returns the count. Flights
   only; limitations/clocks/important/notam-check untouched.
5. NOTAM check records show Start / Expiry / Issued (release date extracted
   from FAA-style CREATED: lines when present; muted — when absent; PERM
   handled; EST-suffixed stamps now parse).
6. WX category markers moved ABOVE the pill into the NTM/IMP marker row
   (same chip treatment, per-airport ADEP+ADES, standard category colours).
7. Sidebar legend + limitation cards fully scale-aware (gaps/paddings too).
8. POST /api/admin/reset-important-reviews — one-shot reviewed:false on all
   IMP entries (content/criteria/active untouched; count logged).
9. **Limitations schema v2**: no type taxonomy; { isPermanent (undeletable —
   deactivate instead), startDate/endDate (UTC days, end inclusive; window
   gates matching AND the wall sidebar; permanent ignores it),
   match { flights[{nid,label}], airportIcaos[], countries[] } } with OR
   semantics across all targets. Legacy entries auto-migrate on cache load
   (type dropped → Airport/Country match, non-permanent, no window). Console
   page rebuilt with match-type selector + flight search (by flightNid).
10. **Pill priority**: ICAOs beat timings. Degradation order: inside badges →
    times row → arrival ICAO → departure ICAO; data-gap ICAOs (UNK) render
    dimmed, never dropped for a missing timing. Audit: 0 readable collisions
    at scales 1.0–2.0 / zoom 0.5–1.

## Guide page + NTM cycle fix + WX dep/arr glyphs (cc guide/ntm/wx prompt)

- **Guide in-app**: the Claude-Design guide is served VERBATIM (dc-runtime
  support.js + React UMD shim, logo assets, all screenshots) from
  digital-wall/guide/ at /digital-wall/guide/, auth-gated with returnTo;
  console top bar has a Guide quick-open pill. No gateway changes (backend
  catch-all).
- **NTM gating fix**: acks now hold for the CHECK CYCLE (latest daily run),
  not the calendar day — the old state.day === today guard silently dropped
  all suppression after Riga midnight, re-flagging every reviewed flight
  overnight. Next daily run remains the re-flag point.
- **WX markers**: ADEP chip carries the plane-takeoff glyph, ADES the
  plane-landing glyph; colours/tooltips per category unchanged.

## Edit limitations + delete operator/aircraft (cc edit/delete prompt)

- **Edit limitation**: pencil on each card loads it into the form; save passes
  the id so upsertCustomLimitation updates in place (create flow unchanged).
- **Delete operator**: DELETE /api/operators/:id — store.deleteOperator
  cascades (leon_flights + leon_aircraft_visibility, then the operator row);
  leon-sync.purgeOperator clears the operator's in-memory flights + all
  per-operator caches and persists. Trash button + confirm on the Operators
  page.
- **Delete aircraft**: DELETE /api/aircraft {oprId, registration} —
  leon-sync.purgeAircraft purges cached flights, marks them deleted in the
  shared cache, and hides the tail persistently (Leon is source of truth, so
  re-synced flights stay hidden rather than truly gone). Trash button +
  confirm on the Aircraft page. IconButton gained a disabled state.

## Checklist colour, sizing, bugs, IMP, CAA, filters, timing (9-item prompt)

- **OPS checklist colour (1)**: live-verified — flight checklists carry only
  OPS items (SALES hangs on the trip checklist); salesDotColor is uniformly
  #FF0000 and a red OPS item looks identical, hence the confusion. Selection
  now fetches definition{groupId} (introspection-guarded) and the aggregation
  skips non-OPS items — double-guarded with the OPS-only defs map.
- **Row/pill height (2)**: rowZoom setting 0.6–1.4; pillVerticalMetrics() in
  FlightPill is the single vertical-maths source (fonts stay on scale, rows
  floor at font+pad); Settings card, merge-safe.
- **Hidden aircraft (3)**: the hidden filter was applied inside getFlights for
  every caller; getFlights gained includeHidden and the console schedule
  passes it — hidden tails stay listed/manageable.
- **CAA Details (4)**: caa-store (sheet columns verbatim + country/airport/
  mixed match flags + NEW appliesTo any/commercial/private), one-shot
  scripts/import-caa-xlsx.mjs (74 authorities from CAA_NEW.xlsx, spacer rows
  skipped, labels resolved against the geo directory), Leon isCommercial
  synced, teal CAA pill marker + overlay contact block, console page per the
  Display Console design, /api/caa CRUD + caa.changed. Unknown-kind flights
  match only "any".
- **IMP fully editable (5)**: title/body always editable, reviewed state
  click-to-flip; PATCH /api/important/:id does full-field partial updates
  (important-store.patch).
- **Geo single source (6)**: lib/geo-store.mjs loads the Supabase airports
  table (snapshot fallback data/geo-airports.json, gitignored) into the one
  airport directory every picker AND match-context country resolution uses;
  /api/geo/airports + /api/geo/countries (aliases kept).
- **Flight-kind filter (7)**: isCnl / iconType positioning / simulator
  (iconType, isSimulator, flightType) dropped at all ingestion points with
  per-kind logging; isFerry deliberately KEPT (real movements); cancelled
  flights previously synced as normal because isCnl was never selected.
- **IMP attachments + audit (8)**: attachment-store (Supabase Storage or
  data/attachments, 10 MB, ops-doc extensions), upload/list/download/delete
  endpoints + editor section + overlay chips; addedAt/By + confirmedAt/By
  stamped from the auth session (cleared on un-review), shown in the editor.
- **Time windows (9)**: flightVisibleInWindow — upcoming horizon (default 17h)
  + post-landing removal (default 2h), settings-adjustable (1–72h / 0–24h),
  applied in getFlights + NOTAM airport collection (schedule view opts out);
  config.changed now re-reads the timeline. Beware new Date(null)=epoch —
  guarded.

## Portal nav: Digital Wall links (cc portal-nav prompt)

Added three cross-app links to the **existing** portal account dropdown
(`components/UserBadge.tsx`, the radix `DropdownMenu` in the top-right badge) —
no new menu, reusing the same `DropdownMenuItem` + lucide-icon pattern as the
existing items. Grouped under a `DropdownMenuLabel` "Digital Wall" heading:
- **Digital Wall** (`MonitorIcon`) → `/digital-wall/timeline/`
- **Digital Wall Console** (`SlidersHorizontalIcon`) → `/digital-wall/console/flights`
- **Guide** (`BookOpenIcon`) → `/digital-wall/guide/`

All three are gateway paths (not Next routes), so they use full navigation
(`window.location.assign`) rather than `router.push`; Guide uses
`window.open(..., "_blank", "noopener,noreferrer")` to match the console's
"Guide" quick-open pill (new tab). Same-origin through the gateway → the shared
`sb-<ref>-auth-token` cookie rides along, so the user stays signed in.

**Verified:** deployed gateway paths resolve on live
(`clearway.verxyl.com`): timeline `200`, console/flights `200`, guide
auth-gated (`302 → /login` for no session — same as the console pill).
Dropdown rendered against a local auth-disabled portal
(`DISABLE_AUTH_FOR_TESTING=true`, port 3099) with Playwright: the "Digital
Wall" section shows all three items with their icons, and clicks target
`/digital-wall/timeline/`, `/digital-wall/console/flights`, and
`/digital-wall/guide/` (new tab) respectively. Portal image rebuilt +
container restarted.

## Fixes: delete, panel scales, timestamp window, WX timing, console markers

- **Limitations delete (1)**: worked on main all along — what looked broken
  was permanent entries hiding the trash silently + the guard 500ing. Now:
  confirm dialog, disabled trash w/ tooltip on permanent cards, 400/404 with
  readable messages.
- **Overlay & sidebar scales (2)**: overlayScale + sidebarScale settings
  (1–2, default 1.3) — overlay, clocks bar/sign and the board's left panel
  each size independently; the display scale no longer moves them
  (makeStyles(sz, szSide); DisplayApp feeds each surface its own scale).
- **Timestamp window (3)**: flightVisibleInWindow is now pure timestamp
  overlap of [now−behind, now+ahead] — end (ATA→ETA→STA) after now−behind AND
  start (ATD→ETD→STD) before now+ahead. Replaces the state-based post-landing
  check (flights without an ATA used to linger and stack lanes). Same keys
  (upcomingHorizonHours/postLandingHours), relabelled 'Show ahead/behind now'.
- **WX timing (4)**: daily 10:00 fetch was already today-only; the leaks were
  decoration (categories attached to ANY flight touching a cached airport)
  and flight-info's on-demand CheckWX fetch. wxDep/wxArr now attach only to
  flights whose Riga day is today (timelineService.weatherEligible), and
  flight-info serves day-gated cache only. Fetch paths: 10:00 run + manual
  resync, nothing else.
- **Console markers (5)**: shared <FlightMarkers> (extracted from FlightPill)
  renders IMP/CAA/WX/NTM identically on the wall pill, the Flights list
  (dedicated MARKERS column, dark backing, wraps) and the detail panel
  (larger + legend).

## Console layout + footer logo
- Content column cap (1240px) removed; side panels fluid via clamp(). New
  footer logo assets: opsboard-react/public/assets/verxyl-footer{,@2x,@3x}.png
  (pre-resampled from verxyl-logo.png, which stays for other uses).

## Leon status-lag + cancelled fixes, webhooks (two-phase)

- **Phase 1**: isActive:false = excluded kind "inactive" (tri-state mapping;
  absent field ≠ false); full flightList pulls pass server-side
  filter{isCnl:false}; FLIGHT_CACHE_VERSION stamp (v2) discards caches
  written by older code at load (limitations still load) and forces a full
  re-sync — the version bump in this deploy re-syncs cleanly, no manual
  clear-flight-cache needed.
- **Phase 2**: Leon subscription webhooks. Receiver POST /leon/webhook/:opr —
  PUBLIC path (explicit nginx location; NOT Supabase-gated), authenticated by
  Leon's RS512 JWT verified fail-closed against
  https://{opr}.leon.aero/.well-known/keys/leon-subscriptions-webhook-1.pub
  (iss/aud/exp checks; LEON_WEBHOOK_KEY_BASE_URL test override). Events are
  triggers only: payload mined for flightNid -> leon-sync.resyncFlightByNid
  (query flight(flightNid:), normal map/filter/evict pipeline, idempotent);
  no nid -> one incremental sync cycle; then flight.changed SSE. 60s poll
  unchanged as fallback. Events: flightWatchChanged/Created (the landing
  signal polling can't see), flightCancellation, flightScheduleChange,
  flightCreate (operatorId variable, from any flight's oprNid),
  tripStatusChanged (optional, sync-cycle handler). Registration via
  createSubscriptionWebhook with the operator's stored refresh token,
  deterministic labels digitalwall-<event>-<opr>, delete-then-create
  idempotency, 10-per-token cap respected (max 6/tenant). Health store
  data/webhooks.json (enabled events, registrations, lastEventAt, lastRepull,
  lastError). Endpoints GET /api/webhooks (+ live subscriptionList
  cross-check), POST /api/webhooks/toggle, POST /api/webhooks/reregister,
  DELETE /api/webhooks/:label. Boot reconcile opt-in:
  LEON_WEBHOOK_AUTOREGISTER=true. Console Webhooks page per operator with
  toggles/health/re-register. Env: LEON_WEBHOOK_PUBLIC_URL (default
  https://clearway.verxyl.com/digital-wall/leon/webhook).

## Webhook fixes (operator-id, tripStatusChanged, health truth, names)
- operatorIdFor: direct `query { operator { oprNid } }` (works on flightless
  tenants — the sunway failure); flight-scan fallback widened to ±45d/limit 1.
- tripStatusChanged selection: TripSimple has ONLY tripNid + tripNumber
  (introspected); all other selections re-checked against the live schema.
- Health = Leon's CURRENT subscriptionList: syncRemoteState() reconciles
  local registrations with Leon after every mutation and in status(), clears
  healed lastError; page pill/banner derive from allEnabledLive (no sticky
  red). Cards show operator NAME first, oprId muted.

## Webhooks: Sunway diagnosis, trigger log history, calmer states
- Sunway partial 403 DIAGNOSED: the two operator-scoped events first call
  query { operator { oprNid } }; Leon's gateway answers HTML 403 when the API
  key lacks the GRAPHQL_OPERATOR ('Operator') scope — token itself valid
  (core events register). Fix = regenerate the key with that scope, or leave
  the triggers off. operatorIdFor now surfaces the exact call + host + raw
  response; classifyFailure() maps causes: token-refresh 403 -> needsAttention
  (check token/oprId); HTML-403-with-working-token -> needsAttention (scope
  hint); GraphQL "cannot query/unsupported" -> notAvailable (calm);
  network -> needsAttention.
- Per-trigger audit log: data/webhook-log.json, rolling 75 per
  (operator,event); receiver records timestamp, callsign+flightNid, action,
  and the before->after timeline change (describeChange: movementState/
  ATD/ATA/ETD/ETA/route diffs, removed—cancelled, new flight added).
  GET /api/webhooks/log?opr=&event=; clock icon per event row opens the
  history overlay.
- States: per-event chip live (green) / Not available for this operator
  (grey, tooltip) / needs attention (red + actionable hint) / not confirmed
  (amber); card banner red ONLY when something genuinely needs attention;
  green "Healthy · some triggers not available" otherwise; unknown amber
  when Leon unreachable. eventStates persisted; syncRemoteState flips events
  found live and clears errors only when nothing needs attention.

## Leon rate-limit remediation (2026-07-18 cycling-403 incident)
BEFORE (~50 req/min steady; 150+ with the Webhooks page open): backend
runSyncCycle every 30s x 8 operators x (aircraft roster + modified-list) =
32/min; the wall's 60s refresh=true poll stacked extra cycles (+16/min); the
Aircraft page forced syncs on visit; and status()->syncRemoteState->persist->
SSE webhooks.changed->page reload->status() was an INFINITE echo loop doing 8
subscriptionList queries per iteration. Leon caps: tokens 30 min, 500 active
per refresh token, gateway HTML 403 for request-rate abuse.
AFTER (~4-5 req/min steady): base poll 120s (poll is fallback — webhooks are
the fast path); wall + Aircraft page poll with refresh=false (backend timer
owns Leon); runSyncCycle deduped (concurrent callers share one in-flight
cycle), operators SEQUENTIAL with 2s gaps, aircraft rosters cached 30 min;
per-operator exponential backoff on 403/429 (2->32 min, skip while cooling,
reset on success — recovery is gradual, no thundering herd); webhook
subscriptionList ONLY on the page's Refresh-health button and post-mutation
(status() reads cache by default); persist() no longer broadcasts (echo loop
dead — mutations/events call notifyChanged()). Access tokens already cached
25 min (< Leon's 30-min validity).

## Timeline: marker degradation (1B), route below pill (2A), auto-return fix
- Neighbour budget: assignFlightLanes records __nextGapFrac (distance to the
  next flight in the SAME lane); FlightPill budgets its left-anchored content
  (marker row, below-pill text) against that gap — spill into empty space OK,
  into the neighbour never.
- Markers (1B): four levels chosen per flight against the post-ID budget —
  full chips → icon-only → coloured dots → single +N (true hidden count incl.
  LIM folded as amber marker; tooltip lists). Colour semantics survive at
  every level. FlightMarkers gains mode/extraMarkers; console light variant
  untouched.
- Route (2A): ICAOs inside the pill ONLY when both fully fit; otherwise the
  pill is clean and 'DEP→ARR · times' renders below (budgeted; times drop
  before the route; never truncate an ICAO — omit instead).
- Auto-return: continuous 1s idle monitor replaces the gesture-armed timer
  (which never fired on an untouched wall drifting away from now). Idle ≥10s
  (AUTO_RETURN_TO_NOW_MS) + >40px from the now-anchor → smooth return;
  repeats forever; interactions reset; own animation ignored.

## Flight identity audit (non-unique React key fix)

Symptom: a landed leg could display another leg's state when a flight with
the same flight number departed. Full audit of every place a flight is keyed:

- Backend cache/lookup/update/evict: `flightCacheKey(oprId, flightNid)` —
  `leon-sync.mjs` flightsByNid / aircraftByFlightNid, incremental sync,
  webhook re-pull (`resyncFlightByNid`), deletion/eviction. All nid-keyed. OK.
- Findings (alerts.mjs): flightKey `oprId:flightNid` (+ plain-nid fallback). OK.
- NTM/WX are airport-keyed, CAA/IMP matched from the flight's own fields at
  decoration time — no flight identity involved. OK.
- Overlay state: `{flightNid, oprId}`. Console FlightsPage: `oprId:flightNid`. OK.
- Payload dedup (`flightDedupKey`) is a composite incl. reg+times — display-only
  dedup of duplicate Leon blocks, not state identity. Left as-is.
- **The flaw: the wall.** `mapFlight` passed no identity at all and Board keyed
  sibling pills `key={fl.fn}` — the flight NUMBER. Real data: JTY52W appears on
  131 distinct legs (VPC004: 96), including several on the same day/aircraft →
  duplicate sibling React keys → undefined reconciliation (React: "children may
  be duplicated and/or omitted"), i.e. pill DOM/state paired with the wrong leg
  whenever the visible list shifted (a leg departing/aging out).

Fix: `mapFlight(flight, group)` now emits `id` = `oprId:flightNid` (fallback
composite `fn|dep|arr|start|end` for nid-less static seeds), plus `flightNid` +
`oprId` fields; Board keys pills by `fl.id`. `fn` is display-only everywhere.
No backend change and no cache migration needed — the server cache was already
nid-keyed (FLIGHT_CACHE_VERSION stays 2). Verified with a 3-leg JTY52W row:
pre-fix dev React logged 10 duplicate-key violations, post-fix zero and each
pill holds its own state.

## ICAO aircraft-type marker

The type code (C56X, E55P…) comes from the operator roster Leon query the
sync already runs (`aircraftList { acftType { icao } }`) — aircraft-level
data, so `getFlights` joins it onto each payload group by registration
(`attachAircraftTypes`) instead of adding a per-flight Leon field. The wall
maps it per flight (`acftTypeIcao`) and renders `AcftTypeChip`: a neutral
slate chip in the marker row, deliberately styled NOT to read as an alert.
Priority choice: informational → lowest. The pill shows it only in 'full'
marker mode when it fits after every alert marker + LIM chip, drops it first
as space tightens, and never folds it into dots/+N (those count alerts only).
Console: flight rows show `REG · TYPE`; the detail panel's TIMELINE MARKERS
section always includes the chip.

## Editable operators (rotation flow)

`PATCH /api/operators/:id` now handles field edits (name / oprId / token)
alongside the original `{isActive}` toggle shape. The token is write-only:
blank keeps the stored value, non-blank replaces it (encrypted, never echoed).
Store method `updateOperator` returns `{previousOprId, oprIdChanged,
tokenChanged}`; the route purges the old prefix's cached flights when the
oprId changes (different tenant), calls
`timelineService.invalidateOperatorCredentials(oprId)` (drops cached access
token + per-operator backoff so a rotated token takes effect immediately, not
after the ≤25-min TTL — `listConfiguredOperators` refills refresh tokens from
the store every cycle), then `refreshNow()`. The response flags
`webhooksNeedReregister` whenever token or oprId changed — Leon webhook
registrations are bound to the refresh token/tenant — and the Operators page
shows a persistent amber notice directing to the Webhooks page Re-register
button (the exact token-rotation flow). The edit form warns about this before
saving too. Webhooks cards read names from the operators store, so a rename
reflects there on the next load.

## Clearway white-pill cause + movement refresh

Cause, proven live: cwy-cwy flights DO carry full flight watch in Leon
(25/26 past flights in a 36h window had ATD/ATA/TO/LDG; their atd/ata come
as unix-second integers, which normalizeDateLike already handles), but Leon
never delivers flight-watch writes through getModifiedFlightList — in the
same 24h, ~14 cwy flights landed while the modified-list re-delivered only
2 (both via unrelated edits; the other "changed" rows were future-schedule
edits). Clearway's legs are subcharter aggregations nobody edits after
creation, so the incremental sync never re-delivers them and the wall keeps
the pre-departure snapshot (white) forever. Other operators look livelier
only because their staff edit flights, which happens to re-deliver current
flightWatch. NOT caused by the Item-1 key collision (backend was nid-keyed;
cwy flight numbers are distinct anyway).

Fix: `movementRefresh(oprId)` — one flightList re-pull over [now−24h,
now+6h] through the exact same map/filter/upsert pipeline, run for each
operator every 2nd sync cycle (~4 min at the 120s poll; +1 request per
operator per 4 min ≈ +2 req/min fleet-wide, still far under the rate-limit
budget). Skipped on the cycle an operator does its initial full sync.
Webhooks (flightWatchChanged) remain the instant path when registered; this
is the guaranteed fallback for every operator. Verified live: one pull
flipped 10/11 past-departure cwy flights to arrived with correct ATD/ATA
and delay minutes.

## Vertical sizing (Item 3 — finer controls)

Three new display settings alongside rowZoom, all independent multipliers
(default 1, merge-safe PUT, config.changed broadcast, applied live via SSE):
- pillHeight 0.4–1.4 — the pill body's own thickness
- markerScale 0.5–1.3 — the IMP/CAA/WX/NTM chip row (and the LIM chip +
  type chip that share it; width budgeting uses the same scaled helper so
  degradation stays consistent)
- labelScale 0.5–1.3 — flight ID, in-pill ICAOs, and the route/times text
rowZoom widened 0.6→0.4 (row spacing; lane gap floor 4→2px). All flow
through pillVerticalMetrics(scale, rowZoom, {pillHeight, markerScale,
labelScale}) so Board lane maths and the rendered pill can never drift.
Floors now FOLLOW the label/marker multipliers (fonts ≥7px, marker chips
≥10px, body ≥ ICAO font + padding) — that's what actually lets rows shrink;
LIM badges inside the body are capped at body−padding so a thin pill can't
clip them. Horizontal/time-axis behaviour untouched. Console: Settings →
"Vertical sizing" card (replaces Row/pill height) with the four sliders.
Overlap audit re-run at defaults, all-minimums, thin-rows/big-text and
fat-rows/small-text: zero pill-element overlaps in every combination
(row pitch 138px → 80px at minimums, −42%). This deliberately does NOT
restructure the label/body/times bands — the broader vertical redesign is
a separate Claude-Design track.

## ICAO type marker — corrected field + visibility fix

Wrong field, fixed. The "ICAO type" input on Leon's Aircraft tab is
`Aircraft.defaultFlightType`, of enum `IcaoType` (live-introspected
2026-07-20): S = Scheduled air service, N = Non-scheduled air service,
G = General aviation, M = Military, X = Other (the ICAO flight-plan "type
of flight" letter). Each Flight carries its own `Flight.icaoType` of the
same enum, inheriting the aircraft default — that per-leg value is what the
pill now shows (aircraft default as fallback). Live data: cwy roster
1157/1329 aircraft carry a default (mostly N, plenty G, some X); flights
±24h split 14×N / 4×G, matching what OPS see. NOT the 4-char model
designator (acftType.icao) shipped in a4e5193.

Never-visible, fixed. The old chip competed in the alert-marker row at
lowest priority (full-mode only, after every alert + LIM chip) — real
flights carry several alert markers, so it effectively never rendered.
The letter now has a RESERVED slot directly beside the flight ID, outside
the degradation ladder entirely: it renders at every marker mode, and its
width counts into idW so alert chips budget/degrade around it (no overlap
reintroduced — bounding-box audit clean at defaults and at minimum vertical
settings; 7px font floor keeps it legible). Neutral slate styling, tooltip
gives the enum meaning.

Selection changed shape → FLIGHT_CACHE_VERSION 2→3 (one clean full
re-sync on deploy backfills letters onto every cached flight).

Model designator kept in the CONSOLE only (recommendation implemented):
flight rows show `REG · C56X` and the roster data stays on the payload —
useful context there, but the wall pill shows only the OPS letter. Console
marker surfaces (list MARKERS column + detail TIMELINE MARKERS) show the
letter chip via the shared FlightMarkers `icaoType` prop.

## CAA phones/mail: chip inputs + array storage

Phone number(s) and Mail are now ARRAYS of strings (same shape as
match.countries/airportIcaos) edited with the page's existing ChipInput.
The shared ChipInput itself gained: comma commits like Enter, blur commits
(pasted/typed values are never silently lost — paste with commas/newlines
splits into pills keeping the remainder in the input), Backspace on an
empty input removes the last pill, and suggestion clicks select on
mousedown so the new blur-commit can't swallow them (input keeps focus for
the next value). Countries/Airports pick these behaviours up too.

Migration: splitMultiValue splits legacy blobs on newlines/commas, trims,
drops empties — values are separated, never cleaned ("(H24)", "OLD NBRS",
"24/7:" qualifiers survive verbatim). Runs once at CaaStore.load() and
persists; verified against the real 74-authority dataset: 74 entries
migrated, 247 values split out (131 phones / 116 mail), zero token loss,
idempotent second load. The importer passes the columns through
splitMultiValue for future imports. sanitizeCaaEntry accepts both arrays
and legacy strings, so old clients can't regress the shape.

Rendering: wall overlay prints one value per line (rows already use
pre-wrap); console form shows pills. AFTN / SITA / VFR addresses are
deliberately unchanged (owner will decide separately).

## Wall bugs: attribution, operator toggling, Klasjet, stale timings

Shared root cause across the four: identity/staleness — registrations are
not unique across operators, and three separate delivery gaps let stale
flight state survive on the wall.

1. Wrong-operator aircraft: cwy-cwy is an AGGREGATOR tenant — it carries
   other carriers' tails flying their legs (live: LY-JMS / LY-BBN / LY-BGS
   flying KLJ flights, EC-NQS/EC-OMU flying ORO). Those registrations also
   exist under their own operator (klj). The board keyed aircraft rows by
   registration alone (`key={ac.reg}`) → duplicate sibling React keys →
   rows could render with the wrong operator's label/flights. Fix: groups
   carry `id = oprId:registration` and the board keys rows by it. Audited
   every other join: roster/type joins, hide keys, schedule, webhooks —
   all already oprId-scoped.

2. Operator toggling: the PATCH route awaited a full multi-operator sync
   cycle before broadcasting (disable felt ~30s; the wall's active-set
   filter was already instant once notified). Now: broadcast immediately;
   on ENABLE the incremental checkpoint is dropped (modified-list never
   re-delivers untouched flights) and a background full re-pull starts at
   once, so past-departure flights come back with real movement, not white.
   Webhook events for a disabled operator are ignored (`ignored-disabled`
   in the trigger log) — nid-less events used to trigger full sync cycles.

3. Klasjet: klj is a configured operator, token healthy (last sync
   "success"), but DISABLED in the store at the time of the report — so
   nothing synced and stale white pills lingered (bug 2). Its flights do
   carry movement data: the same KLJ legs inside cwy-cwy's tenant show full
   ATD/ATA/TO/LDG (3/3 in ±36h — KLJ5855, KLJ5608, KLJ6904). The klj
   tenant itself can't be introspected from the dev machine (stored token
   is encrypted with the server-only key), but with the enable-time full
   re-pull + the movement refresh, enabling klj pulls real states
   immediately. Not a klj-specific mapping gap.

4. Stale timings: every backend path fully replaces the flight record and
   recomputes delays (verified), and fw.etd-first precedence is CORRECT
   (live: KLJ5608 STD 01:30z vs flight-watch ETD 09:00z — flight watch is
   the fresher estimate; delay derives from it vs the planned STD). The
   real gaps were delivery: no wall subscription to flight.changed, no
   broadcast from sync cycles, and the movement refresh never evicting
   flights that vanished from the window (deleted/replaced/cancelled/
   rescheduled while webhooks were down, the operator disabled, or during
   backoff). All three fixed (see commit); the window pull is now
   authoritative with an empty-response guard.

No cached-data shape change — FLIGHT_CACHE_VERSION stays 3.

## White flights + wrong operator: deploy check + per-operator audit (2026-07-23)

Step 0 — BOTH deploys verified CURRENT before touching anything: the prod
payload carries acftTypeIcao/defaultIcaoType (newest backend), poll 120s,
healthy; the served bundle (index-CmsDCHso.js) contains the flight.changed
subscription and the ICAO-type chip and lacks pre-fix markers. The prior
fixes ARE live — the surviving symptoms had different causes.

Per-operator audit (prod /api/timeline/flights via a temp Supabase user,
deleted after; behind-now flights, wall-window):

  operator | active | behind-now | with ATD/ATA | states           | verdict
  artlw    | yes    | 0 in window| —            | —                | nothing due
  bys      | yes    | 1          | 1/1          | arrived          | correct
  cwy-cwy  | yes    | 3          | 3/3          | arrived          | correct
  jty      | yes    | 0 in window| —            | —                | nothing due
  klj      | yes    | 30         | 6/6          | 22 scheduled(!), | genuinely-no-data
           |        |            |              | 6 arrived, 2 air | for LY#### ops
  nvj/sbb/ | yes    | 0 in window| —            | —                | nothing due
  sunway   |        |            |              |                  |
  vpc      | yes    | 2          | 1/1          | 1 arrived, 1 sch | placeholder row

Findings + fixes:
- klj: its OWN tenant has zero flight watch for its scheduled LY#### ops
  (LY5193/LY5194 etc.: atd/ata null, etd == STD, delay 0) while its charter
  legs DO carry movement (6 arrived / 2 airborne — so the enable-time full
  re-pull worked). No amount of re-pulling can deliver data Leon doesn't
  hold → estimated-state fallback at decoration (see commit): CONFIRMED +
  past ETA → arrived, past ETD → airborne, movementStateEstimated flag;
  real ATD/ATA always wins; delayed/CTOT untouched pre-departure. Covers
  every operator with the same gap, live via the existing SSE repaint.
- The re-pull machinery itself checked out: movementRefresh runs for every
  active operator every 2nd cycle over [now−24h, now+6h], initial full
  pull on enable confirmed live (klj).
- vpc "wrong operator": vpc IS Panaviatic (same tenant) — the label was
  never wrong. The row was a pseudo-aircraft literally registered
  "Ground Han" (aircraftNid 5324, placeholder type C172) whose "flights"
  are named after the handled tails (OHTFD = OH-TFD, N110DM) — ops-created
  ground-handling records. Kind fields are indistinguishable from real
  flights (iconType "flight", PAX, CONFIRMED), but real registrations are
  always uppercase → lowercase = placeholder ("Ground Han", cwy's
  "Transfer"). Excluded from the wall + daily NOTAM collection; still
  visible to the console via includeHidden.
- leon_flights (Supabase) is dead code — zero rows, no call sites; audits
  must use the prod API or the local cache file, not that table.
No cached-shape change; FLIGHT_CACHE_VERSION stays 3. After deploy the
wall should show klj's LY#### legs as estimated airborne/arrived and the
"Ground Han" row gone.

## Placeholder rule reverted + prod sync freeze (2026-07-23)

The lowercase-registration heuristic from the previous entry was WRONG and
is fully removed — "Ground Han" is a row ops wants shown, and no fuzzy
name-shape rule hides anything anymore. Complete damage audit (prod
payload incl. hidden + rosters): the rule could ever hide exactly ONE row
— vpc "Ground Han" (cwy's "Transfer" has no flights, so no row). It was
almost certainly never live (the running build predates it). T7-LASER is
UPPERCASE and was never matched: its wall absence = its only flight
(T7LASER, dep Jul 21 14:50Z) aged past the 17.5h behind-window and cwy's
tenant has no upcoming legs for it; it reappears whenever it flies. To
hide a genuine non-aircraft row, use the console's per-aircraft hide
(exact oprId:registration) — never a pattern.

While auditing, found prod's REAL outage: the sync loop froze at 21:20Z
(every operator's last_sync_at frozen for 4+ h, zero errors, API fine).
Root cause: the access-token refresh fetch had NO timeout — one hung
socket kept `syncCycleInFlight` latched forever, and every subsequent
cycle returned the stuck promise. That freeze — not the placeholder rule
— is also why rows (incl. "Ground Han") vanished: Leon-side changes were
evicted at ~21:00-21:20 and nothing could be re-added afterwards. Fixed:
15s abort on token refresh, graphql body reads inside the 20s window, and
a 5-min watchdog that clears the latch, records the error and lets the
next tick recover. Restart the backend to unfreeze, then verify Ground
Han returns once vpc's tenant carries its records again.

## Guide v1.2 published (2026-07-23)

Updated "Digital Wall - User Guide.dc.html" imported from the Claude
Design project and served verbatim over the old version — only
guide/index.html changed (+~60KB): the design project's support.js and
all 27 referenced assets/screenshots are byte-identical to what was
already deployed (sample-verified by hash), so nothing was re-downloaded
and nothing stale needed pruning. Same React-UMD head shim as b926929
inserted before ./support.js. New in v1.2: "07 Webhooks · live updates"
and "08 CAA details" TOC sections, the redesigned pill (Jul 2026),
visibility-window and overlay/sidebar scale docs. Wiring untouched (auth
gate, traversal guard, console Guide button). Verified through the real
server route: 10 TOC sections, 50 images rendered, 0 broken, 0 network
errors. Frontend/guide container rebuild needed to serve it.

## Wall sizing: diagnostic, auto-fit, per-device profiles (2026-07-24)

Item 1 (diagnostic): every wall/console surface now reports its real
rendering environment to /api/display/env (viewport CSS px, DPR, screen,
visualViewport scale, outer/inner zoom ratio, root font size, device id)
on load and resize; `?debug=viewport` on the wall shows the same values
live on screen. The console Settings device list displays each screen's
report. VERDICT PENDING THE WALL'S FIRST REPORT after deploy: if the wall
reports ~1920×1080 like a desktop, no in-app setting can add pixel area —
everything is just physically larger, and the real win is running the
wall at native panel resolution / lower browser zoom (then auto-fit uses
whatever it gains automatically). Desktop baseline for comparison
(headless test browser): 1900×950 css px, DPR 1, screen 1900×950,
visualViewport scale 1.

Item 3 (profiles): settings are per DEVICE. Stable per-browser id
(localStorage `dw-device-id`, cookie fallback); server store shape
{ default, profiles: {deviceId} } with legacy flat-file migration into
default (nothing lost). Reads resolve device → default; writes with a
deviceId land only in that profile; config.changed carries the deviceId
and every surface ignores events for other devices — desktop tuning
cannot resize the wall (verified end-to-end against the real server:
migration, isolation, reset-to-defaults, env registry). Console Settings
has a "Which screen are you tuning?" selector (rename, own-profile
chips, Use-defaults reset); Display scale / Hour spacing / Vertical
sizing / Panel scales are per-device; visibility window + clocks stay
global (the backend filters flights globally).

Item 2 (auto-fit): autoFitRows per profile. The board measures its rows
viewport, counts rows/lanes (real timeline width — a fake width once
over-counted lanes and over-shrank), and binary-searches a common factor
over rowZoom/pillHeight/markerScale/labelScale through the shared
pillVerticalMetrics. Grows on tall screens, shrinks on cramped ones;
sliders act as ceilings; floors (fonts ≥7px, chips ≥10px) always win.
CHOSEN degrade behaviour: if all rows can't fit even at the floors, rows
render AT the floor and the board scrolls vertically — fit as many as
possible, never illegible. Computed knobs are reported to the device
registry; the console shows them read-only next to the toggle. Verified:
8 rows shrink to 96px (768/775px used), 4 rows grow to 200px, 14- and
30-row floor cases scroll; bounding-box overlap audit clean at every
computed size including the floor. Also removed the "OPS · <date>"
caption from the wall header.

## INCIDENT: airborne flights vanished from the wall (2026-07-23)

Where they vanished: the backend CACHE — the movement-refresh eviction
removed them; the wall faithfully rendered the shrunken cache. They
returned minutes later as webhook re-pulls / modified-list deliveries
re-added flights one by one.

Root cause, proven live: Leon's timeInterval END DAY IS EXCLUSIVE —
end "2026-07-23" returned ZERO flights starting Jul 23; end "2026-07-24"
returned 9 more, airborne among them. The movement refresh truncated its
end (now+6h) to a DAY string, so whenever now+6h fell before the next
midnight (00:00–18:00Z — most of the day) the pull silently excluded
every flight that started "today". A perfectly successful, non-empty
response — so the empty-response guard passed and the eviction pass
removed all of today's in-window cached flights, including AIRBORNE
ones. (Suspects ruled out: HTTP errors/timeouts/403/429/GraphQL errors
all THROW before eviction; the watchdog can't split the synchronous
upsert+evict block; the wall renders the cache, no payload race.)
Side finding: the same exclusivity left a one-day GAP at every 10-day
chunk boundary of the initial sync.

Fix (layered, per the "never evict on a failed/partial pull" rule):
1. fetchFlightsForOperatorRange queries one day PAST the requested end —
   the eviction window is now strictly inside the query window whatever
   Leon's boundary semantics; also closes the chunk-boundary gap.
2. Eviction runs only after a fully successful pull (errors throw past
   it — now stated explicitly).
3. Sanity share guard: a pull that would evict more than max(3, 30%) of
   the operator's in-window flights — or any airborne-missing response
   evicting ≥20% — is treated as PARTIAL: nothing evicted, loud error
   log.
4. AIRBORNE flights (atd, no ata) are never absence-evicted, ever.
5. Every eviction (and every refusal) logs flight identity + counts.

Verified: failed pull → cache intact; 60%-missing partial → refused,
intact; legit single removal → evicted with log; airborne-missing →
spared; live fixed pull at 16:30Z now returns all 9 of today's cwy
flights that the broken window excluded, evicting nothing.

## Estimated states: hollow pills + CONFIRMED-only (2026-07-27)

Visual convention: SOLID pill = movement confirmed by real flight-watch
data; HOLLOW pill (outline ring + faint fill + state-coloured ICAO text,
same muted palette) = state estimated from the schedule
(movementStateEstimated). Ring is an inset box-shadow — zero geometry
change, overlap audit clean at defaults and minimums; the delay hatch
draws correctly on hollow pills. Wall legend has a hollow "Estimated"
swatch. Overlay: "State: airborne (estimated — no flight watch)".
Console: rows show "Airborne (est.)", the detail header carries the
full explanation, and console status now derives from the decorated
movementState (same source as the wall — it previously showed
"Scheduled" for flights the wall showed as estimated-arrived).
estimateMovementState is additionally gated to CONFIRMED trips —
unconfirmed (OPTION/OPPORTUNITY) flights stay white rather than being
guessed forward (at gating time prod had 0 such flights; prophylactic).
Real data arriving still flips hollow→solid automatically (the estimate
returns null whenever atd/ata exists). Both containers need rebuilding.

## Wall declutter + density (old-DigitalWall style, 2026-08-10)

Item 1: logo tagline gone (clearway-mark.svg = same art, viewBox cropped
before the "HANDLING & OPERATIONS" paths), presence/account chip off the
wall, ICAO type letter chip off wall pills (console keeps it).
Item 2: WX renders as category-coloured TEXT ("IFR: EGGW"; bare "IFR"
at icon degradation; dots/+N unchanged). Console lists keep chips.
Item 3: limitations are amber NUMBERED CIRCLES in front of the callsign
(sidebar list stays the key; ack rules unchanged); LIM chip and
inside-pill badges removed; never part of marker degradation.
Item 4 (the vertical win): single-line layout — LIM circles + callsign
sit LEFT of the pill, markers RIGHT of it; the label row above the pill
is gone (band = max(body, callsign, markers) + times row). Lane packing
reserves each flight's front-text width, and the neighbour gap ends at
the NEXT flight's front text; markers hide entirely below +N width.
Item 5: subtle alternating row tint rgba(148,163,196,.045).
Item 6: rowZoom min 0.02, scale min 0.1 (7px font floors still apply);
hour labels rotate 90° when the column is narrower than the label (the
header strip grows to hold vertical text; tick font floors at 9px);
new per-device chrome controls headerScale (top clock bar, 0.3–2,
default 1.3 — the overlay top offset follows it) and acColScale (left
registration column, 0.3–1.5); sidebar min widened to 0.3. Auto-fit
clamps follow the new floors.
Item 7 verified: no ellipsis anywhere; 21-minute flights show the full
"LLBG→LCLK · 22:01–22:22" below the pill at BOTH defaults and minimums.
Overlap audit: 0 collisions at defaults (101 elements) and at the full
minimums (169 elements, rotated ticks). Density: 24-aircraft board
shows 7 rows at defaults, 18 at minimums on the same 950px viewport.
Frontend + backend containers both need rebuilding.

## Pill timing rules (bug report 7-9, 2026-08-10)

Implemented exactly as ops specified — precedence table lives in
LEON-PILL-MAPPING.md ("Timing display precedence"). Key points: T/O
always wins the departure label; CTOT vs ETD -> the LATER shows; arrival
flips to ETA at T/O and LDG at landing; BLOFF never displays (still
feeds movement-state); signed deltas vs STD/STA on the labels (+amber /
-green) plus symmetric striped segments make EARLY as visible as late.
Boundary labels removed — they were the "ETD shown, T/O missing" bug
(endpoint always showed ETD; the actual needed positive delay + wide
clearance to appear). leon-sync exposes takeOffUTC/landingUTC/ctotUTC
(FLIGHT_CACHE_VERSION 4 -> one clean re-sync). Live check: 20/24 cwy
flights carry T/O, all label correctly incl. early departures. Overlap
audit clean at defaults and small sizing. Both containers rebuild.
