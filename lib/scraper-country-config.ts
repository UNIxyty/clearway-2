export type ScraperCountryConfig = {
  country: string;
  aliases?: string[];
  prefixes: string[];
  extraIcaos?: string[];
  webAipUrl: string;
};

export const SCRAPER_COUNTRIES: ScraperCountryConfig[] = [
  {
    country: "Bahrain",
    prefixes: ["OB"],
    webAipUrl: "https://aim.mtt.gov.bh/eAIP/history-en-BH.html",
  },
  {
    country: "Belarus",
    prefixes: ["UM"],
    webAipUrl: "https://www.ban.by/ru/sbornik-aip/amdt",
  },
  {
    country: "Bhutan",
    prefixes: ["VQ"],
    webAipUrl: "https://www.doat.gov.bt/aip/",
  },
  {
    country: "Bosnia and Herzegovina",
    aliases: ["Bosnia", "Bosnia/Herzeg", "Bosnia/Herzeg."],
    prefixes: ["LQ"],
    webAipUrl: "https://eaip.bhansa.gov.ba",
  },
];

function normalizeCountry(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .replace(/[./_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getScraperCountryByIcao(icao: string): ScraperCountryConfig | null {
  const up = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(up)) return null;
  for (const cfg of SCRAPER_COUNTRIES) {
    if ((cfg.extraIcaos || []).includes(up)) return cfg;
  }
  const prefix = up.slice(0, 2);
  return SCRAPER_COUNTRIES.find((cfg) => cfg.prefixes.includes(prefix)) || null;
}

export function isScraperCountryName(country: string): boolean {
  const target = normalizeCountry(country);
  if (!target) return false;
  return SCRAPER_COUNTRIES.some((cfg) => {
    const names = [cfg.country, ...(cfg.aliases || [])].map(normalizeCountry);
    return names.includes(target);
  });
}

export function getScraperWebAipUrlByCountryOrIcao(country: string | null | undefined, icao: string | null | undefined): string | null {
  const byIcao = icao ? getScraperCountryByIcao(icao) : null;
  if (byIcao?.webAipUrl) return byIcao.webAipUrl;
  const target = normalizeCountry(String(country || ""));
  if (!target) return null;
  const byCountry = SCRAPER_COUNTRIES.find((cfg) => {
    const names = [cfg.country, ...(cfg.aliases || [])].map(normalizeCountry);
    return names.includes(target);
  });
  return byCountry?.webAipUrl || null;
}
