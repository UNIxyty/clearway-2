// A document we email carries the date its copy was fetched, on the document itself (2026-10-15): the portal keeps
// cached AIP copies and nothing refreshes them by itself, so a PDF sent from the wall says when it was fetched and that
// it is a cached copy. A stamp that fails never stops the email — the copy goes unstamped and the email row still says
// the date.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** `02 Oct 2026` (UTC), or null. */
export function dayLong(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Older than one AIRAC cycle (28 days). */
export function olderThanCycle(iso, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && now - t > 28 * DAY_MS;
}

/** The line stamped on every page and used in the email. */
export function copyLine(fetchedAt) {
  const day = dayLong(fetchedAt);
  const when = day ? `fetched ${day}` : "fetch date unknown";
  const old = olderThanCycle(fetchedAt) ? " - more than one AIRAC cycle old" : "";
  return `Clearway cached copy, ${when}${old}. Not refreshed automatically: check it is the current AIP before use.`;
}

/** `EVRA-AD2.pdf` → `EVRA-AD2_fetched-2026-10-02.pdf` (or `_fetch-date-unknown`). */
export function datedFilename(filename, fetchedAt) {
  const d = fetchedAt ? new Date(fetchedAt) : null;
  const tag = d && !Number.isNaN(d.getTime()) ? `fetched-${d.toISOString().slice(0, 10)}` : "fetch-date-unknown";
  return String(filename).replace(/\.pdf$/i, "") + `_${tag}.pdf`;
}

/** The PDF with the copy line on a white strip at the top of every page. Returns the original on any failure. */
export async function stampCachedCopy(buffer, fetchedAt) {
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const text = copyLine(fetchedAt);
    const old = olderThanCycle(fetchedAt);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const size = Math.max(6, Math.min(8, (width - 24) / font.widthOfTextAtSize(text, 1)));
      page.drawRectangle({ x: 0, y: height - size - 8, width, height: size + 8, color: old ? rgb(1, 0.95, 0.85) : rgb(1, 1, 1), opacity: 0.95 });
      page.drawText(text, { x: 12, y: height - size - 4, size, font, color: old ? rgb(0.6, 0.25, 0) : rgb(0.15, 0.16, 0.19) });
    }
    return Buffer.from(await doc.save());
  } catch (error) {
    console.error("[aip-stamp] could not stamp the fetch date; sending the copy unstamped:", error?.message || error);
    return buffer;
  }
}
