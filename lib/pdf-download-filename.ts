function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

function sanitizeToken(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function buildPdfDownloadFilename(section: string, icao: string, now = new Date()): string {
  const sectionToken = sanitizeToken(section);
  const icaoToken = sanitizeToken(icao);
  const timestamp = compactTimestamp(now);
  return `${sectionToken}${icaoToken}${timestamp}.pdf`;
}
