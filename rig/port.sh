#!/bin/sh
# What listens on a TCP port: the pids we can see, one per line; exit 1 when nothing listens (2026-11-07).
# lsof is the Mac's tool. On Linux it missed Next's server and every root-owned listener (Docker's), so on the rig box a
# taken port looked free, and "stop the old agent, start a new one" stopped nothing. There, ss: a listener whose owner
# we cannot see still counts as taken (exit 0, no pid).
#   sh rig/port.sh <port>
p="$1"
if [ "$(uname)" = Linux ]; then
  out=$(ss -ltnpH "sport = :$p" 2>/dev/null)
  [ -n "$out" ] || exit 1
  printf '%s\n' "$out" | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u
  exit 0
fi
lsof -nP -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null
