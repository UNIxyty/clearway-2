#!/usr/bin/env bash
# Into the rig box, on the server as root:  rig/box/ssh.sh [command]   (rig/box/build.sh made the key)
exec ssh -q -o BatchMode=yes -o UserKnownHostsFile=/root/.ssh/rigbox_known -i /root/.ssh/rigbox -p 2222 rig@127.0.0.1 "$@"
