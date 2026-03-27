#!/usr/bin/env python3
"""
Unified eAIP Scraper
Supports multiple eAIP platform types:
  - Type A: Eurocontrol/Georgia-style (history page with dated folders)
  - Type B: PANSA/Poland-style (offline index with AIRAC folders)
  - Type C: ASECNA-style (multi-country French portal)
  - Type D: Eurocontrol direct (Sri Lanka style - direct folder URL)
"""

import os
import re
import sys
import requests
from bs4 import BeautifulSoup
from urllib.parse import quote, unquote, urljoin, urlparse

# ─────────────────────────────────────────────
# COUNTRY REGISTRY
# Each entry: "CountryName": {"type": ..., "url": ..., "extra": ...}
# ─────────────────────────────────────────────
COUNTRIES = {
    # ── TYPE A: Georgia-style (history page → dated folder → PDF) ──
    "Georgia": {
        "type": "A",
        "history_url": "https://ais.gcaa.ge/eaip/history-en-GB.html",
    },
    "South Korea": {
        "type": "A",
        "history_url": "https://aim.molit.go.kr/AIS/eaip/history-en-GB.html",
    },
    "Guatemala": {
        "type": "A",
        "history_url": "https://eaip.dgac.gob.gt/eaip/history-en-GB.html",
    },
    "Rwanda": {
        "type": "A",
        "history_url": "https://www.rcaa.gov.rw/eaip/history-en-GB.html",
    },
    "Bahrain": {
        "type": "A",
        "history_url": "https://www.caabahrain.gov.bh/eaip/history-en-GB.html",
    },
    "Myanmar": {
        "type": "A",
        "history_url": "https://aim.dca.gov.mm/eaip/history-en-GB.html",
    },
    "Malaysia": {
        "type": "A",
        "history_url": "https://aip.dca.gov.my/eaip/history-en-GB.html",
    },
    "Thailand": {
        "type": "A",
        "history_url": "https://www.aerothai.co.th/eaip/history-en-GB.html",
    },
    "Hong Kong": {
        "type": "A",
        "history_url": "https://www.ais.gov.hk/eaip/history-en-GB.html",
    },
    "Chile": {
        "type": "A",
        "history_url": "https://www.dgac.gob.cl/eaip/history-en-GB.html",
    },
    "Oman": {
        "type": "A",
        "history_url": "https://www.caa.gov.om/eaip/history-en-GB.html",
    },
    "Bosnia": {
        "type": "A",
        "history_url": "https://www.bhansa.gov.ba/eaip/history-en-GB.html",
    },
    "Kosovo": {
        "type": "A",
        "history_url": "https://www.caa-ks.net/eaip/history-en-GB.html",
    },
    "North Macedonia": {
        "type": "A",
        "history_url": "https://caa.mk/eaip/history-en-GB.html",
    },
    "Costa Rica": {
        "type": "A",
        "history_url": "https://www.dgac.go.cr/eaip/history-en-GB.html",
    },
    "El Salvador": {
        "type": "A",
        "history_url": "https://www.dgac.gob.sv/eaip/history-en-GB.html",
    },
    "Honduras": {
        "type": "A",
        "history_url": "https://www.dac.gob.hn/eaip/history-en-GB.html",
    },
    "Venezuela": {
        "type": "A",
        "history_url": "https://www.inac.gob.ve/eaip/history-en-GB.html",
    },
    "Cambodia": {
        "type": "A",
        "history_url": "https://www.ssca.gov.kh/eaip/history-en-GB.html",
    },
    "Somalia": {
        "type": "A",
        "history_url": "https://nacsom.gov.so/eaip/history-en-GB.html",
    },
    "Cabo Verde": {
        "type": "A",
        "history_url": "https://www.asa.cv/eaip/history-en-GB.html",
    },
    "Belarus": {
        "type": "A",
        "history_url": "https://www.belaeronavigatsia.by/eaip/history-en-GB.html",
    },
    # ── TYPE B: PANSA/Poland-style ──
    "Poland": {
        "type": "B",
        "history_url": "https://www.ais.pansa.pl/eaip/default_offline_2026-03-19.html",
        "base_url":    "https://www.ais.pansa.pl/eaip/",
    },
    # ── TYPE C: ASECNA multi-country portal ──
    "ASECNA": {
        "type": "C",
        "portal_url": "https://aim.asecna.aero/html/index-fr-FR.html",
        "countries": [
            "Benin", "Burkina Faso", "Cameroon", "Central African Republic",
            "Chad", "Comoros", "Congo", "Côte d'Ivoire", "Gabon",
            "Guinea", "Guinea-Bissau", "Madagascar", "Mali", "Mauritania",
            "Niger", "Senegal", "Togo",
        ],
    },
    # ── TYPE D: Eurocontrol direct folder (Sri Lanka) ──
    "Sri Lanka": {
        "type": "D",
        "index_url": "https://www.aimibsrilanka.lk/eaip/AIP_2503/Eurocontrol/SRI%20LANKA/2025-11-27-NON%20AIRAC/html/index-en-EN.html",
        "base_url":  "https://www.aimibsrilanka.lk/eaip/AIP_2503/Eurocontrol/SRI%20LANKA/2025-11-27-NON%20AIRAC/html/",
    },
}

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36"
})


def get_soup(url, timeout=20):
    resp = SESSION.get(url, timeout=timeout)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def download_file(url, dest_path):
    parent = os.path.dirname(dest_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    print(f"  ↓ Downloading: {url}")
    with SESSION.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    print(f"  ✓ Saved: {dest_path}")


def safe_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name)


# ─────────────────────────────────────────────
# TYPE A: Eurocontrol/Georgia-style
# ─────────────────────────────────────────────

def type_a_get_effective_folder(history_url):
    """Parse history page → return (folder_name, base_url_for_eaip)"""
    print(f"  Fetching history page: {history_url}")
    soup = get_soup(history_url)
    base = history_url.rsplit("/", 1)[0] + "/"

    # Look for CURRENT ISSUE table row with a link
    # Pattern: <a href="2026-02-19-000000/html/index-en-GB.html">15 MAY 2025</a>
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r"(\d{4}-\d{2}-\d{2}-\d+)/html/", href)
        if m:
            folder = m.group(1)
            eaip_base = urljoin(base, folder + "/html/")
            print(f"  → Effective folder: {folder}")
            return folder, eaip_base

    raise RuntimeError(f"Could not find effective issue folder in {history_url}")


def type_a_get_gen_pdfs(eaip_base, index_leaf="index-en-GB.html"):
    """Scrape GEN section PDF links from the eAIP index."""
    index_url = urljoin(eaip_base, index_leaf)
    soup = get_soup(index_url)
    pdfs = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # GEN PDFs: match links like "UG-GEN-1.1-en-GB.pdf" or similar
        if re.search(r"GEN[\-_]\d", href, re.IGNORECASE) and href.lower().endswith(".pdf"):
            full_url = urljoin(eaip_base, href)
            label = a.get_text(strip=True) or os.path.basename(href)
            pdfs[label] = full_url
    # Fallback: scan each GEN page for PDF link
    if not pdfs:
        pdfs = type_a_scrape_pdf_from_section(eaip_base, "GEN", index_leaf)
    return pdfs


def type_a_get_ad2_airports(eaip_base, index_leaf="index-en-GB.html"):
    """Return dict {ICAO: html_page_url} for all AD2 airports."""
    index_url = urljoin(eaip_base, index_leaf)
    soup = get_soup(index_url)
    airports = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # AD2 links: e.g. UGAM/html/... or AD-2-UGAM
        m = re.search(r"AD[-_]2[-_]([A-Z]{4})", href, re.IGNORECASE)
        if not m:
            m = re.search(r"/([A-Z]{4})/html/", href)
        if m:
            icao = m.group(1).upper()
            full_url = urljoin(eaip_base, href)
            airports[icao] = full_url
    return airports


def type_a_get_ad2_pdf(airport_page_url, eaip_base):
    """Given an AD2 airport page URL, find and return the PDF download URL."""
    soup = get_soup(airport_page_url)
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.lower().endswith(".pdf"):
            return urljoin(airport_page_url, href)
    # Try looking for pdf subfolder pattern
    # e.g. base/pdf/UG-AD-2-UGAM-en-GB.pdf
    parsed = urlparse(airport_page_url)
    path_parts = parsed.path.split("/")
    # Replace 'html' with 'pdf' in path
    pdf_path = "/".join(
        "pdf" if p == "html" else p for p in path_parts
    )
    pdf_path = re.sub(r"\.html$", ".pdf", pdf_path)
    candidate = f"{parsed.scheme}://{parsed.netloc}{pdf_path}"
    try:
        r = SESSION.head(candidate, timeout=10)
        if r.status_code == 200:
            return candidate
    except Exception:
        pass
    return None


def type_a_scrape_pdf_from_section(eaip_base, section_prefix, index_leaf="index-en-GB.html"):
    """Generic: fetch index, find all links starting with section_prefix, collect PDFs."""
    index_url = urljoin(eaip_base, index_leaf)
    soup = get_soup(index_url)
    pdfs = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if section_prefix in href.upper() and href.lower().endswith(".pdf"):
            label = a.get_text(strip=True) or os.path.basename(href)
            pdfs[label] = urljoin(eaip_base, href)
    return pdfs


def try_common_gen_pdfs(eaip_base, country_name, index_leaf="index-en-GB.html"):
    """
    Follow GEN-related HTML subpages from the index and collect any GEN PDF links.
    Used when the main index lists HTML hubs instead of PDFs directly.
    """
    del country_name  # reserved for future country-specific naming heuristics
    index_url = urljoin(eaip_base, index_leaf)
    soup = get_soup(index_url)
    seen_pages = set()
    pdfs = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "GEN" not in href.upper() or not href.lower().endswith(".html"):
            continue
        page_url = urljoin(eaip_base, href)
        if page_url in seen_pages:
            continue
        seen_pages.add(page_url)
        try:
            sub = get_soup(page_url)
        except Exception:
            continue
        for la in sub.find_all("a", href=True):
            h = la["href"]
            if not h.lower().endswith(".pdf"):
                continue
            if "GEN" not in h.upper():
                continue
            label = la.get_text(strip=True) or os.path.basename(h)
            pdfs[label] = urljoin(page_url, h)
    return pdfs


def scrape_airports_from_index(eaip_base, index_leaf="index-en-GB.html"):
    """Broader AD2 discovery when standard index patterns miss airports."""
    index_url = urljoin(eaip_base, index_leaf)
    soup = get_soup(index_url)
    airports = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.lower().endswith(".html"):
            continue
        full = urljoin(eaip_base, href)
        blob = href.upper().replace(" ", "")
        m = re.search(r"AD[-_\s]?2[-_\s]?([A-Z]{4})", blob)
        if not m:
            continue
        airports[m.group(1)] = full
    return airports


# ─────────────────────────────────────────────
# TYPE B: PANSA / Poland-style (datasource.js)
# ─────────────────────────────────────────────

EIP_LANG_CODE_B = "en-GB"


def type_b_get_effective_folder(history_url):
    soup = get_soup(history_url, timeout=60)
    for a in soup.find_all("a", href=True):
        href = a["href"].replace("\\", "/")
        if "index-v2.html" not in href:
            continue
        full = urljoin(history_url, href)
        if full.endswith("index-v2.html"):
            return full.rsplit("/", 1)[0]
    raise RuntimeError(f"Could not find effective eAIP folder from {history_url}")


def fetch_datasource_b(folder_url):
    url = f"{folder_url.rstrip('/')}/v2/js/datasource.js"
    r = SESSION.get(url, timeout=120)
    r.raise_for_status()
    return r.text


def discover_gen_pdfs_b(folder_url, ds):
    pat = re.compile(
        rf'"href":\s*"(GEN [^"]+?)-{re.escape(EIP_LANG_CODE_B)}\.html'
    )
    bases = sorted(set(pat.findall(ds)))
    out = []
    for base in bases:
        pdf_name = f"{base}.pdf"
        pdf_url = f"{folder_url.rstrip('/')}/documents/PDF/{quote(pdf_name)}"
        out.append((pdf_name, pdf_url))
    return out


def discover_ad2_pdfs_by_icao_b(folder_url, ds):
    pat = re.compile(
        rf'"href":\s*"(AD 2 [A-Z]{{4}} \d+)-{re.escape(EIP_LANG_CODE_B)}\.html'
    )
    seen = {}
    for base in pat.findall(ds):
        m = re.match(r"AD 2 ([A-Z]{4}) (\d+)$", base)
        if not m:
            continue
        icao, num_s = m.group(1), m.group(2)
        num = int(num_s)
        pdf_name = f"{base}.pdf"
        url = f"{folder_url.rstrip('/')}/documents/PDF/{quote(pdf_name)}"
        seen.setdefault(icao, {})[num] = (url, pdf_name)
    return {
        icao: sorted(((n, t[0], t[1]) for n, t in parts.items()))
        for icao, parts in seen.items()
    }


def run_type_b(country_name, config, mode, icao=None, output_dir="downloads"):
    folder_url = type_b_get_effective_folder(config["history_url"])
    folder_name = unquote(folder_url.rstrip("/").split("/")[-1])
    base_dir = os.path.join(output_dir, safe_filename(country_name), safe_filename(folder_name))
    ds = fetch_datasource_b(folder_url)
    prefix = safe_filename(country_name)[:2].upper() + "-"

    if mode in ("gen", "all"):
        print(f"\n[{country_name}] Downloading GEN section...")
        for pdf_name, url in discover_gen_pdfs_b(folder_url, ds):
            dest = os.path.join(base_dir, "GEN", prefix + pdf_name.replace(" ", "_"))
            try:
                download_file(url, dest)
            except Exception as e:
                print(f"  ✗ Failed {url}: {e}")

    if mode in ("ad2", "all"):
        ad_by_icao = discover_ad2_pdfs_by_icao_b(folder_url, ds)
        if mode == "all":
            targets = list(ad_by_icao.keys())
        else:
            if not icao:
                print("  ✗ ICAO required for mode ad2")
                return
            targets = [icao.upper()]
        for target_icao in targets:
            parts = ad_by_icao.get(target_icao)
            if not parts:
                print(f"  ⚠ ICAO {target_icao} not found.")
                continue
            for _part_no, pdf_url, pdf_name in parts:
                dest = os.path.join(
                    base_dir, "AD2", target_icao, prefix + pdf_name.replace(" ", "_")
                )
                print(f"\n[{country_name}] Downloading AD2 for {target_icao}: {pdf_name}...")
                try:
                    download_file(pdf_url, dest)
                except Exception as e:
                    print(f"  ✗ Failed {pdf_url}: {e}")


def run_type_c(country_name, config, mode, icao=None, output_dir="downloads"):
    del country_name, config, mode, icao, output_dir
    raise NotImplementedError(
        "ASECNA (type C) multi-country portal is not implemented in this script yet."
    )


def run_type_d(country_name, config, mode, icao=None, output_dir="downloads"):
    """Fixed Eurocontrol tree: base_url points at .../html/; index_url names the index file."""
    eaip_base = config["base_url"]
    index_leaf = os.path.basename(urlparse(config["index_url"]).path)
    path_segs = [p for p in urlparse(eaip_base).path.split("/") if p]
    folder = path_segs[-2] if len(path_segs) >= 2 and path_segs[-1] == "html" else "current"
    base_dir = os.path.join(output_dir, safe_filename(country_name), safe_filename(folder))

    if mode in ("gen", "all"):
        print(f"\n[{country_name}] Downloading GEN section...")
        pdfs = type_a_get_gen_pdfs(eaip_base, index_leaf)
        if not pdfs:
            pdfs = try_common_gen_pdfs(eaip_base, country_name, index_leaf)
        for label, url in pdfs.items():
            fname = safe_filename(label)
            if not fname.lower().endswith(".pdf"):
                fname += ".pdf"
            dest = os.path.join(base_dir, "GEN", fname)
            try:
                download_file(url, dest)
            except Exception as e:
                print(f"  ✗ Failed {url}: {e}")

    if mode in ("ad2", "all"):
        airports = type_a_get_ad2_airports(eaip_base, index_leaf)
        if not airports:
            airports = scrape_airports_from_index(eaip_base, index_leaf)
        if mode == "all":
            targets = list(airports.keys())
        else:
            if not icao:
                print("  ✗ ICAO required for mode ad2")
                return
            targets = [icao.upper()]
        for target_icao in targets:
            if target_icao not in airports:
                print(f"  ⚠ ICAO {target_icao} not found.")
                continue
            print(f"\n[{country_name}] Downloading AD2 for {target_icao}...")
            pdf_url = type_a_get_ad2_pdf(airports[target_icao], eaip_base)
            if not pdf_url:
                print(f"  ✗ Could not resolve PDF for {target_icao}")
                continue
            name = safe_filename(os.path.basename(urlparse(pdf_url).path))
            dest = os.path.join(base_dir, "AD2", target_icao, name)
            try:
                download_file(pdf_url, dest)
            except Exception as e:
                print(f"  ✗ Failed {pdf_url}: {e}")


def run_type_a(country_name, config, mode, icao=None, output_dir="downloads"):
    history_url = config["history_url"]
    index_leaf = config.get("index_page", "index-en-GB.html")
    folder, eaip_base = type_a_get_effective_folder(history_url)
    base_dir = os.path.join(output_dir, safe_filename(country_name), folder)

    if mode in ("gen", "all"):
        print(f"\n[{country_name}] Downloading GEN section...")
        pdfs = type_a_get_gen_pdfs(eaip_base, index_leaf)
        if not pdfs:
            print("  ⚠ No GEN PDFs found via index. Trying GEN subpages...")
            pdfs = try_common_gen_pdfs(eaip_base, country_name, index_leaf)
        for label, url in pdfs.items():
            fname = safe_filename(label)
            if not fname.lower().endswith(".pdf"):
                fname += ".pdf"
            dest = os.path.join(base_dir, "GEN", fname)
            try:
                download_file(url, dest)
            except Exception as e:
                print(f"  ✗ Failed {url}: {e}")

    if mode in ("ad2", "all"):
        airports = type_a_get_ad2_airports(eaip_base, index_leaf)
        if not airports:
            print("  ⚠ Could not auto-detect airports. Trying broader index scrape...")
            airports = scrape_airports_from_index(eaip_base, index_leaf)

        if mode == "all":
            targets = list(airports.keys())
        else:
            if not icao:
                print("  ✗ ICAO required for mode ad2")
                return
            targets = [icao.upper()]

        for target_icao in targets:
            if target_icao not in airports:
                print(f"  ⚠ ICAO {target_icao} not found. Available: {list(airports.keys())}")
                continue
            print(f"\n[{country_name}] Downloading AD2 for {target_icao}...")
            airport_page = airports[target_icao]
            pdf_url = type_a_get_ad2_pdf(airport_page, eaip_base)
            if not pdf_url:
                print(f"  ✗ Could not resolve PDF for {target_icao}")
                continue
            name = safe_filename(os.path.basename(urlparse(pdf_url).path))
            dest = os.path.join(base_dir, "AD2", target_icao, name)
            try:
                download_file(pdf_url, dest)
            except Exception as e:
                print(f"  ✗ Failed {pdf_url}: {e}")


def run_country(country_name, mode="all", icao=None, output_dir="downloads"):
    if country_name not in COUNTRIES:
        print(f"Unknown country: {country_name!r}. Keys: {sorted(COUNTRIES)}", file=sys.stderr)
        sys.exit(1)
    cfg = COUNTRIES[country_name]
    kind = cfg["type"]
    runners = {"A": run_type_a, "B": run_type_b, "C": run_type_c, "D": run_type_d}
    runner = runners.get(kind)
    if not runner:
        print(f"Unsupported type: {kind}", file=sys.stderr)
        sys.exit(1)
    runner(country_name, cfg, mode, icao=icao, output_dir=output_dir)


def main():
    import argparse

    p = argparse.ArgumentParser(description="Unified eAIP PDF scraper")
    p.add_argument(
        "country",
        nargs="?",
        help=f"Country key from registry (e.g. Georgia, Poland). Keys: {', '.join(sorted(COUNTRIES))}",
    )
    p.add_argument("--mode", choices=("gen", "ad2", "all"), default="all")
    p.add_argument("--icao", help="ICAO code (required for --mode ad2 unless --mode all)")
    p.add_argument("--output", "-o", default="downloads", help="Output root directory")
    args = p.parse_args()

    if not args.country:
        p.print_help()
        print("\nRegistered countries:", ", ".join(sorted(COUNTRIES)))
        sys.exit(0)

    run_country(args.country, mode=args.mode, icao=args.icao, output_dir=args.output)


if __name__ == "__main__":
    main()