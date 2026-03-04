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
  // EAD (EU AIP) countries – labels from ead-icaos-from-document-names.json
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
};

const FLAG_CDN = "https://flagcdn.com";

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
  if (!code) return null;
  return `${FLAG_CDN}/w40/${code}.png`;
}

export function getCountryIso(countryName: string): string | null {
  return COUNTRY_TO_ISO[countryName] ?? null;
}
