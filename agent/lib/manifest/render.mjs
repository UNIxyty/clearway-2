// Passenger Manifest — the page renderer. Deterministic: a typed model in, PDF bytes out. No model (LLM) output
// reaches this file; the caller passes values that came from Leon through mapping code (leon.mjs).
//
// Route: pdf-lib with the pinned Liberation Sans faces embedded (fonts.mjs). Coordinates are written in the spec's
// own unit (points), there is no layout engine between the spec and the paper, the font file that measures is the
// font file that is embedded, and the document carries no metadata beyond its title and creation date.
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PAGE, CONTENT, RULE, SIZE, LOGO_BOX, TITLE, PAGE_NO, UNDERLINE_WIDTH, HEADER_FIELDS, TABLE, COLUMNS,
  rowTop, rowBaseline, ROW_WRAP_BASELINES, FIT, FOOTER, PASSENGERS_PER_PAGE,
} from "./layout.mjs";
import { loadManifestFonts, glyphRun, textWidth } from "./fonts.mjs";
import { LOGO_SOURCE } from "./config.mjs";

const BLACK = rgb(0, 0, 0);

// ── Logo ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Two sources (config.mjs LOGO_SOURCE): the reference PDF's own image at exactly its box (163.58 × 33.02 at
// 28.8, 28.8) — the default, chosen by overlay — or the design's SVG fitted `contain` + left-aligned inside that box
// (width 163.58, drawn height 29.75, centred vertically; spec §3.1).
export const LOGO_SOURCE_SVG = "svg";
export const LOGO_SOURCE_RASTER = "raster"; // the reference PDF's own image, at exactly its box
const LOGO_SVG = readFileSync(fileURLToPath(new URL("./assets/clearway-handling-ops-logo.svg", import.meta.url)), "utf8");
const LOGO_VIEWBOX = LOGO_SVG.match(/viewBox="([\d.\s-]+)"/)[1].trim().split(/\s+/).map(Number);
const LOGO_PATHS = [...LOGO_SVG.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);

// ── Fitting (spec §3.4) ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * Shrink, then wrap to two lines at 6.14, then truncate with "…" and FLAG. Returns
 *   { lines: [{ text, size }], truncated }
 * Breaks after spaces or hyphens; a word longer than the line breaks mid-word (the passport case).
 */
export function fitText(face, text, cellWidth) {
  const value = String(text ?? "");
  if (!value) return { lines: [], truncated: false };
  const avail = cellWidth - FIT.pad;
  for (const size of FIT.sizes) {
    if (textWidth(face, value, size) <= avail) return { lines: [{ text: value, size }], truncated: false };
  }
  const size = FIT.wrapSize;
  const fits = (s) => textWidth(face, s, size) <= avail;
  // Lines as [start, end) offsets into value, so the remainder after line 1 is exact.
  const tokens = [];
  const re = /[^\s-]*[\s-]+|[^\s-]+$/g;
  let m;
  while ((m = re.exec(value)) && m[0]) tokens.push({ start: m.index, end: m.index + m[0].length });
  const lines = [];
  let cur = null;
  const pushLine = (start, end) => lines.push({ start, end });
  for (let { start, end } of tokens) {
    if (cur && fits(value.slice(cur.start, end).trimEnd())) { cur.end = end; continue; }
    if (cur) { pushLine(cur.start, cur.end); cur = null; }
    while (!fits(value.slice(start, end).trimEnd())) {
      let cut = end - 1;
      while (cut > start + 1 && !fits(value.slice(start, cut))) cut -= 1;
      pushLine(start, cut);
      start = cut;
    }
    cur = { start, end };
  }
  if (cur) pushLine(cur.start, cur.end);
  const strings = lines.map((l) => value.slice(l.start, l.end).trim()).filter(Boolean);
  if (strings.length <= 2) return { lines: strings.map((t) => ({ text: t, size })), truncated: false };
  let rest = value.slice(lines[1].start).trim();
  while (rest && !fits(`${rest}${FIT.ellipsis}`)) rest = rest.slice(0, -1);
  return { lines: [{ text: strings[0], size }, { text: `${rest.trimEnd()}${FIT.ellipsis}`, size }], truncated: true };
}

// ── Drawing helpers ─────────────────────────────────────────────────────────────────────────────────────────────
function drawRun(page, font, face, text, size, x, baselineTop) {
  // Glyph by glyph, at the floored advances the reference uses (fonts.mjs glyphRun), so drawn width = measured width.
  const run = glyphRun(face, text, size);
  let pen = x;
  run.glyphs.forEach((g, i) => {
    const ch = String.fromCodePoint(...g.codePoints);
    if (ch.trim()) page.drawText(ch, { x: pen, y: PAGE.height - baselineTop, size, font, color: BLACK });
    pen += run.advances[i];
  });
  return run.width;
}
const drawLeft = (ctx, style, text, size, x, baseline) => drawRun(ctx.page, ctx.fonts[style], ctx.faces[style], text, size, x, baseline);
function drawCentred(ctx, style, text, size, centreX, baseline) {
  const w = textWidth(ctx.faces[style], text, size);
  drawRun(ctx.page, ctx.fonts[style], ctx.faces[style], text, size, centreX - w / 2, baseline);
}
function drawRight(ctx, style, text, size, right, baseline) {
  const w = textWidth(ctx.faces[style], text, size);
  drawRun(ctx.page, ctx.fonts[style], ctx.faces[style], text, size, right - w, baseline);
}
function rule(ctx, x, top, width, height) {
  ctx.page.drawRectangle({ x, y: PAGE.height - top - height, width, height, color: BLACK, borderWidth: 0 });
}

/** A header/footer value centred on its underline, fitted; returns true when it had to be truncated. */
function drawField(ctx, value, lineX, baseline) {
  const fit = fitText(ctx.faces.regular, value, UNDERLINE_WIDTH);
  const centre = lineX + UNDERLINE_WIDTH / 2;
  if (fit.lines.length === 1) drawCentred(ctx, "regular", fit.lines[0].text, fit.lines[0].size, centre, baseline);
  if (fit.lines.length === 2) {
    drawCentred(ctx, "regular", fit.lines[0].text, fit.lines[0].size, centre, baseline - FIT.fieldLine1Above);
    drawCentred(ctx, "regular", fit.lines[1].text, fit.lines[1].size, centre, baseline);
  }
  return fit.truncated;
}

// Cell text is centred on the cell's midpoint (spec §3.3). Measured against the reference's seven headings with the
// exact unit scale this is the closer rule (worst 0.47 pt; centring between the cell's rules instead: 0.50 pt).
const cellCentre = (column) => column.x + column.width / 2;

/** A passenger cell, fitted and centred in its column; returns true when it had to be truncated. */
function drawCell(ctx, value, column, top) {
  const fit = fitText(ctx.faces.regular, value, column.width);
  const centre = cellCentre(column);
  if (fit.lines.length === 1) drawCentred(ctx, "regular", fit.lines[0].text, fit.lines[0].size, centre, rowBaseline(top, fit.lines[0].size));
  if (fit.lines.length === 2) {
    drawCentred(ctx, "regular", fit.lines[0].text, fit.lines[0].size, centre, top + ROW_WRAP_BASELINES[0]);
    drawCentred(ctx, "regular", fit.lines[1].text, fit.lines[1].size, centre, top + ROW_WRAP_BASELINES[1]);
  }
  return fit.truncated;
}

async function drawLogo(ctx, source) {
  if (source === LOGO_SOURCE_RASTER) {
    const jpg = await ctx.doc.embedJpg(readFileSync(fileURLToPath(new URL("./assets/clearway-handling-ops-logo.jpg", import.meta.url))));
    ctx.page.drawImage(jpg, { x: LOGO_BOX.x, y: PAGE.height - LOGO_BOX.y - LOGO_BOX.height, width: LOGO_BOX.width, height: LOGO_BOX.height });
    return;
  }
  const [, , vbW, vbH] = LOGO_VIEWBOX;
  const scale = LOGO_BOX.width / vbW;
  const drawnHeight = vbH * scale;
  const top = LOGO_BOX.y + (LOGO_BOX.height - drawnHeight) / 2;
  for (const d of LOGO_PATHS) ctx.page.drawSvgPath(d, { x: LOGO_BOX.x, y: PAGE.height - top, scale, color: BLACK, borderWidth: 0 });
}

// ── The page ────────────────────────────────────────────────────────────────────────────────────────────────────
async function drawSheet(ctx, { flight, rows, footer, pageLabel, firstRowNumber, logoSource }) {
  const truncations = [];
  await drawLogo(ctx, logoSource);
  drawCentred(ctx, "bold", TITLE.text, SIZE.title, TITLE.centreX, TITLE.baseline);
  if (pageLabel) drawRight(ctx, "regular", pageLabel, SIZE.pageNo, PAGE_NO.right, PAGE_NO.baseline);

  for (const f of HEADER_FIELDS) {
    drawLeft(ctx, "regular", f.label, SIZE.label, f.labelX, f.baseline);
    rule(ctx, f.lineX, f.lineTop, UNDERLINE_WIDTH, RULE);
    if (flight && drawField(ctx, flight[f.key], f.lineX, f.baseline)) truncations.push({ field: f.key, row: null });
  }

  for (let i = 0; i <= TABLE.rows + 1; i += 1) rule(ctx, TABLE.x, TABLE.top + TABLE.rowPitch * i, TABLE.width, RULE);
  for (const x of TABLE.verticals) rule(ctx, x, TABLE.top, RULE, TABLE.verticalHeight);
  for (const c of COLUMNS) drawCentred(ctx, "bold", c.heading, SIZE.heading, cellCentre(c), TABLE.headingBaseline);

  rows.forEach((p, i) => {
    const top = rowTop(i + 1);
    for (const c of COLUMNS) {
      if (drawCell(ctx, p[c.key], c, top)) truncations.push({ field: c.key, row: firstRowNumber + i });
    }
  });

  if (footer) {
    for (const key of ["crew", "pob"]) {
      const f = FOOTER[key];
      drawLeft(ctx, "regular", f.label, SIZE.label, f.labelX, f.baseline);
      rule(ctx, f.lineX, f.lineTop, UNDERLINE_WIDTH, RULE);
      const value = footer[key];
      if (value !== null && value !== undefined && drawField(ctx, String(value), f.lineX, f.baseline)) truncations.push({ field: key, row: null });
    }
    drawLeft(ctx, "regular", FOOTER.signature.label, SIZE.label, FOOTER.signature.labelX, FOOTER.signature.baseline);
    drawLeft(ctx, "regular", FOOTER.dots.text, SIZE.caption, FOOTER.dots.x, FOOTER.dots.baseline);
    drawCentred(ctx, "regular", FOOTER.caption.text, SIZE.caption, FOOTER.caption.centreX, FOOTER.caption.baseline);
  }
  return truncations;
}

/**
 * Render a manifest.
 *   model = { flight: { operatorName, registration, flightNumber, flightDate, departureIcao, arrivalIcao },
 *             passengers: [{ name, sex, dateOfBirth, placeOfBirth, documentNumber, documentExpiry, nationality }],
 *             crewCount, personsOnBoard }
 *   options = { blank: true } for the empty hand-fill form (no flight, no rows, footer, NO page number);
 *             title, creationDate, logoSource.
 * Returns { bytes, pageCount, truncations: [{ field, row }] } — row is the 1-based passenger row, null for a field.
 */
export async function renderManifest(model, { blank = false, title = "Passenger Manifest", creationDate = new Date(), logoSource = LOGO_SOURCE } = {}) {
  const faces = loadManifestFonts();
  // updateMetadata:false — no Producer, no Creator, no ModDate. Title and CreationDate are set explicitly below.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  const fonts = {
    // Subset-embedded under the standard "TAG+PostScriptName" form, so the PDF names the font it carries.
    regular: await doc.embedFont(faces.regular.bytes, { subset: true, customName: `CWPAXR+${faces.regular.postscript}` }),
    bold: await doc.embedFont(faces.bold.bytes, { subset: true, customName: `CWPAXB+${faces.bold.postscript}` }),
  };
  const passengers = blank ? [] : model?.passengers ?? [];
  const pageCount = blank ? 1 : Math.max(1, Math.ceil(passengers.length / PASSENGERS_PER_PAGE));
  const truncations = [];
  for (let p = 0; p < pageCount; p += 1) {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    const ctx = { doc, page, fonts, faces: { regular: faces.regular.face, bold: faces.bold.face } };
    const last = p === pageCount - 1;
    const rows = passengers.slice(p * PASSENGERS_PER_PAGE, (p + 1) * PASSENGERS_PER_PAGE);
    truncations.push(...await drawSheet(ctx, {
      flight: blank ? null : model.flight,
      rows,
      footer: last ? (blank ? {} : { crew: model.crewCount, pob: model.personsOnBoard }) : null,
      pageLabel: blank ? null : `Page ${p + 1} of ${pageCount}`,
      firstRowNumber: p * PASSENGERS_PER_PAGE + 1,
      logoSource,
    }));
  }
  doc.setTitle(title);
  doc.setCreationDate(creationDate);
  const bytes = await doc.save({ useObjectStreams: false });
  return { bytes, pageCount, truncations };
}

export { CONTENT };
