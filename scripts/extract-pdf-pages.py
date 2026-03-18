#!/usr/bin/env python3
"""
Extract and keep only specified pages from a PDF.

Usage:
  python scripts/extract-pdf-pages.py file.pdf --pages 21-30
  python scripts/extract-pdf-pages.py file.pdf --pages 21,22,25,30
  python scripts/extract-pdf-pages.py file.pdf --pages 21-25,27,30 --out extracted.pdf
  python scripts/extract-pdf-pages.py file.pdf --pages 21-30 --overwrite

Pages are 1-based (as shown in PDF viewers).
"""
import argparse
import re
import tempfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def parse_pages(spec: str) -> list[int]:
    """
    Parse a page specification into a sorted list of 1-based page numbers.

    Supports:
      - Ranges: 21-30 → pages 21 through 30
      - Individual: 21,25,30
      - Combined: 21-25,27,30
    """
    result: set[int] = set()
    parts = spec.replace(" ", "").split(",")
    range_re = re.compile(r"^(\d+)-(\d+)$")
    for part in parts:
        m = range_re.match(part)
        if m:
            start, end = int(m.group(1)), int(m.group(2))
            if start > end:
                raise ValueError(f"Invalid range: {part} (start > end)")
            result.update(range(start, end + 1))
        else:
            try:
                result.add(int(part))
            except ValueError:
                raise ValueError(f"Invalid page number: {part}")
    return sorted(result)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract and keep only specified pages from a PDF.",
        epilog="Example: %(prog)s file.pdf --pages 21-30 --out extracted.pdf",
    )
    parser.add_argument("pdf", type=Path, help="Input PDF path")
    parser.add_argument(
        "--pages",
        "-p",
        required=True,
        help="Page numbers: 21-30, 21,25,30, or 21-25,27,30 (1-based)",
    )
    parser.add_argument(
        "--out",
        "-o",
        type=Path,
        help="Output PDF path (default: <basename>-extracted.pdf)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace the input file (writes to temp first)",
    )
    args = parser.parse_args()

    pdf_path = args.pdf.resolve()
    if not pdf_path.exists():
        parser.error(f"File not found: {pdf_path}")

    pages_1based = parse_pages(args.pages)
    if not pages_1based:
        parser.error("--pages must specify at least one page")

    reader = PdfReader(pdf_path)
    total = len(reader.pages)
    for p in pages_1based:
        if p < 1 or p > total:
            parser.error(
                f"Page {p} out of range (PDF has {total} pages, 1-based)"
            )

    writer = PdfWriter()
    for p in pages_1based:
        writer.add_page(reader.pages[p - 1])

    if args.overwrite:
        out_path = Path(tempfile.mktemp(suffix=".pdf"))
        try:
            with open(out_path, "wb") as f:
                writer.write(f)
            out_path.replace(pdf_path)
        finally:
            if out_path.exists():
                out_path.unlink()
        print(f"Kept {len(pages_1based)} pages → {pdf_path} (overwritten)")
    else:
        out_path = args.out or pdf_path.parent / (
            pdf_path.stem + "-extracted" + pdf_path.suffix
        )
        out_path = out_path.resolve()
        with open(out_path, "wb") as f:
            writer.write(f)
        print(f"Kept {len(pages_1based)} pages → {out_path}")


if __name__ == "__main__":
    main()
