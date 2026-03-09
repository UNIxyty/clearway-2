# OpenAI models for GEN / AIP rewriting

Use these with **Chat Completions** for GEN 1.2 rewriting (GENERAL and Part 4). Set `OPENAI_MODEL` in `.env` or when running the sync server.

Model IDs are as used in the API (e.g. `model: "gpt-5.4"`). Availability may vary by account; check [platform.openai.com/docs/models](https://platform.openai.com/docs/models).

---

## Top 3 for GEN rewriting

| Rank | Model ID     | Why |
|------|--------------|-----|
| **1** | **gpt-5.4**  | Best quality; most capable for regulatory text. |
| **2** | **gpt-5.4-pro** | Highest precision; use when clarity and consistency matter most. |
| **3** | **gpt-4.1**  | Best non–Gen 5 option; strong editing/rewriting, often cheaper than 5.4. |

---

## Gen 5 (latest)

| Model ID       | Description |
|----------------|-------------|
| **gpt-5.4**    | Most capable for professional work. Best quality for regulatory text. |
| **gpt-5.4-pro**| Smarter, more precise variant of GPT-5.4. |
| **gpt-5-mini** | Faster, cost-efficient; good for well-defined rewrite tasks. |
| **gpt-5-nano** | Fastest, most cost-efficient Gen 5 option. |
| **gpt-5.2**    | Previous frontier model; configurable reasoning. |
| **gpt-5.2-pro**| Pro variant of GPT-5.2. |
| **gpt-5.1**    | Strong for coding/agentic tasks; configurable reasoning. |
| **gpt-5.1-Codex** | Optimized for agentic coding (only if you need that). |
| **gpt-5**      | Reasoning model for coding/agentic tasks. |

---

## GPT-4.1 (non-reasoning, high quality)

| Model ID        | Description |
|-----------------|-------------|
| **gpt-4.1**     | Smartest non-reasoning model. Very good for editing/rewriting. |
| **gpt-4.1-mini**| Smaller, faster GPT-4.1. |
| **gpt-4.1-nano**| Fastest, most cost-efficient GPT-4.1. |

---

## GPT-4o family

| Model ID       | Description |
|----------------|-------------|
| **gpt-4o**     | Fast, intelligent, flexible. |
| **gpt-4o-mini**| Fast, affordable; **current default** in this project. |

---

## Reasoning models (o-series)

Use for maximum quality when cost/latency are less important. May require different request options (e.g. no system message in some cases).

| Model ID     | Description |
|--------------|-------------|
| **o3**       | Complex reasoning; succeeded by GPT-5 for many use cases. |
| **o3-pro**   | More compute than o3. |
| **o3-mini**  | Smaller o3 alternative. |
| **o4-mini**  | Fast, cost-efficient reasoning; succeeded by GPT-5 mini. |
| **o1**       | Previous full o-series reasoning model. |
| **o1-pro**   | More compute than o1. |

---

## Suggested choices for GEN rewriting

- **Default / cost-effective:** `gpt-4o-mini` or `gpt-5-nano` / `gpt-5-mini`
- **Better quality:** `gpt-4.1` or `gpt-5.4-mini` → `gpt-5.4`
- **Highest quality:** `gpt-5.4` or `gpt-5.4-pro`

Set in `.env`:

```bash
OPENAI_MODEL=gpt-4o-mini
# or
OPENAI_MODEL=gpt-5.4
# etc.
```
