#!/usr/bin/env bash
# The suite: the Node checks for each area, then the pages served the way GitHub Pages serves them
# and driven in a mobile-emulated Chromium. Exits non-zero if any check fails.
#
#   ./test/run.sh                 quick tier, the flexisim area (FB_AutoFF, its plants, the page)
#   ./test/run.sh --full          full tier: adds the slow plants and the long browser scenarios
#   ./test/run.sh --all           every area (run --all --full before pushing anything shared)
#   ./test/run.sh --only=ngrc     named areas: ngrc, flowsim, flexisim
#   ./test/run.sh --node          Node checks only;  --browser  browser checks only
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT="${PORT:-8137}"

# EVERY CHECK RUNS. A failure is collected by name and the run exits non-zero at the END with the
# list, so one red test cannot hide the ones after it. Each check is timed, and the suite prints
# its own cost, slowest first.
FAILED_TESTS=""
TEST_TIMES=""
t() {
  local __t0 __dt
  __t0=$(date +%s%N)
  if "$@"; then :; else FAILED_TESTS="${FAILED_TESTS}${FAILED_TESTS:+
}  $*"; fi
  __dt=$(( ($(date +%s%N) - __t0) / 1000000 ))
  TEST_TIMES="${TEST_TIMES}${TEST_TIMES:+
}${__dt} $*"
}
report_failures() {
  if [ -n "${TEST_TIMES}" ]; then
    local total
    total=$(printf '%s\n' "${TEST_TIMES}" | awk '{s+=$1} END {printf "%.0f", s/1000}')
    echo
    echo "suite cost — ${total} s over $(printf '%s\n' "${TEST_TIMES}" | wc -l | tr -d ' ') checks, slowest first:"
    printf '%s\n' "${TEST_TIMES}" | sort -rn | head -12 | awk '{ms=$1; $1=""; printf "  %7.1f s  %s\n", ms/1000, substr($0,2)}'
  fi
  if [ -n "${FAILED_TESTS}" ]; then
    echo; echo "FAILED:"; echo "${FAILED_TESTS}"; echo
    exit 1
  fi
}

SUITE="quick"
PHASE="both"
AREAS="flexisim"
for arg in "$@"; do
  case "$arg" in
    --full) SUITE="full" ;;
    --quick) SUITE="quick" ;;
    --browser) PHASE="browser" ;;
    --node) PHASE="node" ;;
    --all) AREAS="ngrc,flowsim,flexisim" ;;
    --only=*) AREAS="${arg#--only=}" ;;
    *) echo "usage: $0 [--quick|--full] [--node|--browser] [--all|--only=ngrc,flowsim,flexisim]" >&2; exit 2 ;;
  esac
done
export SUITE AREAS
in_area() { case ",${AREAS}," in *,"$1",*) true ;; *) false ;; esac; }
echo "Suite: ${SUITE}   areas: ${AREAS}   phase: ${PHASE}"

# playwright-core lives under test/ and is never shipped to a page.
if ! node -e "require.resolve('playwright-core',{paths:['${ROOT}/test']})" >/dev/null 2>&1; then
  echo "Installing playwright-core (dev-only)…"
  (cd test && npm install --no-audit --no-fund --silent)
fi

# PARSE EVERY SHIPPED MODULE AS A MODULE, first and fast. `node --check` parses a .js file as a
# CommonJS script and passes things a browser's module loader rejects.
node --experimental-vm-modules test/parse.mjs 2>&1 | grep -v 'ExperimentalWarning\|--trace-warnings'
test "${PIPESTATUS[0]}" -eq 0 || { echo "module parse failed"; exit 1; }

if [ "${PHASE}" != "browser" ]; then
  # What ships, what commissions, what is only the bench — and nothing unclassified.
  t node test/inventory.test.mjs

  if in_area ngrc; then
    for f in primitives afm universal softsensor commission continuous dropin robotcomp commstore autotune servoff axiscomp; do
      t node "test/ngrc/${f}.test.mjs"
    done
    t node test/probesense/sensor.test.mjs
  fi

  if in_area flowsim; then
    for f in d3q19 engine conservation poiseuille eos scalar; do t node "test/lattsim/${f}.test.mjs"; done
    if [ "${SUITE}" = "full" ]; then t node test/lattsim/reconstruct.test.mjs; fi
  fi

  if in_area flexisim; then
    # The bench machine's physics, each part against its own closed forms.
    t node test/lattsim/elastic.test.mjs
    t node test/flexisim/joint.test.mjs
    t node test/flexisim/arm2r.test.mjs
    t node test/flexisim/toolpath.test.mjs
    t node test/flexisim/contour.test.mjs
    t node test/flexisim/bench.test.mjs
    # the arm's twin: the controller-shaped code against the object-built one, the per-program
    # learning on a budget, and (full tier) its table on the lattice arm on a program it never ran
    t node test/flexisim/twin.test.mjs
    # FB_AutoFF: its contract, then one press on every plant in test/plants/ (the slow plants and
    # the 2R arm in the full tier).
    t node test/autoff/contract.test.mjs
    t node test/autoff/twin.test.mjs
    t node test/autoff/portfolio.test.mjs
  fi
fi

if [ "${PHASE}" = "node" ]; then echo; echo "(--node — skipping the browser)"; report_failures; exit 0; fi

python3 -m http.server "${PORT}" >/dev/null 2>&1 &
SRV=$!
trap 'kill "${SRV}" 2>/dev/null || true' EXIT
sleep 1
t env BASE_URL="http://127.0.0.1:${PORT}/" node test/smoke.mjs

report_failures
