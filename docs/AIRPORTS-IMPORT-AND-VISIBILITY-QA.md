# Airports Import and Visibility QA

This runbook verifies:
- EAD airport import updates names + coordinates in DB.
- Russian airport names are normalized to international English names.
- Deleting an airport hides it from portal browse menu only.
- Restoring airport returns it to browse menu.

## 1) Prerequisites

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Apply migration first:
- Run `docs/supabase-airports-migration.sql` in Supabase SQL editor.

## 2) Data import dry-run

```bash
npm run airports:import:dry
```

Expected:
- Outputs insert/update counts.
- Writes `data/missing-coords.json`.

## 3) Data import apply

```bash
npm run airports:import
```

Expected:
- Airports table updated from `/Users/whae/Downloads/icao_codes_by_country_v3_cleaned.json`.

## 4) Russia name normalization

Dry-run:

```bash
npm run airports:russia:map:dry
```

Apply:

```bash
npm run airports:russia:map
```

Expected:
- Russian airport names become international English names from OurAirports mapping.

## 5) Portal soft-delete / restore flow

1. Login as admin user.
2. Open browse menu, pick country/state, click trash icon on an airport.
3. Verify airport disappears from current list immediately.
4. Open `/admin/airports/deleted`.
5. Restore that airport.
6. Go back to portal browse list and verify it is visible again.

## 6) Non-destructive behavior check

- Search API and any cached artifacts are preserved.
- Delete/restore only changes `airports.visible` and `deleted_airports` log rows.

## 7) Validation SQL snippets

```sql
select count(*) from public.airports where visible = false;
select id, icao, deleted_at, restored_at from public.deleted_airports order by deleted_at desc limit 50;
select icao, name, lat, lon from public.airports where country = 'Russia' order by icao limit 50;
```
