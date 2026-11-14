#!/usr/bin/env bash
# After every deploy (called by scripts/deploy-chain.sh once the deploy is done): stop the disk filling up again.
# What grows on this server with each deploy (2026-11-13 disk report): the build cache (about 10 GB per chain), one more
# revert image per deployed service, dangling image layers. This removes exactly those three, nothing else:
#   1. build cache down to 4 GB (unused records first; the next build of an unchanged layer stays warm); all of it
#      when the disk is still under the 15 GB floor at the end
#   2. revert images older than the newest one, per image and per revert lane (":pre-<sha>" and ":pre-<sha>-notam-sync"
#      are two lanes of the shared worker image). "Newest" = the newest commit among the tags' shas. A tag whose sha this
#      checkout does not know is KEPT (cannot be ordered: fail closed), and so is a tie.
#   3. dangling images (no tag, no container)
# It never touches data, volumes, the rig boxes or a tagged image that is not a ":pre-" revert tag. It cannot fail a
# deploy: it runs after "CHAIN DONE" and always exits 0. `--dry-run` prints what it would remove and removes nothing.
set -u
cd "$(dirname "$0")/.." || exit 0
dry=0; [ "${1:-}" = "--dry-run" ] && dry=1
free_gb() { df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9'; }
before=$(free_gb)
say() { echo "cleanup: $*"; }

# 1. build cache
if [ $dry -eq 1 ]; then say "would prune the build cache down to 4 GB ($(docker system df --format '{{.Type}} {{.Size}}' 2>/dev/null | awk '/Build Cache/ {print $3}') now)"
else docker builder prune -af --keep-storage 4GB > /tmp/cleanup-builder.out 2>&1; say "build cache: $(tail -1 /tmp/cleanup-builder.out | cut -c1-80)"; fi

# 2. revert images: keep the newest per image and lane
tags=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E ':pre-[0-9a-f]{8}(-notam-sync)?$' | sort -u)
lanes=$(printf '%s\n' "$tags" | sed -E 's/:pre-[0-9a-f]{8}(-notam-sync)?$/ \1/' | sort -u)
removed=0; kept=0
while read -r repo lane; do
  [ -n "$repo" ] || continue
  best=""; best_t=-1; unknown=""; all=""
  for t in $(printf '%s\n' "$tags" | grep -E "^${repo//./\\.}:pre-[0-9a-f]{8}${lane}\$"); do
    sha=$(printf '%s' "$t" | sed -E 's/.*:pre-([0-9a-f]{8}).*/\1/')
    ct=$(git log -1 --format=%ct "$sha" 2>/dev/null)
    if [ -z "$ct" ]; then unknown="$unknown $t"; continue; fi
    all="$all $t=$ct"
    if [ "$ct" -gt "$best_t" ]; then best_t=$ct; best=$t; fi
  done
  for u in $unknown; do say "kept $u (its commit is not in this checkout: cannot tell its age)"; kept=$((kept+1)); done
  for pair in $all; do
    t=${pair%=*}; ct=${pair#*=}
    if [ "$t" = "$best" ] || [ "$ct" -eq "$best_t" ]; then kept=$((kept+1)); continue; fi
    if [ $dry -eq 1 ]; then say "would remove the older revert image $t"; removed=$((removed+1))
    elif docker rmi "$t" > /dev/null 2>&1; then say "removed the older revert image $t"; removed=$((removed+1))
    else say "could not remove $t (in use?): left in place"; kept=$((kept+1)); fi
  done
done <<EOF2
$lanes
EOF2
say "revert images: $kept kept, $removed $([ $dry -eq 1 ] && echo 'would be removed' || echo removed)"

# 3. dangling images
if [ $dry -eq 1 ]; then say "would remove $(docker images -f dangling=true -q 2>/dev/null | wc -l | tr -d ' ') dangling images"
else docker image prune -f > /tmp/cleanup-images.out 2>&1; say "dangling images: $(tail -1 /tmp/cleanup-images.out | cut -c1-80)"; fi

# the chain's own old outputs in /tmp (two weeks and older)
[ $dry -eq 1 ] || find /tmp -maxdepth 1 -type f \( -name 'deploy-*.out' -o -name 'image-runs-*.build' \) -mtime +14 -delete 2>/dev/null

after=$(free_gb)
# Still under the floor a rig run needs: the 4 GB of warm build cache goes too (the next build is slower, nothing is lost).
if [ -n "${after:-}" ] && [ "$after" -lt 15 ]; then
  if [ $dry -eq 1 ]; then say "would prune the whole build cache (free space is under the 15 GB floor)"
  else docker builder prune -af > /tmp/cleanup-builder.out 2>&1; say "under the 15 GB floor: the whole build cache went: $(tail -1 /tmp/cleanup-builder.out | cut -c1-80)"; after=$(free_gb); fi
fi
say "free space on /: ${before:-?} GB before, ${after:-?} GB after"
[ -n "${after:-}" ] && [ "$after" -lt 15 ] && say "WARNING: under the 15 GB floor a rig run needs (rig/box/host-lock.sh)"
exit 0
