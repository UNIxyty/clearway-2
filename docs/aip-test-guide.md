# AIP UI Fast Debug Test Guide

## Purpose

Quickly check whether the AIP loading UI appears for every EAD airport — without waiting for full syncs to complete. Runs in ~15–30 minutes instead of 4–6 hours.

## Script

- `scripts/e2e-aip-test.mjs`

## What it checks per airport

| Check | How |
|---|---|
| Page load | `AIP (EAD) — XXXX` heading appears after searching |
| AIP loading UI | `Syncing AIP from server` or `Loading AIP` text appears within 10s of clicking sync |
| Screenshot | Taken immediately after AIP check |
| Map | Skipped (⏭️ in report) |
| NOTAMs | Skipped (⏭️ in report) |
| GEN | Skipped (⏭️ in report) |

The test does **not** wait for AIP sync to finish. It only checks that the UI reacts.

## What it does NOT need

- AIP sync server does not need to be running.
- NOTAM sync server not needed.
- AI not needed (`DISABLE_AI_FOR_TESTING=true` is fine).

## What it produces

Same output shape as `e2e-portal-test.mjs`, so `generate-test-report.mjs` and `send-test-webhook.mjs` work unchanged. The script runs both automatically at the end.

Output files:
- `test-results/raw/e2e-results-{timestamp}.json`
- `test-results/report-{timestamp}.md`
- Telegram notification via n8n

## Run command

```bash
cd ~/clearway-2
set -a && source .env && set +a

node scripts/e2e-aip-test.mjs
```

Or with npm:

```bash
npm run test:e2e:aip
```

## Options

| Env var | Default | Purpose |
|---|---|---|
| `MAX_AIRPORTS` | `0` (all) | Limit airports for a trial run |
| `COUNTRY_FILTER` | `""` | Filter by country name (partial match) |
| `AIP_LOADING_TIMEOUT_MS` | `10000` | How long to wait for loading UI after a manual sync click (ms) |
| `AIP_SYNC_READY_TIMEOUT_MS` | `120000` | Max wait for auto AIP sync to start or the Sync button to enable (first visit has no cache, so Sync stays disabled until auto-sync begins or finishes) |
| `HEADLESS` | `true` | Set to `false` to watch the browser |
| `PORTAL_URL` | `http://localhost:3000` | Portal URL to test |
| `DISABLE_AUTH_FOR_TESTING` | — | Set to `true` to skip login |

## Sample output

```
Fetching EAD airport list from portal...
Found 1261 EAD airports across 47 countries.
[1] Testing Albania :: LAKU
       PASS
[2] Testing Albania :: LATI
       PASS
[3] Testing Austria :: LOAV
       FAIL — AIP check failed: loading UI did not appear within 10s after clicking sync.
...
E2E AIP debug run complete. Raw results: test-results/raw/e2e-results-2026-03-20T12-00-00-000Z.json
Summary: 1261 airports | 1198 passed | 63 failed

Generating report...
Report generated: test-results/report-2026-03-20T12-30-00-000Z.md

Sending webhook...
Webhook sent successfully.
```

## Interpreting results

| Result | Meaning |
|---|---|
| PASS | AIP loading UI appeared — airport's AIP card is working |
| FAIL (page load) | Airport card did not render — check portal is running |
| FAIL (AIP loading UI) | Sync stayed disabled with no loading UI for `AIP_SYNC_READY_TIMEOUT_MS` (stuck auto-sync), or after a click loading never appeared — check AIP EC2 sync server |

## Troubleshooting

**All airports FAIL immediately:**
- Verify portal is running: `curl http://localhost:3000`
- Check that `AIP (EAD) — XXXX` heading still renders for EAD airports in the portal UI

**Many FAIL with “sync button … disabled” or timeout:**
- The portal **auto-starts** AIP sync on first open of an airport (no cache); the Sync button is disabled until that run starts or ends. The script waits up to `AIP_SYNC_READY_TIMEOUT_MS` (default 2 min).
- Increase if EC2 sync is slow: `AIP_SYNC_READY_TIMEOUT_MS=180000 node scripts/e2e-aip-test.mjs`
- After sync is clickable, loading detection still uses: `AIP_LOADING_TIMEOUT_MS=15000 node scripts/e2e-aip-test.mjs`
- Check AIP sync server is running if you expect it to respond: `tmux attach -t aip-sync`

**Report not generated:**
- Check `test-results/raw/` for the JSON file
- Run manually: `node scripts/generate-test-report.mjs`

**Webhook not sent:**
- Verify `N8N_WEBHOOK_URL` is set: `echo $N8N_WEBHOOK_URL`
- Test webhook: `node scripts/test-webhook.mjs`
