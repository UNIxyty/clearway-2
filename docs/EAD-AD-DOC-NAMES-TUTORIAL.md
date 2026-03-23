# EAD AD Document Names Extractor (Debug EC2)

This guide runs the robust AD document-name extractor on your debug server, saves output, generates a report, uploads result JSON to S3, and sends webhook payload to n8n.

## 1) SSH and open project

```bash
ssh ubuntu@<your-debug-ec2-ip>
cd /home/ubuntu/clearway-2
```

## 2) Start a tmux session

```bash
tmux new -s ead-ad-names
```

Detach from tmux anytime with `Ctrl+b` then `d`.

Reattach:

```bash
tmux attach -t ead-ad-names
```

## 3) Load your existing `.env`

Your server `.env` already contains `EAD_USER`, `EAD_PASSWORD_ENC`, `AWS_S3_BUCKET`, `AWS_REGION`, and `N8N_WEBHOOK_URL`.

```bash
set -a
source .env
set +a
```

## 4) Run extractor (full run)

```bash
npm run test:ead:ad-names
```

What it does:
- Logs into EAD and opens AIP Library AD search
- Scrapes all pages for each country
- Retries each country on selector/pagination failures
- Retries when extraction looks suspiciously low
- Writes output JSON and raw run JSON
- Generates markdown report
- Sends webhook using existing `scripts/send-test-webhook.mjs`

## 5) Useful run options

Dry run until one country:

```bash
npm run test:ead:ad-names -- --stop-after "Austria (LO)"
```

Resume only countries that currently have empty output:

```bash
npm run test:ead:ad-names -- --only-failed
```

Skip webhook for a local debug run:

```bash
npm run test:ead:ad-names -- --skip-webhook
```

Custom output path:

```bash
npm run test:ead:ad-names -- --output data/ad_document_names.json
```

## 6) Reliability tuning (env vars)

Defaults are built in, but you can tune per run:

```bash
export EAD_COUNTRY_MAX_RETRIES=3
export EAD_MIN_ROWS_PER_COUNTRY=5
export EAD_MIN_PAGES_PER_COUNTRY=1
export EAD_COUNT_DROP_RATIO=0.6
```

Then run the extractor.

## 7) Output locations

- Main output: `data/ad_document_names.json`
- Raw run JSON: `test-results/raw/ead-ad-<timestamp>.json`
- Markdown report: `test-results/report-ead-ad-<timestamp>.md`

## 8) S3 upload behavior

Extractor uploads `ad_document_names.json` when `AWS_S3_BUCKET` is set.

Optional env keys:

```bash
export EAD_AD_NAMES_S3_PREFIX=ead-extract
# or explicit key:
export EAD_AD_NAMES_S3_KEY=ead-extract/ad_document_names.json
```

## 9) Report + webhook flow

At end of extractor run:
1. `scripts/generate-ead-ad-report.mjs` creates report markdown
2. `scripts/send-test-webhook.mjs` sends payload to `N8N_WEBHOOK_URL`
3. Webhook sender uploads report to S3 (presigned URL in payload)

Run report generator manually if needed:

```bash
npm run test:ead:ad-report -- --input test-results/raw/ead-ad-<timestamp>.json
```

## 10) Monitor logs in tmux

If you detached:

```bash
tmux attach -t ead-ad-names
```

If stuck or finished, terminate session:

```bash
tmux kill-session -t ead-ad-names
```
