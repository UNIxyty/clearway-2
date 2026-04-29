import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptCrewBriefingNotamText,
  CREWBRIEFING_SEARCH_INPUT_SELECTOR,
  extractCrewBriefingNotams,
  extractCrewBriefingWeather,
  isCrewBriefingSessionInvalidUrl,
  normalizeCrewBriefingMode,
} from "../scripts/crewbriefing-opmet-notams.mjs";

test("extractCrewBriefingNotams keeps only numbered NOTAM blocks", () => {
  const raw = `
NOTAM search performed 2026-04-29 07:53:38.

NOTAM number within each section shown above each NOTAM followed by separation line.
Company filter applied.

Airport  EVRA

|#1|----------------------------------------------------------------------------
A1764/26 NOTAMN                                                     [star | -14]
Q) EVRR/QPAAU/I/NBO/A/000/999/5655N02358E005
A) EVRA B) 2605140000 C) 2608132359EST
E) STAR RWY 18 - TUSAS2R
STAR RWY 36 - TUSAS2U, TUSAS2V NOT AVAILABLE.

|#2|----------------------------------------------------------------------------
A1554/26 NOTAMN                                                      [twy | -14]
Q) EVRR/QMXTT/IV/BO/A/000/999/5655N02358E005
A) EVRA B) 2605140000 C) 2605272359
E) TRIGGER NOTAM - AIRAC AIP SUP 011/2026 WEF 14 MAY 2026 TIL 05 AUG
2026.
TAXIWAYS E AND F RESTRICTIONS DUE TO MAINTENANCE WORKS.

NOTAMs excluded in accordance with FSP CLEARWAY company policy
US Military NOTAMs excluded.
End of NOTAM Search
`;

  assert.equal(
    extractCrewBriefingNotams(raw),
    `|#1|----------------------------------------------------------------------------
A1764/26 NOTAMN                                                     [star | -14]
Q) EVRR/QPAAU/I/NBO/A/000/999/5655N02358E005
A) EVRA B) 2605140000 C) 2608132359EST
E) STAR RWY 18 - TUSAS2R
STAR RWY 36 - TUSAS2U, TUSAS2V NOT AVAILABLE.

|#2|----------------------------------------------------------------------------
A1554/26 NOTAMN                                                      [twy | -14]
Q) EVRR/QMXTT/IV/BO/A/000/999/5655N02358E005
A) EVRA B) 2605140000 C) 2605272359
E) TRIGGER NOTAM - AIRAC AIP SUP 011/2026 WEF 14 MAY 2026 TIL 05 AUG
2026.
TAXIWAYS E AND F RESTRICTIONS DUE TO MAINTENANCE WORKS.`
  );
});

test("extractCrewBriefingWeather keeps airport weather and drops WX wrapper text", () => {
  const raw = `
TAF/METAR Search

(WX search performed 2026-04-29 07:58:21 UTC.
Searched for METAR and TAF.)

Airport  EVRA - RIX - RIGA     RWY  18 36
METAR 290750Z 24010KT 9999 FEW024 05/M01 Q1026 NOSIG
TAF EVRA 290500Z 2906/3006 24012KT 9999 SCT025
TEMPO 2906/2912 6000 -RA BKN014

End of WX Search
`;

  assert.equal(
    extractCrewBriefingWeather(raw),
    `Airport  EVRA - RIX - RIGA     RWY  18 36
METAR 290750Z 24010KT 9999 FEW024 05/M01 Q1026 NOSIG
TAF EVRA 290500Z 2906/3006 24012KT 9999 SCT025
TEMPO 2906/2912 6000 -RA BKN014`
  );
});

test("normalizeCrewBriefingMode accepts interactive menu aliases", () => {
  assert.equal(normalizeCrewBriefingMode("1"), "notam");
  assert.equal(normalizeCrewBriefingMode("weather"), "weather");
  assert.equal(normalizeCrewBriefingMode("BOTH"), "both");
  assert.throws(() => normalizeCrewBriefingMode("charts"), /Invalid mode/);
});

test("CrewBriefing search selector skips hidden ASP.NET text inputs", () => {
  assert.match(CREWBRIEFING_SEARCH_INPUT_SELECTOR, /:visible/);
});

test("isCrewBriefingSessionInvalidUrl detects invalid Extra session pages", () => {
  assert.equal(
    isCrewBriefingSessionInvalidUrl("https://www.crewbriefing.com/Cb_Extra/2.5.19/SessionInvalid_ErrorPage.aspx"),
    true
  );
  assert.equal(
    isCrewBriefingSessionInvalidUrl("https://www.crewbriefing.com/Cb_Extra/2.5.19/NOTAM/Notams.aspx"),
    false
  );
});

test("adaptCrewBriefingNotamText creates compatible notam objects", () => {
  const notams = adaptCrewBriefingNotamText(`
|#1|----------------------------------------------------------------------------
A1764/26 NOTAMN
Q) EVRR/QPAAU/I/NBO/A/000/999/5655N02358E005
A) EVRA B) 2605140000 C) 2608132359EST
E) STAR RWY 18 - TUSAS2R
`, "EVRA");
  assert.equal(notams.length, 1);
  assert.equal(notams[0].location, "EVRA");
  assert.equal(notams[0].number, "A1764/26");
  assert.match(notams[0].condition, /STAR RWY 18/);
});
