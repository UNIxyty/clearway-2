# Dynamic Scraper Rollout - Required Actions

This checklist is only what you need to **create / update / delete / run** to keep dynamic web-table scraper countries working in portal flow:

`search -> scrape/sync -> save to S3 -> show in portal`

---

## 1) Create

- Create API endpoints for scraper-backed countries:
  - `app/api/aip/scraper/route.ts`
  - `app/api/aip/scraper/pdf/route.ts`
  - `app/api/aip/scraper/gen/pdf/route.ts`
- Create dynamic package metadata helper:
  - `lib/dynamic-packages.ts`
- Create/keep this operational guide:
  - `docs/dynamic-scraper-rollout-required-actions.md`

---

## 2) Update

- Update sync server mapping + storage namespaces:
  - `scripts/aip-sync-server.mjs`
  - Must support `scraper=1` on:
    - `/sync` (AD2)
    - `/sync/gen` (GEN 1.2)
  - Must store scraper artifacts in S3 keys:
    - `aip/scraper/<ICAO>.json`
    - `aip/scraper-pdf/<ICAO>.pdf`
    - `aip/scraper-gen-pdf/<ICAO>-GEN-1.2.pdf`

- Update package collector to include:
  - `effectiveDate`
  - `webAipUrl`
  - clean ICAO extraction from AD2 filenames
  - file: `scripts/tools/collect-all-packages.mjs`

- Update airport enrichment to:
  - normalize airport names to one style
  - carry `effectiveDate` and `webAipUrl` into `dynamic-airports.json`
  - file: `scripts/tools/enrich-airports.mjs`

- Update portal data APIs to expose scraper metadata:
  - `app/api/airports/route.ts`
  - `app/api/search/route.ts`
  - include `sourceType: "SCRAPER_DYNAMIC"`, `webAipUrl`, `effectiveDate`

- Update portal UI flow + banners:
  - `app/page.tsx`
  - scraper airports must use dedicated scraper routes:
    - AIP data: `/api/aip/scraper`
    - PDF: `/api/aip/scraper/pdf`
    - GEN PDF: `/api/aip/scraper/gen/pdf`
  - banner style must match EAD style
  - add `Effective: YYYY-MM-DD` in banner (from dynamic packages)
  - keep Web AIP button visible when URL exists

---

## 3) Delete

- Delete hard-coded airports that are now covered by dynamic scraper countries:
  - tool: `scripts/tools/delete-hardcoded-airports.mjs`
  - command preview:
    - `node scripts/tools/delete-hardcoded-airports.mjs --in data/dynamic-airports.json`
  - command apply:
    - `node scripts/tools/delete-hardcoded-airports.mjs --in data/dynamic-airports.json --confirm`

---

## 4) Run (Required Commands)

### Build dynamic package index

```bash
node scripts/tools/collect-all-packages.mjs --out data/dynamic-packages.json
```

### Build enriched dynamic airport dataset

```bash
node scripts/tools/enrich-airports.mjs --in data/dynamic-packages.json --out data/dynamic-airports.json
```

### Upsert dynamic airports to Supabase

```bash
node scripts/tools/upsert-airports-to-supabase.mjs --in data/dynamic-airports.json --dry-run
set -a; source .env; set +a; node scripts/tools/upsert-airports-to-supabase.mjs --in data/dynamic-airports.json
```

### Remove overlapping hard-coded airports

```bash
node scripts/tools/delete-hardcoded-airports.mjs --in data/dynamic-airports.json
node scripts/tools/delete-hardcoded-airports.mjs --in data/dynamic-airports.json --confirm
```

---

## 5) Verify (Smoke)

Start sync server:

```bash
node scripts/aip-sync-server.mjs
```

Test scraper AD2 sync:

```bash
curl "http://127.0.0.1:3002/sync?icao=VHHH&extract=0&scraper=1"
curl "http://127.0.0.1:3002/sync?icao=OBBS&extract=0&scraper=1"
```

Test scraper GEN sync:

```bash
curl "http://127.0.0.1:3002/sync/gen?icao=VHHH&scraper=1"
```

Portal checks for scraper countries:

- Search ICAO -> opens synced AIP card flow
- Banner is EAD-style + dynamic source label
- `Effective: <date>` is visible when available
- `Web AIP` button is present
- `GEN PDF` download is reachable

---

## 6) Environment Required

- `AIP_SYNC_URL`
- `NOTAM_SYNC_SECRET` (if protected)
- `AWS_S3_BUCKET` (or `AWS_NOTAMS_BUCKET`)
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

