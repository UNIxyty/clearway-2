# Digital Wall Screen (Local Prototype)

Standalone local prototype for the aviation Digital Wall timeline screen.

## Current mode

- This setup serves the downloaded timeline page copy from `../164.92.164.35`.
- Root path (`/`) maps to `timeline` and resolves to `timeline.html`.
- Backend test UI is available at `/backend-test` for quick endpoint checks.
- Admin pages:
  - `/operators` — add Leon operators (Name, Prefix, Refresh Token)
  - `/aircrafts` — show aircraft with flights in next 7 days and hide/show on timeline
- Timeline has a left menu button (☰) with navigation overlay.
- API-like paths without extension are resolved to `.html` files (for example `/api/flights/data`).
- Auth-related API calls are mocked in `server.mjs` to bypass login locally.
- A custom backend adapter is available for your own timeline integration:
  - `GET /api/timeline/flights`
  - `GET /api/timeline/aircraft`
  - `GET /api/timeline/limitations`
  - `GET /api/timeline/sync-status`
  - `POST /api/timeline/refresh`
  - Optional for second user/operator tests: append `?oprId=<other_operator_id>` to `/api/timeline/flights` and `/api/timeline/aircraft`.
  - Multi-operator fetch: append `?allOperators=true&refresh=true` to `/api/timeline/flights`.
- Operator and aircraft visibility APIs:
  - `GET /api/operators`
  - `POST /api/operators`
  - `PATCH /api/operators/:id`
  - `GET /api/aircraft/schedule?days=7&refresh=true`
  - `GET /api/aircraft/visibility`
  - `PUT /api/aircraft/visibility`

## Leon sync environment variables (optional)

To enable live sync from Leon GraphQL into `/api/timeline/*`, set:

- `LEON_OPR_ID` (example: `demo`)
- `LEON_REFRESH_TOKEN`
- Optional OAuth mode:
  - `LEON_CLIENT_ID`
  - `LEON_CLIENT_SECRET`
- Optional behavior:
  - `LEON_SANDBOX=true` (use sandbox endpoint)
  - `LEON_SYNC_POLL_MS=600000` (default 10 minutes)
  - `LEON_SYNC_RANGE_START=2026-01-01` (bootstrap range start)
  - `LEON_SYNC_RANGE_END=2026-12-31` (bootstrap range end)

Without these vars, the adapter still works using seeded local snapshot data from copied files.

## Multi-operator storage

Operators and aircraft visibility are stored in:

1. **Supabase** (recommended) when `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are valid.
2. **Local JSON fallback** in `digital-wall/data/` when Supabase is unavailable.

Apply migration before using Supabase storage:

- `digital-wall/backend/migrations/20260515_create_leon_sync_tables.sql`
- `digital-wall/backend/migrations/20260515_add_operator_tokens_and_aircraft_visibility.sql`

Each operator uses its own Leon refresh token. Access tokens are cached for ~25 minutes per operator.

## Run locally with Docker

From this folder:

```bash
docker compose build
docker compose up
```

Then open:

[http://localhost:5173](http://localhost:5173)
[http://localhost:5173/backend-test](http://localhost:5173/backend-test)

## Run locally without Docker

```bash
npm install
npm run dev
```

Then test quickly in browser at:

[http://localhost:5173/backend-test](http://localhost:5173/backend-test)

## Build check

```bash
npm run build
```
