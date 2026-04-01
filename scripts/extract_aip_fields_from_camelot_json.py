#!/usr/bin/env python3
"""
Extract required AIP fields from Camelot-generated output.json.

Input format expected:
- Top-level list
- Each item is a table list
- Each table row is a dict with string keys like "0", "1", "2"
  where "1" is label/field name and "2" is value.

Usage:
  python3 scripts/extract_aip_fields_from_camelot_json.py output.json --icao EETU --name "TARTU"
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def _norm_lower(s: str) -> str:
    return _norm(s).lower()


def _is_table(obj: Any) -> bool:
    return isinstance(obj, list) and all(isinstance(r, dict) for r in obj)


def _flatten_rows(tables: list[list[dict[str, Any]]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for t_idx, table in enumerate(tables):
        for r_idx, row in enumerate(table):
            label = _norm(str(row.get("1", "")))
            value = _norm(str(row.get("2", "")))
            rows.append(
                {
                    "table_index": str(t_idx),
                    "row_index": str(r_idx),
                    "label": label,
                    "value": value,
                }
            )
    return rows


def _find_first_value(rows: list[dict[str, str]], label_patterns: list[str]) -> str:
    compiled = [re.compile(p, re.I) for p in label_patterns]
    for row in rows:
        label = row["label"]
        for pat in compiled:
            if pat.search(label):
                return row["value"] or "NIL"
    return "NIL"


def _tables_with_patterns(rows: list[dict[str, str]], patterns: list[str]) -> set[str]:
    compiled = [re.compile(p, re.I) for p in patterns]
    out: set[str] = set()
    for row in rows:
        label = row["label"]
        if any(p.search(label) for p in compiled):
            out.add(row["table_index"])
    return out


def _expand_adjacent_tables(table_indexes: set[str], max_table_index: int) -> set[str]:
    expanded = set(table_indexes)
    for t in list(table_indexes):
        try:
            i = int(t)
        except ValueError:
            continue
        if i + 1 <= max_table_index:
            expanded.add(str(i + 1))
    return expanded


def _find_ad22_remarks(rows: list[dict[str, str]]) -> str:
    # Prefer first "Remarks" row in the first table where traffic permitted exists.
    traffic_table = None
    for row in rows:
        if re.search(r"types?\s+of\s+traffic\s+permitted", row["label"], re.I):
            traffic_table = row["table_index"]
            break
    if traffic_table is not None:
        for row in rows:
            if row["table_index"] == traffic_table and re.search(
                r"\bremarks\b|märkused", row["label"], re.I
            ):
                return row["value"] or "NIL"
    return "NIL"


def _find_ad23_remarks(rows: list[dict[str, str]]) -> str:
    # Prefer "Remarks" rows in AD 2.3-related tables.
    # Strategy:
    # 1) collect tables that contain ATS/customs labels
    # 2) exclude the AD 2.2 remarks table (where traffic permitted appears)
    # 3) if still ambiguous, prefer the longest remarks value
    ad22_table = None
    for row in rows:
        if re.search(r"types?\s+of\s+traffic\s+permitted", row["label"], re.I):
            ad22_table = row["table_index"]
            break

    max_table_index = max((int(r["table_index"]) for r in rows), default=0)
    ad23_tables = _tables_with_patterns(
        rows,
        [r"customs\s+and\s+immigration", r"ad\s+operational\s+hours", r"^\s*ats\b"],
    )
    ad23_tables = _expand_adjacent_tables(ad23_tables, max_table_index)

    candidates: list[str] = []
    for row in rows:
        if not re.search(r"\bremarks\b|märkused", row["label"], re.I):
            continue
        tbl = row["table_index"]
        if ad22_table is not None and tbl == ad22_table:
            continue
        if tbl in ad23_tables:
            candidates.append(row["value"])

    if not candidates:
        # Fallback: any remarks not in AD 2.2 table.
        for row in rows:
            if re.search(r"\bremarks\b|märkused", row["label"], re.I):
                tbl = row["table_index"]
                if ad22_table is not None and tbl == ad22_table:
                    continue
                candidates.append(row["value"])

    if candidates:
        normalized = [(c or "NIL") for c in candidates]
        return max(normalized, key=lambda s: len(_norm(s)))
    return "NIL"


def _pick_in_tables(
    rows: list[dict[str, str]], table_indexes: set[str], label_patterns: list[str]
) -> str:
    compiled = [re.compile(p, re.I) for p in label_patterns]
    for row in rows:
        if row["table_index"] not in table_indexes:
            continue
        if any(p.search(row["label"]) for p in compiled):
            return row["value"] or "NIL"
    return "NIL"


def _nil_canonical(s: str) -> str:
    t = _norm(s)
    if re.search(r"\bNIL\b|Ei ole", t, re.I):
        return "NIL"
    return t or "NIL"


def _infer_icao_from_rows(rows: list[dict[str, str]]) -> str:
    for row in rows:
        for chunk in (row["label"], row["value"]):
            m = re.search(r"\b([A-Z]{4})\b", chunk)
            if m:
                candidate = m.group(1)
                # Avoid common non-ICAO uppercase tokens.
                if candidate not in {
                    "IFR",
                    "VFR",
                    "ATS",
                    "NIL",
                    "AFS",
                    "ARO",
                    "MET",
                    "URL",
                    "MON",
                    "FRI",
                    "HRS",
                    "PN",
                }:
                    return candidate
    return "NIL"


def extract_required_fields(
    tables: list[list[dict[str, Any]]],
    icao_hint: str = "",
    airport_name_hint: str = "",
) -> dict[str, str]:
    rows = _flatten_rows(tables)

    code = _norm(icao_hint).upper() if icao_hint else _infer_icao_from_rows(rows)
    if not code:
        code = "NIL"

    name = _norm(airport_name_hint) if airport_name_hint else "NIL"

    max_table_index = max((int(r["table_index"]) for r in rows), default=0)
    ad23_tables = _tables_with_patterns(
        rows,
        [r"customs\s+and\s+immigration", r"ad\s+operational\s+hours", r"^\s*ats\b"],
    )
    ad23_tables = _expand_adjacent_tables(ad23_tables, max_table_index)

    out = {
        "Airport Code": code,
        "Airport Name": name or "NIL",
        "AD2.2 Types of Traffic Permitted": _find_first_value(
            rows, [r"types?\s+of\s+traffic\s+permitted", r"ifr\/vfr"]
        ),
        "AD2.2 Remarks": _find_ad22_remarks(rows),
        "AD2.3 AD Operator": _pick_in_tables(
            rows, ad23_tables, [r"\bad\s+operator\b", r"lennuvälja\s+haldaja"]
        ),
        "AD 2.3 Customs and Immigration": _pick_in_tables(
            rows, ad23_tables, [r"customs\s+and\s+immigration", r"toll"]
        ),
        "AD2.3 ATS": _pick_in_tables(rows, ad23_tables, [r"^\s*ats\b"]),
        "AD2.3 Remarks": _find_ad23_remarks(rows),
        "AD2.6 AD category for fire fighting": _find_first_value(
            rows, [r"ad\s+category\s+for\s+fire\s+fighting", r"tuletõrjekategooria"]
        ),
    }
    for k, v in out.items():
        out[k] = _nil_canonical(v)
    return out


def load_tables_from_json(path: Path) -> list[list[dict[str, Any]]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("Input JSON must be a list of tables.")
    tables: list[list[dict[str, Any]]] = [t for t in raw if _is_table(t)]
    if not tables:
        raise ValueError("No table arrays found in input JSON.")
    return tables


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract required AIP fields from Camelot output.json")
    parser.add_argument("input_json", type=Path, help="Path to Camelot output.json")
    parser.add_argument("--out", type=Path, default=Path("required-fields.json"), help="Output JSON path")
    parser.add_argument("--icao", default="", help="Optional ICAO hint")
    parser.add_argument("--name", default="", help="Optional airport name hint")
    args = parser.parse_args()

    tables = load_tables_from_json(args.input_json)
    extracted = extract_required_fields(
        tables=tables,
        icao_hint=args.icao,
        airport_name_hint=args.name,
    )
    args.out.write_text(json.dumps(extracted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(str(args.out.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
