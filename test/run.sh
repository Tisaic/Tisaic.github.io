#!/usr/bin/env bash
# Runs the smoke test: ensures the (dev-only) test deps, serves the repo over
# HTTP the way GitHub Pages does, drives it in a mobile-emulated Chromium, and
# tears the server down. Exits non-zero if any check fails.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT="${PORT:-8137}"

# Ensure playwright-core (installed under test/, never shipped to the page).
if ! node -e "require.resolve('playwright-core',{paths:['${ROOT}/test']})" >/dev/null 2>&1; then
  echo "Installing playwright-core (dev-only)…"
  (cd test && npm install --no-audit --no-fund --silent)
fi

# NGRC library unit tests (pure Node, golden-vector parity — no server needed).
if [ -d lib/ngrc ]; then
  node test/ngrc/primitives.test.mjs
  node test/ngrc/afm.test.mjs
fi

# Serve the repo and always clean up the server on exit.
python3 -m http.server "${PORT}" >/dev/null 2>&1 &
SRV=$!
trap 'kill "${SRV}" 2>/dev/null || true' EXIT
sleep 1

BASE_URL="http://127.0.0.1:${PORT}/" node test/smoke.mjs
