#!/usr/bin/env bash
# Does the CNAIR flight-dispatcher portal open a Genero session from THIS machine's IP?
# Read-only: one login, one session start, then stop. Credentials are read from the environment (never passed
# as arguments, never printed). Usage:
#   read -r -p "user: " CNAIR_USER; read -r -s -p "password: " CNAIR_PASSWORD; echo
#   CNAIR_USER="$CNAIR_USER" CNAIR_PASSWORD="$CNAIR_PASSWORD" bash login-check.sh
set -euo pipefail
: "${CNAIR_USER:?set CNAIR_USER}"; : "${CNAIR_PASSWORD:?set CNAIR_PASSWORD}"
BASE="https://cnair.efficens.es"; APP="$BASE/gas320/ua/r/cnair/flightdispatcher"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT; J="$W/cookies"
echo "public IP of this machine: $(curl -s --max-time 5 https://api.ipify.org || echo unknown)"

# 1. Login form (the same POST the browser makes).
curl -s -c "$J" -b "$J" -A "$UA" -o /dev/null "$APP"
code=$(curl -s -c "$J" -b "$J" -A "$UA" -o /dev/null -w "%{http_code}" \
  --data-urlencode "userName=$CNAIR_USER" --data-urlencode "password=$CNAIR_PASSWORD" --data "submit=Entrar" "$APP")
tok=$(awk '$6=="EFFI_TOKEN"{print length($7)}' "$J"); tok=${tok:-0}
echo "1. login POST → HTTP $code · EFFI_TOKEN cookie length: $tok $( [ "$tok" -gt 0 ] && echo '(token issued)' || echo '(NO token — login rejected)')"

# 2. Boot the Genero client page, then the protocol handshake.
curl -s -c "$J" -b "$J" -A "$UA" -o /dev/null "$APP"
curl -s -c "$J" -b "$J" -A "$UA" -D "$W/h1" -o "$W/b1" -H "X-FourJs-Client-Features: prompt" "$APP?Bootstrap=done"
sid=$(grep -i '^X-FourJs-Id:' "$W/h1" | tr -d '\r' | awk '{print $2}')
echo "2. bootstrap → $(head -c 60 "$W/b1" | tr -d '\n')… · session id header: $([ -n "$sid" ] && echo present || echo MISSING)"
grep -i '^X-FourJs' "$W/h1" | tr -d '\r' | sed -E 's/^(X-FourJs-Id:).*/\1 <present>/I' | sed 's/^/   /'
[ -n "$sid" ] || { echo "no session id — cannot start the program from here"; exit 1; }

# 3. Start the program (the first message the browser client sends).
curl -s -c "$J" -b "$J" -A "$UA" -o "$W/b2" -w "" -H "Content-Type: text/plain; charset=UTF-8" \
  --data-binary 'meta Client{{name "GBC"}{version "1.00.68"}{encoding "UTF-8"}{encapsulation "0"}{filetransfer "0"}{mobileUI "0"}}' \
  "$BASE/gas320/ua/sua/$sid?appId=0&pageId=1"
if grep -q "No se ha podido iniciar sesi" "$W/b2"; then
  echo "3. RESULT: FAILED — the program answered \"No se ha podido iniciar sesión\" (same as from the other network)"
elif grep -q "UserInterface" "$W/b2"; then
  echo "3. RESULT: OPENED — the program started. Screen texts it sent:"
  grep -oE 'text "[^"]{2,60}"' "$W/b2" | sort -u | head -25 | sed 's/^/   /'
else
  echo "3. RESULT: UNCLEAR — first bytes of the reply:"; head -c 400 "$W/b2"; echo
fi
