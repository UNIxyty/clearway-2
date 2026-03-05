/**
 * Format 4-digit times (HHMM) as HH:MM in AIP/EAD text.
 * e.g. "0500 (0400) – 2100 (2000)" → "05:00 (04:00) – 21:00 (20:00)"
 */
export function formatTimesInAipText(text: string): string {
  return text.replace(/\b(0[0-9]|1[0-9]|2[0-3])([0-5][0-9])\b/g, "$1:$2");
}
