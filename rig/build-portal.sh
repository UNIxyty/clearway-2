#!/usr/bin/env bash
# Builds the console FOR THE RIG. Next.js compiles NEXT_PUBLIC_* values into the build and copies .env* files
# into .next/standalone (loaded at runtime). A plain `npm run build` therefore bakes in and ships production
# values. This build exports .env.rig first (process env wins over .env files at build time), then strips every
# .env* file from the standalone output, then fails if any production host survived in the output.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
[ -f .env.rig ] || { echo "no .env.rig — run rig/db.sh start first"; exit 2; }
set -a; . ./.env.rig; set +a
rm -rf .next/cache/fetch-cache            # responses cached by an earlier build may be production data
npm run build
rm -f .next/standalone/.env .next/standalone/.env.*
rm -rf .next/standalone/.next/cache
"$ROOT/rig/check-portal-build.sh"
