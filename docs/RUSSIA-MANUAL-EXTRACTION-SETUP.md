# Russia + Manual Extraction Setup Guide

This guide explains everything required to run the new portal flow:

- Russia is available in portal menu/search.
- AIP is **PDF-first** (no auto extraction on search).
- AI extraction runs only when user clicks **Extract Data**.
- GEN is **PDF-only** (no AI rewrite).

---

## 1) What changed

### AIP flow (main portal)

- Opening/searching an airport now fetches/checks PDF only.
- AI extraction does **not** auto-start.
- User must click **Extract Data** on the AIP card.
- If extracted data already exists in cache, clicking **Extract Data** shows cached data (no new scrape).

### Russia support

- Russia is in menu (Europe section) and searchable.
- Russian ICAOs (`U***`) use Russian scraper path on EC2 sync server.
- Extractor remains `aip-meta-extractor.py`.

### GEN flow

- GEN AI rewrite removed from sync pipeline.
- GEN path is now PDF-only.
- Main portal has **GEN PDF** button with hover steps overlay.

---

## 2) Required environment variables

## Vercel (portal app)

Set these in Vercel project settings:

- `AIP_SYNC_URL` = public URL of your EC2 AIP sync server (example: `http://<EC2-IP>:3002`)
- `NOTAM_SYNC_SECRET` = same secret used by EC2 sync server (`SYNC_SECRET`)
- Existing AWS and Supabase vars used by your app must remain configured.

## EC2 (AIP sync server)

Set these where `scripts/aip-sync-server.mjs` runs:

- `SYNC_SECRET`
- `EAD_USER`
- `EAD_PASSWORD` or `EAD_PASSWORD_ENC`
- `AWS_S3_BUCKET` (or your existing bucket env setup)
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `ANTHROPIC_API_KEY` (required for `aip-meta-extractor.py`)

Notes:

- `OPENAI_API_KEY` / `OPENROUTER_API_KEY` are no longer required for GEN rewriting in this flow.
- Keep them only if you use them elsewhere.

---

## 3) Required packages / binaries on EC2

From repository root on EC2:

```bash
python3 -m pip install anthropic pymupdf pillow
```

For EAD browser-based PDF downloader (`xvfb-run` path), ensure OS packages are present:

```bash
sudo apt update
sudo apt install -y xvfb
```

Russia downloader script uses Python stdlib and does not require extra pip packages.

---

## 4) Deploy steps

## A) Push code (already in GitHub main)

On EC2:

```bash
cd ~/clearway-2
git pull origin main
```

If `git pull` fails because of local untracked files, move/remove conflicting files first and retry.

## B) Restart AIP sync server (tmux)

```bash
tmux ls
tmux attach -t <your-session>
# stop old process: Ctrl+C
node scripts/aip-sync-server.mjs
# detach: Ctrl+b then d
```

## C) Redeploy Vercel

- Trigger Vercel redeploy for latest `main`.
- Confirm env vars listed above are set.

---

## 5) Functional verification checklist

## Russia

- In portal menu, confirm `Russia` appears under Europe.
- Search Russian ICAO (example: `UUEE`).
- AIP card should appear with:
  - PDF viewer/download available path
  - **Extract Data** button

## Manual extraction behavior

- Search EAD ICAO (example: `EDQA`).
- Confirm extraction does **not** auto-start.
- Click **Extract Data**:
  - Card gets extraction animation.
  - Progress steps stream.
  - Extracted fields appear when done.
- Click **Extract Data** again:
  - Cached data should be shown (no forced new scrape).

## GEN behavior

- For EAD airport, click **GEN PDF** button.
- Hover on button: steps overlay should show.
- Download should return GEN PDF.
- No GEN AI rewritten text flow should be required.

## Stats page

- Log in with regular account -> open `/stats` -> should load.
- Log in with corporate account -> open `/stats` -> should load (no login loop).

---

## 6) Troubleshooting

## `AIP sync not configured`

- `AIP_SYNC_URL` missing or incorrect on Vercel.

## `Unauthorized` from sync

- `NOTAM_SYNC_SECRET` (Vercel) does not match `SYNC_SECRET` (EC2).

## `ModuleNotFoundError: anthropic` or PyMuPDF import issues

- Re-run:
  - `python3 -m pip install anthropic pymupdf pillow`

## PDF exists but extraction fails

- Check EC2 server logs in tmux session for extractor stderr.
- Verify `ANTHROPIC_API_KEY` exists in EC2 environment.

## `/stats` still loops to login

- Ensure latest `main` is deployed.
- Confirm corporate session cookie is present after corporate login.
- Confirm Supabase tables/policies for `search_events` are present and accessible.

