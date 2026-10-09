#!/usr/bin/env sh
# Put every role's permissions back to the defaults, from the server (docs/permissions.md). For the day Admin →
# Permissions cannot be reached. Every change is logged in the permission history as "server-restore".
#
#   cd /root/clearway-2 && sh scripts/permissions-restore.sh            restore
#   cd /root/clearway-2 && sh scripts/permissions-restore.sh --dry-run  only list what differs
set -eu
cd "$(dirname "$0")/.."
command -v node >/dev/null 2>&1 || { echo "node is not installed on this host" >&2; exit 2; }
exec node lib/permissions/restore.mjs "$@"
