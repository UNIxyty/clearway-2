import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveGreeceAipIndexUrl,
  shouldUseGreeceAipIndex,
} from "../lib/greece-hitl-navigation.mjs";

const AIP_INDEX = "https://aisgr.hasp.gov.gr/aipgr_incl_amdt_0426_wef_14may2026/cd/ais/index.html";

test("Greece HITL navigation treats AIP index as reusable", () => {
  assert.equal(shouldUseGreeceAipIndex(AIP_INDEX), true);
  assert.equal(resolveGreeceAipIndexUrl(AIP_INDEX), AIP_INDEX);
});

test("Greece HITL navigation recovers AIP index from frame pages left by previous scrape", () => {
  assert.equal(
    resolveGreeceAipIndexUrl("https://aisgr.hasp.gov.gr/aipgr_incl_amdt_0426_wef_14may2026/cd/ais/side.htm"),
    AIP_INDEX,
  );
  assert.equal(
    resolveGreeceAipIndexUrl("https://aisgr.hasp.gov.gr/aipgr_incl_amdt_0426_wef_14may2026/cd/ais/mainframe.htm"),
    AIP_INDEX,
  );
});
