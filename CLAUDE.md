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

## Key files

| File | Purpose |
|------|---------|
| `index.html` | The main app: header, debug console, doc viewers, NGRC launcher. |
| `console-boot.js` | The debug-console bootstrap, **shared** by `index.html` and `ngrc.html` (loaded first in `<head>`). |
| `ngrc.html` | NGRC playground: 4-tab interactive demo (Lorenz forecaster, soft-sensor, finger-trace, anti-slosh axis) using `lib/ngrc`. |
| `lattsim.html` | LattSim: GPU lattice-field physics engine (Simulate / Verify / Architecture) using `lib/lattsim`. Self-contained — shares nothing with NGRC. |
| `lib/lattsim/` | The lattice field engine: lattice, fields, materials, operators, solver, WebGPU + CPU backends, renderers (see `lib/lattsim/README.md`). |
| `lib/ngrc/` | The ported NGRC library (see `lib/ngrc/README.md`). |
| `lib/probesense/` | The COMPOSITION layer: soft-sensing a field from one point in it. Depends on `lib/ngrc` for the model and on nothing for the physics — it is fed numbers. |
| `version.json` | Server-side build manifest for stale-page detection. |
| `docs-manifest.json` | Generated list of every `.md` file, for the Docs viewer. |
| `stamp-version.sh` | Pre-commit build step: stamps version + regenerates the docs manifest. |
| `vendor/marked.min.js` | Self-hosted markdown renderer (marked v12), no CDN. |
| `vendor/three.module.js` | Self-hosted three.js (r160) for the 3D demos. |
| `vendor/plotly-basic.min.js` | Self-hosted Plotly (basic bundle) for the demo charts. |
| `test/run.sh` | Dev-only: NGRC unit tests + serves the repo + runs the smoke test in a mobile Chromium. |
| `test/smoke.mjs` | Playwright checks + screenshots for the console, doc viewer, NGRC demo, and LattSim. |
| `test/lattsim/` | Node tests for the lattice engine: stencil isotropy, indexing/units, conservation (f32 + f64), Poiseuille vs the analytic parabola. |
| `CLAUDE.md` | This file. |

## Features on the page

1. **Debug console** (bottom-right `>_` launcher) — a self-contained mobile
   console:
   - Captures `console.*`, uncaught errors (with stack + file:line), and
     unhandled promise rejections.
   - Bootstrap (`console-boot.js`) loads **first in `<head>`** so it catches
     load-time errors before `<body>` renders; it injects its own UI onto
     `<html>`. Shared by `index.html` and `ngrc.html`; the page sets a stamped
     `window.__BUILD` just before it (unstamped pages skip stale-detection).
   - Persists logs to `localStorage`, so a white-screen crash is recoverable
     after reload.
   - Badge shows error (red) / warning (amber) counts.
   - **Copy all** (clipboard), **Clear**, a live **JS eval** input, and a
     build/version status line.
2. **Stale-page detection** — on load the page fetches `version.json` with
   `cache: no-store`; if the server build is newer than the loaded page, a
   red top banner offers a cache-busting reload. Beats the Pages/CDN/browser
   cache lag.
3. **Docs viewer** (bottom-right `DOCS` launcher) — renders every `.md` in
   the repo with self-hosted marked. A directory selector filters by folder,
   and files are split into two groups: **◆ CLAUDE context** (any `CLAUDE.md`,
   shown with an indigo tag) and **Docs** (everything else). Opens `CLAUDE.md`
   by default so the current state is one tap away.
4. **LattSim** (bottom-right `LATT` launcher → `lattsim.html`) — a
   **GPU lattice-field physics engine**, architecturally independent of NGRC
   (own directory, own tests, no shared code or vendored libraries). The lattice
   is the PHYSICAL REPRESENTATION, not a visualisation of something else: there
   are no particles, and a moving mass is a pattern in the density and momentum
   fields transported between neighbouring cells. Phase 1 ships a **D3Q19
   lattice Boltzmann fluid** as the first physics operator on a general
   Simulation → Lattice / Fields / Materials / PhysicsOperators / Boundaries /
   Solver / Backends architecture. Indexing is `x + Nx·(y + Ny·z)` in JS, WGSL,
   boundaries and rendering; fields are structure-of-arrays so adjacent GPU
   threads touch adjacent memory. Three tabs: **Simulate** (channel + obstacle,
   Poiseuille, lid-driven cavity; 2D slice on any backend, WebGPU raymarched
   volume where available; resolution / τ / inlet speed / steps-per-frame /
   slice controls; live mass, momentum, density range, max|u|, MLUPS and a
   named STABILITY VERDICT), **Verify** (the analytic checks run in-browser
   against whichever backend is live), and **Architecture**.
   **TWO BACKENDS, AND THE SECOND ONE IS NOT A FALLBACK BOLTED ON.** Per-cell
   physics runs in WGSL compute shaders. But a solver that only executes on
   hardware the test environment lacks ships unverified, and this repo's headless
   Chromium reaches WebGPU only behind `--enable-unsafe-webgpu`, only on a secure
   origin, and only as a SwiftShader software adapter — and not at all in plain
   Node. So a **CPU reference** implements the same equations from the same
   constants (`d3q19.js` is the single source of truth; the WGSL is GENERATED
   from it, so a shader cannot carry its own copy of 1/36). It runs the analytic
   checks in Node on every test run, is what the page uses where WebGPU is
   absent, and where a GPU exists the two are **compared cell by cell**.
   **THAT PARITY CHECK EARNED ITS PLACE ON ITS FIRST RUN**: the production kernel
   was emitting zeros because `macro` is a RESERVED WORD in WGSL, every shader
   failed to compile, and WebGPU reports that asynchronously WITHOUT THROWING —
   an invalid module yields an invalid pipeline, dispatches are dropped, and the
   simulation runs at full speed producing nothing. Nothing else would have
   caught it: no page error, no exception, and `uncapturederror` did not fire in
   that browser. The engine now compiles every shader up front and refuses to
   build on an error, and runs one dispatch of each kernel inside an explicit
   error scope. Two further silent defects came out the same way — a uniform
   buffer sized 48 bytes where WGSL's vec3 alignment needs 64 (invalid bind
   group, dropped command buffer, zeros again), and a canvas asked for both a
   `2d` and a `webgpu` context, where the second silently returns null.
   **VERIFIED, NOT ASSERTED.** `test/lattsim/` checks the stencil's isotropy
   conditions (Σw = 1, Σwc = 0, Σwc⊗c = cs²I), indexing round-trips, the unit
   system, the solver's write-discipline rules, conservation, and Poiseuille
   flow against its closed form. Conservation is run at **both f32 and f64**
   deliberately: the f32 residual (~1e-8) is either arithmetic or a leak and the
   number alone cannot say which, so the f64 run is the instrument that
   separates them — it collapses seven decades, and a regression asserts that
   ratio. Poiseuille shows clean second-order convergence (L2 9.3e-3 → 2.7e-3 →
   8.6e-4 over nz 9 → 15 → 25) and the halfway-bounce-back wall position is
   asserted to fit BETTER than the two plausible wrong ones (H = Nz−2, not Nz−1).
   **THE BGK WALL-SLIP LIMIT IS MEASURED, NOT HIDDEN.** With one relaxation time
   the effective wall position drifts with τ, exact only at Λ = (τ−½)² = 3/16,
   i.e. **τ = ½ + √(3/16) ≈ 0.933** — where the measured L2 error against the
   analytic profile is **8.7e-9, machine exact**, a strong confirmation that the
   boundary scheme behaves exactly as theory predicts. Away from it: 4.2e-3 at
   τ = 0.8, 3.5e-2 at τ = 1.5, 1.6e-1 at τ = 2.5. That is why
   `LBMFluidOperator` takes a `collision` parameter instead of hard-coding BGK.
   Also pinned: **f32 loses forcing increments around 1e-7** (below the
   resolution of the populations they are added to), and the **open boundaries
   are first order** — the first outlet copied populations, imposed nothing on
   the pressure, and drained the channel to ρ = 0.32 while the velocity field
   still looked like flow and the run was not diverging. Only the density-range
   diagnostic showed it, which is the whole argument for reporting diagnostics
   instead of smoothing pictures.
   **FOUR DEFECTS FOUND ON A REAL DEVICE (v113), none of which the suite could
   see, because all four were about what the user is looking at rather than what
   the solver computes.** (i) **Above 64³ the page died.** The channel at 96³
   wants a 128.3 MiB storage binding against a 128 MiB default limit, so the GPU
   backend refused, the fallback CPU backend refused too (1.77M cells against its
   131k cap), and `build()` rejected leaving no simulation at all. The page now
   asks the device for its limit and clamps the resolution ladder to what fits,
   and a failed build keeps whatever was running and states the reason. (ii)
   **Two of the three scenes "did nothing visible" — and both were correct.** The
   DEFAULT SLICE PLANE was wrong for them: Poiseuille varies only across z, so
   the plane normal to z has EXACTLY ZERO spread and renders as one flat colour
   (measured). Each scene now declares the plane that shows its physics and a
   regression asserts that plane actually varies. A correct simulation displayed
   on the wrong plane is indistinguishable from a broken one. (iii) **The 3D view
   was a grey box.** A closed domain is wrapped in no-slip walls, so EVERY ray hit
   solid before reaching any fluid. Solid is now transparent until a ray has
   entered the fluid and opaque after — the shell disappears, interior obstacles
   stay solid — and the box carries the lattice's real aspect ratio instead of
   being squeezed into a cube. (iv) **The moving wall was not a wall.** `MOVING`
   was modelled as a driven FLUID cell, so the cavity's lid was a mass source as
   well as a momentum source and a closed box reported a "marginal" verdict it
   cannot physically have. It is now halfway bounce-back with a momentum
   correction. What is LEFT after that fix is real: a steady 6.6% density extreme
   in the two cells at the lid corners, where a moving wall meets a stationary one
   and the pressure is formally singular — 1.5% two cells in, 0.47% four cells in,
   against the ~0.3% the dynamic pressure accounts for. Restricting the lid to the
   interior of the top face is geometrically correct and ships, but it did NOT
   reduce that number, it raised it 5.1% → 6.6%; the corner overlap was never the
   cause, and the regression now pins the INTERIOR rather than a global number.
   **AND ONE THING CI STILL CANNOT CHECK:** in a headless browser with a software
   adapter there is no real surface, and `getCurrentTexture()` does not merely
   fail — it DESTROYS THE WEBGPU INSTANCE, after which every compute call fails
   too (isolated to fifteen lines of plain WebGPU with none of this engine
   involved). So the volume render is unverifiable here; `render()` returns false
   instead of throwing so a visualisation can never take a simulation with it, the
   suite compiles the volume shader instead, and the picture is verified on a real
   device. Also fixed here: the page shared ONE adapter and device across rebuilds
   (requesting one per build, and dropping the previous adapter, can tear the
   instance down), and an unpainted canvas defaults to WHITE, which against this
   page reads as broken rather than empty.
   **THREE MORE FROM THE DEVICE (v114), and the second one was NOT a defect.**
   (i) **Reset put the controls back**, so switching to the 3D view and pressing
   Reset dropped you into 2D again. It now resets the SIMULATION only: the view,
   the field selector, the slice axis and the slice position survive Reset, a
   resolution change and a τ change, and a scene's declared view defaults are
   applied only when the SCENE ITSELF changes. Smoke pins both halves — the
   settings stay AND the step counter really did restart, because "preserve
   everything" is the failure mode on the other side of this fix.
   (ii) **"The obstacle sim does not settle into a homogeneous steady state" —
   IT DOES, and the report was unanswerable rather than wrong.** A converged flow
   and one still slowly drifting look IDENTICAL on screen, so there was no
   instrument to answer it with. `diagnostics()` now reports a **residual** —
   ‖Δu‖/‖u‖ **PER STEP** — and the verdict says `ok — steady` below 1e-3, computed
   ON-DEVICE in the same reduction pass as the mass and momentum sums (stride 12
   with a `macPrev` binding), so a convergence check costs no extra readback.
   Per-step residual vs step at resolution 16: channel 1.3e-2 → 1.8e-3 → 5.0e-4 →
   1.1e-8 (steps 200/580/1000/4840), Poiseuille and the cavity converging faster
   still — five decades, so the 1e-3 line has room on both sides.
   THE PER-STEP NORMALISATION IS NOT COSMETIC: the backends can only report the
   change between successive READINGS, which grows with however many steps
   happened in between, so an unnormalised residual CHANGES WHEN THE
   STEPS-PER-FRAME SLIDER MOVES — a viewing control altering a physics number,
   which is exactly the class of defect this project keeps finding. A regression
   reads the same 200 steps once and in ten chunks and requires agreement.
   TWO NEIGHBOURING STATES ARE KEPT APART: no previous reading (or no steps since
   the last one) reports `undefined`, NOT zero, because zero renders as
   "perfectly steady" when it means "not measured" — while a residual of EXACTLY
   zero genuinely IS steady, since Poiseuille converges hard enough that the f32
   velocity delta underflows to precisely 0. An earlier `residual > 0` guard,
   there to exclude the no-reading case, therefore made the most converged scene
   on the tab report NOT steady. The general lesson is this project's oldest one:
   the answer to "is it settled?" is a number, and if the number does not exist
   the picture cannot supply it — but the number also has to be independent of
   the observer, or it is measuring the observer.
   (iii) **There was no way to test dynamics** — every scene was driven only by
   its own boundary conditions, so a stability claim rested on flows that never
   got hit. **Dragging on the 2D slice now stirs the fluid**: a spherical body
   force through the SAME Guo forcing term a global body force uses, expiring
   after a few dozen steps. Regressions pin what that MEANS rather than that it
   does something — momentum goes in, **mass does not change**, the momentum
   matches the FORCED VOLUME (it is local, not a global force applied everywhere),
   and the impulse EXPIRES instead of becoming a permanent source. Two things had
   to be corrected in the measurement rather than the code: the impulse must count
   down AFTER being applied (decrementing first silently loses the first step,
   measured as 19/20 of the expected momentum), and the macroscopic field is
   written MID-STEP, so a reading after N steps shows N−½ applications — the test
   was wrong about that, not the operator.
   THE FIRST IMPULSE WAS ARMED PERFECTLY AND WAS STILL INVISIBLE, which is the
   part worth keeping. At 2e-4 over a radius-2 sphere it touched 33 cells out of
   27648 — **0.02% of the domain's momentum against a 0.8% natural fluctuation**.
   Every assertion about it passed; a user dragging on the page would have seen
   nothing. It is now sized against the flow it must disturb (Δu spans 2.4e-3 to
   0.096 across the slider, the top comparable to the 0.06 inlet speed, which is
   as hard as it can push before nearing the 0.3 stability limit) with the radius
   taken from the smallest lattice dimension so the blob stays a visible fraction
   of the slice at every resolution.
   AND THE FALSE FAILURE IT CAUSED IS THE LESSON: the browser check asserted that
   stirring raised the RESIDUAL — but the residual is normalised over every fluid
   cell, so **a global metric cannot see a local poke**, and it reported "the stir
   does nothing" when the stir was fine and the instrument was wrong. The check
   now compares the velocity change INSIDE the impulse sphere against everywhere
   else, which is also the only part the browser can uniquely verify (a screen
   coordinate on a letterboxed canvas → a slice plane → a lattice cell): measured
   36× at the default strength and 50× at maximum, against the ~1× a mis-mapped
   coordinate would give. This is the same mistake as the earlier one in the
   opposite direction — there the number was right and the reading was wrong;
   here the reading was right and the number could not resolve it.
   **A FOURTH DEFECT, FOUND IN A SCREENSHOT AND INVISIBLE TO EVERY ERROR
   ASSERTION IN THE SUITE.** The visual review showed a red error badge on the
   LattSim page. Reproduced deterministically: **Reset while the run loop is
   going** destroys the readback staging buffer with a `mapAsync` STILL IN
   FLIGHT, which rejects with "Buffer was destroyed before mapping was resolved"
   — and nobody is awaiting it any more, so it lands as an **UNHANDLED
   REJECTION**. `destroy()` now waits for any in-flight reduce or snapshot to
   settle; suppressing the rejection instead would make a real teardown bug look
   identical to a benign race. THE REASON IT HID GENERALISES BEYOND THIS PAGE:
   **neither Playwright's `pageerror` nor a console listener reports unhandled
   rejections**, so "zero uncaught page errors" was passing while the live page
   showed an error badge. The regression now reads the page's OWN error buffer
   after exactly that sequence — the same instrument the phone shows the owner.
   **THREE MORE FROM THE DEVICE (v116) — "3d is broken, reset is not working
   consistently" — AND THE FIRST WAS CAUSED BY THE v114 FIX ABOVE.**
   (i) **A RENDERER IS BOUND TO A SIMULATION, so a rebuild has to rebuild it
   too.** The volume renderer was destroyed by every rebuild and recreated ONLY
   by the view selector's change handler, so pressing Reset in 3D left it null
   and `drawOnce()` returned early — a dead view, NO error, no way back except
   toggling the selector. It could not show before v114, because every build then
   reset the view to the 2D slice, so the 3D view was never live across a
   rebuild. Preserving the view is correct and it is what exposed a lifecycle
   that had never been exercised. Measured before/after with the page's own debug
   hook: after Reset in 3D, `{view:'volume', ready:false}` → `{ready:true}`.
   THE CAUTION GENERALISES: a fix that makes state survive an operation makes
   every not-rebuilt dependency of that state reachable for the first time.
   (ii) **A rebuild asked for DURING a rebuild was DROPPED** — `build()` returned
   early while one was in flight, and on a phone a rebuild takes seconds, so the
   tap simply vanished. That is precisely what "Reset doesn't work consistently"
   looks like from outside. It is now queued (one pending slot; the controls are
   read at the start of a build, so one trailing rebuild suffices).
   (iii) **Teardown had to become awaitable.** v114's deferred `destroy()` (which
   fixed the unhandled rejection) returns before the buffers are freed, so the
   page was allocating the replacement lattice while the old one was still
   resident — at high resolution on a phone, the difference between fitting and
   failing to build. `destroy()` now returns a promise and the page awaits it.
   THE 3D PICTURE IS STILL VERIFIED ONLY ON A REAL DEVICE; what the suite pins is
   the LIFECYCLE, which is where the defect was — and that check runs LAST on a
   THROWAWAY PAGE, because entering the 3D view under a software adapter destroys
   the WebGPU instance and would poison every check after it.
   **THE SUITE IS NOW TWO TIERS**, because a 12-minute suite gets run less often
   than it should be and that is a verification problem, not a convenience one.
   `./test/run.sh` runs QUICK (**1m35**) and `--full` runs everything, passed down
   as `SUITE`. The split came from measured section timings, not a guess —
   `engine.test.mjs` alone was 127 s — and the rule is that anything pinning a
   CONTRACT runs every time (indexing, units, write discipline, conservation, the
   analytic parabola, the scene view planes, the stir impulse) while the τ sweep,
   the resolution-convergence study and the long parity runs are `--full`. Run
   `--full` before pushing anything that touches the solver, the collision
   operator or the boundaries.
   **VORTEX SHEDDING: THE SCENE COULD NEVER HAVE DONE IT (v117).** Asked why the
   channel did not shed. It should not have — the threshold depends on the SHAPE,
   and the shipped obstacle was a SPHERE at Re ~58. A circular cylinder goes
   unsteady at Re ~47 (the classic Hopf bifurcation); a sphere stays steady and
   axisymmetric to ~210, steady-but-asymmetric to ~270, and only then sheds
   hairpin vortices — nearly 6× the cylinder's threshold.
   MEASURED IN-BROWSER (transverse wake velocity 5 diameters downstream, second
   half of a 9000-step run): cylinder Re 48 → 0.02% of U, DECAYING 0.04×;
   Re 72 → 1.5%, still decaying 0.49×, but oscillating at **St 0.219** (textbook
   0.2); Re 120 → **25% of U, sustained, St 0.303** — a real von Kármán street.
   Sphere Re 48 → 0.00%, steady; sphere Re 216 → **DIVERGED**.
   THAT LAST ROW IS THE CONSTRAINT: the sphere CANNOT REACH ITS OWN THRESHOLD at
   low resolution, because getting Re to 270 by lowering τ and raising u runs out
   of stability first. Reynolds number has to come from DIAMETER instead, i.e.
   the resolution ladder — which at the default τ and u now runs Re 72/72/120/
   144/240, so the resolution slider sweeps through the threshold by itself.
   THE SUB-CRITICAL ROWS OSCILLATE AT THE RIGHT FREQUENCY WHILE DECAYING, which
   is what a damped wake does and is why the measurement reports late/early
   rather than an amplitude — an amplitude alone cannot tell a decaying
   oscillation from a sustained one, and this scene has both.
   The confined threshold is between Re 72 and 120, ABOVE the free-stream 47,
   because blockage raises it. So: obstacle is now SELECTABLE (cylinder default),
   blockage cut 33% → ~20%, the channel is 3× long rather than 2× (a first-order
   outlet reflects a truncated wake), and the obstacle sits ONE CELL OFF THE
   CENTRELINE — a perfectly symmetric obstacle is an unstable EQUILIBRIUM above
   critical, with nothing but round-off to grow from, so a supercritical run can
   look steady indefinitely. The page reports the threshold next to the live Re.
   **THE 3D VIEW WAS SCALED BY THE WRONG NUMBER (v117).** Reported as "the
   poiseuille 3d is not rendering anything". The 2D slice AUTO-SCALES from the
   data it reads back; the volume renderer never reads anything back, so the page
   handed it the INLET-SPEED SLIDER. Poiseuille is force-driven and ignores that
   slider entirely — its 0.02 peak was normalised against 0.084, and since the
   shader's opacity is **nv²**, it rendered at **1/17th** strength: a black box.
   Channel and cavity looked fine only because the slider IS their driving speed.
   Fixed by scaling from `uMax`, which the diagnostics reduction already computes
   on-device for free, with a scene-declared `referenceSpeed` covering the moment
   before the first reading when the fluid is still at rest. A regression pins
   that every scene declares one AND that it matches the achieved peak within a
   factor — a reference that is merely PRESENT would not have caught this.
   **THE SLIDER FLOOR WAS A TRAP, AND THE FAILURE WAS SILENT (v118).** Reported
   from the device: viscosity to the far left, everything else default, "runs a
   few seconds and then breaks" — frozen picture, a front sweeping across the
   lattice, Run doing one step and freezing again, only Reset clearing it. The
   owner's own observation — **it starts at one cell and spreads** — IS the
   diagnosis: velocity overflows, ρ crosses zero, `u = momentum/ρ` goes
   non-finite, and STREAMING then carries the NaN one cell per step to every
   neighbour. The black region is the NaN zone (a NaN speed makes the slice's
   auto-scale NaN, so the colour map returns black).
   THE CONTROLLING PARAMETER IS THE **CELL REYNOLDS NUMBER**, Re_cell = u/ν —
   advection over diffusion ACROSS ONE CELL — and BOTH sliders move it, which is
   why neither is safe to judge alone. Measured at the default geometry (u 0.08,
   cylinder, 3000 steps): τ .505 → Re_cell 48, uMax reached **1.0e4** against a
   0.3 stable limit and went non-finite by step 400; τ .510 → 24, non-finite by
   1400; τ .515 → 16, survives; τ .520 → 12, survives. A coarser lattice survived
   Re_cell 20 for 9000 steps, so the boundary is near 20 and resolution-dependent.
   THREE FIXES, and the third is the real defect. (i) The τ floor goes back to
   0.51 — a slider position that dies at the SHIPPED inlet speed within seconds
   is a trap, and v117 added it for shedding headroom without checking what it
   did at the default u. (ii) The pairing is flagged BEFORE it runs: both
   readouts go amber at Re_cell 12 and red at 20, because τ and speed are only
   dangerous together. (iii) **Halting on divergence was right; halting SILENTLY
   was not.** Continuing would render noise as though it were fluid, which this
   engine refuses to do — but the reason appeared only in a stats row BELOW THE
   FOLD on a phone, so from outside the page simply broke, and Run re-diverged on
   the next frame and froze again. The badge over the stage now carries the
   verdict, the step, and the remedy, and Run refuses until Reset.
   **TURBULENCE WITHOUT CAPPING THE SLIDERS (v119) — TWO MECHANISMS BUILT, AND
   THE MEASUREMENT OVERTURNED THE REASONING FOR ONE OF THEM.** Asked to handle
   higher Reynolds number properly rather than by limiting the controls. Two
   distinct causes: the SCHEME is needlessly unstable (BGK relaxes every moment
   at one rate, so as ω→2 the non-hydrodynamic "ghost" moments go under-damped),
   and the FLOW has structure smaller than a cell (real physics dissipates at the
   Kolmogorov scale; at Re_cell 48 that is far below dx, so it must be resolved
   or modelled).
   **TRT** splits each population into parts even/odd under q→opposite(q) and
   relaxes them at two rates, with Λ = (1/ω⁺−½)(1/ω⁻−½). **Λ = 3/16 makes
   halfway bounce-back exact at EVERY viscosity** — measured against the analytic
   Poiseuille profile, BGK→TRT: τ 0.6 7.67e-3→1.79e-7, τ 1.0 2.70e-3→3.36e-9,
   τ 1.5 3.51e-2→4.77e-11, **τ 2.5 1.65e-1→8.99e-12, ten orders of magnitude**.
   The τ-dependent wall slip this file documented as a known limit is GONE. At
   τ 0.933 the two agree to 1e-6 relative, which is the correctness check: there
   Λ=3/16 is what BGK already had, so they must coincide.
   **BUT TRT DOES NOT RAISE THE STABILITY CEILING, AND AT Λ=3/16 IT LOWERS IT.**
   One knob serves two objectives that INVERT at low viscosity: accuracy wants
   Λ=3/16, stability wants Λ small (ω⁻ near 2). Holding 3/16 drives ω⁻ to **0.10
   at τ 0.52**, leaving the ghost modes barely relaxed — and TRT then died
   EARLIER than plain BGK. So ω⁻ is a POLICY: `magic` for exact walls,
   `stability` to pin it near 2.
   **THE SUB-GRID MODEL IS WHAT REMOVES THE CEILING.** τ becomes a field,
   τ_eff = ½(τ + √(τ² + 18Cs²|Π|/ρ)), with the strain rate read straight out of
   the non-equilibrium stress — already in registers, no finite differences, no
   neighbour access. Cell Reynolds number still finite after 3000 steps:
   BGK ok to 16 / dead at 24; TRT-magic dead at 12; TRT-stability ok to 16 /
   dead at 24; **TRT+LES ok at 24, 48, 96 and 160 — at least 13× past BGK and it
   did not fail anywhere tested.** TRT buys accuracy, the model buys stability;
   neither is the role it was proposed for.
   **THE MODEL IS NOT FREE AND SHIPS OFF BY DEFAULT.** Plain Smagorinsky responds
   to the TOTAL strain, not the unresolved part, so it fires in laminar flow: the
   analytic Poiseuille profile degrades 3.4e-9 → 6.9e-4 with it on. That is the
   model behaving as documented, not a bug — predicted ν_t/ν_0 = 9.6e-4 against a
   measured shift of 8.8e-4, agreement to 10%. Over-dissipation in laminar and
   near-wall shear is Smagorinsky's textbook flaw; separating resolved from
   unresolved shear needs WALE or shear-improved Smagorinsky, and WALE needs the
   ANTISYMMETRIC velocity gradient, which Π_neq does not carry. Not built. So the
   analytic verification runs unmodelled, the page names which mode is holding a
   run together, and a regression pins the laminar cost at its measured size.
   **THE DEFAULT WAS A CONFIGURATION ALREADY MEASURED TO DIE (v120).** v119 made
   TRT the default on the same day its own table recorded **TRT at Λ=3/16 dying
   at Re_cell 12** — and the shipped defaults (τ 0.52, u 0.08) are Re_cell 12
   exactly. Loading the page and pressing Run diverged by step 300, reproduced
   first try. Worse, the risk row said "Re_cell 12 — within the measured stable
   range", because the CEILING table had been filled in with BGK's number for the
   TRT entry: a measurement is only worth what the thing reading it is worth.
   Fixed by defaulting to **TRT + LES** (measured stable to Re_cell 160), by
   correcting the per-model ceilings to the measured values (bgk 20, trt 10,
   les 200), and by a regression that loads the page, reads its OWN reported
   Re_cell against its OWN ceiling, and runs 2000 steps requiring it to live.
   **AND THE PAGE NOW LOGS ENOUGH TO DIAGNOSE ITSELF**, which is what the owner
   asked for. Every build writes one line to the page's debug console with the
   entire configuration (scene, backend, cells, model, collision, policy, Cs, τ,
   ν, ω⁺, ω⁻, u, Re, Re_cell, ceiling), and warns BEFORE running if Re_cell is
   past the ceiling. On divergence it writes a post-mortem: step, verdict, uMax,
   density range, the lowest-index bad cell with its neighbourhood, and **what
   fraction of the lattice is already non-finite** — that last number being what
   makes the rest readable, since a NaN spreads one cell per step and the "first
   bad cell" is the origin only while the damage is small. The field is NAMED
   `lowestIndexBadCell` rather than `firstBadCell` for exactly that reason.
   `__lsDump()` prints the same on demand from the console's eval box.
   **RESOLUTION WAS BLOCKED, NOT UNSET (v121).** Asked for more resolution on the
   obstruction model. At `[3n, n, n]` the channel wants a **192 MiB** storage
   binding at n = 96, over the 128 MiB most devices allow, so the top of the
   ladder was clamped away and moving the slider did nothing. THE SPAN IS NOT THE
   SAME KIND OF NUMBER AS THE CROSS-SECTION: a cylinder spans z, so the flow is
   nominally 2D and z is a free numerical parameter — cells spent there resolve
   nothing about the wake. Halving it brings n = 96 to **96 MiB** and **20 cells
   across the obstacle** against 10 before. A SPHERE is finite in z and keeps its
   cubic domain. The lattice row now reports cells-across-obstacle, which is the
   number "resolution" actually buys.
   **THE LID CAN BE DRIVEN (v121).** `lidFrequency` scales the moving-wall
   velocity by sin(2π f n): zero is the classic steady lid, anything else drags a
   **Stokes layer** of depth √(2ν/ω) reversing every half period, and whether
   that depth reaches the middle of the box is the whole character of the flow.
   THE SLIDER RANGE CAME FROM THAT DEPTH rather than from what looked tidy — the
   first range reached 20 cycles/1000 steps, where the layer is **0.73 CELLS**,
   below the lattice and not resolved at all; 0–2 spans ~15 down to 2 cells and
   the readout shows the depth. The wall velocity is now a SEPARATE parameter
   from the inlet velocity, which they had shared only because a steady wall and
   a steady inlet happen to be the same number.
   TWO THINGS THE REGRESSION HAD TO LEARN, both of which looked like bugs first:
   the sign of total x-momentum is NOT positive under a steady lid (a closed
   box's return flow occupies far more volume than the thin layer the lid drags),
   and an impulsively started lid OSCILLATES ON ITS OWN while its transient
   decays (2.4 → −0.44 → −0.93 … → 0.05). So neither the sign nor the presence of
   sign changes separates driven from steady; what does is that the transient
   settles and the drive does not, compared after 3000 steps rather than during.
   **THE RUN CANNOT CRASH (v122).** Asked for one configuration and no divergence
   failures at any setting, accepting some loss of perfection. The chain that
   produced the crash — velocity overflows → ρ crosses zero → u = momentum/ρ goes
   non-finite → STREAMING carries the NaN one cell per step — is now broken at
   every link inside the collide kernel of both backends: density clamped away
   from zero, velocity clamped, and **any population that still comes out
   non-finite REPLACED by the equilibrium at the sanitised moments**, so a NaN is
   caught in the cell where it appears and can never reach a neighbour. The
   comparisons are written `!(x > lo)` rather than `x < lo` because the first is
   true for a NaN and the second is not.
   THE BOUNDS NEVER FIRE IN A HEALTHY RUN — the scheme is already unstable above
   lattice velocity 0.3 and this clamps at 0.35; density clamps at 0.5 and 2.0
   against a working range within a few percent of 1 — and that the analytic
   cases are untouched is ASSERTED, since a limiter firing in normal operation
   would be silently changing physics rather than rescuing it.
   MEASURED, 3000 steps at u 0.08, every configuration that previously died:
   Re_cell 12/24/48/160/480/**4800** (τ down to 0.5000) all survive. But READ THE
   NUMBERS RATHER THAN THE "ok": BGK, TRT-magic and TRT-stability all sit at
   **uMax 0.350, which IS the clamp** — they are being held up. The shipped
   TRT+LES sits at 0.277–0.300, BELOW the clamp: it is solving the flow rather
   than being rescued from it, and that gap is the entire value of the sub-grid
   model now that nothing can crash.
   **AND IT SAYS SO.** The reduction counts clamped cells (stride 12 → 13),
   `diagnostics()` returns `limited`, and the verdict becomes `limited — N
   cell(s) held at the velocity limit`, reported BEFORE the stability verdicts,
   because "it looks stable" is the wrong conclusion to draw from a rescued run.
   A NaN injected by hand into the populations is gone after one step and has not
   spread 200 steps later — the test that makes this a guarantee rather than an
   observation.
   **ONE CONFIGURATION SHIPS** (TRT with ω⁻ pinned for stability + the sub-grid
   model); BGK and TRT-at-Λ=3/16 stay in the LIBRARY because the analytic
   verification needs both to measure the ten-decade wall result, but they are no
   longer a choice on the page — one of them shipped as the default and diverged
   at the shipped sliders.
   **THE STARTUP FRONT AND THE REFLECTING OUTLET (v123).** Reported from the
   device: the leading edge crosses the channel, hits the outlet, reflects, and
   the run takes a long time to settle. TWO causes. (i) The interior started AT
   REST, so the inlet had to fill the channel — a front with nothing to do with
   the flow being studied; the channel now begins with the whole fluid at the
   inlet velocity, so there is no front. (ii) The outlet PINNED density to ρ0
   every step, which anchors the pressure perfectly and reflects perfectly. It is
   now pulled only weakly toward rest, and `outletAnchor` was MEASURED at both
   ends (res 16, cylinder, u 0.08, 1800 steps — worst transient density spread /
   settling step / final band): rest+1.0 0.381/700/0.968–1.172; uniform+1.0
   0.277/700; uniform+0.5 0.272/500; **uniform+0.2 0.252/500/0.987–1.194
   (shipped)**; uniform+0.02 0.265/500/**1.270–1.535 DRIFTED**. A third off the
   transient and a third off the settling time. THE WEAK END IS A REAL FAILURE:
   at 0.02 the channel pressurised to a mean density near 1.4, the same class of
   failure as the original drain to 0.32 in the other direction, which is why the
   parameter is measured at both ends rather than simply made small.
   **AND WGSL vec3 PACKING BIT FOR THE THIRD TIME.** A `vec3<f32>` is size 12
   align 16, so an `f32` after one lands at offset **108**, in the vec3's trailing
   four bytes, NOT at the next 16-byte boundary. Guessing 112 shifted
   `outletAnchor` and `initVel` a slot each; the CPU/GPU parity check reported it
   as a 130% velocity and 13% mass disagreement and nothing else would have. The
   offsets are now written out beside the struct, computed rather than guessed.
   **THE QUICK TIER NO LONGER LOADS ngrc.html** — the tier exists to be run on
   every LattSim edit, and ngrc's warm-up timers are both most of its clock and
   flaky under load, so a LattSim edit was being judged by checks unrelated to it.
   They still run on `--full`.
   **A PROBE, AND A CHART UNDER THE STAGE (v124).** One lattice cell sampled over
   time: `Place probe` then tap the slice, and the cell is fixed in 3D too since
   the slice plane and position choose it. A TIME SERIES ANSWERS WHAT A PICTURE
   CANNOT — a vortex street and a settled flow look far more alike on a colour map
   than on a trace (shedding is a periodic transverse velocity, settled is flat
   lines). Traces: |u|, both in-plane velocity components, and density on its own
   axis. ONE CELL, NOT THE FIELD: `backend.probe()` is a 16-byte readback (four
   4-byte copies, since the field is structure-of-arrays), against the 21 MB a
   full macro snapshot would cost every frame at 1.3M cells.
   THE X AXIS IS SOLVER STEPS, NOT SAMPLES — the probe records once per frame, so
   a sample-numbered axis would rescale itself when steps-per-frame moved, which
   is the residual's old defect over again.
   THREE THINGS FIXED RATHER THAN ASSUMED: (i) **a hidden canvas has no size, and
   0/0 is NaN, not zero** — the screen-to-cell mapping returned NaN coordinates
   that passed every bounds check and indexed the field at NaN; it now refuses a
   zero-sized canvas, found because the regression ran while the Architecture tab
   was showing. (ii) **An empty chart reads as broken**, so it is collapsed until
   a probe exists — and Plotly must be told to resize once the container is
   visible, having sized itself against a `display:none` div. (iii) **THE CONSOLE
   BUFFER IS PER ORIGIN, NOT PER PAGE** — persisted to localStorage so a
   white-screen crash survives a reload, which means this page inherits errors
   from any other page on the origin. That is why a red error badge appeared on a
   LattSim screenshot: it was the SUITE'S OWN `console.error('smoke error')`,
   injected on index.html to test console capture. The suite now clears the
   buffer when it opens the page, and asserts the page's own error buffer is
   empty at the end — in BOTH tiers, since neither `pageerror` nor the console
   listener sees unhandled rejections.
   **PASSIVE SCALAR TRANSPORT — the "no core change" claim, now measured.** The
   architecture note below long promised that adding a field needs no core change;
   `operators/scalar.js` proves it, touching ZERO of the solver, operator base,
   fields or simulation façade. It is a SECOND D3Q19 distribution `g` advected by
   the fluid's velocity (read-only, so the coupling is one-way and the solver runs
   the fluid then the scalar on the declared reads/writes alone), with the
   first-order equilibrium `g_eq = w_q C (1 + c.u/cs^2)`; `tau_g` sets the
   diffusivity `D = cs^2(tau_g-½)` the way `tau` sets viscosity. VERIFIED against
   closed forms (`test/lattsim/scalar.test.mjs`): diffusivity to 2%, advection
   centroid speed to 1%, total-scalar conservation arithmetic (f64 improves it
   >1e3x); the WGSL kernel is compiled up front and compared cell-by-cell against
   the CPU reference in the smoke test. A `dye` scene injects a needle upstream of
   a cylinder and `concentration` is a render mode.
   **FIELD RECONSTRUCTION — the payoff.** On the dye scene, a ring of wall sensors
   reads velocity and pressure ONLY (never the dye) and one shared-covariance
   `FieldReconstructor` (one covariance, one readout per cell) rebuilds the whole
   concentration slice from them — the industrial soft sensor, inferring a
   composition you cannot instrument from cheap boundary signals. Memoryless (lag
   1: a spatial map at one instant, so no cadence coupling), the readback batched
   through `backend.probeMany`.
   **EVERY RECONSTRUCTION NUMBER THIS FILE USED TO CARRY WAS MEANINGLESS, AND THE
   MISSING PIECE WAS A CONTROL RATHER THAN A METHOD (v141).** The old entry read
   "a laminar dye channel reconstructs from 12 wall sensors at nRMSE ~0.08 over
   647 cells", and `recon-gate.mjs` passed that configuration at 0.079 by asking
   "is the error small". The question it needed was **"is it better than doing
   nothing"**, and the answer was no by a factor of fifty: a STATIC MAP -- each
   location's own time average, no sensor read at all -- scores **1.7e-3** on that
   stream. The wake and placement numbers (~0.26, saturating at ~6 sensors) are
   from the same era and are on the same footing.
   THE CAUSE IS THAT THE SCALAR IS **ONE-WAY COUPLED**. Dye is advected by the
   flow and never acts on it, so a wall tap learns about the plume only THROUGH
   the velocity field -- and on a STEADY flow the plume is a fixed function of
   that flow, so a constant per location is the right answer and the sensors are
   not merely unhelpful but unnecessary. Measured on the shipped stream: the
   field's temporal variation is **0.109% of its spatial structure**, and
   `drift/temporal = 2.15`, so what little movement exists is a settling transient
   rather than a fluctuation. Raising the inlet velocity made it WORSE (temp/spat
   1.50e-3 at u 0.06 against **6.37e-6** at u 0.12) for two reasons worth keeping:
   a faster inlet shortens the transit, so a fixed sample count observes MORE
   transits and lands more settled; and the Smagorinsky model that makes this
   solver unconditionally stable adds eddy viscosity, which damps the wake
   instability being chased. The fix is `inletMode` -- the operator already
   carried steady/pulse/multitone/chaotic drive and `channelFlow` already
   forwarded it. Multitone at amplitude 0.3 gives activity 2.3% and
   drift/temporal **0.23**, i.e. genuine stationary fluctuation.
   **AND ON THAT STREAM THE ESTIMATOR WAS STILL SIX TIMES WORSE THAN A CONSTANT,
   WHICH EXPOSED A REAL BUG.** `FieldReconstructor.observe()` accumulated the
   per-location target statistics over the calibration window while ALREADY
   UPDATING THE WEIGHTS -- and before the freeze `_tMean` is 0 and `_tStd` is 1,
   so the first `warmup` samples trained on the RAW concentration instead of the
   normalised target. At `lam = 1.0` there is no forgetting, so those wrong-scale
   equations are not corrected later, they are carried forever.
   **THIS IS THE LORENZ WASHOUT BUG IN A SECOND PLACE** -- that tab's single
   largest fix was feeding its calibration window predict-only for exactly this
   reason, and `SoftSensorBank.push` already gates the INPUT side on it; the
   target side did not. Fixed by returning a predict-only estimate until the
   target scale exists. MEASURED, driven dye channel, field nRMSE against a
   static-map control of 2.781e-2:
     memoryless, ridge 100         1.816e-1 -> **3.936e-4**   (460x)
     lag 4 x stride 100, ridge 100 3.402e-1 -> **1.768e-4**   (157x better than
                                                               doing nothing)
     24 taps, lag 4 x stride 100              **1.581e-4**   (176x)
   THE DAMAGE SCALED WITH THE POISONED FRACTION, which is why it hid: a deeper lag
   window delays the freeze, leaves fewer clean samples, and scored WORSE the more
   memory it was given -- the exact opposite of what the physics says, and the
   reason "memory does not help" looked like a result about convection when it was
   a result about a bug. Two other conclusions inverted with it: the prior sweep
   read "tighter is monotonically better" (it was shrinking the weights to zero,
   and zero weights ARE the static map), and it now reads looser-is-better again,
   matching the noiseless-simulation finding elsewhere in this file.
   **THE INFORMATION WAS ALWAYS THERE, AND A MODEL-FREE INSTRUMENT SAID SO.**
   `wall-information.mjs` fits nothing: it takes the plain Pearson correlation
   between each wall channel's history and each interior location, maximised over
   lag. Median best correlation **0.978**, minimum 0.862, **100% of locations
   above 0.8** -- and the peak sits at a median lag of **300 samples against a
   transit of 400**, i.e. the convection delay, which is precisely what a
   memoryless map cannot use. THAT INSTRUMENT ALSO HAD TO BE FIXED FIRST: the
   first version standardised each series over its full length and then summed
   products over the truncated overlap window, which is not a correlation and
   reported a maximum of **1.002**. A correlation cannot exceed 1, and that was
   the only reason the error was visible -- everything else it said looked
   plausible.
   **NOISE, RE-ASKED ON A WORKING ESTIMATOR, AND THE ANSWER SPLITS BY BASIS.** The
   instrumentation review argued that a temperature coefficient shared across
   every pressure channel moves them TOGETHER, and that an inverse solver
   reconstructs a coherent shift as a genuine low-order field mode -- so
   common-mode is the real limit and independent per-channel noise is the
   flattering assumption. Measured on the driven stream, noise applied to the
   pressure channels only, every mode delivering the SAME per-channel standard
   deviation so the arms differ in correlation and nothing else (eta = fraction of
   each channel's own spread; static map 2.781e-2):
     linear 12 taps, memoryless (nf 37)      eta 0.03 / 0.1 / 0.3
       independent   1.3e-3 / 4.1e-3 / 1.22e-2
       common        6e-4   / 1.5e-3 / 4.4e-3      ratio 0.26 / 0.31 / 0.34
     EXPANDED 12 taps, memoryless (nf 751)
       independent   3e-4   / 7e-4   / 1.9e-3
       common        6e-4   / 1.6e-3 / 4.5e-3      ratio 3.88 / 2.96 / 2.59
       drift         8e-4   / 2.7e-3 / 8.0e-3      ratio 7.42 / 5.52 / 4.68
   **SO THE CLAIM IS TRUE FOR THE NONLINEAR EXPANSION AND FALSE FOR THE LINEAR
   READOUT** -- correlated noise is 3-4x LESS damaging than independent noise on a
   linear map, and up to 7.4x MORE damaging on the expanded one. That is the
   predicted mechanism confirmed by measurement: x = x0 + n gives
   x^2 = x0^2 + 2*x0*n + n^2, so white independent sensor noise leaves the
   expansion signal-proportional, biased by the noise variance, and correlated
   ACROSS FEATURES whatever it went in as. A scalar isotropic prior over such a
   basis is the wrong regularizer, and the failure is invisible in an independent-
   noise sweep because that is the one case where it does not bite.
   **THE EXPANSION IS NOT SIMPLY WORSE, AND THAT IS THE USEFUL PART.** It is about
   8x MORE robust to independent noise than the linear readout (+29% against
   +228% at eta 0.03) and never actually LOSES in absolute terms -- at eta 0.3 the
   two tie under common-mode (4.5e-3 vs 4.4e-3) and the expansion still wins under
   independent noise (1.9e-3 vs 1.22e-2). What correlated noise destroys is its
   ADVANTAGE, not its standing.
   **AND THE CONFIGURATION THAT BEST EXPLOITS THE PHYSICS IS THE LEAST
   DEPLOYABLE.** The lagged readout that reaches the convection delay is the best
   on clean data by a wide margin (1.768e-4, 157x doing nothing) and is destroyed
   by ONE PERCENT sensor noise: 2e-4 -> 2.53e-2, which is the static-map floor,
   and it then stays flat across two further decades of noise because there is
   nothing left to lose. The memoryless readout starts 2.2x worse and degrades
   gracefully. Anyone quoting the clean lag result as the method's number is
   quoting a laboratory measurement.
   **INPUT CONDITIONING BUYS THE NONLINEAR BASIS BACK, AND IT IS CHEAP (v142).**
   Asked whether filtering could trade a little accuracy for stability so the
   expanded map is usable under noise. Two filters, attacking different halves --
   a causal boxcar LOW PASS over the last `lp` samples (the flow signal here is
   slow; the inlet is driven at 0.004 cycles/step and the wall-to-interior
   coupling peaks at a 300-sample lag, so broadband noise averages out and the
   signal does not) and COMMON-MODE REJECTION, subtracting the cross-channel mean
   of the pressure taps in units of each channel's calibrated spread, which is
   what differential measurement does in hardware.
   SIX PREDICTIONS WERE STATED BEFORE THE RUN AND ALL SIX HELD, which is worth as
   much as the numbers because it means the filters do what they are named for.
   Measured, expanded map (nf 751), 12 taps, eta 0.1, commissioned-clean protocol,
   field nRMSE (clean floor 2.63e-4, static-map control 2.78e-2):
     filter      clean      indep     common      drift   worst/clean
     none      2.63e-4    6.87e-4    1.52e-3    2.69e-3      10.2x
     lp 8      2.59e-4    3.40e-4    6.52e-4    2.66e-3      10.3x
     lp 32     2.67e-4    3.34e-4    4.15e-4    2.66e-3       9.9x
     lp 128    1.50e-3    2.65e-3    3.18e-3    7.96e-2      53.1x
     cmr       2.78e-4    1.98e-3    2.78e-4    2.78e-4       7.1x
     cmr+lp32  2.75e-4    5.65e-4    2.75e-4    2.75e-4       2.1x
   **THE SHIPPING ANSWER IS cmr+lp32: a 5% cost on clean data turns a 10.2x
   worst-case noise degradation into 2.1x**, i.e. 4.75x more stable, and its worst
   mode (5.65e-4) is 7.3x better than the UNFILTERED LINEAR readout's worst
   (4.15e-3). Conditioning helps the nonlinear basis MORE than the linear one --
   on the linear readout lp8 buys 1.61x and everything else measures worse -- so
   the inversion is complete: the basis that noise was supposed to rule out is the
   one that responds best to cleaning the inputs.
   THE LOW PASS OBEYS ITS OWN ARITHMETIC. Removing the clean floor in quadrature,
   the noise-induced error falls 6.35e-4 -> 2.20e-4 at lp 8, a factor **2.9
   against a predicted sqrt(8) = 2.83**. At lp 32 it reaches only 3.2 rather than
   5.7, and by lp 128 the filter is eating the signal (5.7x clean cost, and the
   drift row explodes to 8e-2): there is a real optimum and it is nearer 8-32
   samples than 128.
   **DRIFT IS IMMUNE TO A TEMPORAL FILTER AND CMR REMOVES IT EXACTLY.** A constant
   offset is DC, so the low-pass rows are byte-flat across it (2.686e-3 ->
   2.661e-3 -> 2.658e-3) while common-mode rejection returns both the common and
   drift columns to the clean value to three figures. The one cost is that CMR
   makes INDEPENDENT noise worse (6.87e-4 -> 1.98e-3), because subtracting the
   cross-channel mean of uncorrelated noise injects a shared component into every
   channel -- which is exactly why the two filters are needed together rather than
   either alone.
   **AND THE BIGGEST LEVER IS NOT A FILTER AT ALL: CALIBRATE WITH THE NOISE
   PRESENT.** A first version of this trained only on the noisy stream and the
   DRIFT column came out EXACTLY equal to the clean column. That is not a bug --
   the standardisation freezes its own mean from the calibration data, so an offset
   that was there while calibrating is subtracted out and costs nothing. Under the
   noise-throughout protocol the unfiltered expanded map degrades **1.0x** across
   every mode, against 10.2x when the same noise arrives after commissioning. So
   the deployable recipe is: commission with the instrument's real noise in the
   record, recalibrate periodically, and let cmr+lp32 cover what develops in
   between. Drift is only harmful when it arrives after the calibration window,
   which is precisely the failure the drift literature describes.
   **STILL DELIBERATELY NOT BUILT:** heat as a COUPLED field (buoyancy feeding
   back), elasticity, electromagnetics, multiphysics coupling and adaptive
   resolution are architecture rather than code. Operators declare the fields they
   read and write and the solver rejects two writing the same field in one stage,
   so coupling must be stated rather than implied by call order; the lattice owns
   its spacing and indexing rather than assuming unit cells, which is what keeps
   refinement possible.

   **THE SLIDER RANGES REACH PAST WHAT THE SOLVER CAN SOLVE, ON PURPOSE (v140).**
   τ now runs 0.5001–2.5 (ν 3.3e-5 to 0.667, four decades) and the inlet speed
   0.005–0.35, which is the velocity clamp itself. Measured at res 24 after 2000
   steps, every corner FINITE with no page errors:
     τ 0.52   u 0.08   Re_cell    12 · Ma 0.139 · 0 held      · ρ 0.991–1.104
     τ 0.5001 u 0.35   Re_cell 10500 · Ma 0.606 · 9.77% held  · ρ 1.140–2.000
     τ 0.5001 u 0.005  Re_cell   150 · Ma 0.009 · 0 held      · ρ 0.996–1.002
     τ 2.5    u 0.35   Re_cell   0.5 · Ma 0.606 · 1.39% held  · ρ 0.971–2.000
     τ 2.5    u 0.005  Re_cell 0.008 · Ma 0.009 · 0 held      · ρ 0.998–1.131
   Re_cell 10500 is **52× past** the range the sub-grid model was measured over and
   the limiter still holds: a NaN is caught in the cell where it appears, so it
   never streams to a neighbour.
   **MACH IS A SEPARATE FAILURE FROM Re_cell, AND THE τ 2.5 ROW PROVES IT.** LBM
   solves the incompressible equations only as Ma → 0 and its error grows as Ma²,
   so at u 0.35 (Ma 0.606, Ma² = 37%) the density clamp is reached at BOTH ends of
   the viscosity range — including τ 2.5, where the flow is deeply viscous, Re_cell
   is 0.5 and every Reynolds criterion calls it safe. A page reporting Re_cell
   alone would have called that corner fine while ρ sat pinned at its clamp. Also
   note ρ**min** = 1.140 at the worst corner: the ENTIRE lattice is 14% above rest,
   because at Ma 0.6 the inlet rams fluid in faster than the outlet passes it.
   **AND THE NEW CHECKS IMMEDIATELY CAUGHT A REAL DEFECT.** `read()` did
   `this.buffers.get(name).a` and `destroy()` clears that map, so two slider changes
   in quick succession — which is what dragging these sliders now does — let a frame
   already in flight read a destroyed backend: `Cannot read properties of undefined
   (reading 'a')`, a red badge, and nothing to say a benign race caused it. The
   backend now throws a NAMED error carrying `stale`, and the frame is guarded at
   ONE choke point rather than per caller: a frame touches the backend from four
   places (the stats reduction, the renderer, the probe, the soft sensor) and a
   rebuild invalidates all of them at once, so guarding them individually only
   guarantees the next one added is unguarded. My first attempt guarded `drawOnce`
   and the throw came from `refreshStats` — the suite caught that too.
   THE INSTRUMENT THAT FOUND IT WAS THE ERROR BUFFER, NOT A FUNCTIONAL CHECK. Every
   physics assertion passed; the simulation was correct throughout. Same instrument,
   and the same reason, as the unhandled `mapAsync` rejection in v114.

5. **Soft sensor on the lattice** (in the LattSim page, under the probe chart) —
   TWO POINTS ON ONE LATTICE: the probe is the **sensor**, the point you could
   actually instrument, and a second marker is the **target**, the point you could
   not. The model sees only the sensor's recent history; the target's true value
   is used to train and to grade, which is the position a real soft sensor is in
   during commissioning and never again after it. Two readouts share one feature
   expansion and differ only in the delay at which features are paired with truth:
   an ESTIMATE of the target now, and a PREDICTION of it one lead ahead.
   Selectable input quantities (|u|, u_x, u_y, u_z, ρ) and a separately selectable
   target quantity, a lifecycle rather than a switch (idle → calibrating →
   training → estimating/locked), and sliders for the lead, the sample interval,
   the lags, the lag spacing and the ridge.
   **MEASURED, driven lid-cavity at 24³ with the lid oscillating** (sensor against
   a side wall, target in the middle of the box, 700 trained pairs, nRMSE ÷ the
   truth's own standard deviation so 1.0 = no better than the mean):
   estimate **0.050 against 2.47** for a scaled sensor reading — **49×** — with
   the estimate tracking the full range (truth 0.00271–0.01083, estimate
   0.00288–0.01082); the 280-step forecast **0.396 against 1.53** for persistence,
   3.9×. Dropping the nonlinear expansion costs 1.47× on the estimate (0.0739) and
   1.28× on the forecast, so the basis is doing real work rather than decoration.
   **THE FRAME LOOP SPLITS ITS STEP BUDGET AT SAMPLE BOUNDARIES.** The probe chart
   can be sampled once per frame; a MODEL cannot, because its lag window is counted
   in SAMPLES — a cadence set by the steps-per-frame slider would make a viewing
   control change the physics the model sees, and the window would span a different
   amount of time at every slider position. Both cells are also read with nothing
   advancing between them: a GPU probe awaits a `mapAsync`, and a loop free to step
   during that await would pair a sensor reading with a target from a LATER state.
   Zero missed boundaries over 568 samples is a regression.
   **THE CHART IS TIME-NORMALISED, WHICH IS THE POINT OF IT.** A forecast drawn
   where it was ISSUED appears shifted by exactly the lead, so a perfect one looks
   wrong and a lagging one looks right. Each prediction carries the step it is
   ABOUT and is drawn there, lying on the truth precisely when it came true, with
   a dotted segment for the part that has not happened yet.
   **THREE DEFECTS, AND THE THIRD IS THE ONE THAT GENERALISES.**
   (i) **ρ AS A TARGET WAS UNLEARNABLE** — 1.69 nRMSE, worse than predicting its
   own mean and 5× worse than persistence, while velocity targets on the identical
   stream scored 1.6e-2. Density is a ~1% fluctuation riding a level of 1.0, and
   the prior regularises the bias weight and the modulation weights alike, so the
   modulation was ridged a hundred times harder than the offset it sits on.
   Centring and scaling the target on the same frozen window as the inputs took it
   to 2.94e-2 and its forecast from 0.2× to 32× persistence — and THE VELOCITY
   TARGETS DID NOT MOVE (2.87e-2 → 2.88e-2), which is the signature worth checking:
   a fix that improves everything has usually changed the measurement instead.
   (ii) **THE CALIBRATION WINDOW SPANNED THE STARTUP TRANSIENT.** A lattice begins
   at rest and a no-slip WALL CELL barely moves, so the frozen standard deviation
   landed far below the flow's eventual variation; every later sample was divided
   by it and the quadratic terms squared the result. Measured across four decades
   of calibration variance: 1e-7 → nRMSE **1.58e7**, against 0.18 when the window
   was representative. Three layers now — a RELATIVE floor (a channel varying less
   than a thousandth of the busiest carries nothing at this scale, so it is left
   unscaled rather than amplified; the old absolute 1e-18 floor rescued only the
   fully dead channel and everything between was the trap), a CLAMP at ten
   deviations as the guarantee, and AUTOMATIC RECALIBRATION as the fix, since
   saturating inputs are unambiguous evidence the window was unrepresentative.
   Bounded to three attempts, and asserted NOT to fire on a good window — a guard
   that always triggers is a delay, not a guard. `train()` also re-anchors the
   window, so pressing Start training means "this is the flow I mean".
   (iii) **A STEADY TARGET IS NOT A BAD SCORE, IT IS NO QUESTION**, and BOTH of the
   first page tests asked a question with no answer, in opposite directions. A
   flow still developing gives a target that DRIFTS monotonically, so there is no
   stationary relation to learn; a settled flow gives a target that is CONSTANT —
   measured on the shipped channel after it converged (residual 2.67e-5): the truth
   spanned 0.0821 to 0.0821, a variation of 1e-7 on a value of 0.082, and every
   nRMSE there is noise divided by noise. The page now reports `steadyTarget` with
   the measured activity and names the remedy instead of printing a ratio. THIS IS
   THE SAME QUESTION THE PHYSICS SIDE ASKS OF A WAKE BEFORE SCORING A FORECAST ON
   IT, and it was asked there and then not asked here — the third repetition in one
   session of "a measurement taken across a transient describes the transient".
   **THE RIDGE SLIDER IS THE RECIPROCAL OF A RIDGE, AND WAS LABELLED AS ONE.**
   Recursive least squares started from P0 = v·I reaches the ridge-regression
   solution with penalty λ = 1/v, so a LARGER slider value is a LOOSER fit — and
   "Ridge 100" read as heavy shrinkage while meaning almost none. Measured on the
   driven cavity, all seven values fed ONE stream so the only difference between
   rows is the parameter (estimate nRMSE · amplitude ratio, 139-feature basis):
     0.01 → 0.502 · 0.806    1 → 0.135 · 0.954    100 → 0.053 · 0.981
     0.1  → 0.259 · 0.896   10 → 0.075 · 0.969   1000 → 0.046 · 0.990
                                              10000 → 0.044 · 0.996
   Monotone over four decades, worth **11×**, and the 13-feature basis has the
   identical shape (0.604 → 0.051). THE AMPLITUDE RATIO IS THE MECHANISM: at the
   tight end the estimate tracks the SHAPE but covers only 80% of the truth's
   range, because shrinkage pulls the readout toward the target's mean. That is
   invisible in an nRMSE, which cannot separate a flattened estimate from a noisy
   one.
   WHY THERE IS NO OVERFITTING PENALTY AT THE LOOSE END, which is the part that
   overturned the expectation: **a simulation is noiseless**. Regularisation exists
   to stop a fit chasing observation noise, and there is none here, so at a 10:1
   sample-to-feature margin the bias it prevents is pure cost. Every row was still
   improving at 1400 samples AND the loose ridges were also better at 500, so there
   is no early/late crossover — the "tight converges faster" intuition is about
   noisy plants. On a noisy or short record the trade reverses, which is the regime
   a real soft sensor lives in.
   THE DEFAULT STAYS AT 100 despite 1000 measuring better here, because that is one
   scene, one target and no noise — and this project already has the scar: the
   double pendulum needed a ridge 1000× tighter than the value measured optimal on
   Lorenz, since a conservative system does not self-correct and a dissipative one
   forgives. The label now shows both numbers (`100 · λ 0.01`) so the direction is
   visible where it is used rather than remembered.
   **DIRECTIONAL FORGETTING: MEASURED, AND IT IS THE WRONG MECHANISM HERE — BUT
   ASKING COST A REAL DEFECT ITS HIDING PLACE.** With λ < 1 the covariance is
   inflated in every direction each step while only the EXCITED directions get new
   information, so a poorly exciting stream winds up without bound — and a settled
   wake or a driven cavity is a LIMIT CYCLE, i.e. exactly that condition. Six
   configurations fed ONE stream, driven cavity, then the lid frequency changed
   0.5 → 1.2 UNDER the trained models with nothing rebuilt:
     steady          λ1.0 0.0675 · λ.999 dir 0.0675 · λ.999 0.0670 · λ.995 0.0651
     after the change λ1.0 5.088  · λ.999 dir 5.206  · λ.999 5.243  · λ.995 6.091
   THE WINDUP IS REAL AND DIRECTIONAL FORGETTING PREVENTS IT — plain λ 0.995 drove
   trace(P) to **5.3e5** and was 20% worse, while directional held it at 3.0e2. But
   it BUYS NOTHING: identical to λ = 1 on a steady stream to four decimals, and
   2.3% WORSE through the change. Four independent measurements across this project
   now agree, so it stays in the library, default off, and off the page.
   **BECAUSE THE WEIGHTS WERE NEVER WHAT WAS WRONG.** All six failed IDENTICALLY at
   nRMSE ~5 — five times worse than a scaled sensor reading — and the diagnostic
   that said why was **3560 saturated input slots**, the same in every row, since
   saturation depends on the frozen scaling and not on the weights. The thinner
   Stokes layer moved the sensor's amplitude outside the window the standardisation
   was frozen on, and no forgetting factor touches a frozen scale.
   THE DEFECT: `_recalibrateIfUnrepresentative` LATCHED ITSELF OFF the first time
   saturation dropped, so it could answer an unrepresentative STARTUP and nothing
   else — while drift is the failure a deployed soft sensor actually meets. Made a
   ROLLING window (2% saturation over a window, bound 6), the same regime change
   measures **5.088 → 0.363, a 14× recovery**, from 5× worse than the baseline to
   1.7× better, with saturation back to zero. The steady numbers are BYTE-IDENTICAL
   before and after, which is the signature that mattered: a fix that also moved
   the steady case would have changed the measurement rather than repaired a fault.
   And once re-calibration handles the scaling the six forgetting variants collapse
   into a 1% band (0.3617–0.3650), so the conclusion holds from both directions.
   `trace(P)` and `|θ|` are permanent in `status()` for the same reason `__lsDump()`
   is: the score could not have told these explanations apart.
   **A SECOND HARD SENSOR joins the input vector rather than replacing anything.**
   "Add 2nd sensor ◈" places a second point you could instrument (a cyan diamond,
   distinct in shape from sensor 1's pink crosshair and the target's violet ring);
   its readings extend the model's inputs, so two points × the selected quantities
   × the lags. The test that matters is not that two never loses to one -- with
   lags, one sinusoidal sensor already spans every phase, so on a single-frequency
   target two ties one -- but that when the target depends on a signal the first
   sensor cannot see, the second supplies it: measured on a synthetic field whose
   target needs an incommensurate second frequency, one sensor is stuck at nRMSE
   0.63 (it literally cannot see that frequency) and two reach 0.013, **50×
   better**. On the page the feature count went 139 → 373 when the second sensor
   was added (the quadratic cross-terms between the two points are most of the
   jump), both cells plus the target are read at ONE instant with zero cadence
   misses, and a single unwrapped read still works so nothing regressed.
   **`__lsSSdbg()`** reports the frozen input scales, the target's frozen mean and
   spread against its live ones, the saturation and recalibration counts, the
   weight norms, the covariance traces and the ranges of truth against estimate.
   It is permanent for the same reason `__lsDump()` is: a soft sensor that scores
   badly has at least four distinct explanations and NONE of them can be told apart
   from the score.

6. **NGRC playground** (bottom-right `NGRC` launcher → `ngrc.html`) — a 4-tab
   interactive showcase of `lib/ngrc`, each tab framed as **NGRC vs a common
   alternative** so the value is visible: **① Chaotic systems** (three.js
   attractor; 1-finger orbit, 2-finger pinch-zoom **and pan**; a SYSTEM
   SELECTOR switches between SEVEN systems, each with its own dynamics,
   dt, and **numerically measured λ_max** (Benettin, validated: Lorenz
   0.913 vs known 0.906, Rössler exactly the literature's 0.071) so every
   Lyapunov clock stays honest per system — Lorenz-63 (dt.02 λ.913,
   poly2), Rössler (dt.1 λ.071, poly3 — measured 5.5 vs 2.9 Λ), driven
   Duffing (dt.05 λ.112, drive embedded as [cosφ,sinφ] state; poly3 +
   DELTA targets — cubic force + slow dynamics, 0.06→3.7 Λ measured),
   double pendulum (dt.01 λ1.42, 6D cos/sin/ω embed, **iv 0.1** — the
   only system needing a ridge other than the default 100; see the
   CONSERVATIVE-SYSTEM entry below), Lorenz-96 N=5 (dt.05 λ.439, delta:
   3.1 vs 2.4 Λ), Kuramoto–Sivashinsky as a 5-mode Galerkin truncation
   at L=22, 10 real vars (dt.1 λ.050, delta, spf 2 — L=18 collapses,
   L≥26 under-resolves, 22 is the honest chaotic truncation), and
   Mackey–Glass τ=17 (DDE, visible x only, sample Δ=1; lags 4 × stride
   6 spans the delay; λ.0051; so weakly chaotic every model tracks ≥4 Λ;
   display = classic delay embedding, each line embeds its own
   trajectory via per-line proj rings). The registry parameterizes
   dims/lags/stride/poly/delta/normalization/clamps/projection/
   steps-per-frame; valid-time phase windows and sustain scale with each
   system's Λ (W≈0.09Λ, sustain≈0.25Λ); switching resets models AND the
   camera to the canonical view; the InitVariance slider was REMOVED
   (iv fixed at 100 — flat response in the washout regime). FOUR models
   learn side-by-side from the same stream — NGRC, a cyan **ESN** (the
   finger tab's 100-neuron recipe, input dim = system dim, online-RLS
   1-step readout — the literature's canonical NG-RC-vs-reservoir
   head-to-head), a magenta **MLP** (shared `mlpCore`, input = the SAME
   lag/stride tap window NGRC uses, online Adam + stored-pair replay),
   and a classical **linear ARX** — near-tied 1-step errors
   (rows for all four, PAIRWISE-scored on the same instances so the shared
   denominator stays honest; preds reset at dream boundaries so no scoring
   across the gap) — then "Dream" free-runs ALL of them while **reality
   keeps running in green**: amber NGRC keeps the butterfly, cyan/magenta/
   red collapse or park (the shared reservoir is snapshot-restored on wake;
   the stateless MLP needs nothing); the dream-check row counts wing
   crossings per model and the Plotly trace follows every series in both
   modes. Measured at the gate: 1-step errors 0.0067 / 0.0079 / 0.044 /
   0.0064 (NGRC/ESN/MLP/ARX) — then dream wing crossings 9/0/0/0, the
   whole point of the tab in one row. A **Valid time (Λ)** row scores the
   crossover itself: each free-run starts from reality's exact state and
   stays "valid" until its distance to the NEAREST reality point within
   ±5 steps (±0.1 s — the finger tab's phase-tolerant convention)
   exceeds 0.4× the attractor's fluctuation scale (tracked online, not
   hardcoded) for 14 CONSECUTIVE steps (0.25 Λ), frozen at excursion
   start; reported in Lyapunov times (λ≈0.906 → 1 Λ ≈ 1.10 time units ≈
   55 steps at dt=0.02; counted in sim steps so the Speed slider
   doesn't skew it; "≥x…" = clock still running, persists after waking,
   resets on the next dream; verdicts lag 5 steps for the phase
   window). The strict instantaneous first-crossing was user-verified
   too harsh — the dream still visibly tracked when the clock froze:
   3/14 strict crossings recover and track ≥1 Λ more, because a slight
   TIME lag at a fast wing transit reads as a large instantaneous
   distance. Phase tolerance moved the mean 2.50 → 3.72 Λ (+49%);
   sustain adds the rest (3.77). Measured at the gate (3-dream means):
   NGRC ~2.3–3.8 Λ (individual dreams to ~7.5) vs ESN ~0.7 / MLP ~0.3
   / linear ~0.1 — literature territory for an online one-pass fit
   (published ~5 Λ figures are offline-tuned).
   THE DECISIVE FIX was a 250-sample WASHOUT (LZ_WASH): the library
   trains from sample 1 while autoNormalize's stats are still moving,
   so the pre-freeze RLS equations are written in shifting coordinates
   and — at lam=1.0 — stay in the exact solution forever; that capped
   the dream near 1 Λ and made weak ridge catastrophic. Feeding the
   calibration window predict-only (stats still calibrate) took valid
   time 0.78 → ~3 Λ (4×), improved the 1-step row 0.0067 → 0.0015,
   made the ridge response flat over 5 decades (initVariance default
   now 100), and wing rate ≈ reality at every anchor (~60/5k vs 65).
   NGRC/ARX also gained attractor clamps. Rejected with data: poly 3
   (tracked longest pre-washout but its cubic terms learn spurious
   attractors that kill the butterfly), more lags (hurt), delta
   targets (no gain), decimated dt (hurt), forgetting (neutral),
   training-noise dither (its +40% was a partial workaround for the
   missing washout — post-washout it only hurts, and it degraded the
   displayed 1-step tracking 6×, which is why it was reverted), and
   direct-horizon rungs anchored at the crossover (0.25 Λ — each long
   rung is an independent noisy readout; iterating tracks far longer).
   THE RIDGE IS NOT UNIVERSAL — CONSERVATIVE SYSTEMS NEED A TIGHTER ONE,
   and getting this wrong cost the double pendulum most of its run. The
   app hardcoded initVariance 100 for every system on the strength of
   the Lorenz measurement ("flat over 5 decades"). That flatness is a
   property of LORENZ, not of the library: Lorenz is DISSIPATIVE, so any
   error that pushes a free-run off the butterfly gets contracted back
   onto it, and a loose ridge is forgiven. The double pendulum CONSERVES
   ENERGY — there is no attractor and nothing contracts anything — so
   the same loose ridge produced a roll-out that pumped energy and
   saturated the ω clamps within ~10 steps. Measured in the app,
   12-run batches: NGRC 0.24 → 0.64 Λ (2.7×) from `iv: 0.1` alone;
   in the offline harness, selecting on 10 initial conditions and
   REPORTING on 12 disjoint ones, 0.248 → 0.596 Λ (2.4×, paired
   t 2.90, wins 10/12).
   THE DIAGNOSIS OVERTURNED THIS FILE'S OWN EXPLANATION. The previous
   entry said "trig/rational dynamics defeat the polynomial basis" —
   that is FALSE. The held-out ONE-STEP fit is excellent (nRMSE 5.9e-4
   cosθ₁ / 9.6e-4 sinθ₁ / 1.9e-2 ω₁), because two lags of [cos,sin,ω]
   implicitly carry the 1/(3−cos2Δθ) denominator. The basis represents
   the map fine; ITERATING it was broken. The evidence that separates
   cause from consequence is the drift at FIXED free-run steps: energy
   is 3% off at step 1, **149% off by step 5** and 1259% by step 10,
   while the valid clock only dies around step 20 — so the energy
   blow-up PRECEDES the collapse. The cos²+sin²=1 drift is a symptom,
   not the cause (still only 1.3% off at collapse), which is why the
   obvious first guess — projecting each (cos,sin) pair back onto the
   unit circle — did NOTHING: 0.29 → 0.28 Λ.
   IT IS OVER-FITTING, NOT UNDER-TRAINING, and the 2×3 grid separates
   them: at iv 100 the window buys 0.248 → 0.339 → 0.373 Λ (w 1800 →
   6000 → 16000) while at iv 0.1 it starts at 0.596. Nearly 9× the
   data cannot rescue the wrong ridge.
   WHAT THIS DOES TO THE ESN CLAIM: the old entry said the ESN
   "legitimately wins" here, and against the shipped ridge it did —
   2.95×, NGRC winning 1/12 initial conditions. At the corrected ridge
   the race is a TIE (ESN 1.23× at a matched window; NGRC 1.40× with a
   longer one, but only 6/12 initial conditions, so the mean is driven
   by the tail — call it tied, not won). The ESN's win was mostly a
   ridge artifact. NOTE the noise floor that keeps this honest: the ESN
   is untouched by the change yet moved 0.44 → 0.57 between two 12-run
   batches, so ±0.13 is batch-to-batch variance and NGRC's +0.40 is
   ~3× that.
   THE POLY-2 EXPANSION IS NOT WHAT CARRIES THIS SYSTEM. At both
   ridges poly 2 and poly 1 are statistically indistinguishable on the
   reporting set (0.248 vs 0.307, paired t −0.83; 0.596 vs 0.616,
   t −0.18). The linear ARX rival was in fact BEATING NGRC before the
   fix (0.56 vs 0.24 in the app). The rival therefore gets the SAME
   per-system ridge — it differs in poly order and nothing else, which
   is what makes the race like-for-like.
   NOT SHIPPED, and stated so it stays visible: an ENERGY PROJECTION
   (rescaling ω each free-run step to conserve the initial total
   energy) roughly doubles it again — 0.58 Λ at the shipped ridge,
   1.25 Λ combined with the tighter one. It uses the true Hamiltonian
   with the true m, l, g, i.e. physics no other system on the tab is
   given, so shipping it silently would break the tab's black-box
   contract. It belongs as an explicitly labelled physics-informed
   variant or not at all.
   Rejected with data on the pendulum: unit-circle projection (0.28 vs
   0.29), poly 3 (0.17, much worse), delta targets (0.45), more lags
   (flat), stride 2 (flat).
   Not suspects, checked: real-time determinism (stepping is
   per-sample, RAF timing never enters the math), precision (float64
   end to end), and the off-attractor [1,1,1] start transient (measured
   immaterial). THE LIVE-ONLY DEGRADATION (device testing stuck at
   ~1–1.5 Λ until huge training) was DREAM/WAKE POISONING: waking
   restores the model's snapshot but reality ran ahead during the
   dream, so the first post-wake training equations paired pre-dream
   lag windows with post-teleport targets — full-attractor-scale
   inconsistency, permanent at lam=1.0, accumulating with every dream
   (measured: 8 cycles cut valid time 1.17 → 0.39 Λ). Fixed by a
   5-sample RE-ENTRY WASHOUT on wake (predict-only until the lag
   history refills; rivals' stale pairings dropped too) — repeated
   dreams now leave training unharmed (endurance test: 9 cycles, mean
   1.97 Λ and rising). Delta targets were re-checked in the clean
   regime and still lose at 12 anchors (their 6-anchor win was noise).
   Valid times remain anchor-dependent (~0.5–8 Λ spread, means ~2–3);
   individual anchors reach 5–8 Λ, so cross-project comparisons must
   match threshold convention and anchor counts before comparing
   headline numbers — the row therefore also shows "best N.N", the
   luckiest crossover since reset. THE AFM RECIPE was investigated
   (universal map with cross-variable quadratics + ReLU/Fourier,
   structured prior {lin:100, quad:100, rand:1}, directional
   forgetting — the elements that beat this on another project's
   plant): measured equal to poly-2 at every training length
   (1200→16000 samples) at ~10× the compute, because Lorenz's dynamics
   are EXACTLY quadratic and Continuous poly-2 already contains all
   cross-variable quadratic terms — the richer basis only adds
   variance; directional forgetting is a no-op on this stationary
   fully-excited stream. Both are real levers on plants that are
   non-polynomial or non-stationary; on textbook Lorenz the plain
   quadratic basis is the optimum. Not shipped.
   A **Noise slider** (off, else 0.01–10% log) adds zero-mean Gaussian
   OBSERVATION noise to the stream every model sees, scaled to the
   attractor's per-variable RMS: the plant integrates cleanly, free-runs
   seed from the last OBSERVATION (what the models actually know), and
   every score is computed against the CLEAN trajectory — so noise
   degrades what the models know, never what they're judged against.
   **BATCH / statistics mode** (Run batch ▶ + Runs 2–50 + Start delay
   log slider) automates the whole experiment: each run re-initialises
   the models but NEVER rewinds the plant (it evolves continuously
   across runs, so each run necessarily starts from a different
   attractor point), advances a further `250+20 + delay ±50%` samples
   with the models watching predict-only, trains exactly the window,
   free-runs until EVERY model's valid-time clock has stopped (12 Λ cap,
   censored runs flagged), records per-model valid times + 1-step
   errors, and repeats. It runs TURBO (per-frame time budget instead of
   the Speed slider — 5 runs in ~2 s) and reports mean/sd/median/range
   per model plus the experimental-vs-best-baseline ratio in the
   summary. Measured 8-run means on Lorenz (window 1800): NGRC 3.7 Λ vs
   ESN 0.9 / MLP 0.7 / ARX 0.6 clean, holding to ~1% noise (4.7/1.5/
   0.4/0.8) and degrading at 3.3% (2.8/0.8/0.5/0.4); a 50-run batch
   measures NGRC 4.1 Λ (sd 2.1) vs ESN 1.0 / MLP 0.6 / ARX 0.6.
   INDEPENDENCE BUG (fixed, v89): batch runs used to call `makeModel()`,
   which rewinds the plant to its fixed initial condition — with
   deterministic integration every run replayed the SAME trajectory, so
   the only entropy was the randomised delay LENGTH, and that was
   floored by `max(LZ_WASH+20, …)`, erasing it entirely for delays
   below ~270. Result: N "independent runs" returned one identical
   number (measured sd = 0.0000 over 8 runs; the user saw ~0.01 over
   50). Fixed by `makeModel(keepPlant)` — batches reset the models only
   — plus making the calibration floor ADDITIVE so the ±50% always
   applies. Regression test asserts all-distinct runs and sd > 0.1 Λ at
   delay = 0. NOTE the Reset handler must be `() => makeModel()`: the
   click event object is truthy and would silently keep the plant.
   Also fixed here: a
   long-standing unbounded growth of the Plotly source arrays (only the
   last 160 samples are ever drawn; now trimmed in chunks).
   **Pause ⏸ / Resume ▶** freezes the plant and every model exactly where
   they are — no stepping, training, scoring, or valid-time clock
   advance (the fractional step accumulator is dropped so resuming can't
   burst) — while rendering and the camera stay live so a frozen dream
   can be orbited and inspected; Reset always unpauses. **Clear charts**
   erases the drawn trajectories and the time-series only: models,
   weights, training counts and scores are deliberately untouched (a
   view operation, not a reset).
   An **Experiment summary** block below the chart writes a paste-ready
   methods + results text (6 sections: SYSTEM / TASK AND SIGNALS /
   MODELS / PROTOCOL / GRADING / LATEST RESULT) generated entirely from
   live state — equations and parameters, dt, the measured λ and its Λ
   conversion, the exact signal vector, lag/stride window and feature
   count, the baselines' hyperparameters, the washout + manual-window
   protocol, both grading definitions with the live phase/sustain
   windows, and the last free-run's valid times, 1-step errors and
   oscillation counts. NGRC is called "the experimental model" and is
   deliberately a BLACK BOX: no architecture, feature construction,
   lag/stride window, target convention or fitting details appear
   anywhere in the text — the summary states plainly that they are
   withheld (so the omission is transparent, not misleading) while the
   three baselines stay fully specified and the protocol/grading stay
   fully reproducible. A leak-audit regression greps the rendered text
   on all seven systems (and after a batch) for architecture terms;
   keep it passing when editing the generator. This lets the text be
   pasted into papers or AI chats for comparison against other
   researchers' numbers without disclosing the method; it refreshes at 1 Hz and has a Copy button (clipboard API
   with an execCommand fallback).
   A **Speed slider (0.05–1×)** scales
   sim steps per frame via a fractional accumulator (0.05× really is 20×
   slower); drop it right at the Dream switch to watch the crossover in
   slow motion — every model tracks reality for a while, then diverges
   at its own pace. Survives Reset; verified 231→24 steps/s at 0.10×.
   MANUAL TRAINING LIFECYCLE: the attractor runs fully dynamic while
   all four models watch predict-only (normalization calibrates on real
   attractor data during idle — a 250-sample washout gates the Dream
   button only); **Start training ▶ / ⏸** opens and closes the training
   window at will, a **Training window slider** (log scale 0–20000,
   default 1800; measured knee ≈ 800 — full Λ from ~550 trained
   samples, dead flat to 20000) sets the target, and an **auto-dream
   checkbox** fires the Dream itself the moment the window is reached
   (training stops first, so the wake stays stopped; a manual dream
   taken mid-training resumes training on wake). lzTrainedN counts ONLY
   actually-trained samples — idle, washout, and post-dream re-entry
   never count — and the ESN/MLP train in exactly the same window
   (reservoir/lag state stays live while idle, weights don't move).
   Verified: idle trains nothing, slider maps log-style (47→200),
   auto-dream fires within a few samples of the window, stop freezes
   the count while the attractor keeps running. A **Trained row** shows
   trained samples AND Lyapunov times (N/55.2; the window label shows
   its Λ equivalent too), and a **Sim rate row** shows the measured
   steps/s + Λ/s — the Lorenz sim is FRAME-RATE COUPLED (4 steps per
   display frame × Speed slider, each step dt=0.02 model time; ~240
   steps/s on 60 Hz, ~480 on 120 Hz, headless CI ~175): per-sample math
   means refresh rate changes wall speed only, never results),
   **② soft-sensor** (drag/kick the blue motor; a soft lightly-damped coupling
   makes the hidden load lag and ring. THE PLANT IS DELIBERATELY NONLINEAR —
   a textbook linear plant is precisely where a Kalman filter is provably
   optimal, so the old demo was showing the learner at its worst. Added:
   **Stribeck friction** on both masses (stiction 0.9 / 0.20 breaking away to
   Coulomb 0.55 / 0.12 at Stribeck velocity 0.05 / 0.04 — the canonical
   unmodelable term), **backlash** ±0.02 in the coupling (inside it NO force
   is transmitted and the load free-flies), a **hardening spring**
   f = k·d + 35·d³ (which is also what breaks the algebraic shortcut),
   **cogging** ripple 0.55 at spatial period 0.22 (a deterministic function
   of motor position no linear state model can carry), and **encoder
   quantisation** 0.002 on the measured motor position. The autonomous drive
   was softened to 3.6/1.5/0.9 because the cubic spring transmits far more
   force at large deflection and was pinning the load against its end stops
   (18% → ~11% of samples). Plant-health counters (backlash-engaged,
   Stribeck-regime, end-stop fractions) are exposed and ASSERTED, so a future
   edit cannot silently neutralise the nonlinearity and revert the demo to a
   linear plant. THE SENSOR NOW USES THE LIBRARY'S **UNIVERSAL MAP** (bias +
   linear + quadratic + ReLU + Fourier, structured prior {lin 100, quad 1,
   rand 1}) on a 4-lag × stride-6 window: 16 base terms → 169 features,
   ~85 µs/sample (~2% of a core). Measured on the nonlinear plant: lean
   LINEAR features 0.037, universal map **0.018**; a 6×5 window (341
   features) is 4× the cost and WORSE (0.025) — more basis than the data
   supports is just variance. THE COST IS DATA: the 169-feature basis ties
   the filters for the first ~1200 adapt samples (~10 s) and leads by 2–5×
   from then on, so the regressions assert the win on a SAMPLE COUNT rather
   than at a wall-clock moment. Measured live once trained: NGRC 0.008 vs
   exact-linear KF 0.021 / engineering KF 0.026 / algebra 0.026 / lag filter
   0.135, and up to ~9× while the operator is dragging, where the
   nonlinearity is most excited. Amber `SoftSensor` caret vs a green
   **KALMAN FILTER** caret — the FAIR baseline, since for a linear plant the
   Kalman filter is the OPTIMAL state estimator and the old auto-tuned
   lag-filter bank was a straw man (it stays in the rows for scale only, and
   is off the stage). Four states (x₁,v₁,x₂,v₂) propagated by the plant's own
   semi-implicit integrator, driven by the known force, corrected by the
   measured motor position (C = [1 0 0 0]), symmetrised covariance, state
   clamped to the travel limits. TWO versions, and the pair is the whole
   point. On the LINEAR plant the EXACT filter was an ORACLE — measured
   **0.0000** nRMSE, exact to numerical precision, because a noiseless
   observable linear plant is precisely what a Kalman filter solves. On the
   NONLINEAR plant it is no longer an oracle at all (~0.021): it is merely
   the ceiling for a linear model, since it cannot represent friction,
   backlash, the cubic spring or cogging. That change is the entire point of
   making the plant realistic. The ENGINEERING filter carries the model a
   practitioner actually has: **masses and spring stiffness exact** (off the
   datasheet / CAD) but **friction and damping NOT MODELLED AT ALL**
   (b₁ = b₂ = c = 0), because nobody has those numbers on a real machine.
   Its noise settings are TUNED by sweep (q 1e-9…1e-1 × R_f 1e-6…1e1;
   shipped q 1e-5, R_f 1e-1) — untuned it scores 0.062 and would have been a
   fresh straw man, since raising the process noise is exactly how an
   engineer makes a filter lean on its measurements instead of on dynamics
   it does not know. Tuned it lands at ~0.017 against the learner's ~0.003.
   The headline row is NGRC vs the ENGINEERING filter (like-for-like:
   neither was given the damping) and it renders "N× worse" honestly if the
   learner loses. The forecast row is scored
   against the exact filter's OWN 1 s prediction — its state estimate rolled
   forward on a HELD input, since the operator's future force is unknowable
   to it too — and the learner WINS there (~1.2–1.9× live), because it has
   learned how the drive and the drags actually evolve instead of assuming
   the force is constant. Measured offline on a realistic drive/drag/kick
   stream: estimate 0.0000 (exact KF) / 0.0051 (learner) / ~0.017
   (engineering KF); 1 s forecast 0.1685 / 0.2081 / ~0.25 — but DURING A
   DRAG 0.2495 / 0.1756 / ~0.34, where the learner beats even the exact
   filter.
   A **MANUAL-MODE BIT** is routed as a fifth signal — whether the machine
   is running its program or being jogged by hand, which any real controller
   knows and which costs nothing to route. Given it, the model learns a
   distinct and appropriately humble response instead of extrapolating its
   program-mode map over an operator who moves far faster and more randomly
   than any drive. Measured LIVE under an identical scripted session, with
   CUMULATIVE per-regime errors (not the EWMA meters — read at one instant
   those reflect whatever the plant happened to be doing, which is why the
   earlier live A/Bs disagreed with each other): estimate 0.024 → 0.017
   autonomous and 0.111 → 0.065 manual; the 1 s forecast 0.901 → 0.735 in
   manual, which FLIPS it from losing to the exact-linear Kalman (0.97×) to
   beating it (1.20×). The autonomous forecast is unchanged (0.249 → 0.245)
   and still LOSES to that filter by ~1.37×: under the gentle autonomous
   drive the deflections are small, the plant is close to linear, and a
   filter holding the exact linear terms forecasts it well — an honest split
   worth keeping visible rather than tuning away.
   THE SAME BIT WAS OFFERED TO THE KALMAN FILTERS as a mode-dependent
   process noise (the standard engineering response). Swept over five
   decades it made them monotonically WORSE, so they do not use it; a linear
   filter has no mechanism for a regime switch short of an
   interacting-multiple-model design. The summary states that asymmetry.
   PLS IS THE BASELINE THIS TAB WAS MISSING, and it is the one that decides
   whether any of this is a product. A Kalman filter needs a physical model,
   which a real soft sensor (composition, moisture, wear) does not have; what
   the process industries actually deploy is **PLS regression on the measured
   signals** — a LINEAR latent-variable fit, trained offline on historical data
   and recalibrated by hand when it drifts. Both of its documented failure modes
   are exactly this library's two claims, so it is the right thing to be
   measured against.
   It is given the SAME lagged signal window the learner sees (5 signals × 4
   lags), so the ONLY difference is the model class. TWO variants: **frozen**
   after a 3000-sample training window (the incumbent as actually deployed) and
   **adaptive** (cross-products accumulated with forgetting, refitted every 100
   samples — the stronger, rarer recursive-PLS variant).
   IMPLEMENTED AS TRUNCATED CONJUGATE GRADIENT, which for a single response IS
   PLS: the A-component solution is the least-squares solution restricted to the
   order-A Krylov subspace (Phatak & de Hoog), so A steps of CG on the normal
   equations gives exactly the NIPALS answer. Verified against a direct NIPALS
   implementation: agreement to 2e-16 relative at A ≤ 3 and 2e-10 at A = 6. This
   form needs only accumulated cross-products and no matrix factorisation, so it
   runs online.
   THE COMPONENT COUNT WAS SWEPT so this is not a strawman — measured at 6000
   adapt samples: A = 3 → 0.168, A = 6 → 0.031, A = 12 → 0.026, A = 20 → 0.022
   nRMSE. More components is monotonically better here, i.e. the latent
   truncation only loses information, because PLS's advantage lives in the
   p ≫ n regime (many correlated sensors, few samples) and this is not that. At
   full rank it IS ordinary least squares on the lag window — the strongest
   linear model available on these signals — and that is what it ships as.
   MEASURED (nRMSE against the true hidden load, same instances, same decay):
     adapt samples   NGRC     PLS frozen   PLS adaptive   engineering KF
        1548        0.0091       —            0.0329         0.0308
        3526        0.0063     0.2438         0.0196         0.0313
        6006        0.0068     0.0250         0.0222         0.0440
        9028        0.0144     0.0825         0.0362         0.0824
       13018       0.0092     0.0494         0.0153         0.0181
   The learner is **1.7–3.6× better than the fully-tuned ADAPTIVE linear model**
   and 3.7–5.7× better than the frozen one. The 0.2438 immediately after the
   freeze is the incumbent's whole problem in one number: a model fitted on
   history meeting an operating regime the history did not contain. That gap
   between frozen and adaptive is the drift argument, measured rather than
   asserted, and it is worth as much commercially as the nonlinearity argument —
   recalibration is the documented reason industrial soft sensors get abandoned.

   ARCHITECTURE, MEASURED AND REJECTED for the 1 s forecast: a TWO-STAGE
   design (`Continuous` + `directHorizons` forecasting the whole measured
   lag window at horizons 82/88/94/100, then pushing that predicted window
   through the sensor's own map) scores 0.155 against the direct readout's
   0.156 — identical; and a CONTROLLER LOOK-AHEAD (the commanded force at
   t+1 s, what a motion-controller look-ahead buffer actually holds) scores
   0.159, i.e. nothing, because this drive's phase is already recoverable
   from history. The reason nothing helps is the CEILING: batch least
   squares fitted offline on the TRUE plant state AND the future command,
   with quadratic features, scores 0.133 — the shipped readout is at 1.17×
   that. What is left is the plant's own unpredictability, which is exactly
   what stick-slip and backlash buy you a second out.
   ALL MODELS NOW READ THE **COUPLING FORCE** (f = k(x₁−x₂) + c(v₁−v₂)) as a
   fourth signal — what a load cell or torque transducer on the shaft gives
   you. It helps the learner 2× (estimate 0.0101 → 0.0051) and the Kalman
   filters take it as a second measurement row. But it carries the hidden
   state: since k ≫ c, **x₂ ≈ x₁ − f/k**, and that ONE-LINE ALGEBRAIC
   SHORTCUT — no model, no learning — scores **0.0175**, better than the
   untuned engineering filter. So it is shipped as its own reported baseline
   (row + on-stage text) rather than left implicit: adding a sensor that
   nearly solves the task and then not saying so would make every other
   number on the page look better than it is. The learner still wins, ~6×
   over both the engineering filter and the algebra. A first attempt at this baseline scored the exact filter at 0.132
   and was WRONG (missing covariance symmetrisation and no state clamp); the
   tell was that theory says it must be near-exact, so it was debugged
   against a numerical Jacobian and a clamp-free stream rather than shipped.
   A dedicated regression now asserts the exact filter really is an oracle
   (< 1e-3) and the identified one really is degraded, so this baseline can
   never silently rot back into a straw man. Plus a 5-trace Plotly chart.
   Plus PREDICTIVE soft-sensing (finger-tab
   payback): a violet hollow dashed "+1s" caret previews where the load
   WILL be in 1 s. It is now a **SECOND TARGET of the same `SoftSensor`**
   (SS_PREV_H=100 samples) rather than a hand-rolled readout on its own
   25-term linear basis: target 0 is the load NOW, target 1 the load in
   1 s, and the block's 169-term universal-map expansion is computed
   ONCE per sample and shared, so the forecast costs one extra RLS
   update and NO extra feature expansion. The block owns the map, the
   frozen standardisation, the structured prior, the weights and the
   output clamps (±2.05, the travel limits — the Kalman filters are
   clamped the same way); only the PAIRING is local, because
   `SoftSensor.adapt()` can express a contemporaneous pairing only.
   Feeding a horizon needs features from H samples ago against the
   target that has just arrived — exactly the `featRing` mechanism
   `Continuous` already uses for `directHorizons`; `SoftSensor` has no
   equivalent yet, so the ring lives in the page. (Adding
   `directHorizons` to `SoftSensor` — ~15 lines mirroring `Continuous`,
   opt-in and default-off — would move it into the library; not done,
   because it touches a port with golden-vector parity tests.)
   NOTE `estimate()` is deliberately NOT called: it recomputes the
   feature vector internally, which would double the cost and lose the
   whole point of sharing the expansion. Measured live at MATCHED
   training age, the bigger basis is WORSE early and BETTER once
   trained — 0.096 vs 0.059 at age 500 and 0.143 vs 0.074 at 1500, but
   0.041 vs 0.056 at 3000, 0.186 vs 0.216 settled, and 0.235 vs 0.256
   while interacting (excluding the first cycle, where the error meter
   itself has just restarted in both builds); the advantage over the
   Kalman forecast goes 1.05× → 1.26×. So the WARM GATE was raised
   300 → 2500 trained pairs, placed past the crossover so the displayed
   forecast is never the worse of the two — the cost is that the violet
   caret appears ~25 s in rather than ~3 s, stated live as
   "warming N/2500". Scored OUT-OF-SAMPLE:
   each prediction is stored at make-time and judged when its target
   arrives, before that pair trains. Baseline: **persistence** ("the load
   stays put"), the standard honest forecasting reference — a ringing
   load makes it genuinely bad. MANUAL SWITCHOVER: the sensor trains
   (adapts toward truth) until the user locks it — the 🔒 button stays
   disabled through calibration and until minimally ready (≥400 adapt
   samples, "minimally ready ✓" in the Mode row), then "Switch to
   estimation 🔒" freezes the sensor readout, the preview readout, AND
   the lag-filter bank's truth-peeking auto-tune selection;
   "Resume training ▶" toggles back, Reset re-calibrates. Recent-error
   meters restart at every switch so scores judge the current mode only
   — the point: excite the plant fully (or don't) before locking and
   see what showing it the full dynamics was worth (verified: locked
   after gentle-drive-only training, the estimate generalizes — near-
   linear plant — but the frozen preview drops to ~1× vs persistence
   on unseen kicks/drags). Rows: "Preview +1 s (NGRC)" /
   "Persistence +1 s" / "Preview advantage"; chart trace "preview (made
   1 s ago)" aligned at its target time. ON-STAGE VERIFICATION: a solid
   violet "made 1s ago" caret (upper row, drop-line to truth) is the
   matured prediction landing NOW — glued to the block = the preview
   came true — plus preview/persistence meter bars in the same visual
   language as the sensor pair, with their own ×-better readout.
   PREVIEW WINDOW — A REVERTED "FIX" (v91 → v92), kept here because the
   method mistake matters more than the code. v91 widened the readout's
   history window from 0.26 s (6 lags × stride 5) to 3.3 s (12 × 30) to
   match the load's ~2.8 s ring period, added the sensor's OWN estimate
   as a 4th input signal, switched to delta targets and lightened the
   ridge. Offline over 24k samples of a stationary trace it looked like
   a 3× win (drive 0.212 → 0.070 nRMSE, kicks 0.247 → 0.084). **The
   user reported it was way worse, and it was.** A live A/B harness
   (`scratchpad/ss-ab.mjs`: identical scripted interaction — 6 cycles of
   drag + kick — driven against each build) measured, on the metric that
   matters, the INTERACTING regime: short window 0.338 nRMSE / worst
   cycle 0.42, long window 0.486 / worst cycle **1.02**, and a
   1 s-window variant 1.019 / worst **3.99**. Cause: real use is short
   abrupt regime switches (drag → release → kick), not a stationary
   drive; a 3.3 s memory carries stale context across the switch and the
   delta base (anchored on the sensor's estimate) amplifies it. Reverted
   to the v90 configuration exactly — 6 lags × stride 5, 3 signals,
   absolute targets, iv 10 — re-measured live at 0.361 / worst 0.514 /
   settled 0.205, i.e. v90 within run noise. THE RULE: optimize in the
   regime the thing is actually used in; an offline sweep on a
   stationary trace is not that regime.
   PREVIEW, PROPERLY DIAGNOSED (v93). The revert removed a regression
   but fixed nothing, so the readout was measured instead of tuned, on
   a realistic drive/drag/kick stream (`scratchpad/ss-diag*.mjs`). Two
   reported symptoms, two findings, and they are not what they looked
   like. (1) The "bias" is not an offset — the bias weight is 0.010 and
   the amplitude is right (shrinkage 0.97). It is a LEAD DEFICIT: the
   issued forecast best correlates with the truth at 90 samples, not
   the 100 it is trained for, so it predicts 0.90 s while claiming
   1.00 s, which reads as the caret sitting short whenever the load
   moves. (2) The jitter is real — the forecast is 2.27× rougher than
   the load itself. BUT BOTH ARE PROPERTIES OF THE OPTIMAL PREDICTOR,
   NOT DEFECTS: batch least squares fitted offline on the TRUE plant
   state (x₁, v₁, x₂, v₂, u) shows the SAME lead 90 and the SAME 2.23×
   roughness, because shrinking and staying rough is what least squares
   should do when part of the target is unknowable. That oracle scores
   0.215 nRMSE; the shipped online readout scores 0.208 — it is AT the
   linear ceiling, so there was never anything to win in steady state.
   THE REAL DEFECT WAS THE TRANSIENT: a fresh readout ran at 0.49
   against a converged 0.20, and every session starts there, so the
   transient is the whole user experience. Fixed by a WARM GATE — no
   forecast is displayed or scored until the readout has genuinely
   trained (300 updates, not the previous 40, which was the middle of
   the RLS excursion); the row reads "warming N/300" so the gate is
   stated rather than hidden. Measured live at MATCHED training age:
   0.899 → 0.423 at age 500, 0.423 → 0.362 at age 1200, tied by 2500.
   Rejected with data, all of them: input standardisation (moving stats
   under an exact-RLS fit are strictly worse than none — bias +0.29;
   frozen stats merely tie the gate and cost converged accuracy
   0.196 → 0.206); a predict-only washout (a washout protects against
   statistics that MOVE, and with no standardisation nothing moves —
   measured 1.52 fresh, 3× worse, so the Lorenz-tab analogy does not
   transfer); averaging a ladder of horizons (roughness 2.27× → 1.28×
   but error 0.208 → 0.251, proving the roughness is signal); output
   low-pass (0.208 → 0.280, and it eats the lead); forgetting and
   directional forgetting (neutral to worse); ridge strength (flat);
   declining to train on pairs whose horizon overlaps a touch — the
   "don't learn the unlearnable" idea — which barely helps the drive
   (0.230 → 0.216) and wrecks the drag (0.180 → 0.436), so those
   targets are partly learnable after all; and POLY 2, the library's
   signature expansion, which this readout has never used: batch liked
   it (0.197 → 0.185) but online the 19 → 190 feature jump is
   catastrophic (fresh 2.02 drive / 5.91 interacting) and worse even
   converged, at 24× the CPU.
   A MEASUREMENT LESSON worth as much as the fix: the first live A/B
   read its meters at fixed WALL-CLOCK times, so builds landed at
   different training ages and different phases of the drive — its
   persistence baseline swung 0.58 → 1.09 between runs, which is a
   property of the trajectory and of no model. It could resolve the v91
   regression (a 3× effect) but reported this change as a regression
   when it is an improvement. `scratchpad/ss-ab2.mjs` gates every read
   on training age instead; compare builds at matched age.
   The honest remaining limit stands and is now quantified: during a
   drag the future input is unknowable by construction, so the ~2.8×
   interacting advantage is near the ceiling while the autonomous-drive
   advantage is ~7×. One unexploited lever remains — a long history
   window infers the deterministic drive's phase and is worth ~10%
   offline-converged (0.208 → 0.190) — but it is exactly what v91
   shipped, and it is unsafe in the transient, so it stays out.
   An **Experiment summary** block below the chart mirrors the Lorenz
   tab's (6 sections, Copy button, 1 Hz refresh, same BLACK-BOX
   contract — plant/signals/baselines/grading fully specified, the
   experimental model's internals withheld and stated as withheld). It
   documents both tasks (present-time estimate, 1 s forecast), both
   baselines — the exact and identified Kalman filters (stated plainly
   as oracle vs like-for-like), the lag filter's truth-peeking
   advantage, and persistence — the lock protocol, the warm gate, and
   the out-of-sample scoring rule), **③ finger-trace** (draw loops at ~20 Hz
   sampling; an optional **tracing guide** selector overlays one of 10 faint
   stencil shapes — circle/ellipse/square/triangle/hexagon/star/figure-8/
   heart/rose/lissajous — purely visual, never read by any model, default
   none; amber NGRC ghost vs a gray **analogue k-NN** rival (Lorenz's
   method of analogues: ONE COHERENT tracked match — nearest past
   (position, stored-EMA-velocity) moment of the multi-stroke log, advanced
   in lockstep each sample, re-locked only on 3× hysteresis or running out
   of displayed future, with BEST-EFFORT eligibility (require the
   displayed horizon of recorded future when the memory has it, else as
   much as the memory allows — a short memory at a long slider setting
   used to leave no eligible match and the gray ghost collapsed to the
   straight-line fallback ray) — serves the whole rung ladder: pred(h) =
   past[j+h] + (now − past[j])·0.88^h — the current match offset DECAYS
   onto the replayed path with the SAME schedule the NGRC path ghost
   uses (carrying it undamped to every horizon hurt the analogue at
   long rungs and quietly inflated NGRC's on-path advantage); targets
   ±1-sample smoothed. Per-rung independent
   argmins under real finger tremor picked DIFFERENT past laps per rung and
   the ladder zigzagged into scribble. It replays pen lifts too (exact
   brkAt flags from the history's own lift markers); straight-line survives
   only as its cold-start fallback, fallback rungs are excluded from the
   analogue's score, and the drawn gray ghost is the analogue's FULL
   per-step replayed segment out to the slider horizon (nulls at
   replayed lifts), not sparse rung chords. Head-to-head scoring is PAIRWISE: the SHOWN ghost and the
   analogue are judged on the same prediction instances, only on rungs the
   ghost actually displayed — anything else poisons one side with warmup
   the other never served), plus a cyan **ESN benchmark** (echo state
   network — the classical recurrent NN that NG-RC was designed to
   replace, the canonical rival of the NG-RC literature: N=100 sparse
   reservoir, spectral radius 0.9 via power iteration, leak 0.3, input
   scale 0.3 — tuned offline, response flat around this — driven by the
   SAME 4-var state stream; per rung a [1, state, reservoir] readout
   trains online by shared-P RLS λ=0.9995 on the same direct targets.
   ESN rows: its own miss + a "NGRC vs ESN" ratio that is LIKE-FOR-LIKE
   — the library's raw DIRECT readout vs the ESN (same inputs, targets,
   RLS; only features differ), gated only on the ESN readout being warm
   (>40 trainings). The SHOWN ghost is deliberately NOT the ESN's
   opponent: once locked it is the phase-domain pipeline whose
   structural prior ("this is a loop") the ESN was never given — that
   pipeline fairly races the kNN ("Ghost vs kNN" row: both exploit
   repetition), and the row tooltips state the attribution. A green
   **raw AFM** trace shows the autopilot brain WITHOUT the shape-lock
   scaffolding in both modes: in prediction it free-runs from the
   finger's own last states out to the slider horizon (manual
   predict-only rollout with a light history save/restore — θ/P are
   untouched, so no snapshots; escape watchdog ends the arc; ~0.3 ms
   per sample in the AFM CPU bucket), and during autopilot it free-runs
   as a rival trail whenever it is NOT the deployed model (when the AFM
   itself deploys, the amber trail IS the AFM — no duplicate). Verified
   visuals: on a circle the green arc rides the loop (the attractor
   training holds shape without scaffolding); on multi-stroke patterns
   it slides off the stroke and curls (a free-run cannot teleport) —
   the honest contrast justifying the path-replay deploy; cyan ghost capped at warm rungs ≤ ~1.2 s like every
   point-forecast family; ESN trace in the chart; its own CPU bucket
   (~1% of a core); freeze halts its training; Reset re-inits it.
   During **Autopilot the rivals race live**: the kNN replays its
   recording from the nearest (position, velocity) match — pen lifts
   included, re-matching when the recording runs out — the ESN
   free-runs a 1-step full-state readout (trained online alongside the
   rung readouts) from the current reservoir state, clamped, with an
   escape watchdog (the shared reservoir is snapshot-restored on
   stop), and the MLP free-runs its own 1-step head the same way.
   Verified visuals: on a circle the ESN dream contracts into a
   smaller drifting orbit (classic 1-step rollout decay) while the
   replay rides the recorded tremor; on multi-stroke patterns the
   replay lifts the pen and the ESN parks near one stroke (a free-run
   cannot teleport — same lesson as the AFM).
   Measured human-realistic steady state: NGRC ~1.1–1.2× better than
   the ESN at every horizon — the published NG-RC claim, live: a
   105-weight-per-rung polynomial model edging a 100-neuron reservoir
   at a fraction of the compute), plus a magenta **MLP benchmark**
   (a plain feedforward net — the NN everyone learns first, added as a
   reference for people who know ML but not reservoir computing: one
   32-unit tanh hidden layer on a 2-lag input window ([s(t), s(t−1)] —
   the SAME information NGRC's features are built from), a 2-output
   linear head per rung + a 4-output 1-step head, trained ONLINE by
   single-sample Adam (lr 3e-3) + experience replay — 8 random
   (moment, rung) pairs per sample from a 1200-sample state ring;
   without replay an online net forgets each rung between visits and
   lands 2–3× worse (offline sweep; response flat around this config,
   which matched the NGRC direct readouts on a human circle and edged
   them on a two-line pattern). Page rows: "MLP (feedforward NN)
   miss" + a like-for-like "NGRC vs MLP" ratio vs the raw DIRECT
   readout (same convention + warm gating as the ESN row, >40
   trainings per rung, pairwise same-instance scoring); magenta
   rung-sparse ghost, chart trace, its own CPU bucket (~1% of a core
   while drawing), freeze halts its training AND its replay-ring
   growth (frozen play must not seep into training data — but the
   prediction's s(t−1) lag comes from a freeze-immune slot, since a
   stale ring lag would degrade frozen predictions the way a frozen
   reservoir state would have degraded the ESN's), Reset
   re-inits it. During Autopilot it free-runs its 1-step head as a
   magenta rival trail — the net is stateless, so a rollout is pure
   forward passes and nothing needs snapshot-restore on stop; same
   loop-mean anchor, clamp, and escape watchdog as the ESN. Measured:
   ~1.1–1.2× behind NGRC direct at the probed rungs — honest
   same-league performance, which is the point of the reference),
   with a
   **ghost-horizon slider (0.2–20 s, geometric rungs, default 10 s)** — a
   25-rung ladder of the library's **direct multi-horizon readouts**
   (`directHorizons`) trains continuously (the original 21 rungs 4..208
   kept verbatim + 4 appended to 417 samples ≈ 20 s), so the slider needs
   no refit and the chart plots miss-vs-horizon curves over the whole
   range (dotted marker = slider). HONEST TRACES: the amber path arc
   draws the full per-step forecast to the slider horizon (no lap cap —
   wrapping the loop IS the prediction, so 5 s vs 20 s visibly differ);
   rung-sparse ghosts (ESN, MLP, fallback families) draw through midpoint
   quadratics and are validity-limited (warm/scored rungs), never
   arbitrarily capped; autopilot rival trails get the SAME 3-pt kernel
   AND the same alpha ramp as the amber trail. Because a wrapped loop
   re-inks the same pixels (raw length is invisible on a circle), the
   amber arc carries a TIME RULER — a dot every 1 s of forecast — plus
   a tip label ("10.0s ·×3.1 laps") and an alpha fade along the
   horizon; the gray replay arc gets one 3-pt smoothing pass (recorded
   tremor read as jagged ink; never smoothed across lifts). A rung can only score once its horizon
   of future has been drawn — the 20 s rung populates after ~21 s of
   drawing (physics, not a bug). Two scoring-pipeline fixes shipped with
   the extension: a dwell pause no longer flushes the pending queue (it
   silently discarded every long-horizon prediction whenever the finger
   hesitated ~0.5 s), and pend entries advance independently per rung
   (strict FIFO made every rung inherit the longest rung's 422-sample
   latency). Also: within the multi-stroke log, only EXPLICIT lift flags
   create lap gaps — `distJumps: false` — because an unflagged spatial
   jump mid-stroke is a loaded-frame sampling artifact (the finger was
   down; it did travel that path) and bridging it beats a phantom pen
   lift (commissioning's flag-less log keeps distance-based jumps). After ~8 s of doodling the ghost goes
   **path-locked** — the phase-domain rethink: a doodle factors into a PATH
   (kept as a fresh resampled loop, refreshed every ~1 s, first-peak
   autocorrelation for the lap length) traversed at a PHASE RATE, so the
   finger's phase is tracked PLL-style on the loop and an NGRC readout
   (library `rls`/`predict` primitives on lagged speed + phase-Fourier
   features) learns the tempo-vs-phase profile — you slow at the same
   corners every lap. Prediction = advance phase along the loop (transverse
   offset decays on), so it lands ON the future stroke by construction.
   Per-rung best-of (rolled / direct / path-locked, judged by live-tracked
   misses) is what the ghost draws. The **on-path miss** stat (untimed:
   distance from the prediction to the stroke actually drawn over the
   horizon) scores the shown ghost against the analogue. Honest
   human-realistic steady state (jitter + tempo random-walk, measured
   headless): the race is TIGHT — at 1.2 s the analogue is slightly
   ahead (its velocity-matching picks analogues at the current tempo);
   at 10 s NGRC wins (~1.2× timed, ~1.4× closer on-path, ~2× less
   error energy). On metronome-perfect machine traces the analogue is
   near-optimal by construction — don't panic-tune against that
   regime. Sub-10× ratios display with one decimal. A **CPU load** row
   (refreshed each second) splits main-thread time as % of one core:
   AFM (cyclic pump + autopilot stepping + commissioning) / kNN (the
   analogue baseline) / ESN (reservoir + readout training) / MLP
   (feedforward training + replay) / app (everything else in the frame
   loop). Typical while drawing: AFM ~20% (the pump's designed
   3 ms/frame budget), kNN ~0.1%, ESN ~1%, MLP ~1%, app ~10%.
   An **Experiment summary** block below the chart completes the set (all
   three tabs now have one): 6 sections, Copy button, 1 Hz refresh, same
   BLACK-BOX contract — the task, the signals, all three baselines and both
   grading rules fully specified, the experimental model's internals withheld
   and stated as withheld. It is the most different of the three because the
   "plant" is a HUMAN: no equations, non-stationary, with tremor, drifting
   tempo and pen lifts, so the SYSTEM section describes the sampling cadence
   and arc-length resampling instead of dynamics, and states that the stencil
   guide is never shown to any model. It reports the live rung (following the
   horizon slider), the lap-lock/autopilot/freeze state, and both measures —
   the TIMED miss and the ON-PATH miss — against all three baselines, noting
   that a metronome-steady machine trace flatters the analogue by
   construction. Before enough has been drawn it says so plainly rather than
   printing zeros.
   The resample step is clamped to [0.03, 0.05]: the floor keeps slow
   careful stencil-tracing from drowning the fit in ridge (tiny deltas)
   or blowing the fit window past one lap. Iterating the 1-step model
   compounds its error, a known-poor mode shown explicitly as a third series —
   and the model state uses the EMA velocity, not the raw one-sample diff,
   so finger tremor isn't a prediction target. Plus **Autopilot**: with brain=auto
   and a locked path it deploys INSTANTLY as a **path-locked replay** — the
   phase-domain engine draws the user's own stored loop at their learned
   tempo (crisp corners, exact geometry, cannot decay) while the
   straight-line "autopilot" is a dashed ray off-screen. The AFM brain now trains **continuously (cyclically)** in the background
   over the locked loop (~3 ms/frame budget, noise-hardened) — the
   library's continuous-training idea — so brain=AFM deploys **instantly**
   from the always-warm model (fallback: commissioned on demand when no
   loop is locked). The cold-start fallback is a short AFM-only sweep: the drawn path is arc-length-resampled to
   constant speed (kills the stall fixed points that corner dwells/tremor
   teach), then candidate brains — three variants of the library's **AFM
   universal map** (ReLU+Fourier, boosted `rand` prior — the default
   `rand=0.001` ridges the shape-carrying features out — with noise-injected
   replay so the doodle becomes a true attractor) (the single autopilot brain — the selector was removed) — are each free-run
   5000 steps with an anti-stall watchdog and scored on early/mid/late
   windows (shape = radius-histogram cosine **+ angular-profile cosine**;
   the radius histogram alone is blind to a lobe covering a star's radius
   range). The winner deploys by **snapshot-restore**: the runtime replays
   the *verified* orbit from its start and a watchdog restarts it at the
   verified horizon (5000/2400/1000 steps, whichever window stayed ≥75%
   faithful) or on escape/divergence — so the doodle never decays, ever.
   Winner runs as its own model; the online ghost predictor is never
   replaced. Verified headless: square/triangle/star/fig-8/circle at
   human and machine tempos, ≥75 s each, star arms intact throughout.
   A **Freeze ❄️ / Unfreeze ▶** button halts ALL learning — the online
   ghost model steps predict-only, the tempo-readout RLS pauses, the
   stored loop stops refreshing, the cyclic AFM pump stops feeding, AND
   the kNN's replay memory (fgAbs) stops growing and cannot be wiped by
   the relocation rule (the memory IS the memorizer's model; a stray
   frozen touch far from the doodle used to erase it while the
   AFM/ESN kept their weights) — while predictions, the ghosts, and
   Autopilot keep working, so the model can be played with without
   being affected. A small LIVE ring (fgLive, freeze-immune pure state)
   seeds the green AFM ghost so it always free-runs from the finger's
   NOW. The ESN's autopilot free-run anchors at the locked loop's mean
   (its state is centroid-relative; anchoring at the last stroke's
   centroid drew a correct shape in the wrong place after a stray
   touch). The brain row shows
   "training FROZEN ❄️" vs "training live"; Reset brain also unfreezes.
   **Disjointed (multi-stroke) doodles** — e.g. two vertical lines drawn
   alternately with pen lifts — are a first-class pattern: the lap is the
   strokes PLUS the teleports. A persistent multi-stroke log survives
   lifts (a REAL lift = a gap marker — ≥150 ms up or landing >0.05 away;
   a touch SKIP is bridged, and a flagged step that doesn't teleport
   >0.06 is ignored by `resamplePath`, else phantom gaps hijacked a
   circle's AFM deploy into path replay with a stall hole; the
   path-replay deploy also demands ≥2 recent lifts so one stray marker
   can't hijack it. A >3 s pause or a restart >2.5× the doodle's span
   away = a fresh doodle), `resamplePath` carries
   explicit break flags and returns gap indices, and lap detection uses
   mean-centered x+y autocorrelation (x-only was blind to vertical
   strokes AND locked onto multi-lap harmonics). The locked loop stores
   its gap set: never interpolated, smoothed, or seam-bridged across;
   the phase stays pinned to the stroke end until it crosses the gap
   index (so the visual jump and the pen-lift flag land on the same
   render segment); the phase forecast marks crossings so the ghost
   LIFTS and lands on the next stroke; and scoring survives pattern
   lifts (and the analogue baseline replays them, so the ghost race is
   fair across strokes).
   Autopilot on a gapped lap deploys instantly as **path-locked replay**
   (an AFM free-run cannot teleport) drawing each stroke with a real
   pen-up; the cyclic AFM pump feeds predict-only across teleport steps
   so they never train. Verified headless: 2-line and 1-line lift
   patterns lock with gaps and replay cleanly, continuous shapes stay
   gapless with instant AFM deploy, far relocation still resets), and
   **④ anti-slosh axis** — an industrial liquid-handling machine, and
   the first tab whose experimental side is mostly CLASSICAL control: the
   value is in what the single sensor is made to say. SIX IDENTICAL MACHINES
   run the SAME command so the comparison is a controlled experiment rather
   than a before/after, and each step differs from the one above it by exactly
   ONE thing, so what each is worth can be read off separately: red **control**
   (no anti-slosh at all — the raw trapezoidal move through the same PD loop
   and the same textbook feedforward; the machine before anyone addresses the
   liquid), violet **hybrid** (THE RETROFIT — the conventional controller
   COMPLETELY UNTOUCHED with a learned additive force trim bolted on top, the
   configuration available when the shipped controller cannot be recertified),
   green **parametric** (the conventional
   STRUCTURE kept exactly, three smooth terms and the same shaper family, with
   its CONSTANTS identified online instead of frozen at a nominal fill),
   magenta **super hybrid** (THE ARCHITECTURE THAT WINS — BOTH learning
   mechanisms stacked on that same untouched structure: identified constants
   AND the additive trim), gray
   **conventional** (3-impulse ZVD shaper tuned once
   at the nominal 0.12 m fill, PD loop Kp 4200 / Kd 260 / 260 N limit, textbook
   feedforward M·a + B·v + Fc·sign(v) with M identified at that same fill —
   the correct textbook design, NOT a strawman; it is wrong everywhere else
   only because the load moves underneath it) vs amber **experimental** (same
   loop, same shaper family, same three feedforward terms; it differs only in
   reading the fill and the resonance off the SAME single gauge and retuning
   both). Plant: the standard equivalent-pendulum slosh analogue COUPLED to
   the carriage (the liquid pushes back), ω₁ = √(g(π/L)tanh(πh/L)) moving
   **1.8× across the fill range** against the ~±20% a ZVD tolerates, sloshing
   mass fraction (8/π³)(L/h)tanh(πh/L), Stribeck friction (9 N stiction → 5.5 N
   Coulomb at 0.02 m/s, viscous 12 N per m/s), cogging 3 N at a 0.05 m spatial
   period, and **wave breaking** past the freeboard. The ONLY liquid instrument
   is one downward gauge at xr=0.18 reading mean depth PLUS the local wave with
   no way to separate them from one sample — off-centre because the first mode
   has a **node at the tank centre**, a commissioning requirement rather than a
   detail. MEASURED LIVE, and it reproduces the mirror: at the fixed shaper's
   OWN design fill both machines carry an identical shaper, so the difference
   there is the feedforward alone — 0.31 vs 0.17 mm, against the mirror's
   0.323 → 0.188; at fill 0.05 m the three-way ladder measures **30.30 mm with
   no anti-slosh → 8.78 conventional → 0.87 experimental** (10× better than
   conventional, **35× better than no anti-slosh**), and the whole session
   3.25 vs 1.37 mm conventional-vs-experimental (2.4×, which INCLUDES the
   experimental machine's startup moves before it has seen any wave to tune
   from — both numbers are shown, labelled). Following error 1.71 / 1.35 mm,
   matching the mirror's ~1.5 mm scale. Only the RIGID mass is scheduled:
   scheduling on TOTAL liquid mass measured WORSE than freezing it (0.446 vs
   0.323 mm), because the sloshing fraction does not ride rigidly and the
   surplus acceleration re-excites the mode the shaper just cancelled.
   **Health check ▶** runs a deliberately UNSHAPED probe move, because a
   well-shaped move leaves no wave to measure — success at control removes the
   observability diagnosis needs, which is a general tension and not a quirk.
   The probe feeds a **vote-of-three fault panel**: the gauge's slow level, the
   wave's resonance and a load cell are three independent routes to one fill,
   so the CONSENSUS is the real fill change and each channel's DEVIATION names
   what moved (leak / gauge drift / mount / density, plus friction from the
   axis fit). Independent threshold tests, never an if/elif chain — a chain
   reports exactly one fault by construction and simultaneous faults are the
   point. Five injectable faults and any PAIR of them; the conventional
   following-error alarm stays silent throughout, because the position loop
   absorbs the fault into control effort. THREE THINGS HAD TO BE MEASURED
   INTO SHAPE before the panel worked, none of which a passing assertion would
   have found: (i) the PROBE NEEDS A LONGER SETTLE WINDOW (8 s, not the
   production 2.6) — a loosened mount or a leak LOWERS the resonance to a
   ~1.3 s period and the production window holds barely two zero crossings, too
   few to fit, so the panel reported "no usable wave" for precisely the faults
   it exists to name; (ii) FRICTION HAD TO BE MADE IDENTIFIABLE — over one move
   the carriage cruises at a nearly constant velocity, so `v` and
   `tanh(v/ε)` are collinear and the viscous/Coulomb SPLIT is arbitrary: the
   fitted Fc came back **−0.12 N against a true 5.5**, and a leak's mass change
   then leaked into it and raised a false lubrication alarm. The resistive
   force at the cruise velocity, B·v_max + Fc, is identifiable even when the
   split is not, and it now recovers the injected fault almost exactly
   (**9.83 N measured against 9.9 injected**, healthy 0.01, and 0.04 under a
   gauge fault — no cross-talk); (iii) DENSITY IS TESTED AS A DENSITY, not as a
   fill-equivalent — a density change displaces mass in proportion to the fill,
   so a fixed fill-equivalent threshold silently stopped detecting it in a
   half-empty tank (the mirror's own limitation, avoidable here). Comparing the
   implied density m_liq/(A·h_consensus) is fill-independent by construction
   and recovers **0.794 against an injected 0.78**.
   A FOURTH thing had to be compensated rather than thresholded: a mount fault
   ALONE drives the friction residual to 3.49 N at the nominal fill (29% of a
   healthy 12.1) because the changed slosh reaction loads the fit — the
   mirror's own false-lubrication finding, reproduced. The friction tolerance
   therefore WIDENS with the measured resonance shift (0.25 + 8·|Δfill_wave|).
   A flat 50% threshold would also have separated mount (29%) from a real
   lubrication fault (81%), but would have gone blind to anything milder than
   half severity; compensating keeps full sensitivity when the resonance has
   NOT moved. Measured verdicts, both fills: **5/5 singles plus healthy** at
   0.12 m and at 0.05 m, and at the default 0.12 m BOTH tested pairs resolve —
   mount+leak names both (which the Python mirror missed) and
   gauge_drift+density names both. At a shallow 0.05 m fill mount+leak
   collapses to the leak alone: the mirror's pair ambiguity, since a median of
   three tolerates ONE corrupted vote and that case corrupts two.
   THE PARAMETRIC MACHINE BEATS EVERY SINGLE-MECHANISM MACHINE, and it is the answer to
   "can the library learn the conventional model's tuning parameters and
   physical constants rather than replace the model?" — yes, and it beats both
   alternatives. Recent-window residual wave, mm RMS:
     fill 0.12 healthy      none 9.58 · conv 0.305 · hybrid 0.213 ·
                            **param 0.102** · exp 0.167
     fill 0.05 healthy      none 20.83 · conv 3.038 · hybrid 2.959 ·
                            param 0.233 · exp 0.213
     fill 0.12 lubrication  none 8.20 · conv 1.716 · hybrid 1.061 ·
                            **param 0.140** · exp 1.789
     fill 0.05 lubrication  none 21.60 · conv 2.528 · hybrid 2.665 ·
                            **param 0.112** · exp 0.730
   It wins three of four outright and ties the fourth, and it has the best
   FOLLOWING ERROR in three of four (1.463 / 1.303 / 1.468 / 1.276). Identified
   values are accurate: M 9.3 kg against a true rigid 9.25 at the nominal fill,
   ω exact to 3 significant figures, and B 12 → 10.6 / Fc 5.5 → 5.9 as the
   effective coefficients the plant actually presents.
   THE ADVANTAGE NEEDS TIME TO APPEAR, and the distinction matters. Those
   numbers are with the fault present FROM THE FIRST MOVE, so the constants
   converge before scoring. Inject the same fault MID-SESSION and check two
   moves later — which is what the smoke test does — and it is a dead tie
   (0.472 parametric against 0.472 experimental), because the friction estimate
   is still moving and the 8-move scoring window is mostly pre-fault. The
   regression therefore pins only what is true at that instant (adapting
   friction is never worse, and both beat frozen constants); asserting the
   converged ratio there would be reading a meter before it has settled.
   THE SEPARATION IS FRICTION. It is the only machine here that adapts B and
   Fc, so under a lubrication fault — where the Coulomb term rises 9.9 N and it
   identifies **Fc 15.8 against a true 15.4** — it is 12× better than the
   EXPERIMENTAL machine, which adapts mass and resonance but not friction and
   there lands slightly WORSE than conventional (1.789 vs 1.716). That is the
   predicted result, stated before the measurement: learn the parameters with no
   closed form, compute the ones that have one.
   HONEST LIMIT: the identified inertia carries a FILL-DEPENDENT bias (stage 4D
   measured the slope at 76.7 kg/m against the truth's 60.0), and the
   commissioning offset is calibrated at one fill and then frozen — visible as
   M 6.3 against a true 6.77 at 0.05 m. It costs little here because the mass
   term is not what limits the wave, but a wider fill range would need a
   two-point calibration.
   THE SUPER HYBRID STACKS BOTH MECHANISMS on that same untouched structure —
   identified constants AND the additive trim — and it is the best machine on
   the tab, winning all four cases. Recent-window residual wave, mm RMS,
   parametric → super:
     fill 0.12 healthy      0.102 → **0.088**   (1.16×)
     fill 0.05 healthy      0.233 → **0.066**   (3.5×)
     fill 0.12 lubrication  0.140 → **0.105**   (1.33×)
     fill 0.05 lubrication  0.112 → **0.102**   (1.10×)
   and the following error improves in every case too (1.463→1.416,
   1.303→1.236, 1.468→1.409, 1.276→1.252), so nothing was traded away.
   MY PREDICTION WAS WRONG AND THE REASON IS THE INTERESTING PART. I expected
   the trim to be roughly neutral or slightly harmful once the constants were
   already right — a learned residual on top of a correct model has mostly noise
   left to fit, and roughness near the slosh resonance is precisely what a
   shaper cannot cancel. What it actually absorbs is SYSTEMATIC, not noise:
   cogging is a deterministic function of position, the Stribeck curve is a
   shape no `Fc·tanh(v/ε)` term can express at any coefficient, and the frozen
   commissioning offset leaves a real mass bias. Identifying constants cannot
   produce a term the structure does not contain, so the residue survives the
   parametric fix and the trim has something honest to remove.
   THE 3.5× — the one large gain — LANDS EXACTLY WHERE THE THEORY SAYS IT
   SHOULD: at 0.05 m, the fill FARTHEST from where the one-time calibration was
   taken, which is where the frozen offset is most wrong (M 6.3 against a true
   6.77) and there is most systematic residue for the trim to absorb. Where the
   calibration is nearly right (0.12 m) or where friction dominates and the
   parametric machine already fixes it directly (0.05 lubrication), stacking
   buys 10–33% and no more. The two mechanisms are complementary rather than
   redundant, and the size of the gain tracks how much the parametric machine
   left behind — which is the falsifiable version of that claim.
   THE REGRESSION WAITS FOR CONVERGENCE. At 10 moves the pair is within 10%
   (0.373 vs 0.338); by move 14 the gap is at its converged ~3.5× and holds.
   The smoke test therefore pins tracking (never worse than parametric) at move
   10 and the ratio only after move 15 — reading it earlier would be reading a
   meter before it settles, which is the mistake this tab keeps re-teaching.
   THE HYBRID'S RESULT IS TWO-SIDED, and the negative half is the more useful
   one. Measured converged, wave in mm RMS / following error in mm:
     fill 0.12 m, shaper CORRECTLY tuned — none 9.58 · conventional
       0.305 / 1.524 · hybrid 0.214 / 1.464 · experimental 0.167 / 1.482
     fill 0.05 m, shaper MISTUNED by a third — none 20.83 · conventional
       3.038 / 1.721 · hybrid 2.958 / 1.540 · experimental 0.213 / 1.323
   So the trim cuts the wave by a THIRD when the shaper is right (closing about
   two thirds of the conventional→experimental gap) and by **2.6%, i.e.
   nothing**, when the shaper is mistuned — while improving the FOLLOWING ERROR
   in both cases (1.52→1.46 and 1.72→1.54). The mechanism is the whole point: a
   mistuned shaper is a failure of **TIMING**, and an additive force correction
   trims forces but cannot re-time a cancellation impulse. Only retuning the
   shaper does that, which is what the experimental machine does. It is also the
   third independent route by which this project has reached "tracking better
   and sloshing less are not the same objective" — the trim improves tracking in
   BOTH regimes and the wave in only one. A regression pins the NEGATIVE half
   specifically, because that is the claim a later edit would quietly break.
   A SEVENTH defect surfaced only when the control was added, and it had been
   biasing the shipped numbers: each machine's shaper has its own delay, so
   their references have different LENGTHS, and the settle window was taken as
   "everything after my own move ends" out of an array sized by the LONGEST
   machine — so the machine with the shortest shaper silently got the longest
   settle window (630 samples against 520 at a shallow fill). That flattered
   the conventional baseline and would have flattered the unshaped control most
   of all. Every machine is now scored over exactly SETTLE seconds after its
   own move ends. The bias ran AGAINST the experimental machine, which is the
   safe direction, but it was still wrong.
   The residual-wave chart is **log-scaled**: the control leaves ~30 mm against
   the experimental machine's ~0.9, and on a linear axis the comparison that
   actually matters is an invisible line along the bottom.
   The debug hook was wrong before any of this was: it recomputed the panel
   from whatever move had just finished rather than from the probe, so it
   reported `dfw = NaN` and friction deltas no verdict was ever based on.
   Fixed by storing what the diagnosis actually used — the recurring lesson of
   this project, that the instrument fails before the model does. THE LOAD CELL REPLACES the
   axis-identified mass as the third vote rather than joining it: keeping both
   measured WORSE than either (pairs 4/10 against 7/10) because they measure
   the same physical quantity, so a redundant reading drags the consensus
   without adding independence. **Kill gauge 💀** shows analytical redundancy —
   the inertia term falls back to the mass identified from the axis's own force
   and motion, calibrated against the gauge WHILE IT STILL WORKED (it carries a
   fixed offset and a 28% steeper slope, 76.7 vs the cell's exact 60.0 kg/m),
   measured 0.42 mm experimental against 2.85 conventional. A crest forecast
   warns before liquid goes over the rim and is fed the controller's
   **look-ahead buffer**; look-ahead in the FEEDFORWARD is deliberately ABSENT
   because it measured NEGATIVE there (following error 1.463 → 1.378 mm,
   residual wave 0.188 → 0.477 mm, monotone, no interior optimum: shaping
   cancels by exact TIMING and is a causal convolution, so preview only
   time-shifts the excitation). Same free signal, opposite sign in the two
   roles — see `slosh_evaluate.py` in the mirror.
   THREE DEPLOYMENT BUGS, all found by disbelieving the numbers rather than by
   a failing assertion, since every check passed while the numbers were wrong:
   (a) the health check REBUILT THE REFERENCE MID-MOVE, restarting it from the
   station while the carriage was elsewhere — a position-demand step of up to
   the whole stroke into a 4200 N/m gain, which saturated the drive and drove
   the slosh state to divergence (session waves read 33 mm against a physical
   ~0.3, and spills were counted at a fill whose freeboard is 0.27 m). Probes
   are now QUEUED for the next move boundary, as a real controller would.
   (b) Probe moves were scored as production, and a probe rings for ~10 moves
   at a shallow fill, so excluding just the probe was not enough. Fixed by a
   **settling dwell** — after a probe the axis HOLDS POSITION until both tanks
   are quiet, exactly as a commissioning routine does — which removes the
   contamination instead of discarding moves; the probe itself is the only
   thing ever excluded from scoring. (c) The healthy following-error reference
   was captured FROM the probe move, inflating it and making the conventional
   alarm too lenient — i.e. flattering the very baseline this tab exists to
   beat; it now comes from a production-move EMA.
   THE DRAWN WAVE WAS ON THE WRONG WALL (fixed, v107), reported by the owner
   watching the live page: the liquid piled against the FRONT of the tank when
   inertia says it must lag and pile at the REAR. Verified numerically at the
   shipped AMAX in the small-angle regime the analogue is valid in: the
   equivalent pendulum lags, th = -0.049 rad, liquid CoM offset -5.5 mm
   (backward) - so THE PLANT IS RIGHT. The renderer drew
   `h + wallElev*cos(pi*xr)` with xr measured from the -x wall while
   `wallElev()` is the +x wall's elevation, which mirrors the profile; the CoM
   implied by the drawn surface came out +1.5e-3, opposite in sign to the
   physical one. Fixed by negating AT THE POINT OF DRAWING.
   THE OBVIOUS FIX WAS THE WRONG ONE, and the suite caught it. Negating
   `wallElev()` itself looks equivalent - the residual-wave score is an RMS and
   wave breaking tests |e|, so no METRIC is sign-sensitive - but `gauge()` is
   built on it and feeds the experimental machine and the trim, and the trim's
   universal map contains ReLU terms, which are ASYMMETRIC. Flipping the sign
   changes which half-plane they activate on; it is not a relabelling. Measured:
   the super hybrid at fill 0.05 went 0.066 -> 0.181 mm and a regression failed.
   The lesson generalises past this file: a sign convention is only free to
   change where every consumer is even in it.
   SPEED vs SLOSH, measured by scaling VMAX and AMAX together (residual wave,
   mm RMS, moves 18-26):
     x1.0  none 9.58 · conv 0.305 · hyb 0.207 · param 0.101 · SUPER 0.085 · exp 0.167
     x1.5  none 51.7 · conv 0.289 · hyb 0.193 · param 0.328 · SUPER 0.150 · exp 0.224
     x2.0  none 75.4 · conv 0.838 · hyb 0.390 · param 0.979 · SUPER 0.310 · exp 0.842
     x2.6  none 78.9 · conv 1.841 · hyb 0.907 · param 1.892 · SUPER 0.848 · exp 1.639
   THE HEADLINE: the super hybrid at DOUBLE the commanded speed leaves 0.310 mm,
   the same wave the conventional machine leaves at x1.0 (0.305). That is the
   cycle-time payoff stated the way a plant buys it. NOTE it is not 2x
   throughput: over the 0.40 m stroke the reference move only goes 0.977 s ->
   0.614 s (1.6x, the ramp time does not shrink), and the ZVD shaper adds a
   FIXED ~0.67 s delay that does not shrink at all, so end-to-end it is ~1.3x -
   computed, not measured. The faster the move, the more the shaper delay
   dominates.
   THE PARAMETRIC MACHINE COLLAPSES WITH SPEED and this reverses the tab's
   ranking: 0.101 -> 0.328 -> 0.979 -> 1.892, WORSE than conventional (0.838) by
   x2.0, while the plain hybrid overtakes it (0.390). Identified constants win
   on gentle moves; the learned trim wins on aggressive ones. Anyone quoting the
   parametric result as general is quoting a baseline-speed result. Only the
   unshaped control ever spills (26 moves from x2.0), and its wave saturates
   near 79 mm because the crest breaks over the rim and sheds energy.
   Honest oddity, not smoothed over: conventional is slightly BETTER at x1.5
   than at x1.0 (0.289 vs 0.305), because a ZVD's residual depends on the move
   duration relative to the slosh period.
   THE HYBRID TRIM'S WAVE IMPROVES TO A MINIMUM AND THEN DEGRADES ~2x, and the
   cause is RLS COVARIANCE WINDUP, not the plant and not the identified
   constants. The trim runs `lam 0.999` with a `maxCovTrace 1e7` guard; over
   the ~700 samples of a move that is 0.999^-700 ~ 2.0x growth of trace(P) per
   move whenever the regressor is poorly exciting — and a WELL-CONTROLLED move
   is exactly a poorly-exciting regressor, the same tension the health-check
   probe exists for. Measured per move on the super hybrid at fill 0.12:
   trace(P) doubles every move, 1.7e3 -> 1.0e7, hitting the cap at move 13;
   the wave's minimum is at move 14 (0.045 mm); the trim's weight norm blows
   up 56 -> 13800; and it then settles at 0.091, about 2x its own best. THE
   CONTROL IS IN THE SAME TABLE: the parametric machine carries no trim and
   shows no trend at all over those moves (0.084/0.118 alternating, flat), so
   the degradation belongs to the trim. The guard fires, but only after the
   run has already sailed past the optimum.
   THE TWO-MOVE SAWTOOTH IS SEPARATE AND BENIGN: `slDir = -slDir`, the axis
   alternates direction every move and friction and cogging are
   direction-dependent, which is visible in the identified constants
   themselves (B alternates 10.50/10.58, Fc 5.91/5.88). That is the fit
   honestly tracking two conditions, not instability.
   NOT FIXED, AND THE NEAR-MISS IS THE POINT. Removing the forgetting
   (`lam 1.0`) is worth 3.3x at fill 0.12 — settled wave 0.0912 -> 0.0275,
   trim norm 13788 -> 249, trace(P) 1e7 -> 5e2 — and directional forgetting
   ties it (0.0289). Under a mid-session lubrication fault `lam 1.0` also
   recovers BETTER than directional (0.0208 vs 0.0367), against the
   expectation that infinite memory could not adapt: the fault changes
   FRICTION, which the identified constants already track, while the trim's
   job (cogging, the Stribeck shape, the frozen calibration offset) does not
   change, so there is nothing to forget. BUT AT FILL 0.05 IT REVERSES —
   `lam 1.0` settles at 0.1641 against the shipped 0.0665, i.e. 2.5x WORSE.
   There the shaper is mistuned by a third and the parametric machine only
   reaches 0.233, so the problem is harder and the wound-up trim's larger
   weights are doing useful work. It is a bias/variance trade, not a fix, and
   shipping the one-condition 3.3x win would have quietly cost 2.5x at the
   other fill. Any real change here needs the fill-and-fault sweep the Lorenz
   ridge got. `__slDbg().trim` exposes each trim's |theta|, trace(P) and
   output so the diagnosis can be re-run in one command.
   MOVE SPEED, PROFILE AND A SECOND SLOSH MODE (v108). Three controls, and the
   third one produced the most interesting result on this tab in a while.
   **Move speed** (0.5-3x) scales the commanded VMAX and AMAX together and is
   read when a reference is BUILT, i.e. at a move boundary - rebuilding one
   mid-move is the v100 divergence bug and the same discipline applies. It is
   deliberately separate from the **Sim rate** slider, which is a viewing
   control and changes nothing; the readout prints the actual commanded values
   ("1.0x (0.55 m/s, 2.2 m/s^2)") so the two cannot be confused.
   **Profile** selects trapezoidal (what shipped) or an **S-curve**, generated by
   convolving the trapezoid's ACCELERATION with a normalised boxcar - a boxcar of
   length T ramps acceleration linearly over T, which is exactly a jerk limit of
   amax/T. Convolution with a normalised kernel preserves both the integral of a
   (final velocity, still zero) and the integral of v (the 0.40 m stroke), so the
   move goes exactly as far and simply takes longer. Same mechanism the ZVD
   shaper already uses, which is why the two compose cleanly.
   **A SECOND SLOSH MODE (n=3), and it is OFF BY DEFAULT ON PURPOSE.** A
   horizontally excited rectangular tank excites only the ODD antisymmetric
   modes, and the standard equivalent-mechanical model gives each exactly:
   w_n = sqrt(g (n pi/L) tanh(n pi h/L)), mass fraction
   (8/(n^3 pi^3))(L/h) tanh(n pi h/L), l_n = g/w_n^2. Nothing is fitted. Matching
   each mode's liquid centre of mass to its pendulum bob gives the wall weight
   as m_n l_n n^2, which tends to exactly 1/n^2 = 0.111 in deep water. At the
   nominal fill mode 3 is 1.9x faster than mode 1 and carries 11% of the wall
   elevation; mode 5 is 4% and is not worth its cost.
   The multi-mode solve substitutes each mode's angular equation into the
   carriage equation, which removes the matrix solve and leaves a SCALAR for
   xdd. For one mode it is algebraically identical to the 2x2 determinant solve
   it replaces - verified numerically over 4000 richly-excited steps, relative
   divergence 1e-16..1e-14 and FLAT (rounding, not drift). With the mode off the
   plant reproduces every shipped number exactly (9.582 / 0.305 / 0.203 / 0.101 /
   0.082 / 0.167).
   WHY IT IS NOT THE DEFAULT, and this is the finding: turning it on degrades
   the CONVENTIONAL machine ~1.9x (0.305 -> 0.584, expected - a ZVD tuned to
   mode 1 cannot touch mode 3) but degrades the ADAPTIVE machines 9-14x
   (param 0.101 -> 1.309, super 0.082 -> 1.168, experimental 0.167 -> 1.586),
   leaving the experimental machine WORSE than the fixed shaper it exists to
   beat. Diagnosed rather than assumed: the experimental machine's resonance
   estimate goes from 9.345 to a value that OSCILLATES 9.3 <-> 14.2 every move
   and never settles. The v108 entry blamed the zero-crossing estimator and
   proposed a better one; THAT DIAGNOSIS WAS WRONG and the correction is worth
   more than the original claim.
   WHAT IT ACTUALLY IS: a closed-loop limit cycle driven by observability, not
   an estimator defect. Captured at the retune instant over 12 consecutive
   moves, the reported w is 14.85 / 9.13 / 9.29 / 13.37 / 9.45 / 8.91 / 9.08 /
   17.29 / 9.38 / 9.11 / 9.15 / 17.41 - mostly right, intermittently landing on
   mode 3. The loop: wHat correct -> the shaper cancels mode 1 well -> THE
   RESIDUAL IS THEN ALMOST PURE MODE 3 -> the next estimate reads ~17.5 ->
   `wHat += 0.6*(w - wHat)` drags it 60% of the way -> the shaper is mistuned
   for mode 1 -> mode 1 returns large -> the next estimate reads ~9.1 -> repeat.
   SUCCESS AT CANCELLING THE RESONANCE REMOVES THE EVIDENCE OF IT. This tab
   already documents that tension - it is why the health-check probe must be
   UNSHAPED - but the per-move retune ignores it.
   THE EVIDENCE THAT SETTLES IT: an AR(4) fitted by the library's own RLS to the
   same tails, roots taken via Durand-Kerner, INDEPENDENTLY reports ~17.6 on
   exactly the moves where the zero-crossing counter reports ~17.3. Two
   unrelated estimators agreeing means the signal genuinely IS mode 3 on those
   moves. A better frequency estimator therefore cannot help: when mode 1 is
   well cancelled there is no mode-1 content left to estimate from. On an
   UNSHAPED probe both estimators recover mode 1 to -0.1% even with two modes.
   ALSO MEASURED, and it undercuts the 1-mode result too: with one mode the
   retune fires ONCE in a whole run and returns null, because the gate
   (rms > 0.004) blocks it - a well-shaped move leaves nothing to measure. So
   the "0.0% error" at the nominal fill is not an achievement, it is wHat never
   moving off its initial value, which happens to be right there.
   THE FIX, BUILT (v110), and it is three things, none of which is "a better
   frequency estimator":
   (1) BOTH shaped machines get a MULTI-MODE shaper - one ZVD per resonance,
   convolved. The conventional one gets it frozen at the nominal fill, the
   experimental one from its own estimates. Giving the experimental machine that
   structure and denying it to the baseline would make the win come from the
   shaper's SHAPE rather than from reading the frequencies off the gauge, which
   is the only claim this tab makes. The extra delay is real (about one period of
   each cancelled mode) and is not hidden.
   (2) The resonances come from an AR(4) fitted by the library's own RLS, roots
   by Durand-Kerner, DECIMATED to ~11 samples per period (without that the
   regressors are collinear and it returns a spurious pole near Nyquist). Each
   pole is ATTRIBUTED to mode 1 or mode 3 by proximity and updates only that
   estimate - so a mode-3 reading can never drag the mode-1 estimate, which is
   what the limit cycle was.
   (3) The retune happens ONLY on the unshaped probe, and a fill change of more
   than 12 mm automatically queues one. This is the tab's own lesson applied:
   success at cancelling a resonance removes the evidence of it, so the machine
   has to ask for an unshaped move to see mode 1 at all. All three are scoped to
   the two-mode plant; with one mode the shipped per-move retune is untouched and
   every documented number is byte-identical.
   MEASURED with two modes (residual wave, mm RMS, moves 16-24):
     fill 0.12 (the design point)  none 8.65 · conv 0.506 · hyb 0.477 ·
                                   param 0.565 · SUPER 0.498 · exp 0.549
     fill 0.05                     none 28.96 · conv 2.762 · hyb 2.664 ·
                                   param 0.361 · SUPER 0.260 · exp 0.390
   The experimental machine goes from 1.586 to 0.549 at the design fill (2.9x)
   and beats the fixed shaper 7.1x off it; the super hybrid 10.6x. The estimate
   now holds at 9.35 against a true 9.35 instead of oscillating 9.3 <-> 14.2.
   HONEST LIMIT AT THE DESIGN POINT: with two modes the experimental machine
   TIES the conventional one at fill 0.12 (0.549 vs 0.506) rather than beating it
   as it does with one mode (0.167 vs 0.305). That is not a defect. At the
   nominal fill both machines now carry the SAME two-mode shaper at the same
   frequencies, so the only difference left is the feedforward mass - which the
   conventional machine has exactly right by construction there, and which the
   experimental machine has to estimate. Estimation can only lose at the point
   the frozen design was tuned for. The whole claim of the tab is what happens
   away from that point, and there it is 7x.
   NOTE ON THE AR MACHINERY, since it took three attempts: a two-mode wave is an
   AR(4) process and the roots of z^4 - a1 z^3 - ... give both modes, but at
   dt 0.005 there are 134 samples per period of mode 1, the regressors are
   almost collinear, and the fit is hopeless - it returns a single spurious pole
   near the Nyquist edge. DECIMATING to ~10-12 samples per period fixes it
   (recovering 9.344 and 17.624 against a truth of 9.345 and 17.546). The root
   finder was verified separately on a quartic built from known poles.
   The S-curve partially rescues it (experimental 1.586 -> 0.624 with two modes)
   because jerk limiting attenuates the high-frequency content that fools the
   estimator - which is corroborating evidence for the diagnosis.
   An **Experiment summary** completes the set (all four tabs have one): same
   6-section, 1 Hz, Copy-button, BLACK-BOX contract — the plant equations, the
   conventional baseline's every gain, the protocol and both grading rules are
   fully specified and reproducible, while HOW the experimental estimates and
   the forecast are constructed is withheld and stated as withheld. A
   leak-audit regression greps the rendered text.

## Versioning

`stamp-version.sh` runs **before each commit**. It:

- Sets the build number to `git rev-list --count HEAD + 1` (the number of the
  commit being created).
- Writes a UTC timestamp.
- Stamps both `index.html` (the `// __STAMP__` line) and `version.json`.
- Regenerates `docs-manifest.json`.

Run it, then commit, so the shipped commit and its version number match.

## Conventions

- **Self-contained / no external CDNs.** Everything is served from this
  origin so the page works offline and isn't at the mercy of blocked hosts.
- Vanilla JS, no build tooling beyond the shell script.
- Keep the console bootstrap first and dependency-free.
- **The console bootstrap injects its UI into the HOST page, so it must state its
  own geometry rather than inherit one.** `ngrc.html` and `lattsim.html` both
  carry a global `button { flex:1; min-width:110px }` for their touch controls.
  `console-boot.js`'s `#dbg-head button` rules are more specific and won every
  property they NAMED — but they never named `min-width`, so the four header
  buttons were forced to 110px each, 440px of them on a 412px phone, and
  `Close ✕` (the last child of a non-wrapping flex row) was pushed off the right
  edge: **measured at 435–545px against a 412px viewport on ngrc, 417–521 on
  lattsim, and the click times out.** Opening the console on either page left no
  way to shut it without reloading. The same rule beat `width:46px` on the
  launcher and inflated it to a 110px slab. `index.html` has no global `button`
  rule, which is exactly why the one page the suite checked was the one page
  that worked. Fixed with explicit resets (`min-width:0`, `max-width:none`,
  `flex:0 0 auto`) plus `flex-wrap` on the header, so a future host style can at
  worst wrap the button to a second row instead of hiding it. A regression now
  asserts the invariant **per page** — and asserts GEOMETRY, not presence: the
  button existed and reported as "visible" the whole time, it simply was not on
  the screen.
