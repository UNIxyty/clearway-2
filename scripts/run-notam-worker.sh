#!/usr/bin/env bash
# Run NOTAM scraper with virtual display and S3 upload (for EC2/Linux).
# Usage: ./scripts/run-notam-worker.sh DBBB [KJFK EGLL ...]
# Env: AWS_S3_BUCKET, AWS_REGION, USE_HEADED=1

set -e
ICAOS="${*:-DBBB}"
export USE_HEADED=1
export DISPLAY="${DISPLAY:-:99}"

if ! pgrep -x Xvfb >/dev/null 2>&1; then
  echo "Starting Xvfb on $DISPLAY..."
  Xvfb "$DISPLAY" -screen 0 1920x1080x24 &
  sleep 2
fi

for icao in $ICAOS; do
  icao=$(echo "$icao" | tr '[:lower:]' '[:upper:]')
  [[ ${#icao} -eq 4 ]] || { echo "Invalid ICAO: $icao"; continue; }
  echo "Fetching NOTAMs for $icao..."
  node scripts/notam-scraper.mjs --json "$icao"
  echo "Done $icao"
done
