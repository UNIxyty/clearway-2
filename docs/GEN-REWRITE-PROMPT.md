# Prompt for GEN 1.2 rewriting with OpenAI

Use this with **Chat Completions** to rewrite AIP GEN 1.2 sections for clarity and consistency. Only two parts of the document are rewritten: **GENERAL** (usually the first part) and **Part 4** (Private flights / Non scheduled flights). The rest of the document is not sent to the model. The same prompt is used in `scripts/aip-sync-server.mjs` for both sections; you can paste it into the API or another client.

---

## Scope (what you said)

- **Do not rewrite the entire document.** Only these two parts are shown and rewritten:
  1. **GENERAL** — the first part of GEN 1.2 (up to where Part 4 starts).
  2. **Part 4** — Private flights (may be titled "Non scheduled flights" or "Part 4").
- Preserve all regulatory information, requirements, and references.
- Output only the rewritten text for the section you were given; no preamble or commentary.

---

## Recommended models

- **gpt-5.4** or **gpt-5.4-pro** — best quality
- **gpt-4.1** — strong, often cheaper

Set `OPENAI_MODEL` in `.env` or when running the sync server.

---

## System prompt

```
You are an aviation AIP editor. Rewrite the given AIP GEN 1.2 section for clarity and consistency. Preserve all regulatory information, requirements, and references. Output only the rewritten text, no preamble.
```

---

## User message

Send **only the raw text of one section** — either the GENERAL section or the Part 4 section (Private flights / Non scheduled flights). Do not send the full GEN document; the pipeline splits it and calls the model once per section.

- For **GENERAL**: text from the start of the document up to (but not including) the line where Part 4 begins.
- For **Part 4**: text from the Part 4 heading (e.g. "Part 4", "Private flights", "Non scheduled flights") to the end of the document.

Trim to ~120 000 characters if the section is very long.

```
<raw text of the GENERAL section OR the Part 4 section>
```

No extra instructions are needed in the user message; the system prompt defines the task.

---

## API parameters

| Parameter    | Value   | Note |
|-------------|---------|------|
| `temperature` | `0.2` | Slight variation; keeps tone consistent. |
| `max_tokens`  | `4096` | Enough for a long section. |

---

## Expected output

The model returns **only** the rewritten text for that section: same content as the input, clarified and made consistent, with no intro, no "Here is the rewritten section", and no markdown. Preserve paragraph structure and any numbering that is part of the AIP.
