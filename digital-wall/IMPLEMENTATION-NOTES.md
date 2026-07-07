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
