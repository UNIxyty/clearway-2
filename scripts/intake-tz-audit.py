#!/usr/bin/env python3
"""Read-only audit: did intake load any flight into Leon with a UTC time converted from local time wrongly?

For every leg in the send log that is (or may be) in Leon, takes the reviewed STD/STA as they were sent, finds
the ones whose UTC came from a LOCAL time (converted by code, or set as local by a person), recomputes the UTC
with this machine's IANA time-zone database, and compares it with what was sent. Prints routes, times and Leon
flight ids only: no names, no personal data, no keys. Makes GET requests only.

    python3 scripts/intake-tz-audit.py .env        (the env file with NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)

Run it on a machine whose tz database is current (the script prints its version).
"""
import json, sys, urllib.request, datetime as dt, zoneinfo, pathlib

envfile = sys.argv[1] if len(sys.argv) > 1 else ".env"
env = {}
for line in open(envfile):
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
URL, KEY = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), env["SUPABASE_SERVICE_ROLE_KEY"]

def get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

ver = pathlib.Path("/usr/share/zoneinfo/+VERSION")
print("database:", URL.split("//")[1].split(".")[0][:6] + "…" if "supabase.co" in URL else URL)
print("tz database on this machine:", ver.read_text().strip() if ver.exists() else "unknown (check tzdata package)")

writes = get("intake_leon_writes?select=request_id,leg_index,state,leon_flight_nid,leon_trip_nid,payload,created_at&state=in.(in_leon,unknown,sending)&order=created_at.asc&limit=2000")
print(f"send-log rows that are or may be in Leon: {len(writes)}")
req_ids = sorted({w["request_id"] for w in writes})
reviews = {}
for i in range(0, len(req_ids), 40):
    chunk = ",".join(req_ids[i:i + 40])
    for r in get(f"intake_requests?select=id,reference,status,review&id=in.({chunk})"):
        reviews[r["id"]] = r

def to_utc(date, hhmm, tz):
    """Local wall clock → UTC with the current tz database. Returns (iso, ambiguous_or_missing)."""
    z = zoneinfo.ZoneInfo(tz); y, m, d = map(int, date.split("-")); h, mi = map(int, hhmm.split(":"))
    a = dt.datetime(y, m, d, h, mi, tzinfo=z, fold=0); b = a.replace(fold=1)
    ua, ub = a.astimezone(dt.timezone.utc), b.astimezone(dt.timezone.utc)
    odd = ua != ub or ua.astimezone(z).replace(tzinfo=None) != a.replace(tzinfo=None)
    return ua.strftime("%Y-%m-%dT%H:%M:%SZ"), odd

def norm(iso):
    return dt.datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if iso else None

counts = {"legs": 0, "utc_source": 0, "local_source": 0, "wrong": 0, "odd": 0, "no_review": 0}
wrong = []
for w in writes:
    counts["legs"] += 1
    rq = reviews.get(w["request_id"]); leg = None
    if rq and rq.get("review"):
        leg = next((l for l in rq["review"].get("legs", []) if l.get("index") == w["leg_index"]), None)
    if not leg:
        counts["no_review"] += 1; print(f"  ? {w['request_id'][:8]} leg {w['leg_index'] + 1}: no reviewed leg found; payload {w['payload'].get('adepCode')}→{w['payload'].get('adesCode')} {w['payload'].get('startTimeUTC')}"); continue
    f = {x["key"]: x for x in leg["fields"]}
    for key, side, sent_key in (("std", "departure", "startTimeUTC"), ("sta", "arrival", "endTimeUTC")):
        t = f.get(key) or {}; apt = (f.get(side) or {}).get("airport") or {}
        note = f"{t.get('note') or ''} {(t.get('edited') or {}).get('note') or ''}"
        from_local = t.get("state") == "converted" or "local" in note.lower() or (t.get("localTime") and not str(t.get("zoneWords") or "").strip().upper().startswith(("Z", "UTC", "GMT")) and t.get("state") not in ("cross_checked",))
        sent = norm((w.get("payload") or {}).get(sent_key))
        label = f"{rq.get('reference') or w['request_id'][:8]} leg {w['leg_index'] + 1} {key.upper()} {apt.get('icao') or '????'} ({apt.get('tz') or 'no tz'}) · Leon flight {w.get('leon_flight_nid') or '?'} · {w['state']}"
        if not from_local:
            counts["utc_source"] += 1; continue
        counts["local_source"] += 1
        local = t.get("localTime") or t.get("value")
        if not (apt.get("tz") and t.get("date") and local):
            print(f"  ? {label}: converted from local but tz/date/time missing in the review; sent {sent}"); continue
        correct, odd = to_utc(t["date"], local, apt["tz"])
        if odd: counts["odd"] += 1
        status = "OK" if correct == sent else "WRONG"
        if status == "WRONG": counts["wrong"] += 1; wrong.append(label)
        print(f"  {status}  {label}: local {t['date']} {local} → sent {sent}, correct {correct}{'  (ambiguous or non-existent local time)' if odd else ''}")

print("\nsummary:", json.dumps(counts))
print("WRONG TIMES IN LEON:" if wrong else "No flight in Leon has a time that was converted wrongly.")
for x in wrong: print("  ", x)
