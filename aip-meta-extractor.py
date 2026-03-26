"""
aip_meta_extractor.py
─────────────────────
Extracts metadata fields from AIP AD2 documents.

Supports any ICAO-compliant AIP format:
  • Slovak  (LZPP) — "LZPP AD 2.X" headers
  • Swedish (ESSA) — "ESSA 2.X" headers
  • Danish  (EKRK) — "AD 2 EKRK X-X" / EAD format
  • Any other national AIP following ICAO Annex 15

Detection strategy (3 phases, in order):
  Phase 1 — Free:  regex scan of the PDF text layer
  Phase 2 — Cheap: send page 1 image to Claude → identify format + section pages
  Phase 3 — Brute: scan pages 1-N with Claude when phases 1+2 both fail

Usage:
    python3 aip_meta_extractor.py EKRK.pdf
    python3 aip_meta_extractor.py ESSA_AIP_AD2.pdf --out result.json
    python3 aip_meta_extractor.py LZPP_AIP_AD2.pdf --dpi 150 --quiet

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
from typing import Optional

import anthropic
import fitz  # pymupdf
from PIL import Image


_client = anthropic.Anthropic()
MODEL = "claude-sonnet-4-20250514"
MAX_BRUTE_FORCE_PAGES = 6   # pages to scan when all detection fails


# ═══════════════════════════════════════════════════════════════════════════════
# Prompts
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are a precise aviation document parser specialising in AIP
(Aeronautical Information Publication) AD2 sections.
Rules:
- Return ONLY valid JSON — no markdown fences, no commentary.
- If a field is explicitly "NIL" in the document, return the string "NIL".
- If a field is not present on this page, return null.
- Preserve values exactly as printed; use \\n for multi-line cell values.
- For operational hours keep the full string including UTC offsets in parentheses.
"""

DISCOVERY_PROMPT = """This is page 1 (possibly also page 2) of an aeronautical AIP AD2 document.

Identify the airport and tell me on which page number each section begins.
If a section starts on this very image say 1.  If you cannot find it say null.

Return ONLY this JSON object:
{
  "airport_code":   "...",
  "airport_name":   "...",
  "format_hint":    "...",
  "page_ad2_2":     1,
  "page_ad2_3":     1,
  "page_ad2_6":     null,
  "page_ad2_12":    null
}"""

PROMPT_METADATA = """Extract the following fields from this AIP AD2 content.
The document may use any national formatting convention — look for the fields
regardless of the exact layout or heading style.

Return a JSON object with exactly these keys (null for any missing field):
{
  "publication_date":          "...",
  "amendment_id":              "...",
  "airport_code":              "...",
  "airport_name":              "...",
  "ad2_2_types_of_traffic":    "...",
  "ad2_2_remarks":             "...",
  "ad2_2_operator_name":       "...",
  "ad2_2_address":             "...",
  "ad2_2_telephone":           "...",
  "ad2_2_telefax":             "...",
  "ad2_2_email":               "...",
  "ad2_2_afs":                 "...",
  "ad2_2_website":             "...",
  "ad2_3_ad_operator":         "...",
  "ad2_3_customs_immigration": "...",
  "ad2_3_ats":                 "...",
  "ad2_3_remarks":             "..."
}

Return ONLY the JSON object."""

PROMPT_AD26 = """Extract the aerodrome fire fighting category from section AD 2.6 on this page.

Return ONLY:
{
  "ad2_6_fire_fighting_category": "..."
}"""

SYSTEM_TABLE = """You are a precise aviation document parser specialising in AIP runway tables.
Rules:
- Return ONLY valid JSON — no markdown fences, no commentary.
- Preserve all values exactly as printed (units, slashes, degrees symbols).
- Multi-line stacked cell values → JSON array of strings.
- Missing / N/A values → null.
"""

PROMPT_AD212 = """Extract ALL runway rows from the AD 2.12 table(s) on this page.

Return this exact shape (include every runway row visible):
{
  "AD_2_12_runway_physical_characteristics": {
    "runways": [
      {
        "designator":          "01L",
        "true_bearing_deg":    "010.37",
        "dimensions_m":        "3301 x 45",
        "strength_pcn":        "PCN 112/F/A/X/T",
        "surface_material":    "ASPH",
        "thr_coordinates":     "593814.11N 0175447.60E",
        "rwy_end_coordinates": null,
        "geoid_undulation":    "75.8 ft",
        "thr_elevation":       "98.6 ft",
        "tdz_elevation":       "100.3 ft",
        "rwy_slope":           "See AOC RWY 01L/19R",
        "swy_dimensions_m":    null,
        "resa_dimensions_m":   "90 x 90",
        "cwy_dimensions_m":    null,
        "strip_dimensions_m":  "3421 x 280",
        "ofz":                 "YES",
        "arresting_system":    null,
        "remarks":             "CLSD WED 1000-1200"
      }
    ]
  }
}

If no AD 2.12 data is visible: {"AD_2_12_runway_physical_characteristics":{"runways":[]}}
Return ONLY the JSON object."""


# ═══════════════════════════════════════════════════════════════════════════════
# Image helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _page_to_image(doc: fitz.Document, page_no: int, dpi: int = 200) -> Image.Image:
    page = doc[page_no - 1]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def _combine_pages(doc: fitz.Document, page_numbers: list[int], dpi: int) -> Image.Image:
    imgs = [_page_to_image(doc, p, dpi) for p in page_numbers]
    total_h = sum(i.height for i in imgs)
    max_w = max(i.width for i in imgs)
    canvas = Image.new("RGB", (max_w, total_h), (255, 255, 255))
    y = 0
    for img in imgs:
        canvas.paste(img, (0, y))
        y += img.height
    return canvas


def _b64(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.standard_b64encode(buf.getvalue()).decode()


def _strip_fences(text: str) -> str:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    return re.sub(r"\s*```$", "", text.strip(), flags=re.MULTILINE)


def _ask(
    img: Image.Image,
    prompt: str,
    system: str = SYSTEM_PROMPT,
    max_tokens: int = 2048,
) -> dict:
    resp = _client.messages.create(
        model=MODEL, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": _b64(img)}},
            {"type": "text", "text": prompt},
        ]}],
    )
    return json.loads(_strip_fences(resp.content[0].text))


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 1 — Text-layer scan
# Covers all known naming conventions across national AIP publishers.
# ═══════════════════════════════════════════════════════════════════════════════

def _build_pattern(section: str) -> re.Pattern:
    e = re.escape(section)
    sub = re.escape(section.split(".")[-1])   # "12" from "2.12"
    return re.compile(
        r"(?:"
        r"AD\s*" + e +                           # "AD 2.12"
        r"|[A-Z]{2,4}\s+AD\s*" + e +             # "LZPP AD 2.12"
        r"|[A-Z]{2,4}\s+" + e + r"(?:\s|$)" +    # "ESSA 2.12 "
        r"|AD\s+2\s+[A-Z]{2,4}.*?1\s*[-–]\s*" + sub +  # "AD 2 EKRK 1-12"
        r"|\b" + e + r"\s+[A-Z]"                 # "2.12 RUNWAY"
        r")",
        re.IGNORECASE,
    )


_PAT = {s: _build_pattern(s) for s in ("2.2", "2.3", "2.6", "2.12")}


def _text_scan(doc: fitz.Document) -> dict[str, list[int]]:
    found: dict[str, list[int]] = {s: [] for s in _PAT}
    for idx, page in enumerate(doc):
        text = page.get_text("text")
        for section, pat in _PAT.items():
            if pat.search(text):
                found[section].append(idx + 1)
    return found


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2 — Claude discovery
# ═══════════════════════════════════════════════════════════════════════════════

def _claude_discovery(doc: fitz.Document, dpi: int, verbose: bool) -> dict:
    pages = [1] + ([2] if len(doc) >= 2 else [])
    if verbose:
        print(f"  → Phase 2: Claude discovery on page(s) {pages} ...")
    img = _combine_pages(doc, pages, dpi)
    try:
        r = _ask(img, DISCOVERY_PROMPT, max_tokens=512)
        if verbose:
            print(f"    format={r.get('format_hint')}  "
                  f"AD2.2→p{r.get('page_ad2_2')}  "
                  f"AD2.6→p{r.get('page_ad2_6')}  "
                  f"AD2.12→p{r.get('page_ad2_12')}")
        return r
    except (json.JSONDecodeError, KeyError, Exception) as exc:
        if verbose:
            print(f"    ⚠ Discovery failed: {exc}")
        return {}


# ═══════════════════════════════════════════════════════════════════════════════
# PageMap — unified resolver
# ═══════════════════════════════════════════════════════════════════════════════

class PageMap:
    _DISC_KEYS = {"2.2": "page_ad2_2", "2.3": "page_ad2_3",
                  "2.6": "page_ad2_6", "2.12": "page_ad2_12"}

    def __init__(self, doc: fitz.Document, dpi: int, verbose: bool):
        self._n = len(doc)
        self._text = _text_scan(doc)

        if verbose:
            for k, v in self._text.items():
                status = f"pages {v}" if v else "(not found)"
                print(f"    Section {k} → {status}")

        # Only run Phase 2 when Phase 1 found nothing at all
        nothing_found = not any(self._text.values())
        self._disc = _claude_discovery(doc, dpi, verbose) if nothing_found else {}

    def _clamp(self, pages: list[int]) -> list[int]:
        return [p for p in pages if 1 <= p <= self._n]

    def get(self, section: str, fallback: list[int]) -> list[int]:
        if self._text.get(section):
            return self._clamp(self._text[section])
        key = self._DISC_KEYS.get(section)
        if key and isinstance(self._disc.get(key), int):
            return self._clamp([self._disc[key]])
        return self._clamp(fallback)


# ═══════════════════════════════════════════════════════════════════════════════
# Extractors
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_metadata(doc, pm: PageMap, dpi: int, verbose: bool) -> dict:
    p22 = pm.get("2.2", [1])
    p23 = pm.get("2.3", [1])
    pages = sorted(set(p22) | set(p23))[:3]
    if verbose:
        print(f"  → Metadata (AD2.2+AD2.3) from page(s) {pages} ...")
    try:
        return _ask(_combine_pages(doc, pages, dpi), PROMPT_METADATA)
    except Exception as exc:
        if verbose:
            print(f"    ⚠ {exc}")
        return {}


def _extract_ad26(doc, pm: PageMap, dpi: int, verbose: bool) -> dict:
    pages = pm.get("2.6", [])
    if not pages:
        # Phase 3 brute-force: try early pages (AD2.6 is never past page 6)
        pages = list(range(2, min(MAX_BRUTE_FORCE_PAGES + 1, len(doc) + 1)))
        if verbose:
            print(f"  → AD2.6: brute-force pages {pages} ...")
    else:
        pages = pages[:2]
        if verbose:
            print(f"  → AD2.6 from page(s) {pages} ...")
    try:
        return _ask(_combine_pages(doc, pages[:3], dpi), PROMPT_AD26)
    except Exception as exc:
        if verbose:
            print(f"    ⚠ {exc}")
        return {}


def _extract_runways(doc, pm: PageMap, dpi: int, verbose: bool) -> dict:
    pages = pm.get("2.12", [])
    if not pages:
        # Phase 3: runway tables never appear on pages 1-3
        pages = list(range(4, min(12, len(doc) + 1)))
        if verbose:
            print(f"  → AD2.12: brute-force pages {pages} ...")
    else:
        if verbose:
            print(f"  → AD2.12 from page(s) {pages} ...")

    all_runways: list[dict] = []
    for pno in pages:
        try:
            parsed = _ask(_page_to_image(doc, pno, dpi), PROMPT_AD212,
                          system=SYSTEM_TABLE, max_tokens=4096)
            rwy_list = (parsed
                        .get("AD_2_12_runway_physical_characteristics", {})
                        .get("runways", []))
            if rwy_list:
                if verbose:
                    print(f"    • Page {pno}: {len(rwy_list)} row(s)")
                all_runways.extend(r for r in rwy_list if isinstance(r, dict))
        except Exception as exc:
            if verbose:
                print(f"    ⚠ Page {pno}: {exc}")

    if not all_runways:
        return {}

    # Deduplicate + merge across pages
    seen: dict[str, dict] = {}
    for rwy in all_runways:
        key = str(rwy.get("designator", "")).strip().upper()
        if not key:
            continue
        if key not in seen:
            seen[key] = dict(rwy)
        else:
            for f, v in rwy.items():
                if v is not None and seen[key].get(f) is None:
                    seen[key][f] = v

    deduped = list(seen.values())
    return {
        "ad2_12_runways": deduped,
        "ad2_12_runway_designators": ", ".join(r.get("designator", "") for r in deduped),
        "ad2_12_runway_dimensions": "; ".join(
            f"{r.get('designator','')}: {r.get('dimensions_m','')}"
            for r in deduped if r.get("dimensions_m")
        ),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PDF path resolution (server-safe loading)
# ═══════════════════════════════════════════════════════════════════════════════

def _resolve_pdf_path(pdf_path: str | Path) -> Path:
    """
    Resolve input PDF path robustly for server execution.
    Supports:
      - absolute paths
      - relative paths from cwd
      - basename lookup in known server download folders
    """
    raw = Path(pdf_path).expanduser()
    if raw.exists():
        return raw.resolve()

    candidate = Path.cwd() / raw
    if candidate.exists():
        return candidate.resolve()

    basename = raw.name
    search_roots = [
        Path.cwd() / "data" / "ead-aip",
        Path.cwd() / "aips",
        Path.cwd() / "downloads" / "rus-aip" / "by-icao",
    ]
    for root in search_roots:
        if not root.exists():
            continue
        if root.is_dir():
            match = next(root.rglob(basename), None)
            if match and match.exists():
                return match.resolve()

    raise FileNotFoundError(f"PDF not found: {pdf_path}")


# ═══════════════════════════════════════════════════════════════════════════════
# Date fallback
# ═══════════════════════════════════════════════════════════════════════════════

def _scrape_date(pdf_path: Path) -> Optional[str]:
    resolved = _resolve_pdf_path(pdf_path)
    doc = fitz.open(str(resolved))
    pat = re.compile(
        r"\b\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{2,4}\b",
        re.IGNORECASE,
    )
    found = [m for page in doc for m in pat.findall(page.get_text())]
    doc.close()
    return found[-1].upper() if found else None


# ═══════════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════════

def extract_metadata(
    pdf_path: str | Path,
    dpi: int = 200,
    verbose: bool = True,
) -> dict:
    """
    Extract AIP AD2 metadata from any ICAO-compliant national AIP PDF.

    Automatically handles Slovak, Swedish, Danish EAD, and other formats.
    Falls back progressively from text-scan → Claude discovery → brute-force.
    """
    pdf_path = _resolve_pdf_path(pdf_path)
    doc = fitz.open(str(pdf_path))

    if verbose:
        print(f"\n  File: {pdf_path.name}  ({len(doc)} pages)")
        print("  Phase 1: text-layer scan ...")

    pm = PageMap(doc, dpi=dpi, verbose=verbose)
    result: dict = {}

    meta = _extract_metadata(doc, pm, dpi, verbose)
    result.update({k: v for k, v in meta.items() if v is not None})

    ad26 = _extract_ad26(doc, pm, dpi, verbose)
    result.update({k: v for k, v in ad26.items() if v is not None})

    result.update(_extract_runways(doc, pm, dpi, verbose))

    doc.close()

    if not result.get("publication_date"):
        result["publication_date"] = _scrape_date(pdf_path)

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(
        description="Extract AIP AD2 metadata — works with any national AIP format."
    )
    ap.add_argument("pdf", help="AIP AD2 PDF file")
    ap.add_argument("--out",   default=None, help="Output JSON path")
    ap.add_argument("--dpi",   type=int, default=200, help="Render DPI (default 200)")
    ap.add_argument("--quiet", action="store_true", help="Suppress final JSON echo")
    args = ap.parse_args()

    started = time.perf_counter()
    result  = extract_metadata(args.pdf, dpi=args.dpi, verbose=True)
    elapsed = time.perf_counter() - started
    result["extraction_time_seconds"] = round(elapsed, 3)

    out = args.out or (Path(args.pdf).stem + "_meta.json")
    Path(out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n  ✓ Saved  → {out}")
    print(f"  ⏱ Elapsed: {elapsed:.2f}s")
    if not args.quiet:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()