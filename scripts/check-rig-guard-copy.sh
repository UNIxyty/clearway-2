#!/usr/bin/env bash
# The wall carries a copy of lib/rig-guard.mjs (its Docker context cannot reach the repo root). They must match.
cd "$(dirname "$0")/.."
if diff <(tail -n +3 digital-wall/lib/rig-guard.mjs) lib/rig-guard.mjs >/dev/null; then echo "rig-guard copies match"; else echo "digital-wall/lib/rig-guard.mjs differs from lib/rig-guard.mjs — copy it again"; exit 1; fi
