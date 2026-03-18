# Non-EAD GEN, Background Search & Notifications — Setup Tutorial

This guide covers the steps to roll out:

1. **Non-EAD GEN** — GEN 1.2 PDFs for non-EAD countries (Benin, Canada, etc.), AI-rewritten on first request and cached indefinitely
2. **Background search** — Search continues when navigating away; top banner shows progress
3. **Browser notifications** — Search/AIP/NOTAM/GEN completion notifications with user preferences

---

## Overview

| Component | Where it runs | What changed |
|-----------|---------------|--------------|
| Portal (Next.js) | Vercel | New API route, layout, page logic — deploy as usual |
| Non-EAD GEN API | Vercel | Reads PDFs from S3, rewrites with AI, writes cache to S3 |
| AIP sync server (EC2) | EC2 | No changes — non-EAD GEN is handled by Vercel |
| S3 | AWS | New prefixes: `aip/non-ead-gen-pdf/`, `aip/non-ead-gen/` |
| Supabase | Cloud | New `user_preferences` columns for notifications |

---

## 1. Database (Supabase)

### Run migration

Add notification preference columns to `user_preferences`:

1. Open **Supabase Dashboard** → **SQL Editor**
2. Run the migration from `docs/supabase-user-preferences-notifications.sql`:

```sql
-- Add notification preference columns to user_preferences
alter table public.user_preferences
  add column if not exists notify_enabled boolean not null default false,
  add column if not exists notify_search_start boolean not null default true,
  add column if not exists notify_search_end boolean not null default true,
  add column if not exists notify_notam boolean not null default true,
  add column if not exists notify_aip boolean not null default true,
  add column if not exists notify_gen boolean not null default true;
```

3. Verify: `SELECT * FROM user_preferences LIMIT 1` — new columns should appear.

---

## 2. S3 — Upload non-EAD GEN PDFs

### Prerequisites

- PDFs in `edited/` folder at project root (e.g. `Benin GEN.pdf`, `Canada GEN-GEN1.2-only.pdf`)
- AWS credentials set (env or `~/.aws/credentials`)
- `AWS_S3_BUCKET` set (same bucket as NOTAMs/AIP)

### Dry run

```bash
cd /path/to/clearway-2

# List what would be uploaded (no writes)
AWS_S3_BUCKET=myapp-notams-prod node scripts/upload-non-ead-gen-pdfs.mjs --dry-run
```

### Actual upload

```bash
AWS_S3_BUCKET=myapp-notams-prod node scripts/upload-non-ead-gen-pdfs.mjs
```

PDFs are uploaded to:

```
s3://<bucket>/aip/non-ead-gen-pdf/{PREFIX}-GEN-1.2.pdf
```

Example: `s3://myapp-notams-prod/aip/non-ead-gen-pdf/DB-GEN-1.2.pdf` (Benin).

### S3 bucket permissions

The Vercel app needs:

- `s3:GetObject` on `aip/non-ead-gen-pdf/*` and `aip/non-ead-gen/*`
- `s3:PutObject` on `aip/non-ead-gen/*` (for caching AI-rewritten JSON)

If your IAM user/role already has `s3:GetObject` and `s3:PutObject` on the bucket (or `aip/*`), no change is needed.

---

## 3. Vercel (Portal)

### Environment variables

Ensure these are set in **Vercel** → Project → **Settings** → **Environment Variables**:

| Variable | Required for | Notes |
|----------|--------------|-------|
| `AWS_S3_BUCKET` | Non-EAD GEN | Same as NOTAM/AIP bucket |
| `AWS_ACCESS_KEY_ID` | Non-EAD GEN | S3 read/write |
| `AWS_SECRET_ACCESS_KEY` | Non-EAD GEN | S3 read/write |
| `AWS_REGION` | Non-EAD GEN | e.g. `us-east-1` |
| `OPENAI_API_KEY` | Non-EAD GEN (when using OpenAI model) | For `gpt-4o-mini` etc. |
| `OPENROUTER_API_KEY` | Non-EAD GEN (when using OpenRouter model) | For `anthropic/`, `google/` etc. |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth, notifications | Existing |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth, notifications | Existing |

**Optional:** `DISABLE_AI_FOR_TESTING=true` — skips AI rewrite for non-EAD GEN (returns raw text split into parts).

### Deploy

- Push to main, or deploy from Vercel dashboard.
- No changes to build command or output directory.

---

## 4. EC2 AIP sync server

**No changes required.** Non-EAD GEN is served by the Vercel API, not the EC2 sync server.

The sync server remains for:

- EAD AIP download + extract
- EAD GEN download + extract + rewrite (for EAD countries only)

---

## 5. Scripts reference

| Script | When to run | Purpose |
|--------|-------------|---------|
| `node scripts/upload-non-ead-gen-pdfs.mjs` | One-time (or after adding new PDFs to `edited/`) | Upload PDFs to S3 |
| `node scripts/upload-non-ead-gen-pdfs.mjs --dry-run` | Before first upload | Preview without writing |

Other existing scripts (EAD download, extract, AIP sync server) are unchanged.

---

## 6. Verification

### Non-EAD GEN

1. Deploy portal, run S3 upload, ensure Supabase migration is applied.
2. Open portal, search for an ICAO in a non-EAD country (e.g. `DBBB` Benin, `CYYZ` Canada).
3. GEN section should load (or show loading then content). First load triggers AI rewrite; subsequent loads use cached JSON.

### Notifications

1. Go to **Settings** → **Browser Notifications**.
2. Click **Enable Notifications** (grant browser permission if prompted).
3. Toggle individual notification types (Search started, Search completed, NOTAM, AIP, GEN).
4. Save, then perform a search — you should see notifications when enabled.

### Background search banner

1. Start a search for an ICAO.
2. Navigate away (e.g. Settings) before it completes.
3. A banner should appear at the top: `XXXX — Loading airport data…` with stage indicators.
4. Click the banner to return to the search tab.

---

## 7. Troubleshooting

| Issue | Check |
|-------|-------|
| "S3 not configured" | `AWS_S3_BUCKET` set in Vercel |
| "No AI model selected" | User has selected GEN model in Settings; or `DISABLE_AI_FOR_TESTING=true` |
| "NoSuchKey" for PDF | Run upload script; verify PDF exists at `aip/non-ead-gen-pdf/{PREFIX}-GEN-1.2.pdf` |
| Notifications not showing | Browser permission granted; `notify_enabled` true in Settings; preference columns exist in Supabase |
| Banner not showing | Portal wrapped in `SearchProvider` (layout uses `Providers`); `useBackgroundSearch` used in page |

---

## 8. File locations

| Item | Path |
|------|------|
| Upload script | `scripts/upload-non-ead-gen-pdfs.mjs` |
| Non-EAD GEN API | `app/api/aip/gen-non-ead/route.ts` |
| Supabase migration | `docs/supabase-user-preferences-notifications.sql` |
| Source PDFs | `edited/*.pdf` (create if missing) |
