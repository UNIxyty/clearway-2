# Auth and AI Extraction Tutorial

This guide explains exactly what was changed, what to configure in Supabase, and how to verify the new flows.

## 1) What changed in auth

### Removed

- Corporate credential/session flow was removed from runtime code:
  - `app/api/auth/login/route.ts`
  - `app/api/auth/setup-credentials/route.ts`
  - `app/api/auth/register-device/route.ts`
  - `lib/corporate-auth.ts`
  - `app/login/ui/DevicePickerCard.tsx`

### Updated

- Login UI is now email/password + Google only:
  - `app/login/ui/LoginCard.tsx`
  - `app/login/page.tsx`
- Middleware and user routes now depend on Supabase auth user session only:
  - `middleware.ts`
  - `app/api/user/preferences/route.ts`
  - `app/api/search/log/route.ts`
  - `app/stats/page.tsx`
- OAuth callback now preserves `continue` path and sanitizes redirect params:
  - `app/auth/callback/route.ts`

### Added (new auth flow)

- Email confirmation request endpoint:
  - `app/api/auth/email/request-confirmation/route.ts`
- Email confirmation + password creation endpoint:
  - `app/api/auth/email/confirm/route.ts`
- Forgot password endpoint:
  - `app/api/auth/password/forgot/route.ts`
- Password reset endpoint:
  - `app/api/auth/password/reset/route.ts`
- Confirmation page:
  - `app/auth/confirm/page.tsx`
- Reset page:
  - `app/auth/reset/page.tsx`
- Shared auth helpers:
  - `lib/auth-email-flow-utils.mjs`
  - `lib/auth-email-flow-utils.d.ts`

## 2) What changed in AI extraction prompts

English-only output requirement was added to extraction/rewriting prompt sources:

- `scripts/ead-extract-aip-from-pdf-ai.mjs`
- `docs/AIP-EXTRACT-PROMPT.md`
- `docs/GEN-REWRITE-PROMPT.md`
- `app/api/textract-benchmark/run/route.ts`
- `app/api/aip/gen-non-ead/route.ts`
- `scripts/gen-rewrite-claude-openrouter.mjs`

## 3) Environment variables to set

Add/update these env vars locally and in deployment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (recommended for correct email callback links)

Reference: `.env.example`

## 4) Supabase SQL to run

Run this script once in Supabase SQL Editor:

- `docs/supabase-email-confirmations.sql`

This creates `public.email_confirmations` used for signup confirmation token tracking.

## 5) Supabase dashboard auth setup

1. Open Supabase Dashboard -> **Authentication -> URL Configuration**.
2. Add your app URL(s) to **Redirect URLs**.
3. Ensure `/auth/callback` is allowed.
4. Open **Authentication -> Email Templates** and update:
   - **Invite user** template: `docs/supabase-email-invite-template.html`
   - **Reset password** template: `docs/supabase-email-reset-template.html`
5. Magic link login template is now legacy:
   - `docs/supabase-email-magic-link-template.html`

## 6) How signup now works

1. User enters email in login card and clicks **New account? Confirm email**.
2. App calls `POST /api/auth/email/request-confirmation`.
3. Backend:
   - creates one-time token hash row in `email_confirmations`
   - sends Supabase Invite email with redirect to `/auth/callback?next=/auth/confirm?token=...`
4. User clicks email link.
5. `/auth/callback` exchanges code to session and redirects to `/auth/confirm`.
6. `/auth/confirm` validates token with `GET /api/auth/email/confirm?token=...`.
7. User sets password.
8. `POST /api/auth/email/confirm` updates password using service role and marks token used.

## 7) How forgot password now works

1. User enters email and clicks **Forgot password?**
2. App calls `POST /api/auth/password/forgot`.
3. Supabase sends reset email.
4. User opens reset link and lands on `/auth/reset`.
5. User submits a new password.
6. `POST /api/auth/password/reset` updates password for the authenticated recovery session.

## 8) Tests added

- `tests/auth-email-flow-utils.test.mjs`
- `tests/ai-prompts-english.test.mjs`

Run:

```bash
node --test tests/auth-email-flow-utils.test.mjs tests/ai-prompts-english.test.mjs
```

## 9) Deployment checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in production
- [ ] `NEXT_PUBLIC_SITE_URL` set to production domain
- [ ] Redirect URLs include production callback URL
- [ ] Invite and Reset password templates updated
- [ ] `docs/supabase-email-confirmations.sql` applied
- [ ] Signup flow tested end-to-end
- [ ] Forgot/reset flow tested end-to-end
- [ ] Google login still works after changes
