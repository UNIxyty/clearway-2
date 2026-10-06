# Passenger Manifest generator

Fills Clearway's border-authority Passenger Manifest (`CWY PAX Manifest.pdf`, design project *Passenger
Manifest.dc.html* + `passenger-manifest-spec.md`) from Leon. **No model output reaches the paper**: the agent only
chooses which flight; typed code reads Leon and draws the page.

## The boundary

```js
import { generatePassengerManifest, generateBlankManifest } from "./index.mjs";
const { pdf, filename, result } = await generatePassengerManifest({ flightId: "klj:74375326" });
// result: { flight, pageCount, passengerCount, crewCount, personsOnBoard, warnings[], missing[], blank }
```

- Takes an identifier, never data; reads Leon itself, **read-only**, with the **flight's operator's credentials**
  from the operator registry (`../leon-operators.mjs`). Nothing is asked of the user: being signed in to the portal
  with agent access (the agent's existing, fail-closed gate) is the only gate.
- `result` carries **no passenger field**. Warnings name a passenger by row and page only, because they are shown in
  the chat and stored in the audit log.
- Script: `node agent/scripts/pax-manifest.mjs --flight <oprId:nid> --out f.pdf`, `--blank`, or `--rig <state>`
  (fake fixtures). Agent: tools `make_passenger_manifest` and `search_manifest_flights`; commands `/manifest`,
  `/blank-manifest`.

## Operators: where the list lives, how one is added

The operators are the rows of the **`leon_operators`** table (Supabase), the same registry the Digital Wall syncs
from. To add one, open the **Digital Wall console → Operators → Add operator**, enter a display name, the operator's
**Leon subdomain** (e.g. `klj` for klj.leon.aero) and the Leon API refresh token the operator gave us, and save; the token is stored
encrypted. Within 30 seconds the agent's manifest search lists that operator's flights and can generate its
manifests — no code change, no redeploy. Disabling or deleting the row removes it the same way. An operator whose
token fails (expired, revoked, unreadable) is shown as unavailable in the picker; every other operator keeps
working.

## Rendering route: pdf-lib, fonts embedded

pdf-lib (pure JS) rather than the agent's Chromium HTML→PDF route, because: the spec's coordinates are points and go
to the page with no layout engine between; the font file that measures is the file that is embedded, so nothing is
looked up on the host and DejaVu substitution cannot happen; and the document carries no metadata but its title and
creation date (Chromium stamps a Producer). Glyph advances are floored to 1/64 of a layout unit exactly as the
reference (a Chrome/Skia print) places them, so text lands where the reference's does.

## Font: pinned, embedded, checked twice

- `assets/LiberationSans-{Regular,Bold}.ttf` — Liberation Sans 2.1.5 (the font the reference itself embeds; metric-
  compatible with Helvetica/Arial), SIL OFL (`assets/LiberationSans-LICENSE.txt`). sha256 pinned in `fonts.mjs`.
- `fonts.mjs` refuses (throws) if a file is missing or differs — no manifest is rendered with anything else.
- Build check: `agent/scripts/check-manifest-font.mjs` (Dockerfile `RUN`) renders a manifest and reads the output PDF:
  only `CWPAXR+LiberationSans` and `CWPAXB+LiberationSans-Bold`, both embedded, or the image build fails.
- Startup: `server.mjs` checks again, logs loudly, and reports `manifestFont` in `/api/health`.

## Overlay against the reference (`rig/manifest/overlay.py`)

Largest positional difference **0.49 pt** (the `EXPIRES` heading's x). Rules 0.01 pt, baselines 0.004 pt, logo ink
box 0.24 pt (one 300-dpi pixel). Where the overlay showed the spec off, the reference won (all in `layout.mjs`):

| Spec | Reference | Used |
|---|---|---|
| 0.768 pt per layout unit | 0.48 × 1.60039174 = **0.768188** (0.19 pt at the right edge) | exact factor; geometry written in units |
| Title centred on 420.87 | 420.76 | 420.76 |
| Caption centred on 218.48 | 217.83 | 217.83 |
| Logo: SVG fitted in the image box | the SVG is different artwork (larger mark, heavier lettering; ink box off by up to 10 pt) | the reference's own logo image at its exact box — `LOGO_SOURCE` |

The reference's logo image is 213 × 43 px (≈ 94 dpi at 163.6 pt): a higher-resolution original would print sharper.

## The four open questions — one constant each (`config.mjs`)

| Constant | Default | Meaning |
|---|---|---|
| `PERSONS_ON_BOARD_INCLUDES_CREW` | `true` | Persons on Board = passengers + crew. Leon has no POB field; its passenger counts (list count, flight-watch, journey-log) are compared and any disagreement is a warning. |
| `NATIONALITY_FORMAT` | `"as-stored"` | Leon's `Country.name` as entered (`"iso"` = Leon's `codeIso`). Never converted. |
| `DOCUMENT_LEG` | `"departure"` | Which travel document fills PASSPORT No./EXPIRES. A differing other-leg document is a warning naming the row. |
| `LOGO_SOURCE` | `"raster"` | The reference's image (see above); `"svg"` = the design's SVG. |

## Data (Leon → form)

`flight(flightNid)`: `operator.name`, `acft.registration`, `flightNo`, `startTimeUTC` (→ `DD-Mon-YYYY`, UTC),
`startAirport/endAirport.code.icao`, `crewMemberList` (count), `passengerList.passengerContactList[]` in Leon's order:
`contact.{surname,name,middleName,genderEnum,dateOfBirth,placeOfBirth,nationality}`, `departurePassport` /
`arrivalPassport` `{number, expiresDate, neverExpires, isMasked, surname, name, nationality}`, travel documents and
national IDs. A missing value is blank — never N/A or a dash. Masked passports (`isMasked`) are asked once more via
`unmaskedData`, which Leon answers only if the operator's API account may unmask; otherwise blank + warning. Flights in
the Clearway aggregator tenant are stored under `CWY_CWY`, not their operating carrier: Owner or Operator is left
blank with a warning (`NOT_AN_OPERATOR` in `leon.mjs`).

## Storage, privacy, retention

- File: `<INTAKE_ROOT>/manifests/YYYY/MM/<uuid>/PAX-Manifest_<callsign>_<DDMonYYYY>.pdf` — on the server
  `/mnt/hdd-storage/intake/manifests/…` (container `/intake/manifests/…`), the intake mail's disk. Directories 0700,
  files 0600. Served only by the signed-in, owner-only `GET /agent/api/files/:id` (`cache-control: private, no-store`).
- Row: `agent_generated_files` kind `pax-manifest` (filename, title = flight reference, hash, who, when).
- Retention: bytes deleted after **30 days** (`MANIFEST_RETENTION_DAYS`); the row stays as the record it existed.
- Never logged; no passenger field in the filename, the PDF metadata (title + creation date only, no XMP), the
  audit log, the chat, an email body or any search index.

## Tests

`rig/manifest/test-generator.mjs` (rules: verbatim strings, order, pagination, blanks, dates, warnings),
`rig/manifest/overlay.py` (reference overlay), `rig/manifest/browser.mjs` (the command in the console: every operator,
picker states, an unavailable operator, progress, viewer, warnings, transcript, voice). Rig: `rig/start.sh`, then
`rig/manifest/start.sh` and `node --env-file=.env.rig rig/manifest/operators.mjs seed`.
