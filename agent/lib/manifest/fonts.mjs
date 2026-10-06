// The manifest's font, pinned. Every position in the spec assumes Helvetica/Arial metrics; Liberation Sans 2.1.5 has
// the same metrics and is what the reference PDF itself embeds (LiberationSans / LiberationSans-Bold). The files ship
// with the code (assets/), are hashed here, and are embedded in every PDF: nothing is looked up on the host, so a
// container without Helvetica, Arial or Liberation cannot silently substitute DejaVu Sans. A missing or different file
// THROWS — the startup check (assertManifestFont, called by server.mjs) and the build check
// (scripts/check-manifest-font.mjs, run by the Dockerfile) both refuse to go on.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { UNIT } from "./layout.mjs";

export const FONT_FILES = {
  regular: { file: "LiberationSans-Regular.ttf", postscript: "LiberationSans", sha256: "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8" },
  bold: { file: "LiberationSans-Bold.ttf", postscript: "LiberationSans-Bold", sha256: "788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173" },
};

const assetPath = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url));

let loaded = null;

/** Reads, hashes and parses both faces. Throws (never falls back) when either is missing or not the pinned file. */
export function loadManifestFonts() {
  if (loaded) return loaded;
  const out = {};
  for (const [style, spec] of Object.entries(FONT_FILES)) {
    let bytes;
    try {
      bytes = readFileSync(assetPath(spec.file));
    } catch (error) {
      throw new Error(`Passenger manifest font missing: ${spec.file} (${error.code ?? error.message}). Refusing to render with a substitute.`);
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== spec.sha256) {
      throw new Error(`Passenger manifest font ${spec.file} is not the pinned Liberation Sans 2.1.5 (sha256 ${hash.slice(0, 12)}…). Refusing to render.`);
    }
    const face = fontkit.create(bytes);
    if (face.postscriptName !== spec.postscript) {
      throw new Error(`Passenger manifest font ${spec.file} reports ${face.postscriptName}, expected ${spec.postscript}. Refusing to render.`);
    }
    out[style] = { bytes, face, postscript: spec.postscript };
  }
  loaded = out;
  return out;
}

/** The startup check: throws the same error loadManifestFonts would, at boot instead of at the first manifest. */
export function assertManifestFont() {
  const { regular, bold } = loadManifestFonts();
  return { regular: regular.postscript, bold: bold.postscript };
}

/**
 * Glyph advances as the reference PDF places them (it was printed by Chrome/Skia): each advance, in layout units, is
 * FLOORED to 1/64 of a unit, then scaled to points. Measuring and drawing both use this, so a string is exactly as
 * wide on paper as the fitting code thought, and the text lands where the reference's does.
 */
export function glyphRun(face, text, size) {
  const sizeUnits = size / UNIT;
  const run = face.layout(text, { kern: false, liga: false, calt: false });
  const advances = run.glyphs.map((g) => (Math.floor((g.advanceWidth / face.unitsPerEm) * sizeUnits * 64) / 64) * UNIT);
  return { glyphs: run.glyphs, advances, width: advances.reduce((a, b) => a + b, 0) };
}

export const textWidth = (face, text, size) => glyphRun(face, text, size).width;

/** Code points the face has no glyph for (printing them would put .notdef boxes on a border document). */
export function unprintable(face, text) {
  const missing = new Set();
  for (const ch of String(text ?? "")) {
    if (!face.hasGlyphForCodePoint(ch.codePointAt(0))) missing.add(ch);
  }
  return [...missing];
}
