# The plan to reach the north star

Written against `CLAUDE.md`'s **THE NORTH STAR**. Every step below names the measurement that
decides whether to continue, because a plan whose steps cannot fail is a wish list.

## What the record already settles

Three findings make this plan shorter than it looks, and all three are measured rather than
assumed.

**Three of the four layers already transfer.** The conventional rung fits in the reference's
own state. The pilot cascade models what the layer below it left, and transfers to a signal
the machine has never run — 26.0x on a two-tone sine where a phase-indexed table is worth
0.55x, *worse than nothing*. And the harmonic rung's OPERATOR is a plant model that transfers
too: measured on a program it was not fitted on, 0.61 against 0.60 at home. Only the harmonic
rung's TABLE is a memory.

**So the problem is one component, not the architecture.** The table is the part addressed by
position in a lap, and it is the part that dies on a change of program or feedrate.

**And the gap it fills is about 1.9x, not 130x.** On the arm the cascade alone reaches 10.94x
and the composite 20.34x. The 130x figure in the record is the EMPS axis's model-error against
lap-repeatability, which is the hardest case; the arm's gap is a factor a better model could
plausibly close.

## Phase 0 — build the bench, because transfer cannot be optimised unmeasured

Nothing else in this plan is steerable without this, and it is the single largest gap in the
project's instrumentation today: **the contract bar is one program at one feedrate.**

- A `transfer.test.mjs` that commissions ONCE and scores a matrix: programs (rounded 8x8,
  rounded 10x6, circle r3, circle r5, sharp 9x7) x feedrates (1e-3, 2e-3, 4e-3, 1e-2).
  Report the matrix, the worst cell, and the ratio to a per-cell commission.
- The headline becomes the WORST CELL, not the home cell. A method that wins at home and
  loses at 1e-3 has not improved anything.
- Wire the same matrix into the page's Sweep, so the degradation is visible rather than
  inferred.

**Decides:** nothing yet. It is the instrument. Cost: ~1 day, and every later number depends
on it.

## Phase 1 — baseline the transferable half honestly

Run the bench on cascade-only (no harmonic rung) and on the full ladder.

**Expected from the record:** cascade-only 2.48x-10.94x across programs; the full ladder
better at home and worse or catastrophic away. If the full ladder is NOT worse away, the
premise of this plan is wrong and the north star needs rewriting — which is exactly the
check worth running first.

## Phase 2 — THE DECIDING EXPERIMENT, run early because it chooses the route

The north star's own falsification clause: **can a model-based layer, given the same
commissioning budget, reach within 1.3x of the lap-periodic table on the table's own
program?**

Three candidate improvements to the pilot's forecast, each already pointed at by a
measurement:

1. **Pose-scheduling on the ACTUAL applied torque.** The composite measured held-out R^2
   across programs: static/commanded 0.20, +memory 0.68, pose-scheduled on COMMANDED torque
   0.66 (nothing), actual torque +memory 0.77, **actual +memory +pose-scheduled 0.84** —
   against a shuffled-target control of 0.46. The pilot observes torque already; it does not
   pose-schedule. This is the cheapest test and has the strongest prior.
2. **NGRC as the forecast basis.** `lib/ngrc/` is a golden-vector-tested nonlinear vector
   autoregression built for exactly this shape — lag window plus polynomial features — and
   it is not used by the pilot, whose basis is a linear ARX with an optional quadratic block.
   The NGRC page already measures it against an ESN, an MLP and a linear ARX on prediction.
3. **A window that REACHES the mode** (rule 37), and multi-rate lags. Measured twice: linear
   features with the right window beat a 544-feature map with the wrong one at a third of
   the cost.

**Every candidate is scored ON THE MACHINE across the Phase 0 bench, never on fit.** The
record is unambiguous that fit ranks these backwards: on both plants measured, the
best-fitting probe design is the worst controller. Selection by rule 42 — within 5% of the
best measured improvement, take the cheapest.

**Decides the route.** Within 1.3x -> Phase 3A. Not within 1.3x, across plants -> Phase 3B,
and the north star gets rewritten to say so.

## Phase 3A — retire the memory

If a model layer matches the table, the harmonic rung comes out of the default ladder and:

- Commissioning collapses. The harmonic rung is 85 of ~127 planned runs and 56% of wall
  clock; a model layer commissions like a pilot layer, roughly 8-10 runs.
- Program- and feedrate-agnosticism follow by construction, because nothing is addressed by
  lap phase any more.
- The 22.42x has to be re-earned on the bench's WORST cell, not at home.

## Phase 3B — make the memory cheap and honest

If the model cannot match it, the fallback is already half built and should be wired
regardless, because it helps under either route:

- **`exportOperator()` is the plant model, and it transfers.** A second program of the same
  lap pays for refinement only — measured 32 laps -> 10. Wire it into `AutoStack` and the page
  so a change of program re-uses the identified operator instead of re-identifying.
- **Re-index the table by ARC LENGTH on the part rather than by lap sample**, so a feedrate
  change addresses the same physical point. This is what `pathilc.js` already does and what
  `hff.js` does not.
- Then the honest claim becomes "one identification per plant, a short re-commission per
  program", and the north star is rewritten to that.

## Phase 4 — commissioning cost, beyond what Phase 3 gives free

Measured already, so this is arithmetic rather than hope:

- Machine restore instead of rebuild: **done**, 1.35x, byte-identical.
- The obvious knobs are NOT free: banded off with refinement 24 -> 10 ships 18.39x against
  22.42x and fails the contract. Do not spend result quality for time.
- **Move candidate selection off the machine.** The harmonic rung spends 24-48 runs scoring
  candidates. Screen them on held-out data and score only the survivors — but the record
  warns the fit ranks them backwards, so the screen must be validated against a full machine
  sweep before it is trusted to prune.
- `WARMUP` is a built knob and still unmeasured. It covers the machine's transient AND the
  correction's; only the first is removed by machine restore. Measure both halves.

## Phase 5 — plant agnosticism, held and widened

- The six-plant bar must not regress: 2R arm, quadruple tank, extruder barrel, Wood-Berry
  column, cold mill AGC, EMPS servo axis.
- **Add a plant whose DELAY dominates its own response.** None of the six has one, and a
  receding-horizon controller with a forecast is exactly where dead time bites.
- Re-examine the standing refusals with the bench in hand: the mill at 0.42x, Wood-Berry
  losing to the published BLT, the barrel. A refusal that is right for a measured reason is
  a result; one that is right by accident is a defect waiting.

## What would kill this plan

- **Phase 1 shows the full ladder does not degrade away from home.** Then the premise is
  wrong and this document is the thing to throw away.
- **Phase 2 fails across plants.** Then memory is doing something a model cannot, and the
  product is a fast per-program re-commission rather than transfer. That is a different north
  star and must be written as one rather than quietly become this one.
- **A model matches on the arm and fails on the EMPS axis.** The axis has a four-parameter
  closed form and its authors published it; its model-error-to-repeatability ratio is 130x
  against the arm's ~2x. One plant agreeing is not a method — the six-plant bar exists
  precisely because a common factor across plants that share no physics is a property of the
  code (rule 18).
