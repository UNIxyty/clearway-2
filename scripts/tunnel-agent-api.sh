#!/usr/bin/env bash
# Narrow the tunnel's /agent rule to the agent's API (portal foundations 3.2). Today every /agent/* request goes to
# agent-service, which forwards everything that is not /agent/api/* back to the portal (agent/server.mjs passToPortal):
# an extra hop on every agent page. After this, /agent/api/* still goes to agent-service and the agent's pages go
# straight to the portal. The config is backed up and validated first; the matched rules are shown before and after.
#
#   cd /root/clearway-2 && bash scripts/tunnel-agent-api.sh --dry-run     show the change, touch nothing
#   cd /root/clearway-2 && bash scripts/tunnel-agent-api.sh               apply it and restart cloudflared
set -euo pipefail
CONFIG=/etc/cloudflared/config.yml
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
OLD='^/agent/.*'
NEW='^/agent/api(/.*)?$'

grep -qF "path: $OLD" "$CONFIG" || { grep -qF "path: $NEW" "$CONFIG" && { echo "Already narrowed: $CONFIG routes only $NEW to agent-service."; exit 0; }; echo "No 'path: $OLD' rule in $CONFIG; nothing changed." >&2; exit 1; }

show() {
  for u in /agent /agent/intake /agent/api/health; do
    printf '  %-20s → ' "$u"
    { cloudflared tunnel --config "$1" ingress rule "https://clearway.verxyl.com$u" 2>/dev/null | grep -E "service:" | sed 's/^[[:space:]]*//' | head -1; } || echo "(could not ask cloudflared)"
  done
}
echo "Now:"; show "$CONFIG"

sed "s#path: \^/agent/\.\*#path: ^/agent/api(/.*)?\$#" "$CONFIG" > "$CONFIG.new"
# --config goes before "ingress": after it, cloudflared prints usage and still exits 0. So require its "OK".
cloudflared tunnel --config "$CONFIG.new" ingress validate 2>&1 | grep -qx "OK" || { echo "The new config does not validate; nothing changed ($CONFIG.new kept to look at)." >&2; exit 1; }
echo "After:"; show "$CONFIG.new"
diff "$CONFIG" "$CONFIG.new" || true

if [ "$DRY" = 1 ]; then rm -f "$CONFIG.new"; echo "Dry run: nothing changed."; exit 0; fi
cp "$CONFIG" "$CONFIG.bak-$(date +%Y%m%d-%H%M%S)"
mv "$CONFIG.new" "$CONFIG"
systemctl restart cloudflared; sleep 5
printf '  /agent/api/health → '; curl -s https://clearway.verxyl.com/agent/api/health | head -c 80; echo
printf '  /agent            → %s\n' "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://clearway.verxyl.com/agent)"
echo "Done. To undo: copy the .bak file back over $CONFIG and restart cloudflared."
