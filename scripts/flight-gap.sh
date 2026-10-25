#!/usr/bin/env bash
# Is there a gap of N minutes (default 30) without a flight movement, for a wall deploy? Reads the wall backend's own
# timeline cache on the server. Runs ON THE SERVER:   scripts/flight-gap.sh [minutes]
# From a Mac:   ssh root@clearway-2 'bash -s 30' < scripts/flight-gap.sh
# Exit 0  GAP      no departure or arrival of a non-cancelled flight in the next N minutes, from a fresh picture
#      1  NO GAP   a movement is due within N minutes (printed)
#      2  CANNOT TELL   the cache is missing, unreadable, stale, or holds no flights at all
# The third answer is the point (2026-10-21): the earlier gap finder parsed "no movements" out of an error message and
# deployed 11 minutes before a departure. A gate whose input is missing refuses; it never says "clear" by default.
# Freshness (2026-10-25): the wall writes data/timeline-cache.json only when a flight CHANGES, so on a quiet evening the
# file is old while the Leon sync is running every cycle and finding nothing new. The picture is fresh when either the
# file or the wall's last sync run (its public /api/health: leon.lastRunAt, healthy, no lastError) is within 20 minutes —
# the file holds exactly what the last successful cycle saw. Health unreadable, unhealthy or with an error → file age alone.
set -u
MIN="${1:-30}"
CONTAINER="${WALL_CONTAINER:-digital-wall-backend}"
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "CANNOT TELL: container $CONTAINER is not here"; exit 2; }
HEALTH=$(curl -s -m 10 "${WALL_HEALTH_URL:-http://127.0.0.1:8088/digital-wall/api/health}" 2>/dev/null || true)
OUT=$(docker exec "$CONTAINER" node -e '
const fs = require("fs"); const MIN = Number(process.argv[1]);
let health = null; try { const h = JSON.parse(process.argv[2] || "null"); if (h && h.service === "digital-wall" && h.leon && h.leon.healthy !== false && !h.leon.lastError) health = h; } catch (e) { health = null; }
const p = "/app/data/timeline-cache.json";
if (!fs.existsSync(p)) { console.log("CANNOT TELL: " + p + " is missing"); process.exit(2); }
let c; try { c = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { console.log("CANNOT TELL: the cache does not parse"); process.exit(2); }
const saved = Date.parse(c.savedAt || ""); const fileAgeMin = Number.isFinite(saved) ? (Date.now() - saved) / 60000 : NaN;
const ran = Date.parse(health?.leon?.lastRunAt || ""); const runAgeMin = Number.isFinite(ran) ? (Date.now() - ran) / 60000 : NaN;
// fresh = the newer of the file and the last healthy sync run (the file is written only when a flight changes)
const ageMin = [fileAgeMin, runAgeMin].filter(Number.isFinite).reduce((a, b) => Math.min(a, b), Infinity);
const ages = "file " + (Number.isFinite(fileAgeMin) ? Math.round(fileAgeMin) + " min" : "undated") + ", last sync run " + (Number.isFinite(runAgeMin) ? Math.round(runAgeMin) + " min" : "unknown");
if (!Number.isFinite(ageMin) || ageMin > 20) { console.log("CANNOT TELL: the picture is stale (" + ages + "; limit 20)"); process.exit(2); }
const flights = Array.isArray(c.flights) ? c.flights.map((x) => x.flight || x) : [];
if (!flights.length) { console.log("CANNOT TELL: the cache holds no flights"); process.exit(2); }
const now = Date.now(); const soon = [];
for (const f of flights) {
  const st = String(f.status || f.tripStatus || "").toUpperCase(); if (/CANCEL|CNL/.test(st) || f.isCnl) continue;
  for (const t of [f.startTimeUTC || f.etd, f.endTimeUTC || f.eta]) { const ms = Date.parse(t || ""); if (!Number.isFinite(ms)) continue; const d = (ms - now) / 60000; if (d >= -1 && d <= MIN) soon.push({ d: Math.round(d), fn: f.flightNo || f.flightNid }); }
}
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16) + "Z";
const next4h = flights.flatMap((f) => [f.startTimeUTC || f.etd, f.endTimeUTC || f.eta]).map((t) => Date.parse(t || "")).filter((ms) => Number.isFinite(ms) && ms > now && ms < now + 4 * 3600000).sort().slice(0, 12).map(hhmm);
console.log("now " + hhmm(now) + " | " + ages + " | " + flights.length + " flights | next movements: " + (next4h.join(" ") || "none in 4 h"));
if (soon.length) { soon.sort((a, b) => a.d - b.d); console.log("NO GAP: movement in " + soon[0].d + " min (" + soon.length + " within " + MIN + ")"); process.exit(1); }
console.log("GAP: no movement within " + MIN + " minutes"); process.exit(0);
' "$MIN" "$HEALTH" 2>&1); rc=$?
echo "$OUT"
# Anything but the three known answers (node missing, exec failed) is also "cannot tell".
case "$OUT" in *"GAP:"*|*"NO GAP:"*|*"CANNOT TELL:"*) exit $rc;; *) echo "CANNOT TELL: unexpected output"; exit 2;; esac
