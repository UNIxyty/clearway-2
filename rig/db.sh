#!/usr/bin/env bash
# The rig's own database: a local Supabase stack (Postgres + PostgREST + GoTrue) under rig/supabase.
#   rig/db.sh start   — start the stack (first run pulls images) and apply migrations
#   rig/db.sh reset   — drop everything and re-apply the migrations + the rig user (fresh rig)
#   rig/db.sh stop    — stop the stack
#   rig/db.sh status  — URLs and keys
set -euo pipefail
cd "$(dirname "$0")"
EXCLUDE="studio,realtime,storage-api,imgproxy,inbucket,mailpit,logflare,vector,edge-runtime,supavisor,pg_prove"
case "${1:-status}" in
  start) npx --yes supabase@latest start --workdir . -x "$EXCLUDE"; node ./make-env.mjs; node ./rig-user.mjs ;;
  reset) npx --yes supabase@latest db reset --workdir . --no-seed 2>/dev/null || npx --yes supabase@latest db reset --workdir .; node ./make-env.mjs; node ./rig-user.mjs ;;
  stop) npx --yes supabase@latest stop --workdir . ;;
  status) npx --yes supabase@latest status --workdir . ;;
  *) echo "usage: rig/db.sh start|reset|stop|status"; exit 2 ;;
esac
