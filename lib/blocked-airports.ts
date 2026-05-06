const BLOCKED_ICAOS = new Set([
  "LBWB",
  "LIBI",
  "LIKB",
  "EVSM",
  "EVLU",
  "EHHA",
  "ENVR",
  "LRBG",
  "LRHO",
  "LRMA",
  "LRDD",
  "LECV",
  "LTHC",
]);

export function isBlockedIcao(icao: string | null | undefined): boolean {
  const up = String(icao || "").trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(up) && BLOCKED_ICAOS.has(up);
}

export function filterBlockedIcaos<T extends { icao?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !isBlockedIcao(row.icao));
}
