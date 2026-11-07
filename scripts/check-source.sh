#!/usr/bin/env bash
# The source checks every deploy runs before it builds (2026-11-07). Static scans: no rig, no database, Node's own
# modules only, a few seconds. Until now they ran only inside a full rig run, and pushes went out on targeted suites
# for four days (3-7 Nov) with none: error-text had seven raw-error lines nobody saw, because the verdict that would
# have named them never ran. A deploy cannot skip these.
#   scripts/check-source.sh      exit 0 when every check passes; each failure is printed
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
command -v node >/dev/null || { echo "check-source: REFUSED: no node on this machine, so nothing could be checked"; exit 2; }
fails=0
# (rig/check-no-real-passenger-data.mjs is not here: it reads mail through the agent's own parser, which needs
# node_modules; it stays in the full run)
for c in rig/check-error-text.mjs rig/check-utc-times.mjs rig/check-style-text.mjs rig/check-own-mail.mjs rig/migrations-check.mjs; do
  out="$(node "$c" 2>&1)"; rc=$?
  if [ $rc = 0 ]; then echo "check-source: ok    $c"; else fails=$((fails + 1)); echo "check-source: FAIL  $c (exit $rc)"; printf '%s\n' "$out" | grep -E '^(FAIL|Error|.*Error:)' | head -12 | sed 's/^/    /'; fi
done
[ $fails = 0 ] || { echo "check-source: $fails check(s) failed"; exit 1; }
