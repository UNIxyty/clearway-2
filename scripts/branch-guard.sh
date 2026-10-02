#!/bin/sh
# Production is built from main, and only from main. Twice the server's checkout was left on another branch
# (portal-nav-digital-wall; aip-images-downloader from 1 Oct 2026) and builds "worked" while deploying the wrong
# tree or nothing. This check runs inside every image build (each Dockerfile copies .git/HEAD and calls it) and
# at the start of scripts/deploy.sh, so a build on any other branch stops with the reason.
#   branch-guard.sh <path to .git/HEAD> [1 = allow, for a deliberate local build of another branch]
HEAD_FILE="${1:-.git/HEAD}"; ALLOW="${2:-0}"
REF="$(cat "$HEAD_FILE" 2>/dev/null || echo "unreadable: $HEAD_FILE")"
[ "$REF" = "ref: refs/heads/main" ] && exit 0
if [ "$ALLOW" = "1" ]; then echo "branch guard: not on main ($REF); allowed by ALLOW_NON_MAIN_BUILD=1"; exit 0; fi
{
  echo ""
  echo "=================================================================="
  echo " REFUSING TO BUILD: this checkout is not on main."
  echo "   .git/HEAD says: $REF"
  echo " Production is built from main only. On the server:"
  echo "   git status          (look at what is checked out, and why)"
  echo "   git checkout main && git pull --ff-only origin main"
  echo " A deliberate local build of another branch:"
  echo "   ALLOW_NON_MAIN_BUILD=1 docker compose build <service>"
  echo "=================================================================="
} >&2
exit 1
