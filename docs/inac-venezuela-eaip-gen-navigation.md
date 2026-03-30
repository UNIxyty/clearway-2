# INAC Venezuela eAIP — GEN & AD 2.1 navigation (for scripts and scrapers)

This document records how the official **English** eAIP index is structured: **GEN** sections and **Part 3 → AD_2** (AD 2.1 per ICAO), including the toolbar **PDF** mapping. Use it for Clearway downloaders and the portal links.

## Entry URLs

| Step | URL |
|------|-----|
| Amendment history (frameset; user picks effective issue) | `https://www.inac.gob.ve/eaip/history-en-GB.html` |
| History body (machine-readable list; lists effective hrefs) | `https://www.inac.gob.ve/eaip/history-body-en-GB.html` |
| Root frameset (example; use resolved `{YYYY-MM-DD}`) | `https://www.inac.gob.ve/eaip/{YYYY-MM-DD}/html/index-en-GB.html` |
| Table of contents (full menu document) | `https://www.inac.gob.ve/eaip/{YYYY-MM-DD}/html/eAIP/Menu-en-GB.html` |

### Resolving the active package (workflow)

1. **Human:** open `history-en-GB.html`, use the control under **Effective Date** for the **currently effective** release; the site navigates to that package’s `index-en-GB.html`.
2. **Automation:** `GET` **`history-body-en-GB.html`**, take the HTML slice from **`Currently Effective Issue`** up to (but not including) **`Next Issues`**, and match the first  
   `href="…/YYYY-MM-DD/html/index-en-GB.html"` → package root is `https://www.inac.gob.ve/eaip/YYYY-MM-DD` (no trailing slash required for joining paths).
3. **In Clearway:**
   - **`lib/inac-venezuela-eaip-resolve.ts`** — `parseEffectivePackagePathSegment()`, `resolveInacEaipPackageRoot()` (server-side `fetch`).
   - **`GET /api/inac-eaip-package-root`** — JSON `{ packageRoot, historyPageUrl, indexUrl }` (cached ~300s).
   - **CLI** (`inac-venezuela-eaip-http.mjs`): resolves from history unless **`--root`** or env override; on failure uses **`INAC_PACKAGE_ROOT_FALLBACK`** (last-known date in code).
4. All examples below use `{YYYY-MM-DD}`; substitute the resolved segment.

## Frame layout

`index-en-GB.html` is an XHTML **frameset** (not a single-page app):

1. **Column 1 (300px):** `toc-frameset-en-GB.html`
   - Top row: `commands-en-GB.html`
   - Bottom row: **`eAIP/Menu-en-GB.html`** — this is the clickable TOC.
2. **Column 2:** `eAISContent` — loads the selected HTML page (e.g. GEN section bodies).

Automation tools must target **frames** (Playwright: `frameLocator`, Puppeteer: `page.frames()`). Simple `page.click` on the top document will not see GEN links.

## Human / scripted flow: GEN_1 → GEN 1.2 → PDF

1. Open the root index (or fetch `Menu-en-GB.html` directly for parsing).
2. In **`Menu-en-GB.html`**, ensure **PART 1 - GENERAL (GEN)** is expanded (`id="GENdetails"`). The header uses `showHide('GEN', …)` in `menu.js`.
3. **Expand GEN_1:** click the control with `id="GEN_1plus"` (toggle `+`/`-`), or follow the link with `id="GEN_1"` (default `href` loads **GEN 1.1** in the content frame while running `showHide('GEN_1', SHOW)`).
4. **Open GEN 1.2:** click the anchor with `id="GEN 1.2"`:
   - `href="SV-GEN 1.2-en-GB.html"`
   - `title="GEN 1.2 ENTRY, TRANSIT AND DEPARTURE AIRCRAFT"`
5. **Download PDF:** use the **PDF** control in the **top-left commands bar** (`commands-en-GB.html`, next to **History**). It is an `<a>` with `onmousemove="changeHrefToPdf(this)"` and `target="eAISContent"`. In `commands.js`, `changeHrefToPdf` sets `href` from the HTML currently shown in frame `eAISContent`: **`/html` → `/pdf`** and the file maps to **`pdf/eAIP/<stem>.pdf`** (see below). Do not assume the HTML URL alone is the deliverable for archiving — use the PDF when that is the required artifact.

## Direct HTML URL (optional)

The content frame resolves the menu `href` relative to `eAIP/`:

```text
https://www.inac.gob.ve/eaip/{YYYY-MM-DD}/html/eAIP/SV-GEN%201.2-en-GB.html
```

Pattern: `SV-GEN {subsection}-en-GB.html` (note the **space** in many filenames; encode as `%20` in URLs.)

## Direct PDF URL (same as the “PDF” button)

For GEN files named `SV-{STEM}-en-GB.html`, the PDF is:

```text
https://www.inac.gob.ve/eaip/{YYYY-MM-DD}/pdf/eAIP/{STEM}.pdf
```

Example — GEN 1.2:

```text
https://www.inac.gob.ve/eaip/{YYYY-MM-DD}/pdf/eAIP/GEN%201.2.pdf
```

`{STEM}` includes spaces (e.g. `GEN 1.2`, `GEN 0.1`). Use `encodeURIComponent` on the stem.

## Part 3 — AD_2 (AD 2.1 per aerodrome) → PDF

In **`Menu-en-GB.html`**, under **PART 3 - AERODROMES (AD)**, expand **`AD_2`** (`id="AD_2"`). Each aerodrome is a link:

- Example ICAO **SVMC**: `href="SV-AD2.1SVMC-en-GB.html"` (`id="AD2.1SVMC"`, `title="SVMC"`).
- After opening that HTML in **`eAISContent`**, the toolbar **PDF** control serves:

```text
https://www.inac.gob.ve/eaip/{YYYY-MM-DD}/pdf/eAIP/AD2.1SVMC.pdf
```

Pattern: HTML `SV-AD2.1{ICAO}-en-GB.html` → PDF stem `AD2.1{ICAO}` (no space). Same `SV-{STEM}-en-GB.html` → `/pdf/eAIP/{STEM}.pdf` rule as GEN.

**Script:** `scripts/inac-venezuela-eaip-ad2-download.mjs` loads the menu, checks the ICAO appears under AD_2, GETs HTML, then GETs PDF:

```bash
node scripts/inac-venezuela-eaip-ad2-download.mjs --icao SVMC
node scripts/inac-venezuela-eaip-ad2-download.mjs --icao SVBC --dry-run
```

Output directory: `downloads/inac-venezuela-eaip/AD2/` (under the same gitignored tree as GEN).

Run **without `--icao`** in a normal terminal to get the **ICAO list prompt** (same list as interactive AD path):

```bash
node scripts/inac-venezuela-eaip-ad2-download.mjs
```

**Portal:** `inacAd21PdfUrl(icao, packageRoot)` / `inacAd21HtmlFile()` in `lib/inac-eaip-gen-toc.ts`; `/gen` fetches `/api/inac-eaip-package-root` for SV airports and passes `packageRoot` into URL helpers.

Shared CLI pieces: `inac-venezuela-eaip-http.mjs`, `inac-venezuela-eaip-prompts.mjs`.

## Scraping strategy

1. **Preferred:** `GET` `Menu-en-GB.html`, parse `<a href='SV-GEN …-en-GB.html'>` inside `div#GENdetails` (and nested `div#GEN_*details`).
2. For **HTML:** base `…/html/eAIP/` + `encodeURIComponent(file)`.
3. For **PDF (recommended for GEN downloads):** map each `SV-{STEM}-en-GB.html` to `…/pdf/eAIP/{STEM}.pdf` with `encodeURIComponent({STEM})`.
4. Section HTML pages are static; follow local assets (`*.css`, images) only if mirroring the HTML UI.

## Interactive downloader (prompts)

```bash
node scripts/inac-venezuela-eaip-interactive.mjs
```

Asks whether you want **GEN** or **AD 2.1**.

- **GEN:** choose **GEN_0 … GEN_4** (same blocks as the site menu), then one section, all sections in that block, or use **`l`** for a flat list of every GEN PDF key; **`a`** still downloads all GEN PDFs.
- **AD 2.1:** loads the menu and shows a **numbered list of ICAOs** (Part 3 → AD_2); pick a number or type the ICAO, then it downloads the PDF (HTML + toolbar-equivalent PDF).

## Automation scripts (non-interactive)

`scripts/inac-venezuela-eaip-gen-download.mjs` runs: GET index → GET `eAIP/Menu-en-GB.html` → parse `SV-GEN … -en-GB.html` → for each section GET HTML then GET PDF.

```bash
node scripts/inac-venezuela-eaip-gen-download.mjs --only "GEN 1.2"
node scripts/inac-venezuela-eaip-gen-download.mjs --dry-run
```

**TLS:** Node often cannot verify `www.inac.gob.ve` (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). The script **retries with relaxed verification** after the first failure by default. To skip verification from the start: `--insecure` or `INAC_TLS_INSECURE=1`. To **fail** instead of retrying: `--strict-tls` or `INAC_TLS_STRICT=1`.

PDFs are written under `downloads/inac-venezuela-eaip/GEN/` (gitignored).

## Portal mapping

- **Resolution:** `lib/inac-venezuela-eaip-resolve.ts` (`INAC_HISTORY_PAGE_URL`, `INAC_HISTORY_BODY_URL`, `INAC_PACKAGE_ROOT_FALLBACK`).
- **TOC + URLs:** `lib/inac-eaip-gen-toc.ts` — `INAC_GEN_GROUPS`, `inacEaipGenPdfUrl(htmlFile, packageRoot)`, `inacEaipGenHtmlUrl()`, `inacAd21PdfUrl(icao, packageRoot)`.
- The `/gen` page resolves **packageRoot** via **`GET /api/inac-eaip-package-root`**, then lists **GEN** PDFs and **AD 2.1** PDF for the selected SV airport. On API/history failure it falls back to `INAC_PACKAGE_ROOT_FALLBACK` and shows a warning.

Shared modules: `scripts/inac-venezuela-eaip-http.mjs`, `scripts/inac-venezuela-eaip-prompts.mjs`, `scripts/inac-venezuela-eaip-interactive.mjs`.
