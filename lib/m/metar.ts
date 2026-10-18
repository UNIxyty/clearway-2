// A small, literal METAR decoder for the phone's weather tiles (mobile-portal-spec.md › Airport › weather): wind,
// visibility, ceiling, temperature and dew point, QNH, present weather — read from the standard groups and nothing
// more. The raw METAR stays on the page under the tiles; this never replaces it. The flight category follows the
// standard definitions (VFR / MVFR / IFR / LIFR by visibility and ceiling); the wall's own category for an airport
// on today's flights (CheckWX, via the flight) is preferred when the caller has it.

export type Decoded = {
  wind: string | null; visibility: string | null; visM: number | null; ceiling: string | null; ceilFt: number | null;
  temp: string | null; qnh: string | null; weather: string | null; category: "VFR" | "MVFR" | "IFR" | "LIFR" | null; obs: string | null;
};

const WX: Record<string, string> = { RA: "rain", DZ: "drizzle", SN: "snow", SG: "snow grains", GR: "hail", GS: "small hail", PL: "ice pellets", TS: "thunderstorm", SH: "showers", FZ: "freezing", BR: "mist", FG: "fog", HZ: "haze", FU: "smoke", DU: "dust", SA: "sand", SQ: "squalls", BL: "blowing", DR: "drifting", MI: "shallow", BC: "patches", PR: "partial", VC: "nearby", PO: "dust whirls", FC: "funnel cloud" };

function weatherWords(tok: string): string | null {
  const m = tok.match(/^([-+])?(VC)?((?:MI|BC|PR|DR|BL|SH|TS|FZ|DZ|RA|SN|SG|PL|GR|GS|BR|FG|FU|DU|SA|HZ|PO|SQ|FC)+)$/);
  if (!m) return null;
  const parts = (m[3].match(/.{2}/g) ?? []).map((p) => WX[p] ?? p.toLowerCase());
  return `${m[1] === "-" ? "light " : m[1] === "+" ? "heavy " : ""}${m[2] ? "nearby " : ""}${parts.join(" ")}`;
}

export function decodeMetar(raw: string): Decoded {
  const out: Decoded = { wind: null, visibility: null, visM: null, ceiling: null, ceilFt: null, temp: null, qnh: null, weather: null, category: null, obs: null };
  const toks = raw.replace(/\s+/g, " ").trim().split(" ");
  const wx: string[] = [];
  let lowest: number | null = null;
  for (const t of toks) {
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d{6})Z$/))) out.obs = `${m[1].slice(2, 4)}:${m[1].slice(4, 6)}Z`;
    else if ((m = t.match(/^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/))) out.wind = `${m[1] === "VRB" ? "variable" : `${m[1]}°`} ${m[2]}${m[3] ? ` gusting ${m[3]}` : ""} ${m[4] === "KT" ? "kt" : "m/s"}`;
    else if (t === "CAVOK") { out.visibility = "10 km or more"; out.visM = 10_000; out.ceiling = "No cloud below 5000 ft"; out.ceilFt = null; }
    else if ((m = t.match(/^(\d{4})(NDV)?$/)) && out.visibility === null) { const v = Number(m[1]); out.visM = v; out.visibility = v >= 9999 ? "10 km or more" : v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)} km` : `${v} m`; }
    else if ((m = t.match(/^(\d{1,2})?(?:\s)?(\d\/\d)?SM$/)) || (m = t.match(/^(\d+)SM$/))) { const sm = Number(t.replace("SM", "").replace("/", "/")) || 0; out.visM = Math.round(sm * 1609); out.visibility = `${t.replace("SM", "")} SM`; }
    else if ((m = t.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/))) { const ft = Number(m[2]) * 100; if ((m[1] === "BKN" || m[1] === "OVC" || m[1] === "VV") && (lowest === null || ft < lowest)) lowest = ft; }
    else if (t === "NSC" || t === "NCD" || t === "SKC" || t === "CLR") { if (out.ceiling === null) out.ceiling = "No significant cloud"; }
    else if ((m = t.match(/^(M?\d{2})\/(M?\d{2})$/))) out.temp = `${m[1].replace("M", "−")}° / ${m[2].replace("M", "−")}°`;
    else if ((m = t.match(/^Q(\d{4})$/))) out.qnh = `${Number(m[1])} hPa`;
    else if ((m = t.match(/^A(\d{4})$/))) out.qnh = `${(Number(m[1]) / 100).toFixed(2)} inHg`;
    else if (t === "RMK") break;
    else { const w = weatherWords(t); if (w) wx.push(w); }
  }
  if (lowest !== null) { out.ceilFt = lowest; out.ceiling = `${lowest} ft`; }
  if (wx.length) out.weather = wx.join(", ");
  out.category = categoryOf(out.visM, out.ceilFt);
  return out;
}

/** Standard flight categories by visibility (statute miles) and ceiling (ft AGL). */
export function categoryOf(visM: number | null, ceilFt: number | null): Decoded["category"] {
  if (visM === null && ceilFt === null) return null;
  const sm = visM === null ? Infinity : visM / 1609;
  const c = ceilFt === null ? Infinity : ceilFt;
  if (sm < 1 || c < 500) return "LIFR";
  if (sm < 3 || c < 1000) return "IFR";
  if (sm <= 5 || c <= 3000) return "MVFR";
  return "VFR";
}

/** A TAF split into its periods: the base forecast, then each FM / BECMG / TEMPO / PROB group, each with its category. */
export function tafPeriods(raw: string): Array<{ when: string; text: string; category: Decoded["category"] }> {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return [];
  const parts = compact.split(/\s(?=(?:FM\d{6}|BECMG|TEMPO|PROB\d{2}|INTER)\b)/);
  return parts.map((p, i) => {
    const m = p.match(/^(FM(\d{2})(\d{2})(\d{2})|BECMG|TEMPO|PROB\d{2}|INTER)\s*((\d{2})(\d{2})\/(\d{2})(\d{2}))?/);
    let when = i === 0 ? "now" : p.split(" ")[0];
    if (m?.[2]) when = `from ${m[3]}:${m[4]}Z`;
    else if (m?.[5]) when = `${m[1]} ${m[7]}–${m[9]}Z`;
    const d = decodeMetar(p);
    return { when, text: p.replace(/^(FM\d{6}|BECMG|TEMPO|PROB\d{2}|INTER)\s*(\d{4}\/\d{4})?\s*/, ""), category: d.category };
  });
}
