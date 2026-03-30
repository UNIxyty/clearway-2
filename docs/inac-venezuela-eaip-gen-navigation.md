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

## Human / scripted flow: GEN_1 → GEN 1.2

1. Open the root index (or fetch `Menu-en-GB.html` directly for parsing).
2. In **`Menu-en-GB.html`**, ensure **PART 1 - GENERAL (GEN)** is expanded (`id="GENdetails"`). The header uses `showHide('GEN', …)` in `menu.js`.
3. **Expand GEN_1:** click the control with `id="GEN_1plus"` (toggle `+`/`-`), or follow the link with `id="GEN_1"` (default `href` loads **GEN 1.1** in the content frame while running `showHide('GEN_1', SHOW)`).
4. **Open GEN 1.2:** click the anchor with `id="GEN 1.2"`:
   - `href="SV-GEN 1.2-en-GB.html"`
   - `title="GEN 1.2 ENTRY, TRANSIT AND DEPARTURE AIRCRAFT"`

## Direct content URL (no menu interaction)

The content frame resolves the same `href` relative to `eAIP/`:

```text
https://www.inac.gob.ve/eaip/2020-07-16/html/eAIP/SV-GEN%201.2-en-GB.html
```

Pattern: `SV-GEN {subsection}-en-GB.html` (note the **space** after `SV-GEN` in the filename; encode as `%20` in URLs.)

## Scraping strategy

1. **Preferred:** `GET` `Menu-en-GB.html`, parse `<a href='SV-GEN …-en-GB.html'>` inside `div#GENdetails` (and nested `div#GEN_*details`).
2. Build absolute URLs with base `…/html/eAIP/` and `encodeURIComponent` per file name.
3. Each section page is static HTML; follow locally linked assets (`*.css`, images) if mirroring.

## Portal mapping

- Canonical GEN TOC data for the app lives in `lib/inac-eaip-gen-toc.ts` (`INAC_EAIP_HTML_BASE`, `INAC_GEN_GROUPS`).
- Update that base URL when INAC changes the effective-date directory.
