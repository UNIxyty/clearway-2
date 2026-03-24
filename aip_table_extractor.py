"""
aip_table_extractor.py
──────────────────────
Drop-in table extractor for AIP PDF documents.

Pipeline slot:  pdf → [AWS Textract for prose] → [THIS for tables] → merged JSON → user

How it works:
  1. Renders each PDF page to an image (pdf2image).
  2. For pages that Textract flagged as containing TABLE blocks,
     sends the page image directly to Claude claude-sonnet-4-20250514.
  3. Claude returns a structured JSON for that table.
  4. Results are merged into your existing Textract output dict.

Install deps:
    pip install anthropic pdf2image pillow
    # also needs poppler:  apt install poppler-utils  /  brew install poppler

Usage:
    from aip_table_extractor import extract_tables_from_pdf, patch_textract_output

    # --- standalone: get tables only ---
    tables = extract_tables_from_pdf("LZPP_AIP_AD2.pdf")

    # --- hybrid: merge into existing Textract output ---
    textract_result = {...}          # your existing Textract dict
    patched = patch_textract_output(textract_result, "LZPP_AIP_AD2.pdf")
"""

import base64
import json
import re
from io import BytesIO
from pathlib import Path
from typing import Any

import anthropic
from pdf2image import convert_from_path
from PIL import Image


# ─── Claude client (uses ANTHROPIC_API_KEY env var) ────────────────────────
_client = anthropic.Anthropic()
MODEL = "claude-sonnet-4-20250514"


# ═══════════════════════════════════════════════════════════════════════════
# Core: send one page image to Claude and get structured JSON back
# ═══════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are a precise aviation document parser specialising in AIP (Aeronautical 
Information Publication) tables.

Rules:
- Return ONLY a valid JSON object — no markdown fences, no commentary.
- Preserve ALL values exactly as printed, including units and slashes (e.g. "PCN 35/F/B/X/T").
- Multi-line cell values (e.g. several slope percentages stacked in one cell) must be 
  returned as a JSON array of strings.
- Merged header cells apply to all columns beneath them — reflect this in the schema.
- If a cell is "NIL" keep it as the string "NIL".
- Top-level key = section identifier from the document (e.g. "AD_2_12_runway_physical_characteristics").
- Each runway is a separate object inside a "runways" array, keyed by "designator".
"""

USER_PROMPT = """Extract every table visible on this page into structured JSON.

For AIP AD 2.12 the expected top-level shape is:

{
  "AD_2_12_runway_physical_characteristics": {
    "runways": [
      {
        "designator": "01",
        "true_bearing_deg": "013.63",
        "dimensions_m": "2000 x 30",
        "strength_pcn_and_surface": "PCN 35/F/B/X/T",
        "surface_material": "concrete/asphalt",
        "thr_coordinates": "483658.98N 0174931.38E",
        "rwy_end_coordinates": null,
        "geoid_undulation_thr_m": "43.3",
        "thr_elevation": "536.0 ft (163.4 m)",
        "tdz_elevation": "537.5 ft (163.8 m)",
        "rwy_slope_pct": ["+0.07", "+0.00", "+0.50", "+0.19", "+0.05", "-0.12"],
        "swy_dimensions_m": ["510", "140", "180", "260", "520", "390"],
        "resa_dimensions_m": "90 x 60",
        "resa_surface": "grass",
        "cwy_dimensions_m": "200 x 150",
        "strip_dimensions_m": "2260 x 150",
        "strip_surface": "grass",
        "ofz": "NIL"
      }
    ]
  }
}

If the page contains other tables (AD 2.13, AD 2.8, etc.) include them too under their own keys.
Return ONLY the JSON object."""


def _image_to_b64(img: Image.Image, fmt: str = "PNG") -> str:
    buf = BytesIO()
    img.save(buf, format=fmt)
    return base64.standard_b64encode(buf.getvalue()).decode()


def _extract_json_from_response(text: str) -> Any:
    """Strip accidental markdown fences and parse JSON."""
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text.strip(), flags=re.MULTILINE)
    return json.loads(text)


def extract_table_from_page_image(img: Image.Image) -> dict:
    """Send a single PIL image to Claude and return parsed JSON."""
    b64 = _image_to_b64(img)
    response = _client.messages.create(
        model=MODEL,
        max_tokens=4096,
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
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": USER_PROMPT},
                ],
            }
        ],
    )
    raw = response.content[0].text
    return _extract_json_from_response(raw)


# ═══════════════════════════════════════════════════════════════════════════
# Page-level helpers
# ═══════════════════════════════════════════════════════════════════════════

def _textract_has_table(page_blocks: list[dict]) -> bool:
    """Return True if Textract found TABLE blocks on this page."""
    return any(b.get("BlockType") == "TABLE" for b in page_blocks)


def _group_textract_blocks_by_page(textract_output: dict) -> dict[int, list[dict]]:
    """Group Textract blocks by 1-based page number."""
    pages: dict[int, list[dict]] = {}
    for block in textract_output.get("Blocks", []):
        p = block.get("Page", 1)
        pages.setdefault(p, []).append(block)
    return pages


# ═══════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════

def extract_tables_from_pdf(
    pdf_path: str | Path,
    pages: list[int] | None = None,
    dpi: int = 200,
) -> dict:
    """
    Extract all tables from a PDF using Claude vision.

    Args:
        pdf_path:  Path to the PDF file.
        pages:     1-based list of page numbers to process.
                   If None, ALL pages are processed.
        dpi:       Rendering resolution (200 is fine for most AIP docs).

    Returns:
        Merged dict of all tables found across pages.
    """
    pdf_path = Path(pdf_path)
    images = convert_from_path(str(pdf_path), dpi=dpi)

    if pages is None:
        pages = list(range(1, len(images) + 1))

    merged: dict = {}
    for page_no in pages:
        img = images[page_no - 1]
        print(f"  → Processing page {page_no}/{len(images)} ...")
        try:
            result = extract_table_from_page_image(img)
            merged.update(result)
        except (json.JSONDecodeError, KeyError) as exc:
            print(f"    ⚠ Could not parse page {page_no}: {exc}")

    return merged


def patch_textract_output(
    textract_output: dict,
    pdf_path: str | Path,
    dpi: int = 200,
) -> dict:
    """
    Replace Textract's TABLE blocks in-place with Claude's structured JSON.

    Only pages that Textract itself flagged as containing tables are
    re-processed — so you keep Textract's prose extraction and only
    fix the broken table parts.

    Returns:
        A copy of textract_output with a new key "claude_tables" containing
        the structured JSON extracted by Claude.
    """
    page_blocks = _group_textract_blocks_by_page(textract_output)
    table_pages = [p for p, blocks in page_blocks.items() if _textract_has_table(blocks)]

    if not table_pages:
        print("No TABLE blocks found in Textract output — nothing to patch.")
        return textract_output

    print(f"Textract found tables on pages: {table_pages}")
    claude_tables = extract_tables_from_pdf(pdf_path, pages=table_pages, dpi=dpi)

    patched = dict(textract_output)
    patched["claude_tables"] = claude_tables
    return patched


# ═══════════════════════════════════════════════════════════════════════════
# CLI — only entry + output wiring for callers (e.g. aip-sync-server.mjs)
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", help="Path to AIP PDF")
    parser.add_argument("--out", required=True, help="Write merged JSON here")
    parser.add_argument("--dpi", type=int, default=200)
    parser.add_argument(
        "--pages",
        default=None,
        help="Comma-separated 1-based page numbers; omit to process every page",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress printing full JSON to stdout",
    )
    args = parser.parse_args()
    pdf = Path(args.pdf)
    pages_list = (
        [int(x.strip()) for x in args.pages.split(",") if x.strip()]
        if args.pages
        else None
    )

    print(f"\nProcessing: {pdf}")
    tables = extract_tables_from_pdf(pdf, pages=pages_list, dpi=args.dpi)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(tables, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Saved → {out_path}")
    if not args.quiet:
        print(json.dumps(tables, ensure_ascii=False, indent=2))