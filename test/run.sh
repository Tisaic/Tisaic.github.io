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
# BOTH HALVES BY DEFAULT -- the flags below narrow it, and nothing narrows it silently.
PHASE="both"
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
    # WHICH HALF, not just which tier. A wiring or layout change cannot break a
    # golden-vector parity check or a Poiseuille profile, so re-running 450 Node
    # checks to see whether a button is reachable is 40 minutes of cost that
    # cannot produce information. That cost was being paid on every UI edit, and
    # paying it is what made the suite something to avoid rather than to run.
    --browser) PHASE="browser" ;;
    --node) PHASE="node" ;;
    --all) AREAS="ngrc,flowsim,flexisim"; FOCUS="" ;;
    --only=*) AREAS="${arg#--only=}"; FOCUS="" ;;
    *) echo "usage: $0 [--quick|--full] [--node|--browser] [--all|--only=ngrc,flowsim,flexisim]" >&2; exit 2 ;;
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
      lib/lattsim/operators/elastic.js|lib/lattsim/operators/frame.js|test/lattsim/elastic*|\
lib/flexisim/*|test/flexisim/*|flexisim.html|lib/blackbox/*|test/blackbox/*|lib/pilot/*|test/pilot/*)
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
# THE NODE TESTS ARE ALL GATED ON `AREAS`, so emptying it for their half is the whole
# implementation -- and it is restored before the browser gate reads it, which is why
# BROWSER_AREAS exists rather than a second variable threaded through thirty `case`s.
BROWSER_AREAS="${AREAS}"
if [ "${PHASE}" = "browser" ]; then AREAS=""; fi
echo "Suite level: ${SUITE}   areas: ${BROWSER_AREAS:-none changed (parse + index only)}   phase: ${PHASE}"
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
  # The lumped joint -- gearbox, motor, backlash, friction -- against its own
  # closed forms. No lattice at all, so it verifies in milliseconds. Verifying
  # each side of the hybrid plant ALONE is what makes the eventual joint-vs-link
  # split measurable rather than a discrepancy with two possible homes.
  if [ -d lib/flexisim ]; then
    node test/flexisim/joint.test.mjs
    # The hybrid plant: a lumped joint carrying a lattice link, and the
    # joint-vs-link split of tip error MEASURED rather than inherited from the
    # literature. It is the number the link resolution is chosen from.
    node test/flexisim/arm.test.mjs
    # THE CHAIN: two joints, two lattice links, one coupled solve. Rigid-core
    # conservation laws (energy, and the momentum conjugate to the cyclic shoulder
    # angle) plus the closed forms for the mass matrix, the gravity torques and the
    # elbow's own acceleration. Two seconds -- the conservation checks never touch a
    # lattice, which is the whole reason stepRigid() is separable.
    node test/flexisim/arm2r.test.mjs
    # The payoff: tip error inferred from motor-side signals alone, trained
    # against the tracker and then LOCKED, against the physics-based compliance
    # model a good engineer would build.
    node test/flexisim/tipsensor.test.mjs
    # THE GENERAL N-LINK CHAIN by recursive Newton-Euler, verified by REPRODUCING
    # the hand-derived 2R to machine precision -- two independent routes to the same
    # matrix, which is what lets a third link be trusted without a third derivation.
    # Three seconds: the conservation checks never touch a lattice.
    node test/flexisim/armnr.test.mjs
    # THE ARCHITECTURE QUESTION A CHAIN MAKES ASKABLE: per-joint signals against
    # whole-arm ones, at MATCHED model capacity so the gap is information and not
    # feature count. 5 s quick (the whole-arm readout alone), 20 s full (the
    # three-way comparison and the forecast).
    node test/flexisim/chainsensor.test.mjs
    # THE TWO BLOCKS THAT BOLT A LEARNER ONTO A CONVENTIONAL CONTROLLER, as contracts
    # rather than as physics -- no arm, no lattice, milliseconds. Both quick tier, because
    # what they pin is the kind of thing that fails silently: a trim that is not EXACTLY
    # off when switched off makes an A/B meaningless, and a NaN estimate reaching a servo
    # command is unrecoverable.
    node test/flexisim/residual.test.mjs
    # THE HONEST HEAD-TO-HEAD: a properly commissioned CONVENTIONAL machine, and three
    # learned layers switched over it one at a time. Full tier -- six commissioned runs
    # per stiffness -- because what it pins is a comparison, not a contract.
    if [ "${SUITE}" = "full" ]; then node test/flexisim/hybrid.test.mjs; fi
    # WHAT A LOCKED READOUT SAYS ABOUT A PATH IT HAS NEVER RUN -- the one claim here that
    # the classical rivals cannot structurally reach, since an ILC table indexed by arc
    # length on a path that no longer exists supplies nothing. Full tier: six commissioned
    # trajectories plus five transfers.
    if [ "${SUITE}" = "full" ]; then node test/flexisim/transfer.test.mjs; fi
    # THE PILOT AND THE STACK ON ONE DENOMINATOR -- same plant, same path, same
    # conventional baseline. It exists because they were quoted side by side for a whole
    # session while sharing none of those three.
    if [ "${SUITE}" = "full" ]; then node test/flexisim/reconcile.test.mjs; fi
    # HARMONIC FEEDFORWARD. Full tier only: it drives ~20 laps of the contouring plant to
    # pin that the world frame beats the rotating path-normal one by more than 2x, which is
    # the entire finding and is not something a browser check can see.
    if [ "${SUITE}" = "full" ]; then node test/flexisim/harmonic.test.mjs; fi
    # THE COMPOSITE — a cascade of pilots with harmonic feedforward on top, 30x over a
    # conventional machine. Full tier only: it commissions two pilot layers and drives ~90
    # laps of the contouring plant.
    if [ "${SUITE}" = "full" ]; then node test/flexisim/composite.test.mjs; fi
    # A PATH-AGNOSTIC CORRECTION and the selection rule that finds it. Full tier only: it
    # converges a harmonic table on six programs and then deploys twelve candidate maps.
    if [ "${SUITE}" = "full" ]; then node test/flexisim/pathmap.test.mjs; fi
    # THE MODULE THAT IS GIVEN NOTHING, on three plants that share no physics: a
    # lightly damped actuator, an over-damped process with a NEGATIVE gain two hundred
    # times smaller, and the real hybrid arm. One module, one set of options apart from a
    # sample rate. If any plant constant had leaked in, exactly one of them would work --
    # which is the only way a portability claim can be checked. Full tier: it drives
    # ~200k solver steps of the real arm.
    if [ "${SUITE}" = "full" ]; then node test/blackbox/blackbox.test.mjs; fi
    # THE DRIVE-SIDE FEEDFORWARD, self-commissioned. Full tier: it is a documented
    # measurement about a library block rather than a contract of the shipped page,
    # which uses the hand-built model, and it drives ~100k solver steps.
    if [ "${SUITE}" = "full" ]; then node test/flexisim/servoff.test.mjs; fi
    # The STRUCTURED rival: identify the compliance itself (a physical constant)
    # rather than the error, from static pose touches the way CompCommissioner
    # expects. Full tier -- six settles.
    if [ "${SUITE}" = "full" ]; then node test/flexisim/compliance.test.mjs; fi
    # ACTIVE COMPENSATION: the identified constant pre-distorting a commanded move,
    # and the 2x2 that separates the deflection from the vibration. It runs at BOTH
    # tiers despite costing ~13 s, because it is the only check that exercises the
    # loop end to end -- commission, identify, lock, correct -- and a sign error in
    # the correction DOUBLES the tip error rather than degrading it.
    node test/flexisim/compensator.test.mjs
    # THE LEARNED DYNAMIC FEEDFORWARD, and it is FULL TIER because it drives ~400k
    # solver steps: five iterative convergences plus the held-out scoring. What it
    # pins that nothing else can is the pair of failures either side of the working
    # configuration -- refining with NO lead diverges, and fitting to ONE trajectory
    # produces something 25x WORSE than no correction on a move it never saw. Both
    # are the shapes a later simplification would reach for.
    if [ "${SUITE}" = "full" ]; then node test/flexisim/learnedff.test.mjs; fi
    # THE CONTOURING SIDE, which is what the end application is. Three files and none
    # of them measures a point-to-point move.
    #   toolpath  the geometry and the feedrate profile: arc length, the corner rule,
    #             and the acceleration ELLIPSE (spending the whole budget tangentially
    #             into an arc that then needs it all centripetally is sqrt(2) over the
    #             limit while every scalar check passes). No plant, milliseconds.
    #   pathilc   iterative learning against a plant whose delay is known, so the
    #             update's LEAD can be swept across it: no lead winds up, too much lead
    #             winds up harder, and the optimum is interior. No plant, milliseconds.
    #   contour   the two of them on the real arm -- the IK round trip, the
    #             contour/lag split, and the pair of findings the Path tab is built on
    #             (contour error FLOORS as the feedrate falls, and motor energy has an
    #             interior minimum, so the two do not optimise together).
    node test/flexisim/toolpath.test.mjs
    node test/flexisim/pathilc.test.mjs
    node test/flexisim/contour.test.mjs
    # THE PILOT — route, limit, run, deploy. The excitation builder and the whole
    # pipeline on a plant that shares no physics with the arm are quick (the plant is
    # three scalar states); the arm end-to-end — commissioning ~110k lattice steps and
    # four scored contour runs — is full tier, and it is the test that pins the flagship
    # claim: commissioned once from noise, better on programs it has never seen, on less
    # energy, or refused.
    node test/pilot/excite.test.mjs
    node test/pilot/pilot.test.mjs
    node test/pilot/tanks.test.mjs
    node test/pilot/thermal.test.mjs
    node test/pilot/woodberry.test.mjs
    node test/pilot/rollmill.test.mjs
    node test/pilot/emps.test.mjs
    if [ "${SUITE}" = "full" ]; then node test/pilot/stack.test.mjs; fi
    if [ "${SUITE}" = "full" ]; then node test/pilot/arm.test.mjs; fi
    if [ "${SUITE}" = "full" ]; then node test/pilot/ikfree.test.mjs; fi
  fi
fi

AREAS="${BROWSER_AREAS}"
if [ "${PHASE}" = "node" ]; then
  echo; echo "(--node — skipping the browser)"; echo; exit 0
fi

# NO BROWSER WHEN NO PAGE IS UNDER TEST. Every area now has a page, so this only
# fires when the change touched nothing a page owns (docs, the version stamp).
case ",${AREAS}," in
  *,ngrc,*|*,flowsim,*|*,flexisim,*) ;;
  *) echo; echo "(no page in scope — skipping the browser)"; echo; exit 0 ;;
esac

# Serve the repo and always clean up the server on exit.
python3 -m http.server "${PORT}" >/dev/null 2>&1 &
SRV=$!
trap 'kill "${SRV}" 2>/dev/null || true' EXIT
sleep 1

BASE_URL="http://127.0.0.1:${PORT}/" node test/smoke.mjs
