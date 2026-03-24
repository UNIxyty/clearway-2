"""
aip_meta_extractor.py
─────────────────────
Extracts specific metadata fields from AIP AD2 documents.

Fields extracted:
  - Publication Date
  - Airport Code / Name
  - AD2.2: Traffic types, remarks, operator, address, phone, fax, email, AFS, website
  - AD2.3: AD Operator hours, Customs & Immigration, ATS, remarks
  - AD2.6: Fire fighting category

Usage:
    python3 aip_meta_extractor.py LZPP_AIP_AD2.pdf
    python3 aip_meta_extractor.py LZPP_AIP_AD2.pdf --out result.json

Install deps:
    pip install anthropic pymupdf pillow
"""

import argparse
import base64
import json
import re
import time
from io import BytesIO
from pathlib import Path

import anthropic
import fitz  # pymupdf
from PIL import Image


_client = anthropic.Anthropic()
MODEL = "claude-sonnet-4-20250514"


# ── Page mapping ────────────────────────────────────────────────────────────
# Each section lives on predictable pages in ICAO AIP AD2 documents.
# We send the minimum pages needed to Claude to keep it fast and cheap.
# Key = logical group name, value = list of 1-based page numbers to send.
SECTION_PAGES = {
    "header_and_ad2_2": [1],   # Publication date, airport code/name, AD2.2 block
    "ad2_3":            [1],   # AD2.3 operational hours (often on page 1 too)
    "ad2_6":            [3],   # Rescue & fire fighting
}


# ── Prompts ─────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a precise aviation document parser specialising in AIP 
(Aeronautical Information Publication) AD2 sections.

Rules:
- Return ONLY a valid JSON object — no markdown fences, no commentary.
- If a field is explicitly "NIL" in the document return the string "NIL".
- If a field is not present on this page return null.
- Preserve values exactly as printed, including formatting and line breaks 
  (use \\n for multi-line values).
- For hours of operation preserve the full string including parenthetical UTC offsets,
  e.g. "MON-FRI: 0715-1900 (0615-1800)".
"""

PROMPTS = {
    "header_and_ad2_2": """Extract the following fields from this AIP AD2 page and return 
them as a JSON object with exactly these keys:

{
  "publication_date":          "...",   // date printed at bottom of any page, e.g. "22 JAN 26"
  "amendment_id":              "...",   // e.g. "AIP AMDT 01/26"
  "airport_code":              "...",   // ICAO 4-letter code, e.g. "LZPP"
  "airport_name":              "...",   // e.g. "PIEŠŤANY"
  "ad2_2_types_of_traffic":    "...",   // item 7 in AD2.2, e.g. "IFR/VFR, day/night"
  "ad2_2_remarks":             "...",   // item 8 in AD2.2
  "ad2_2_operator_name":       "...",   // company/org name from item 6
  "ad2_2_address":             "...",   // street + city from item 6
  "ad2_2_telephone":           "...",   // TEL value from item 6
  "ad2_2_telefax":             "...",   // FAX value from item 6 (null if absent)
  "ad2_2_email":               "...",   // e-mail value(s) from item 6, joined with ", " if multiple
  "ad2_2_afs":                 "...",   // AFTN/SITA lines from item 6, joined with ", "
  "ad2_2_website":             "...",   // web: value from item 6
  "ad2_3_ad_operator":         "...",   // item 1 in AD2.3 — full hours string
  "ad2_3_customs_immigration": "...",   // item 2 in AD2.3 — full text
  "ad2_3_ats":                 "..."    // item 7 in AD2.3 — full hours string
}

Return ONLY the JSON object.""",

    "ad2_6": """Extract the following fields from this AIP AD2 page and return 
them as a JSON object with exactly these keys:

{
  "ad2_6_fire_fighting_category": "...",  // item 1 in AD2.6, e.g. "CAT 4: OPR HR as AD Administration."
  "ad2_3_remarks":                "..."   // item 8 in AD2.3 if visible on this page, else null
}

Return ONLY the JSON object.""",
}

# Table extraction prompt for AD 2.12 runway data.
TABLE_SYSTEM_PROMPT = """You are a precise aviation document parser specialising in AIP runway tables.

Rules:
- Return ONLY a valid JSON object — no markdown fences, no commentary.
- Preserve values exactly as printed.
- Use null when a value is not visible.
"""

TABLE_USER_PROMPT = """Extract AD 2.12 runway physical characteristics from this page.

Return JSON in this shape:
{
  "AD_2_12_runway_physical_characteristics": {
    "runways": [
      {
        "designator": "01",
        "dimensions_m": "2000 x 30"
      }
    ]
  }
}

If AD 2.12 is not present, return:
{
  "AD_2_12_runway_physical_characteristics": {
    "runways": []
  }
}
"""


# ── Core helpers ─────────────────────────────────────────────────────────────

def _page_to_image(doc: fitz.Document, page_no: int, dpi: int = 200) -> Image.Image:
    page = doc[page_no - 1]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def _image_to_b64(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.standard_b64encode(buf.getvalue()).decode()


def _strip_fences(text: str) -> str:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    return re.sub(r"\s*```$", "", text.strip(), flags=re.MULTILINE)


def _ask_claude(img: Image.Image, prompt: str) -> dict:
    response = _client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": _image_to_b64(img),
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )
    return json.loads(_strip_fences(response.content[0].text))

def _ask_claude_table(img: Image.Image) -> dict:
    response = _client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=TABLE_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": _image_to_b64(img),
                        },
                    },
                    {"type": "text", "text": TABLE_USER_PROMPT},
                ],
            }
        ],
    )
    return json.loads(_strip_fences(response.content[0].text))


def _find_ad2_12_pages(doc: fitz.Document) -> list[int]:
    pages: list[int] = []
    for idx, page in enumerate(doc):
        text = page.get_text("text")
        if re.search(r"\bAD\s*2\.12\b", text, flags=re.IGNORECASE):
            pages.append(idx + 1)  # 1-based
    return pages


def _extract_runway_fields_from_tables(doc: fitz.Document, dpi: int = 200) -> dict:
    ad2_12_pages = _find_ad2_12_pages(doc)
    if not ad2_12_pages:
        return {}

    print(f"  → Extracting 'ad2_12_tables' from page(s) {ad2_12_pages} ...")
    runways: list[dict] = []
    for page_no in ad2_12_pages:
        img = _page_to_image(doc, page_no, dpi=dpi)
        try:
            parsed = _ask_claude_table(img)
        except (json.JSONDecodeError, KeyError) as exc:
            print(f"    ⚠ Table parse error on page {page_no}: {exc}")
            continue

        section = parsed.get("AD_2_12_runway_physical_characteristics", {})
        page_runways = section.get("runways", [])
        if isinstance(page_runways, list):
            runways.extend([r for r in page_runways if isinstance(r, dict)])

    if not runways:
        return {}

    # Keep first seen runway by designator.
    seen = set()
    deduped: list[dict] = []
    for runway in runways:
        designator = str(runway.get("designator") or "").strip()
        if not designator:
            continue
        key = designator.upper()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(runway)

    if not deduped:
        return {}

    runway_numbers = ", ".join(str(r.get("designator", "")).strip() for r in deduped if r.get("designator"))
    runway_dimensions = "; ".join(
        f"{str(r.get('designator', '')).strip()}: {str(r.get('dimensions_m', '')).strip()}"
        for r in deduped
        if r.get("designator") and r.get("dimensions_m")
    )

    out: dict = {"ad2_12_runways": deduped}
    if runway_numbers:
        out["ad2_12_runway_number"] = runway_numbers
    if runway_dimensions:
        out["ad2_12_runway_dimensions"] = runway_dimensions
    return out


# ── Multi-page combiner ───────────────────────────────────────────────────────

def _combine_pages(doc: fitz.Document, page_numbers: list[int], dpi: int) -> Image.Image:
    """Stitch multiple pages vertically into one image for a single Claude call."""
    imgs = [_page_to_image(doc, p, dpi) for p in page_numbers]
    total_h = sum(i.height for i in imgs)
    max_w = max(i.width for i in imgs)
    combined = Image.new("RGB", (max_w, total_h), (255, 255, 255))
    y = 0
    for img in imgs:
        combined.paste(img, (0, y))
        y += img.height
    return combined


# ── Public API ────────────────────────────────────────────────────────────────

def extract_metadata(pdf_path: str | Path, dpi: int = 200) -> dict:
    """
    Extract AIP metadata fields from a PDF.

    Returns a flat dict with all fields listed in the module docstring.
    """
    pdf_path = Path(pdf_path)
    doc = fitz.open(str(pdf_path))
    total_pages = len(doc)
    result: dict = {}

    for group, pages in SECTION_PAGES.items():
        # Clamp pages to actual document length
        valid_pages = [p for p in pages if 1 <= p <= total_pages]
        if not valid_pages:
            print(f"  ⚠ Skipping '{group}' — pages {pages} out of range (doc has {total_pages})")
            continue

        prompt_key = "ad2_6" if group == "ad2_6" else "header_and_ad2_2"
        prompt = PROMPTS[prompt_key]

        print(f"  → Extracting '{group}' from page(s) {valid_pages} ...")
        img = _combine_pages(doc, valid_pages, dpi)

        try:
            partial = _ask_claude(img, prompt)
            # Merge; later groups can overwrite earlier ones for shared keys
            result.update({k: v for k, v in partial.items() if v is not None})
        except (json.JSONDecodeError, KeyError) as exc:
            print(f"    ⚠ Parse error for '{group}': {exc}")

    # AD 2.12 runway extraction (table-aware).
    runway_fields = _extract_runway_fields_from_tables(doc, dpi=dpi)
    if runway_fields:
        result.update(runway_fields)

    doc.close()

    # ── Post-process: pull publication_date from text layer as fallback ──────
    if "publication_date" not in result or result.get("publication_date") is None:
        result["publication_date"] = _scrape_date_from_text(pdf_path)

    return result


def _scrape_date_from_text(pdf_path: Path) -> str | None:
    """Fallback: grab the last date stamp from the PDF text layer."""
    doc = fitz.open(str(pdf_path))
    date_pattern = re.compile(r"\b\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{2,4}\b")
    found = []
    for page in doc:
        found.extend(date_pattern.findall(page.get_text()))
    doc.close()
    return found[-1] if found else None


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract AIP AD2 metadata fields.")
    parser.add_argument("pdf", help="Path to AIP AD2 PDF file")
    parser.add_argument("--out", default=None, help="Output JSON file path (optional)")
    parser.add_argument("--dpi", type=int, default=200, help="Rendering DPI (default 200)")
    args = parser.parse_args()

    print(f"\nProcessing: {args.pdf}")
    started = time.perf_counter()
    result = extract_metadata(args.pdf, dpi=args.dpi)
    elapsed = time.perf_counter() - started
    result["extraction_time_seconds"] = round(elapsed, 3)

    out_path = args.out or (Path(args.pdf).stem + "_meta.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Saved → {out_path}")
    print(f"⏱ Time consumed: {elapsed:.2f}s")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()