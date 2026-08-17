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

## Not implemented, deliberately

Heat, diffusion, elasticity, electromagnetics and multiphysics coupling are
**architecture, not code**. An operator declares the fields it reads and writes;
the solver uses that to order operators and to reject conflicting writes, so
coupling is stated rather than implied by call order. Adding heat means
registering a scalar field and an operator, with no core change.

Adaptive resolution is not implemented either — but the lattice owns its spacing,
origin and indexing rather than assuming unit cells, which is what keeps it
possible.
