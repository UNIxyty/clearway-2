# Agent build — status

Single source of truth for what is **built, on `main`, and deployed** for the dispatcher-agent
series (Prompts 0–10). Nothing here is "done" because it was written: a part is only `Deployed`
when its commits are on `main` **and** the containers have been rebuilt on the server. Every entry
carries commit hashes and a deployed yes/no so this is checkable, not remembered.

**Standing rules (apply to every part)**
- The agent acts as the signed-in user, never a service account. If a dispatcher can't do it in the
  console, the agent can't do it for them.
- The backend enforces permissions and validation — never the model, never the prompt.
- Audit everything from the first commit.
- Provider is Amazon Bedrock (Anthropic + Amazon; OpenAI optional). Gemini is not available.
- This file records what is on `main` and deployed, not what was written.

**Status values:** `Not started` · `In progress` · `Built, not deployed` · `Deployed` · `Deferred`

**Deploy command (server `root@clearway-2`, repo checkout):**
`git pull origin main && docker compose up -d --build` — then confirm `git rev-parse --short HEAD`
on the server matches the hash recorded here, and `docker ps` shows the rebuilt containers.

## Overview

| Part | Status | Commits | Deployed | Notes |
|---|---|---|---|---|
| 0 — Prerequisites and the status file | Deployed | `013e63f` `944e9b6` `d538eaa` `ccc52bb` `a35b30d` `72f5dc4` `bd5019b` | **Yes** — server HEAD `bd5019b`, 2026-09-23 11:06Z | P1–P4 live and verified against production. P5 is documentation only: no Bedrock invocation has succeeded (AWS key invalid) |
| 1 — Foundation and access control | Deployed | `eb9e600` `547484a` `47ff09b` `0bbf416` `93d5761` `d6620b1` | **Yes** — 2026-09-23 17:32Z | Agent live at `/agent/*`; verifier 10/10 locally; grant+revoke proven in production. Outstanding: one real chat turn from a browser session |
| 2 | Not started | — | No | |
| 3 | Not started | — | No | |
| 4 | Not started | — | No | |
| 5 | Not started | — | No | |
| 6 | Not started | — | No | |
| 7 | Not started | — | No | |
| 8 | Not started | — | No | |
| 9 | Not started | — | No | |
| 10 | Not started | — | No | |

## Part 0 — Prerequisites and the status file

**Status: Deployed** (2026-09-23 11:06Z). Server `root@clearway-2:~/clearway-2` reports
`git rev-parse --short HEAD` = **`bd5019b`**, matching `origin/main`; `portal` and
`digital-wall-backend` were rebuilt. Post-deploy verification against production below.

**One caveat on the overview row:** P5 is marked deployed only in the sense that its doc and script
are on the server. **No Bedrock call has ever succeeded** — see Decisions. Do not read Part 0's
`Deployed` as "the agent can reach a model".

### Post-deploy verification (production, 2026-09-23 11:06Z)

| Check | Result |
|---|---|
| `GET /api/health` | `{"ok":true,"service":"portal"}` |
| `GET /files/probe.pdf`, no session | **307** → `/login?next=/files/probe.pdf` (was 400 = bypass) |
| `GET /files/probe.pdf`, wrong secret header | **307** → `/login` (header is genuinely checked, not merely present) |
| `GET /api/bug-reports`, no session | 307 → `/login` |
| `GET /digital-wall/api/health` | `{"ok":true,...,"leon":{"configured":true,"healthy":true}}` |
| `GET /digital-wall/api/flight-checks?...`, no session | 401 with the wall's auth message — new P4 route is live behind the gate |
| `/favicon.ico` | unchanged (no regression on real static assets) |

**Still unverified — the one way P3 could break the wall:** that the wall's outgoing secret still
matches the portal's. Externally untestable. Run on the server:

```bash
docker compose exec digital-wall-backend sh -c \
  'curl -s -o /dev/null -w "%{http_code}\n" \
   -H "x-debug-runner-secret: ${PORTAL_INTERNAL_SECRET:-$DEBUG_RUNNER_INTERNAL_SECRET}" \
   "$PORTAL_BASE_URL/files/probe.pdf"'
```

**400** = the wall reaches the file route (invalid path, as expected) → PDFs work.
**307** = the secrets differ → every cached-PDF fetch, NOTAM lookup and AIP send from the wall is
broken; fix by making `PORTAL_INTERNAL_SECRET` (wall) equal `DEBUG_RUNNER_INTERNAL_SECRET` (portal).
Opening a flight's AIP document on the wall is the equivalent manual check.

### What was built

| Item | Commit | On `main` | Deployed |
|---|---|---|---|
| Status file created | `013e63f`, `bd5019b` | yes | yes |
| P1 — Airport and country coverage | `944e9b6` (+ data applied to Supabase directly) | yes | yes — data was live on apply |
| P2 — `GET /api/bug-reports` scoped to caller, developers see all | `d538eaa` | yes | yes — verified 307 unauth |
| P3 — `/files/*` behind session check, wall header path preserved | `ccc52bb` | yes | yes — verified 307 + wrong-secret 307 |
| P4 — Wall store CRUD completeness | `a35b30d` | yes | yes — verified route live behind 401 gate |
| P5 — AWS + Bedrock access | `72f5dc4` `470eef5` `00df61b` `e5d484d` `69672f2` `8c27f7c` | yes | **Verified** — live Converse responses from eu-north-1 (Haiku 4.5, Nova Pro; earlier also Sonnet 4.6, Opus 4.6, Nova Lite) |

**P1 — coverage (Supabase `airports`, applied 2026-09-23 10:45Z via `scripts/airports-backfill-ourairports.mjs --apply`)**

| | Before | After |
|---|---|---|
| Rows | 2,530 | 6,400 |
| ISO territories with ≥1 airport | 107 | 240 |
| Country labels | 107 | 240 |

Reference source: OurAirports (public domain, `davidmegginson.github.io/ourairports-data`), 249 ISO
territories, 22,279 non-closed airports with a 4-letter ICAO. Policy: every large + medium airport
worldwide, plus small airports **with scheduled service** only in territories that had no row at
all. 3,870 inserts, all tagged `source = ourairports_backfill_2026-09` (so they can be listed or
reverted with one `where`); 2,322 in 133 previously absent territories, 1,548 filling gaps in
covered ones (largest: USA 842, Russia 137, Philippines 53, Iran 48, UK 41). 83 existing rows
repaired where the name was the `XXXX Airport` placeholder or lat/lon was 0 — including the
post-October-2025 Uzbekistan codes.

Reported cases: **`DTTA`** Tunis–Carthage — present (manual seed), coords 36.851/10.227.
**`UZTP`** Tashkent-Khumo Intl, **`UZTT`** Tashkent Intl, **`UZSS`** Samarkand Intl — all present,
previously `Uztp Airport` at 0/0, now real names and coordinates. Exact-ICAO search hits the DB
row first (`app/api/search/route.ts` `searchVisibleAirportsFromDb`), so all four resolve.

Still missing and why:
- 9 territories with **no ICAO-coded airport in the reference at all**: Andorra, Vatican City,
  Palestinian Territory, Pitcairn, Tokelau, South Georgia, Heard & McDonald, Paracel Islands,
  "unassigned". Nothing to add; the agent should say "no airport" for these.
- 3 with airports but none meeting the policy: Liechtenstein (heliport only), San Marino,
  French Southern Territories.
- 6 that exist only under a neighbour's label (resolvable, just labelled differently): Guernsey,
  Jersey, Isle of Man → "United Kingdom"; Luxembourg (`ELLX`) → "Belgium"; Montenegro (`LYPG`,
  `LYTV`) → "Serbia and Montenegro"; Macau → "Hong Kong". Left as-is: the scrapers key on these
  labels. Relabelling is a small follow-up if the agent's answers should name the right country.
- **IATA is not stored yet** — the table has no `iata` column and this machine can only reach
  Supabase over REST (no DDL). `docs/supabase-airports-iata.sql` adds it; then
  `node scripts/airports-backfill-ourairports.mjs --apply --iata-only` fills it for every row
  OurAirports knows (dry run showed the fill count once the column exists).
- The wall keeps its own `digital-wall/data/geo-airports.json`; not touched.

**P2** — `GET /api/bug-reports` now returns the caller's own legacy rows + own help threads;
callers with the Help Centre developer flag (`requireAuthenticatedUser().isDeveloper`, resolved
server-side) get the full list. Enforced in the route, not the client.

**P3** — `middleware.ts`: `/files/*` is no longer a "public asset by extension". Browsers need the
Supabase session (unauthenticated → `307 /login?next=…`); requests carrying a valid
`x-debug-runner-secret` pass, on `/files/*` exactly as on `/api/*`. The wall sends that header on
every portal fetch (`digital-wall/lib/portal-client.mjs` `portalHeaders()`), so its cached-PDF fast
path is unchanged. Verified on a local `next dev`: no header → 307, valid header → route executes,
wrong header → 307, `/robots.txt` untouched. **Post-deploy check:** open a flight's AIP on the
wall (cached PDF) and confirm `curl -sI https://clearway.verxyl.com/files/x.pdf` → 307.
Requires `DEBUG_RUNNER_INTERNAL_SECRET` on the portal and `PORTAL_INTERNAL_SECRET` (or the same
var) on the wall to still match — they do today; no env change.

**P4** — new wall endpoints (all behind the existing session gate; device tokens cannot reach them):
`GET /api/flight-checks?oprId&flightNid` · `GET /api/reports/config` · `GET /api/reports/:id` ·
`GET /api/caa/:id` · `GET /api/important/:id` · `GET /api/timeline/limitations/:id` ·
`PATCH /api/timeline/limitations/:id` with any field (title, description, dates, isPermanent,
flights/airportIcaos/countries; bare `{isActive}` keeps the toggle path) · `DELETE
/api/display/devices/:id` · `GET /api/operators/:id` (id or oprId). Coverage now per store:
reports, CAA, IMP (incl. attachments), limitations, operators, aircraft visibility, display
settings/clocks/devices, device auth, alert rules, NOTAM digest config, webhooks, flight checks
— list + read-one + create + edit + delete where the store has that operation. Read-only by
design: alert findings, NOTAM check state, timeline cache, geo airports, webhook log.

**P5 — VERIFIED.** Account `039066033404`, IAM user `clearway-agent`, region **eu-north-1**.
Live `Converse` responses obtained from Bedrock: **Claude Haiku 4.5** and **Amazon Nova Pro**
confirmed working at the time of writing; **Claude Sonnet 4.6, Claude Opus 4.6 and Nova Lite** each
returned a live response earlier in the session. The dead `AKIA…YRFM` key was replaced.

Shipped: `docs/aws-bedrock-setup.md` (region rationale, console walkthrough, IAM policy, env vars,
client-library choice), `scripts/bedrock-smoke-test.mjs` (`--list`, Converse, `--embed`, `--rerank`;
names the failing gate), `scripts/bedrock-enable-models.mjs` (one-time Marketplace agreement
acceptance). SDKs `@aws-sdk/client-bedrock` + `client-bedrock-runtime`.

Four things this cost a session to learn, all now documented:
1. **The Bedrock "Model access" page is retired.** Models self-enable on first invocation — but only
   for a caller holding AWS Marketplace permissions.
2. **Anthropic models are Marketplace-served too**, not just Cohere. Both need an account-level
   agreement, accepted once. The runtime policy holds no marketplace permissions by design, so
   activation uses a temporary `ClearwayBedrockActivateTemp` inline policy that is removed after.
3. **`eu.` inference profiles route across EU regions**, and IAM authorizes against the
   *destination* region — our first call went Stockholm → Milan and was denied. Hence `eu-*` in the
   resource ARNs. `global.` profiles must never be used: they route outside the EU.
4. **Anthropic needs a one-time per-account use-case form**; its state flaps for ~15 minutes after
   submission, during which working models transiently fail.

Still outstanding (none blocking):
- **Opus 4.6 agreement not accepted** — it alone kept returning AccessDenied while Sonnet/Haiku/
  Cohere succeeded in the same run. Re-attach `ClearwayBedrockActivateTemp` and re-run
  `node scripts/bedrock-enable-models.mjs --apply`.
- **Sonnet 4.6 and Cohere Embed** show ACCEPTED agreements but were still propagating at last test.
- **Titan embeddings blocked on the runtime policy** — it grants `amazon.nova-*`; needs `amazon.*`.
- **Opus 5 / Sonnet 5 / Opus 4.8 / 4.7 are account-gated** ("contact AWS Sales"). Best available
  model today is **Opus 4.6**; Haiku 4.5 is proven and is the natural cheap sub-task model.
- **Cohere Rerank does not exist in eu-north-1.**
- **The agent key was pasted in plaintext twice during setup and must be rotated.**

### Deliberately deferred and why
- **IATA backfill** — needs DDL in Supabase (SQL editor); script and SQL are ready. Deferred until
  you run `docs/supabase-airports-iata.sql`.
- **Relabelling the 6 "present under a neighbour" territories** — scraper routing keys on the
  current labels; small but needs a check of `lib/scraper-country-config.ts` first.
- **Wall-side audit log for mutations** — the wall has per-store `updatedBy` fields and a device
  audit trail but no general mutation log. The agent's own actions will be audited in the agent
  service (standing rule); a wall-wide log is a separate change. Recorded under Deferred items.
- **Bedrock test invocation** — blocked on credentials, not on code.

### What the next part needs to know
- Airport rows now carry `source`; the agent should treat `ourairports_backfill_2026-09` rows as
  "known airport, AIP document may not exist" — resolution succeeds, the document lookup may not.
- The `/files/*` contract: session cookie **or** `x-debug-runner-secret`. The agent service, acting
  as the signed-in user, must forward the user's session, not the secret.
- Wall endpoints return `{ ok, ... }` with 400 validation / 404 not-found / 401 no session.
- Bedrock: use `AnthropicBedrockMantle` (`@anthropic-ai/bedrock-sdk`) for Claude; AWS SDK Converse
  for Nova; InvokeModel for Cohere. Model ids come from `--list`, not from memory.

### Decisions needed from you
1. **AWS — resolved for Part 0** (Bedrock invocation verified). Three follow-ups: rotate the
   pasted agent key; accept the Opus 4.6 agreement; decide whether to pursue Opus 5 / Sonnet 5 with
   AWS Sales or settle on Opus 4.6 as the agent's top model. My recommendation: **settle on Opus
   4.6 + Haiku 4.5 now**, revisit Opus 5 later — model choice is a config value, not a design
   dependency.
2. **Deploy access.** *(Part 0 resolved by you deploying manually and reporting HEAD `bd5019b`.)*
   Still open for future parts: either add this machine's `~/.ssh/id_ed25519.pub` to
   `root@clearway-2`, or keep deploying yourself and sending me the server HEAD. Without one of
   these, each part stalls at `Built, not deployed` until you act.
3. **Run `docs/supabase-airports-iata.sql`** in the Supabase SQL editor, then I run the IATA fill.
4. **Existing-country backfill scope.** 1,548 rows were added to already-covered countries (US 842).
   If you'd rather the US stayed at its curated 67, revert with
   `delete from airports where source='ourairports_backfill_2026-09' and country='United States of America'`.

## Part 1 — Foundation and access control

**Status: Built, not deployed.** All three commits are on `main`. Two things stand between this and
`Deployed`, both requiring you:

1. **Run `docs/supabase-agent-foundation.sql`** in the Supabase SQL editor. This machine reaches
   Supabase over REST only (no DDL), as with every other migration in `docs/`. Until the tables
   exist the agent **fails closed and denies everything** — which is correct behaviour, and is what
   local testing currently shows.
2. **Deploy**, and add the cloudflared ingress rule (below), which is a server-side config file this
   repo only carries an example of.

### What was built

| Piece | Where | Commit |
|---|---|---|
| Schema: allowlist, kill switch, audit log | `docs/supabase-agent-foundation.sql` | `eb9e600` |
| Agent service (auth, gate, Bedrock, audit) | `agent/` | `547484a` |
| Developer-gated access + kill-switch APIs | `app/api/agent/*` | `547484a` |
| Container, gateway route, health check, UI | `docker-compose.yml`, `lib/service-checker.ts`, `components/agent/*` | `47ff09b` |
| End-to-end verifier | `scripts/agent-verify-part1.mjs` | `47ff09b` |

**Language: Node**, not Python. The portal, the wall backend and all three sync workers are Node;
Python exists here only for scrapers. The deciding factor was auth: `digital-wall/lib/auth.mjs`
already implements Supabase session extraction including the `@supabase/ssr` chunked-cookie format,
verified against `/auth/v1/user`. A Python service would mean a second, diverging implementation of
a security-critical cookie parser. The Bedrock SDKs were also already installed from Part 0.

**Service shape.** `agent/server.mjs`, plain node http with explicit path dispatch, deliberately
shaped like `digital-wall/server.mjs` so the two backend services read the same way. Port 5175,
container `agent-service`, published on loopback `8089`. Accepts both `/api/*` and `/agent/api/*` so
it does not depend on whether a proxy strips the prefix.

**Bedrock tiers are configuration, not code** (`agent/config/models.json`). All seven tiers are
declared — router · fast · standard · reasoning · extraction · embeddings · rerank — with per-tier
`BEDROCK_MODEL_<TIER>` env overrides. `activeTier: "standard"` pins **every** request to one model,
so the routing interface exists but nothing is routed yet. The *requested* tier is still written to
the audit log, so the usage data Part 10 needs to route on starts accumulating now. Setting
`AGENT_ACTIVE_TIER=none` hands routing back to the caller.

Each tier carries a `fallbackId`. This is not redundancy for its own sake: Part 0 established that
**Opus 5 and Sonnet 5 are account-gated by AWS**, so `id` names the model this build targets and
`fallbackId` is what actually works in account `039066033404` today. The client falls back **only**
on `model_unavailable` — throttling and timeouts are surfaced instead, because silently retrying
them on a different model would hide load problems and change which model answered without anyone
knowing.

**Three distinct, reportable error kinds** (`agent/lib/errors.mjs`): `model_unavailable` (503),
`model_throttled` (429, retryable), `model_timeout` (504, retryable), mapped from AWS's generic
exception names. Once a stream is open these arrive as an SSE `error` event carrying the code,
since the HTTP status is already sent.

**Auth — the agent acts as the user.** `agent/lib/auth.mjs` carries the caller's Supabase session
and returns their access token alongside the user, so tool calls in later parts act *as them*
against the portal's own APIs. There is no service account. It fails closed with **no display
carve-out** — unlike the wall, which keeps read-only panels alive when auth is misconfigured,
an agent that cannot identify its caller has nothing safe to serve.

**Access control — two independent gates, both fail-closed, both re-checked on every turn:**
- The **global kill switch** (`agent_settings`, one row). Unreadable reads as *disabled*.
- The **allowlist** (`agent_access`). Managed by **developers**, not admins — `requireDeveloper`,
  the same gate as the Help Centre developer inbox, and for the same reason: who gets early access
  to a build in progress is a development decision.

Re-checking on every turn is what makes **revocation immediate**, including inside an open
conversation: the next message in that session is refused. Revocation is a *soft* close
(`revoked_at`), so the history of who had access, when, and who granted it survives.

**A user without access sees no trace.** `nav.ts` gained `agentOnly`, gated on a runtime probe that
**defaults to false**, so a failed probe leaves the agent invisible rather than flashing an entry
point. `/agent` renders a plain "this page does not exist" for anyone without a grant — not a
disabled button, not an empty panel. `/api/agent/availability` answers a boolean to any signed-in
user rather than 403-ing, precisely so the UI can render nothing.

**Audit from the first commit.** `agent_audit_log` records user, timestamp, conversation id,
requested and effective model tier, the concrete model id invoked, tool name/args/results (columns
ready for Part 2), confirmation status, success/failure, latency and token counts. `audit()` never
throws — a logging failure must not take the agent down — but writes to stderr when it fails.
Access grants, revocations and kill-switch flips are logged too.

**Into the dashboard changelog.** Agent access changes, kill-switch flips and agent *failures* now
appear in `/api/dashboard/changelog`. Chat traffic is deliberately **excluded**: it is per-user
content, not a platform change, and 25 rows of it would drown every other source. The full
per-request trail stays in `agent_audit_log`.

**Health check.** `agent-health` added to the service prover (now 14 checks). It reports
**degraded**, not down, when the service answers but auth or the store is misconfigured — because
from outside, that state looks like "nobody has access" rather than a fault, and that is exactly the
confusion worth surfacing.

### Verified — the done-condition is met

`docs/supabase-agent-foundation.sql` was run 2026-09-23 16:04Z. `scripts/agent-verify-part1.mjs`
then passed **10/10** against the real Supabase tables and a real Bedrock call:

| Check | Result |
|---|---|
| `/api/health` returns `service: "agent"`, store + auth configured | ✅ |
| User NOT on the allowlist sees no agent (`not_on_allowlist`) | ✅ |
| Chat refused without a grant → 403 | ✅ |
| The refusal is audited (`chat.denied`) | ✅ |
| Granted user sees the agent | ✅ |
| Granted user gets a **streamed** model reply | ✅ returned `READY` |
| Exchange audited with model id and token counts | ✅ `standard -> eu.anthropic.claude-sonnet-4-6`, 13/5 tokens |
| Kill switch hides the agent from a **granted** user | ✅ `disabled_globally` |
| Kill switch refuses chat for a **granted** user → 503 | ✅ |
| Cleanup restored the baseline | ✅ |

Note the model: the tier resolved to the **fallback**, `eu.anthropic.claude-sonnet-4-6`, because
Sonnet 5 is account-gated (Part 0). The fallback path is therefore proven in production conditions,
not just in theory.

Also verified earlier, before the tables existed: no session → 401 on every non-health route;
invalid bearer → 401; unknown route → 401 before routing, so route existence does not leak; missing
tables → the agent denies everything and names the cause.

### Verified in production (2026-09-23 17:32Z)

| Check | Result |
|---|---|
| `https://clearway.verxyl.com/agent/api/health` | ✅ 200, `service: "agent"`, store + auth configured |
| Unauthenticated `/agent/api/*` | ✅ 401 **from the agent**, not a portal redirect |
| Portal `/api/assistant/*` routes live | ✅ |
| Grant through the real UI, audited with actor | ✅ `access.granted`, actor `dmitrijs.starkovs@icloud.com` |
| Revoke through the real UI, audited with actor | ✅ `access.revoked`, 7s later |
| Portal / wall / `/files/*` unaffected | ✅ |

**Still unproven:** one real chat turn from a browser session. Nobody currently holds a grant (the
production grant was revoked immediately after, evidently as a test), so the agent is invisible to
everyone. Grant and send one message to close this out.

### The `/agent/*` path collision (found on the deployed stack)

cloudflared matches `path` as an **unanchored** regex, so the ingress rule `/agent/.*` also matched
`/api/agent/access` — the agent container answered the portal's own admin routes with its 401, and
the developer management UI could never have loaded. It looked healthy, because 401 is a plausible
answer to an unauthenticated request.

Fixed on both sides, since either alone leaves a trap: the portal's routes moved to
`/api/assistant/*` (no portal path contains `/agent/` any more), and the example tunnel config now
anchors both regexes (`^/agent/`, `^/digital-wall/`) with a comment saying why. **`/digital-wall/.*`
has the identical latent bug on the live server** — it simply has not bitten because no portal route
contains that string.

### Deliberately deferred and why
- **Tools, confirmations, conversation history** — Parts 2+. The audit table already has the
  columns so the schema does not change when they arrive.
- **Real tier routing** — Part 10 by instruction. The interface is built; the routing is not.
- **Reranking** — no Cohere Rerank in eu-north-1 (Part 0 finding). The tier is declared with a null
  id so the gap is explicit rather than discovered later.
- **The chat UI is minimal on purpose.** It proves session → gate → Bedrock → stream → audit. It is
  not the final agent surface.

### What the next part needs to know
- `assertMayUseAgent(user)` is the single gate; call it at the top of any new agent route.
- The caller's access token is on `user.accessToken` — tool calls must use it, not a service key.
- Audit with `kind: "tool.<name>"` and the existing `tool_name` / `tool_args` / `tool_result` /
  `confirmation_status` columns.
- The agent reaches the portal at `PORTAL_BASE_URL`; `/files/*` needs either the user's session or
  the wall's shared secret (Part 0 / P3) — use the **user's session**.

### Decisions needed from you
1. ~~Run the SQL~~ — **done** 2026-09-23 16:04Z; verifier passes 10/10.
2. ~~cloudflared ingress rule~~ — **done**; the agent answers on the public origin. Remaining
   hardening: anchor `^/digital-wall/.*` on the live server too (same unanchored-regex bug, not yet
   triggered).
3. **Who gets the first grants?** Until someone is on the allowlist the agent is invisible to
   everyone, including you. I suggest granting only yourself initially.
4. **Model choice.** All tiers currently run `eu.anthropic.claude-sonnet-5`, falling back to Sonnet
   4.6 because Sonnet 5 is account-gated. If you would rather pin Opus 4.6 (proven working) as the
   standard model, that is a one-line change in `agent/config/models.json`.

## Parts 2–10
Not started. Each gets the same four sections as Part 0 when its prompt arrives.

## Deferred items (all parts)

| Part | Item | Why deferred | Where it should land |
|---|---|---|---|
| 0 | IATA column + fill on `airports` | Needs DDL run in Supabase SQL editor | Part 0, after `docs/supabase-airports-iata.sql` is run |
| 0 | Relabel Guernsey/Jersey/IOM/Luxembourg/Montenegro/Macau airports to their own country | Scraper routing keys on current labels | Whichever part builds the airport-lookup tool |
| 0 | Wall-wide mutation audit log | Out of P4's scope; agent actions are audited in the agent service | Part that adds the wall tool layer |
| 0 | ~~Bedrock test invocation~~ | **Done** — Haiku 4.5 + Nova Pro returned live responses | — |
| 0 | Opus 4.6 Marketplace agreement | Temp activation policy was removed before it succeeded | Re-run the enabler with the temp policy attached |
| 0 | Titan embeddings (`amazon.*` in the runtime policy) | Policy edit not yet applied | Next AWS console visit |
| 0 | Rotate the pasted `clearway-agent` access key | Secret was pasted in plaintext during setup | Before the agent runs unattended |
| 1 | Run `docs/supabase-agent-foundation.sql` | No DDL access from this machine | Before Part 1 can be verified or deployed |
| 1 | cloudflared ingress rule for `/agent/.*` | **Still not in effect** — /agent/* reaches the portal, not the agent | Before anyone can use the agent |
| 1 | Pickem healthcheck is broken (pre-existing) | `${p}` in `docker-compose.yml` is expanded by compose, not node, so the probe hits a portless URL — this is the audit's "unhealthy pickem false alarm" | Out of Part 1's scope; one-line fix whenever you want it |
| 0 | Opus 5 / Sonnet 5 access | Account-gated by AWS ("contact AWS Sales") | Only if Opus 4.6 proves insufficient |
| 0 | Cohere Rerank | Not offered in eu-north-1 | Use Haiku/Nova for reranking, or another region |
| 0 | Remove duplicate `AWS_REGION` line in server `.env` | Needs server access | With the first deploy |
