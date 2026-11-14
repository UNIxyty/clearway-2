#!/usr/bin/env bash
# The wall gateway (nginx, compose service digital-wall-gateway) reads deploy/digital-wall/nginx-gateway.conf through a
# single-file bind mount: after a pull that changed the file, the running container still holds the old one until it
# restarts. This step, run by scripts/deploy-chain.sh after a deploy (2026-11-13):
#   1. nothing to do when the container already reads the file in this checkout;
#   2. otherwise the new file is proved in a throwaway nginx (`nginx -t`); a file that fails is NOT loaded, the
#      gateway keeps running on the old one, and this says so (gates fail closed);
#   3. only then the gateway restarts (about a second; the wall's stream reconnects by itself) and must answer;
#   4. if it does not answer, the file it ran before is put back and it restarts again. That leaves the checkout's
#      copy changed: say so, a person looks.
#   bash scripts/gateway-refresh.sh [--dry-run]
set -u
cd "$(dirname "$0")/.." || exit 2
CONF=deploy/digital-wall/nginx-gateway.conf; C=digital-wall-gateway; PREV=/tmp/gateway-prev.conf
answers() { for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:8088/digital-wall/timeline/)" = 200 ] && return 0; sleep 1; done; return 1; }
want=$(md5sum < "$CONF" | cut -d' ' -f1)
have=$(docker exec "$C" md5sum /etc/nginx/conf.d/default.conf 2>/dev/null | cut -d' ' -f1)
[ -n "$have" ] || { echo "gateway: cannot read the running config; left alone"; exit 1; }
[ "$want" = "$have" ] && { echo "gateway: config unchanged"; exit 0; }
[ "${1:-}" = "--dry-run" ] && { echo "gateway: config changed; would test it and restart"; exit 0; }
img=$(docker inspect -f '{{.Config.Image}}' "$C") || { echo "gateway: cannot read its image; left alone"; exit 1; }
docker run --rm -v "$PWD/$CONF:/etc/nginx/conf.d/default.conf:ro" "$img" nginx -t > /tmp/gateway-test.out 2>&1 \
  || { echo "GATEWAY CONFIG REFUSED by nginx -t; the gateway keeps the old config"; tail -3 /tmp/gateway-test.out; exit 1; }
docker exec "$C" cat /etc/nginx/conf.d/default.conf > "$PREV" 2>/dev/null
docker restart "$C" > /dev/null || { echo "GATEWAY RESTART FAILED"; exit 1; }
if answers; then echo "gateway: new config loaded, answering"; exit 0; fi
echo "GATEWAY NOT ANSWERING on the new config; putting the old file back (the checkout's copy now differs from main)"
[ -s "$PREV" ] && cp "$PREV" "$CONF" && docker restart "$C" > /dev/null
answers && { echo "gateway: back on the old config, answering"; exit 1; }
echo "GATEWAY STILL NOT ANSWERING; a person must look now"; exit 1
