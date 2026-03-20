# AIP UI Fast Debug Test Guide

## Purpose

This test checks one thing only for EAD airports:

- Does AIP sync UI show loading state after search + sync click?

It is intentionally fast and skips deep validation.

## Script

- `scripts/e2e-aip-test.mjs`

## What it does

1. Reads countries/airports from portal APIs.
2. Keeps only EAD ICAOs.
3. For each airport:
   - search ICAO
   - click AIP sync
   - wait up to 10s for:
     - `Syncing AIP from server` OR
     - `Loading AIP`
4. Marks:
   - PASS if either text appears
   - FAIL otherwise
5. Sends summary to n8n webhook.

## Required setup

- Valid portal URL in `PORTAL_URL`
- Existing authenticated Playwright storage state:
  - `PLAYWRIGHT_STORAGE_STATE_PATH`
- n8n webhook URL:
  - `N8N_WEBHOOK_URL` or `WEBHOOK_URL`

## Run command

```bash
PORTAL_URL="https://clearway-2.vercel.app" \
PLAYWRIGHT_STORAGE_STATE_PATH="test-results/auth-state.json" \
N8N_WEBHOOK_URL="https://your-n8n-webhook" \
MAX_AIRPORTS=0 \
node scripts/e2e-aip-test.mjs
```

Notes:
- `MAX_AIRPORTS=0` means all.
- Set `HEADLESS=false` if you want to watch browser.

## Payload sent to n8n

```json
{
  "event": "aip_ui_debug_test",
  "timestamp": "ISO_DATE",
  "source": "scripts/e2e-aip-test.mjs",
  "summary": { "total": 0, "passed": 0, "failed": 0 },
  "results": [
    { "icao": "XXXX", "country": "Name", "pass": true, "error": "" }
  ]
}
```

## Troubleshooting

- All FAIL quickly:
  - check portal selector IDs and loading text did not change
  - verify AIP card still renders for EAD airports
- Random FAIL:
  - increase timeout from 10s to 15-20s in script
  - check EC2 AIP sync server load
- Webhook fails:
  - verify `N8N_WEBHOOK_URL`
  - test with `scripts/test-webhook.mjs`

