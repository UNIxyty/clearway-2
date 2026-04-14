const EAD_WEB_AIP_DEFAULT_URL = "https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/login/ead-basic/";

const EAD_PREFIXES = new Set([
  "LA", "UD", "LO", "UB", "EB", "LQ", "LB", "LD", "LC", "LK", "EK", "EE", "XX", "EF",
  "LF", "UG", "ED", "LG", "BG", "LH", "BI", "EI", "LI", "OJ", "BK", "UA", "UC", "EV",
  "EY", "EL", "LM", "LU", "EH", "EN", "RP", "EP", "LP", "LW", "LR", "LY", "LZ", "LJ",
  "LE", "ES", "GC", "LS", "LT", "UK", "EG",
]);

function normalizeCountry(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
}

export function getEadWebAipUrlByCountry(country: string | null | undefined): string | null {
  const raw = String(country || "").trim();
  if (!raw) return null;

  const normalized = normalizeCountry(raw).replace(/\s*\([A-Z0-9]{2}\)\s*$/, "").trim();
  if (normalized === "denmark") return "https://aim.naviair.dk/en/";

  const prefix = raw.match(/\(([A-Z0-9]{2})\)\s*$/)?.[1]?.toUpperCase() || "";
  if (prefix && EAD_PREFIXES.has(prefix)) return EAD_WEB_AIP_DEFAULT_URL;

  return null;
}

