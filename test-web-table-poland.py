import os
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import quote, unquote, urljoin

HISTORY_URL = "https://docs.pansa.pl/ais/eaipifr/default_offline_2026-03-19.html"
HEADERS = {"User-Agent": "Mozilla/5.0"}
# PDFs for the international (EN) pack; matches PANSA app.js: href with -en-GB.html → .pdf
EIP_LANG_CODE = "en-GB"


def get_effective_folder_url():
    """Scrape the PANSA history page to get the currently effective eAIP folder URL."""
    print("🔍 Fetching currently effective eAIP version from history page...")
    resp = requests.get(HISTORY_URL, headers=HEADERS, timeout=60)
    soup = BeautifulSoup(resp.text, "html.parser")

    for a in soup.find_all("a", href=True):
        href = a["href"].replace("\\", "/")
        if "index-v2.html" not in href:
            continue
        full = urljoin(HISTORY_URL, href)
        if full.endswith("index-v2.html"):
            folder_url = full.rsplit("/", 1)[0]
            folder_name = unquote(folder_url.split("/")[-1])
            print(f"  ✅ Found effective issue: {folder_name}")
            return folder_url

    raise RuntimeError("Could not find effective eAIP folder from history page.")


def fetch_datasource(folder_url: str) -> str:
    """Load eAIP menu JSON embedded as JavaScript (same source the web UI uses)."""
    url = f"{folder_url.rstrip('/')}/v2/js/datasource.js"
    print(f"🔍 Loading menu data: {url}")
    r = requests.get(url, headers=HEADERS, timeout=120)
    r.raise_for_status()
    return r.text


def discover_gen_pdfs(folder_url: str, ds: str) -> list[tuple[str, str]]:
    """Return (pdf_basename, absolute_url) for every unique GEN section (en-GB pack)."""
    pat = re.compile(
        rf'"href":\s*"(GEN [^"]+?)-{re.escape(EIP_LANG_CODE)}\.html'
    )
    bases = sorted(set(pat.findall(ds)))
    out: list[tuple[str, str]] = []
    for base in bases:
        pdf_name = f"{base}.pdf"
        url = f"{folder_url.rstrip('/')}/documents/PDF/{quote(pdf_name)}"
        out.append((pdf_name, url))
    print(f"  ✅ Found {len(out)} GEN PDF sections")
    return out


def discover_ad2_icaos(ds: str) -> list[str]:
    pat = re.compile(
        rf'AD 2 ([A-Z]{{4}}) \d+-{re.escape(EIP_LANG_CODE)}\.html'
    )
    icaos = sorted(set(pat.findall(ds)))
    print(f"  ✅ Found {len(icaos)} AD2 airports: {icaos}")
    return icaos


def discover_ad2_pdfs_by_icao(
    folder_url: str, ds: str
) -> dict[str, list[tuple[int, str, str]]]:
    """
    Per ICAO: sorted list of (part_no, pdf_url, pdf_basename).
    Poland splits AD 2 into multiple PDFs (e.g. AD 2 EPBY 1.pdf, AD 2 EPBY 2.pdf, …).
    """
    pat = re.compile(
        rf'"href":\s*"(AD 2 [A-Z]{{4}} \d+)-{re.escape(EIP_LANG_CODE)}\.html'
    )
    seen: dict[str, dict[int, tuple[str, str]]] = {}
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


def download_pdf(url, filename, folder="downloads"):
    """Download a PDF from a URL and save it locally."""
    os.makedirs(folder, exist_ok=True)
    filepath = os.path.join(folder, filename)
    print(f"  ⬇️  Downloading {filename} ...", end=" ", flush=True)
    resp = requests.get(url, headers=HEADERS, timeout=120)
    if resp.status_code == 200 and b"%PDF" in resp.content[:10]:
        with open(filepath, "wb") as f:
            f.write(resp.content)
        print(f"✅ ({len(resp.content) // 1024} KB)")
    else:
        print(f"❌ FAILED (HTTP {resp.status_code}) → {url}")


def download_gen(gen_pdfs: list[tuple[str, str]]):
    print(f"\n📂 Downloading all GEN sections ({len(gen_pdfs)} files)...")
    for pdf_name, url in gen_pdfs:
        filename = f"PL-{pdf_name.replace(' ', '_')}"
        download_pdf(url, filename)


def download_ad2(ad_by_icao: dict[str, list[tuple[int, str, str]]], icao_list: list[str]):
    print(f"\n📂 Downloading AD2 for: {', '.join(icao_list)}...")
    for icao in icao_list:
        icao = icao.upper().strip()
        parts = ad_by_icao.get(icao)
        if not parts:
            print(f"  ⚠️  No AD2 PDFs found for '{icao}'")
            continue
        for part_no, pdf_url, pdf_name in parts:
            filename = f"PL-{pdf_name.replace(' ', '_')}"
            download_pdf(pdf_url, filename)


def main():
    print("=" * 50)
    print("  Poland PANSA eAIP PDF Downloader (Dynamic)")
    print("=" * 50)

    folder_url = get_effective_folder_url()
    ds = fetch_datasource(folder_url)
    gen_pdfs = discover_gen_pdfs(folder_url, ds)
    airports = discover_ad2_icaos(ds)
    ad_by_icao = discover_ad2_pdfs_by_icao(folder_url, ds)

    print("\nWhat would you like to download?")
    print("  1 - GEN sections only")
    print("  2 - AD2 airport only (you provide ICAO code)")
    print("  3 - Download ALL (GEN + AD2 airports)")
    print()

    choice = input("Enter your choice (1/2/3): ").strip()

    if choice == "1":
        download_gen(gen_pdfs)

    elif choice == "2":
        print(f"\nAvailable airports: {', '.join(airports)}")
        raw = input("Enter ICAO code(s) separated by comma (e.g. EPWA or EPWA,EPKK): ")
        icao_list = [x.strip() for x in raw.split(",") if x.strip()]
        if not icao_list:
            print("No ICAO codes entered. Exiting.")
            return
        invalid = [i.upper() for i in icao_list if i.upper() not in ad_by_icao]
        if invalid:
            print(f"  ⚠️  Unknown ICAO code(s): {invalid}. Available: {airports}")
            return
        download_ad2(ad_by_icao, [i.upper() for i in icao_list])

    elif choice == "3":
        print(f"\nAvailable airports: {', '.join(airports)}")
        raw = input(
            "Enter ICAO code(s) for AD2 (comma-separated), or press Enter for ALL: "
        )
        icao_list = [x.strip().upper() for x in raw.split(",") if x.strip()]
        if not icao_list:
            icao_list = airports
        download_gen(gen_pdfs)
        download_ad2(ad_by_icao, icao_list)

    else:
        print("Invalid choice. Please run again and enter 1, 2, or 3.")
        return

    print("\n✅ Done! Files saved to the 'downloads/' folder.")


if __name__ == "__main__":
    main()
