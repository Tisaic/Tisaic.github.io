# CLAUDE.md

Project context and working notes for `Tisaic.github.io`. This file is
rendered in-app by the **CLAUDE.md** button so the current state can be
reviewed from a phone.

## What this project is

A single-page static site hosted on **GitHub Pages** at
`https://tisaic.github.io`, used as a sandbox for a **browser-driven testing
workflow**: iterate on the page from Claude Code, view it in Android Chrome,
and feed console output back to Claude.

## THE NORTH STAR

**Wire it up, press one button, use it — on any dynamical system, for any program it is
later asked to run.** That is the whole product. Everything in `Current state` is progress
toward it and none of it is that yet.

Stated in full, the claim has five parts: small enough in memory and arithmetic to run in a
PLC scan; reusable across plants that share no physics; robust and tolerant of what it was
not shown; completely self-tuning; and strong on LINEAR and NONLINEAR plants alike.

### Where it actually stands against that claim

One of the five is supported by the evidence. One is contradicted by it. The rest are
unmeasured or partial, and saying so is worth more than the claim is.

| Part of the claim | Status | The evidence |
|---|---|---|
| Completely self-tuning | **SUPPORTED** | No per-plant constants; every threshold re-derived from measurement; and it REFUSES with a stated reason, asserted to be right for the right reason. Rare, and the strongest thing here. |
| Robust and tolerant | **CONTRADICTED ON TWO PLANTS: EVERY DEPLOYMENT HARMS THE MACHINE** | Every plant's number is one commissioning DRAW and only now measured across seeds (`test/pilot/spread.mjs`). The two plants that win are repeatable — EMPS 1.05x spread over 8 seeds, the arm 1.13x over 6 — and the two that do not are draws of 2.2x and 4.2x, so the failures differ in KIND and not only in size. Split by whether the pilot acted: on **Wood–Berry 9 of 12 seeds deploy and ALL NINE are worse than the 3 that refuse** (median 64.65 against 43.90); on the **tank at the old defaults 4 of 8 deploy and ALL FOUR hurt** (median 0.675x). Two plants sharing no physics, same shape: the refusals are the good outcomes. |
| Reusable across plants | **2 CLEAR WINS OF 6 — AND THE OTHER FOUR ARE NOW HONEST RATHER THAN QUIET** | Arm and EMPS win and are repeatable across seeds (1.13x, 1.05x). The other four were quoted from single draws and are not: Wood–Berry deploys on 9 of 12 seeds and **all nine are worse than the 3 that refuse**, while the plant WITHOUT the pilot (43.90) already beats the published BLT (51.95); the tank's 1.32x is one draw from a distribution that deployed 4 harmful controllers in 8. **A representative program at the verify fixes both** — Wood–Berry refuses all 12, the tank deploys 3 of 8 and all three help (median 1.512x, nothing made worse, gate correlation 0.989 against -0.057) — and leaves EMPS byte-identical. Arm, mill and barrel not yet run that way. |
| PLC memory and CPU | **REACHABLE AND COSTED — 9,517 MAC/CYCLE AGAINST A 10,000 BUDGET — BUT NOT WHAT SHIPS** | Memory was never the problem and is now smaller again: the forecast bank is ONE model for every lead, not one per lead — 727 kB of covariance to 10.7 kB, deployed bytes 25.4 kB to 6.0 kB, fit memory 30.4 kB to 11.0 kB — and it is BETTER on both plants that deploy (EMPS 12.70x → 14.69x, arm model-only 7.8154e-2 → 7.4340e-2) — **and the QUADRUPLE TANK now REFUSES at 0.08x where it deployed at 1.32x — but the result it lost was never reproducible.** `tanks.test.mjs` fails 6 checks at HEAD, passed at `c24bede`, and the deploy is lost at `20de1b7` (nine leads built instead of every lead), confirmed by reversal: raise `LEAD_SAMPLES` and it deploys again. Then the fix refused to behave like one — 9 refuses, 16 refuses, **24 DEPLOYS at 1.28x**, 32 refuses — and at the last PASSING commit, changing only the commissioning seed, the tank passes at two offsets and fails five checks at a third. So the shared fit did not break a solid measurement; it moved a marginal one across a threshold it was already sitting on, and the 1.32x in the six-plant line is a coin rather than a controller result. The fix is to make the tank's own score reproducible across seeds BEFORE deriving any constant against it — tuning a lead count until it goes green is fitting to a coin flip (rules 3, 31). Three other explanations were killed by measurement: `qpIters`, forecast gating (R² 0.93-0.99 at every lead, nothing gated — rule 16), and my own working changes. The fit is `lib/pilot/rls.js`: shared-covariance RLS, seeded from the commissioning posterior, gated at 4.6e-10% against the batch solver it replaces. **The deployed arithmetic is now met too, and by the six-plant pass rather than by a projection.** What shipped was 42,914 MAC/cycle on EMPS, 429% of 10% of a 1 ms scan. `test/pilot/sixplant.mjs` swept `qpIters` and `horizonTs` across all six plants at once — the first such pass this project has run — and rule 42's band picked 2 iterations at 1.2·Tset: **9,517 MAC/cycle, 95% of budget**, with EMPS 4.8% down and the arm 3.1% (both inside the band) while Wood-Berry improves 4.7% and the mill's verify climbs 23%. The earlier projected corner reached 101% and gave up 13% of the delivery; this reaches 95% and gives up 4.8%, because that projection held the fit mode fixed and the knobs are not separable. **It was made the default and then REVERTED**: the arm's ladder ships BETTER there (23.15x against 22.42x) while `autostack.test.mjs`'s contract — on the MODEL-ONLY stack, which is what survives the memory's retirement — goes 8.5e-2 to 9.14e-2 and red, and EMPS' cascade drops to two layers. The pass measured six plants' HEADLINES while the contracts sat one level down, which is the same fault it was built to close. The corner stays available through `setSolverDefaults` and is not imposed (rule 31). The pass also found a NaN no check could see: `pilot.N` set beyond the fitted bank reads unfitted leads and returns NaN, which passes every bounds test — now clamped and reported. And on six plants only two deploy, so this is two plants with four negative controls. |
| Linear AND nonlinear alike | **CONTRADICTED** | Sorted by nonlinearity the results run the WRONG WAY. The most linear plant — Wood–Berry, linear transfer functions with dead time — LOST to a 1980s classical method (72.08 against the published BLT's 51.95). The most nonlinear — barrel as T⁴, tank as √h — refused and 1.32x. The wins are the arm and EMPS. The honest description of what works is not "linear and nonlinear alike" but ONE ERROR CLASS done very well: mechanical compliance and friction. |

**And nothing here has been compared to the state of the art.** The baselines are this
project's own conventional machine, published values for the specific rig, and a hand-tuned
ILC. Not norm-optimal ILC, not modern MPC, not L1 adaptive, not DeePC or behavioural methods,
not Koopman-EDMD. "Best in the world" is a claim about a field and the field has not been
engaged. The defensible sentence today is: *beats the conventional machine, and on one real
axis beats the published model-based feedforward at its own published parameters.*

### What is actually wrong today

**The rung that produces the biggest number is a MEMORY.** The lap-periodic table says so in
its own report row — *"a MEMORY: it will not transfer to another program"* — and it is the
difference between 5.4e-2 and 1.8e-2 on the arm. So the headline is carried by the one
component that is guaranteed not to survive a change of program, and the parts that DO
transfer are the ones that score less. That is not a bug to fix in the table; it is the
shape of the whole design, and it is what has to change.

**Anything the commissioning did not see, breaks it.** Change the feedrate, the plant or the
path and the machine degrades — not gracefully, catastrophically. The evidence is already in
this file and was written down as a success: the composite measures 4.9x to 20.3x across five
programs and on one of them it makes the machine WORSE; a phase-indexed table worth 125x on
the program it learned reaches 0.55x on a sine — worse than doing nothing. A number that
holds only where it was measured is a calibration, not a controller.

**Commissioning is outrageous.** Roughly half an hour on one plant for one program, and the
honest accounting is worse than it sounds: it buys a result that a change of program can
erase. The cost is ~127 scored runs; the physics inside them is about a tenth of the wall
clock (`test/flexisim/_cost.mjs`).

### THE SCORE IS THE UNSEEN PATH. LAP IMPROVEMENT IS SECONDARY.

**Every headline number is quoted on the FIRST SCORED LAP of a program the controller has
never run.** Lap-over-lap improvement is reported beside it and never instead of it, because
a number reached only after laps of ONE program is a memory however it is implemented: it
buys performance by repetition and cannot deliver it on a part that has not been cut before.
This is the ordering the whole north star rests on — a controller of the PLANT scores the
same on the first part as on the hundredth; a controller of the PATH does not.

Four consequences, all of them binding:

- **A converged score is not a result, it is a trend.** Quote it as the second column. Where
  a run scores its LAST laps — this repository did, on twenty — say so in the same sentence.
- **The start-up transient belongs in its own column.** Lap 0 starts the machine at rest on
  a program that demands motion immediately, and that transient is identical for a frozen and
  an adapting model: on EMPS' held-out sine, frozen reads 0.1191 mm on lap 0 and 0.0415 mm on
  lap 1 with the weights untouched, a factor of 2.9 that belongs to the transient and not the
  controller (rules 13, 25). The first SCORED lap is lap 1.
- **The ordering changes what wins, which is the evidence that it matters.** Online
  adaptation on EMPS was written up here as 8.77x -> 12.16x on a held-out sine. Read on the
  first unseen lap the same runs are 8.77x -> 9.32x, and the remaining 39% is twenty laps of
  the one sine. Worse for the old ordering: it had ranked the accumulating estimator
  (lambda 1) first and discarded fast forgetting as divergent. Scored on the first unseen
  lap, **lambda 0.999 reads 32.49x against frozen's 8.77x — 3.7x better on a path it has
  never run, on the lap it first sees it** — and then walks away to 0.08x by lap 20. The
  configuration the converged score threw away is the one that wins the score that matters,
  and its divergence turned out to be covariance WIND-UP with a name and a cure: `P` is
  divided by lambda every update, so a stream carrying no new information inflates it
  geometrically (measured directly: **x2.45e+8** over 20,000 rows in one direction). Bounding
  the covariance trace at a multiple of the commissioning posterior removes the divergence
  outright and leaves **28.95x on the first unseen lap at bound 128, 39.58x at 512**, with the
  seen program at 49.36x on ITS first lap against the 21.20x that used to take twenty. Sixty
  laps then falsified the twenty-lap reading in turn: every bound still creeps off its 0.0077 mm
  floor, by +12% at 128 and +118% at 512, so the bound converts a divergence into a drift rather
  than removing it. (`test/pilot/adapt.mjs`, `test/pilot/rls.test.mjs`, plan step 6e-corrected.)
- **AND FORGETTING MUST NEVER COST THE COMMISSIONING. THE IDENTIFICATION IS KEPT FOR EVER;
  FORGETTING APPLIES ONLY TO WHAT ADAPTATION ADDS ON TOP OF IT.** The model is identified on a
  broadband SCRIBBLE and then run on one production program. A law that discounts old rows on a
  timer will, given enough of that program, have discounted away every row that carried the
  scribble's excitation — and what is left is a model of the one program, which is the memory
  rebuilt by an adaptive law and the exact object the retirement removes. Its shape is the worst
  a failure can have: excellent immediately, bad slowly, invisible to a short test.

  **THE INSTRUMENT IS A TRANSFER, NOT A DRIFT READING**, and building it overturned the reading
  above. Adapt on program A, FREEZE the weights, score on B, compare against the commissioned
  model on B: a creeping trace is equally consistent with a correction merely becoming mistuned
  for the program in front of it, and those are different faults with different fixes. Measured
  over sixty laps, **the commissioning is not being lost — the transferred model is better, by a
  lot**: adapted on the sine then scored on the program, 14.68x → **30.13x (+105%)**; adapted on
  the program then scored on the sine, 8.77x → **53.38x (+509%)** (bound 128; bound 512 +42% /
  +250%, directional +97% / +504%). So the drift is a property of the program being run, not of
  the model, and the earlier sentence here — that the drift *was* this failure beginning — was
  an inference from the wrong instrument. **At 300 laps — a million rows — it is still positive
  but decaying**: +94% and +339% against 60 laps' +105% and +509%. Retention erodes with the
  horizon and has not crossed; whether it eventually does is a longer run than any taken.

  `SharedRLS.setAnchor` is built for it either way — the estimate is pulled back toward the
  commissioned weights a fixed fraction per row, so the deviation is a bounded fading correction
  and the commissioned fit is a floor rather than a starting point. Measured at 300 laps it
  REVERSES the asymmetry rather than lifting both directions (sine → program +188% against +94%,
  program → sine +48% against +339%), so it is a trade against a horizon and a duty cycle rather
  than a default, and it ships off.

### What has to be true instead

Each of these is a claim that can be shown false, which is the only kind worth writing down.

1. **PROGRAM-AGNOSTIC.** Commission once on a plant. Then run programs the commissioning
   never saw — different shapes, different corner counts, different lengths — with NO
   recommissioning. Target: within 1.3x of a controller commissioned on each program
   individually, on every program in the set, with none made worse than the conventional
   machine. Today the transferable part alone is 10.94x where the memory-carrying stack
   reaches 20.34x, and one program of five goes backwards.

2. **FEEDRATE-AGNOSTIC.** The same deployed controller across the feedrate range the machine
   is actually run at, no recommissioning, no per-feed table. Target: monotone degradation
   bounded at 1.5x of a per-feed commission across a 5x span of feed. Today a feedrate change
   moves the lap length and the whole lap-indexed layer is addressed by the wrong index.

3. **PLANT-AGNOSTIC, AND ALREADY HALF PROVEN.** Six plants that share no physics is the
   existing bar and it must not regress: the 2R arm, a quadruple tank, an extruder barrel,
   the Wood-Berry column, a cold mill AGC, the EMPS servo axis. Target: every plant either
   improves or refuses for a reason it can state, and the reasons stay measured rather than
   tuned. Add a plant with a delay that dominates its own response, because none of the six
   has one.

4. **COMMISSIONING IN MINUTES, NOT AN AFTERNOON.** Target: 10x down — under three minutes on
   the arm — while holding the contract bar. What has been measured so far: restoring the
   machine instead of rebuilding it is 1.35x and byte-identical; the obvious remaining knobs
   are NOT free (banded off with refinement 24 -> 10 ships 18.39x against 22.42x and fails
   the contract). So the remaining factor has to come from needing FEWER SCORED RUNS, which
   means a method that learns more per lap — not from making each lap cheaper.

5. **HIGHER, NOT MERELY TRANSFERABLE.** Transfer bought by giving up performance is a
   different product, not this one. Target: beat 22.42x on the arm while satisfying 1 and 2.

6. **IT HAS TO FIT A PLC SCAN — UNDER 10%, ALWAYS, INCLUDING THE FITTING.** The budget is
   10% of a 1 ms task, it must be met in EVERY cycle rather than on average, and it covers
   commissioning, training and fit, because all of it runs ONLINE on the PLC. Nothing is
   done offline on a dev PC.

   **MEASURED, AND THE CURRENT DESIGN MISSES BY ABOUT 4000x.** The deployed path alone is
   428,660 MAC in its update cycle — 4x over even a generous budget, and it works only if
   sliced across the 72 scans between updates, which "always fit" forbids. The FIT is worse
   by orders of magnitude: batch ridge is 291.6 MMAC of normal equations plus a Cholesky per
   lead, ~20 GMAC per channel per layer, or two million cycles of budget. Batch
   normal-equations-and-Cholesky is an offline algorithm; requiring it online kills it
   outright rather than by a margin.

   **SO THE CONSTRAINT DICTATES THE ARCHITECTURE.** Online RLS with a SHARED covariance:
   every lead uses the same design matrix — same features, different targets — so `X'X` is
   common and only `X'y` differs. One `P` update per sample at 2n² (2,738 at n=37), one cheap
   readout update per lead. `test/pilot/shared.test.mjs` pins that the sharing is EXACT in the
   pilot — one row, N targets — and the pilot's batch `solveRidge` is the wrong shape for the
   product claim.

   **AND NOTHING IN THIS REPOSITORY IMPLEMENTS IT.** An earlier version of this line said
   `lib/ngrc/softsensor.js` "already implements and golden-tests" it. It does not:
   `rlsInit` is called once PER TARGET and `adapt()` runs `rls(theta[j], P[j], …)` in a loop,
   so it holds `nt` separate n×n covariances and pays `nt·2n²` per sample — the expensive
   shape, and the one the 2,738 figure assumes away. The per-target RLS is real and tested;
   the SHARING is the part that has to be written. Reading a design claim off a directory's
   reputation instead of its code is the same fault as costing the free response from
   `PreviewMPC` (rules 17, 30), and it was found the same way — by going to read it.

   **MEASURED, and it corrects the estimate in both directions.** The first pass here was
   arithmetic on a guessed feature count and `boxQP`'s default iteration count. `stack.test.mjs`
   now reports the real ones:

   ```
   layer 1: 37 feat, N 68   QP   571,200 MAC   RLS P update  2,738   25.4 kB
   layer 2: 37 feat, N 95   QP 1,105,800 MAC   RLS P update  2,738   33.6 kB
   layer 3: 73 feat, N 90   QP   993,600 MAC   RLS P update 10,658   57.4 kB
   TOTAL 2,683,201 MAC/cycle — 268x the 10% budget, and cyclesPerUpdate is 1, so
   there is no slicing headroom at all.
   ```

   Features are 37-73, not the 241 estimated, and memory is **116 kB not 482 kB** — that
   half of the problem barely exists. But the pilot runs the QP at **60 iterations**, not the
   8 in `boxQP`'s signature, so the miss is **268x rather than 4x**.

   **WHICH REVERSES THE LEVER.** At n=37 the RLS covariance update is 2,738 MAC — already
   affordable. One QP iteration at N=68 is 9,520. **Iterations first (60 → 1 is 60x), horizon
   second (it scales as N²), features barely at all.** The earlier "features first" was
   arithmetic on a feature count 6x too high and an iteration count 7.5x too low.

   **WHAT FITS**, one QP iteration per cycle in the real-time-iteration shape:

   | layers | N | features | QP/cycle | RLS/cycle | total | of budget |
   |---|---|---|---|---|---|---|
   | 3 | 68 | 37 | 28,560 | 15,762 | 44,322 | 443% |
   | 2 | 32 | 37 | 4,352 | 7,844 | 12,196 | 122% |
   | **2** | **24** | **32** | 2,496 | 5,632 | **8,128** | **81%** |
   | **1** | **32** | **37** | 2,176 | 3,922 | **6,098** | **61%** |

   **AND PART OF THE SHRINK IS ALREADY EVIDENCED AS FREE.** The bench measured model layers
   alone beating the full ladder across the envelope, and the cascade reading measured verify
   RISING (1.35x → 1.54x → 1.70x) while far-lead R² collapsed to 0.046 — so the lead bank,
   which is most of the memory, is largely paying for nothing. What the shrink costs against
   what it saves is a measurement, not an argument, and it is the one that decides whether
   this target and target 5 can both be met.

   **NOW MEASURED ON THE MACHINE RATHER THAN PROJECTED, AND THE TABLE ABOVE WAS PESSIMISTIC
   IN BOTH TERMS.** `test/pilot/qpsweep.mjs` and `qpsweep-arm.mjs` commission ONE pilot and
   re-deploy that same model at a ladder of iteration budgets, so the only variable is the
   solver's work. On the EMPS axis, x against the shipped cascade's 0.5764 mm:

   ```
   iters       1       2       4       8      16      32      60     120     480
   x       10.62   10.35   12.17   11.69   12.28   12.56   12.70   12.71   12.71
   uPk      0.76    0.76    0.77    0.77    0.91    1.28    1.49    1.47    1.47
   ```

   **ONE ITERATION DELIVERS 84% OF THE RESULT AND FOUR DELIVER 96%**, so rule 42 takes 4; and
   on the 2R arm **two iterations BEAT sixty** — 6.94x against 5.97x on the rounded rectangle
   and 8.71x against 6.92x on the circle — at a thirtieth of the cost. The arm's `uPk` is
   0.118 against 0.120, so it is not a smaller correction but a differently shaped one, and
   rule 39's split says where: bias ~0 in every row, the whole difference is OSCILLATION.
   **The converged solve rings and the truncated one does not.** The QP inverts a forecast,
   so the iteration count is a second regulariser on that inversion alongside `lambda` — and
   the two are therefore one knob approached from opposite ends.

   **WHICH RECONCILES THE ONE THING THAT FAILED.** `test/pilot/rti.test.mjs` measures that one
   iteration per cycle does NOT track the sixty-iteration move — 88% of the applied signal —
   and that sixty is itself 36% from this solver's own optimum. Both are true and neither
   matters: **the converged solve is not the answer we want.** A scheme cannot be rejected for
   failing to track a target that is worse than what it produces (rule 16).

   **THE HORIZON, WHICH THE TABLE ABOVE LEANED ON, DOES NOT TRUNCATE.** Same fitted bank cut
   to its first N leads, at 4 iterations on EMPS: N=48 costs 9%, N=32 loses two thirds, N=16
   more than two thirds. `1.5·Tset/grid` is not slack, so the projected `N 24` and `N 32` rows
   above are not available on that plant.

   **AND TWO FAULTS IN `cost()` ITSELF WERE MAKING THE GAP LOOK BIGGER THAN IT IS** — both the
   model of the code drifting from the code (rules 17, 30). It counted the STORED lead bank
   rather than the leads `act()` evaluates, so the forecast term was invariant under the one
   knob that cuts it; and it costed the free response as `min(N,M)·M/2` on the FINE impulse,
   carried across from `PreviewMPC.cost()` where the preview really does convolve it, where
   `_horizon` builds it from `hGrid` at N — 20,366 MAC against 2,278, a third of the total.
   Corrected, the deployed EMPS path costs:

   ```
   iters             1        4       60
   MAC/cycle    14,354   42,914  576,074
   % budget        144%     429%    5761%
   delivered     10.62x   12.17x   12.70x
   ```

   **AND RUN TOGETHER, THE TWO KNOBS CLOSE IT: 14.16x AT 101% OF BUDGET, BETTER THAN THE
   5761% CONFIGURATION THAT SHIPS.** The knobs are not separable — at one iteration N=56 gives
   14.16x and N=68 gives 10.62x — which is what two regularisers on the same inversion look
   like, and it means the best cell of a grid is a suspect result. It was checked against a
   two-tone sine the model has never seen, and **the same cell is best there too** (8.66x
   against N=68's 7.36x), so it is a setting rather than a coincidence:

   ```
   iters  N     program        sine    peak MAC   % budget
       1 52    12.46x        8.12x       8,906        89%
       1 56    14.16x        8.66x      10,148       101%
       1 68    10.62x        7.36x      14,354       144%
       2 52    13.83x        8.68x      14,522       145%
      60 68    12.70x           —      576,074      5761%
   ```

   **FIFTY-SEVEN TIMES CHEAPER AND 12% BETTER.** On the 2R arm the same corner is 29x cheaper
   and 16% better (2 iterations at N=44: 6.90x against the shipped 5.95x). More horizon past
   the optimum makes the machine WORSE, which no argument from settling time predicts.

   **THE DEFAULTS ARE NOT CHANGED YET AND THE REASON IS RULE 31.** The two plants want
   different cells and the knobs move together, so cutting `qpIters` alone REGRESSES EMPS
   (10.35x at 2/68). The joint change is `N ≈ 1.2·Tset` with `qpIters` 1–2 against today's
   `1.5·Tset` and 60, and it moves every gate in the suite, so it needs the six-plant pass.
   What is pinned on the machine today is only what was measured: `emps.test.mjs` asserts the
   cheap corner is at least as good, still uses its authority, and fits the scan.

   **SO WHAT IS LEFT IS THE FIT, NOT THE DEPLOYED PATH.** The forecast is 18% of the deployed
   cost on EMPS (37 features) and the dominant term on the arm (~121 per channel), so step 3
   is an arm lever and barely an EMPS one — the same constant, re-derived, four times
   different. The FIT is the unbuilt half and nothing in this repository implements it.

7. **BREADTH, WHICH MEANS WINNING WHERE IT CURRENTLY LOSES.** Target: beat the published BLT
   on Wood–Berry — a linear plant with dead time, where a classical method beats this one
   today — and turn at least one of the two standing refusals (mill, barrel) into a measured
   improvement or a refusal that is provably the right answer rather than an inability. A
   method that wins only on compliance and friction is a good compliance-and-friction method.

8. **MEASURED AGAINST SOMETHING THAT IS NOT US.** Target: one properly implemented rival from
   the literature, on the arm, on the bench. Norm-optimal ILC is the cheapest honest choice.
   Every comparison this project has is against its own baseline or a published number for a
   specific rig; a rival implemented here, run on the same machine, is the first datum that
   speaks to where this sits in the field.

**The plan to get there is `docs/plan.md`**, sequenced so the experiment that CHOOSES the
route runs early rather than last.

### The direction that follows from it

The transferable layers are the ones that MODEL the machine — the conventional rung's fit in
the reference's own state, and the pilot cascade, where each layer models what the one below
it left. The non-transferable layer is the one that REMEMBERS a lap. Every measurement in
this file agrees on that split, including the ones that were surprises at the time: the
cascade transfers to a signal it has never seen (26.0x) where a phase-indexed table is worth
less than nothing (0.55x), and the learned path map adds essentially nothing on top of a
cascade (1.15x, 1.02x) because the cascade has already removed the predictable part.

So the work is to get what the memory is worth OUT OF A MODEL — to buy the lap-periodic
rung's factor with something addressed by the machine's STATE rather than by position in a
lap. A model that good is also the thing that makes commissioning short, because a model
generalises across the excitation while a table has to visit every phase of every program it
will ever run.

### THE MEMORY IS RETIRED. THE CONTROLLER IS PLANT, NOT PATH.

**This is a decision, not a measurement.** The owner has settled it: the lap-indexed rung goes,
and alternative algorithms replace what it was doing. Nothing addressed by POSITION IN A LAP
survives — not `lib/pilot/hff.js`, not a `PathILC` table, not any correction indexed by phase.
A component may only be addressed by the machine's own STATE.

**WHAT IT COSTS, STATED UP FRONT SO NOBODY DISCOVERS IT LATER.** On the arm the model layers
alone reach **5.3554e-2 from 4.1216e-1, which is 7.70x**, and the lap table on top of them
reaches 1.8387e-2, 22.42x. **So retiring the memory today costs 2.91x and the headline drops
from 22.42x to 7.70x.** That number is accepted, it is the honest starting point, and the work
is to win it back with plant models rather than to protect the old figure.

**AND THE ENVELOPE ALREADY AGREES WITH THE DECISION.** Across five programs and four feedrates
the model layers alone win 14 of 20 cells, geometric mean 4.53x against the full ladder's
3.11x, worst cell 1.45x against 1.17x. The memory is already a NET NEGATIVE anywhere but at
home. The 22.42x was never a controller; it was a controller plus a calibration for one
program, and the calibration is what has to go.

**WHY THE PREVIOUS FRAMING IS GONE.** This section used to carry a falsification clause: if a
model-based layer could not reach within 1.3x of the table on the table's own program, "the
honest answer is a fast re-commission per program". That escape is closed. The measurement
that would have triggered it has now been taken — 2.91x apart on the arm, against a 1.3x bar —
and the answer is to find a better model, not to accept a per-program calibration.

**WHAT MUST REPLACE IT.** In the order their evidence justifies:

1. **ONLINE ADAPTATION, which is the plant-based way to get memory-like accuracy.** A frozen
   model is stuck at its commissioning residual; a model that keeps updating converges on
   whatever the machine is doing NOW, and it is addressed by state, so it transfers. This is
   the closest thing to what the table does without being a table. `Pilot` already has an
   `adapt` path and a `leadStride`; it is off, and the one measurement on it moved the machine
   0.1% because it adapted lead 0 alone.
2. **A basis rich enough to carry the machine.** The pose-scheduled block is already built and
   selectable per channel — held-out R² 0.771 memory-alone against 0.840 scheduled — and the
   ladder does not report whether it was chosen, which is now fixed.
3. **A window that REACHES the mode** (rule 37) and multi-rate lags.
4. **`lib/ngrc/`, a golden-vector-tested nonlinear VAR built for exactly this shape**, which
   the pilot does not use.

**THE BAR THE REPLACEMENT MUST CLEAR** is no longer 1.3x of the table on one program. It is
**the ENVELOPE**: within 1.3x of a per-program commission on EVERY program and feedrate, with
none made worse than the conventional machine — targets 1 and 2, which is what the memory
could never do and is the whole reason it is going.

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
41b. **An excitation built to the DECLARED limits describes a machine the program does not
    run.** Measure the program's own peak v/a/j against them: the arm's circle uses 1% of the
    declared jerk and scores 7.72x, its sharp square uses 61537% and scores 1.69x. And raising
    the declared numbers changes nothing — the box TRAVERSE binds through velocity, so a and j
    ride along. Shrinking the box makes the excitation faster and every held-out program worse.
    [flexisim]
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
60. **A NODE GLOBAL IN SHIPPED LIBRARY CODE IS INVISIBLE TO THE HALF THAT COULD CATCH IT.**
    `pilot.js` read `process.env` for one Node measurement; `process` does not exist in a
    browser, and the line sat on the FIT path rather than the excite path, so ⑤ ran for tens
    of thousands of steps and died the instant it started solving — ⑨'s pilot rung with it.
    The Node half cannot see it (there the global exists) and the browser half reported only
    `Timeout 900000ms exceeded`, because the frame loop CATCHES and the throw became a badge
    nobody read. Parsing cannot catch it either: `process.env.X` parses perfectly and throws
    only when reached. `test/parse.mjs` now rejects bare `process`/`require`/`__dirname` in
    `lib/`, and every long page wait ends on EITHER outcome and asserts the badge. An env
    read is not a free thing to add to library code.

61. **A SHARED CONFIGURATION EXISTS TO STOP TWO COPIES DRIFTING, AND A CALLER THAT ASSIGNS
    OVER IT HAS PUT THE SECOND COPY BACK.** `lib/flexisim/autohost.js` is shared by the page
    and the bar precisely so that ⑨ on screen runs the configuration the 22.42× was measured
    on by construction rather than by review — and the bar then did
    `auto.pilotOpts = { … }`, wholesale, over the bag the host had just built. Value for
    value the copies agreed, so nothing was ever wrong and no check ever went red; the
    duplicate simply waited for one of them to change. It drew blood the first time one did:
    two new solver options were added to the host, the whole ladder ran TWICE, and it came
    back byte-identical — 22.42× either way, every rung to five figures — because the bag
    carrying them was discarded between construction and commissioning. Every hop tested
    clean in isolation and the wiring was genuinely there, which is the mode-⑧ failure in a
    new costume. **AND THE PAGE WAS THE ONE DOING IT RIGHT.** `flexisim.html` mutates exactly
    two fields of the host's bag, `start` and `workspace`; the BAR is the copy that had
    drifted. So the guarantee this whole arrangement exists to provide — the page runs what
    the bar measured, by construction — was in fact being carried by the two literals
    happening to hold the same numbers, which is construction in name only.
    **Mutate a shared bag, never replace it** — and ASSERT that what the machine
    commissioned with is what the caller asked for, because that check's absence is the whole
    reason a duplicate can sit there. What found it was not more reasoning: it was making the
    ladder PRINT the solver it commissioned with and watching that disagree with the host.

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
| `lib/flexisim/autohost.js` | **The arm's host for `AutoStack`, imported by BOTH the Node bar and the page** — one module, so ⑨ on screen runs the configuration the 22.42× was measured on by construction rather than by review. |
| `lib/blackbox/` | `blackbox.js` (identify → design → verify → correct) and `qp.js` (the box-constrained preview solve). Imports nothing from `lib/flexisim/`. |
| `lib/pilot/hff.js` | Harmonic feedforward: a lap-periodic correction identified ON the machine. Carries no per-plant constant — count, step, probe design and probe amplitude are all measured. |
| `lib/pilot/classic.js` | The CONVENTIONAL layer, self-tuned: a static feedforward in the reference's own state (`[a, v, sign v, 1]`), fitted on the machine. 425× on the EMPS axis in 14 laps, past the published inverse-dynamics feedforward. |
| `lib/pilot/autostack.js` | **ONE BUTTON.** Route the signals, state the maxes, press it. Commissions the ladder, scores every rung on the machine, and ships the best prefix. |
| `version.json` | Server-side build manifest for stale-page detection. |
| `modules.json` | Generated list of every script, so `reloadFresh()` can bust the ES-module cache. |
| `docs-manifest.json` | Generated list of every `.md`, for the Docs viewer. |
| `stamp-version.sh` | Pre-commit build step: stamps the version and regenerates both manifests. |
| `vendor/` | Self-hosted marked, three.js and Plotly. No CDNs. |
| `test/run.sh` | The suite. See "What `./test/run.sh` actually runs" above. **Every check runs through a failure COLLECTOR** — under `set -e` the first red test aborted the run and took the twenty after it with it, twice now (`composite.test.mjs`, then `tanks.test.mjs`); failures are collected by name and the run exits non-zero at the END with the list. It found **three** red tests that were invisible behind the tank's abort — Wood–Berry at IAE 82.10 against the 72.08 recorded here, and `stack.test.mjs`, whose EMPS cascade admits two layers instead of three (layer 2 refusing at verify 0.95x) and which was confirmed red at the commit before this session's work by running the control. `--browser` / `--node` select which HALF runs — a wiring change cannot break a golden vector, and charging it 450 Node checks is what makes a suite something to avoid. |
| `test/smoke.mjs` | Playwright checks and screenshots for every page. |
| `test/lattsim/` | Node tests for the engine: stencil, indexing, units, conservation, Poiseuille, EOS, scalar, elastic, reconstruction. |
| `test/flexisim/composite.test.mjs` | **The composite: cascade(2) + harmonic feedforward, 30.76× over a conventional machine ON ONE PROGRAM — across five it is 4.9× to 20.3× and on one the table makes the machine WORSE (brick 66).** Also pins the two failing orders and the clean-operator requirement. **It exited 1 on its first `deploy()` from the commit that added it until brick 67** — three `const`s below the function that read them — and `set -e` meant it took the whole pilot block down with it. It was never caught because it is 13 minutes long and its headline is reachable with `ONLY_TOP=1`. |
| `test/flexisim/harmonic.test.mjs` | World-frame harmonic feedforward, and the path-normal frame that measures 0.99× on the same solve. |
| `test/flexisim/` | Node tests for the hybrid plant: joint, arm, 2R, N-R, sensors, compliance, compensation, ServoFF, the learned filter, and contouring (`toolpath`, `pathilc`, `contour`). |
| `test/blackbox/` | Node tests for the plant-agnostic controller, on three plants that share no physics. |
| `test/pilot/hff.test.mjs` | `lib/pilot/hff.js` pointed at the EMPS axis, told only the lap length, the channel count and its authority — the agnosticism test. |
| `test/pilot/autostack.test.mjs` | The button, end to end on the EMPS axis: the conventional rung ships at 425×, the pilot and the harmonic rung are both refused, and both refusals are asserted to be the right ones for the right reasons. |
| `lib/pilot/ensemble.js` | **AVERAGE THE COMMISSIONING DRAWS — one vector out, whatever k goes in, and FREE AT DEPLOY.** A commissioning is a seeded draw and its model is a draw too; the spread is estimation variance rather than a discrete pick (all six arm draws chose stride 13 / ridge 1e-5 / N 58 and still spread nearly two to one). k weight vectors average to ONE vector of the same length, so deployed arithmetic and memory are what a single commissioning costs. **Measured on the tank: raw draws 1.000x (all eight REFUSED) → ridge x100 alone 1.176x → averaging alone 1.344x → **both together 1.594x**, composing to within 0.9% of the product, which is what independent mechanisms do. All eight draws REFUSED, best single draw 1.000x, and the average of five VOUCHED FOR ITSELF on the machine and delivered 1.344x** — better than every draw, not between them. It averages over the MAJORITY layout and REPORTS what it excluded; k=2 measures 0.687x, worse than nothing, and k=4 measures 1.493x. |
| `test/pilot/select.mjs` | **COMMISSION k TIMES AND KEEP THE BEST — MEASURED AT 1.545x ON A HELD-OUT PROGRAM.** Six draws on the arm, the gate scoring the rounded rectangle, the CIRCLE never part of the selection: the pick delivers **10.02x against the median draw's 6.48x, and ranks 1 of 6** on the program it never scored. **It is not circular, and the table says so**: draw 0 is the best on the rounded rectangle (6.18x against 6.12x) and the gate did NOT pick it — it took the draw that is second on the program it scored and first on the one it did not. Cost is k commissionings, so k is a dial between commissioning time and delivered performance, and it reframes target 4: cut commissioning 6x and six draws are free. **What would kill it:** six draws, one plant, one held-out program — if rank-1 does not replicate on the tank, where a bad draw actively harms, this is one lucky ordering. |
| `test/pilot/spread.mjs` | **EVERY PLANT'S NUMBER IS ONE COMMISSIONING DRAW, AND THIS IS THE DISTRIBUTION IT CAME FROM.** Runs each plant's OWN test with one module-level seed offset changed — no rig is copied, nothing is re-scored — and splits the draws by whether the pilot ACTED, because a refusal's score belongs to the plant and not to the controller. It found that the two winners are repeatable (EMPS 1.05x, arm 1.13x) and the two others are draws of 2.2x and 4.2x, and that on Wood–Berry all 9 deployments are worse than the 3 refusals. |
| `test/pilot/sixplant.mjs` | **THE SIX-PLANT PASS — the table that has to exist before any solver default moves, and whose absence is why two regressions shipped.** Runs every plant's OWN test in a child process with `setSolverDefaults` set, and scrapes that plant's OWN headline, so no plant is re-scored by a metric this file invented; refusals stay in the table because a refusal is a result. It chose today's defaults (2 iterations at 1.2·Tset) by rule 42's band, took the deployed EMPS path from 429% of a PLC scan to **95%**, and found a NaN no check could see. |
| `test/pilot/tankspread.mjs` | **A PLANT'S SCORE IS A DISTRIBUTION.** Commissions the tank from N seeds and reports the spread, the deployed median, and the GATE'S OWN ESTIMATE beside what it delivered. It asserts nothing — an instrument that decided its verdict before the verdict was understood is how the 1.32x got written down. What it measured: at the old defaults 4 of 8 seeds deploy and **all four hurt**; at the new ones 5 of 8 deploy at a median 1.249x, two still hurt, and the gate's estimate correlates **-0.057** with delivered benefit. |
| `test/pilot/qpsweep.mjs`, `qpsweep-arm.mjs` | **Not tests — the solver-budget experiment.** Commission ONE pilot, re-deploy that same model over a grid of QP iteration counts and horizon lengths, and score the MACHINE. Found that the shipped 60 iterations at `1.5·Tset` is 57× more arithmetic than the machine wants and WORSE than 1 iteration at N=56 (EMPS 14.16× against 12.70×, at 101% of a PLC scan's 10% against 5761%), and that the arm agrees at 29× cheaper and 16% better. Scores a held-out program in the same table, because the surface is rugged enough that the best cell of a grid is a suspect result. |
| `test/pilot/rti.test.mjs` | A FALSIFIED HYPOTHESIS, pinned as the four things measuring it found. One QP iteration per cycle does not track sixty (88% of the applied signal); sixty is itself 36% from this solver's own optimum, so every delivered number in the project came out of a truncated solve; the convergence curve at N=8 matches N=48, so the rate is the Hessian's conditioning and not the horizon; and the Lipschitz bound is 1.82× above the true spectral norm, which costs exactly 2× in iterations. |
| `test/pilot/rigs/arm-rig.mjs` | The 2R arm rig — plant, paths, routing, `commissionArm` and `deployOn`. Every harness drives the arm through this; three separate copies of pieces of it have each shipped a defect. |
| `test/pilot/forecast.mjs` | Held-out forecast R² on open-loop programs, plus an offline refit that separates an unreachable dictionary from an unvisited one. |
| `test/pilot/spectrum.mjs` | Where the machine rings, where the defect's energy is, and where the excitation looked — three power spectra on one axis of periods. |
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
  error (normal — the part is the wrong shape) and LAG (along — the tool is late), and
  **BOTH ARE DEFECTS AND THE SCORE IS THEIR TOTAL.** This tab used to say only the contour
  component counted, on the argument that a lagging tool is on the right curve and merely
  late — true of a UNIFORM lag on one closed contour and nowhere else, since a lag that
  VARIES is a shape error as soon as two axes are coordinated, and any machine that must meet
  another axis, a tool change or a clock is defective when it is late. The cost of the old
  stance was structural: every rung, depth and prefix of the ladder was chosen against
  `contourRms` while `lagRms` sat in the report unread — and the pilot's own truth here was
  ALREADY the whole tool error, so the machine was CORRECTED for both and SCORED on one
  (rule 6). On this arm lag is a real share: the conventional machine measures 4.6748e-1 total
  against 4.1216e-1 contour, and the pilot's depth-1 gain falls from 3.33× to 2.85× once it is
  counted. All three are reported — `contourRms`, `lagRms`, `totalRms` — because the two
  failures have different causes and different fixes, but a rung can no longer buy one with
  the other unseen; energy is reported as BOTH copper loss
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
  regimes BUILD and reports what it skipped; the Wood–Berry column LOST — and the frame was wrong:
  the **steady-state inversion alone reads 43.90 against the published BLT's 51.95**, so doing nothing
  already beats the classical baseline, and the pilot at 82.10 is making a machine that beats BLT
  nearly twice as bad. Across 12 seeds every one of the 9 deployments is worse than the 3 refusals; a cold mill AGC refused (0.42×); and the **EMPS servo axis**
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
  **THE SHARP SQUARE IS A FORECAST FAILURE, AND TWELVE CONTROLLER KNOBS ARE NULL ON IT FOR
  THAT REASON.** Committing 2, 4 or 8 moves of the QP's plan instead of one (`commitM`, shipped
  at 1 and byte-identical there) measures 1.71 / 1.72 / 1.70 against 1.69; a forced frequency
  sweep in three bands including the square's own measures 1.70 / 1.70 / 1.69; the correction
  cap reads `AT THE CAP` in every row and raising it 0.15 → 0.30 lets the peak reach 0.2363 and
  moves the score to 1.68. `test/pilot/forecast.mjs` says why, by evaluating the commissioned
  bank on rows from an OPEN-LOOP run (so `eFree` is the truth exactly): held-out R² is rounded
  0.979/0.898, circle 0.966/0.902, **sharp 0.701/−0.105 — the elbow is worse than predicting the
  mean and its residual rms exceeds the truth's.** The machine is scored exactly as well as it is
  predicted. **THE DICTIONARY IS NOT THE LIMIT:** refitting the same features, ridge and window on
  the square itself and scoring at another FEEDRATE (rule 36) gives lead-0 0.962/0.946 — so more
  state is not what is missing — while the far leads collapse to −1.5 on every shape, which is why
  training on a program is not the fix either (rule 9, both halves). **IT IS COVERAGE, AND THE
  RATE MISMATCH IS THREE ORDERS OF MAGNITUDE:** `peakDiffs` on the joint commands gives the
  circle 63% / 16% / **1%** of the declared v/a/j and the square 63% / **3132%** / **61537%**.
  Raising the declared limits is INERT — two commissionings at 50× the acceleration and 1000×
  the jerk came back byte-identical, because `buildExcitation` tunes to tc 662 with velocity
  binding through the 85% box traverse (rule 41b). Shrinking the box to ±0.15 lifts the
  COMMISSIONING R² 0.833 → 0.970 and drops every held-out program (circle 0.902 → 0.836, sharp
  −0.105 → −0.169); the gate refused it and the gate was right — the third independent time here
  that a calibration had to span the range it is used over. And the corner is a **40-step event
  read by regressors 117 steps apart** (stride 13 × sample 9); forcing `sample` to 3 does not
  change it, because the tune raises stride to 39 to hold the same reach — spacing comes from Ts,
  a settling number, and the corner is a geometry one. `test/pilot/spectrum.mjs` says the same
  thing in the frequency domain: **the excitation covers 25% of the square's error energy and 91%
  of the circle's**, and this arm does not ring at all (98% of its free step response is the step,
  so `rings [0,0]` is correct and resonance is not the mechanism). WHAT IS LEFT IS THE ONE THING
  NOBODY HAS BUILT: an excitation that SPANS the box and also carries the program's own
  acceleration and jerk — a broadband fast component sized from `peakDiffs` of the representative
  program rather than a tonal sweep at a quarter budget aimed at a band derived from Tset. TWO
  INSTRUMENT FAULTS AND ONE FALSE READOUT CAME OUT OF IT: `toolXY()` returns an ARRAY and reading
  it as `{x, y}` gave NaN, which renders as "no dynamics"; before that the recorded signal was the
  tool's distance from the BASE, which a shoulder step barely changes; and **`sweep YES` has been
  false in every log this project has produced** — `meta.chirp` is `[0, 0]` when no sweep was
  armed and an array of zeros is truthy (rule 25).
  **AND THE ARC ENDED SOMEWHERE NONE OF THE NULLS POINTED: TWO MAPS AND A COMMAND-DRIVEN
  ROUTER.** The machine is never saturated (sharp square peaks at 86% of tauMax, 0% clipped —
  the program is inside the drive, so no authority wall). Corner EVENTS in the excitation
  (`cornerEvents` in excite.js, option `events`, default off — sparse out-and-back velocity
  trapezoids, the only shape carrying program-scale a/j inside the velocity limit) were built
  and measured: the square gains nothing and the smooth programs COLLAPSE (rounded ch1 0.898 →
  −0.853, circle 0.902 → −5.1), because a second regime fights over one set of weights. One
  linear map fitted on both regimes holds ~0.9 at lead 0 but costs the circle 11x in residual
  variance, and the quadratic/scheduled dictionaries make the joint record WORSE (0.857 →
  −1.7) — so "more state" is measured and dead: the state was always in the row, the licence
  to use different weights per regime is what was missing. **Two maps split by one bit — a
  command-acceleration spike (>10x the record's own median) within the window reach — read
  sharp elbow 0.930 against the deployed model's −0.105, and 0.950 on the DIAMOND, a geometry
  never fitted** — the corner map is a move-profile model addressed by command state, not a
  memory (the retirement's distinction, measured). Honestly wrong with it: the rounded
  rectangle is mis-filed by the binary router (−1.6; its corners are 300% of declared jerk
  against the square's 61,000% and there is two orders of magnitude of threshold room), the
  circle's elbow pays 0.879 → 0.688, and corner-regime mid leads are still poor. **AND THE COMPOSITION NOW RUNS ON THE MACHINE — 1.69x → 2.15x ON THE SHARP SQUARE WITH NO
  PROGRAM SUPPLIED ANYWHERE** (`router`/`wB` in the pilot, null by default and byte-identical
  everywhere else; smooth programs return byte-identical, the control that makes it readable).
  The blend is SHAPED (smoothstep 0.15–0.6) because unshaped the circle paid 15–45% for a
  regime it is never in; the corner bank is fitted on a DRIVE-SIZED STOP-AND-GO TOUR
  (`recordCornerProbe`): severity read off the machine's own saturation counters, poses walked
  because compliance is pose-dependent, legs chained through turns because a corner crosses
  backlash in motion. The self-fitted ceiling is 3.27x. Six instrument-grade findings on the
  way (a flying reversal is not a corner; the ff convention is half the demand; clip fraction
  is non-monotone in severity; one pose teaches one pose; rows saturate; event shape moves the
  regime scale). The full record is `docs/plan.md` §§9–17, whose
  arc since: THREE severity layers with hat interpolation (the blend axis un-saturated so the
  slow and fast squares separate; regime scale anchored to 6x the declared aMax per sample²
  after record-peak scaling confounded three comparisons); a COVERAGE GUARD fading λ where the
  commanded speed exceeds the probe's own ceiling (the drive refuses clean events past the
  declared vMax while the fast square cruises at 126% of it — the declared velocity is the
  same fiction the acceleration was); and RANDOM POLYGONS through the corner rule — corner
  shapes with no part knowledge — the first agnostic bank above baseline in both cells (sharp
  square 2.02x/2.63x against 1.69x/2.27x; the joint-space tour reads 2.28x/2.16x; fitted on
  the square itself, 3.27x). The wall was read as moving coverage → severity → GEOMETRY —
  every increase in corner-geometry diversity made the square worse — **AND THE GEOMETRY WALL
  WAS THE LABEL SCALE (plan §36).** The severity anchor's fix for the record-peak confound
  SATURATED the λ labels on program-scale corners (31x declared against shapeLambda's 2x
  clamp), the knot strata collapsed into one pool, and the fit's own fallback silently
  rejected the corner weights at every lead — `116 kept scribble` against the record scale's
  0 — while the stale 3.27x ceiling was carried forward through five tables from a commit
  whose scaling no longer existed (both ends reproduced by checking out the commits: 1.99x at
  the anchor commit byte-identical to head, 3.27x at the one before). Under `fitScale:
  'record'` (0.5x the records' own peak, stored in the router so labels and addressing stay
  one quantity) diversity PAYS — stars lift 2.39x → 2.93x where the anchor read them as harm
  — smooth programs stay byte-identical, and the price of agnosticism against the self-fit
  ceiling is **1.21x/1.10x at the two feeds, inside target 1's 1.3x**; what remains of the
  degradation metric is the square's own hardness (its ceiling is 1.75x below the rounded
  rectangle's for ANY bank, including one fitted on the square itself). The scheduling variable is COMMANDED, the
  row keeps the ACTUALS — measured split, and routing on actuals would put the blend inside
  the loop (rule 35). AND IT FITS THE PLC DISCIPLINE, COUNTED (plan §18): every fit is
  commissioning-time; the deployed λ scan is a bounded sparse-event list ingesting only the
  offsets that newly enter the horizon — `routerCost()` reports worst 20,852 MAC/decision both
  channels and 320 on smooth programs against the pilot's 42,914 default tick — and the sparse
  rewrite's eviction bug (sound only for query times after the new event, while the horizon
  queries between events) was caught by the side-by-side control and fixed to byte-identical.
  THE AXIS TRIAGE THEN CLOSED THE LOOKUP QUESTION (plan §19): split the SELF-fit ceiling by
  each candidate against a random-split capacity control — at lead 0 NO axis carries
  information; at mid leads turn-share (which joint the corner bends) takes the elbow from
  −0.246 to +0.552. A 2D (severity × folded turn angle) knot grid was built (`wGrid` — 2^d
  banks per lead whatever the grid holds, the PLC property) and measured NULL on the machine
  twice, cell diagnostics ruling out starvation: the third independent measurement that
  MID-LEAD forecast quality does not move this machine (leadTrust, the forecast-gate arming,
  now the θ-grid). Lead 0 binds, no axis lifts it, and the self bank's edge over the agnostic
  2.28x is lead-0 DISTRIBUTION MATCH (rule 34 from the scheduling side). Commanded torque is
  unavailable by contract; actuals stay in the row.
  **AND THE DISTRIBUTION-MATCH ROUTE OPENED: GATED ONLINE ADAPTATION, MEASURED TO A LAW ON
  FOUR PLANTS (plan §§20–26).** The pilot's own RLS at deploy — truth is an INSTALLATION
  property (permanent / guided-then-removed / absent), a setup switch the report states
  (`onlineAtDeploy`), never an assumption. The innovation gate's reference was frozen on the
  first row (rule 38 verbatim, 2,583 of 2,583 rows passed on a repeating program) and is now a
  running maximum, pinned by contract. THE LAW: gated adaptation MULTIPLIES a model the static
  verify already vouched for — arm +29%, tank +18%, **EMPS 14.8x → 55.5x with the truth
  REMOVED at lap 4 and the bank frozen** — and does nothing for a broken one (the refused mill:
  null, its refusal confirmed); the deploy gate's ratio is the free selector. THE MEMORY TEST,
  PASSED WHERE THE ILC FAILED IT: the adapted-frozen EMPS bank scores the never-run two-tone
  sine 6x BETTER than static, on the axis where phase-indexed ILC's 125x reads 0.55x there.
  THE MECHANISM IS THE FORGETTING (λ=1 loses the gain — the commissioning posterior anchors
  the recursion), the gate is its safety, and directional forgetting FAILED its sixth audition
  (≈ λ=1, the wrong tool, default off with a reason). Take-away vs always-on has its own
  selector: repeating production wants freezing, an evolving recipe wants the truth kept, and
  the gate's late-run admit rate distinguishes them. Pinned: `test/pilot/onlinegate.test.mjs`
  (full tier); the full composition frozen read **2.39x on the sharp square** against static
  1.71x with diamond-guided adaptation on anchor-scale banks — and plan §36 then measured
  that guidance helps only broken banks (+11% on near-scribble anchor banks, −11% on the
  square and 3.2x harm on the circle once the banks are real), so the composition SIMPLIFIED:
  record-scale polygon+star banks, frozen, no guided phase, reading **2.87x/7.72x/6.18x**
  (sharp/circle/rounded) with commissioning truth only. The engineered rival on the same
  machine (plan §34: rigid model + datasheet Kalman + held-pose calibration, truth-free)
  reads 1.01x/1.13x/1.02x.
  THE LAW COMPLETED TO SIX PLANTS AND SHARPENED (plan §31): **the deploy gate's own 1.1x
  threshold is ALSO the adaptation selector** — Wood-Berry (0.01x) and the mill (1.07x) below
  it stay null-or-harmful force-deployed; the barrel at exactly 1.10x FLIPS from 0.67x harmful
  to 1.17x helpful; tank, EMPS and arm above it all multiply. `report.binding` states which
  constraint binds (time-at-cap during the verify: authority → raise uMax with adaptation
  armed; model → banks/adaptation) — the diagnosis this arc ran as experiments, now one line.
  ON THE KINEMATICS-FREE CHAIN (plan §§29–30) the composition reads 2.53x live / **2.46x
  frozen** on the never-measured sharp square with nothing knowing the arm, the learned
  reference's static square BEATS the analytic chain's (1.89x vs 1.69x, droop in the
  reference), and the SOFT corner is AUTHORITY-bound where the stiff was model-bound — at cap
  0.5 the sharp square reads 4.75x and static control MISUSES the extra authority on the
  circle (5.91x → 4.57x) while gated adaptation reclaims it (6.32x): raise the cap only with
  adaptation armed. `ikfree.test.mjs` runs on the shared `ikfree-rig`; the STACK contract is
  re-grounded on the truth-free installation it owns (depth never harms, a refused layer costs
  nothing, the deployed layer transfers as a model) and the suite's last red file is GREEN.
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
  **THE COMPOSITE — A CASCADE OF PILOTS WITH HARMONIC FEEDFORWARD ON TOP, 30.76× (brick 63),
  and the owner's physics is what found it.** The arm is not ringing at corners, it is
  SPRING-LOADED: the deflection depends on geometry, inertia, gravity and direction of travel,
  and it is lap-correlated only because a closed program revisits the same poses in the same
  order. One plant, one program, one conventional baseline (4.122e-1): pilot alone 6.23×, HFF
  alone 8.86×, pilot + HFF **16.93×**, **cascade(2) + HFF 1.340e-2 = 30.76×** — drive peak 30%
  of `tauMax` with ZERO saturations, correction peak 0.382 rad, machine still repeating, all
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
    **AND THAT IS ONE PROGRAM, NOT THE STACK'S NUMBER (brick 66).** Re-measured across five
  programs with the cascade commissioned once from noise and a table converged per program:
  rounded 8×8 **20.34×**, rounded 10×6 **20.01×**, circle r3 4.90×, circle r5 **9.00× — WORSE
  than the cascade's own 10.94×** — and sharp 9×7 4.97×. The cascade alone is program-dependent
  too (2.48× to 10.94×). So the honest headline for the composite is a RANGE, 4.9–20.3×, and
  the single 30.76× is its best case on the program it was tuned on. (That run used 6
  refinement passes without backtracking where the 30× used 12 with, which widens the spread
  but does not explain a program going backwards.)
  **AND THE PATH MAP DOES NOT ADD TO THE CASCADE.** On programs it has never seen it is worth
  **1.15× and 1.02×** over the cascade — the second inside its own constant control (1.01×) —
  and the machine-scored selection could not find a candidate that beat the cascade on its own
  held-back program (best 0.993×). It is worth 1.32×/2.00× over a CONVENTIONAL machine and
  essentially nothing over a cascade, because the cascade has already removed the predictable
  part and leaves a machine ~20% less lap-repeatable to learn from.
**AND THE HARMONIC FEEDFORWARD NOW HAS A SECOND PLANT UNDER IT, WHICH IS THE ONLY THING THAT
  MAKES IT A METHOD (brick 67).** `lib/pilot/hff.js` — the same module, told nothing but the lap
  length, the channel count and its authority — commissions itself on the **EMPS servo axis**, a
  real machine with real data and no physics in common with this arm: **0.5764 → 0.0024 mm rms,
  242x**, against that page's pilot at 12.7x and its HAND-TUNED ILC at 119x, landing ON the
  inverse-dynamics feedforward at the published parameters (275x, 0.0021 mm) — **which overturns
  `emps.test.mjs`'s own headline that the model-based method beats everything learned.** The rig
  reproduces the hardware to 1.6 µm and the top two are 0.2 µm apart, so what is claimed is
  "matches", not "beats". THE COST IS STATED: 36 laps on the axis and 57 on the arm against the
  hand-tuned 14 — **and the cost is LAPS, not performance.** Stopped at 20 passes on the ARM it
  reaches 7.93x against the tuned 8.86x and that was first written up as giving up 1.12x; it was
  still descending. Run to 82 laps it reaches **9.17x, PAST the tuned result**, and is descending
  still. A machine that chooses its own step takes smaller ones, so the same endpoint costs more
  laps, and those laps buy 32x on a plant nobody tuned it for.
  `test/flexisim/harmonic.test.mjs` keeps its tuned constants anyway: 14 laps and 2m26s of suite
  time against 82 and 13 minutes. Four
  defects came out of it, all of which had passed every check they had: an in-phase probe whose
  peak grows as NH drove the axis nonlinear and the resulting collapse was read as the PLANT's
  limit; a 3-probe design was silently UNDERDETERMINED on a 2-channel plant and the solve's
  absolute pivot floor returned a fitted operator instead of refusing (1.00x, fixed to `2c+1`
  probes and a RELATIVE floor, worth 1.00x → 4.81x); a fixed per-channel phase offset is one
  rotation applied to every probe and does not separate channels at all; and comparing two probe
  designs at matched per-harmonic AMPLITUDE rather than matched PEAK compared a probe against a
  saturation.
  **⑨ THE BUTTON — the whole ladder, on the page, running the host the bar measures.**
  `lib/pilot/autostack.js` picks its own rungs: conventional → pilot cascade → lap-periodic,
  each SCORED on the machine with everything below it deployed, and the best PREFIX ships. On
  this arm at K 1 / E 0.06 it measures **4.1216e-1 → 1.8387e-2, 22.42×** in 1934 s of Node.
  **THE PAGE AND THE BAR IMPORT THE SAME HOST** (`lib/flexisim/autohost.js`): everything the
  ladder measures depends on which signals the host observes, which frame each rung corrects
  in, and how the look-ahead is indexed, so a page that built its own would put a number on
  the screen that nobody had measured — with every check still passing, which is this
  project's mode-⑧ failure exactly. The only difference is scheduling: `yieldEvery` hands a
  frame back, and `test/pilot/yield.test.mjs` pins that a yielding host reaches an identical
  result rung row for rung row. **THE BROWSER CHECKS ARE WIRING, DELIBERATELY NOT
  PERFORMANCE** — the 22.42× belongs in Node where the plant is STATED rather than read off a
  slider, and ⑧ already failed a browser performance assertion once for the tab's stiff
  defaults, which had nothing to do with the thing under test. What the browser can break is
  what the browser is asked: press the button, watch the machine turn, stop it. **AND A
  MEASUREMENT THAT TAKES HALF AN HOUR NEEDS A WAY OUT** — the button disabled ITSELF while
  commissioning, which is the state in which the operator most needs it. Stop is a THROW out
  of the yield point rather than a flag, so `commission()` unwinds through `run`'s and
  `drivePilot`'s `finally`, the lattices are destroyed and no partial rung reaches the table;
  the settles inside `makeMachine` yield too, because twenty thousand lattice steps run
  before the host is handed the machine and they froze the tab through the one stretch that
  most looks like a hang.
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
| `lib/pilot/hff.js` | **HARMONIC FEEDFORWARD, and the module that made the method plant-agnostic (brick 67).** A repeating program has a repeating error, so invert the machine at the lap's own harmonics: probe, solve, and take a damped Newton step against a FROZEN operator. It carries NO per-plant constant. The harmonic COUNT is gone (the arm's 16 is where THAT channel dies; the servo axis is flat to h≈128 and the same 16 costs 33x there); the STEP backtracks (1.0 converges the axis on pass one and diverges the arm); and the PROBE DESIGN AND AMPLITUDE are chosen by commissioning four candidates and SCORING THEM ON THE MACHINE, because the fit ranks them backwards — on the axis the best-fitting candidate is the worst controller, and on the arm a 25%→10% probe is worth 3.1x while its residual moves the wrong way. Each harmonic's step is shrunk by CONFIDENCE (its own fit residual) and REACH (min(1,\|G\|), load-bearing: removed, the arm goes 4.81x → 1.05x; on the axis inert to four figures). |
| `lib/pilot/stack.js` | **A CASCADE OF PILOTS, wired to the page as ⑤/⑥'s Cascade depth slider (brick 59).** Layer k is an ordinary Pilot commissioned with layers 1..k−1 deployed and FROZEN, so each models what the one below it left; a layer that cannot vouch for itself ends the stack, and the summed correction is clamped ONCE at the engineer's cap. Every layer above the first is PINNED to the first's cadence — one host, one look-ahead closure, one meaning for `act(off)` — and chooses its own Ts, horizon, lags, ridge and basis on top of it. |
| `lib/pilot/autostack.js` | **On the softest 2R arm it now ships 22.42×, past the composite's re-measured 20.34× for that program (brick 76).** Getting there was four measurement repairs and two model changes: the rung reads the WHOLE tool error in JOINT space (narrowing it to the contour component cost half the benefit — the projection onto a rotating normal is itself a lap-varying operator); the floor is the MEDIAN of reported spreads, not the max, which was biased 3.9× high and refused improvements the machine could produce; the ceiling is measured on the CASCADE-DEPLOYED machine (3.44e-3 at nh 16) rather than the bare one; and every field the report prints from is asserted to exist, after six diagnostics in one day rendered a missing field as a plausible number. It also detects a PHASE WALK — a pilot cadence that does not divide the lap makes its phase walk, which is a beat at a half-integer harmonic the rung cannot represent; on the arm, cadence 9 against lap 7357 gave autocorrelation −0.764, and indexing from the lap start took it to −0.135 and the ladder from 20.70× to 22.42×. That last is measured on ONE plant: no other of the six deploys both rungs, so it is not yet a general claim. |
| `lib/pilot/autostack.js` | **ONE BUTTON, and the answer it comes to is not the one this project would have predicted (brick 68).** Told the channels' maxes, the correction authority, what the instrument can RESOLVE, and optionally that the program repeats. Works out for itself: its timescale, whether each rung pays, how deep to cascade, and which prefix of the ladder to ship — every one by measuring on the machine. Order is conventional → pilot → harmonic and is not symmetric (the reverse measured 0.71×). On the EMPS axis it ships the CONVENTIONAL rung alone at 425× and refuses the other two: the pilot at 0.39× because the rung below already removed the velocity lag that is its whole benefit there, and the harmonic rung — which scored 25× better — because BOTH sides are below the rig's 1.6 µm fidelity and it declines to credit what its instrument cannot see. A first version without that floor reported **4254×**, which was the simulator. |
| `lib/pilot/classic.js` | **THE CONVENTIONAL LAYER, SELF-TUNED — and the best single rung on a real machine.** `[a, v, sign v, 1]` fitted ON the machine with the same probe → frozen-operator Newton → backtracking → monotone-guard machinery `hff.js` uses; only the BASIS differs, which is why they compose. EMPS: 0.5764 → 0.0014 mm, **425× in 14 laps**, past the inverse-dynamics feedforward at the PUBLISHED M/Fv/Fc/OF (275×). **And the coefficient is checkable:** the dominant one is 0.797 mm against the position loop's own vPeak/kp = 0.778 mm — it found the loop's lag term from data to 2.4%. **It is a MODEL, not a memory:** on a two-tone sine the axis has never run it is worth 169.8× evaluated live, while the IDENTICAL signal replayed as a lap table is 0.53× — worse than nothing, independently reproducing brick 56's 0.55× for a phase-indexed ILC table by another route. |
| `lib/pilot/hff.js` | **The lap-periodic rung, and on the arm it now ships a BANDED operator (bricks 72-76).** A correction at harmonic h moves the error at h±1, so the harmonics are identified and inverted TOGETHER rather than one at a time. Measured on probes it had never seen, a banded operator predicts this machine 40% better than a diagonal one (15.6% → 9.4%), and the advantage TRANSFERS to a program it was not fitted on (0.61 there against 0.60 at home) — so the operator is a plant model even though the table it builds is a memory. `exportOperator()` hands it on: a second program of the same lap pays for refinement only, 32 laps → 10. Neither shipped probe design could identify it — both hold the phase RELATIONSHIP between harmonics fixed, so the banded design matrix is collinear at ANY probe count, which is why brick 63's block-tridiagonal solve measured neutral twice over. Banded gets its own random-phase design and 3·mm+4 probes. Default OFF in the library and ON in the arm harness: it triples identification cost and only this arm's operator has been measured as banded. |
| `lib/pilot/pilot.js` — `verifyRef` | **A REPRESENTATIVE PROGRAM FOR THE DEPLOY DECISION ONLY, and the repair for a gate that was scoring trajectories nobody runs.** The fit stays program-agnostic — it is still identified from a scribble — while the verify may also score one program the engineer supplies, clamped into their own box. Measured on the QUADRUPLE TANK it makes the gate RANK — the representative regime reads 0.50, 0.54, 0.88, 1.27, 1.58 against delivered 0.424x, 0.820x, 1.248x, 1.512x, 1.775x, monotone in all five, **correlation 0.989 against the old gate's -0.057** — so 3 of 8 seeds deploy and **all three help**, with the minimum across every seed at 1.000x because a refusal applies nothing. On Wood–Berry it turns 9 harmful deployments out of 12 into 12 refusals, which is what that plant's own numbers say is correct; measured on EMPS it is **byte-identical** (0.0412 mm, 14.0x), which is the control that says the gate was repaired rather than merely tightened. **Now on all six.** Arm byte-identical with the regime asserted to have RUN (`scribble + program + representative`, 6.18x unchanged — rule 61, since identical numbers are a control only if the regime built); mill's HOLD reads 0.61x beside scribble 0.63x and program 0.57x, so its refusal is independently confirmed and the tracking-vs-regulation hypothesis is dead; and the BARREL is scored for the first time ever — representative **0.22x** refusing what the program regime's 1.10x would have deployed. Two harmful deployments prevented, one refusal confirmed, one plant scored at last, and nothing lost. The cost is real: the reference is a new thing the engineer must supply, against "wire it up and press one button". It was the tank that decided whether it RANKS or only refuses harder, because there — unlike Wood–Berry — refusing everything would be wrong. |
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
