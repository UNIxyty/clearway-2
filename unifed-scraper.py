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
import unicodedata
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib.parse import quote, unquote, urljoin, urlparse
from urllib3.util.retry import Retry

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
        # Primary host is sometimes down or blocked; try plain HTTP / bare domain.
        "history_urls": [
            "https://www.belaeronavigatsia.by/eaip/history-en-GB.html",
            "http://www.belaeronavigatsia.by/eaip/history-en-GB.html",
            "https://belaeronavigatsia.by/eaip/history-en-GB.html",
        ],
        # AD2 airport links often live on the Eurocontrol *-menu-en-GB.html page, not the root index.
        "ad2_menu_prefix": "UM",
    },
    # ── TYPE B: PANSA/Poland-style ──
    "Poland": {
        "type": "B",
        "history_url": "https://www.ais.pansa.pl/eaip/default_offline_2026-03-19.html",
        "base_url":    "https://www.ais.pansa.pl/eaip/",
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
_retry = Retry(
    total=4,
    connect=3,
    read=3,
    backoff_factor=0.6,
    status_forcelist=(429, 502, 503, 504),
    allowed_methods=frozenset({"GET", "HEAD"}),
)
_adapter = HTTPAdapter(max_retries=_retry)
SESSION.mount("https://", _adapter)
SESSION.mount("http://", _adapter)


def get_soup(url, timeout=20):
    resp = SESSION.get(url, timeout=timeout)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def extract_hrefs(soup):
    return [a["href"] for a in soup.find_all("a", href=True)]


def _folder_from_href(href):
    for pat in (r"(\d{4}-\d{2}-\d{2}-\d+)/html/", r"(\d{4}-\d{2}-\d{2})/html/"):
        m = re.search(pat, href)
        if m:
            return m.group(1)
    return None


def _extract_effective_from_history_soup(soup, base_url):
    for href in extract_hrefs(soup):
        folder = _folder_from_href(href)
        if folder:
            return folder, urljoin(base_url, folder + "/html/")
    return None


def _find_history_body_url(history_url, soup):
    for frame in soup.find_all("frame", src=True):
        src = frame["src"]
        if "history-body" in src.lower():
            return urljoin(history_url, src)
    return None


def _discover_menu_url_from_index(index_url, index_soup):
    # Direct menu links sometimes exist in index.
    for frame in index_soup.find_all("frame", src=True):
        src = frame["src"]
        if "menu" in src.lower() and src.lower().endswith(".html"):
            return urljoin(index_url, src)

    # Typical flow: index -> toc-frameset -> menu frame.
    toc_url = None
    for frame in index_soup.find_all("frame", src=True):
        src = frame["src"]
        if "toc" in src.lower() and src.lower().endswith(".html"):
            toc_url = urljoin(index_url, src)
            break
    if not toc_url:
        return None
    try:
        toc_soup = get_soup(toc_url)
    except requests.RequestException:
        return None
    for frame in toc_soup.find_all("frame", src=True):
        src = frame["src"]
        if "menu" in src.lower() and src.lower().endswith(".html"):
            return urljoin(toc_url, src)
    return None


def _get_navigation_soup(eaip_base, index_leaf):
    index_url = urljoin(eaip_base, index_leaf)
    index_soup = get_soup(index_url)
    hrefs = extract_hrefs(index_soup)
    if hrefs:
        return index_url, index_soup
    menu_url = _discover_menu_url_from_index(index_url, index_soup)
    if not menu_url:
        return index_url, index_soup
    menu_soup = get_soup(menu_url)
    return menu_url, menu_soup


def _commands_js_style_name_from_html_page(page_url):
    parsed = urlparse(page_url)
    base_name = os.path.basename(parsed.path)
    if not base_name.lower().endswith(".html"):
        return None
    stem = base_name[:-5]  # strip .html
    # Remove country prefix "SV-" / "UG-" etc.
    if "-" in stem:
        stem = stem.split("-", 1)[1]
    # Remove trailing language block "-en-GB" / "-fr-FR" etc.
    stem = re.sub(r"-[a-z]{2}-[A-Z]{2}$", "", stem)
    # Some pages may still end with "-en"
    stem = re.sub(r"-[a-z]{2}$", "", stem)
    if not stem:
        return None
    return stem + ".pdf"


def _pdf_candidates_from_html_page(page_url):
    parsed = urlparse(page_url)
    path = parsed.path
    # Generic html -> pdf conversion.
    direct = re.sub(r"/html/", "/pdf/", path, flags=re.I)
    direct = re.sub(r"\.html$", ".pdf", direct, flags=re.I)
    candidates = [f"{parsed.scheme}://{parsed.netloc}{direct}"]

    # Remove trailing language suffix if present.
    no_lang = re.sub(r"-[a-z]{2}-[A-Z]{2}\.pdf$", ".pdf", candidates[0], flags=re.I)
    if no_lang != candidates[0]:
        candidates.append(no_lang)

    # commands.js-style conversion keeps folder but rewrites basename.
    cmd_pdf = _commands_js_style_name_from_html_page(page_url)
    if cmd_pdf:
        pdf_dir = re.sub(r"/html/", "/pdf/", os.path.dirname(path), flags=re.I)
        candidates.append(f"{parsed.scheme}://{parsed.netloc}{pdf_dir}/{cmd_pdf}")

    # Deduplicate while preserving order.
    out = []
    seen = set()
    for c in candidates:
        if c not in seen:
            out.append(c)
            seen.add(c)
    return out


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


def normalize_text(value):
    folded = unicodedata.normalize("NFKD", value or "")
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", ascii_only.lower())


def prompt_for_country(input_func=input):
    countries = sorted(COUNTRIES)
    print("Available countries:", ", ".join(countries))
    while True:
        raw = input_func("Enter country name: ").strip()
        if not raw:
            continue
        exact = COUNTRIES.get(raw)
        if exact:
            return raw
        n = normalize_text(raw)
        for key in countries:
            if normalize_text(key) == n:
                return key
        print(f"Unknown country: {raw!r}. Try again.")


def prompt_for_mode(input_func=input):
    print("Select mode (1=GEN, 2=AD2, 3=ALL): ", end="")
    while True:
        raw = input_func().strip().lower()
        mode_map = {"1": "gen", "2": "ad2", "3": "all", "gen": "gen", "ad2": "ad2", "all": "all"}
        mode = mode_map.get(raw)
        if mode:
            return mode
        print("Enter 1, 2, 3, gen, ad2, or all: ", end="")


def resolve_cli_inputs(args, input_func=input):
    country = args.country or prompt_for_country(input_func=input_func)
    if country not in COUNTRIES:
        raise RuntimeError(
            f"Unknown country: {country!r}. Available countries: {', '.join(sorted(COUNTRIES))}"
        )

    mode = args.mode or prompt_for_mode(input_func=input_func)
    icao = args.icao.upper() if args.icao else None
    if mode == "ad2" and not icao:
        raw = input_func("Enter ICAO code: ").strip().upper()
        if not raw:
            raise RuntimeError("ICAO code is required for AD2 mode.")
        icao = raw
    return country, mode, icao


ASECNA_PORTAL_URL = "https://aim.asecna.aero/html/index-fr-FR.html"
ASECNA_HISTORY_URL = "https://aim.asecna.aero/html/history-fr-FR.html"
ASECNA_COUNTRIES = [
    "Benin",
    "Burkina Faso",
    "Cameroon",
    "Central African Republic",
    "Chad",
    "Comoros",
    "Congo",
    "Cote d'Ivoire",
    "Gabon",
    "Guinea",
    "Guinea-Bissau",
    "Madagascar",
    "Mali",
    "Mauritania",
    "Niger",
    "Senegal",
    "Togo",
]

for _asecna_country in ASECNA_COUNTRIES:
    COUNTRIES[_asecna_country] = {
        "type": "C",
        "portal_url": ASECNA_PORTAL_URL,
        "history_url": ASECNA_HISTORY_URL,
        "index_page": "index-fr-FR.html",
        "country_name": _asecna_country,
    }


# ─────────────────────────────────────────────
# TYPE A: Eurocontrol/Georgia-style
# ─────────────────────────────────────────────

def _history_urls_for_config(config):
    urls = config.get("history_urls")
    if urls:
        return list(urls)
    return [config["history_url"]]


def type_a_get_effective_folder(history_urls):
    """Parse history page(s) → return (folder_name, base_url_for_eaip)."""
    if isinstance(history_urls, str):
        history_urls = [history_urls]
    last_err = None
    for history_url in history_urls:
        try:
            return _type_a_resolve_one_history_url(history_url)
        except (requests.RequestException, RuntimeError) as e:
            last_err = e
            print(f"  ⚠ History URL failed: {history_url}\n    {e}")
    hint = (
        " Check DNS/VPN if you see 'Failed to resolve host'."
        " Belarus publishes via belaeronavigatsia.by (Eurocontrol-style tree)."
    )
    raise RuntimeError(
        f"Could not load any history URL (tried {len(history_urls)}). Last error: {last_err}.{hint}"
    ) from None


def _type_a_resolve_one_history_url(history_url):
    print(f"  Fetching history page: {history_url}")
    soup = get_soup(history_url)
    resolved = _extract_effective_from_history_soup(soup, history_url)
    if resolved:
        folder, eaip_base = resolved
        print(f"  → Effective folder: {folder}")
        return folder, eaip_base

    # Frame-based history pages (e.g. .../history-en-GB.html + history-body-en-GB.html).
    body_url = _find_history_body_url(history_url, soup)
    if body_url:
        body_soup = get_soup(body_url)
        resolved = _extract_effective_from_history_soup(body_soup, body_url)
        if resolved:
            folder, eaip_base = resolved
            print(f"  → Effective folder: {folder}")
            return folder, eaip_base

    raise RuntimeError(f"Could not find effective issue folder in {history_url}")


def _index_language_tag(index_leaf):
    m = re.match(r"index-([a-z]{2}-[A-Z]{2})\.html$", index_leaf or "", re.I)
    return m.group(1) if m else "en-GB"


def type_a_eaip_folder_root(eaip_base):
    """eaip_base is …/<issue>/html/ → return …/<issue> (parent of html)."""
    u = eaip_base.rstrip("/")
    if u.lower().endswith("/html"):
        return u[: -len("/html")]
    return u.rsplit("/", 1)[0]


def type_a_get_ad2_from_menu(eaip_base, menu_prefix, index_leaf="index-en-GB.html"):
    """Eurocontrol: eAIP/<PREFIX>-menu-en-GB.html lists AD-2-* HTML entry pages."""
    lang = _index_language_tag(index_leaf)
    menu_url = urljoin(eaip_base, f"eAIP/{menu_prefix}-menu-{lang}.html")
    try:
        soup = get_soup(menu_url)
    except requests.RequestException as e:
        print(f"  (optional menu) skip {menu_url}: {e}")
        return {}
    airports = {}
    pat = re.compile(
        rf"{re.escape(menu_prefix)}-AD-2-([A-Z]{{4}})-{re.escape(lang)}\.html",
        re.I,
    )
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = pat.search(href)
        if not m:
            continue
        icao = m.group(1).upper()
        airports[icao] = urljoin(menu_url, href)
    if airports:
        print(f"  → AD2 from menu ({menu_prefix}-menu): {len(airports)} airports")
    return airports


def type_a_get_gen_pdfs(eaip_base, index_leaf="index-en-GB.html"):
    """Scrape GEN section PDF links from the eAIP index."""
    source_url, soup = _get_navigation_soup(eaip_base, index_leaf)
    pdfs = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # GEN PDFs: match links like "UG-GEN-1.1-en-GB.pdf" or similar
        if re.search(r"GEN[\-_]\d", href, re.IGNORECASE) and href.lower().endswith(".pdf"):
            full_url = urljoin(source_url, href)
            label = a.get_text(strip=True) or os.path.basename(href)
            pdfs[label] = full_url

    # Fallback 1: scan each GEN page for PDF links.
    if not pdfs:
        pdfs = type_a_scrape_pdf_from_section(eaip_base, "GEN", index_leaf, source_url=source_url, soup=soup)

    # Fallback 2: derive PDF URL from GEN HTML links (commands.js-style websites).
    if not pdfs:
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "GEN" not in href.upper() or not href.lower().endswith(".html"):
                continue
            page_url = urljoin(source_url, href)
            label = a.get_text(strip=True) or os.path.basename(href)
            for candidate in _pdf_candidates_from_html_page(page_url):
                if _type_a_pdf_head_ok(candidate):
                    pdfs[label] = candidate
                    break
    return pdfs


def type_a_get_ad2_airports(
    eaip_base,
    index_leaf="index-en-GB.html",
    menu_prefix=None,
):
    """Return dict {ICAO: html_page_url} for all AD2 airports."""
    source_url, soup = _get_navigation_soup(eaip_base, index_leaf)
    airports = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # AD2 links: AD-2-UGAM, AD2.1SVAC, AD-2.SVAC, or /SVAC/html/
        m = re.search(r"AD[-_\.\s]?2[-_\.\s]?([A-Z]{4})", href, re.IGNORECASE)
        if not m:
            m = re.search(r"AD2\.1([A-Z]{4})", href, re.IGNORECASE)
        if not m:
            m = re.search(r"/([A-Z]{4})/html/", href)
        if m:
            icao = m.group(1).upper()
            full_url = urljoin(source_url, href)
            airports[icao] = full_url
    if menu_prefix:
        for icao, url in type_a_get_ad2_from_menu(
            eaip_base, menu_prefix, index_leaf
        ).items():
            airports.setdefault(icao, url)
    return airports


def _type_a_pdf_head_ok(url):
    try:
        r = SESSION.head(url, timeout=15, allow_redirects=True)
        if r.status_code == 200:
            return True
        # Some servers forbid HEAD; try light GET
        g = SESSION.get(url, timeout=15, stream=True, allow_redirects=True)
        ok = g.status_code == 200
        g.close()
        return ok
    except requests.RequestException:
        return False


def type_a_get_ad2_pdf(airport_page_url, eaip_base):
    """Given an AD2 airport page URL, find and return the PDF download URL."""
    try:
        soup = get_soup(airport_page_url)
    except requests.RequestException:
        soup = None
    if soup is not None:
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.lower().endswith(".pdf"):
                return urljoin(airport_page_url, href)

    candidates = list(_pdf_candidates_from_html_page(airport_page_url))
    root = type_a_eaip_folder_root(eaip_base)
    bn = os.path.basename(urlparse(airport_page_url).path)
    short_pdf = re.sub(r"-[a-z]{2}-[A-Z]{2}\.html$", ".pdf", bn, flags=re.I)
    short_pdf = re.sub(r"\.html$", ".pdf", short_pdf, flags=re.I)
    if short_pdf.lower().endswith(".pdf"):
        candidates.append(f"{root.rstrip('/')}/pdf/{short_pdf}")

    seen = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if _type_a_pdf_head_ok(candidate):
            return candidate
    return None


def type_a_scrape_pdf_from_section(
    eaip_base, section_prefix, index_leaf="index-en-GB.html", source_url=None, soup=None
):
    """Generic: fetch index, find all links starting with section_prefix, collect PDFs."""
    if source_url is None or soup is None:
        source_url, soup = _get_navigation_soup(eaip_base, index_leaf)
    pdfs = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if section_prefix in href.upper() and href.lower().endswith(".pdf"):
            label = a.get_text(strip=True) or os.path.basename(href)
            pdfs[label] = urljoin(source_url, href)
    return pdfs


def try_common_gen_pdfs(eaip_base, country_name, index_leaf="index-en-GB.html"):
    """
    Follow GEN-related HTML subpages from the index and collect any GEN PDF links.
    Used when the main index lists HTML hubs instead of PDFs directly.
    """
    del country_name  # reserved for future country-specific naming heuristics
    source_url, soup = _get_navigation_soup(eaip_base, index_leaf)
    seen_pages = set()
    pdfs = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "GEN" not in href.upper() or not href.lower().endswith(".html"):
            continue
        page_url = urljoin(source_url, href)
        page_label = a.get_text(strip=True) or os.path.basename(href)
        if page_url in seen_pages:
            continue
        seen_pages.add(page_url)
        found_pdf = False
        try:
            sub = get_soup(page_url)
        except Exception:
            sub = None
        if sub is not None:
            for la in sub.find_all("a", href=True):
                h = la["href"]
                if not h.lower().endswith(".pdf"):
                    continue
                if "GEN" not in h.upper():
                    continue
                label = la.get_text(strip=True) or os.path.basename(h)
                pdfs[label] = urljoin(page_url, h)
                found_pdf = True
        if not found_pdf:
            for candidate in _pdf_candidates_from_html_page(page_url):
                if _type_a_pdf_head_ok(candidate):
                    pdfs[page_label] = candidate
                    break
    return pdfs


def scrape_airports_from_index(eaip_base, index_leaf="index-en-GB.html"):
    """Broader AD2 discovery when standard index patterns miss airports."""
    source_url, soup = _get_navigation_soup(eaip_base, index_leaf)
    airports = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.lower().endswith(".html"):
            continue
        full = urljoin(source_url, href)
        blob = href.upper().replace(" ", "")
        m = re.search(r"AD[-_\.\s]?2[-_\.\s]?([A-Z]{4})", blob)
        if not m:
            m = re.search(r"AD2\.1([A-Z]{4})", blob)
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


def _extract_type_c_issue_candidates(soup, base_url, country_name):
    country_token = normalize_text(country_name)
    candidates = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        text = a.get_text(" ", strip=True)
        packed = f"{href} {text}"
        norm = normalize_text(packed)
        if country_token and country_token not in norm:
            continue
        if "index-fr-fr.html" not in href.lower():
            continue
        folder_match = re.search(r"(\d{4}-\d{2}-\d{2}(?:-\d{6})?)/html/", href)
        folder = folder_match.group(1) if folder_match else None
        abs_index = urljoin(base_url, href)
        eaip_base = abs_index.rsplit("/", 1)[0] + "/"
        candidates.append((folder or "current", eaip_base, abs_index))
    return candidates


def resolve_type_c_base(config, country_name):
    history_url = config["history_url"]
    portal_url = config["portal_url"]
    candidates = []
    try:
        history_soup = get_soup(history_url, timeout=30)
        candidates = _extract_type_c_issue_candidates(history_soup, history_url, country_name)
    except requests.RequestException:
        pass
    if not candidates:
        try:
            portal_soup = get_soup(portal_url, timeout=30)
            candidates = _extract_type_c_issue_candidates(portal_soup, portal_url, country_name)
        except requests.RequestException:
            pass
    if not candidates:
        # ASECNA may expose a frame-based menu without dated folder URLs.
        portal_base = portal_url.rsplit("/", 1)[0] + "/"
        return "current", portal_base
    # Choose latest issue by lexical sort on YYYY-MM-DD[-HHMMSS] folder token.
    candidates.sort(key=lambda x: x[0], reverse=True)
    folder, eaip_base, _index = candidates[0]
    return folder, eaip_base


def run_type_c(country_name, config, mode, icao=None, output_dir="downloads"):
    index_leaf = config.get("index_page", "index-fr-FR.html")
    folder, eaip_base = resolve_type_c_base(config, country_name)
    base_dir = os.path.join(output_dir, safe_filename(country_name), safe_filename(folder))

    if mode in ("gen", "all"):
        print(f"\n[{country_name}] Downloading GEN section...")
        pdfs = type_a_get_gen_pdfs(eaip_base, index_leaf)
        if not pdfs:
            print("  ⚠ No GEN PDFs found via index. Trying GEN subpages...")
            pdfs = try_common_gen_pdfs(eaip_base, country_name, index_leaf)
        if not pdfs:
            print(f"  ⚠ No GEN PDFs found for {country_name}.")
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
        airports = type_a_get_ad2_airports(eaip_base, index_leaf=index_leaf)
        if not airports:
            print("  ⚠ Could not auto-detect airports. Trying broader index scrape...")
            airports = scrape_airports_from_index(eaip_base, index_leaf)
        if not airports:
            print(f"  ⚠ No AD2 airports discovered for {country_name}.")
            return

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
        airports = type_a_get_ad2_airports(
            eaip_base, index_leaf, menu_prefix=config.get("ad2_menu_prefix")
        )
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
    index_leaf = config.get("index_page", "index-en-GB.html")
    folder, eaip_base = type_a_get_effective_folder(_history_urls_for_config(config))
    base_dir = os.path.join(output_dir, safe_filename(country_name), safe_filename(folder))

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
        airports = type_a_get_ad2_airports(
            eaip_base, index_leaf, menu_prefix=config.get("ad2_menu_prefix")
        )
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
        raise RuntimeError(f"Unknown country: {country_name!r}. Keys: {sorted(COUNTRIES)}")
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
    p.add_argument("--mode", choices=("gen", "ad2", "all"))
    p.add_argument("--icao", help="ICAO code (required for --mode ad2 unless --mode all)")
    p.add_argument("--output", "-o", default="downloads", help="Output root directory")
    args = p.parse_args()

    try:
        country, mode, icao = resolve_cli_inputs(args)
        run_country(country, mode=mode, icao=icao, output_dir=args.output)
    except NotImplementedError as e:
        print(e, file=sys.stderr)
        sys.exit(2)
    except RuntimeError as e:
        sys.stdout.flush()
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()