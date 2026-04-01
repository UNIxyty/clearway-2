# ASECNA Integration (Dynamic)

This project now supports dynamic ASECNA airport discovery, AD2 PDF fetch to S3, and Supabase ingestion.

## 1) Sync countries + airports from ASECNA

```bash
node services/asecna/asecna-sync.mjs --insecure
```

Output:
- `data/asecna-airports.json`
- Countries and airports are fetched from the live ASECNA menu.
- GEN is limited to GEN 1.2 (`Entry, transit and departure of aircraft`) links only.

## 2) Import ASECNA airports into Supabase

Required env:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Run:

```bash
node scripts/asecna-to-supabase.mjs
```

Optional:

```bash
node scripts/asecna-to-supabase.mjs --dry-run
```

Behavior:
- Uses `data/asecna-airports.json`
- Enriches airport names and coordinates from OurAirports
- Upserts into `public.airports` with `source_type='ASECNA'` and `dynamic_updated=true`

## 3) Run DB migration

Run SQL:

- `migrations/20260401_add_asecna_type.sql`

This adds:
- Airport metadata columns (`source_type`, `dynamic_updated`, `web_aip_url`, etc.)
- `public.asecna_jobs` queue table for background AD2 jobs

## 4) API routes

- `POST /api/asecna/trigger-ad2`  
  Body: `{ "icao": "DBBB" }`  
  Queues a background AD2 job.

- `GET /api/asecna/job/:id`  
  Returns job status and S3 key/url fields.

- `GET /api/aip/asecna?icao=DBBB&sync=1&stream=1`  
  On-demand AD2 sync for portal flow (SSE steps).

- `GET /api/aip/asecna/pdf?icao=DBBB&inline=1`  
  Streams PDF from S3.

## 5) Worker (background queue processor)

Required env:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AWS_S3_BUCKET` (or `AWS_NOTAMS_BUCKET`)
- `AWS_REGION`

Run:

```bash
node workers/asecna-ad2-worker.mjs
```

## 6) Docker Compose example (worker + redis placeholder)

Redis is optional for current DB-queue worker, but included for future queue extensions.

```yaml
services:
  asecna-worker:
    image: node:22
    working_dir: /app
    command: ["node", "workers/asecna-ad2-worker.mjs"]
    volumes:
      - ./:/app
    environment:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      AWS_S3_BUCKET: ${AWS_S3_BUCKET}
      AWS_REGION: ${AWS_REGION}
    depends_on:
      - redis

  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

## 7) Portal behavior

- ASECNA airports are no longer treated as hard-coded static AIP data.
- Search/list now loads ASECNA airports from `data/asecna-airports.json`.
- ASECNA cards show dynamic source labeling.
- Added `Web AIP` button for ASECNA airports to open ASECNA web portal.
