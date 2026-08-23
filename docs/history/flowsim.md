# FlowSim — the measurement history

**What is settled** is in `CLAUDE.md`'s current-state section; this file is the record of
how each of those numbers was arrived at, what failed on the way, and why several
decisions went the way they did. Nothing here is a specification — where this file and
`CLAUDE.md` disagree, `CLAUDE.md` is what ships. It is kept because it has repeatedly
stopped the same mistake being made twice.

The engine is `lib/lattsim/`; the page is `flowsim.html`.

---

4. **FlowSim** (bottom-right `FLOW` launcher → `flowsim.html`) — a
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
FlowSim page. Reproduced deterministically: **Reset while the run loop is
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
`__fsDump()` prints the same on demand from the console's eval box.
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
every FlowSim edit, and ngrc's warm-up timers are both most of its clock and
flaky under load, so a FlowSim edit was being judged by checks unrelated to it.
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
FlowSim screenshot: it was the SUITE'S OWN `console.error('smoke error')`,
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
through `backend.probeMany`. MEASURED (`test/lattsim/reconstruct.test.mjs`): a
laminar dye channel reconstructs from 12 wall sensors at nRMSE ~0.08 over 647
cells; the sensor-placement study and the turbulent-wake numbers are in
`experiments/` (a wake column sits at ~0.26, saturating at ~6 co-located
sensors; a downstream "flow historian" probe fails because advected turbulence
decorrelates within a diameter or two).
**STILL DELIBERATELY NOT BUILT:** heat as a COUPLED field (buoyancy feeding
back), electromagnetics, multiphysics coupling and adaptive resolution are
architecture rather than code. Operators declare the fields they read and
write and the solver rejects two writing the same field in one stage, so
coupling must be stated rather than implied by call order; the lattice owns
its spacing and indexing rather than assuming unit cells, which is what keeps
refinement possible. **Elasticity is no longer on that list** — it is the next
regime; see FlexiSim below.

**THE DIVERGED-RUN CHECK WAS ASSERTING THE OPPOSITE OF TWO SHIPPED BEHAVIOURS.**
The full tier's `the stability floor actually diverges (so the check has teeth)`
drove 6000 steps at τ 0.5001 with u 0.35 waiting for a death — the EXACT corner
the v140 table above records as finite (Re_cell 10500, 9.77% held, ρ 1.140–2.000),
because v122 made the run unable to crash. It could never pass again, and the
soft-sensor timeout that followed it was downstream: with no death the branch
that clicked Reset was skipped, so the page carried on from a 6000-step clamped
run at Ma 0.6 instead of a fresh build, and the next `waitForFunction` timed out
240 s later. **ONE STALE CHECK PRESENTED AS TWO FAILURES, THE SECOND OF THEM
IN AN UNRELATED FEATURE** — which is the argument for a failing check being
fixed rather than tolerated, since a red suite hides the next real failure.
THE UI IS WHAT COULD ACTUALLY ROT, so the diverged VERDICT is now injected
rather than chased: `diagnostics()` is stubbed to report a non-finite field
and `assess()` is left untouched to judge it, so the real verdict path and the
real handler run. A companion check asserts the stub did NOT survive the
rebuild — one that did would report a diverged run for the rest of the suite,
silently. It also returns six thousand software-adapter steps, which were the
most expensive checks on the page and were buying a false assertion.
**A SECOND STALE CHECK CAME OUT OF THE SAME RUN, AND IT HAD GONE STALE FOR THE
OPPOSITE REASON — THE PAGE GOT BETTER.** `the resolution slider is clamped to
what the device can allocate` asserted `max <= 4`, a number that encoded one
scene's memory situation at one moment: the channel was `[3n, n, n]` and its
top rung wanted 192 MiB. v121 halved the span, the top rung came down to
96 MiB, it legitimately fits, the page correctly offered it — and the check
failed. A HARD-CODED CEILING IS ALSO WRONG IN THE OTHER DIRECTION: on a device
with a SMALLER limit than this software adapter, `max <= 4` would have passed
while the clamp was broken, which is the failure it exists to catch. It now
asserts the PROPERTY against the device's own reported limit — every offered
rung fits, and the first rung above the offer does not — with `maxBinding`,
the ladder and the scene added to `__fsDbg()`, since a whole class of defect
here has been "the device would not give us a binding that big" (v113) and
none of it is diagnosable without the limit itself. The first attempt at the
fix was WRONG in a way worth recording: it asked
`largestResolutionThatFits(scene, limit, [n]) === n`, which is vacuously true
— that helper seeds `best` with `ladder[0]` and returns it whether or not it
fits, so every rung reported as fitting and the check had no teeth. The
criterion is now stated directly (the largest single field's binding against
the limit), which is what the helper itself applies.

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

5. **Soft sensor on the lattice** (in the FlowSim page, under the probe chart) —
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
`trace(P)` and `|θ|` are permanent in `status()` for the same reason `__fsDump()`
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
**`__fsSSdbg()`** reports the frozen input scales, the target's frozen mean and
spread against its live ones, the saturation and recalibration counts, the
weight norms, the covariance traces and the ranges of truth against estimate.
It is permanent for the same reason `__fsDump()` is: a soft sensor that scores
badly has at least four distinct explanations and NONE of them can be told apart
from the score.
