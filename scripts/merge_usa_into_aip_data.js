/**
 * Merges USA from usa-aip-icaos-by-state.json into aip-data.json with GEN_1_2 and GEN_1_2_POINT_4.
 * Run from repo root: node scripts/merge_usa_into_aip_data.js
 */

const fs = require("fs");
const path = require("path");

const GEN_1_2 = `All flights entering, overflying, or landing in the United States must comply with U.S. civil aviation regulations. Aircraft arriving in or departing from the United States are required to first land at, or finally depart from, an international airport as specified in AD 2, unless otherwise authorized. Aircraft entering the United States must land at a designated international airport of entry unless prior landing rights approval has been obtained from U.S. Customs for a landing rights or other authorized airport, and all persons entering the United States are subject to Customs, Immigration, and Public Health inspection. Foreign civil aircraft registered in ICAO member states may operate within the United States in accordance with applicable Federal Aviation Regulations and Department of Transportation requirements, while aircraft registered in non-ICAO member states require specific authorization from the Department of Transportation. All foreign civil aircraft must carry valid certificates of registration and airworthiness, and each flight crew member must hold an appropriate and valid license. Transportation of firearms and ammunition by passengers is subject to U.S. federal regulations requiring written notice to the carrier unless such items are placed in the custody of the aircraft operator for the duration of the flight. Commercial air transport operators must comply with ICAO Annex 6 fuel reserve requirements, including a minimum fixed reserve of 45 minutes plus a 15 percent variable reserve to destination and alternate when required, or a maximum reserve of two hours fuel where applicable.`;

const GEN_1_2_POINT_4 = `Private aircraft operating to, from, within, or transiting U.S. territorial airspace must comply with applicable security requirements issued under 14 CFR 99.7 and related FAA Special Security Instructions. Operators conducting private flights with intermediate landings in the United States must provide advance notice of arrival to U.S. Customs at or nearest the first intended airport of landing, with sufficient time to allow inspection officials to be present; at least one hour notice is required during normal business hours, and additional time may be required outside those hours. The notification must include aircraft type and registration, name of the aircraft commander, number of U.S. citizen and non-U.S. citizen passengers, last foreign departure point, estimated time and location of U.S. border or coastline crossing, intended first landing airport, and estimated time of arrival. Advance notice may be transmitted via an ADCUS message in the flight plan where available; however, the pilot remains fully responsible for ensuring Customs is properly notified and may be subject to penalties for noncompliance. Additional one-hour advance notification requirements apply for certain arrivals from Mexico, the U.S. Virgin Islands, Puerto Rico, and specified southern border, Gulf, Atlantic, and Pacific ADIZ areas, and aircraft subject to these provisions must land for inspection at the nearest designated airport unless an approved overflight exemption has been granted. Private aircraft are defined as civil aircraft not engaged in the transportation of persons or property for compensation or hire. Operators may apply to the appropriate U.S. Customs authority for single or term overflight exemptions from the designated airport landing requirement, subject to advance application timelines and compliance with operating conditions including minimum altitude requirements, approved crew and passenger identification, aircraft capability and equipment specifications, approved first landing airports, and full disclosure of ownership, operational, and routing details; conditional approvals may apply to charter or air taxi operators, and incomplete applications will not be processed.`;

const root = path.join(__dirname, "..");
const aipPath = path.join(root, "data", "aip-data.json");
const usaPath = path.join(root, "data", "usa-aip-icaos-by-state.json");

const aipData = JSON.parse(fs.readFileSync(aipPath, "utf8"));
const usaData = JSON.parse(fs.readFileSync(usaPath, "utf8"));

// Skip if USA already in aip-data
if (aipData.some((c) => c.country === "United States of America")) {
  console.log("USA already in aip-data.json; updating GEN_1_2 and GEN_1_2_POINT_4 only.");
  const usaEntry = aipData.find((c) => c.country === "United States of America");
  usaEntry.GEN_1_2 = GEN_1_2;
  usaEntry.GEN_1_2_POINT_4 = GEN_1_2_POINT_4;
} else {
  const usaEntry = {
    country: "United States of America",
    GEN_1_2: GEN_1_2,
    GEN_1_2_POINT_4: GEN_1_2_POINT_4,
    airports: usaData.airports,
  };
  aipData.push(usaEntry);
  console.log("Added United States of America to aip-data.json with", usaData.airports.length, "airports.");
}

fs.writeFileSync(aipPath, JSON.stringify(aipData, null, 2), "utf8");
console.log("Wrote data/aip-data.json");
