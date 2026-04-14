import eadCountryIcaos from "@/lib/ead-country-icaos.generated.json";

const SPAIN_LE_SPECIAL_ICAOS = (() => {
  const data = eadCountryIcaos as Record<string, Array<{ icao: string; name: string }>>;
  const rows = Array.isArray(data["Spain (LE)"]) ? data["Spain (LE)"] : [];
  return new Set(
    rows
      .map((row) => String(row?.icao || "").trim().toUpperCase())
      .filter((icao) => /^(GC|GE|GS)[A-Z0-9]{2}$/.test(icao)),
  );
})();

export function resolveGenPrefix(icao: string | null | undefined, fallbackPrefix = ""): string {
  const up = String(icao || "").trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(up) && SPAIN_LE_SPECIAL_ICAOS.has(up)) return "LE";
  const fb = String(fallbackPrefix || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(fb)) return fb;
  return up.length >= 2 ? up.slice(0, 2) : "";
}

