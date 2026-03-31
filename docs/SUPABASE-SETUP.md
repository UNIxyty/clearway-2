# Supabase setup

## Auth (login)

- Set **Project URL** and **anon key** in env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Set **service role key** in env for server auth routes: `SUPABASE_SERVICE_ROLE_KEY`.
- Optional but recommended for absolute links in emails: `NEXT_PUBLIC_SITE_URL` (for example `https://portal.clearway.aero`).
- For Google sign-in, follow [GOOGLE-AUTH-SETUP.md](./GOOGLE-AUTH-SETUP.md).

### Email/password flow (no magic link login)

This project now uses:

- Email invite/confirmation link -> user lands on `/auth/confirm` -> user sets password.
- Email/password sign-in.
- Forgot password email -> user lands on `/auth/reset` -> user sets a new password.

Setup steps:

1. Open Supabase Dashboard -> **SQL Editor**.
2. Run `docs/supabase-email-confirmations.sql`.
3. Open **Authentication -> URL Configuration**:
   - Add your app URL(s) to **Redirect URLs**.
   - Ensure `/auth/callback` is reachable from those URLs.
4. Open **Authentication -> Email Templates**:
   - Update **Invite user** template (used for first email confirmation).
   - Update **Reset password** template (used for forgot password).
   - Optional custom template after successful reset: `docs/supabase-email-password-reset-success-template.html`
     (send this via your SMTP/provider automation when password reset completes).
   - Keep Magic Link template unused for login.
5. Verify env vars in deployment and local:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (recommended)

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
