#!/usr/bin/env python3
"""
Offline multilingual PDF to rich JSON extractor.

Design goals:
- Keep extracted information loss as low as possible.
- Prefer native PDF text extraction first.
- Use OCR fallback for scanned pages or low-text pages.
- Keep both native and OCR signals when overlap is ambiguous.
- Emit rich layout metadata (bbox, confidence, tables, language hints).

Dependencies (offline/local):
- pymupdf (fitz)
- pdfplumber
- pillow
- pytesseract

Tesseract OCR binary and language packs must be installed on the host.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = PROJECT_ROOT / "test-results"


def _import_deps() -> tuple[Any, Any, Any, Any]:
    try:
        import fitz  # type: ignore
    except Exception as exc:  # pragma: no cover - import errors are runtime validated
        raise RuntimeError(
            "Missing dependency 'pymupdf'. Install with: python3 -m pip install pymupdf"
        ) from exc
    try:
        import pdfplumber  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Missing dependency 'pdfplumber'. Install with: python3 -m pip install pdfplumber"
        ) from exc
    try:
        from PIL import Image  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Missing dependency 'Pillow'. Install with: python3 -m pip install pillow"
        ) from exc
    try:
        import pytesseract  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Missing dependency 'pytesseract'. Install with: python3 -m pip install pytesseract"
        ) from exc
    return fitz, pdfplumber, Image, pytesseract


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def guess_language_hints(text: str) -> list[str]:
    if not text:
        return []
    scripts: set[str] = set()
    for ch in text:
        cp = ord(ch)
        if 0x0041 <= cp <= 0x024F:
            scripts.add("latin")
        elif 0x0400 <= cp <= 0x052F:
            scripts.add("cyrillic")
        elif 0x0600 <= cp <= 0x06FF:
            scripts.add("arabic")
        elif 0x0900 <= cp <= 0x097F:
            scripts.add("devanagari")
        elif 0x4E00 <= cp <= 0x9FFF:
            scripts.add("han")
        elif 0x3040 <= cp <= 0x30FF:
            scripts.add("kana")
    return sorted(scripts)


def bbox_iou(a: list[float], b: list[float]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0 = max(ax0, bx0)
    iy0 = max(ay0, by0)
    ix1 = min(ax1, bx1)
    iy1 = min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    area_a = max(0.0, (ax1 - ax0) * (ay1 - ay0))
    area_b = max(0.0, (bx1 - bx0) * (by1 - by0))
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()


def conservative_merge_lines(
    native_lines: list[dict[str, Any]],
    ocr_lines: list[dict[str, Any]],
    iou_threshold: float = 0.8,
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for line in native_lines:
        item = dict(line)
        item["source"] = "native"
        merged.append(item)

    for ocr in ocr_lines:
        is_dup = False
        ocr_text = _norm_text(ocr.get("text", ""))
        ocr_bbox = ocr.get("bbox", [0, 0, 0, 0])
        for existing in merged:
            if _norm_text(existing.get("text", "")) != ocr_text:
                continue
            ex_bbox = existing.get("bbox", [0, 0, 0, 0])
            if bbox_iou(ex_bbox, ocr_bbox) >= iou_threshold:
                is_dup = True
                break
        if not is_dup:
            item = dict(ocr)
            item["source"] = "ocr"
            merged.append(item)
    return merged


def build_initial_document(
    source_path: Path,
    page_count: int,
    sha256_hex: str,
    ocr_langs: str,
    dpi: int,
    include_images_metadata: bool,
) -> dict[str, Any]:
    return {
        "source": {
            "path": str(source_path),
            "filename": source_path.name,
            "sha256": sha256_hex,
            "page_count": page_count,
            "extracted_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "engine": {
            "name": "pdf_to_complete_json",
            "ocr_langs": ocr_langs,
            "dpi": dpi,
            "include_images_metadata": include_images_metadata,
        },
        "pages": [],
        "document_text_concat": "",
        "stats": {},
        "warnings": [],
    }


def finalize_document(doc: dict[str, Any]) -> None:
    pages = doc.get("pages", [])
    page_texts = [p.get("raw_text_concat", "") for p in pages]
    doc["document_text_concat"] = "\n\n".join(t for t in page_texts if t)
    total_native = sum(int(p.get("stats", {}).get("native_char_count", 0)) for p in pages)
    total_ocr = sum(int(p.get("stats", {}).get("ocr_char_count", 0)) for p in pages)
    total_tables = sum(int(p.get("stats", {}).get("table_count", 0)) for p in pages)
    low_conf = sum(
        int(p.get("stats", {}).get("low_confidence_ocr_line_count", 0)) for p in pages
    )
    doc["stats"] = {
        "page_count": len(pages),
        "total_native_chars": total_native,
        "total_ocr_chars": total_ocr,
        "total_tables": total_tables,
        "low_confidence_ocr_line_count": low_conf,
        "document_text_chars": len(doc["document_text_concat"]),
    }


@dataclass
class RunConfig:
    input_pdf: Path
    out_json: Path
    ocr_langs: str
    dpi: int
    max_pages: int | None
    include_images_metadata: bool
    pretty: bool
    strict: bool
    ocr_mode: str
    min_native_chars_for_skip_ocr: int
    ocr_confidence_warn_threshold: float
    tesseract_cmd: str | None
    profile: str
    first_page: int
    last_page: int


def extract_text_pages(pdf_path: Path, first_page: int, last_page: int) -> str:
    """
    Extract text for page range using pdftotext when available, with PyMuPDF fallback.
    """
    pdftotext_bin = shutil.which("pdftotext")
    if pdftotext_bin:
        proc = subprocess.run(
            [
                pdftotext_bin,
                "-layout",
                "-f",
                str(first_page),
                "-l",
                str(last_page),
                str(pdf_path),
                "-",
            ],
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0 and proc.stdout:
            return proc.stdout

    # Fallback path: extract lines via PyMuPDF.
    fitz_mod, _, _, _ = _import_deps()
    doc = fitz_mod.open(pdf_path)
    try:
        start = max(1, first_page)
        end = min(last_page, len(doc))
        chunks: list[str] = []
        for p in range(start - 1, end):
            chunks.append(doc[p].get_text("text", sort=True))
        return "\n".join(chunks)
    finally:
        doc.close()


def parse_aip_ad2_from_text(text: str) -> dict[str, Any]:
    """
    Parse high-level AIP AD 2 structured fields from raw extracted text.
    Designed for Russian AIP-style bilingual AD pages.
    """
    lines = text.splitlines()
    clean_lines = [ln.strip() for ln in lines if ln.strip()]

    icao = ""
    for ln in clean_lines:
        m = re.search(r"\b([A-Z]{4})\b", ln)
        if m and m.group(1) not in {"AIP", "AD", "RWY", "IFR", "VFR"}:
            icao = m.group(1)
            break

    ad22: dict[str, Any] = {
        "title": "Aerodrome Geographical and Administrative Data",
    }
    ad23: dict[str, Any] = {"title": "Operational Hours"}

    joined = "\n".join(clean_lines)
    coord_match = re.search(
        r"\b(\d{6}[NS])\s*([0-9]{7}[EW])\b(?:\.?\s*(.*centre of RWY.*))?",
        joined,
        flags=re.I,
    )
    if coord_match:
        ad22["ARP_coordinates"] = {
            "latitude": coord_match.group(1),
            "longitude": coord_match.group(2),
            "position": (coord_match.group(3) or "").strip() or None,
        }

    dir_match = re.search(r"\b\d+(\.\d+)?\s*KM\s+[A-Z]{1,2}\s+of\s+[A-Za-z\- ]+", joined)
    if dir_match:
        ad22["direction_distance_from_city"] = dir_match.group(0).strip()

    elev_match = re.search(r"(\d+)\s*FT\s*/\s*(\d+)\s*M\s*/\s*([\d.]+)\s*°?C", joined, flags=re.I)
    if elev_match:
        ad22["elevation"] = {
            "ft": int(elev_match.group(1)),
            "m": int(elev_match.group(2)),
            "reference_temperature_C": float(elev_match.group(3)),
        }

    if re.search(r"PZ-?90\.?11\s+coordinate\s+system", joined, flags=re.I):
        ad22["coordinate_system"] = "PZ-90.11"

    if re.search(r"Types of traffic permitted.*IFR.*VFR", joined, flags=re.I):
        ad22["types_of_traffic_permitted"] = ["IFR", "VFR"]

    # Operational hours: grab the AD administration line when present.
    admin_match = re.search(
        r"(MON[- ]?FRI[: ]+[0-9]{4}-[0-9]{4}.*?(?:SAT.*?(?:U/S|[0-9]{4}-[0-9]{4})))",
        joined,
        flags=re.I | re.S,
    )
    if admin_match:
        ad23["AD_administration"] = re.sub(r"\s+", " ", admin_match.group(1)).strip()

    return {
        "profile": "aip_ad2",
        "icao": icao or None,
        "sections": {
            "AD_2_2": ad22,
            "AD_2_3": ad23,
        },
        "raw_text_excerpt": "\n".join(clean_lines[:80]),
    }


def _extract_native(page: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    text_dict = page.get_text("dict")
    native_blocks: list[dict[str, Any]] = []
    native_lines: list[dict[str, Any]] = []
    raw_text_fragments: list[str] = []

    for b in text_dict.get("blocks", []):
        if b.get("type") != 0:
            continue
        bbox = [float(x) for x in b.get("bbox", [0, 0, 0, 0])]
        block_lines: list[dict[str, Any]] = []
        for ln in b.get("lines", []):
            ln_bbox = [float(x) for x in ln.get("bbox", [0, 0, 0, 0])]
            spans = []
            span_texts = []
            for sp in ln.get("spans", []):
                sp_text = sp.get("text", "") or ""
                span_texts.append(sp_text)
                spans.append(
                    {
                        "text": sp_text,
                        "bbox": [float(x) for x in sp.get("bbox", [0, 0, 0, 0])],
                        "size": float(sp.get("size", 0.0)),
                        "font": sp.get("font", ""),
                    }
                )
            line_text = "".join(span_texts).strip()
            if line_text:
                native_line = {
                    "text": line_text,
                    "bbox": ln_bbox,
                    "confidence": 1.0,
                    "language_hints": guess_language_hints(line_text),
                    "spans": spans,
                }
                block_lines.append(native_line)
                native_lines.append(native_line)
                raw_text_fragments.append(line_text)
        if block_lines:
            native_blocks.append(
                {
                    "type": "text",
                    "bbox": bbox,
                    "source": "native",
                    "confidence": 1.0,
                    "language_hints": guess_language_hints(" ".join(x["text"] for x in block_lines)),
                    "lines": block_lines,
                }
            )
    raw_native_text = "\n".join(raw_text_fragments)
    return native_blocks, native_lines, raw_native_text


def _extract_tables(pdfplumber_page: Any) -> list[dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    try:
        extracted = pdfplumber_page.extract_tables()
    except Exception:
        return tables
    for idx, tb in enumerate(extracted):
        rows = []
        all_text = []
        for row_idx, row in enumerate(tb or []):
            cells = []
            for col_idx, cell_text in enumerate(row or []):
                txt = (cell_text or "").strip()
                if txt:
                    all_text.append(txt)
                cells.append(
                    {
                        "row": row_idx,
                        "col": col_idx,
                        "text": txt,
                        "bbox": None,
                    }
                )
            rows.append({"row": row_idx, "cells": cells})
        tables.append(
            {
                "table_index": idx,
                "bbox": None,
                "rows": rows,
                "text_concat": "\n".join(all_text),
            }
        )
    return tables


def _extract_images_metadata(page: Any) -> list[dict[str, Any]]:
    images = []
    for img in page.get_images(full=True):
        xref = img[0]
        rects = page.get_image_rects(xref)
        images.append(
            {
                "xref": xref,
                "width": img[2],
                "height": img[3],
                "bboxes": [[float(r.x0), float(r.y0), float(r.x1), float(r.y1)] for r in rects],
            }
        )
    return images


def _extract_ocr_lines(
    page: Any,
    image_cls: Any,
    pytesseract: Any,
    ocr_langs: str,
    dpi: int,
) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    scale = max(1.0, dpi / 72.0)
    fitz_mod = __import__("fitz")
    pix = page.get_pixmap(matrix=fitz_mod.Matrix(scale, scale), alpha=False)
    image = image_cls.frombytes("RGB", [pix.width, pix.height], pix.samples)
    data = pytesseract.image_to_data(
        image,
        lang=ocr_langs,
        output_type=pytesseract.Output.DICT,
        config="--oem 1 --psm 6",
    )
    ocr_lines: list[dict[str, Any]] = []
    grouped: dict[tuple[int, int, int], list[int]] = {}
    n = len(data.get("text", []))
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        key = (
            int(data.get("block_num", [0] * n)[i]),
            int(data.get("par_num", [0] * n)[i]),
            int(data.get("line_num", [0] * n)[i]),
        )
        grouped.setdefault(key, []).append(i)

    page_w = float(page.rect.width)
    page_h = float(page.rect.height)
    for _, idxs in grouped.items():
        words = []
        left = min(int(data["left"][i]) for i in idxs)
        top = min(int(data["top"][i]) for i in idxs)
        right = max(int(data["left"][i]) + int(data["width"][i]) for i in idxs)
        bottom = max(int(data["top"][i]) + int(data["height"][i]) for i in idxs)
        confs = []
        for i in idxs:
            words.append((data["text"][i] or "").strip())
            try:
                c = float(data["conf"][i])
                if c >= 0:
                    confs.append(c)
            except Exception:
                pass
        text = " ".join(w for w in words if w).strip()
        if not text:
            continue
        x0 = left / pix.width * page_w
        y0 = top / pix.height * page_h
        x1 = right / pix.width * page_w
        y1 = bottom / pix.height * page_h
        conf = (sum(confs) / len(confs)) / 100.0 if confs else None
        ocr_lines.append(
            {
                "text": text,
                "bbox": [float(x0), float(y0), float(x1), float(y1)],
                "confidence": conf,
                "language_hints": guess_language_hints(text),
                "spans": [],
            }
        )

    if not ocr_lines:
        warnings.append("OCR produced no text lines on this page.")
    return ocr_lines, warnings


def run_extraction(cfg: RunConfig) -> tuple[dict[str, Any], int]:
    fitz, pdfplumber, image_cls, pytesseract = _import_deps()
    if cfg.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = cfg.tesseract_cmd

    if not cfg.input_pdf.exists():
        raise FileNotFoundError(f"Input PDF not found: {cfg.input_pdf}")

    doc_pdf = fitz.open(cfg.input_pdf)
    plumb_pdf = pdfplumber.open(cfg.input_pdf)
    page_total = len(doc_pdf)
    page_limit = min(page_total, cfg.max_pages) if cfg.max_pages else page_total
    out = build_initial_document(
        source_path=cfg.input_pdf.resolve(),
        page_count=page_total,
        sha256_hex=sha256_file(cfg.input_pdf),
        ocr_langs=cfg.ocr_langs,
        dpi=cfg.dpi,
        include_images_metadata=cfg.include_images_metadata,
    )
    exit_code = 0

    for i in range(page_limit):
        page = doc_pdf[i]
        plumb_page = plumb_pdf.pages[i]
        native_blocks, native_lines, raw_native_text = _extract_native(page)
        tables = _extract_tables(plumb_page)
        table_text_concat = "\n".join(t["text_concat"] for t in tables if t.get("text_concat"))
        page_warnings: list[str] = []

        do_ocr = cfg.ocr_mode == "always" or (
            cfg.ocr_mode == "auto" and len(raw_native_text) < cfg.min_native_chars_for_skip_ocr
        )
        ocr_lines: list[dict[str, Any]] = []
        if do_ocr:
            try:
                ocr_lines, ocr_warnings = _extract_ocr_lines(
                    page=page,
                    image_cls=image_cls,
                    pytesseract=pytesseract,
                    ocr_langs=cfg.ocr_langs,
                    dpi=cfg.dpi,
                )
                page_warnings.extend(ocr_warnings)
            except Exception as exc:
                page_warnings.append(f"OCR failed: {exc}")
                if cfg.strict:
                    exit_code = 2
        merged_lines = conservative_merge_lines(native_lines, ocr_lines)
        page_text = "\n".join(x["text"] for x in merged_lines if x.get("text"))
        if not page_text and raw_native_text:
            page_text = raw_native_text
        if not page_text and table_text_concat:
            page_text = table_text_concat
        if not page_text:
            page_warnings.append("No text extracted from this page.")
            if cfg.strict:
                exit_code = max(exit_code, 3)

        ocr_conf_vals = [x.get("confidence") for x in ocr_lines if x.get("confidence") is not None]
        low_conf_count = sum(
            1
            for c in ocr_conf_vals
            if isinstance(c, float) and c < cfg.ocr_confidence_warn_threshold
        )
        if low_conf_count > 0:
            page_warnings.append(
                f"{low_conf_count} OCR line(s) below confidence {cfg.ocr_confidence_warn_threshold:.2f}."
            )

        blocks: list[dict[str, Any]] = []
        blocks.extend(native_blocks)
        for table in tables:
            blocks.append(
                {
                    "type": "table",
                    "bbox": table.get("bbox"),
                    "source": "table",
                    "confidence": None,
                    "language_hints": guess_language_hints(table.get("text_concat", "")),
                    "rows": table.get("rows", []),
                }
            )
        if ocr_lines:
            blocks.append(
                {
                    "type": "ocr_text",
                    "bbox": None,
                    "source": "ocr",
                    "confidence": (
                        sum(x for x in ocr_conf_vals if isinstance(x, float)) / len(ocr_conf_vals)
                        if ocr_conf_vals
                        else None
                    ),
                    "language_hints": guess_language_hints(" ".join(x["text"] for x in ocr_lines)),
                    "lines": ocr_lines,
                }
            )
        images = _extract_images_metadata(page) if cfg.include_images_metadata else []
        out["pages"].append(
            {
                "page_number": i + 1,
                "width": float(page.rect.width),
                "height": float(page.rect.height),
                "rotation": int(page.rotation),
                "language_hints": guess_language_hints(page_text),
                "raw_text_concat": page_text,
                "blocks": blocks,
                "lines": merged_lines,
                "tables": tables,
                "images": images,
                "warnings": page_warnings,
                "stats": {
                    "native_char_count": len(raw_native_text),
                    "ocr_char_count": sum(len(x.get("text", "")) for x in ocr_lines),
                    "table_count": len(tables),
                    "merged_line_count": len(merged_lines),
                    "ocr_line_count": len(ocr_lines),
                    "low_confidence_ocr_line_count": low_conf_count,
                    "ocr_enabled_for_page": do_ocr,
                },
            }
        )
    doc_pdf.close()
    plumb_pdf.close()

    finalize_document(out)
    for p in out["pages"]:
        out["warnings"].extend(f"page {p['page_number']}: {w}" for w in p.get("warnings", []))

    # Coverage sanity signal: compare total merged text to raw source fallback.
    merged_chars = out["stats"]["document_text_chars"]
    native_chars = out["stats"]["total_native_chars"]
    if native_chars > 0:
        out["stats"]["text_coverage_vs_native"] = round(merged_chars / native_chars, 4)
    else:
        out["stats"]["text_coverage_vs_native"] = None

    if cfg.strict and out["warnings"]:
        exit_code = max(exit_code, 4)

    cfg.out_json.parent.mkdir(parents=True, exist_ok=True)
    with open(cfg.out_json, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2 if cfg.pretty else None)
        if not cfg.pretty:
            f.write("\n")
    return out, exit_code


def run_aip_ad2_profile(cfg: RunConfig) -> tuple[dict[str, Any], int]:
    text = extract_text_pages(cfg.input_pdf, cfg.first_page, cfg.last_page)
    parsed = parse_aip_ad2_from_text(text)
    parsed["source"] = {
        "path": str(cfg.input_pdf.resolve()),
        "first_page": cfg.first_page,
        "last_page": cfg.last_page,
    }
    cfg.out_json.parent.mkdir(parents=True, exist_ok=True)
    with open(cfg.out_json, "w", encoding="utf-8") as f:
        json.dump(parsed, f, ensure_ascii=False, indent=2 if cfg.pretty else None)
        if not cfg.pretty:
            f.write("\n")
    return parsed, 0


def parse_args(argv: list[str]) -> RunConfig:
    p = argparse.ArgumentParser(description="Offline multilingual PDF to rich JSON extractor")
    p.add_argument("input_pdf", type=Path, help="Input PDF path")
    p.add_argument(
        "--out",
        type=Path,
        dest="out_json",
        default=None,
        help="Output JSON path (default: test-results/<input-stem>-complete.json)",
    )
    p.add_argument("--ocr-langs", default="eng", help="Tesseract OCR language packs (e.g. eng+rus)")
    p.add_argument("--dpi", type=int, default=300, help="OCR rendering DPI (default: 300)")
    p.add_argument("--max-pages", type=int, default=None, help="Only process first N pages")
    p.add_argument(
        "--include-images-metadata",
        action="store_true",
        help="Include image xref/size/bbox metadata",
    )
    p.add_argument("--pretty", action="store_true", help="Write indented JSON")
    p.add_argument(
        "--strict",
        action="store_true",
        help="Return non-zero exit code when warnings/completeness issues are detected",
    )
    p.add_argument(
        "--ocr-mode",
        choices=["auto", "always", "off"],
        default="auto",
        help="OCR mode: auto (fallback), always, off",
    )
    p.add_argument(
        "--min-native-chars-for-skip-ocr",
        type=int,
        default=64,
        help="In auto mode, skip OCR when native chars per page >= this threshold",
    )
    p.add_argument(
        "--ocr-confidence-warn-threshold",
        type=float,
        default=0.5,
        help="Warn when OCR line confidence is below this [0..1] threshold",
    )
    p.add_argument(
        "--tesseract-cmd",
        default=None,
        help="Optional path to tesseract binary",
    )
    p.add_argument(
        "--profile",
        choices=["rich_layout", "aip_ad2"],
        default="rich_layout",
        help="Output profile: rich layout JSON or AIP AD2 structured JSON",
    )
    p.add_argument(
        "--first-page",
        type=int,
        default=1,
        help="For aip_ad2 profile: first page to parse (1-based)",
    )
    p.add_argument(
        "--last-page",
        type=int,
        default=3,
        help="For aip_ad2 profile: last page to parse (1-based)",
    )
    ns = p.parse_args(argv)

    out_json = ns.out_json
    if out_json is None:
        out_json = DEFAULT_OUT_DIR / f"{ns.input_pdf.stem}-complete.json"

    return RunConfig(
        input_pdf=ns.input_pdf,
        out_json=out_json,
        ocr_langs=ns.ocr_langs,
        dpi=ns.dpi,
        max_pages=ns.max_pages,
        include_images_metadata=ns.include_images_metadata,
        pretty=ns.pretty,
        strict=ns.strict,
        ocr_mode=ns.ocr_mode,
        min_native_chars_for_skip_ocr=ns.min_native_chars_for_skip_ocr,
        ocr_confidence_warn_threshold=ns.ocr_confidence_warn_threshold,
        tesseract_cmd=ns.tesseract_cmd,
        profile=ns.profile,
        first_page=ns.first_page,
        last_page=ns.last_page,
    )


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    cfg = parse_args(argv)
    try:
        if cfg.profile == "aip_ad2":
            result, code = run_aip_ad2_profile(cfg)
        else:
            result, code = run_extraction(cfg)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if cfg.profile == "aip_ad2":
        summary = {
            "profile": cfg.profile,
            "input": str(cfg.input_pdf),
            "output": str(cfg.out_json),
            "icao": result.get("icao"),
            "sections": list(result.get("sections", {}).keys()),
            "strict_exit_code": code,
        }
    else:
        summary = {
            "profile": cfg.profile,
            "input": str(cfg.input_pdf),
            "output": str(cfg.out_json),
            "pages_processed": result["stats"].get("page_count"),
            "total_native_chars": result["stats"].get("total_native_chars"),
            "total_ocr_chars": result["stats"].get("total_ocr_chars"),
            "total_tables": result["stats"].get("total_tables"),
            "warnings": len(result.get("warnings", [])),
            "strict_exit_code": code,
        }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
