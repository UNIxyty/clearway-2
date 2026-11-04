# Undefended paths

**The rule (2026-11-03):** a code path with no caller and no scheduled check is undefended. It reports nothing when it
stops, because nothing runs it to find out. Every path we depend on has either real traffic that someone would notice
failing, or a scheduled check against the real thing that alarms when it fails, and something watching that check.

**And its twin: falling back is fine; falling back quietly is not.** A degraded answer that looks normal is worse than
an error. A router that falls back to "standard" without a word turns every question into a standard-tier one, and the
only symptom is a slightly bigger bill. Every fallback must therefore be visible in three places:

- **On the audit row the turn already writes,** with its reason: `chat.response` detail.fallbacks (the router, a fallback
  model, a retry a tier up), and `knowledge.uploaded` detail.fallbacks (the tier proposal). A sender fallback is on the
  mail's own send row.
- **Under the reply:** the model line says "router unavailable" or "fell back to sonnet-5".
- **In the alarm:** `agent/lib/fallback-watch.mjs` checks every hour.
  - **Chat:** at today's volume (about 4 turns a day), **one** chat fallback in 6 h alarms, with its reason. A
    percentage needs a denominator, and a window often holds one turn or none. From **20 turns in a 6-hour window**
    (about 80 a day, twenty times today) the share rule takes over: at least 3 fallbacks and at least 15% of turns.
  - **Tier proposals:** any one that fell back alarms.
  - **Sender:** a sender fallback is exempt only while Resend itself reports the intended domain as not verified. The
    exemption clears itself the moment the domain verifies. If Resend cannot be asked, there is no exemption.
- **Proof:** `rig/fallback-watch-check.mjs`, 17 checks.

It is the same fault five times in one week, and the fifth entry below is a shape of its own: a report with no reader. Each time, a safeguard or a path nobody exercised had stopped working,
and nothing said so.

| # | Found | What had stopped | How long, unseen | Why nobody knew | What defends it now |
|---|---|---|---|---|---|
| 1 | 2026-11-03 | **Intake extraction**, the path that turns passports and passenger lists into records. Bedrock refused the dead AWS key, then from 2026-11-02 22:27Z the Anthropic API refused the `temperature: 0` that extraction sent to Sonnet 5 | From the AWS key's failure (31 Oct) to the 5.5 deploy at 23:53Z on 2 Nov | Intake is not live: no mail came in to run it | A scheduled smoke call, every 6 h (`agent/lib/smoke.mjs`); `temperature` only goes to models that take it |
| 2 | 2026-11-02 | **The intake mailbox** received nothing | 25 days | Intake is not live, so silence looked normal | Not yet: the silence alarm (no inbound mail in N working hours) is the next item on the list |
| 3 | 2026-11-02 | **Three permission reveal checks** were red, filed under "no model key" | Since the model key died | Their real cause was a missing fixture, a request only the model-driven suites made. Filing it under a known cause hid it | Each known cause has a probe and names its suites one by one (`rig/known-failures.json`) |
| 4 | 2026-11-02 | **The suite runner** finished green over red suites. shell-check was red, and on no list, from mid-October | About three weeks | A red that matched nothing still ended the run as a pass | `rig/verdict.mjs`: any red is RED, exit 1; an unlisted red is named |
| 5 | 2026-11-03 | **The revert target.** The image check's rebuild moved the tag off the running image, and the server's containerd store could then not name it | Unknown; found during a deploy | No deploy had needed a revert since the store changed | `scripts/check-image-runs.sh` tags the running image `:pre-<commit>` before it builds, and stops if it cannot |

**Testing a function is not testing the wiring (2026-11-03).** The Leon verdict went into the timeline payload instead of the health route, and the rig check passed because it called the function directly; only the before-and-after walk, which read the real route, caught it.

**A check with no time limit can stop being a check (2026-11-04).** The extended client gate walk waited 35 minutes on one event stream that answered and never ended, and reported nothing the whole time. Every call in `rig/client-gate-check.mjs` now has a 20 s limit and drops the body once the status is in. A check that can wait forever is one more path that stops without saying so.

## The fifth shape: a report with no reader is not a check (2026-11-03)

A job that writes its result somewhere and trusts a person to come and find it reports nothing, however true the
result. Nobody records which pages are read, so "when was this last read" cannot be answered for any of them. That is
exactly why a report must push its worst line to someone, or stop being produced.

| Report | Written to | Last result on production | Would anyone notice "all failed"? | Now |
|---|---|---|---|---|
| AIRAC refresh summary | `aip/refresh-state.json`, the copy's own note, Telegram | AIRAC 2611 on 30 Oct, **check-only**: 62 planned, 38 checked, 8 failed, **17 copies older than the source** | Failures: yes, the service-status row degrades and each airport's page says so. The 17 older copies: **no**, the row read operational | outdated copies degrade the row too, saying the refresh is check-only. The Telegram alert counts as sent only when Telegram accepts it |
| Intake retention sweep (daily) | the server log | — | **No**: a failure was a log line, and this is the promise that passport data is deleted | its run is recorded (`job:intake-retention`). A failed, overdue or missing run fails the `scheduled-jobs` smoke check, which alerts |
| Generated-files sweep (daily) | nothing: its errors were swallowed | — | **No** | recorded (`job:generated-files`), same check |
| NOTAM digest email (daily) | the recipients; a failed send on the console's NOTAM page | read by ops | yes, the console's NOTAM page shows a failed send | — |
| Debug runner | the admin debug page, Telegram | on demand | the person who ran it reads it | the summary counts as sent only when Telegram accepts it |
| NOTAM and weather sync workers | their logs; the status page's freshness rows | — | **partly**: "newest file under 24 h, any airport" stays green while all but one airport fail | the feed survey, next on the list |
| Retrieval log (`agent_retrievals`) | the database | — | not a check: a record kept to reconstruct an answer later | — |
| Leon flight-count check | the console's sync line | live | yes: it warns on the console after 10 min | — |
| Smoke and fallback rows | `smoke:last`, `fallbacks:last` | live | yes: the alert and the wall's watch | — |

**The next survey searches every language in the repo, not just the main one.** The first inventory of model paths
searched JavaScript only and missed the Python Claude-vision extractor the AIP sync ran.

## Every model and AI path, 2026-11-03

"Last real success" is production's own record: the audit log, or the table the path writes. It excludes check
accounts and smoke runs. "Would anyone have known?" is about before today.

| Path | Where | Last real success | Would anyone have known? | Today | Defended by |
|---|---|---|---|---|---|
| Chat turn, all tiers | `agent/lib/bedrock.mjs` | 2026-11-02 23:24Z | Only the person asking, who sees an error; no alert | works | smoke `router`, `fast`, `standard-tools` (a whole tool round), `reasoning` |
| Router (picks the tier) | `agent/lib/router.mjs` | 2026-11-02 | **No**: a failure falls back to "standard" silently | works | smoke `router` (fails if the answer came from the fallback) |
| Intake extraction | `agent/lib/intake/extract.mjs` | 2026-10-08 (Sonnet 4.6 on Bedrock) | **No**: see #1 | works | smoke `extraction` (an invented request, read back) |
| Knowledge upload: tier proposal | `agent/lib/knowledge/ingest.mjs` › classifyDocument | 2026-09-30 | **No**: a failure proposes "reference" silently | works | smoke `ingest-classify` (fails if the model did not answer) |
| Knowledge upload: indexing | `agent/lib/knowledge/ingest.mjs` | 2026-09-30 | No | **works again** (2026-11-03): no embedding step, Postgres full text | smoke `knowledge`; `rig/knowledge-fts-check.mjs` |
| Knowledge search | `agent/lib/knowledge/retrieval.mjs` | 2026-09-26 | **No**: nobody had searched since September | dead 31 Oct → 2026-11-03, now **Postgres full text** (docs/knowledge-search.md) | smoke `knowledge` |
| Rerank | `agent/lib/knowledge/rerank.mjs` | with search | No | the fast tier; a failure keeps the search order and says so (`fallbacks`) | smoke `knowledge` |
| Grounding guardrail | — | — | — | **removed** 2026-11-03 (citations replace it) | — |
| The question check: codes against their place names, dates resolved, before anything is searched | `agent/lib/question-check.mjs` (fast tier) | 2026-11-03 | every question with a code | built | real traffic; a check that cannot run is a recorded fallback (`question-check`), which the fallback watch alarms on; `rig/web-search-check.mjs` §5 |
| Web search: Tavily (`tavily_search`) and the Anthropic API's own (`web_search`), two passes, citations | `agent/lib/tools/web.mjs`, `agent/lib/web-sources.mjs`, `agent/lib/citations.mjs` | 2026-11-03 (rebuilt; docs/web-search.md) | No | both work on production's key | smokes `web-search` (Tavily, pass one) and `web-search-api` (the API's search on one allowed domain, a citation back); `rig/web-search-check.mjs` through the chat route |
| Voice: speech to text, text to speech (ElevenLabs) | `agent/lib/voice/` | 2026-09-27 | No | works | smoke `voice`: speaks a sentence, hears it back, compares the words |
| AI rewrite and extraction of AIP text | — | never on production | — | **removed** 2026-11-03: no model writes AIP data. Covered the GEN rewrite, the USA field extraction, and the Claude-vision extractor the AIP sync ran on a manual sync with extraction, which failed on import every time. Correction: the AIRAC refresh is check-only on production and never ran it | — |
| Model health probe | `converseOnce`'s "live probe" | — | — | wired to nothing | — |

**How the smoke calls are defended themselves:**

- **The run's record:** every 6 hours the agent writes the run to the agent_settings row `smoke:last`.
- **Alerts:** a failure goes to the developers' Telegram chat, the same path as the AIP refresh's alerts. It counts as
  sent only when Telegram accepted it, and is sent again once a day while the path stays down. A recovery is said too.
- **The watch on the watcher:** the wall's backend, a separate service, reads that row every 30 minutes
  (`digital-wall/lib/agent-smoke-watch.mjs`). It alerts when the runs stop, when there is no row, or when the row
  cannot be read. It fails closed.
- **Neither runs on a rig.** `rig/smoke-alarm-check.mjs` proves the alarm with stand-ins: 19 checks.
- **On demand:** `scripts/check-accounts.sh run agent-smoke` runs every smoke once, now, with alerts off.

**The runaway ceiling** (`agent/lib/spend.mjs`). Every model call on the API passes a daily ledger, priced from the
real tokens of each response. The day's total is kept in the agent_settings row `spend:<date>`.
- **At the ceiling:** once the UTC day reaches `AGENT_DAILY_CEILING_USD` (default $25, about 25 times a busy day), every
  model call is refused before it is made.
- **What the person sees:** "the assistant has stopped for today … starts again at 00:00 UTC".
- **Who is told:** the developers are alerted once that day. The smoke checks fail too, so the stop is reported twice.
- **Why it exists:** at our volume, a bill can only surprise us through a loop.
- **Before 2026-11-03:** nothing stopped anything. `AGENT_MONTHLY_CAP_EUR` only feeds a figure on the Settings card.

**Cost:** about 13 cents a run, about $15 a month, mostly the full standard tool turn and extraction. It is the price
of not finding out from a dispatcher.

**Not on this page yet:** the scheduled paths that are not model calls. These are the AIP refresh, NOTAM sync,
weather sync, CNAIR notices, the NOTAM digest email, intake retention and the generated-files sweep. They are the
feed survey item, next on the list, and get the same treatment.
