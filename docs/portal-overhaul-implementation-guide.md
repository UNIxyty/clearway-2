# Portal Overhaul — Implementation Guide

This is a step-by-step guide covering everything that was changed in the portal overhaul: what was created, what was modified, what you need to do in Supabase, how to deploy, and how to verify each feature.

## Table of Contents

1. [What Was Created](#1-what-was-created)
2. [What Was Modified](#2-what-was-modified)
3. [Supabase: Create Corporate Auth Tables](#3-supabase-create-corporate-auth-tables)
4. [Environment Variables](#4-environment-variables)
5. [Deploy and Restart Servers](#5-deploy-and-restart-servers)
6. [Verify Each Feature](#6-verify-each-feature)
7. [AIP Debug Test — Setup and Run](#7-aip-debug-test--setup-and-run)
8. [Troubleshooting](#8-troubleshooting)

---

## 1) What Was Created

### `app/gen/page.tsx`

New standalone GEN page at `/gen`.

- Has its own search bar (airport code, name, or country).
- On search: fetches and syncs GEN only — no AIP, no NOTAMs, no map.
- Includes GEN source banner (EAD vs PDF-based).
- Supports early PDF download as soon as PDF is ready on server.
- Has Raw / AI rewritten toggle and GENERAL / Non scheduled / Private flights tabs.

### `app/api/weather/route.ts`

New weather API endpoint.

- `GET /api/weather?icao=XXXX` — returns cached weather from S3.
- `GET /api/weather?icao=XXXX&sync=1&stream=1` — proxies to EC2 NOTAM sync server `/sync/weather` with SSE streaming.
- S3 cache key: `weather/{ICAO}.json`.

### `scripts/crewbriefing-weather.mjs`

New CrewBriefing OPMET weather scraper.

- Logs in to CrewBriefing.
- Opens Extra WX.
- Clicks the OPMET tab.
- Enters ICAO in the search bar and clicks search.
- Extracts weather text from `#ResultTable td`.
- Uploads result to S3 at `weather/{ICAO}.json`.
- Writes progress to `WEATHER_PROGRESS_FILE` for SSE streaming.

Usage:

```bash
CREWBRIEFING_USER=xxx CREWBRIEFING_PASSWORD=xxx \
node scripts/crewbriefing-weather.mjs --json EVRA
```

### `app/api/auth/login/route.ts`

New corporate login endpoint.

- `POST /api/auth/login` with `{ username, password }`.
- Looks up credentials in `corporate_accounts` table (SHA-256 hash comparison).
- Detects device fingerprint from IP + User-Agent hash.
- If device is already registered: creates session, sets `clearway_session` cookie, returns `{ ok: true }`.
- If device is new: returns `{ needsProfile: true, accountId, profiles, fingerprint }` — no session yet.

### `app/api/auth/register-device/route.ts`

New device registration endpoint.

- `POST /api/auth/register-device` with `{ accountId, profileName }` or `{ accountId, selectedProfileId }`.
- Creates or selects a `device_profiles` row.
- Creates a `user_sessions` row with a UUID token.
- Sets `clearway_session` cookie.

### `app/login/ui/DevicePickerCard.tsx`

New UI component shown after corporate login when device is not recognized.

- Shows a list of existing profiles for the account.
- Has a text input to create a new profile name.
- On submit: calls `/api/auth/register-device` and redirects.

### `lib/corporate-auth.ts`

Helper functions for corporate session handling.

- `getCorporateTokenFromRequest(request)` — reads `clearway_session` cookie from a `NextRequest`.
- `getCorporateTokenFromCookieStore(cookieStore)` — reads cookie from Next.js `cookies()` store.
- `getCorporateSessionByToken(token)` — validates token against `user_sessions` table, returns session or `null`.
- `getCorporateSessionFromRequest(request)` — combines the two above.
- `setCorporateSessionCookie(response, token, expiresAt)` — writes `clearway_session` cookie.

### `scripts/e2e-aip-test.mjs`

New fast EAD-only AIP UI debug test script.

- Iterates all EAD airports only (skips non-EAD countries).
- For each airport: search ICAO → click AIP sync → wait up to 10 seconds for loading UI.
- PASS if `Syncing AIP from server` or `Loading AIP` text appears.
- FAIL if neither appears within 10 seconds.
- Sends summary + per-airport results to n8n webhook.

### `docs/corporate-auth-schema.sql`

SQL script to create corporate auth tables in Supabase.

Run this once in Supabase SQL Editor. See [Section 3](#3-supabase-create-corporate-auth-tables).

### `docs/aip-test-guide.md`

Focused guide for running the fast AIP debug test. See [Section 7](#7-aip-debug-test--setup-and-run).

---

## 2) What Was Modified

### `app/page.tsx`

- Added a **GEN page** link in the header (top-left, next to "AIP Data Portal").
- Added `MAIN_PAGE_DISABLE_GEN = true` constant — GEN fetch/sync no longer runs on the main page.
- GEN card is hidden on the main page.
- Added **WEATHER panel** in the right sidebar below NOTAMs:
  - Auto-fetches weather when airport is selected.
  - Shows sync steps during live scrape.
  - Renders weather text in a `<pre>` block.
  - Has a refresh button.
- Added **EAD source banner** on EAD AIP cards (blue, "Source: Eurocontrol (EAD)").
- Added **PDF-based source warning banner** on non-EAD AIP cards (amber, "Source: Hard Coded (PDF Based). This information may be old and inaccurate.").
- Added **AI Extracted / PDF Viewer toggle** on EAD AIP cards:
  - AI Extracted tab: shows the AI-extracted data fields (unchanged).
  - PDF Viewer tab: renders an `<iframe>` pointing to `/api/aip/ead/pdf?icao=...`.
  - AI extraction continues in background regardless of which tab is active.
- Added **early PDF download** — Download PDF button is enabled as soon as the server emits `pdfReady: true` in the SSE stream, before extraction finishes.
- Added `aipPdfReady` state per ICAO to track when PDF is available.
- Added `weatherCache`, `weatherLoadingIcao`, `weatherSyncingIcao`, `weatherSyncSteps`, `weatherSyncRequestedIcao` state.

### `scripts/aip-sync-server.mjs`

- After PDF is uploaded to S3, emits `{ step: "PDF ready", pdfReady: true, type: "aip", icao }` SSE event.
- Same for GEN: after GEN PDF is uploaded, emits `{ step: "GEN PDF uploaded to S3…", pdfReady: true, type: "gen", prefix }`.
- This allows the UI to enable PDF download before AI extraction completes.

### `scripts/notam-sync-server.mjs`

- Added `/sync/weather` endpoint.
- Runs `scripts/crewbriefing-weather.mjs` the same way `/sync` runs the NOTAM scraper.
- Supports `?stream=1` SSE with progress steps.
- Returns `{ done: true, icao, weather, updatedAt }` on success.

### `app/login/page.tsx`

- Updated subtitle text to reflect corporate login as primary and email/Google as alternatives.

### `app/login/ui/LoginCard.tsx`

- Added **corporate login section** at the top of the card:
  - Username and password fields.
  - "Sign in with corporate account" button.
  - On unknown device: shows `DevicePickerCard` inline.
- Existing **Email OTP** and **Google OAuth** sections remain below, separated by an "or" divider.
- Email and Google buttons are disabled while device picker is active.

### `middleware.ts`

- Before checking Supabase auth, checks `clearway_session` cookie via `getCorporateSessionFromRequest`.
- If a valid corporate session exists: allows the request through immediately.
- If no corporate session: falls back to existing Supabase `auth.getUser()` check.
- Both paths grant access — OTP and Google logins still work unchanged.

### `app/api/user/preferences/route.ts`

- If request has a valid `clearway_session` cookie: uses `device_profile_id` as the identity for reading/writing preferences.
- Otherwise: falls back to Supabase `user.id` as before.

### `app/api/search/log/route.ts`

- Same dual-identity logic: uses `device_profile_id` from corporate session, or Supabase `user.id` as fallback.
- Search events are saved per device profile when using corporate login.

### `lib/search-context.tsx`

- Added `weather` to the `SyncStage` type.
- Added `weather: "pending"` to initial stages.

### `components/BackgroundSearchBanner.tsx`

- Added `weather: "Weather"` to `STAGE_LABELS`.
- Added `weather` to `STAGE_ORDER`.

### `app/api/aip/ead/route.ts`

- Removed the hard block that returned 400 when no AI model was selected.
- Falls back to `process.env.OPENAI_MODEL` or `gpt-4o-mini` if no user preference is set.

### `app/api/aip/gen/sync/route.ts`

- Same change: removed hard block, falls back to `process.env.OPENAI_MODEL` or `gpt-4o-mini`.

### `package.json`

- Added `"test:e2e:aip": "node scripts/e2e-aip-test.mjs"` npm script.

---

## 3) Supabase: Create Corporate Auth Tables

This step is required for corporate login to work. Email OTP and Google OAuth continue to work without it.

### 3a. Open Supabase SQL Editor

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **SQL Editor**.

### 3b. Run the Schema Script

Copy the contents of `docs/corporate-auth-schema.sql` and paste into the SQL Editor, then click **Run**.

This creates three tables:

- `corporate_accounts` — stores username + SHA-256 password hash.
- `device_profiles` — stores per-device profile (display name, IP, UA hash) linked to an account.
- `user_sessions` — stores session tokens with expiry, linked to a device profile.

It also seeds one default account:

- **Username:** `admin`
- **Password:** `admin`

### 3c. Change the Default Password (Recommended)

To set a different password, generate its SHA-256 hash and update the row:

```bash
# Generate SHA-256 hash of your password (macOS/Linux)
echo -n "YourNewPassword" | shasum -a 256
```

Then in Supabase SQL Editor:

```sql
UPDATE corporate_accounts
SET password_hash = 'your-sha256-hash-here'
WHERE username = 'admin';
```

### 3d. Add Additional Corporate Accounts (Optional)

```sql
INSERT INTO corporate_accounts (username, password_hash)
VALUES ('ops', 'sha256-hash-of-ops-password');
```

### 3e. Device profile preferences (corporate Settings / AIP model)

Corporate users are **not** in `auth.users`, so their models and notification prefs live in a separate table.

After `docs/corporate-auth-schema.sql`, run **`docs/supabase-device-profile-preferences.sql`** in the SQL Editor once. This creates `device_profile_preferences` (FK to `device_profiles`) with the same columns as `user_preferences` for models and notifications. The Next.js API uses **`SUPABASE_SERVICE_ROLE_KEY`** to read and write this table.

---

## 4) Environment Variables

### Required (already in use)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NOTAM_SYNC_URL` | EC2 NOTAM sync server URL (e.g. `http://EC2-IP:3001`) |
| `NOTAM_SYNC_SECRET` | Shared secret for EC2 sync server auth |
| `AWS_S3_BUCKET` | S3 bucket for AIP, NOTAM, and weather cache |
| `AWS_REGION` | AWS region |
| `CREWBRIEFING_USER` | CrewBriefing login username |
| `CREWBRIEFING_PASSWORD` | CrewBriefing login password |

### New / Recommended

| Variable | Default | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Required for corporate login** (read `corporate_accounts` / sessions under RLS), **corporate preferences** (`device_profile_preferences`), **search logging** (`search_events`), and optional service-role reads of `user_preferences` for AIP model selection |
| `WEATHER_S3_PREFIX` | `weather` | S3 key prefix for weather cache files |
| `WEATHER_SYNC_URL` | — | Optional. If set, weather sync calls this host (e.g. second tmux on port **3003**). If unset, weather uses `NOTAM_SYNC_URL`. |
| `WEATHER_SYNC_SECRET` | — | Optional. Header `X-Sync-Secret` for the weather sync host; defaults to `NOTAM_SYNC_SECRET`. |

### For AIP Debug Test

| Variable | Purpose |
|---|---|
| `N8N_WEBHOOK_URL` | n8n webhook URL to receive test results |
| `PORTAL_URL` | Portal URL to test (e.g. `https://clearway-2.vercel.app`) |
| `PLAYWRIGHT_STORAGE_STATE_PATH` | Path to Playwright auth state JSON |

### Where to Set Them

- **Vercel:** Project Settings → Environment Variables.
- **EC2 sync servers:** Add to the `.env` file loaded before starting `notam-sync-server.mjs` and `aip-sync-server.mjs`.

---

## 5) Deploy and Restart Servers

### 5a. Deploy the Next.js App

Push to your main branch. Vercel will build and deploy automatically.

Verify the build passes:

```bash
npm run build
```

Expected output ends with:

```
✓ Generating static pages (39/39)
Route (app)   ...
/gen          4.02 kB
/api/weather  0 B
/api/auth/login  0 B
...
```

### 5b. Restart the NOTAM Sync Server on EC2

`notam-sync-server.mjs` can serve **both** NOTAM and weather on one port (**`SYNC_SERVER_MODE=all`**, default), or you can split **two tmux sessions** on different ports so CrewBriefing can use **two accounts on one IP** (see **5b-split** below).

SSH to your EC2 instance:

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@YOUR-EC2-IP
```

**Single process** (NOTAM + weather on port 3001):

```bash
tmux attach -t notam-sync
# Ctrl+C to stop
cd ~/clearway-2
git pull
set -a && source .env && set +a
node scripts/notam-sync-server.mjs
# Ctrl+B then D to detach
```

### 5b-split. Two tmux sessions: NOTAM (3001) + weather (3003)

**tmux 1 — NOTAM only**

```bash
export SYNC_SERVER_MODE=notam
export NOTAM_SYNC_PORT=3001
# SYNC_SECRET, AWS_*, CREWBRIEFING_USER/PASSWORD for NOTAM account
node scripts/notam-sync-server.mjs
```

**tmux 2 — weather only**

```bash
export SYNC_SERVER_MODE=weather
export NOTAM_SYNC_PORT=3003
# SYNC_SECRET (can match tmux 1 or differ — match Vercel WEATHER_SYNC_SECRET)
# CREWBRIEFING_WEATHER_USER / CREWBRIEFING_WEATHER_PASSWORD for second CrewBriefing user
export AWS_S3_BUCKET=...   # same bucket as NOTAM
node scripts/notam-sync-server.mjs
```

**Vercel**

- `NOTAM_SYNC_URL=http://EC2-IP:3001`
- `WEATHER_SYNC_URL=http://EC2-IP:3003`
- `NOTAM_SYNC_SECRET` / `WEATHER_SYNC_SECRET` aligned with each process’s `SYNC_SECRET`

Open **both ports** in the EC2 security group.

See also **`docs/LOCAL-NOTAM-WEATHER.md`** for env details.

Verify it started:

```bash
tmux attach -t notam-sync
```

Expected output:

```
NOTAM sync server listening on port 3001 | scraper: scripts/crewbriefing-notams.mjs
```

### 5c. Restart the AIP Sync Server on EC2

The AIP sync server now emits `pdfReady` SSE events. Restart it:

```bash
tmux attach -t aip-sync
# Ctrl+C to stop
cd ~/clearway-2
git pull
set -a && source .env && set +a
node scripts/aip-sync-server.mjs
# Ctrl+B then D to detach
```

Expected output:

```
AIP sync server listening on port 3002 | download: scripts/ead-download-aip-pdf.mjs | extract: AI
```

---

## 6) Verify Each Feature

### 6a. GEN Separate Page

1. Open the portal (`/`).
2. Confirm there is a **GEN page** link in the top-left header area.
3. Search any airport — confirm GEN does **not** auto-sync on the main page.
4. Click **GEN page** link — confirm it opens `/gen`.
5. On `/gen`, search an airport (e.g. `EVRA`) — confirm GEN syncs and content loads.

### 6b. Early PDF Download

1. On the main page, search an EAD airport (e.g. `EDDF`).
2. Click **Sync** on the AIP card.
3. Watch the sync steps. When `PDF uploaded to S3…` step appears, the **Download PDF** button should become enabled immediately — before extraction finishes.

### 6c. Source Banners

1. Search an EAD airport (e.g. `LBBG`) — confirm blue banner: "Source: Eurocontrol (EAD)".
2. Search a non-EAD airport (e.g. `OIAA`) — confirm amber banner: "Source: Hard Coded (PDF Based). This information may be old and inaccurate."

### 6d. Corporate Login

1. Open `/login`.
2. Confirm the **Corporate login** section appears at the top of the card.
3. Enter `admin` / `admin` and click **Sign in with corporate account**.
4. If this is the first time from this device: the **DevicePickerCard** appears. Create a profile name (e.g. "My Laptop") and click **Continue**.
5. Confirm you are redirected to the portal.
6. Confirm Email OTP and Google OAuth options are still visible below the corporate section.

### 6e. PDF Viewer

1. Search an EAD airport and sync AIP.
2. Once sync completes (or PDF becomes ready), look for the **AI Extracted / PDF Viewer** toggle above the AIP card content.
3. Click **PDF Viewer** — confirm an embedded PDF appears.
4. Click **AI Extracted** — confirm the extracted data fields appear again.

### 6f. Weather Panel

1. Search any airport.
2. In the right sidebar, below NOTAMs, confirm a **Weather** section appears.
3. If weather data is cached in S3, it loads immediately.
4. Click the refresh button on the Weather section — confirm it syncs live from CrewBriefing and shows steps.
5. After sync, confirm METAR/TAF text is displayed.

---

## 7) AIP Debug Test — Setup and Run

This test checks only one thing for EAD airports: does the AIP loading UI appear after clicking sync?

### 7a. Prerequisites

- A running portal (Vercel or local).
- A valid Playwright auth state file at `test-results/auth-state.json` (from a previous login session, or use `DISABLE_AUTH_FOR_TESTING=true`).
- `N8N_WEBHOOK_URL` set in your environment.

### 7b. Run the Test

```bash
cd ~/clearway-2
set -a && source .env && set +a

PORTAL_URL="https://clearway-2.vercel.app" \
PLAYWRIGHT_STORAGE_STATE_PATH="test-results/auth-state.json" \
N8N_WEBHOOK_URL="https://your-n8n-webhook" \
node scripts/e2e-aip-test.mjs
```

To limit airports during a trial run:

```bash
MAX_AIRPORTS=20 node scripts/e2e-aip-test.mjs
```

Or use the npm script:

```bash
npm run test:e2e:aip
```

### 7c. What the Output Looks Like

```
[1] Albania :: LAKU
[2] Albania :: LATI
[3] Austria :: LOAV
...
Webhook sent.
{
  "event": "aip_ui_debug_test",
  "summary": { "total": 120, "passed": 115, "failed": 5 },
  "results": [
    { "icao": "LAKU", "country": "Albania", "pass": true, "error": "" },
    { "icao": "LOAV", "country": "Austria", "pass": false, "error": "AIP loading UI did not appear within 10s" }
  ]
}
```

### 7d. What PASS and FAIL Mean

| Result | Meaning |
|---|---|
| PASS | AIP loading UI appeared — sync is working for this airport |
| FAIL | AIP loading UI did not appear within 10 seconds — something is wrong |

### 7e. Common Reasons for FAIL

| Symptom | Likely Cause | Fix |
|---|---|---|
| All airports FAIL | Portal selectors changed | Check that `AIP (EAD) — XXXX` heading still renders; update selector in script if needed |
| All airports FAIL | AIP sync server is down | SSH to EC2, check `tmux attach -t aip-sync` |
| Specific airports FAIL | EAD has no document for that ICAO | Expected — not a bug |
| Random airports FAIL | 10s timeout too short | Increase timeout in `runOneAirport` from `10000` to `15000` |

---

## 8) Troubleshooting

### Corporate login returns "Invalid credentials"

- Verify the `corporate_accounts` table exists in Supabase (run `docs/corporate-auth-schema.sql`).
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel env vars (the anon key cannot read this table due to RLS).
- Verify the password hash is correct. Test it:

```bash
echo -n "admin" | shasum -a 256
# Should output: 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918
```

### Weather panel shows error after sync

- Verify `CREWBRIEFING_USER` and `CREWBRIEFING_PASSWORD` are set on the EC2 NOTAM sync server.
- Verify the NOTAM sync server was restarted after the latest code pull.
- Check sync server logs: `tmux attach -t notam-sync`.
- Test the weather endpoint directly:

```bash
curl "http://localhost:3001/sync/weather?icao=EVRA&secret=YOUR_SECRET"
```

### Browser console: `502` on `/api/weather`

- Vercel returns **502** when the app cannot reach the weather sync URL (**`WEATHER_SYNC_URL`** if set, else **`NOTAM_SYNC_URL`** + `/sync/weather`), the secret is wrong (upstream **401**), the request times out (120s), or the upstream body is not valid JSON.
- In DevTools → **Network**, open the failed `weather` request and read the JSON **`error`** and **`detail`** (the portal shows them in the UI).
- If you use **two processes**, confirm **`WEATHER_SYNC_URL`** hits the **weather-only** listener (e.g. port **3003**) with **`GET /sync/weather`**; **`NOTAM_SYNC_URL`** is for **`/sync`** only.
- Confirm **`WEATHER_SYNC_SECRET`** (or **`NOTAM_SYNC_SECRET`**) matches **`SYNC_SECRET`** on the weather sync process.

### PDF Viewer shows blank or "PDF loading…"

- The PDF is not yet on S3. Sync the AIP first and wait for the `PDF uploaded to S3…` step (or wait for the portal to detect the file via `HEAD` on `/api/aip/ead/pdf`).
- The viewer uses **`/api/aip/ead/pdf?icao=XXXX&inline=1`** so the browser displays the PDF instead of forcing a download.
- If sync completed but PDF viewer is still blank: open `/api/aip/ead/pdf?icao=XXXX&inline=1` directly; check S3 key `aip/ead-pdf/{ICAO}.pdf` and IAM `s3:GetObject`.

### AIP sync shows "Error 402 — Insufficient API credits"

- OpenRouter returned **402** (out of credits). Add credits at [openrouter.ai/settings/credits](https://openrouter.ai/settings/credits) or switch model/provider on the EC2 AIP sync host (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`).

### GEN page shows "No GEN content yet" after sync

- Verify `AIP_SYNC_URL` points to the running AIP sync server.
- Verify the AIP sync server was restarted after the latest code pull.
- Check sync server logs: `tmux attach -t aip-sync`.

### Email OTP or Google login stopped working

- These are unchanged. If they stopped working, check Supabase Auth settings (redirect URLs, Google OAuth config).
- The corporate login changes do not affect OTP or Google — they only add an extra session check in middleware.

### Stats not saving for corporate users

- Verify `SUPABASE_SERVICE_ROLE_KEY` is set — it is needed to look up the session **and** insert into `search_events` (RLS blocks anon for corporate `user_id` values).
- Verify the `device_profiles` and `user_sessions` tables exist (run `docs/corporate-auth-schema.sql`).

### Corporate Settings / preferences fail or FK errors on `user_preferences`

- Run **`docs/supabase-device-profile-preferences.sql`**. Corporate accounts must use **`device_profile_preferences`**, not `user_preferences` (which references `auth.users`).

---

## Summary Checklist

Before going live, verify:

- [ ] `docs/corporate-auth-schema.sql` run in Supabase SQL Editor
- [ ] `docs/supabase-device-profile-preferences.sql` run in Supabase SQL Editor (corporate prefs)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` added to Vercel env vars
- [ ] `WEATHER_S3_PREFIX` added to Vercel env vars (optional, defaults to `weather`)
- [ ] NOTAM sync server restarted on EC2 (picks up `/sync/weather`)
- [ ] AIP sync server restarted on EC2 (picks up `pdfReady` events)
- [ ] Corporate login tested: `admin` / `admin` works
- [ ] Device picker appears on first login from a new device
- [ ] GEN page (`/gen`) loads and syncs independently
- [ ] Weather panel appears and syncs on main page
- [ ] PDF Viewer tab appears on EAD AIP card after sync
- [ ] Source banners visible on both EAD and non-EAD airport cards
- [ ] Email OTP and Google OAuth still work
