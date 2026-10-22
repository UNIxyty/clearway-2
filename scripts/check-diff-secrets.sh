#!/usr/bin/env bash
# Before a push: the diff about to leave this machine carries no secret-shaped string and no production address.
#   scripts/check-diff-secrets.sh                 what is staged
#   scripts/check-diff-secrets.sh origin/main..   the commits not yet pushed
# Exit 0 clean, 1 a hit (printed by line number, never the value), 2 when the diff could not be read at all —
# a gate with no input refuses (2026-10-21); "git failed" is not "clean".
set -u
cd "$(dirname "$0")/.."
RANGE="${1:-}"
if [ -n "$RANGE" ]; then DIFF=$(git diff "$RANGE" 2>/dev/null); rc=$?; else DIFF=$(git diff --cached 2>/dev/null); rc=$?; fi
[ "$rc" = 0 ] || { echo "check-diff-secrets: REFUSING — git diff ${RANGE:-"--cached"} failed (rc $rc); nothing was checked"; exit 2; }
[ -n "$DIFF" ] || { echo "check-diff-secrets: REFUSING — the diff is empty; nothing to push, or the wrong range"; exit 2; }
# Added lines only; report the line's position and the kind of hit, not the text. The production names are split so this
# file does not match itself.
HITS=$(printf '%s\n' "$DIFF" | grep -nE '^\+' | grep -vE '^[0-9]+:\+\+\+' | grep -nEi \
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|(secret|password|passwd|token|api[_-]?key)["'"'"'= :]+[A-Za-z0-9_\-]{24,}|'"ops@"'clearway|star'"kov"'|dmi'"trij"'' \
  | grep -vE 'rig-access-check-only|invalid' | cut -d: -f1,2)
if [ -n "$HITS" ]; then
  echo "check-diff-secrets: HIT — these added lines (diff line numbers) look like a secret or a production address:"
  printf '%s\n' "$HITS" | sed 's/^/  diff line /'
  exit 1
fi
echo "check-diff-secrets: clean ($(printf '%s\n' "$DIFF" | grep -cE '^\+' ) added lines read)"
