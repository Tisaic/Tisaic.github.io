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
| `operators/scalar.js` | The passive-scalar advection-diffusion operator (a second D3Q19 distribution, advected by the fluid, one-way coupled). |
| `operators/elastic.js` | The linear elastic solid — a vector velocity and a symmetric tensor stress on a staggered velocity-stress leapfrog. Not a distribution, which is the point. |
| `operators/frame.js` | Gravity and the non-inertial frame: it WRITES the shared body-force field the elastic operator reads, so the coupling is declared rather than implied by call order. |
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

`test/lattsim/` runs in plain Node — f64 available, seconds not minutes, and no adapter.
This is where a physics claim belongs.

| File | What it pins |
|---|---|
| `d3q19.test.mjs` | The isotropy conditions (Σw = 1, Σwc = 0, Σwc⊗c = cs²I) that put D3Q19 in the Navier–Stokes limit. |
| `engine.test.mjs` | Indexing, units, field layout, region ordering, and the solver's two write-discipline rules. |
| `conservation.test.mjs` | Mass and momentum in a periodic box and in a closed one. Run at BOTH f32 and f64: the f32 residual is either arithmetic or a leak, and only the f64 run separates them. |
| `poiseuille.test.mjs` | The exact parabola, its second-order convergence, and the wall position against the two plausible wrong ones. |
| `scalar.test.mjs` | Diffusivity, advection centroid speed, and total-scalar conservation against their closed forms. |
| `eos.test.mjs` | The pressure force, against a standing acoustic wave. |
| `elastic.test.mjs` | P and S wave speeds and their ratio, second-order convergence, the traction-free surface, the cantilever, gravity and the rotating bar. |
| `reconstruct.test.mjs` | Rebuilding a concentration field from boundary sensors alone. |

The Verify tab runs the same protocol in the browser against whichever backend is live,
which is the only way the WGSL kernel is exercised on real hardware.

For the tiers and the FOCUS default, see `CLAUDE.md` — the split has drifted twice and
both re-measurements are in `docs/history/testing.md`.

## What ships

**Collision.** TRT with omega-minus pinned for stability, plus the Smagorinsky sub-grid
model. BGK and TRT at Lambda = 3/16 stay in the library because the analytic verification
needs both to measure the wall result, but they are not a page choice — one of them
shipped as a default once and diverged at the shipped sliders.

**The limiter: the run cannot crash.** In the collide kernel of BOTH backends, density is
clamped away from zero, velocity is clamped at 0.35, and any population that still comes
out non-finite is REPLACED by the equilibrium at the sanitised moments — so a NaN is
caught in the cell where it appears and can never stream to a neighbour. The comparisons
are written `!(x > lo)` rather than `x < lo`, because the first is true for a NaN and the
second is not. The bounds never fire in a healthy run, and that the analytic cases are
untouched is ASSERTED. The reduction counts clamped cells, `diagnostics()` returns
`limited`, and the verdict reads `limited — N cell(s) held` BEFORE any stability verdict,
because "it looks stable" is the wrong conclusion to draw from a rescued run.

**Boundaries.** Halfway bounce-back; `MOVING` is a WALL with a momentum correction rather
than a driven fluid cell; the inlet imposes a velocity and the outlet is pulled weakly
toward rest (`outletAnchor` 0.2, measured at both ends). The open boundaries are FIRST
ORDER and mildly reflective.

**EOS pressure force.** `p(rho)` with the effective sound speed as a knob, checked against
a standing acoustic wave.

**Diagnostics**, computed on-device in one reduction pass: mass, momentum, density range,
uMax, the per-step residual, the count of clamped cells, Re, Re_cell against the
per-model ceiling, and a named verdict. The residual is normalised PER STEP, so it does
not change when the steps-per-frame control moves.

**Readback.** `probe()` is 16 bytes for one cell; `probeMany()` batches a set.

## Measured properties, not defects

- Poiseuille converges cleanly at second order, and the halfway-bounce-back wall position
  fits better than the two plausible wrong ones (H = Nz-2).
- With TRT at Lambda = 3/16 the wall is exact at every viscosity — measured to 1e-11,
  ten orders better than BGK, whose tau-dependent slip this file used to record as a
  limit.
- f32 loses forcing increments around 1e-7, below the resolution of the populations they
  are added to.
- The cavity's corner density extreme is real: a moving wall meeting a stationary one is
  formally singular, and restricting the lid to the interior raised it rather than
  lowering it.
- The sub-grid model OVER-DISSIPATES in laminar flow — Smagorinsky's textbook flaw, since
  it responds to the total strain and not the unresolved part. The analytic verification
  therefore runs unmodelled, and the page names which mode is holding a run together.

## Not implemented, deliberately

Heat as a COUPLED field (buoyancy feeding back), electromagnetics, multiphysics coupling
and adaptive resolution. The architecture is what makes them possible rather than
rewrites: an operator declares the fields it reads and writes, the solver orders operators
from that and rejects two writing one field in a stage, so coupling is stated rather than
implied by call order — and the lattice owns its spacing, origin and indexing rather than
assuming unit cells.

**Elasticity is NOT on this list any more** — `operators/elastic.js` and
`operators/frame.js` ship and are verified in `test/lattsim/elastic.test.mjs`. It is the
first operator that is not a lattice-Boltzmann distribution: a vector velocity and a
symmetric tensor stress advanced by a staggered velocity-stress leapfrog, touching none of
the solver, the operator base, the field registry or the simulation facade.

**A WGSL elastic kernel is not built, and the measurement says when it should be.** The
shipped links are ~1.2k cells, where three dispatches of encode-and-submit overhead cost
more than the CPU reference's whole step. The crossover is between 6k and 17k cells per
link; a real-resolution arm at dx 8 mm is ~22k, which is past it. See
`docs/history/lattsim-engine.md`.

**Block-sparse bricks** for a CLOSED structure — a gantry, a machine frame, where members
are not separable into per-link frames — remain the right answer there and are not built.

---

The measurement history for everything above is in `docs/history/lattsim-engine.md`.
