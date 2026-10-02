#!/usr/bin/env bash
# Fetches current ICU time-zone data for the rig's local Node (Node's own copy is frozen at the Node release).
# The same script the agent image runs at build, so the rig converts times with the data production uses.
#   rig/tzdata.sh   → rig/.scratch/icu-tz/  (rig/start.sh points the agent at it)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/rig/.scratch/icu-tz"
node "$ROOT/agent/scripts/fetch-tzdata.mjs" "$OUT"
ICU_TIMEZONE_FILES_DIR="$OUT" node -p '"node now reads tz data " + process.versions.tz'
