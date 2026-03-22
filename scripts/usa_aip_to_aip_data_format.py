#!/usr/bin/env python3
"""
Convert data/usa-aip-icaos-by-state.json to same field set as data/aip-data.json.
Output: one country object with airports array containing only:
  row_number, Airport Code, Airport Name,
  AD2.2 Types of Traffic Permitted, AD2.2 Remarks,
  AD2.3 AD Operator, AD 2.3 Customs and Immigration, AD2.3 ATS, AD2.3 Remarks,
  AD2.6 AD category for fire fighting
"""
import json
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
INPUT_JSON = PROJECT / "data" / "usa-aip-icaos-by-state.json"
OUTPUT_JSON = PROJECT / "data" / "usa-aip-icaos-by-state.json"


def main():
    with open(INPUT_JSON, encoding="utf-8") as f:
        data = json.load(f)

    def to_aip_fields(apt, row_num=None):
        op_hours = apt.get("operational_hours", "NIL") or "NIL"
        # When operator is H24 (all months), customs and ATS work H24 too
        customs_ats = "H24" if op_hours == "H24" else "NIL"
        return {
            **({"row_number": row_num} if row_num is not None else {}),
            "Airport Code": apt.get("icao", ""),
            "Airport Name": apt.get("airportName", ""),
            "AD2.2 Types of Traffic Permitted": apt.get("traffic", "IFR / VFR"),
            "AD2.2 Remarks": (apt.get("remarks") or "NIL") if apt.get("remarks") else "NIL",
            "AD2.3 AD Operator": op_hours,
            "AD 2.3 Customs and Immigration": customs_ats,
            "AD2.3 ATS": customs_ats,
            "AD2.3 Remarks": "NIL",
            "AD2.6 AD category for fire fighting": (apt.get("rescue_firefighting") or "NIL"),
        }

    airports = []
    by_state = {}
    row = 1
    for state_name, state_airports in data["by_state"].items():
        by_state[state_name] = []
        for apt in state_airports:
            rec = to_aip_fields(apt, row_num=row)
            airports.append(rec)
            by_state[state_name].append({k: v for k, v in rec.items() if k != "row_number"})
            row += 1

    out = {
        "country": "United States of America",
        "source": data.get("source", "USA AIP AD 2 + FAA APT CSV"),
        "by_state": by_state,
        "airports": airports,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(airports)} airports (aip-data.json field set only) → {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
