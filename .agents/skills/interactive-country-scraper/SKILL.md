---
name: interactive-country-scraper
description: Build and integrate a country interactive AIP scraper from a provided portal link. Use when adding new country scrapers, validating reachability/bot-blocking/TLS behavior, extracting effective date and AD2 ICAOs, downloading GEN/AD2 PDFs, and wiring scraper into portal + sync server.
---

# Interactive Country Scraper

Create robust country scrapers from a provided AIP portal URL, then connect them to the project pipeline.

## Scope

Use this for new scripts in `scripts/web-table-scrapers/*-interactive.mjs` that must:
- inspect a country portal
- collect effective date + AD2 ICAO set
- download GEN and AD2 PDFs
- support interactive mode and non-interactive flags
- integrate with portal + sync-server routing

## Required Output Contract

Every scraper must support collect mode:

`node scripts/web-table-scrapers/<country>-interactive.mjs --collect`

Must print exactly one JSON line to stdout:
- `{"effectiveDate": "...", "ad2Icaos": ["...."]}`

Use shared helper: `scripts/web-table-scrapers/_collect-json.mjs`.

## Phase 0: Preflight Link Audit (mandatory first)

Before writing scraper logic, audit link health and anti-bot behavior.

1. Probe provided root URL with:
   - `scripts/aim-links-probe.mjs` (classification)
   - quick `fetch`/`curl` checks for redirects, status, content-type
2. For discovered sublinks (menu/toc/GEN/AD):
   - verify reachable (2xx/3xx)
   - detect bot-blocking/WAF/CAPTCHA/login walls
   - detect TLS issues (`CERT_HAS_EXPIRED`, handshake resets, SNI problems)
3. Record whether scraper should:
   - use normal fetch
   - retry with browser-like User-Agent
   - allow `--insecure` fallback
   - use Playwright fallback for HTML rendering-only pages

If source is blocked or unstable, do not guess. Add explicit retries/fallbacks and clear errors.

## Phase 1: Discover navigation model

Determine which model the site uses:
- direct HTML page with PDF anchors
- frameset (`index -> toc -> menu`)
- JS tree/menu
- SPA shell requiring rendered DOM

Extract:
- effective date text and normalization to ISO when possible
- GEN links (especially GEN 1.2)
- AD2 links per ICAO

For AD2, prefer the required document type (example: "Text data") and ignore chart-only links if not needed.

## Phase 2: Implement scraper script

Create `scripts/web-table-scrapers/<country>-interactive.mjs` with:

1. CLI modes:
   - interactive chooser
   - `--collect`
   - `--download-gen12`
   - `--download-ad2 <ICAO>`
   - optional `--insecure`
2. Stable parsing:
   - robust regex/DOM parsing
   - dedupe entries
   - normalize ICAOs uppercase
3. Download behavior:
   - create output dirs under `downloads/<country-slug>/GEN` and `.../AD2`
   - verify PDF magic (`%PDF-`) before saving
   - deterministic file names with date/icao where possible
4. Error handling:
   - actionable errors (missing section, no ICAOs, blocked URL, invalid PDF body)
   - retries for transient network failures

## Phase 3: Integration wiring

After scraper works, wire it into project:

1. `lib/scraper-country-config.ts`
   - add country, ICAO prefixes (or `extraIcaos`), webAipUrl
2. `scripts/aip-sync-server.mjs`
   - add `SCRAPER_COUNTRY_SPECS` entry with script + `ad2Dir` + `genDir`
3. `scripts/web-table-scrapers/00-CONNECTED-SCRAPERS.md`
   - add script entry
4. `data/regions.json` (if missing in menu)
   - add country to correct region list
5. `scripts/tools/collect-all-packages.mjs`
   - add `WEB_AIP_BY_COUNTRY` mapping for the country

## Phase 4: Verify end-to-end

Minimum verification before completion:

1. Syntax check:
   - `node --check scripts/web-table-scrapers/<country>-interactive.mjs`
2. Collect contract:
   - `node scripts/web-table-scrapers/<country>-interactive.mjs --collect`
   - ensure valid JSON and realistic ICAOs
3. Download tests:
   - one `--download-gen12`
   - one `--download-ad2 <ICAO>`
   - confirm resulting file is valid PDF
4. Pipeline checks:
   - country resolves via scraper config
   - sync server spec exists
   - country appears in region menu list (if intended)

## Implementation Notes

- Reuse patterns from existing scrapers in `scripts/web-table-scrapers/`.
- Keep parser logic focused on source-specific structure; avoid over-generalization.
- Use browser fallback only when fetch cannot obtain needed HTML.
- Do not include downloaded PDFs in commits unless explicitly requested.

