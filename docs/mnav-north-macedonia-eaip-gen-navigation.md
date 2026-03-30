# M-NAV North Macedonia eAIP — GEN & AD 2 navigation

Official English AIP: [Start.htm](https://ais.m-nav.info/eAIP/Start.htm) → **Current version** → `current/en/index.htm` (frameset: `menu.htm` + `content.htm`).

The sidebar is built from JavaScript: **`current/en/tree_items.js`** (`TREE_ITEMS`). Plus/minus icons expand nodes; leaf entries link directly to PDFs (paths relative to `en/`).

## Part 1 — GEN

1. In the menu tree, expand **GEN**.
2. Click the **+** beside **GEN 1 National regulations and requirements** to open the subsection list.
3. Open **GEN 1.2 Entry, transit and departure of aircraft** — same PDF as in the tree: `../pdf/gen/LW_GEN_1_2_en.pdf` (absolute URL = resolve from `…/current/en/`).

Other GEN sub-parts follow the same pattern (`LW_GEN_*_en.pdf` under `current/pdf/gen/`).

## Part 3 — AD 2 Aerodromes

1. Expand **AD** → **AD 2 Aerodromes** (the row opens the aerodrome list).
2. Expand the **+** next to the aerodrome (e.g. **LWSK - Skopje**).
3. Choose **Textpages** — PDF `../pdf/aerodromes/LW_AD_2_{ICAO}_en.pdf`.

Charts live under `current/aipcharts/{ICAO}/` and are separate menu entries.

## Automation in Clearway

- **Resolve package root:** `lib/mnav-north-macedonia-eaip-resolve.ts`, **`GET /api/mnav-eaip-package-root`** → `packageRoot` = `https://ais.m-nav.info/eAIP/current/en`.
- **TOC + URLs:** `lib/mnav-north-macedonia-eaip-toc.ts` — `MNAV_GEN_GROUPS`, `mnavPdfUrlFromMenuRelative()`, `mnavAd2TextPagesPdfUrl()`.

When M-NAV adds an aerodrome, update `MNAV_AD2_AERODROMES` and `tree_items.js` parsing notes if filenames change.

## CLI download scripts

From the repo root (Node 18+). Package root defaults to **resolving [Start.htm](https://ais.m-nav.info/eAIP/Start.htm)** (current version → `…/current/en`). Override with `--root` or `MNAV_EAIP_PACKAGE_ROOT` if needed.

```bash
# Interactive menu (GEN vs AD 2)
node scripts/mnav-north-macedonia-eaip-interactive.mjs

# All GEN PDFs (from tree_items.js)
node scripts/mnav-north-macedonia-eaip-gen-download.mjs
node scripts/mnav-north-macedonia-eaip-gen-download.mjs --dry-run
node scripts/mnav-north-macedonia-eaip-gen-download.mjs --only "GEN 1.2"

# AD 2 Textpages for one ICAO
node scripts/mnav-north-macedonia-eaip-ad2-download.mjs --icao LWSK
node scripts/mnav-north-macedonia-eaip-ad2-download.mjs   # prompt with ICAO list (TTY)

# TLS issues (same idea as INAC)
MNAV_TLS_INSECURE=1 node scripts/mnav-north-macedonia-eaip-gen-download.mjs --dry-run
```

Output directories (gitignored): `downloads/mnav-north-macedonia-eaip/GEN/` and `…/AD2/`.

Shared: `scripts/mnav-north-macedonia-eaip-http.mjs`, `scripts/mnav-north-macedonia-eaip-prompts.mjs`.
