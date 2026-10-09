#!/usr/bin/env sh
# Turn the portal's maintenance mode OFF from the server, when nobody can reach /admin/maintenance (docs/maintenance.md).
# Records an "off" row in public.maintenance with the service-role key from the repo's .env; the middleware reads the
# newest row, so the portal opens on the next page load. Needs only curl.
#
#   cd /root/clearway-2 && sh scripts/maintenance-off.sh
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "No .env here ($(pwd)). Run it from the repo on the server." >&2; exit 2; }
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
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL is not set in .env}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is not set in .env}"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/maintenance" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "content-type: application/json" -H "prefer: return=minimal" \
  -d "{\"enabled\":false,\"message\":\"Turned off from the server (scripts/maintenance-off.sh)\"}")   # updated_at: the database's own now(), so this row is the newest
[ "$code" = "201" ] || { echo "Supabase answered $code; maintenance NOT turned off. Fallback: MAINTENANCE_FORCE_OFF=true (docs/maintenance.md)." >&2; exit 1; }
echo "Maintenance is off."
