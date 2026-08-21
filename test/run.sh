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
AREAS=""
# WHILE FLEXISIM IS BEING BUILT, IT IS THE ONLY THING WORTH RUNNING. FlowSim and
# NGRC are finished features; re-testing them on every elastic-operator edit buys
# nothing and costs minutes, so the default focus is flexisim and the others are
# opt-in. Clear it (FOCUS= ./test/run.sh) or pass --all to go back to deriving
# areas from git, which is what this should return to once the tab has shipped.
FOCUS="${FOCUS-flexisim}"
for arg in "$@"; do
  case "$arg" in
    --full) SUITE="full" ;;
    --quick) SUITE="quick" ;;
    --all) AREAS="ngrc,flowsim,flexisim"; FOCUS="" ;;
    --only=*) AREAS="${arg#--only=}"; FOCUS="" ;;
    *) echo "usage: $0 [--quick|--full] [--all|--only=ngrc,flowsim,flexisim]" >&2; exit 2 ;;
  esac
done
export SUITE

# WHAT CHANGED DECIDES WHAT RUNS. A FlowSim edit judged by NGRC's warm-up timers
# is cost without information -- those checks cannot fail for a reason the edit is
# responsible for, and when they do fail it is for load-related reasons that send
# you looking in the wrong place. So the areas are derived from git rather than
# always both.
#
# The mapping is GENEROUS in one direction on purpose: anything shared -- the
# console bootstrap, this script, the smoke test, the module parser, vendor --
# selects EVERY area, because a change there can break any page. Under-testing a
# shared file is the expensive mistake; over-testing one costs a few minutes.
#
# Anything the map does not recognise (docs, CLAUDE.md, the version stamp) selects
# NOTHING, which leaves the module parse and the index page -- the checks that are
# cheap enough to be worth running unconditionally.
if [ -n "${FOCUS}" ]; then
  AREAS="${FOCUS}"
elif [ -z "${AREAS}" ]; then
  BASE="$(git merge-base HEAD origin/main 2>/dev/null || true)"
  CHANGED="$(
    { git diff --name-only HEAD 2>/dev/null
      git diff --name-only --cached 2>/dev/null
      git ls-files --others --exclude-standard 2>/dev/null
      [ -n "${BASE}" ] && git diff --name-only "${BASE}" HEAD 2>/dev/null
    } | sort -u
  )"
  want_ngrc=0; want_flow=0; want_flex=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
      # Shared: everything.
      console-boot.js|index.html|test/run.sh|test/smoke.mjs|test/parse.mjs|vendor/*)
        want_ngrc=1; want_flow=1 ;;
      # probesense is the composition layer -- ngrc's model, flowsim's soft sensor.
      lib/probesense/*|test/probesense/*)
        want_ngrc=1; want_flow=1 ;;
      lib/ngrc/*|test/ngrc/*|ngrc.html)   want_ngrc=1 ;;
      # FlexiSim's own files, listed BEFORE the general lattsim rule so they do
      # not drag the whole FlowSim suite in. The elastic operator has no page yet
      # and shares no kernel with the fluid.
      lib/lattsim/operators/elastic.js|test/lattsim/elastic*|flexisim.html)
        want_flex=1 ;;
      # The shared engine -- lattice, fields, solver, backends -- is under both.
      lib/lattsim/*|test/lattsim/*|flowsim.html) want_flow=1; want_flex=1 ;;
    esac
  done <<EOF
${CHANGED}
EOF
  # Written as if-statements rather than `[ x ] && y`: under `set -e` a false
  # test makes the whole `&&` list return 1, and a standalone list returning 1
  # exits the script -- so "nothing in this area changed" would have looked
  # exactly like "the suite failed".
  if [ "$want_ngrc" = 1 ]; then AREAS="ngrc"; fi
  if [ "$want_flow" = 1 ]; then AREAS="${AREAS:+${AREAS},}flowsim"; fi
  if [ "$want_flex" = 1 ]; then AREAS="${AREAS:+${AREAS},}flexisim"; fi
fi
export AREAS
echo "Suite level: ${SUITE}   areas: ${AREAS:-none changed (parse + index only)}"
echo "  (--all forces both; --only=ngrc,flowsim selects explicitly)"

# Ensure playwright-core (installed under test/, never shipped to the page).
if ! node -e "require.resolve('playwright-core',{paths:['${ROOT}/test']})" >/dev/null 2>&1; then
  echo "Installing playwright-core (dev-only)…"
  (cd test && npm install --no-audit --no-fund --silent)
fi

# PARSE EVERY SHIPPED MODULE AS A MODULE, first and fast. `node --check` parses a
# .js file as a CommonJS script and PASSES on a duplicate `const` in one scope --
# verified on a four-line reproduction -- so it let an unparseable webgpu.js
# through. The page then reported "CPU reference backend is capped at 131072
# cells", three layers from the cause, because an import failure is also what a
# browser without WebGPU looks like and is caught on purpose.
node --experimental-vm-modules test/parse.mjs 2>&1 | grep -v 'ExperimentalWarning\|--trace-warnings'
test "${PIPESTATUS[0]}" -eq 0 || { echo "module parse failed"; exit 1; }

# NGRC library unit tests (pure Node, golden-vector parity — no server needed).
# Gated on the area: golden-vector parity cannot break unless lib/ngrc or
# something shared moved, so on a FlowSim-only edit these are 2 s of noise.
if [ -d lib/ngrc ] && case ",${AREAS}," in *,ngrc,*) true ;; *) false ;; esac; then
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
if [ -d lib/lattsim ] && case ",${AREAS}," in *,flowsim,*) true ;; *) false ;; esac; then
  node test/lattsim/d3q19.test.mjs
  node test/lattsim/engine.test.mjs
  node test/lattsim/conservation.test.mjs
  # Poiseuille is the check that the solver solves the right equations, so it
  # runs at both tiers -- but the tau sweep and the resolution study behind it
  # are full-tier.
  node test/lattsim/poiseuille.test.mjs
  # The equation of state, checked against the analytic sound speed of an acoustic
  # wave -- the same class of closed-form check as Poiseuille for shear viscosity.
  node test/lattsim/eos.test.mjs
  # The passive scalar's diffusivity, advection speed and conservation against
  # their closed forms -- a contract, so both tiers.
  node test/lattsim/scalar.test.mjs
  # End-to-end field reconstruction (wall sensors -> concentration slice). It
  # drives ~1200 CPU-reference steps, so it is full-tier; the pipeline's cheaper
  # pieces (probeMany parity, the FieldReconstructor unit test) run every time.
  if [ "${SUITE}" = "full" ]; then
    node test/lattsim/reconstruct.test.mjs
  fi
fi

# FLEXISIM: linear elastodynamics against its closed forms. Plain Node, CPU
# reference, no browser and no adapter -- tier 1 of the verification rule, and it
# runs in well under a second, which is what makes it usable on every edit.
if [ -d lib/lattsim ] && case ",${AREAS}," in *,flexisim,*) true ;; *) false ;; esac; then
  node test/lattsim/elastic.test.mjs
fi

# NO BROWSER WHEN NO PAGE IS UNDER TEST. FlexiSim has no page yet, so on a
# flexisim-only run the server, the mobile-emulated Chromium and the index-page
# checks are eight seconds spent proving something the edit could not have
# touched. Skipping them is what takes the build loop from 10 s to under 2 --
# which is the difference between a check that gets run on every edit and one
# that does not. Delete this branch the moment flexisim.html exists.
case ",${AREAS}," in
  *,ngrc,*|*,flowsim,*) ;;
  *) echo; echo "(no page in scope — skipping the browser)"; echo; exit 0 ;;
esac

# Serve the repo and always clean up the server on exit.
python3 -m http.server "${PORT}" >/dev/null 2>&1 &
SRV=$!
trap 'kill "${SRV}" 2>/dev/null || true' EXIT
sleep 1

BASE_URL="http://127.0.0.1:${PORT}/" node test/smoke.mjs
