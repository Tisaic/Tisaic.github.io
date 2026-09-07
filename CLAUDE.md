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

One of the five is supported by the evidence and one is contradicted by it. Of the other
three, one is contradicted on two plants and supported on three, one is halfway (three clear
wins of six), and one is reachable and costed but not what ships. None is clean, and saying so
is worth more than the claim is.

| Part of the claim | Status | The evidence |
|---|---|---|
| Completely self-tuning | **SUPPORTED** | No per-plant constants; every threshold re-derived from measurement; and it REFUSES with a stated reason, asserted to be right for the right reason. Rare, and the strongest thing here. |
| Robust and tolerant | **CONTRADICTED ON TWO PLANTS: EVERY DEPLOYMENT HARMS THE MACHINE — AND SUPPORTED ON THREE** | Every plant's number is one commissioning DRAW and only now measured across seeds (`test/pilot/spread.mjs`). The three plants that win are repeatable — EMPS 1.05x spread over 8 seeds, the arm 1.13x over 6, and the COLD MILL 1.07x over 8 with **every one of the eight deploying and every one helping**, which no other plant here manages — and the two that do not are draws of 2.2x and 4.2x, so the failures differ in KIND and not only in size. Split by whether the pilot acted: on **Wood–Berry 9 of 12 seeds deploy and ALL NINE are worse than the 3 that refuse** (median 64.65 against 43.90); on the **tank at the old defaults 4 of 8 deploy and ALL FOUR hurt** (median 0.675x). Two plants sharing no physics, same shape: the refusals are the good outcomes. |
| Reusable across plants | **3 CLEAR WINS OF 6, AND THE THIRD WIDENS THE CLAIM RATHER THAN REPEATING IT** | Arm, EMPS and now the COLD MILL win and are repeatable across seeds (1.13x, 1.05x, 1.07x). The mill is the strongest of the three by repeatability — **8 of 8 seeds deploy, 8 of 8 help**, 10.17-10.88 µm rms against an open loop of 15.15, worst draw 1.39x and best 1.49x, and the worst draw still beats both classical AGCs — and it is the only win that is not mechanical compliance: a linear plant whose dominant error is an exogenous periodic disturbance arriving through a 100-step transport delay. It had refused since it was built, at 0.42x then 0.61x then neutral. Two measurement repairs, no controller change: the delay is DECLARED (the probe cannot recover it — a dead time and a slow rise move the 90% crossing identically) and the forecast gate now reads the first lead the correction can actually move, instead of lead 0 where `hGrid` is zero by construction and R² was 0.044 against 0.868 at the first live lead. The other four were quoted from single draws and are not: Wood–Berry deploys on 9 of 12 seeds and **all nine are worse than the 3 that refuse**, while the plant WITHOUT the pilot (43.90) already beats the published BLT (51.95); the tank's 1.32x is one draw from a distribution that deployed 4 harmful controllers in 8. **A representative program at the verify fixes both** — Wood–Berry refuses all 12, the tank deploys 3 of 8 and all three help (median 1.512x, nothing made worse, gate correlation 0.989 against -0.057) — and leaves EMPS byte-identical. All six now run that way; the barrel's representative regime reads 0.22x and refuses what its program regime's 1.10x would have deployed. |
| PLC memory and CPU | **MET ON THE ARM — 6,178 MAC/CYCLE, 62% OF BUDGET, AND IT DELIVERS BETTER THAN THE PATH THAT MISSES BY 7.4x** | Memory was never the problem and is now smaller again: the forecast bank is ONE model for every lead, not one per lead — 727 kB of covariance to 10.7 kB, deployed bytes 25.4 kB to 6.0 kB, fit memory 30.4 kB to 11.0 kB — and it is BETTER on both plants that deploy (EMPS 12.70x → 14.69x, arm model-only 7.8154e-2 → 7.4340e-2) — **and the QUADRUPLE TANK now REFUSES at 0.08x where it deployed at 1.32x — but the result it lost was never reproducible.** `tanks.test.mjs` fails 6 checks at HEAD, passed at `c24bede`, and the deploy is lost at `20de1b7` (nine leads built instead of every lead), confirmed by reversal: raise `LEAD_SAMPLES` and it deploys again. Then the fix refused to behave like one — 9 refuses, 16 refuses, **24 DEPLOYS at 1.28x**, 32 refuses — and at the last PASSING commit, changing only the commissioning seed, the tank passes at two offsets and fails five checks at a third. So the shared fit did not break a solid measurement; it moved a marginal one across a threshold it was already sitting on, and the 1.32x in the six-plant line is a coin rather than a controller result. The fix is to make the tank's own score reproducible across seeds BEFORE deriving any constant against it — tuning a lead count until it goes green is fitting to a coin flip (rules 3, 31). Three other explanations were killed by measurement: `qpIters`, forecast gating (R² 0.93-0.99 at every lead, nothing gated — rule 16), and my own working changes. The fit is `lib/pilot/rls.js`: shared-covariance RLS, seeded from the commissioning posterior, gated at 4.6e-10% against the batch solver it replaces. **The deployed arithmetic is now met too, and by the six-plant pass rather than by a projection.** What shipped was 42,914 MAC/cycle on EMPS, 429% of 10% of a 1 ms scan. `test/pilot/sixplant.mjs` swept `qpIters` and `horizonTs` across all six plants at once — the first such pass this project has run — and rule 42's band picked 2 iterations at 1.2·Tset: **9,517 MAC/cycle, 95% of budget**, with EMPS 4.8% down and the arm 3.1% (both inside the band) while Wood-Berry improves 4.7% and the mill's verify climbs 23%. The earlier projected corner reached 101% and gave up 13% of the delivery; this reaches 95% and gives up 4.8%, because that projection held the fit mode fixed and the knobs are not separable. **It was made the default and then REVERTED**: the arm's ladder ships BETTER there (23.15x against 22.42x) while `autostack.test.mjs`'s contract — on the MODEL-ONLY stack, which is what survives the memory's retirement — goes 8.5e-2 to 9.14e-2 and red, and EMPS' cascade drops to two layers. The pass measured six plants' HEADLINES while the contracts sat one level down, which is the same fault it was built to close. The corner stays available through `setSolverDefaults` and is not imposed (rule 31). The pass also found a NaN no check could see: `pilot.N` set beyond the fitted bank reads unfitted leads and returns NaN, which passes every bounds test — now clamped and reported. And on six plants only two deploy, so this is two plants with four negative controls. |
| Linear AND nonlinear alike | **STILL CONTRADICTED, BUT NO LONGER ONE ERROR CLASS** | The ordering by nonlinearity is still wrong at the ends: the most nonlinear plants — barrel as T⁴, tank as √h — refuse or sit marginal, and Wood–Berry, linear transfer functions with dead time, still LOSES (43.90 doing nothing against the published BLT's 51.95, and every deployment worse than that). What changed is the middle: the COLD MILL is a linear plant with a dominant transport delay and a periodic exogenous disturbance, and it now wins 1.45x median across 8 of 8 seeds, past the gaugemeter AGC that AMPLIFIES its dominant disturbance by 3/2. So the honest description is no longer "one error class" — it is two: mechanical compliance and friction (arm, EMPS), and periodic disturbance rejection through a declared dead time (mill). Two of six is not "alike", and Wood–Berry is the standing counterexample: a linear plant with dead time where declaring the delay was measured and changed nothing. |

**ONE RIVAL HAS BEEN BUILT AND RUN, AND THE FIELD STILL HAS NOT BEEN ENGAGED** — this line
used to say "nothing here has been compared to the state of the art" and had been false since
plan §34. What exists is a properly engineered truth-free rival on the arm: a rigid model, a
datasheet Kalman filter on the gearbox wind-up, and a held-pose calibration, on the same
machine and the same programs. It reads **1.01x / 1.13x / 1.02x** against the frozen learned
composition's **2.87x / 7.72x / 6.18x**, and §34 says WHY it loses rather than only that it
does: the observable state it estimates has a closed form, the Kalman duly recovers it, and it
is not what dominates this machine. That is one rival, of this project's own construction, on
one plant. Still absent: norm-optimal ILC, modern MPC, L1 adaptive, DeePC or behavioural
methods, Koopman-EDMD. "Best in the world" is a claim about a field, and one rival is not a
field. The defensible sentence today is: *beats the conventional machine; beats an engineered
truth-free rival on the arm; and on one real axis matches the published model-based
feedforward at its own published parameters.*

### What is actually wrong today

**The rung that produces the biggest number is a MEMORY.** The lap-periodic table says so in
its own report row — *"a MEMORY: it will not transfer to another program"* — and it is the
difference between 5.4e-2 and 1.8e-2 on the arm. So the headline is carried by the one
component that is guaranteed not to survive a change of program, and the parts that DO
transfer are the ones that score less. That is not a bug to fix in the table; it is the
shape of the whole design, and it is what has to change.

**IT NEEDS AN INSTRUMENT THE CUSTOMER PROBABLY DOES NOT OWN, AND THIS FILE HAS NEVER SAID SO.**
Every number in this project is obtained with GROUND-TRUTH TOOL POSITION available during
commissioning. On a real machine that is a laser tracker, a ballbar or an instrumented artefact
— a metrology service, machine downtime, and usually a specialist. The tracker being
commissioning-only is a real and hard-won property and it is NOT the same as not needing one.
"Wire it up, press one button" assumes an instrument most shops do not have, and that assumption
decides who can buy this more than any factor in the table above does. Two consequences follow
and neither is measured: what the method delivers from a CHEAPER truth (motor-side encoders
alone, an accelerometer, a touch probe on a cut part), and how it degrades as that truth gets
worse. **THE FIRST HALF IS NOW PARTLY MEASURED AND THE INSTRUMENT IS NOT TRUSTED YET (plan §50.1).**
Degrading the tracker reading — noise on the tool, score left on perfect metrology — costs about
**2x of the delivered result at every level tried**, including sigma 1e-3, which is 0.1% of the
error being measured. But the ladder is NON-MONOTONE (1.54x at 1e-3 against 2.13x at 3e-2), more
noise reading better is not physical, and the specific hypothesis for it is FALSIFIED: averaging
four laps of the oracle's re-measurement, which halves the noise entering it, moves the result
-1%, with the one-lap control reproducing the original to every digit. **AND THE SECOND
HYPOTHESIS — that the shape was one-draw noise — IS FALSIFIED TOO.** Three seeds at each of the
two sigmas that disagree most give **1.536 / 1.579 / 1.568 against 2.128 / 2.376 / 2.442**:
disjoint distributions, 1.35x apart, and only 3% spread within the lower one. So more tracker
noise really does deliver a better controller between those levels, and the ladder's interior is
a finding rather than an artefact. What holds against zero is the part that matters commercially:
an exact tracker reads **3.67, which is 1.50x above the best noisy draw and 2.3x above the sigma
1e-3 band**, so the metrology cost is real and this method is not free of its instrument.
The mechanism is a HYPOTHESIS and it is §49's own law through a new knob — noise prevents the
iteration converging onto the lap-specific residue, which is implicit early stopping and is rule
35 priced from the other side — and the fit-R² evidence is mixed across seeds, so it is consistent
with the numbers rather than shown by them. Still unmeasured, and the thing that actually prices
the commissioning claim: a CHEAPER truth rather than a degraded ideal one.

**AND COMPUTE TIME IS NOT COMMISSIONING TIME.** The "2 minutes on the arm" is wall clock for the
ladder. The distillation route needs iteration converged on about six training programs, which is
laps on real hardware producing nothing. A number that counts only the arithmetic is measuring
the half that is free.

**Anything the commissioning did not see, breaks it.** Change the feedrate, the plant or the
path and the machine degrades — not gracefully, catastrophically. The evidence is already in
this file and was written down as a success: the composite measures 4.9x to 20.3x across five
programs and on one of them it makes the machine WORSE; a phase-indexed table worth 125x on
the program it learned reaches 0.55x on a sine — worse than doing nothing. A number that
holds only where it was measured is a calibration, not a controller.

**Commissioning WAS outrageous, and on the arm it is now two minutes.** This line used to say
"roughly half an hour on one plant for one program" and it was true of the Node bar with the
retired memory in it. Measured on the page's own configuration: 17 min with that memory, 8
without it, 4 at cascade depth 1, **2 with the conventional rung dropped** — and the delivered
result is identical at the last step, because that rung was commissioned, scored at 1.07x and
discarded. The honest caveat the old line carried still stands for the other five plants,
where none of this has been measured. And the number it quoted for WHERE the time goes was
wrong in the direction that closed off the right lever: the physics is **69%** of a scored run,
not a tenth (`test/flexisim/_cost.mjs`, which was built to check exactly that).

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
   tuned. **THE DELAY CLAUSE IS MET AND IT WAS ALREADY IN THE SET.** This used to read "add a
   plant with a delay that dominates its own response, because none of the six has one" — the
   COLD MILL has one: 100 steps of transport delay against a measured settle of 111, and until
   its delay was declared the pilot read that settle as 9 and built a 14-step horizon for a
   plant that cannot move for 100. The line was written from the plant's description rather
   than from its numbers, which is rule 17 aimed at a document. What the mill now supplies is
   the delay-dominated datum: 1.45x median across 8 of 8 seeds. What it does NOT supply is a
   second one, and Wood–Berry — four dead times, up to 7 minutes on a cross path — is still
   the plant this method loses on.

4. **COMMISSIONING IN MINUTES, NOT AN AFTERNOON. MET ON THE ARM — 17 MINUTES TO 2, AND THE
   DELIVERED RESULT IS UNCHANGED.** Target: 10x down, under three minutes on the arm, while
   holding the contract bar. Measured end to end on the page's own configuration at K 0.25 /
   E 0.03:

   ```
     Node bar with the retired memory in it                    17 min
     memory retired (the page already did this)                 8 min
     + cascade depth 1 (owner's call, taken for compute)         4 min
     + the conventional rung dropped                             2 min   ->  2.7878e-1, 3.13x
   ```

   The last step is free rather than a trade: with the rung the ladder spends 23 laps and two
   of its four minutes commissioning a correction it scores at 1.07x and then DISCARDS,
   because the cascade above commissions better without it. Removed, the same ladder delivers
   the identical 2.7878e-1 to four significant figures — rule 21's signature, where the thing
   that should not change comes back unchanged and only the cost moves. It is a CALLER POLICY
   and not a library default, because the EMPS axis ships that rung ALONE at 424.8x and
   removing it there costs 2.2x AND drives the ladder onto a three-layer cascade plus the
   retired lap-periodic rung — the cheapest thing in the ladder is what keeps the most
   expensive things out. The page carries an operator switch, default off.

   **AND THE REASONING THIS TARGET USED TO CARRY WAS BUILT ON A NUMBER ITS OWN INSTRUMENT
   REFUTES.** It said the physics is ~10% of the wall clock, and concluded that the remaining
   factor "has to come from needing FEWER SCORED RUNS ... not from making each lap cheaper".
   `test/flexisim/_cost.mjs` exists specifically to check that figure — its header cites rule
   16 for why — and measures the scored laps at **69%** of a run: `fresh()` 3,213 ms against
   6 scored laps at 7,027 ms. So the direction that was closed off was open, and the factors
   that actually landed came from removing rungs rather than from learning more per lap.

   WHAT IS NOT YET DONE: the same measurement on the other five plants, and the contract bar
   at 2 minutes — the arm's ladder still reports 3.13x on the soft cell against the 22.42x the
   memory-carrying stack reached, which is the retirement's stated cost and not a regression.

5. **HIGHER, NOT MERELY TRANSFERABLE.** Transfer bought by giving up performance is a
   different product, not this one. Target: beat 22.42x on the arm while satisfying 1 and 2.

6. **IT HAS TO FIT A PLC SCAN — UNDER 10%, ALWAYS, INCLUDING THE FITTING.** The budget is
   10% of a 1 ms task, it must be met in EVERY cycle rather than on average, and it covers
   commissioning, training and fit, because all of it runs ONLINE on the PLC. Nothing is
   done offline on a dev PC.

   **MET ON THE ARM, AND NOT BY GIVING ANYTHING UP.** The deployed path fits at 62% of budget
   and delivers MORE than the configuration that misses by 7.4x:

   ```
   basis    gain   feat   MAC/cycle  %budget   rounded   circle   sharp
   null     no      352      73,664     737%    2.87x    2.76x    3.50x   <- what shipped
   null     yes     352      12,778     128%    3.50x    4.80x    3.31x
   linear   no      242      67,064     671%    2.63x    2.53x    3.16x
   linear   yes     242       6,178      62%    3.31x    4.42x    3.21x
   ```

   Geometric mean 1.19x BETTER at 11.9x less arithmetic, on one commissioned model per basis
   deployed twice, scored on the fitted program and two never run.

   **THE QP IS A FIXED LINEAR MAP AND NOBODY HAD EXPLOITED IT.** `boxQP` is projected
   gradient: every iteration is a linear map followed by a clamp, so while no clamp fires the
   whole solve — truncated at `qpIters` or converged — is AFFINE in the free response. The
   pilot applies only `u[0]`, so what the machine computes each cycle is one row of that map,
   `u0 = k·f0 + c·uPrev`, built once at commissioning. **61,006 MAC/cycle to 120.**

   It is licensed by a measurement that was already in the report and unused: `report.binding`
   reads `model` at every cap tried and `capFrac` reads **0.0019** — the box the solver exists
   to enforce is active in a fifth of one percent of samples, and where it fires the gain
   clamps as the QP's own projection clamps its first move. Superposition verified to **3e-13**
   over 200 random free responses per channel, so this is the solver reassociated rather than
   an approximation of it. `k` is obtained by PROBING the solver with unit vectors, never from
   the KKT conditions: the truncation is part of the map, and the converged map is on record as
   not the one that ships (two iterations beat sixty on this arm).

   **AND REMOVING THE WARM START HELPS.** The shipped solver warm starts from its previous
   plan and the gain has no state, so the two are different controllers rather than two
   evaluations of one — which is why it was measured rather than asserted. The machine prefers
   the stateless one on two programs of three (+22%, +74%, −5%), consistent with "the converged
   solve rings and the truncated one does not": a warm start is extra convergence by another
   route.

   **WHAT IT COSTS AND WHAT IS NOT ESTABLISHED.** The linear basis is a real trade — the
   scheduled block EARNS its place on held-out data (0.771 against 0.840) and every linear row
   is below its scheduled twin. It ships anyway because a path at 671% is a proposal and not a
   baseline. And the SHARP SQUARE — the owner's bench program — is the one column the shipped
   configuration wins, 3.50x against 3.21x. One plant, one stiffness, one feedrate, one seed;
   `explicitGain` and `forceBasis` are both opt-in and OFF, and the six-plant pass and the
   feedrate span both have to run before any default moves (rule 31). `cost()` still costs the
   QP the gain replaces, so the MAC figures above are computed in the HARNESS — a cost model
   edited to flatter a proposal is the instrument failing before the model.

   **THE REMAINING TERM IS THE FORECAST AND THE SAME REASSOCIATION REACHES IT.** Since
   u0 = sum_i k_i (w_i · row_i), every position of the row whose value is the same at every
   lead folds into one coefficient evaluated ONCE instead of N times. `row_i` IS lead-dependent
   — `L = ro.leads[i]` moves the look-ahead offsets and there is an explicit `ell = i/(N-1)`
   block — but the measured-state lags are identical at every lead, the command terms read a
   sequence known ahead, and `ell` is a constant per lead. Order 800 MAC/cycle for both
   channels if it is built, which is what would buy the scheduled basis back inside the scan.

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

7. **BREADTH, WHICH MEANS WINNING WHERE IT CURRENTLY LOSES. HALF MET.** The second clause is
   done and done properly: the COLD MILL was one of the two standing refusals and is now a
   MEASURED IMPROVEMENT, not merely a correct refusal — 1.45x median exit gauge across 8 of 8
   seeds that all deploy and all help, past both classical AGCs including the gaugemeter that
   amplifies the disturbance it is supposed to reject. Neither repair touched the controller:
   the transport delay is declared by the engineer who mounted the instrument, and the forecast
   gate was reading lead 0, where the response is zero by construction. STILL OPEN: beat the
   published BLT on Wood–Berry, where doing nothing (43.90) already beats it (51.95) and every
   deployment across twelve seeds is worse than that — declaring its own-loop delays was
   measured and changed nothing, so the mill's route is not that plant's route. **THE ROUTE
   THAT IS NOW MEASURED IS THE OFF-DIAGONAL.** Wood–Berry is the textbook strongly-coupled 2x2
   plant — BLT is a DETUNING method that exists because of that interaction — and this pilot
   inverts a DIAGONAL. Arming the library's opt-in `mimo` solve takes the forecast from
   0.74/0.84 to **0.986/0.993** and the delivered IAE from 82.10 to **52.52**, a 1.56x repair
   on the machine, landing level with the published BLT (0.99x of it) — and still short of the
   43.90 that is the actual bar. So the remaining gap is 52.52 against 43.90 rather than 82.10
   against 43.90, and the gate refuses both, correctly. It is not a general fix: the same
   change makes the BARREL worse on every zone (R² 0.89/0.93/0.90 → 0.79/0.76/0.75, program
   regime 1.10x → 0.73x), so the barrel's refusal is not about its off-diagonal, and `mimo`
   stays default off. It also costs `nc²` solve blocks against `nc`, which the PLC budget
   counts. **AND THE BARREL'S OWN REFUSAL IS NOW PROVED CORRECT RATHER THAN MERELY MADE.**
   Forced to deploy, its correction sits at EXACTLY its cap (uPk 12.0000 of 12) and costs the
   changeover 1.5x; swept over a sixteen-fold range of believed plant gain with the forecast
   held fixed and good, the delivered ratio runs 0.670x → 0.917x → 1.006x → **1.017x** → 1.012x
   and reaches that ceiling by making the correction VANISH (6.6% of the cap for 1.2%). Every
   setting that applies a real correction is worse than doing nothing, so the refusal is not
   hiding a scale error — which is target 7's second clause in its other form, on the other
   plant. Untested and stated: a SCHEDULED gain is a different object from a scaled one on a
   plant that radiates as T⁴. **AND THE PROBE'S SETTLE TEST IS BIASED, WHICH IS A DIAGNOSIS
   AND NOT A CHANGE.** `enough` fires against a `tail` computed from the last quarter of the
   NOT-YET-SETTLED record, so two of the barrel's three channels stop at 16,400 and 30,200
   steps and read their DC 24% and 15% low — measured to convergence, with the third channel,
   already at the 60,000-step cap, byte-identical across a twenty-fold sweep as the control.
   Repairing it recovers the barrel's whole deficit with no constant (0.670x → 0.989x, the
   correction off its cap), which is rule 43 from the plant that stood as its counterexample —
   **and the six-plant pass REFUSED it**: five plants byte-identical, zero improvements, and the
   barrel's own `nonlinear basis` contract goes red. It is inert wherever the probe already
   settles, and the arm improvement it was built for never existed — this file's "7-9% bias in
   `hGrid` worth 16%" records a repair ALREADY MADE, read as an outstanding one (rules 17, 30). The barrel is
   the other standing refusal and it is still one. A method that wins only on compliance and
   friction is a good compliance-and-friction method; this one now wins on two error classes of
   three tried, and loses on the one a 1980s method owns.

8. **MEASURED AGAINST SOMETHING THAT IS NOT US. ONE LITERATURE METHOD IS NOW BUILT AND RUN,
   AND IT AGREES WITH US TO FIVE FIGURES — INCLUDING ON THE FAILURE.** Norm-optimal ILC
   (`test/pilot/noilc.mjs`, `noilcbench.mjs`), the textbook law
   `Δu = (GᴴQG + R)⁻¹GᴴQe`, nothing tuned, against the harmonic rung on the EMPS axis with the
   SAME identified operator, the same machine, the same authority and the same laps — it
   borrows `hff`'s `exportOperator`, `_project` and `_table`, so what differs is the update law
   and not a second convention:

   ```
     hff    5.7640e-1 → 2.3805e-3 mm   242.1x
     NOILC  5.7640e-1 → 2.3804e-3 mm   242.1x    Q 1, R 1e-4
     on a two-tone sine the axis has NEVER run:
       open loop     4.7537e-1        hff 8.9848e-1 (0.53x)    NOILC 8.9849e-1 (0.53x)
   ```

   **THE TRANSFER ROW IS THE RESULT.** A properly implemented method from the literature makes
   this machine WORSE THAN NOTHING on a trajectory it has not run, exactly as ours does, to four
   figures. That is no longer a property of our implementation of ILC; it is a property of
   LAP-INDEXED MEMORY, and it is the first evidence for the retirement that does not come out of
   our own code. NOILC also converges in three update laps — but it paid nothing for
   identification, so that is a statement about the law given an operator and not a cost
   comparison.

   **AND THE AGREEMENT IS EXPECTED ON THIS PLANT, WHICH IS THE LIMIT OF IT.** `hff`'s reach
   factor is recorded here as "on the axis inert to four figures", so EMPS is precisely where the
   two laws should land together. The ARM is where that shrinkage is load-bearing — removing it
   costs 4.81x → 1.05x — and is therefore the venue where these two would actually discriminate.
   The plan names the arm for that reason and it is NOT yet run: the arm drives `HarmonicFF`
   through the shared `makeArmHost`, so the rival has to be plugged into that host rather than
   given a harness of its own. A first draft of exactly such a harness invented an
   `arm.jointErr` that does not exist and would have been the fourth private copy of that
   routing, three of which have each shipped a defect (rule 61). Still absent entirely: modern
   MPC, L1 adaptive, DeePC, Koopman-EDMD. One method is not a field.

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

**AND THE THING THAT REPLACES IT IS NOW MEASURED: DISTIL THE ITERATION, DON'T KEEP THE TABLE
(plan §49).** §48 established with an ORACLE that a PERFECT forecast is worth 20% on this arm
and that the whole remaining gap is ITERATION — freeze what a pass applied, re-measure on the
machine, invert again — which converges at **40.44x on the rounded rectangle, 230.89x on the
circle and 19.47x on the sharp square**, past mode ⑩'s 44x. The prefix that carries it is
indexed by lap phase, so the question is not whether to iterate but whether **what iteration
CONVERGES TO is a function of state**, and those are different claims. Measured: converge the
prefix at commissioning, then REGRESS it onto the commanded reference over a local window and
deploy that instead.

```
  controller                          sharp   rounded   circle    geo   MAC/decision
  shipped pilot                       2.16x    2.64x    3.99x    2.83x        9,517
  distilled, 6 polygons, +/-512       4.99x    4.22x    6.74x    5.22x          222
```

**AND WHAT CARRIES IT IS PREVIEW, MEASURED AGAINST THE MATCHED CONTROL.** `classic.js`'s basis
`[a, v, sign v, 1]` is the nearest thing here to the literature's task-flexible ILC, and the arm's
ladder commissioned it, scored 1.07x and DISCARDED it. Put through the SAME distillation harness —
same fitting route, same converged prefix, same training set, only the basis moving — it distils to
**1.02x geometric, i.e. nothing**, which reproduces that discard by a route sharing none of its
machinery. Then the control that matters: the same rows at 79 CAUSAL taps against the same 79 taps
TRANSLATED across now — identical count, span and spacing, only the position relative to NOW
differing — read **0.89x against 1.43x**, with fit R2 0.414/0.332 against 0.751/0.691. **Causal
taps make the machine worse than doing nothing on all three programs; non-causal taps help on all
three.** And `motionBasis` cannot express the difference: its `delay()` shifts backwards only and
its `live()` refuses a lagged basis outright, so the shipped physical rung is REPRESENTATIONALLY
incapable of the thing that carries the result. Preview is necessary and not sufficient — 1.43x
against the generic window's 3.67x — so both terms are real and their ordering is now measured.
The honest placement in the literature narrows and strengthens with it: non-causal feedforward
inversion is ZPETC and stable inversion, which DERIVE that inverse from an LTI model, and what is
here is one REGRESSED from data on a plant whose inverse is pose-dependent and nonlinear. Not "a
big basis beats a physical one" — that framing died with the control.

**EVERY TEST PROGRAM IS HELD OUT** — the polygons come from the block's own designer and no
production geometry appears in training — and the deployed object is 111 linear coefficients
per channel with **no QP, no forecast bank, no tracker, no lap index and no plant constant**.
It REPLACES the pilot rather than sitting under it (stacked, they double-correct at
0.96x-1.30x).

**THE ONE CONSTRAINT THAT BINDS IS RULE 37 AGAINST §41's ALIASING THEOREM, AND THEY PULL
OPPOSITE WAYS.** The window must REACH the plant's memory (elbow 6363-8649 steps) and must not
SPAN the training lap, and on this arm a program lap is 7356 steps — shorter than the memory.
So on a single closed program the trade is forced: +/-1024 samples reads 24.93x on the programs
it was fitted on and **0.47x, worse than doing nothing**, on one it was not. What breaks it is
training laps that DIFFER, and the two levers only pay together — six polygon laps at +/-512
read 4.99x where six at +/-256 read 4.13x and two production programs at +/-1024 read 0.47x.
A single long TOUR (one closed lap of ~6,500 samples) takes the same +/-1024 window from 0.47x
to 3.29x, which is the mechanism measured rather than argued.

**AND CASCADING IT LOSES, WHICH IS A REPRESENTATIONAL LIMIT AND NOT A COMPUTE ONE.** The
deployed map is 238 MAC of a 10,000 budget — 2.4% — so capacity was never the constraint here
the way it is for the pilot at 9,517. Measured: the oracle ladder ON TOP of the frozen policy
reads 5.52x -> 19.45x -> 23.52x -> 25.16x on the held-out sharp square and 4.25x -> 18.37x ->
41.02x -> 55.35x on the rounded rectangle, both PAST what iteration alone converges to from the
bare machine and both at almost no extra authority. So there is 4.6x to 13x of headroom above
layer 1. A second DISTILLED layer built to take it delivers **4.73x geometric against 5.49x** —
it fits its own residual at 0.511 in sample and transfers worse still. That reproduces
`_resid.mjs` by a completely different route: **the headroom above a good correction is real,
large, and not a function of state.**

**AND IT RETRACTS THIS FILE'S OWN BOUND.** §49 stated that 20x is unreachable on the sharp
square because iteration with a perfect forecast converges at 19.47x there. That is iteration
ALONE from the BARE machine; starting from the distilled policy it passes 19.47x at pass 2 and
reaches 25.16x, so the number was a property of one starting point rather than of the program.
What stands is that the route to it is a MEMORY and the one legal route measured makes the
machine worse.

**AND IT HAS A SECOND PLANT (plan §50), WHICH IS THE ONLY THING THAT MAKES IT A METHOD.** The EMPS
servo axis — real machine, real data, no physics in common with the arm — carries a negative
control this project did not choose: on a two-tone sine the axis has never run, a converged lap
table reads **0.53x, worse than doing nothing**, and a textbook norm-optimal ILC reads 0.53x there
too, to four figures. `hff` is commissioned on four periodic trajectories, the four converged
tables are distilled onto a ±512-sample window of the commanded reference through the SHIPPED
module, and the sine appears in no training set:

```
  on the two-tone sine the axis has NEVER run:
    open loop                 4.7537e-1 mm
    the converged TABLE       8.9848e-1 mm    0.53x
    the DISTILLED policy      1.4341e-2 mm   33.15x
  on the machine's own program:
    the converged TABLE       2.3805e-3 mm   242.13x
    the DISTILLED policy      1.7601e-2 mm    32.75x
```

Held-out R² 0.9982 against a null of -0.0034, leave-one-program-out; 40 coefficients at **78
MAC/decision**. **The price is 7.4x at home to buy a factor of 62 on the unseen trajectory** — the
retirement's whole trade in one table, on a plant that is not the arm. TWO CAVEATS STATED: the sine
runs at 1.17x the program's velocity, INSIDE the 0.60-1.20 span the training set covers, so this is
transfer within the trained envelope — which is what the coverage guard requires rather than an
accident, and outside it the guard fades rather than extrapolates; and the distillation still
trains on tables iteration had to converge first, so the machine time is unchanged.
**AND THE TRAINING DIET HAD TO BE SIZED FROM THE MACHINE.** The first run picked tone amplitudes by
hand, produced a trajectory at 4.3x the program's velocity and 7.5x its acceleration — open loop 74
mm, the rung managing 1.0x — and a quarter of the rows were a machine failing to track. The gate
REFUSED it (held-out -0.333 against a null of -0.001, in-sample 0.795) and applied nothing, so both
columns read 1.00x rather than harm. Rule 41b bites on a training diet exactly as on an excitation,
and the capacity gate caught a construction failure it was not built for.

**IT IS NOW A BLOCK. `lib/pilot/distil.js`, pinned by `test/pilot/distil.test.mjs` in the QUICK
tier.** One weight vector per channel, and three guards each carrying the measurement that
justifies it rather than caution: a CAUSAL-ONLY WINDOW IS REFUSED AT CONSTRUCTION (§49.14 reads
0.89x causal against 1.43x straddling, so it is a misconfiguration and not a safe choice); the
correction FADES outside the commanded-speed span the fit saw (the measured 0.75x at half the
trained feed and 0.53x at an untrained one); and the fit must beat a shuffled null. **THE FIT
STREAMS**, one shared-covariance update per row — the clean case the pilot's lead bank is not,
one row and nc targets — with no row retained, so the offline half of target 6 is closed as a
CONDITIONAL that can be checked: at 111 features the deployed path is **330 MAC/decision, 3.3% of
budget**, and the fit is **24,864 MAC/ROW in 48.1 kB**, which is 249% of budget at decision stride
1 and **28% at the stride 9 this method actually uses**. `fitCost()` returns the per-ROW figure
raw and says why — a row arrives once per DECISION and only the caller knows its stride, and
quoting a per-row cost against a per-scan budget is the units error this project keeps paying for.
Streaming validation is PREQUENTIAL, every row predicted before it is learned from, which cannot
leak where the batch path's contiguous split can only approximate that.

**AND THE GATE TOOK THREE ATTEMPTS, TWO OF WHICH WERE WRONG AND GREEN.** An in-sample fit compared
against an in-sample shuffle is the same quantity twice: over 40 seeds on a PURE-NOISE target it
deployed **29 times at one draw and 13 at best-of-five**. Moving the decision to a held-out score
cut it to 4 and running the null through the same folds to 2, and raising the draw count does not
close the rest (5/60 at k=5 against 4/60 at k=19). So the module states outright that it is a
cheap PRE-FILTER and the decision remains a machine-scored verify — a block presenting that number
as its safety case would be overselling it. The folds are contiguous with a GAP of the window
span, because rows a few samples apart read most of the same window and a shuffled row split
validates against data it has effectively seen. And the batch/streaming agreement is asserted on
the APPLIED CORRECTION rather than the weights: this design is collinear by construction, the two
fits differ by **12% in weight space while agreeing to 0.0009% rms in what reaches the machine**,
and asserting on weights would have read as the failure of a fit that is exact where it counts.

**AND THE ONE PRESS NOW REACHES IT.** `AutoStack` rung ②d converges a lap-periodic correction on
several training runs the host supplies (`host.distilRuns()`), regresses them through the shipped
module, scores the result on the machine like every rung, and reverts if it does not win. It sits
after the cascade and BEFORE the lap-periodic rung — a phase-indexed correction applied to a
machine the rungs above have moved is the 0.71x failure — and unlike that rung it is NOT withheld
off its program, because it is addressed by the commanded reference and transfers by construction.
A host without `distilRuns` gets a STATED skip; a training run the rung could not improve is
DROPPED and the drop reported, because that is a machine failing to track rather than a lesson,
and if every run drops the report says the diet is the fault. Deployment runs through the host's
OWN look-ahead closure, the same `ctx.look` the cascade uses, so no new deploy-time plumbing
exists. That split the row builder in two: the absolute form clamps its window at a record's
start, which is right for an index into a finite record and WRONG for a live reader where a
negative offset is an ordinary request for the past — both are pinned, INCLUDING the boundary
where they must disagree, since if they agree there the absolute form is not clamping at all.
`autostack.test.mjs` on EMPS is unchanged at 20.2x with the rung registered and skipped, which is
the control.

**AND PRESSED ON A REAL PLANT THE TWO OBJECTS COMPOSE, WHICH WAS NOT PREDICTED HERE (plan §50.2).**
On the EMPS axis with the rungs narrowed to distil → lap-periodic, so the ladder must choose
between them by measuring: **②d distilled 5.7640e-1 → 2.1269e-2 (27.10x)**, then the memory on top
→ **1.6854e-3, 342.0x total**. The memory ALONE on this axis reaches 242.1x, so the pair beats
either — §49's mixture account separated into two rungs, the distillation taking the part that
transfers and the memory mopping up the residue it is actually good at. The ordering is brick 63's
asymmetry holding: plant model first, memory last. **AND IT IS TWO PLANTS BY TWO ROUTES, NOT ONE
(plan §50.3)** — §49's TOP-UP ladder is the same experiment on the ARM, run earlier and read at the
time as "headroom above layer 1" rather than as composition: iteration alone from the bare machine
converges at 19.47x sharp and 40.44x rounded, and ON TOP of the frozen distilled policy it reaches
**25.16x and 55.35x**. So the factor reads **1.29x / 1.37x / 1.41x** across arm-sharp, arm-rounded
and EMPS — two plants, two iteration engines sharing no code path (an ORACLE-fed prefix in the
distillation harness against `hff`'s probe-identified operator as an `AutoStack` rung), underlying
gains spanning 19x to 342x. §49's mixture account predicts the DIRECTION and not a constant factor,
and three points are not a law; what is established is the sign and the rough size, twice,
independently. The gap that remains is narrower than it first looked: not whether this composes on
the arm, which is measured, but whether the SHIPPED lap-periodic rung with a real operator composes
there as the oracle ladder does. **THE HOST FOR THAT IS NOW WIRED AND THE MEASUREMENT IS NOT TAKEN
(plan §51.5).** `makeArmHost` gained `distilRuns()` — training programs from `designDemoPaths`, the
same designed diet the ②b banks use, with the error returned in JOINT space because that is the
frame the rung corrects in — so the arm can reach ②d through the one press for the first time. The
diet is designed rather than production geometry for §49.11's forced reason: the window must reach
the plant's memory (6363-8649 steps) and must not span the training lap (7356), and on one closed
program the two cannot both hold. Wiring it found a units error that was INVISIBLE on the plant the
rung was built on: the cascade's `ctx.look` is DECIMATED to the pilot's cadence while this rung's
offsets are RAW machine samples, and on EMPS the cadence is 1 so the two closures are the same
function — on the arm it is 9-13 and the deployed window would have been stretched by that factor
against the one the fit saw, with nothing thrown and no diagnostic naming it. Hosts now declare
`ctx.lookRaw` and every existing one is byte-identical. **UNDER THE RETIREMENT ONLY THE FIRST SURVIVES
— 27.10x that transfers against 242.1x that does not**, which is the retirement's trade stated by
the one press on a real machine rather than argued, and the same rung reads 33.15x on the
trajectory where the memory reads 0.53x.

**WHAT IS NOT DONE:** the offsets are
indexed in SAMPLES, so it is not feedrate-invariant — training across a FEED LADDER removes the
danger entirely (half-feed 0.75x -> 2.58x, nothing below the pilot) at the price of 2.3x at the
commissioning feed, while both modelling escapes are built and worse than doing neither (speed
scheduling 0.56x at 2x feed, arc-length indexing worse at EVERY feed), and so is PER-FEED BANDING:
three bands, four programs each so none is under-determined, the same 119 features everywhere.
**Blending the bands beats switching between them — geometric 2.34x against 2.14x, ahead in 3 cells,
equal in the 4 band centres, behind in 1 — and BOTH lose to the POOLED map at 3.37x**, which wins 6
cells of 8 including both band centres of the hard program and is the only one that never falls
below the pilot (worst cell 2.30x against switch's **0.53x, worse than doing nothing**). The
mechanism is the CONFOUND and not the capacity: at one feed the time offsets and the arc offsets are
perfectly confounded, so a band map restores in full the confound the feed ladder exists to break,
and only the pooled map ever sees the two disagree. Feed-invariance comes from TRAINING ACROSS
FEEDS, never from INDEXING BY FEED — the retirement's own lesson one level up. Third time in this
arc that spare arithmetic bought nothing: capacity, cascade depth, now input routing. And it is one
plant.

**WHAT MUST REPLACE IT.** In the order their evidence justifies:

1. **ONLINE ADAPTATION, which is the plant-based way to get memory-like accuracy.** A frozen
   model is stuck at its commissioning residual; a model that keeps updating converges on
   whatever the machine is doing NOW, and it is addressed by state, so it transfers. This is
   the closest thing to what the table does without being a table.

   **AND IT SHIPS AS A COMMISSIONING PHASE, BECAUSE THE TRACKER IS ONLY LEGAL THERE.** Fit on
   the scribble, run a program with the tracker STILL ATTACHED as part of commissioning, adapt,
   FREEZE, unwire the tracker, deploy. The deployed machine has no truth by either route — the
   scored runs pass `truthUntilLap: 0` AND null `online` — and nothing is addressed by lap
   position, so it is admissible under the retirement. Measured at depth 1, six guided laps,
   three seeds and three programs:

   ```
     seed   rounded (adapted)     circle (never run)    sharp (never run)
      s1    2.87 -> 6.33 (2.21x)  2.76 -> 7.58 (2.75x)  3.50 -> 4.31 (1.23x)
      s2    2.87 -> 4.23 (1.47x)  3.48 -> 8.90 (2.56x)  2.99 -> 3.21 (1.07x)
      s3    3.38 -> 6.00 (1.78x)  3.81 -> 11.03 (2.89x) 3.18 -> 3.91 (1.23x)
   ```

   **9 of 9 cells improve**, worst 1.07x, geometric mean 1.79x — and the two programs the
   adaptation NEVER RAN gain more than the one it did (circle 2.73x geometric against the
   adapted rounded rectangle's 1.79x). A correction worth more on paths it has not run than on
   the one it was refined on is a model of the plant; the reverse ordering is what a memory
   looks like. Six laps is the optimum (3 laps 5.70x, 6 laps 6.33x, 12 laps 5.43x) and past it
   BOTH columns fall together — the RLS drift already on record rather than an overfit, which
   would show home improving while held-out fell.

   It is wired as `AutoStack`'s `guidedLaps` (default 0), which runs the phase after the
   cascade rung commissions, nulls adaptation, re-scores with truth gone, and keeps the guided
   model only if that frozen score is better. On mode 9 it reads 3.13x -> 4.03x.

   **COMPOSED WITH THE BUDGET CONFIGURATION IT IS SUB-ADDITIVE, AND THE BENCH PROGRAM GOES
   BACKWARDS.** Together with the explicit gain and the linear basis, at 62% of a PLC scan:
   4.16x / 9.22x / 3.05x — geometric mean 1.61x better than what ships, but the sharp square
   degrades monotonically (3.50 -> 3.19 -> 3.05) and ends 13% BELOW it. Guided's own value
   falls from 1.79x/2.73x/1.17x standalone to 1.26x/2.09x/0.96x there. Hypothesis, untested:
   the standalone numbers were taken on the SCHEDULED basis and these on a forced linear one,
   so there is less model for the adaptation to move — which predicts guided recovering its
   value once the forecast collapse buys the scheduled basis back inside the scan.

   `Pilot`'s `adapt` path and `leadStride` remain off at deploy; the one measurement on that
   moved the machine 0.1% because it adapted lead 0 alone.
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

### The performance bench configuration (owner's standing rule)

**Every performance bench going forward runs at the SOFTEST arm settings (K 0.25 /
E 0.03) on the SHARP-CORNER program.** The mode-⑨/⑩ trace is the reason: every
seam-round bench ran the rig default K=16/E=0.15 while the phone ran K=1/E=0.06, and a
fix validated stiff shipped e-1 soft — a benchmark is a constant too (rule 31). The
softest cell with the hardest program is the one that cannot flatter: compliance at its
largest, and the corner regime the excitation covers worst. Numbers recorded at other
settings stand as history; new performance claims are measured here.

### PLC only — no offline allowed (owner's standing rule)

**Everything runs on the PLC: commissioning, identification, compile, refine, deploy.
Nothing is done on a dev PC — the north star's target 6 is now unconditional.** Heavy
computation is legitimate ONLY as background compute sliced into the 10%-of-scan
budget (10,000 MAC per 1 ms cycle, met EVERY cycle) while the machine produces. The
⑩ pipeline is COSTED for exactly that (`test/_twincost.mjs`, plan §44): the twin's
lattice sim is ~54k float ops per step from real cell counts (480 material + 600
vacuum, both links), so sliced it runs 5.4x slower than the 1 kHz machine, in 63 kB of
f32 state — commissioning ~1.7 h background (measured evaluation counts; the ~1.1 h this
line used to claim came from a guessed count that measurement found 37% low, and a
coarse-seed shortcut that would have halved it was tried and REFUSED by the gate), a
program's compile
~1.8 h background to the 44x-class artifact, the deep refine overnight to 51.5x. The deployed artifact is a
tile lookup and costs nothing. Two stated caveats: the ~41k int index ops per step
stretch the table ~1.75x unless the fixed lattice's neighbours are precompiled into
offset tables, and the count is analytic — itemized per kernel pass so it can be
checked, because this instrument class has shipped faults twice (rules 17, 30). Any
new fitting machinery must state its MAC/cycle slice or it does not ship.

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
| `flexisim.html` | **FlexiSim, rebuilt: the commissioning bench.** One machine, one program, the ghost, the distilled model, and the two options that stack on it. The seven-tab page it replaced is in `docs/history/flexisim.md`, brick 73. |
| `lib/lattsim/` | The lattice engine — lattice, fields, materials, operators, solver, backends, renderers. See its README. |
| `lib/lattsim/operators/` | `lbm.js` (D3Q19 fluid), `scalar.js` (passive scalar), `elastic.js` (velocity–stress leapfrog), `frame.js` (gravity and the non-inertial frame). |
| `lib/ngrc/` | The ported NGRC library. See its README. |
| `lib/probesense/` | Soft-sensing a field from one point in it. |
| `lib/flexisim/` | `joint.js`, `link.js`, `arm.js`, `arm2r.js`, `armnr.js`, `tipsensor.js`, `chainsensor.js`, `compliance.js`, `compensator.js`, and the contouring three — `toolpath.js`, `contour.js`, `pathilc.js`. |
| `lib/flexisim/approach.js` | **GOING SOMEWHERE IS A MOVE.** The one planner for every move between programs and poses — a joint-space rapid timed at the feed along the tool's arc, then rule 45's settle — used by the page's Reset and calibration and by the host between every scored run and teacher drive. It exists so that "how the arm moves between programs" is stated once and is the same in the browser and the bar. |
| `lib/flexisim/autohost.js` | **The arm's host for `AutoStack`, imported by BOTH the Node bar and the page** — one module, so the page runs the configuration the bar measured by construction rather than by review. **It drives ONE machine between runs and never restores a snapshot** (plan §52.12); a `borrowed` machine is the caller's and is handed back where the last run left it. It carries the distilled rung's TEACHER: `distilRuns()` supplies `converge()`, the commissioned pilot iterated in the host's one drive loop with the measured error as its free response (`oracleF0`), under a 0.10 rad cap, on the bare machine — and the measured defaults for the rung (window in pilot samples, one row per decision, replaces the feedforward; plan §52.8). |
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
| `test/pilot/spread.mjs` | **EVERY PLANT'S NUMBER IS ONE COMMISSIONING DRAW, AND THIS IS THE DISTRIBUTION IT CAME FROM.** Runs each plant's OWN test with one module-level seed offset changed — no rig is copied, nothing is re-scored — and splits the draws by whether the pilot ACTED, because a refusal's score belongs to the plant and not to the controller. It found that the winners are repeatable — EMPS 1.05x, arm 1.13x, and the COLD MILL 1.07x with **8 of 8 seeds deploying and all eight helping**, the cleanest distribution any plant here has produced — while the two others are draws of 2.2x and 4.2x, and on Wood–Berry all 9 deployments are worse than the 3 refusals. The mill's scrape moved with its result: it used to read the VERIFY ratio, because while the plant refused that was the only number that moved, and now reads the delivered µm rms. A seed that refuses lands there as the open loop's 15.15 and is visibly worse, which is what a refusal should look like in a table that keeps refusals as results. |
| `test/pilot/sixplant.mjs` | **THE SIX-PLANT PASS — the table that has to exist before any solver default moves, and whose absence is why two regressions shipped.** Runs every plant's OWN test in a child process with `setSolverDefaults` set, and scrapes that plant's OWN headline, so no plant is re-scored by a metric this file invented; refusals stay in the table because a refusal is a result. It chose today's defaults (2 iterations at 1.2·Tset) by rule 42's band, took the deployed EMPS path from 429% of a PLC scan to **95%**, and found a NaN no check could see. |
| `test/pilot/tankspread.mjs` | **A PLANT'S SCORE IS A DISTRIBUTION.** Commissions the tank from N seeds and reports the spread, the deployed median, and the GATE'S OWN ESTIMATE beside what it delivered. It asserts nothing — an instrument that decided its verdict before the verdict was understood is how the 1.32x got written down. What it measured: at the old defaults 4 of 8 seeds deploy and **all four hurt**; at the new ones 5 of 8 deploy at a median 1.249x, two still hurt, and the gate's estimate correlates **-0.057** with delivered benefit. |
| `test/pilot/qpsweep.mjs`, `qpsweep-arm.mjs` | **Not tests — the solver-budget experiment.** Commission ONE pilot, re-deploy that same model over a grid of QP iteration counts and horizon lengths, and score the MACHINE. Found that the shipped 60 iterations at `1.5·Tset` is 57× more arithmetic than the machine wants and WORSE than 1 iteration at N=56 (EMPS 14.16× against 12.70×, at 101% of a PLC scan's 10% against 5761%), and that the arm agrees at 29× cheaper and 16% better. Scores a held-out program in the same table, because the surface is rugged enough that the best cell of a grid is a suspect result. |
| `test/pilot/rti.test.mjs` | A FALSIFIED HYPOTHESIS, pinned as the four things measuring it found. One QP iteration per cycle does not track sixty (88% of the applied signal); sixty is itself 36% from this solver's own optimum, so every delivered number in the project came out of a truncated solve; the convergence curve at N=8 matches N=48, so the rate is the Hessian's conditioning and not the horizon; and the Lipschitz bound is 1.82× above the true spectral norm, which costs exactly 2× in iterations. |
| `test/pilot/distil-arm.mjs` | **Not a test — the instrument that reads a distilled-rung refusal to its cause, and the one every knob in plan §52.8 was measured through.** Runs the bench's ladder on the arm at a chosen grade (`GRADE`, `DIET`, `ENGINE`, `REPLACE`, `TEACHCAP`, `STRIDE`, `WIN`, `OFFS=raw`, `PASSES`, `PERIODIC`, `LOO`), then scores the fitted policy on its OWN training programs — evaluated as it deploys, once per decision and held: helps them and harms the square → transfer; harms them too → the fit or the deploy path. Knobs for the structural experiments of plan §52.16 too: `Q`, `PARAM=1`, `REF=angles|torques|both`, `DIET=tour2`, `RIDGE`, `ONLINE=0`, `SOFFS`, `LAPSYNC=1`, `ARM_BL`. At its defaults it reads the host's shipped configuration: **1.7528e-1 on the bench square, 6.04x, 10.7 machine-minutes, ~160 s of Node** (plan §52.16). |
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

### FlexiSim — `flexisim.html` on `lib/flexisim/` + `lib/lattsim/` + `lib/pilot/`

**ONE PAGE, ONE MACHINE, ONE PROGRAM, ONE CONTROLLER — rebuilt from scratch (plan §52).** The
seven-tab page that grew here over the whole project is retired; its description and every
number it carried are in `docs/history/flexisim.md` (brick 73), verbatim, and the libraries it
drove are untouched with their Node tests still running. What ships is the commissioning bench
an engineer would actually meet:

- **The machine** — the same 2R compliant arm every number in this project is quoted on
  (`makePlant`, carried over unchanged: two lattice links, lumped gearboxes with backlash, the
  same servo), on the bench cell **K 0.25 / E 0.03** by default, with K and E sliders. The
  **conventional baseline** is `RobotComp`'s compliance identified at four held poses — the
  denominator the ladder commissions on top of, the ghost's default, and what runs when the
  controller is off. One routine (`calibrateComp`) serves all three, because a baseline
  described twice is two baselines.
- **The program** — square (the bench program), rounded rectangle, or circle, and a
  **feedrate** slider; accel 4e-5 and corner 40 are fixed at the bench values. A change installs
  at the next lap boundary.
- **The ghost, always on** — the machine WITHOUT our tools, drawn semi-transparent underneath
  the live arm together with THE SHAPE IT ACTUALLY CUTS, at true scale, so the gap is the
  picture. Recorded once per plant+program (exact on a machine that repeats to 0.03%), keyed on
  the plant and the SAME program signature the ladder uses, so a ghost from another machine is
  never drawn under this one. **Its control is pinned in the browser: with nothing armed the
  live machine IS the conventional baseline, so the ratio must read ~1, and reads 0.999.**
- **Commission** — one button. The ladder is configured for the one rung this bench is about:
  `classic: false`, `maxDepth: 1` — the cascade commissioned as the distilled model's TEACHER,
  never as a rung that ships — no demo banks — **the distilled model** (`lib/pilot/distil.js`,
  addressed by the commanded reference, **138 MAC/decision, 1.4% of a 1 ms scan**, no solver, no
  forecast bank, no tracker at deploy; it replaces the cascade and the compliance feedforward) — plus **lap learning** (the lap-periodic rung) only when
  the installation declares a periodic application. Every rung is still SCORED on the machine and
  reverted if it does not win; the page decides what is offered, never what is deployed. **Grade**
  (full / fast / demo) buys wall clock with resolution and is printed on the record, because fewer
  pooled laps is a noisier score and the ladder raises its own floor to match. **The arm on
  screen is the arm that is turning, and it is THIS arm** — the ladder BORROWS the bench's
  machine and its identified baseline rather than building a second one, drives it to every
  run's start from wherever the last run ended, and hands it back where the last scored run
  left it (plan §52.12). **The distilled rung's bar is the machine BELOW the cascade**
  (`distil.teacherOnly`, on by the host): the cascade is its teacher and not a candidate to
  ship, so the policy is refused only if it fails to beat the conventional machine, and a
  refused policy WITHDRAWS its teacher rather than leaving a 9,500-MAC solve armed. Measured
  where it differs: at K 0.25 / E 0.005 the policy reads 2.6x over the bare machine and the
  cascade 4.4x, so against the cascade it was refused and the page ran the conventional machine
  under a pill reading "shipped 4.39x" — two defects, one row.
- **The cost, in machine time.** `host.samples()` counts every step the host advanced the
  machine, so at the selected task period it converts to laps the plant spends producing nothing
  — the half of target 4 a wall clock cannot see. Wall clock is shown beside it and labelled as
  the simulator. A fast run's machine time is what THAT run would cost a PLC, and the page says so.
- **The controller, live** — three boxes, none of which recommission, plus a fourth that
  appears only when it applies: the distilled model armed or not (`AutoStack.setArmed`, which
  refuses what was never built); **the pilot cascade**, shown only when it was built and the
  distilled model is not the armed controller — the teacher, at ~9,500 MAC, offered so a plant
  where the policy refused can still be seen corrected, with the scan verdict saying it does not
  fit; **the tracker stays on
  the machine**, which routes the truth into `observe()` so the distilled model keeps learning
  through the SAME streaming recursion the fit used (`DistilPolicy.observe`, paid once per
  DECISION — the pilot's RLS is 72,600 MAC/sample and is why the old composition only fit
  sliced); and **lap learning**, withheld by the library on any program but the one it learned.
  The tracker-stays law is measured for the PILOT and does NOT transfer here by assertion: it
  ships off, and the page scores it a lap either way. The plant's sign for that update is
  DECLARED by the host (`adaptSign: -1` on this arm — truth is actual − commanded and the
  correction adds to the command), never guessed by the block.
- **PLC scan budget** — `auto.cost()` for the armed set at the selected task period, the PEAK
  cycle as the verdict, and the learning update added to the peak when the tracker is on.
- **The last model is kept.** After a commissioning the DEPLOYED object is stored —
  `DistilPolicy.toJSON()` (weights, window, cap, coverage span, and the recursion so learning
  resumes; pinned to restore `actLook` BIT-IDENTICAL), the lap table, the deployed set, the plant,
  the program signature and the machine-time record. On load it is offered back ONLY to the
  machine it was fitted on — sliders and program signature must match — and on any other it is
  reported and NOT armed. Restoring is a deployment through the same host and the same `act()`
  the ladder scored with, never a re-statement of the controller. Replaced by the next
  commissioning. The round trip found the defect it exists for: `±Infinity` speed-span sentinels
  became `null` through JSON and would have restored as a fade that fires everywhere.
- **Score** — the gap against the ghost, quoted on the last COMPLETE lap (mid-lap is a partial
  sum over whichever edge or corner has been cut, and lap 0 carries the start-up transient the
  ghost skips — rules 12, 13), plus contour · lag · total. **The orange trail is the tool's path
  with its error off the program magnified along the normal, and the magnification is a slider
  (×1 to ×20, ×10 by default)** — at a fixed ×10 a soft plant's error swept off the stage and the
  line said nothing; the legend now names what it is. **At ×1 it IS the tool's path, pinned**: it
  used to be reconstructed from the nearest program point, which sticks on a vertex while the tool
  passes a corner and hung a bright spike off every corner of the soft plant's square.

**AND IT NOW DELIVERS THE HARNESS'S NUMBER THROUGH THE ONE PRESS (plan §52.8): 1.0593 →
2.169e-1 on the bench square, 4.88x over the conventional machine and 6.29x over the bare one,
against `test/_distil.mjs`'s 2.134e-1 today — at 47 coefficients per channel, 138 MAC/decision,
1.4% of a 1 ms scan, in 380 s of Node.** Three faults stood between 0.74x and it, each one
variable: the TEACHER (`hff` converges the training prefixes to 2.3-5.1x and stalls; the
commissioned PILOT iterated with the measured error as its free response reaches 10-16x, so the
cascade is now commissioned as the teacher and the distilled policy REPLACES it — and building
that found a record built per step and read per pilot sample, which steered the machine wrong in
both signs); the WINDOW'S UNITS (the harness's offsets are in pilot samples, ±256 = ±2048 steps,
and the port had ±512 raw steps — a quarter of the reach); and the TEACHER'S CAP (a regulariser:
2.0 → 0.363, 0.15 → 0.269, **0.10 → 0.217**, 0.05 → 0.444; a more converged prefix teaches a
worse policy, §49's law from a third knob). Bare beats under-the-feedforward 0.217 to 0.338 with
the good teacher, so the policy replaces the compliance feedforward too. The grade is inert
(full 2.171e-1). One plant, one cell, one seed. **Commissioning is 26.8 → 8.5 machine-minutes
(plan §52.9)**: the active run doubles as the next record (free), two laps per teacher drive
(free), four training programs (4%, inside the band), a 500-step hold (free) — and three passes,
two passes or one lap lose the result, while the cascade's 2.9 minutes are where its `lambda` is
selected, so the floor of this route is about 8 minutes. **And the model survives a plant
change, flagged (plan §52.10)**: move K or E and the page keeps the model armed on the new plant,
re-records the ghost, and names both plants in a PLANT MISMATCH pill, so the degradation is a
number on the score panel rather than a refusal. **And going home is a move (plan §52.11)**: the
arm no longer snaps to the program start after a commissioning, a program change or a Reset — it
is driven there as a feed-limited rapid, drawn every frame, settled by rule 45, with the run
resumed on arrival. **AND THE ARM IS CONTINUOUS EVERYWHERE, NOT ONLY AT HOME (plan §52.12).**
Every remaining teleport is gone: the ladder's per-run snapshot RESTORE (dozens of jumps per
commissioning), the held start before every teacher drive, the calibration poses the baseline
was SET at, and the plant rebuilt at the origin on a K or E change. One planner
(`lib/flexisim/approach.js`) drives every move, the ladder borrows the bench's own arm, a rebuilt
plant takes the WHOLE state of the one it replaces (a joint pose alone left the tool 0.54 away,
because fresh links are straight), and the browser reads the largest tool displacement
between two consecutive SOLVER STEPS — across a Reset, a plant change and a stopped
commissioning — because a per-frame sample cannot tell 600 steps of motion from one jump. The
bench square through the driven host reads 2.2638e-1 against the restore's 2.2635e-1, at 10.7
machine-minutes against 8.5: the approaches are the difference, and the settle is sized to the
run's warmup rather than the eye's (the page's policy would have cost 13.9).

**AND THE TWO LOOPS READ SIDE BY SIDE CLOSED TEN MORE (plan §52.13).** The deploy path handed
every rung the CONTINUOUS step, so on the page the lap table slid 0.4 steps per lap (27 steps by
lap 40, pinned) and the distilled rung's decision phase walked against the one it was fitted at;
online learning fired once per servo step instead of once per decision, nine times the cost and a
row weighting the fit never saw; the ghost was drawn at `k % ceil(lap)` with the same slip; a
ghost made stale mid-lap recorded from where the arm stood; Pause did not pause a recording; a
faded correction read "armed" in silence. All closed and pinned; the scoring itself was read
against the host's expression and is the same quantity. **AND THE HARNESS HAD THE LARGEST ONE
(plan §52.14): the fit skipped the first 2,304 steps of every training lap** — a closed lap
treated as a finite record, its window clamped at a start it does not have, 32% of each program
never a row, and the deployed policy reading wrapped windows at every lap's start that the fit
had never seen. It was in the report all along as `used 538 rows` of 794. With the window closed
the bench square reads **1.9009e-1, 5.57x** (from 2.2638e-1, 4.68x) and the soft plant 3.98x
(from 2.61x), every training program improves, and no constant moved. The harness's own split
also scored the policy at every step where the deployed object holds between decisions, and
leave-one-out measured a different route (hff, stride 1) from the one that ships; both fixed.
**AND BELOW THE LOOPS, THE CASCADE DECIDED ON ONE PHASE, LOOKED AHEAD ON ANOTHER AND SAMPLED
ON A THIRD (plan §52.15):** the look-ahead was snapped to the lap's sample grid while the pilot
decides on its own tick (a "now" up to 8 steps stale), the ring was sampled on the commissioning
step counter that nothing resets at deploy, and the teacher's oracle read its record on the
sample grid rather than at the decision step. All three read the step they are taken at now,
every loop counts continuous time (the 0.4-step seam is gone), and a per-lap re-phase was built,
measured worse on both rungs, and ships off.
**AND THE CONTROL THEORY WAS TAKEN APART ON THE MACHINE (plan §52.16).** Every structural
candidate was built as a knob and measured: a Q-filter on the teacher (inert), the teacher's cap
(a regulariser — a more faithful teacher is worse, 5.65x → 4.35x at 0.20), parametric
basis-function ILC (built; cap-insensitive at R² 0.98 and WORSE at 5.06x), the physics term kept
underneath (3.91x), rows at every step (inert), and a TOUR diet with a window that reaches the
plant's memory (5.63x / 5.01x / 5.14x at x1 / x2 / x3 — the reach is not what binds, which
retires rule 37 as the explanation). On its own diet the policy reaches 5-7x under every one of
them while the prefix reaches 9-11x: the ceiling is what a linear map of the reference can
EXPRESS. What moved it was the REGRESSOR — the rigid-body reference torques beside the angles,
since wind-up and link bend are linear in torque and not in angle — **1.7528e-1, 6.04x on the
bench square** (93 features, 274 MAC/decision, 2.7% of a scan), 3.98x on the soft cell, with the
ridge scaled to the rows (1e-3). Two things found underneath and not fixed: the streaming fit
returns weights 30-150x the batch fit's on an exactly linear target and refuses rows the batch
route deploys; and the cascade is stable on this arm because of its backlash — with the dead-zone
removed it reads 0.17x past its own verify. Bench square today: **1.7528e-1, 6.04x**.

**ITS FIRST READING WAS A REFUSAL, WHICH WAS THE PAGE DOING ITS JOB (plan §52.7).** Distil-only
ladder on the bench square: `②d distilled — REFUSED` at 0.22x (demo), 0.43x (fast, browser),
0.74x (fast, Node, after the rung got a derived authority). The training runs converged
(1.7–5.8x), the fit vouched for itself, and the machine refused it. `test/pilot/distil-arm.mjs`
splits the cause: the policy helps EVERY one of its six training programs (1.40–2.91x) and harms
the square — TRANSFER, not the fit and not the deploy path, since a sign, units or window fault
would harm the training programs too. The ladder route with real `hff` prefixes does not yet
reproduce §49's oracle-converged 4.99x — and full grade is WORSE (0.17x) while its prefixes
converge further and its fit R² rises, so a more converged prefix is a WORSE teacher — and the
knob is the SCORING GRADE, not the pass count: `PASSES` 4, 8, 16 and 24 at fast grade read 0.75x /
0.74x / 0.74x / 0.74x with 8, 16 and 24 byte-identical, because `_refine` stops itself once four passes in a
row fall inside 2 sigma of the host's lap spread, and full grade changes that sigma (4 scoring
laps against 2) rather than the ceiling — full grade at 8 passes reads 0.18x, reproducing the
24-pass 0.17x with the passes held, so both halves are measured. **AND THE REFUSAL WAS THE DIET: the host converged the rung on
`designDemoPaths()` at its defaults, which is the `demo` diet §49's harness had already measured
at 0.22x-1.09x on this square (feed laddered at r 2.2-3.8, confounding feed with scale). At the
programs' own scale and one feed — §49's 4.99x diet, now `distilDiet` — the rung DEPLOYS through
the one press at 1.36x** (1.0593e+0 → 7.7912e-1, 6/6 runs kept, 41,137 rows, 234 MAC/decision,
every training program improved 1.53x-2.70x, 163 machine-minutes at fast grade). The gap to 4.99x
is three unmoved variables: `hff`'s band-limited prefix against the oracle-QP iteration, authority
2.0, and the fast grade. Leave-one-out over the six training
programs reads a geometric **1.11x on the held-out polygon** against ~2.0x in-sample — the route
memorises its diet and carries to nothing it was not fitted on, not even its own class, so the
square's corners are not the specific fault. **The other option works: declared
periodic, lap learning deploys at 4.56x on the square through the same ladder** (59 laps, fast
grade), with the distil rung reproduced byte-identical beside it as the control. Nothing harmful
shipped, the conventional baseline runs, and the cost record says what each refusal cost.

**WHAT IS NOT ON THE PAGE, AND WHY.** The conventional rung, the pilot model layers, the corner
banks and the compiled twin all still exist in `lib/` with their tests, and none of them is
offered here: the distilled model REPLACES the pilot rather than sitting under it (0.96x–1.30x
stacked), depth ≥ 2 was retired for commissioning time, and the twin compiles per program. The
browser checks are WIRING and INSTRUMENTS, deliberately not performance: the numbers belong in
Node where the plant is stated.

### Libraries

| Directory | What it is |
|---|---|
| `lib/lattsim/` | The general lattice engine — lattice, fields, materials, operators (`lbm`, `scalar`, `elastic`, `frame`), solver, WebGPU + CPU backends, renderers. Named `lattsim` deliberately: it is not the fluid page. |
| `lib/ngrc/` | The TC_NGRC port, with golden-vector parity tests. |
| `lib/probesense/` | Soft-sensing a field from one point in it. Fed numbers; knows no physics. |
| `lib/flexisim/` | `joint`, `link`, `arm`, `arm2r`, `armnr` (recursive Newton–Euler), `tipsensor`, `chainsensor`, `compliance`, `compensator`, plus contouring: `toolpath` (geometry + feedrate profile), `contour` (the metrics), `pathilc` (learning over laps). |
| `lib/blackbox/` | A controller given nothing about the plant, plus `qp.js`. Imports nothing from `lib/flexisim/` — the boundary is the directory. Verified on three plants sharing no physics. |
| `lib/pilot/hff.js` | **HARMONIC FEEDFORWARD, and the module that made the method plant-agnostic (brick 67).** A repeating program has a repeating error, so invert the machine at the lap's own harmonics: probe, solve, and take a damped Newton step against a FROZEN operator. It carries NO per-plant constant. The harmonic COUNT is gone (the arm's 16 is where THAT channel dies; the servo axis is flat to h≈128 and the same 16 costs 33x there); the STEP backtracks (1.0 converges the axis on pass one and diverges the arm); and the PROBE DESIGN AND AMPLITUDE are chosen by commissioning four candidates and SCORING THEM ON THE MACHINE, because the fit ranks them backwards — on the axis the best-fitting candidate is the worst controller, and on the arm a 25%→10% probe is worth 3.1x while its residual moves the wrong way. Each harmonic's step is shrunk by CONFIDENCE (its own fit residual) and REACH (min(1,\|G\|), load-bearing: removed, the arm goes 4.81x → 1.05x; on the axis inert to four figures). |
| `lib/pilot/distil.js` | **THE DISTILLED ITERATION, SHIPPED (plan §49).** Iteration converges to a correction indexed by LAP PHASE, which is worth less than nothing on a trajectory the machine has not run — measured at 0.53x-0.55x by three independent routes, one a textbook norm-optimal ILC. This regresses that converged correction onto a local window of the COMMANDED reference and deploys the regression: one weight vector per channel, no QP, no forecast bank, no tracker, no lap index, no per-plant constant, 330 MAC/decision at 111 features. The window MUST STRADDLE NOW and it refuses otherwise, because the matched control — same features, same span, same spacing, translated so no tap lies in the future — reads 0.89x against 1.43x. The fit STREAMS (`online`), one shared-covariance update per row at 2n²+nc·n and O(n²) state, validated PREQUENTIALLY. Its capacity gate is a pre-filter and says so: on a pure-noise target it still deploys about one commissioning in twelve, and the decision is a machine-scored verify. |
| `lib/pilot/stack.js` | **A CASCADE OF PILOTS, wired to the page as ⑤/⑥'s Cascade depth slider (brick 59).** Layer k is an ordinary Pilot commissioned with layers 1..k−1 deployed and FROZEN, so each models what the one below it left; a layer that cannot vouch for itself ends the stack, and the summed correction is clamped ONCE at the engineer's cap. Every layer above the first is PINNED to the first's cadence — one host, one look-ahead closure, one meaning for `act(off)` — and chooses its own Ts, horizon, lags, ridge and basis on top of it. |
| `lib/pilot/autostack.js` | **On the softest 2R arm it now ships 22.42×, past the composite's re-measured 20.34× for that program (brick 76).** Getting there was four measurement repairs and two model changes: the rung reads the WHOLE tool error in JOINT space (narrowing it to the contour component cost half the benefit — the projection onto a rotating normal is itself a lap-varying operator); the floor is the MEDIAN of reported spreads, not the max, which was biased 3.9× high and refused improvements the machine could produce; the ceiling is measured on the CASCADE-DEPLOYED machine (3.44e-3 at nh 16) rather than the bare one; and every field the report prints from is asserted to exist, after six diagnostics in one day rendered a missing field as a plausible number. It also detects a PHASE WALK — a pilot cadence that does not divide the lap makes its phase walk, which is a beat at a half-integer harmonic the rung cannot represent; on the arm, cadence 9 against lap 7357 gave autocorrelation −0.764, and indexing from the lap start took it to −0.135 and the ladder from 20.70× to 22.42×. That last is measured on ONE plant: no other of the six deploys both rungs, so it is not yet a general claim. |
| `lib/pilot/autostack.js` | **ONE BUTTON, and the answer it comes to is not the one this project would have predicted (brick 68).** Told the channels' maxes, the correction authority, what the instrument can RESOLVE, and optionally that the program repeats. Works out for itself: its timescale, whether each rung pays, how deep to cascade, and which prefix of the ladder to ship — every one by measuring on the machine. Order is conventional → pilot → harmonic and is not symmetric (the reverse measured 0.71×). On the EMPS axis it ships the CONVENTIONAL rung alone at 425× and refuses the other two: the pilot at 0.39× because the rung below already removed the velocity lag that is its whole benefit there, and the harmonic rung — which scored 25× better — because BOTH sides are below the rig's 1.6 µm fidelity and it declines to credit what its instrument cannot see. A first version without that floor reported **4254×**, which was the simulator. |
| `lib/pilot/classic.js` | **THE CONVENTIONAL LAYER, SELF-TUNED — and the best single rung on a real machine.** `[a, v, sign v, 1]` fitted ON the machine with the same probe → frozen-operator Newton → backtracking → monotone-guard machinery `hff.js` uses; only the BASIS differs, which is why they compose. EMPS: 0.5764 → 0.0014 mm, **425× in 14 laps**, past the inverse-dynamics feedforward at the PUBLISHED M/Fv/Fc/OF (275×). **And the coefficient is checkable:** the dominant one is 0.797 mm against the position loop's own vPeak/kp = 0.778 mm — it found the loop's lag term from data to 2.4%. **It is a MODEL, not a memory:** on a two-tone sine the axis has never run it is worth 169.8× evaluated live, while the IDENTICAL signal replayed as a lap table is 0.53× — worse than nothing, independently reproducing brick 56's 0.55× for a phase-indexed ILC table by another route. |
| `lib/pilot/hff.js` | **The lap-periodic rung, and on the arm it now ships a BANDED operator (bricks 72-76).** A correction at harmonic h moves the error at h±1, so the harmonics are identified and inverted TOGETHER rather than one at a time. Measured on probes it had never seen, a banded operator predicts this machine 40% better than a diagonal one (15.6% → 9.4%), and the advantage TRANSFERS to a program it was not fitted on (0.61 there against 0.60 at home) — so the operator is a plant model even though the table it builds is a memory. `exportOperator()` hands it on: a second program of the same lap pays for refinement only, 32 laps → 10. Neither shipped probe design could identify it — both hold the phase RELATIONSHIP between harmonics fixed, so the banded design matrix is collinear at ANY probe count, which is why brick 63's block-tridiagonal solve measured neutral twice over. Banded gets its own random-phase design and 3·mm+4 probes. Default OFF in the library and ON in the arm harness: it triples identification cost and only this arm's operator has been measured as banded. |
| `lib/pilot/pilot.js` — `verifyRef` | **A REPRESENTATIVE PROGRAM FOR THE DEPLOY DECISION ONLY, and the repair for a gate that was scoring trajectories nobody runs.** The fit stays program-agnostic — it is still identified from a scribble — while the verify may also score one program the engineer supplies, clamped into their own box. Measured on the QUADRUPLE TANK it makes the gate RANK — the representative regime reads 0.50, 0.54, 0.88, 1.27, 1.58 against delivered 0.424x, 0.820x, 1.248x, 1.512x, 1.775x, monotone in all five, **correlation 0.989 against the old gate's -0.057** — so 3 of 8 seeds deploy and **all three help**, with the minimum across every seed at 1.000x because a refusal applies nothing. On Wood–Berry it turns 9 harmful deployments out of 12 into 12 refusals, which is what that plant's own numbers say is correct; measured on EMPS it is **byte-identical** (0.0412 mm, 14.0x), which is the control that says the gate was repaired rather than merely tightened. **Now on all six.** Arm byte-identical with the regime asserted to have RUN (`scribble + program + representative`, 6.18x unchanged — rule 61, since identical numbers are a control only if the regime built); mill's HOLD reads 0.61x beside scribble 0.63x and program 0.57x, so its refusal is independently confirmed and the tracking-vs-regulation hypothesis is dead; and the BARREL is scored for the first time ever — representative **0.22x** refusing what the program regime's 1.10x would have deployed. Two harmful deployments prevented, one refusal confirmed, one plant scored at last, and nothing lost. The cost is real: the reference is a new thing the engineer must supply, against "wire it up and press one button". It was the tank that decided whether it RANKS or only refuses harder, because there — unlike Wood–Berry — refusing everything would be wrong. |
| `lib/pilot/` | **The deploy gate is OPT-IN (`autoRefuse`, default false): the verify is measured and REPORTED but does not veto unless asked; `report.wouldRefuse` carries the reason it would have given.** **AND THE FORECAST GATE READS THE FIRST LEAD THE CORRECTION CAN MOVE.** `hGrid[l]` is the response of the truth at lead `l` to a decision made now, so a lead where it is zero is one the QP has no authority over at any lambda or iteration count — how well it is forecast cannot bear on whether the channel is armed. It advances only where `deadTime` was declared, and that condition is a correctness requirement rather than caution: `hGrid[0]` is structurally zero on EVERY plant, since at `m = 0` every lag in the ZOH triangle is negative, so an unconditional rule would move the gate to lead 1 on all six and the byte-identity would be luck rather than construction. `report.readouts[].gateLead` and `.deadHorizon` state which lead was read and whether the horizon is entirely inside the declared delay — the second is a horizon the engineer can lengthen, not a forecast failure, and reporting it as one sent the mill's diagnosis to the wrong cabinet for three sessions. Route–limit–run–deploy: settle → probe → excite → fit → verify → deploy-or-refuse, on a receding-horizon box-constrained QP. The verify scores two regimes — a filtered-noise scribble and a trapezoid PROGRAM — and gates on the worse. Imports only `../blackbox/qp.js`. |

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
