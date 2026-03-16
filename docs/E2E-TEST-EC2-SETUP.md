# E2E Portal Testing on EC2

This guide sets up an EC2 instance to run the full portal E2E flow:
- login
- country/airport checks
- screenshots
- markdown report
- Telegram notification via n8n webhook

## 1) EC2 Requirements

- Ubuntu 22.04 LTS
- Instance: `t3.medium` minimum
- Storage: `30 GB` minimum
- Security group:
  - SSH `22` from your IP
  - App ports as needed (for example `3000`, `3002`) from trusted IPs only
- IAM role (if uploading report artifacts to S3):
  - `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`

## 2) Install Dependencies

```bash
sudo apt update
sudo apt install -y git curl unzip xvfb
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Install project deps:

```bash
git clone <your-repo-url>
cd clearway-2
npm install
npx playwright install --with-deps chromium
```

## 3) Environment Variables

Create `.env.local` (or export vars in shell):

```bash
PORTAL_URL=http://localhost:3000
DISABLE_AI_FOR_TESTING=true
DISABLE_AUTH_FOR_TESTING=true

# Supabase env already required by app
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Sync server
AIP_SYNC_URL=http://localhost:3002
NOTAM_SYNC_SECRET=...
SYNC_SECRET=...

# EAD credentials for sync scripts
EAD_USER=...
EAD_PASSWORD_ENC=...

# Webhook
N8N_WEBHOOK_URL=https://your-n8n-webhook-url

# S3 report link settings
AWS_S3_BUCKET=myapp-notams-prod
AWS_REGION=us-east-1
E2E_REPORTS_S3_PREFIX=e2e-reports
E2E_REPORT_URL_EXPIRES_IN=259200
```

## 4) Start Services

Terminal 1 (portal):

```bash
DISABLE_AI_FOR_TESTING=true npm run dev
```

Terminal 2 (AIP sync server):

```bash
DISABLE_AI_FOR_TESTING=true node scripts/aip-sync-server.mjs
```

## 5) Authentication for Test Runs

Authentication is disabled for the isolated E2E instance via:

```bash
DISABLE_AUTH_FOR_TESTING=true
```

No Playwright login setup or auth-state files are required.

## 5b) Clean Start Commands

Light clean (keep repo and env):

```bash
tmux kill-session -t portal 2>/dev/null || true
tmux kill-session -t aip-sync 2>/dev/null || true
tmux kill-session -t e2e-test 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "aip-sync-server" 2>/dev/null || true
cd ~/clearway-2 && rm -rf test-results/* && mkdir -p test-results/raw test-results/screenshots
```

Full clean (like new instance):

```bash
tmux kill-server 2>/dev/null || true
pkill -f "node" 2>/dev/null || true
cd ~ && rm -rf clearway-2
git clone <your-repo-url>
cd clearway-2
npm install
npx playwright install --with-deps chromium
# Recreate .env from section 3
```

## 6) Mandatory Webhook Test Before Full Run

Before running the full E2E script, you must provide the webhook endpoint and test it:

```bash
node scripts/test-webhook.mjs
```

Only continue when the test payload is visible in Telegram through your n8n flow.

## 7) Recommended Execution Sequence

1. Quick smoke run:

```bash
DISABLE_AUTH_FOR_TESTING=true MAX_AIRPORTS=10 node scripts/e2e-portal-test.mjs
```

2. Generate markdown report:

```bash
node scripts/generate-test-report.mjs
```

3. Send final webhook:

```bash
node scripts/send-test-webhook.mjs
```

4. Full run:

```bash
node scripts/e2e-portal-test.mjs
node scripts/generate-test-report.mjs
node scripts/send-test-webhook.mjs
```

## 8) Useful Options

- Filter countries:
  - `COUNTRY_FILTER=albania node scripts/e2e-portal-test.mjs`
- Headed mode:
  - `HEADLESS=false node scripts/e2e-portal-test.mjs`
- Limit airports:
  - `MAX_AIRPORTS=25 node scripts/e2e-portal-test.mjs`

Webhook sender options:

```bash
node scripts/send-test-webhook.mjs --report-path=test-results/report-xxx.md --report-url=https://...
```

By default, `send-test-webhook.mjs` uploads the report to S3 and sends a presigned download URL in `reportUrl`.

## 9) Output Locations

- Raw results JSON:
  - `test-results/raw/e2e-results-*.json`
- Screenshots:
  - `test-results/screenshots/<country>/<icao>.png`
- Markdown report:
  - `test-results/report-*.md`

## 10) Troubleshooting

- If AIP/GEN sync fails:
  - confirm `AIP_SYNC_URL`, `SYNC_SECRET`, and sync server logs
- If webhook fails:
  - verify `N8N_WEBHOOK_URL` and test again with `scripts/test-webhook.mjs`
- If map fails often:
  - some airports may not have coordinates in source data
