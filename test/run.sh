#!/usr/bin/env bash
# Runs the smoke test: ensures the (dev-only) test deps, serves the repo over
# HTTP the way GitHub Pages does, drives it in a mobile-emulated Chromium, and
# tears the server down. Exits non-zero if any check fails.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT="${PORT:-8137}"

# TWO TIERS. The full suite drives several thousand solver steps through a
# software GPU and a few minutes of anti-slosh control simulation, which is the
# right thing before a push and the wrong thing on every edit.
#   ./test/run.sh          quick  — everything cheap, plus the analytic physics
#   ./test/run.sh --full   full   — adds the long-horizon browser scenarios
SUITE="quick"
for arg in "$@"; do
  case "$arg" in
    --full) SUITE="full" ;;
    --quick) SUITE="quick" ;;
    *) echo "usage: $0 [--quick|--full]" >&2; exit 2 ;;
  esac
done
export SUITE
echo "Suite level: ${SUITE}"

# Ensure playwright-core (installed under test/, never shipped to the page).
if ! node -e "require.resolve('playwright-core',{paths:['${ROOT}/test']})" >/dev/null 2>&1; then
  echo "Installing playwright-core (dev-only)…"
  (cd test && npm install --no-audit --no-fund --silent)
fi

# NGRC library unit tests (pure Node, golden-vector parity — no server needed).
if [ -d lib/ngrc ]; then
  node test/ngrc/primitives.test.mjs
  node test/ngrc/afm.test.mjs
  node test/ngrc/universal.test.mjs
  node test/ngrc/softsensor.test.mjs
  node test/ngrc/commission.test.mjs
  node test/ngrc/continuous.test.mjs
  node test/ngrc/dropin.test.mjs
  node test/ngrc/robotcomp.test.mjs
  node test/ngrc/commstore.test.mjs
  node test/ngrc/autotune.test.mjs
  node test/ngrc/servoff.test.mjs
  node test/ngrc/axiscomp.test.mjs
fi

# LattSim engine + physics verification. Pure Node, against the CPU reference:
# there is no WebGPU here at all, and even in the browser below it exists only
# behind a flag and only as a software adapter. The production WGSL kernel is
# checked in the smoke test, cell by cell against this same reference.
if [ -d lib/lattsim ]; then
  node test/lattsim/d3q19.test.mjs
  node test/lattsim/engine.test.mjs
  node test/lattsim/conservation.test.mjs
  # Poiseuille is the check that the solver solves the right equations, so it
  # runs at both tiers -- but the tau sweep and the resolution study behind it
  # are full-tier.
  node test/lattsim/poiseuille.test.mjs
fi

# Serve the repo and always clean up the server on exit.
python3 -m http.server "${PORT}" >/dev/null 2>&1 &
SRV=$!
trap 'kill "${SRV}" 2>/dev/null || true' EXIT
sleep 1

BASE_URL="http://127.0.0.1:${PORT}/" node test/smoke.mjs
