# Bedrock Guardrail — contextual grounding for the agent

The grounding check is what separates *"the model wrote something plausible"*
from *"this is actually in the source"*. For a tool a dispatcher acts on, that is
the difference that matters.

This is a one-time setup. Fifteen minutes, mostly waiting for a form.

---

## What it actually does

Given three things — the **retrieved passages**, the **question**, and the
**reply** — it scores the reply on two axes:

| Check | Asks | Catches |
|---|---|---|
| **Grounding** | Is the reply supported by the source? | Invented facts. A confident sentence with no basis in the retrieved text. |
| **Relevance** | Does the reply answer the question asked? | A true statement that answers a different question. |

AWS's own example makes the distinction clear. Source: *"London is the capital
of UK. Tokyo is the capital of Japan."* Question: *"What is the capital of
Japan?"*

- "The capital of Japan is London" → **ungrounded** (contradicts the source)
- "The capital of UK is London" → **irrelevant** (true, grounded, wrong question)

Both are failures. Only one of them looks like a failure to a reader in a hurry.

---

## Step 1 — Permissions

Already covered if you pasted the policy from `docs/aws-bedrock-setup.md` §3.
The agent needs exactly one guardrail action:

```json
{
  "Sid": "ApplyGuardrails",
  "Effect": "Allow",
  "Action": "bedrock:ApplyGuardrail",
  "Resource": "arn:aws:bedrock:eu-*:*:guardrail/*"
}
```

**`ApplyGuardrail` only — never `CreateGuardrail`.** A runtime key that can
create or modify guardrails can weaken its own safety check. You create the
guardrail below as an admin, once; the agent only ever *uses* it.

---

## Step 2 — Create the guardrail

Region picker on **Europe (Stockholm) eu-north-1**.

1. **Bedrock → Guardrails → Create guardrail**
2. **Name:** `clearway-agent-grounding`
   **Description:** `Contextual grounding for dispatcher agent knowledge answers`
3. **Messaging for blocked prompts** — the agent never shows this text to a
   user (it handles the verdict itself), but the field is required:
   > This response could not be verified against the source material.
4. **Next** through the content-filter, topic, word and PII pages — **leave them
   all off.** This guardrail has one job. Content filtering on operational text
   would start blocking legitimate NOTAM and limitation wording, which is full
   of words like "hazard", "emergency" and "failure".
5. On **Add contextual grounding check**:
   - Tick **Enable grounding check** → threshold **0.70**
   - Tick **Enable relevance check** → threshold **0.70**
6. **Next → Create guardrail**

### Choosing the thresholds

Range is 0 to 0.99 (1 is invalid — it blocks everything). Higher means stricter:
more hallucinations caught, more legitimate answers refused.

**0.70 on both** is the right place to start here. Ops answers are short and
quote heavily from the retrieved text, so genuine answers score well above it,
while an invented CTOT or a made-up permit rule scores well below.

Tune with evidence rather than instinct: the verdicts are stored on every
retrieval, so after a week of use you can see what sat near the line. Raise it
if invented detail gets through; lower it if correct answers are being marked
unverified.

---

## Step 3 — Wire it up

Copy the guardrail's **ID** from its detail page (not the ARN) into the server
`.env`:

```
BEDROCK_GUARDRAIL_ID=<the id>
BEDROCK_GUARDRAIL_VERSION=DRAFT
```

`DRAFT` is the working version and picks up threshold edits immediately. Once
the thresholds settle, publish a numbered version in the console and pin that
instead, so a console edit cannot silently change production behaviour.

Then restart:

```bash
docker compose up -d --build agent-service
```

---

## Step 4 — Confirm it works

```bash
node scripts/agent-guardrail-test.mjs
```

It sends the three AWS reference cases plus two aviation ones through the real
guardrail and prints the scores. Expect the grounded/relevant case to pass and
the other four to be caught.

---

## How the agent uses it

`agent/lib/knowledge/grounding.mjs` calls `ApplyGuardrail` with three content
blocks, exactly as AWS documents for this API:

| Block | Qualifier | What it is |
|---|---|---|
| retrieved passages | `grounding_source` | what the answer must rest on |
| the user's question | `query` | what was asked |
| the agent's reply | *(none)* | the content being guarded |

### Two behaviours worth knowing

**It fails to "unverified", never to "silently passed".** If the check cannot
run — no guardrail configured, no permission, Bedrock unreachable — the answer
comes back `verified: false` with the reason, and the retrieval log records it.
Claiming a grounding check that did not happen would be worse than having none,
because it is invisible.

**Long replies are only partly checked.** AWS caps the policy at 100,000
characters of grounding source, 1,000 for the query and **5,000 for the
response**. A longer reply is checked up to that point and flagged `partial`
rather than reported as fully verified.

### One documented limitation

AWS states that contextual grounding supports summarisation, paraphrasing and
question answering, but **not conversational/chatbot use**. The agent's
knowledge answers are question-answering over retrieved passages, which is
supported. A long multi-turn conversation where the reply depends on earlier
turns rather than on the retrieved text is outside what the check can judge —
which is a reason to keep knowledge answers self-contained, not a reason to skip
the check.

---

## Cost

Contextual grounding is billed per text unit of the grounding source, so cost
scales with how much retrieved text each answer rests on — roughly the size of
the passages the reranker kept. With `limit: 6` chunks it is a small fraction of
the model call it verifies.
