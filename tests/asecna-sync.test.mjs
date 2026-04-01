import test from "node:test";
import assert from "node:assert/strict";
import { inferCountryIso2 } from "../services/asecna/asecna-sync.mjs";
import asecnaData from "../data/asecna-airports.json" with { type: "json" };

test("inferCountryIso2 maps known ASECNA countries", () => {
  assert.equal(inferCountryIso2("Burkina Faso"), "BF");
  assert.equal(inferCountryIso2("Niger"), "NE");
});

test("inferCountryIso2 tolerates unknown country", () => {
  assert.equal(inferCountryIso2("Unknown Country"), null);
});

test("asecna data includes Benin country entry", () => {
  const names = (asecnaData.countries || []).map((c) => String(c.name || ""));
  assert.equal(names.some((n) => /benin|bénin/i.test(n)), true);
});

test("asecna airport set includes DBBB", () => {
  const allIcaos = new Set(
    (asecnaData.countries || [])
      .flatMap((c) => c.airports || [])
      .map((a) => String(a.icao || "").toUpperCase()),
  );
  assert.equal(allIcaos.has("DBBB"), true);
});
