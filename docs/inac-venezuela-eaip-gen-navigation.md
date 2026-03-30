# INAC Venezuela eAIP — GEN navigation (for scripts and scrapers)

This document records how the official **English** eAIP index is structured and how to reach **GEN_1 → GEN 1.2** programmatically. Use it when building downloaders or mirrors for Clearway.

## Entry URLs

| Step | URL |
|------|-----|
| Root frameset | `https://www.inac.gob.ve/eaip/2020-07-16/html/index-en-GB.html` |
| Table of contents (full menu document) | `https://www.inac.gob.ve/eaip/2020-07-16/html/eAIP/Menu-en-GB.html` |

Replace the path segment `2020-07-16` when INAC publishes a new AIP effective date.

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
https://www.inac.gob.ve/eaip/2020-07-16/html/eAIP/SV-GEN%201.2-en-GB.html
```

Pattern: `SV-GEN {subsection}-en-GB.html` (note the **space** in many filenames; encode as `%20` in URLs.)

## Direct PDF URL (same as the “PDF” button)

For GEN files named `SV-{STEM}-en-GB.html`, the PDF is:

```text
https://www.inac.gob.ve/eaip/2020-07-16/pdf/eAIP/{STEM}.pdf
```

Example — GEN 1.2:

```text
https://www.inac.gob.ve/eaip/2020-07-16/pdf/eAIP/GEN%201.2.pdf
```

`{STEM}` includes spaces (e.g. `GEN 1.2`, `GEN 0.1`). Use `encodeURIComponent` on the stem.

## Scraping strategy

1. **Preferred:** `GET` `Menu-en-GB.html`, parse `<a href='SV-GEN …-en-GB.html'>` inside `div#GENdetails` (and nested `div#GEN_*details`).
2. For **HTML:** base `…/html/eAIP/` + `encodeURIComponent(file)`.
3. For **PDF (recommended for GEN downloads):** map each `SV-{STEM}-en-GB.html` to `…/pdf/eAIP/{STEM}.pdf` with `encodeURIComponent({STEM})`.
4. Section HTML pages are static; follow local assets (`*.css`, images) only if mirroring the HTML UI.

## Automation script (imitates browser flow)

`scripts/inac-venezuela-eaip-gen-download.mjs` runs the same logical steps: GET index → GET `eAIP/Menu-en-GB.html` → parse `SV-GEN … -en-GB.html` links → for each section GET HTML then GET PDF (`/pdf/eAIP/{stem}.pdf`).

```bash
node scripts/inac-venezuela-eaip-gen-download.mjs --only "GEN 1.2"
node scripts/inac-venezuela-eaip-gen-download.mjs --dry-run
```

Use `--insecure` if Node fails TLS verification against INAC (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). PDFs are written under `downloads/inac-venezuela-eaip/GEN/` (gitignored).

## Portal mapping

- Canonical GEN TOC data for the app lives in `lib/inac-eaip-gen-toc.ts` (`INAC_EAIP_PACKAGE_ROOT`, `INAC_EAIP_HTML_BASE`, `INAC_GEN_GROUPS`, `inacEaipGenPdfUrl()`, `inacEaipGenHtmlUrl()`).
- The `/gen` page lists **PDF** URLs for SV (Venezuela), matching the official toolbar behavior.
- Update the package root when INAC changes the effective-date directory.
