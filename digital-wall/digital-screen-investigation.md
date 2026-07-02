# Digital Screen ("Digital Wall") — Investigation Report

> Investigated: 2026-07-02
> Repo root: `/root/clearway-2`
> Subject of this report: the **Digital Wall** flight-timeline screen, primarily under `digital-wall/` and `opsboard-react/`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Where the "screen" lives (repo context)](#2-where-the-screen-lives-repo-context)
3. [Project structure](#3-project-structure)
4. [Backend](#4-backend)
   - [4.1 Runtime & framework](#41-runtime--framework)
   - [4.2 The two backends](#42-the-two-backends)
   - [4.3 API routes (server.mjs — the live backend)](#43-api-routes-servermjs--the-live-backend)
   - [4.4 API routes (Next.js TS backend — the parallel implementation)](#44-api-routes-nextjs-ts-backend--the-parallel-implementation)
   - [4.5 Data models & database schema](#45-data-models--database-schema)
   - [4.6 Leon sync engine & background jobs](#46-leon-sync-engine--background-jobs)
   - [4.7 Authentication / authorization](#47-authentication--authorization)
   - [4.8 Configuration & environment variables](#48-configuration--environment-variables)
   - [4.9 Startup sequence & dependencies](#49-startup-sequence--dependencies)
5. [Frontend](#5-frontend)
   - [5.1 The three frontends](#51-the-three-frontends)
   - [5.2 opsboard-react (production UI)](#52-opsboard-react-production-ui)
   - [5.3 State management & data flow](#53-state-management--data-flow)
   - [5.4 How the screen renders & updates](#54-how-the-screen-renders--updates)
6. [Core logic / business rules end-to-end](#6-core-logic--business-rules-end-to-end)
7. [Deployment / infrastructure](#7-deployment--infrastructure)
8. [Fragility, tech debt & open questions](#8-fragility-tech-debt--open-questions)
9. [Quick reference: file map](#9-quick-reference-file-map)

---

## 1. Architecture Overview

The **Digital Wall** is an aviation operations **flight-timeline display** — a "digital screen" meant to hang on a wall in an operations center and show, in near-real-time, every aircraft and its flights for the day laid out on a horizontal time axis (with a live "now" marker, delays, and operational limitations/NOTAM-style warnings).

In plain English, the pipeline is:

```
Leon (flight-ops SaaS, GraphQL API)
        │  refresh-token → access-token, then GraphQL queries
        ▼
Node backend adapter (digital-wall/server.mjs + leon-sync.mjs)
        │  polls Leon on an interval, normalizes flights/aircraft,
        │  caches them (local JSON file + optionally Supabase),
        │  overlays user-defined "limitations", exposes a REST-ish API
        ▼
React SPA (opsboard-react) served as static files behind nginx
        │  polls /api/timeline/flights every 60s, renders a timeline
        │  "Board" with a per-second live "now" marker
        ▼
Wall-mounted browser at https://clearway.verxyl.com/digital-wall/timeline
```

Key characteristics:

- **Data source:** [Leon](https://www.leon.aero/) flight-operations software, per-operator, via GraphQL. Each operator ("oprId" = Leon subdomain prefix) authenticates with its own refresh token.
- **Multi-operator:** one screen can aggregate flights from several Leon operators at once.
- **Storage:** a local JSON cache (`digital-wall/data/timeline-cache.json`) always; **Supabase (Postgres)** optionally for operator credentials + aircraft visibility + flight cache.
- **Two backend implementations exist** (see §4.2) — a standalone Node HTTP server (the one actually run) and a Next.js/TypeScript implementation with webhooks + cron (apparently intended to fold into the parent Clearway app).
- **Deployment:** Docker Compose (backend + static React frontend + nginx path-router gateway), published under the `/digital-wall/*` path of `clearway.verxyl.com` via Cloudflare Tunnel (or host nginx).

---

## 2. Where the "screen" lives (repo context)

`/root/clearway-2` is a **large, multi-purpose monorepo**. The bulk of it is unrelated aviation tooling: AIP (Aeronautical Information Publication) scrapers/extractors (`aips/`, `*.py`, `data/`, `usa-aip/`, `downloads/`), a Next.js portal app (`app/`, `middleware.ts`), a "pickem" football game (`app/pickem`, `app/playoffs`, recent git commits), NOTAM/weather workers (`workers/`, `scripts/`), etc.

The **Digital Wall "digital screen"** is a self-contained subsystem in two directories:

| Directory | Role |
|-----------|------|
| `digital-wall/` | The backend adapter + a Vite React prototype + admin HTML pages + Docker + migrations |
| `opsboard-react/` | The **production** React SPA that actually renders the timeline screen |
| `deploy/digital-wall/` | nginx gateway config + Cloudflare Tunnel example |
| `docs/digital-wall-server-deploy.md`, `docs/cursor-cli-digital-wall-handoff.md` | Deployment / integration docs |

Everything below focuses on those.

---

## 3. Project structure

```
digital-wall/
├── server.mjs                 # ★ Live backend: Node http server + REST API + static file server
├── leon-sync.mjs              # ★ LeonTimelineService — Leon GraphQL sync, cache, limitations logic
├── operators-store.mjs        # ★ OperatorsStore — Supabase/local-JSON storage + token encryption
├── package.json               # dev = "node --env-file=.env server.mjs"
├── Dockerfile                 # node:22-alpine, runs npm run dev
├── docker-compose.yml         # local-only compose (mounts ../164.92.164.35 as upstream)
├── .env.example               # Leon + Supabase env template
├── README.md                  # Usage / API / env docs
│
├── upstream/                  # Static seed served at "/" (PLACEHOLDER — see note)
│   ├── timeline.html          #   269-byte stub "Digital Wall Upstream Seed"
│   └── api/flights/data.html  #   contains literally "[]"
│
├── data/                      # Local cache dir (git-kept empty); runtime writes:
│   │                          #   timeline-cache.json, aircraft-visibility.json
│   └── .gitkeep
│
├── src/                       # Vite React PROTOTYPE (mock data only — not the prod UI)
│   ├── App.tsx / main.tsx
│   ├── components/DigitalWallScreen.tsx, FlightTimeline.tsx, FlightsTablePanel.tsx,
│   │              LeftAgendaPanel.tsx, LimitationsPanel.tsx, StatusLegend.tsx, WorldClockBar.tsx
│   ├── data/mock-data.ts      #   hard-coded sample flights
│   └── types.ts
│
├── backend/                   # Next.js/TypeScript backend (PARALLEL impl — not run by server.mjs)
│   ├── app/api/leon/
│   │   ├── operators/route.ts        # GET/POST operators (admin-guarded)
│   │   ├── sync/run/route.ts         # POST run sync (admin OR cron secret)
│   │   ├── sync/status/route.ts      # GET operator sync status
│   │   └── webhooks/route.ts         # POST Leon webhook receiver
│   ├── lib/leon/
│   │   ├── client.ts                 # GraphQL request w/ retry
│   │   ├── token-manager.ts          # access-token cache/refresh
│   │   ├── sync.ts                   # runLeonSync() window sync
│   │   ├── webhooks.ts               # processLeonWebhook() idempotent handler
│   │   ├── store.ts                  # Supabase table CRUD
│   │   ├── mappers.ts                # raw Leon → normalized records
│   │   └── types.ts                  # TS types
│   └── migrations/
│       ├── 20260515_create_leon_sync_tables.sql
│       └── 20260515_add_operator_tokens_and_aircraft_visibility.sql
│
├── index.html, operators.html, aircrafts.html, backend-test.html   # admin HTML pages
├── admin-common.css, wall-menu.js                                  # shared admin styling + ☰ menu
└── (backend-test.html / current.html.save / *.save — scratch)

opsboard-react/                # ★ PRODUCTION timeline UI (React 19 + Vite 8)
├── src/
│   ├── App.jsx                # tab shell (timeline/aircrafts/operators/limitations) + 60s poll
│   ├── components/
│   │   ├── Board.jsx          # ★ timeline rendering engine (lanes, now-marker, scroll)
│   │   ├── FlightPill.jsx     # individual flight bar
│   │   ├── Header.jsx
│   │   ├── AircraftsPage.jsx  # hide/show aircraft on the wall
│   │   ├── OperatorsPage.jsx  # add/manage Leon operators
│   │   ├── LimitationsPage.jsx# CRUD custom limitations
│   │   └── LimToast.jsx
│   ├── services/timelineApi.js   # ★ all backend calls + response mapping
│   └── data.js               # schema docs + demo AIRCRAFT + helpers (p2, clamp)
├── Dockerfile                # build Vite → serve dist via nginx:1.27
├── nginx.conf                # SPA fallback
└── vite.config.js            # base=VITE_BASE_PATH, dev proxy /api → :5174

deploy/digital-wall/
├── nginx-gateway.conf        # path router: /digital-wall/{timeline,aircrafts,...} → frontend/backend
└── cloudflared-config.example.yml
```

> **Important note on `upstream/`:** The committed `upstream/timeline.html` is only a **269-byte placeholder** ("Digital Wall Seed Timeline") and `upstream/api/flights/data.html` is just `[]`. The README and `digital-wall/docker-compose.yml` reference a sibling directory `../164.92.164.35` (a downloaded copy of the *real* production Clearway timeline SPA from that IP). **That directory is NOT present in this repo.** `server.mjs` resolves its static root as the first of `[./upstream, ../164.92.164.35]` that contains both `timeline.html` and `api/flights/data.html` — so with only the seed present it serves the stub. In production the `opsboard-react` build is the real UI (served by a separate nginx container), and `server.mjs` is used purely as the **API backend**; its own static-serving path is a legacy/local-dev artifact.

---

## 4. Backend

### 4.1 Runtime & framework

- **Language/runtime:** Node.js (ESM, `"type": "module"`), targeting **node:22-alpine** in Docker.
- **The live backend uses NO web framework** — it's the raw `node:http` module in `digital-wall/server.mjs`. No Express/Fastify.
- **Dependencies of the live backend:** none beyond Node built-ins for the server itself; the React prototype in `src/` pulls in React/Tailwind but is not part of the running backend. (`digital-wall/package.json` deps are for the Vite prototype only.)
- **The parallel `backend/` implementation** is written for **Next.js App Router** (`next/server`, `@/lib/...` path aliases) and **Supabase JS client** — clearly meant to be merged into the parent `clearway-2` Next.js app, not run standalone.

### 4.2 The two backends

There are **two independent backend implementations** of the same Leon-sync concept. This is the single most important thing to understand about the backend:

| | **A. `digital-wall/server.mjs` (+ `leon-sync.mjs`, `operators-store.mjs`)** | **B. `digital-wall/backend/` (Next.js TS)** |
|---|---|---|
| Actually run? | **YES** — `npm run dev` = `node --env-file=.env server.mjs`; Docker `command: node server.mjs` | Not wired to `server.mjs`; intended for the parent Next.js app |
| Web layer | raw `node:http` | Next.js route handlers |
| Sync trigger | **in-process `setInterval` poll** (default 30 s) + on-demand | **manual POST**, **cron secret**, and **webhooks** |
| Storage | local JSON cache always; Supabase via `OperatorsStore` optional | Supabase-only (via `@/lib/supabase-admin`) |
| Token refresh | `LeonTimelineService.getAccessToken` (25-min TTL, per operator) | `lib/leon/token-manager.ts` (30-min TTL, single `LEON_ADMIN_REFRESH_TOKEN`) |
| Incremental sync | Leon `getModifiedFlightList` delta since checkpoint | fixed window (−1d … +2d), full re-upsert + mark-missing-deleted |
| Auth | mocked/none (see §4.7) | `requireAdmin()` + cron/webhook shared secrets |

> ⚠️ **They are not integrated with each other.** `server.mjs` never imports anything from `backend/`. Treat B as "the intended production-grade version" that has diverged from A (the one that actually ships in the Docker stack). Flagged again in §8.

The rest of §4 documents **backend A** (the live one) in detail, then summarizes **backend B**.

### 4.3 API routes (server.mjs — the live backend)

All handlers are in `digital-wall/server.mjs` (a single `http.createServer` request switch). Responses are JSON unless noted. There is no router library; matching is by `pathname` + `req.method`.

**Auth / user (mocked):**

| Method | Path | Purpose | Response |
|---|---|---|---|
| `*` | `/api/auth/*` | Bypass login locally | `mockAuthPayload` (fake tokens + ADMIN user) |
| GET | `/api/user`, `/api/users/me`, `/api/profile` | Current user | `mockAuthPayload.user` |

**Operators:**

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/api/operators?includeInactive=` | List operators | `{ ok, storage, operators[] }` from `OperatorsStore` |
| POST | `/api/operators` | Upsert operator (name, oprId, refreshToken, isActive) | triggers `refreshNow()`; refresh token **encrypted at rest** |
| PATCH | `/api/operators/:id` | Activate/deactivate operator (`{ isActive }`) | triggers `refreshNow()` |

**Aircraft visibility & schedule:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/aircraft/schedule?days=7&refresh=true` | Per-aircraft flight counts over N days + hidden flag |
| GET | `/api/aircraft/visibility` | `{ hidden: ["oprId:REG", ...] }` |
| PUT | `/api/aircraft/visibility` | Body `{ oprId, registration, isHidden }` → hide/show on the wall |

**Timeline (the core screen feed):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/timeline/flights?from&to&oprId&refresh&allOperators` | **Primary feed.** Grouped-by-aircraft flights, limitation-decorated |
| GET | `/api/timeline/aircraft?oprId&refresh&allOperators` | Aircraft list (optionally from Leon `aircraftList`) |
| GET | `/api/timeline/sync-status` | Sync health: source, lastRunAt, lastError, counts, pollMs, storage |
| POST | `/api/timeline/refresh` | Force an immediate `runSyncCycle()` |

**Limitations (custom operational warnings):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/timeline/limitations?includeInactive=` | List custom limitations |
| POST | `/api/timeline/limitations` | Create/update `{ title, description, type, airportIcaos[], countries[], isActive }` |
| PATCH | `/api/timeline/limitations/:id` | Toggle active (`{ isActive }`) |
| DELETE | `/api/timeline/limitations/:id` | Delete |

**Reference lookups (for the Limitations editor):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/airports/search?q&limit` | Airport ICAO/name/country search from a local airport directory |
| GET | `/api/countries?q&limit` | Country list |

**Legacy compatibility (for the old copied SPA):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/flights/data?from&to` | Old timeline shape (aircraft → flights with `flightWatch`, weather, `limitations`) |
| GET | `/api/limitations` | Old limitations payload shape |

**Static/UX routes:** `/` → 302 `/timeline`; `/backend-test`, `/operators`, `/aircrafts` serve local admin HTML; `/admin-common.css`, `/wall-menu.js` serve assets; anything else is served from the static root, with two on-the-fly HTML rewrites — injecting a **localStorage auth-bypass script** into `timeline.html`, and rewriting `http://164.92.164.35:80/api` → `/api` inside the old bundle `app.ea7fb7f2.js`.

**`/api/timeline/flights` response shape (abbreviated):**

```jsonc
{
  "source": "leon-live-multi",       // or leon-live / local-cache / static-seed
  "syncedAt": "2026-07-02T…Z",
  "totalFlights": 128,
  "totalAircraft": 14,
  "oprId": null,                      // null when allOperators
  "operators": ["acme", "beta"],
  "aircraft": [
    {
      "oprId": "acme", "operatorName": "ACME", "aircraftNid": 123, "registration": "LY-CHF",
      "flights": [
        {
          "flightNid": "…", "flightNo": "KLJ6305", "status": "…",
          "startTimeUTC": "…", "endTimeUTC": "…",
          "etd": "…","eta": "…","atd": "…","ata": "…",
          "departureDelayMin": 30, "arrivalDelayMin": 30, "delayMin": 30,
          "delayedDepartureUTC": "…", "delayedArrivalUTC": "…",
          "adep": { "icao":"EGKB","name":"…","city":"…","weather":null },
          "ades": { "icao":"LIRQ", … },
          "crewCount": 4, "passengerCount": 2, "isCnl": false,
          "limitationIds": ["LIM-…"], "limitations": [ … ], "lim": { "type":"WX","msg":"…" }
        }
      ]
    }
  ]
}
```

### 4.4 API routes (Next.js TS backend — the parallel implementation)

Under `digital-wall/backend/app/api/leon/` (Next.js route handlers). These are **admin-guarded** via `requireAdmin()` (from the parent app's `@/lib/admin-auth`) unless a shared secret is supplied.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/leon/operators` | admin | List all operators (incl. inactive) from Supabase |
| POST | `/api/leon/operators` | admin | Upsert operator `{ oprId, name, notes, isActive }` (no refresh token here) |
| POST | `/api/leon/sync/run` | admin **or** `x-leon-sync-secret` = `LEON_SYNC_CRON_SECRET` | Run a full sync (`source = manual|scheduled`) |
| GET | `/api/leon/sync/status` | admin | Per-operator `last_sync_at/status/error` |
| POST | `/api/leon/webhooks` | `x-leon-webhook-secret` (or `?secret=`) = `LEON_WEBHOOK_SECRET` | Ingest Leon webhook events idempotently |

Webhook handling (`lib/leon/webhooks.ts`): validates `oprId`, computes an **idempotency key** (`x-leon-event-id` → payload id → sha256(body)), inserts a `leon_webhook_events` row (duplicate-safe via unique key), then dispatches by parsed type: `new_aircraft`, `new_flight`/`edited_flight` (upsert), `deleted_flight` (upsert as `is_deleted`), else `ignored`. Marks each event `processed|ignored|failed`.

### 4.5 Data models & database schema

**Normalized in-memory flight** (produced by `mapLeonFlight`/`mapStaticFlight` in `leon-sync.mjs`): `flightNid, flightNo, tripNo, tripCode, status, startTimeUTC, endTimeUTC, etd/eta/atd/ata, departureDelayMin, arrivalDelayMin, delayMin, delayedDepartureUTC, delayedArrivalUTC, aircraftRegistration, isCnl, flightLastModificationTime, adep{icao,iata,name,city,weather}, ades{…}, crewCount, passengerCount, oprId`. It handles Leon's inconsistent time formats (unix seconds, unix millis, numeric strings, ISO — see `normalizeDateLike`).

**Custom limitation** (`upsertCustomLimitation`): `{ id, title, description, type (default "OPS"), airportIcaos[], countries[], isActive, createdAt, updatedAt }`. Matched to flights by dep/arr ICAO **or** dep/arr country (country resolved from the local airport directory).

**Supabase / Postgres schema** (from `backend/migrations/`):

- **`leon_operators`** — `id (uuid pk), opr_id (unique), name, notes, is_active, last_sync_at, last_sync_status (idle|success|error), last_sync_error, created_at, updated_at`. Later migration adds **`refresh_token text`** (stored **AES-256-GCM encrypted**, prefix `enc:v1:iv:tag:body`).
- **`leon_aircraft`** — `operator_id (fk), registration, acft_type_id/icao/short_name/iata, pax_capacity, raw_payload jsonb, …` unique `(operator_id, registration)`.
- **`leon_flights`** — `operator_id (fk), flight_nid, flight_no, date_trip, trip_code, departure_icao, arrival_icao, estimated_/actual_ departure/arrival, delay_minutes, aircraft_registration, status, is_deleted, flight_last_modification_time, raw_payload jsonb, …` unique `(operator_id, flight_nid)`, indexed on time/updated/deleted.
- **`leon_webhook_events`** — `operator_id (nullable fk), opr_id, event_type, idempotency_key (unique), payload jsonb, status (received|processed|failed|ignored), processed_at, error`.
- **`leon_aircraft_visibility`** — `operator_id (fk), opr_id, registration, is_hidden`, unique `(opr_id, registration)`.

**Storage mapping in the live backend** (`operators-store.mjs`): talks to Supabase via the **PostgREST REST API** (`/rest/v1/…`, service-role key) — not the JS client. Falls back to **local JSON** files (`data/aircraft-visibility.json`) when Supabase is unconfigured/unreachable; `storageMode()` returns `supabase | supabase-unavailable | local-json`. Operator credentials, however, **require Supabase** (the live store throws "Supabase is required for operators storage" for operator CRUD).

### 4.6 Leon sync engine & background jobs

`LeonTimelineService` in `digital-wall/leon-sync.mjs` is the heart of backend A.

- **Auth to Leon:** per-operator `getAccessToken(oprId)` exchanges a refresh token for an access token (cached 25 min). Two modes:
  - API-key mode: `POST https://{oprId}.leon.aero/access_token/refresh/` (form `refresh_token`), returns raw token text.
  - OAuth mode (if `LEON_CLIENT_ID/SECRET` set): `POST /oauth2/code/token/` `grant_type=refresh_token`.
  - Sandbox: `LEON_SANDBOX=true` → `{oprId}.sandbox.leon.aero`.
- **GraphQL:** `POST https://{oprId}.leon.aero/api/graphql/` with `Bearer` token, 20 s abort timeout. Queries used: `aircraftList`, `flightList(filter:{timeInterval})`, and `flights.getModifiedFlightList(dateTime)`.
- **Poll loop (background job):** `startPolling()` sets a `setInterval` at `LEON_SYNC_POLL_MS` (default **30 s** in code; `.env.example` suggests 600000 = 10 min). Each tick runs `runSyncCycle()`.
- **`runSyncCycle()`** iterates all configured operators; for each it fetches aircraft, then:
  - **Initial sync** (first time per operator): windowed `flightList` from `LEON_SYNC_RANGE_START` (default now−7d) to `RANGE_END` (default now+30d), chunked in ~92-day blocks; records a checkpoint timestamp.
  - **Incremental sync** (thereafter): `getModifiedFlightList(dateTime=lastCheckpoint)` → applies `created`/`changed` upserts and `deleted` removals; advances the checkpoint.
- **Caching:** flights live in `Map`s keyed `oprId:flightNid`; persisted to `data/timeline-cache.json` after cycles that changed data. On boot, cache is loaded first; if empty, static seeds are loaded.
- **Limitations overlay:** `decorateFlightWithLimitations()` attaches matching active limitations to each flight before serving.
- **Status:** `getStatus()` exposes `source, healthy, lastRunAt, lastError, pollMs, flightsCached, operatorsSynced, storage, cacheStats{updated,skipped,deleted}`.

**Backend B** does the same conceptually but via `runLeonSync()` over a fixed **−1 day … +2 day** window, upserting into Supabase and marking missing flights deleted; it is driven externally (cron secret / webhook / manual) rather than an in-process timer. **No WebSockets** exist in either backend — the screen updates by **HTTP polling** (see §5.4). Backend B additionally supports **Leon webhooks** for push updates into Supabase.

### 4.7 Authentication / authorization

- **Live backend (A):** effectively **unauthenticated**. `/api/auth/*` returns a canned `mockAuthPayload` with an ADMIN user and far-future tokens; `timeline.html` gets a script injected that seeds `localStorage` to bypass any client login. This is a **local-prototype/appliance posture** — access control is expected to come from the network edge (Cloudflare Tunnel / nginx / being on a trusted ops LAN), **not** from the app. ⚠️ Anyone who can reach the backend can read all flights and add/modify operators & limitations.
- **Parallel backend (B):** proper `requireAdmin()` on operator/sync/status routes; **shared-secret** headers for cron (`LEON_SYNC_CRON_SECRET`) and webhooks (`LEON_WEBHOOK_SECRET`).
- **Secrets at rest:** Leon refresh tokens are **AES-256-GCM encrypted** before being written to `leon_operators.refresh_token`, using a key derived (`sha256`) from `LEON_REFRESH_TOKEN_ENCRYPTION_KEY` (or `LEON_TOKEN_ENCRYPTION_KEY`). Decryption is transparent; legacy plaintext values are tolerated.

### 4.8 Configuration & environment variables

From `digital-wall/.env.example`, `README.md`, and code (names + purpose only):

| Variable | Used by | Purpose |
|---|---|---|
| `PORT` | server.mjs | Listen port (default 5173; Docker uses 5174) |
| `LEON_OPR_ID` | leon-sync | Single-operator fallback (Leon subdomain prefix) |
| `LEON_REFRESH_TOKEN` | leon-sync | Refresh token for the env-default operator |
| `LEON_CLIENT_ID` / `LEON_CLIENT_SECRET` | leon-sync | Enable OAuth refresh mode (optional) |
| `LEON_SANDBOX` | leon-sync, client.ts | Use `*.sandbox.leon.aero` endpoints |
| `LEON_SYNC_POLL_MS` | leon-sync | Poll interval (code default 30 000; example 600 000) |
| `LEON_SYNC_RANGE_START` / `_END` | leon-sync | Initial-sync bootstrap date range |
| `NEXT_PUBLIC_SUPABASE_URL` | operators-store | Supabase project URL (enables Supabase storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | operators-store | Supabase service-role key (server-side) |
| `LEON_REFRESH_TOKEN_ENCRYPTION_KEY` / `LEON_TOKEN_ENCRYPTION_KEY` | operators-store | Secret used to encrypt refresh tokens at rest |
| `LEON_ADMIN_REFRESH_TOKEN` | backend/token-manager | Single admin refresh token (backend B) |
| `LEON_SYNC_CRON_SECRET` | backend/sync/run | Shared secret for scheduled sync trigger |
| `LEON_WEBHOOK_SECRET` | backend/webhooks | Shared secret to authenticate Leon webhooks |
| `VITE_BASE_PATH` | opsboard-react build | Base path (`/digital-wall/timeline/` in prod) |
| `VITE_API_BASE_URL` | opsboard-react | API prefix (`/digital-wall` in prod, or `localhost:5174`) |

### 4.9 Startup sequence & dependencies

`node server.mjs`:
1. Resolve static root = first of `[./upstream, ../164.92.164.35]` containing `timeline.html` + `api/flights/data.html`; **throws if neither exists**.
2. `new OperatorsStore()` and `new LeonTimelineService({ staticRoot, operatorsStore })`.
3. `await timelineService.bootstrap()` → load airport directory, load local cache (else static seeds), determine if any operator is configured; if so run one sync cycle **and start the poll interval**.
4. `server.listen(PORT, "0.0.0.0")`.

**External dependencies:** Leon GraphQL API (per operator); optionally Supabase (Postgres/PostgREST). A local **airport directory JSON** (`shared-data/ead-airports-with-names.json` or `../data/airports.json` — candidate paths) enables country/airport lookups & limitation-by-country matching; it degrades gracefully if absent (country matching just won't work).

---

## 5. Frontend

### 5.1 The three frontends

There are **three** distinct UI codebases in play — a real source of confusion:

1. **`opsboard-react/`** — **the production screen.** React 19 + Vite 8, built to static files, served by its own nginx container behind `/digital-wall/timeline`. Talks to backend A's `/api/*`. **This is what actually renders on the wall.**
2. **`digital-wall/src/`** — a **Vite + React 18 + Tailwind prototype** (`DigitalWallScreen`) using only hard-coded `mock-data.ts`. It has its own timeline, flights table, world-clock bar, status legend. It is a **design mock**, not wired to any backend, and `npm run dev` does **not** run it (that runs `server.mjs`; `dev:vite` would run it).
3. **`digital-wall/upstream/` (or `../164.92.164.35`)** — a **downloaded copy of the original Clearway timeline SPA** (minified `app.ea7fb7f2.js`). In this repo it's only the 269-byte seed. `server.mjs` can serve/patch it for local replay, but it's legacy.

### 5.2 opsboard-react (production UI)

- **Build tooling:** Vite 8, `@vitejs/plugin-react`, React 19, plain JSX (no TS), no router library. `base` comes from `VITE_BASE_PATH`. Dev proxy sends `/api` → `http://localhost:5174`.
- **"Routing":** `App.jsx` is a **tab switcher** (`useState('timeline'|'aircrafts'|'operators'|'limitations')`), not react-router. Initial tab is derived from the last URL segment; switching tabs `history.replaceState`s `/digital-wall/{view}`. The nginx gateway maps each of those top-level paths to the same SPA.
- **Pages/components:**
  - `Board.jsx` (530 lines) — the timeline canvas (see §5.4).
  - `FlightPill.jsx` — a single flight bar (delay segments, status color, limitation badges).
  - `AircraftsPage.jsx` — lists aircraft w/ next-7-day flight counts; toggles wall visibility via `PUT /api/aircraft/visibility`.
  - `OperatorsPage.jsx` — add/list/activate Leon operators (name, prefix, refresh token).
  - `LimitationsPage.jsx` — CRUD custom limitations with airport/country pickers.
  - `Header.jsx`, `LimToast.jsx`.
  - `services/timelineApi.js` — **the entire backend contract** for the UI (all `fetch`es + response normalization).

### 5.3 State management & data flow

- **No Redux/Zustand/Context** — plain React `useState`/`useEffect` local state in `App.jsx`, props down to `Board`.
- `App.jsx` owns `aircraft`, `limitations`, `windowStartUtc/EndUtc`, `loading`, `error`, `source`.
- `services/timelineApi.js`:
  - `fetchTimelineAircraft()` requests `/api/timeline/flights?allOperators=true&refresh=true&from&to` for an ops window of **now−1 day … now+4 days**, plus active limitations, and **maps** backend flights to the UI shape (`fn, dep, arr, etd, eta, dlyMin, status, startUtcMs, delayedStartUtcMs, scheduledEndUtcMs, endUtcMs, limitationIds, limitations`). `status` is derived client-side: cancelled→`slot`, has ATA→`arrived`, has ATD→`airborne`, delay>0→`delayed`, else `scheduled`.
  - Also exposes `fetchAircraftSchedule`, `setAircraftVisibility`, `fetchOperators`, `upsertOperator`, `setOperatorActive`, `fetchLimitations`, `upsertLimitation`, `setLimitationActive`, `deleteLimitation`, `searchAirports`, `fetchCountries`.

### 5.4 How the screen renders & updates

This is the "screen-specific" logic:

- **Timeline refresh (data):** `App.jsx` calls `loadTimeline()` on mount and then every **60 000 ms** (`setInterval`). A manual **Refresh** button also exists. Each load re-fetches the whole window with `refresh=true` (which forces a live Leon sync server-side).
- **Live "now" marker (visual):** `Board.jsx` keeps `nowMs` in state and updates it every **1 000 ms** (`setInterval(() => setNowMs(Date.now()), 1000)`), driving a moving vertical "now" line + `HH:MM UTC` label. A **"Now"** button re-centers the scroll on the current time (`centerNowInView`).
- **Time window & scale:** the window is `windowStartUtc…windowEndUtc` from the API (or a fallback of now−6h…+24h). Viewport shows `VIEWPORT_HOURS = 10` hours wide, `BEFORE_NOW_HOURS = 3` of lead-in; `pxPerHour = visibleTimelineWidth / 10`; total timeline width scales to the whole window and is horizontally scrollable (header + body scroll are synced via refs).
- **Layout engine (lane packing):** `assignFlightLanes()` greedily packs each aircraft's flights into non-overlapping horizontal **lanes** (rows), enforcing a minimum visual duration of **45 min** per flight and a **14 px** gap, so overlapping/adjacent flights stack vertically within the aircraft's band. Each flight's on-screen extent spans scheduled start → the max of (delayed departure crossing, scheduled arrival, delayed arrival).
- **Flight rendering (`FlightPill.jsx`):** renders the flight as a colored pill (color by status via `LEGEND`), showing delay portions (planned vs actual), CTOT/slot badges, and limitation chips colored by limitation type (`LIM_TYPE_COLOR`: AOG/WX/CREW/PAX/CTOT).
- **Limitations panel:** active limitations are shown alongside; hovering/selecting a limitation (`activeLimId`) highlights affected flights.
- **World-clock bar / flights table / left agenda:** present in the *prototype* (`digital-wall/src`) but the production `Board` focuses on the aircraft-lane timeline.

There is **no WebSocket or SSE** — "real-time" is HTTP polling (60 s data + 1 s clock).

---

## 6. Core logic / business rules end-to-end

Tracing one refresh cycle end-to-end:

1. **Wall browser** loads `https://clearway.verxyl.com/digital-wall/timeline` → Cloudflare Tunnel → gateway nginx → `digital-wall-frontend` (static `opsboard-react` build). SPA boots on the `timeline` tab.
2. **SPA polls** `GET /digital-wall/api/timeline/flights?allOperators=true&refresh=true&from=…&to=…` (prefix stripped by the gateway → `digital-wall-backend:5174` sees `/api/timeline/flights`).
3. **Backend A** (`server.mjs` → `LeonTimelineService.getFlights`): because `refresh=true`, it runs `runSyncCycle()` → for each active operator, refresh Leon access token → GraphQL `flightList`/`getModifiedFlightList` → normalize → update in-memory `Map`s → persist `timeline-cache.json`.
4. It then filters cached flights to the requested window, **drops hidden aircraft** (`leon_aircraft_visibility` / local JSON), **decorates each flight with matching limitations** (by ICAO/country), groups by `oprId:aircraftNid:registration`, and returns the JSON feed.
5. **SPA maps** the feed (`timelineApi.mapFlight`/`mapAircraft`), derives per-flight status and delay geometry, and stores it in `App` state.
6. **`Board`** packs flights into lanes, positions them on the time axis, and paints pills; a separate 1 s timer slides the "now" marker.
7. Meanwhile the **poll timer** repeats step 2 every 60 s; **admins** using the Operators/Aircrafts/Limitations tabs mutate state through the corresponding `/api/*` endpoints, which immediately affect the next timeline response.

**Queues/caches/schedulers/external services involved:**
- *Cache:* in-memory `Map`s + `data/timeline-cache.json`; optional Supabase `leon_flights` cache (used more by backend B / `operators-store` helpers).
- *Scheduler:* in-process `setInterval` poll (backend A); external cron via `LEON_SYNC_CRON_SECRET` (backend B).
- *External:* Leon GraphQL (required for live data), Supabase/PostgREST (optional), Cloudflare Tunnel (edge), a local airport-directory JSON (for country matching).
- *No message queue, no Redis, no WebSocket.*

---

## 7. Deployment / infrastructure

**Production stack** is defined in the **root** `docker-compose.yml` (the referenced separate `docker-compose.digital-wall.yml` from the handoff doc was **consolidated into root compose — the separate file does not exist**). Three services:

| Service | Image/build | Role | Port |
|---|---|---|---|
| `digital-wall-backend` | build `./digital-wall`, `command: node server.mjs`, env `PORT=5174` | Leon adapter API | internal 5174 |
| `digital-wall-frontend` | build `./opsboard-react` (Vite → nginx), args `VITE_BASE_PATH=/digital-wall/timeline/`, `VITE_API_BASE_URL=/digital-wall` | static React SPA | internal 80 |
| `digital-wall-gateway` | `nginx:1.27-alpine` + `deploy/digital-wall/nginx-gateway.conf` | path router | published `127.0.0.1:8088:80` |

(The root compose also runs unrelated services: `clearway-selfhosted` portal on 3000, a `pickem` app, selenium, NOTAM/weather/AIP workers, n8n.)

**Gateway routing** (`nginx-gateway.conf`): `/digital-wall/{timeline,aircrafts,limitations,operators}` and `/digital-wall/timeline/*` → **frontend**; **all other** `/digital-wall/*` (incl. `/api/*`, `/backend-test`) → **backend**, with the `/digital-wall` prefix **rewritten away** so the backend still sees `/api/...`.

**Public exposure:** Cloudflare Tunnel (`cloudflared`) ingress maps `hostname clearway.verxyl.com, path /digital-wall/.*` → `http://127.0.0.1:8088`, with the main app (`:3000`) as the fallback route. Alternative: a host-nginx `location /digital-wall/ { proxy_pass 127.0.0.1:8088; }`. The gateway is intentionally bound to localhost only — not exposed directly to the internet.

**Local dev options:**
- `cd digital-wall && npm run dev` → backend on :5173 serving whatever static root exists (needs `../164.92.164.35` for the real legacy UI).
- `cd digital-wall && docker compose up` → backend :5173 with `../164.92.164.35` mounted read-only as `/app/upstream`.
- `cd opsboard-react && npm run dev` → Vite dev server proxying `/api` to `:5174` (so run backend on 5174 alongside).
- `cd digital-wall && npm run build` → type-check + Vite build of the **prototype** only.

---

## 8. Fragility, tech debt & open questions

Things that look fragile, undocumented, or like tech debt (flagged explicitly per the brief):

1. **Two divergent backends (A vs B).** `server.mjs`/`leon-sync.mjs` (shipped) and `backend/` (Next.js, Supabase, webhooks, cron) implement overlapping logic differently (poll vs webhook, 25- vs 30-min token TTL, different sync windows, different auth). Only A runs in the Docker stack; B is orphaned unless merged into the parent app. High confusion/maintenance risk.
2. **Three frontends.** `opsboard-react` (prod) vs `digital-wall/src` (mock prototype) vs the copied upstream SPA. Easy to edit the wrong one. The `digital-wall/src` prototype and the `upstream` seed are effectively dead weight in the running system.
3. **Missing external assets.** `../164.92.164.35` (real legacy UI) is referenced by README + `digital-wall/docker-compose.yml` but **absent** from the repo; the committed `upstream/` is only a 269-byte stub. `digital-wall/docker-compose.yml` would fail to mount it. The doc-referenced `docker-compose.digital-wall.yml` also doesn't exist (folded into root compose) — docs are stale.
4. **Auth posture of backend A.** No authentication at all on the live backend — operator creation, limitation edits, and full flight data are open to anyone who can reach `:8088`/the tunnel path. Security depends entirely on the edge. The mock-ADMIN + localStorage-injection is prototype-grade.
5. **Poll interval mismatch.** Code default `LEON_SYNC_POLL_MS = 30 s` vs `.env.example`'s `600000` (10 min). Without env override the backend hits Leon every 30 s per operator, and the UI additionally forces `refresh=true` every 60 s — meaning the browser can trigger a **fresh multi-operator Leon sync every 60 s regardless of the poll timer**, which is heavy and could hit Leon rate limits with several operators.
6. **`refresh=true` on every UI poll** couples UI cadence to upstream API load; there's no debounce/lock, so concurrent tabs multiply Leon calls.
7. **On-the-fly HTML/JS string rewriting** in `server.mjs` (injecting scripts into `timeline.html`, replacing a hard-coded `http://164.92.164.35:80/api` in `app.ea7fb7f2.js`) is brittle and tied to a specific bundle filename.
8. **`safeJoin` path check** uses `resolved.startsWith(root)` without a trailing-separator guard — a sibling dir sharing the prefix could theoretically pass; low risk given usage but worth hardening.
9. **Supabase access via raw PostgREST fetch** in `operators-store.mjs` (string-built filters, e.g. `id=eq.${id}`) rather than a client library — works but is easy to break and mixes camel/snake casing defensively.
10. **Repo hygiene:** a `token.txt` and a populated `.env` are present at repo root (untracked per git status, but on disk) — verify no secrets are committed.

**Open questions I could not resolve from the code alone:**
- Which backend is *intended* to be canonical going forward (A or B)? The docs imply A ships now but B is the "integrate into the main app" target.
- Whether Leon webhooks (backend B) are actually configured/registered anywhere (no registration code found — only the receiver).
- The exact production value of `LEON_SYNC_POLL_MS` and whether `NEXT_PUBLIC_SUPABASE_URL`/service key are set in the deployed `.env` (the real `.env` was not fully inspected for values).

---

## 9. Quick reference: file map

| Concern | File(s) |
|---|---|
| Live backend HTTP + routes | `digital-wall/server.mjs` |
| Leon sync / cache / limitations | `digital-wall/leon-sync.mjs` |
| Operator + visibility storage (Supabase/local) | `digital-wall/operators-store.mjs` |
| Parallel Next.js backend | `digital-wall/backend/lib/leon/*.ts`, `digital-wall/backend/app/api/leon/**/route.ts` |
| DB schema | `digital-wall/backend/migrations/*.sql` |
| Production UI shell + poll | `opsboard-react/src/App.jsx` |
| Timeline rendering engine | `opsboard-react/src/components/Board.jsx`, `FlightPill.jsx` |
| UI ↔ backend contract | `opsboard-react/src/services/timelineApi.js` |
| Admin pages | `opsboard-react/src/components/{Aircrafts,Operators,Limitations}Page.jsx`; `digital-wall/{operators,aircrafts,backend-test}.html` |
| Design prototype (mock) | `digital-wall/src/**` |
| Docker stack | root `docker-compose.yml` (services `digital-wall-*`), `digital-wall/Dockerfile`, `opsboard-react/Dockerfile` |
| Reverse proxy / routing | `deploy/digital-wall/nginx-gateway.conf`, `opsboard-react/nginx.conf` |
| Public exposure | `deploy/digital-wall/cloudflared-config.example.yml`, `docs/digital-wall-server-deploy.md` |
| Env template | `digital-wall/.env.example` |
| Integration/deploy notes | `docs/digital-wall-server-deploy.md`, `docs/cursor-cli-digital-wall-handoff.md` |

---

*End of report.*
