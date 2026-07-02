# AIP & NOTAM Backend — Investigation Report

> Investigated: 2026-07-02
> Repo root: `/root/clearway-2`
> Purpose: understand the AIP (Aeronautical Information Publication) and NOTAM (Notice to Airmen) backend well enough to build a future API integration against it.

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
   - [1.1 HTTP API endpoints (Next.js portal)](#11-http-api-endpoints-nextjs-portal)
   - [1.2 Internal sync-server endpoints (workers)](#12-internal-sync-server-endpoints-workers)
   - [1.3 Auth mechanisms at a glance](#13-auth-mechanisms-at-a-glance)
2. [Architecture Overview](#2-architecture-overview)
3. [Project structure (AIP/NOTAM-relevant)](#3-project-structure-aipnotam-relevant)
4. [Data sources & ingestion](#4-data-sources--ingestion)
   - [4.1 NOTAM sources](#41-notam-sources)
   - [4.2 Weather (OPMET/METAR/TAF) source](#42-weather-source)
   - [4.3 AIP sources](#43-aip-sources)
   - [4.4 Data formats & parsing](#44-data-formats--parsing)
5. [Backend architecture](#5-backend-architecture)
   - [5.1 Runtime & framework](#51-runtime--framework)
   - [5.2 Two deployment models](#52-two-deployment-models)
   - [5.3 Storage layer](#53-storage-layer)
   - [5.4 Database (Supabase/Postgres)](#54-database-supabasepostgres)
   - [5.5 Caching, TTL & expiry](#55-caching-ttl--expiry)
6. [Data models / schemas](#6-data-models--schemas)
   - [6.1 NOTAM record](#61-notam-record)
   - [6.2 Weather record](#62-weather-record)
   - [6.3 AIP airport record](#63-aip-airport-record)
   - [6.4 GEN payload](#64-gen-payload)
7. [Authentication & access control](#7-authentication--access-control)
8. [Business logic specific to AIP/NOTAM](#8-business-logic-specific-to-aipnotam)
9. [Gaps, fragility & risks for external API use](#9-gaps-fragility--risks-for-external-api-use)
10. [Future API Integration Notes](#10-future-api-integration-notes)

---

## 1. Quick Reference

**One-paragraph orientation:** This is a **Next.js (App Router)** portal whose AIP/NOTAM endpoints are thin controllers. They do not talk to official aviation data feeds. Instead they read cached files from a **local filesystem** storage layer (keys like `notam/KJFK.json`, `aip/ead-pdf/EDDF.pdf`) and, on cache miss or `?sync=1`, call **internal "sync server" worker processes** that **scrape** third-party sources (SkyLink API, CrewBriefing, FAA, EUROCONTROL EAD, national eAIP sites, ASECNA) and extract fields from **PDF/HTML** (regex + LLM). Airport master data lives in a **Supabase** `airports` table.

### 1.1 HTTP API endpoints (Next.js portal)

Auth legend: **Auth'd** = any signed-in Supabase user (or internal debug secret); **None** = no auth in the route handler (but see [§7](#7-authentication--access-control) re: middleware/public-asset nuance); **User(filter)** = reads the user only to filter results.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notams?icao=&sync=&stream=` | **Auth'd** | NOTAMs for one ICAO; cache read, or `sync=1` triggers a live scrape via NOTAM sync server; `stream=1` = SSE progress. |
| GET | `/api/weather?icao=&sync=&stream=` | **Auth'd** | OPMET/METAR/TAF text for one ICAO; same cache/sync/stream model as NOTAMs. |
| GET | `/api/aip/ead?icao=&sync=&stream=&extract=&force=` | **Auth'd** | Extracted AIP AD-2 fields for an EAD (EUROCONTROL-covered) airport. 24h cache + 6h soft-stale. |
| GET/HEAD | `/api/aip/ead/pdf?icao=&inline=` | None | AD-2 source PDF for an EAD airport (triggers sync on miss). |
| GET | `/api/aip/usa?icao=&sync=&stream=&extract=` | None | Extracted AIP fields for a US airport (FAA static PDFs). |
| GET/HEAD | `/api/aip/usa/pdf?icao=&inline=` | None | US AD-2 source PDF (read-only, no sync fallback). |
| GET | `/api/aip/asecna?icao=&sync=&stream=&extract=` | None | AIP for an ASECNA (African) airport. |
| GET/HEAD | `/api/aip/asecna/pdf?icao=&inline=` | None | ASECNA AD-2 PDF. |
| GET | `/api/aip/asecna/gen/pdf?icao=` | None | ASECNA GEN 1.2 PDF. |
| GET | `/api/aip/scraper?icao=&sync=&stream=&extract=` | **Auth'd** | Extracted AIP for a **national-eAIP-scraper** country (non-EAD, non-US). 24h cache. |
| GET/HEAD | `/api/aip/scraper/pdf?icao=&inline=` | None | National-scraper AD-2 PDF. |
| GET | `/api/aip/scraper/gen/pdf?icao=` | None | National-scraper GEN 1.2 PDF. |
| GET | `/api/aip/gen?icao=\|prefix=` | None | GEN 1.2 text payload (raw + AI-rewritten), keyed by 2-letter country prefix. 24h cache. |
| GET | `/api/aip/gen/pdf?icao=&prefix=` | None | GEN 1.2 PDF (many key fallbacks; triggers sync on miss). |
| GET | `/api/aip/gen/pdf/exists?icao=\|prefix=` | None | `{ exists, source }` check for a GEN 1.2 PDF. |
| GET | `/api/aip/gen/sync?icao=&stream=` | **Auth'd** | Proxy that triggers a GEN sync on the AIP sync server. |
| GET | `/api/aip/gen-non-ead?prefix=\|icao=` | None | GEN 1.2 payload for non-EAD countries (AI-rewritten from stored PDF). |
| GET | `/api/aip/sync?icao=` | None | Thin proxy to AIP sync server `/sync` (returns raw sync JSON). |
| GET | `/api/aip/download-estimate?icao=&source=` | None | Estimated PDF fetch time from historical stats. |
| POST | `/api/aip/download-stats` | None | Record a PDF fetch duration (`{icao, source, duration_ms}`). |
| GET | `/api/aip-test/list` | None | Dev tool: list downloaded PDFs in `data/ead-aip/`. |
| POST | `/api/aip-test/download` | None | Dev tool: run EAD download script for an ICAO. |
| POST | `/api/aip-test/extract?useAi=` | None | Dev tool: run regex or AI extractor over downloaded PDFs. |
| GET | `/api/aip-test/extracted` | None | Dev tool: read `data/ead-aip-extracted.json`. |
| GET | `/api/aip-test/pdf?filename=` | None | Dev tool: serve a PDF from `data/ead-aip/`. |
| GET | `/api/aip-test/sync?icao=&extract=` | None | Dev tool: proxy to AIP sync server. |
| GET | `/api/airports?country=&state=` | User(filter) | Airport list for a country/state (Supabase + static merge). |
| GET | `/api/airports/list?country=&state=&include_deleted=` | User(filter) | Admin airport list incl. deleted (needs service role; `include_deleted` needs login). |
| GET | `/api/regions` | None | Region → countries grouping. |
| GET | `/api/country-service-status` | **Auth'd** | Per-country operational status (`operational`/`issues`/`in_work`/`not_checked`). |
| GET | `/api/asecna/job/[id]` | *(see file)* | Status of an ASECNA background PDF job. |
| POST | `/api/asecna/trigger-ad2` | *(see file)* | Enqueue an ASECNA AD-2 PDF job. |
| GET | `/files/<storage-key>` | None* | Serve any stored file (`/files/aip/ead-pdf/EDDF.pdf`, `/files/notam/KJFK.json`). *See [§7](#7-authentication--access-control) — effectively public for extensioned paths. |

> The `/api/admin/aip/clear-cache` route also exists (admin-guarded) for cache invalidation. Airports also have `/api/airports/delete` and `/api/airports/restore` (admin) for soft-hiding.

### 1.2 Internal sync-server endpoints (workers)

These are **not** part of the public portal API. They run as separate Node processes/containers and are called server-to-server by the portal via `NOTAM_SYNC_URL` / `WEATHER_SYNC_URL` / `AIP_SYNC_URL`. Auth is a shared secret sent as `X-Sync-Secret` header (or `?secret=`), configured via `SYNC_SECRET` (disabled if unset).

| Server | Default Port | Endpoint | Purpose |
|---|---|---|---|
| `scripts/notam-sync-server.mjs` | 3001 | `GET /sync?icao=&stream=` | Spawn NOTAM scraper, return `{icao, notams[], updatedAt}`. |
| `scripts/notam-sync-server.mjs` | 3001/3003 | `GET /sync/weather?icao=&stream=` | Spawn weather scraper, return `{icao, weather, updatedAt}`. |
| `scripts/aip-sync-server.mjs` | 3002 | `GET /sync?icao=&stream=&extract=&scraper=` | Download AD-2 PDF + extract fields. |
| `scripts/aip-sync-server.mjs` | 3002 | `GET /sync/gen?icao=\|prefix=` | Download GEN 1.2 PDF for a country. |

`SYNC_SERVER_MODE` (`all`|`notam`|`weather`) controls which routes the NOTAM server enables. `stream=1` returns `text/event-stream` with `data: {"step": "..."}` progress events and a final `{done:true, ...}` event.

### 1.3 Auth mechanisms at a glance

- **Portal user auth:** Supabase Auth (cookie session, `@supabase/ssr`). Roles: `none` / `admin` / `developer` (from Supabase user metadata, `ADMIN_EMAILS` env, or `user_preferences` table). Helpers: `requireAuthenticatedUser()`, `requireAdmin()`, `requireDeveloper()`.
- **Internal debug bypass:** header `x-debug-runner-secret` == `DEBUG_RUNNER_INTERNAL_SECRET` bypasses user auth (used by E2E/debug runner). Also bypasses middleware for `/api/*`.
- **Sync-server auth:** `X-Sync-Secret` header == `SYNC_SECRET` (portal sends `NOTAM_SYNC_SECRET`).
- **No API keys, no OAuth, no per-consumer credentials** exist for external API consumers today. See [§10](#10-future-api-integration-notes).

---

## 2. Architecture Overview

In plain English:

- The product is a flight-ops **portal** (Next.js) that shows pilots/dispatchers **AIP** data (airport publications) and **NOTAMs** (temporary notices) plus **weather** for an ICAO airport code.
- **There is no ingestion of official structured aeronautical data** (no AIXM/XML, no FAA NOTAM API/SWIM, no EUROCONTROL B2B). Everything is obtained by **scraping** third-party websites/APIs and **extracting text from PDFs/HTML**.
- Three ingestion "sync servers" run as background workers, each wrapping headless-browser (Playwright/Chromium) or HTTP scrapers:
  - **NOTAM** sync → SkyLink API (default in code) / CrewBriefing / FAA NOTAM Search.
  - **Weather** sync → SkyLink / CrewBriefing OPMET.
  - **AIP** sync → EUROCONTROL **EAD** (login + PDF download), **national eAIP** sites (~75 countries), **ASECNA** (African), **USA** (static FAA PDFs), **Russia** (python). Then a PDF field-extractor (regex and/or LLM) produces structured JSON.
- Results are written to a **filesystem storage** layer (`/storage`) under keys namespaced `notam/`, `weather/`, `aip/`. The portal reads those files; on miss or explicit `sync=1`, it calls the sync server to produce fresh data, then reads it back.
- **Airport master records** (which airports exist, coordinates, which source serves them, visibility) live in a **Supabase Postgres** `airports` table. A separate `asecna_jobs` table is a background job queue; `country_service_statuses` tracks per-country health; `pdf_download_stats` records fetch timings.
- **NOTAMs are per-ICAO, time-stamped, and never expired/deduplicated server-side** — the system stores whatever the source returned and displays it. There is **no geospatial/FIR/altitude/time indexing**.

```
                        ┌─────────────────────── Third-party sources ───────────────────────┐
                        │ SkyLink API (RapidAPI)   CrewBriefing   FAA NOTAM Search           │
                        │ EUROCONTROL EAD          national eAIP  ASECNA   FAA AIP  Russia    │
                        └───────────┬──────────────────┬──────────────────┬─────────────────┘
                     scrape/login   │                  │                  │
        ┌───────────────────────────▼───┐   ┌──────────▼───────┐   ┌──────▼───────────────┐
        │ notam-sync-server.mjs :3001    │   │ weather (:3001/3) │   │ aip-sync-server :3002 │
        │  /sync  /sync/weather          │   │  /sync/weather    │   │  /sync  /sync/gen     │
        └───────────────┬────────────────┘   └─────────┬────────┘   └──────────┬───────────┘
              write files│ notam/ICAO.json              │weather/ICAO.json      │aip/... .json/.pdf
                         ▼                              ▼                       ▼
                 ┌──────────────────────────── Filesystem storage (/storage) ───────────────────┐
                 └───────────────────────────────────────▲───────────────────────────────────────┘
                                                 read     │  (portal reads cache; sync on miss)
        ┌────────────────────────────────────────────────┴──────────────────────────────────────┐
        │ Next.js portal (:3000)   /api/notams  /api/weather  /api/aip/*  /api/airports  /files/* │
        │ Supabase: airports, asecna_jobs, country_service_statuses, pdf_download_stats            │
        └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Project structure (AIP/NOTAM-relevant)

```
app/api/
├── notams/route.ts                 # NOTAM endpoint (cache read / sync proxy / local spawn)
├── weather/route.ts                # Weather endpoint (same pattern)
├── aip/
│   ├── ead/route.ts, ead/pdf/route.ts
│   ├── usa/route.ts, usa/pdf/route.ts
│   ├── asecna/route.ts, asecna/pdf/route.ts, asecna/gen/pdf/route.ts
│   ├── scraper/route.ts, scraper/pdf/route.ts, scraper/gen/pdf/route.ts
│   ├── gen/route.ts, gen/pdf/route.ts, gen/pdf/exists/route.ts, gen/sync/route.ts
│   ├── gen-non-ead/route.ts
│   ├── sync/route.ts, download-estimate/route.ts, download-stats/route.ts
├── aip-test/                       # dev/QA tools (list/download/extract/extracted/pdf/sync)
├── airports/route.ts, airports/list/route.ts, airports/delete|restore/route.ts
├── regions/route.ts
├── country-service-status/route.ts
├── asecna/job/[id]/route.ts, asecna/trigger-ad2/route.ts
└── admin/aip/clear-cache/route.ts
app/files/[...path]/route.ts        # serves stored files at /files/<key>

scripts/
├── notam-sync-server.mjs           # NOTAM+weather sync HTTP server (:3001)
├── aip-sync-server.mjs             # AIP sync HTTP server (:3002)
├── skylink-notams.mjs              # NOTAM via SkyLink RapidAPI (DEFAULT in route code)
├── skylink-weather.mjs             # Weather via SkyLink
├── crewbriefing-opmet-notams.mjs   # NOTAM+weather via CrewBriefing (Playwright)
├── crewbriefing-notams.mjs         # deprecated shim → skylink-notams.mjs
├── notam-scraper.mjs               # NOTAM via FAA NOTAM Search (Playwright + Excel export)
├── test-skylink-notam.mjs          # manual SkyLink test client
├── ead-download-aip-pdf.mjs        # EAD AD-2 PDF download (Playwright login)
├── ead-download-gen-pdf.mjs        # EAD GEN 1.2 PDF download
├── ead-download-enr-pdf.mjs        # EAD ENR 1.1 PDF download (not wired to sync server)
├── ead-extract-aip-from-pdf.mjs    # regex extractor  → data/ead-aip-extracted.json
├── ead-extract-aip-from-pdf-ai.mjs # OpenAI/OpenRouter extractor
├── rus_aip_download_by_icao.py     # Russia AIP download (python)
├── web-table-scrapers/<country>-*-interactive.mjs   # ~75 national eAIP scrapers
├── run-notam-sync-server.sh, run-weather-sync-server.sh, run-notam-worker.sh, run-aip-sync-server.sh
├── NOTAM-AWS-SETUP.md, AIP-AWS-SETUP.md             # legacy AWS/S3/EC2 deployment guides
aip-meta-extractor.py               # ★ LIVE AIP extractor (regex → Claude vision fallback)
aip-meta-extractor-haiku.py, aip_meta_extractor.py  # variants

services/asecna/asecna-sync.mjs     # crawl ASECNA eAIP HTML → data/asecna-airports.json
workers/asecna-ad2-worker.mjs       # Supabase asecna_jobs queue worker → PDF to storage
scripts/asecna-to-supabase.mjs      # upsert ASECNA airports into Supabase

lib/
├── storage.ts / storage.mjs        # filesystem storage (keys under /storage)
├── aip-storage.ts                  # JSON/PDF helpers over storage
├── aip-extract-from-text.ts        # AipExtractRecord + SCHEMA_KEYS (canonical field list)
├── usa-aip.ts                      # USA ICAO↔state map, isUsaAipIcao
├── ead-web-aip.ts                  # EAD prefixes + web AIP URLs
├── ead-country-coverage.ts         # which ICAOs EAD can serve (data/ead-country-icaos.json)
├── scraper-country-config.ts       # ~75 national scrapers + EAD-only guards
├── <country>-eaip-resolve.ts       # national eAIP package-root resolvers (Venezuela, N.Macedonia, Oman, Korea, ...)
├── admin-auth.ts                   # Supabase role auth helpers
├── internal-debug-auth.ts          # x-debug-runner-secret
└── country-service-status-store.ts # Supabase country_service_statuses

migrations/
├── 20260401_add_asecna_type.sql        # airports.* AIP columns + asecna_jobs table
└── 20260505_add_country_service_statuses.sql
docs/self-hosted-deployment.md, docs/LOCAL-NOTAM-WEATHER.md   # current (self-hosted) model
docker-compose.yml                  # portal + notam-sync + weather-sync + aip-sync workers
```

---

## 4. Data sources & ingestion

**Ingestion mechanism = on-demand + cron scraping, not feeds.** There are no webhooks and no push. Data is produced two ways: (1) **on-demand** when a portal user requests an ICAO with `sync=1` (or on cache miss), the portal calls a sync server which spawns a scraper; (2) **scheduled** via `cron`/manual runs of the scraper scripts (documented in the AWS setup guides). There is **no automatic background polling loop** for NOTAMs/AIP inside the app itself.

### 4.1 NOTAM sources

Selected by `NOTAM_SCRAPER` env var. **Route-code default is `skylink`; the self-hosted `docker-compose.yml` overrides workers to `crewbriefing`.** All three produce the identical output envelope (see [§6.1](#61-notam-record)).

| Source | Script | How it authenticates | Tech | Input format |
|---|---|---|---|---|
| **SkyLink API** (default) | `skylink-notams.mjs` | `SKYLINK_API_KEY` / `RAPIDAPI_KEY` → `x-rapidapi-key` header (RapidAPI: host `skylink-api.p.rapidapi.com`) | plain `fetch` | **JSON** (`notams[]` with `notam_id, type, location, effective, expiration, body`) |
| **CrewBriefing** | `crewbriefing-opmet-notams.mjs` | `CREWBRIEFING_USERNAME` + `CREWBRIEFING_PASSWORD` (login to `crewbriefing.com`) | **Playwright Chromium** | **Rendered page text** (raw ICAO NOTAM text; A)/B)/C) fields regex-parsed) |
| **FAA NOTAM Search** | `notam-scraper.mjs` | none (public; handles disclaimer) | **Playwright Chromium** | **Excel (.xlsx) export** parsed with `xlsx`, or HTML table fallback |

> ⚠️ **Env-var name inconsistency:** the code (`crewbriefing-opmet-notams.mjs`) reads `CREWBRIEFING_USERNAME`/`CREWBRIEFING_PASSWORD`, but `scripts/NOTAM-AWS-SETUP.md` documents `CREWBRIEFING_USER`/`CREWBRIEFING_PASSWORD`. Verify which the deployed env uses.

CrewBriefing applies a **source-side exclusion**: its output slice terminates at markers such as `NOTAMs excluded in accordance with FSP CLEARWAY company policy` and `US Military NOTAMs excluded` — i.e., some NOTAMs are filtered out upstream, not by this code.

### 4.2 Weather source

`/api/weather` mirrors the NOTAM flow. Sources: `skylink-weather.mjs` (SkyLink) or `crewbriefing-opmet-notams.mjs --mode weather` (CrewBriefing OPMET section: METAR/SPECI/TAF text). Output: `{ icao, weather: "<raw text>", updatedAt }`. Stored at `weather/<ICAO>.json`.

### 4.3 AIP sources

The AIP sync server (`aip-sync-server.mjs`) routes an ICAO to a source by precedence: **USA static → national scraper (`scraper=1`) → Russia python → ASECNA/Rwanda HTTP → EAD Playwright** (with automatic EAD→national-scraper fallback on failure). Routing tables: `lib/ead-country-coverage.ts` (EAD-served ICAOs), `lib/scraper-country-config.ts` (~75 national scrapers + `EAD_ONLY_PREFIXES` guard).

| Source | Coverage | Script(s) | Auth | Destination |
|---|---|---|---|---|
| **EUROCONTROL EAD** ("European AIP Database", EAD Basic) | ~56 European prefixes | `ead-download-aip-pdf.mjs` (AD2, falls back AD2→AD3→AD4), `ead-download-gen-pdf.mjs` (GEN 1.2), `ead-download-enr-pdf.mjs` (ENR 1.1) | `EAD_USER` + `EAD_PASSWORD` or `EAD_PASSWORD_ENC` (base64), Playwright login to `ead.eurocontrol.int` | PDF → `aip/ead-pdf/{ICAO}.pdf`; JSON → `aip/ead/{ICAO}.json` |
| **National eAIP** | ~75 countries (Venezuela/INAC, N. Macedonia/M-NAV, Oman, Korea/KOCA, Japan mirror, etc.) | `web-table-scrapers/<country>-*-interactive.mjs` + `lib/<country>-eaip-resolve.ts` | usually none (public eAIP) | PDF → `aip/scraper-pdf/{ICAO}.pdf`; JSON → `aip/scraper/{ICAO}.json` |
| **ASECNA** (African aviation authority) | Francophone W/C Africa + Rwanda | `services/asecna/asecna-sync.mjs`, `workers/asecna-ad2-worker.mjs` | none (public `aim.asecna.aero` eAIP HTML) | PDF → `aip/asecna-pdf/{ICAO}.pdf`; airports → **Supabase `airports`** + `asecna_jobs` queue |
| **USA** (FAA) | K*/P* ICAOs | static PDFs shipped in repo/storage; `lib/usa-aip.ts` | none | PDF → `aip/usa-pdf/{ICAO}.pdf`; JSON → `aip/usa/{ICAO}.json` |
| **Russia** | UU*/UL*/… | `rus_aip_download_by_icao.py` | none | PDF/JSON under `aip/` |

**GEN 1.2** (General section — entry/customs/health rules) is handled per **2-letter country prefix**: PDFs under `aip/gen-pdf/{prefix}-GEN-1.2.pdf` (EAD) or `aip/non-ead-gen-pdf/`; text is split into three parts (general / non-scheduled / private flights) and **AI-rewritten** into human-readable form.

### 4.4 Data formats & parsing

**There is NO AIXM/XML anywhere** (verified by grep across `scripts/`, `services/`, `workers/`, `lib/` — no `aixm`, `AIXMBasicMessage`, XML parsing). Neither is there structured NOTAM decoding.

- **NOTAMs:** SkyLink returns **JSON** (fields mapped directly). CrewBriefing returns **raw ICAO NOTAM text**, from which only the `A)` (location), `B)` (start), `C)` (end) fields and the NOTAM number/class are regex-extracted; the **`Q)` line, `D)` schedule, coordinates, radius, and `F)/G)` altitude limits are NOT parsed** — the full text lands verbatim in `condition`. FAA returns an **Excel** export mapped by column headers.
- **AIP field extraction from PDFs:** the **live path** used by `aip-sync-server.mjs` is the **Python `aip-meta-extractor.py`** — Phase 1 regex over the PDF text layer, then fallback to **Anthropic Claude vision** (`claude-sonnet-4-20250514`, pages rendered to images via pymupdf). Two alternate JS extractors exist: `ead-extract-aip-from-pdf.mjs` (pure regex) and `ead-extract-aip-from-pdf-ai.mjs` (OpenAI/OpenRouter, default `gpt-4.1-mini`). The **USA route** extracts inline with `pdf-parse` + OpenAI (`gpt-4o-mini`). GEN rewriting uses AI as well.
- **Extraction target:** ICAO **AD 2** subsections (2.2 traffic types, 2.3 operator/customs/ATS, 2.6 fire category, 2.12 runways) — see [§6.3](#63-aip-airport-record). Non-English values are translated to English by the LLM.

---

## 5. Backend architecture

### 5.1 Runtime & framework

- **Portal:** Next.js (App Router) + TypeScript, run as `node server.js` (standalone build). Route handlers are `app/api/**/route.ts`.
- **Sync servers / scrapers:** Node ESM (`.mjs`) using the raw `node:http` module (no framework) + **Playwright** (Chromium) for browser scraping. Some extractors are **Python** (`pdf-parse`/`pymupdf`/`anthropic`/`camelot`).
- **DB client:** Supabase JS (`@supabase/ssr` for cookie auth; service-role client for writes).

### 5.2 Two deployment models

The repo documents **two different, partly-conflicting deployment models** — important context:

1. **Legacy: Vercel + AWS S3 + EC2** (`scripts/NOTAM-AWS-SETUP.md`, `scripts/AIP-AWS-SETUP.md`). Portal on Vercel reads NOTAM/AIP JSON from **S3** (`s3://bucket/notams/ICAO.json`, `aip/...`); scrapers/sync servers run on **EC2** under `xvfb-run`; env like `AWS_NOTAMS_BUCKET`, `NOTAM_SYNC_URL=http://EC2-IP:3001`.
2. **Current: self-hosted Docker Compose + local filesystem** (`docs/self-hosted-deployment.md`, `docker-compose.yml`). Services: `portal` (:3000), `notam-sync` (:3001), `weather-sync` (:3001, `SYNC_SERVER_MODE=weather`), `aip-sync` (:3002), all from one image. Storage is **filesystem volumes** (`/mnt/hdd-storage:/storage`, `/mnt/ssd-cache:/cache`). Sync URLs are internal DNS (`http://notam-sync:3001`, `http://aip-sync:3002`). `docs/self-hosted-deployment.md` states AWS-only features (Textract endpoint, S3 presign) are **disabled/removed**.

The **route code and `lib/storage.*` use the filesystem model** (S3 references in scraper comments/docs are stale). Treat model #2 as authoritative.

### 5.3 Storage layer

`lib/storage.ts` (TS, portal) and `lib/storage.mjs` (scripts) implement a **local-filesystem key/value store**:

- `STORAGE_ROOT` (default `/storage`, persistent HDD), `CACHE_ROOT` (default `/cache`, SSD). Writes are staged in `CACHE_ROOT/.staging/*.tmp` then atomically `rename`d (with `EXDEV` cross-mount fallback).
- Keys are relative paths; `lib/storage.mjs` enforces `ALLOWED_ROOTS = {aip, notam, weather}` and blocks `..`/absolute paths.
- `lib/aip-storage.ts` adds JSON/PDF helpers (`readJsonFromStorage`, `writeJsonToStorage`, `readPdfFromStorage`, `storageObjectExists`, `removeFromStorage`).
- **All stored files are publicly retrievable at `/files/<key>`** (e.g. `/files/aip/ead-pdf/EDDF.pdf`, `/files/notam/KJFK.json`).

**Storage key map:**

```
notam/{ICAO}.json                         weather/{ICAO}.json
aip/ead/{ICAO}.json          aip/ead-pdf/{ICAO}.pdf
aip/usa/{ICAO}.json          aip/usa-pdf/{ICAO}.pdf     aip/usa-gen-pdf/GEN-1.2.pdf
aip/asecna/{ICAO}.json       aip/asecna-pdf/{ICAO}.pdf
aip/scraper/{ICAO}.json      aip/scraper-pdf/{ICAO}.pdf aip/scraper-gen-pdf/{ICAO}-GEN-1.2.pdf
aip/gen/{prefix}.json        aip/gen-pdf/{prefix}-GEN-1.2.pdf
aip/non-ead-gen/{prefix}.json aip/non-ead-gen-pdf/{prefix}-GEN-1.2.pdf
aip/ead-aip-extracted.json   (full extracted doc)
```

### 5.4 Database (Supabase/Postgres)

**No SQL migrations exist for NOTAM data** — NOTAMs/weather/AIP-PDFs are files, not DB rows. The AIP-relevant Postgres tables (Supabase) are:

- **`airports`** — airport master data. Columns include `icao, country, state, name, lat, lon, visible, source, source_type, dynamic_updated, web_aip_url, country_code, ad2_html_url, gen12_label, gen12_href` (AIP columns added in `migrations/20260401_add_asecna_type.sql`). This is the authoritative "which airports exist / how are they served" table. `deleted_airports` holds soft-hidden rows.
- **`asecna_jobs`** — background job queue: `{ id, icao, country_code, status(queued/running/completed/failed), s3_key, pdf_url, error, last_heartbeat, created_at, updated_at }`. Worked by `workers/asecna-ad2-worker.mjs`.
- **`country_service_statuses`** — `{ country PK, state(not_checked/in_work/operational/issues), note, updated_at, updated_by }`.
- **`pdf_download_stats`** — `{ icao, source(ead/scraper/usa/asecna), duration_ms }` for the download-time estimator.

**There is NO geospatial or time-validity indexing** for NOTAMs (no PostGIS, no FIR polygons, no altitude ranges, no validity-window index). `airports` stores plain `lat/lon` floats only. NOTAM time bounds exist only as opaque strings inside per-airport JSON files.

### 5.5 Caching, TTL & expiry

- **NOTAM / weather:** cached file is returned as-is; **no TTL, no expiry**. `?sync=1` forces a fresh scrape (bypasses cache). Expired NOTAMs are **never purged** — `endDateUtc` is stored but never used to filter. There is no scheduled purge job in-app.
- **AIP EAD & scraper JSON:** `CACHE_TTL_MS = 24h`. On read, if `age >= 24h` the JSON is **deleted** (`removeFromStorage`) and treated as a miss. EAD additionally has a **6h soft-stale** window (`AIP_FAST_CACHE_MAX_AGE_MS`, default 6h) that serves stale data flagged `cache.stale=true` while a background refresh runs.
- **AIP GEN JSON:** 24h TTL but **not deleted** — returns empty with `expired:true`.
- **USA / ASECNA / non-ead-gen JSON:** **no TTL**.
- **PDFs:** served with `Cache-Control: private, max-age=300` (browser cache 5 min); files themselves persist until overwritten. The AIP sync server deletes the prior `{ICAO}.json` + `.pdf` before re-uploading on each sync.

---

## 6. Data models / schemas

### 6.1 NOTAM record

Every NOTAM scraper emits the **same envelope and 6-field record**:

```jsonc
{
  "icao": "KJFK",
  "notams": [
    {
      "location":    "KJFK",              // A) field / API location
      "number":      "A1234/25",          // NOTAM id (e.g. A1234/25)
      "class":       "N",                 // N / R / C (NOTAMN/R/C), or API "type"
      "startDateUtc":"2025-06-01 08:00 UTC", // B) field; SkyLink reformats, CrewBriefing keeps raw YYMMDDHHmm
      "endDateUtc":  "2025-08-01 08:00 UTC", // C) field; may contain PERM/EST
      "condition":   "RWY 04L/22R CLSD ..."  // full NOTAM text (E field or entire raw text)
    }
  ],
  "updatedAt": "2026-07-02T12:00:00.000Z"
}
```

Not present: Q-code, FIR, coordinates, radius, lower/upper altitude, `D)` schedule, traffic (IFR/VFR), scope. These are **not decoded** even when present in the raw text.

### 6.2 Weather record

```jsonc
{ "icao": "EDDF", "weather": "METAR EDDF 021150Z ... \nTAF EDDF ...", "updatedAt": "..." }
```
Raw METAR/SPECI/TAF text; no decoding into structured fields.

### 6.3 AIP airport record

Two shapes exist:

**(a) Extracted/raw record** (`lib/aip-extract-from-text.ts` `SCHEMA_KEYS`; also the sync server's `data/ead-aip-extracted.json`). Human-readable spaced keys, values default `"NIL"`:

```jsonc
{
  "Publication Date": "...", "Airport Code": "EDDF", "Airport Name": "FRANKFURT",
  "AD2.2 Types of Traffic Permitted": "IFR/VFR", "AD2.2 Remarks": "...",
  "AD2.2 AD Operator": "...", "AD2.2 Address": "...", "AD2.2 Telephone": "...",
  "AD2.2 Telefax": "...", "AD2.2 E-mail": "...", "AD2.2 AFS": "...", "AD2.2 Website": "...",
  "AD2.3 AD Operator": "...", "AD 2.3 Customs and Immigration": "...",
  "AD2.3 ATS": "...", "AD2.3 Remarks": "...",
  "AD2.6 AD category for fire fighting": "CAT 9",
  "AD2.12 Runway Number": "07L/25R ...", "AD2.12 Runway Dimensions": "4000x60 ..."
}
```

**(b) API-facing record** (`AIPAirport`, returned by `/api/airports`), camelCase:

```jsonc
{
  "country": "...", "gen1_2": "...", "gen1_2_point_4": "...", "icao": "EDDF",
  "name": "...", "publicationDate": "...", "trafficPermitted": "...", "trafficRemarks": "...",
  "ad22Operator": "...", "ad22Address": "...", "ad22Telephone": "...", "ad22Telefax": "...",
  "ad22Email": "...", "ad22Afs": "...", "ad22Website": "...", "operator": "...",
  "customsImmigration": "...", "ats": "...", "atsRemarks": "...", "fireFighting": "...",
  "runwayNumber": "...", "runwayDimensions": "...",
  "lat": 50.03, "lon": 8.57,
  "sourceType": "EAD_DYNAMIC",   // STATIC_PORTAL | EAD_DYNAMIC | ASECNA_DYNAMIC | SCRAPER_DYNAMIC | RUSSIA_DYNAMIC | DB_DYNAMIC
  "dynamicUpdated": true, "webAipUrl": "...", "effectiveDate": "..."
}
```

Only AD 2.2/2.3/2.6/2.12 subsections are captured — **not** runways in full detail, navaids, frequencies, obstacles, procedures, or ENR data.

### 6.4 GEN payload

```jsonc
{
  "general":       { "raw": "...", "rewritten": "..." },
  "nonScheduled":  { "raw": "...", "rewritten": "..." },
  "privateFlights":{ "raw": "...", "rewritten": "..." },
  "updatedAt": "..."
}
```

---

## 7. Authentication & access control

- **How clients authenticate today:** browser users via **Supabase cookie session**. Server-to-server internal calls use the `x-debug-runner-secret` header. Sync servers use `X-Sync-Secret`. **There is no API-key, OAuth-client, or token mechanism intended for external/third-party API consumers.**
- **Route enforcement is inconsistent.** Only `/api/notams`, `/api/weather`, `/api/aip/ead`, `/api/aip/scraper`, `/api/aip/gen/sync`, and `/api/country-service-status` call `requireAuthenticatedUser()`. **All PDF endpoints, `/api/aip/usa`, `/api/aip/asecna`, `/api/aip/gen`, `/api/aip/gen-non-ead`, `/api/aip/sync`, `download-stats`/`download-estimate`, and every `/api/aip-test/*` route have NO auth in the handler.**
- **Middleware nuance / public-file exposure:** `middleware.ts` redirects unauthenticated users to `/login` for most paths, **but** it treats any path containing a file extension as a public asset (`isPublicAsset = /\.[^/]+$/`) and skips auth. Because `/files/<key>` serves files whose keys end in `.pdf`/`.json`, **stored NOTAM/weather/AIP files are effectively publicly downloadable** by anyone who knows the ICAO (`/files/notam/KJFK.json`, `/files/aip/ead-pdf/EDDF.pdf`). `DISABLE_AUTH_FOR_TESTING=true` disables all auth globally.
- **Credentials a future consumer must work within:** none exist for consumers. The system itself holds upstream credentials: `SKYLINK_API_KEY`, `CREWBRIEFING_USERNAME/PASSWORD`, `EAD_USER`/`EAD_PASSWORD_ENC`, `OPENAI_API_KEY`/`OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY`, Supabase keys, `SYNC_SECRET`. See [§10](#10-future-api-integration-notes).

---

## 8. Business logic specific to AIP/NOTAM

- **NOTAM matching/filtering:** strictly **one 4-letter ICAO per request** (validated `^[A-Z0-9]{4}$`). There is **no** filtering by FIR, route, altitude band, or time window; no multi-airport queries; no server-side dedup or conflict resolution between overlapping NOTAMs. Whatever the source returns for that airport is stored and shown. The only filtering is upstream (CrewBriefing's "CLEARWAY company policy" / military exclusions).
- **AIP organization:** by **country/source**, then by **ICAO airport** (AD 2) and **2-letter country prefix** (GEN 1.2). Routing between sources (EAD vs national scraper vs FAA vs ASECNA vs Russia) is decided by ICAO prefix via `lib/ead-country-coverage.ts` + `lib/scraper-country-config.ts` (`EAD_ONLY_PREFIXES` forces EU states to EAD). Only **AD 2** and **GEN 1.2** sections are extracted; **ENR** download exists (`ead-download-enr-pdf.mjs`) but is not wired into any API route. Full ICAO GEN/ENR/AD structure is **not** modeled.
- **Validation/dedup/conflict resolution:** essentially none for NOTAMs. For AIP, extraction defaults missing fields to `NIL` and honors "intentionally left blank" markers; the AIP sync server deletes prior JSON+PDF before re-writing (last-write-wins, no versioning).
- **Scheduled jobs:** **no in-app scheduler.** Refresh happens on-demand (`sync=1`, or 24h AIP cache expiry triggering re-fetch on next read) or via **external cron** running the scraper scripts (per the AWS setup docs). The **`asecna_jobs`** table + `workers/asecna-ad2-worker.mjs` is the only true background queue, and only for ASECNA PDF generation. **No job purges expired NOTAMs.**

---

## 9. Gaps, fragility & risks for external API use

1. **No structured data — scraping only.** Every source is a website/PDF scrape or an unofficial third-party API. There is no AIXM, no FAA NOTAM API/SWIM, no EUROCONTROL B2B. Any external integration inherits the fragility of HTML/PDF layout changes and login flows.
2. **NOTAMs are opaque text.** `Q)`, FIR, coordinates, radius, altitude limits, and `D)` schedules are never parsed. A consumer wanting geospatial/altitude/time filtering would have to decode ICAO NOTAM text themselves. `class`/`number`/dates are best-effort regex and differ per source.
3. **No expiry handling.** Expired NOTAMs are stored indefinitely and returned as-is; consumers must filter by `endDateUtc` themselves (and parse its inconsistent formats: `YYYY-MM-DD HH:mm UTC` from SkyLink vs raw `YYMMDDHHmm[PERM|EST]` from CrewBriefing).
4. **Inconsistent formats across sources.** The same `notams[]` field set carries differently-formatted values depending on `NOTAM_SCRAPER`. AIP extracted fields vary by extractor (Python/Claude live path vs JS/OpenAI vs USA inline OpenAI) and are LLM-generated (non-deterministic, may hallucinate/translate).
5. **Auth is inconsistent and files are effectively public.** Most AIP/PDF endpoints have no handler auth, and `/files/*.pdf|.json` bypasses middleware auth. An external API must not assume these are protected — and productizing them requires adding real access control.
6. **Two deployment models in the docs.** S3/EC2 (legacy) vs filesystem/Docker (current). Comments and setup guides still say "S3" though storage is local. Env-var drift exists (`CREWBRIEFING_USER` vs `CREWBRIEFING_USERNAME`).
7. **Latency & rate.** Live `sync=1` spawns a headless browser or hits a rate-limited third-party API; timeouts are 90s–600s. Not suitable for high-QPS external traffic. SkyLink is via **RapidAPI** (quota/billing tiers apply). EAD **blocks datacenter IPs** ("IB-101 Access denied"), so EAD sync fails from cloud hosts — a hard constraint.
8. **Licensing/usage restrictions (must be confirmed with legal):**
   - **SkyLink API** via RapidAPI — subject to RapidAPI plan quotas + SkyLink's terms.
   - **CrewBriefing** — a login-gated commercial briefing service; scraping it is governed by their ToS, and the data already carries a **"CLEARWAY company policy"** exclusion filter.
   - **FAA NOTAM Search / FAA AIP** — US government data (generally public domain) but scraping the site may violate its terms; IP-blocking is a risk.
   - **EUROCONTROL EAD Basic** — requires an account and has redistribution terms; datacenter IPs are blocked.
   - **National eAIP / ASECNA** — each national AIS has its own copyright/redistribution terms.
   These upstream terms constrain what a downstream API may legally expose. **None of these are documented in the repo** and must be reviewed before building a public API on top.
9. **No pagination, versioning, or bulk/list endpoints** for NOTAMs or AIP records (everything is single-ICAO). `/api/airports` returns full country lists with `Cache-Control: no-store`.
10. **LLM/vendor coupling.** Extraction depends on Anthropic/OpenAI/OpenRouter keys and specific model IDs (`claude-sonnet-4-20250514`, `gpt-4o-mini`, `gpt-4.1-mini`). Model/vendor changes alter output.

---

## 10. Future API Integration Notes

If the goal is to expose a **stable external API** for AIP/NOTAM data on top of this backend, the following would need to be built, exposed, or documented:

**Access & auth**
- Add a real **API-key or OAuth client-credentials** layer for external consumers (none exists). Today's options (Supabase cookie, `x-debug-runner-secret`, `X-Sync-Secret`) are all internal.
- **Lock down `/files/*` and the unauthenticated AIP/PDF routes** (or intentionally designate a public subset). Fix the middleware public-asset bypass so data files aren't world-readable by ICAO guessing.
- Introduce **per-consumer rate limiting & quotas**, since live sync is expensive and upstreams are rate-limited/billed (RapidAPI).

**Data quality & contracts**
- Define a **stable, source-independent response schema** for NOTAMs and AIP, and normalize the per-source format differences (dates especially) behind it. Publish an **OpenAPI spec** — none exists.
- To support real aviation use, **decode NOTAM structure** (`Q)`, FIR, coordinates, radius, F/G altitude, `D)` schedule, validity window) instead of shipping opaque `condition` text. This is net-new parsing.
- Add **expiry/validity filtering** (drop or flag NOTAMs past `endDateUtc`) and a **scheduled purge/refresh** job. Currently nothing expires or refreshes automatically except on-demand and the 24h AIP JSON TTL.
- Make extraction **deterministic/validated** (schema-validate LLM output; keep the raw PDF alongside for auditing). Version records instead of last-write-wins.

**Storage & query**
- If geospatial/route/altitude queries are required (NOTAMs are inherently location/altitude/time-bound), add proper indexing — e.g. **PostGIS** for FIR polygons/coordinates and time-validity indexes. The current model (per-ICAO JSON files, `lat/lon` floats on `airports`) cannot answer "NOTAMs affecting this route/altitude/time."
- Consider moving NOTAM/weather from opaque files into **queryable DB rows** if external consumers need filtering/pagination/bulk export.

**Operational**
- Document the **upstream licensing** for each source (SkyLink/RapidAPI, CrewBriefing, FAA, EAD, national eAIP, ASECNA) and ensure redistribution rights before exposing data externally.
- Provide **freshness metadata** in responses (already partially present via `updatedAt`/`cache.stale`) and a **coverage/status endpoint** (the internal `country_service_statuses` is a good basis but is auth-gated and portal-oriented).
- Note the **EAD datacenter-IP block** — a hosted external API that syncs EAD live will fail unless it proxies through a non-datacenter IP.
- Reconcile the **two deployment models** and stale "S3" naming; pin scraper env-var names (`CREWBRIEFING_USERNAME`).

**What already exists and could be reused as-is:** per-ICAO cache read (`/files/*`, cache-first routes), the sync-server pattern (`X-Sync-Secret`), the `airports` master table with source routing, the download-time estimator (`pdf_download_stats`), and the `country_service_statuses` health model. These are reasonable internal primitives to wrap a hardened external API around — but the API surface, auth, normalization, NOTAM decoding, expiry, and licensing all remain to be built.

---

*End of report.*
