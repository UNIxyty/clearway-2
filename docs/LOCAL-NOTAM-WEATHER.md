# Run NOTAM sync + weather locally

Weather goes through the **same** process as NOTAM sync: `scripts/notam-sync-server.mjs` exposes **`GET /sync/weather`**.

## 1. Build the Next.js app

```bash
cd clearway-2
npm install
npm run build
# optional: npm start   (port 3000)
```

For day-to-day dev:

```bash
npm run dev
```

## 2. Point the portal at a local NOTAM server

In **`.env.local`** (not committed):

```env
NOTAM_SYNC_URL=http://127.0.0.1:3001
NOTAM_SYNC_SECRET=dev-secret-change-me
```

Use the **same** secret when starting the sync server (see below).

Also keep your usual Supabase + AWS vars if you need login/S3.

## 3. Start the NOTAM sync server (second terminal)

From the **repo root** (same folder as `package.json`):

```bash
export SYNC_SECRET=dev-secret-change-me
export AWS_S3_BUCKET=your-bucket
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export CREWBRIEFING_USER=...
export CREWBRIEFING_PASSWORD=...
# optional: NOTAM_SYNC_PORT=3001

npm run sync:notam
```

You should see a log line like: listening on port **3001**.

## 4. Smoke-test the weather route on the sync server

```bash
curl -sS -H "X-Sync-Secret: dev-secret-change-me" \
  "http://127.0.0.1:3001/sync/weather?icao=EDDM"
```

- **404** + `"Not found"` → wrong repo version (pull latest) or wrong port.
- **401** → secret mismatch.
- **200** JSON → OK (after scraper finishes; first run can take a while).

## 5. Test through Next

With **`npm run dev`** and `.env.local` set:

```bash
curl -sS "http://localhost:3000/api/weather?icao=EDDM&sync=1"
```

(Or use the portal UI → weather sync.)

## Platform note: Linux vs macOS

`notam-sync-server.mjs` runs the scrapers with **`xvfb-run`** (virtual display), same as EC2. That works on **Linux** (and **WSL2** with Xvfb installed). On **macOS**, `xvfb-run` is usually missing unless you install something equivalent — easiest local path on a Mac is often **WSL**, **Docker/Linux**, or keep the sync server on **EC2** and only run **Next** locally with `NOTAM_SYNC_URL=http://YOUR_EC2_IP:3001`.
