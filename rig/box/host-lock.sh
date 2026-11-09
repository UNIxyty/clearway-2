# The lock between production deploys and rig runs on the server (2026-11-09). Sourced, not run.
# The server has 15 GB and the rig boxes hold 7 GB of it; an overnight run and a night deploy happen at the same hours.
# Deploys come first:
#   deploy_lock   (scripts/deploy-chain.sh, scripts/deploy.sh, scripts/check-image-runs.sh) takes the lock, waiting only
#                 for another deploy, never for a run, then pauses every running rig box (virsh suspend: the box's CPU
#                 stops, and its clock with it). A helper started outside the deploy resumes the boxes, and sets
#                 their clocks, the moment the lock is free again, however the deploy ended, even killed.
#   run_gate      (rig/box/two-lanes.sh, rig/box/build.sh) waits while a deploy holds the lock, and refuses a run with
#                 under 15 GB free on the host. A run never blocks a deploy: one that started first is paused.
# Off the server (no flock or no virsh, the Mac) both do nothing.
CW_LOCK=/run/lock/clearway-deploy.lock
CW_PAUSED=/run/lock/clearway-rig-paused        # the boxes this lock paused, and only those are resumed
CW_LOCK_LOG=/var/log/clearway-deploy-lock.log
CW_LOCK_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cw_lock_say() { echo "[lock $(date -u +%H:%M:%SZ)] $*" | tee -a "$CW_LOCK_LOG" >&2; }

deploy_lock() { # $1: what is deploying (for the log)
  command -v flock > /dev/null || return 0
  [ -n "${CW_DEPLOY_LOCK_HELD:-}" ] && return 0     # the chain already holds it; deploy.sh and check-image-runs.sh inside it
  exec 9> "$CW_LOCK"
  flock -n 9 || { cw_lock_say "another deploy holds the lock: waiting for it"; flock 9; }
  export CW_DEPLOY_LOCK_HELD=$$
  cw_lock_say "deploy took the lock: ${1:-deploy} (pid $$)"
  command -v virsh > /dev/null || return 0
  local b
  for b in $(virsh list --name --state-running 2>/dev/null | grep -E '^rigbox[0-9]*$'); do
    if virsh suspend "$b" > /dev/null 2>&1; then echo "$b" >> "$CW_PAUSED"; cw_lock_say "paused $b for the deploy"; else cw_lock_say "could not pause $b (the deploy goes on)"; fi
  done
  [ -s "$CW_PAUSED" ] || return 0
  # The resume waits for the lock itself, so it happens however this deploy ends: the kernel frees a flock when the last
  # process holding it exits, killed or not. 9>&-: the helper must not hold the lock it waits for.
  setsid nohup bash "$CW_LOCK_HERE/host-lock.sh" --resume-when-free 9>&- > /dev/null 2>&1 < /dev/null &
}

run_gate() { # $1: what is starting (for the log). Returns non-zero when the run must not start.
  local free; free=$(df --output=avail -BG / 2>/dev/null | tail -1 | tr -dc 0-9)
  if [ -n "$free" ] && [ "$free" -lt 15 ]; then cw_lock_say "REFUSED ${1:-rig run}: ${free} GB free on the host, under 15 GB"; return 1; fi
  command -v flock > /dev/null || return 0
  local fd; exec {fd}> "$CW_LOCK"
  # shared: two runs or builds starting together never wait for each other, only for a deploy (2026-11-09: exclusive
  # here, two box builds starting at once logged "waits: a deploy holds the lock" with no deploy anywhere)
  if ! flock -s -n "$fd"; then cw_lock_say "${1:-rig run} waits: a deploy holds the lock"; flock -s "$fd"; cw_lock_say "${1:-rig run} starts: the deploy is over"; fi
  exec {fd}>&-
  # a box still paused with no deploy holding the lock (the helper never ran: a reboot mid-deploy) is resumed here
  [ -s "$CW_PAUSED" ] && cw_resume "left paused by a deploy that is over"
  return 0
}

cw_resume() { # resume the boxes the lock paused, and set each one's clock (a paused box's clock stops with it: 39 s
  # behind after a 40 s pause, 2026-11-09; its time sync would step it later, at a moment nobody chose)
  local b; for b in $(sort -u "$CW_PAUSED"); do
    virsh resume "$b" > /dev/null 2>&1 || { cw_lock_say "could not resume $b"; continue; }
    RIGBOX="$b" timeout 30 bash "$CW_LOCK_HERE/ssh.sh" "sudo -n systemctl restart systemd-timesyncd" < /dev/null > /dev/null 2>&1 || true
    cw_lock_say "resumed $b ($1), clock set again"
  done
  rm -f "$CW_PAUSED"
}

# run, not sourced: the helper deploy_lock leaves behind
if [ "${BASH_SOURCE[0]}" = "$0" ] && [ "${1:-}" = --resume-when-free ]; then exec 9> "$CW_LOCK"; flock 9; cw_resume "the deploy is over" 2> /dev/null; fi
