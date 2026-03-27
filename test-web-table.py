import os
import re
import requests
from bs4 import BeautifulSoup

HISTORY_URL = "https://airnav.ge/eaip/history-en-GB.html"
BASE_DOMAIN  = "https://airnav.ge/eaip"
HEADERS = {"User-Agent": "Mozilla/5.0"}


def get_effective_base_url():
    """Scrape the history page to get the currently effective eAIP base URL."""
    print("🔍 Fetching currently effective eAIP version from history page...")
    resp = requests.get(HISTORY_URL, headers=HEADERS)
    soup = BeautifulSoup(resp.text, "html.parser")

    for a in soup.find_all("a", href=True):
        href = a["href"]
        # Handles both relative: "2026-02-19-000000/html/index-en-GB.html"
        # and absolute: "/eaip/2026-02-19-000000/html/index-en-GB.html"
        match = re.search(r"(\d{4}-\d{2}-\d{2}-\d+)/html/", href)
        if match:
            date_slug = match.group(1)
            base = f"https://airnav.ge/eaip/{date_slug}"
            print(f"  ✅ Found effective issue: {date_slug}")
            return base

    raise RuntimeError("Could not find effective eAIP version from history page.")


def get_available_sections(base_url):
    """
    Scrape the eAIP menu page to discover all GEN HTML pages
    and all AD2 airport HTML pages dynamically.
    Returns two dicts:
      gen_sections  -> { "GEN-1.1": pdf_url, ... }
      ad2_airports  -> { "UGAM": pdf_url, ... }
    """
    menu_url = f"{base_url}/html/eAIP/UG-menu-en-GB.html"
    print(f"🔍 Scraping menu: {menu_url}")
    resp = requests.get(menu_url, headers=HEADERS)
    soup = BeautifulSoup(resp.text, "html.parser")

    gen_sections = {}
    ad2_airports = {}

    for a in soup.find_all("a", href=True):
        href = a["href"]

        # Match GEN section HTML pages e.g. UG-GEN-1.2-en-GB.html
        gen_match = re.search(r"(UG-GEN-[\d.]+)-en-GB\.html", href)
        if gen_match:
            key = gen_match.group(1).replace("UG-", "")  # e.g. GEN-1.2
            # Georgia PDFs omit -en-GB (e.g. UG-GEN-1.2.pdf not ...-en-GB.pdf)
            pdf_url = f"{base_url}/pdf/{gen_match.group(1)}.pdf"
            gen_sections[key] = pdf_url

        # Match AD2 airport HTML pages e.g. UG-AD-2-UGAM-en-GB.html
        ad2_match = re.search(r"UG-AD-2-([A-Z]{4})-en-GB\.html", href)
        if ad2_match:
            icao = ad2_match.group(1)
            # Georgia uses hyphens: UG-AD-2-UGAM.pdf (not UG-AD-2.UGAM-en-GB.pdf)
            pdf_url = f"{base_url}/pdf/UG-AD-2-{icao}.pdf"
            ad2_airports[icao] = pdf_url

    print(f"  ✅ Found {len(gen_sections)} GEN sections: {list(gen_sections.keys())}")
    print(f"  ✅ Found {len(ad2_airports)} AD2 airports: {list(ad2_airports.keys())}")
    return gen_sections, ad2_airports


def download_pdf(url, filename, folder="downloads"):
    """Download a PDF from a URL and save it locally."""
    os.makedirs(folder, exist_ok=True)
    filepath = os.path.join(folder, filename)
    print(f"  ⬇️  Downloading {filename} ...", end=" ", flush=True)
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code == 200 and b"%PDF" in resp.content[:10]:
        with open(filepath, "wb") as f:
            f.write(resp.content)
        print(f"✅ ({len(resp.content) // 1024} KB)")
    else:
        print(f"❌ FAILED (HTTP {resp.status_code})")


def download_gen(gen_sections):
    print(f"\n📂 Downloading all GEN sections ({len(gen_sections)} files)...")
    for key, pdf_url in gen_sections.items():
        filename = pdf_url.split("/")[-1]
        download_pdf(pdf_url, filename)


def download_ad2(ad2_airports, icao_list):
    print(f"\n📂 Downloading AD2 for: {', '.join(icao_list)}...")
    for icao in icao_list:
        icao = icao.upper().strip()
        if icao not in ad2_airports:
            print(f"  ⚠️  '{icao}' not found. Available: {list(ad2_airports.keys())}")
            continue
        pdf_url = ad2_airports[icao]
        filename = pdf_url.split("/")[-1]
        download_pdf(pdf_url, filename)


def main():
    print("=" * 50)
    print("  Georgia eAIP PDF Downloader (Dynamic)")
    print("=" * 50)

    # Step 1: Discover the currently effective eAIP base URL
    base_url = get_effective_base_url()

    # Step 2: Scrape the menu to find all available sections & airports
    gen_sections, ad2_airports = get_available_sections(base_url)

    # Step 3: Ask user what to download
    print("\nWhat would you like to download?")
    print("  1 - GEN sections only")
    print("  2 - AD2 airport only (you provide ICAO code)")
    print("  3 - Download ALL (GEN + AD2 airports)")
    print()

    choice = input("Enter your choice (1/2/3): ").strip()

    if choice == "1":
        download_gen(gen_sections)

    elif choice == "2":
        print(f"\nAvailable airports: {', '.join(ad2_airports.keys())}")
        raw = input("Enter ICAO code(s) separated by comma (e.g. UGTB or UGTB,UGKO): ")
        icao_list = [x.strip() for x in raw.split(",") if x.strip()]
        if not icao_list:
            print("No ICAO codes entered. Exiting.")
            return
        download_ad2(ad2_airports, icao_list)

    elif choice == "3":
        print(f"\nAvailable airports: {', '.join(ad2_airports.keys())}")
        raw = input("Enter ICAO code(s) for AD2 (comma-separated), or press Enter for ALL: ")
        icao_list = [x.strip() for x in raw.split(",") if x.strip()]
        if not icao_list:
            icao_list = list(ad2_airports.keys())
        download_gen(gen_sections)
        download_ad2(ad2_airports, icao_list)

    else:
        print("Invalid choice. Please run again and enter 1, 2, or 3.")
        return

    print(f"\n✅ Done! Files saved to the 'downloads/' folder.")


if __name__ == "__main__":
    main()