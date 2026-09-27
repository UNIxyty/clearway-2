#!/usr/bin/env bash
# A rig console build must contain no .env file and no production host. Exit 78 otherwise.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
bad=0
if ls .next/standalone/.env* >/dev/null 2>&1; then echo "REFUSING: .next/standalone contains .env files: $(ls .next/standalone/.env* | xargs -n1 basename | tr '\n' ' ')"; bad=1; fi
# Allowed, and only this: hard-coded PUBLIC storage images (sign-in page logos) — a public URL, no key, no database.
# The production site's domain may appear as a default link base (APP_BASE_URL fallback); .env.rig sets
# APP_BASE_URL so it is never used. A Supabase host other than a public storage image is refused.
hits=$(grep -rhoE "https?://[a-z0-9]{20}\.supabase\.co[^\"'\\\` )]*" .next/standalone/.next .next/static 2>/dev/null | { grep -vE "\.supabase\.co/storage/v1/object/public/" || true; } | wc -l | tr -d ' ')
if [ "$hits" != "0" ]; then echo "REFUSING: $hits reference(s) in the console build to a production Supabase host — rebuild with rig/build-portal.sh"; bad=1; fi
[ $bad = 0 ] && echo "console build: no .env files, no production hosts" || exit 78
