# Overview
Build a Python CLI script (`unifed-scraper.py`) that downloads PDF documents
from national Aeronautical Information Publication (eAIP) websites.

The script accepts:
- A country name as a **positional argument** (no `--` prefix)
- `--mode` flag: `gen`, `ad2`, or `all`
- `--icao` flag: required when mode is `ad2` (4-letter ICAO airport code)
- `--output` flag: optional output directory (default: `downloads/`)

Example usage:
```bash
python unifed-scraper.py "Georgia" --mode gen
python unifed-scraper.py "Belarus" --mode ad2 --icao UMMS
python unifed-scraper.py "Poland" --mode all
python unifed-scraper.py
```

---

## Dependencies
requests
beautifulsoup4

text

---

## Platform Types

There are 4 platform types. Each country is assigned one type.
The scraper must branch logic based on the type.

---

### TYPE A — Eurocontrol Standard (majority of countries)

**Step-by-step logic:**
1. Fetch `history_url` (e.g. `https://ais.gcaa.ge/eaip/history-en-GB.html`)
2. Parse HTML — find the CURRENT ISSUE row in the table
3. Extract folder name from `<a href>` in that row
   - Regex: `(\d{4}-\d{2}-\d{2}-\d+)/html/`
   - Example: `2026-02-19-000000`
4. Construct `eaip_base` = `{history_base_url}/{folder}/html/`
5. Fetch `{eaip_base}index-en-GB.html`
6. **GEN mode**: find `<a href>` where href contains `GEN` (case-insensitive) and ends with `.pdf`
7. **AD2 mode**: find `<a href>` matching ICAO airport pattern
   - Regex: `AD[-_]2[-_]([A-Z]{4})` or `/([A-Z]{4})/html/`
   - Build dict: `{ "UGAM": "https://full-airport-page-url" }`
   - Visit each airport page → find `.pdf` link
   - Fallback: replace `/html/` → `/pdf/` and `.html` → `.pdf` in URL
8. Save to `downloads/{CountryName}/{folder}/GEN/` or `downloads/{CountryName}/{folder}/AD2/{ICAO}/`

**Countries using Type A:**

| Country | history_url |
|---|---|
| Georgia | https://ais.gcaa.ge/eaip/history-en-GB.html |
| South Korea | https://aim.molit.go.kr/AIS/eaip/history-en-GB.html |
| Guatemala | https://eaip.dgac.gob.gt/eaip/history-en-GB.html |
| Rwanda | https://www.rcaa.gov.rw/eaip/history-en-GB.html |
| Bahrain | https://www.caabahrain.gov.bh/eaip/history-en-GB.html |
| Myanmar | https://aim.dca.gov.mm/eaip/history-en-GB.html |
| Malaysia | https://aip.dca.gov.my/eaip/history-en-GB.html |
| Thailand | https://www.aerothai.co.th/eaip/history-en-GB.html |
| Hong Kong | https://www.ais.gov.hk/eaip/history-en-GB.html |
| Chile | https://www.dgac.gob.cl/eaip/history-en-GB.html |
| Oman | https://www.caa.gov.om/eaip/history-en-GB.html |
| Bosnia | https://www.bhansa.gov.ba/eaip/history-en-GB.html |
| Kosovo | https://www.caa-ks.net/eaip/history-en-GB.html |
| North Macedonia | https://caa.mk/eaip/history-en-GB.html |
| Costa Rica | https://www.dgac.go.cr/eaip/history-en-GB.html |
| El Salvador | https://www.dgac.gob.sv/eaip/history-en-GB.html |
| Honduras | https://www.dac.gob.hn/eaip/history-en-GB.html |
| Venezuela | https://www.inac.gob.ve/eaip/history-en-GB.html |
| Cambodia | https://www.ssca.gov.kh/eaip/history-en-GB.html |
| Somalia | https://nacsom.gov.so/eaip/history-en-GB.html |
| Cabo Verde | https://www.asa.cv/eaip/history-en-GB.html |
| Belarus | https://www.belaeronavigatsia.by/eaip/history-en-GB.html |

---

### TYPE B — PANSA / Poland Style

**Step-by-step logic:**
1. Fetch `history_url` (a static offline HTML page listing all AIRAC cycles)
2. Find CURRENT ISSUE `<a href>` — pattern: `AIRAC AMDT \d+-\d+_\d{4}_\d{2}_\d{2}/index-v2.html`
   - Example folder: `AIRAC AMDT 03-26_2026_03_19`
3. Construct `eaip_base` = `{base_url}/{folder}/`
4. Fetch `{eaip_base}index-v2.html` (note: `-v2` suffix, not standard)
5. Apply same GEN and AD2 PDF detection as Type A
6. Polish airport ICAO codes start with `EP` (e.g. `EPBY`, `EPWA`, `EPKK`)

**Countries using Type B:**

| Country | history_url | base_url |
|---|---|---|
| Poland | https://www.ais.pansa.pl/eaip/default_offline_2026-03-19.html | https://www.ais.pansa.pl/eaip/ |

---

### TYPE C — ASECNA Multi-Country Portal (French)

**Step-by-step logic:**
1. Single portal: `https://aim.asecna.aero/html/index-fr-FR.html`
2. Hosts 17 African country eAIPs under one Eurocontrol-style system
3. Navigate to the country's subfolder within the portal
4. Use `index-fr-FR.html` instead of `index-en-GB.html` throughout
5. GEN PDF links contain `GEN` in href; AD2 follow same `AD-2-XXXX` pattern
6. History page: `https://aim.asecna.aero/html/history-fr-FR.html`

**Countries using Type C:**
Benin, Burkina Faso, Cameroon, Central African Republic, Chad, Comoros,
Congo, Cote d'Ivoire, Gabon, Guinea, Guinea-Bissau, Madagascar, Mali,
Mauritania, Niger, Senegal, Togo

---

### TYPE D — Eurocontrol Direct Folder (no history page)

**Step-by-step logic:**
1. No history page — `index_url` points directly to current active eAIP index
2. Fetch index directly, apply same GEN/AD2 PDF detection as Type A
3. `base_url` is the directory containing the index file

**Countries using Type D:**

| Country | index_url | base_url |
|---|---|---|
| Sri Lanka | https://www.aimibsrilanka.lk/eaip/AIP_2503/Eurocontrol/SRI%20LANKA/2025-11-27-NON%20AIRAC/html/index-en-EN.html | https://www.aimibsrilanka.lk/eaip/AIP_2503/Eurocontrol/SRI%20LANKA/2025-11-27-NON%20AIRAC/html/ |

Note: Sri Lanka index file is `index-en-EN.html` (not `index-en-GB.html`).

---

## PDF Detection Logic (shared across all types)

### GEN PDFs
- Find all `<a href>` where href contains `GEN` (case-insensitive) AND ends with `.pdf`
- OR href links to a GEN HTML page → visit it → find `.pdf` link on that page
- Common naming: `{PREFIX}-GEN-{SECTION}-en-GB.pdf`
- Examples: `UG-GEN-1.1-en-GB.pdf`, `EP-GEN-0-en-GB.pdf`, `UM-GEN-2-en-GB.pdf`

### AD2 PDFs
- Find all `<a href>` matching:
  - Regex `AD[-_]2[-_]([A-Z]{4})` — airport section page or direct PDF
  - Regex `/([A-Z]{4})/html/` — airport subfolder pattern
- Build dict: `{ "ICAO": "https://resolved-airport-page-url" }`
- For each target airport:
  1. Visit airport page → find `<a href>` ending in `.pdf`
  2. Fallback: replace `/html/` → `/pdf/` and `.html` → `.pdf` in URL
  3. Verify fallback URL with HTTP HEAD before downloading

---

## URL Handling Rules

- **Always use `urljoin(base_url, href)`** — never assume absolute paths
- hrefs on history pages may be relative: `2026-02-19-000000/html/index-en-GB.html`
- Extract folder with: `re.search(r"(\d{4}-\d{2}-\d{2}-\d+)/html/", href)`
- Never hardcode any PDF path or folder name — always derive dynamically

---

## CLI Argument Parsing

```python
import argparse

parser = argparse.ArgumentParser(description="eAIP Unified Scraper")
parser.add_argument("country", nargs="?", help="Country name (e.g. 'Georgia')")
parser.add_argument("--mode", choices=["gen", "ad2", "all"])
parser.add_argument("--icao", help="ICAO airport code for AD2 mode (e.g. UMMS)")
parser.add_argument("--output", default="downloads")
args = parser.parse_args()
```

If `country` or `mode` missing → interactive prompt:
Available countries: Georgia, Belarus, Poland, ...
Enter country name: Belarus
Select mode (1=GEN, 2=AD2, 3=ALL): 2
Enter ICAO code: UMMS

text

---

## Country Registry (internal Python dict)

```python
COUNTRIES = {
    # TYPE A
    "Georgia":        {"type": "A", "history_url": "https://ais.gcaa.ge/eaip/history-en-GB.html"},
    "South Korea":    {"type": "A", "history_url": "https://aim.molit.go.kr/AIS/eaip/history-en-GB.html"},
    "Guatemala":      {"type": "A", "history_url": "https://eaip.dgac.gob.gt/eaip/history-en-GB.html"},
    "Rwanda":         {"type": "A", "history_url": "https://www.rcaa.gov.rw/eaip/history-en-GB.html"},
    "Bahrain":        {"type": "A", "history_url": "https://www.caabahrain.gov.bh/eaip/history-en-GB.html"},
    "Myanmar":        {"type": "A", "history_url": "https://aim.dca.gov.mm/eaip/history-en-GB.html"},
    "Malaysia":       {"type": "A", "history_url": "https://aip.dca.gov.my/eaip/history-en-GB.html"},
    "Thailand":       {"type": "A", "history_url": "https://www.aerothai.co.th/eaip/history-en-GB.html"},
    "Hong Kong":      {"type": "A", "history_url": "https://www.ais.gov.hk/eaip/history-en-GB.html"},
    "Chile":          {"type": "A", "history_url": "https://www.dgac.gob.cl/eaip/history-en-GB.html"},
    "Oman":           {"type": "A", "history_url": "https://www.caa.gov.om/eaip/history-en-GB.html"},
    "Bosnia":         {"type": "A", "history_url": "https://www.bhansa.gov.ba/eaip/history-en-GB.html"},
    "Kosovo":         {"type": "A", "history_url": "https://www.caa-ks.net/eaip/history-en-GB.html"},
    "North Macedonia":{"type": "A", "history_url": "https://caa.mk/eaip/history-en-GB.html"},
    "Costa Rica":     {"type": "A", "history_url": "https://www.dgac.go.cr/eaip/history-en-GB.html"},
    "El Salvador":    {"type": "A", "history_url": "https://www.dgac.gob.sv/eaip/history-en-GB.html"},
    "Honduras":       {"type": "A", "history_url": "https://www.dac.gob.hn/eaip/history-en-GB.html"},
    "Venezuela":      {"type": "A", "history_url": "https://www.inac.gob.ve/eaip/history-en-GB.html"},
    "Cambodia":       {"type": "A", "history_url": "https://www.ssca.gov.kh/eaip/history-en-GB.html"},
    "Somalia":        {"type": "A", "history_url": "https://nacsom.gov.so/eaip/history-en-GB.html"},
    "Cabo Verde":     {"type": "A", "history_url": "https://www.asa.cv/eaip/history-en-GB.html"},
    "Belarus":        {"type": "A", "history_url": "https://www.belaeronavigatsia.by/eaip/history-en-GB.html"},
    # TYPE B
    "Poland": {
        "type": "B",
        "history_url": "https://www.ais.pansa.pl/eaip/default_offline_2026-03-19.html",
        "base_url":    "https://www.ais.pansa.pl/eaip/",
    },
    # TYPE C
    "ASECNA": {
        "type": "C",
        "portal_url": "https://aim.asecna.aero/html/index-fr-FR.html",
        "countries": [
            "Benin","Burkina Faso","Cameroon","Central African Republic",
            "Chad","Comoros","Congo","Cote d'Ivoire","Gabon","Guinea",
            "Guinea-Bissau","Madagascar","Mali","Mauritania","Niger","Senegal","Togo"
        ],
    },
    # TYPE D
    "Sri Lanka": {
        "type": "D",
        "index_url":