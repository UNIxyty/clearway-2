#!/usr/bin/env python3
"""
Download Russian AIP files for one ICAO:
- Airport AIP main file (ДАННЫЕ, ТЕКСТЫ, ТАБЛИЦЫ)
- GEN 1.2 PDF

Outputs go to a timestamped folder.

Example:
  python3 scripts/rus_aip_download_by_icao.py --icao UNAA --verbose
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from rus_aip_extractor import (
    DEFAULT_MENU_URL,
    PROJECT_ROOT,
    build_tree,
    download_file,
    extract_gen1_links,
    extract_international_airports,
    fetch_text,
    tokenize_menu_script,
)

DEFAULT_TARGET_ROOT = PROJECT_ROOT / "downloads" / "rus-aip" / "by-icao"


def find_gen12(gen1_links: list[dict]) -> dict | None:
    for item in gen1_links:
        title = (item.get("title") or "").strip()
        if re.match(r"^GEN\s+1\.2\b", title, re.I):
            return item
    return None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download one ICAO AIP main PDF + GEN 1.2 into timestamped folder"
    )
    parser.add_argument("--icao", required=True, help="ICAO code, e.g. UNAA")
    parser.add_argument("--menu-url", default=DEFAULT_MENU_URL, help="URL of menurus.htm")
    parser.add_argument(
        "--target-root",
        type=Path,
        default=DEFAULT_TARGET_ROOT,
        help="Base folder where timestamped run folder is created",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Print progress")
    args = parser.parse_args()

    icao = args.icao.strip().upper()
    if not re.match(r"^[A-Z]{4}$", icao):
        print("Invalid ICAO format. Use 4 letters, e.g. UNAA", file=sys.stderr)
        return 2

    if args.verbose:
        print(f"Fetching {args.menu_url}", file=sys.stderr)
    text = fetch_text(args.menu_url)
    tokens = tokenize_menu_script(text)
    tree = build_tree(tokens)
    airports = extract_international_airports(tree)
    gen1 = extract_gen1_links(tree)

    airport = next((a for a in airports if (a.get("icao") or "").upper() == icao), None)
    if airport is None:
        print(f"ICAO {icao} was not found in international airports list.", file=sys.stderr)
        return 3

    gen12 = find_gen12(gen1)
    if gen12 is None:
        print("GEN 1.2 link not found in menu.", file=sys.stderr)
        return 4

    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    run_dir = args.target_root / f"{stamp}_{icao}"
    airport_dir = run_dir / "airport"
    gen_dir = run_dir / "gen"
    airport_dir.mkdir(parents=True, exist_ok=True)
    gen_dir.mkdir(parents=True, exist_ok=True)

    aip_dest = airport_dir / "aip-main.pdf"
    gen12_dest = gen_dir / "gen-1.2.pdf"

    if args.verbose:
        print(f"GET {airport.get('aip_main_url')}", file=sys.stderr)
    aip_res = download_file(airport.get("aip_main_url") or "", aip_dest)
    if args.verbose:
        print(f"GET {gen12.get('url')}", file=sys.stderr)
    gen_res = download_file(gen12.get("url") or "", gen12_dest)

    summary = {
        "icao": icao,
        "menu_url": args.menu_url,
        "timestamp_utc": stamp,
        "run_dir": str(run_dir),
        "airport": {
            "title": airport.get("airport_node_title"),
            "aip_main_title": airport.get("aip_main_title"),
            "aip_main_url": airport.get("aip_main_url"),
            "download_ok": aip_res["ok"],
            "bytes": aip_res["bytes"],
            "error": aip_res["error"],
            "saved_to": str(aip_dest),
        },
        "gen_1_2": {
            "title": gen12.get("title"),
            "url": gen12.get("url"),
            "download_ok": gen_res["ok"],
            "bytes": gen_res["bytes"],
            "error": gen_res["error"],
            "saved_to": str(gen12_dest),
        },
    }

    summary_path = run_dir / "summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if aip_res["ok"] and gen_res["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
