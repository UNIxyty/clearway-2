# Moving the agent off Bedrock to the Anthropic API (2026-11-02)

The AWS account that carried Bedrock is gone. On the rig and on production every model call failed with "The security
token included in the request is invalid". The plan file `cc-move-to-anthropic-api.md` could not be found on the Mac,
in the repo or on the server, so this note follows the order it was described in: first what else ran on the account,
then the code.

## 1. What ran on the AWS account

From the code, the docs and the server (setting names only, never values):

| What | Where | Status |
|---|---|---|
| Claude through Bedrock: chat with tools, intake extraction, document ingest, the LLM reranker | `agent/lib/bedrock.mjs` and its callers | **moved** to the Anthropic API (below) |
| The router (intent classification), Amazon Nova Micro | `agent/lib/router.mjs`, tier `router` | **moved** to Claude Haiku 4.5: the Anthropic API has no Nova |
| Embeddings for the knowledge base: Cohere embed-v4, fallback Titan v2 | `agent/lib/knowledge/embeddings.mjs` | **not moved: a decision.** The Anthropic API has no embeddings. Options: Voyage AI (a new account and key), a model run on our server, or another cloud account. Any change re-embeds every stored document; vectors from different models do not mix. Until then a knowledge search fails and says so |
| The guardrail's contextual grounding check | `agent/lib/knowledge/grounding.mjs`, `BEDROCK_GUARDRAIL_*` | **not moved: a decision.** No Anthropic equivalent. Answers show "not verified" with the reason, never as verified |
| Cohere rerank | `agent/lib/knowledge/rerank.mjs` | was never available in eu-north-1; the LLM reranker it falls back to now runs on the Anthropic API |
| S3 for AIP PDFs | moved to local storage in April 2026 (`ac4e9fce`) | nothing reads S3 today |
| An EC2 machine for end-to-end tests | `docs/E2E-TEST-EC2-SETUP.md` | from the code, nothing uses it now |
| The portal's own Bedrock packages | `package.json` (`@aws-sdk/client-bedrock*`) | used only by `scripts/bedrock-*.mjs` and a benchmark |

On the server: no AWS command-line tool, no `~/.aws`, no cron job touching AWS. Every service gets the shared `.env`,
so the AWS keys and the Bedrock guardrail settings sit in the portal, the agent, the wall and aip-sync. Only the agent
calls a model. With the key dead, live AWS resources cannot be listed from here: the AWS console's billing page shows
whether anything (an S3 bucket, an EC2 machine) is still there.

## 2. The keys

`ANTHROPIC_API_KEY`, one per environment. Each service's key is checked by asking the API, never by printing it.
- **Production agent:** present, and the API accepted it. It lists every model the Bedrock configuration targeted.
- **Rig:** not in `.env.rig`, the only file the rig's services load. It is in the local `.env`, which the rig never reads
  and which historically holds production's settings, so it was not copied. Put the rig's own key in `.env.rig`.

## 3. The code

- `agent/lib/anthropic-runtime.mjs`: the same `send()` as Bedrock's client. It turns the Converse requests
  `agent/lib/bedrock.mjs` builds into Messages API calls and the answers back into Converse events.
  - **Carried over:** system prompt, tools, a pinned tool, prompt-cache points, images, PDFs with citations, tool
    results, streaming, usage with cache reads apart.
  - **Errors:** mapped so the agent's handling is unchanged. An unavailable model tries the next fallback, a throttle
    is said, a timeout is a timeout.
- `agent/config/models.json`: `provider: "anthropic"`. Each tier is on the newest model in its family (section 4).
  `ANTHROPIC_MODEL_<TIER>` overrides a tier; `MODEL_PROVIDER=bedrock` goes back.
- **Admin routing settings** were written with Bedrock IDs, so one would fail here. Under the Anthropic provider it is
  ignored. Production has none saved.
- **The agent's health answer** names the provider.
- **Proof:** `rig/anthropic-runtime-check.mjs` (17 checks at the transfer, 25 since section 4) runs against a local stand-in for the API: what goes out,
  what comes back, how errors classify. The live check is one minimal call on production after the deploy.

## 4. Model generation (2026-11-03)

At the transfer, each tier kept the model it had targeted on Bedrock. That carried an old generation across for no
reason. Every tier now runs the newest model in its family. Each id was confirmed against the Models API with the
production key. The key serves `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`, as well as every earlier
id used here.

| Tier | Before | Now | Fallback (only if the primary is unavailable) | Thinking, effort |
|---|---|---|---|---|
| router | Haiku 4.5 | **Haiku 5.5** | none | off |
| fast | Haiku 4.5 | **Haiku 5.5** | none | off |
| standard | Sonnet 5 | **Sonnet 5.5** | Sonnet 5 | adaptive, medium, summary shown as the thought |
| extraction | Sonnet 5 | **Sonnet 5.5** | Sonnet 5 | adaptive, medium |
| reasoning | Opus 5 | **Opus 5.5** | Opus 5 | adaptive (cannot be off), high |

**Price per million tokens** (Anthropic list prices, read 2026-11-03), shown as input / output / cache read:

| Tier | Before | Now | Change |
|---|---|---|---|
| router, fast | Haiku 4.5: $1 / $5 / $0.10 | Haiku 5.5: $0.10 / $0.50 / $0.01 | **down 90%**. A prompt over 100,000 tokens costs $0.50 / $2.50, still half of before |
| standard, extraction | Sonnet 5: $2 / $10 / $0.20 | Sonnet 5.5: $2 / $10 / $0.10 | same input and output; **cache reads halved** |
| reasoning | Opus 5: $5 / $25 / $0.50 | Opus 5.5: $4 / $20 / $0.20 | **down 20%**; cache reads down 60% |

What the bill will do: input is most of the spend, and most input is the cached system prompt and tools. Halved cache
reads on Sonnet are the largest saving, and Haiku turns cost a tenth of what they did. The one upward pressure is
thinking. Sonnet 5.5 and Opus 5.5 cannot turn it off, and thinking tokens are billed as output. Effort is set to
medium on standard and high on reasoning so that it stays proportionate.

The pricing table in `models.json` had stale Bedrock-era rates (Haiku $0.80, Opus $15 / $75). It now carries these
list prices, so the Settings usage card is right.

**What the 5.5 models refuse,** measured on the key, each refused with a 400:

- `temperature`, on all three. The runtime leaves it out for them. The callers that asked for 0 (router, extraction,
  rerank, ingest) now get the model's own sampling.
- A forced `tool_choice`, on Sonnet 5.5 and Opus 5.5. The runtime refuses it before the call. `/blank-manifest`'s
  pinned tool call is now written by the agent itself, since the pinned input replaced the model's anyway.
- Edited or dropped thinking blocks in a tool loop. They go back unmodified with the tool results.

**Proof:**

- `rig/anthropic-runtime-check.mjs` now has 25 checks; the 8 new ones were seen failing on the old code.
- `AGENT_CODE=checkout scripts/check-accounts.sh run agent-tiers` ran this checkout's agent code on production's key
  as a check account, before any deploy. The router classified on Haiku 5.5. Fast, standard and reasoning each ran a
  real tool turn and answered from the result; reasoning on Opus 5.5 made three tool calls across rounds. Extraction
  returned the JSON asked for.

### Measured, not inferred (2026-11-03)

List prices fell, but Sonnet 5.5 and Opus 5.5 think, and thinking is billed as output. So the cost of a turn was
measured on production, as a check account: `scripts/prod-checks/agent-turn-cost.mjs`. It ran the same questions with
the same tools, priced the real token counts at list price (cache writes included), and graded each answer against the
tool's own result. The figures below are a warm turn (prompt already cached), averaged over three measurement runs.

| Tier | Before | After (as deployed) | One effort lower |
|---|---|---|---|
| fast (Haiku) | $0.0030 | $0.0003 (−89%) | — |
| standard (Sonnet) | $0.0148 | $0.0178 (**+20%**: 344–415 output tokens became 845–979) | low: $0.0158 (+7%), answers graded the same |
| reasoning (Opus) | $0.0275 | $0.0236 (−14%) | medium: $0.0216 (−21%), answers graded the same |

- **Standard got more expensive at medium**, by about fifteen cents a month at real volume. Effort is set for the best
  answer, not the price (the user's rule, 2026-11-03), so standard stays at medium.
- **Reasoning stays at high.** The test question was a simple one, not the heavy work that tier exists for, and the tier
  carries about 5% of turns.
- **Real volume** (audit log, last 90 days): 347 turns. 331 were in September; October was quiet. At September's volume
  the agent costs about **$10–11 a month**, before or after. At ten times that, about $100.
- **Usage figures were wrong:** the per-turn cost and the Settings usage card never counted prompt-cache writes, which
  are billed at 1.25× input. They do now.

### temperature: refused from Opus 4.7 on

Sonnet 5 and Opus 5 refuse `temperature` too. Extraction, ingest's tier proposal and rerank asked Sonnet 5 for 0, so
every such call failed from the move (2026-11-02) until the 5.5 change. Intake is not live yet, and the router falls
back to standard, so nothing visible broke. The runtime now sends `temperature` only to the models that take it (Haiku
4.5, Sonnet 4.5 and 4.6, Opus 4.6 and older), and never to an unknown model.

### Extraction is not identical run to run (and was not at temperature 0)

`scripts/prod-checks/agent-extraction-repeat.mjs` sends one invented intake email through the real extractor five
times. It ran on Sonnet 5.5, and on Sonnet 4.6 at temperature 0, which is what extraction ran on under Bedrock.

- **Flight data held steady on both:** airports, times, registration, counts, and every person's name and passport.
- **On Sonnet 5.5 the structure drifted.** Optional person fields (salutation, sex, …) were left out on some runs and
  written as null on others. The requester contact was filled in 2 of 5 runs.
- **Fixed:** `fillShape` writes every nullable key the model left out as null, and rule 13a makes the contact a named
  person. Structured outputs could not do this: the API allows 16 nullable fields, and this schema has 102. After the
  fix, record values were identical in 5 of 5 runs.
- **Still varies, on both models:** the wording shown to the reviewer (the source's words copied, where something was
  found, whether an informational line becomes a note). None of it goes to Leon.
- **Suite:** `rig/intake/extraction-repeat.mjs` waits on the rig key. `rig/intake/test-fill-shape.mjs` always runs.
- **Ingest's tier proposal** was identical in 5 of 5 on both models.

### Thinking is shown, not kept

The notes between tool calls are now the model's thinking summary. They reach the person asking, live, and nowhere else:

- **Chat history** keeps only how long the thinking took: `{ ms, kept: false }`.
- **Audit rows** never carried it. `chat.response` stores routing, tool activity and token counts.
- **Logs and error reports** carry the API's own error text only.
- **The model's next turn** gets earlier answers, not earlier thinking.
- **History search** reads answers only.

Messages stored before 2026-11-03 still hold their older note text, which was the model's visible words before a tool
call. Clearing it is a write to production and waits on a decision.

## Not done here

- Embeddings and the guardrail: the decisions above.
- The nine model suites on the rig need the rig's own key in `.env.rig`.
