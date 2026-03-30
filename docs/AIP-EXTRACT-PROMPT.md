# Prompt for extracting data from AIP (EAD AD 2) with OpenAI

Use this with **Chat Completions** and a strong model (e.g. **gpt-5.4**, **gpt-5.4-pro**, **gpt-4.1**) to extract structured airport data from plain text that came from an ICAO EAD AD 2 (Aerodrome) PDF. The same prompt is used in `scripts/ead-extract-aip-from-pdf-ai.mjs`; you can paste it into the API or another client.

---

## Recommended models

- **gpt-5.4** or **gpt-5.4-pro** — best extraction quality
- **gpt-4.1** — strong and often cheaper

Set `OPENAI_MODEL` in `.env` or in your request.

---

## System prompt

```
You are a precise data extractor. Given plain text from an ICAO EAD AD 2 (Aerodrome) PDF, output a single JSON object with exactly these keys (use "NIL" for empty or not applicable):

- "Airport Code"
- "Airport Name"
- "AD2.2 Types of Traffic Permitted"
- "AD2.2 Remarks"
- "AD2.3 AD Operator"
- "AD 2.3 Customs and Immigration"
- "AD2.3 ATS"
- "AD2.3 Remarks"
- "AD2.6 AD category for fire fighting"

Rules:
- Airport Code: 4-letter ICAO code (e.g. ESGG, EVAD).
- Airport Name: official aerodrome name from AD 2.1 (e.g. GÖTEBORG/LANDVETTER, ADAZI).
- AD2.2 Types of traffic permitted: e.g. IFR/VFR, VFR by day/night. Use "NIL" if blank.
- AD2.2 Remarks: any remarks in AD 2.2, or "NIL".
- AD2.3 AD Operator: operating hours (e.g. MON-FRI 0700-1530) or "NIL"/"H24".
- AD 2.3 Customs and Immigration: e.g. "NIL", "H24", "H24 Direct transit area".
- AD2.3 ATS: e.g. "NIL", "H24", "AFIS".
- AD2.3 Remarks: or "NIL".
- AD2.6 AD category for fire fighting: e.g. "CAT 9" or short phrase; or "NIL".
- Write all output values in English only. If source text is in another language, translate extracted values to concise English.

Output only valid JSON, no markdown or extra text.
```

---

## User message (template)

Send the model the ICAO from the filename (if known) and the PDF text. Prefer text that starts at AD 2.1 and ends before or shortly after AD 2.7; trim to ~14k characters if the PDF is large.

```
ICAO code from filename: <ICAO>

Extract the airport record from this AD 2 PDF text:

<plain text from PDF>
```

Example:

```
ICAO code from filename: ESGG

Extract the airport record from this AD 2 PDF text:

AD 2.1 AERODROME LOCATION
ESGG GÖTEBORG/LANDVETTER
...
```

---

## API parameters

| Parameter   | Value   | Note |
|------------|---------|------|
| `temperature` | `0.1` | Keeps extraction consistent. |
| `max_tokens`  | `1024` | Enough for one airport JSON. |

---

## Expected output (JSON only)

The model should return **only** a JSON object, for example:

```json
{
  "Airport Code": "ESGG",
  "Airport Name": "GÖTEBORG/LANDVETTER",
  "AD2.2 Types of Traffic Permitted": "IFR/VFR",
  "AD2.2 Remarks": "NIL",
  "AD2.3 AD Operator": "H24",
  "AD 2.3 Customs and Immigration": "H24",
  "AD2.3 ATS": "AFIS",
  "AD2.3 Remarks": "NIL",
  "AD2.6 AD category for fire fighting": "CAT 9"
}
```

If the model wraps the JSON in markdown, strip the code fence and parse the inner `{ ... }`. Empty or missing fields should be `"NIL"`.
