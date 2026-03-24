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
    pip install anthropic pdf2image pillow pymupdf
    # Poppler (required by pdf2image to rasterize PDFs):
    #   Ubuntu/Debian:  sudo apt install poppler-utils python3-pip
    #   macOS:          brew install poppler
    # API: set ANTHROPIC_API_KEY in the environment.

Usage:
    # CLI (also used by scripts/aip-sync-server.mjs):
    python3 aip_table_extractor.py path/to/AD2.pdf --out tables.json --quiet

    from aip_table_extractor import extract_tables_from_pdf, patch_textract_output

    tables = extract_tables_from_pdf("LZPP_AIP_AD2.pdf")

    textract_result = {...}
    patched = patch_textract_output(textract_result, "LZPP_AIP_AD2.pdf")
"""

import argparse
import base64
import json
import re
import time
from io import BytesIO
from pathlib import Path
from typing import Any

import anthropic
from pdf2image import convert_from_path, pdfinfo_from_path
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


def _pdf_page_count(pdf_path: Path) -> int:
    """Total pages in PDF (PyMuPDF if available, else pdf2image pdfinfo)."""
    try:
        import fitz  # pymupdf

        doc = fitz.open(str(pdf_path))
        n = len(doc)
        doc.close()
        return n
    except Exception:
        pass
    info = pdfinfo_from_path(str(pdf_path))
    for key in ("Pages", "pages"):
        if key in info:
            return int(info[key])
    return 1


def guess_ad212_pages(pdf_path: Path) -> list[int] | None:
    """1-based page numbers whose text layer mentions AD 2.12 (runway tables)."""
    try:
        import fitz  # pymupdf
    except ImportError:
        return None
    pattern = re.compile(
        r"(?:AD\s*2\.12|[A-Z]{2,4}\s+2\.12|\b2\.12\s+(?:RUNWAY|RWY))",
        re.IGNORECASE,
    )
    doc = fitz.open(str(pdf_path))
    pages: list[int] = []
    for idx in range(len(doc)):
        if pattern.search(doc[idx].get_text("text")):
            pages.append(idx + 1)
    doc.close()
    return pages if pages else None


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
                   If None, ALL pages are processed (can be slow / costly).
        dpi:       Rendering resolution (200 is fine for most AIP docs).

    Returns:
        Merged dict of all tables found across pages.
    """
    pdf_path = Path(pdf_path)
    total_pages = _pdf_page_count(pdf_path)

    if pages is None:
        pages = list(range(1, total_pages + 1))

    merged: dict = {}
    for page_no in pages:
        if page_no < 1 or page_no > total_pages:
            print(f"    ⚠ Skip invalid page {page_no} (PDF has {total_pages} page(s))")
            continue
        imgs = convert_from_path(
            str(pdf_path), dpi=dpi, first_page=page_no, last_page=page_no
        )
        if not imgs:
            continue
        img = imgs[0]
        print(f"  → Processing page {page_no}/{total_pages} ...")
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
# CLI (used by scripts/aip-sync-server.mjs on EC2)
# ═══════════════════════════════════════════════════════════════════════════


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract AIP tables (e.g. AD 2.12) via Claude vision."
    )
    parser.add_argument("pdf", help="Path to AIP PDF")
    parser.add_argument("--out", required=True, help="Output JSON path")
    parser.add_argument(
        "--dpi", type=int, default=200, help="Rasterization DPI (default 200)"
    )
    parser.add_argument(
        "--pages",
        default=None,
        help="Comma-separated 1-based page numbers. "
        "If omitted, pages mentioning AD 2.12 are detected via text layer (needs pymupdf); "
        "if none found, all pages are processed.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Do not print the final JSON to stdout (progress lines still print)",
    )
    args = parser.parse_args()
    pdf_path = Path(args.pdf)

    pages: list[int] | None = None
    if args.pages:
        pages = [int(x.strip()) for x in args.pages.split(",") if x.strip()]
    else:
        guessed = guess_ad212_pages(pdf_path)
        if guessed:
            pages = guessed
            print(f"  → AD 2.12 candidate page(s) from text scan: {pages}")
        else:
            print(
                "  ⚠ No AD 2.12 pages detected and --pages not set; "
                f"processing all {_pdf_page_count(pdf_path)} page(s)."
            )

    print(f"\nProcessing: {pdf_path}")
    started = time.perf_counter()
    tables = extract_tables_from_pdf(pdf_path, pages=pages, dpi=args.dpi)
    elapsed = time.perf_counter() - started
    tables["extraction_time_seconds"] = round(elapsed, 3)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(tables, f, ensure_ascii=False, indent=2)

    print(f"\n  ✓ Saved → {out_path}")
    print(f"  ⏱ Elapsed: {elapsed:.2f}s")
    if not args.quiet:
        print(json.dumps(tables, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()