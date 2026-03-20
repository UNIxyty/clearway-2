# Tutorial: Corporate preferences, PDF viewer, weather errors & OpenRouter 402

This document describes **only the changes** added to fix corporate login/preferences, EAD PDF viewing, early PDF download, clearer weather `502` responses, and **402 insufficient credits** messaging. It is separate from the main [portal overhaul guide](portal-overhaul-implementation-guide.md).

---

## 1. What changed (summary)

| Area | Problem | Fix |
|------|---------|-----|
| **Corporate login / Settings** | `user_preferences.user_id` must exist in `auth.users`; corporate users use `device_profiles.id` → FK error and RLS issues. | New table `device_profile_preferences`; `/api/user/preferences` uses **service role** and the correct table per identity. |
| **Search stats (corporate)** | Inserts into `search_events` as anon without `auth.uid()` → RLS could block. | Corporate path uses **service role** for inserts. |
| **AIP sync model (corporate)** | `/api/aip/ead` only read `user_preferences` for JWT users. | Reads `aip_model` from `device_profile_preferences` when `clearway_session` is present. |
| **PDF viewer** | API sent `Content-Disposition: attachment` → iframe triggered download. | `GET` with `?inline=1` sends **inline**; explicit download uses `?download=1`. |
| **Download before AI finishes** | Button waited for SSE `pdfReady` or cached JSON `updatedAt`. | **`HEAD /api/aip/ead/pdf?icao=XXXX`** probes S3; UI enables download/viewer when PDF exists. |
| **Weather `502`** | Opaque failures when upstream returned non-JSON or empty body. | `/api/weather` reads response as **text**, parses JSON when possible, returns clearer **`detail`**. |
| **Insufficient credits** | Huge stderr blob; no structured code for the UI. | `aip-sync-server.mjs` detects OpenRouter **402** → `{ code: 402, error, detail }`; portal shows **Error 402 — Insufficient API credits**. |

---

## 2. Supabase: run the new SQL (required for corporate prefs)

1. Open **Supabase** → **SQL Editor**.
2. Ensure you already ran [`docs/corporate-auth-schema.sql`](corporate-auth-schema.sql) (`corporate_accounts`, `device_profiles`, `user_sessions`).
3. Run the full script **[`docs/supabase-device-profile-preferences.sql`](supabase-device-profile-preferences.sql)** once.

This creates **`device_profile_preferences`** with the same preference columns as `user_preferences`, keyed by **`device_profile_id`** → `device_profiles(id)`.

**Do not** point corporate users at `user_preferences`; that table stays for Supabase Auth users only.

---

## 3. Vercel: `SUPABASE_SERVICE_ROLE_KEY`

Set **`SUPABASE_SERVICE_ROLE_KEY`** in Vercel (same project as `NEXT_PUBLIC_SUPABASE_URL` / anon key).

**Why it matters:**

- **Corporate login** reads `corporate_accounts` / `user_sessions` (RLS blocks the anon key from the browser).
- **`/api/user/preferences`** for corporate reads/writes **`device_profile_preferences`** with the service role.
- **`/api/search/log`** for corporate inserts into **`search_events`** with the service role.

Without it, corporate flows return **503** (“Server misconfigured”) or fail login against RLS.

> Never expose the service role key in client-side code. It is only used in Next.js **server** routes.

---

## 4. New server helper

- **[`lib/supabase-admin.ts`](../lib/supabase-admin.ts)** — `createSupabaseServiceRoleClient()` returns a Supabase client using `SUPABASE_SERVICE_ROLE_KEY`, or `null` if unset.

---

## 5. API routes touched

| Route | Behavior |
|-------|----------|
| [`app/api/user/preferences/route.ts`](../app/api/user/preferences/route.ts) | Corporate → `device_profile_preferences` + service role. JWT → `user_preferences` (service role if set, else anon SSR client). |
| [`app/api/search/log/route.ts`](../app/api/search/log/route.ts) | Corporate → insert via service role; JWT → unchanged pattern with optional service role. |
| [`app/api/aip/ead/route.ts`](../app/api/aip/ead/route.ts) | Corporate `aip_model` from `device_profile_preferences`; sync error JSON may include **`code`** (e.g. **402**); proxy may return HTTP **402**. |
| [`app/api/aip/ead/pdf/route.ts`](../app/api/aip/ead/pdf/route.ts) | **`HEAD`** → 200 if object exists, 404 if missing. **`GET`**: `inline` disposition if `?inline=1`; **`attachment`** if `?download=1` or default. |
| [`app/api/weather/route.ts`](../app/api/weather/route.ts) | On sync failures, reads upstream body as text; builds **`error` / `detail`** even when body is not JSON. |

---

## 6. Portal UI ([`app/page.tsx`](../app/page.tsx))

- **`formatAipSyncError()`** — If API/SSE payload has **`code === 402`**, shows a short **Error 402 — Insufficient API credits** line (plus `detail`).
- **`aipPdfExistsOnServer`** — After you open an EAD airport, the app sends **`HEAD`** to `/api/aip/ead/pdf?icao=...`. If **200**, download + **PDF Viewer** are enabled even if AI extraction is not done.
- **Iframe** uses **`&inline=1`** so the PDF displays in-page.
- **Download** button fetches with **`&download=1`** so the response is intended as a download.

---

## 7. EC2: AIP sync server (`aip-sync-server.mjs`)

**File:** [`scripts/aip-sync-server.mjs`](../scripts/aip-sync-server.mjs)

- Adds **`syncFailurePayload(err)`** — Detects OpenRouter **402** / “Insufficient credits” in the error string and returns a structured payload with **`code: 402`** for both **SSE** and **non-stream JSON** responses (AIP `/sync` and GEN `/sync/gen` where applicable).

**Deploy step:** On the machine that runs AIP sync, **pull the repo** and **restart** the Node process (e.g. your `tmux` session). Until you do, the portal will not receive structured **402** from the sync host.

---

## 8. How to verify

### Corporate user

1. `SUPABASE_SERVICE_ROLE_KEY` set on Vercel; SQL for `device_profile_preferences` applied.
2. Log in with corporate credentials → no `user_preferences_user_id_fkey` error.
3. Open **Settings** / model pickers → prefs save/load (stored in `device_profile_preferences`).

### PDF (EAD airport)

1. After a sync uploads `aip/ead-pdf/{ICAO}.pdf` to S3, **Download PDF** should enable (possibly before AI extract completes).
2. **PDF Viewer** tab should **show** the PDF (not force a browser download).
3. Optional: `curl -I "https://YOUR_APP/api/aip/ead/pdf?icao=EDDM"` → expect **200** when the file exists.

### Weather

1. If you still see **502**, open DevTools → **Network** → the `weather` request → read JSON **`detail`** (should explain unreachable host, timeout, or non-JSON upstream).
2. Confirm **`NOTAM_SYNC_URL`**, **`NOTAM_SYNC_SECRET`**, and EC2 **`GET /sync/weather`**.

### OpenRouter 402

1. Trigger a failing AIP sync with exhausted credits (or simulate on a staging sync server).
2. Portal should show **Error 402 — Insufficient API credits** and the message from OpenRouter where available.

---

## 9. Reference: env vars (no new names except what you already use)

| Variable | Notes |
|----------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** for full corporate + prefs + search log behavior. |
| `NOTAM_SYNC_URL` / `NOTAM_SYNC_SECRET` | Weather sync proxy; must match EC2. |
| `AWS_*` | Unchanged; PDF **HEAD**/**GET** still need bucket + credentials on Vercel. |
| `AIP_SYNC_URL` | Unchanged; portal still calls your AIP EC2 for extraction. |

---

## 10. Optional cross-link

For the broader portal overhaul (login UI, `/gen`, CrewBriefing, etc.), see **[`docs/portal-overhaul-implementation-guide.md`](portal-overhaul-implementation-guide.md)** — especially **§3e** (device prefs) and **§8** troubleshooting updates that mirror this tutorial.
