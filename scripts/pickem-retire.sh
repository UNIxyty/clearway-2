#!/usr/bin/env bash
# Retire Pick'em on the server (portal foundations 4.1; docs/pickem-archive.md). Run AFTER deploying the commit that
# removed Pick'em from the portal. Archives what is needed to bring it back, then takes it off the internet:
#   1. saves the container image and exports every Pick'em table (read-only, as JSON) to /root/archive/pickem-<date>/
#   2. stops and removes the pickem container (the image is kept, re-tagged clearway-pickem:archived-<date>)
#   3. removes the tunnel's two /pickem routes (config backed up and validated first), restarts cloudflared
#   4. checks that nothing Pick'em answers any more
# The Supabase tables are NOT dropped: the data stays where it is, and the export is a second copy.
#
#   cd /root/clearway-2 && bash scripts/pickem-retire.sh            (add --dry-run to only show what it would do)
set -euo pipefail
cd "$(dirname "$0")/.."
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
run() { if [ "$DRY" = 1 ]; then echo "  would run: $*"; else "$@"; fi; }
STAMP=$(date +%F)
ARCH="/root/archive/pickem-$STAMP"
CONFIG=/etc/cloudflared/config.yml
CONTAINER=clearway-2-pickem-1
LAST_CODE=7ade3f5   # the last commit with the Pick'em code in the repo

[ -f .env ] || { echo "No .env here ($(pwd))." >&2; exit 2; }
# Read one value from .env WITHOUT running it as shell code: values may hold spaces or <…> (fine for Docker and
# Node, a syntax error for the shell). The last assignment wins, as in Docker's env_file.
envget() {
  python3 - "$1" <<'PY'
import re, sys
key, val = sys.argv[1], ""
for line in open(".env", encoding="utf-8"):
    m = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
    if m and m.group(1) == key:
        val = m.group(2)
if len(val) >= 2 and val[0] == val[-1] and val[0] in "'\"":
    val = val[1:-1]
print(val)
PY
}
NEXT_PUBLIC_SUPABASE_URL=$(envget NEXT_PUBLIC_SUPABASE_URL)
SUPABASE_SERVICE_ROLE_KEY=$(envget SUPABASE_SERVICE_ROLE_KEY)
: "${NEXT_PUBLIC_SUPABASE_URL:?missing in .env}" "${SUPABASE_SERVICE_ROLE_KEY:?missing in .env}"
echo "Archive: $ARCH"; run mkdir -p "$ARCH/tables"

echo "1. Image and data"
if docker image inspect clearway-pickem:latest >/dev/null 2>&1; then
  run sh -c "docker save clearway-pickem:latest | gzip > '$ARCH/clearway-pickem-image.tar.gz'"
else echo "  no clearway-pickem:latest image (already archived?)"; fi
TABLES="pickem_competitions pickem_teams pickem_groups pickem_matches pickem_group_results pickem_user_group_predictions
pickem_user_match_predictions pickem_prediction_submissions pickem_champion_predictions pickem_points_ledger
pickem_user_lock_overrides pickem_user_playoff_access pickem_dev_match_overrides playoff_matches playoff_predictions tournament_state"
for t in $TABLES; do
  if [ "$DRY" = 1 ]; then echo "  would export $t"; continue; fi
  out="$ARCH/tables/$t.json"; echo "[" > "$out"; offset=0; total=0
  while :; do
    page=$(curl -sf "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/$t?select=*&limit=1000&offset=$offset" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY") || { echo "  $t: not readable (skipped)"; break; }
    n=$(printf '%s' "$page" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))')
    [ "$n" = 0 ] && break
    printf '%s' "$page" | python3 -c 'import json,sys;rows=json.load(sys.stdin);print(",\n".join(json.dumps(r) for r in rows))' >> "$out"
    total=$((total+n)); offset=$((offset+1000)); [ "$n" -lt 1000 ] && break; echo "," >> "$out"
  done
  echo "]" >> "$out"; echo "  $t: $total row(s)"
done
[ "$DRY" = 1 ] || cat > "$ARCH/README.md" <<EOF
# Pick'em, archived $STAMP

- Code: the last commit with Pick'em in the repo is \`$LAST_CODE\` (github.com/UNIxyty/clearway-2).
  To bring it back, restore its paths from that commit (docs/pickem-archive.md lists them) and the \`pickem\`
  service in docker-compose.yml.
- Image: \`clearway-pickem-image.tar.gz\` here (\`docker load < clearway-pickem-image.tar.gz\`), and still on this host
  as \`clearway-pickem:archived-$STAMP\`.
- Data: the Supabase tables were NOT dropped. \`tables/*.json\` is a copy taken on $STAMP.
- Tunnel: \`cloudflared-config.yml.bak\` is the config before the /pickem routes were removed.
EOF

echo "2. Container"
if docker inspect "$CONTAINER" >/dev/null 2>&1; then run docker stop "$CONTAINER"; run docker rm "$CONTAINER"; else echo "  no $CONTAINER container"; fi
if docker image inspect clearway-pickem:latest >/dev/null 2>&1; then
  run docker tag clearway-pickem:latest "clearway-pickem:archived-$STAMP"; run docker rmi clearway-pickem:latest
fi

echo "3. Tunnel"
run cp "$CONFIG" "$ARCH/cloudflared-config.yml.bak"
NEW=$(python3 - "$CONFIG" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
# Drop each ingress entry whose path is /pickem or /pickem/.* (an entry: "  - hostname: …" up to the next "  - " or the end).
entries = re.split(r"(?m)^(?=  - )", text)
kept = [e for e in entries if not re.search(r"(?m)^\s+path:\s*\^?/pickem(/\.\*)?\$?\s*$", e)]
removed = len(entries) - len(kept)
sys.stderr.write(f"  removing {removed} /pickem route(s)\n")
print("".join(kept), end="")
PY
)
if [ "$DRY" = 1 ]; then echo "  would write the config without the /pickem routes"; else
  printf '%s' "$NEW" > "$CONFIG.new"
  # --config goes before "ingress": after it, cloudflared prints usage and still exits 0. So require its "OK".
  cloudflared tunnel --config "$CONFIG.new" ingress validate 2>&1 | grep -qx "OK" || { echo "  the new config does not validate; nothing changed ($CONFIG.new kept to look at)" >&2; exit 1; }
  mv "$CONFIG.new" "$CONFIG"; systemctl restart cloudflared; sleep 5
fi

echo "4. Check"
if [ "$DRY" = 0 ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' https://clearway.verxyl.com/pickem)
  portcheck=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/ || true)
  echo "  https://clearway.verxyl.com/pickem → $code (410 = the portal says it is retired)"
  echo "  127.0.0.1:3010 → ${portcheck:-000} (000 = nothing listening)"
  grep -q "/pickem" "$CONFIG" && echo "  WARNING: $CONFIG still mentions /pickem" || echo "  tunnel config: no /pickem route"
fi
echo "Done. Archive in $ARCH"
