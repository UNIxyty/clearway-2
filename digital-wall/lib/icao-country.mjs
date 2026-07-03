// ICAO airport-code prefix -> ISO 3166-1 alpha-2 country.
//
// Why this exists: Important entries (important-seed.json) scope countries as
// ISO codes ("FR", "GB", ...), but the local airport directory stores display
// strings like "France (LF)" AND only covers ~830 EAD airports (EGLL and most
// non-EAD codes are absent). Resolving the country from the ICAO prefix works
// for every airport and needs no directory. Standard ICAO allocations;
// longest-prefix match (4-letter overrides -> 3 -> 2 -> 1).

const OVERRIDES_4 = {
  LYPG: "ME", LYTV: "ME", // Montenegro shares the LY prefix with Serbia
  UMKK: "RU",             // Kaliningrad inside the Belarus UM block
  WBSB: "BN",             // Brunei inside the Malaysia WB block
};

const PREFIXES_3 = {
  UAF: "KG", // Kyrgyzstan (legacy UAF*; newer UC* below)
  UTA: "TM", // Turkmenistan
  UTD: "TJ", // Tajikistan
};

const PREFIXES_2 = {
  AG: "SB", AN: "NR", AY: "PG",
  BG: "GL", BI: "IS", BK: "XK",
  DA: "DZ", DB: "BJ", DF: "BF", DG: "GH", DI: "CI", DN: "NG", DR: "NE", DT: "TN", DX: "TG",
  EB: "BE", ED: "DE", EE: "EE", EF: "FI", EG: "GB", EH: "NL", EI: "IE", EK: "DK",
  EL: "LU", EN: "NO", EP: "PL", ES: "SE", ET: "DE", EV: "LV", EY: "LT",
  FA: "ZA", FB: "BW", FC: "CG", FD: "SZ", FE: "CF", FG: "GQ", FH: "SH", FI: "MU",
  FJ: "IO", FK: "CM", FL: "ZM", FM: "MG", FN: "AO", FO: "GA", FP: "ST", FQ: "MZ",
  FS: "SC", FT: "TD", FV: "ZW", FW: "MW", FX: "LS", FY: "NA", FZ: "CD",
  GA: "ML", GB: "GM", GC: "ES", GE: "ES", GF: "SL", GG: "GW", GL: "LR", GM: "MA",
  GO: "SN", GQ: "MR", GS: "EH", GU: "GN", GV: "CV",
  HA: "ET", HB: "BI", HC: "SO", HD: "DJ", HE: "EG", HH: "ER", HK: "KE", HL: "LY",
  HR: "RW", HS: "SD", HT: "TZ", HU: "UG",
  LA: "AL", LB: "BG", LC: "CY", LD: "HR", LE: "ES", LF: "FR", LG: "GR", LH: "HU",
  LI: "IT", LJ: "SI", LK: "CZ", LL: "IL", LM: "MT", LN: "MC", LO: "AT", LP: "PT",
  LQ: "BA", LR: "RO", LS: "CH", LT: "TR", LU: "MD", LV: "PS", LW: "MK", LX: "GI",
  LY: "RS", LZ: "SK",
  MB: "TC", MD: "DO", MG: "GT", MH: "HN", MK: "JM", MM: "MX", MN: "NI", MP: "PA",
  MR: "CR", MS: "SV", MT: "HT", MU: "CU", MW: "KY", MY: "BS", MZ: "BZ",
  NC: "CK", NF: "FJ", NG: "KI", NI: "NU", NL: "WF", NS: "WS", NT: "PF", NV: "VU",
  NW: "NC", NZ: "NZ",
  OA: "AF", OB: "BH", OE: "SA", OI: "IR", OJ: "JO", OK: "KW", OL: "LB", OM: "AE",
  OO: "OM", OP: "PK", OR: "IQ", OS: "SY", OT: "QA", OY: "YE",
  PG: "GU",
  RC: "TW", RJ: "JP", RK: "KR", RO: "JP", RP: "PH",
  SA: "AR", SB: "BR", SC: "CL", SD: "BR", SE: "EC", SF: "FK", SG: "PY", SI: "BR",
  SJ: "BR", SK: "CO", SL: "BO", SM: "SR", SN: "BR", SO: "GF", SP: "PE", SS: "BR",
  SU: "UY", SV: "VE", SW: "BR", SY: "GY",
  TA: "AG", TB: "BB", TD: "DM", TF: "FR", TG: "GD", TI: "VI", TJ: "PR", TK: "KN",
  TL: "LC", TN: "CW", TQ: "AI", TR: "MS", TT: "TT", TU: "VG", TV: "VC", TX: "BM",
  UA: "KZ", UB: "AZ", UC: "KG", UD: "AM", UG: "GE", UK: "UA", UM: "BY", UT: "UZ",
  VA: "IN", VC: "LK", VD: "KH", VE: "IN", VG: "BD", VH: "HK", VI: "IN", VL: "LA",
  VM: "MO", VN: "NP", VO: "IN", VQ: "BT", VR: "MV", VT: "TH", VV: "VN", VY: "MM",
  WA: "ID", WB: "MY", WI: "ID", WM: "MY", WP: "TL", WQ: "ID", WR: "ID", WS: "SG",
  ZK: "KP", ZM: "MN",
};

const PREFIXES_1 = {
  C: "CA", // Canada
  K: "US", // contiguous USA
  P: "US", // Pacific (Alaska/Hawaii/US territories; PG override above)
  U: "RU", // remaining U** blocks are Russia
  Y: "AU", // Australia
  Z: "CN", // China (ZK/ZM overrides above)
};

/** Resolve an ICAO airport code to an ISO 3166-1 alpha-2 country, or "". */
export function icaoToIso2(icao) {
  const code = String(icao || "").trim().toUpperCase();
  if (code.length !== 4) return "";
  return (
    OVERRIDES_4[code] ||
    PREFIXES_3[code.slice(0, 3)] ||
    PREFIXES_2[code.slice(0, 2)] ||
    PREFIXES_1[code[0]] ||
    ""
  );
}
