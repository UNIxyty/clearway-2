#!/usr/bin/env bash
# The rig from a fresh clone, on a Mac or the server's rig box (2026-11-07). The goal: a rig built from the repository
# alone, with no step anyone has to remember. Each step is safe to run again.
#   bash rig/setup.sh
# Two inputs the public repository cannot hold, read where the rig reads them; the setup says plainly when one is
# missing (the rig box's build puts both in place from the server's private inputs, rig/box/build.sh):
#   .env.rig's ANTHROPIC_API_KEY line          the rig's own key (without it the model suites are skipped, never green)
#   rig/.scratch/leon-snapshot.json            the intake's Leon stand-in data (rig/intake/leon-snapshot.mjs)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"; mkdir -p rig/.scratch
step() { echo "== $*"; }
node -e 'const [maj]=process.versions.node.split("."); if (Number(maj) < 24) { console.error(`Node ${process.versions.node}: the rig needs 24 or newer`); process.exit(1); }'

step "dependencies (npm ci in each package with a lockfile)"
for d in . agent digital-wall extension opsboard-react; do
  stamp="$d/node_modules/.rig-lock-sha"; sum=$(shasum -a 256 "$d/package-lock.json" | cut -d" " -f1)
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$sum" ]; then echo "  $d: up to date"; continue; fi
  ( cd "$d" && npm ci --no-audit --no-fund --loglevel=error ) && echo "$sum" > "$stamp" && echo "  $d: installed"
done

step "browsers"
if [ "$(uname)" = Linux ]; then sudo -n npx --yes playwright install-deps chromium > rig/.scratch/playwright-deps.out 2>&1 || { echo "  the browser's system libraries need root (sudo): see rig/.scratch/playwright-deps.out"; exit 1; }; fi
npx --yes playwright install chromium > rig/.scratch/playwright-install.out 2>&1 && echo "  chromium: $(npx playwright --version)"

step "the manifest generator's Python (rig/fontenv.sh)"; bash rig/fontenv.sh | sed 's/^/  /'
step "time-zone data for the agent (rig/tzdata.sh)"; [ -f rig/.scratch/icu-tz/zoneinfo64.res ] && echo "  up to date" || bash rig/tzdata.sh | tail -1 | sed 's/^/  /'

step "the private inputs"
grep -qE '^ANTHROPIC_API_KEY=.+' .env.rig 2>/dev/null && echo "  the rig's Anthropic key: present" || echo "  NO rig Anthropic key in .env.rig: the model suites will be skipped, and the run cannot be green"
[ -s rig/.scratch/leon-snapshot.json ] && echo "  the intake's Leon data: present" || { echo "  NO rig/.scratch/leon-snapshot.json: the intake's Leon stand-in cannot start (rig/intake/leon-snapshot.mjs makes it, from a shell with production's .env)"; exit 1; }

step "the database (rig/db.sh start: the pinned CLI, the migrations, .env.rig)"; bash rig/db.sh start > rig/.scratch/db-start.out 2>&1 || { tail -5 rig/.scratch/db-start.out; exit 1; }; echo "  up"
# up.sh's output to a file, not a pipe: the services it starts in the background would hold a pipe open for ever
step "the whole rig (rig/up.sh → rig/.scratch/up.out)"; bash rig/up.sh > rig/.scratch/up.out 2>&1 < /dev/null || { tail -8 rig/.scratch/up.out; exit 1; }
down=$(bash rig/up.sh status | grep -c '^DOWN' || true); [ "$down" = 0 ] || { echo "== $down service(s) DOWN: see rig/.scratch/*.out"; exit 1; }
echo "== the rig is up. The suite:  bash rig/run-all-suites.sh"
