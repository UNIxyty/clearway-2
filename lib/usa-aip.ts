import usaByState from "@/data/usa-aip-icaos-by-state.json";

export const USA_WEB_AIP_URL = "https://www.faa.gov/air_traffic/publications/atpubs/aip_html/";

type UsaAirportRow = {
  "Airport Code"?: string;
  "Airport Name"?: string;
};

type UsaByState = {
  by_state?: Record<string, UsaAirportRow[]>;
};

const DATA = usaByState as UsaByState;

const USA_ICAO_TO_STATE = (() => {
  const out = new Map<string, string>();
  const byState = DATA.by_state || {};
  for (const [state, airports] of Object.entries(byState)) {
    if (!Array.isArray(airports)) continue;
    for (const airport of airports) {
      const icao = String(airport?.["Airport Code"] || "").trim().toUpperCase();
      if (!icao) continue;
      out.set(icao, state);
    }
  }
  return out;
})();

export function isUsaAipIcao(icao: string): boolean {
  const up = String(icao || "").trim().toUpperCase();
  return USA_ICAO_TO_STATE.has(up);
}

export function getUsaStateByIcao(icao: string): string | null {
  const up = String(icao || "").trim().toUpperCase();
  return USA_ICAO_TO_STATE.get(up) || null;
}
