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

## 2. Step-by-step in the AWS console

Console wording shifts between AWS releases; the nouns (Policies, Users, Access keys, Model access)
are stable even when the buttons move.

### 2a. Sign in and confirm which account you're in

Sign in at <https://console.aws.amazon.com/> as the root user or an admin IAM user. **Top-right
menu → the 12-digit Account ID.** Write it down and put it in the deploy notes — the dead key
(`AKIA…YRFM`) may belong to a different account entirely, and "which account is this?" is the
question that wastes the most time later.

Then set the **region picker (top-right) to Europe (Stockholm) eu-north-1**. Bedrock model access
and inference profiles are per-region; requesting access with the picker on N. Virginia grants
nothing in Stockholm.

### 2b. Create the IAM policy

1. **IAM → Policies → Create policy**.
2. Switch from *Visual* to the **JSON** tab, delete the placeholder, paste the policy from §3 below.
3. **Next** → **Policy name:** `ClearwayAgentBedrockInvoke` → **Create policy**.

### 2c. Create the IAM user

1. **IAM → Users → Create user**.
2. **User name:** `clearway-agent`.
3. Leave *"Provide user access to the AWS Management Console"* **unchecked** — this identity is for
   API calls only and should not be able to log in.
4. **Next → Set permissions → Attach policies directly** → search `ClearwayAgentBedrockInvoke` →
   tick it → **Next → Create user**.

### 2d. Create the access key

1. **IAM → Users → clearway-agent → Security credentials** tab → **Create access key**.
2. Use case: **Application running outside AWS** → Next → (description optional) → **Create access key**.
3. **Download the .csv or copy both values now.** The secret is shown exactly once; if you lose it,
   delete the key and make a new one — it cannot be recovered.

You now have `AWS_ACCESS_KEY_ID` (starts `AKIA…`) and `AWS_SECRET_ACCESS_KEY`.

### 2e. Delete the dead key

**IAM → Users →** whichever user owns `AKIAUGVNMLM3PJZVYRFM` → Security credentials → delete it, so
nobody puts it back into a `.env` later. If no user owns it, it was already deleted — that is why
it returns `InvalidClientTokenId`.

### 2f. Request Bedrock model access

Still with the region picker on **eu-north-1**:

1. **Amazon Bedrock → Model access** (left sidebar, near the bottom under *Configure and learn*).
2. **Modify model access** / **Enable specific models**.
3. Tick: **Anthropic** → every Claude model listed; **Amazon** → Nova Micro, Nova Lite, Nova Pro;
   **Cohere** → Embed Multilingual (and Embed 4 if offered), Rerank.
4. Anthropic models require a short **use-case form** the first time — company name, website, and a
   sentence on the use case. *"Internal flight-operations assistant for dispatchers: answers
   questions about airport AIP documents, NOTAMs and weather for our own staff."* is accurate and
   sufficient.
5. **Submit.** Most grants flip to *Access granted* within minutes; Anthropic's can take longer.
   The page shows per-model status — you do not need to wait on it to do anything else.

**If a model you need is not offered in eu-north-1 at all:** repeat 2f with the region picker on
**Europe (Frankfurt) eu-central-1**, which carries broader Bedrock coverage and is still EU. Then
set `BEDROCK_REGION=eu-central-1`. Do not reach for a US region — it moves the data out of the EU.

### 2g. Give me the key, and I run the test

Put the two values in `.env` (and later in the server `.env`), replacing the dead ones:

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_REGION=eu-north-1
```

Also delete the duplicate `AWS_REGION=eu-west-1` line — `.env` currently sets `AWS_REGION` twice,
and the second wins.

Then:

```bash
node scripts/bedrock-smoke-test.mjs --list     # what this account can actually see + ACTIVE profiles
node scripts/bedrock-smoke-test.mjs            # one real Converse call to Claude
node scripts/bedrock-smoke-test.mjs --embed    # Cohere Embed
node scripts/bedrock-smoke-test.mjs --rerank   # Cohere Rerank
```

`--list` prints the `eu.` inference-profile ids. Copy the Claude one into `BEDROCK_MODEL_ID`.

**Reading a failure** — the script names the gate:

| Message | Meaning | Fix |
|---|---|---|
| `InvalidClientTokenId` / `UnrecognizedClientException` | The key doesn't exist | Re-do 2d; check you're in the right account |
| `AccessDeniedException` on `bedrock:InvokeModel` | Key is valid, policy or ARN is wrong | Check §3 policy is attached and lists the right region |
| `AccessDeniedException` mentioning model access | Policy fine, grant missing or still pending | Finish 2f; wait for *Access granted* |
| `ValidationException` / `ResourceNotFoundException` | Model id not in this region | Run `--list`, use an **ACTIVE** `eu.` profile id |

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
        "bedrock:InvokeModelWithResponseStream"
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
- **There is no `bedrock:Converse` or `bedrock:ConverseStream` IAM action** — the IAM editor flags
  them as unrecognized, correctly. The Converse and ConverseStream API operations are authorized by
  `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` respectively
  ([API reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html):
  *"This operation requires permission for the `bedrock:InvokeModel` action."*). The two actions
  above therefore cover the smoke test's `ConverseCommand` and every streaming call the agent will
  make. An earlier revision of this policy listed all four; the extra two were inert.
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
