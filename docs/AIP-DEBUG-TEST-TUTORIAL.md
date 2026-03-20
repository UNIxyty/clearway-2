# AIP UI Debug Test — Step-by-Step Tutorial

This guide covers everything you need to run the fast AIP UI debug test on your existing EC2 instance. The test checks whether the AIP loading UI appears for every EAD airport. It does **not** wait for syncs to finish, so it completes in ~15–30 minutes instead of 4–6 hours.

## Table of Contents

1. [What This Test Does](#1-what-this-test-does)
2. [Prerequisites](#2-prerequisites)
3. [SSH to EC2 and Pull Latest Code](#3-ssh-to-ec2-and-pull-latest-code)
4. [Start the Portal](#4-start-the-portal)
5. [Run the Test](#5-run-the-test)
6. [Monitor Progress](#6-monitor-progress)
7. [Check Results in Telegram](#7-check-results-in-telegram)
8. [Interpreting Results](#8-interpreting-results)
9. [Troubleshooting](#9-troubleshooting)

---

## 1) What This Test Does

For each EAD airport (1,261 airports across 47 countries):

1. Searches the ICAO on the portal.
2. Waits for the `AIP (EAD) — XXXX` card to appear.
3. Clicks the AIP sync button.
4. Waits up to 10 seconds for `Syncing AIP from server` or `Loading AIP` text to appear.
5. Takes a screenshot.

**PASS** = loading UI appeared. **FAIL** = it did not.

Map, NOTAMs, and GEN are skipped entirely (shown as ⏭️ in the report, not counted as failures).

At the end the script automatically:
- Generates a markdown report.
- Uploads it to S3.
- Sends a summary to Telegram via n8n.

**What it does NOT need:**
- AIP sync server does not need to be running.
- NOTAM sync server not needed.
- AI not needed.

---

## 2) Prerequisites

- Your EC2 instance is running.
- The `.env` file on EC2 already has these variables set (they are in your existing env):

```bash
PORTAL_URL=http://localhost:3000
DISABLE_AI_FOR_TESTING=true
DISABLE_AUTH_FOR_TESTING=true
AWS_S3_BUCKET=myapp-notams-prod
AWS_REGION=eu-north-1
N8N_WEBHOOK_URL=https://n8n.killaxtrade.com/webhook/debug
E2E_REPORTS_S3_PREFIX=e2e-reports
E2E_REPORT_URL_EXPIRES_IN=259200
```

No new env vars are needed.

---

## 3) SSH to EC2 and Pull Latest Code

From your local machine:

```bash
ssh -i ~/.ssh/aws-keys/e2e-testing-key.pem ubuntu@YOUR-EC2-IP
```

Once connected, pull the latest code:

```bash
cd ~/clearway-2
git pull
```

Install any new dependencies (safe to run even if nothing changed):

```bash
npm install
```

---

## 4) Start the Portal

The test only needs the portal (Next.js) running on port 3000. The AIP sync server and NOTAM sync server are not required.

### 4a. Check if portal is already running

```bash
tmux ls
```

If you see a session called `portal`, check it:

```bash
tmux attach -t portal
```

Look for `✓ Ready in Xms` or `○ Local: http://localhost:3000`. If it is running, detach: press `Ctrl+B` then `D`.

If the portal is already running and healthy, skip to [Section 5](#5-run-the-test).

### 4b. Start the portal (if not running)

```bash
tmux new -s portal
cd ~/clearway-2
set -a && source .env && set +a
DISABLE_AI_FOR_TESTING=true DISABLE_AUTH_FOR_TESTING=true npm run dev
```

Wait until you see:

```
✓ Ready in Xms
○ Local:        http://localhost:3000
```

Detach from tmux: press `Ctrl+B` then `D`.

### 4c. Verify the portal responds

```bash
curl -s http://localhost:3000 | head -n 5
```

Expected: HTML starting with `<!DOCTYPE html>` or similar. If you get `Connection refused`, the portal is not running — go back to step 4b.

---

## 5) Run the Test

Open a new terminal (or use your current one):

```bash
cd ~/clearway-2
set -a && source .env && set +a
```

### Option A — Full run (all 1,261 EAD airports, ~15–30 min)

```bash
node scripts/e2e-aip-test.mjs
```

### Option B — Trial run (20 airports, ~2 min)

```bash
MAX_AIRPORTS=20 node scripts/e2e-aip-test.mjs
```

### Option C — Single country

```bash
COUNTRY_FILTER=albania node scripts/e2e-aip-test.mjs
```

### Option D — Run in tmux (recommended for full run so it survives SSH disconnect)

```bash
tmux new -s aip-test
cd ~/clearway-2
set -a && source .env && set +a
node scripts/e2e-aip-test.mjs
# Ctrl+B then D to detach and let it run in background
```

To check progress later:

```bash
tmux attach -t aip-test
```

---

## 6) Monitor Progress

While the test runs you will see output like:

```
Fetching EAD airport list from portal...
Found 1261 EAD airports across 47 countries.
[1] Testing Albania :: LAKU
       PASS
[2] Testing Albania :: LATI
       PASS
[3] Testing Austria :: LOAV
       FAIL — AIP check failed: loading UI did not appear within 10s after clicking sync.
[4] Testing Austria :: LOWG
       PASS
...
```

When all airports are done:

```
E2E AIP debug run complete. Raw results: test-results/raw/e2e-results-2026-03-20T12-00-00-000Z.json
Summary: 1261 airports | 1198 passed | 63 failed

Generating report...
Report generated: test-results/report-2026-03-20T12-30-00-000Z.md

Sending webhook...
Uploaded report to s3://myapp-notams-prod/e2e-reports/report-2026-03-20T12-30-00-000Z.md
Webhook sent successfully.
Report file: test-results/report-2026-03-20T12-30-00-000Z.md
Report URL: https://myapp-notams-prod.s3.eu-north-1.amazonaws.com/... (presigned link)
```

The script handles report generation and webhook automatically — you do not need to run any extra commands.

---

## 7) Check Results in Telegram

Open your Telegram channel. You should receive a message like:

```
Event: e2e_test_complete
Timestamp: 2026-03-20T12:30:00.000Z

Summary:
- Total: 1261
- Passed: 1198
- Failed: 63

Report: https://...presigned-s3-url...
```

The report URL is a presigned S3 download link (valid 72 hours). Open it to see the full per-airport breakdown.

If no message arrives, see [Section 9 — Troubleshooting](#9-troubleshooting).

---

## 8) Interpreting Results

### PASS

The AIP loading UI appeared within 10 seconds. The airport's AIP card is working correctly.

### FAIL — page load

The `AIP (EAD) — XXXX` heading did not appear after searching. Possible causes:

- Portal is not running or crashed mid-test.
- The ICAO is not recognized as an EAD airport by the portal.

### FAIL — AIP loading UI did not appear

The sync button was found and clicked, but neither `Syncing AIP from server` nor `Loading AIP` appeared within 10 seconds. Possible causes:

- The airport has no EAD document (expected for some ICAOs — not a bug).
- The AIP sync server is down (the UI shows an error instead of a loading state).
- The portal returned a cached result immediately without showing loading state.

### Reading the report

In the markdown report, each airport shows:

```
#### ✅ LAKU - Kukës International Airport

- Page Load: ✅
- Map Loaded + Location: ⏭️ (coords missing/failed)
- NOTAMs Loaded: ⏭️
- AIP Loaded: ✅
- GEN Loaded: ⏭️
- Screenshot: ✅
```

⏭️ means skipped — these are not failures. Only ❌ means the check actually failed.

---

## 9) Troubleshooting

### Portal not responding

```bash
# Check if portal is running
curl http://localhost:3000

# If not, check tmux
tmux attach -t portal

# Restart if needed
tmux kill-session -t portal 2>/dev/null || true
tmux new -s portal
cd ~/clearway-2 && set -a && source .env && set +a
DISABLE_AI_FOR_TESTING=true DISABLE_AUTH_FOR_TESTING=true npm run dev
# Ctrl+B then D
```

### All airports FAIL immediately

The portal is probably not running or the page structure changed.

```bash
# Verify portal is up
curl -s http://localhost:3000 | head -n 3

# Check portal logs
tmux attach -t portal
```

### Many airports FAIL with timeout

The portal may be slow to respond. Increase the timeout:

```bash
AIP_LOADING_TIMEOUT_MS=15000 node scripts/e2e-aip-test.mjs
```

### Report was not generated

The script prints an error if report generation fails. Run it manually:

```bash
node scripts/generate-test-report.mjs
```

### Webhook not sent / no Telegram message

```bash
# Check the URL is set
echo $N8N_WEBHOOK_URL

# If empty, reload env
set -a && source .env && set +a

# Test the webhook directly
node scripts/test-webhook.mjs
```

If the test webhook works but the AIP test webhook does not, check that the n8n workflow is still activated.

### SSH disconnected mid-run

If you ran the test in tmux, it is still running. Reconnect:

```bash
ssh -i ~/.ssh/aws-keys/e2e-testing-key.pem ubuntu@YOUR-EC2-IP
tmux attach -t aip-test
```

### Disk full

```bash
df -h

# Clean old test results if needed
rm -rf ~/clearway-2/test-results/screenshots/*
rm -rf ~/clearway-2/test-results/raw/*
```

---

## Quick Reference

```bash
# SSH to EC2
ssh -i ~/.ssh/aws-keys/e2e-testing-key.pem ubuntu@YOUR-EC2-IP

# Pull latest code
cd ~/clearway-2 && git pull && npm install

# Load env
set -a && source .env && set +a

# Verify portal is running
curl http://localhost:3000

# Run AIP debug test (full, in tmux)
tmux new -s aip-test
cd ~/clearway-2 && set -a && source .env && set +a
node scripts/e2e-aip-test.mjs
# Ctrl+B then D to detach

# Check progress
tmux attach -t aip-test

# Run trial (20 airports)
MAX_AIRPORTS=20 node scripts/e2e-aip-test.mjs
```
