const DYNAMIC_WEB_AIP_BY_COUNTRY: Record<string, string> = {
  bahrain: "https://aim.mtt.gov.bh/eAIP/history-en-BH.html",
  belarus: "https://www.ban.by/ru/sbornik-aip/amdt",
  bhutan: "https://www.doat.gov.bt/aip/",
  bosnia: "https://eaip.bhansa.gov.ba",
  "cabo verde": "https://eaip.asa.cv",
  chile: "https://aipchile.dgac.gob.cl/aip/vol1",
  "costa rica": "https://www.cocesna.org/aipca/AIPMR/inicio.html",
  cuba: "https://aismet.avianet.cu/html/aip.html",
  ecuador: "https://www.ais.aviacioncivil.gob.ec/ifis3/",
  "el salvador": "https://www.cocesna.org/aipca/AIPMS/history.html",
  guatemala: "https://www.dgac.gob.gt/home/aip_e/",
  honduras: "https://www.cocesna.org/aipca/AIPMH/history.html",
  "hong kong": "https://www.ais.gov.hk/eaip_20260319/VH-history-en-US.html",
  india: "https://aim-india.aai.aero/aip-supplements?page=1",
  israel: "https://e-aip.azurefd.net",
  japan: "https://nagodede.github.io/aip/japan/",
  korea: "https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html",
  "republic of korea": "https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html",
  kosovo: "https://aimss.sans.com.sa/assets/FileManagerFiles/e65727c9-8414-49dc-9c6a-0b30c956ed33.html",
  kuwait: "https://dgca.gov.kw/AIP",
  libya: "https://caa.gov.ly/ais/ad/",
  malaysia: "https://aip.caam.gov.my/aip/eAIP/history-en-MS.html",
  maldives: "https://www.macl.aero/corporate/services/operational/ans/aip",
  mongolia: "https://ais.mn/eaip/history-en-GB.html",
  myanmar: "https://www.ais.gov.mm/eAIP/history-en-GB.html",
  nepal: "https://e-aip.caanepal.gov.np/welcome/listall/1",
  "north macedonia": "https://www.caa.gov.mk/AIP/default_en.asp",
  pakistan: "https://paa.gov.pk/aeronautical-information/electronic-aeronautical-information-publication",
  panama: "https://www.aeronautica.gob.pa/ais-aip/",
  qatar: "https://www.caa.gov.qa/en/aeronautical-information-management",
  rwanda: "https://aim.asecna.aero/html/eAIP/eAIP_Rwanda/index-en-GB.html",
  "saudi arabia": "https://aimss.sans.com.sa/assets/FileManagerFiles/e65727c9-8414-49dc-9c6a-0b30c956ed33.html",
  somalia: "https://aip.scaa.gov.so/history-en-GB.html",
  "sri lanka": "https://airport.lk/aasl/AIM/AIP/Eurocontrol/SRI%20LANKA/2025-04-17-DOUBLE%20AIRAC/html/index-en-EN.html",
  taiwan: "https://ais.caa.gov.tw/eaip/",
  tajikistan: "http://www.caica.ru/aiptjk/?lang=en",
  thailand: "https://aip.caat.or.th/",
  turkmenistan: "http://www.caica.ru/aiptkm/?lang=en",
  uae: "https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIP.aspx",
  "united arab emirates": "https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIP.aspx",
  uzbekistan: "https://uzaeronavigation.com/ais/#",
  venezuela: "https://www.inac.gob.ve/eaip/history-en-GB.html",
};

function normalizeCountry(country: string): string {
  return String(country || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
}

export function getDynamicWebAipUrl(country: string): string | undefined {
  const key = normalizeCountry(country);
  return DYNAMIC_WEB_AIP_BY_COUNTRY[key];
}

