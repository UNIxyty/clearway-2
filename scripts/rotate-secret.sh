#!/usr/bin/env bash
# Sets one variable in the server's .env without the value ever appearing on screen, in a log or in shell history.
#   scripts/rotate-secret.sh NAME                  prompts for the new value (typed or pasted, not echoed)
#   scripts/rotate-secret.sh NAME --generate [N]   a new random value, N bytes as hex (default 32)
#   scripts/rotate-secret.sh NAME --copy-from OTHER  NAME takes OTHER's current value (e.g. to give a key its own name)
#   scripts/rotate-secret.sh NAME --remove         deletes the line
# Options: --file PATH (default /root/clearway-2/.env). Prints only an 8-character fingerprint of the old and new values.
# It does NOT restart anything: recreate the services that read the variable afterwards (docs/security-rotation-plan.md).
set -euo pipefail
NAME="${1:?usage: rotate-secret.sh NAME [--generate [N] | --copy-from OTHER | --remove] [--file PATH]}"; shift
FILE=/root/clearway-2/.env; MODE=prompt; ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --generate) MODE=generate; ARG="${2:-32}"; [[ "$ARG" =~ ^[0-9]+$ ]] && shift || ARG=32 ;;
    --copy-from) MODE=copy; ARG="${2:?--copy-from needs a variable name}"; shift ;;
    --remove) MODE=remove ;;
    --file) FILE="${2:?--file needs a path}"; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac; shift
done
[[ "$NAME" =~ ^[A-Z_][A-Z0-9_]*$ ]] || { echo "not a variable name: $NAME" >&2; exit 2; }
[ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 2; }
case "$MODE" in
  prompt) read -r -s -p "New value for $NAME (not shown): " VALUE; echo; [ -n "$VALUE" ] || { echo "empty: nothing changed" >&2; exit 1; } ;;
  generate) VALUE="$(openssl rand -hex "$ARG")" ;;
  copy) VALUE="$(python3 -c 'import re,sys
for l in open(sys.argv[1], encoding="utf-8"):
    m = re.match(r"\s*(?:export\s+)?" + re.escape(sys.argv[2]) + r"\s*=\s*(.*)", l)
    if m: print(m.group(1).strip().strip("\"").strip("\x27")); break' "$FILE" "$ARG")"
        [ -n "$VALUE" ] || { echo "$ARG is not set in $FILE: nothing changed" >&2; exit 1; } ;;
  remove) VALUE="" ;;
esac
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"; BAK="$FILE.bak-rotate-$STAMP"
( umask 077; cp -p "$FILE" "$BAK" ); chmod 600 "$BAK"
VALUE="$VALUE" python3 - "$FILE" "$NAME" "$MODE" <<'PY'
import hashlib, os, re, sys
path, name, mode = sys.argv[1], sys.argv[2], sys.argv[3]
value = os.environ["VALUE"]
fp = lambda v: hashlib.sha256(v.encode()).hexdigest()[:8] if v else "(none)"
lines = open(path, encoding="utf-8").read().splitlines(keepends=True)
pat = re.compile(r"\s*(?:export\s+)?" + re.escape(name) + r"\s*=\s*(.*)")
old, out, done = "", [], False
for l in lines:
    m = pat.match(l)
    if m:
        old = m.group(1).strip().strip('"').strip("'")
        if mode != "remove" and not done: out.append(f"{name}={value}\n"); done = True
        continue
    out.append(l)
if mode != "remove" and not done:
    if out and not out[-1].endswith("\n"): out[-1] += "\n"
    out.append(f"{name}={value}\n")
tmp = path + ".tmp"
with open(tmp, "w", encoding="utf-8") as f: f.writelines(out)
os.chmod(tmp, os.stat(path).st_mode & 0o777); os.replace(tmp, path)
print(f"{name}: {fp(old)} -> {'removed' if mode == 'remove' else fp(value)}")
PY
echo "backup (holds the old value; delete it once the rotation is checked): $BAK"
