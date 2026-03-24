"""
aip-meta-extractor.py
─────────────────────
Extracts specific metadata fields from AIP AD2 documents.
Works with any ICAO-compliant AIP regardless of country format
(LZPP Slovak style, ESSA Swedish style, etc.)

Fields extracted:
  - Publication Date / Amendment ID
  - Airport Code / Name
  - AD2.2: Traffic types, remarks, operator, address, phone, fax, email, AFS, website
  - AD2.3: AD Operator hours, Customs & Immigration, ATS, remarks
  - AD2.6: Fire fighting category
  - AD2.12: Full runway physical characteristics

Usage:
    python3 aip-meta-extractor.py ESSA_AIP_AD2.pdf
    python3 aip-meta-extractor.py LZPP_AIP_AD2.pdf --out result.json

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


# ── Prompts ─────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a precise aviation document parser specialising in AIP 
(Aeronautical Information Publication) AD2 sections.

Rules:
- Return ONLY a valid JSON object — no markdown fences, no commentary.
- If a field is explicitly "NIL" in the document return the string "NIL".
- If a field is not present on this page return null.
- Preserve values exactly as printed, including formatting and line breaks 
  (use \\n for multi-line values).
- For hours of operation preserve the full string including parenthetical UTC offsets.
"""

PROMPT_HEADER_AD22_AD23 = """Extract the following fields from this AIP AD2 page and return 
them as a JSON object with exactly these keys:

{
  "publication_date":          "...",   // date printed at bottom/top of any page, e.g. "22 JAN 2026"
  "amendment_id":              "...",   // e.g. "AIRAC AIP AMDT 1/2026"
  "airport_code":              "...",   // ICAO 4-letter code, e.g. "ESSA"
  "airport_name":              "...",   // e.g. "STOCKHOLM/ARLANDA"
  "ad2_2_types_of_traffic":    "...",   // item 7 in AD2.2
  "ad2_2_remarks":             "...",   // item 8 in AD2.2
  "ad2_2_operator_name":       "...",   // company/org name from item 6
  "ad2_2_address":             "...",   // street + city from item 6
  "ad2_2_telephone":           "...",   // TEL value from item 6
  "ad2_2_telefax":             "...",   // FAX value from item 6 (null if absent)
  "ad2_2_email":               "...",   // e-mail value(s) from item 6, joined with ", " if multiple
  "ad2_2_afs":                 "...",   // AFTN/SITA/AFS lines from item 6, joined with ", "
  "ad2_2_website":             "...",   // website value from item 6
  "ad2_3_ad_operator":         "...",   // item 1 in AD2.3 — full hours string
  "ad2_3_customs_immigration": "...",   // item 2 in AD2.3 — full text
  "ad2_3_ats":                 "...",   // item 7 in AD2.3 — full hours string
  "ad2_3_remarks":             "..."    // last remarks item in AD2.3
}

Return ONLY the JSON object."""

PROMPT_AD26 = """Extract the following fields from this AIP AD2 page and return 
them as a JSON object with exactly these keys:

{
  "ad2_6_fire_fighting_category": "..."   // item 1 in AD2.6, e.g. "CAT 10, 2 fire fighting stations"
}

Return ONLY the JSON object."""

TABLE_SYSTEM_PROMPT = """You are a precise aviation document parser specialising in AIP runway tables.

Rules:
- Return ONLY a valid JSON object — no markdown fences, no commentary.
- Preserve ALL values exactly as printed, including units (ft, m, degrees).
- Multi-line cell values must be returned as a JSON array of strings.
- Use null when a value is not visible or not applicable.
"""

PROMPT_AD212 = """Extract ALL runway data from the AD 2.12 table(s) visible on this page.

Return JSON in this exact shape — include every runway row you can see:

{
  "AD_2_12_runway_physical_characteristics": {
    "runways": [
      {
        "designator":            "01L",
        "true_bearing_deg":      "010.37",
        "dimensions_m":          "3301 x 45",
        "strength_pcn":          "PCN 112/F/A/X/T",
        "surface_material":      "ASPH",
        "thr_coordinates":       "593814.11N 0175447.60E",
        "rwy_end_coordinates":   null,
        "geoid_undulation_ft":   "75.8",
        "thr_elevation_ft":      "98.6",
        "tdz_elevation_ft":      "100.3",
        "rwy_slope":             "See ESSA AOC RWY 01L/19R",
        "swy_dimensions_m":      null,
        "resa_dimensions_m":     "90 x 90",
        "cwy_dimensions_m":      null,
        "strip_dimensions_m":    "3421 x 280",
        "ofz":                   "YES",
        "arresting_system":      null,
        "remarks":               "CLSD due maintenance WED 1000-1200 (0900-1100)"
      }
    ]
  }
}

If AD 2.12 data is not present on this page return:
{"AD_2_12_runway_physical_characteristics": {"runways": []}}

Return ONLY the JSON object."""


# ── Core image helpers ────────────────────────────────────────────────────────

def _page_to_image(doc: fitz.Document, page_no: int, dpi: int = 200) -> Image.Image:
    page = doc[page_no - 1]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def _combine_pages(doc: fitz.Document, page_numbers: list[int], dpi: int) -> Image.Image:
    """Stitch multiple pages vertically into one image."""
    imgs = [_page_to_image(doc, p, dpi) for p in page_numbers]
    total_h = sum(i.height for i in imgs)
    max_w = max(i.width for i in imgs)
    combined = Image.new("RGB", (max_w, total_h), (255, 255, 255))
    y = 0
    for img in imgs:
        combined.paste(img, (0, y))
        y += img.height
    return combined


def _image_to_b64(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.standard_b64encode(buf.getvalue()).decode()


def _strip_fences(text: str) -> str:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    return re.sub(r"\s*```$", "", text.strip(), flags=re.MULTILINE)


def _ask_claude(
    img: Image.Image,
    prompt: str,
    system: str = SYSTEM_PROMPT,
    max_tokens: int = 2048,
) -> dict:
    response = _client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{
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
        }],
    )
    return json.loads(_strip_fences(response.content[0].text))


# ── Dynamic page finders ──────────────────────────────────────────────────────
# FIX: Broad pattern matching both "AD 2.X" (Slovakia) and "ESSA 2.X" (Sweden)
#      and any other country-prefixed format like "EGLL 2.X".

def _find_section_pages(doc: fitz.Document, section_number: str) -> list[int]:
    """
    Find all pages containing a given AD2 section number.

    Matches all known country formats, e.g.:
      "AD 2.12"      — Slovakia, most ICAO states
      "ESSA 2.12"    — Sweden
      "LZPP AD 2.12" — Slovakia verbose
    """
    escaped = re.escape(section_number)
    pattern = re.compile(
        r"(?:"
        r"AD\s*" + escaped +          # "AD 2.12"
        r"|[A-Z]{2,4}\s+" + escaped + # "ESSA 2.12"
        r"|\b" + escaped + r"\s+[A-Z]"# "2.12 RUNWAY"
        r")",
        re.IGNORECASE,
    )
    pages = []
    for idx, page in enumerate(doc):
        if pattern.search(page.get_text("text")):
            pages.append(idx + 1)  # 1-based
    return pages


def _find_header_pages(doc: fitz.Document) -> list[int]:
    """Pages containing AD 2.2 and AD 2.3 (typically page 1)."""
    p22 = _find_section_pages(doc, "2.2")
    p23 = _find_section_pages(doc, "2.3")
    combined = sorted(set(p22) | set(p23))
    return combined[:2] if combined else [1]


def _find_ad26_pages(doc: fitz.Document) -> list[int]:
    """Pages containing AD 2.6 fire fighting info."""
    return _find_section_pages(doc, "2.6")


def _find_ad212_pages(doc: fitz.Document) -> list[int]:
    """All pages that contain AD 2.12 runway table data."""
    return _find_section_pages(doc, "2.12")


# ── Runway extraction ─────────────────────────────────────────────────────────

def _extract_runway_fields(
    doc: fitz.Document,
    dpi: int = 200,
    verbose: bool = True,
) -> dict:
    ad212_pages = _find_ad212_pages(doc)
    if not ad212_pages:
        if verbose:
            print("  ⚠ Could not find AD 2.12 section in text layer")
        return {}

    if verbose:
        print(f"  → Extracting AD 2.12 runway data from page(s) {ad212_pages} ...")

    all_runways: list[dict] = []

    # Process each page individually — the table often spans multiple pages
    for page_no in ad212_pages:
        img = _page_to_image(doc, page_no, dpi=dpi)
        try:
            parsed = _ask_claude(img, PROMPT_AD212, system=TABLE_SYSTEM_PROMPT, max_tokens=4096)
            page_runways = (
                parsed
                .get("AD_2_12_runway_physical_characteristics", {})
                .get("runways", [])
            )
            if page_runways:
                if verbose:
                    print(f"    • Page {page_no}: found {len(page_runways)} runway row(s)")
                all_runways.extend(r for r in page_runways if isinstance(r, dict))
        except (json.JSONDecodeError, KeyError) as exc:
            if verbose:
                print(f"    ⚠ Parse error on page {page_no}: {exc}")

    if not all_runways:
        return {}

    # Deduplicate by designator, keeping first full occurrence
    seen: set[str] = set()
    deduped: list[dict] = []
    for rwy in all_runways:
        key = str(rwy.get("designator", "")).strip().upper()
        if key and key not in seen:
            seen.add(key)
            deduped.append(rwy)
        elif key in seen:
            # Merge non-null fields from later pages into earlier entry
            existing = next(r for r in deduped if str(r.get("designator", "")).upper() == key)
            for field, value in rwy.items():
                if value is not None and existing.get(field) is None:
                    existing[field] = value

    return {
        "ad2_12_runways": deduped,
        "ad2_12_runway_designators": ", ".join(r.get("designator", "") for r in deduped),
        "ad2_12_runway_dimensions": "; ".join(
            f"{r.get('designator', '')}: {r.get('dimensions_m', '')}"
            for r in deduped
            if r.get("dimensions_m")
        ),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def extract_metadata(
    pdf_path: str | Path,
    dpi: int = 200,
    verbose: bool = True,
) -> dict:
    """
    Extract AIP metadata from any ICAO-compliant AD2 PDF.
    Page numbers are detected automatically from the PDF text layer —
    no hardcoded page numbers, works with any country's AIP format.
    """
    pdf_path = Path(pdf_path)
    doc = fitz.open(str(pdf_path))
    result: dict = {}

    # ── AD 2.2 + AD 2.3 ─────────────────────────────────────────────────────
    header_pages = _find_header_pages(doc)
    if verbose:
        print(f"  → Extracting header / AD2.2 / AD2.3 from page(s) {header_pages} ...")
    img = _combine_pages(doc, header_pages, dpi)
    try:
        partial = _ask_claude(img, PROMPT_HEADER_AD22_AD23)
        result.update({k: v for k, v in partial.items() if v is not None})
    except (json.JSONDecodeError, KeyError) as exc:
        if verbose:
            print(f"    ⚠ Parse error: {exc}")

    # ── AD 2.6 ───────────────────────────────────────────────────────────────
    ad26_pages = _find_ad26_pages(doc)
    if ad26_pages:
        if verbose:
            print(f"  → Extracting AD2.6 from page(s) {ad26_pages[:2]} ...")
        img = _combine_pages(doc, ad26_pages[:2], dpi)
        try:
            partial = _ask_claude(img, PROMPT_AD26)
            result.update({k: v for k, v in partial.items() if v is not None})
        except (json.JSONDecodeError, KeyError) as exc:
            if verbose:
                print(f"    ⚠ Parse error: {exc}")
    else:
        if verbose:
            print("  ⚠ Could not find AD 2.6 section")

    # ── AD 2.12 runways ──────────────────────────────────────────────────────
    result.update(_extract_runway_fields(doc, dpi=dpi, verbose=verbose))

    doc.close()

    # Fallback date scrape from text layer
    if not result.get("publication_date"):
        result["publication_date"] = _scrape_date_from_text(pdf_path)

    return result


def _scrape_date_from_text(pdf_path: Path) -> str | None:
    doc = fitz.open(str(pdf_path))
    pattern = re.compile(
        r"\b\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{2,4}\b"
    )
    found = []
    for page in doc:
        found.extend(pattern.findall(page.get_text()))
    doc.close()
    return found[-1] if found else None


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract AIP AD2 metadata fields.")
    parser.add_argument("pdf", help="Path to AIP AD2 PDF file")
    parser.add_argument("--out", default=None, help="Output JSON file path (optional)")
    parser.add_argument("--dpi", type=int, default=200, help="Rendering DPI (default 200)")
    parser.add_argument("--quiet", action="store_true", help="Suppress final JSON print")
    args = parser.parse_args()

    print(f"\nProcessing: {args.pdf}")
    started = time.perf_counter()
    result = extract_metadata(args.pdf, dpi=args.dpi, verbose=True)
    elapsed = time.perf_counter() - started
    result["extraction_time_seconds"] = round(elapsed, 3)

    out_path = args.out or (Path(args.pdf).stem + "_meta.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n  ✓ Saved → {out_path}")
    print(f"  ⏱ Elapsed: {elapsed:.2f}s")
    if not args.quiet:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()