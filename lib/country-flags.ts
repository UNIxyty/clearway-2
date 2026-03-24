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
  "Bhutan": "bt",
  "Bulgaria": "bg",
  "Cuba": "cu",
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

export function getCountryFlagUrl(countryName: string): string | null {
  const name = normalize(countryName);
  let code: string | undefined = COUNTRY_TO_ISO[name];
  if (!code) {
    const key = Object.keys(COUNTRY_TO_ISO).find((k) => normalize(k) === name);
    code = key ? COUNTRY_TO_ISO[key] : undefined;
  }
  if (!code) {
    const base = name.replace(/\s*\([A-Z0-9]{2}\)\s*$/, "");
    code = COUNTRY_TO_ISO[base];
  }
  if (!code) {
    const m = name.match(/\(([A-Z0-9]{2})\)\s*$/);
    if (m) code = ICAO_PREFIX_TO_ISO[m[1].toUpperCase()];
  }
  if (!code) return null;
  return `${FLAG_CDN}/w40/${code}.png`;
}

export function getCountryIso(countryName: string): string | null {
  return COUNTRY_TO_ISO[countryName] ?? null;
}
