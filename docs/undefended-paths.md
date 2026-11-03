# Undefended paths

**The rule (2026-11-03):** a code path with no caller and no scheduled check is undefended. It reports nothing when it
stops, because nothing runs it to find out. Every path we depend on has either real traffic that someone would notice
failing, or a scheduled check against the real thing that alarms when it fails, and something watching that check.

It is the same fault five times in one week. Each time, a safeguard or a path nobody exercised had stopped working,
and nothing said so.

| # | Found | What had stopped | How long, unseen | Why nobody knew | What defends it now |
|---|---|---|---|---|---|
| 1 | 2026-11-03 | **Intake extraction**, the path that turns passports and passenger lists into records. Bedrock refused the dead AWS key, then from 2026-11-02 22:27Z the Anthropic API refused the `temperature: 0` that extraction sent to Sonnet 5 | From the AWS key's failure (31 Oct) to the 5.5 deploy at 23:53Z on 2 Nov | Intake is not live: no mail came in to run it | A scheduled smoke call, every 6 h (`agent/lib/smoke.mjs`); `temperature` only goes to models that take it |
| 2 | 2026-11-02 | **The intake mailbox** received nothing | 25 days | Intake is not live, so silence looked normal | Not yet: the silence alarm (no inbound mail in N working hours) is the next item on the list |
| 3 | 2026-11-02 | **Three permission reveal checks** were red, filed under "no model key" | Since the model key died | Their real cause was a missing fixture, a request only the model-driven suites made. Filing it under a known cause hid it | Each known cause has a probe and names its suites one by one (`rig/known-failures.json`) |
| 4 | 2026-11-02 | **The suite runner** finished green over red suites. shell-check was red, and on no list, from mid-October | About three weeks | A red that matched nothing still ended the run as a pass | `rig/verdict.mjs`: any red is RED, exit 1; an unlisted red is named |
| 5 | 2026-11-03 | **The revert target.** The image check's rebuild moved the tag off the running image, and the server's containerd store could then not name it | Unknown; found during a deploy | No deploy had needed a revert since the store changed | `scripts/check-image-runs.sh` tags the running image `:pre-<commit>` before it builds, and stops if it cannot |

## Every model and AI path, 2026-11-03

"Last real success" is production's own record: the audit log, or the table the path writes. It excludes check
accounts and smoke runs. "Would anyone have known?" is about before today.

| Path | Where | Last real success | Would anyone have known? | Today | Defended by |
|---|---|---|---|---|---|
| Chat turn, all tiers | `agent/lib/bedrock.mjs` | 2026-11-02 23:24Z | Only the person asking, who sees an error; no alert | works | smoke `router`, `fast`, `standard-tools` (a whole tool round), `reasoning` |
| Router (picks the tier) | `agent/lib/router.mjs` | 2026-11-02 | **No**: a failure falls back to "standard" silently | works | smoke `router` (fails if the answer came from the fallback) |
| Intake extraction | `agent/lib/intake/extract.mjs` | 2026-10-08 (Sonnet 4.6 on Bedrock) | **No**: see #1 | works | smoke `extraction` (an invented request, read back) |
| Knowledge upload: tier proposal | `agent/lib/knowledge/ingest.mjs` › classifyDocument | 2026-09-30 | **No**: a failure proposes "reference" silently | works | smoke `ingest-classify` (fails if the model did not answer) |
| Knowledge upload: indexing (embeddings) | `agent/lib/knowledge/embeddings.mjs` (Bedrock) | 2026-09-30 | No | **dead since 31 Oct** (Bedrock) | smoke `knowledge` (same embedding call); replaced by the full-text search item |
| Knowledge search | `agent/lib/knowledge/retrieval.mjs` (Bedrock embeddings) | 2026-09-26 | **No**: nobody had searched since September | **dead since 31 Oct**: every search is refused | smoke `knowledge`: it alarms from the first scheduled run until the full-text search replaces it |
| Rerank | `agent/lib/knowledge/rerank.mjs` | with search | No | only reached after embeddings, so dead with them | smoke `knowledge` |
| Grounding guardrail | `agent/lib/knowledge/grounding.mjs` (Bedrock) | none in a live path | — | not called by any live path; dead code | removed with the citations item |
| Web search (Tavily) | `agent/lib/tools/web.mjs` | 2026-09-24 | No | works | smoke `web-search` |
| Voice: speech to text, text to speech (ElevenLabs) | `agent/lib/voice/` | 2026-09-27 | No | works | smoke `voice`: speaks a sentence, hears it back, compares the words |
| AI rewrite of AIP text (OpenRouter/OpenAI) | `app/api/aip/gen-non-ead`, `app/api/aip/usa`, `scripts/ead-extract-aip-from-pdf-ai.mjs` | never on production | — | **off**: no key in any container; returns the raw text | nothing to defend while it is off; a decision to remove it or give it a key |
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
