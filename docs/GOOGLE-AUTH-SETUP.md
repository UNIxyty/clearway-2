# Google OAuth setup (Google Cloud + Supabase)

Full workflow so "Sign in with Google" works for the portal.

---

## 1. Get your Supabase project URL

- Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
- In **Settings → API**, copy **Project URL**. It looks like:
  - `https://abcdefghijk.supabase.co`
- The **project ref** is the part before `.supabase.co`, e.g. `abcdefghijk`. You’ll use it in step 3.

---

## 2. Google Cloud Console – create OAuth credentials

### 2.1 Create or select a project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Top bar: click the project name → **New project** (or pick an existing one).
3. Name it (e.g. "Clearway Portal") and create.

### 2.2 Configure OAuth consent screen (if not done)

1. Left menu: **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (unless you use a Google Workspace org) → **Create**.
3. Fill:
   - **App name**: e.g. "Clearway Portal"
   - **User support email**: your email
   - **Developer contact**: your email
4. **Save and Continue**.
5. **Scopes**: **Add or remove scopes** → add `.../auth/userinfo.email` and `.../auth/userinfo.profile` (OpenID) → **Save**.
6. **Test users** (if app is "Testing"): add your email so you can sign in.
7. **Save and Continue** through the summary.

### 2.3 Create OAuth client ID (Web application)

1. Left menu: **APIs & Services** → **Credentials**.
2. **+ Create credentials** → **OAuth client ID**.
3. **Application type**: **Web application**.
4. **Name**: e.g. "Clearway Supabase".
5. **Authorized JavaScript origins** (optional but recommended):
   - `https://your-app.vercel.app` (your production URL)
   - `http://localhost:3000` (for local dev)
6. **Authorized redirect URIs** (required – add exactly this):
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - Replace `YOUR_PROJECT_REF` with the ref from step 1 (e.g. `abcdefghijk`).
   - Example: `https://abcdefghijk.supabase.co/auth/v1/callback`
7. **Create**.
8. Copy the **Client ID** and **Client secret** (you’ll paste them into Supabase).

Important: Google redirects to **Supabase’s** URL (`...supabase.co/auth/v1/callback`), not to your app. Supabase then redirects the user to your app’s `/auth/callback`.

---

## 3. Supabase – enable Google provider

1. Supabase Dashboard → **Authentication** → **Providers**.
2. Find **Google** → turn it **On**.
3. Paste:
   - **Client ID**: from Google (step 2.3).
   - **Client secret**: from Google (step 2.3).
4. **Save**.

---

## 4. Supabase – URL configuration (Site URL and redirect allow list)

1. Supabase Dashboard → **Authentication** → **URL Configuration**.
2. **Site URL**: the URL where your app lives.
   - Production: `https://your-app.vercel.app` (replace with your real Vercel URL).
   - If you only use localhost for now: `http://localhost:3000`
3. **Redirect URLs**: add every URL Supabase may redirect to after login (one per line). Add at least:
   - `https://your-app.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`
   Use your real Vercel URL; wildcards are supported, e.g. `https://*.vercel.app/auth/callback` if you use preview deployments.
4. **Save**.

---

## 5. Checklist

| Where | What |
|--------|------|
| **Google Cloud – OAuth client** | Application type = **Web application** |
| **Google Cloud – Redirect URIs** | Exactly: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` |
| **Supabase – Providers** | Google **On**, Client ID + Client secret pasted |
| **Supabase – URL Configuration** | Site URL = your app origin; Redirect URLs include `.../auth/callback` for prod and localhost |

---

## 6. If Google still doesn’t work

- **Redirect mismatch**: In Google Console, the redirect URI must be exactly Supabase’s (no trailing slash, correct project ref). In Supabase, Redirect URLs must include your app’s `https://.../auth/callback` (and `http://localhost:3000/auth/callback` for dev).
- **Consent screen**: If the app is in "Testing", only test users can sign in. Add your email under OAuth consent screen → Test users, or publish the app.
- **Cookies / third‑party**: Try in an incognito window; ensure cookies aren’t blocked for your site and Supabase.
- **Browser console**: On "Sign in with Google", check the Network tab for failed requests and the Console for errors. A redirect to Google then back with an error in the URL can indicate a misconfigured redirect or Supabase URL config.
