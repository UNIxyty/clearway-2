#!/usr/bin/env python3
"""
Russian AIP (caica.ru) menu parser and PDF downloader.

Uses Python 3 stdlib only (urllib, re, json, csv, pathlib, argparse).

Flow: fetch menurus.htm → parse ItemBegin/ItemLink/ItemEnd → build tree →
export international airports + GEN 1.x links → optional download → report.

Example:
  python3 scripts/rus_aip_extractor.py --download --verbose
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

DEFAULT_MENU_URL = (
    "https://www.caica.ru/common/AirInter/validaip/html/menurus.htm"
)
BASE_PDF_URL = "https://www.caica.ru/common/AirInter/validaip/aip/"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT_JSON = PROJECT_ROOT / "data" / "rus-aip-international-airports.json"
DEFAULT_OUT_CSV = PROJECT_ROOT / "data" / "rus-aip-international-airports.csv"
DEFAULT_MANIFEST = PROJECT_ROOT / "data" / "rus-aip-download-manifest.json"
DEFAULT_REPORT = PROJECT_ROOT / "test-results" / "rus-aip-extract-report.json"
DEFAULT_DOWNLOAD_ROOT = PROJECT_ROOT / "downloads" / "rus-aip"

USER_AGENT = (
    "Mozilla/5.0 (compatible; ClearwayRusAipExtractor/1.0; +https://clearway)"
)


# -----------------------------------------------------------------------------
# Fetch
# -----------------------------------------------------------------------------


def fetch_text(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return raw.decode("cp1251")


# -----------------------------------------------------------------------------
# Token parsing (quoted strings in ItemBegin / ItemLink)
# -----------------------------------------------------------------------------


def _parse_quoted_string(s: str, i: int) -> tuple[str, int]:
    """Read a double-quoted string starting at s[i]=='\"'. Returns (value, next_index)."""
    if i >= len(s) or s[i] != '"':
        raise ValueError(f"Expected '\"' at {i}")
    i += 1
    out: list[str] = []
    while i < len(s):
        c = s[i]
        if c == '"':
            return "".join(out), i + 1
        out.append(c)
        i += 1
    raise ValueError("Unterminated string")


def _skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i] in " \t\n\r":
        i += 1
    return i


@dataclass
class Token:
    kind: str  # "begin" | "link" | "end"
    args: list[str] = field(default_factory=list)


def tokenize_menu_script(text: str) -> list[Token]:
    """
    Extract ItemBegin(...), ItemLink(...), ItemEnd() calls from embedded script.
    Assumes arguments are only double-quoted strings (matches caica menu source).
    """
    tokens: list[Token] = []
    # Also match OpenTab() etc. — we only scan for our keywords
    patterns = [
        ("ItemBegin", "begin", 3),
        ("ItemLink", "link", 2),
        ("ItemEnd", "end", 0),
    ]

    i = 0
    n = len(text)
    while i < n:
        if text.startswith("ItemBegin", i):
            name, kind, argc = patterns[0]
        elif text.startswith("ItemLink", i):
            name, kind, argc = patterns[1]
        elif text.startswith("ItemEnd", i):
            name, kind, argc = patterns[2]
        else:
            i += 1
            continue

        j = i + len(name)
        j = _skip_ws(text, j)
        if j >= n or text[j] != "(":
            i += 1
            continue
        j += 1
        args: list[str] = []
        if argc == 0:
            j = _skip_ws(text, j)
            if j < n and text[j] == ")":
                tokens.append(Token(kind="end", args=[]))
                i = j + 1
                continue
            i += 1
            continue

        ok = True
        for a in range(argc):
            j = _skip_ws(text, j)
            try:
                val, j = _parse_quoted_string(text, j)
            except ValueError:
                ok = False
                break
            args.append(val)
            if a < argc - 1:
                j = _skip_ws(text, j)
                if j >= n or text[j] != ",":
                    ok = False
                    break
                j += 1
        if not ok or len(args) != argc:
            i += 1
            continue
        j = _skip_ws(text, j)
        if j < n and text[j] == ")":
            tokens.append(Token(kind=kind, args=args))
            i = j + 1
            continue
        i += 1

    return tokens


# -----------------------------------------------------------------------------
# Tree building
# -----------------------------------------------------------------------------


@dataclass
class MenuNode:
    """Folder node from ItemBegin."""

    item_id: str
    path: str
    title: str
    children: list[Any] = field(default_factory=list)


@dataclass
class MenuLink:
    """Leaf from ItemLink."""

    path: str
    title: str


def build_tree(tokens: list[Token]) -> MenuNode:
    root = MenuNode(item_id="", path="", title="__root__", children=[])
    stack: list[MenuNode] = [root]

    for tok in tokens:
        if tok.kind == "begin":
            node = MenuNode(
                item_id=tok.args[0],
                path=tok.args[1],
                title=tok.args[2],
                children=[],
            )
            stack[-1].children.append(node)
            stack.append(node)
        elif tok.kind == "link":
            stack[-1].children.append(MenuLink(path=tok.args[0], title=tok.args[1]))
        elif tok.kind == "end":
            if len(stack) > 1:
                stack.pop()

    return root


def find_first_node_by_title(
    node: MenuNode, title_substring: str
) -> MenuNode | None:
    """DFS: first MenuNode whose title contains title_substring."""
    if title_substring in node.title:
        return node
    for ch in node.children:
        if isinstance(ch, MenuNode):
            found = find_first_node_by_title(ch, title_substring)
            if found is not None:
                return found
    return None


def find_child_node_by_title(node: MenuNode, title_substring: str) -> MenuNode | None:
    for ch in node.children:
        if isinstance(ch, MenuNode) and title_substring in ch.title:
            return ch
    return None


# -----------------------------------------------------------------------------
# URL helpers
# -----------------------------------------------------------------------------


def menu_relative_to_absolute_pdf(href: str) -> str:
    """
    menurus.htm lives in .../html/; links look like ../aip/gen/gen1/gen1.2.pdf
    → https://www.caica.ru/common/AirInter/validaip/aip/...
    """
    href = href.strip()
    if href.startswith("http://") or href.startswith("https://"):
        return href
    # Normalize ../aip/... → aip/...
    if href.startswith("../"):
        href = href[3:]
    if href.startswith("aip/"):
        return "https://www.caica.ru/common/AirInter/validaip/" + href
    return "https://www.caica.ru/common/AirInter/validaip/" + href.lstrip("/")


# -----------------------------------------------------------------------------
# Extraction: international airports + GEN 1
# -----------------------------------------------------------------------------

_ICAO_DOT = re.compile(r"^([A-Z]{4})\.\s*", re.I)


def parse_airport_icao(title: str) -> str | None:
    m = _ICAO_DOT.match(title.strip())
    return m.group(1).upper() if m else None


def airport_name_from_title(title: str) -> str:
    t = title.strip()
    t = re.sub(r"^[A-Z]{4}\.\s*", "", t, flags=re.I)
    return t.strip()


def is_aip_main_link(title: str) -> bool:
    return "ДАННЫЕ" in title and "ТЕКСТЫ" in title


def is_gen1_doc_link(title: str) -> bool:
    return bool(re.match(r"^GEN\s+1\.\d+", title.strip(), re.I))


def extract_international_airports(root: MenuNode) -> list[dict[str, Any]]:
    ad3 = find_first_node_by_title(root, "AD Часть III")
    if ad3 is None:
        return []
    ad2 = find_child_node_by_title(ad3, "AD 2.")
    if ad2 is None:
        return []
    intl = find_child_node_by_title(ad2, "Международные аэродромы")
    if intl is None:
        return []

    out: list[dict[str, Any]] = []
    for ch in intl.children:
        if not isinstance(ch, MenuNode):
            continue
        icao = parse_airport_icao(ch.title)
        aip_main_path = ""
        aip_main_title = ""
        for sub in ch.children:
            if isinstance(sub, MenuLink) and is_aip_main_link(sub.title):
                aip_main_path = sub.path
                aip_main_title = sub.title
                break
        out.append(
            {
                "icao": icao or "",
                "airport_node_title": ch.title,
                "aip_main_title": aip_main_title,
                "aip_main_href_menu_relative": aip_main_path,
                "aip_main_url": menu_relative_to_absolute_pdf(aip_main_path)
                if aip_main_path
                else "",
            }
        )
    return out


def extract_gen1_links(root: MenuNode) -> list[dict[str, Any]]:
    gen1 = find_first_node_by_title(root, "GEN 1. Национальные")
    if gen1 is None:
        # Fallback: exact prefix
        gen1 = find_first_node_by_title(root, "GEN 1.")
    if gen1 is None:
        return []

    out: list[dict[str, Any]] = []
    for ch in gen1.children:
        if isinstance(ch, MenuLink) and is_gen1_doc_link(ch.title):
            out.append(
                {
                    "title": ch.title,
                    "href_menu_relative": ch.path,
                    "url": menu_relative_to_absolute_pdf(ch.path),
                }
            )
    return sorted(out, key=lambda x: x["title"])


# -----------------------------------------------------------------------------
# Download
# -----------------------------------------------------------------------------


def download_file(url: str, dest: Path, timeout: int = 120) -> dict[str, Any]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    tmp = dest.with_suffix(dest.suffix + ".part")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
        tmp.write_bytes(data)
        tmp.replace(dest)
        return {"ok": True, "bytes": len(data), "error": None}
    except urllib.error.HTTPError as e:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        return {"ok": False, "bytes": 0, "error": f"HTTP {e.code}: {e.reason}"}
    except urllib.error.URLError as e:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        return {"ok": False, "bytes": 0, "error": str(e.reason)}
    except Exception as e:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        return {"ok": False, "bytes": 0, "error": str(e)}


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------


def write_csv_airports(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["icao", "airport_name"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})


def main() -> int:
    parser = argparse.ArgumentParser(description="Russian AIP menu extractor (caica.ru)")
    parser.add_argument(
        "--menu-url",
        default=DEFAULT_MENU_URL,
        help="URL of menurus.htm",
    )
    parser.add_argument(
        "--out-json",
        type=Path,
        default=DEFAULT_OUT_JSON,
        help="International airports JSON output",
    )
    parser.add_argument(
        "--out-csv",
        type=Path,
        default=DEFAULT_OUT_CSV,
        help="International airports CSV output",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help="Download manifest JSON",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT,
        help="Run report JSON",
    )
    parser.add_argument(
        "--download-root",
        type=Path,
        default=DEFAULT_DOWNLOAD_ROOT,
        help="Root directory for PDF downloads",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download GEN 1.x and airport AIP main PDFs",
    )
    parser.add_argument(
        "--timestamped-downloads",
        action="store_true",
        help="When used with --download, save PDFs in a timestamped subfolder",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Print progress",
    )
    args = parser.parse_args()
    if args.download and args.timestamped_downloads:
        run_stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
        args.download_root = args.download_root / f"extract-{run_stamp}"

    t0 = time.time()
    if args.verbose:
        print(f"Fetching {args.menu_url}", file=sys.stderr)

    try:
        text = fetch_text(args.menu_url)
    except Exception as e:
        print(f"Failed to fetch menu: {e}", file=sys.stderr)
        return 1

    tokens = tokenize_menu_script(text)
    root = build_tree(tokens)
    airports = extract_international_airports(root)
    gen1 = extract_gen1_links(root)

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    airport_db_rows = sorted(
        [
            {
                "icao": (a.get("icao") or "").strip().upper(),
                "airport_name": airport_name_from_title(a.get("airport_node_title") or ""),
            }
            for a in airports
            if (a.get("icao") or "").strip()
        ],
        key=lambda x: x["icao"],
    )

    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(
            {
                "source_menu_url": args.menu_url,
                "international_airport_count": len(airport_db_rows),
                "airports": airport_db_rows,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    write_csv_airports(args.out_csv, airport_db_rows)

    manifest_items: list[dict[str, Any]] = []
    for g in gen1:
        safe_name = re.sub(r"[^\w\-.]+", "_", g["title"])[:120] + ".pdf"
        manifest_items.append(
            {
                "category": "gen1",
                "title": g["title"],
                "url": g["url"],
                "local_path": str(
                    args.download_root / "gen1" / safe_name
                ),
                "status": "pending",
                "bytes": 0,
                "error": None,
            }
        )

    for a in airports:
        icao = (a.get("icao") or "unknown").strip() or "unknown"
        manifest_items.append(
            {
                "category": "international_airport_aip_main",
                "icao": icao,
                "title": a.get("aip_main_title") or "",
                "url": a.get("aip_main_url") or "",
                "local_path": str(
                    args.download_root
                    / "international-airports"
                    / icao
                    / "aip-main.pdf"
                ),
                "status": "pending",
                "bytes": 0,
                "error": None,
            }
        )

    args.manifest.parent.mkdir(parents=True, exist_ok=True)

    download_ok = 0
    download_fail = 0

    if args.download:
        for item in manifest_items:
            url = item["url"]
            dest = Path(item["local_path"])
            if not url:
                item["status"] = "skipped"
                item["error"] = "no URL"
                download_fail += 1
                if args.verbose:
                    print(f"Skip (no URL): {item.get('title', item.get('icao'))}", file=sys.stderr)
                continue
            if args.verbose:
                print(f"GET {url}", file=sys.stderr)
            res = download_file(url, dest)
            item["bytes"] = res["bytes"]
            item["error"] = res["error"]
            if res["ok"]:
                item["status"] = "ok"
                download_ok += 1
            else:
                item["status"] = "failed"
                download_fail += 1
                if args.verbose:
                    print(f"  FAIL: {res['error']}", file=sys.stderr)

    with open(args.manifest, "w", encoding="utf-8") as f:
        json.dump(
            {
                "menu_url": args.menu_url,
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "gen1_count": len(gen1),
                "international_airports": len(airports),
                "items": manifest_items,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    def _rel(p: Path) -> str:
        try:
            return str(p.resolve().relative_to(PROJECT_ROOT))
        except ValueError:
            return str(p)

    report = {
        "menu_url": args.menu_url,
        "duration_seconds": round(time.time() - t0, 3),
        "token_count": len(tokens),
        "international_airport_count": len(airports),
        "gen1_link_count": len(gen1),
        "download_enabled": args.download,
        "download_ok": download_ok if args.download else None,
        "download_failed_or_skipped": download_fail if args.download else None,
        "outputs": {
            "airports_json": _rel(args.out_json),
            "airports_csv": _rel(args.out_csv),
            "manifest": _rel(args.manifest),
            "report": _rel(args.report),
            "download_root": _rel(args.download_root),
        },
    }

    args.report.parent.mkdir(parents=True, exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(json.dumps(report, indent=2, ensure_ascii=False))

    # Warn if discovery looks wrong
    if not airports:
        print(
            "Warning: no international airports found (check menu structure).",
            file=sys.stderr,
        )
        return 2
    if not gen1:
        print("Warning: no GEN 1.x links found.", file=sys.stderr)

    return 0 if not args.download or download_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
