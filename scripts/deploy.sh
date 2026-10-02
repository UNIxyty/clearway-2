#!/usr/bin/env bash
# The one way to deploy on the server. Refuses unless the checkout is on main and is exactly origin/main, builds
# the named services, restarts them, waits for health, and records what was deployed.
#
#   scripts/deploy.sh agent-service portal            pull main, build, restart
#   scripts/deploy.sh --no-cache agent-service        the same, rebuilding every layer (refreshes time-zone data)
#   scripts/deploy.sh --no-pull --no-cache agent-service
#                                                     rebuild what is ALREADY deployed, nothing new (the monthly job);
#                                                     refuses if the checkout has moved since the last deploy
#   scripts/deploy.sh --status                        branch, commits, what each service was last deployed from
#
# A failed build restarts nothing: the running containers stay as they are.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
STATE="$ROOT/.deploy-state"; mkdir -p "$STATE"
NOCACHE=""; PULL=1; STATUS=0; SERVICES=()
for a in "$@"; do case "$a" in --no-cache) NOCACHE="--no-cache";; --no-pull) PULL=0;; --status) STATUS=1;; -*) echo "unknown option $a"; exit 2;; *) SERVICES+=("$a");; esac; done
say() { echo "[deploy $(date -u +%Y-%m-%dT%H:%MZ)] $*"; }
compose() { docker compose "$@" 2> >(grep -v 'variable is not set' >&2); }

if [ "$STATUS" = 1 ]; then
  git fetch -q origin main 2>/dev/null || echo "(could not reach origin)"
  echo "branch:        $(git rev-parse --abbrev-ref HEAD)"
  echo "checkout:      $(git log --oneline -1 | cut -c1-80)"
  echo "origin/main:   $(git log --oneline -1 origin/main | cut -c1-80)"
  echo "tracked files changed here: $(git status --short | grep -vc '^??' || true)"
  for f in "$STATE"/*; do [ -f "$f" ] || continue; s=$(basename "$f"); id=$(docker compose ps -q "$s" 2>/dev/null | head -1)
    echo "$s: deployed from $(cut -c1-12 "$f") on $(cut -d' ' -f2 "$f"); container started $( [ -n "$id" ] && docker inspect "$id" --format '{{.State.StartedAt}}' | cut -c1-16 || echo '(not running)')"; done
  exit 0
fi
[ "${#SERVICES[@]}" -gt 0 ] || { echo "usage: scripts/deploy.sh [--no-cache] [--no-pull] <service>...   |   scripts/deploy.sh --status"; exit 2; }

# 1. On main, or nothing happens.
sh scripts/branch-guard.sh .git/HEAD || exit 1

# 2. Exactly origin/main (normal deploy), or exactly what was deployed last time (--no-pull).
git fetch -q origin main
if [ "$PULL" = 1 ]; then
  git pull -q --ff-only origin main || { say "REFUSED: main here cannot fast-forward to origin/main (local commits or a conflict). Nothing was built."; exit 1; }
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { say "REFUSED: the checkout is not origin/main after the pull. Nothing was built."; exit 1; }
else
  for s in "${SERVICES[@]}"; do
    [ -f "$STATE/$s" ] || { say "REFUSED (--no-pull): no record of a deploy of $s by this script. Run a normal deploy first."; exit 1; }
    [ "$(cut -d' ' -f1 "$STATE/$s")" = "$(git rev-parse HEAD)" ] || { say "REFUSED (--no-pull): the checkout ($(git rev-parse --short HEAD)) is not what $s was deployed from ($(cut -c1-7 "$STATE/$s")). A rebuild would deploy new code unattended. Run a normal deploy."; exit 1; }
  done
  behind=$(git rev-list --count HEAD..origin/main); [ "$behind" = 0 ] || say "note: origin/main has $behind newer commit(s) that are NOT deployed."
fi
HEAD_SHA="$(git rev-parse HEAD)"
changed="$(git status --short | grep -v '^??' | grep -v ' digital-wall/data/' || true)"
[ -z "$changed" ] || { say "note: tracked files differ from the commit:"; echo "$changed" | sed 's/^/    /'; }

# 3. Build. A failure stops here and restarts nothing.
say "building ${SERVICES[*]} from $(git log --oneline -1 | cut -c1-70) ${NOCACHE:+(no cache)}"
compose build $NOCACHE "${SERVICES[@]}" || { say "BUILD FAILED. Nothing was restarted; the running containers are unchanged."; exit 1; }

# 4. Restart, wait for health, record.
compose up -d "${SERVICES[@]}"
for s in "${SERVICES[@]}"; do
  id="$(docker compose ps -q "$s" 2>/dev/null | head -1)"; state="running"
  if [ -n "$id" ] && [ "$(docker inspect "$id" --format '{{if .State.Health}}yes{{end}}')" = "yes" ]; then
    for _ in $(seq 1 40); do state="$(docker inspect "$id" --format '{{.State.Health.Status}}')"; [ "$state" = healthy ] && break; sleep 3; done
  else sleep 5; state="$(docker inspect "$id" --format '{{.State.Status}}' 2>/dev/null || echo missing)"; fi
  if [ "$state" = healthy ] || [ "$state" = running ]; then echo "$HEAD_SHA $(date -u +%Y-%m-%dT%H:%MZ)" > "$STATE/$s"; say "$s: $state"; else say "$s: NOT HEALTHY ($state). Look at: docker logs $s"; FAILED=1; fi
done
if printf '%s\n' "${SERVICES[@]}" | grep -qx agent-service; then say "agent-service time-zone data: $(docker exec agent-service node -p process.versions.tz 2>/dev/null || echo unknown)"; fi
[ -z "${FAILED:-}" ] || exit 1
say "done: ${SERVICES[*]} at $(git rev-parse --short HEAD)"
