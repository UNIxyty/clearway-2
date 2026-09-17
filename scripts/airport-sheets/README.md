# Airport sheet generator

Reproduces the Clearway airport one-pager (reference: `EYVI_VILNIUS.pdf`) as an
HTML/CSS template rendered to A4 PDF with Playwright Chromium — one PDF per
airport, named by ICAO.

```
node scripts/generate-airport-sheets.mjs                  # all airports in airports.json
node scripts/generate-airport-sheets.mjs --icao EYVI      # one airport (or EYVI,LROP,…)
node scripts/generate-airport-sheets.mjs --out DIR        # default /mnt/ssd-cache/airport-sheets
node scripts/generate-airport-sheets.mjs --zip            # also write airport-sheets.zip
node scripts/generate-airport-sheets.mjs --data FILE      # alternative data file
```

On the server output defaults to `/mnt/ssd-cache/airport-sheets` (never the root
volume); on a machine without `/mnt/ssd-cache` it falls back to
`data/.tmp/airport-sheets`.

The generator reads the `airports/` folder by default (each airport's JSON lives
in its own folder next to nothing else, so filling them in is per-airport work).
A placeholder that hasn't been filled in yet (country and airport name still
empty) is skipped and reported, not rendered as an empty sheet. `--data` also
accepts a flat JSON-array file like `airports.json`.

## Where to drop files

```
scripts/airport-sheets/
├── airports/              ← THE data source: one folder per airport
│   ├── EYVI/EYVI.json     (filled in — the model entry)
│   ├── LROP/LROP.json     (placeholder: fill in the empty values)
│   └── …                  (104 airports)
├── airports.json          ← flat-array alternative / schema example
├── airports.stress.json   ← layout stress-test data (long names, missing fields)
├── template.html          ← the sheet layout; edit here to tweak the design
└── assets/
    ├── logos/             ← shared, fixed for every sheet
    │   ├── clearway.png   (header logo)
    │   ├── ebaa.png       (footer)
    │   └── nbaa.png       (footer)
    ├── hero/EYVI.jpg      ← top-left photo, one per airport, named <ICAO>.jpg
    └── pax/EYVI.jpg       ← PAX Facilities photo, named <ICAO>.jpg
```

Photos are found automatically by ICAO (`hero/<ICAO>.jpg`, `pax/<ICAO>.jpg`;
`.jpeg`/`.png`/`.webp` also work). An explicit `images.hero` / `images.pax`
path in the airport's entry overrides the automatic lookup.

**Image sizes** (slots crop with `object-fit: cover`, so any larger image works —
these ratios avoid cropping surprises):

- hero: **1.75 : 1** landscape, ≥ 1200 × 690 px (slot 402 × 230 pt)
- pax: **1.48 : 1** landscape, ≥ 800 × 540 px (slot 266 × 180 pt)

## Data schema

```jsonc
{
  "icao": "EYVI",                    // required, names the output PDF
  "iata": "VNO",
  "country": "Lithuania",
  "airportName": "Vilnius Int. Airport",
  "info": {                          // labels are fixed in the template; values here
    "slotPpr": "not required",
    "airportOfEntry": "yes",
    "paxHandling": "VIP Terminal",
    "customs": "available",
    "hangar": "available",
    "rampAccess": "possible",
    "fireCategory": "7",
    "fuel": "JET A-1",
    "runway": "8251' x 164' fts",
    "elevation": "649' fts",
    "distanceToCity": "7 km",
    "timeZone": "UTC +2 / when DST UTC +3"
  },
  "paxFacilities": "VIP Terminal",   // small line under the PAX Facilities heading
  "contacts": { "tel": "+371 67 660 773", "email": "eyvi@clearway.aero",
                "sita": "RIXCWCR", "aftn": "KTEBXAAX" },
  "images": { "hero": "hero/EYVI.jpg", "pax": "pax/EYVI.jpg" }  // optional, auto-found by ICAO
}
```

Fixed in the template (not per airport): the Our Services and Our Customers
lists, the website (`www.clearway.aero`), and all three logos. Two corrections
vs the original hand-made sheet are baked in: `www.clearway.earo` →
`www.clearway.aero`, and "Permit assistant" → "Permit assistance".

## Missing data / images

- A missing `info.*` or `contacts.*` field **omits that row** — no dangling
  labels, no placeholders. The summary lists every airport with missing fields.
- A missing hero photo becomes a neutral grey-blue gradient (the "Ground
  Handling" overlay stays); a missing PAX photo becomes a plain grey block.
  The sheet always generates.
- Long names/values shrink or wrap: the title auto-shrinks until it clears the
  info panel; panel values wrap within the panel. Stress-test with
  `--data scripts/airport-sheets/airports.stress.json`.

## Fidelity notes

- Output is deterministic: the same data produces byte-identical PDFs
  (Chromium's creation date and document ID are pinned).
- Font: the sheet uses Arial/Helvetica. The original's headings are an exact
  match; its body text is a slightly rounder humanist sans (Lato/Open Sans
  family, not web-safe), so body text is the closest metric fit, not
  glyph-identical.
- The reference's Vilnius sheet lists a +371 (Latvia) phone number for a
  Lithuanian station — kept as data (`contacts.tel`), so correct it in
  `airports.json` if it isn't the central 24h desk.
