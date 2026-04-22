# Run NOTAM sync + weather locally (and split servers)

`scripts/notam-sync-server.mjs` serves:

- `**GET /sync**` — NOTAM scrape  
- `**GET /sync/weather**` — weather scrape

Use `**SYNC_SERVER_MODE**` to run **only** NOTAM or **only** weather on different ports (two processes / two tmux).


| `SYNC_SERVER_MODE` | Routes                    |
| ------------------ | ------------------------- |
| `all` (default)    | `/sync` + `/sync/weather` |
| `notam`            | `/sync` only              |
| `weather`          | `/sync/weather` only      |


SkyLink API credentials are shared by NOTAM and weather sync. Set `**SKYLINK_API_KEY**` on each process (or in shared env).

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

If `**WEATHER_SYNC_URL**` is unset, weather uses `**NOTAM_SYNC_URL**`.  
If `**WEATHER_SYNC_SECRET**` is unset, weather uses `**NOTAM_SYNC_SECRET**`.

---

## 3a. One terminal — NOTAM-only (tmux session 1)

```bash
export SYNC_SERVER_MODE=notam
export NOTAM_SYNC_PORT=3001
export SYNC_SECRET=your-secret
export SKYLINK_API_KEY=...
npm run sync:notam
```

Log should show `NOTAM: true` and `weather: false`.

---

## 3b. Second terminal — weather-only (tmux session 2)

```bash
export SYNC_SERVER_MODE=weather
export NOTAM_SYNC_PORT=3003
export SYNC_SECRET=your-secret   # same or different; match WEATHER_SYNC_SECRET in Vercel
export SKYLINK_API_KEY=...
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

## Port 3001 (or any port) already in use

The listen port is **`NOTAM_SYNC_PORT`** (default **3001**). Pick any free port:

```bash
export NOTAM_SYNC_PORT=3004
node scripts/notam-sync-server.mjs
```

Then set **`NOTAM_SYNC_URL`** (or **`WEATHER_SYNC_URL`**) in Vercel to `http://YOUR_HOST:3004` (no trailing `/sync`).

**See what is holding the port (Linux):**

```bash
sudo ss -tlnp | grep 3001
# or
sudo lsof -i :3001
```

If it is an **old** `notam-sync-server` you no longer need, stop it (Ctrl+C in that tmux window, or `kill <PID>`). If you need **both** the old service and a new one, use a **different** `NOTAM_SYNC_PORT` for the new process and update Vercel.

---

## Platform note: Linux vs macOS

- **Linux (EC2):** `notam-sync-server.mjs` runs scrapers under **`xvfb-run`** (virtual display).
- **macOS:** **`xvfb-run` is not used** (it is not installed by default). The server runs **`node`** directly with **headless** Playwright (`USE_HEADED` defaults to `0`). You need **Playwright browsers** installed (`npx playwright install chromium` from the repo).
- To force the same behaviour on Linux (no xvfb): `export SYNC_USE_XVFB=0`.

For production, **EC2 + Linux** is still the intended setup.