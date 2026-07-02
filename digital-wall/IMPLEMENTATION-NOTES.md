# Digital Wall — Feature Rollout Implementation Notes

> Branch: `digital-wall-features` (6 commits, one per phase A–F).
> Companion context: `digital-screen-investigation.md`, `aip-notam-investigation.md`.

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

## Decisions made (where the brief left it open)
- **Real-time transport: SSE** over WebSocket — one-way broadcast onto a raw-http server; EventSource reconnects for free; poll stays as fallback.
- **Routing: no router library** — extended the existing history/segment convention (`src/router.js`); bundle stays lean, base path untouched.
- **Email provider: Resend** — already configured in the repo; avoids adding nodemailer to a zero-dependency backend.
- **Weather badge class: `WX`** — consistent with the existing weather limitation color (`WEATHER` accepted as an alias in the color map).
- **Auth wiring**: verify the portal's Supabase cookies in the wall backend directly (same domain through the gateway) rather than proxying auth through the portal; unconfigured Supabase degrades open with a boot-time warning rather than bricking the wall.
- **New stores are local-JSON** (clocks/important/alert rules/findings) per the aircraft-visibility pattern. If multi-node or DB-backed persistence is ever needed, they sit behind small store classes that can be swapped for Supabase tables.
- **Overlay state is in-memory** — it's shared-appliance state; a backend restart simply closes the overlay.

## Left as TODO
- Run the IMPORTANT.docx import on the server (docx absent locally) and review the proposed criteria on the Important page.
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
