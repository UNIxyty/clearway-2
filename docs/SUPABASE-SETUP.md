# Supabase setup

## Auth (login)

- Set **Project URL** and **anon key** in env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- For Google sign-in, follow [GOOGLE-AUTH-SETUP.md](./GOOGLE-AUTH-SETUP.md).

## Tables for /stats and search logging

The **Stats** page (`/stats`) and search logging need the `search_events` table.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **SQL Editor**.
3. Run the script **`docs/supabase-search-events.sql`** (copy its contents and Execute).

That creates:

- `public.search_events` (columns: `user_id`, `query`, `result_count`, `source`, `created_at`)
- RLS so users can only insert and read their own rows.

After this, `/stats` will load and search events will be stored when users search.

**If searches still don’t save:**

1. Run the SQL above in Supabase if you haven’t.
2. Open **DevTools → Console** (enable “Warnings” or “All levels”). Run a search. You should see:
   - `[search/log] sending { query: "...", resultCount: N }` — the log request is being sent.
   - `[search/log] response 200 { logged: true }` — row was inserted.
   - `[search/log] response 401 { detail: "..." }` — no session (e.g. “No cookies in request” = cookies not sent).
   - `[search/log] response 500 { error: "..." }` — table/RLS or other server error.
3. In **DevTools → Network**, filter by “log” or find the request to `/api/search/log` and check **Status** and **Response**.
