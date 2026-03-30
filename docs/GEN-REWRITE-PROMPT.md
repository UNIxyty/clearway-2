# Prompt for GEN 1.2 rewriting with OpenAI / Claude

Use this with **Chat Completions** to rewrite AIP GEN 1.2 sections for clarity and consistency. Three parts are extracted and rewritten: **GENERAL**, **Non scheduled flights**, and **Private flights**. Non scheduled and Private are distinct; if only one is present in the document, the other is left blank. The same prompt is used in `scripts/aip-sync-server.mjs` (OpenAI) and `scripts/gen-rewrite-claude-openrouter.mjs` (Claude via OpenRouter); you can paste it into the API or another client.

---

## Scope (what you said)

- **Do not rewrite the entire document.** Only these three parts are shown and rewritten:
  1. **GENERAL** — the first part of GEN 1.2 (up to the first of Non scheduled / Private).
  2. **Non scheduled flights** — section headed e.g. "Non scheduled", "Non scheduled flights", "Part X Non scheduled". If absent, leave blank.
  3. **Private flights** — section headed e.g. "Private flights", "Part 4 Private". If absent, leave blank.
- Preserve all regulatory information, requirements, and references.
- Output only the rewritten text for the section you were given; no preamble or commentary.

---

## Recommended models

- **gpt-5.4** or **gpt-5.4-pro** — best quality
- **gpt-4.1** — strong, often cheaper

Set `OPENAI_MODEL` in `.env` or when running the sync server.

---

## Output format (match hardcoded GEN style)

The rewritten text should look like the GEN parts in `data/aip-data.json` and `scripts/merge_usa_into_aip_data.js` (USA, Benin, Burkina, etc.):

- **Continuous prose** — flowing paragraphs only. No section numbers (1.1.1, 1.1.2), no headings, no bullet or numbered lists in the output.
- **Convert structure into sentences** — turn subsections and list items into clear, connected sentences and paragraphs.
- **Preserve everything regulatory** — requirements, conditions, exceptions, references (e.g. Regulation EU 2016/399, ICAO Annex 16, 14 CFR 99.7), and contact details (addresses, phone, email, URLs) where they are part of the rules or procedures.
- **Dense but readable** — same level of detail as the source, in a consistent editorial style.

---

## System prompt

```
You are an aviation AIP editor. Rewrite the given AIP GEN 1.2 section into continuous prose. Preserve all regulatory information, requirements, and references. Output format: flowing paragraphs only — no section numbers (e.g. 1.1.1, 1.1.2), no headings, no bullet or numbered lists; convert lists and subsections into clear sentences and paragraphs. Keep contact details (addresses, phone, email, URLs) where they are part of procedures. Output must be in English only (translate source text when required). Output only the rewritten text, no preamble or commentary.
```

---

## User message

Send **only the raw text of one section** — GENERAL, Non scheduled flights, or Private flights. The pipeline splits the document into three parts and calls the model once per section (missing sections are left blank).

- **GENERAL**: from the start up to the first of (Non scheduled / Private flights).
- **Non scheduled**: from the "Non scheduled" heading to the next major section or end.
- **Private flights**: from the "Private flights" heading to the next major section or end.

Trim to ~120 000 characters if the section is very long.

```
<raw text of one section>
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

The model returns **only** the rewritten text: continuous prose paragraphs (like the USA/Benin examples in `aip-data.json`), with no intro, no "Here is the rewritten section", and no markdown. No section numbers or list formatting in the output — everything in flowing paragraphs.
