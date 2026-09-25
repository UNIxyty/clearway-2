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
| 0 — Prerequisites and the status file | Deployed | `013e63f` `944e9b6` `d538eaa` `ccc52bb` `a35b30d` `72f5dc4` `bd5019b` | **Yes** | P1–P4 live; Bedrock smoke test passes (Haiku 4.5). Key rotation still open |
| 1 — Foundation and access control | Deployed | `eb9e600` `547484a` `47ff09b` `0bbf416` `93d5761` `d6620b1` | **Yes** | Agent live at `/agent/*`; allowlist + kill switch verified server-side by the 2026-09 audit |
| 2 — Tool layer (read-only) | Deployed | `b6c1720` `2671f95` `5bd4bcc` | **Yes** | 20 read tools; verifier 13/13 + 1 skip (portal route in the rig) |
| 3 — Chat interface (side panel) | Deployed | `235fdef` `6fa43be` `1d164e6` `4251eda` `120ed62` `f8ffb3f` | **Yes** | **Verbatim frame had never rendered live until `b0b0071`** (audit S7). Cards, attachments and `/` commands landed in `70c4dd1`. Verifier 16/16 |
| 4 — Knowledge base (two-tier RAG) | Deployed | `24d6e02` `49a4ca2` `5ccb175` `0f0dda6` `af155c2` `0497fb4` | **Yes** | Verifier 18/18; guardrail 6/6. Approval UI at `/developer/knowledge` since `70c4dd1` |
| 5 — File generation and email | Deployed | `c592ba0` `fd22803` `81e4ab9` `f12ff7b` | **Yes** | Verifier 14/14 + 1 skip (real delivery needs `--send`). Retention + real volume in `b0b0071` |
| 6 — Web search, tracking, memory | Deployed | `1d2acc5` `d5e71fe` `6d4bbf0` `caaf0b9` | **Yes** | Verifier 16/16. Flight tracking is an honest stub — provider deferred by owner |
| 7 — Write tools (low risk) | Deployed | `a688929` `6df80da` `65a7e76` `4cf656d` `22b515f` | **Yes** | Verifier 19/19. Authorised by owner, not an ops sign-off |
| 8 — Write tools (sensitive) | Deployed | `6656c8b` `12aa46b` | **Yes** | Verifier 43/43 after `70c4dd1` (recycle bins for IMPORTANT and reports too). Append-only audit needs `docs/supabase-agent-hardening.sql` |
| 9 — Voice | Groundwork only | `4a1fde9` | Backend only | Language field, keyterms, readback gate built and tested. **No STT/TTS, no interface.** Gated on the 20 recordings |
| 10 — Multi-model routing | Deployed | `25d6bf1` | **Yes** | Routing live; caching measured 75.7%. Benchmark is stochastic (78–87% correct entry, 0 writes on the cheap tier both runs) |
| Post-audit fixes (2026-09-24) | Deployed | `4cddc71` `b0b0071` `70c4dd1` `6a5c0dd` | **Yes** — 2026-09-24 20:48Z, `agent-service` + `digital-wall-backend` + `portal` rebuilt from `6a5c0dd`; `/mnt/ssd-cache/agent` mounted | Still needs `docs/supabase-agent-hardening.sql` run in Supabase (retention + append-only are inert until then) |

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

## Part 2 — Tool layer (read-only)

**Status: Built, not deployed.** Three commits on `main`; needs
`docker compose up -d --build agent-service`.

### The framework (`b6c1720`, committed separately as asked)

| File | What it does |
|---|---|
| `agent/lib/tools/schema.mjs` | JSON Schema subset validator. Ours on purpose: the same schema object is handed to Bedrock as the tool spec, so validation must be *the thing the model was told about*. Reports every problem at once; applies defaults. |
| `agent/lib/tools/errors.mjs` | `NOT_FOUND` · `NO_PERMISSION` · `INVALID_INPUT` · `SERVICE_UNAVAILABLE` · `TIMEOUT` · `TOO_LARGE` · `INTERNAL`, mapped from upstream HTTP. |
| `agent/lib/tools/http.mjs` | The only route to the platform. |
| `agent/lib/tools/framework.mjs` | `defineTool` / `executeTool` / `toolSpecsFor`. |

Each tool declares input schema, **output schema**, description, permission,
timeout, and a result-size cap. `executeTool` validates in, runs under timeout,
validates out, enforces size, and writes one audit row — success or failure.

**Decisions worth knowing:**
- **401 and 403 both map to `NO_PERMISSION`.** Distinguishing them would leak
  whether a resource exists to someone who cannot see it.
- **The output schema is enforced, not just the input.** A tool whose upstream
  changed shape fails loudly rather than handing the model a plausible object
  with a field quietly missing.
- **Over-size results are a `TOO_LARGE` error, never a silent trim.** A
  truncated operational record read as complete is worse than no record.
- **`http.mjs` forwards the caller's own Cookie and bearer** — never a service
  key, and never the wall's `x-debug-runner-secret`, which bypasses portal auth
  and would let the agent read what its caller cannot. A 307 to `/login` is
  reported as an auth failure rather than followed into an HTML page.
- **Permission scoping happens before the model is told anything.** A tool the
  caller cannot use is never offered. An offered-then-refused tool teaches the
  model the capability exists, and it keeps trying and narrating it to the user.
  `executeTool` re-checks anyway, so omission is not the only defence.

### The tools (`2671f95`) — 20, all read-only

| Tool | Permission | Wraps |
|---|---|---|
| `get_aip_document` | user | `/api/aip/resolve` |
| `get_gen_document` | user | `/api/aip/gen/pdf/exists` (never triggers a download) |
| `get_web_aip_link` | user | `/api/search` |
| `get_aip_service_status` | user | `/api/country-service-status` |
| `get_flight` | user | wall `/api/timeline/flights` |
| `get_flight_state` | user | wall `/api/flight-info` + `/api/flight-checks` |
| `search_flights` | user | wall `/api/timeline/flights` |
| `get_wall_state` | user | timeline + sync-status + limitations + IMP + NOTAM check |
| `get_notams` | user | `/api/notams?scraper=crewbriefing` |
| `get_weather` | user | `/api/weather` |
| `get_notam_check_status` | user | wall `/api/notam-check/today` |
| `list_limitations` | user | wall `/api/timeline/limitations` |
| `list_important` | user | wall `/api/important` |
| `list_caa` | user | wall `/api/caa` |
| `list_operators` | user | wall `/api/operators` |
| `list_aircraft` | user | wall `/api/aircraft/schedule` + `/visibility` |
| `get_webhook_states` | **admin** | wall `/api/webhooks` |
| `get_webhook_history` | **admin** | wall `/api/webhooks/log` |
| `list_reports` | **admin** | wall `/api/reports` |
| `get_service_status` | user | `/api/service-checks` |

Every one calls an **existing** endpoint. AIP source selection, the CrewBriefing
NOTAM policy and the wall's timeline decoration are called, never reimplemented,
so the agent cannot contradict the screen the dispatcher is looking at.

**The verbatim rule is structural, not a promise.** For limitations, IMPORTANT
and CAA: no `maxLength` on any text field; pagination caps **records**, never
characters; an over-size page is an error so the model narrows its filter rather
than silently receiving half a limitation. Each record carries `verbatim: true`,
its `source` store, effective dates, and its full match criteria.

**`list_operators` builds its result from an explicit field list, not a spread** —
operator records carry Leon refresh tokens, and a future upstream change must not
be able to leak a credential into a model's context.

**Model loop.** `streamConversationWithTools` scopes the tool list per user,
streams text, runs the tools the model selects (in parallel within a round),
feeds results back, and **withholds tools on the final round** so the model
answers from what it has instead of looping. `GET /api/tools` shows a caller
their scoped catalogue; `POST /api/tools/invoke` runs one directly through the
*same* `executeTool` path — a debugging surface, not a bypass.

### Verified (`5bd4bcc`)

Run against a local portal and wall with auth disabled, so real payloads were
parsed (74 CAA records, 13 service checks).

| As `user` | As `developer` |
|---|---|
| 14/14 checks | 13/13 checks, 1 skipped |

Proven: every user tool registered and described · **admin tools neither offered
nor invocable by a user** · admin tools offered to developer · unknown tool
refused · bad ICAO, undeclared fields and missing required inputs all rejected ·
live data returned · verbatim flags and match criteria present · tool calls
**and failures** audited · tools refused once agent access is revoked.

One check **skips** rather than passing: `/api/country-service-status` calls
`requireAuthenticatedUser()` directly and does not honour
`DISABLE_AUTH_FOR_TESTING` the way `/api/service-checks` does, so a mock caller
cannot reach it. Adding a bypass to that route to green the check would widen
production auth for a test — the wrong trade, so the harness reports the gap.

### Deliberately deferred and why
- **No write tools.** Part 3.
- **`get_flight_state` returns matched limitations as the wall decorates them**,
  rather than re-running matching. One matcher, one answer.
- **Confirmation status is `not_required` on every tool** — true for read-only,
  and the column is already there for Part 3.
- **Rerank/embeddings tiers are unused** by the tool layer; document search is a
  later part.

### What the next part needs to know
- `defineTool` is the only way to add a tool; `agent/lib/tools/index.mjs`
  registers them, and everything reads the registry from there.
- Write tools should declare `permission` honestly and set
  `confirmationStatus` — the audit columns exist.
- `user.agentRole` is resolved exactly as `lib/admin-auth.ts` does it.
- Tools must keep using `portalGet` / `wallGet`: they are what carry the
  caller's session rather than a service credential.

### Decisions needed from you
1. **Deploy** `agent-service` to pick up the tool layer.
2. **`get_webhook_states`, `get_webhook_history` and `list_reports` are
   admin-only** — my call, since they are console-operator surfaces. If ordinary
   dispatchers should see console reports, say so and I will drop `list_reports`
   to `user`.

## Part 3 — Chat interface (the side panel)

**Status: Built, not deployed.** Four commits on `main`. Blocked on one SQL run
(`docs/supabase-agent-conversations.sql`) and a rebuild of `portal` and
`agent-service`.

### Where the design came from

Imported from Claude Design via the DesignSync tool: project
`45ff380e-a9cf-4625-a2ef-10492c94df55`, file `Ops Agent Side Panel.dc.html`
(78 KB) plus `support.js`. Its **artboard captions and DECISIONS block** — not
just its pixels — are what the build follows.

### Implemented, per the design's own decisions

| Decision | Implementation |
|---|---|
| 420px default, drag 360–600, remembered per user | `PANEL` tokens + a left-edge handle; width in `localStorage` |
| Page compresses when content keeps ≥900px, else overlays with a shadow and **no scrim**; always overlays at 1280 | Recomputed on resize; the panel is a flex sibling of `main`, so in-flow = compress, `position: fixed` = overlay |
| ⌘J opens/closes anywhere, Esc closes, the thread stays | `useAgentPanel`; the thread is server-side so nothing is lost |
| The sidebar never auto-collapses | Untouched — mounting as a sibling means all three sidebar states work unchanged |
| The context chip follows navigation **until you send**, then pins and offers "Now on…" | `useAgentContext` reports the page; the panel pins on send |

### The verbatim treatment

The design calls this "the most important distinction in the interface", so it
is built as structure rather than styling:

- The **ink frame** (1.5px `#17181c` border, solid ink header, `VERBATIM ·
  APPROVED TEXT`, mono reference line) is the heaviest object the panel can
  draw, and nothing else in the panel is allowed to look like it.
- The agent's own words sit **outside** it under `AGENT'S READING`, so the
  boundary between what an authority wrote and what the agent inferred is a
  visual fact, not a caption.
- **"Copy exact"** puts the original on the clipboard — not the rendered text.
- Only a record a **tool** marked `verbatim: true` can enter the frame. The
  model cannot promote its own paraphrase into it.

### Source attribution

The design's three tiers — **company** `#6d28d9`, **internal** `#1d4ed8`,
**web** `#b45309` — declared on each **tool**, not claimed by the model. A tool
carries `sourceTier` and a `sourceLabel(input, result)`, and the reply's
citations are computed from the calls that actually succeeded. A model cannot
cite a source it was never given.

### Also built
- **Composer**: `@` mentions resolved through the agent's own `search_flights`
  (so a mention can only name something that exists), **with the current
  selection offered first**; `/` commands; attachments button; streaming and
  **Stop · Esc**.
- **States**: empty with context-specific suggestions, loading skeletons,
  streaming caret, tool-failure note with the failing tool named, error, and
  offline ("nothing that changes data is queued").
- **Tool activity**: collapsible, `Used N tools`, expandable to the per-tool list.
- **History**: server-side (`agent_conversations` / `agent_messages`), listed in
  the panel.
- **Expand to full page**: `/agent?c=<id>` **carries the conversation** — the
  same component in `fullPage` mode.
- **Entry point only for allowlisted users**: the panel, the nav item and ⌘J are
  all gated on the same runtime probe. **⌘J is inert without a grant** — a
  shortcut must not reveal a capability the user does not have.

### Deliberately deferred and why
- **Voice (C1/C2)** — the design docks a voice bar in the composer. Deferred:
  it needs a speech backend decision that is not in this prompt, and the
  composer is laid out to take it.
- **Attachments upload** — the button is present; wiring it to the Help Centre's
  attachment store is Part 4+ work, and nothing read-only needs it yet.
- **A3/A4 (the agent changing the page behind it)** — those artboards show
  *write* behaviour, which Phase 2 gates.
- **Rich cards beyond the verbatim frame, sources and mono blocks** — flight
  card and table renderers exist in the design; the panel currently renders the
  agent's prose plus framed records. The tools already return the structured
  data, so this is presentation work, not plumbing.

### Verification
`scripts/agent-verify-part3.mjs` proves: a turn answers with attributed
sources; tool activity and sources survive into server-side history; a
follow-up continues the same thread rather than forking; **another user's
conversation is not readable** (404); and history is refused once access is
revoked. **Not yet run** — needs the tables.

---

## PHASE 1 — complete; Part 7 authorised WITHOUT an ops sign-off

Parts 0–3 deliver a **read-only** agent: 20 tools over the platform's existing
APIs, acting as the signed-in user, behind a developer-managed allowlist and a
global kill switch, fully audited, in the designed side panel.

**Part 7 (write tools) was authorised on 2026-09-24 by Dmitrijs, on his own
judgement — ops have NOT formally reviewed the read-only agent.** Recorded
plainly because the status file is the record of what happened, and "the owner
decided to proceed" is a different fact from "ops approved". The demo below is
still worth doing before dispatchers rely on write actions.

What to show ops: open any console page, press ⌘J, and ask about the airport or
flight on screen. The things to judge are whether the answers are *useful*,
whether **verbatim text is unmistakably distinct** from the agent's own words,
and whether the sources are ones they trust.

## Part 4 — Knowledge base (two-tier RAG)

**Status: Built, not deployed.** Needs `docs/supabase-agent-knowledge.sql` and
three AWS changes (below).

### The split, enforced structurally

| | Tier 1 — verbatim | Tier 2 — semantic |
|---|---|---|
| Table | `agent_tier1_records` | `agent_documents` + `agent_chunks` |
| Returned | word for word, `verbatim: true` | synthesised, always cited |
| Entry | **a person approves, always** | approval then automatic indexing |

Nothing reaches Tier 1 without a named human: `classifyDocument` only ever
**proposes**, `approveTier1Record` is the single entry point and demands an
approver, and `approved_by` is **not-nullable in the schema**, so the rule
survives a future caller that forgets to pass one. A document that cannot be
classified defaults to **tier 2** — the safe default is the one that does not
put unreviewed text where it will be quoted as law.

**Deliberately not indexed:** limitations, IMPORTANT entries and CAA records.
They are structured records with match rules, already queried directly by Part
2's tools, so the agent's answer is exactly what the wall shows. A vector copy
would drift from the originals, and the drift would be invisible until it
mattered.

### Embeddings — measured, not assumed

`scripts/agent-embedding-benchmark.mjs` runs both candidates over **Clearway's
own operational text**: dispatcher-phrased questions against real CAA and
limitation wording, with plausible distractors. A generic benchmark says nothing
about how a model handles `CTOT`, `72HRS` or `AUTOLAND IS NOT PERMITTED`.

| Model | dims | recall@1 | recall@3 | MRR | latency |
|---|---|---|---|---|---|
| **Cohere Embed v4** (chosen) | 1536 | **75%** | **100%** | **0.875** | ~70 ms/passage |
| Titan Text Embeddings V2 | 1024 | — | — | — | **could not be measured** |

**Both measured** once the `amazon.*` policy line landed:

| Model | dims | recall@1 | recall@3 | MRR | latency |
|---|---|---|---|---|---|
| Cohere Embed v4 (**in use**) | 1536 | 75% | 100% | 0.875 | **75 ms**/passage |
| Titan Text Embeddings V2 | 1024 | **88%** | 100% | **0.938** | 424 ms/passage |

**Titan retrieves better; Cohere is ~5× faster** because it batches 96 inputs
per call while Titan takes one at a time. The deciding argument is that
**recall@3 is 100% for both** and the reranker sees the top ~24 candidates — so
the right passage reaches the model either way, and the quality gap largely
closes while the throughput gap does not. Switching is one env var
(`AGENT_EMBEDDING_MODEL=titan-v2`) plus a 1024-dim column.

Both misses at rank 1 were competing *Riga* passages — which is precisely the
case reranking exists for.

### Reranking — and a bug the benchmark caught

**Cohere Rerank is not offered in eu-north-1.** Moving one ranking call to a US
region would take flight-operations text out of the EU, which is not a trade
worth making for ranking. So the Cohere path is implemented and activates the
moment `BEDROCK_RERANK_MODEL_ID` names an EU model; until then a **listwise LLM
reranker** on the cheap tier does the cross-encoder job — the model sees the
query and each candidate together, which a bi-encoder embedding structurally
cannot. The method used is recorded on every retrieval, so ranking provenance is
never guessed.

Building the benchmark exposed that **rerank had never actually run**. It called
Bedrock directly with `modelCandidates(tier)[0]` — Sonnet 5, gated in this
account — and degraded to plain embedding order on every request, silently, by
design. Both it and the ingest classifier now go through `converseOnce`, which
already walks the candidate list. With it genuinely running, recall@1 on the
contested queries went **2/3 → 3/3** (the taxiway question moved rank 2 → 1).

### Grounding

Bedrock Guardrails contextual grounding on every knowledge answer. **Failure
posture matters more than the feature:** if the check cannot run — no guardrail,
no permission, Bedrock unreachable — the answer comes back `verified: false`
with a reason, and the retrieval log records it. Claiming a grounding check that
did not happen would be worse than having none, because it is invisible.

**Measured — 6/6** via `scripts/agent-guardrail-test.mjs` against the live
guardrail (`gmcg7r…`, thresholds 0.70/0.70):

| Case | Grounding | Relevance | Result |
|---|---|---|---|
| Correct answer (AWS ref) | 1.00 | 1.00 | passed |
| "Capital of Japan is London" | **0.02** | 0.49 | caught |
| "Capital of UK is London" (true but off-question) | 0.99 | **0.64** | caught |
| Real ops answer | 0.79 | 0.97 | passed |
| Invented holdover time appended to a correct answer | **0.01** | 0.50 | caught |
| **Invented crosswind limit — 15 kt where the rule says 20 kt** | **0.02** | **1.00** | caught |

The last row is the one that matters. Relevance scored a **perfect 1.00** — it
is a fluent, on-topic answer — and only the grounding score caught it. A single
wrong number in otherwise plausible operational text is exactly what a
dispatcher would act on without hesitating.

### Reliability and the source contract

Standard retrieval source object across both tiers: `source`, `documentId` /
`recordId`, `title`, `version`, `effectiveDate`, `retrievalType`, `tier`,
`verbatim`, `score`, `rerankScore`, plus `page`/`heading` for tier 2 and
`approvedBy`/`approvedAt` for tier 1.

`agent_retrievals` stores the ids and scores of everything retrieved — **not**
the passage text, which would duplicate the corpus on every question — so which
sources supported an answer can be reconstructed later. When nothing matches,
`search_knowledge` returns `verified: false` with an explicit instruction to say
the information could not be verified rather than answer from general knowledge,
which the system prompt also forbids.

### Storage
Originals under `STORAGE_ROOT` (`/storage` → `/mnt/hdd-storage`), never the root
volume, retrievable by name through `get_document`.

### Also in these commits
- **Rendering fixes** (`f8ffb3f`): the panel showed literal `**asterisks**`;
  there is now a small renderer that builds React elements, never HTML, and only
  makes same-origin paths clickable.
- **The agent had no system prompt at all**, which is why it answered a NOTAM
  check with "Great news ✅". `agent/config/system-prompt.md` sets the register,
  forbids inventing operational information, and forbids paraphrasing a
  limitation in place of the quoted text. It is a **file**, so changing how the
  agent talks is an edit to prose and a reviewer can read exactly what shaped a
  reply.
- Running out of tool rounds ended turns mid-sentence; the loop now warns the
  model on its last round so it closes with what it has.

### Verification — 18/18 (`scripts/agent-verify-part4.mjs`)

Upload → classification **proposes** tier 2 → waits for a human with no tier
applied → Tier 1 refused without explicit records → approval indexes → a Tier 1
record is created **with a named approver** → the rule is retrieved as
`tier1-verbatim`, **byte-for-byte identical** to what was approved, carrying
source, version and effective date → a procedure question retrieves cited
reference material → reranking runs → an unsupported question is marked
unverified and never verbatim → grounding passes the supported answer (0.99) and
rejects the unsupported one (0.00) → retrievals are logged with their sources.

### Five real bugs this testing found

1. **`create or replace function` created an OVERLOAD, not a replacement.**
   Adding `min_similarity` changed the signature, so the 4-arg originals
   survived and PostgREST refused every call (`PGRST203`). Retrieval returned
   nothing, which read as an empty corpus rather than a broken migration.
2. **`.catch(() => [])` made a hard RPC failure and an empty corpus the same
   value** — which is why (1) was invisible. Failures now surface, and
   `search_knowledge` raises `SERVICE_UNAVAILABLE` rather than reporting
   "nothing matched": telling the model nothing matched when retrieval *broke*
   invites it to answer from its own knowledge.
3. **Chunks were gated on the document's tier**, so approving any Tier 1 record
   out of a document silently removed all of its Tier 2 content from retrieval.
4. **No similarity floor**, so "the refuelling procedure for an An-225 at
   Vostok Station" returned an unrelated **LLBG curfew rule as authoritative
   verbatim text** — precisely the failure this design exists to prevent.
5. **`conversation_id` is a uuid but direct invocation passes a label**, so
   every retrieval outside a conversation failed to log, invisibly.

### Decisions needed from you
1. **Deploy** — everything else is done.
2. **Embedding model**: stay on Cohere (throughput) or switch to Titan (better
   raw recall). My recommendation is to stay, for the reason in the table above.
3. **Rerank**: accept the LLM reranker, or ask AWS about Cohere Rerank in an EU
   region. Recommendation: accept it — it measurably recovers the misses.
4. **Re-tune the confidence bar** (0.32) from `agent_retrievals` once a real
   corpus exists. It is calibrated on a handful of sentences today.

## Part 5 — File generation and email

**Status: Built, not deployed.** Verifier **14/14** (1 skipped: real delivery is
opt-in). `docs/supabase-agent-files-email.sql` applied.

### File generation
Reuses the platform's established route — HTML + print CSS through
`chromium.pdf()`, the same as `scripts/generate-airport-sheets.mjs`. No new PDF
library: the team already styles these with CSS they know, print CSS handles
page breaks properly, and a second engine would render documents that look
unlike the sheets people already recognise. XLSX and DOCX are written directly
as OOXML rather than adding a spreadsheet dependency for one sheet of strings.

All four formats confirmed as real files by `file(1)`: *PDF document, 2 pages*,
*Microsoft Excel 2007+*, *Microsoft Word 2007+*. Output lands under
`STORAGE_ROOT`, never the root volume, and every generation is logged with
requester, type, timing and what went into it.

**The image is now `mcr.microsoft.com/playwright:v1.59.1-noble`**, not
`node:22-alpine` — chromium needs system libraries. Larger image, slower first
build; the alternative was drifting from what the airport-sheet generator is
tested against.

### Email
**Reuses `digital-wall/lib/mailer.mjs`** rather than writing a second send path:
one place to rotate the Resend key, one set of failure behaviour, one thing to
check when mail stops arriving. The agent image builds from the repo root and
copies that module — the same arrangement `digital-wall-frontend` already uses
to share `shared/`.

Template implements the Claude Design source (`Ops Agent Email.dc.html`):
header, requester line ("Sent by the Clearway Ops Agent at the request of…"),
the block vocabulary — paragraph, titled section, label/value table, mono block,
**VERBATIM frame**, callout, attachment list, sources, CTA — and the dark
footer. A plain-text alternative is generated too; a mail with no text part
scores as spam.

**Images: the design's URLs would have been the third incident.** It specifies
`/brand/clearway-white.svg` and `/brand/verxyl-white.png`; both **404** on this
domain. The existing transactional templates serve logos from Supabase public
storage and those resolve, so the template uses them. The verifier fetches every
URL in the rendered mail and fails if any is unreachable, and a non-https asset
base throws at render time rather than shipping silently.

**External recipients require confirmation, enforced in the backend** — the
classification is recomputed from the addresses actually being sent to, so a
model cannot satisfy it by leaving someone off a list.

**Failures are loud.** The provider's own error is returned to the caller and
stored in `agent_email_log.provider_error`. Blocked attempts are logged too:
"who tried to mail outside the company" is its own question.

### A bug worth recording
Both tools refused unconfirmed external sends with their own early return —
`email_document` deliberately, so it does not fetch a 3 MB PDF for a send about
to be blocked. But the early return skipped the logging, so **a blocked attempt
left no trace**, which defeats the point of requiring confirmation.
`refuseUnconfirmedExternal` now owns the check *and* the record; both tools get
the refusal from it or not at all.

### Tools added
`generate_file` (pdf/docx/xlsx/csv) · `email_document` (AIP/GEN by ICAO) ·
`send_email` (blocks + generated attachments). 25 tools total.

### Decisions needed from you
1. **Deploy** — note the larger image.
2. **Run a real delivery test**: `node scripts/agent-verify-part5.mjs --send`
   delivers to the signed-in user so you can see the template in a client.
3. **Internal domains**: currently the requester's own email domain. Set
   `AGENT_EMAIL_INTERNAL_DOMAINS` if colleagues use other domains, or they will
   all be treated as external and need confirmation every time.

## Part 6 — Web search, flight tracking, memory

**Status: Built, not deployed.** Needs `docs/supabase-agent-memory.sql`, and two
decisions from you (below).

### Provenance — the point of the part
Four source tiers now, each with its own colour, declared on the **tool** so
attribution describes work that actually happened:

| Tier | Colour | Means |
|---|---|---|
| **Company** | violet | Clearway's approved operational content. Quoted, never restated. |
| **Internal** | blue | The platform's systems of record. Authoritative for our operations. |
| **Web** | amber | External and **unverified**. Never approved guidance, whatever the site. |
| **Remembered** | teal | A note a user asked the agent to keep. Their recollection, not a rule. |

`Remembered` is deliberately **not** folded into Company. A note saying "EPWA
handling is slow before 0600" is a useful recollection; colouring it like an
approved limitation would let an aside sit beside a Tier 1 rule looking equally
authoritative.

The system prompt gained a section of its own naming all four and requiring the
wording to match the chips — including **"prefer internal data, and say that you
did"**, and that a disagreement between sources is resolved in favour of
company/internal *and said out loud*.

### Memory
`remember` · `recall` · `forget`. **Scoped per user in the query**, not filtered
afterwards — another dispatcher's note never reaches the process unless it was
explicitly shared. Sharing is a deliberate act, attributed. Forgetting is
restricted to your own notes even when a shared one is visible.

### Web search
Aviation-filtered **by default** across ~25 authority domains (EUROCONTROL,
EASA, ICAO, FAA, the European ANSPs). A dispatcher asking about Heathrow slot
rules wants those, not a forum thread. `unfiltered: true` widens it, as a
visible decision the model must make rather than a silent default.

Every result set carries `authoritative: false`, and each result its domain and
fetch time. **Provider-agnostic** — Brave and Tavily are both implemented; set
either key and it works with no code change. With no key it raises
`SERVICE_UNAVAILABLE` telling the model to say it could not search rather than
answer from memory.

### Flight tracking — awaiting your decision
`get_flight_tracking(callsign)` is **declared but returns `available: false`**,
with an instruction to fall back to the wall's own schedule rather than estimate
a position. The brief says to confirm plan and cost first, and picking a paid
aviation-data subscription on someone's behalf is not a technical decision.
Options and the questions are in `docs/agent-flight-tracking-decision.md`.

Worth noting the scope is narrow: the wall's Leon feed is already authoritative
for **planned** times. Tracking adds only "where is it right now", which is a
per-question lookup rather than a feed — so request-priced plans fit better than
data-feed plans, and it may not be worth a subscription at all.

### Verified — 16/16 (`scripts/agent-verify-part6.mjs`)

Memory: a note is stored and normalised · recalled by what it relates to ·
another user's **private** note is not visible · a **shared** note is, marked
not-mine · you cannot forget someone else's · you can forget your own.

Web search: **Tavily live**, aviation filter working — a query on runway
contamination returned only `easa.europa.eu` and `skybrary.aero`, every result
marked `authoritative: false` with its domain and fetch time.

Provenance: four tiers, four distinct colours, and a mixed answer attributes all
four separately.

Flight tracking: declared, returns `available: false`, tells the model to fall
back to the wall's schedule rather than estimate a position.

**Chosen: Tavily** (`TAVILY_API_KEY`). Brave remains implemented; setting its key
instead switches provider with no code change.

### Decisions needed from you
1. **Deploy** `agent-service` — the memory table and the Tavily key are already
   in place.
2. ~~Flight tracking~~ — **deferred to the end of the series by your decision**
   (2026-09-24). The tool stays declared and returns `available: false`, telling
   the model to fall back to the wall's schedule rather than estimate a
   position, so nothing depends on it. Enabling it later is configuration plus a
   provider adapter, not a rebuild. Options in
   `docs/agent-flight-tracking-decision.md`.
3. **Aviation domain list** — ~25 authority domains today. If dispatchers trust
   a source I have not listed (a handling agent, a NOTAM aggregator), say so and
   I will add it; the list is in `agent/lib/tools/web.mjs`.

## Part 7 — Write tools (low risk)

**Status: Built, on `main`, NOT deployed.** SQL run by Dmitrijs on 2026-09-24.
Verifier **19/19** (`scripts/agent-verify-part7.mjs`); Part 4 re-run 18/18 after
the wall change below, no regression. Commits `a688929` (schema), `6df80da`
(tools), `65a7e76` (status + verifier), `4cf656d` (wall authorship fix).
Deployed: **no** — `agent-service` and `portal` still need a deploy.

**Authorisation:** Part 7 was started on **2026-09-24 on the owner's decision**,
without an ops sign-off on Phase 1. Recorded here because the status file is the
record of what happened, and that is a different fact from "ops approved".

### Scope — reversible only
Display settings · limitations (create/edit) · IMPORTANT entries · reports ·
operator enable/disable · aircraft show/hide.

Everything here can be put back exactly as it was. **No delete, no send to a
crew, no safety acknowledgement** — those are not reachable from any tool the
agent has, and the verifier asserts that no such tool is offered.

### Three rules, in one place
They live in `agent/lib/actions.mjs`, not in each tool: a rule repeated in seven
places is a rule that will be missed in the eighth.

1. **Every agent-written record is marked AI-authored** — `Ops Agent (AI) for
   <person>`. Both halves matter: "AI" so nobody mistakes it for a colleague's
   judgement, and the name so a human is always accountable. An unattributed AI
   edit is the thing an ops department cannot accept.

   The first verifier run caught this rule failing in the one place it mattered
   most. The agent stamped the fields correctly, but the wall's
   `upsertCustomLimitation` rebuilt every record from a fixed field list and
   dropped them on the way to disk — so the mark existed only in the audit log,
   and a limitation the agent wrote was indistinguishable from a dispatcher's on
   the wall itself. Fixed in `4cf656d`: limitations now carry authorship the way
   the IMPORTANT store already did. Two follow-on rules there, both about not
   letting an edit launder authorship: who **created** a record never changes on
   an edit, so an agent edit of a dispatcher's limitation cannot reattribute the
   original; and once agent-touched a record stays flagged, so a later human
   edit cannot quietly clear the mark.

   Worth stating plainly: a marking rule is only real if the store at the end of
   the chain keeps the field. The audit log is not a substitute — nobody reading
   the wall has it open.
2. **Every write stores the COMPLETE before and after state**, not a diff. An
   undo restores a known state rather than computing an inverse — a derivation
   can be wrong in ways nobody notices until the wall is wrong.
3. **An undo is a NEW action** referencing the original. The original is marked
   undone, never edited or deleted.

### No confirmation screens
The brief is explicit, and the reasoning is worth keeping: **a confirmation
habit trains people to click through the confirmations that matter.** The safety
is not a dialog — it is that the backend re-checks permission on every call,
every write goes through the wall's own API **carrying the caller's session** so
the agent cannot write what its caller could not, the record shows as
AI-authored on the wall, and it can be undone.

The system prompt says to ask when an instruction is **ambiguous** ("make the
rows bigger" needs a number) and explicitly not as a ritual.

### What the dispatcher sees
Changes appear in their own block **above** the reply, not folded into the
tool-activity disclosure — nobody should have to expand something to discover
the wall was modified. Each carries an `AI` chip and "ask to undo any of these".
The block is built from tool **results** carrying an action id, so a change is
shown because a write returned one, never because the model said so.

### Undo
`list_recent_actions` + `undo_action` make "undo the limitation you added
earlier" work from the logs, without the user knowing an id. Ownership is in the
query: one dispatcher cannot undo another's change even with a valid id. A
**failed** undo is recorded too — "we tried to put it back and could not" is
exactly what someone needs to find later.

### Decisions needed from you
1. **Deploy `agent-service` and `portal`.** The SQL is run and the verifier is
   19/19 locally; nothing of Part 7 is live until the deploy. The wall
   (`digital-wall`) also changed in `4cf656d` and needs to go out with them —
   deploying the agent without it puts the AI mark back in the audit log only.
2. **Worth doing before dispatchers use this:** show ops the read-only agent.
   The Phase 1 demo is still outstanding and this part now lets the agent change
   what they see on the wall.

## Part 8 — Write tools (sensitive)

**Status: Built, on `main`, NOT deployed.** No new SQL. Verifier **30/30**
(`scripts/agent-verify-part8.mjs`); Part 7 re-run 19/19 and Part 4 18/18 after
the shared-store changes.

### Deletion is soft, everywhere
`deleteCustomLimitation` moves the record to a recycle bin rather than
destroying it, so a restore puts back **the record itself — same id, same
fields** — instead of a reconstruction from a snapshot. Anything still
referencing that id still points at the right thing; a re-creation would look
identical on the wall and be a different record.

The bin is a **separate array**, not a `deleted` flag. `customLimitations` is
read directly in several flight-matching paths, and a flag would have to be
honoured in every one of them — the one that got missed would put a deleted
restriction back on the wall. Moving the record cannot be forgotten.

**Permanent limitations are refused in the store**, not in the tool, so the rule
holds for the console, the agent, and whoever adds the next caller. The verifier
checks both paths: the agent is refused, and so is a direct API call.

### How long a wrong deletion is visibly wrong for
Measured against the local rig, 10 samples, alternating delete and restore:

| | |
|---|---|
| Broadcast reaches a connected wall | **median 5.4 ms, worst 6.8 ms** |
| Wall then refetches and repaints | one local API call |
| **Connected wall, end to end** | **well under a second** |
| **Wall whose SSE has dropped** | **up to 60 s** (`POLL_MS` in `DisplayApp.jsx`) |

Restore broadcasts on the same channel as delete, so a record comes back in the
same time it took to disappear. The 60-second figure is the honest worst case
and is a property of the wall's existing polling fallback, not of this part.

### Confirmation, and why almost nothing gets one
Reversible work executes directly. The brief's reasoning is the right one: a
confirmation habit trains people to click through the confirmations that matter.

The one irreversible path — purging the bin — asks first, and **the token is
issued by this backend, never by the model**. A tool that asked the model to set
`confirmed: true` once the user agrees would be a permission the model grants
itself, and a model that misreads a reply would grant it wrongly. So the first
call executes nothing and returns a token; the destructive path runs only on a
second call carrying a token this process issued, for this user, this tool and
this exact target, within ten minutes. The model can relay a token; it cannot
invent one. The verifier proves the negative: a fabricated token is refused and
the record survives.

Two details that only showed up under test:
- An **outstanding token is reused, not replaced.** Minting a fresh one on every
  ask meant a single bad attempt silently invalidated the token the user was
  about to confirm with, and their "yes" then failed for no visible reason. The
  expiry is not extended, so repeating the question cannot hold the window open.
- A token is **single use and target-scoped**, so one agreement cannot authorise
  a second destruction.

### Surfacing changes where the team looks
Every agent write now appears in the **existing dashboard changelog**, marked
agent-made and attributed to the person who asked, with deletions, restores,
purges and undos each worded distinctly. Irreversible and failed actions render
as errors rather than edits.

This is the part that makes undo worth having. The person who asked sees the
change in their conversation; **the rest of ops does not**, and a wrong change
nobody notices is one nobody undoes.

One trap worth recording: the changelog filters out pending confirmations with
`error.is.null,error.neq.awaiting_confirmation`. A bare `.neq()` would have
hidden **every successful action**, because SQL's `error <> 'x'` is NULL, not
true, when `error` is null.

### Recommendation on a digest — yes, but event-driven
A scheduled daily digest is the wrong shape here. With today's volume most days
would say "no agent changes", and a message that is usually empty trains people
to ignore it — the same habituation this brief rejects for confirmation dialogs.

**Recommended instead:** send on the existing NOTAM-check cadence, and only when
there is something to say — an irreversible action, a failed write, or a change
still un-undone after some hours. A digest that only arrives when something
happened cannot be tuned out. **Not built** — it needs your call on the channel
and the threshold.

### Out of scope, and verified as such
No tool writes **flight operational status** — that writes to Leon and affects
real operations. No send-to-crew and no safety acknowledgement. The verifier
asserts all three by name, so adding one later trips a test rather than
shipping quietly.

### Decisions needed from you
1. **Deploy `agent-service`, `digital-wall-backend` and `portal`** — the store,
   the tools and the changelog are three services and all three changed.
2. **The digest**: event-driven on the NOTAM-check cadence, or leave the
   changelog as the only surface for now?
3. **Recycle-bin retention** is currently the newest 200 deleted limitations,
   with no time limit. Say if ops wants a shorter window.

## Part 9 — Voice

**Status: Groundwork on `main`. NOT built, NOT deployed — blocked on two things
only you can provide.** See "What is blocked" below.

### Blocked, and why I did not build around it
1. **No `ELEVENLABS_API_KEY`.** Nothing can call Scribe or TTS.
2. **No recorded dispatcher audio.** The brief makes this a gate: *"If keyterm
   prompting doesn't meaningfully improve ICAO recognition on real audio, say so
   before building on it."* Keyterm prompting is the stated reason for choosing
   Scribe, so the whole STT design rests on a number nobody has measured yet.

   I did **not** synthesise the audio to produce a number. TTS speech is clean,
   native-accented and quiet; the question is whether keyterms rescue ICAO codes
   from *accented, second-language, noisy ops-room* audio. A benchmark on
   synthetic speech would answer a different question and would read as though
   the gate had been cleared.

### Built, because it does not depend on either
- **`scripts/agent-voice-benchmark.mjs`** — runs every recording through Scribe
  twice, cold and keyterm-primed, and reports the difference. The headline is
  **critical-token recall**: of the ICAO codes, registrations and aviation codes
  actually spoken, how many came back intact. Scored separately from word error
  rate on purpose — a sentence can be 95% correct and still send a dispatcher to
  the wrong airport, and WER averages exactly that away. It prints a verdict and
  refuses to run without a key or recordings.
- **`docs/voice-benchmark/queries.json`** — 20 queries to record: 7 English,
  6 Russian, 7 code-switched (Russian grammar, English aviation vocabulary),
  38 critical tokens. Swap the ICAO codes and registrations for ones this
  operation actually flies before recording.
- **`agent/lib/voice/keyterms.mjs`** — the keyterm corpus: registrations and
  operator prefixes from the wall's fleet, ICAO codes from the airports table,
  plus a fixed aviation vocabulary. Scoped to the caller's own session, so the
  list cannot become a way to learn which registrations exist beyond their
  access. Deliberately narrow: airport *names* and ordinary English are excluded,
  because a bloated list dilutes the terms that matter.
- **`agent/lib/voice/language.mjs`** — the reply-language rules, carried as an
  explicit field from the STT result and never inferred. "Проверь NOTAM по EVRA"
  is four English tokens in a Russian sentence; a model asked to detect language
  from that text will sometimes answer a Russian speaker in English. Three rules,
  and the last two matter more than the first: codes and aviation vocabulary stay
  in Latin script (a transliterated ICAO code cannot be typed into any system the
  dispatcher uses), and **the verbatim tier is never translated** — a translated
  restriction is a paraphrase wearing the authority of a quotation.
- **The voice exception to the no-confirmation rule**, enforced in the tool
  framework and tested end to end.

### Voice-initiated destructive actions — and the answer to your question
The brief asks whether spoken confirmation is acceptable in a noisy ops room, or
whether those always need an on-screen confirm.

**Answer: readback-and-confirm is enough for reversible destructive actions;
irreversible ones require the screen.** The reasoning is the failure mode, not
the medium. What makes voice risky is that the agent may act on a sentence
nobody said — a misheard ICAO code or record name. A readback closes exactly
that gap, because the dispatcher hears the record *named back to them* before
anything happens, and a wrong record is obvious at that moment. What a readback
does not close is the room: a second voice, a radio, or a colleague's "yeah"
picked up as agreement. For a reversible action that residual risk is bounded —
the change is soft, attributed, in the changelog and undoable in seconds. For an
irreversible one it is not bounded at all, so purging keeps its own on-screen
confirmation and a voice token cannot substitute for it.

Enforced in `executeTool`, keyed on `inputMode` from the request rather than
anything the model says, so it cannot be prompted away. A destructive tool
called by voice returns a readback instruction naming **the record's title, not
its id** — "LIM-MUFQ632C" spoken aloud confirms nothing. Verified: voice delete
reads back and does not execute; a forged token is refused; the real token
executes; typed input is unchanged; a voice *read* needs no readback.

### Still to build, once unblocked
Live Scribe streaming and TTS; the compact voice bar and Siri-style overlay with
their six states; the keybind; "show it or say it" for answers that cannot be
spoken (tables, documents, raw METAR); microphone permission and unavailable
states.

**I do not have the voice designs.** Part 4's panel came from a Claude Design
import; nothing equivalent exists here, and I am not going to invent a visual
language for a surface you have already designed.

### Decisions needed from you
1. **`ELEVENLABS_API_KEY`** in `.env` on the server and locally.
2. **Record the 20 queries** — real dispatchers, in the room they work in.
   Then I run the benchmark and report the number before building on keyterms.
3. **The voice designs** — share them the way the console designs came through,
   or tell me to design the bar and overlay from the existing console kit.

## After the audit (2026-09-24) — `docs/agent-audit-2026-09.md`

The audit found the build far more complete than the owner believed (~three-quarters; every
container current with `main`) and two things that mattered more than any feature:

1. **A confident false negative.** A title normalised by the model (the `·` dropped) hit a
   whole-string substring filter, got zero rows, and the agent said the limitation *"may already
   have been deleted"* while it was on the wall. **Fixed in `4cddc71`**: token matching, closest
   matches on zero rows, a system-prompt rule that zero rows is not "does not exist", three
   regression checks with a `·` in the title.
2. **The verbatim frame had never rendered in a live chat.** The streaming loop yielded tool calls
   without their result; every block builder returned empty; the Part 3 verifier accepted "none
   quoted this turn". **Fixed in `b0b0071`**, with a deterministic verifier check. The same commit
   gives `agent-service` a real volume (`/mnt/ssd-cache/agent:/storage` — it was the one container
   without one, so every rebuild deleted uploaded originals), generated-file retention, and the SQL
   that makes the audit log append-only in the database.

`70c4dd1` then closed the functional debt the audit listed: recycle bins for IMPORTANT entries and
reports (only limitations had one), the missing reply cards (mono blocks, document, file, airport),
real attachments, `/` commands that dispatch, and the knowledge-base approval page that meant Tier 1
could only be fed by script.

**Still open after this:** the AWS key rotation (IAM console), running the hardening SQL, the
deploy of the three commits, the voice interface (gated on recordings), and the escalation trigger.

## Part 10 — Multi-model routing

**Status: Built, on `main`, NOT deployed.** No new SQL. Routing benchmark
87% correct entry with **0 writes on the cheap tier**; Parts 4/7/8 re-run
18/18, 19/19, 30/30.

### Step 1 — what is actually happening
From `agent_audit_log`, 2026-09-23 to 2026-09-24, separating real traffic from
my own verifier rig (`local@clearway.aero`, 328 rows, discarded):

| | Real dispatcher traffic |
|---|---|
| Chat requests | **39** (one user, two days) |
| Answered turns | 38 |
| Tool calls | 77 — **1.97 per request** |
| Input tokens/turn | median **17,980**, p90 33,271, max 58,474 |
| Output tokens/turn | median **188**, p90 707 |
| **Input share of spend** | **91.9%** |
| Cost | $2.51 total, **$0.066/turn** |
| Answer latency | p50 5,354 ms, p90 14,389 ms, max 36,403 ms |
| Tools used | 25 distinct, of 43 offered |

**Say the quiet part first: 39 requests from one person over two days is not
usage data.** The brief put this part last because routing without data is
guesswork, and the data is still thin. What it does support is one structural
finding that does not depend on volume: **input is 92% of spend, at roughly
96 input tokens for every output token.** Almost none of that is the question —
it is the system prompt and 43 tool definitions, resent on every turn and again
on every tool round within a turn. That is a property of the architecture, not
of the sample size.

### Step 2 — the benchmark
`docs/routing-benchmark/queries.json`: **69 labelled requests** across simple,
AIP, NOTAM/weather, flights, knowledge, web, files, email, read, write,
destructive, complex and deliberately ambiguous. `expectTier` is a human label —
the thing to argue with if a result looks wrong.

`scripts/agent-routing-benchmark.mjs` scores it. The headline is **not** exact
match. It is **under-routing**: how often a request was handed to a model weaker
than it needed. An over-route costs cents; an under-route costs a right answer
and does it silently, because the reply still reads fluently.

### The first result said DO NOT SHIP, and it was right
The obvious design — let the router pick fast, standard or reasoning — measured:

- **23 of 69 under-routed (33%)**, including `"Delete everything"` → fast and
  `"Change the flight status of YL-ABC"` → fast.
- **42.9% MORE expensive** than the flat-Sonnet baseline it was meant to beat.

The cost result is arithmetic, not bad luck. At a median 18,000-token input the
tier price is dominated by input, and Opus is **5.0x** Sonnet while Haiku saves
73%. So **one reasoning route costs what seven fast routes save.** A classifier
free to reach for Opus erases the saving by being generous.

Two changes followed, both from that measurement:

1. **The router picks `fast` or `standard` only.** Reasoning is reached by
   escalation, never by classification — which is what the brief said, and the
   economics agree.
2. **A deterministic floor under the classifier.** Anything whose wording
   changes, deletes, sends or generates cannot enter on the cheap tier,
   whatever the classifier thinks. A model wrong 33% of the time in the
   dangerous direction cannot be the only thing between a destructive request
   and the weakest model.

### After
| | |
|---|---|
| Correct entry tier | **60/69 — 87.0%** |
| Over-routed | 6 (8.7%) — a trivial question paid standard prices |
| **Under-routed** | **3 (4.3%)** |
| **Writes/deletes on the cheap tier** | **0** |
| Modelled cost on this set | $3.92 → $3.17, **19.1% cheaper** |

All three under-routes are **read-only**: *"What are the runway dimensions at
EYVI?"*, *"Which flights are unconfirmed?"*, *"What's the CTOT?"*. The first two
are arguably single lookups and my labels are the questionable part; I left them
labelled as they are rather than relax a test after seeing the score. The third
is a genuine miss — it is ambiguous and should have been standard, and the floor
does not catch it because it contains no change verb.

### Prompt caching — the real win, measured on live turns
| | |
|---|---|
| Fresh input over a 4-turn conversation | 4,221 tokens |
| Cache reads | **49,039 tokens** |
| Cache writes | 1,661 tokens |
| **Cost saving** | **75.7%** |

Four times the size of the routing saving, with no judgement about which model a
question deserves and therefore no quality risk. The cache point is placed after
the system prompt and after the tool definitions, so the prefix is cached and
re-read on every tool round — which is where production's 18,000-token median
actually comes from.

**This nearly shipped looking broken.** The first measurement read zero cache
hits. Caching was working the whole time; the SSE `done` payload simply did not
forward `cacheReadTokens`, so the saving was invisible from outside. Worth
recording because the failure mode is general: an optimisation you cannot
measure is one you will eventually turn off by accident.

Caching is skipped for non-Anthropic models by allowlist, not denylist — a model
that turns out not to support it then costs nothing extra rather than erroring
on first use. A cost optimisation must never be able to take the agent down.

### Escalation
`escalate()` refuses any downgrade, in the function rather than by convention,
because "escalation is one-way" holds until one call site passes a lower tier by
accident and a silent downgrade is invisible in the output.

**No automatic trigger is enabled.** There is no evidence for what should fire
it, and at 5x Sonnet a wrong trigger is expensive. A caller may still pin
`tier: "reasoning"` explicitly, and that is audited like any other route.

### Second opinion — not justified
The brief asks whether an OpenAI cross-check on high-stakes questions is worth
it. **No, not now**, for three reasons:

1. **It doubles cost on exactly the expensive turns** — the ones already routed
   to the most capable model.
2. **Agreement is not correctness.** Two models trained on overlapping data
   agree confidently on the same wrong answer often enough that agreement would
   be read as verification when it is not. That is worse than one answer the
   dispatcher knows to check.
3. **The disagreement path is undefined.** If the two differ, what does the
   dispatcher see? Without an answer to that, the second call buys a number
   nobody can act on.

**Revisit when** there is a class of question where a wrong answer is expensive
AND the disagreement has a defined handling — for instance, refusing to answer
and escalating to a human. The mechanism is cheap to add then.

### Rollback
`"activeTier": "standard"` in `agent/config/models.json` pins every turn to one
model again. Config, not code — no rebuild of logic, just a restart.

### Decisions needed from you
1. **Deploy `agent-service`.** Caching and routing are both live in code and
   inert until then.
2. **Re-run the benchmark after a fortnight of real traffic.** 39 requests
   labelled by me is a starting point, not a verdict. The labels should come
   from what dispatchers actually ask.

## Ops Agent UI — full implementation (design spec → portal)

| Stage | Commit | On main | Deployed |
|---|---|---|---|
| 0 — spec, manifest, tokens, icons | c80eef0 | yes | yes — 2026-09-24 22:48Z (portal build CPLTeU4bq1NEBEAikfRlQ2, agent-service healthy) |
| 1 — server-verified confirmations (§3) | 7f560a3 | yes | yes — 2026-09-24 22:48Z (portal build CPLTeU4bq1NEBEAikfRlQ2, agent-service healthy) |
| 2 — view endpoints (activity, settings, usage, knowledge, history, suggestions, attachments) | d826741 | yes | yes — 2026-09-24 22:48Z (portal build CPLTeU4bq1NEBEAikfRlQ2, agent-service healthy) |
| 3a — primitives and the safety-carrying thread components | 340f7b4 | yes | yes — 2026-09-24 22:48Z (portal build CPLTeU4bq1NEBEAikfRlQ2, agent-service healthy) |
| 3b — panel, full page, History, Activity log, Settings, Knowledge base, nav, shell wiring | 18bd218 | yes | yes — 2026-09-24 22:48Z (portal build CPLTeU4bq1NEBEAikfRlQ2, agent-service healthy) |
| 5 — follow-up: /agent pages behind the tunnel, @ picker states, ⌘J on the wall console | be5e852 | yes | yes — 2026-09-24 23:22Z (portal build HvulmkGIRkAqNT4C_FjqF; agent-service + digital-wall-frontend rebuilt) |
| 6 — editable keyboard shortcuts (shared or per-platform) in Agent settings | ec74070 | yes | yes — 2026-09-24 23:18Z (portal build wtGwgo9IUOOBwtW4rm9n9; agent-service + digital-wall-frontend rebuilt) |
| 7 — @ picker all types, NOTAM text/boxes, DateField, hover fix, voice bind, show/close flight on wall, model line | 9969cb8 | yes | yes — 2026-09-24 23:48Z (portal build yrzZaEQeWyxjo4BP1wb9x; agent-service rebuilt) |
| 8 — three-way routing (fast / standard / reasoning by task) + High-knowledge switch + route shown under replies | 1e15a16 | yes | yes — 2026-09-25 00:05Z (portal build K1V0YGmfwiZDQgt72L_8l; agent-service rebuilt) |
| 9 — inline previews (no downloads on reload), thread URLs, 100 MB raw knowledge uploads with progress, quiet expired prompts | 1a3f5a4 | yes | yes — 2026-09-25 00:20Z (portal build gEs6xurBA6v3K3PODUNui; agent-service rebuilt) |
| 10 — list_files, attachments by filename, precheck before confirmation | 6c92217 | yes | yes — 2026-09-25 00:40Z (agent-service rebuilt) |
| 11 — IMPORTANT / CAA verbatim frames resolve (kind on blocks; list-and-find on the wall) | 9ffd715 | yes | yes — 2026-09-25 00:50Z (agent-service rebuilt) |
| 12 — voice input: push-to-talk → ElevenLabs STT → voice message; docked bar, permission cards, console hold | 4cb0923 | yes | yes — 2026-09-25 01:14Z (portal build 2IjUAMv2oIOkbKIwJ56xK; agent-service + digital-wall-frontend rebuilt) |
| 13 — shortcuts match on the physical key (⌥ chords on macOS); recorder feedback | f87d947 | yes | yes — 2026-09-25 01:35Z (portal build U2JcgdeZ7Ga-xZE5VUqKP; agent-service + digital-wall-frontend rebuilt) |
| 4 — manifest statuses + report | e456898 | yes | yes — 2026-09-24 22:48Z (portal build CPLTeU4bq1NEBEAikfRlQ2, agent-service healthy) |
| 14 — document viewer: citation → document (exact match only, not-found = no highlight + red banner + logged), verbatim check, tabs, five entry points, file types, states, `/agent/doc` for the wall | 97086f5 | yes | yes — 2026-09-26 (portal build Wm3l1mh8wU5hJ3MkEp8LT, was U2JcgdeZ7Ga-xZE5VUqKP; agent-service + digital-wall-frontend rebuilt `--no-cache`; server HEAD 97086f5) |

Verified in a browser on the production build (Playwright, standalone server + agent in local test mode):
39 screenshots; console clean apart from the rig's own 401s. §3 rules verifier 15/15 on the final code.
Report: `docs/agent-ui-report.md`. Manifest: `docs/agent-ui-manifest.md` (89 ✅ · 61 present · 7 partial ·
39 blocked · 1 untouched).

Two things for you: the voice-bar-over-the-wall decision (report §8) and the rows blocked on voice
(no STT/TTS wired — the recordings decision).

**Stage 14 (viewer) verification.** Production build on the rig, Playwright, screenshots `dv1`–`dv27`:
citation found / not found (0 highlights, 0 markers, red banner, page open, Activity `citation.check →
Citation not found`) / verbatim mismatch (0 highlights, red tag, Activity `verbatim.check → Data error ·
text differs`) / verbatim match; 28.7 MB PDF opened at p. 60 renders page 60 first (range log: xref → header
→ page-60 chunks); another user's generated file by URL → 404 and the PERMISSION DENIED card; reduced
motion → `animation-name: none`; tabs 6 + Undo; citation from a real reply → second tab at the clause;
image / scanned / password / broken / text / csv / xlsx / docx / kmz / too-large / fetch-failed / offline.
Production after deploy, no session: `/files/*` and `/agent/doc` → 307 `/login`; every `/agent/api/*`
file, document, attachment and citation route → 401; `/agent/api/health` 200; the viewer chunk and
`pdf.worker.min.mjs` are served from the new build. Manifest: `docs/agent-viewer-manifest.md`; report §8k.
Blocked (backend): revision/superseded metadata, cached offline copies, AIP citation spans, server-side
DOCX rendering, portal deep-link format.

## Deferred items (all parts)

| Part | Item | Why deferred | Where it should land |
|---|---|---|---|
| 0 | IATA column + fill on `airports` | Needs DDL run in Supabase SQL editor | Part 0, after `docs/supabase-airports-iata.sql` is run |
| 0 | Relabel Guernsey/Jersey/IOM/Luxembourg/Montenegro/Macau airports to their own country | Scraper routing keys on current labels | Whichever part builds the airport-lookup tool |
| 0 | Wall-wide mutation audit log | Out of P4's scope; agent actions are audited in the agent service | Part that adds the wall tool layer |
| 0 | ~~Bedrock test invocation~~ | **Done** — Haiku 4.5 + Nova Pro returned live responses | — |
| 0 | Opus 4.6 Marketplace agreement | Temp activation policy was removed before it succeeded | Re-run the enabler with the temp policy attached |
| 0 | Titan embeddings (`amazon.*` in the runtime policy) | Policy edit not yet applied | Next AWS console visit |
| 0 | Rotate the pasted `clearway-agent` access key | Pasted in plaintext during setup; the CSV export in ~/Downloads was deleted 2026-09-24 | **Still open** — needs the IAM console |
| 8 | Run `docs/supabase-agent-hardening.sql` | DDL — Supabase SQL editor only | Makes `agent_audit_log` append-only and adds `expired_at` for retention |
| 6 | Flight tracking provider | Deferred by decision 2026-09-24 — recurring cost, and the wall already covers planned times | End of the series |
| 1 | Pickem healthcheck is broken (pre-existing) | `${p}` in `docker-compose.yml` is expanded by compose, not node, so the probe hits a portless URL — this is the audit's "unhealthy pickem false alarm" | Out of Part 1's scope; one-line fix whenever you want it |
| 0 | Opus 5 / Sonnet 5 access | Account-gated by AWS ("contact AWS Sales") | Only if Opus 4.6 proves insufficient |
| 0 | Cohere Rerank | Not offered in eu-north-1 | Use Haiku/Nova for reranking, or another region |
| 0 | Remove duplicate `AWS_REGION` line in server `.env` | Needs server access | With the first deploy |
