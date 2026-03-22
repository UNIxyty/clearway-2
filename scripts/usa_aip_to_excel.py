#!/usr/bin/env python3
"""
1. Trim USA AIP PDF: remove all pages before the first airport (keep from page 833 onward).
2. Export airport data to XLSX for easier extraction.
"""
import re
from pathlib import Path

import pdfplumber
from openpyxl import Workbook
from pypdf import PdfReader, PdfWriter

PROJECT = Path(__file__).resolve().parent.parent
PDF_PATH = PROJECT / "usa aip.pdf"
TRIMMED_PDF = PROJECT / "usa-aip-airports-only.pdf"
XLSX_PATH = PROJECT / "data" / "usa-aip-airports.xlsx"

# First airport (PANC) starts on 1-based page 833 → 0-based index 832
FIRST_AIRPORT_PAGE_0 = 832


def trim_pdf():
    """Write a new PDF containing only pages from first airport to end."""
    reader = PdfReader(PDF_PATH)
    writer = PdfWriter()
    for i in range(FIRST_AIRPORT_PAGE_0, len(reader.pages)):
        writer.add_page(reader.pages[i])
    with open(TRIMMED_PDF, "wb") as f:
        writer.write(f)
    print(f"Trimmed PDF: {len(reader.pages) - FIRST_AIRPORT_PAGE_0} pages → {TRIMMED_PDF}")


def extract_airports_to_xlsx():
    """Extract AD 2.2, 2.3, 2.6 and ICAO/name from PDF and write one row per airport to Excel."""
    text_chunks = []
    with pdfplumber.open(PDF_PATH) as pdf:
        for i in range(FIRST_AIRPORT_PAGE_0, min(FIRST_AIRPORT_PAGE_0 + 400, len(pdf.pages))):
            t = pdf.pages[i].extract_text(layout=False)
            if t:
                text_chunks.append(t)
    full_text = "\n".join(text_chunks)

    # Split by ICAO Identifier and parse each block
    blocks = re.split(r"\s+ICAO\s+Identifier\s+", full_text, flags=re.I)
    icao_pat = re.compile(r"^([A-Z0-9]{4})\s*", re.I)
    traffic_pat = re.compile(r"2\.2\.7\s+Traffic:\s*([A-Za-z/]+)")
    remarks22_pat = re.compile(r"2\.2\.8\s+Remarks:\s*([^\n]+?)(?=\s*2\.2\.|\s*AD\s+2\.|$)")
    ophours_pat = re.compile(r"2\.3\.1\s*−\s*2\.3\.11:\s*([^\n]+?)(?=\s*2\.3\.|\s*AD\s+2\.|$)")
    ad26_pat = re.compile(
        r"AD\s+2\.6\s+Rescue\s+and\s+firefighting\s+services\s+(.+?)(?=\s*AD\s+2\.(?:1[0-9]|[2-9])|\s*2\.1[0-2]\s|$)",
        re.S | re.I,
    )
    fire_cat_pat = re.compile(r"2\.6\.1\s+Aerodrome\s+category\s+for\s+firefighting:\s*([^\n]+)")
    fire_remarks_pat = re.compile(r"2\.6\.4\s+Remarks:\s*([^\n]+?)(?=\s*2\.6\.|\s*AD\s+2\.|$)")

    def trim_spill(s, stop=r"\s+2\.\d"):
        if not s:
            return s
        m = re.search(stop, s)
        return s[: m.start()].strip() if m else s.strip()

    def name_from_prev(prev):
        skip = {"AIP", "United States of America", "Federal Aviation Administration", "Twenty−Fourth Edition", "AD 2−5", "AD 2−6"}
        lines = [ln.strip() for ln in prev.split("\n") if ln.strip()]
        out = []
        for ln in reversed(lines):
            if ln in skip or re.match(r"AD\s+2−\d+", ln) or re.match(r"^\d+\.\d+\.", ln):
                break
            if 2 < len(ln) < 120:
                out.insert(0, ln)
                if len(out) >= 2:
                    break
        return " ".join(out[-2:]) if out else (out[-1] if out else "")

    by_icao = {}
    for i, blk in enumerate(blocks):
        if i == 0:
            continue
        m = icao_pat.match(blk)
        if not m:
            continue
        icao = m.group(1).upper()
        prev = blocks[i - 1][-800:] if i else ""
        name = name_from_prev(prev)

        traffic = ""
        tm = traffic_pat.search(blk)
        if tm:
            traffic = tm.group(1).strip()

        remarks22 = "NIL"
        rm = remarks22_pat.search(blk)
        if rm:
            remarks22 = trim_spill(rm.group(1).strip())

        op_hours = ""
        om = ophours_pat.search(blk)
        if om:
            op_hours = trim_spill(om.group(1).strip())

        fire_cat = ""
        fire_remarks = ""
        am = ad26_pat.search(blk)
        if am:
            sub = am.group(1)
            fc = fire_cat_pat.search(sub)
            if fc:
                fire_cat = trim_spill(fc.group(1).strip())
            fr = fire_remarks_pat.search(sub)
            if fr:
                fire_remarks = trim_spill(fr.group(1).strip())

        rec = {
            "ICAO": icao,
            "Airport Name": name,
            "AD2.2 Traffic": traffic or "NIL",
            "AD2.2 Remarks": remarks22,
            "AD2.3 Operational hours": op_hours or "NIL",
            "AD2.6 Firefighting category": fire_cat or "NIL",
            "AD2.6 Remarks": fire_remarks or "NIL",
        }
        if icao not in by_icao or (traffic or op_hours or fire_cat):
            by_icao[icao] = rec

    rows = sorted(by_icao.values(), key=lambda x: x["ICAO"])
    wb = Workbook()
    ws = wb.active
    ws.title = "Airports"
    headers = ["ICAO", "Airport Name", "AD2.2 Traffic", "AD2.2 Remarks", "AD2.3 Operational hours", "AD2.6 Firefighting category", "AD2.6 Remarks"]
    ws.append(headers)
    for r in rows:
        ws.append([r[h] for h in headers])
    XLSX_PATH.parent.mkdir(parents=True, exist_ok=True)
    wb.save(XLSX_PATH)
    print(f"Excel: {len(rows)} airports → {XLSX_PATH}")


if __name__ == "__main__":
    trim_pdf()
    extract_airports_to_xlsx()
