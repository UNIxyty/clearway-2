# The portal's emails: who sends them (2026-11-02)

Every email the platform sends goes out through Resend with one sender, `digital-wall/lib/mailer.mjs`. The portal
reaches it through `lib/mail/send.ts`, which adds three things:

- **The sender** comes from the brand settings, `content/docs/site.json` › `email`. `fromName` is the name people see
  (now "Clearway"). `fromAddress` is the address, which must be on a domain verified in Resend. While it is empty, the
  portal uses the address the server already sends from (`CLIENT_EMAIL_FROM`, else `DIGITAL_WALL_EMAIL_FROM`), and
  `no-reply@clearway.verxyl.com` when neither is set, the mailer's own default.
- **A row in Mailbox › Sent** (`intake_messages`, outbound), named by its kind, with no body kept: several of these
  emails carry a link that lets someone in.
- **A delivery status** on that row. It starts as Sent (accepted by Resend), or Failed, and the Resend webhook moves it
  to Delivered, Bounced or Complained (`rig/email-status-check.mjs`).

A page that sends one of these says what really happened. "Accepted by the mail service" means Resend took it.
Delivered or bounced shows later, in Mailbox › Sent. A send that fails is shown as failed and is never shown as sent.

## What Supabase used to send for us, and what moved

Until 2026-11-02, Supabase Auth sent three kinds of email itself. They came from Supabase's own sender, left no row
anywhere and had no status:

| Email | Supabase call that sent it | Used by | Now |
|---|---|---|---|
| Sign-up confirmation (invite) | `auth.admin.inviteUserByEmail` | `/signup`, and the Stage 5 client request | **Moved.** `generateLink({ type: "invite" })`, sent as `account-invite` |
| Password reset | `auth.resetPasswordForEmail` | sign-in › Forgot password, the profile pages (desk and phone), Admin › Users › Send password reset | **Moved.** `generateLink({ type: "recovery" })`, sent as `password-reset` and, from Admin › Users, as `password-reset-admin` |
| Change of sign-in email | `auth.updateUser({ email })` in the browser | Profile (desk and phone) | **Moved.** A server route, `POST /api/account/email-change`, uses `generateLink` `email_change_current` and `email_change_new`, sent as `email-change-current` and `email-change-new` |

All three moved. Supabase now only makes the link: `auth.admin.generateLink` sends nothing. `lib/mail/auth-links.ts`
sends it, and the link points at our own pages. A reset goes to `/auth/reset?token_hash=…`, a sign-up to
`/auth/callback?token_hash=…&type=invite`, and an email change to `/auth/callback?type=email_change&email=…&otp=…`. So
the links no longer depend on Supabase's redirect allow-list or on its email templates. The templates in
`docs/supabase-email-*.html` are no longer used for these three.

Not used anywhere, before or after: `auth.signUp`, `signInWithOtp` (magic links), `auth.resend`, `reauthenticate`.
`rig/check-own-mail.mjs` fails on any of them, and on the three calls above, in app/, lib/, components/ and the
services' lib folders. It is in the runner.

**The email-change link carries the address and its code, not a token hash.** GoTrue v2.197 returns the wrong hash for
`email_change_new`: one made from the *current* address, while it stores one made from the new address. A
`token_hash` link to the new address would never confirm, so the change would never finish. This was found on the rig
on 2026-11-02. The callback verifies `verifyOtp({ email, token, type: "email_change" })`, which is the public API.
Production asks both addresses to confirm (secure email change). The rig's auth autoconfirms, so on the rig the first
link completes the change. `rig/client-onboarding-check.mjs` therefore tries each address's link on its own account.

What Supabase rate-limited, we limit now:

- **Forgot password:** one email per address a minute, and ten requests per asker an hour.
- **Change of email:** one per account a minute.
- **Asking for access:** eight requests per asker an hour.
- **A new set-password link:** one per client every two minutes.

## The other emails the portal sends (all through the same path)

| Kind | When | To |
|---|---|---|
| `client-request-ops` | Someone asks for access | Everyone on the notify list (Admin › Clients › Who is told about new requests; stored in `app_settings` › `clients.notify_to`) |
| `client-invite` | Ops approve a new client, ops press "Send the link again", or an expired link asks for a new one | The address on the request, only |
| `client-approved` | Ops approve someone who already had an account (made before 2026-11-02) | The client |
| `client-refused` / `client-removed` | Ops refuse a request or remove access | The client |

Before 2026-11-02 the client decision emails had their own Resend call (`lib/clients/mail.ts`), with no row and no
status. They go through `lib/mail/send.ts` now.

## On the rig

The rig portal's mail goes to the mock Resend on :3996 (`RESEND_BASE_URL` in `.env.rig`, written by
`rig/make-env.mjs`). `rig/client-onboarding-check.mjs` reads every send back from the mock and from Mailbox › Sent.
