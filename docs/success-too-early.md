# Success reported because a step ran

The rule (2026-10-26): nothing claims success until the thing has succeeded. "Accepted", "pressed" or "sent" is not
"worked". Anything that can fail after the click needs somewhere to say so.

Each time this pattern has turned up, the screen reported the step that ran, not the outcome a person was relying on.
They are listed here so that the next one is recognised.

| # | Found | What the screen said | What was true | Fixed by |
|---|---|---|---|---|
| 1 | 2026-10-26 | The agent's email card said **Sent** on the click | The send could still fail or bounce, and nothing would say so | Every send is a row in Mailbox › Sent with a live delivery status from Resend's events. The card reads it: "Handed to the mail service", then Delivered or NOT delivered |
| 2 | 2026-10-26 | A help thread said **notified** | The Telegram alert had failed | The failed alert is written on the thread and shown in red, with the reason |
| 3 | 2026-10-26 | A wall viewer's proposal looked handed over | It expired without anyone seeing it | The proposal is acknowledged by the chat, or the person is told nothing was sent |
| 4 | 2026-11-02 | Changing your sign-in email: **"We emailed a link to both addresses"** | The link to the new address could never confirm, so the change could never finish. GoTrue v2.197 returns a `hashed_token` for `email_change_new` made from the *current* address, while it stores one made from the new address. The email went out; the link in it was dead | The link carries the address and its one-time code, verified with `verifyOtp({ email, token })` (docs/emails.md). `rig/client-onboarding-check.mjs` follows each address's link and asserts that the email actually changed, not that a mail was sent |
| 5 | 2026-11-02 | Forgot password, a second try within a minute: **"A reset email went to this address a moment ago. Check that inbox"** | The first send had failed: the rate limit counted the attempt, not the delivery. Nothing went, and the person was told to look for it and kept from retrying | The address is counted only once the mail service accepted the email (`lib/mail/auth-links.ts`). Found by `rig/fixes/profile-email-failure.mjs` failing on back-to-back runs, once the rig's mock Resend could refuse sends |

What #4 adds: a send can succeed and still deliver nothing usable. A check that stops at "the email was accepted" would
have passed. The check has to follow the link and assert the end state: the account's email is the new one.
