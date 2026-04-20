# Self-Hosted Deployment (Docker + Coolify)

This project now runs in self-hosted mode with local storage.

## Runtime model

- `portal` -> Next.js app (`npm run start`)
- `notam-sync` -> NOTAM sync worker (`node scripts/notam-sync-server.mjs`)
- `weather-sync` -> weather sync worker (`SYNC_SERVER_MODE=weather node scripts/notam-sync-server.mjs`)
- `aip-sync` -> AIP sync worker (`node scripts/aip-sync-server.mjs`)

All processes run as separate containers from the same image.

## Storage layout

- `CACHE_ROOT=/cache` (SSD, temporary)
- `STORAGE_ROOT=/storage` (HDD, persistent)
- files are staged in cache and then moved to storage by `lib/storage.ts`

Persistent keys:

- `aip/...`
- `notam/...`
- `weather/...`

## Public file access

All stored files are served by:

- `/files/<path>`

Examples:

- `/files/aip/ead-pdf/EDDF.pdf`
- `/files/notam/KJFK.json`
- `/files/weather/EDDF.json`

## Required env vars

At minimum:

```env
STORAGE_ROOT=/storage
CACHE_ROOT=/cache
NODE_ENV=production
NOTAM_SYNC_URL=http://notam-sync:3001
WEATHER_SYNC_URL=http://weather-sync:3001
AIP_SYNC_URL=http://aip-sync:3002
```

Keep existing app-specific credentials (EAD, CrewBriefing, Supabase, OpenAI/OpenRouter) as needed.

## Local compose run

```bash
docker compose build
docker compose up -d
docker compose logs -f portal
```

Volume mounts expected by `docker-compose.yml`:

- `/mnt/ssd-cache:/cache`
- `/mnt/hdd-storage:/storage`

## Coolify notes

- Build source: repository `Dockerfile`
- Use the same image for all services, override command per service
- Set service environment variables via Coolify UI (no hardcoded host paths)
- Mount storage volumes to `/cache` and `/storage`

## Removed AWS-only features

The following AWS-specific flows are intentionally disabled/removed:

- Textract benchmark runtime endpoint now returns `410` in self-hosted mode
- `aws_textract_to_json.py` removed
- S3 presigned URL report workflow replaced with local URL mapping
