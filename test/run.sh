#!/usr/bin/env bash
# Runs the smoke test: ensures the (dev-only) test deps, serves the repo over
# HTTP the way GitHub Pages does, drives it in a mobile-emulated Chromium, and
# tears the server down. Exits non-zero if any check fails.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT="${PORT:-8137}"

# ONE RED TEST MUST NOT CANCEL THE REST OF THE BLOCK.
#
# Under `set -e` the first non-zero exit aborts the whole run, so a single failure takes every
# test after it down and their state is simply unknown. This repository has already paid for
# that once — `composite.test.mjs` exited 1 from the commit that added it and "set -e meant it
# took the whole pilot block down with it" — and it happened again: `tanks.test.mjs` went red
# and twenty pilot tests after it never ran, on a suite whose job is to tell me what is broken.
# A red suite that hides the next real failure is rule 3 in its most expensive form.
#
# So every check runs, failures are collected by name, and the run exits non-zero at the END
# with the list. The suite is exactly as red as it was; it now says how red.
FAILED_TESTS=""
t() {
  if "$@"; then
    :
  else
    FAILED_TESTS="${FAILED_TESTS}${FAILED_TESTS:+
}  $*"
  fi
}
# Called before any `exit 0`, so a clean exit cannot step over a collected failure.
report_failures() {
  if [ -n "${FAILED_TESTS}" ]; then
    echo
    echo "FAILED:"
    echo "${FAILED_TESTS}"
    echo
    exit 1
  fi
}

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
  t node test/ngrc/primitives.test.mjs
  t node test/ngrc/afm.test.mjs
  t node test/ngrc/universal.test.mjs
  t node test/ngrc/softsensor.test.mjs
  t node test/ngrc/commission.test.mjs
  t node test/ngrc/continuous.test.mjs
  t node test/ngrc/dropin.test.mjs
  t node test/ngrc/robotcomp.test.mjs
  t node test/ngrc/commstore.test.mjs
  t node test/ngrc/autotune.test.mjs
  t node test/ngrc/servoff.test.mjs
  t node test/ngrc/axiscomp.test.mjs
fi

# LattSim engine + physics verification. Pure Node, against the CPU reference:
# there is no WebGPU here at all, and even in the browser below it exists only
# behind a flag and only as a software adapter. The production WGSL kernel is
# checked in the smoke test, cell by cell against this same reference.
if [ -d lib/lattsim ] && case ",${AREAS}," in *,flowsim,*) true ;; *) false ;; esac; then
  t node test/lattsim/d3q19.test.mjs
  t node test/lattsim/engine.test.mjs
  t node test/lattsim/conservation.test.mjs
  # Poiseuille is the check that the solver solves the right equations, so it
  # runs at both tiers -- but the tau sweep and the resolution study behind it
  # are full-tier.
  t node test/lattsim/poiseuille.test.mjs
  # The equation of state, checked against the analytic sound speed of an acoustic
  # wave -- the same class of closed-form check as Poiseuille for shear viscosity.
  t node test/lattsim/eos.test.mjs
  # The passive scalar's diffusivity, advection speed and conservation against
  # their closed forms -- a contract, so both tiers.
  t node test/lattsim/scalar.test.mjs
  # End-to-end field reconstruction (wall sensors -> concentration slice). It
  # drives ~1200 CPU-reference steps, so it is full-tier; the pipeline's cheaper
  # pieces (probeMany parity, the FieldReconstructor unit test) run every time.
  if [ "${SUITE}" = "full" ]; then
    t node test/lattsim/reconstruct.test.mjs
  fi
fi

# FLEXISIM: linear elastodynamics against its closed forms. Plain Node, CPU
# reference, no browser and no adapter -- tier 1 of the verification rule, and it
# runs in well under a second, which is what makes it usable on every edit.
if [ -d lib/lattsim ] && case ",${AREAS}," in *,flexisim,*) true ;; *) false ;; esac; then
  t node test/lattsim/elastic.test.mjs
  # The lumped joint -- gearbox, motor, backlash, friction -- against its own
  # closed forms. No lattice at all, so it verifies in milliseconds. Verifying
  # each side of the hybrid plant ALONE is what makes the eventual joint-vs-link
  # split measurable rather than a discrepancy with two possible homes.
  if [ -d lib/flexisim ]; then
    t node test/flexisim/joint.test.mjs
    # The hybrid plant: a lumped joint carrying a lattice link, and the
    # joint-vs-link split of tip error MEASURED rather than inherited from the
    # literature. It is the number the link resolution is chosen from.
    t node test/flexisim/arm.test.mjs
    # THE CHAIN: two joints, two lattice links, one coupled solve. Rigid-core
    # conservation laws (energy, and the momentum conjugate to the cyclic shoulder
    # angle) plus the closed forms for the mass matrix, the gravity torques and the
    # elbow's own acceleration. Two seconds -- the conservation checks never touch a
    # lattice, which is the whole reason stepRigid() is separable.
    t node test/flexisim/arm2r.test.mjs
    # The payoff: tip error inferred from motor-side signals alone, trained
    # against the tracker and then LOCKED, against the physics-based compliance
    # model a good engineer would build.
    t node test/flexisim/tipsensor.test.mjs
    # THE GENERAL N-LINK CHAIN by recursive Newton-Euler, verified by REPRODUCING
    # the hand-derived 2R to machine precision -- two independent routes to the same
    # matrix, which is what lets a third link be trusted without a third derivation.
    # Three seconds: the conservation checks never touch a lattice.
    t node test/flexisim/armnr.test.mjs
    # THE ARCHITECTURE QUESTION A CHAIN MAKES ASKABLE: per-joint signals against
    # whole-arm ones, at MATCHED model capacity so the gap is information and not
    # feature count. 5 s quick (the whole-arm readout alone), 20 s full (the
    # three-way comparison and the forecast).
    t node test/flexisim/chainsensor.test.mjs
    # THE TWO BLOCKS THAT BOLT A LEARNER ONTO A CONVENTIONAL CONTROLLER, as contracts
    # rather than as physics -- no arm, no lattice, milliseconds. Both quick tier, because
    # what they pin is the kind of thing that fails silently: a trim that is not EXACTLY
    # off when switched off makes an A/B meaningless, and a NaN estimate reaching a servo
    # command is unrecoverable.
    t node test/flexisim/residual.test.mjs
    # THE HONEST HEAD-TO-HEAD: a properly commissioned CONVENTIONAL machine, and three
    # learned layers switched over it one at a time. Full tier -- six commissioned runs
    # per stiffness -- because what it pins is a comparison, not a contract.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/hybrid.test.mjs; fi
    # WHAT A LOCKED READOUT SAYS ABOUT A PATH IT HAS NEVER RUN -- the one claim here that
    # the classical rivals cannot structurally reach, since an ILC table indexed by arc
    # length on a path that no longer exists supplies nothing. Full tier: six commissioned
    # trajectories plus five transfers.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/transfer.test.mjs; fi
    # THE PILOT AND THE STACK ON ONE DENOMINATOR -- same plant, same path, same
    # conventional baseline. It exists because they were quoted side by side for a whole
    # session while sharing none of those three.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/reconcile.test.mjs; fi
    # HARMONIC FEEDFORWARD. Full tier only: it drives ~20 laps of the contouring plant to
    # pin that the world frame beats the rotating path-normal one by more than 2x, which is
    # the entire finding and is not something a browser check can see.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/harmonic.test.mjs; fi
    # THE COMPOSITE — a cascade of pilots with harmonic feedforward on top, 30x over a
    # conventional machine. Full tier only: it commissions two pilot layers and drives ~90
    # laps of the contouring plant.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/composite.test.mjs; fi
    # A PATH-AGNOSTIC CORRECTION and the selection rule that finds it. Full tier only: it
    # converges a harmonic table on six programs and then deploys twelve candidate maps.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/pathmap.test.mjs; fi
    # THE BUTTON ON THE ARM, against the strongest number this repository has. Full tier
    # ONLY, and it is the most expensive check here by a wide margin — ~24 minutes, because
    # it commissions the pilot cascade TWICE (on and off the rung below it, which is worth
    # 1.66x and cannot be recovered by re-scoring afterwards) and then identifies and
    # refines a harmonic layer over ~46 laps. It is here rather than in the quick tier for
    # exactly the reason rule 2 states: what makes a suite something to avoid is charging
    # a wiring change for a physics measurement. Run it when a rung changes.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/autostack.test.mjs; fi
    # THE MODULE THAT IS GIVEN NOTHING, on three plants that share no physics: a
    # lightly damped actuator, an over-damped process with a NEGATIVE gain two hundred
    # times smaller, and the real hybrid arm. One module, one set of options apart from a
    # sample rate. If any plant constant had leaked in, exactly one of them would work --
    # which is the only way a portability claim can be checked. Full tier: it drives
    # ~200k solver steps of the real arm.
    if [ "${SUITE}" = "full" ]; then t node test/blackbox/blackbox.test.mjs; fi
    # THE DRIVE-SIDE FEEDFORWARD, self-commissioned. Full tier: it is a documented
    # measurement about a library block rather than a contract of the shipped page,
    # which uses the hand-built model, and it drives ~100k solver steps.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/servoff.test.mjs; fi
    # The STRUCTURED rival: identify the compliance itself (a physical constant)
    # rather than the error, from static pose touches the way CompCommissioner
    # expects. Full tier -- six settles.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/compliance.test.mjs; fi
    # ACTIVE COMPENSATION: the identified constant pre-distorting a commanded move,
    # and the 2x2 that separates the deflection from the vibration. It runs at BOTH
    # tiers despite costing ~13 s, because it is the only check that exercises the
    # loop end to end -- commission, identify, lock, correct -- and a sign error in
    # the correction DOUBLES the tip error rather than degrading it.
    t node test/flexisim/compensator.test.mjs
    # THE LEARNED DYNAMIC FEEDFORWARD, and it is FULL TIER because it drives ~400k
    # solver steps: five iterative convergences plus the held-out scoring. What it
    # pins that nothing else can is the pair of failures either side of the working
    # configuration -- refining with NO lead diverges, and fitting to ONE trajectory
    # produces something 25x WORSE than no correction on a move it never saw. Both
    # are the shapes a later simplification would reach for.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/learnedff.test.mjs; fi
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
    t node test/flexisim/toolpath.test.mjs
    t node test/flexisim/pathilc.test.mjs
    t node test/flexisim/contour.test.mjs
    # THE COMPILED TWIN (§42) — identify from one wander with the tracker, compile any
    # program in software, deliver lap 1 at e-3/e-4. Agnostic core + arm adapter.
    if [ "${SUITE}" = "full" ]; then t node test/flexisim/twin.test.mjs; fi
    # THE PILOT — route, limit, run, deploy. The excitation builder and the whole
    # pipeline on a plant that shares no physics with the arm are quick (the plant is
    # three scalar states); the arm end-to-end — commissioning ~110k lattice steps and
    # four scored contour runs — is full tier, and it is the test that pins the flagship
    # claim: commissioned once from noise, better on programs it has never seen, on less
    # energy, or refused.
    t node test/pilot/excite.test.mjs
    t node test/pilot/pilot.test.mjs
    t node test/pilot/tanks.test.mjs
    t node test/pilot/thermal.test.mjs
    t node test/pilot/woodberry.test.mjs
    t node test/pilot/rollmill.test.mjs
    t node test/pilot/emps.test.mjs
    # THE GATED-ADAPTATION CONTRACT on the same axis: the innovation gate fires on repeats,
    # adaptation multiplies the static machine, the take-away installation holds after the
    # truth source is removed, the adapted bank passes the memory test on a program it never
    # ran, and the forgetting is pinned as the mechanism (lambda 1 loses the gain).
    t node test/pilot/onlinegate.test.mjs
    # TARGET 6'S ONE NUMBER: the full deployed composition (QP + forecast + router + RLS)
    # fits 10% of a 1 ms scan SLICED, each arming moves exactly its own part, and the sum
    # is asserted against the parts.
    t node test/pilot/scancost.test.mjs
    # TARGET 1'S CONTRACT on the claim it can own: the price of agnosticism (self-fit
    # ceiling over the agnostic recipe, same program, same instrument) inside 1.3x, with
    # the ceiling real and the agnostic recipe clearly above baseline.
    t node test/pilot/agnosticprice.mjs
    t node test/pilot/hff.test.mjs
    # The banded operator on a plant with KNOWN neighbour coupling, and the control that it
    # is byte-identical where there is none. It shipped once with every harmonic's fit null
    # and reported a ratio of exactly 1.000 at three coupling strengths.
    t node test/pilot/band.test.mjs
    # Every contribution intentional, summed exactly once, mapped through its OWN frame, and
    # every signal inside a stated range — including the two states a bounds check cannot
    # see by itself: a demand that never reached the cap, and a NaN that compares false
    # against every limit.
    t node test/pilot/sum.test.mjs
    # An operator identified on one program, reused on another: the lap cost it saves, and
    # the refusal when the lap length differs and harmonic h is not the same frequency.
    t node test/pilot/reuse.test.mjs
    # The one assumption the browser integration rests on: a host that awaits a frame
    # mid-run reaches the same result as one that runs straight through.
    t node test/pilot/yield.test.mjs
    # THE PLAN A RUNG PUBLISHES MUST BE THE PLAN IT SPENDS. The page shows a denominator and
    # a per-stage criterion so an operator can tell a long measurement from a stall; a plan
    # that drifts from the run turns that into a lie in the direction that reads as a stall.
    # Its first version published 40 runs for a commission that spent 76.
    t node test/pilot/plan.test.mjs
    # WHAT THE LADDER DEPLOYS MUST BE WHAT THE LADDER SCORED. Every scored run drives
    # `theta = c + ff.dq + u`; the page deployed `u` alone, so a rung table reading 1.7316e-2
    # drove a machine delivering 3.5e-1 to 7.7e-1 against an open loop of 4.1e-1. Rule 6:
    # where two views show one quantity, assert they AGREE.
    t node test/pilot/deploy.test.mjs
    # A MEMORY MAY ONLY BE APPLIED WHERE IT WAS FORMED. The bench measured the lap-periodic
    # rung as a NET NEGATIVE across five programs and four feedrates — model layers alone beat
    # the full ladder in 14 of 20 cells — so it is withheld off its own program. Both halves
    # pinned: inert at home, and withheld elsewhere with a reason distinct from 'starved'.
    t node test/pilot/offprogram.test.mjs
    # THE PREDICTIVE VARIANCE THE RIDGE FIT WAS ALREADY PAYING FOR: x'(X'X+lam I)^-1 x from
    # the Cholesky factor it was discarding, checked against an independently inverted matrix.
    t node test/pilot/leverage.test.mjs
    # THE CLAIM THE PLC REBUILD RESTS ON: every lead shares a design matrix, so one covariance
    # serves the whole forecast bank. It is the difference between 4079% of the online budget
    # and 56%, so it is asserted numerically rather than argued structurally.
    t node test/pilot/shared.test.mjs
    # WHAT SIXTY QP ITERATIONS ARE ACTUALLY WORTH. One-iteration-per-cycle (the real-time
    # iteration scheme) does not track sixty, and sixty is itself 36% from this solver's own
    # optimum -- so every delivered number in the project came out of a truncated solve. The
    # rate is set by the Hessian's conditioning, not by the horizon (same curve at N=8 as at
    # N=48), and the step size comes off a bound 1.8x looser than it needs to be.
    t node test/pilot/rti.test.mjs
    # THE ONLINE FIT THAT REPLACES BATCH RIDGE, and the second-order adaptation that replaces
    # the retired lap rung -- one object, because they are the same recursion. Asserted to
    # reproduce solveRidge to 4.6e-10% at matched absolute ridge, since a new fitting method
    # that quietly changes the model is worse than a slow one. Also pins what the batch
    # convention costs: the ridge is scale-relative, so its penalty depends on a statistic of
    # the whole record that an online prior cannot know at row 1.
    t node test/pilot/ensemble.test.mjs
    t node test/pilot/rls.test.mjs
    t node test/pilot/autostack.test.mjs
    # THE BUTTON ON FOUR MORE PLANTS THAT SHARE NO PHYSICS — a tank whose outflow goes as
    # sqrt(level), a column that is linear transfer functions with dead time, a mill whose
    # gauge is read a metre downstream, a barrel radiating as T^4 through a delay. Rule 18
    # from the other side: a ladder measured on one plant has measured one plant. It is
    # ~4 minutes because three of the four correctly refuse and stop early.
    if [ "${SUITE}" = "full" ]; then t node test/pilot/plants.test.mjs; fi
    if [ "${SUITE}" = "full" ]; then t node test/pilot/stack.test.mjs; fi
    if [ "${SUITE}" = "full" ]; then t node test/pilot/arm.test.mjs; fi
    if [ "${SUITE}" = "full" ]; then t node test/pilot/ikfree.test.mjs; fi
    # THE §40 CORRECTOR AS A LIBRARY — converge/freeze/gate, two-sided, on the soft arm.
    if [ "${SUITE}" = "full" ]; then t node test/pilot/refine.test.mjs; fi
  fi
fi

AREAS="${BROWSER_AREAS}"
if [ "${PHASE}" = "node" ]; then
  echo; echo "(--node — skipping the browser)"; echo; report_failures; exit 0
fi

# NO BROWSER WHEN NO PAGE IS UNDER TEST. Every area now has a page, so this only
# fires when the change touched nothing a page owns (docs, the version stamp).
case ",${AREAS}," in
  *,ngrc,*|*,flowsim,*|*,flexisim,*) ;;
  *) echo; echo "(no page in scope — skipping the browser)"; echo; report_failures; exit 0 ;;
esac

# Serve the repo and always clean up the server on exit.
python3 -m http.server "${PORT}" >/dev/null 2>&1 &
SRV=$!
trap 'kill "${SRV}" 2>/dev/null || true' EXIT
sleep 1

t env BASE_URL="http://127.0.0.1:${PORT}/" node test/smoke.mjs

# THE LAST WORD, so a browser pass cannot bury a Node failure collected an hour earlier.
report_failures
