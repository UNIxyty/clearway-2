#!/usr/bin/env bash
# Production check accounts, from the server (scripts/check-accounts.mjs says the rules). Copies the tool into the
# portal container and runs it there with the container's own settings: nothing is read from .env on this host.
#   scripts/check-accounts.sh list
#   scripts/check-accounts.sh run read-only-walk
#   scripts/check-accounts.sh run agent-tool-turn      (in the agent container)
#   AGENT_CODE=checkout scripts/check-accounts.sh run agent-tiers   (this checkout's agent code, before a deploy)
set -u
cd "$(dirname "$0")/.." || exit 2
C=clearway-2-portal-1
# a check named agent-* runs in the agent container, where the agent's own code is (its session stays in that container)
[ "${1:-}" = run ] && case "${2:-}" in agent-*) C=agent-service;; esac
docker exec "$C" sh -c 'rm -rf /tmp/check-accounts && mkdir -p /tmp/check-accounts' || exit 2
docker cp scripts/check-accounts.mjs "$C:/tmp/check-accounts/check-accounts.mjs" >/dev/null && docker cp scripts/prod-checks "$C:/tmp/check-accounts/prod-checks" >/dev/null || exit 2
# AGENT_CODE=checkout: the agent check runs this checkout's agent code (lib + config, on the container's own node_modules
# and settings) instead of the deployed code: a model or runtime change is proven on production's key before it is
# deployed. The running service is not touched.
ENVS=(-e AGENT_ROOT=/app)
# ONLY=k1,k2: a check that runs a list of prompts runs only those (scripts/prod-checks/agent-web-prompts.mjs)
[ -n "${ONLY:-}" ] && ENVS+=(-e "ONLY=$ONLY")
if [ "$C" = agent-service ] && [ "${AGENT_CODE:-}" = checkout ]; then
  # laid out as the agent image lays it out (agent/Dockerfile): the agent folder, with lib/ and digital-wall/lib beside it
  docker exec "$C" mkdir -p /tmp/check-accounts/agent /tmp/check-accounts/lib /tmp/check-accounts/digital-wall/lib \
    && docker cp agent/lib "$C:/tmp/check-accounts/agent/lib" >/dev/null && docker cp agent/config "$C:/tmp/check-accounts/agent/config" >/dev/null \
    && docker cp lib/permissions "$C:/tmp/check-accounts/lib/permissions" >/dev/null && docker cp lib/clients "$C:/tmp/check-accounts/lib/clients" >/dev/null \
    && docker cp lib/rig-guard.mjs "$C:/tmp/check-accounts/lib/rig-guard.mjs" >/dev/null \
    && docker cp digital-wall/lib/mailer.mjs "$C:/tmp/check-accounts/digital-wall/lib/mailer.mjs" >/dev/null \
    && docker cp digital-wall/lib/flight-record.mjs "$C:/tmp/check-accounts/digital-wall/lib/flight-record.mjs" >/dev/null \
    && docker exec "$C" ln -s /app/node_modules /tmp/check-accounts/agent/node_modules || exit 2
  ENVS=(-e AGENT_ROOT=/tmp/check-accounts/agent); [ -n "${ONLY:-}" ] && ENVS+=(-e "ONLY=$ONLY")
  echo "agent code: this checkout ($(git rev-parse --short HEAD)), not the deployed image"
fi
docker exec "${ENVS[@]}" "$C" node /tmp/check-accounts/check-accounts.mjs "$@"; rc=$?
docker exec "$C" rm -rf /tmp/check-accounts
exit $rc
