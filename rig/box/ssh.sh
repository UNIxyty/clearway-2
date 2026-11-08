#!/usr/bin/env bash
# Into a rig box, on the server as root:  [RIGBOX=rigbox2] rig/box/ssh.sh [command]   (rig/box/build.sh made the key)
BOX="${RIGBOX:-rigbox}"; PORT="${RIGBOX_SSH_PORT:-$([ "$BOX" = rigbox ] && echo 2222 || echo $((2222 + ${BOX#rigbox} - 1)))}"
exec ssh -q -o BatchMode=yes -o UserKnownHostsFile=/root/.ssh/${BOX}_known -i /root/.ssh/rigbox -p "$PORT" rig@127.0.0.1 "$@"
