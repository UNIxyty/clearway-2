# EAD vs Scraper Routing Matrix

This matrix defines which pipeline is used per country/ICAO class.

## Routing Priority

1. USA static PDFs
2. Custom country scraper (`SCRAPER_COUNTRY_SPECS` / `SCRAPER_COUNTRIES`)
3. Russia custom downloader
4. Rwanda ASECNA flow
5. Generic EAD downloader

## Matrix

| Class | Country examples | Airport/API metadata source | AD2 PDF download | GEN PDF download |
|---|---|---|---|---|
| USA hardcoded | United States | USA static data | `usa-aip/*.pdf` / storage fallback | `usa-aip/GEN1.2.pdf` / storage fallback |
| Custom scraper country (non-EAD label) | India, Chile, Qatar | scraper batch meta | country script in `scripts/web-table-scrapers/*-interactive.mjs` | country script in `scripts/web-table-scrapers/*-interactive.mjs` |
| Custom scraper country (EAD label present) | France (LF), Netherlands (EH), Albania (LA) | **prefer scraper meta** (fallback EAD if scraper meta unavailable) | country script in `scripts/web-table-scrapers/*-interactive.mjs` | country script in `scripts/web-table-scrapers/*-interactive.mjs` |
| EAD country without own scraper | Bulgaria (LB), Italy (LI), Switzerland (LS), Ukraine (UK) | EAD generated country ICAOs | generic EAD (`ead-download-aip-pdf.mjs`) | generic EAD (`ead-download-gen-pdf.mjs`) |
| Shared scraper mapping | Faroe Islands (XX) via Denmark (EK) | EAD generated country ICAOs | mapped scraper by ICAO prefix/spec | mapped scraper by ICAO prefix/spec |
| Russia special | Russia | Russia DB | `rus_aip_download_by_icao.py` | `rus_aip_download_by_icao.py` |
| Rwanda special | Rwanda | scraper/ASECNA meta | ASECNA-backed flow in generic EAD script | ASECNA-backed flow in generic EAD script |

## Expected Behavior

- If a country has a custom scraper, scraper flow is preferred for sync/download APIs.
- EAD flow is preserved for countries without custom scrapers.
- EAD GEN/AD2 selectors must prefer text AIP documents over chart artifacts.
