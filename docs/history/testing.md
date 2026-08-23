# Verification tiering — the measurement history

Why the tiers are where they are, and the two occasions the split was re-measured and cut.
The rules distilled from this are 1-4 in `CLAUDE.md`.

---

### THE SOFTWARE ADAPTER IS THE LAST RESORT, NOT THE DEFAULT

CI has no GPU. `--enable-unsafe-webgpu` gives headless Chromium a **SwiftShader
adapter**, which is the CPU pretending to be a GPU: it is two to three orders of
magnitude slower than real hardware, it is most of this suite's wall clock, and
it is not the thing the page runs on in front of a user. **Verify a claim by the
cheapest route that can actually falsify it, and reach for the software adapter
only for what nothing else can reach.** In descending order of preference:

1. **Plain Node against the CPU reference** (`test/lattsim/*.test.mjs`). Physics,
   numerics, conservation, closed forms, operator write-discipline, unit systems,
   model accuracy. No browser, no adapter, seconds not minutes, and f64 is
   available — which the GPU path can never offer. **This is where a physics
   claim belongs.** `d3q19.js` is the single source of truth and the WGSL is
   GENERATED from it, so a constant verified here is verified for both backends.
2. **The browser on the CPU backend.** Wiring, UI state, lifecycle, cadence,
   screen→cell mapping, chart alignment, the page's own error buffer. None of
   that depends on which backend is underneath, and forcing the CPU backend
   removes the adapter's cost from checks that were never about the GPU.
3. **The software adapter, for the three things only it can reach:** that every
   WGSL kernel COMPILES (a reserved word shipped silence once already), the
   cell-by-cell CPU/GPU PARITY check, and WebGPU resource/limit behaviour
   (binding sizes, `vec3` packing offsets, device lifecycle across rebuilds).
   Keep these narrow and step-count-bounded.
4. **A real device.** Anything involving a surface — the raymarched volume view,
   real timing, real memory limits. `getCurrentTexture()` on the software adapter
   does not merely fail, it DESTROYS the WebGPU instance, so a check that needs a
   surface cannot be written here at all.

Two rules follow. **A check that is too slow to run is a verification problem,
not an inconvenience** — if a browser check needs thousands of steps, shrink the
lattice and the windows until it fits, and say in the comment why that does not
weaken it (the wiring does not depend on lattice size). And **when a check moves
down this list, say what the lower tier can no longer see**, so a gap is stated
rather than assumed away.

### THE QUICK TIER WAS 8 MINUTES AND CLAIMED 1m35. MEASURED, THEN CUT.

The tier split was made once on measured timings and then never re-measured, so
it drifted: `engine.test.mjs` is recorded above at 127 s and had reached **196 s**,
and the quick tier as a whole was over 8 minutes. **FIVE CHECKS WERE 187 OF THOSE
196 SECONDS**, so this was five decisions, not a slow suite.

Every reduction was MEASURED against the assertion's own margin rather than
guessed, and the pattern that made them free is that **resolution was a cost knob
and not a physics one in every case**. Re_cell = u/ν depends on τ and the inlet
speed, not on how many cells the channel has; a residual normalisation is a
property of the arithmetic; a cadence-independence claim has no length scale in
it at all. Quick tier now runs res 12 and full keeps res 16:

  the sub-grid model check    46.2 s → 23.8 s   margin 21× against a required 4×
  the residual falls          40.6 s → 10.4 s   fall 3895× against a required 10×
  the cadence-independence    27.8 s →  9.5 s   same claim, no length scale
  the oscillating lid         46.1 s → 10.1 s   see below
  the survives-Re_cell-48     26.5 s →  9.5 s   800 steps, past the measured
                                                step-400 death it must outlive

**engine.test.mjs: 196 s → 72 s, all 72 checks still passing; the quick tier
373 s.** Two of these deserve their own note.

**THE LID CASE GOT BETTER, NOT JUST CHEAPER.** The 3000-step transient wait was
sized for H = 16, and the impulsive start decays as H²/ν — so the wait is a
function of the box, and shrinking the box shortens it for free. Measured on the
steady-lid momentum spread, which is what "settled" means here: res 16 / 3000 →
7.7e-14 at 46.1 s; res 16 / 1600 → 1.4e-9, i.e. **NOT settled**; res 12 / 1600 →
5.1e-14 at 10.1 s. Cutting the steps alone would have been the weakening. Cutting
both is not — the smaller box is better settled than the original was.

**AND ONE FLOOR IS MEASURED RATHER THAN CHOSEN.** The residual block is cheaper
still at res 10 (5.4 s, fall 8603×) but the third check in that block asserts the
verdict says `steady`, and at res 10 the lattice velocity reaches 0.182 so the
verdict reports THAT instead — the check would be asserting something the run no
longer says. 12 is the floor because 10 was tried.

WHAT THE QUICK TIER CAN NO LONGER SEE, stated rather than assumed away: at res 16
the sub-grid-modelled run needs NO rescuing at all (0 cells held, verdict
`marginal`) against 3816 held bare, which is the stronger form of that claim. At
res 12 it is 82 against 1742. Full tier keeps the stronger one.

STILL OUTSTANDING: the browser sections are now **257 s of the 373**, all of it on
the software adapter, and most of those checks are wiring — which the tier list
above says belongs on the CPU backend. That is the next cut and it is the larger
one.
