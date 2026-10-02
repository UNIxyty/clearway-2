#!/usr/bin/env bash
# Fetches current ICU time-zone data for the rig's local Node (macOS ships none, and Node's own copy is frozen at
# the Node release). Takes it from the same Ubuntu package the agent image installs, so the rig converts times
# with the data production uses.   rig/tzdata.sh   → rig/.scratch/icu-tz/  (rig/start.sh points the agent at it)
set -euo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)/.scratch/icu-tz"; mkdir -p "$OUT"
docker run --rm -v "$OUT:/out" ubuntu:noble bash -c 'apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq --no-install-recommends tzdata-icu >/dev/null 2>&1 && cp /usr/share/zoneinfo-icu/44/le/*.res /out/ && dpkg -s tzdata-icu | grep ^Version > /out/VERSION'
echo "tz data for the rig: $(cat "$OUT/VERSION")"
ICU_TIMEZONE_FILES_DIR="$OUT" node -p '"node now reads tz data " + process.versions.tz'
