# Portal EAD Reset Tutorial

This guide explains exactly what to **create**, **update**, and **delete** to migrate the portal to:

- new EAD airport/country source,
- unified AIP extraction technique,
- no AIP/GEN model-selection UI,
- Vercel-ready behavior.

It is written as an implementation checklist you can reuse.

---

## 1) Create New Source File

Create this file in the repo:

- `data/icao_codes_by_country_v3_cleaned.json`

Expected shape:

```json
{
  "scrapedAt": "2026-03-24T11:29:09.531Z",
  "countries": {
    "Albania (LA)": [
      { "icao": "LAKU", "name": "Kukes Airport" }
    ]
  }
}
```

Why: this becomes the canonical EAD dataset used by both local and Vercel builds.

---

## 2) Update EAD Build Artifacts

### Update

- `scripts/embed-ead-icaos.mjs`

Change source input from old files:

- `data/ead-icaos-from-document-names.json`
- `data/ead-airport-names.json`

to new source:

- `data/icao_codes_by_country_v3_cleaned.json`

Keep output the same:

- `lib/ead-country-icaos.generated.json`
- shape: `{ "Country (XX)": [{ "icao": "...", "name": "..." }] }`

### Update

- `scripts/copy-ead-icaos-to-public.mjs`

Read the new source and write:

- `public/ead-country-icaos.json`

Output should remain legacy-compatible:

- shape: `{ "Country (XX)": ["ICAO1", "ICAO2"] }`

### Run

```bash
node scripts/embed-ead-icaos.mjs
node scripts/copy-ead-icaos-to-public.mjs
```

---

## 3) Update Region/Country Menu Merge

### Update

- `app/api/regions/route.ts`

What to change:

- stop relying only on a rigid hardcoded EAD-country map,
- resolve region by matching base country name from labels like `Country (XX)`,
- keep fallback mapping for ambiguous labels (e.g. `KFOR SECTOR (BK)`).

Why: menu must include refreshed EAD countries without manual re-mapping every time.

---

## 4) Remove AIP/GEN Model Selection UI

### Update

- `app/page.tsx`
  - remove first-login model picker flow.

- `app/settings/page.tsx`
  - remove AIP model selector and GEN model selector sections.

- `app/api/user/preferences/route.ts`
  - remove `aip_model` and `gen_model` from select payload and POST update logic.

### Delete

- `components/FirstLoginModelPicker.tsx`
- `components/ModelPicker.tsx`
- `components/ModelInfoCard.tsx`

Result: no user-facing model selection for AIP/GEN.

---

## 5) Replace Old AIP Extraction Routing

Keep **PDF download** logic unchanged.

### Update

- `scripts/aip-sync-server.mjs`

Replace old extraction branching:

- remove regex-vs-AI script selection,
- call unified extractor (`aip-meta-extractor.py`),
- map extractor output to portal JSON fields,
- keep S3 upload/cache behavior.

### Update

- `app/api/aip/ead/route.ts`
- `app/api/aip/sync/route.ts`
- `app/api/aip/gen/sync/route.ts`
- `app/api/aip/gen-non-ead/route.ts`

Remove model-preference/model-query based branching from routes.

Result: extraction path uses unified technique, not per-user model choice.

---

## 6) Add New Extracted Fields to Portal

You must propagate new schema fields in:

- `app/api/airports/route.ts`
- `app/api/search/route.ts`
- `app/page.tsx`

Add support for:

- `Publication Date`
- `AD2.2 AD Operator`
- `AD2.2 Address`
- `AD2.2 Telephone`
- `AD2.2 Telefax`
- `AD2.2 E-mail`
- `AD2.2 AFS`
- `AD2.2 Website`
- `AD2.12 Runway Number`
- `AD2.12 Runway Dimensions`

Also keep existing fields:

- `Airport Code`
- `Airport Name`
- `AD2.2 Types of Traffic Permitted`
- `AD2.2 Remarks`
- `AD2.3 AD Operator`
- `AD 2.3 Customs and Immigration`
- `AD2.3 ATS`
- `AD2.3 Remarks`
- `AD2.6 AD category for fire fighting`

---

## 7) Fix Country Flags for Refreshed Labels

### Update

- `lib/country-flags.ts`

Add robust resolution:

- exact full label match (`Country (XX)`),
- base-country fallback (`Country`),
- ICAO-prefix fallback from `(XX)` to ISO code.

Why: all refreshed EAD menu countries should display flags.

---

## 8) Expand EAD Prefix Detection (UI)

### Update

- `app/page.tsx`
- `app/gen/page.tsx`

Extend `EAD_ICAO_PREFIXES` to match countries in the new dataset.

Why: EAD-specific actions/cards must appear for all valid refreshed EAD ICAOs.

---

## 9) Vercel Rollout Steps

From repo root:

```bash
npm run build
```

If build succeeds:

```bash
git add .
git commit -m "Migrate portal to cleaned EAD dataset and unified extraction"
git push
```

Then in Vercel:

1. Deploy latest commit.
2. Verify:
   - `/api/regions`
   - `/api/airports?country=...`
   - `/api/search?q=...`
   - EAD AIP sync/download flow.

---

## 10) Servers / Database / Restart Checklist

Use this to avoid deployment confusion.

### What you must update

- **Vercel app code**: deploy latest commit (this migration is code-driven).
- **AIP sync EC2 server code** (if you use external sync server):
  - pull latest repo on EC2,
  - restart the AIP sync server process.

### What you do NOT need to migrate in DB

- No required Supabase schema migration for this change.
- `aip_model` / `gen_model` columns can stay in DB (unused by new flow).
- You only need DB work if you want cleanup (optional column removal).

### Required restarts

- **Vercel**: no manual restart; new deployment is enough.
- **EC2 AIP sync server**: restart required after pull/build so new extractor flow is active.
- **NOTAM server**: restart only if you changed that service (not required by this migration).

### Example EC2 restart flow (tmux)

```bash
cd ~/clearway-2
git pull origin main
npm install

# rebuild generated artifacts / Next app as needed
npm run build

# restart your tmux-run sync process
tmux ls
tmux attach -t <your-session>
# Ctrl+C to stop old process
node scripts/aip-sync-server.mjs
# Ctrl+b then d to detach
```

### Environment variables to verify

- **Vercel**:
  - `AIP_SYNC_URL`
  - `NOTAM_SYNC_SECRET`
  - existing AWS/Supabase vars already used by app
- **EC2 sync server**:
  - `SYNC_SECRET`
  - `EAD_USER` + `EAD_PASSWORD` or `EAD_PASSWORD_ENC`
  - `AWS_*` vars if S3 upload is enabled
  - `ANTHROPIC_API_KEY` (required for `aip-meta-extractor.py` / Claude vision on EC2)
  - `OPENAI_API_KEY` / `OPENROUTER_API_KEY` if GEN rewriting uses them
- **EC2 Python packages** (for `aip-meta-extractor.py`):
  - `python3 -m pip install anthropic pymupdf pillow`

---

## 11) Quick Validation Checklist

- [ ] New source JSON exists in `data/`.
- [ ] `embed-ead-icaos.mjs` generates `lib/ead-country-icaos.generated.json`.
- [ ] Menu includes refreshed EAD countries.
- [ ] Flags render for refreshed countries.
- [ ] First-login/settings model picker removed.
- [ ] AIP extraction uses unified path (`aip-meta-extractor.py` on the sync server).
- [ ] PDF download behavior unchanged.
- [ ] Build passes before deploy.

