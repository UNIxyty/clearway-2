/**
 * Map AIP country names (as in data) to ISO 3166-1 alpha-2 codes for flags.
 * Flags loaded from https://flagcdn.com
 */
export const COUNTRY_TO_ISO: Record<string, string> = {
  "Benin": "bj",
  "Bénin": "bj",
  "Burkina Faso": "bf",
  "Cameroun": "cm",
  "Centrafrique": "cf",
  "Congo": "cg",
  "Côte d'Ivoire": "ci",
  "Gabon": "ga",
  "Guinée Equatoriale": "gq",
  "Madagascar": "mg",
  "Mali": "ml",
  "Mauritanie": "mr",
  "Niger": "ne",
  "Sénégal": "sn",
  "Republic of Cabo Verde": "cv",
  "Tchad": "td",
  "Comores": "km",
  "Guinée Bissau": "gw",
  "Rwanda": "rw",
  "Togo": "tg",
  "Somalia": "so",
  "Armenia": "am",
  "Bahrain": "bh",
  "Georgia": "ge",
  "Israel": "il",
  "Kyrgyzstan": "kg",
  "Qatar": "qa",
  "Oman": "om",
  "Singapore": "sg",
  "Mongolia": "mn",
  "Pakistan": "pk",
  "South Korea": "kr",
  "Myanmar": "mm",
  // AIP data countries (region/country search)
  "Iran": "ir",
  "Austria": "at",
  "Azerbaijan": "az",
  "Belarus": "by",
  "Bhutan": "bt",
  "Bulgaria": "bg",
  "Chile": "cl",
  "Costa Rica": "cr",
  "Cuba": "cu",
  "Ecuador": "ec",
  "El Salvador": "sv",
  "Guatemala": "gt",
  "Hong Kong": "hk",
  "Honduras": "hn",
  "India": "in",
  "Kosovo": "xk",
  "Kuwait": "kw",
  "Malaysia": "my",
  "Panama": "pa",
  "Uzbekistan": "uz",
  "Venezuela": "ve",
  "Russia": "ru",
  "Saudi Arabia": "sa",
  "Sri Lanka": "lk",
  "Taiwan": "tw",
  "Tajikistan": "tj",
  "Thailand": "th",
  "Turkmenistan": "tm",
  "United Arab Emirates": "ae",
  "United States of America": "us",
  "USA": "us",
  "Czech Republic": "cz",
  "Denmark": "dk",
  "Ireland": "ie",
  "Italy": "it",
  "Japan": "jp",
  "Libya": "ly",
  "Maldives": "mv",
  "Nepal": "np",
  // EAD (EU AIP) countries – labels from ead-country-icaos.json
  "Albania (LA)": "al",
  "Austria (LO)": "at",
  "Belgium (EB)": "be",
  "Bulgaria (LB)": "bg",
  "Czech Republic (LK)": "cz",
  "Denmark (EK)": "dk",
  "Estonia (EE)": "ee",
  "Finland (EF)": "fi",
  "France (LF)": "fr",
  "Germany (ED)": "de",
  "Greece (LG)": "gr",
  "Hungary (LH)": "hu",
  "Ireland (EI)": "ie",
  "Italy (LI)": "it",
  "Latvia (EV)": "lv",
  "Lithuania (EY)": "lt",
  "Luxembourg (EL)": "lu",
  "Malta (LM)": "mt",
  "Netherlands (EH)": "nl",
  "Poland (EP)": "pl",
  "Portugal (LP)": "pt",
  "Romania (LR)": "ro",
  "Slovakia (LZ)": "sk",
  "Slovenia (LJ)": "si",
  "Spain (LE)": "es",
  "Sweden (ES)": "se",
  "Spain (GC)": "es",
  // EAD countries added from full list (with-prefixes)
  "Armenia (UD)": "am",
  "Azerbaijan (UB)": "az",
  "Bosnia/Herzeg. (LQ)": "ba",
  "Bosnia_Herzeg. (LQ)": "ba",
  "Croatia (LD)": "hr",
  "Cyprus (LC)": "cy",
  "Faroe Islands (XX)": "fo",
  "Georgia (UG)": "ge",
  "Greenland (BG)": "gl",
  "Iceland (BI)": "is",
  "Jordan (OJ)": "jo",
  "KFOR SECTOR (BK)": "xk",
  "Kazakhstan (UA)": "kz",
  "Kyrgyzstan (UC)": "kg",
  "Moldova (LU)": "md",
  "Norway (EN)": "no",
  "Philippines (RP)": "ph",
  "Republic of North Macedonia (LW)": "mk",
  "Serbia and Montenegro (LY)": "rs",
  "Switzerland (LS)": "ch",
  "Turkey (LT)": "tr",
  "Ukraine (UK)": "ua",
  "United Kingdom (EG)": "gb",
};

const FLAG_CDN = "https://flagcdn.com";
const COUNTRY_ALIASES: Record<string, string> = {
  "bosnia and herzegovina": "ba",
  "bosnia herzegovina": "ba",
  "bosnia/herzeg": "ba",
  "bosnia/herzeg.": "ba",
  "republic of cabo verde": "cv",
  "cabo verde": "cv",
  "cape verde": "cv",
  "north macedonia": "mk",
  "republic of north macedonia": "mk",
  "united kingdom": "gb",
  "great britain": "gb",
  "uk": "gb",
  "uae": "ae",
  "hongkong": "hk",
};
const ICAO_PREFIX_TO_ISO: Record<string, string> = {
  LA: "al",
  UD: "am",
  LO: "at",
  UB: "az",
  EB: "be",
  LQ: "ba",
  LB: "bg",
  LD: "hr",
  LC: "cy",
  LK: "cz",
  EK: "dk",
  EE: "ee",
  XX: "fo",
  EF: "fi",
  LF: "fr",
  UG: "ge",
  ED: "de",
  LG: "gr",
  BG: "gl",
  LH: "hu",
  BI: "is",
  EI: "ie",
  LI: "it",
  OJ: "jo",
  BK: "xk",
  UA: "kz",
  UC: "kg",
  EV: "lv",
  EY: "lt",
  EL: "lu",
  LM: "mt",
  LU: "md",
  EH: "nl",
  EN: "no",
  RP: "ph",
  EP: "pl",
  LP: "pt",
  LW: "mk",
  LR: "ro",
  LY: "rs",
  LZ: "sk",
  LJ: "si",
  LE: "es",
  ES: "se",
  GC: "es",
  LS: "ch",
  LT: "tr",
  UK: "ua",
  EG: "gb",
};

function normalize(s: string): string {
  return s.trim().normalize("NFC");
}

function normalizeLookupKey(value: string): string {
  return normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[_/]+/g, " ")
    .replace(/[^a-zA-Z0-9()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const COUNTRY_TO_ISO_NORMALIZED: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [country, iso] of Object.entries(COUNTRY_TO_ISO)) {
    const key = normalizeLookupKey(country);
    if (key && !out[key]) out[key] = iso;
    const base = key.replace(/\s*\([a-z0-9]{2}\)\s*$/, "").trim();
    if (base && !out[base]) out[base] = iso;
  }
  for (const [alias, iso] of Object.entries(COUNTRY_ALIASES)) {
    const key = normalizeLookupKey(alias);
    if (key && !out[key]) out[key] = iso;
  }
  return out;
})();

function resolveCountryIso(countryName: string): string | null {
  const name = normalize(countryName);
  const direct = COUNTRY_TO_ISO[name];
  if (direct) return direct;

  const normalizedKey = normalizeLookupKey(name);
  if (COUNTRY_TO_ISO_NORMALIZED[normalizedKey]) return COUNTRY_TO_ISO_NORMALIZED[normalizedKey];

  const withoutSuffix = normalizedKey.replace(/\s*\([a-z0-9]{2}\)\s*$/, "").trim();
  if (COUNTRY_TO_ISO_NORMALIZED[withoutSuffix]) return COUNTRY_TO_ISO_NORMALIZED[withoutSuffix];

  const m = name.match(/\(([A-Z0-9]{2})\)\s*$/);
  if (m) return ICAO_PREFIX_TO_ISO[m[1].toUpperCase()] ?? null;
  return null;
}

export function getCountryFlagUrl(countryName: string): string | null {
  const code = resolveCountryIso(countryName);
  return code ? `${FLAG_CDN}/w40/${code}.png` : null;
}

export function getCountryIso(countryName: string): string | null {
  return resolveCountryIso(countryName);
}
