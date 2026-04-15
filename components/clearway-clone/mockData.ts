import type {
  CaaDetails,
  FlightRow,
  Limitation,
  LogRecord,
  Operator,
  UserRecord,
} from "@/components/clearway-clone/types";

export const worldClocks = [
  { city: "NEW YORK", time: "12:03" },
  { city: "PARIS", time: "19:03" },
  { city: "UTC", time: "17:03" },
  { city: "RIGA", time: "20:03" },
  { city: "ISTANBUL", time: "20:03" },
];

export const flights: FlightRow[] = [
  { id: "f1", flight: "ORO2151", adep: "LEBL", ades: "LFMN", wxDep: "above", wxDes: "above", etd: "09:45", atd: "10:10", eta: "10:50", ata: "10:59", delayMin: 10, trip: "T 9", dateCode: "04-2026/30", status: "airborne" },
  { id: "f2", flight: "ORO2152", adep: "LFMN", ades: "LEBL", wxDep: "above", wxDes: "above", etd: "11:30", atd: "11:37", eta: "12:35", ata: "12:29", delayMin: 7, trip: "T 9", dateCode: "04-2026/30", status: "arrived" },
  { id: "f3", flight: "URCRV", adep: "LSZR", ades: "LHTL", wxDep: "average", wxDes: "unknown", etd: "12:00", atd: "12:03", eta: "13:25", ata: "13:32", delayMin: 3, trip: "T 9", dateCode: "04-2026/26", status: "airborne" },
  { id: "f4", flight: "VPC002", adep: "LOWW", ades: "LCLK", wxDep: "above", wxDes: "above", etd: "12:00", atd: "12:03", eta: "14:55", ata: "14:36", delayMin: 3, trip: "T 9", dateCode: "04-2026/5", status: "arrived" },
  { id: "f5", flight: "JTY52W", adep: "LFMN", ades: "LOWW", wxDep: "above", wxDes: "above", etd: "14:30", atd: "14:37", eta: "16:00", ata: "15:58", delayMin: 7, trip: "T 9", dateCode: "04-2026/14", status: "arrived" },
  { id: "f6", flight: "JTY52W", adep: "LOWW", ades: "LEMG", wxDep: "above", wxDes: "above", etd: "08:00", atd: "", eta: "11:10", ata: "", delayMin: 0, trip: "F 10", dateCode: "04-2026/14", status: "not_departed" },
  { id: "f7", flight: "KLJ6305", adep: "EGKB", ades: "LIRQ", wxDep: "above", wxDes: "average", etd: "10:00", atd: "10:30", eta: "12:10", ata: "", delayMin: 30, trip: "F 10", dateCode: "LYCHF-K-26/14", status: "delayed" },
  { id: "f8", flight: "KLJ6306", adep: "LIRQ", ades: "LPQQ", wxDep: "above", wxDes: "above", etd: "12:00", atd: "", eta: "13:50", ata: "", delayMin: 0, trip: "F 10", dateCode: "LYCHF-K-26/014", status: "not_departed" },
  { id: "f9", flight: "KLJ6246", adep: "LPPR", ades: "EGNX", wxDep: "above", wxDes: "above", etd: "13:00", atd: "", eta: "15:25", ata: "", delayMin: 0, trip: "L 10", dateCode: "LYBGS-K-26/015", status: "ctot", ctot: "13:25" },
  { id: "f10", flight: "T7CHMG", adep: "UGTB", ades: "UDYZ", wxDep: "average", wxDes: "below", etd: "16:00", atd: "", eta: "16:35", ata: "", delayMin: 45, trip: "F 10", dateCode: "04-2026/1", status: "delayed" },
  { id: "f11", flight: "KL6903", adep: "LRBS", ades: "UGTB", wxDep: "above", wxDes: "average", etd: "09:00", atd: "", eta: "11:30", ata: "", delayMin: 0, trip: "S 11", dateCode: "LY-MGM-C-549", status: "not_departed" },
  { id: "f12", flight: "JTY52W", adep: "ESSB", ades: "GCLP", wxDep: "below", wxDes: "above", etd: "10:00", atd: "", eta: "16:40", ata: "", delayMin: 0, trip: "S 11", dateCode: "04-2026/8", status: "not_departed" },
  { id: "f13", flight: "JTY901", adep: "EPRZ", ades: "LCLK", wxDep: "average", wxDes: "above", etd: "10:00", atd: "", eta: "13:05", ata: "", delayMin: 0, trip: "LY-PMI-C-546", dateCode: "04-2026/29", status: "not_departed" },
  { id: "f14", flight: "AMO214C", adep: "LCLK", ades: "EGGW", wxDep: "above", wxDes: "above", etd: "15:00", atd: "", eta: "19:35", ata: "", delayMin: 0, trip: "S 11", dateCode: "04-2026/29", status: "not_departed" },
  { id: "f15", flight: "KLJ1", adep: "LCJK", ades: "LLBG", wxDep: "above", wxDes: "above", etd: "05:00", atd: "", eta: "06:10", ata: "", delayMin: 0, trip: "S 12", dateCode: "LY-PMI-C-550", status: "not_departed" },
  { id: "f16", flight: "KLJ8", adep: "UGTB", ades: "LLBG", wxDep: "average", wxDes: "above", etd: "07:10", atd: "", eta: "10:10", ata: "", delayMin: 0, trip: "S 12", dateCode: "LY-MGM-C-551", status: "not_departed" },
  { id: "f17", flight: "KLJ2", adep: "LLBG", ades: "UGSB", wxDep: "above", wxDes: "above", etd: "07:10", atd: "", eta: "10:00", ata: "", delayMin: 0, trip: "S 12", dateCode: "LY-PMI-C-550", status: "not_departed" },
  { id: "f18", flight: "JTY52W", adep: "GCLP", ades: "EDDN", wxDep: "above", wxDes: "average", etd: "10:00", atd: "", eta: "14:15", ata: "", delayMin: 20, trip: "S 12", dateCode: "04-2026/8", status: "delayed" },
];

export const limitations: Limitation[] = [
  { id: 1, isPermanent: true, title: "LEBL SLOT", description: "PLS FILE FPL ALWAYS ACC TO LEBL ISSUED SLOT", type: "AIRPORT", airports: ["LEBL"], countries: ["ES"], flights: [] },
  { id: 2, isPermanent: true, title: "EVRA CLSD TUE-WED", description: "RWY maintenance each week from TUE 2200 UTC to WED 0300 UTC.", type: "AIRPORT", airports: ["EVRA"], countries: ["LV"], flights: [] },
  { id: 3, isPermanent: true, title: "LYBE MAX 01HR ON GROUND", description: "Maximum parking/turnaround time limited to 1 hour for ad-hoc commercial flights.", type: "AIRPORT", airports: ["LYBE"], countries: ["RS"], flights: [] },
  { id: 4, isPermanent: true, title: "OMDW", description: "Night curfew procedures for ad-hoc charter arrivals.", type: "AIRPORT", airports: ["OMDW"], countries: ["AE"], flights: [] },
  { id: 5, isPermanent: true, title: "LIRF PARKING RESTRICTION", description: "Parking slots require pre-allocation and handling confirmation.", type: "AIRPORT", airports: ["LIRF"], countries: ["IT"], flights: [] },
  { id: 6, isPermanent: true, title: "DENGUE DESINFECTION", description: "Disinfection certificates mandatory for inbound flights from risk countries.", type: "COUNTRY", airports: [], countries: ["BR", "TH"], flights: [] },
];

export const operators: Operator[] = [
  { operatorId: "26v", name: "26V", flightCount: 0, refreshTokenMasked: "••••••••••••26v" },
  { operatorId: "ARTLW", name: "ART LINE", flightCount: 0, refreshTokenMasked: "••••••••••••lw" },
  { operatorId: "bsg", name: "BSG", flightCount: 0, refreshTokenMasked: "••••••••••••bsg" },
  { operatorId: "bys", name: "BYS", flightCount: 2, refreshTokenMasked: "••••••••••••bys" },
  { operatorId: "cwy-cwy", name: "CWY", flightCount: 16, refreshTokenMasked: "••••••••••••cwy" },
  { operatorId: "JTY", name: "Jetology", flightCount: 9, refreshTokenMasked: "••••••••••••jty" },
  { operatorId: "klj", name: "KLJ", flightCount: 40, refreshTokenMasked: "••••••••••••klj" },
  { operatorId: "sbb", name: "SBB", flightCount: 1, refreshTokenMasked: "••••••••••••sbb" },
  { operatorId: "SUNWAY", name: "SUNWAY", flightCount: 1, refreshTokenMasked: "••••••••••••sun" },
  { operatorId: "vpc", name: "VPC", flightCount: 14, refreshTokenMasked: "••••••••••••vpc" },
];

export const caaDetails: CaaDetails = {
  country: "Latvia",
  authorityName: "Civil Aviation Agency of Latvia",
  contactEmail: "ops@caa.gov.lv",
  contactPhones: "+371 6000 1234",
  website: "https://www.caa.gov.lv",
  actualAddress: "Biroju iela 10, Riga, LV-1053",
  financialAddress: "Skolas iela 8, Riga, LV-1010",
  workingHours: "Mon-Fri 08:00-17:00 UTC+2",
  notes: "Use AFTN for urgent slot coordination after hours.",
};

export const aircrafts = [
  "9H-IVO", "B-8250", "D-FRIP", "EC-OMU", "ES-KAG", "ES-PVC", "EW-579PP", "LY-BBN",
  "LY-BOA", "LY-CHF", "LY-FLT", "LY-JMG", "LY-KDT", "LY-MGM", "LY-PMI", "LY-TFS",
  "N157MG", "OE-LOW", "SP-AMC", "T7-CHMG", "UR-CRV", "YU-APR",
];

export const users: UserRecord[] = [
  { email: "arm@clearway.aero", firstName: "Artyom", lastName: "Gud", latestActivity: "26.09.2024 03:23", role: "ADMIN", active: true },
  { email: "vjp@clearway.aero", firstName: "Vjacheslav", lastName: "Pukshtis", latestActivity: "28.10.2023 08:07", role: "USER", active: false },
  { email: "zujevics.valerijs@gmail.com", firstName: "Valerijs", lastName: "Zujevics", latestActivity: "09.04.2026 13:59", role: "ADMIN", active: true },
  { email: "ops@clearway.aero", firstName: "Ops", lastName: "Desk", latestActivity: "09.04.2026 12:01", role: "USER", active: true },
  { email: "crew.alerts@clearway.aero", firstName: "Crew", lastName: "Alerts", latestActivity: "09.04.2026 11:27", role: "USER", active: true },
];

export const logs: LogRecord[] = [
  { id: "l1", date: "02.04.2026 13:22", user: "Valerijs Zujevics", role: "ADMIN", action: "CREATE", message: "Has created a limitation for Airports: 'Riga International'; Flights: ''." },
  { id: "l2", date: "27.12.2025 09:54", user: "Valerijs Zujevics", role: "ADMIN", action: "UPDATE", message: "Has updated a limitation for Airports: ''; Countries: ''; Flights: ''." },
  { id: "l3", date: "27.12.2025 09:54", user: "Valerijs Zujevics", role: "ADMIN", action: "CREATE", message: "Has created a limitation for Airports: ''; Countries: ''; Flights: ''." },
  { id: "l4", date: "23.12.2025 12:33", user: "Valerijs Zujevics", role: "ADMIN", action: "DELETE", message: "Removed the limitation for Airports: 'Athens Intl Eleftherios Venizelos'; Countries: ''; Flights: ''." },
  { id: "l5", date: "01.12.2025 06:42", user: "Valerijs Zujevics", role: "ADMIN", action: "UPDATE", message: "Updated limitation from countries to airport-level scope." },
  { id: "l6", date: "28.11.2025 09:06", user: "Valerijs Zujevics", role: "ADMIN", action: "DELETE", message: "Removed limitation for Airports: 'Paphos Intl'; Countries: ''." },
  { id: "l7", date: "28.11.2025 09:05", user: "Valerijs Zujevics", role: "ADMIN", action: "CREATE", message: "Created limitation for Airports: 'Belgrade/Beograd Nikola Tesla'." },
];

export const permanentNotices = limitations.slice(0, 6).map((item) => ({
  number: item.id,
  title: item.title,
  details: item.description,
}));
