#!/usr/bin/env bash
# Two lanes (2026-11-09): the full suite split across two rig boxes, run at the same time, timed, one verdict.
# Lane a (rigbox) runs the suites before rig/run-all-suites.sh's LANE_B_FROM, lane b (rigbox2) that one and the rest;
# each box runs all of the runner's setup. The merged log must hold every suite exactly once and all green.
#   rig/box/two-lanes.sh [--build] [--source <git bundle>]      on the server, as root, from a copy of rig/box/
#     --build    destroy both boxes and build them from nothing first: 3.5 GB and 6 threads each (7 GB for the rig,
#                one over the 6 GB cap the plan set, agreed 2026-11-08: a run must not overlap a production deploy)
#     --shuffle <seed> | --no-shuffle     each group of suites in a random order (rig/order.mjs), or as written
#     --split cut|alternate|random:<seed> how the suites are dealt to the two lanes (cut: the timed split)
# With neither, the routine decides (2026-11-09): every fourth run, and any run a week or more after the last shuffled
# one, is shuffled with a random split; the rest run as written. A suite that passes only in one order is not a passing
# suite, and this way a new dependency on another suite's leftovers lives a week at most. The seed is printed, with the
# line that runs the same order again; every run is a line in the host's history ($HIST).
# A deploy comes first (rig/box/host-lock.sh): this waits while one holds the lock, and is paused if one starts.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD=0; SOURCE=""; SHUF=""; SPLIT=""; CHOSEN=0
while [ $# -gt 0 ]; do case "$1" in --build) BUILD=1;; --source) SOURCE="$2"; shift;; --shuffle) SHUF="$2"; CHOSEN=1; shift;; --no-shuffle) CHOSEN=1;; --split) SPLIT="$2"; CHOSEN=1; shift;; *) echo "unknown option $1"; exit 2;; esac; shift; done
. "$HERE/host-lock.sh"; run_gate "two-lane run" || exit 4
HIST=/var/lib/libvirt/images/rigbox/run-history.log   # <epoch> <UTC time> shuffle=<seed|-> split=<split> <verdict>
if [ "$CHOSEN" = 0 ]; then
  last=$(grep -v ' shuffle=- ' "$HIST" 2>/dev/null | tail -1 | cut -d' ' -f1); since=$(awk -v l="${last:-0}" '$1 > l' "$HIST" 2>/dev/null | wc -l)
  if [ -z "$last" ] || [ "$since" -ge 3 ] || [ $(( $(date +%s) - last )) -ge 604800 ]; then SHUF=$(date -u +%Y%m%d%H%M); SPLIT="random:$SHUF"; fi
fi
ORDER_ENV=""; [ -n "$SHUF" ] && ORDER_ENV="RIG_SHUFFLE=$SHUF"; [ -n "$SPLIT" ] && [ "$SPLIT" != cut ] && ORDER_ENV="$ORDER_ENV RIG_SPLIT=$SPLIT"
# the boxes must be on the same commit, or the two halves are of different runs
same=$( { env RIGBOX=rigbox RIGBOX_SSH_PORT=2222 bash "$HERE/ssh.sh" "cd ~/clearway-2 && git rev-parse HEAD" < /dev/null; env RIGBOX=rigbox2 RIGBOX_SSH_PORT=2223 bash "$HERE/ssh.sh" "cd ~/clearway-2 && git rev-parse HEAD" < /dev/null; } 2>/dev/null | sort -u | wc -l)
say() { echo "[two-lanes $(date -u +%H:%M:%SZ)] $*"; }
A=(env RIGBOX=rigbox RIGBOX_SSH_PORT=2222 bash "$HERE/ssh.sh"); Bx=(env RIGBOX=rigbox2 RIGBOX_SSH_PORT=2223 bash "$HERE/ssh.sh")

if [ "$BUILD" = 1 ]; then
  say "building both boxes from nothing, at once"
  RIGBOX=rigbox  RIGBOX_MEM_MB=3584 RIGBOX_VCPUS=6 RIGBOX_SSH_PORT=2222 bash "$HERE/build.sh" --replace ${SOURCE:+--source "$SOURCE"} > /tmp/two-lanes-build-a.out 2>&1 & pa=$!
  RIGBOX=rigbox2 RIGBOX_MEM_MB=3584 RIGBOX_VCPUS=6 RIGBOX_SSH_PORT=2223 bash "$HERE/build.sh" --replace ${SOURCE:+--source "$SOURCE"} > /tmp/two-lanes-build-b.out 2>&1 & pb=$!
  wait $pa; ra=$?; wait $pb; rb=$?
  [ $ra = 0 ] && [ $rb = 0 ] || { say "BUILD FAILED (a $ra, b $rb): /tmp/two-lanes-build-{a,b}.out"; exit 1; }
  say "both boxes built: $(grep -h 'rig at' /tmp/two-lanes-build-a.out /tmp/two-lanes-build-b.out | sed 's/.*rig at //' | cut -c1-9 | sort -u | tr '\n' ' ')"
fi

lane() { # $1 a|b — runs the lane in its box, sampling used memory and swap (MB) every 10 s
  # (cd on its own line: "cd … && ( loop ) &" backgrounds the cd too, and the runner then started outside the checkout)
  "${@:2}" "cd ~/clearway-2 || exit 1; rm -f ~/mem.log ~/run-rc ~/run-end
    while sleep 10; do free -m | awk '/^Mem:/{m=\$3} /^Swap:/{s=\$3} END{print m, s}' >> ~/mem.log; done < /dev/null > /dev/null 2>&1 & S=\$!
    date +%s > ~/run-start; RIG_LANE=$1 $ORDER_ENV bash rig/run-all-suites.sh > ~/run.out 2>&1 < /dev/null; echo \$? > ~/run-rc; date +%s > ~/run-end; kill \$S" < /dev/null
}
if [ "$BUILD" = 0 ] && [ "$same" != 1 ]; then say "REFUSED: the two boxes are not on the same commit (build them with --build)"; exit 3; fi
say "lane a in rigbox and lane b in rigbox2, at once · ${SHUF:+shuffled, seed $SHUF · }lanes: ${SPLIT:-cut}${SHUF:+ (the same order again: --shuffle $SHUF --split ${SPLIT:-cut})}"
t0=$(date +%s)
lane a "${A[@]}" & la=$!
lane b "${Bx[@]}" & lb=$!
wait $la; wait $lb
t1=$(date +%s)

for L in a b; do
  C=("${A[@]}"); [ $L = b ] && C=("${Bx[@]}")
  echo "lane $L: $("${C[@]}" "s=\$(cat ~/run-start); e=\$(cat ~/run-end); echo \$(( (e-s)/60 )) min \$(( (e-s)%60 )) s, runner exit \$(cat ~/run-rc), peak used \$(sort -n ~/mem.log | tail -1 | cut -d' ' -f1) MB, peak swap \$(sort -k2 -n ~/mem.log | tail -1 | cut -d' ' -f2) MB · \$(grep VERDICT ~/run.out | cut -c1-120)" < /dev/null)"
done
"${Bx[@]}" "cat ~/clearway-2/rig/.scratch/suites/summary.log" < /dev/null > /tmp/two-lanes-b.log
"${A[@]}" "cat > ~/lane-b.log" < /tmp/two-lanes-b.log
say "both lanes: $(( (t1 - t0) / 60 )) min $(( (t1 - t0) % 60 )) s, wall clock"
"${A[@]}" "cd ~/clearway-2 && cat rig/.scratch/suites/summary.log ~/lane-b.log > ~/merged.log && dup=\$(grep -E ' rc=' ~/merged.log | awk '{print \$1}' | sort | uniq -d | head -3 | tr '\n' ' '); [ -z \"\$dup\" ] || echo \"a suite ran in both lanes: \$dup\"; node rig/verdict.mjs ~/merged.log \$(grep -cE '^run ' rig/run-all-suites.sh) | tail -3" < /dev/null | tee /tmp/two-lanes-verdict.out
v=$(grep -oE 'VERDICT: [A-Z]+' /tmp/two-lanes-verdict.out | tail -1 | cut -d' ' -f2)
echo "$(date +%s) $(date -u +%Y-%m-%dT%H:%MZ) shuffle=${SHUF:--} split=${SPLIT:-cut} ${v:-NONE}" >> "$HIST"
[ -n "$SHUF" ] && echo "this run was shuffled: seed $SHUF, lanes ${SPLIT:-cut}. The same order again: rig/box/two-lanes.sh --shuffle $SHUF --split ${SPLIT:-cut}"
[ "${v:-}" = GREEN ]
