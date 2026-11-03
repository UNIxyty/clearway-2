# Success reported because a step ran

The rule (2026-10-26): nothing claims success until the thing has succeeded. "Accepted", "pressed" or "sent" is not
"worked". Anything that can fail after the click needs somewhere to say so.

Each time this pattern has turned up, the screen reported the step that ran, not the outcome a person was relying on.
They are listed here so that the next one is recognised.

## Case 6 (2026-11-03): the alarm itself

Cases 1 to 5 were features misreporting their own work. Case 6 was the mechanism that tells us when features do.

The developers' alert (`notifyDeveloper` in `scripts/aip-refresh.mjs`) returned **true whenever a Telegram token was
set**. It fired the request, ignored the answer and reported the alert as sent. We were about to build smoke calls on
every model path on top of it, with alarms on failure and a watcher over the watcher. Every one of them would have
reported its alert delivered because a token existed. Failures would have been found, nothing delivered, and every
screen green.

The shape is narrower than "does it handle errors": **success claimed because something is configured, not because it
worked.** A key is present, a URL is set, a file exists, a client was constructed, and that is called success. The
sweep for that shape found:

| Where | What it said | What it rested on | Now |
|---|---|---|---|
| `scripts/aip-refresh.mjs` › notifyDeveloper | alert sent | a token was set | true only when Telegram accepted the message for a chat |
| `lib/debug-runner` › Telegram summary | "Telegram summary sent." | the request had been made | logged as sent only when Telegram accepted it; otherwise "NOT sent" with the reason |
| The Intake page, **Leon API: Reachable** | Leon reachable | a refresh token was set | Leon must answer a real query (every 2 minutes at most): "Answered 18:31Z", "Not answering", "Refused the check" or "Not set up" |
| The agent's `/api/health` and the **service-status page** | the agent OK | the process answered; "auth" and "store" were "configured" because their settings were present | health carries the last smoke run's verdict. The status page shows the agent degraded when a path fails or the runs stop, and "unknown" when nothing has checked. From 31 Oct to 2 Nov every model call failed and this page read OK |
| Agent Settings: **"€X of €250 cap"** with a bar "spend against the cap", and "At the cap the agent stops replying and says so" | a spending limit | `AGENT_MONTHLY_CAP_EUR`, read only to draw the figure; nothing ever stopped | the card shows **today against the daily ceiling, which stops every model call** (`agent/lib/spend.mjs`). The month is labelled "information, no limit", and the sentence says what the ceiling does |
| Agent Settings › Capabilities: **Auto-approve reference uploads** | a switch | nothing read it | removed |
| Agent Settings › Models: **embeddings** and **rerank** rows | model settings | nothing read them after Bedrock; the extraction tier, which runs, had no row | the five tiers that run. A save stores only what differs from `models.json`: saving the form used to freeze every tier on the models of that moment |

New code for alerts uses `agent/lib/alert.mjs` (the agent) and `digital-wall/lib/agent-smoke-watch.mjs` (the wall).
Both count a message as sent only when Telegram accepted it. Proof: `rig/smoke-alarm-check.mjs` (an alert Telegram
refuses is recorded NOT sent and tried again) and `rig/configured-not-working-check.mjs`.

Settings audit, the rest of the page, checked: web search, voice, write actions, send email and the high-knowledge model
are each enforced (`tools/framework.mjs`, `server.mjs`). The escalation rules feed `escalationAfterRound` and the
router. Shortcuts, access table and sites count are what they say. The intake card's **Receiving addresses** help
overclaims: the webhook does not filter by that list; it feeds the address health display. That goes to the mail-path
item. Proof: `rig/settings-truth-check.mjs`, 6 checks.

Not the shape, checked: the workers' `/health` routes say only that the process is up, and the status page labels
them so, with separate freshness checks proving that the data arrives. Leon operators show "Connected" only after a
successful sync.

## The earlier cases

| # | Found | What the screen said | What was true | Fixed by |
|---|---|---|---|---|
| 1 | 2026-10-26 | The agent's email card said **Sent** on the click | The send could still fail or bounce, and nothing would say so | Every send is a row in Mailbox › Sent with a live delivery status from Resend's events. The card reads it: "Handed to the mail service", then Delivered or NOT delivered |
| 2 | 2026-10-26 | A help thread said **notified** | The Telegram alert had failed | The failed alert is written on the thread and shown in red, with the reason |
| 3 | 2026-10-26 | A wall viewer's proposal looked handed over | It expired without anyone seeing it | The proposal is acknowledged by the chat, or the person is told nothing was sent |
| 4 | 2026-11-02 | Changing your sign-in email: **"We emailed a link to both addresses"** | The link to the new address could never confirm, so the change could never finish. GoTrue v2.197 returns a `hashed_token` for `email_change_new` made from the *current* address, while it stores one made from the new address. The email went out; the link in it was dead | The link carries the address and its one-time code, verified with `verifyOtp({ email, token })` (docs/emails.md). `rig/client-onboarding-check.mjs` follows each address's link and asserts that the email actually changed, not that a mail was sent |
| 5 | 2026-11-02 | Forgot password, a second try within a minute: **"A reset email went to this address a moment ago. Check that inbox"** | The first send had failed: the rate limit counted the attempt, not the delivery. Nothing went, and the person was told to look for it and kept from retrying | The address is counted only once the mail service accepted the email (`lib/mail/auth-links.ts`). Found by `rig/fixes/profile-email-failure.mjs` failing on back-to-back runs, once the rig's mock Resend could refuse sends |

What #4 adds: a send can succeed and still deliver nothing usable. A check that stops at "the email was accepted" would
have passed. The check has to follow the link and assert the end state: the account's email is the new one.
