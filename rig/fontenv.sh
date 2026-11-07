#!/usr/bin/env bash
# rig/.scratch/fontenv: the Python the manifest generator's text checks use (PyMuPDF), from rig/fontenv-requirements.txt
# (2026-11-07: it existed on one Mac only, made by hand). Kept when it already has the pinned packages.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; ENVDIR="$ROOT/rig/.scratch/fontenv"; REQ="$ROOT/rig/fontenv-requirements.txt"
want=$(grep -vE '^\s*(#|$)' "$REQ" | tr '[:upper:]' '[:lower:]' | sort | tr '\n' ' ')
have() { "$ENVDIR/bin/python" -m pip freeze 2>/dev/null | tr '[:upper:]' '[:lower:]' | grep -E "^($(grep -vE '^\s*(#|$)' "$REQ" | cut -d= -f1 | tr '[:upper:]' '[:lower:]' | paste -sd'|' -))==" | sort | tr '\n' ' '; }
if [ -x "$ENVDIR/bin/python" ] && [ "$(have)" = "$want" ]; then echo "fontenv: up to date"; exit 0; fi
rm -rf "$ENVDIR"; python3 -m venv "$ENVDIR"
"$ENVDIR/bin/python" -m pip install -q --disable-pip-version-check -r "$REQ"
[ "$(have)" = "$want" ] || { echo "fontenv: the installed packages are not the pinned ones"; exit 1; }
echo "fontenv: made ($want)"
