# FIFA 2026 Pickem Deploy (Docker + Cloudflared)

This repo now includes a dedicated `pickem` service in the main `docker-compose.yml`.

## 1) Build and run

From repo root:

```bash
docker compose build pickem
docker compose up -d pickem
```

The pickem container is exposed on `127.0.0.1:3010` and serves:

- `https://clearway.verxyl.com/pickem`
- `https://clearway.verxyl.com/pickem/api/*`

Health endpoint:

- `http://127.0.0.1:3010/pickem/api/health`

## 2) Cloudflared ingress

Route `/pickem/*` to the new container, and keep portal fallback on port `3000`:

```yaml
ingress:
  - hostname: clearway.verxyl.com
    path: /pickem/.*
    service: http://127.0.0.1:3010
  - hostname: clearway.verxyl.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Then restart cloudflared:

```bash
sudo systemctl restart cloudflared
```

## 3) Required env vars

Pickem result ingestion uses API-Sports style endpoints:

- `FOOTBALL_API_BASE_URL`
- `FOOTBALL_API_KEY`
- `FOOTBALL_API_LEAGUE_ID`
- `FOOTBALL_API_SEASON` (optional, defaults to `2026`)

## 4) Database migration

Apply migration:

- `migrations/20260606_create_pickem_core.sql`

This creates competitions, groups, teams, matches, predictions, submissions, group results, and points ledger tables.

## 5) Sync official results

Admin/developer can trigger sync:

```bash
curl -X POST "https://clearway.verxyl.com/pickem/api/sync" \
  -H "Cookie: <logged-in-session-cookie>"
```

This ingests fixtures/standings and recomputes points ledger.
