#!/usr/bin/env node
// Build check for the Passenger Manifest's font — run by agent/Dockerfile, like the tzdata check: a failure fails
// the image build, so a container can never render a manifest with a substituted font.
//
// It renders a manifest (fake values, no Leon), then reads the OUTPUT PDF itself and requires that:
//   - the only fonts in it are LiberationSans and LiberationSans-Bold (subset-prefixed, e.g. ABCDEF+LiberationSans),
//   - each is EMBEDDED (a FontFile2 stream), so no viewer or printer substitutes anything either,
//   - the pinned files' hashes match (fonts.mjs refuses otherwise).
// Prints the font names it found. Exit 0 = good, 1 = refuse.
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { renderManifest } from "../lib/manifest/render.mjs";
import { assertManifestFont } from "../lib/manifest/fonts.mjs";

function fail(message) { console.error(`[manifest-font] REFUSING: ${message}`); process.exit(1); }

let faces;
try { faces = assertManifestFont(); } catch (error) { fail(error.message); }

const model = {
  flight: { operatorName: "SAMPLE AVIATION UAB", registration: "LY-TST", flightNumber: "TST101", flightDate: "14-Oct-2026", departureIcao: "EYVI", arrivalIcao: "LSGG" },
  passengers: [{ name: "EXAMPLE Alice", sex: "F", dateOfBirth: "01-Jan-1960", placeOfBirth: "Testville", documentNumber: "TEST00001", documentExpiry: "01-Jan-2030", nationality: "Lithuania" }],
  crewCount: 2, personsOnBoard: 3,
};
const { bytes } = await renderManifest(model, { title: "font check", creationDate: new Date(0) });
const doc = await PDFDocument.load(bytes);
const found = [];
for (const [, obj] of doc.context.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict) || obj.get(PDFName.of("Type"))?.toString() !== "/FontDescriptor") continue;
  const name = obj.get(PDFName.of("FontName"))?.toString().replace(/^\//, "") ?? "?";
  const embedded = Boolean(obj.get(PDFName.of("FontFile2")) || obj.get(PDFName.of("FontFile3")) || obj.get(PDFName.of("FontFile")));
  found.push({ name, embedded });
}
const base = (n) => n.replace(/^[A-Z]{6}\+/, "");
const names = found.map((f) => base(f.name)).sort();
console.log(`[manifest-font] fonts in the rendered manifest: ${found.map((f) => `${f.name}${f.embedded ? " (embedded)" : " (NOT embedded)"}`).join(", ")}`);
if (JSON.stringify(names) !== JSON.stringify([faces.regular, faces.bold].sort())) fail(`expected exactly ${faces.regular} and ${faces.bold}, found ${names.join(", ") || "none"}`);
if (found.some((f) => !f.embedded)) fail("a font is referenced but not embedded");
console.log("[manifest-font] ok: Liberation Sans Regular and Bold, embedded, pinned files");
