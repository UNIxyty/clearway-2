# Success reported because a step ran

The rule (2026-10-26): nothing claims success until the thing has succeeded. "Accepted", "pressed" or "sent" is not
"worked". Anything that can fail after the click needs somewhere to say so.

Each time this pattern has turned up, the screen reported the step that ran, not the outcome a person was relying on.
They are listed here so that the next one is recognised.

## Case 7 (2026-11-04): an empty table reported as an empty world, in the agent's own words

**What happened.** Question 10 of the ten asked about the Marseille FIR. The answer led with "no restrictions for the
Marseille FIR (LFMM)". It had read one place, the wall's limitations store, and found nothing configured. It had not
read the NOTAMs, the AIP, or anything on the web. A dispatcher reading it has been told something false by a system
that checked one place out of four.

**Why it is this list's fault.** This is our oldest bug, an empty result reported as "none", now in the product's
output rather than its plumbing. The step that ran (one store, read without error) was reported as the outcome a
person relies on (no restrictions).

**The rule.**
- The agent may never state an absence from our own data alone. "No limitations are recorded in Clearway for LFMM"
  is true and useful. "No restrictions for LFMM" is a claim about the world: it needs NOTAMs, the AIP or a search
  behind it, cited.
- Every absence says what was checked and what was not, before the conclusion.

**Where it is enforced:**
- Every internal store that returns nothing says so in those words (`agent/lib/tools/framework.mjs`, `absence`).
  The wall's limitations, IMPORTANT and CAA stores and the NOTAM cache name themselves and the time they were read.
- A reply that states an absence about the world without a source is sent back once (`agent/lib/claim-audit.mjs`).
- A question about airspace, permits, fuel, handling or a date is always searched, whatever our own data says
  (`agent/lib/turn-policy.mjs`).

**The sweep, done the same day:** the "none", "no" and "nothing found" wordings in the agent's own tool results now
name the store (the four stores above, and the generic rule for any internal tool with `count: 0`). The
knowledge-base search already said "could not be verified" rather than "none".

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

## Every status in the four apps, traced (2026-11-03)

A status page is a special case of this fault: everything on it is a claim about something else, and each claim can be
true of the wrong thing. A green dot that means less than the reader thinks is worse than no dot, because the reader
stops looking elsewhere.

Every status, badge, dot and "Reachable" in the portal, the agent, the wall and the extension was traced to what
computes it. Each one now either rests on the last real success of the thing it describes, with the time shown, or
says what it actually means.

| App | Status | It proved | Now |
|---|---|---|---|
| Wall | Operators **"Synced"** | another operator synced. An operator that had never synced showed Synced, with the global sync time beside it | this operator's own sync in the last 10 min. Otherwise "Stale" or "Not synced yet", and its own time (or "never") |
| Wall | TV sign **"NOTAM CHECKED"** | some past round was acknowledged. Yesterday's sign stayed past midnight, and for good if the morning run failed | about today: no sign before the check hour, then **CHECK** until today's round is acknowledged. A clock-driven change is broadcast |
| Wall | **"Leon feed healthy"**, Operators **"Sync health: Healthy"** | the feed was healthy before any cycle, through a hung cycle, with one operator in N, at any age | the wall's verdict: **working** (every operator synced within 10 min), **partial** ("3 of 4 operators syncing"), **stale**, **failing**, or **unknown** (not run yet). The age is always in the line |
| Wall | NOTAM airport **"All clear"** | no flags in a NOTAM copy of unknown age | green only when the NOTAMs were fetched under 12 h ago, with the time. Otherwise "No flags · data N h old", or "data age unknown" |
| Wall | Webhooks **"Healthy"** | registrations existed when last refreshed. No event ever counted as healthy, and so did "some triggers not available" | Leon confirms every trigger and an event arrived in the last 24 h. Otherwise "Registering… (not confirmed)", "no event yet" or ">24h silent". Same rule on the phone |
| Wall | Phone and tablet **"LIVE"** | the wall's stream was alive, however old Leon's data | also needs the Leon feed working. Otherwise LEON PARTIAL, LEON ERROR, LEON NOT SYNCED or STALE N MIN |
| Wall | **"Wall live · X on screen"** | a show request was sent | "Sent to the wall · X" |
| Wall | **"Sent to …"** (AIP documents), **"Notification email sent"** | the mail service accepted it | "Handed to the mail service for …" |
| Portal | Service status **Weather** | the route answered, even with an empty string and no data | weather text must be there. The label says its age is the CheckWX row |
| Portal | **AIP lookup**, **NOTAM read** | an in-memory table that always names a source; a stored file of any age | the labels say so ("names a source; fetches no AIP", "a stored file answers; its age is the CrewBriefing row") |
| Portal | **Leon feed** | `healthy !== false`: good by default, at any age | the wall's verdict (above). "N of M operators syncing", "last ran N min ago", or "unknown" |
| Portal | Worker, wall and portal **/health** rows | the process is up | labelled "process: running; tests no sync" |
| Portal | **Dispatcher agent** | the process answered | the last smoke run (fixed earlier today) |
| Portal | Phone dashboard **"Working"** | as above, with no time | the same verdicts, with "checked HH:MMZ" |
| Portal | Phone operators **"Connected"** | a past success of any age | own sync in the last 10 min; otherwise Stale or Not synced yet |
| Portal | Phone mailbox green **"Sent"** | a row was written, even for a bounced send | its delivery: Delivered, Delayed, Bounced, Not delivered, or Queued |
| Portal | Profile **"We sent a link"** | the mail service accepted it | "A link is on its way … the mail service has accepted it", with what to do if it does not arrive |
| Agent | Mailbox **"Resend: Sending"** | the domain list loaded; its "N delayed" was always 0 | the last real send and its delivery status, plus the delayed and undelivered sends of the last 24 h |
| Agent | Address pills **"Connected"** (mailbox, settings card) | receiving switched on and the webhook secret set | "Receiving enabled · last mail …". Green only when mail arrived in the last 7 days; grey "not proven" otherwise |
| Agent | Intake **mailbox** pill | the webhook secret set; a database outage read as "0 failed" and green | a read that fails says "Could not be read". Shows the age of the last email |
| Agent | Intake **CNAIR** pill | the look-up switched on | "Look-up on · last read N ago", or "never read yet" |
| Agent | Intake **Leon API** | (fixed earlier today) | also refuses a non-200 or empty answer as "answered" |
| Extension | Signed in, approved sites, badge | the agent answered at some earlier time; counts stayed up | while the agent does not answer, a banner says so with the time it last answered. The badge greys out, its tooltip says since when |

**Kept as they are, because they say what they are:**
- the AIP service-status page (set by the team, now labelled "Set by the team")
- "Containers running"
- presence dots
- the Leon flight-count line
- device last-seen times
- the extension's "offline" banner, which only makes a negative claim



| # | Found | What the screen said | What was true | Fixed by |
|---|---|---|---|---|
| 1 | 2026-10-26 | The agent's email card said **Sent** on the click | The send could still fail or bounce, and nothing would say so | Every send is a row in Mailbox › Sent with a live delivery status from Resend's events. The card reads it: "Handed to the mail service", then Delivered or NOT delivered |
| 2 | 2026-10-26 | A help thread said **notified** | The Telegram alert had failed | The failed alert is written on the thread and shown in red, with the reason |
| 3 | 2026-10-26 | A wall viewer's proposal looked handed over | It expired without anyone seeing it | The proposal is acknowledged by the chat, or the person is told nothing was sent |
| 4 | 2026-11-02 | Changing your sign-in email: **"We emailed a link to both addresses"** | The link to the new address could never confirm, so the change could never finish. GoTrue v2.197 returns a `hashed_token` for `email_change_new` made from the *current* address, while it stores one made from the new address. The email went out; the link in it was dead | The link carries the address and its one-time code, verified with `verifyOtp({ email, token })` (docs/emails.md). `rig/client-onboarding-check.mjs` follows each address's link and asserts that the email actually changed, not that a mail was sent |
| 5 | 2026-11-02 | Forgot password, a second try within a minute: **"A reset email went to this address a moment ago. Check that inbox"** | The first send had failed: the rate limit counted the attempt, not the delivery. Nothing went, and the person was told to look for it and kept from retrying | The address is counted only once the mail service accepted the email (`lib/mail/auth-links.ts`). Found by `rig/fixes/profile-email-failure.mjs` failing on back-to-back runs, once the rig's mock Resend could refuse sends |

What #4 adds: a send can succeed and still deliver nothing usable. A check that stops at "the email was accepted" would
have passed. The check has to follow the link and assert the end state: the account's email is the new one.
