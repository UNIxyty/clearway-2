# AWS + Amazon Bedrock for the dispatcher agent (Part 0 / P5)

The agent service calls models through **Amazon Bedrock** only (Anthropic Claude, Amazon Nova,
Cohere Embed / Rerank). No secrets in this file or in git — keys live in the server `.env` only.

## Current state (2026-09-23)

- The key on the dev machine (`~/.aws/credentials` and `.env`, id `AKIA…YRFM`) is **rejected by AWS**
  (`InvalidClientTokenId` / `UnrecognizedClientException` on `sts:GetCallerIdentity` and on
  Bedrock). It was deleted or rotated on the AWS side. Nothing below can be verified until a
  working credential exists — see "Decision needed" in `docs/agent-build-status.md`.
- `scripts/bedrock-smoke-test.mjs` is the test invocation. It reports exactly which of the three
  gates fails: credentials → IAM policy → model-access grant.

## 1. Region — eu-north-1 (Stockholm)

Closest AWS region to Riga and inside the EU (data stays in the EU under the GDPR posture the
platform already assumes for Supabase). Bedrock in eu-north-1 serves the Anthropic and Amazon
families through **EU cross-region inference profiles** (ids prefixed `eu.` — they route within
EU regions only). Cohere Embed/Rerank availability per region changes; **confirm with
`node scripts/bedrock-smoke-test.mjs --list`** before relying on a model id. If a needed model is
not in eu-north-1, the fallback is eu-central-1 (Frankfurt), still EU. Do not use a `us.` profile.

Set `BEDROCK_REGION=eu-north-1` (the existing `AWS_REGION` is already `eu-north-1` in `.env`;
the smoke test uses `BEDROCK_REGION` → `AWS_REGION` → `eu-north-1`).

## 2. Account and model access

1. AWS Console → **Amazon Bedrock → Model access** in **eu-north-1**.
2. Request: **Anthropic** (all Claude models offered — Anthropic asks for a short use-case form the
   first time; approval is usually minutes but can take longer), **Amazon Nova** (Micro / Lite /
   Pro), **Cohere Embed** (Multilingual v3 / Embed 4) and **Cohere Rerank** (3.5).
3. Access is per-region: repeat in eu-central-1 only if a model is missing in Stockholm.
4. Verify: `node scripts/bedrock-smoke-test.mjs --list` shows the models; a plain run does one
   Converse call and prints token usage. `--embed` and `--rerank` test Cohere.

## 3. IAM — one role/user, model invocation only

Create IAM policy `ClearwayAgentBedrockInvoke` (least privilege — invoke only, no model
management, no logging config, no marketplace):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeModels",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:Converse",
        "bedrock:ConverseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:eu-north-1::foundation-model/anthropic.*",
        "arn:aws:bedrock:eu-north-1::foundation-model/amazon.nova-*",
        "arn:aws:bedrock:eu-north-1::foundation-model/cohere.*",
        "arn:aws:bedrock:eu-central-1::foundation-model/anthropic.*",
        "arn:aws:bedrock:eu-west-1::foundation-model/anthropic.*",
        "arn:aws:bedrock:eu-west-3::foundation-model/anthropic.*",
        "arn:aws:bedrock:eu-north-1:*:inference-profile/eu.*"
      ]
    },
    {
      "Sid": "DiscoverModels",
      "Effect": "Allow",
      "Action": [
        "bedrock:ListFoundationModels",
        "bedrock:GetFoundationModel",
        "bedrock:ListInferenceProfiles",
        "bedrock:GetInferenceProfile"
      ],
      "Resource": "*"
    }
  ]
}
```

Notes:
- An `eu.` inference profile fans out to several EU regions; the policy must allow the
  `foundation-model` ARN in **each** region the profile routes to (hence the extra EU rows) as well
  as the profile ARN itself. Trim the list to what `--list` reports for the profiles you use.
- `DiscoverModels` is read-only and only exists so the smoke test can list; drop it for the
  production role if you prefer.
- **Principal:** on the Docker host use an IAM **user** `clearway-agent` with this policy and an
  access key in the server `.env` (there is no EC2 instance role here — the server is a plain
  VPS). Rotate the key when anyone leaves. If the agent ever moves to EC2/ECS, attach the same
  policy to an **instance/task role** and delete the key.
- Enable **Bedrock model invocation logging** to CloudWatch in the console (account-level setting,
  not part of this policy) — that is the audit trail for every model call.

## 4. Environment variables (server `.env`; values never committed)

| Name | Purpose |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | The `clearway-agent` IAM user key (or omit on EC2 with a role) |
| `BEDROCK_REGION` | `eu-north-1` |
| `BEDROCK_MODEL_ID` | Claude inference profile id to use by default (from `--list`, e.g. `eu.anthropic.claude-…`) |
| `BEDROCK_FAST_MODEL_ID` | Optional cheaper profile for classification/sub-tasks (Claude Haiku or `eu.amazon.nova-lite-…`) |
| `BEDROCK_EMBED_MODEL_ID` | Cohere Embed id (default in the smoke test: `cohere.embed-multilingual-v3`) |
| `BEDROCK_RERANK_MODEL_ID` | Cohere Rerank id (default: `cohere.rerank-v3-5:0`) |

`.env.example` carries the names. The existing `AWS_REGION=eu-west-1` duplicate line in `.env`
should be removed once the key is replaced — two `AWS_REGION` lines is a latent bug.

## 5. Client library for the agent service (next parts)

For Claude calls use the Anthropic SDK's Bedrock client (`@anthropic-ai/bedrock-sdk`,
`AnthropicBedrockMantle({ awsRegion })`) — same Messages API surface as first-party, tool use and
streaming included. Amazon Nova and Cohere go through `@aws-sdk/client-bedrock-runtime`
(`Converse` / `InvokeModel`), which is what the smoke test uses. Both packages are installed.
