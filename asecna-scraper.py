#!/usr/bin/env python3
"""
ASECNA eAIP PDF Scraper
Site: https://aim.asecna.aero

Root cause fix: the main index page is a frameset - requests gets an empty shell.
- GEN PDFs: constructed from known country codes + section patterns, base /pdf/
- AD2 PDFs: parsed from FR-_00AD-0.6.eAIP-fr-FR.html, base /ntm/pdf/
"""

import re
import sys
import requests
from bs4 import BeautifulSoup
from pathlib import Path

BASE_URL = "https://aim.asecna.aero"
AD_TOC_URL = f"{BASE_URL}/html/eAIP/FR-_00AD-0.6.eAIP-fr-FR.html"

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; eAIP-scraper/1.0)",
    "Referer": BASE_URL,
})

COUNTRIES = {
    "00": "ASECNA",
    "01": "Bénin",
    "02": "Burkina Faso",
    "03": "Cameroun",
    "04": "Centrafrique",
    "05": "Congo",
    "06": "Côte d'Ivoire",
    "07": "Gabon",
    "08": "Guinée Equatoriale",
    "09": "Madagascar",
    "10": "Mali",
    "11": "Mauritanie",
    "12": "Niger",
    "13": "Sénégal",
    "14": "Tchad",
    "15": "Togo",
    "16": "Comores",
    "17": "Guinée Bissau",
}

GEN_SECTIONS = [
    {"label": "GEN-0.1 Preface",       "suffix": "GEN-0.1-01"},
    {"label": "GEN-1.1 Regulations",   "suffix": "GEN-1.1-01"},
    {"label": "GEN-2.1 Tables/Codes",  "suffix": "GEN-2.1-01"},
    {"label": "GEN-3.1 Services",      "suffix": "GEN-3.1-01"},
    {"label": "GEN-4.1 Charges",       "suffix": "GEN-4.1-01"},
]


def fetch(url: str) -> str:
    r = SESSION.get(url, timeout=30)
    r.raise_for_status()
    return r.text


def build_gen_links() -> list[dict]:
    """
    GEN PDF URLs follow a predictable pattern:
    https://aim.asecna.aero/pdf/FR-_{NN}{suffix}-fr-FR.pdf
    e.g. FR-_02GEN-1.1-01-fr-FR.pdf for Burkina Faso GEN-1.1
    """
    links = []
    for cc, country_name in COUNTRIES.items():
        for section in GEN_SECTIONS:
            suffix = section["suffix"]
            filename = f"FR-_{cc}{suffix}-fr-FR.pdf"
            pdf_url = f"{BASE_URL}/pdf/{filename}"
            links.append({
                "type": "GEN",
                "country_code": cc,
                "country_name": country_name,
                "label": section["label"],
                "suffix": suffix,
                "pdf_url": pdf_url,
                "filename": filename,
            })
    return links


def parse_ad2_links() -> list[dict]:
    """
    Parse https://aim.asecna.aero/html/eAIP/FR-_00AD-0.6.eAIP-fr-FR.html
    Anchors: href="#_02AD-2.DFFD"  → country=02, icao=DFFD
    PDF URL: https://aim.asecna.aero/ntm/pdf/FR-_02AD-2.DFFD-fr-FR.pdf
    """
    print(f"  Fetching AD TOC: {AD_TOC_URL}")
    html = fetch(AD_TOC_URL)
    soup = BeautifulSoup(html, "html.parser")
    links = []
    seen = set()

    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r'#_(\d{2})AD-2\.([A-Z]{4})', href)
        if not m:
            continue
        cc = m.group(1)
        icao = m.group(2)
        key = (cc, icao)
        if key in seen:
            continue
        seen.add(key)

        # Link text format: "DFFD OUAGADOUGOU02 AD-2.DFFD  Aerodrome"
        text = a.get_text(strip=True)
        name_match = re.match(r'^[A-Z+]+\s+(.+?)\s*\d{2}\s+AD-2\.[A-Z]+', text)
        airport_name = name_match.group(1).strip() if name_match else icao

        filename = f"FR-_{cc}AD-2.{icao}-fr-FR.pdf"
        pdf_url = f"{BASE_URL}/ntm/pdf/{filename}"

        links.append({
            "type": "AD2",
            "country_code": cc,
            "country_name": COUNTRIES.get(cc, cc),
            "icao": icao,
            "airport_name": airport_name,
            "pdf_url": pdf_url,
            "filename": filename,
        })

    return links


def download_pdf(pdf_url: str, filename: str, dest_dir: Path) -> bool:
    dest = dest_dir / filename
    if dest.exists():
        print(f"  [skip] {filename} (already exists)")
        return True
    try:
        r = SESSION.get(pdf_url, timeout=60, stream=True)
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        size_kb = dest.stat().st_size // 1024
        print(f"  [ok]   {filename} ({size_kb} KB)")
        return True
    except requests.HTTPError as e:
        print(f"  [err]  {pdf_url} -> {e}")
        return False


def pick_type() -> str:
    print("\nWhat would you like to download?")
    print("  1) GEN sections only")
    print("  2) AD2 aerodromes only")
    print("  3) All (GEN + AD2)")
    while True:
        c = input("Enter choice [1/2/3]: ").strip()
        if c in ("1", "2", "3"):
            return c
        print("  Please enter 1, 2, or 3.")


def pick_country(available_codes: list[str], label: str = "") -> list[str]:
    unique_codes = sorted(set(available_codes))
    print(f"\nAvailable countries{' (' + label + ')' if label else ''}:")
    for cc in unique_codes:
        print(f"  {cc} - {COUNTRIES.get(cc, cc)}")
    print("  all - All countries")
    while True:
        raw = input("Enter country code(s) comma-separated, or 'all': ").strip().lower()
        if raw == "all":
            return unique_codes
        codes = [c.strip().zfill(2) for c in raw.split(",")]
        invalid = [c for c in codes if c not in unique_codes]
        if invalid:
            print(f"  Unknown code(s): {invalid}. Try again.")
        else:
            return codes


def pick_gen_sections() -> list[str]:
    print("\nWhich GEN sections?")
    for i, s in enumerate(GEN_SECTIONS, 1):
        print(f"  {i}) {s['label']}")
    print("  all - All sections")
    while True:
        raw = input("Enter section number(s) comma-separated, or 'all': ").strip().lower()
        if raw == "all":
            return [s["suffix"] for s in GEN_SECTIONS]
        chosen = []
        valid = True
        for part in raw.split(","):
            part = part.strip()
            if part.isdigit() and 1 <= int(part) <= len(GEN_SECTIONS):
                chosen.append(GEN_SECTIONS[int(part) - 1]["suffix"])
            else:
                print(f"  Invalid selection: '{part}'. Try again.")
                valid = False
                break
        if valid and chosen:
            return chosen


def pick_icao(ad2_links: list[dict], country_codes: list[str]) -> list[str]:
    filtered = [l for l in ad2_links if l["country_code"] in country_codes]
    if not filtered:
        print("  No AD2 airports found for selected countries.")
        return []
    print("\nAvailable airports:")
    for l in filtered:
        print(f"  {l['icao']} - {l['airport_name']} ({l['country_name']})")
    print("  all - All listed airports")
    while True:
        raw = input("Enter ICAO code(s) comma-separated, or 'all': ").strip().upper()
        if raw == "ALL":
            return [l["icao"] for l in filtered]
        codes = [c.strip() for c in raw.split(",")]
        available = {l["icao"] for l in filtered}
        invalid = [c for c in codes if c not in available]
        if invalid:
            print(f"  Unknown ICAO(s): {invalid}. Try again.")
        else:
            return codes


def main():
    print("=" * 45)
    print("  ASECNA eAIP PDF Scraper")
    print("=" * 45)

    doc_type = pick_type()
    selected = []

    # ── GEN ──────────────────────────────────────
    if doc_type in ("1", "3"):
        print("\nBuilding GEN document list...")
        gen_links = build_gen_links()
        all_cc = [l["country_code"] for l in gen_links]
        chosen_cc = pick_country(all_cc, "GEN")
        chosen_sections = pick_gen_sections()

        filtered_gen = [
            l for l in gen_links
            if l["country_code"] in chosen_cc
            and l["suffix"] in chosen_sections
        ]
        print(f"  → {len(filtered_gen)} GEN document(s) selected.")
        selected.extend(filtered_gen)

    # ── AD2 ──────────────────────────────────────
    if doc_type in ("2", "3"):
        print("\nFetching AD2 airport list from site...")
        ad2_links = parse_ad2_links()
        print(f"  → Found {len(ad2_links)} airports.")

        all_cc_ad2 = [l["country_code"] for l in ad2_links]
        chosen_cc_ad2 = pick_country(all_cc_ad2, "AD2")
        chosen_icaos = pick_icao(ad2_links, chosen_cc_ad2)

        filtered_ad2 = [l for l in ad2_links if l["icao"] in chosen_icaos]
        print(f"  → {len(filtered_ad2)} AD2 document(s) selected.")
        selected.extend(filtered_ad2)

    if not selected:
        print("\nNothing selected. Exiting.")
        sys.exit(0)

    output_dir = Path("asecna_pdfs")
    output_dir.mkdir(exist_ok=True)

    print(f"\nDownloading {len(selected)} PDF(s) to ./{output_dir}/\n")
    ok = fail = 0
    for item in selected:
        if item["type"] == "AD2":
            label = f"{item['icao']} - {item['airport_name']} ({item['country_name']})"
        else:
            label = f"{item['country_name']} / {item['label']}"
        print(f"  {label}")
        if download_pdf(item["pdf_url"], item["filename"], output_dir):
            ok += 1
        else:
            fail += 1

    print(f"\n{'='*45}")
    print(f"  Done: {ok} downloaded, {fail} failed.")
    print(f"  Saved to: {output_dir.resolve()}")
    print(f"{'='*45}")


if __name__ == "__main__":
    main()