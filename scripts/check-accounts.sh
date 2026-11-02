#!/usr/bin/env bash
# Production check accounts, from the server (scripts/check-accounts.mjs says the rules). Copies the tool into the
# portal container and runs it there with the container's own settings: nothing is read from .env on this host.
#   scripts/check-accounts.sh list
#   scripts/check-accounts.sh run read-only-walk
set -u
cd "$(dirname "$0")/.." || exit 2
C=clearway-2-portal-1
docker exec "$C" sh -c 'rm -rf /tmp/check-accounts && mkdir -p /tmp/check-accounts' || exit 2
docker cp scripts/check-accounts.mjs "$C:/tmp/check-accounts/check-accounts.mjs" >/dev/null && docker cp scripts/prod-checks "$C:/tmp/check-accounts/prod-checks" >/dev/null || exit 2
docker exec "$C" node /tmp/check-accounts/check-accounts.mjs "$@"; rc=$?
docker exec "$C" rm -rf /tmp/check-accounts
exit $rc
