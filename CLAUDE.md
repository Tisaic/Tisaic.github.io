# CLAUDE.md

Project context and working notes for `Tisaic.github.io`. This file is
rendered in-app by the **CLAUDE.md** button so the current state can be
reviewed from a phone.

## What this project is

A single-page static site hosted on **GitHub Pages** at
`https://tisaic.github.io`, used as a sandbox for a **browser-driven testing
workflow**: iterate on the page from Claude Code, view it in Android Chrome,
and feed console output back to Claude.

## Deploy model

- **Hosting:** GitHub Pages, served from the **`main`** branch, root.
- **Workflow:** changes are committed and pushed **directly to `main`** (the
  owner authorized skipping PRs/review for this repo).
- **`.nojekyll`** is present so Pages serves files as-is (no Jekyll
  processing), which lets the app fetch raw `.md` files at runtime.

## Verification (required before every push)

**No change ships unverified.** Before committing and pushing, every change
must be:

1. **Verified** — run the smoke test (`./test/run.sh`). It serves the repo the
   way Pages does and drives it in a mobile-emulated Chromium. All checks must
   pass (exit 0) with **zero uncaught page errors**. Static-parse the inline
   scripts too (the `node -e` vm check) so a syntax error can't ship.
2. **Scrutinized** — re-read the actual diff. Confirm nothing unintended was
   touched, no dead references were left behind, and the console bootstrap
   stays first and dependency-free.
3. **Visually analyzed** — open the screenshots in `test/screenshots/`
   (`01-home`, `02-console`, `03-docs`) and actually look at them. Layout,
   spacing, colors, and rendered content must look right on a phone-sized
   viewport, not just pass assertions.

If any step fails, fix it first — do not push. Run `stamp-version.sh` last so
the shipped commit carries the correct version.

### What `./test/run.sh` actually runs

`--quick` (the default) and `--full` choose the tier; anything pinning a CONTRACT runs in
both, and long sweeps, convergence studies and parity runs are `--full` only. Run `--full`
before pushing anything that touches a solver, a collision operator, a boundary or a
library default.

**It has TWO AXES, tier and half.** `--browser` runs only the browser checks and `--node`
only the Node ones; without either, both. A wiring or layout change cannot break a
golden-vector parity check or a Poiseuille profile, and re-running 450 Node checks to see
whether a button is reachable is 40 minutes that cannot produce information — which is
exactly how a suite becomes something to avoid rather than to run.

**It is FOCUSED by default.** `FOCUS` defaults to `flexisim`, so a plain run exercises the
FlexiSim area and nothing else. `--all` runs every area; `--only=ngrc,flowsim` selects
explicitly; `FOCUS= ./test/run.sh` clears the default. **Run `--all --full` before pushing
anything shared** — `lib/lattsim`, `lib/ngrc`, `console-boot.js` — or the areas that
depend on it are not being tested at all.

The tier split and the focus default drift, and drift silently, because a shorter suite
looks like a faster one. Both have been re-measured and cut before; the record is in
`docs/history/`.

## THE RULES

Each of these cost at least one defect that shipped, and several cost the same defect
three or four times in different costumes. They are the reason this file exists. The
measurement behind each is in `docs/history/` — the pointer in brackets.

### Verification

1. **Verify by the cheapest route that can actually falsify the claim.** Plain Node
   against the CPU reference (f64, seconds) → the browser on the CPU backend → the
   software adapter, only for shader compilation, CPU/GPU parity and WebGPU resource
   behaviour → a real device for anything involving a surface. When a check moves down
   that list, say what the lower tier can no longer see. [flowsim]
2. **A check too slow to be run is a verification problem, not an inconvenience.** Shrink
   it against the assertion's own margin, MEASURED not guessed — resolution is nearly
   always a cost knob and not a physics one — and say in the comment why that does not
   weaken it. [flowsim]
3. **A flaky check is a bug report, not a red line to tolerate.** A red suite hides the
   next real failure. Three times here an intermittent failure was a real defect.
4. **A failing check can be stale in EITHER direction** — the code got better, or the
   check froze one moment's number. Assert the PROPERTY against the machine's own
   reported limits, never a hard-coded ceiling. [flowsim]
5. **Assert geometry, not presence.** An element can exist, report "visible", and be off
   the screen. A canvas can be painted and show the wrong picture. A chart can be created
   at 700px inside a 388px box. Measure the box.
6. **The commonest defect class here is: no error, nothing blank, just the wrong
   picture.** Look at the screenshots every time. Where two views show one quantity,
   assert they AGREE — that is what proved the chart right and the stage wrong, and its
   absence is what let a 1.44x error in the chain's tool error survive.
7. **Neither Playwright's `pageerror` nor a console listener reports unhandled
   rejections.** Assert the page's OWN error buffer, and clear it on open: it is per
   ORIGIN, not per page. [flowsim]
8. **A conservation law that would still pass with the physics removed is not a check.**
   Remove the term and record the drift. [flexisim]
9. **Assert BOTH halves.** A one-sided claim that any weak version satisfies has no
   teeth: the learner wins where the hand model is wrong AND costs 30% where it is exact;
   the guard fires when it should AND not when it should not; the quiet detector
   terminates on a noisy machine AND refuses to call a still-settling one quiet.
10. **A rate beats an absolute number.** An absolute error can be a coincidence; a
    convergence rate cannot. Assert AT LEAST the order you can support. [flexisim]
11. **A test must drive the machine with the command it tells the model about.** The
    black box's flagship plant was handed a modulated reference and driven from an
    unmodulated one for months, so the anti-overfit protection was inactive and the
    headline was 28% too high. [flexisim]

### Measurement

12. **Read the meter after it settles.** Recorded six times: a mid-session fault two moves
    in, a dither sized from a changeover transient, a closed loop scored after one move
    instead of five, a "converged" cantilever, a compare table read a third full, a decay
    fitted from an unsettled start.
13. **A measurement taken across a transient describes the transient.** That applies to
    calibration and scoring windows exactly as much as to plant readings.
14. **A surprising measurement is a reason to check the instrument, not to celebrate.** A
    sign error in one truth function made two conclusions more interesting than the
    corrected ones, and both were written up before it was caught. [flexisim]
15. **Two wrongs that agree are indistinguishable from two rights.** A model and a
    baseline built on the same formula cannot check each other. Bring in a route that does
    not share the mistake: a cruder estimator, a conservation law, an independently
    derived matrix, a zero rung that measures the instrument itself.
16. **A number computed from the model cannot check the model.** Where a design and its
    own prediction agree with each other and disagree with the machine, put the question
    to the machine. Three separate black-box defects were caught only by deploying and
    measuring; the verify round now DECIDES rather than checks. [flexisim]
17. **The instrument fails before the model does.** Check the readout, the units, the
    frame and the window before the physics. A wrong unit is not a modelling limit, and an
    honest module will report one with complete confidence.
18. **A common factor across plants that share no physics is a property of the code.**
    Three plants under-recovering their gain by the same 0.61–0.70 is what made a centring
    bug findable. [flexisim]
19. **Match the metric's support to the claim's.** A global metric cannot see a local
    poke; a local reading can be right while the number cannot resolve it. [flowsim]
20. **Compare at matched capacity and matched age, not at matched wall clock.** Same
    feature count, same training samples, same instances, one variable.
21. **A fix that improves everything has usually changed the measurement.** The signature
    of a real repair is that the cases it should NOT touch come back byte-identical.
22. **A difference measured with a broken instrument is not a finding.** The chain's
    "architecture reversal" was two numbers a few percent apart from models that could see
    4.6% of the period they were being asked about. [flexisim]

### Instruments and reporting

23. **If the question cannot be answered from the picture, build the number.** "Is it
    settled?" is a residual. "Can the window see the mode?" is a reach against a measured
    period. "How far does it swing?" is a band on the stage.
24. **A physics number must not move when a VIEWING control moves.** Normalise per solver
    step; index charts by solver steps, never by frames; split the frame's step budget at
    sample boundaries.
25. **"Not measured" and "exactly zero" are different states.** Zero renders as "perfectly
    steady" when it means "no reading" — and as "perfectly smooth" when it means "never
    measured", which let a selection rule deploy no correction at all.
26. **Zero is a limit, not an absence.** Never use a meaningful value as a sentinel. Use
    `null`. [flexisim]
27. **Report the unflattering diagnostic FIRST.** A rescued run says `limited — N cells
    held` before any stability verdict; a module states what it predicts it will achieve
    before it deploys.
28. **Keep the permanent debug dump.** A score has at least four explanations and cannot
    tell them apart. Log the whole configuration on every build and a post-mortem on every
    failure, so a phone report can be a paste rather than a description.
29. **Draw a prediction where it is ABOUT, not where it was issued.** Otherwise a perfect
    forecast looks wrong and a lagging one looks right.
30. **A page that describes its own behaviour in a second place will eventually describe
    the behaviour it used to have.** Generate the description from the thing.

### Models and commissioning

31. **A constant right for one plant must be RE-DERIVED for another.** The ridge, the loop
    gain, the scoring window, the lattice damping, the settle wait, the dither size, the
    shaper, the ILC gain. Every one of these has been carried over and been wrong.
32. **A threshold or a prior must be scaled to the quantity it acts on, not weak or small
    in the abstract.** An absolute floor on |θ| pruned every term in lattice units; a
    prior at P0 = 1e-6 against a regressor of 0.06 never updated and read as a broken
    regression; an effort weight of 0.1 against a plant energy of 7.28 did nothing at all.
33. **Success at cancelling a disturbance removes the evidence of it.** Commissioning
    needs a deliberately UNSHAPED, undithered, HELD probe — and a probe is never scored as
    production.
34. **Commission a model in the configuration it will RUN in, and lock last.** A
    correction changes both the model's inputs and its target: one locked model scored
    0.032 under the mode it trained in and 1.225 under another, a 38x spread with the
    weights frozen. [flexisim]
35. **A soft sensor inside a loop is positive feedback** unless it was trained over the
    operating points the loop will occupy. Dither the correction during commissioning;
    ~8% of accuracy is the price of a loop that converges instead of running to its clamp.
36. **A model fitted to a repeating stream scores by learning where in the cycle it is.**
    Modulate the command at an incommensurate rate and report on held-out states. A
    735-feature map scored beautifully on a repeating command and R² = −6.93 on an
    aperiodic one.
37. **A lag window must REACH the period of what it has to see.** A rich basis cannot
    substitute for a window too short to carry the phase — measured twice, and both times
    LINEAR features with the right window beat a 544-feature map with the wrong one at a
    third of the cost. Report the reach against the measured mode.
38. **A frozen standardisation belongs to the stream it was frozen on.** Guard it with a
    relative floor, a clamp, and ROLLING recalibration — a guard that latches off after
    its first success answers only an unrepresentative startup.
39. **Decompose the error into BIAS and OSCILLATION.** Different mechanisms, different
    fixes, and one RMS hides both: a unit-sum convolution cannot move where a move ENDS,
    and a quasi-static correction cannot cancel a resonance. A loop needs the bias, and
    can only null what its instrument can resolve.
40. **Learn the parameters that have no closed form; compute the ones that do.** [ngrc]
41. **Directional forgetting has measured NEUTRAL five independent times here.** Default
    off.
42. **Selection: among the candidates within 5% of the best MEASURED score, take the
    cheapest — or the smoothest.** A weighted sum of two incommensurable quantities is a
    preference dressed as a result. The band belongs on the IMPROVEMENT, never on the
    residual, or "do nothing" falls inside it and wins on effort. Break exact ties on the
    next criterion, never on loop order.
43. **A better optimiser on a wrong model buys nothing.** 1.13x → 2.84x came entirely from
    fixing the identification with the optimiser untouched.
44. **A sub-task started once can fail; a sub-task restarted whenever its result is
    missing can only loop.** Every "if the result exists move on, else start it" needs a
    started-flag, or a failure becomes an infinite commissioning.
45. **Quiet is "it has not moved", not "it is moving slowly."** A per-sample rate test
    called a first-order settle quiet with 40% of the travel still to come. Measure the
    TRAVEL over a window, and seed the scale from the signal.

### Physics and geometry

46. **The boundary is where the SCHEME puts it, not where the loop bounds are** — half a
    cell out from the last cell centre. Pin it against the two plausible wrong
    alternatives.
47. **Every term of a projected quantity must be PROJECTED.** A joint-to-tool DISTANCE is
    not the lever for an error measured transverse to the last link: they agree at a
    straight pose, differ by a third folded, and have OPPOSITE SIGNS past a right angle.
48. **A bent link does not merely move its own tip, it TILTS everything downstream.** That
    term needs the tip SLOPE and is levered by the whole downstream reach; omitting it
    from the chain's tool error cost a factor of 1.44, more than both gearbox wind-ups
    combined.
49. **A sign convention is only free to change where every consumer is EVEN in it.** A
    ReLU basis downstream is not.
50. **Declare reads and writes; the solver refuses two operators writing one field in a
    stage.** Coupling must be stated, never implied by call order.

### Platform traps, each of which has bitten at least once

51. **Silence is a failure mode — refuse to build.** A WGSL reserved word made every
    shader fail to compile, asynchronously and without throwing, and the sim ran at full
    speed producing zeros.
52. **A more specific CSS rule wins only the properties it NAMES.** A host's
    `button { min-width:110px }` beat a bootstrap that never named min-width. And `hidden`
    is only a UA `display:none` — any class rule setting `display` beats it.
53. **WGSL `vec3<f32>` is size 12, align 16**, so an `f32` after one lands at offset 108,
    not 112. Write the offsets out, computed. Three times; only the parity check saw it.
54. **`Plotly.react` compares data BY REFERENCE** — arrays mutated in place are a no-op.
    Give every container an explicit height AND make it visible before drawing into it.
55. **A hidden canvas has no size, and 0/0 is NaN, which passes every bounds check.**
56. **Never destroy a buffer with a `mapAsync` in flight.** Teardown must be awaitable, a
    rebuild during a rebuild queued, and a frame's backend access guarded at ONE choke
    point.
57. **A rebuild that can throw needs `try/finally`**, or the busy flag stays set for ever
    and the tab is dead with the rejection invisible.
58. **A fix that makes state survive an operation makes every not-rebuilt dependency of
    that state reachable for the first time.**
59. **State what is NOT built, and the measurement that would change the answer** — a
    decision has to be falsifiable, not permanent.

## Key files

| File | Purpose |
|------|---------|
| `index.html` | The hub: header, debug console, doc viewers, launchers. |
| `console-boot.js` | The debug-console bootstrap, shared by every page, loaded first in `<head>`. |
| `flowsim.html` | FlowSim: the GPU lattice-field engine's page (Simulate / Verify / Architecture). |
| `ngrc.html` | NGRC playground: four interactive tabs on `lib/ngrc`. |
| `flexisim.html` | FlexiSim: compliant serial chains (Move / Chain / Path / Black box / Verify / Architecture). |
| `lib/lattsim/` | The lattice engine — lattice, fields, materials, operators, solver, backends, renderers. See its README. |
| `lib/lattsim/operators/` | `lbm.js` (D3Q19 fluid), `scalar.js` (passive scalar), `elastic.js` (velocity–stress leapfrog), `frame.js` (gravity and the non-inertial frame). |
| `lib/ngrc/` | The ported NGRC library. See its README. |
| `lib/probesense/` | Soft-sensing a field from one point in it. |
| `lib/flexisim/` | `joint.js`, `link.js`, `arm.js`, `arm2r.js`, `armnr.js`, `tipsensor.js`, `chainsensor.js`, `compliance.js`, `compensator.js`, and the contouring three — `toolpath.js`, `contour.js`, `pathilc.js`. |
| `lib/blackbox/` | `blackbox.js` (identify → design → verify → correct) and `qp.js` (the box-constrained preview solve). Imports nothing from `lib/flexisim/`. |
| `version.json` | Server-side build manifest for stale-page detection. |
| `modules.json` | Generated list of every script, so `reloadFresh()` can bust the ES-module cache. |
| `docs-manifest.json` | Generated list of every `.md`, for the Docs viewer. |
| `stamp-version.sh` | Pre-commit build step: stamps the version and regenerates both manifests. |
| `vendor/` | Self-hosted marked, three.js and Plotly. No CDNs. |
| `test/run.sh` | The suite. See "What `./test/run.sh` actually runs" above. `--browser` / `--node` select which HALF runs — a wiring change cannot break a golden vector, and charging it 450 Node checks is what makes a suite something to avoid. |
| `test/smoke.mjs` | Playwright checks and screenshots for every page. |
| `test/lattsim/` | Node tests for the engine: stencil, indexing, units, conservation, Poiseuille, EOS, scalar, elastic, reconstruction. |
| `test/flexisim/composite.test.mjs` | **The composite: cascade(2) + harmonic feedforward, 30.02× over a conventional machine.** Also pins the two failing orders and the clean-operator requirement. |
| `test/flexisim/harmonic.test.mjs` | World-frame harmonic feedforward, and the path-normal frame that measures 0.99× on the same solve. |
| `test/flexisim/` | Node tests for the hybrid plant: joint, arm, 2R, N-R, sensors, compliance, compensation, ServoFF, the learned filter, and contouring (`toolpath`, `pathilc`, `contour`). |
| `test/blackbox/` | Node tests for the plant-agnostic controller, on three plants that share no physics. |
| `test/pilot/` | Full-tier files here SKIP and exit 0 without `SUITE=full` — that hole let a gate regression ship for three bricks. Node tests for the pilot on six plants that share no physics: the 2R arm, a quadruple tank, a three-zone extruder barrel, the Wood–Berry column, a cold mill AGC, and the EMPS servo axis (real data). |
| `docs/history/` | The measurement record — see the last section. |
| `CLAUDE.md` | This file. |

## Current state

Everything below is what is TRUE NOW. How each of it got here — the measurements, the
wrong turns, the numbers behind every claim — is in `docs/history/`, which the Docs
viewer renders like any other markdown in the repo.

### The shared platform

**`index.html`** — the hub: header, debug console, docs viewer, and launchers for
`NGRC`, `FLOW`, `FLEX` and `DOCS`.

**Debug console** (`console-boot.js`, shared by every page, loaded FIRST in `<head>`,
dependency-free). Captures `console.*`, uncaught errors with stack and file:line, and
unhandled rejections; persists to localStorage so a white-screen crash is recoverable;
badge counts errors and warnings; Copy all, Clear, a live JS eval box, a build line. It
injects its UI into the HOST page, so it states its own geometry rather than inheriting
one (rule 52). The buffer is per ORIGIN, not per page.

**Stale-page detection.** On load `version.json` is fetched `no-store`; a newer server
build raises a red banner. `reloadFresh()` re-fetches every script in the generated
`modules.json` with `{cache:"reload"}` before reloading, because a `?v=` on the document
does not reach `import './x.js'`. An uncaught error matching the browser's wording for a
module-export mismatch raises the banner itself.

**Docs viewer.** Renders every `.md` in `docs-manifest.json` with self-hosted marked.
Directory selector; ◆ CLAUDE context vs Docs; opens `CLAUDE.md` by default.

### FlowSim — `flowsim.html` on `lib/lattsim/`

A GPU lattice-field physics engine. The lattice is the physical representation: no
particles, and a moving mass is a pattern in the density and momentum fields transported
between neighbouring cells.

- **Architecture.** Simulation → Lattice / Fields / Materials / PhysicsOperators /
  Boundaries / Solver / Backends. Indexing `x + Nx·(y + Ny·z)` everywhere; fields
  structure-of-arrays; anything advanced in time is double-buffered.
- **Two backends.** WGSL compute shaders in production; a CPU reference implementing the
  same equations from the same constants (`d3q19.js` is the single source of truth and the
  WGSL is GENERATED from it). The reference runs the analytic checks in Node, serves the
  page where WebGPU is absent, and is compared cell-by-cell against the GPU where one
  exists.
- **One collision configuration ships:** TRT with ω⁻ pinned for stability, plus the
  Smagorinsky sub-grid model. BGK and TRT-at-Λ=3/16 stay in the LIBRARY because the
  analytic verification needs both.
- **The run cannot crash.** Density clamped away from zero, velocity clamped at 0.35, and
  any population still non-finite replaced by the equilibrium at the sanitised moments —
  so a NaN is caught in the cell where it appears and never streams. The reduction counts
  clamped cells and the verdict reads `limited — N cell(s) held` BEFORE any stability
  verdict.
- **Operators.** `lbm.js` (D3Q19 fluid, Guo forcing, `stir()`, an EOS pressure force with
  a selectable effective sound speed), `scalar.js` (passive scalar, one-way coupled),
  `elastic.js` + `frame.js` (see FlexiSim).
- **Tabs.** *Simulate* — channel+obstacle (cylinder or sphere), Poiseuille, lid-driven
  cavity, dye; resolution clamped to the device's reported binding limit, τ 0.5001–2.5,
  inlet speed 0.005–0.35, wall speed, lid frequency, steps/frame, slice controls; 2D slice
  on any backend, raymarched volume on WebGPU; live mass, momentum, density range, max|u|,
  MLUPS, per-step residual, Re, Re_cell against the per-model ceiling, and a named
  verdict. Dragging the slice stirs the fluid. *Verify* — the analytic checks in-browser
  against the live backend. *Architecture* — the design note.
- **Probe and chart.** One cell over time, a 16-byte readback, charted in SOLVER STEPS.
- **Soft sensor.** Two points on one lattice: the probe is the sensor, a second marker the
  target, with an optional second sensor. Lifecycle idle → calibrating → training →
  estimating/locked; frozen standardisation with a relative floor, a clamp and rolling
  recalibration; `steadyTarget` reported instead of a meaningless ratio.
- **Field reconstruction** on the dye scene: wall sensors reading velocity and pressure
  only rebuild the whole concentration slice through one shared-covariance model.

### NGRC playground — `ngrc.html` on `lib/ngrc/`

Four tabs, each framed as NGRC against a common alternative.

- **① Chaotic systems.** Seven systems with per-system dt, measured λ_max, embedding, poly
  order and ridge. Four models learn from one stream — NGRC, an ESN, an MLP, a linear ARX
  — then Dream free-runs all four while reality keeps running. Valid time in Lyapunov
  times with a phase-tolerant threshold; a 250-sample washout gates training and a
  5-sample re-entry washout runs on wake. Noise slider, speed slider, batch mode,
  pause/resume, manual training lifecycle, and an Experiment summary under a black-box
  contract (baselines and protocol fully specified, NGRC's internals withheld and stated
  as withheld; a leak audit greps the text).
- **② Soft sensor.** A deliberately nonlinear motor/load plant — Stribeck friction,
  backlash, a hardening spring, cogging, encoder quantisation, with plant-health counters
  asserted so it cannot be silently linearised. Baselines: an exact Kalman filter, an
  engineering Kalman filter, the algebraic shortcut, PLS frozen and adaptive, persistence.
  A manual-mode bit is a fifth signal. A +1 s preview is a second target of the same
  block, gated at 2500 trained pairs.
- **③ Finger trace.** Amber NGRC ghost against a k-NN analogue, an ESN, an MLP and a raw
  AFM trace; a 25-rung direct-multi-horizon ladder behind a 0.2–20 s slider; path-lock
  after ~8 s; multi-stroke doodles with pen lifts first-class; autopilot; freeze.
- **④ Anti-slosh axis.** Six machines on the same command, each differing from the one
  above by exactly one thing. One off-centre gauge is the only liquid instrument. Health
  check runs an UNSHAPED probe, queued to a move boundary and followed by a settling
  dwell, feeding a vote-of-three fault panel with independent threshold tests.

### FlexiSim — `flexisim.html` on `lib/flexisim/` + `lib/lattsim/` + `lib/blackbox/`

Compliant serial chains. Joints are LUMPED nonlinear elements (gearbox stiffness,
backlash, Stribeck friction, ratio, motor inertia); LINKS are lattice elastic solids, one
small dense lattice per link in its own body frame. Every mass property is INTEGRATED
FROM THE LATTICE. Six tabs. **The end application is CNC contouring, so ③ Path is the tab
that matches it** — the point-to-point tabs measure a different question.

- **① Move** — a single-joint hybrid arm. Commissioning runs inside the frame loop (pose
  holds, then a deliberately excited decay). Four correction modes: ① open loop, ② the
  identified compliance evaluated at the COMMAND with a lead of one servo time constant,
  ③ a closed loop on the soft sensor's estimate, ④ a learned dynamic filter fitted to an
  iteratively refined per-phase correction across three bracketing moves. Plus a measured
  ZVD shaper, a boxcar jerk limit, a SETTLE dwell in periods of the measured ring, a drive
  rating giving torque, acceleration and speed limits from one torque-speed curve, and a
  labelled deflection magnification. **Compare** scores every mode over its own settled
  window; **Auto-tune** runs the sequence and LOCKS THE SENSOR LAST, under the correction
  actually selected. The stage draws program and encoder at true scale and the tool
  magnified against the program, inside a sweep band.
- **② Chain** — a 2R chain with computed torque evaluated at the commanded pose. The
  coupling chart splits the elbow's inertial load into the shoulder's doing and its own.
  Link 2 hangs off link 1's DRAWN tip, position and slope. Its reference is
  amplitude-modulated at the golden ratio; the scoring window is three move periods and
  the loop gain is derived from the move period. Two tool sensors — whole-arm and
  elbow-only — trained side by side at matched capacity and matched window reach.
- **③ Path** — CONTOURING, which is what the end application is: a 2R arm tracing a
  closed toolpath (circle, rounded rectangle or square) at a look-ahead feedrate profile
  with the corner rule and the acceleration ELLIPSE. The deviation is split into CONTOUR
  error (normal — the part is the wrong shape) and LAG (along — the part is right and the
  cycle is slower), and only the first is a defect; energy is reported as BOTH copper loss
  ∫τ² and mechanical work ∫|τω|, and direction changes are counted as TRAVEL past the
  joint's own lost motion. Backlash is on here and nowhere else, because this is the only
  tab whose metrics can see it. Four corrections: ① none, ② the wind-up model τ/K, ③ a
  per-joint compliance identified on ONE SLOW LAP and then locked, ④ ITERATIVE LEARNING —
  a correction table indexed by arc length on the part, updated between laps with a lead
  of one position-loop time constant and a zero-phase filter, ⑤ THE PILOT (`lib/pilot/`) —
  commissioned once from noise by one button, deploys only if its own verify round
  measured an improvement on the machine, then cuts programs it has never seen (6.2× on
  the rectangle — BELOW ILC's fourteen-lap converged figure, first part, fewer reversals,
  36% less copper — 7.0× on the circle). The pilot does not even need the KINEMATICS:
  fed only held tracker points during commissioning it fits the direct inverse
  (x,y)→commands itself (1.2e-4 rad holdout from 180 points), and holding real path
  points that learned map beats the analytic ik() 23–44× statically — the analytic
  kinematics commands the drawing, the learned map commands the machine, droop and
  wind-up included (brick 40; `test/pilot/ikfree.test.mjs`). That system ships as
  ⑥ FULLY LEARNED (Commission ⑥: gather held points → fit the inverse → pilot on top,
  refs from the learned map, same refusal shape as ⑤) and ⑦ FULLY LEARNED + ILC (a
  separate PathILC on the learned chain, tool error mapped through the learned routing):
  measured circle 5.9e-2 → 1.14e-3 by lap 14 (within 28% of the analytic ILC@15) and
  rectangle → 1.27e-2, twice BELOW the analytic ILC's converged 2.53e-2 (brick 41).
  ⑤+④ stacks the same table on the ANALYTIC pilot (circle 1.03e-3, rectangle 1.30e-2
  by lap 14) — and beside ⑦ that is the finding: iteration erases the difference
  between knowing the kinematics and having learned them (brick 42). At the softest
  compliance sliders two more lessons shipped (brick 44): ⑥'s gather settles until the
  tracker is QUIET rather than for a fixed count, its truth routing is an AFFINE
  observer — G(cmd)·(tool − fwd(cmd)), both learned halves evaluated at the command,
  because a nonlinear map of the fast variable breaks the LTI-ness the QP needs
  (verify 0.48× → 5.02× at K 0.25/E 0.03) — and every ILC table carries a MONOTONE
  SAFEGUARD (backoff, settling dwell, freeze after 3) whose measured endpoint is
  exactly the continuous open loop: a soft gearbox's table pumped to 5.25 unguarded.
  THE PILOT'S FORECAST BASIS IS NOW SELECTED PER CHANNEL, NOT DECIDED (brick 54). It
  was linear "by measurement" — but the measurement was ONE plant. The fit is now offered
  a quadratic block under the AFM's STRUCTURED PRIOR (ridged 100× harder than the linear
  one, so it must earn its weights) and picks on held-out data. THE SELECTION TRACKS THE
  PHYSICS: the quadruple tank (outflow ~ √h) and the extruder barrel (radiates as T⁴)
  accept curvature where their excitation exposes it; the Wood–Berry column — linear
  transfer functions and nothing else — declines it on both loops, which is the negative
  control; the mill, the EMPS axis and BOTH arm channels stay linear, so the original note
  was right about the arm and wrong to be generalised. THE TIE-BREAK IS ON THE RESIDUAL:
  on R² the tank's 0.9818 against 0.9661 sits inside any 5% band, while the unexplained
  variance it leaves is 0.0182 against 0.0339 — nearly halved — and a forecast the QP
  inverts is worth what its residual is worth. It overturned a shipped finding: brick 48's
  "a dwelling excitation beats a sweeping one on a dwelling plant" was reading a linear
  basis, and with curvature available the sweeping excitation selects it and goes
  1.11× → **2.07×** against the dwelling one's unchanged 1.32×. The dwell advantage was
  compensating for a basis that could not represent the plant.
  **WHERE THE PILOT STANDS ACROSS SIX PLANTS THAT SHARE NO PHYSICS**, which is the only
  honest way to state an agnosticism claim: the 2R arm 5.96× / 6.91×; a quadruple tank
  1.32×, with its non-minimum-phase configuration — and its non-dwelling model — correctly REFUSED; a three-zone
  extruder barrel refused — at 0.86×, and brick 55 found it had NEVER BEEN SCORED
  before that: it declares a dwelling program, a dwelling scribble cannot cross its
  44 K box at the verify's quarter rates, so the verify threw and the refusal was a
  construction failure wearing a rate-limit message. The verify now scores whichever
  regimes BUILD and reports what it skipped; the Wood–Berry column LOST (72.08 against the
  published BLT's 51.95); a cold mill AGC refused (0.42×); and the **EMPS servo axis**
  — a real machine, real data, `test/pilot/emps.test.mjs` — 4.8×, which is FOURTH OF SIX
  controllers on that page. The rig is validated twice against the hardware (our IDIM-LS
  recovers the published M/Fv/Fc/OF to 0.8%; the closed loop reproduces the recorded
  encoder to 1.6 µm rms and the recorded tracking error to 0.03%), and on it a velocity
  feedforward is worth 15.2×, a hand-tuned ILC 119× and an inverse-dynamics feedforward
  at the published parameters 275×. **The reason is the plant, not a defect** — that
  machine has a four-parameter closed form and its authors published it, which is the
  anti-slosh tab's rule from the other side: learn the parameters with no closed form,
  compute the ones that have one.
  TWO DEFECTS CAME OUT OF IT AND BOTH ARE NOW FIXED (brick 53), because they were one
  piece of work. **THE GATE SCORED ONE REGIME AND IT WAS THE WRONG ONE.** The verify's
  filtered noise has a single correlation time tuned to the first limit that binds — and
  since the builder demands an 85% traverse of the position box, that is always VELOCITY,
  so the corner lands near box/vMax: measured on EMPS, 7303 steps, longer than a whole
  6240-step lap of the machine's own program, using 78.5% of its velocity but 9.2% of
  acceleration and 3.1% of jerk against the program's 99.7% / 100.9%. The verify now also
  runs a **PROGRAM regime** (`buildProgram`) — trapezoid moves separated by dwells, whose
  ramp comes from the LIMITS alone (1.875·vMax/aMax, and √(5.774·vMax/jMax)), giving 282
  steps against the machine program's 148 — and (brick 56) **the PROGRAM regime decides the benefit at 1.1x while the other holds a
  veto only below 0.85x** — gating on the worse outright refused the arm's learned-IK
  system (scribble 0.89x / program 3.14x) which, forced, converges ⑦ to 1.7e-3, while
  program-only would deploy the non-minimum-phase tank (0.33x / 1.20x) that was measured
  DELIVERING 0.61x. A scribble is a stress regime the machine never runs: a poor score
  there is narrowness, a bad one is danger, and only the second may veto. An earlier guess said to size the verify from the plant's settling time; the
  measurement says the ramp is a property of the limits, not of the plant.
  With the gate honest, **the 200-step cadence floor could go** (now 8): the probe had
  measured this machine's rise correctly at 17 and had it replaced by a placeholder no
  plant had ever been fast enough to trip, and EMPS ships at **12.70× instead of 4.79×**
  with no change to the controller. The two had to move together — at every floor that
  helps, the OLD gate refused.
  **THE VERDICTS THAT MATTER FLIPPED THE RIGHT WAY.** On the same axis with its own
  feedforward on: velocity FF, gate 3.74× → **0.96×, REFUSED** (it used to deploy for a
  1.10× it had not earned); inverse-dynamics FF, gate 2.03× → **0.05×, REFUSED** (it used
  to deploy a correction that measured 0.23×, i.e. four times WORSE). Wood–Berry's
  overstatement fell 8× → 2.9×, the non-dwelling tank is now correctly refused, and the
  arm's flagship numbers are unchanged (5.96× / 6.87×) — **the controllers did not move,
  only the estimates of them**, which is the signature that says the gate was repaired
  rather than the measurement changed.
  THREE BUGS SURFACED ON THE WAY, all invisible until two regimes ran back to back: the
  verify's run-out sat at the END of the plan INSIDE segment 0, so every plant's OFF
  average was deflated by the approach ramp; the segment map was off by that pad once two
  halves existed; and the guard derated the RATE LIMITS but not the BOX, so a derated
  machine was asked to traverse the same span in the same time and `buildExcitation`
  refused — which only showed once the corrected cadence made the dither fast enough to
  trip the guard twice.
  STILL WRONG, STATED RATHER THAN ABSORBED: the gate's ORDERING is still inverted (the
  estimate falls as the delivered benefit rises), and on EMPS the error changed SIGN — it
  now UNDERSTATES 9× (1.35× against 12.70× delivered) and clears its own 1.1× threshold
  by a quarter on a controller worth twelve. Hypothesis, untested: both regimes run at
  QUARTER rates while the machine's program runs at its limits, and this pilot's benefit
  here is the velocity-lag term q̇/kp, which scales with speed.
  **AND THE CEILING IS THE MODEL'S RESIDUAL, MEASURED (brick 55).** The scribble-fitted
  forecast scores R² 0.9957 on PROGRAM data (0.9908 on the scribble it was fitted to,
  0.9976 refitted on the program), so there is no distribution mismatch — and
  √(1−0.9957) = 6.6% of the truth's rms is 0.038 mm against 0.045 mm delivered. **The
  pilot is AT its forecast bound**; the QP, the cap and the horizon are not the
  constraint. Reaching the ILC's 0.0046 mm needs R² 0.99994, sixty times less residual
  variance, which a lag-window linear forecast will not reach. Folding a phase-indexed
  residual on top of the deployed pilot measures **12.7× → 125×** — and converges to the
  same floor as ILC alone, so the model buys LAP ZERO (0.049 against 0.576) and four laps
  of head start, not a better endpoint. Model error here is ~40 µm and lap-to-lap
  repeatability is 0.3 µm: a factor of 130 between predicting the error and REMEMBERING
  it. Two avenues were closed on the way — identifying on a program instead of a scribble
  is far worse (12.70× → 3.93×, since repeated trapezoids are collinear), and the mill's
  forecast is destroyed by its own fit target (`eFree` rms is **4.16×** the truth's there,
  against 0.96–1.08 on every other plant; against the raw truth the same design matrix
  reaches R² 0.73 instead of 0.05).
  **A CASCADE IS THE WAY PAST THE FORECAST BOUND (brick 56).** `lib/pilot/stack.js`
  commissions ordinary pilots in sequence, each with the layers below it deployed and
  FROZEN, so layer k's plant is (machine + layers 1..k−1) and each measures its own
  timescale on it. EMPS, mm rms by depth: trapezoid 0.5764 → 0.0454 → 0.0258 → **0.0194
  (29.8×)**; a two-tone sine it has NEVER SEEN 0.3634 → 0.0439 → 0.0248 → **0.0140
  (26.0×)**. The second row is the point — a phase-indexed ILC table reaches 125× on the
  program it learned and **0.55× on that same sine, i.e. worse than nothing** — the
  cascade transfers because every layer is a plant model rather than a memory. Per-layer
  forecasts on what reached them: R² 0.991 → 0.777 → 0.514, each vouching for itself
  (1.35× / 1.54× / 1.70×), and layer 2 chose a LONGER horizon than layer 1 (N 95 vs 68)
  by itself. A layer that cannot vouch ends the stack; the summed correction is clamped
  once at the engineer's cap; the cost is commissioning time multiplied (70 s a layer
  here, 62 h a layer on the barrel).
  TWO OTHER THINGS WERE TRIED AND ONE IS A NULL. **Feeding the correction `u` and the
  ERROR back in as regressors does nothing** — unchanged on EMPS, WORSE on the tank
  (0.861 → 0.795) — because `truth = measured − fwd(command)` and both are already in the
  row, so lagged truth is already spanned. And the WINDOW LENGTH is now tuned rather than
  the constant 12, but it **earns its place on one plant of six** (24 taps on the mill):
  a joint window/ridge search picks the looser ridge, which is a better held-out fit
  (0.99305 vs 0.98931) and a WORSE machine (12.7× → 10.2×). **The QP inverts this model,
  so regularisation serves the inversion, not the fit** — which is why the basis choice
  compares residuals and the ridge choice deliberately does not.
  **THE RESIDUAL CASCADE IS NOW REACHABLE — a Cascade depth slider (1–3) serving BOTH ⑤ and
  ⑥ (brick 59).** It had been built and measured in brick 56 and connected to nothing a
  person can click, which is the whole reason the page's numbers had not moved. Wiring it
  found a defect only a cascade can have: each layer derives its own cadence from its own
  measured Ts, but the host builds ONE look-ahead closure, so an upper layer's whole horizon
  was registered at someone else's stride. Pinned, at the SOFTEST sliders and feed 0.004:
  open 1.205 → depth 1 **0.1875 (6.43×)** → depth 2 **0.0987 (12.21×)**, layer 2 vouching
  for itself at 2.07× with held-out R² 0.440/0.571 on what layer 1 left. Depth costs
  commissioning time multiplied, and each layer reports separately so a layer that measured
  nothing is visible rather than averaged away.
  **AND IT DOES NOT RESCUE ⑥ — IT HARMS IT, which is the more useful half.** ⑥ depth 1
  3.40× → depth 2 **2.93×** on 3.1× the copper, with layer 2 VERIFYING at 1.85×, better
  than layer 1's 1.70×. Its readouts say why: R² [0.848, **−0.117**] — the elbow forecast
  is negative at lead 0, so it is gated, and what deploys is a ONE-CHANNEL correction on a
  COUPLED arm, which is not a smaller correction but one in a direction the QP never chose.
  **NOTHING ON THIS TAB REFUSES ANY MORE** — the owner's instruction, and it immediately
  refuted the explanation above. Three refusals were live: the deploy gate, the FORECAST
  gate (`R²(lead 0) < 0.2` SILENTLY zeroed a channel), and a stack admission rule. All
  three are now measured and reported (`wouldRefuse`, `wouldGate`, a `partial` note) and
  never enforced here; they stay library options at their old defaults, so every plant
  under test keeps its contract. Arming ⑥'s negative-R² elbow makes the machine BETTER —
  2.93× → **3.18×**, layer 2's own verify 1.85× → 2.20× — so the gate was costing a quarter
  of a factor by declining to act. But the fully armed layer still LOSES to not stacking at
  all (3.18× against depth 1's 3.40×): partiality was a second-order cost, not the cause.
  What an unforecastable channel marks is a layer with nothing left to model. ⑤ depth 2 came
  back BYTE-IDENTICAL at 12.21× with the gate off, which is the control (rule 21). A refusal
  on this tab now means only "there is nothing to deploy" — the excitation would not build,
  or the guards tripped three times.
  **THE CONTOUR ERROR IS NOW SPLIT INTO BIAS AND OSCILLATION** (`contourBias`,
  `contourOsc`), because rule 39 had no instrument behind it on the one tab that contours.
  It settled ⑥ against ⑤ in a single reading: both start with the same error (⑤ bias −0.626
  / osc 1.030, ⑥ −0.666 / 0.918), and ⑤ removes **97.9%** of the bias where ⑥ removes
  **73.4%** — ⑥ leaves THIRTEEN TIMES the bias, on a forecast as good as ⑤'s (R²
  0.971/0.758 against 0.968/0.792). ⑥'s deficit is DC AUTHORITY, not dynamics; two other
  explanations were measured and killed first (the maps' round trip disagrees by 5.1e-3
  against a 0.33 contour, and the learned lever matches the true inverse Jacobian to a gain
  ratio of 1.0072). **BUILT, MEASURED, AND DEAD — and the null is worth more than the fix
  would have been.** The QP trusted every lead of its horizon equally while ⑥'s elbow
  forecast reaches r2Far **−0.035**, worse than predicting the mean. `boxQP` now takes an
  optional per-lead weight on the tracking residual (Lipschitz bound sees it; omitted, the
  golden vectors are untouched) and the pilot derives them from held-out validation,
  NORMALISED to mean 1 so the change moves where trust sits rather than doubling as an
  effort increase. Measured on ONE commissioned model deployed twice: ⑤ 6.43× → 6.48×
  (0.8%), ⑥ 3.40× → **3.40×, identical to four significant figures**. The weights are not
  inert — ⑥'s far-lead weight is exactly 0.00 and `uPk` nearly DOUBLED, 0.397 → 0.736 — so
  the solver responded substantially and the machine did not care. **THE QP IS NOT THE
  BINDING CONSTRAINT:** a receding horizon only ever applies its FIRST move and re-solves,
  so the far leads shape it far less than the argument assumed. Ships opt-in and OFF
  (`leadTrust`). **⑥'s RESIDUAL BIAS IS EXPLAINED, and it is a design property rather
  than a defect.** The pilot's truth is `tool − anchor(cmd)`, so the ANCHOR is where the
  loop is AIMED; put it through the same signed-normal decomposition as the tool and aim
  separates from delivery. ⑤ aims exact to DOUBLE PRECISION (−4.4e-18, the control, since
  `fk(cmd)` is on the program by construction); **⑥ aims at 9.2e-5, nineteen hundred times
  smaller than the −0.177 it leaves — ROUTING IS EXCLUDED, it aims right and does not get
  there.** Swapping ⑥'s anchor to the rigid `fk` (mode ⑦) VERIFIED 2.61×/5.84× — matching
  ⑤ — and DELIVERED 0.647, worse than ⑥'s 0.334: the anchor became `fk(predict(x,y))`, the
  rigid position of a droop-compensated command, so a perfect ⑦ lands 0.252 off and the
  verify measured truth reduction against a mis-aimed truth. One code change, two physical
  changes; the aim instrument caught the flaw in the experiment that followed it. What
  survives is the DELIVERY GAP, the column the confound cannot touch: **0.334 → 0.257, a
  23% gain from giving the truth its DC back.** THE DROOP MUST BE CARRIED BY THE REFERENCE
  OR BY THE CORRECTION, AND WHICHEVER CARRIES IT THE OTHER IS DC-FREE — ⑥ puts it in the
  reference (`predict` is fitted to SETTLED poses), so its pilot trains on a DC-free signal,
  and making the anchor DC-rich moves the aim by exactly the droop because they are one
  quantity appearing twice. Hence ⑥'s open loop is BETTER (1.135 vs 1.205) and its
  corrected loop worse. **A droop carried by the CORRECTION is re-measured at speed every
  step; one carried by the REFERENCE is frozen at whatever the static gather saw.**
  **⑧ THE STACK — the conventional machine and the pilot together, switchable live
  (brick 61), and the arc that finally put every number on ONE DENOMINATOR.**
  `test/flexisim/reconcile.test.mjs` runs one plant, one path and one baseline that is a
  machine an engineer would actually ship — computed torque + PD + `RobotComp`'s identified
  compliance — and measures: conventional **4.396e-1**, + pilot **7.715e-2 (5.70×, uPk
  0.3186)**, + tipcomp 4.388e-1 (1.00×), + live trim 5.446e-1 (0.81×). **5.70× is LARGER
  than the 4.22× the pilot scored against a bare loop**, which is the number this project
  could not quote before, and the two rows under it are the estimation/control split in one
  table: both are driven by a LIVE error reading and neither helps. `uPk` is in the table
  because **`act()` returns zeros when `!verdict.deploy`**, so a pilot that REFUSED and one
  that deployed and did not help print an identical 1.00×.
  **COMMISSION OVER AN ENVELOPE, NOT OVER A PATH:** one trajectory transfers at **73× worse**
  at the worst point, five at **2.04×** (`transfer.test.mjs`, `ONE_PATH=1` reproduces it) —
  the third independent time this project has reached "a calibration must span the range it
  will be used over". And **the pilot's CLOCK was a QP constant nobody re-measured**:
  `decisionsPerTs` 30 → 60 is worth 4.62→5.19× sharp, 6.43→8.02× rounded, 12.99→14.16×
  circle, but **only with λ scaled as (DPT/30)²**, since the QP's `D` differences DECISION
  steps. Measured on the arm only; the other five plants still default 30.
  **THREE DEFECTS IN ⑧ AND THE OWNER FOUND ALL THREE.** (1) The first version contained
  NEITHER half — zero occurrences of the pilot, `TipCompensator` in comments only — and every
  check passed, because they asserted wiring that was genuinely there. (2) It DOUBLE-
  CORRECTED: the page commissioned the pilot BARE, so it already held the compliance term and
  ticking both boxes applied that part twice (*"the mode 5 looks better than 8"*). Fixed by
  an opt-in `commission OVER` flag, **default off** — making it unconditional regressed ⑤'s
  own gate to 3.9e-2 against a 3.5e-2 bar, and the casualty was ⑤, not the idea. (3) **THE
  PAGE COULD NOT REACH THE MACHINE THE NUMBER LIVES ON** (*"the point is to demonstrate the
  5.7 this misses it"*): the tab DEFAULTS to K 16 / E 0.15, the stiff end of both ladders,
  where the conventional machine alone already leaves 5.7e-2 against the 4.4e-1 it leaves at
  K 1 / E 0.06 — **the whole error the stack exists to remove has already gone before ⑧ is
  switched on** — and the report was taken on the SQUARE, which is not the program the 5.70×
  is measured on. Everything else already matched (feed 4e-3, accel 4e-5, corner 40 and the
  rounded rectangle are the page's own defaults, byte-identical to the test), so the gap was
  two sliders and a checkbox and it is now **one button**, every value read off the test
  rather than chosen. TWO DIFFERENCES REMAIN, STATED RATHER THAN TUNED AWAY: this tab works
  about (12, 0) rather than (14, 1) and carries backlash, which the test does not.
  **AND THEN ⑧ WAS BROKEN OUTRIGHT, BY A CLAMP THAT BELONGED TO A DIFFERENT CORRECTION.**
  The stack branch returned `[clampDq(d0), clampDq(d1)]` over the SUM. `DQ_CLAMP` is 0.05 rad
  and its own comment says it is "on the quasi-static corrections"; the pilot carries its own
  `uMax`, 2.0 rad here — FORTY TIMES larger, measured peak 0.31 — so ⑧ ran the pilot at about
  a sixth of its authority. Measured on the page, same pilot, same machine: ⑧'s pilot half
  9.601e-1 against ⑤'s 3.901e-1, and ⑧ both **8.379e-1 → 1.310e-1**, i.e. 1.45× → **9.54×**
  over the open loop and **7.4× over the conventional machine** — past the test's 5.70×/6.02×,
  as it always should have been, since it is the same library on the same machine.
  **EVERY WIRING CHECK PASSED THROUGHOUT**, because they asserted each toggle CHANGED the
  applied correction and an amputated half still changes it. Three checks now pin that ⑧'s
  compliance half IS ③ and its pilot half IS ⑤, bit for bit on `__flxStackProbe`, and that ⑧
  is their SUM (rule 6). TWO OTHER EXPLANATIONS WERE KILLED FIRST: `reconcile.test.mjs` run on
  the page's EXACT machine — drive limits, backlash, centre (12,0) — gives 6.02×, so the plant
  differences were not it; nor the page's torque guards (byte-identical with them on) nor its
  clock (DPT 60 measures 6.21× against 30's 6.02×). **STILL UNEXPLAINED AND STATED:** the
  page's ③ leaves 1.052 where the test's conventional leaves 0.412 — a per-joint SCALAR from
  one traced lap against `RobotComp`'s 2×2 from four held poses, and 2.5× between them that
  nobody has measured.
  **AND THE SUITE'S COST WAS MINE.** Every wiring change in this arc was verified with
  `--only=flexisim --full`, re-running 450 Node checks that a button's reachability cannot
  break. `--browser` and `--node` now select the half; the Node blocks are all gated on
  `AREAS`, so emptying it for their half is the whole implementation. 50 minutes → 12.
  **AND I ASSERTED PERFORMANCE IN THE BROWSER AND IT FAILED** — ⑧ 6.603e-2 against
  compliance-only 5.671e-2 — for the stiff-default reason above and nothing to do with the
  stack. Performance belongs in plain Node where the plant is STATED; the browser's job is
  what only the browser can break, which is the wiring.
  **THE COMPOSITE — A CASCADE OF PILOTS WITH HARMONIC FEEDFORWARD ON TOP, 30.02× (brick 63),
  and the owner's physics is what found it.** The arm is not ringing at corners, it is
  SPRING-LOADED: the deflection depends on geometry, inertia, gravity and direction of travel,
  and it is lap-correlated only because a closed program revisits the same poses in the same
  order. One plant, one program, one conventional baseline (4.122e-1): pilot alone 6.23×, HFF
  alone 8.86×, pilot + HFF **16.93×**, **cascade(2) + HFF 1.373e-2 = 30.02×** — drive peak 30%
  of `tauMax` with ZERO saturations, correction peak 0.381 rad, machine still repeating, all
  four asserted. `test/flexisim/composite.test.mjs`.
  **THE ORDER IS NOT SYMMETRIC.** The pilot commissions on a program-agnostic SCRIBBLE; an HFF
  table is indexed by LAP PHASE. Commissioning the pilot OVER HFF applies a phase-indexed
  correction to a machine that is not on the path and measures **0.71×, worse than the double
  correction it was meant to fix**. Two feedforwards do not add when one knows the program and
  the other deliberately does not. **AND THE OPERATOR MUST COME FROM THE CLEAN MACHINE:**
  re-probing with the pilot active cannot be clean at any amplitude (it is a box-constrained QP
  that REACTS to the probe), and using the conventional machine's operator instead is worth
  11.27× → 16.93×.
  **THE ACTUAL TORQUE IS THE SIGNAL.** Deflection fitted as a function of state, trained on
  five programs and tested on a sixth never seen, held-out R²: static/commanded 0.20, +memory
  0.68, +pose-scheduling on the COMMANDED torque 0.66 (nothing), ACTUAL applied torque +memory
  0.77, **ACTUAL +memory +pose-scheduled 0.84** — against a shuffled-target control of 0.46
  in-sample for the same 95 features. **Pose-scheduling only pays on a signal that carries the
  machine**, which is brick 61's `cmd`-versus-`tx` lesson in a second costume. **AND A FORECAST
  IS NOT A CONTROLLER:** every one of those models makes the machine WORSE applied directly
  (0.83–0.97×), because |G| runs 1.2 → 0.09 with phase +36° → −38°, so a phase-shifted
  subtraction ADDS. Inverting an identified channel is the whole value of both layers.
  **SIX EXPLANATIONS FOR THE EARLIER 8.9× STALL, ALL KILLED BY MEASUREMENT:** drive saturation
  (31% of `tauMax`), lap non-repeatability (0.03%), cross-harmonic coupling (real — 92%
  on-diagonal at h=2 falling to 73% at h=8, all leakage into h±1 — but a block-TRIDIAGONAL
  solve measures 8.46× against the diagonal's 8.47×), a stale Jacobian (re-identification
  returns the same operator), basis size (more harmonics is worse), and noise (four-lap
  averaging moves it 0.6%). **AND THE IDENTIFIED OPERATOR IS WORTH 4.2× OVER A LEAD-AND-GAIN:**
  ILC with the correct 500-step lead reaches 2.1× where HFF reaches 8.88× on the same machine.
  **Sweep feedrate**
  runs the whole ladder and tabulates the trade. The arm is drawn at TRUE geometry; the error trail
  is the exaggerated object, pushed out along the path normal only.
- **④ Black box** — `lib/blackbox/`, a controller GIVEN NOTHING: a scalar command it can
  read, a scalar correction it can add, unlabelled signals, and a tracker during
  COMMISSIONING ONLY. It determines its own timescale from a quiet-detected step test;
  identifies the plant from a probe taken while HELD and the disturbance while RUNNING;
  designs a preview FIR and a box-constrained QP; then a VERIFY ROUND puts every candidate
  on the machine — including a ZERO rung that measures the disturbance map's own bias so
  the others can be divided by it — and deploys the best MEASURED one, or nothing.
  Corrections are linearly interpolated between grid samples, never held. It locks its own
  soft sensor at the end.
- **⑤ Verify** — the closed forms run in this browser against the same modules.
- **⑥ Architecture** — the design note.

### Libraries

| Directory | What it is |
|---|---|
| `lib/lattsim/` | The general lattice engine — lattice, fields, materials, operators (`lbm`, `scalar`, `elastic`, `frame`), solver, WebGPU + CPU backends, renderers. Named `lattsim` deliberately: it is not the fluid page. |
| `lib/ngrc/` | The TC_NGRC port, with golden-vector parity tests. |
| `lib/probesense/` | Soft-sensing a field from one point in it. Fed numbers; knows no physics. |
| `lib/flexisim/` | `joint`, `link`, `arm`, `arm2r`, `armnr` (recursive Newton–Euler), `tipsensor`, `chainsensor`, `compliance`, `compensator`, plus contouring: `toolpath` (geometry + feedrate profile), `contour` (the metrics), `pathilc` (learning over laps). |
| `lib/blackbox/` | A controller given nothing about the plant, plus `qp.js`. Imports nothing from `lib/flexisim/` — the boundary is the directory. Verified on three plants sharing no physics. |
| `lib/pilot/stack.js` | **A CASCADE OF PILOTS, wired to the page as ⑤/⑥'s Cascade depth slider (brick 59).** Layer k is an ordinary Pilot commissioned with layers 1..k−1 deployed and FROZEN, so each models what the one below it left; a layer that cannot vouch for itself ends the stack, and the summed correction is clamped ONCE at the engineer's cap. Every layer above the first is PINNED to the first's cadence — one host, one look-ahead closure, one meaning for `act(off)` — and chooses its own Ts, horizon, lags, ridge and basis on top of it. |
| `lib/pilot/` | **The deploy gate is OPT-IN (`autoRefuse`, default false): the verify is measured and REPORTED but does not veto unless asked; `report.wouldRefuse` carries the reason it would have given.** Route–limit–run–deploy: settle → probe → excite → fit → verify → deploy-or-refuse, on a receding-horizon box-constrained QP. The verify scores two regimes — a filtered-noise scribble and a trapezoid PROGRAM — and gates on the worse. Imports only `../blackbox/qp.js`. |

## Versioning

`stamp-version.sh` runs **before each commit**. It:

- Sets the build number to `git rev-list --count HEAD + 1` (the number of the
  commit being created).
- Writes a UTC timestamp.
- Stamps both `index.html` (the `// __STAMP__` line) and `version.json`.
- Regenerates `docs-manifest.json`.

Run it, then commit, so the shipped commit and its version number match.

## Conventions

- **Self-contained / no external CDNs.** Everything is served from this origin, so the
  page works offline and is not at the mercy of a blocked host.
- Vanilla JS, no build tooling beyond the shell script.
- Keep the console bootstrap first in `<head>` and dependency-free.
- It injects its UI into the HOST page, so it states its own geometry rather than
  inheriting one — see rule 52 and `docs/history/flowsim.md` for the measurement.

## Where the history lives

`docs/history/flowsim.md`, `docs/history/ngrc.md` and `docs/history/flexisim.md` hold the
measurement record: what was tried, what it measured, what was rejected and why. They are
not specifications — where they and this file disagree, this file is what ships. They are
kept because they have repeatedly stopped the same mistake being made twice, and because
several of them record a later brick OVERTURNING an earlier one, which is the most useful
thing in them.
