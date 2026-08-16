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

## Not implemented, deliberately

Heat, diffusion, elasticity, electromagnetics and multiphysics coupling are
**architecture, not code**. An operator declares the fields it reads and writes;
the solver uses that to order operators and to reject conflicting writes, so
coupling is stated rather than implied by call order. Adding heat means
registering a scalar field and an operator, with no core change.

Adaptive resolution is not implemented either — but the lattice owns its spacing,
origin and indexing rather than assuming unit cells, which is what keeps it
possible.
