// Passenger Manifest rig fixtures — Leon-shaped flights with FAKE people (spec §6: names and passport numbers are
// invented, TEST00001…; flight values SAMPLE AVIATION UAB / LY-TST / TST101 / EYVI → LSGG). They go through the
// generator's real path (parse id → Leon read → mapping → render) with a stub Leon client in place of the network.
const S = ["EXAMPLE", "SAMPLE", "SPECIMEN", "TESTER", "DUMMY", "PLACEHOLDER", "FICTIVE", "NOTREAL", "DEMOSON", "MOCKLEY", "FAKEWELL", "TESTWOOD", "SAMPLETON", "PROTO"];
const G = ["Alice", "Bruno", "Carla", "Dmitri", "Elena", "Felix", "Greta", "Hugo", "Ines", "Jonas", "Kira", "Lukas", "Mila", "Nils", "Olga", "Pavel", "Rita"];
const P = ["Testville", "Sampleton", "Exampleburg", "Mockford", "Demotown", "Fakesby"];
const N = [["Lithuania", "LTU"], ["Latvia", "LVA"], ["Germany", "DEU"], ["France", "FRA"], ["Poland", "POL"], ["Estonia", "EST"]];
const iso = (i, y) => `${y + ((i * 3) % 20)}-${String(1 + ((i * 5) % 12)).padStart(2, "0")}-${String(1 + ((i * 7) % 28)).padStart(2, "0")}`;

function contact(i) {
  return {
    passengerContactNid: 900000 + i,
    contact: {
      name: G[(i * 3 + Math.floor(i / S.length)) % G.length], surname: S[i % S.length].charAt(0) + S[i % S.length].slice(1).toLowerCase(), middleName: null,
      genderEnum: i % 3 === 1 ? "FEMALE" : "MALE", dateOfBirth: iso(i, 1960), placeOfBirth: P[i % P.length],
      nationality: { name: N[i % N.length][0], codeIso: N[i % N.length][1] }, maskingStatus: { isPassportMasked: false, isProfileDataMasked: false },
    },
    departurePassport: { number: `TEST${String(i + 1).padStart(5, "0")}`, expiresDate: iso(i + 3, 2027), neverExpires: false, isMasked: false, unavailable: false, surname: null, name: null, middleName: null, nationality: null },
    arrivalPassport: null, departureTravelDocument: null, arrivalTravelDocument: null, departureNationalId: null, arrivalNationalId: null,
  };
}

export function flight({ pax = 0, crew = 3, nid = 101, operator = "SAMPLE AVIATION UAB", mutate = null, leonCount = undefined } = {}) {
  const contacts = Array.from({ length: pax }, (_, i) => contact(i));
  if (mutate) mutate(contacts);
  return {
    flightNid: nid, flightNo: "TST101", isCnl: false, startTimeUTC: "2026-10-14T06:30:00Z",
    startAirport: { code: { icao: "EYVI" } }, endAirport: { code: { icao: "LSGG" } }, acft: { registration: "LY-TST" },
    operator: { name: operator }, flightWatch: { paxCount: null }, journeyLog: { paxCount: null },
    crewMemberList: Array.from({ length: crew }, (_, i) => ({ loginNid: i + 1 })),
    passengerList: pax || leonCount ? { count: leonCount ?? pax, isDataSourceText: false, isDataSourceContact: true, passengerContactList: contacts } : null,
  };
}

/** A stub of leonForUser's client: answers the manifest's flight query from a fixture, refuses everything else. */
export function stubLeon(f, { unmask = null } = {}) {
  return {
    oprId: "rig",
    async graphql(query) {
      if (/unmaskedData/.test(query)) return unmask ? { data: { flight: { passengerList: { passengerContactList: unmask } } }, errors: null, httpStatus: 200 } : { data: null, errors: [{ message: "Permission denied" }], httpStatus: 200 };
      if (/flight\(flightNid:/.test(query)) return { data: { flight: f }, errors: null, httpStatus: 200 };
      return { data: null, errors: [{ message: "stub: unexpected query" }], httpStatus: 400 };
    },
  };
}

/** The six states of spec §6 (state 1, blank, needs no flight). */
export const STATES = [
  { id: "1-blank", label: "Blank form for hand-filling (no page number)", blank: true },
  { id: "2-three-passengers", label: "3 passengers, 11 empty ruled rows", flight: () => flight({ pax: 3 }) },
  { id: "3-fourteen-passengers", label: "14 passengers, exactly one page", flight: () => flight({ pax: 14 }) },
  { id: "4-sixty-eight-passengers", label: "68 passengers across five pages (14+14+14+14+12, footer on page 5)", flight: () => flight({ pax: 68 }) },
  {
    id: "5-missing-data", label: "Row 2 has no place of birth and no expiry (blank cells, reported)",
    flight: () => flight({ pax: 4, mutate: (c) => { c[1].contact.placeOfBirth = null; c[1].departurePassport.expiresDate = null; } }),
  },
  {
    id: "6-overflow", label: "Every overflow step, and a long operator name wrapped onto two lines",
    flight: () => flight({
      pax: 5, operator: "SAMPLE AVIATION CHARTER OPERATIONS UAB",
      mutate: (c) => {
        c[0].contact.surname = "Example-Specimen"; c[0].contact.name = "Anna Maria Louise Rose"; // shrink (one line, smaller)
        c[1].contact.surname = "Placeholder-Fictive-Mockley"; c[1].contact.name = "Alexandra Josephine Marguerite"; // wrap
        c[1].contact.placeOfBirth = "Sampleton-upon-Testwater, Exampleshire"; // wrap
        c[2].contact.placeOfBirth = "Llanfairpwllgwyngyll"; // shrink
        c[2].contact.nationality = { name: "Saint Vincent and the Grenadines", codeIso: "VCT" }; // shrink
        c[3].contact.surname = "Specimen-De-La-Placeholder-Testwood-Sampleton"; c[3].contact.name = "Maria Alexandra Josephine Konstantina Bernadette Wilhelmina Theodora Evangelina"; // truncate + flag
        c[4].departurePassport.number = `TEST${"0".repeat(35)}5`; // no spaces: wraps mid-string
      },
    }),
  },
];
