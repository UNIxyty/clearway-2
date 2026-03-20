# Run NOTAM sync + weather locally (and split servers)

`scripts/notam-sync-server.mjs` serves:

- **`GET /sync`** — NOTAM scrape  
- **`GET /sync/weather`** — weather scrape  

Use **`SYNC_SERVER_MODE`** to run **only** NOTAM or **only** weather on different ports (two processes / two tmux — two CrewBriefing users on one IP).

| `SYNC_SERVER_MODE` | Routes |
|--------------------|--------|
| `all` (default) | `/sync` + `/sync/weather` |
| `notam` | `/sync` only |
| `weather` | `/sync/weather` only |

Weather login: set **`CREWBRIEFING_WEATHER_USER`** / **`CREWBRIEFING_WEATHER_PASSWORD`** on the weather process if different from NOTAM; otherwise it falls back to **`CREWBRIEFING_USER`** / **`CREWBRIEFING_PASSWORD`**.

---

## 1. Build the Next.js app

```bash
cd clearway-2
npm install
npm run build
```

Dev:

```bash
npm run dev
```

---

## 2. Portal env (`.env.local`)

**Single process** (both routes on one port):

```env
NOTAM_SYNC_URL=http://127.0.0.1:3001
NOTAM_SYNC_SECRET=dev-secret-change-me
```

**Split processes** (NOTAM :3001, weather :3003):

```env
NOTAM_SYNC_URL=http://127.0.0.1:3001
NOTAM_SYNC_SECRET=shared-or-notam-secret
WEATHER_SYNC_URL=http://127.0.0.1:3003
WEATHER_SYNC_SECRET=shared-or-weather-secret
```

If **`WEATHER_SYNC_URL`** is unset, weather uses **`NOTAM_SYNC_URL`**.  
If **`WEATHER_SYNC_SECRET`** is unset, weather uses **`NOTAM_SYNC_SECRET`**.

---

## 3a. One terminal — NOTAM-only (tmux session 1)

```bash
export SYNC_SERVER_MODE=notam
export NOTAM_SYNC_PORT=3001
export SYNC_SECRET=your-secret
export AWS_S3_BUCKET=...
export AWS_REGION=us-east-1
export CREWBRIEFING_USER=notam_user
export CREWBRIEFING_PASSWORD=...
npm run sync:notam
```

Log should show `NOTAM: true` and `weather: false`.

---

## 3b. Second terminal — weather-only (tmux session 2)

```bash
export SYNC_SERVER_MODE=weather
export NOTAM_SYNC_PORT=3003
export SYNC_SECRET=your-secret   # same or different; match WEATHER_SYNC_SECRET in Vercel
export AWS_S3_BUCKET=...
export AWS_REGION=us-east-1
export CREWBRIEFING_WEATHER_USER=weather_user
export CREWBRIEFING_WEATHER_PASSWORD=...
npm run sync:weather
```

Or: `SYNC_SERVER_MODE=weather NOTAM_SYNC_PORT=3003 ... node scripts/notam-sync-server.mjs`

Log should show `NOTAM: false` and `weather: true`.

---

## 4. Smoke tests

```bash
curl -sS -H "X-Sync-Secret: your-secret" "http://127.0.0.1:3001/sync?icao=EDDM&stream=0"
curl -sS -H "X-Sync-Secret: your-secret" "http://127.0.0.1:3003/sync/weather?icao=EDDM"
```

Through Next (split):

```bash
curl -sS "http://localhost:3000/api/weather?icao=EDDM&sync=1"
```

---

## Platform note: Linux vs macOS

The sync server uses **`xvfb-run`** (same as EC2). Use **Linux**, **WSL2**, or keep sync on **EC2** and point **`NOTAM_SYNC_URL`** / **`WEATHER_SYNC_URL`** at public IPs + open security group ports **3001** and **3003**.
