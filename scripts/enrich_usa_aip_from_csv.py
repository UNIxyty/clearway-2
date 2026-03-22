#!/usr/bin/env python3
"""
Enrich data/usa-aip-icaos-by-state.json with fields from 19_Feb_2026_APT_CSV.
Adds: coordinates, elevation, operational hours, firefighting (ARFF), fuel, remarks, contact, etc.
"""
import csv
import json
from pathlib import Path
from collections import defaultdict

PROJECT = Path(__file__).resolve().parent.parent
CSV_DIR = PROJECT / "19_Feb_2026_APT_CSV"
AIP_JSON = PROJECT / "data" / "usa-aip-icaos-by-state.json"


def main():
    with open(AIP_JSON, encoding="utf-8") as f:
        data = json.load(f)

    # Build list of (state, airport_dict) for each ICAO we have
    aip_by_icao = {}
    for state_name, airports in data["by_state"].items():
        for apt in airports:
            icao = apt["icao"].strip().upper()
            aip_by_icao[icao] = {**apt, "state_key": state_name}

    # ---- APT_BASE: ICAO_ID -> one row per airport (prefer SITE_TYPE A for airport)
    base_by_icao = {}
    with open(CSV_DIR / "APT_BASE.csv", newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            icao = (row.get("ICAO_ID") or "").strip().upper()
            if not icao or len(icao) != 4:
                continue
            site_type = row.get("SITE_TYPE_CODE", "").strip()
            # Prefer airport (A) over heliport (H) / other
            if icao not in base_by_icao or site_type == "A":
                base_by_icao[icao] = {
                    "site_no": row.get("SITE_NO", "").strip(),
                    "arpt_id": row.get("ARPT_ID", "").strip(),
                    "state_code": row.get("STATE_CODE", "").strip(),
                    "city": row.get("CITY", "").strip(),
                    "lat": row.get("LAT_DECIMAL", "").strip() or None,
                    "lon": row.get("LONG_DECIMAL", "").strip() or None,
                    "elev_ft": row.get("ELEV", "").strip() or None,
                    "state_name": row.get("STATE_NAME", "").strip() or None,
                    "arpt_name": row.get("ARPT_NAME", "").strip() or None,
                    "fuel_types": row.get("FUEL_TYPES", "").strip() or None,
                    "far_139_type": row.get("FAR_139_TYPE_CODE", "").strip() or None,
                    "arff_cert_date": row.get("ARFF_CERT_TYPE_DATE", "").strip() or None,
                    "lgt_sked": row.get("LGT_SKED", "").strip() or None,
                    "bcn_lgt_sked": row.get("BCN_LGT_SKED", "").strip() or None,
                    "twr_type": row.get("TWR_TYPE_CODE", "").strip() or None,
                    "phone": row.get("PHONE_NO", "").strip() or None,
                    "toll_free": row.get("TOLL_FREE_NO", "").strip() or None,
                    "notam_id": row.get("NOTAM_ID", "").strip() or None,
                    "other_services": row.get("OTHER_SERVICES", "").strip() or None,
                    "activation_date": row.get("ACTIVATION_DATE", "").strip() or None,
                }

    # ---- APT_ATT: (SITE_NO, ARPT_ID) -> list of (MONTH, DAY, HOUR)
    att_by_key = defaultdict(list)
    with open(CSV_DIR / "APT_ATT.csv", newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            key = (row.get("SITE_NO", "").strip(), row.get("ARPT_ID", "").strip())
            att_by_key[key].append({
                "month": row.get("MONTH", "").strip(),
                "day": row.get("DAY", "").strip(),
                "hour": row.get("HOUR", "").strip(),
            })

    # ---- APT_RMK: (SITE_NO, ARPT_ID) -> GENERAL_REMARK lines
    rmk_by_key = defaultdict(list)
    with open(CSV_DIR / "APT_RMK.csv", newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            if row.get("REF_COL_NAME", "").strip() != "GENERAL_REMARK":
                continue
            key = (row.get("SITE_NO", "").strip(), row.get("ARPT_ID", "").strip())
            rem = (row.get("REMARK", "") or "").strip()
            if rem:
                rmk_by_key[key].append(rem)

    # ---- APT_CON: (SITE_NO, ARPT_ID) -> first manager/owner phone
    con_phone_by_key = {}
    with open(CSV_DIR / "APT_CON.csv", newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            key = (row.get("SITE_NO", "").strip(), row.get("ARPT_ID", "").strip())
            if key in con_phone_by_key:
                continue
            phone = (row.get("PHONE_NO", "") or "").strip()
            if phone:
                con_phone_by_key[key] = phone

    def format_operational_hours(recs):
        if not recs:
            return None
        parts = []
        for r in recs:
            m, d, h = r.get("month", ""), r.get("day", ""), r.get("hour", "")
            if h == "ALL" or (m == "ALL" and d == "ALL" and h == "ALL"):
                parts.append("H24")
                break
            if m and d and h:
                parts.append(f"{d} {h}".strip())
            elif h:
                parts.append(h)
        return "; ".join(parts[:5]) if parts else None

    # Merge into AIP data
    for icao, apt in aip_by_icao.items():
        base = base_by_icao.get(icao)
        if not base:
            continue
        key = (base["site_no"], base["arpt_id"])
        # Coordinates & elevation
        if base.get("lat"):
            apt["lat"] = float(base["lat"])
        if base.get("lon"):
            apt["lon"] = float(base["lon"])
        if base.get("elev_ft"):
            try:
                apt["elevation_ft"] = float(base["elev_ft"])
            except ValueError:
                pass
        # State/city from CSV (can override AIP)
        if base.get("state_name"):
            apt["state"] = base["state_name"]
        if base.get("city"):
            apt["city"] = base["city"]
        # Traffic: assume IFR/VFR for international designated
        apt["traffic"] = "IFR/VFR"
        # Operational hours (AD 2.3)
        att_recs = att_by_key.get(key, [])
        apt["operational_hours"] = format_operational_hours(att_recs) or "H24"
        # Rescue/firefighting (AD 2.6): full text e.g. "ARFF Index I E certified on 5/1/1973"
        far = base.get("far_139_type")
        arff_date = base.get("arff_cert_date")
        if far and arff_date:
            # CSV date is YYYY/MM -> display as M/1/YYYY
            parts = arff_date.split("/")
            if len(parts) == 2:
                y, m = parts[0].strip(), parts[1].strip()
                apt["rescue_firefighting"] = f"ARFF Index {far} certified on {m}/1/{y}"
            else:
                apt["rescue_firefighting"] = f"ARFF Index {far} certified on {arff_date}"
        else:
            apt["rescue_firefighting"] = base.get("arff_cert_date") or "NIL"
        # Fuel
        apt["fuel_types"] = base.get("fuel_types") or "NIL"
        # Lighting schedule
        apt["lighting_schedule"] = base.get("lgt_sked") or base.get("bcn_lgt_sked") or None
        # Tower
        apt["tower"] = base.get("twr_type") or None
        # Contact
        apt["contact_phone"] = con_phone_by_key.get(key) or base.get("phone") or base.get("toll_free") or None
        # NOTAM
        apt["notam_id"] = base.get("notam_id") or None
        # Remarks (AD 2.2)
        remarks = rmk_by_key.get(key, [])
        apt["remarks"] = " | ".join(remarks[:10]) if remarks else "NIL"
        # Other services
        apt["other_services"] = base.get("other_services") or None

    # Write back: preserve structure, drop internal key
    for state_name, airports in data["by_state"].items():
        for apt in airports:
            icao = apt["icao"].strip().upper()
            extra = aip_by_icao.get(icao, {})
            for k in ["lat", "lon", "elevation_ft", "state", "city", "traffic", "operational_hours",
                      "rescue_firefighting", "fuel_types", "lighting_schedule", "tower",
                      "contact_phone", "notam_id", "remarks", "other_services"]:
                if k in extra and extra[k] is not None:
                    apt[k] = extra[k]
            if "state_key" in apt:
                del apt["state_key"]

    data["source"] = "USA AIP AD 2 (27 APR 17) + FAA 19_Feb_2026_APT_CSV"
    with open(AIP_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Enriched {len([a for ap in data['by_state'].values() for a in ap])} airports → {AIP_JSON}")


if __name__ == "__main__":
    main()
