# LattSim — a lattice field physics engine

A general-purpose 3D **lattice field** simulation framework, with a D3Q19
lattice Boltzmann fluid as its first physics operator. Self-contained: it shares
nothing with `lib/ngrc/` and vendors nothing, so the tab can be removed or moved
without touching the rest of the app.

The lattice is the **physical representation**, not a visualisation of something
else. There are no particles. A moving mass is a pattern in the density and
momentum fields, and it moves because those quantities are transported between
neighbouring cells.

## Defining a simulation

```js
import { Simulation } from './lib/lattsim/simulation.js';
import { LBMFluidOperator } from './lib/lattsim/operators/lbm.js';
import { region, CELL } from './lib/lattsim/materials.js';

const sim = new Simulation({ lattice: { size: [128, 64, 64], spacing: 1e-3 } });
sim.addRegion(region.wall(CELL.SOLID, 1, -1));
sim.addRegion(region.sphere(CELL.SOLID, [40, 32, 32], 8));
sim.addRegion(region.wall(CELL.INLET, 0, -1));
sim.addRegion(region.wall(CELL.OUTLET, 0, +1));
sim.addPhysics(new LBMFluidOperator({ tau: 0.55, inletVelocity: [0.06, 0, 0] }));

await sim.build();          // picks a backend, allocates, initialises, verifies
sim.advance(10);            // synchronous — safe to call from a render loop
const d = await sim.diagnostics();
```

Nothing in a scene definition names a backend, a buffer or a shader. Nothing in
a backend knows what a channel or an obstacle is. `build()` is the only async
step, because acquiring a GPU device is.

## Modules

| File | Purpose |
|------|---------|
| `d3q19.js` | The velocity set — **the single source of truth**. The CPU reference imports it; the WGSL generator emits it into shader source. |
| `lattice.js` | Dimensions, spacing, origin, indexing, per-axis topology. |
| `units.js` | Lattice ⇄ SI, τ ⇄ viscosity, and `audit()` — the stability warnings, stated before a run rather than discovered during one. |
| `fields.js` | Field descriptors and the registry. Scalar / vector / tensor / distribution / material. |
| `materials.js` | Per-cell classification and the region builders. |
| `operator.js` | The `PhysicsOperator` contract and the backend kernel registry. |
| `operators/lbm.js` | The D3Q19 fluid operator. |
| `operators/scalar.js` | The passive-scalar advection-diffusion operator (a second D3Q19 distribution, advected by the fluid). |
| `solver.js` | Operator ordering, the write-discipline rules, `verify()`. |
| `simulation.js` | The public façade. |
| `scenes.js` | Ready-made scene definitions. |
| `verify.js` | The in-page verification suite. |
| `backends/wgsl.js` | Shader generation. |
| `backends/webgpu.js` | Production solver. |
| `backends/cpu.js` | Reference solver. |
| `render/slice2d.js` | 2D slice, canvas 2D, works on any backend. |
| `render/volume3d.js` | WebGPU raymarched volume. |
| `render/camera.js` | Orbit camera and the 4×4 maths. |

## Conventions

**Indexing is `index = x + Nx·(y + Ny·z)`** — x fastest — in JS, in WGSL, in the
boundary system and in the renderer. `test/lattsim/engine.test.mjs` pins the
round trip.

**Fields are structure-of-arrays**: `value(component, cell) = data[component *
cellCount + cell]`. A component is contiguous across cells, so adjacent GPU
threads touch adjacent memory.

**Anything an operator advances in time is double-buffered.** The solver refuses
to build otherwise, and refuses two operators that write the same field in one
stage. Both failure modes are silent if unchecked.

## Two backends, and why

Per-cell physics runs in WGSL compute shaders. It does not run in JavaScript
loops — that is the architecture.

But the CPU reference is not a fallback bolted on afterwards. A solver that only
executes on hardware the test environment lacks is a solver that ships
unverified. So the reference implements the same equations from the same
constants, and:

* it runs in plain Node, so **conservation and the Poiseuille profile are
  checked against their analytic answers on every test run**;
* it is what the page uses where WebGPU is absent, capped at 131 072 cells and
  labelled in the UI;
* where a GPU exists, the two run the same scene and are **compared cell by
  cell**.

That parity check is not ceremony. It caught the production kernel emitting
zeros: `macro` is a reserved word in WGSL, every shader failed to compile, and
WebGPU reports that asynchronously without throwing. The engine now compiles all
shaders up front and refuses to build on an error, and runs one dispatch of every
kernel inside an error scope — because `uncapturederror` did not fire in the
browser this was developed against.

## Verification

`test/lattsim/` runs in plain Node:

* **`d3q19.test.mjs`** — the isotropy conditions (Σw = 1, Σwc = 0, Σwc⊗c = cs²I)
  that put D3Q19 in the Navier–Stokes limit.
* **`engine.test.mjs`** — indexing, units, field layout, region ordering, and the
  solver's two write-discipline rules.
* **`conservation.test.mjs`** — mass and momentum in a periodic box, and in a
  closed box with bounce-back walls. Run at **both f32 and f64**: the f32
  residual (~1e-8) is either arithmetic or a leak, and only the f64 run
  distinguishes them.
* **`poiseuille.test.mjs`** — the exact parabola. Second-order convergence
  measured (L2 9.3e-3 → 2.7e-3 → 8.6e-4 over nz 9 → 15 → 25).

The Verify tab runs the same protocol in the browser against whichever backend
is live, which is the only way the WGSL kernel gets exercised on real hardware.

**Two tiers.** `./test/run.sh` runs the *quick* tier by default and
`./test/run.sh --full` runs everything; the level is passed down as `SUITE`. The
split was made from measured section timings rather than guessed: the τ sweep,
the resolution-convergence study and the long GPU/CPU parity runs are most of the
runtime and none of them can regress from an ordinary edit, so they are `--full`.
Everything that pins a *contract* — indexing, units, write discipline,
conservation, the analytic parabola, the scene view planes, the stir impulse —
runs every time. Quick is **~1m35** against 12+ minutes before. Run `--full`
before pushing anything that touches the solver, the collision operator or the
boundaries.

## Turbulence: two mechanisms, and which one actually does the work

Asked to handle higher Reynolds number **without capping the sliders**, on the
grounds that real physics manages it. Two things were built. The measurement
then overturned the reasoning behind one of them, which is the more useful half
of this entry.

The two causes are genuinely different:

**The scheme is needlessly unstable.** BGK relaxes every moment at the same
rate; as omega -> 2 the non-hydrodynamic "ghost" moments become under-damped and
grow. That is a defect of the collision operator, not of the fluid.

**The flow has structure smaller than a cell.** Real physics dissipates at the
Kolmogorov scale. At Re_cell 48 on this lattice that scale is far below dx, and
no scheme resolves what is not represented. Here you resolve it or you model it.

### TRT — and what it is actually worth

Split each population into parts even and odd under `q -> opposite(q)` and relax
them at two rates. omega+ sets the viscosity; omega- is free, and

    Lambda = (1/omega+ - 1/2)(1/omega- - 1/2)

**Lambda = 3/16 makes halfway bounce-back exact at every viscosity.** This is the
headline result, measured against the analytic Poiseuille profile:

| tau | BGK L2 | TRT L2 | |
|---|---|---|---|
| 0.600 | 7.67e-3 | 1.79e-7 | |
| 0.800 | 4.21e-3 | 2.50e-8 | |
| 0.933 | 8.67e-9 | 8.67e-9 | identical — TRT reduces to BGK at the magic tau |
| 1.000 | 2.70e-3 | 3.36e-9 | |
| 1.500 | 3.51e-2 | 4.77e-11 | |
| 2.500 | 1.65e-1 | 8.99e-12 | **10 orders of magnitude** |

The τ-dependent wall slip documented below as a known limit is *gone*. That the
two agree exactly at tau = 0.933 is the correctness check: there Lambda = 3/16 is
what BGK already had, so the operators must coincide, and they do to 1e-6
relative.

**But TRT does NOT raise the stability ceiling, and at Lambda = 3/16 it LOWERS
it.** One knob serves two objectives that invert at low viscosity: accuracy wants
Lambda = 3/16, stability wants Lambda small (omega- near 2). Holding 3/16 drives
omega- to **0.10 at tau 0.52** and 0.026 at tau 0.505 — the ghost modes are
barely relaxed at all. So omega- is a **policy**: `magic` for exact walls,
`stability` to pin it near 2 when the flow matters more than the wall.

### The sub-grid model is what removes the ceiling

tau becomes a field: `tau_eff = ½(tau + sqrt(tau² + 18 Cs² |Pi| / rho))`, with
the strain rate read straight out of the non-equilibrium stress — already in
registers, no finite differences, no neighbour access.

Cell Reynolds number at which each configuration was still finite after 3000
steps (cylinder in a channel, u 0.08):

| Re_cell | BGK | TRT magic | TRT stability | TRT + LES |
|---|---|---|---|---|
| 12 | ok | **died** | ok | ok |
| 16 | ok | died | ok | ok |
| 24 | died | died | died | **ok** |
| 48 | died | died | died | **ok** |
| 96 | died | died | died | **ok** |
| 160 | died | died | died | **ok** |

**At least 13x past where BGK dies, and it did not fail anywhere in the tested
range.** TRT's contribution is accuracy; the model's contribution is stability.
Those are not the roles they were proposed for.

### What the model costs, measured

It is not free and it does not ship on by default. Plain Smagorinsky responds to
the TOTAL strain rate, not to the unresolved part, so it fires in laminar flow
too — the analytic Poiseuille profile degrades from 3.4e-9 to 6.9e-4 with it on.

That is the model behaving as documented rather than a bug: predicted
`nu_t/nu_0 = 9.6e-4` against a measured profile shift of `8.8e-4`, agreement to
10%. Over-dissipation in laminar and near-wall shear is Smagorinsky's textbook
flaw. Fixing it needs a model that separates resolved shear from unresolved —
WALE, or shear-improved Smagorinsky — and WALE needs the antisymmetric velocity
gradient, which `Pi_neq` does not carry. Not built.

So the analytic verification runs unmodelled, the page states which mode is
holding a run together, and a regression pins the laminar cost at its measured
size so a change that made the model an order of magnitude more dissipative
could not pass quietly.

### The default has to be a configuration that was measured to survive

Shipped broken once, and the failure is instructive because the data to prevent
it already existed. TRT went in as the default the same day the table above
recorded **TRT at Lambda = 3/16 dying at Re_cell 12** — and the shipped defaults
(tau 0.52, u 0.08) are Re_cell 12 exactly. Pressing Run diverged by step 300.

The page even said it was fine: the risk row read *"Re_cell 12 — within the
measured stable range"*, because the ceiling table had been filled in with BGK's
number for the TRT entry. A measurement is only worth what the thing that reads
it is worth.

Now: **TRT + LES is the default** (measured stable to Re_cell 160), the ceilings
are the measured ones per model (`bgk` 20, `trt` 10, `les` 200), and a regression
loads the page, reads its own reported `Re_cell` and ceiling, and runs 2000 steps
requiring it to still be alive.

### Logging, so a phone report can be a paste rather than a description

Every build logs one line to the page's own debug console (the `>_` launcher)
with the whole configuration: scene, obstacle, backend, cell count, model,
collision, TRT policy, Cs, tau, nu, omega+, omega-, u, Re, Re_cell and the
ceiling for that model. If Re_cell is past the ceiling it also logs a warning
BEFORE the run, naming the expected outcome.

On divergence it logs a post-mortem: the same configuration plus the step, the
verdict, uMax, the density range, the lowest-index bad cell and its
neighbourhood along x, and **how much of the lattice is already non-finite**.
That last number is what makes the rest readable — a NaN spreads one cell per
step, so the "first bad cell" is the origin only while `fractionLost` is small,
and the report says so rather than inviting the wrong conclusion.

`__lsDump()` in the console's eval box prints the same thing on demand.

## Resolution, and where the cells were going

"Increase the resolution on the obstruction model" turned out to be blocked
rather than merely unset. At `[3n, n, n]` the channel needs a **192 MiB** storage
binding at n = 96, over the 128 MiB most devices allow, so the top of the ladder
was clamped away and moving the slider did nothing.

**The span is not the same kind of number as the cross-section.** A cylinder
spans z, so the flow is nominally two-dimensional and z is a free numerical
parameter — cells spent there resolve nothing about the wake. Halving it:

| n | cylinder | binding | cells across obstacle |
|---|---|---|---|
| 48 | 0.17M | 12 MiB | 10 |
| 64 | 0.39M | 29 MiB | 12 |
| 96 | 1.33M | **96 MiB — now fits** | **20** |

A **sphere** is finite in z, so a squeezed span would confine it; it keeps the
cubic domain and is clamped as before. The lattice row now reports *cells across
the obstacle*, which is the number "resolution" actually buys.

## The lid can be made to oscillate

`lidFrequency` (cycles per step) scales the moving-wall velocity by
`sin(2π f n)`. Zero is the classic steady lid; anything else drags a **Stokes
layer** of depth `sqrt(2 ν / ω)` that reverses every half period, and whether
that depth reaches the middle of the box is the entire character of the flow.

**The slider range came from that depth, not from what looked tidy.** The first
range went to 20 cycles per 1000 steps, where the layer is **0.73 cells** — below
the lattice, so not resolved at all. Over 0–2 cycles per 1000 steps it spans
about 15 down to 2 cells, and the readout shows the depth so an oscillating run
can be read rather than guessed at.

The wall velocity is a **separate parameter from the inlet velocity**, which
until now they shared: an oscillating lid must not oscillate an inlet, and they
were the same number only because a steady wall and a steady inlet happen to
coincide.

Two things the regression had to learn, both of which looked like bugs first:
the sign of total x-momentum is **not** positive under a steady lid (a closed
box's return flow occupies far more volume than the thin layer the lid drags),
and an impulsively started lid **oscillates on its own** while its transient
decays (measured 2.4 → −0.44 → −0.93 … → 0.05). So neither the sign nor the
presence of sign changes separates driven from steady. What does is that the
transient settles and the drive does not — compared after 3000 steps, not during.

## The limiter: the run cannot crash

Asked for one configuration and no divergence failures, at any setting, even at
the cost of some accuracy. The chain that produced the crash was measured and
watched on a device:

    velocity overflows -> rho crosses zero -> u = momentum/rho goes non-finite
      -> STREAMING carries the NaN one cell per step to every neighbour

Every link is now broken, in the collide kernel, in both backends:

* **density is clamped** away from zero and from absurd highs, so the division
  cannot blow up;
* **velocity is clamped**, so a runaway cannot feed itself a wilder equilibrium
  each step;
* **any population that still comes out non-finite is replaced** by the
  equilibrium at the sanitised moments — so a NaN is caught in the cell where it
  appears and can never be handed to a neighbour.

The comparisons are written as `!(x > lo)` rather than `x < lo`, because the
first is true for a NaN and the second is not.

**The bounds are chosen so a healthy run never touches them.** The scheme is
already unstable above lattice velocity 0.3 and this clamps at 0.35; a working
density stays within a few percent of 1 and this clamps at 0.5 and 2.0. That the
analytic cases are unaffected is asserted, not assumed — a limiter that fired
during normal operation would be silently changing physics rather than rescuing
it.

Every configuration that previously died now survives, 3000 steps, u = 0.08:

| Re_cell | τ | BGK | TRT magic | TRT stability | **TRT + LES (shipped)** |
|---|---|---|---|---|---|
| 12 | 0.520 | ok 0.280 | ok **0.350** | ok 0.278 | ok 0.300 |
| 24 | 0.510 | ok **0.350** | ok **0.350** | ok **0.350** | ok 0.286 |
| 48 | 0.505 | ok **0.350** | ok **0.350** | ok **0.350** | ok 0.277 |
| 160 | 0.5015 | ok **0.350** | ok **0.350** | ok **0.350** | ok 0.281 |
| 480 | 0.5005 | ok **0.350** | ok **0.350** | ok **0.350** | ok 0.281 |
| 4800 | 0.5000 | ok **0.350** | ok **0.350** | ok **0.350** | ok 0.282 |

Every one of those rows below Re_cell 24 used to be a divergence. Read the
numbers rather than the "ok": **0.350 is the clamp**, so those runs are being
*held up*. The shipped configuration sits at 0.277–0.300, below the clamp — it
is solving the flow, not being rescued from it. That difference is the entire
value of the sub-grid model now that nothing can crash.

**And it says so.** The reduction counts cells sitting at the clamp,
`diagnostics()` returns `limited`, and the verdict becomes `limited — N cell(s)
held at the velocity limit`, reported *before* the stability verdicts because
"it looks stable" is the wrong conclusion to draw from a rescued run. A
simulation that quietly substitutes invented values for real ones is worse than
one that stops.

A NaN injected directly into the populations by hand is gone after one step and
has not spread 200 steps later. That is the test that makes this a guarantee
rather than an observation.

**One configuration ships**: TRT with ω⁻ pinned for stability, plus the sub-grid
model. BGK and TRT-at-Λ=3/16 remain in the *library* because the analytic
verification needs them to measure what TRT is worth — the ten-decade wall result
is a BGK-vs-TRT comparison — but they are no longer a choice on the page. One of
them shipped as the default and diverged at the shipped sliders, which is the
failure this removes.

## The startup transient, and the outlet that caused it

Reported from a device: the leading edge of the flow crosses the channel, hits
the outlet and reflects, and the run takes a long time to settle. Two separate
causes, and the fix for each is small.

**The interior started at rest**, so the inlet had to fill the channel. That
front has nothing to do with the flow being studied. The channel now begins with
the whole fluid at the inlet velocity, so there is no front to cross.

**The outlet pinned density to rho0 every step**, which anchors the pressure
perfectly and reflects perfectly: a wave arriving at the exit meets a hard wall.
It is now pulled only weakly toward rest — `outletAnchor`, measured rather than
picked (res 16, cylinder, u 0.08, 1800 steps):

| configuration | worst transient spread | settles at | final density band |
|---|---|---|---|
| rest + anchor 1.0 (as shipped) | 0.381 | 700 | 0.968–1.172 |
| uniform + 1.0 | 0.277 | 700 | 0.969–1.171 |
| uniform + 0.5 | 0.272 | 500 | 0.973–1.177 |
| **uniform + 0.2 (shipped)** | **0.252** | **500** | 0.987–1.194 |
| uniform + 0.02 | 0.265 | 500 | **1.270–1.535** ← drifted |

A third off the transient and a third off the settling time, with the density
band where the hard anchor had it.

**0.02 is past the point where the anchor still does its job**: the channel
pressurised to a mean density near 1.4. That is the same class of failure as the
original drain to 0.32, in the other direction, and it is why this parameter is
measured at both ends rather than simply made small.

**AND THE WGSL PACKING BIT AGAIN, FOR THE THIRD TIME.** A `vec3<f32>` is size 12
with align 16, so an `f32` placed after one lands in the vec3's trailing four
bytes — at offset **108**, not at the next 16-byte boundary. Guessing 112 shifted
`outletAnchor` and `initVel` by a slot each. The CPU/GPU parity check caught it
immediately as a 130% velocity disagreement and a 13% mass disagreement; nothing
else would have. The offsets are now written out in a comment beside the struct,
computed rather than guessed.

## Stability: what the sliders can do to it

**Reported from a device:** viscosity slider to the far left, everything else
default, "runs a few seconds and then breaks" — a frozen picture with a front
sweeping across the lattice, Run doing one step and freezing again, only Reset
clearing it. The observation that it *starts at one cell and spreads* is the
diagnosis: the velocity overflows, ρ crosses zero, `u = momentum/ρ` goes
non-finite, and **streaming then carries the NaN one cell per step to every
neighbour**. The black region is the NaN zone — a NaN speed makes the slice's
auto-scale NaN, so the colour map returns black.

The controlling parameter is the **cell Reynolds number**, `Re_cell = u / ν` —
advection over diffusion across a single cell. Both sliders move it, which is
why neither is safe to read on its own. Measured at the default geometry
(u = 0.08, cylinder, 3000 steps):

| τ | Re_cell | outcome |
|---|---|---|
| 0.505 | 48 | uMax reached **1.0e4** (the stable limit is 0.3), non-finite by step 400 |
| 0.510 | 24 | non-finite by step 1400 |
| 0.515 | 16 | survives, marginal |
| 0.520 | 12 | survives, marginal |

A coarser lattice survived Re_cell 20 for 9000 steps, so the boundary is near 20
and depends on resolution. The page warns at 12 and condemns at 20.

Three things follow, and the third is the actual defect:

**The τ floor is 0.51, not 0.505.** A slider position that dies at the default
speed within seconds is a trap, and that one was added for shedding headroom
without checking what it did at the shipped inlet speed.

**The pairing is flagged before it is run.** τ and speed are only dangerous
*together* — the floor is fine at a slow inlet and fatal at a fast one — so both
readouts go amber then red, and a row states the verdict.

**Halting on divergence was right; halting SILENTLY was not.** Continuing would
render noise as though it were fluid, which is the one thing this engine refuses
to do. But the reason appeared only in a stats row below the fold on a phone, so
from the outside the page simply broke. The badge over the stage now carries the
verdict, the step it happened at and the remedy, and Run refuses until Reset
instead of re-diverging on the next frame.

## Known limits, measured

**The collision operator is BGK/SRT**, and with a single relaxation time the
effective wall position of bounce-back drifts with τ. It is exact only at
Λ = (τ−½)² = 3/16, i.e. **τ = ½ + √(3/16) ≈ 0.933**, where the measured L2 error
against the analytic Poiseuille profile is **8.7e-9** — machine exact. Away from
it the error grows: 4.2e-3 at τ = 0.8, 3.5e-2 at τ = 1.5, 1.6e-1 at τ = 2.5.
This is why `LBMFluidOperator` takes a `collision` parameter rather than
hard-coding one; a TRT or MRT collision fixes it by holding Λ = 3/16 at any
viscosity.

**f32 loses very small forces.** A per-step forcing increment around 1e-7 lands
below the resolution of the populations it is added to (w·ρ ≈ 0.055), so part of
every increment is rounded away and the flow is driven weakly. A regression pins
this rather than letting it be discovered.

**Open boundaries are first order.** The inlet prescribes velocity and borrows
density from its neighbour; the outlet prescribes density and borrows velocity.
The first version copied populations at the outlet, imposed nothing on the
pressure, and drained the channel to ρ = 0.32 while the velocity field still
looked like flow. The fixed version anchors the pressure, but is still mildly
reflective: an impulsive start rings an acoustic wave between the open faces
that decays slowly — measured ±17% in density at step 200, ±13% at 600, ±5% by
2200. A characteristic (non-reflecting) outlet is the fix; this is not one.

**A moving wall is a WALL.** `CELL.MOVING` is halfway bounce-back with a
momentum correction (`f_q = f_qbar + 2 w_q rho_w (c_q . u_wall)/cs^2`), so it
injects momentum and no mass. Modelling it as a driven *fluid* cell — which is
what shipped first — also made the lid a mass source, and the lid-driven cavity
reported a "marginal" stability verdict in a closed box that cannot have one.

**The cavity's density extreme is real physics.** It sits in the two cells at the
lid corners, where a moving wall meets a stationary one and the pressure is
formally singular: measured a steady 6.6% overall, 1.5% two cells in, 0.47% four
cells in, against the ~0.3% this flow's dynamic pressure accounts for. It does
not decay with time. Restricting the lid to the interior of the top face (so no
cell is both stationary and moving) is the geometrically correct thing and is
what ships — but it did **not** reduce that number, it raised it slightly, 5.1% →
6.6%. The corner overlap was never the cause.

## Displaying it

**A correct simulation on the wrong plane looks broken.** Poiseuille flow varies
only across z, so a slice normal to z has *exactly zero* spread and renders as one
flat colour. Two of the three scenes appeared to "do nothing" for precisely this
reason. Each scene now declares the plane that shows its physics in
`meta.view.sliceAxis`, and a regression asserts the declared plane actually
varies.

**A closed domain is wrapped in walls, so every ray hits solid first.** The volume
renderer treats solid as transparent until a ray has entered the fluid, and
opaque after: the enclosing shell disappears, interior obstacles stay solid.
Rendering it opaquely — the first version — produced a featureless grey box. The
box also carries the lattice's own aspect ratio; mapping every lattice into a
cube renders a 2:1:1 channel as a cube.

**The volume render cannot be verified in CI.** In a headless browser with a
software adapter there is no real surface, and `getCurrentTexture()` does not
merely fail — it destroys the WebGPU instance, after which every *compute* call
fails too. Isolated to fifteen lines of plain WebGPU with none of this engine
involved. So `VolumeRenderer.render()` returns `false` rather than throwing and
the page falls back to the slice view, a visualisation being unable to take a
simulation with it; the suite compiles the volume shader (where a WGSL mistake
would live) and leaves the picture to a real device.

## Vortex shedding, and why the first version could never do it

The channel scene shipped with a **sphere** at Re ~ 58 and was asked why it did
not shed. It should not have: the threshold depends on the SHAPE, and a sphere's
is nearly six times a cylinder's.

| obstacle | wake goes unsteady at | why |
|---|---|---|
| circular cylinder | Re ~ 47 | the classic Hopf bifurcation to a von Karman street |
| sphere | Re ~ 270 | steady axisymmetric to ~210, steady-but-asymmetric to ~270, only then hairpin shedding |

Measured in-browser, transverse wake velocity sampled five diameters downstream,
second half of a 9000-step run:

| obstacle | Re | wake fluctuation | trend | Strouhal |
|---|---|---|---|---|
| cylinder | 48 | 0.02% of U | decaying, 0.04x | — |
| cylinder | 72 | 1.5% of U | decaying, 0.49x | 0.219 |
| cylinder | 120 | **25% of U** | sustained, 1.17x | **0.303** |
| sphere | 48 | 0.00% of U | decaying, 0.09x | — |
| sphere | 216 | — | **diverged** | — |

Three things follow, and the last one is the real constraint.

**The cylinder is the shape to watch.** It sheds, the fluctuation is a quarter of
the free-stream speed, and St ~ 0.30 against a free-stream textbook 0.2 — raised
by the confinement, as it should be at this blockage.

**The threshold here is between Re 72 and 120, not 47.** Both sub-critical rows
oscillate at roughly the right Strouhal number (0.219 at Re 72) while DECAYING —
that is a damped oscillation at the natural frequency, which is exactly what a
sub-critical wake does. Confinement raises the critical Reynolds number above
the free-stream 47, so the shipped default is set to Re 120 rather than to
something just past the textbook figure.

**Right at the textbook threshold it correctly does NOT shed.** Re 48 decays by
25x over the run. A scene that oscillated at every Reynolds number would be
showing numerical noise, not physics — the decay ratio is what separates the two,
and it is why the measurement reports late/early rather than an amplitude.

**The sphere cannot reach its own threshold at low resolution.** Getting Re to
270 by lowering tau and raising u runs out of stability first — Re 216 diverged
outright. Reaching it needs the diameter to grow instead, i.e. the top of the
resolution ladder. LBM couples accuracy, stability and Reynolds number through
the same two knobs, and this is what that coupling costs.

So the scene now: obstacle is **selectable**, blockage is down from 33% to ~20%
(confinement raises the threshold and distorts the street), the channel is **3x
long** rather than 2x so the wake has somewhere to go before a first-order
outlet reflects it, and the obstacle sits **one cell off the centreline**.

The **resolution slider now sweeps through the threshold on its own**: at the
default tau and inlet speed the ladder runs Re 72 / 72 / 120 / 144 / 240, because
a bigger lattice means a bigger obstacle diameter at fixed blockage. That is the
stable way to raise Reynolds number in LBM — the other two knobs, lower tau and
higher u, both walk toward the stability limit, which is what killed the sphere
at Re 216.

That last one matters more than it looks. A perfectly symmetric obstacle in a
symmetric channel is an unstable EQUILIBRIUM above the critical Reynolds number:
the instability has nothing to grow from except round-off, so a supercritical run
can sit there looking steady for a very long time. Real cylinders are not
perfectly centred either. The page also reports the threshold next to the live
Reynolds number, so "why is nothing happening" is answerable from the screen.

## The probe

One lattice cell, sampled over time, charted directly under the stage. `Place
probe` then tap the slice; the cell is fixed in 3D as well, because the slice
plane and position are what choose it.

**A time series answers what a picture cannot.** A vortex street and a settled
flow look far more alike on a colour map than they do on a trace: shedding is a
periodic transverse velocity, settled is flat lines. The chart shows |u|, the two
in-plane velocity components and density (on its own right-hand axis).

**One cell, not the whole field.** `backend.probe(field, cell)` is a 16-byte
readback: the field is structure-of-arrays, so a cell's four components live at
four offsets and four 4-byte copies is the whole cost. Sampling a full macro
snapshot every frame at 1.3M cells would be 21 MB per sample, which is exactly
the transfer this architecture exists to avoid.

**The x axis is solver steps, not samples.** The probe records once per frame, so
a sample-numbered axis would silently rescale itself whenever steps-per-frame
moved — the same defect the residual had, where a viewing control changed a
physical reading.

Three things that had to be fixed rather than assumed:

**A hidden canvas has no size, and 0/0 is NaN rather than zero.** The
screen-to-cell mapping returned NaN coordinates that passed every bounds check
and indexed the field at NaN. It now refuses a zero-sized canvas. Found because
the regression ran while the Architecture tab was showing.

**An empty chart reads as broken**, not as "nothing yet" — 150px of meaningless
axes on a phone. The chart is collapsed until a probe exists, and Plotly is
told to resize once the container is actually visible, since it sized itself
against a `display:none` div otherwise.

**The console buffer is per ORIGIN, not per page.** It is persisted to
localStorage so a white-screen crash survives a reload, which means this page
inherits errors logged by any other page on the origin. That is why a red error
badge appeared on a FlowSim screenshot: it was the smoke test's own
`console.error('smoke error')`, injected on index.html to test console capture.
Worth knowing before chasing one.

## Poking it, and knowing when it has settled

**A steady state is a claim, and it needs an instrument.** "The obstacle scene
does not settle" is not answerable from a picture: a converged flow and one still
slowly drifting look identical. `diagnostics()` therefore reports a **residual** —
‖Δu‖ over ‖u‖ **per step** — and `assess()` promotes a run to `ok — steady` below
1e-3. It is computed **on-device** in the same reduction pass as the mass and
momentum sums (`REDUCE_STRIDE = 12` with a `macPrev` binding), so it costs no
extra readback; the CPU reference keeps its own previous copy.

**Per step, and that is not cosmetic.** The backends can only report the change
between successive *readings*, which grows with however many steps happened in
between — so an unnormalised residual would change when the steps-per-frame
slider moved, i.e. a *viewing* control would alter a convergence number while the
physics did not. `Simulation.diagnostics()` divides by the elapsed steps, and a
regression reads the same 200 steps of the same run once and in ten chunks and
requires the two to agree.

Two neighbouring states that are easy to conflate, and are kept apart: a reading
with **no previous reading** (or no steps since the last one) reports `undefined`,
not zero, because zero would render as "perfectly steady" when it means "not
measured". And a residual of **exactly zero** *is* steady — Poiseuille converges
hard enough that the f32 velocity delta underflows to precisely 0, and an earlier
`residual > 0` guard made the most converged scene on the tab report *not*
steady.

The threshold is measured rather than picked. Per-step residual against step
count, CPU reference at resolution 16:

| step | channel + obstacle | Poiseuille | cavity |
|---|---|---|---|
| 200 | 1.3e-2 | 2.1e-3 | 1.2e-3 |
| 580 | 1.8e-3 | 7.1e-5 | 7.7e-5 |
| 1000 | 5.0e-4 | 2.1e-6 | 7.2e-7 |
| 2860 | 3.6e-7 | 0 | 4.3e-8 |
| 4840 | 1.1e-8 | 0 | 4.0e-8 |

Five decades over a few thousand steps, so 1e-3 separates "still developing" from
"converged" with room on both sides. **The channel does settle** — the report that
it did not was unanswerable rather than wrong.

**Stirring is a physics input, not a paint tool.** `LBMFluidOperator.stir({
centre, radius, force, steps })` arms a spherical body force that enters the same
Guo forcing term a global body force uses, and expires after `steps`. The regressions
pin what that means rather than that it does something: momentum goes in, **mass
does not change**, the momentum is confined to the forced volume (it is local, not
a global force applied everywhere), and the impulse **stops** rather than becoming a
permanent source.

One measured subtlety, kept because it bit once: the macroscopic field is written
mid-step, so a reading taken after N steps shows **N − ½** applications, not N.
The off-by-a-half is in the observation, not in the operator — the test was
corrected, not the code. The impulse counts down *after* being used, so the first
armed step is applied.

**The impulse is sized against the flow it has to disturb.** It runs for 24
steps, so it changes the local velocity by roughly `force × 24 / ρ`. The first
version used 2e-4 over a radius-2 sphere: 33 cells out of 27 648, worth **0.02%
of the domain's momentum against a 0.8% natural fluctuation** — armed perfectly
correctly, and completely invisible. It now spans Δu 2.4e-3 to 0.096 across the
slider, the top of that being comparable to the 0.06 inlet speed, which is about
as hard as it can push before the lattice velocity approaches the 0.3 stability
limit. The radius comes from the smallest lattice dimension so the blob stays a
visible fraction of the slice at every resolution.

**A global metric cannot detect a local poke, and that cost a false failure.**
The browser check first asserted that stirring raised the residual — but the
residual is normalised over every fluid cell, so a correct impulse moved it by
less than the flow's own fluctuation and the test reported "the stir does
nothing" when the stir was fine and the *instrument* was wrong. The check now
compares the velocity change **inside** the impulse sphere against everywhere
else, which is also the only part of this the browser can uniquely verify: a
screen coordinate on a letterboxed canvas → a slice plane → a lattice cell.
Measured **36×** inside-vs-outside at the default strength and **50×** at the
maximum, against the ~1× a mis-mapped coordinate would give. With the impulse
resized the residual does now register it too (2.0e-4 → 3.3e-3 per step, falling
back to 8.6e-7 once it settles).

**Never destroy a buffer that is being mapped.** A readback is asynchronous, so
pressing Reset while the run loop is going tore down the staging buffer with a
`mapAsync` in flight. It rejects with *"Buffer was destroyed before mapping was
resolved"* — and nobody is awaiting it any more, so it lands as an **unhandled
rejection**: a red error badge on the page on every Reset while running,
reproducible every time. `destroy()` now waits for any in-flight reduce or
snapshot to settle rather than swallowing the error, because a suppressed
rejection would make a real teardown bug look identical to a benign race.

It was invisible to the suite, and the reason generalises: **neither
Playwright's `pageerror` nor a console listener reports unhandled rejections**,
so every error assertion passed while the live page showed an error badge. It was
found by looking at a screenshot. The regression now reads the page's *own* error
buffer after exactly that sequence.

**A renderer is bound to a simulation, so a rebuild has to rebuild it too.** The
volume renderer was destroyed by every rebuild and recreated only by the view
selector's change handler, so pressing Reset in 3D left it null and `drawOnce()`
returned early: a dead view, no error, no way back short of toggling the
selector. `buildInner()` now recreates it when the current view needs it, falling
back to the slice if that fails.

This one is a caution about fixing things: it was **created by preserving the
view across Reset**. Before that, every build forced the view back to the 2D
slice, so the 3D view was never live across a rebuild and the missing
re-creation could not show. Preserving the view is right; it simply exposed a
lifecycle that had never been exercised.

**A rebuild requested during a rebuild is queued, not dropped.** `build()`
returned early while one was in flight. On a phone a rebuild takes seconds, so a
Reset tap in that window silently vanished — which is exactly what "Reset doesn't
work consistently" looks like from the outside. One pending slot is enough, since
the controls are read at the start of a build.

**Teardown is awaitable.** `destroy()` can defer past an in-flight readback, so
callers about to allocate a replacement simulation must await it — otherwise the
old lattice and the new one are resident at once, which at high resolution on a
phone is the difference between fitting and failing to build.

**Reset resets the simulation, not the controls.** 2D/3D, the field selector, the
slice axis and the slice position survive a Reset, a resolution change and a τ
change. A scene's declared view defaults are applied only when the *scene itself*
changes, and the view selector falls back only when the current choice is no
longer offered (no GPU). Smoke checks pin both halves — that the settings stay and
that the step counter really did restart.

## Sizing

There is **one adapter and one device for the page**, shared across rebuilds.
Requesting a device per build is wasteful, and dropping the previous adapter can
tear the WebGPU instance down underneath the new one.

A D3Q19 lattice is 19 floats per cell, doubled for ping-pong. The channel at 96³
wants a **128.3 MiB** storage binding against a 128 MiB default limit — so the
page asks the device for its limit first and clamps the resolution ladder to what
fits, rather than discovering it by failing. And a failed build never leaves the
page without a simulation: it keeps what was running and says what went wrong.

## Passive scalar transport, and what it proves about the architecture

The claim above — "adding heat means registering a scalar field and an operator,
with no core change" — is now measured rather than asserted. `operators/scalar.js`
is a passive scalar advected and diffused by the flow, and it needed **zero**
changes to `solver.js`, `operator.js`, `fields.js` or `simulation.js`: a new
operator `type`, two new fields, a kernel in each backend, and the WGSL.

It is a **second D3Q19 distribution** `g` on the same stencil as the fluid, with
the first-order equilibrium `g_eq = w_q C (1 + c.u/cs^2)`; relaxing it at rate
`1/tau_g` and streaming recovers advection-diffusion with `D = cs^2 (tau_g - ½)`,
so `tau_g` sets the diffusivity exactly the way `tau` sets viscosity. The velocity
comes from the fluid's `macro` field, bound **read-only**, so the coupling is
one-way and the solver runs the fluid first, then the scalar, on the strength of
the declared reads/writes alone. Concentration `C = sum g_q` is a cache, like the
fluid's rho and u.

**Verified against closed forms** (`test/lattsim/scalar.test.mjs`, CPU reference):
the measured diffusivity matches `cs^2 (tau_g - ½)` to 2%, a blob's centroid moves
at the flow speed to 1%, and the total scalar is conserved arithmetically (the f64
run improves the residual >1e3x, the same instrument the fluid uses). The WGSL
scalar kernel is compiled up front and **compared cell by cell against the CPU
reference** in the smoke test, on concentration and total scalar.

**The dye plume, and reconstructing it from the walls.** The `dye` scene injects a
scalar needle upstream of a cylinder; `concentration` is a render mode. On top of
it, the page's field-reconstruction demo places a ring of wall sensors that read
velocity and pressure ONLY — never the dye — and one shared-covariance
`FieldReconstructor` (one covariance, one readout per cell) rebuilds the whole
concentration slice from them. It is the industrial soft sensor: infer the
composition you cannot instrument from cheap boundary signals. Measured
(`test/lattsim/reconstruct.test.mjs`): a laminar dye channel reconstructs from 12
wall sensors at nRMSE ~0.08 over 647 cells; the turbulent-wake numbers, and the
sensor-placement study behind the layout, are in `experiments/`.

The batched readback that makes it affordable is `backend.probeMany(field, cells)`
— one staging buffer, one map, one component-array per cell — because a per-cell
probe would serialise a hundred sensors through the single probe buffer every
frame.

## Not implemented, deliberately

Heat as a *coupled* field (buoyancy feeding back into the flow), elasticity,
electromagnetics and multiphysics coupling are still **architecture, not code** —
though passive scalar transport above is the proof the architecture holds: an
operator declares the fields it reads and writes, the solver uses that to order
operators and reject conflicting writes, so coupling is stated rather than implied
by call order.

Adaptive resolution is not implemented either — but the lattice owns its spacing,
origin and indexing rather than assuming unit cells, which is what keeps it
possible.
