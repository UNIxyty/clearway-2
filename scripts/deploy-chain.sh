#!/usr/bin/env bash
# The whole deploy, as it is run on the server (2026-11-09; until now a copy in /tmp): wait for a flight gap, keep a
# revert image and prove each new image runs (scripts/check-image-runs.sh), then deploy (scripts/deploy.sh). It holds
# the deploy lock from the image check to the end (rig/box/host-lock.sh), so a rig run waits or is paused throughout,
# not only between the steps. The wait for a gap comes before the lock: waiting for a gap holds back no run.
#   nohup bash scripts/deploy-chain.sh portal digital-wall-frontend > /tmp/deploy-<sha>.out 2>&1 < /dev/null &
set -u
cd "$(dirname "$0")/.." || exit 2
[ "$#" -gt 0 ] || { echo "usage: scripts/deploy-chain.sh <service>..."; exit 2; }
for _ in $(seq 1 120); do bash scripts/flight-gap.sh 30 > /dev/null 2>&1 && break; sleep 60; done
git pull -q --ff-only origin main && git log --oneline -1
. rig/box/host-lock.sh; deploy_lock "deploy-chain.sh $*"
bash scripts/flight-gap.sh 30; g=$?; [ $g -eq 0 ] || { echo "NO GAP ($g) — not deploying"; exit 3; }
bash scripts/check-image-runs.sh "$@" > /tmp/imgruns.out 2>&1; r=$?
grep -E "kept|OK|FAIL|CANNOT|all images" /tmp/imgruns.out
[ $r -eq 0 ] || { echo "image check failed — not deploying"; exit 4; }
bash scripts/flight-gap.sh 30 > /dev/null || { echo "window closed — not deploying"; exit 3; }
bash scripts/deploy.sh "$@" 2>&1 | tail -9; d=${PIPESTATUS[0]}
[ $d -eq 0 ] && echo "CHAIN DONE" || { echo "DEPLOY FAILED ($d) — see the lines above"; exit 5; }
