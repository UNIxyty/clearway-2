#!/usr/bin/env bash
# Restart both rig proxies: :3999 (sign-in off: portal 3998, agent 5175, wall 5199) and :3989 (sign-in on: portal 3992,
# agent 5176, wall 5198). Both also serve the built wall pages at /digital-wall/timeline/ (rig/.scratch/display-dist).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SCR="$ROOT/rig/.scratch"
for p in 3999 3989; do pid=$(lsof -tiTCP:$p -sTCP:LISTEN || true); [ -n "$pid" ] && kill $pid; done; sleep 1
( cd "$ROOT/rig" && env -i PATH="$PATH" HOME="$HOME" RIG_SCRATCH="$SCR" nohup node proxy.mjs > "$SCR/proxy.out" 2>&1 & )
( cd "$ROOT" && env -i PATH="$PATH" HOME="$HOME" RIG_SCRATCH="$SCR" RIG_PROXY_PORT=3989 RIG_PORTAL_PORT=3992 RIG_AGENT_PORT=5176 RIG_WALL_PORT=5198 nohup node rig/proxy.mjs > "$SCR/proxy-signin.out" 2>&1 & )
sleep 1; for p in 3999 3989; do lsof -tiTCP:$p -sTCP:LISTEN >/dev/null && echo "up :$p" || echo "DOWN :$p"; done
