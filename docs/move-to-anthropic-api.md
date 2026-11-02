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
- `agent/config/models.json`: `provider: "anthropic"`. Each tier names the model it targeted on Bedrock: fast Haiku
  4.5; standard and extraction Sonnet 5, falling back to Sonnet 4.6; reasoning Opus 5, falling back to Opus 4.6; the
  router Haiku 4.5. `ANTHROPIC_MODEL_<TIER>` overrides a tier; `MODEL_PROVIDER=bedrock` goes back.
- **Admin routing settings** were written with Bedrock IDs, so one would fail here. Under the Anthropic provider it is
  ignored. Production has none saved.
- **The agent's health answer** names the provider.
- **Proof:** `rig/anthropic-runtime-check.mjs` (17 checks) runs against a local stand-in for the API: what goes out,
  what comes back, how errors classify. The live check is one minimal call on production after the deploy.

## Not done here

- Embeddings and the guardrail: the decisions above.
- The nine model suites on the rig need the rig's own key in `.env.rig`.
