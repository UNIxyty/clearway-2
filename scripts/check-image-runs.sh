#!/usr/bin/env bash
# Does the image RUN, not just build? (2026-10-26, after the agent and the wall crash-looped on a deploy: neither
# Dockerfile copied lib/clients/, every suite was green because the rig runs from source, and production found out.)
# Runs ON THE SERVER:   scripts/check-image-runs.sh agent-service digital-wall-backend portal aip-sync
# For each service: build the image as compose would, start a throwaway container from it with the server's .env but
# NO network (so it can register nothing, patch nothing, send nothing), and require that after the start period the
# process is still alive and its health route answers from inside the container. A crash on import, a refused start,
# a missing file: the container is gone or the route is silent → FAIL. Exit 0 all ran, 1 one did not, 2 cannot tell.
# Nothing running is touched: the throwaway has its own name and is removed whatever happens.
set -u
cd "$(dirname "$0")/.." || exit 2
[ "$#" -gt 0 ] || { echo "usage: scripts/check-image-runs.sh <service>..."; exit 2; }
[ -f .env ] || { echo "CANNOT TELL: no .env here"; exit 2; }
command -v docker >/dev/null || { echo "CANNOT TELL: no docker"; exit 2; }
say() { echo "[image-runs $(date -u +%H:%M:%SZ)] $*"; }
# service → image name as compose tags it, the port the process listens on, the health path
spec() {
  case "$1" in
    agent-service)         echo "clearway-2-agent-service 5175 /api/health";;
    digital-wall-backend)  echo "clearway-2-digital-wall-backend 5174 /api/health";;
    portal)                echo "clearway-selfhosted:latest 3000 /api/health";;
    aip-sync)              echo "clearway-selfhosted-worker $(grep -E '^AIP_SYNC_PORT=' .env | cut -d= -f2 | tr -d '"'"'"'' || true) /health";;
    *) return 1;;
  esac
}
START_SECONDS="${IMAGE_RUN_START_SECONDS:-25}"
# --selftest: prove the check fails when a process dies on start — the agent image with a command that exits at once.
if [ "${1:-}" = "--selftest" ]; then
  name="imgcheck-selftest-$$"; docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --network none --env-file .env clearway-2-agent-service node -e "console.error('selftest: dying on purpose'); process.exit(7)" >/dev/null 2>&1 || { say "CANNOT TELL: the selftest container did not start"; exit 2; }
  sleep 5; state=$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null || echo missing); docker rm -f "$name" >/dev/null 2>&1
  if [ "$state" = running ]; then say "SELFTEST FAILED: a process that exits at once was seen as running"; exit 1; fi
  say "selftest ok: a dying process is caught (state $state)"; exit 0
fi
failed=0
for s in "$@"; do
  line=$(spec "$s") || { say "CANNOT TELL: $s is not a service this check knows"; exit 2; }
  read -r image port path <<<"$line"
  [ -n "$port" ] || { say "CANNOT TELL: no port known for $s"; exit 2; }
  say "building $s"
  docker compose build "$s" > "/tmp/image-runs-$s.build" 2>&1 || { say "FAIL $s: the image did not build (/tmp/image-runs-$s.build)"; failed=1; continue; }
  name="imgcheck-$s-$$"
  docker rm -f "$name" >/dev/null 2>&1 || true
  # The service's own command and env, no network, no volumes: the question is only whether it starts.
  extra=()
  case "$s" in
    aip-sync) extra=(-e STORAGE_ROOT=/tmp/imgcheck-storage -e CACHE_ROOT=/tmp/imgcheck-cache -e AIP_REFRESH_SCHEDULE=off --entrypoint node);;
    digital-wall-backend) extra=(-e PORT=5174);;
    agent-service) extra=(-e PORT=5175);;
    portal) extra=(-e PORT=3000 -e HOSTNAME=127.0.0.1);;   # the standalone server resolves HOSTNAME; the container's own name has no answer without a network
  esac
  # the command compose gives the service (docker-compose.yml), not the image's CMD (the wall's is the dev server)
  cmd=()
  case "$s" in
    aip-sync) cmd=(scripts/aip-sync-server.mjs);;
    digital-wall-backend) cmd=(node server.mjs);;
    portal) cmd=(node server.js);;
    agent-service) cmd=(node server.mjs);;
  esac
  if ! docker run -d --name "$name" --network none --env-file .env "${extra[@]}" "$image" "${cmd[@]}" > /dev/null 2>"/tmp/image-runs-$s.run"; then
    say "FAIL $s: the container did not start ($(head -c 200 "/tmp/image-runs-$s.run"))"; failed=1; continue
  fi
  sleep "$START_SECONDS"
  state=$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null || echo missing)
  if [ "$state" != running ]; then
    say "FAIL $s: not running after ${START_SECONDS}s (state $state). Last lines:"; docker logs --tail 12 "$name" 2>&1 | grep -viE 'token|secret|password' | sed 's/^/    /'
    docker rm -f "$name" >/dev/null 2>&1; failed=1; continue
  fi
  # The health route, asked from inside the container (no network outside it). node is in every image.
  probe=$(docker exec "$name" node -e "fetch('http://127.0.0.1:$port$path',{signal:AbortSignal.timeout(8000)}).then(r=>r.text().then(t=>console.log(r.status+' '+t.slice(0,80)))).catch(e=>{console.log('NO '+e.message);process.exit(1)})" 2>&1 | tail -1)
  case "$probe" in
    200*) say "OK   $s: running, $path answered 200";;
    *) say "FAIL $s: $path did not answer 200 ($probe). Last lines:"; docker logs --tail 12 "$name" 2>&1 | grep -viE 'token|secret|password' | sed 's/^/    /'; failed=1;;
  esac
  docker rm -f "$name" >/dev/null 2>&1 || true
done
if [ "$failed" = 1 ]; then say "FAIL: at least one image does not run. Nothing was deployed."; exit 1; fi
say "all images run: $*"; exit 0
