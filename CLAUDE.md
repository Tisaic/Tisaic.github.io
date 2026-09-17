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
| Completely self-tuning | **SUPPORTED** | No per-plant constants; every threshold re-derived from measurement; and it REFUSES with a stated reason, asserted to be right for the right reason. Rare, and the strongest thing here. **AND THE MECHANISM IS THE LADDER, NOT THE PILOT'S GATE, WHICH THIS ROW USED TO CONFLATE (plan §54.5).** `autoRefuse` defaults to FALSE and the shipped arm host passes it FALSE explicitly, so the product's refusals come from `AutoStack` scoring every rung ON THE MACHINE and calling `h.revert()` — a measured verdict, not a model-scored gate. The gate is what the six bare-`Pilot` plant tests use, and every one of them passes `autoRefuse: true`. Two mechanisms, both real; the claim is about the first. |
| Robust and tolerant | **CONTRADICTED ON TWO PLANTS: EVERY DEPLOYMENT HARMS THE MACHINE — AND SUPPORTED ON THREE** | Every plant's number is one commissioning DRAW and only now measured across seeds (`test/pilot/spread.mjs`). The three plants that win are repeatable — EMPS 1.05x spread over 8 seeds, the arm 1.13x over 6, and the COLD MILL 1.07x over 8 with **every one of the eight deploying and every one helping**, which no other plant here manages — and the two that do not are draws of 2.2x and 4.2x, so the failures differ in KIND and not only in size. Split by whether the pilot acted: on **Wood–Berry 9 of 12 seeds deploy and ALL NINE are worse than the 3 that refuse** (median 64.65 against 43.90); on the **tank at the old defaults 4 of 8 deploy and ALL FOUR hurt** (median 0.675x). Two plants sharing no physics, same shape: the refusals are the good outcomes. **AND THERE IS NOW A THIRD CONTRADICTION AND IT IS ABOUT PROGRAMS RATHER THAN SEEDS (plan §88.3): on the REAL FLEXIBLE ARM the object that SHIPS — the conventional rung, at 1.93x on the program it was commissioned on — makes a SHARPER-EDGED program of the same family WORSE at 0.877x.** It is the first target-1 *none made worse* failure in this project, it was bisected before it was named (the shape, not the amplitude: amplitude alone still helps at 1.152x and a SOFTER edge reads 2.825x), and it is the one plant here whose modes decay 1.03x per cycle. The deployed object has a speed-coverage guard that FADES outside the span it was fitted over; `classic.js` has no analogue and extrapolates silently. **AND THAT WHOLE ROW IS ABOUT THE TEACHER, WHICH `spread.mjs` SCORES — THE DEPLOYED OBJECT'S OWN DISTRIBUTIONS ARE TIGHT ON EVERY PLANT THEY HAVE BEEN TAKEN ON (plan §84.8, §87.3).** Six DIET draws each, the diet being the random variable because these rigs are deterministic and a seed moves nothing: **column 6/6 deploy and help (1.53x), barrel 6/6 (1.66x), cart-pole 6/6 (1.03x — the tightest here), real cascaded tanks 6/6 (1.05x)**, and the two plants that refuse refuse on all six draws. Nothing is made worse on any draw of any plant. So the contradiction this row records belongs to `pilot.js`'s gate on two plants, and the object that ships has not reproduced it anywhere. |
| Reusable across plants | **8 OF 10 PLANTS ASKED SHIP THE DEPLOYED OBJECT, AND ZERO SHIP THE PILOT CASCADE (plan §86.7)** | Arm, EMPS and now the COLD MILL win and are repeatable across seeds (1.13x, 1.05x, 1.07x). The mill is the strongest of the three by repeatability — **8 of 8 seeds deploy, 8 of 8 help**, 10.17-10.88 µm rms against an open loop of 15.15, worst draw 1.39x and best 1.49x, and the worst draw still beats both classical AGCs — and it is the only win that is not mechanical compliance: a linear plant whose dominant error is an exogenous periodic disturbance arriving through a 100-step transport delay. It had refused since it was built, at 0.42x then 0.61x then neutral. Two measurement repairs, no controller change: the delay is DECLARED (the probe cannot recover it — a dead time and a slow rise move the 90% crossing identically) and the forecast gate now reads the first lead the correction can actually move, instead of lead 0 where `hGrid` is zero by construction and R² was 0.044 against 0.868 at the first live lead. The other four were quoted from single draws and are not: Wood–Berry deploys on 9 of 12 seeds and **all nine are worse than the 3 that refuse**, while the plant WITHOUT the pilot (43.90) already beats the published BLT (51.95); the tank's 1.32x is one draw from a distribution that deployed 4 harmful controllers in 8. **A representative program at the verify fixes both** — Wood–Berry refuses all 12, the tank deploys 3 of 8 and all three help (median 1.512x, nothing made worse, gate correlation 0.989 against -0.057) — and leaves EMPS byte-identical. All six now run that way; the barrel's representative regime reads 0.22x and refuses what its program regime's 1.10x would have deployed. **AND THE WHOLE ROW IS ABOUT `pilot.js`, WHICH UNDER THE RETIREMENT IS THE TEACHER AND NOT THE PRODUCT.** The deployed artefact is `distil.js`'s weight vector — `inventory.test.mjs` classifies it, `deploy.js` reimplements it, `artefact.test.mjs` pins the two bit-identical — and `distil.js` is imported by exactly TWO plant harnesses, the arm and EMPS. Every other plant here scores the teacher. **AND THE COUNT WAS 6 OF THE 6 PLANTS ASKED AT THAT TIME, WITH ONE FACTOR RETRACTED (plan §64, §66, §71, §72) — SUPERSEDED BY §86.7's SCRAPE AT THE END OF THIS ROW.** Every plant the deployed object has been offered to now deploys it: arm, EMPS, the COLUMN at **3.643x** (beating the published BLT in both scoring conventions, closing target 7's standing clause), the COLD MILL at **1.450x** (§71, by declaring its roll phase — withheld, the object is provably inert at exactly 1.000x), the TANK at **3.268x** with a held-out production recipe at 2.657x (§70, §72, §79.3 — its ridge was the arm's `1e-6` carried over, and choosing it by scoring candidates ON THE MACHINE turned 0.08x into a win; then a third machine-scored axis, the APPLIED GAIN, took 2.593x to 3.268x — and it was read as the ONE plant of five with a gain deficit, the mill, column, barrel and arm all picking 1.0 — RETRACTED by §84.6, where 1.0 was the grid's own top and three of those four picks were EDGES, and again by §86.6, where the bottom at 0.72 was an edge for three more plants), and the BARREL at **3.951x**, replacing a 21,440-MAC cascade with 1.6 kB. None was converted by changing the controller; every one was an INSTRUMENT, a DIET or a carried constant. **THE BARREL'S FIGURE IS A RETRACTION AND IT IS THIS ROW'S MOST USEFUL LINE (plan §72.18).** It stood at 10.61x, measured with the plant REBUILT before every teacher call — and `ambient(k)` reads the plant's own step counter, so a rebuild reset the unmeasured drift to k = 0 and every call saw the identical disturbance. A lap-periodic teacher can invert a disturbance that repeats exactly and cannot invert one that does not, and 20,000 steps is a whole number of neither 9,300 nor 4,100: the harness was quietly making an aperiodic disturbance periodic. The falsifier is decisive — carried with the drift held flat the teacher recovers to 10.9-13.2x and the rung reads 14.949x against 3.951x with it — so a real barrel's room temperature, not phase-locked to a five-hour recipe cycle, costs a factor of three — **and §80.6 retracts the MECHANISM while the number stands: that drift is 0.9% of the open-loop error and the engineer's own feedforward recovers 1.008x from declaring it, so the factor is TEACHER CORRUPTION by a lap-incommensurate component and not a disturbance left uncorrected.** **AND THE COUNT IS NOW A SCRAPE RATHER THAN A SENTENCE, AND IT READS 8 OF 10 (plan §86).** `objtable.mjs` runs every plant's OWN harness in a child process and reads its own printed line, because a count nobody can re-derive is a preference (rule 30) and this row's own history is the argument: it has been edited by hand through four sections and was wrong in both directions. The four plants that had only ever been asked the TEACHER were asked the object: the **CART-POLE deploys at 11.93x** on its shipped loop and the ladder still ships **9.24x** on one tuned 3.5x better (§86.2), the **REAL CASCADED TANKS at 8.69x in 8 MAC/cycle against the pilot cascade's 8.00x at 43,673** (§86.4), the **REAL FLEXIBLE ARM refuses seven ways** with the map provably unable to express its correction (§86.3), and the **REAL STEAM EXCHANGER refuses at 0.045x** because a four-coefficient rung has already taken 89.8x and left nothing (§86.5). So of eleven rows over ten distinct plants, eight ship the deployed object, three ship the conventional rung, **NONE ships the pilot cascade** — it was the result on the real tanks until §86.4 — and none is made worse. **AND "SHIPS NOWHERE" IS NOT "IS REMOVABLE", WHICH §90.2 ESTABLISHED BY BUILDING THE THING THAT WOULD HAVE REPLACED IT.** The obvious reading of a 4,534-line component that ships on zero of ten plants is that a from-scratch build would not write it. The opposite is true: **the INCREMENT GENERATOR IS THE CASCADE.** `_iteratePolicy` iterates a policy, and what produces each pass's increment is a commissioned `Stack` with its `oracleF0` port armed — there is no other object here that turns *the measured error at this decision* into *the command correction that cancels it*. So the lap-free teacher, which is the largest item on the from-scratch list and the one that lifts the DIS ceiling and takes 17% off the mill's commissioning, is built ON the component it was natural to propose deleting. It arrived as a measurement rather than an argument: the first mill run under `PARAM=1` returned an increment of exactly zero because that plant runs `depth: 0`. **What changes is the classification and not the code** — COMMISSION-only machinery that must never ship, which `inventory.test.mjs` already has the category for — and the open question is whether a CHEAPER increment generator exists, since the cascade is commissioned in full to be used for one thing. |
| PLC memory and CPU | **MET ON THE ARM — 6,178 MAC/CYCLE, 62% OF BUDGET, AND IT DELIVERS BETTER THAN THE PATH THAT MISSES BY 7.4x** | Memory was never the problem and is now smaller again: the forecast bank is ONE model for every lead, not one per lead — 727 kB of covariance to 10.7 kB, deployed bytes 25.4 kB to 6.0 kB, fit memory 30.4 kB to 11.0 kB — and it is BETTER on both plants that deploy (EMPS 12.70x → 14.69x, arm model-only 7.8154e-2 → 7.4340e-2) — **and the QUADRUPLE TANK now REFUSES at 0.08x where it deployed at 1.32x — but the result it lost was never reproducible.** `tanks.test.mjs` FAILED 6 checks when this was written and is GREEN today (plan §54.2) — the repair was `verifyRef`, which made the gate RANK rather than the lead count, exactly as the fix below says it had to be; it passed at `c24bede`, and the deploy was lost at `20de1b7` (nine leads built instead of every lead), confirmed by reversal: raise `LEAD_SAMPLES` and it deploys again. Then the fix refused to behave like one — 9 refuses, 16 refuses, **24 DEPLOYS at 1.28x**, 32 refuses — and at the last PASSING commit, changing only the commissioning seed, the tank passes at two offsets and fails five checks at a third. So the shared fit did not break a solid measurement; it moved a marginal one across a threshold it was already sitting on, and the 1.32x in the six-plant line is a coin rather than a controller result. The fix is to make the tank's own score reproducible across seeds BEFORE deriving any constant against it — tuning a lead count until it goes green is fitting to a coin flip (rules 3, 31). Three other explanations were killed by measurement: `qpIters`, forecast gating (R² 0.93-0.99 at every lead, nothing gated — rule 16), and my own working changes. The fit is `lib/pilot/rls.js`: shared-covariance RLS, seeded from the commissioning posterior, gated at 4.6e-10% against the batch solver it replaces. **The deployed arithmetic is now met too, and by the six-plant pass rather than by a projection.** What shipped was 42,914 MAC/cycle on EMPS, 429% of 10% of a 1 ms scan. `test/pilot/sixplant.mjs` swept `qpIters` and `horizonTs` across all six plants at once — the first such pass this project has run — and rule 42's band picked 2 iterations at 1.2·Tset: **9,517 MAC/cycle, 95% of budget**, with EMPS 4.8% down and the arm 3.1% (both inside the band) while Wood-Berry improves 4.7% and the mill's verify climbs 23%. The earlier projected corner reached 101% and gave up 13% of the delivery; this reaches 95% and gives up 4.8%, because that projection held the fit mode fixed and the knobs are not separable. **It was made the default and then REVERTED**: the arm's ladder ships BETTER there (23.15x against 22.42x) while `autostack.test.mjs`'s contract — on the MODEL-ONLY stack, which is what survives the memory's retirement — goes 8.5e-2 to 9.14e-2 and red, and EMPS' cascade drops to two layers. The pass measured six plants' HEADLINES while the contracts sat one level down, which is the same fault it was built to close. The corner stays available through `setSolverDefaults` and is not imposed (rule 31). The pass also found a NaN no check could see: `pilot.N` set beyond the fitted bank reads unfitted leads and returns NaN, which passes every bounds test — now clamped and reported. And on six plants only two deploy, so this is two plants with four negative controls. |
| Linear AND nonlinear alike | **STILL CONTRADICTED, BUT NO LONGER ONE ERROR CLASS** | The ordering by nonlinearity is no longer wrong at the T⁴ end — **the BARREL now deploys at 3.951x** (plan §66, retracted from 10.61x by §72.18: the old figure came from a harness that rebuilt the plant each teacher call and so phase-locked an unmeasured drift) — and the TANK, at √h, deploys at **2.591x** once its ridge is chosen by the machine rather than carried from the arm (plan §70, §72). **WOOD–BERRY IS NO LONGER THE COUNTEREXAMPLE**: the DEPLOYED object beats doing nothing AND the published BLT in both scoring conventions (plan §64), where the pilot cascade it used to be measured through delivers 0.39x. What changed is the middle: the COLD MILL is a linear plant with a dominant transport delay and a periodic exogenous disturbance, and it now wins 1.45x median across 8 of 8 seeds, past the gaugemeter AGC that AMPLIFIES its dominant disturbance by 3/2. So the honest description is no longer "one error class" — it is two: mechanical compliance and friction (arm, EMPS), and periodic disturbance rejection through a declared dead time (mill). **AND THE CART-POLE IS A FOURTH ERROR CLASS AND THE FIRST UNSTABLE ONE (plan §86.2)**: a nonlinear open-loop-unstable plant, scored on a tip the stabiliser does not regulate, deploying the object at 11.93x and still improving 9.24x on a loop tuned 3.5x better. So the honest count is four classes of four tried — mechanical compliance and friction, periodic disturbance rejection through a declared dead time, setpoint sequencing on a radiating plant, and reference correction on an unstable one — and the one place it cannot reach is a plant whose ring decays 1.03x per cycle (§86.3). Three of six is still not "alike", and what changed on Wood–Berry is the OBJECT rather than the plant: declaring its delay is inert (0.3%), its horizon is inert from N 71 to N 236, and arming the off-diagonal solve is worth 1.74x and still refuses — the win comes from replacing the cascade with the deployed map entirely (plan §62.4, §64). |

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
with the numbers rather than shown by them.
**AND THE CHEAPER TRUTH IS NOW MEASURED, WHICH IS THE THING THAT ACTUALLY PRICES THE CLAIM (plan
§52.42). THE TRACKER IS WORTH 3.9x OVER THE BEST PERMANENTLY-MOUNTED ALTERNATIVE AND THE FREE ONE
IS WORTH NOTHING AT ALL.** The cheap falsifier ran first (rule 1): against the tool error in the
joint frame the teacher corrects in, **the MOTOR ENCODERS ARE WORTH NOTHING AND THE REASON IS SCALE,
NOT SIGN** — on the bare machine the encoder-side error is **0.7% and 2.7% of the tool error's rms**,
because the position loop tracks its own encoder almost perfectly and essentially the whole tool
error is downstream of it; the residual column says the instrument does not see 98-100% of what a
teacher would have to invert. On the CONVENTIONAL machine its signal is larger (0.39, 0.28 of the
tracker) and ANTI-correlated (−0.24, −0.55), which is the compliance feedforward and not the error.
**The first draft of that table was wrong and so was the mechanism it supported** — it projected onto
the transverse LEVER where the host uses the Jacobian inverse, read −0.81 and −0.69, and concluded
"it is the plant, not the compensation", which the corrected projection reverses (rules 17, 47, 61).
Then the machine was asked (rule 16), with `distilTruth` degrading what the TEACHER may measure — the oracle
record, the prefix's convergence AND its monotone gate — while the delivered number stays on the
tracker so that what is read is a cheap teacher and not a cheap scoreboard (rule 15): the tracker
ships the policy at **6.63x**; encoders plus WIND-UP readings, a permanently mounted instrument set,
at **1.72x**; and encoders ALONE cannot improve a single training program — all four dropped by the
rung's own gate at exactly 1.00x, nothing fitted, nothing deployed, the ladder falling back to the
cascade at 1.34x. That last is the gate producing the right refusal unprompted from an instrument
reading the wrong sign. The wind-up instrument sees 52% of channel 0 (corr 0.97) and 16% of channel 1
(corr 0.71) before any fit, which is the size of the result it produced; the rest is link bend, and
a wind-up reading cannot see it. The
`tracker` control is byte-identical to the shipped default, which is what says the knob measured
something rather than moved it (rule 21).
**AND THE INSTRUMENT A SHOP ACTUALLY OWNS IS NOW MEASURED, AND IT IS THE BEST NEWS IN THIS SECTION:
SIXTY-FOUR TOUCHES PER PART BUY WHAT A LASER TRACKER BUYS (plan §74).** The three modes above vary
WHAT is measured and leave WHEN alone — every one of them reads the machine at each sample of each
lap, which is a tracker's property and not a probe's. `distilProbePts: K` lets the teacher read the
truth at K evenly spaced points of the lap and NOWHERE ELSE, degrading both halves because a probe
degrades both: the RECORD the oracle inverts is those K points interpolated around the closed lap,
and the SCORE its monotone gate reads is their rms alone. Delivered on the bench square:

```
    8 points  1.51x  (0.23x of the tracker)      64 points  6.67x  (1.006x)
   16 points  4.86x  (0.73x)                    128 points  6.63x  (0.999x)
   32 points  6.52x  (0.98x)                    tracker     6.63x   the control, reproduced exactly
```

**The ladder SATURATES at 64 and is within 2% at 32, and the knee reproduces**: over three
commissioning draws the ratios read 0.729-0.733 at 16 points, 0.978-0.983 at 32 and 1.006-1.009 at
64 — every row inside 0.6% of itself. Said in the same breath, because it limits the claim: the
SEED barely moves this configuration at all (draws 2 and 3 agree to four figures), since it sets
the cascade's excitation and the teacher replaces exactly that through `oracleF0` — §52.29's
bit-identical finding showing through. So those are three draws of one thing, not three
independent commissionings, and a real spread needs the diet or the plant to move. The arm's lap is 7,356 machine steps, so
that is one touch per 115 steps — a two-to-three-minute on-machine inspection routine, the thing a
shop already runs on a first article, against a metrology service and machine downtime. **The mechanism I proposed for it is REFUTED by its own falsifier**: a sampling
rate against the PLANT'S timescales predicts that a slower plant needs fewer touches, and at an
eight-times slower servo loop the ratios read 0.649 / 0.969 / 0.997 at 16 / 32 / 64 against the
shipped cell's 0.733 / 0.983 / 1.006 — **the slower plant needs MORE**. What survives is the SHAPE,
a knee at 32 and saturation at 64 on two cells eight times apart in bandwidth, which makes the
count a property of the MAP and its window rather than of the plant — so the shop's number reads
"sixty-four touches, whatever the part" rather than "one per N millimetres". **And the FEED test — the other half — was BUILT and cannot be asked on this plant**, which is a
stronger statement than "not run": `DIETFEED` scales the training feeds with the plant held (unset
byte-identical), and at half feed the diet REFUSES at 0.75x with nothing for the probe to degrade,
while at double feed it delivers only 1.65x and the ladder is NON-MONOTONE with **16 points beating
the tracker** — §50.1's own established signature arriving in a column too small to separate from
it. The lap-length axis is confounded with diet quality here; what would answer it is a plant whose
diet is insensitive to its own feed. NOT CLAIMED: the points are evenly spaced in lap phase where a real routine touches
features, the reading is exact at the points taken, and it is one plant, one cell, one seed.

**AND IT IS AUDITABLE BUT NOT INTERPRETABLE, WHICH ARE DIFFERENT PROPERTIES AND WERE BEING
CONFLATED (plan §76).** The record IS the controller — `deploy.js` reimplements the act path in 117
lines importing nothing and `artefact.test.mjs` pins the two BIT-IDENTICAL over 4,000 windows — so
an engineer can audit exactly what will run. That is not the same as being able to read it.
Regressed on the four names an engineer owns (acceleration, velocity, direction of travel, bias) at
a ladder of leads, the applied correction leaves **78.8% of its rms unexplained on the better
channel and 93.2% on the other**. The one thing it does hand over is physical and checkable: the
explainable part is not evaluated NOW — R² climbs from 0.033 at lead 0 to 0.298 at **+512 raw
steps** and falls away past it, which is about one plant rise-time early (§52.28 measures 509 steps
at the nearest bandwidth below the shipped loop), and is §49.14's preview finding arriving through
an instrument sharing none of its machinery. So "it acts about one rise-time early, with this much
velocity term" is a sentence a commissioning engineer can argue with, and four fifths of the signal
still has no name.

**AND TWO OF ITS GROSS PROPERTIES ARE READABLE OFF THE RECORD WITH NO MACHINE RUN AND NO FIT
(plan §76.5).** `_rowFrom` leads with the absolute reference and follows with DIFFERENCES from it,
so the stored weights ARE an FIR kernel once those are folded back, and it answers the two questions
an engineer asks first. **It will not shift a held pose** — the kernel's DC sum is 1% and 0.1% of
its channels' peak taps, so at a constant commanded position it applies about a hundredth of what it
applies in motion. **And its peak tap is at +512 raw steps**, which is the SAME number the
regression above found from four classical columns by a route sharing no arithmetic (rule 15) — then
the kernel CORRECTS that regression where it was noise, putting channel 1's peaks at +0 and +256
where the regression's near-zero R² had reported a negative lead. The instrument with nothing fitted
in it is what settles it.

**AND COMPUTE TIME IS NOT COMMISSIONING TIME.** The "2 minutes on the arm" is wall clock for the
ladder. The distillation route needs iteration converged on about six training programs, which is
laps on real hardware producing nothing. A number that counts only the arithmetic is measuring
the half that is free.

**Anything the commissioning did not see, breaks it — AND THAT SENTENCE IS NOW HALF RETRACTED,
BY THE AXIS IT NEVER MEASURED (plan §75).** It named three things a customer changes — the
feedrate, the plant, the path — and cited evidence for two: the composite measures 4.9x to 20.3x
across five programs and on one of them makes the machine WORSE, and a phase-indexed table worth
125x at home reaches 0.55x on a sine. **Both of those are the RETIRED MEMORY**, and the PLANT
itself had never been measured at all — a memory-era sentence kept alive three sections after the
memory went (rule 4, in the direction this file warns about).

**AND THE PATH AXIS IS NOW MEASURED FOR THE DEPLOYED OBJECT ON EIGHT PLANTS, WHICH IS THE HALF
THIS PARAGRAPH LEFT UNREPAIRED (plan §88).** The two memory-era numbers above were the only
evidence the PATH axis had; `rigs/ladder.mjs`'s `scoreOn` scores the SAME commissioned object on
a second program for one scored run and no refit, and **five of eight plants meet target 1's 1.3x
bound, one of eight has a program made worse**. What survives of the old sentence is narrower and
better evidenced than it was: on the ARM the object reads BETTER on both programs it never ran
(10.88x, 15.94x) than on the one it was scored on (8.18x); on the COLUMN and the BARREL it still
helps (1.342x, 2.747x) at about a third of its scored factor; and the one plant it breaks on is
the REAL FLEXIBLE ARM, where what ships is the CONVENTIONAL rung and a sharper-edged program of
the same family reads 0.877x. So "anything the commissioning did not see breaks it" is true on
one plant of eight, costly on two, and FALSE on five — and the axis that decides which is
§84.9's own `prog/rise`, a number derived for the window rule before any of this was measured.

Measured: commission ONCE on the bench cell, then deploy that same frozen weight vector on a
machine built at another stiffness, each scored against the CONVENTIONAL machine at ITS OWN
stiffness so a harder cell cannot read as the policy failing.

```
  K 0.25 / E 0.03   8.17x  <- the control      K 0.25 / E 0.015  4.27x
  K 0.125           2.96x                      K 0.25 / E 0.06   2.87x
  K 0.5             2.42x                      K 0.25 / E 0.12   1.68x
  K 1               1.25x
```

**Across an eight-fold span of gearbox stiffness and an eight-fold span of link stiffness every
cell still HELPS, worst 1.25x, and nothing is made worse than the conventional machine.**
**AND THREE MORE AXES ARE NOW MEASURED UNDER THE SAME FROZEN MAP, WHICH SPLITS THE VERDICT IN TWO
(plan §84.4).** `PLANTSPAN` takes named overrides now, so the protocol reaches the constants §75
never moved. **BACKLASH IS FREE AND MORE OF IT IS BETTER** — from none to thirty times the rig's,
the conventional machine gets worse while the policy's delivered error FALLS, 8.15x → 8.49x, which
is §52.46's direction in its stronger form since no cell here got its own fit. **THE DRIVE IS THE
FAILURE AXIS: 8.17x → 5.79x → 2.09x → 1.78x as the torque limit falls, a 4.6x collapse**, reached
independently of §81, which found the same bound by ADDING load rather than removing headroom —
so this object's tolerance is set by the drive and not by the structure. **And more drive is also
worse (64 reads 7.34x against 32's 8.17x)**, as is more or less loop bandwidth, so both axes have
an interior optimum sitting on the commissioning value rather than a safe direction. Nothing is
made worse than the conventional machine on any of the eleven cells, worst 1.78x — so graceful
survives in the weak sense and fails in the strong one. **And §75.5's free detector holds on all
three new axes**: the 64-touch read tracks the full-rate number at 0.707-0.711 in every row,
constant to 0.6%, and at drive 8 it reads the drift at 4.1x against the policy's own 3.9x loss. That is
graceful, and the old sentence says the opposite. What the record does support is the narrower
claim: a phase-indexed MEMORY degrades catastrophically off its program — which is why it was
retired — and the deployed MAP degrades gracefully on the plant axis. Stiffer hurts more than
softer, and the policy's ABSOLUTE result is 3.7x worse at K 1, so this is real degradation
honestly reported rather than a null.

**AND THE DRIFT IS DETECTABLE FOR FREE, WHICH IS WHAT MAKES IT A PRODUCT PROPERTY.** The object
has no plant-side guard and cannot tell the machine changed — the coverage guard fades on
commanded SPEED and there is no analogue — so graceful-and-silent would be worth little. Read the
delivered error at the 64 touches §74 priced and the ratio to the full-rate number is
**0.707-0.711 in every cell, constant to 0.6%** across the whole span: the sparse read loses
essentially nothing, and a drift costing the policy 2.2x to 3.7x shows up in the probe at the same
factor. The first-article check a shop already runs is the recommission trigger. (The constant is
1/√2 and is a difference of rms CONVENTION between the two instruments, not something the sampling
did — what the measurement supports is its constancy.) A number that
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

1. **PROGRAM-AGNOSTIC. MEASURED ON EIGHT PLANTS FOR THE FIRST TIME, MET ON FIVE, AND THE COUNT IS A SCRAPE (plan §88, §88.9).**
   Commission once on a plant. Then run programs the commissioning never saw — different shapes,
   different corner counts, different lengths — with NO recommissioning. Target: within 1.3x of a
   controller commissioned on each program individually, on every program in the set, with none
   made worse than the conventional machine. **This target had almost no evidence against it until
   `rigs/ladder.mjs` gained `scoreOn`** — the driver's OWN scored run, parameterised over the
   program, so a second program costs ONE scored run and no refit and is not a fourth private copy
   of the loop (rule 61). What stood in its place was the quadruple tank's 2.657x against 3.268x,
   which §88.9 then had to remove from the count because it comes from a different instrument.

   ```
     plant        prog/rise   held-out / scored   verdict
     realexch         80.0         1.271          MET
     pend             31.6         0.950          MET
     realtanks        20.2         1.440          MET
     2R arm              —         1.330          MET   <- BETTER on both it never ran
     EMPS                —         1.012          MET   <- a sine the axis has never run
     column            7.6         0.339          NOT MET  (still helps at 1.342x)
     barrel            5.2         0.393          NOT MET  (still helps at 2.747x)
     real arm            —         0.455          NOT MET, and 2 of 4 held-out programs MADE WORSE
     cold mill       165.3         0.562          NOT MET on LINE SPEED, exactly 1.000 on GAUGE (§89.2)
     ── NOT ASKED, an OPEN ITEM rather than an exclusion ──
     quad tank         7.9           —            §79.3's 2.657x is the GAIN LADDER's instrument
   ```

   **AND THE COMPARATOR IN THAT COLUMN IS THE CHEAP ONE, WHICH §89.1 TRIED TO REPLACE AND COULD
   NOT.** Every ratio above is the held-out factor over the SCORED program's factor, where the
   target says *a controller commissioned on each program individually*. Those agree only if the
   two programs are equally hard, and three of the MET rows are ones where the held-out factor
   EXCEEDS the scored one — so a ratio above 1 there is evidence the DENOMINATOR moved, not
   evidence of meeting the bound. The strong form was built on the cheapest plant (the cart-pole,
   42.7 min) and its own control disqualified it: a second commissioning on the held-out program
   reads 4.956x there AND 6.055x back on the shipped program, where the frozen object reads
   11.402x and 12.009x. It is worse EVERYWHERE, so it is a worse COMMISSIONING and not a
   per-program one, and the 2.301 ratio it produced measures the draw. **A commissioning is a
   DRAW — §87.3 measured this plant at 11.789-12.113x over six, a 1.03x spread — so the strong
   form needs a per-program commission as good a draw as the shipped one, which costs a
   DISTRIBUTION per program rather than a run.** Two candidate causes died first: the channel box
   (`T1BOX=ship` is byte-identical) and the authority (`T1UCAP` triples it and the object gets
   WORSE, 4.956x → 3.990x, because the distilled rung is then refused outright). The cheap form
   stands as the only measured comparator on every plant, with the looseness stated.

   **THE TABLE IS A SCRAPE AND IT CAUGHT THIS FILE (plan §88.9).** `objtable --read` printed
   *asked on 7 of 10: 4 MET* while these three documents asserted *5 of 8 MET*, and having two
   counts is the condition that table exists to remove (rule 30). Resolved AGAINST the prose: the
   quadruple tank's 0.813 comes from the GAIN LADDER'S OWN candidate scoring rather than from the
   comparison every other row makes, so counting them together is rule 19 — it reads NOT ASKED.
   What was genuinely missing is EMPS, which has had the number since §50 and never emitted it.
   The count did not change; its MEMBERSHIP did, and every member is now emitted where it was
   measured.

   **FIVE OF NINE ASKED MEET THE BOUND, ONE HAS A PROGRAM MADE WORSE, AND ONE OF TEN IS NOT
   ASKED.** The flagship plant is the cleanest row: the 2R arm reads **10.88x on the rounded rectangle and 15.94x on
   the circle against 8.18x on the sharp square it was scored on**, every factor over the BARE
   machine so the comparison has one reference (rule 19 — `scoreSet` scores bare→policy while
   `rep.base/rep.best` is over the conventional machine, and dividing one by the other would have
   hidden a baseline change inside the ratio). Better on both programs it has never run than on
   the one it was commissioned against is the ordering a plant MODEL produces and the opposite of
   a memory's.

   **AND §84.9's OWN SCREEN PREDICTS IT (plan §88.7).** `prog/rise` — how many of the plant's own
   response times its program contains — was derived for the WINDOW rule and written down before
   any of these numbers existed: three of three plants above its ~10 split meet target 1, two of
   two below it miss, and the real arm fails hardest. That is one number predicting two things, and the reason is the same constraint from two sides: a
   plant whose program is few of its own rises needs a window that REACHES its memory, and a
   window that reaches its memory SPANS the program, so the map reads where it is rather than what
   is commanded. Six points and one exception is a correlation, not a law.

   **THE ONE PLANT MADE WORSE IS THE REAL FLEXIBLE ARM, AND IT IS THE SHAPE RATHER THAN THE SIZE
   (plan §88.3) — AND THE OBVIOUS REPAIR IS NOW REFUTED, WITH A READING THAT IS NOT (plan §89.3).**
   The repair this file named was a coverage guard on commanded SPEED, the analogue of the one the
   deployed object carries. It cannot work here and the reason is structural: **the two harmful
   rows STRADDLE the commissioning value**, at 0.577x and 1.666x of it, so any threshold refusing
   one admits the other or refuses the SOFTER program that delivers 2.825x. What does separate
   them is `peak|a|/peak|v|` — a reciprocal TIME, the edge's own risetime, EXACTLY invariant to
   amplitude (the two edge-96 rows read one number at amplitudes 2.9x apart, asserted) and
   monotone in what the four rows deliver: 1.666x harms, 1.000x is the commission, 0.800x beats
   it. **The guard is still not built and that is the useful half**: a coverage guard fades outside
   the span the COMMISSIONING saw, and the rung that ships here is identified on ONE program — its
   span is a point, not an interval. What this plant needs is a DIET, not a guard. What ships there is the CONVENTIONAL rung at 1.93x, and a sharper-edged program
   of the same family reads 0.877x. The prediction written down first — that the basis's two
   AMPLITUDE-INDEPENDENT terms (`sign v` and the bias) are the cause — was REFUTED by its own
   bisection: amplitude alone still helps at 1.152x, shape alone harms at 0.921x, and a SOFTER
   edge reads **2.825x, better than the commissioned program itself**. Monotone in edge width on
   the one plant here whose modes decay 1.03x per cycle.

   **THE MILL IS ASKED NOW, AND BOTH PREDICTIONS WRITTEN DOWN FIRST WERE CONFIRMED (plan §89.2).**
   A regulator has no second TRAJECTORY and plainly has a second OPERATING POINT, and `makeMill`
   now takes one — `{ href, h0, vLine }`, with the transport delay, the roll frequency and the gap
   setpoint DERIVED from it rather than carried (rule 31), and `millSpec.step` reading them off the
   mill it is stepping. Unset is byte-identical: the open loop still reads 15.154335422210291 µm
   and the two classical AGCs 18.08 and 14.00.

   ```
     h 1.50 mm, 5.0 m/s   the commissioning     15.39 → 5.86 µm    2.625x     —
     GAUGE  h 1.40 mm                           15.39 → 5.87 µm    2.625x    1.000   MET
     GAUGE  h 1.65 mm                           15.39 → 5.86 µm    2.625x    1.000   MET
     SPEED  h 1.50, 4.0 m/s  (delay 100→125)    15.24 → 7.55 µm    2.020x    0.770   MET
     SPEED  h 1.50, 6.5 m/s  (delay 100→ 77)    15.26 → 10.35 µm   1.474x    0.562   NOT MET
   ```

   **A GAUGE CHANGE IS INERT TO THREE FIGURES across a ±10% span of target thickness, and a LINE
   SPEED change is monotone in how far the declared delay has moved.** Nothing is made worse at any
   point. The asymmetry is the finding and it was predicted from the mechanism: this plant's win
   rests on TWO declarations and they behave differently. The roll phase is read by an ENCODER,
   honest at any line speed, so it survives; the transport delay is a NUMBER TYPED IN at
   commissioning, and it does not. That is a product statement — a mill that changes gauge needs
   nothing, a mill that changes line speed needs its delay updated, which is a division the
   engineer already knows how to do.

   **AND THE OBVIOUS SAFETY MEASURE FOR THAT — REFUSE WHERE THE DECLARATION HAS GONE STALE — WAS
   BUILT, REACHED AND MEASURED AS HARMFUL (plan §100).** §90.4's declared-point guard could not be
   reached at all (`AutoStack` called `actLook` with four arguments, so `decls` defaulted to null),
   which is the THIRD guard here shipped armed and unreachable after §82's and §78.5's. Plumbed and
   armed, it does exactly what it was designed to do: with `vLine` declared the two speed rows go
   **2.020x → 1.000x and 1.474x → 1.000x** while the gauge rows and the commissioned point come
   back untouched at 2.625x — the control that says it refuses on the OPERATING POINT and not on
   the fact that a knob moved. **And that is a loss, because 0.770 and 0.562 are FRACTIONS of the
   commissioned factor while the machine lives in absolute ones, where those rows are 2.020x and
   1.474x and both HELP** (rule 19). So the correct instruction to the engineer is the one above
   and NOT a guard: keep correcting on a stale delay, and update it. **A guard must be scored on
   DELIVERED OUTCOME, not on faithfulness to its declaration** — a stale declaration is a reason to
   re-measure, and only evidence that the correction HARMS licenses refusing. No plant here has
   produced that evidence, and `DECL` ships OFF on the measurement rather than on caution.

   **AND THE REASON THIS FILE FIRST GAVE FOR NOT ASKING WAS WRONG (plan §88.6).**
   It said the exclusion was deliberate because a REGULATOR's setpoint never moves, so a second
   program is not something this plant has. The premise is true and the conclusion does not
   follow: a regulator has no second TRAJECTORY and plainly has a second OPERATING POINT — a
   different target gauge, a different line speed — and *does the object hold where it was not
   commissioned* is target 1's question in the form this plant can be asked it. Writing "not
   applicable" over "not measured" is rule 25 itself, committed two sentences after citing it.
   It is an OPEN ITEM now, with the prediction on record: a gauge change should be met
   comfortably, because the win is provably all of one DECLARED roll phase and a roll phase is a
   property of the shaft; a LINE SPEED change should not, because it moves the transport delay
   the whole result rests on and that delay is declared at commissioning rather than re-measured. **NOT CLAIMED**: one
   held-out program per plant (four on the real arm), one seed, one diet each, and the comparator
   is the SCORED program's factor rather than a per-program COMMISSION — the stronger test, which
   costs a second commissioning per plant. Where the held-out factor is the larger, the cheap form
   is looser than the target rather than tighter. On the ARM itself the transferable part alone is
   10.94x where the memory-carrying stack reaches 20.34x.

2. **FEEDRATE-AGNOSTIC.** The same deployed controller across the feedrate range the machine
   is actually run at, no recommissioning, no per-feed table. Target: monotone degradation
   bounded at 1.5x of a per-feed commission across a 5x span of feed. Today a feedrate change
   moves the lap length and the whole lap-indexed layer is addressed by the wrong index.
   **MEASURED, AND THEN MET (plan §52.40, §52.41).** The shipped diet reads 6.71x / 5.85x / 8.18x
   across 0.40x-1.00x of the commissioning feed with nothing made worse, and above it the coverage
   guard FADES rather than extrapolating (1.17-1.19x) — the 4.5x of covered span sitting entirely
   BELOW the production feed, because the diet is commanded at the top of its own speed range. That
   is a diet fault with no constant in it, and the diet fixes it: the same designer at the same
   scale over feeds 2.0e-3 / 4.0e-3 / 8.0e-3 delivers **6.65x-7.94x across a 5x span of feed with
   coverage 1.000 everywhere and nothing made worse — worst to best 1.19x, inside the 1.5x bound**.
   Not monotone, so the target's letter is not met while its bound is. **The matched-capacity
   control says it is the FEED LADDER and not the extra programs** (six programs at one feed fade at
   exactly the same place, rule 20), and it costs 1.23x at the commissioning feed and 1.46x of
   commissioning time. `DIET=polyfeed`; not a default on one plant, one cell, one seed (rule 31).

3. **PLANT-AGNOSTIC, AND ALREADY HALF PROVEN.** Six plants that share no physics is the
   existing bar and it must not regress: the 2R arm, a quadruple tank, an extruder barrel,
   the Wood-Berry column, a cold mill AGC, the EMPS servo axis. **AND THERE IS NOW A SEVENTH,
   ADDED BECAUSE ALL SIX SHARE SOMETHING NO LINE HERE HAD NOTICED — EVERY ONE OF THEM IS STABLE
   WITHOUT A CONTROLLER (plan §52.32).** A nonlinear cart-pole, asserted unstable in the test
   (1e-4 rad to 0.5 rad in 1.36 s with no force), corrected at the REFERENCE of the cascade an
   installation would already have. It deploys at 9.4-9.8x across four seeds at a 1.04x spread —
   the tightest distribution here — and saturates at 13.7x rather than running to its cap. **And
   on a stabilising loop tuned 3.5x better it REFUSES all four times with a stated reason: the
   headline was the loop.** **AND THE DEPLOYED OBJECT NOW WINS IT ON BOTH LOOPS (plan §86.2): 11.93x on the shipped one and 9.24x on the tuned one**, where the teacher refused every authority — so this plant is a winner rather than a correct refusal, and the class the other six do not contain is now one the object handles. Both are measured, and the fault was caught before the claim rather
   than retracted after it, which is the first time in this project. Target: every plant either
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

   **AND THERE ARE NOW THREE MORE WHOSE DYNAMICS CAME FROM REAL HARDWARE, WHICH IS A DIFFERENT
   AXIS FROM "SHARE NO PHYSICS" AND THE ONE THE SEVEN WERE WEAKEST ON (plan §55).** Every plant
   in this project is a SIMULATION — EMPS included, and this file used to call it "real machine,
   real data" when what is real about it is the PROVENANCE of its constants. Three plants now
   join it on that axis: a flexible robot arm (DaISy 96-009), cascaded water tanks (Schoukens &
   Noël 2017) and a steam heat exchanger (DaISy 97-002), each identified from its published
   record and validated by FREE-RUN simulation on a cut the fit never saw. All three improve —
   1.93x, 6.54x and 89.8x — so target 3's improve-or-refuse clause holds on all ten.

   **AND THEY IMMEDIATELY PRICED THEIR OWN FACTORS DOWNWARD, WHICH IS WHY THEY ARE WORTH MORE
   THAN THREE MORE ROWS.** A plant identified as a linear ARX sits INSIDE the conventional
   rung's own hypothesis class — the basis is `[a, v, sign v, 1]` and the plant is linear, so
   the inversion is exact and the number measures the class rather than the machine (rule 15).
   Measured on both plants that can carry the control, and they share no physics (rule 18 in
   its useful direction): the tank reads **2012x linear against 6.54x with its documented
   OVERFLOW restored**, a factor of 307, and the exchanger **1364x linear against 89.8x** with
   the counterflow effectiveness relation in the fit, a factor of 15. The collapse scales with
   how far the plant sits outside the class — a hard clip costs 307x, a smooth exponential 15x
   — which is what makes it a mechanism rather than a coincidence. **The standing caution that
   follows is general: any "real data" plant built by fitting a linear model to a record is a
   soft target for a linear feedforward, and its factor is not a claim about the machine.**
   EMPS escapes this only because its rig is a nonlinear simulation — a binned friction curve,
   a drive saturation and an encoder quantisation — rather than an identified ARX.

   **AND THE KUKA WAS TRIED AND IS DELIBERATELY GONE — 222 MB, 89% OF THIS REPOSITORY,
   REMOVED ON THE OWNER'S CALL ONCE ITS RECORD WAS ESTABLISHED AS UNABLE TO SUPPORT A PLANT
   (plan §55.8-§55.12).** It arrived after every host serving it was refused, supplied by the
   owner: 39,988 training samples at 10 Hz, 67 minutes of full six-axis movement, six motor
   torques against six joint positions. Nothing fitted to it survives a free run — a one-step
   fit is essentially exact at 0.06% NRMSE while the same model simulating itself reaches
   ~21°, no better than the mean, and the decisive control is a REPLAY: fed the EXACT torques
   the real robot used, the model is 18.6° off by sample 50. **THE CLASSICAL ROUTE THEN
   EXPLAINED WHY RATHER THAN REPRODUCING IT.** Rigid-body dynamics on kinematics sourced from
   two independent places (agreeing to 1.3e-16 m) IDENTIFIES this robot — 78 physical
   parameters, held-out R² 0.785-0.891 on torque — **and the FORWARD equation from those same
   parameters reads R² at or below zero on five of six joints IN SAMPLE, with q, q̇, q̈ and τ
   all measured.** Both candidate faults were mine and both died by measurement: M(q) is
   positive definite at condition 12, and sub-stepping the integrator 10× moves the free run
   under 6%. **GRAVITY IS THE TORQUE** — 6.71 of 6.93 N·m on the shoulder — while the inertial
   term, the only part carrying q̈, is BELOW the fit's own residual on five of six joints, so
   an R² of 0.85 on torque is an R² of ~0 on acceleration: one fit against two denominators
   (rule 19). Joint 0 confirms it independently — vertical axis, gravity structurally zero,
   the only ratio above 1.0 and the only positive forward R². **This record identifies the
   robot's STATICS and a forward simulation needs its DYNAMICS**, which is a property of the
   EXCITATION (peak |q̈| 14-40 deg/s²) and not of the method — rule 41b from the other side —
   and two controls say the model is not the limitation: the fit is SATURATED (625 rows read
   what 19,994 read) and a 490-feature universal map of the same inputs on the same rows is
   worse on every joint. **SO THE DATA WENT AND THE FINDINGS STAYED**, which is this project's
   standing practice for anything retired: re-obtaining the record is a download, re-deriving
   why it does not work is four sections. **WHAT IT LEAVES OPEN, STATED PLAINLY**: deleting the
   files does not remove them from git history, so a fresh clone still pays the 222 MB until
   someone decides on a rewrite; the real multi-axis-arm gap is open again, with the flexible
   robot arm (one link, 1024 samples) standing; and the next candidate should be SCREENED on
   this first — decompose its torque, and if the inertial term sits below a plausible model
   residual it is a regression benchmark and not a plant.

4. **COMMISSIONING IN MINUTES, NOT AN AFTERNOON. MET ON THE ARM — 17 MINUTES TO 2, AND THE
   DELIVERED RESULT IS UNCHANGED. AND ON THE TWO PLANTS IT FAILS WORST ON, A TEACHER-FREE ROUTE
   NOW READS 33 DAYS → 18 HOURS AND 30 DAYS → 35 HOURS (plan §104).**

   The TEACHER is 74-89% of what a commissioning costs these plants (§73.13) and ships on ZERO of
   ten (§86.7). `rigs/dirinvkit.mjs` removes it: fit a window of the ACHIEVED output, mapped back
   through the plant's OWN nominal inverse, onto `c - inv(y)` from OPEN-LOOP runs, and deploy
   `c = refAt(k) + f(...)`. No teacher, no cascade, no lap index, no forecast, and `DistilPolicy`
   unchanged — because every process plant's `refAt` is ALREADY that nominal inverse.

   ```
     plant               teacher-free, 4 seeds        teacher-taught   teacher laps
     extruder barrel     3.705x .. 6.388x  med 4.641x      7.00x        0 against ~33 days
     Wood-Berry column   3.427x .. 4.450x  med 3.652x      3.96x        0 against ~30 days

     barrel   45,000 excite + 20,000 verify @ 1 s      =  18.1 h  against 799 h   44x
     column   18,000 excite +  3,000 verify @ 0.1 min  =  35.0 h  against 720 h   21x
   ```

   **THE CALENDAR IS THE RESULT AND THE FACTOR IS NOT.** Both land in the same range as the objects
   those calendars bought. **AND THE ARITHMETIC SAYS IT IS NOT ONLY THE TEACHER (rule 19)**:
   removing 74-89% of a bill gives 4-9x, not 44x, so this is also dropping the probe set, the
   refinement passes and BOTH machine-scored ladders — it fits once at `1e-6` with no selection
   where the ladder selects a ridge and a gain ON THE MACHINE. Scope-mismatched, and quoting 44x as
   *the cost of the teacher* would be wrong by about 5x.

   **THE CONTROLS ARE WHY THE NUMBERS ARE WORTH ANYTHING**, and three exist because this project
   has published a number of exactly that shape: an all-zero map must reproduce the open loop
   BIT-EXACTLY (ASSERTED — `distil-tank.mjs`'s §67.3 defect, which read *1.000x, nothing harmed,
   TRANSFER* for two sections while the rung was absent from the run that scored it); a fit on
   SHUFFLED targets must not deliver and reads **1.000x-1.008x on both plants**, so the fit is
   reading the map and not the excitation's mean or a scoring artefact (rule 15); and the barrel's
   open loop reproduces the record's **5.2708e+0** (rule 21). Held out BY SEGMENT, reported as a
   distribution. **AND THE COLUMN IS SATURATED AT ITS SHIPPED AUTHORITY** — peak 0.400 of 0.4 on
   every seed, which is §62.4's own failure signature — but swept it is the OPPOSITE of that
   failure: the demand has a natural size of 0.724 and the delivered factor saturates
   byte-identically at **4.85-5.04x** from UCAP 2 upward, so the cap is simply below what this class
   of correction wants. **AND THAT IS NOW ANSWERED (plan §104.1): NO, AND §104's RAISED-CAP ADVANTAGE IS REAL —
   BUT IT IS OUTSIDE THE PLANT'S OWN INPUT BOX.** The comparison is matched first (`UCAP = x` and
   `UM = 0.4x` set the same clamp, checked through `authority('distil')` falling through to
   `spec.uMax`). Over a **40x span** the teacher-taught object lives in **3.70x-4.01x**, a 1.08x
   band, byte-identical from clamp 4 up; its natural peak uncapped is **1.4326, 3.6x its shipped
   cap**, and relieving that cap 10x is worth a median **1.044x** over six drawn diets while the
   distribution TIGHTENS — a relieved constraint that was not what bounded the result. So at clamp
   0.4 the two are level (3.43-4.45x against 3.959x) and above it only the teacher-free object
   converts authority into delivery, 1.36x against 1.04x. **THE CAVEAT IS AGAINST OUR OWN ROW**:
   `wbSpec`'s channel box is ±0.5, sized from the plant's gains, and §104's natural demand of 0.724
   is OUTSIDE it — so on BOTH routes *raise the cap and it improves* asks this machine for a
   correction larger than its whole declared input travel. **The number that belongs in a portfolio
   table is the 3.43-4.45x at the shipped authority**; the raised-authority figure states the map's
   appetite, not a deployable setting. Two plants, no ridge or gain selection, target 1 measured on the
   barrel only, and nothing integrated — `dirinvall.mjs` is an INSTRUMENT and no `AutoStack` rung
   offers this route. Target: 10x down, under three minutes on the arm, while
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

   **AND THE OTHER FIVE PLANTS WERE ALREADY MEASURED — EVERY RIG PRINTS ITS OWN COMMISSIONING
   COST IN ITS OWN PROCESS TIME ON EVERY FULL RUN, AND NOBODY EVER COLLECTED THE SIX NUMBERS
   (plan §54.6).** `test/pilot/commtime.mjs` is that table, a SCRAPE rather than a re-measurement
   so no plant is re-scored by a metric this file invented:

   ```
     cold mill     166,400 steps      5.5 min     MET
     quad tank     252,613 steps        7.0 h     MISSED
     barrel        328,270 steps     3.8 days     MISSED
     Wood-Berry     91,400 steps     6.3 days     MISSED
     EMPS           48,400 steps            —     UNKNOWN — the rig states no clock
     2R arm        165,643 steps            —     UNKNOWN — the rig states no clock
   ```

   **ONE of the four plants that state a clock meets this target, and the spread is 1643x.** The
   two that do not are UNKNOWN and not met (rule 25) — and the ARM is the plant this target claims
   as MET, on a simulator's WALL CLOCK, from a rig that does not convert to plant time at all,
   which is the caveat this file already states two sections up and then quotes against the target
   anyway. **And steps and time RANK DIFFERENTLY**: Wood-Berry is the cheapest commissioning here
   in steps and the most expensive in days, because one of its steps is six minutes of column, so
   a target counted in steps is measuring the simulator.

   **AND EVERY LINE OF THAT TABLE PRICES THE WRONG OBJECT (plan §72).** Each of them counts the
   steps a bare `Pilot` advanced — the TEACHER — and under the memory's retirement the teacher is
   not what a machine receives. The route to `distil.js`'s weight vector adds a DIET whose
   prefixes must be CONVERGED first, which this file names in prose ("laps on real hardware
   producing nothing") and nothing here ever counted. `test/pilot/rigs/meter.mjs` ticks inside
   each rig's own `step`, so no caller can bypass it and the two objects land on one axis:

   ```
     plant        TEACHER            PRODUCT, as first measured    factor
     cold mill    5.5 min   MET      4.6 h     MISSED                50x
     quad tank    7.0 h     MISSED   18.9 days MISSED                65x
     Wood-Berry   6.3 days  MISSED   249 days  MISSED                40x
   ```

   **The mill was the ONE plant of four meeting "commissioning in minutes", and the object that
   actually deploys there cost fifty times more.** So target 4 was not merely unmet on five plants
   of six — it was unmet on the plant it claimed, for the thing that ships.

   **AND THE TEACHER'S SHARE — THE 74-89% THIS TARGET FAILS ON — IS MOVEABLE, MEASURED ON THE
   MILL (plan §90.3).** The default teacher converges a LAP-INDEXED correction; `AutoStack`'s
   PARAMETRIC engine iterates the POLICY instead, a map of the commanded reference fitted and
   re-measured on the machine every pass, so what the basis cannot express is never accumulated.
   Reached on a plant for the first time:

   ```
                          lap-indexed (hff)     lap-free (parametric)
     delivered              2.625x                2.610x    (5.8649e-3 against 5.8913e-3)
     teacher, per run       6.78-8.25x            2.56-3.04x
     held-out R²            0.861                 0.865
     COMMISSIONING          58.8 min              49.1 min      <- 17% less plant time
     where it goes          teacher 81%           teacher 69% · cascade 6%
   ```

   **0.6% less delivered for 17% less of the plant's time, from a teacher that converged 2.5x LESS
   FAR** — §49's law through a ninth knob, and here it is not a trade at all, because the shallower
   teacher is also the cheaper one. **NOT CLAIMED: one plant, and the one §84.1's screen predicts
   should show the LEAST benefit** (its `hff` per-run spread is 1.22x, which that screen reads as a
   teacher already converging), so a level result here is the prediction holding rather than a win.

   **AND THERE IS NOW A ROUTE WITH NO TEACHER AT ALL, MEASURED ON ONE PLANT AND NOT INTEGRATED
   (plan §99).** The teacher is the 74-89% this target fails on, and every lever above makes its
   laps cheaper. The DIRECT INVERSE removes them: fit a window of the ACHIEVED `y` onto `c - y`
   from open-loop runs, deploy `c = r + f(r)`, and there is no iteration, no probe set, no cascade
   and no lap index to pay for — six trapezoids, ONE pass, about 35,000 machine steps. Through the SHIPPED
   `DistilPolicy`, and therefore `deploy.js` unchanged, it delivers **5.510x on EMPS on a program
   in no training run**. **It is not in the portfolio and the reason is a measurement, not caution:
   on EMPS the incumbent reads 424.8x and the block already ships it**, so a 5.5x route is third of
   three on the only plant it has been asked (rule 31). Where it would be worth something is named
   and NOT RUN — the BARREL and the COLUMN, where §72 prices the whole commissioning at 30.0 and
   33.3 DAYS of plant time, §73.13 prices the teacher at 74-89% of that, and §96 measures the
   incumbent finding nothing at all, so a teacher-free route
   reaching a fraction of the learned object's 7.00x and 3.96x would be worth most of the CALENDAR
   rather than a factor. **And this route's whole history is a caution about instruments rather
   than about methods**: §93 and §94 wrote it up as a clean negative — *the obstacle is the FUNCTION
   CLASS, measured from four directions* — and every delivered number in both was taken through a
   deploy reader that read the window centred at 2i, exact at i = 0 and wrong everywhere else.

   **AND FOUR MORE PLANTS ARE NOW PRICED FOR THE PRODUCT, AND ONE OF THEM MEETS THIS TARGET
   (plan §87.7).** Scraped from `priceFrom`'s own line, so nothing is re-scored:

   ```
     cart-pole             42.7 min      MET      teacher 59% · verify 41%
     real heat exchanger    2.7 days   MISSED     teacher 76% · verify 24%
     real cascaded tanks   15.9 days   MISSED     teacher 77% · verify 23%
     real flexible arm     73.5 days   MISSED     VERIFY 87% · teacher 13%
   ```

   **The cart-pole is the cheapest product commissioning in this project** — 42.7 min against the
   mill's 55 — so the target is met on two plants of eight, and the plant that meets it is the
   OPEN-LOOP UNSTABLE one. **The real arm's shape is the opposite of everyone else's**: 87% VERIFY
   where every other plant is 76-98% TEACHER, which is the price of the two machine-scored ladders
   on a plant whose scored program is 143,360 steps — §86.6's edge extension walking six steps,
   each one a 40-lap run. It is the first time the verify has been the dominant term anywhere.

   **AND THEN SIX LEVERS TOOK 3.5x TO 9.6x OFF IT, NONE OF THEM A CONTROLLER CHANGE (plan §72.6
   to §72.18).** The teacher's own lap budget — which `hff` had been counting since it was written
   and nothing ever read — named the phases, and every lever was measured before it moved:

   ```
     plant        product, first measured   ->   at today's defaults      delivered
     cold mill        4.6 h                      55 min      MET          1.153x -> 2.63x
     quad tank       18.9 days                    1.3 days   1.3x over    REFUSED -> 2.593x
     Wood-Berry     249 days                     30.0 days  30x over      2.50x  -> 3.64x
     barrel         338 days                     33.3 days  33x over      see the retraction below
   ```

   In order of what they were worth: the OPERATOR is identified once per plant rather than once
   per training run (`hff` already exported it and already measured the crossing; nothing had ever
   handed it on) — 2.4-2.8x, delivered unchanged on all four; the RIDGE is chosen by scoring
   candidates ON THE MACHINE rather than carried from the arm — which turns the tank's refusal
   into a win; ONE trial pass per candidate rather than three — the candidate sweep is 46% of the
   teacher's laps on the column and 66% on the mill, against a refinement of 8-12 that is what
   anyone cuts first; FOUR refinement passes rather than twenty-four (§49's law through a fifth
   knob); and the PLANT CARRIED across the teacher's calls rather than rebuilt and re-settled,
   which on the tank was 64% of every call.

   **TWO OF THE FOUR PLANTS REFUSED THAT LAST ONE AND BOTH REFUSALS ARE FINDINGS.** The mill's
   per-call warm-up is not a settle but a PHASE ALIGNMENT to a whole number of roll turns, so a
   carried plant would drift the declared reference off the shaft — §71.2's own defect, which a
   blanket change would have reintroduced silently. And the barrel's is §72.18, below.

   **AND A DAY IS NOT A NUMBER OF STEPS, IT IS A NUMBER OF LAPS (plan §72.12).** The diet's lap is
   set by the plant: a day is 13,000 laps of the mill, 156 of the tank, **4.8 of the column and
   4.3 of the barrel**. On those two the refinement ALONE is 4-12 laps, so a day is below what any
   method needs to watch the plant respond — a property of a five-hour lap and not of this
   teacher — and the lap cannot be shortened to buy it, because the window rule already has
   `lap/8` binding against the plant's own memory. What those two can offer instead is the split
   the operator handoff exposed: **the plant is characterised ONCE and each new program after that
   costs a fraction of it** (barrel 79.6 days then 8.3; column 59.2 then 7.5). That is target 1
   priced for the first time, and stating which of the two a figure refers to is now compulsory.

   **AND A SECOND TEACHER IS BUILT, MEASURED ON FOUR PLANTS AND NOT MADE A DEFAULT (plan §73.13
   to §73.16).** `hff` is 74-89% of what the product costs these plants, and §73.6 and §73.8 closed
   both ways of making its laps cheaper by measurement — the lap cannot go below the plant's settle
   and the settle lap inside a call cannot go at all. So the remaining lever is a DIFFERENT teacher,
   and this project already had one: `oracleteach.mjs` iterates the COMMISSIONED PILOT with the
   measured error as its free response, which replaces exactly the probe set `hff` spends its laps
   on. Asking three more plants took three instrument repairs, every one of them "did not run"
   reading as "ran and declined" (rule 25) — `AutoStack` discards a cascade the moment it loses its
   verify, `deployed.stack` and not `auto.stack` is what `act` reads, and `distil-tank.mjs` has
   never supplied a `drivePilot` so its `maxDepth: 1` was inert from the day it was written.

   ```
     plant         lap-harmonic teacher (default)    oracle teacher (ORACLE=1)
     cold mill     54.8 min   2.63x                  54.8 min   2.59x
     quad tank     31.7 h     2.593x (held 2.299x)   3.0 days   2.911x (held 2.536x)
     Wood-Berry    30.0 days  3.64x                  38.4 days  5.49x
     extruder      33.3 days  6.12x                  41.0 days  4.61x  (probe failed, fell back)
   ```

   **Two plants better, two worse, so it is not a default (rule 31)** — and what it is worth where
   it wins is large: **Wood-Berry 3.64x → 5.49x, on the plant this project has lost on since it was
   built**. §73.12's "which half of the pilot is broken" account is RETRACTED by the column, whose
   cascade delivers 0.39x — the worst of the four — and which the oracle teaches best of all.

   **WHAT IS A DEFAULT, because it is inert without a snapshotting teacher**: the ladder gained a
   SECOND AXIS. §49's law says a more converged teacher teaches a WORSE policy — an eighth knob now
   — but WHERE it turns is the plant's (Wood-Berry peaks at 8 passes, the tank at 4, the mill's own
   gate stops at 5-6), so the pass count is scored on the machine like the ridge. It is JOINT with
   the ridge and not sequential, which the TANK decided: scored first at the default `1e-6` — the
   value §70 measured as delivering 0.08x — every depth was compared at a setting that makes the
   controller useless, and it shipped a REFUSAL where the joint ladder delivers 2.911x. Two
   selections sharing one bad constant cannot check each other (rule 15). The snapshots themselves
   are free, since the iteration is monotone and the deepest rung pays for every shallower one.
   Rule 42's band also gets something real to spend itself on for the first time: among candidates
   indistinguishable at the instrument's resolution, FEWER TEACHER PASSES wins.

   WHAT IS NOT YET DONE: the contract bar at 2 minutes — the arm's ladder still reports 3.13x on
   the soft cell against the 22.42x the memory-carrying stack reached, which is the retirement's
   stated cost and not a regression.

5. **HIGHER, NOT MERELY TRANSFERABLE — AND THE TARGET IS RE-SCOPED, BECAUSE THE EVIDENCE SAYS
   THE NUMBER IT NAMES IS NOT REACHABLE BY THE ROUTE IT ASSUMES (plan §89.5).** It read: *beat
   22.42x on the arm while satisfying 1 and 2*, and the intent stands — transfer bought by giving
   up performance is a different product. What has to change is the assumption underneath, which
   is that a better MAP recovers the memory's factor.

   **THE 22.42x WAS A CONTROLLER PLUS A CALIBRATION FOR ONE PROGRAM, AND THIS FILE ALREADY SAYS
   SO.** The retirement's own accounting is that the model layers alone reach 7.70x and the lap
   table on top reaches 22.42x, so the target names a number 2.91x of which is the object that was
   RETIRED for being worth 0.53x-0.55x off its program. A target defined as *beat the memory* is a
   target defined against something the product does not contain.

   **AND THE MAP'S CEILING IS THE INPUT, NOT THE FIT — MEASURED THREE INDEPENDENT WAYS.**
   `consist.mjs` reads an INFORMATION ceiling of R² 0.894 measured / 0.931 extrapolated to zero
   row distance, against the shipped fit's 0.856-0.870, fitting nothing: **between 1.1x and 1.6x
   of the correction's residual is all that remains in the reference window.** Nine capacity
   experiments agree from the feature side — more taps, longer reach at preserved spacing, longer
   reach by scaling, quadratic and energy lifts, pose scheduling, a resonator bank, a second
   distillation, a direction-of-travel block, a slow modulating parameter — and several improve
   IN-SAMPLE while harming transfer. And §54.9 tested it with methods that could have broken it:
   ridge 0.8610 against kernel ridge 0.8303, locally weighted 0.8266, MLP 0.7456, kNN 0.7147, so
   it is not *no basis* but **no FUNCTION CLASS of the commanded reference window**.

   **SO THE HONEST TARGET IS THE ONE THE RECORD CAN FALSIFY.** Not *beat 22.42x with a better
   map*, which nine negatives and a ceiling say is unavailable, but: **beat 7.70x on the arm by
   changing what the object is TOLD or what the machine IS, while satisfying 1 and 2.** The three
   routes with measured evidence behind them are the ones this file has already priced, and none
   of them is a fit: the MACHINE (§52.30's 1.13x-1.29x from the drive and the loop, §52.33's 1.65x
   once the window is stated in raw steps), the INSTRUMENT (§52.42's 3.9x between the tracker and
   the best permanently-mounted alternative; §74's sixty-four touches), and the DECLARATION
   (§71's mill, where the entire win is one declared channel — and §85's own correction, that the
   mill is 95% exhausted of its DECLARED disturbance and 0% of its undeclared one). Today the arm
   ships **8.23x** at its own defaults through the one press, which is already past 7.70x; what
   the re-scoped target asks is that the next factor come from one of those three and be shown
   not to cost targets 1 and 2.

   **WHAT WOULD FALSIFY THE RE-SCOPING**: a map of the commanded reference window reading above
   R² 0.93 leave-one-program-out on the arm's own rows. That is `consist.mjs`'s extrapolated
   ceiling, it is one number, and the instrument to check it already exists.

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

7. **BREADTH, WHICH MEANS WINNING WHERE IT CURRENTLY LOSES. HALF MET — AND THE DEPLOYED OBJECT HAS NOW BEEN OFFERED TO TEN PLANTS AND DEPLOYS ON EIGHT (plan §86.7), WITH THE PILOT CASCADE SHIPPING NOWHERE.** The second clause is
   done and done properly: the COLD MILL was one of the two standing refusals and is now a
   MEASURED IMPROVEMENT, not merely a correct refusal — 1.45x median exit gauge across 8 of 8
   seeds that all deploy and all help, past both classical AGCs including the gaugemeter that
   amplifies the disturbance it is supposed to reject. Neither repair touched the controller:
   the transport delay is declared by the engineer who mounted the instrument, and the forecast
   gate was reading lead 0, where the response is zero by construction. **AND THE OTHER CLAUSE IS
   NOW MET TOO, BY THE OBJECT THAT SHIPS RATHER THAN THE TEACHER (plan §64).** It read: beat the
   published BLT on Wood–Berry, where doing nothing (43.90) already beats it (51.95) and every
   deployment across twelve seeds is worse than that. Through the one press the distilled rung
   DEPLOYS at **2.44x** on the ladder's own metric — 92% of the 2.65x `headroom.mjs` measures as
   available to any correction of its class — and in the metric the literature reports it beats
   both baselines in BOTH scoring conventions: **IAE 38.52 against 43.90 and 51.95 cold, 25.26
   against 29.12 and 49.62 settled**. Two controls say the loop is the one those numbers came
   from (rule 21): the cold do-nothing reproduces the recorded 43.90, and the cold BLT reproduces
   the rig's own `runBLT` to 1e-9 through the SHARED loop. The first version of that comparison
   was wrong in the way rule 20 names — a warmed candidate against a cold incumbent, worth 1.51x,
   larger than anything claimed — which is why both columns are printed. The deployed object is
   43 features, 138 MAC/decision, 0.7 kB, no QP, no forecast bank, no tracker and no lap index,
   where the pilot cascade on the same plant delivers 0.39x. NOT CLAIMED: three of four training
   runs were DROPPED (the teacher improved them 1.26-1.38x, below the rung's own 1.5x bar), so
   the fit is on ONE program at 2,624 rows; held-out R² is 0.397/0.046 and the machine disagrees
   with the gate; and it is one seed, one diet, one scenario. What remains open on this plant — declaring its own-loop delays was
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
   counts. **AND THE BARREL'S REFUSAL IS CORRECT FOR THE PILOT AND WRONG ABOUT THE PLANT — A
   REFERENCE-ONLY MAP DELIVERS 5.38x ON A PROGRAM IT WAS NEVER FITTED ON (plan §62.5).** The
   paragraph below, which stood as "the refusal is proved correct", swept the PILOT'S OWN
   correction and concluded that no correction of this class can help. `headroom.mjs` contradicts
   it: a machine-in-the-loop oracle reaches **15.11x**, 97-99% of that is expressible by a causal
   map of the commanded reference, and at the right window **5.38x of it SURVIVES a program with
   a different clock and different magnitudes**. What made the difference is not a controller
   change but the WINDOW, and the ladder is the finding — 0.16x at ±11,792 steps, 1.65x at
   ±3,931, 4.80x at ±1,965, **5.38x at ±983**, 5.16x at ±472, **while the in-sample number sits
   flat at 14.63-14.70x across all five**. The barrel's measured settle is 7,861 steps against a
   15,000-step program, so a window scaled to the plant's memory SPANS the training program and
   the map reads WHERE IT IS instead of WHAT IS COMMANDED — §41's aliasing theorem on a plant
   sharing no physics with the arm, with the COLUMN as the matched control at 2.56-2.70x
   transferred across the same ladder, inert. Two program axes were bisected and both broke the
   wide window (retime alone 0.31x, rescale alone 0.14x), so it is not the T⁴ answering an
   amplitude change. What stands unchanged is everything about the PILOT below; what is retracted
   is the inference from it to the plant.
   Forced to deploy, its correction sits at EXACTLY its cap (uPk 12.0000 of 12) and costs the
   changeover 1.5x; swept over a sixteen-fold range of believed plant gain with the forecast
   held fixed and good, the delivered ratio runs 0.670x → 0.917x → 1.006x → **1.017x** → 1.012x
   and reaches that ceiling by making the correction VANISH (6.6% of the cap for 1.2%). Every
   setting that applies a real correction is worse than doing nothing, so the refusal is not
   hiding a scale error — which is target 7's second clause in its other form, on the other
   plant — **though §62.5 now says the gain sweep was the wrong lever rather than the wrong
   plant**. Untested and stated: a SCHEDULED gain is a different object from a scaled one on a
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
   the other standing refusal and **IT IS ONE NO LONGER: 3.951x DEPLOYED (plan §66, §72.18)**, by
   the object that ships rather than the teacher, once three harness defects and a diet were
   repaired — so BOTH standing refusals are closed and neither was closed by a controller change.
   That figure stood at 10.61x and is RETRACTED by a factor of three: it was measured with the
   plant REBUILT before every teacher call, which reset an unmeasured ambient drift to a known
   phase and so let a lap-periodic teacher invert a disturbance a real barrel would not repeat. A method that wins only on compliance and
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

   **AND THE AGREEMENT WAS EXPECTED ON THAT PLANT, WHICH IS WHY THE ARM WAS THE MEASUREMENT THAT
   MATTERED — AND ON THE ARM THEY SPLIT, AT EVERY SETTING OF THE RIVAL'S OWN KNOB (plan §52.43).**
   `hff`'s reach factor is recorded here as "on the axis inert to four figures", so EMPS is
   precisely where the two laws land together; the ARM is where that shrinkage is load-bearing —
   removing it costs 4.81x → 1.05x. `test/pilot/noilc-arm.mjs` drives through the shared
   `makeArmHost` rather than a fourth private copy of the routing (rule 61) and holds machine,
   program, probe, identification, operator, basis, cap and laps, moving only the update law:

   ```
     hff                     1.3046e-1 -> 8.3434e-2   1.56x
     NOILC  r 1e-6 .. 100    best 1.00x-1.07x, and the LAST lap worse than the first in all five
   ```

   **AND A SECOND METHOD IS BUILT AND THEN RECLASSIFIED BY WHAT IT NEEDS: DeePC IS AN UPPER
   BOUND, NOT A RIVAL (plan §54.8).** `test/pilot/deepc.mjs` is DeePC on the EMPS axis: by Willems' lemma one
   persistently exciting trajectory spans every trajectory an LTI plant can produce, so a Hankel
   matrix of raw data REPLACES the model inside a receding-horizon controller. It is the right
   second rival because it contests the thing that SHIPS — a map regressed from data with no plant
   model in it — where MPC would contest the cascade and L1 an adaptive law this project does not
   ship. Swept over its own two regularisers while ours ran at defaults, it reads **189.68x on the
   program and 131.82x on the held-out sine against the distilled policy's 32.75x and 33.15x**, and
   the margin GREW every time the grid was widened (1.97x → 17.87x → 142.78x → 189.68x, each
   earlier best sitting on its own grid EDGE).

   **A NUMBER THAT CLIMBS WITHOUT BOUND AS A REGULARISER GOES TO ZERO IS NOT A CONTROLLER
   CONVERGING (rule 14)** — it is an unregularised Hankel solve approaching EXACT INTERPOLATION of
   its own data, available only because this rig is DETERMINISTIC, and it is the exact regime
   regularised DeePC exists to escape. **So the falsifier was run, and it is not close.** With
   1.6 µm on what the CONTROLLER reads — the rig's OWN stated instrument fidelity, the floor
   `autostack.test.mjs` already refuses to credit improvements below — the best of **98 cells of its
   own knobs** reads **1.00x on both columns: it cannot act at all**, and at the settings that won
   noiseless it reads **0.04x and 0.02x**. Add the two columns a delivered error does not carry:
   **145,082 MAC/decision, 1451% of a PLC scan against the policy's 78 MAC at 0.8% — 1,860x** — and
   an instrument, because DeePC needs the measured tracking error at every decision for ever, which
   is the tracker the deployed object does not need and §52.42 prices at 3.9x. **SO IT DOES NOT COUNT AS A RIVAL AT ALL**: it reads the measured tracking error at every
   decision for ever, which is the instrument the deployed object exists to do without, so its
   numbers belong beside §48's perfect-forecast ORACLE. What it is worth is the NOISE LADDER —
   how good an instrument a customer would have to own, permanently, to beat an instrument-free
   feedforward — and that is a product number this project did not have.

   **AND THE SECOND ADMISSIBLE RIVAL IS NOW BUILT, AND IT IS THE ONE THIS FILE CALLS ITSELF A
   VERSION OF (plan §56).** ZPETC / stable inversion was attempted in §54.10 and withheld, because
   it read either 0.02x pinned at its cap or 1.00-1.02x inert — this repository's bug, not the
   method's property — with the live candidate named as a z vs z⁻¹ convention error. **It was
   exactly that**, in `polyFromRoots`, which accumulated ASCENDING powers where `roots` consumes
   DESCENDING; reading one for the other reflects the polynomial and maps every root r to 1/r. What
   found it was two diagnostics that must agree and did not — the root finder reporting every zero
   INSIDE the circle at 0.22-0.93 while the long division on the same polynomial ran to **1e+263**
   — and the confirming control has no plant in it: factor a polynomial and multiply it back, which
   reproduces the original **to 1e-16 REVERSED** and misses it by 29-95% as-is. Fixed, the rival
   measures **2.45x on the program and 3.28x on the held-out sine against the distilled policy's
   32.75x and 33.15x**. **Two controls, because a best-of-sweep is a suspect result**: it does NOT
   run away with its own grid — widening the ridge four decades below its old edge and lifting the
   FIR truncation 5x leaves the best cell where it was, which is precisely what disqualified DeePC —
   and it reproduces at **2.18-2.45x over four identification draws**. **And the noise falsifier
   fires**: at the rig's own 1.6 µm identification fidelity every cell reads 0.06-0.27x, worse than
   doing nothing, with R²(Gu) falling only 1.000 → 0.95 while **R²(Gr) collapses to 0.029** — a
   composed feedforward is only as good as the worse of its two models. **Said because the name
   oversells it**: `out` is ZERO in every delivering row, so Tomizuka's reflection never engages and
   this is EXACT inversion with one step of preview; on this axis the identified path is minimum
   phase. The sharpest form of the finding is that **every model in the sweep fits at R² 1.000 and
   they deliver 0.03x to 2.45x — a model can be exact in prediction and still be a bad thing to
   invert**, which is the whole reason the shipped route regresses the correction rather than
   inverting a model, and the first evidence for that choice from outside this project's own
   machinery. One plant, and EMPS is the rival's STRONG ground (near-LTI, single channel).

   **SO TARGET 8 NOW HAS TWO ADMISSIBLE RIVALS.** The third that would contest the deployed object
   — a NONLINEAR learner on the identical rows — is answered by §54.9 (`nonlinear.mjs`: ridge
   0.8610 against kernel ridge 0.8303, locally weighted 0.8266, MLP 0.7456, kNN 0.7147). Koopman-EDMD,
   L1 and modern MPC remain absent, and L1 and MPC are inadmissible on the same grounds as DeePC.

   **It diverges at every setting**, its best move on this plant is not to move, and the sweep is
   COMPLETE rather than generous: the law is `Δu = (qMᵀM + rI)⁻¹qMᵀ(−e)`, so scaling q and r
   together leaves Δu unchanged and the one free parameter is covered over eight orders of
   magnitude — while `hff` ran at its shipped defaults with no sweep at all. So the difference is
   the confidence-and-reach shrinkage, which this file already prices from the other direction, and
   it is a control decision rather than a safety margin. **And the transfer column is now two laws
   on two plants**: on a program neither has run, hff reads 0.54x and NOILC 0.61x, against EMPS'
   0.53x for both — a lap-indexed memory is worth less than nothing off its program under two
   different update laws on plants sharing no physics, which is the retirement's case with none of
   this project's own machinery in it. Still absent entirely: modern MPC, L1 adaptive, DeePC,
   Koopman-EDMD. One method is not a field.

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
servo axis — whose parameters were identified from a real machine's record, no physics in common
with the arm (this used to read "real machine, real data", which overstates it: the rig is a
SIMULATION and what is real about it is the PROVENANCE of its constants — plan §55) — carries a negative
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

   **AND WHAT BLOCKS THIS FROM DEPLOY IS EXACTLY ONE THING — THE INSTRUMENT — WHICH IS WORTH
   STATING BECAUSE THE HALF-ANSWER IS ALREADY MEASURED AND SITTING UNUSED.** Adaptation is the
   largest measured lever on this list (9 of 9 cells improve, geometric 1.79x, and the two programs
   it NEVER RAN gain more than the one it did), and it ships as a commissioning phase for one
   reason: it needs the tracker, and the tracker is only legal there. The thing that would remove
   that block is a SOFT SENSOR — fit `free signals → tool error` with truth at commissioning, and
   the estimate is free for ever after — and §52.23 measured the hard half of it working: every
   hidden state is observable from the motor side at **R² 0.9-0.99** across programs, and CHAINED
   so no instrument remains at deploy it delivers channel 2 at 0.85-0.95 and channel 1 at 0.2-0.6.
   **It was then routed into the pilot's FEEDBACK layer and failed there for a reason that has
   nothing to do with the sensor** — §52.26, the gearbox answers 951 steps later, so feedback
   through the command cannot reach what it predicts. Correct conclusion, wrong consumer: nobody
   has fed a soft-sensed error to ADAPTATION, which does not need to react inside the ring.
   **NOT CLAIMED, and the three things that would kill it are named**: channel 1 at 0.2-0.6 may be
   too poor to adapt against and §50.1 prices degraded truth at ~2x; rule 35 says a soft sensor
   inside an adapting loop is positive feedback unless it was trained over the operating points
   that loop will occupy, and an ADAPTING loop occupies points the commissioning did not see; and
   the failure shape is the worst kind — excellent immediately, bad slowly, invisible to a short
   test. The falsifier is cheap and uses only what exists: run `guidedLaps` against the ESTIMATE
   rather than the tracker, freeze, and score with truth gone.
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

### THE DEPLOYED OBJECT CARRIES FOUR GUARDS AND ON SEVEN PLANTS OF TEN NONE IS ARMED (plan §100.1)

Rule 9b came out of three guards that shipped armed and unreachable. Applied to the rest of the
deploy path — *which of `actLook(look, speed, state, load, decls)`'s guard inputs does a host
actually pass?* — it gives a scope statement this file has never made:

```
  bend   (§78)    bendGuard = !!o.bendGuard   default FALSE — and NOT ARMABLE through the one
                                             press until §102.1: AutoStack never passed it
  load   (§82)    loadGuard = !!o.loadGuard   default FALSE — same; the only way §82's was ever
                                             armed is distil-arm.mjs poking pol.loadGuard = true
  decl   (§90.4)  declGuard = !!o.declGuard   default FALSE since §102 — and it had NO FLAG until
                                             then, arming itself off the presence of a declared
                                             span, so declaring bought the 2x §100 measured
  speed  (§49)    no host supplies speedAt    speedSpan NULL, and rigs/ladder.mjs passes no ctx.speed
```

**So on the mill, the barrel, the column, the cart-pole, the real flexible arm, the real cascaded
tanks and the real steam exchanger — seven of ten — the deployed object runs with ZERO armed
guards.** Only the 2R arm (through `autohost.js`, which supplies `speedAt` AND `ctx.speed`) and the
quadruple tank (its own loop) ever arm one. **This is NOT a defect and the reason matters**: with
no `speedAt` the fit records `speedSpan: null` rather than inventing a span, which is rule 25 done
correctly, and those plants have no commanded-speed analogue at all — a mill's LINE speed is not a
trajectory speed, a regulator holding a setpoint has none. What is wrong is only that this file
GENERALISES: `distil.js`'s row lists the speed fade as one of three guards "each carrying the
measurement that justifies it", and every measurement behind it (0.75x at half the trained feed,
0.53x untrained, §52.40's 1.17-1.19x above the commissioning feed) is on the ARM.
**The product sentence is therefore: on seven plants of ten an operating point the commissioning
never saw is met by an object with no mechanism of any kind for noticing** — and on the evidence
that is the better of the two configurations measured, because §100 armed the one guard that could
be armed on one of those seven and it cost 2.020x → 1.000x and 1.474x → 1.000x. What is missing is
not a guard but the measurement that would say whether any of the seven needs one: ONE operating
point, on ANY plant, where the frozen object reads BELOW 1.000x. `scoreOn`'s `decls`, `PLANTSPAN`'s
named overrides and `makeMill`'s operating point are three instruments for looking, and none has
found one. Read "the deployed object carries guards" as *the object implements them and two plants
arm one*.

**AND THE DECL ROW USED TO BE THE ODD ONE OUT IN A WAY THIS TABLE HID: IT HAD NO SWITCH (plan
§102).** The other three are read off a flag or off data a host supplies; `_declCoverage` and
`declGain` armed themselves off the PRESENCE of `report.declSpan`, which `addProgram` writes
whenever a host passes `declare`. So DECLARING a scalar and REFUSING outside it were one thing —
and declaring has independent value this repository already relies on, since `logSpec` names the
declared fields and `artefact.test.mjs` replays a decision from those fields alone (§77). A host
declaring `vLine` so an investigation could reconstruct a decision months later silently bought the
refusal §100 priced at 2x. **Rule 9b's mirror image**: not armed and unreachable, but REACHABLE AND
ARMED WITHOUT BEING ASKED. `declGuard` now sits beside the other two, default FALSE, and the mill
shows all three states with the commissioned point and both GAUGE rows at 2.625x throughout:

```
  DECL=0             nothing declared   guard off    SPEED 2.020x / 1.474x    <- reproduces §89.2
  DECL=1 DGUARD=0    vLine [5, 5]       guard off    SPEED 2.020x / 1.474x    <- declaring is FREE
  DECL=1 DGUARD=1    vLine [5, 5]       ARMED        SPEED 1.000x / 1.000x    <- reproduces §100
```

Rows 1 and 3 reproduce the two measurements on record exactly, so the switch was relocated rather
than either result removed (rule 21). Row 2 is what the separation buys: on a real plant the span
is on the record for an investigation and reaches no decision. **And rows 1 and 2 are BYTE-IDENTICAL
in the output**, which is the right behaviour and unreadable reporting — if the `declare` plumbing
broke, that run would look the same, which is exactly what §90.4 shipped and §100 found — so the
harness prints which state it is in, read off `report.declSpan` rather than off the env knob.

**AND THE TABLE ABOVE WAS TOO KIND TO TWO MORE ROWS, WHICH ONLY A TEST OF THE SHIPPED PATH COULD
SHOW (plan §102.1).** *Default FALSE, off on the measurement* is true of `loadGuard` and `bendGuard`
and it understates the position: **`AutoStack` never passed either of them to the `DistilPolicy` it
builds**, so `distil: { loadGuard: true }` through the one press was silently ignored and neither
guard was ARMABLE at all. The only way §82's was ever armed is `distil-arm.mjs` doing
`pol.loadGuard = true` on the object after the ladder built it. **So of four guards, exactly ONE has
ever been armed through the one press** — the speed fade, which rides on `report.speedSpan` rather
than a flag and so is the only one with no wiring to get wrong — and the other three were each
unreachable in a different way: §82's could never exceed its own threshold, §78.5's was calibrated
on a signal that could not trigger it, §100's was never called, and these two had no path from the
option to the object. **Rule 9b for the fourth time, and every one of them passes a thorough unit
test**, because a unit test calls the function and what is broken is the wiring to it.

It was found by a test of the PATH: `learnLive` — the page's own *Learn on this program* button —
had **no Node test at all**, and driving it on a ONE-CHANNEL host that supplies no `speedAt` turned
up a third thing, a second copy of the `heldCorr` helper §90.3 repaired, still carrying both of that
section's faults (`held = [0, 0]` with the channel count written in, and an unguarded
`tr.speedAt(k)`). The arm hid it twice over — nc is 2 there and `autohost.js` supplies `speedAt` —
so both copies agreed on the only host that ever ran them. One `_heldCorr` now, both sites calling
it. Every fix is default-off and byte-identical: EMPS 424.82x, `artefact` and `autostack` green.

### WHAT A MACHINE ACTUALLY RECEIVES (plan §53)

Four footprints were being conflated and nothing named them. `test/inventory.test.mjs` classifies
every module in `lib/` by its fate on a real installation and FAILS when one appears that nobody
classified, so the boundary cannot rot quietly:

```
  lib/ is 69 modules, 29,202 lines. On an installation:
    DEPLOY        1 module      117 lines    0%   runs for ever — a dot product and a clamp
    COMMISSION   20 modules  13,684 lines   47%   runs once, on the PLC, then idle
    BENCH        29 modules   7,670 lines   26%   the plant SIMULATOR — a machine HAS a machine
    RETIRED       4 modules   2,639 lines    9%   superseded, kept because its test is the record
    OTHER        15 modules   5,092 lines   17%   the other pages of this sandbox
```

**The product is the first row: 117 lines and a 1.8 kB JSON record.** A quarter of this repository
is a lattice simulator that exists only because there is no real arm here.

**AND THE DEPLOY BOUNDARY IS PINNED RATHER THAN ASSERTED.** `distil.js` has claimed since §49 that
the deployed object needs "no QP, no forecast bank, no tracker, no lap index and no per-plant
constant"; nothing checked it, which is rule 30 in the module whose whole value is that claim.
`lib/pilot/deploy.js` reimplements the act path **from the stored record alone, importing nothing**,
and `test/pilot/artefact.test.mjs` asserts the two agree **BIT-EXACTLY** over 4,000 random windows —
not to a tolerance, which would hide the drift it exists to catch — with the both-halves control
that a 1e-9 change to one stored weight must move >150 of 200 decisions. Strip the covariance and
the report and the machine is byte-identical: the record IS the controller. `EXPORT=<path>` writes
a conformance vector so a PLC vendor can check a port in any language without running this repo.

**THE SUITE STATES ITS OWN COST.** `t()` is the one choke point every test passes through; it times
each and prints the total and the twelve slowest at the end, on success and failure alike. Rule 2
had been applied to individual checks for the whole project and never to the suite, which is why
the tier split could drift twice without anyone being able to re-derive it.

**TWO SIMPLIFICATION CANDIDATES WERE MEASURED AND THEY DID NOT AGREE.** The `hff` FALLBACK teacher
**never fires** — engine `pilot` on 16 of 16 training runs across four seeds — but it is NOT removed
and the measurement is why: the fallback fires when no cascade layer is built at all, which none of
those seeds reached, so 16/16 says the net was never needed here and not that it is unnecessary.
Deleting a safety path on the strength of never having fallen is the reasoning this file exists to
prevent; it is classified RETIRED with its reason instead. And the teacher's QP is **inert within
the seed spread** (TEACHITERS 2 → 0.4% worse, 1 → 1.6%, against a 2.1% spread over four draws) —
the ninth independent inert on the teaching path, and the same finding as §52.16's from the other
end. What it licenses is narrow: the teacher still needs a forecast to produce any increment, so
this does NOT say `pilot.js`'s 4,534 lines are removable, only that the solve inside it is barely
working — which is what §52.29 predicts, since the oracle port replaces exactly what it inverts.

**AND THE INVENTORY'S OWN FIRST WALKER WAS WRONG, RECORDED BECAUSE IT NEARLY SHIPPED AS AN ARGUMENT
FOR DELETION.** A static-import walk reported **8,648 lines "unreachable from any page"**; four of
those modules (~1,900 lines) are `await import(...)`ed by `flowsim.html` and are as live as anything
else. Rule 17 aimed at a dependency graph — the instrument was incomplete before the codebase was
untidy — and the corrected answer is the opposite of the first: **nothing in `lib/` is rotting.**
Every module is page-reachable or test-exercised, and that is now a check rather than a hope.

### EVERY PLANT HERE IS A SIMULATION, AND THREE NOW HAVE REAL PROVENANCE (plan §55)

**This file said "real machine, real data" about the EMPS axis and that overstates it.** The EMPS
rig is a SIMULATION: its constants are read out of `DATA_EMPS.mat`, its friction is a 61-bin curve
binned from the raw record, its program is reconstructed from the recorded reference to 1.18e-5 m.
What is real about it is the PROVENANCE OF ITS PARAMETERS, not that anything of ours ever moved a
real axis. That distinction is now stated where the claim is made, and three more plants join EMPS
on that axis — a flexible robot arm, cascaded water tanks and a steam heat exchanger, identified
from published records in `test/pilot/rigs/realdata/records/`.

**A RECORDED TRAJECTORY IS NOT A DEPLOYABLE PLANT, AND THAT IS THE WHOLE REASON THIS TOOK A
BUILD.** Our method must APPLY a correction and MEASURE the result; a record says what the machine
did under ITS input, never what it would have done under ours. So the route is EMPS' own —
identify, validate held out, simulate, deploy — and what licenses it is the validation, taken by
**FREE-RUN SIMULATION** rather than one-step prediction. A one-step predictor is handed the true
`y[k-1]` at every sample and so scores well on any smooth record: it measures the sampling rate,
not the model. That number is quoted beside every control result these plants produce.

```
  plant                       held-out free run            ships          refuses
  flexible robot arm          2.83% in ACCELERATION        1.93x          the pilot cascade
   (DaISy 96-009)             36.45% in POSITION           conventional   (correction wrong, not clipped)
  cascaded tanks              0.649 V, on the benchmark's  6.54x          — (cascade deploys, 2 layers)
   (Schoukens & Noël 2017)    OWN second excitation        cascade
  steam heat exchanger        0.663 degC of an 8.6 degC    89.8x          the pilot cascade
   (DaISy 97-002)             range — the weakest here     conventional
```

**ALL THREE IMPROVE, SO TARGET 3's IMPROVE-OR-REFUSE CLAUSE HOLDS ON ALL TEN PLANTS — AND THE MOST
USEFUL THING THEY MEASURED IS HOW MUCH THEIR OWN FACTORS ARE WORTH.** A plant identified as a
linear ARX sits INSIDE the conventional rung's hypothesis class: the basis is `[a, v, sign v, 1]`,
the plant is linear, the inversion is exact, and the number measures the class rather than the
machine (rule 15). The tank read **2012x** that way, which is not a plausible controller result and
so is a reason to check the instrument rather than to celebrate (rule 14). Checked on both plants
that can carry the control, and they share no physics (rule 18 in its useful direction):

```
  cascaded tanks     linear 2012.2x  ->  documented OVERFLOW restored   6.5x      a factor of 307
  heat exchanger     linear 1363.7x  ->  counterflow effectiveness     89.8x      a factor of  15
```

The collapse scales with how far the plant sits outside the class — a hard clip costs 307x, a
smooth exponential 15x — which is what makes it a mechanism and not a coincidence. **The standing
caution is general and applies to anything built this way: a "real data" plant obtained by fitting
a LINEAR model to a record is a soft target for a linear feedforward, and its factor is not a
claim about the machine.** EMPS escapes it only because its rig is a nonlinear simulation — binned
friction, drive saturation, encoder quantisation — rather than an identified ARX.

**AND THE ARM IS THE FALSIFIER FOR A CLAIM THIS FILE DREW ON A SIMULATOR.** §52.36 called an FIR
window "hopeless" for a lightly damped resonance, then measured the lattice arm's ring at 5.6x
decay per cycle and softened the claim to "overstated". The real arm's identified modes decay
about **1.03x per cycle** — fifty times lighter. The number is a BOUND rather than a measurement
and the rig says so (a 1024-sample record cannot resolve a Q above ~65 and the fit reports 92;
the two modes come back with Q equal to within 1%, which is the fit near its own stability edge,
not two physical modes agreeing). What survives is the direction and the order of magnitude, and
they are enough: the regime §52.36 dismissed on a simulator's evidence exists on hardware.

**TWO MEASUREMENT FAULTS WERE MADE ON THE WAY AND BOTH ARE RECORDED, BECAUSE EACH ONE LOOKED
EXACTLY LIKE A PLANT PROPERTY.** Sizing the arm's program from the record's own acceleration range
was rule 41b in a new costume: that range is a RESONANT response reached where |H| = 36.7, while a
program lives where |H| = 0.108, so the first program demanded ELEVEN TIMES the torque the machine
has — and the symptom was a loop swept over 88 gain cells that could not beat DOING NOTHING at any
of them, which reads as "this plant cannot be controlled" and is actually "this reference cannot be
reached". Then the loop sweep itself scored 20 laps on a machine whose ring locks in over ~300
laps, because the program's 30th harmonic lands 0.8% from a mode whose half-power bandwidth is
1.1%. It duly picked the gain that locks ONTO the resonance: 1.06 at lap 20, **12.36 once settled**,
against 0.185 for the gain a settled sweep picks — **sixty-seven times better**, and rule 12 for
the seventh time in this project. Every number on that plant is now taken after a settle whose
length was measured (13 laps) rather than assumed.

**THIS FILE USED TO SAY THE MISSING SIX-AXIS ROBOT WAS AN ACCESS PROBLEM. IT WAS OBTAINED, AND IT
IS A MEASUREMENT PROBLEM (plan §55.8-§55.12).** The KUKA KR300 benchmark was supplied by the owner
after every host serving it was refused, read, identified and measured over four sections — and
then DELETED, because its records were 222 MB, 89% of this repository, and what the measurement
established is that they cannot support a plant at all: **gravity is the torque, the inertial term
sits below the fit's own residual on five of six joints, and a forward simulation therefore reads
R² at or below zero even in sample with every quantity measured.** The record identifies the
robot's STATICS where a forward simulation needs its DYNAMICS, which is a property of its
EXCITATION and not of the method. So the real multi-axis-arm gap is STILL OPEN, and the flexible
arm is still what stands — **one link and 1024 samples against six axes** — but the reason has
changed from "we cannot get it" to "that one does not work, and here is the cheap screen that
says so before anything is vendored: decompose the torque, and if the inertial term sits below a
plausible model residual, the record is a regression benchmark and not a plant.

**AND OPENML IS THE WRONG SHELF FOR THIS, WHICH IS WORTH WRITING DOWN BECAUSE IT LOOKS LIKE THE
RIGHT ONE.** It is an i.i.d. tabular benchmark repository, and its format strips the two things
needed here: the time ordering and a CONTROLLABLE INPUT. Its arm-adjacent sets — `pumadyn`,
`kin8nm`, `elevators`, `ailerons`, `bank8FM` — are the trap: they look like robot dynamics and are
either synthetic to begin with or rendered as shuffled regression tables. They can be fitted; they
cannot be DRIVEN, and a plant we cannot apply a correction to is a regression dataset.

**AND AN ELEVENTH PLANT ARRIVED WITH THE ONE PROPERTY NONE OF THE OTHER TEN HAS: ITS GROUND
TRUTH IS FREE (plan §57).** A real load cell under deliberate, sustained vibration — grain in a
shaking basket, true mass known from a 0.01 g reference scale (Sitorus 2021, Mendeley Data,
CC BY 4.0; supplied by the owner, the host being refused here). Every other plant in this project
needs an instrument the customer does not own; this one needs a bag of grain. **Vibration is the
whole problem** — the experiment's own unshaken control scatters 0.47 g against 8.39 g shaken,
17.9x — **and the error is AUTOCORRELATED** (median lag-1 +0.404, worst +0.84), which is the
precondition for any model to beat a mean, and which makes an 8-sample average land 1.40x worse
than independent-noise theory predicts. Held out by LOAD LEVEL — necessary because the true
weight takes only five values and a model given the window mean would otherwise SNAP to the
nearest, a five-way classification wearing a regression's clothes — **a learned window beats a
CALIBRATED mean by 1.65x (2.51 g → 1.52 g at K=32)**, with the calibration itself earning its
place at 1.39x so the comparison is against a real incumbent (rule 15). **The window is
load-bearing and nearly cost the result**: K=4 is worth 1.006x and K=8 is 1.047x, so the first
pass read "no product" from a window too short to carry the structure — rule 37 on hardware,
with the reach measured rather than assumed. **AND IT DOES NOT TRANSFER BETWEEN RIGS: median
1.08x over 12 ordered pairs against 1.65x at home**, and the incumbent's calibration constant
transfers no better (carried across rigs it is often WORSE than the raw mean). So the product is
a SELF-COMMISSIONING estimator and never an algorithm shipped blind — which is viable only
because the truth is free, and is every transfer negative in this file read from the other side.
Stated limits: a shaking basket is NOT a batching hopper, nothing here measures settle
prediction, and with no timestamp in the record every number stays in SAMPLES rather than
seconds. The batching hopper itself has **no public data at all** — searching returns patents,
not datasets — so `rigs/batch-rig.mjs` is a simulator that found four calibration faults in
itself and then declined to answer, its own settle length deciding the result (rule 15).

**STILL OUT OF REACH AND WANTED, in the order their evidence would be worth most:** Bouc-Wen,
whose hysteresis is a nonlinearity class nothing here contains and which is adjacent to §52.46's
backlash finding; Silverbox, a lightly damped resonance driven by a known input, which would give
the arm's result a second plant; and the Wiener-Hammerstein and Coupled Electric Drives sets. All
four are reachable only through hosts this session is refused, or through Git LFS. The KUKA is no
longer on this list — it was obtained and it did not work, which is a better outcome than still
wanting it.

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

**AND WHAT THAT CELL COSTS IS NOW MEASURED (plan §52.28).** By the machine's own constants
the bench cell's slowest structural mode is **1.9x its position loop**, where a real arm
runs 5-20x. That does not merely make the problem hard: it removes the timescale separation
every feedback method requires, and it is why the loop cannot be raised (2e-3 is already the
cell's optimum, 6.04x against 4.08x at 4e-3) and why a correction takes ~950 steps. Three
sessions of feedback work were spent inside that cell before anyone checked it. The rule
STANDS for performance claims — it is still the cell that cannot flatter — but a STRUCTURAL
verdict ("feedback is impossible here") must be re-measured at a cell with separation before
it is stated as a property of the method: at K 64 / E 0.20 with the loop at 0.40 of its
slowest mode, the feedback layer deploys and helps.

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
9b. **A GUARD IS NOT VERIFIED BY A UNIT TEST, BECAUSE WHAT FAILS IS THE PATH TO IT — ASSERT
   THAT IT FIRES THROUGH THE SHIPPED CONFIGURATION.** Three guards here shipped armed and
   inert and every one of them passed its own unit test, because a unit test calls the
   function directly and the defect was upstream: §78.5's bend guard was calibrated on a
   sine, which is never locally straight, so a hold or a ramp read Infinity; §82's load
   guard maxed its reading over probe runs with no correction armed, so its fade began
   above a reading that is capped at 1 and it could not fire at any load; §100's declared-
   point guard was **never called at all** — `AutoStack` passed four arguments where the
   fifth was the one that mattered. **And when it finally fired it cost the machine 2x**,
   which is the other half: score a guard on DELIVERED OUTCOME, never on faithfulness to
   its own declaration. A stale declaration is a reason to RE-MEASURE; only evidence that
   the correction HARMS licenses refusing, and *degraded* is not *harmful*.
   **AND THE MIRROR IMAGE IS THE SAME DEFECT: A GUARD THAT ARMS ITSELF OFF THE PRESENCE OF
   DATA HAS NO SWITCH, AND SOMEONE SUPPLYING THAT DATA FOR ANOTHER REASON BUYS IT UNASKED
   (plan §102).** `_declCoverage` armed on `report.declSpan` existing, and a span exists the
   moment a host declares — which hosts also do for FORENSICS, since `logSpec` names declared
   fields and a faded decision cannot be replayed without them. So *declare this so the log can
   name it* and *refuse outside it* were one switch, and the second cost 2x. Every guard needs a
   flag of its own, defaulting OFF, even where the data it reads is already on the record.
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
| `lib/pilot/` | The controller — described once, in Libraries below (rule 30). **The DEPLOYED object is `distil.js`'s weight vector and nothing else**; `lib/pilot/deploy.js` reimplements that path from the stored record with no imports, `test/pilot/artefact.test.mjs` asserts the two are bit-identical, and that pair is what a machine actually receives. Everything else in the directory runs at COMMISSIONING only. |
| `version.json` | Server-side build manifest for stale-page detection. |
| `modules.json` | Generated list of every script, so `reloadFresh()` can bust the ES-module cache. |
| `docs-manifest.json` | Generated list of every `.md`, for the Docs viewer. |
| `stamp-version.sh` | Pre-commit build step: stamps the version and regenerates both manifests. |
| `vendor/` | Self-hosted marked, three.js and Plotly. No CDNs. |
| `test/run.sh` | The suite. See "What `./test/run.sh` actually runs" above. **Every check runs through a failure COLLECTOR** — under `set -e` the first red test aborted the run and took the twenty after it with it, twice now (`composite.test.mjs`, then `tanks.test.mjs`); failures are collected by name and the run exits non-zero at the END with the list. It found **three** red tests that were invisible behind the tank's abort, **and all three are GREEN today — re-checked against a full node tier of 887 checks and 0 failures (plan §54.2), which is rule 4 in the direction this file warns about: a claim of RED goes stale exactly as a claim of green does.** The tank was repaired by `verifyRef`; Wood–Berry read IAE 82.10 against the 72.08 recorded here and now **REFUSES** (representative regime 0.01x) and delivers 43.90, which IS the do-nothing number, so the harmful deployment the row was reporting no longer happens; and `stack.test.mjs`'s EMPS cascade still admits two layers rather than three — the BEHAVIOUR is unchanged and the test now asserts it, layer 2 refusing at verify 0.95x with forecast R² 0.177 and a third layer's held-out R² at 0.0248. Two different reasons for one colour, which is why the distinction is worth keeping rather than deleting the row. `--browser` / `--node` select which HALF runs — a wiring change cannot break a golden vector, and charging it 450 Node checks is what makes a suite something to avoid. |
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
| `distil-column.mjs`, `distil-barrel.mjs` — `DSEED` | **THE TWO PLANTS WHOSE HEADLINE WAS ONE DRAW ARE NOW DISTRIBUTIONS, AND THE RANDOM VARIABLE HAD TO BE THE DIET (plan §84.8).** `spread.mjs` cannot reach either: both rigs are DETERMINISTIC (§84.3 measured two `fresh()` runs agreeing bit-exactly) and the column's cascade REFUSES, so nothing downstream of a seed moves — `distil-tank.mjs`'s three byte-identical "seeds" are the recorded signature of that (rule 61 aimed at a seed). So `DSEED` draws the DIET from the same design space the shipped one occupies — four composition cycles on the column, four recipe orderings on the barrel — with unset byte-identical. **Twelve draws on two plants, 6 of 6 DEPLOYING and 6 of 6 HELPING on each, spreads 1.53x and 1.66x, nothing made worse.** Read that against `spread.mjs`'s Wood-Berry — a 4.2x spread with **9 of 12 deployments worse than the 3 refusals** — which was the TEACHER: on the object that ships, the plant this project lost on for its whole history helps on every diet tried. **And the two shipped diets sit on OPPOSITE sides of their own distributions, which is the useful half**: the column's hand-designed diet (3.959x) BEATS all six draws, so the design is worth ~1.26x over a median draw and the headline is a selected value; the barrel's shipped ordering (6.997x) sits BELOW the median of six (8.16x), because §66 deliberately chose orders production never runs and that conservatism costs ~14%. Stated limit: a random barrel ordering may contain production's own transition sequence, which the shipped one avoids by construction, so the barrel's median is an upper reading and its shipped figure stays the one to quote. |
| `test/pilot/spread.mjs` | **EVERY PLANT'S NUMBER IS ONE COMMISSIONING DRAW, AND THIS IS THE DISTRIBUTION IT CAME FROM.** Runs each plant's OWN test with one module-level seed offset changed — no rig is copied, nothing is re-scored — and splits the draws by whether the pilot ACTED, because a refusal's score belongs to the plant and not to the controller. It found that the winners are repeatable — EMPS 1.05x, arm 1.13x, and the COLD MILL 1.07x with **8 of 8 seeds deploying and all eight helping**, the cleanest distribution any plant here has produced — while the two others are draws of 2.2x and 4.2x, and on Wood–Berry all 9 deployments are worse than the 3 refusals. The mill's scrape moved with its result: it used to read the VERIFY ratio, because while the plant refused that was the only number that moved, and now reads the delivered µm rms. A seed that refuses lands there as the open loop's 15.15 and is visibly worse, which is what a refusal should look like in a table that keeps refusals as results. |
| `test/pilot/sixplant.mjs` | **THE SIX-PLANT PASS — the table that has to exist before any solver default moves, and whose absence is why two regressions shipped. AND IT HAD THE FAULT IT WAS BUILT TO CLOSE UNTIL plan §54.3**: it ran six PLANT tests and scraped six headlines, while the regression that was made the default and then reverted went red in `autostack.test.mjs` and `stack.test.mjs`, NEITHER of which is a plant test. Both now run under every configuration, cheapest first, a red one short-circuits the rest, the failing checks are NAMED, and the summary leads with contracts and prints DISQUALIFIED however good the headline table looks (rule 27); `CONTRACTS=none` prints as a stated skip. **It also gained rule 61's own remedy**: the child prints its ACCEPTED defaults through `getSolverDefaults` and the parent compares, so a configuration this table PRINTS is asserted to be the one the plant COMMISSIONED with — pinned both halves, since `qpIters` 0 clamps to 1 and duly reads CONFIG DRIFT. Runs every plant's OWN test in a child process with `setSolverDefaults` set, and scrapes that plant's OWN headline, so no plant is re-scored by a metric this file invented; refusals stay in the table because a refusal is a result. It chose today's defaults (2 iterations at 1.2·Tset) by rule 42's band, took the deployed EMPS path from 429% of a PLC scan to **95%**, and found a NaN no check could see. |
| `test/pilot/tankspread.mjs` | **A PLANT'S SCORE IS A DISTRIBUTION.** Commissions the tank from N seeds and reports the spread, the deployed median, and the GATE'S OWN ESTIMATE beside what it delivered. It asserts nothing — an instrument that decided its verdict before the verdict was understood is how the 1.32x got written down. What it measured: at the old defaults 4 of 8 seeds deploy and **all four hurt**; at the new ones 5 of 8 deploy at a median 1.249x, two still hurt, and the gate's estimate correlates **-0.057** with delivered benefit. |
| `test/pilot/qpsweep.mjs`, `qpsweep-arm.mjs` | **Not tests — the solver-budget experiment.** Commission ONE pilot, re-deploy that same model over a grid of QP iteration counts and horizon lengths, and score the MACHINE. Found that the shipped 60 iterations at `1.5·Tset` is 57× more arithmetic than the machine wants and WORSE than 1 iteration at N=56 (EMPS 14.16× against 12.70×, at 101% of a PLC scan's 10% against 5761%), and that the arm agrees at 29× cheaper and 16% better. Scores a held-out program in the same table, because the surface is rugged enough that the best cell of a grid is a suspect result. |
| `test/pilot/rti.test.mjs` | A FALSIFIED HYPOTHESIS, pinned as the four things measuring it found. One QP iteration per cycle does not track sixty (88% of the applied signal); sixty is itself 36% from this solver's own optimum, so every delivered number in the project came out of a truncated solve; the convergence curve at N=8 matches N=48, so the rate is the Hessian's conditioning and not the horizon; and the Lipschitz bound is 1.82× above the true spectral norm, which costs exactly 2× in iterations. |
| `test/pilot/observe.mjs` | **Not a test — IS THE RESIDUAL OBSERVABLE FROM THE MOTOR SIDE, AND THROUGH WHAT LIFT? (plan §52.21).** Runs the distilled machine on the square, the circle, the rounded rectangle and the polygon diet with a per-step tap on the measured signals and the truth, then fits the residual offline from nested feature sets — the command window, linear motor lags, a quadratic lift, an ENERGY lift (the quadratic forms an energy is made of, plus windowed power integrals), the pilot's own row shape — and scores every fit TWICE: on later laps of the fitted program (the memory control, where everything reads 0.9-1.0) and on programs the fit never saw, at a ladder of ridges and leads. The second column is the claim: a linear observer transfers at R² 0.3-0.6, the lifts transfer worse, and a lap-held-out 1.000 was a memory. **Now ONE normal matrix per program over a 314-column library in named groups** (plan §52.22), so every set is a sub-matrix solve: adds the INSTRUMENTS (tool accelerometer with noise, link strain, gearbox wind-up) and `SELECT` — greedy forward selection scored leave-one-polygon-out, which found no transferable energy subset; `TARGET=wu|bend` makes a hidden state the target (plan §52.23), and the pose-scheduled groups and the two-stage CHAIN are built in. |
| `lib/pilot/deploy.js` | **THE DEPLOYED CONTROLLER, AND NOTHING ELSE — the artefact a machine receives (plan §53).** 117 lines, importing NOTHING: a feature row from a window of the commanded reference, a dot product per channel, a smoothstep coverage guard and a clamp. It is a complete reimplementation of `distil.js`'s act path from the STORED RECORD, which is what turns that module's prose claim ("no QP, no forecast bank, no tracker, no lap index") into something falsifiable — `test/pilot/artefact.test.mjs` asserts the two are bit-identical. It is also the implementation note a PLC vendor works from. |
| `lib/pilot/deploy.js` — `windowBend` | **THE FAULT THAT ACTUALLY COSTS, AND THE GUARD FOR IT (plan §78).** Asked what a WRONG-BUT-FINITE window does, all six fault classes were measured and then SCALED BY THE HARM THEY DO (rule 19), which inverted the answer: the cheap detector — the window's implied speed against the host's declared speed — catches a FROZEN input exactly, and a frozen input moves the correction by 5.4%, while a single CORRUPTED TAP moves it **106% of its own rms and past the cap** and is invisible to it. The guard that works is a smoothness ratio (worst interior tap's bend over the median tap's — no plant constant, the curvature divides out) against `report.bendMax`, **the worst bend the commissioning itself observed**, stored beside the speed span exactly as that is. Corrupted-tap detection is 198/200 at the shipped margin. **AND IT IS OPT-IN AND OFF, BECAUSE THE "ZERO FALSE REFUSALS" THAT FIRST ARMED IT IS RETRACTED (plan §78.5).** That sweep scored both halves on a SINE, which is never LOCALLY STRAIGHT — and a hold or a constant-slope ramp has a median bend of exactly zero, so one legitimately entering tap reads Infinity and a healthy window is refused. Calibrated on one kind of signal and checked on the same kind (rule 15). It showed as the TANK moving 2.593x → 3.09x with the fit byte-identical: a guard can only refuse, so an improvement is a reason to check the instrument (rule 14), and guard-off restores 2.593x exactly while the arm, column, mill and barrel are unchanged either way. The deeper limit is that this statistic cannot tell a corrupted tap from a legitimate CORNER — both put one tap off the local line. **And the accident left a real question worth more than the guard, WHICH IS NOW ANSWERED AND IS NOT THE QUESTION IT LOOKED LIKE (plan §79).** It appeared to be *when should a reference-addressed map act*; both structural readings are refuted on the machine — the map helps MOVING (2.68x) and HELD (1.35x), at KINKS (1.36x) and SMOOTH (2.67x) — and a UNIFORM gain of 0.90 reproduces the guard's entire benefit to three figures. So it was never a statement about when to act; this plant's map is simply applied at the wrong GAIN, and the false refusal was a clumsy way of applying less. A stale program, an off-by-one lap phase and a reversed window are all VALID windows at the wrong time and are structurally undetectable from the window alone; measured, they cost 9.9-35.7%, 0.2% and 10.7%. It roughly DOUBLES the deployed arithmetic (104 MAC against 102) and that is stated rather than folded in. |
| `lib/pilot/deploy.js` — `explain`, `logSpec` | **THE FORENSIC HALF OF THE ARTEFACT, AND THE COLUMN THIS OBJECT WINS (plan §77).** The requirement a learned controller actually has to meet is not that a human can read its weights — an engineer tunes once and leaves it alone — it is that months later, from a log, an investigation can establish exactly how a bad number was produced. `logSpec` states what an installation must record per decision and it is **31 numbers** on the reference record (15 offsets x 2 reference channels plus the commanded speed); a decision rebuilt from ONLY those fields reproduces the original **bit-exactly**, with the replay closure THROWING if asked for an offset the spec omitted, so the spec is checked sufficient rather than asserted. `explain` returns the per-term account — name, value, weight, product, coverage gain, whether the clamp fired — and its contributions sum to the applied number **bit-exactly in the order `decide` sums them**, because floating-point addition is not associative and a reordered sum would disagree in the last bits exactly when an investigation cared. Checked non-decorative by perturbing one weight and seeing exactly one term move (rule 9). Both live in the DEPLOYED file because an investigation happens on an installation and not in this repository. **It beats a PID+FF for a structural reason**: a PID's output depends on accumulated integrator state that logs usually do not carry, and this is a pure function of a window the machine already knows. |
| `test/pilot/artefact.test.mjs` | **THE DEPLOY BOUNDARY, PINNED — and the deliverable's acceptance test.** The two implementations share no code, so if anything on the deploy path ever reaches for the fit side this goes red. Bit-exact over 4,000 random windows, with the both-halves control (rule 9) that a 1e-9 weight change moves >150 of 200 decisions, so the comparison cannot be vacuous. Also pins that stripping the covariance and the report leaves the machine byte-identical, that coverage is exactly 1 inside the trained span and exactly 0 beyond the fade, and that translating the whole program moves only the window-centre terms — the structural reason the object transfers. `EXPORT=<path>` writes a conformance vector. |
| `test/inventory.test.mjs` | **WHAT SHIPS, WHAT COMMISSIONS, WHAT IS ONLY THE BENCH (plan §53).** Classifies every module in `lib/` as DEPLOY / COMMISSION / BENCH / RETIRED / OTHER and fails when one appears that nobody classified — a document would drift, and this file's own tables have already demonstrated that. Asserts nothing in `lib/` is unreachable AND untested, that the deploy set imports nothing, and that every retired module states WHY rather than merely that. Its walker follows `import(...)` as well as `from '...'`, because the first version did not and duly reported 1,900 lines of live FlowSim code as dead. |
| `test/_pagerate.mjs` | **Not a test — WHAT DOES THE BROWSER ACTUALLY COST PER MACHINE SAMPLE? (plan §52.45).** The host yields one `requestAnimationFrame` per 150 samples, so the rAF PERIOD is a hard ceiling on throughput that no physics change can move. Measures that period, then commissions and learns in ONE page session and reports samples/s for each — the control §52.35's "63-minute learn defect" needed and never had. It found there is no defect — 22-29 s per pass at ~4,000 samples/s in every configuration the suite puts the page in, faster per sample than the commissioning it follows — and so established that the hour was the suite's own wait reading `x.learning`/`x.learned` where the page publishes `x.auto.learning`/`x.auto.learned`, a condition that can never become true. `SPF`, `RUNFIRST`, `GRADE`, `PERIODIC` and `HOP` reproduce the suite's page state, because a fresh page is not the configuration the claim was made in. |
| `test/pilot/truthcost.mjs` | **Not a test — WHAT DOES A CHEAPER COMMISSIONING INSTRUMENT ACTUALLY SEE? (plan §52.42).** The cheapest thing that can falsify "the tracker is needed" (rule 1), run before spending a commissioning per instrument: the conventional machine on the bench square, and what each candidate reads against what the tracker reads, in the JOINT frame the teacher corrects in. **The motor encoders see 0.7-2.7% of the tool error on the bare machine** — the loop tracks its own encoder and the whole error is downstream — while on the conventional machine their larger signal is the compliance feedforward's pre-distortion and is anti-correlated; `FF=0` is the control that separates the two. It projects with the HOST's Jacobian inverse, because a first draft that used the transverse lever instead read −0.81 where the truth is +0.56 and supported the opposite conclusion (rules 47, 61). Reports correlation, scale and the residual the instrument cannot see, which is the floor on what a correction taught from it can remove. |
| `test/pilot/noilc-arm.mjs` | **Not a test — TARGET 8 WHERE THE TWO LAWS ACTUALLY DIFFER.** Norm-optimal ILC against `hff` on the ARM, where `hff`'s reach shrinkage is load-bearing (removing it costs 4.81x → 1.05x) rather than on EMPS where it is inert and the two agreed to five figures. One identification, one machine, one probe, one operator, one basis, one cap, one lap count — only the update law moves — and it drives through `makeArmHost` rather than a fourth private copy of the arm's routing (rule 61). `RSWEEP` sweeps the rival's OWN regulariser while `hff` gets no corresponding sweep, so if the rival wins anywhere in its own knob it wins the comparison. |
| `test/pilot/stepresp.mjs` | **Not a test — the two-path step response (plan §52.26.5), whose NUMBERS STAND AND WHOSE CONCLUSION IS INVERTED (§52.28).** The bench machine held, a step on the position command against a torque step at the motor: 951 against 948 steps, first peak at 2,100. It read that agreement as "the gearbox spring is the plant's low-pass, not the loop". Both paths run through the CLOSED LOOP — the torque step is added on top of `servo.torques(...)`, so the PD pushes back — and two measurements through one loop cannot check each other (rule 15). The 951 is the position loop's designed bandwidth, and the agreement is the proof: at bw ≥ 2e-3 the two paths are identical to the step, and at 5e-4 they separate (5156 against 2467) as the loop slows out of the way. |
| `test/pilot/modes.mjs` | **Not a test — DOES THE RINGING FREQUENCY MOVE WITH POSE? (plan §52.36, the falsifier §52.34 named first).** Holds the arm at nine poses across the workspace the bench programs occupy, hits it with a torque PULSE and reads the free ring of the tool error from quantities that survive heavy damping — the peak, the crossings around it, the decay between extrema — beside the analytic `Jeff` prediction, because two routes to one number is what makes either usable. **Period 3166-3868 steps, a 1.22x span against the analytic 1.13x; decay 5.6x per cycle, so 2.3 cycles and a memory to 2% of ~7,850 raw steps** — against a program lap of 7,356, which is why no FIR window can reach the memory without spanning the lap. Its FIRST estimator detrended with a moving mean LONGER than the period and duly reported "no ring anywhere, coherence exactly 0.000", the signature of an instrument that found nothing (rule 17) — and the same fault §52.34 had just criticised in §52.16. |
| `test/pilot/timescales.mjs` | **Not a test — IS THIS CELL A MACHINE, AND WHAT SETS ITS RISE? (plan §52.28).** Three things from the constants the plant is built from and from the plant itself: the MODE TABLE (the position loop's bandwidth against each gearbox two-mass mode and each link's first cantilever mode — the bench cell's slowest structural mode is **1.9x** the loop where a real arm has 5-20x, and the lattice's elastic CFL caps E near 0.24 so 5.0x is about the widest this simulator can build); the BANDWIDTH SWEEP (the rise tracks the loop: 5156 / 2745 / 943 / 636 / 509 steps at bw 5e-4 → 8e-3); and the HORIZON AUTHORITY, the fraction of the response delivered inside a given window. |
| `test/pilot/looptune.mjs` | **Not a test — can the loop be tuned before any commissioning, and how much of a cell's error is its ACTUATOR? (plan §52.29, §52.30).** `DRIVES=` adds a torque-limit sweep: on the bench cell, removing the clipping entirely is worth 4% on the square and nothing on the other two, saturating by drive 64 — which is what refused the saturation reading §52.29 had shipped.**Also:** The CONVENTIONAL machine's contour rms on three programs at a ladder of servo bandwidths, with the drive's saturation beside it, on both cells. It refused the cheap route (the bench cell's bare error falls monotonically while the commissioned score peaks at 2e-3) and, in passing, retracted §52.28's "saturation is not the mechanism": measured with the compliance feedforward the ladder actually runs, the bench drive clips 2.0% of samples at the shipped bandwidth and 6.9% at the top, at 1.6x to 12.7x its torque limit. |
| `test/pilot/geom.mjs` | **Not a test — what does the pilot's horizon reach, in RAW MACHINE STEPS? (plan §52.28).** A lead is `grid` samples and a sample is `sample` raw steps, so the horizon is `N·grid·sample` and not `N·grid` — the units error this project keeps paying for, and one §52.28 nearly shipped. On the bench cell: Ts 2048, Tset 3360 (ratio 1.64, the 6·Ts clamp does not bind), sample 9, grid 8, N 70 → **5,040 steps** against a 943-step rise, with `hGrid` 97-117% delivered by lead 35 of 70. The inversion is not starved and the settle is honest, which killed §52.28's own second hypothesis before it shipped. |
| `test/pilot/consist.mjs` | **Not a test — IS THE CONVERGED CORRECTION A FUNCTION OF THE REFERENCE WINDOW, AND HOW MUCH IS LEFT IN IT? (plan §52.31).** Builds the shipped rows and converged targets for the diet and the square, standardises them, and reports target DISAGREEMENT against row DISTANCE — cross-program against the same-program control — fitting nothing. Cross-program and same-program track each other at every distance, so the function exists and generalises; `REPEAT=1` converges a prefix twice and finds the two draws differ by 1.4e-5 of the target's scale, so the scatter is structure and not teacher noise; and the disagreement at small distance caps R² at **0.89 measured, 0.93 extrapolated to zero distance** against the shipped fit's 0.856-0.870. **At most 1.1x-1.6x of the correction's error remains in the window**, which is the quantitative form of every negative in §52.16-§52.30. |
| `test/pilot/stateaug.mjs` | **Not a test — is the converged correction a function of the reference window, or of the machine's state? (plan §52.27).** Commissions the bench ladder, converges every training program's prefix and the square's own, runs each under its prefix tapping the motor-side vector, and regresses the PREFIX on the shipped row shape against the same row plus the newest measured sample, pose-scheduled, split into the reference's own sample (E) and the measured deviation from it (F): leave-one-polygon-out 0.836 → 0.803 (E) → 0.962 (F), the square 0.85/0.82 → 0.996/0.95 — the missing term is the deviation, which is feedback, which the gearbox cannot pass in time. **And §52.33 added the SMOOTHED deviation, which is the one form of feedback a plant with a 951-step rise could safely be given** — a bias trim has almost no gain at the frequency that rings — and it is worth LESS the more it is smoothed: 0.906 averaged over 256 steps, **0.756 over 1024 and 0.664 over 4096, both BELOW the 0.836 of the reference window alone**. Rule 39's split answers the arc's standing question: what the window cannot see is OSCILLATION, not bias. |
| `test/pilot/distil-arm.mjs` | **Not a test — the instrument that reads a distilled-rung refusal to its cause, and the one every knob in plan §52.8 was measured through.** Runs the bench's ladder on the arm at a chosen grade (`GRADE`, `DIET`, `ENGINE`, `REPLACE`, `TEACHCAP`, `STRIDE`, `WIN`, `OFFS=raw`, `PASSES`, `PERIODIC`, `LOO`), then scores the fitted policy on its OWN training programs — evaluated as it deploys, once per decision and held: helps them and harms the square → transfer; harms them too → the fit or the deploy path. Knobs for the structural experiments of plan §52.16 too: `Q`, `PARAM=1`, `REF=angles|torques|both`, `DIET=tour2`, `RIDGE`, `ONLINE=0`, `SOFFS`, `LAPSYNC=1`, `ARM_BL`, and for the feedback layer `FB=1`, `FBCAP`, `FBGAIN`, `FBBASIS`, `FBSCHED=order,lags,cmd,fn`, `FBOPTS=key=value,...` (any pilot option for the layer alone), `LEADPROBE=1`, `FBFORECAST=1` (the layer's forecast scored on the square, at a ladder of leads), `FBEXT=1` (the separated forecast bank through the oracle port; `FBEXTLAM`, `FBEXTSIGN`, `FBEXTLAMBDA`), `FBLAW=prop` (a proportional law in place of the QP; `FBLAWG`, `FBLAWLEAD`), `SEED`, `BASIS`, `INSTR=1` (strain and wind-up in the pilot's measured vector), and for plan §52.27 `CORNERSHARE=1` (the residual's energy by distance from each corner), `HELDOUT=1` (the rounded rectangle and the circle scored beside the square), `DIET=rects|rectspoly`, `STATE=1` and `STATEROUNDS` (the state term and its in-the-loop rounds), `GUIDED=<laps>` (the commissioning-phase online adaptation, which §52.29 measured as bit-identical through the oracle-fed teacher and worth 11% without it), and for §52.28-30 `FEEDSPAN=<list>` (target 2: one commissioning scored at a ladder of feeds, each against the conventional machine at that feed), `ARM_BW` (the servo loop's bandwidth, the plant constant that was carried across every cell) and `ARM_DRIVE` (the torque limit as a multiple of the gravity hold torque) — both unset are byte-identical. **And for §52.33 the four that produced this project's largest composed gain:** `WINRAW=<steps>` (the window's reach in RAW machine steps rather than pilot samples — the default is in samples and the pilot's stride moves with the bandwidth, so every bandwidth number before §52.33 was two variables at once), `TEACHREFUSED=1` (a cascade that lost its verify may still TEACH, since the teaching port replaces the forecast its verify scores), `LEARN=<passes>`/`LEARNMODE` (the learn-on-program law of §52.18 through the harness), and `DPT`/`QPITERS` (the two regularisers of the horizon's inversion, swept and refused as the cascade's marginal-verify mechanism). At its defaults it reads the host's shipped configuration: **1.7528e-1 on the bench square, 6.04x, 10.7 machine-minutes, ~160 s of Node** (plan §52.16). |
| `test/pilot/pend.test.mjs` | **A SEVENTH PLANT, AND THE ONE CLASS THE OTHER SIX DO NOT CONTAIN: OPEN-LOOP UNSTABLE (plan §52.32).** A nonlinear cart-pole that the test asserts diverges — 1e-4 rad to 0.5 rad in 1.36 s with no force — under a cascade an installation would already have, with the pilot correcting the cart's position REFERENCE and the TIP scored, which is not what the stabiliser regulates. Told four signals, one channel, its authority, a box, a GUARD on the pole angle and a representative program; nothing about pendulums or instability. **Deploys at 9.4-9.8x across four seeds (spread 1.04x, the tightest here) and saturates at 13.7x rather than running to its cap — and on a stabilising loop tuned 3.5x better it REFUSES all four times with a stated reason.** So the headline was the loop, caught prospectively for the first time; `PEND_UCAP`, `PEND_SEED` and `PEND_TUNED` are the knobs. **AND IT IS NOW SETTLED: NOT A WINNER, NOT STRUCK (plan §84.10).** The standing objection was that the shipped correction sits at EXACTLY its cap (uPk 0.1500 of 0.15), which is the BARREL's own failure signature — so the tuned loop's refusal might be an authority artefact. Swept over a 24-fold span of authority on both loops, no build at all: the shipped loop reads **1.559x / 9.770x / 13.681x / 13.345x / 7.472x** at uMax 0.05 / 0.15 / 0.30 / 0.60 / 1.20 — a real curve with an INTERIOR OPTIMUM, so the cap signature does not apply — while **the tuned loop REFUSES at every one of the five**, and for two different reasons (no forecast survives held-out validation at 0.05 and 1.20; the verify reads 0.99x/1.10x/1.00x at the middle three). So the 9.4-9.8x is the loop, confirmed by a sweep rather than one tuned cell. **It stays in the plant count as ASKED AND CORRECTLY REFUSED and never as a factor**: ten cells, nothing made worse, minimum 1.000x, every refusal stating a reason, on the one plant class the other six do not contain. Flagged against myself: at tuned/0.30 the verify reads 1.10x representative and 1.41x program and the gate still refuses — the instrument floor declining to credit what it cannot resolve, and the one cell that could still hide a small real win. **AND IT IS NOW A WINNER, BY THE OBJECT THAT SHIPS — 12.0x ON THE SHIPPED LOOP AND 9.2x ON THE TUNED ONE (plan §86.2).** That NOT BUILT line is closed: `distil-pend.mjs` asks the deployed object and it DEPLOYS — 1.0378e-1 → 8.7013e-3, **11.93x** by the ladder's own score and 12.01x by an independent scored run, the conventional rung taking 4.66x and the distilled map 2.56x on top at gain 0.266, in **8 MAC/cycle sliced and 0.2 kB**. On the loop tuned 3.5x better, where the teacher refused every authority, the ladder still ships **9.24x** (2.8887e-2 → 3.1248e-3) on the conventional rung alone, the distilled rung's teacher being unable to improve a single training run there. Window ±171 raw steps from a MEASURED 281-step tip settle; the diet is four moves at different distance, feed, acceleration and dwell and the scored program is in none of them. **THE RIG'S INTEGRATOR HAD TO BE REPAIRED FIRST AND IT LOOKED EXACTLY LIKE A LOOP**: explicit Euler at 200 Hz holds the tuned gains ~32 laps and then walks away (2.910e-2 → 3.244e-2 → **4.386e+0** at laps 0 / 32 / 59), which is the INTEGRATOR — sub-stepped 4x it is flat to 60 laps and 16x agrees to 0.6%, while the DEFAULT loop moves 0.1% (rules 17, 21). `pend.test.mjs` scores 4 laps, inside the artefact-free region, so its numbers stand at 9.770x → 9.816x; what could not have been run is a COMMISSIONING. **AND THE REPAIR EXPOSED A GATE FAILURE THE ARTEFACT WAS HIDING**: at uMax 0.60 on the tuned loop the bare `Pilot` now DEPLOYS, having vouched for itself at 2.02x on its own representative regime, and delivers **0.126x — the machine eight times worse** (0.190x at 16x sub-stepping, so it is the plant and not the integrator). **AND THAT GATE FAILURE WAS NOT THE GATE — IT WAS A STRETCHED VERIFY CLOCK, AND IT IS FIXED (plan §87.4).** Two hypotheses, cheapest first (rule 1). The TRANSIENT one is dead: scored per lap the ratio is flat at 0.119-0.132x to lap 11 and cumulative over 2/4/8/12 laps reads 0.119/0.126/0.128/0.128 — no crossing. **The instrument was the fault**: `verifyRef(i, n)` invites the caller to map its program onto the verify's step budget and this harness wrote `xrefAt(round(i·LAP/n))`, where **n is 24,000 against a 1,091-step lap** — so the gate was handed the program **22 times SLOWED, as a staircase**, on which the CONVENTIONAL machine reads **4.211e-1 against the real program's 2.913e-2**. The gate was scoring a machine fourteen times worse than the one that runs; rule 11 aimed at a gate. At the program's own clock the sweep reads **1.558x / 9.816x / 13.961x / 13.452x / 7.446x on the shipped loop, every cell deploying and helping, and 1.000x at all five on the tuned loop** — no harmful cell left, the interior optimum intact, and the gate's own estimate now 8.64x against a delivered 9.816x where it read 2.73x. The default row is unchanged at 9.816x, which is what says an instrument was repaired rather than a result moved (rule 21). **The idiom is on three more plants** (`wbonline`, `tanks.test`, `thermal.test`) and is stated rather than changed: the tank's gate correlates 0.989 with what it delivers, so a change to a regime measured as working needs its own measurement. **AND ITS 12.0x IS NOW A DISTRIBUTION: 11.789-12.113x over six DIET draws, 6 of 6 deploying and helping, a 1.03x spread — the tightest in this project** (plan §87.3), with the shipped diet in the middle of it rather than at an edge. |
| `test/pilot/objtable.mjs` | **THE WINNING TABLE, SCRAPED FROM EACH PLANT'S OWN HARNESS (plan §86.7).** The count of plants this project wins on has lived in this file's prose and nowhere else, and it has been wrong in both directions — §84.10 removed the cart-pole after four sections of quoting a factor that turned out to be the LOOP, and §64-§72 added four plants one at a time while the summary tables were edited by hand. A count nobody can re-derive is a preference, which is rule 30 aimed at the project's own headline. So it is a SCRAPE: each plant's OWN harness runs in a child process and this file reads that harness's own printed line, exactly as `commtime.mjs` and `sixplant.mjs` do it, and a plant whose line cannot be found reads UNKNOWN rather than being dropped (rule 25). **It separates three claims the record had been conflating**: shipping the DEPLOYED OBJECT (`distil.js`'s weight vector), shipping the CONVENTIONAL RUNG (four coefficients, deployable and cheap but not the object the deploy boundary is drawn around), and shipping the PILOT CASCADE (thousands of MAC and kilobytes of forecast bank — a win for the METHOD and not for the product). EMPS is the row that forced the distinction: its harness ships the object AND the retired lap-periodic rung on top, so its `shipped` line is 341.7x and the object's own column is 32.75x, and the table prints the second. **AND IT IS NOW A CHECK THE SUITE GETS FOR FREE, WHICH IS THE FIRST ONE THIS PROJECT'S MANDATE HAS EVER HAD (plan §87.1).** Spawning ten harnesses to learn what the suite just measured is fifteen minutes of duplicated plant time, and a table nobody runs is not a check. Every harness now EMITS its row where it measured it (`emitRow`, inert and byte-identical with `OBJTABLE_OUT` unset) and `READ=1` reads them back — no plant re-run, no plant re-scored. It goes RED when any plant asked is made worse, which is the one thing *every plant is a legitimate winner or is struck with a reason* forbids. The row is keyed by the SCRIPT that produced it rather than by a passed name, which is what keeps `plants.test.mjs`'s TEACHER rows — same driver, same four plants, different claim — out of a table about the deployed object (rule 19). **Its first version reported a rung that did not ship**: it read `rep.distil.policy`, true whenever the FIT vouched, and the real exchanger's fit vouches where the MACHINE refuses at 0.045x; it reads `rep.deployed.distil` now (rule 25). **AND IT NOW CARRIES TARGET 1 AS A COLUMN (plan §88.6)**, emitted by each harness beside what it ships: the held-out program's factor as a fraction of the scored one, `MET` above 1/1.3, `MADE WORSE` below 1, and `not asked` for a plant whose harness does not score a second program — the COLD MILL, deliberately, because its `refAt` is a constant and a regulator whose setpoint never moves does not have a second program (rule 25). The column is REPORTED and not asserted, because three plants of seven are measured as missing the bound and a suite pinned to a bar plants are known to fail is permanently red (rule 3). **And the flagship plant is finally in the table**: `distil-arm.mjs` was an unregistered INSTRUMENT, so §87.1b printed `NOT EMITTED: distil-arm` — it runs in 231 s at its defaults and is registered now (plan §88.5). `ONLY=`, `SKIP=`, `TIMEOUT=`, `READ=1`. | **AND IT NOW SEPARATES THE INCUMBENT FROM THE LEARNED INCREMENT, WHICH IS THE COLUMN THE OWNER'S OWN OBJECTION ASKS FOR (plan §89.6).** Every headline here is the WHOLE ladder against the bare machine, and the ladder's FIRST rung is `classic.js` — `[a, v, sign v, 1]` fitted on the machine — which is a self-tuned feedforward and IS the class `docs/scorecard.md` names as the incumbent. So a plant's factor can be almost entirely the incumbent with a small learned increment on top, and nothing here had ever separated them: the split has been printed in every ladder's own rows since §63 and collected nowhere (rule 30, on the one number the product claim rests on). The evidence it matters was already on file in three places — the real steam exchanger, where four coefficients take **89.8x** and the learned object refuses because nothing is left; the real flexible arm, where they take 1.93x and it refuses; and §89.1, where they take **4.66x of the cart-pole's 11.93x**. `emitRow` reads `rep.rungs` and emits `xClassic = base/classic` beside `xAdded = classic/best`, which MULTIPLY to the headline by construction, so a row where they do not is an instrument fault and not a result; a rung that was not built reads `none` rather than 1.00x (rule 25). It costs no plant time — it is a READ of the object's own record — and it should have been the first table here rather than the last. **AND IT IS NOW SCRAPED ON ELEVEN ROWS, AFTER ITS OWN INSTRUMENT WAS FOUND WRONG IN THE DIRECTION THAT FLATTERS (plan §95).** The emitter's comment reads *a rung that did not run must not read as one that ran and contributed nothing* and the code then emitted `xClassic: 1` for both, because it found the rung with `&& r.deployed` — so across ten plants SIX read `classicRan: false`, including every plant carrying this project's headline factors, and a table built on it would have published six NON-MEASUREMENTS as measurements on exactly the question the column exists to answer (rules 25, 30). Three states now, separated by `classicVerdict`: **NOT OFFERED** (`xClassic` null, not measured), **REFUSED** (ran and found no headroom — a REAL reading at exactly 1), **DEPLOYED** (`base/score`). The middle state is a third of the table and the first version destroyed it. **OF EIGHT PLANTS WHERE THE INCUMBENT WAS ACTUALLY MEASURED: on THREE it cannot do the job at all and the learned object is the whole result — Wood-Berry column 3.96x, cold mill 2.62x, extruder barrel 7.00x, the rung refusing on two of them at 0.0% of the error energy; on TWO they COMPOSE — cart-pole 4.66x incumbent × 2.56x learned, real cascaded tanks 4.28x × 2.03x; and on THREE the incumbent IS the result and the learned object adds exactly 1.00x — cart-pole on a loop tuned 3.5x better 9.24x, real flexible arm 1.93x, real steam exchanger 89.77x.** **AND THE THREE THE INCUMBENT WINS OUTRIGHT ARE THE THREE §55 PREDICTS IT WOULD**, which is what keeps the table from reading worse than it is: two of them are plants IDENTIFIED AS A LINEAR ARX, which §55 already states sit INSIDE the conventional rung's own hypothesis class so the number measures the class and not the machine (rule 15), and the third is the cart-pole on the loop §84.10 had already shown was carrying the headline. So they are one prediction holding twice and one finding already recorded, not three independent defeats. **WHAT IS OPEN IS THE PART THAT MATTERS: the 2R arm (6.63x), EMPS (341.69x) and the quadruple tank (3.27x) have NEVER HAD THE INCUMBENT RUN AGAINST THEM** — their harnesses pass `classic: false` deliberately, because the distilled object REPLACES that rung and the compliance feedforward (§52.8 measured bare beating under-the-feedforward 0.217 against 0.338). That is a reason about what SHIPS and not a reason to leave the comparison unmeasured. **AND ALL THREE ARE NOW ASKED, WHICH COMPLETES THE TABLE AND ANSWERS THE OWNER'S OBJECTION (plan §96).** The ARM's conventional rung takes **20 laps and 8.5 machine-minutes to reach 1.01x and is NOT DEPLOYED**; the TANK's reads **1.00x, refused, the basis spanning 0.0% of the error energy**; and on both the delivered result comes back UNCHANGED TO FIVE FIGURES (arm 1.6159e-1 at 6.63x, tank 1.5494e-1 at 3.268x), which is rule 21's signature saying a measurement was taken rather than a result moved. **EMPS needed no knob and its answer is the most interesting**: `autostack.test.mjs` already arms the rung and it reads **424.8x** in 14 laps on four coefficients against the distilled object's 32.75x — **and the ONE PRESS SHIPS IT** and refuses the other two with both refusals asserted correct, so the row is the ladder MEASURING that the incumbent wins and deploying it, which is target 3's improve-or-refuse clause working rather than this method losing. (Stated with it: that rung sits AT THE INSTRUMENT'S FLOOR of 1.60e-3, so 424.8x is a number the rig cannot resolve, and the harmonic rung scored 10x better still and was refused for exactly that reason.) **THE COMPLETE TABLE, ELEVEN ROWS OVER TEN PLANTS: on FIVE the incumbent finds NO HEADROOM AT ALL — barrel 1.00x/7.00x, arm 1.01x/6.63x, column 1.00x/3.96x, tank 1.00x/3.27x, mill 1.00x/2.62x, three of them measured at literally 0.0% of the error energy — and the learned object delivers 2.6x to 7.0x entirely by itself; on TWO they COMPOSE (cart-pole 4.66x × 2.56x, real tanks 4.28x × 2.03x); and on FOUR the incumbent wins (EMPS 424.8x, exchanger 89.77x, tuned cart-pole 9.24x, real arm 1.93x).** **SO THE ANSWER TO *a controller that cannot beat a PID FF* IS THAT IT IS NOT A BETTER PID+FF — IT IS THE THING THAT WORKS WHERE A PID+FF FINDS NOTHING AT ALL.** The five it carries alone are exactly the plants whose error `[a, v, sign v, 1]` cannot express: a tank at √h, a barrel radiating as T⁴, a coupled 2x2 column, a mill whose dominant error arrives through a 100-step transport delay, and a compliant arm whose residual is link bend and gearbox wind-up. The four it loses are already explained by this record — two are plants IDENTIFIED AS A LINEAR ARX, which §55 states sit inside that basis's own hypothesis class (rule 15); one is the cart-pole on the loop §84.10 showed was carrying the headline; and EMPS is a near-LTI axis whose whole error is velocity lag, which is what those four coefficients are for and where `classic.js`'s dominant coefficient is checkable against `vPeak/kp` to 2.4%. **The value is the DISCRIMINATION, and the one press performing it unprompted across ten plants is the thing worth selling.** **AND THAT COUNT IS NOW RETRACTED FROM FIVE TO FOUR, BY THE PORTFOLIO'S OWN FIRST RUN (plan §97.3).** §96 listed the QUADRUPLE TANK among the plants where the incumbent finds no headroom, at 1.00x. **That was never a measurement**: the rung's basis was built from declared peaks rather than the program's own series (§97.1), and its deploy path was never handed `v` and `a` at all, so it commissioned correctly and then contributed exactly zero when scored (§97.2) — rule 25 on the deploy path, `distil-tank.mjs`'s own §67.3 defect in two more places. Repaired, **the tank's conventional rung reads 5.0636e-1 → 2.5432e-2 = 19.91x in 24 laps on 7 coefficients, and the distilled rung scored on that better machine reads 0.16x and is REFUSED** — six times better than everything §70, §72 and §79 built on that plant, from four coefficients that were in the box the whole time. **EMPS moves the same way, 341.69x → 424.82x, and also switches to the conventional rung.** So the corrected count is **FOUR plants of ten where the learned object is the whole result** (barrel 7.00x, arm 6.63x, column 3.96x, mill 2.62x), TWO where they compose (cart-pole 4.66x × 2.56x, real tanks 4.28x × 2.03x), and FIVE rows where the incumbent is the result (EMPS 424.82x, exchanger 89.77x, **tank 19.91x**, tuned cart-pole 9.24x, real arm 1.93x). **The tank is the sharper correction and the more useful one**: no plant here has been worked on harder — §70 turned a 0.08x refusal into a win by re-deriving a carried ridge, §72 cut its commissioning from 19.3 days to 2.0, §79 built a whole third ladder axis on it — and four coefficients beat all of it by 6.1x once they were allowed to act. **A plant declared hard must be re-asked with the cheapest thing in the box before anything is built for it.** **AND THE PORTFOLIO PAID FOR ITSELF THE DAY IT WAS ARMED**: the block got **6.1x better on the tank and 1.24x better on EMPS by carrying a controller it already had and being allowed to pick it** — no new algorithm, no new fit, one commissioning of a 7-coefficient rung. The selection is right in both directions, which is what makes it a portfolio rather than a bundle: it ships the incumbent and refuses the distilled rung on the tank, refuses the incumbent and ships the distilled object on the barrel, arm, column and mill, and ships BOTH on the real cascaded tanks. **CONSEQUENCE FOR THIS FILE'S OWN NUMBERS, STATED PLAINLY**: the tank's 3.268x and EMPS' 341.69x appear throughout below as results of the DISTILLED OBJECT; they stand as what that object delivers and they are no longer what the BLOCK ships on those plants, so any sentence quoting them as the plant's result is wrong by 6.1x and 1.24x.
| `test/pilot/rigs/pend-rig.mjs`, `distil-pend.mjs` | **THE CART-POLE'S PLANT, EXTRACTED — AND ITS INTEGRATOR SUB-STEPPED, WHICH IS WHAT MADE A COMMISSIONING POSSIBLE (plan §86.2).** `pend.test.mjs` owned the plant, the loop and the program inline and a second copy has shipped a defect three times here, so they moved (the test is byte-identical). What the move found is that explicit Euler at 200 Hz cannot carry this plant under the TUNED gains for more than ~32 laps — 2.910e-2 → 4.386e+0 per-lap tip rms by lap 59, which reads exactly like a marginally stable loop and is the INTEGRATOR (rule 17). Flat to 60 laps at 4x, 16x agreeing to 0.6%, and the DEFAULT loop moving 0.1% (rule 21's signature), so 4x is the default and `PEND_SUB=1` the control. `distil-pend.mjs` then asks the DEPLOYED object: **11.93x on the shipped loop in 8 MAC/cycle and 0.2 kB, 9.24x on the tuned one**, both improving, nothing made worse. Its diet is four moves the scored program is not, with dwells long enough that the window rule's REACH half binds rather than its aliasing half — stated, because a diet of short laps would let §49.11's forced trade decide the result instead of the plant. |
| `test/pilot/distil-realarm.mjs` | **THE DEPLOYED OBJECT ON THE PLANT THAT GOES THE WRONG WAY FIRST — REFUSED SEVEN WAYS, INCLUDING BY THE ONE THING THIS FILE PROPOSED FOR IT (plan §86.3).** §84.11 named the real arm's cascade refusal (INVERSE 128.3%, the only non-zero in `invert.mjs`) and said the deployed object had never been asked. Asked, it reads **0.88x-1.02x across windows ±128 to ±2675, tour laps 3,072 to 24,576, streaming and batch fits, and a resonator bank**, with in-sample 0.87-1.24x and held-out R² never above 0.34 while the TEACHER reaches 4.1-7.2x. The diet is TOURS because this plant's memory is **4,385 steps against a 512-step lap — 8.6 LAPS, the worst ratio in this project** — so the aliasing bound gives ±64 and reaches 1.5% of the memory, and a long closed tour is §49.11's one measured escape; each tour is bisected ON THE MACHINE to the same 16.8% of the drive the shipped program demands, because the rig's spectral rule sizes one 10-40x too small. **THE RESONATOR BANK IS THE FINDING**: §52.34 proposed exactly this object for exactly this shape and §52.36 refused it on a ring decaying 5.6x per cycle; these modes decay 1.026x, 1.030x and 1.276x, and three reference-driven sections at 15 MAC/step fit BETTER (R² 0.280 → 0.342) and deliver WORSE (0.88x). The refusal holds on the plant the proposal was designed for. **AND AN EIGHTH WAY: six DIET DRAWS all refuse at 0.949-1.011x** with the ladder shipping 1.93x every time (plan §87.3), so it is the plant and not one diet. **AND THE CLASSICAL RIVAL CANNOT WIN IT EITHER** — `zpetc-realarm.mjs` reads 1.135x at best over sixteen cells against the conventional rung's 1.93x, from models fitting at R² 0.973-0.997 (plan §87.5). This is the one plant in the project that resists BOTH admissible objects, which is a statement about the plant. |
| `test/pilot/distil-realtanks.mjs` | **THE DEPLOYED OBJECT BEATS A PILOT CASCADE AT A FIVE-THOUSANDTH OF IT (plan §86.4).** The real cascaded tanks are one of only two plants where the CASCADE is the result — 8.00x for **43,673 MAC/cycle and 16.5 kB, 437% of a PLC scan**, an improvement no PLC would accept, which is the objection §63 raised about the barrel. The object ships **8.69x in 8 MAC/cycle and 0.2 kB**. It is asked on the OVERFLOW plant, because the identified LINEAR one reads 2012x and that measures the conventional rung's own hypothesis class (§55); the diet is four CLOSED recipes, none of them production and every one visiting the overflow region, and the production recipe is not even closed — which the harness prints, because it is the reason the diet's laps are. **AND IT IS A DISTRIBUTION: 8.41-8.82x over six diet draws, 6 of 6 deploying and helping, a 1.05x spread** (plan §87.3). |
| `test/pilot/distil-realexch.mjs` | **THE ONE REFUSAL THAT IS NOT ABOUT WHAT THE MAP CAN EXPRESS (plan §86.5).** The conventional rung takes 89.77x on the real steam exchanger and the distilled rung reads 0.045x of it, refused — while helping every one of its own training runs **1.33x** in sample. So the map does express this plant's correction; there is nothing left. By §84.9's screen this is the easiest plant in the set (**43 response times per program** against 5-8 for the losers) and the cheapest rung wins outright, which is the screen's prediction holding from the other side. Its ±23-step window is what found `deriveWindow`'s duplicate taps. |
| `test/pilot/rigs/arm-rig.mjs` | The 2R arm rig — plant, paths, routing, `commissionArm` and `deployOn`. Every harness drives the arm through this; three separate copies of pieces of it have each shipped a defect. |
| `test/pilot/forecast.mjs` | Held-out forecast R² on open-loop programs, plus an offline refit that separates an unreachable dictionary from an unvisited one. |
| `test/pilot/spectrum.mjs` | Where the machine rings, where the defect's energy is, and where the excitation looked — three power spectra on one axis of periods. |
| `test/pilot/` | Full-tier files here SKIP and exit 0 without `SUITE=full` — that hole let a gate regression ship for three bricks. Node tests for the pilot on six plants that share no physics: the 2R arm, a quadruple tank, a three-zone extruder barrel, the Wood–Berry column, a cold mill AGC, and the EMPS servo axis (parameters identified from a real record). **AND THREE MORE WHOSE DYNAMICS ALSO CAME FROM REAL HARDWARE (plan §55):** `realarm.test.mjs`, `realtanks.test.mjs` and `realexch.test.mjs`, each identified from a published record in `rigs/realdata/records/` and validated by FREE-RUN simulation on a cut the fit never saw. Registered in BOTH tiers, because the two holes this project has already paid for were a test that existed and never ran. |
| `test/pilot/dirinv.mjs` | **LEARN THE COMMAND DIRECTLY — the owner's routing, run dynamically (plan §93), AND THE FILE THAT SPENT THREE SECTIONS MEASURING ITS OWN BROKEN READER (plan §99).** The proposal: *set and actuals routed in, the ground truth routed as the "setpoint" at commissioning, and after commissioning the setpoint is the setpoint.* It is direct inverse learning, it deletes §49's law, §73.13's 74-89% teacher bill, §80.3's lap-indexed DIS ceiling and §90.2's cascade dependence at once, and this project had already done it STATICALLY at 23-44x (brick 40's `ikfree.test.mjs`) and never dynamically. Fit a window of the ACHIEVED `y` onto `c - y`; deploy `c = r + f(r)`. The truth LABELS THE INPUT rather than computing a target, so it reuses `DistilPolicy` UNCHANGED — same coefficients, same straddling window, same clamp, same guard, same `deploy.js`. **§93's HEADLINE — *THE SHIPPED LINEAR ARTEFACT LOSES AND ITS FIT IS INTACT*, 0.588x and 0.701x with program R² -1.886 and -1.017 — IS RETRACTED IN FULL, AND SO IS §94's CONCLUSION.** `DistilPolicy` has two act entry points taking DIFFERENT reader shapes — `act(refAt, k)` wants an ABSOLUTE-INDEX reader and builds its own window `look = (o) => refAt(k + o)`, `actLook(look)` wants an OFFSET-FROM-NOW reader already centred — and all seven deploy sites here passed the second shape to the first, so the closure was handed `k + o` as its own offset and **every window was read centred at 2i**. At i = 0 the two agree on every tap, which is why it survived §93, §94 and §98 unnoticed. **The blast radius is this file alone and the library was already right**: `distil.test.mjs` pins the two readers to agree away from a record boundary and to differ at it, every other `actLook` caller in the repository is look-form, and nothing that ships moved. Only the window's centre changes and: **scribble diet 0.588x → 2.658x (program R² -1.886 → 0.8584), own-class diet 0.701x → 5.508x (-1.017 → 0.9671), the gain ladder from monotone-to-1.00x to an interior 3.183x at gain 0.5, and the forward-reach ladder from 0.701→0.703x to 5.505x → 6.084x.** **THE MOST USEFUL LINE IS THAT §93's OWN PREDICTION WAS RIGHT AND ITS INSTRUMENT WAS WRONG**: §93 wrote the forward-window hypothesis down first with its signature stated — in-diet R² DOWN, program R² UP, opposite directions — then recorded it REFUTED because both moved together. Corrected, in-diet reads 0.9265 → 0.9121 and the program 0.9671 → 0.9730, monotone, delivering 6.084x. Rule 59 is usually cited when a prediction dies; this is the case it is actually for. **§94's MEASUREMENTS ARE BYTE-IDENTICAL AND ONLY ITS CONCLUSION FALLS.** Re-run, the free-teacher distillation reproduces to every digit — four trajectories, **25,167 labels, ZERO plant steps** (the teacher's input is a window of the COMMANDED REFERENCE, so it can be evaluated with the machine switched off, which is what made *more data would have fixed it* refutable BY CONSTRUCTION), held-out R² **-0.1142** against a shuffled null of -0.0044, **deploy FALSE**, and §94.1's lift at -0.4340 / -0.0182 / 0.0020 — because that fit REFUSED, so nothing was applied and the broken reader never ran (rule 21 from the far side). What does not survive is *the obstacle is the FUNCTION CLASS, measured from four directions*: **-1.02 fitted directly** was one of the four and now reads **+0.9671**. **And §94's surviving measurement says something narrower and stranger than what it claimed**: the same class, same window, same plant reads 0.967 fitted on the TRUE target `c - y` and -0.11 fitted on the kNN TEACHER's approximation of that same target — the teacher is the HARDER thing to fit, so §94 was distilling a surrogate onto a class that already fitted the original, and the route it declared closed never needed opening. **Stated narrowly (rule 20): the two fits differ in INPUT as well as target** — achieved-`y` windows against commanded-reference windows — **and a kNN teacher is only as good as its bank is near**, which §93 G's own control demonstrates (the scribble bank reads 0.1589 on the program and applies 0.05 mm against a 0.58 mm target), so *poor off-bank labels* and *the class cannot fit the teacher* both explain -0.11 and nothing here separates them. What IS established is that §94's conclusion does not follow, because the class fits the TRUE target on the program at 0.967. **WHAT SURVIVES UNCHANGED FROM §93**: non-uniqueness ACROSS the diet→program boundary bounds R² at **0.998 from the DATA before any fit** (each program window's nearest diet window carries a command disagreeing by 0.0462 of the target's rms), and the LOCAL model reads R² 0.9966 and delivers **22.599x on the machine** but CANNOT SHIP — 8,769 windows × 49 taps is **430k MAC/decision in 1.7 MB, 43x over the whole budget**, against the deployed object's 78 MAC and 0.2 kB. §98's PLC-shaped local model also stands and is unchanged: R local linear maps blended on the window's own velocity, 51 MAC, **5.681x / 5.616x / 5.436x / 5.206x / 5.084x at R = 1 / 2 / 4 / 8 / 16 — `R = 1` IS A GLOBAL FIT AND THE BEST ROW**, locality monotonically harmful, the capacity signature for the ELEVENTH time. **THE RIDGE IS A REAL AXIS HERE AND THE FIT'S GATE RANKS IT BACKWARDS (plan §99).** §98.1 swept it to explain -1.017 and found nothing, which stands as an account of -1.017 and is wrong about the axis: with the reader fixed it reads 5.510x / 5.512x / 5.839x / 8.918x / **13.688x** / 2.418x at 1e-6 → 10, an interior optimum, while **in-diet R² falls monotonically (0.9265 → 0.8266) as program R² rises (0.9671 → 0.9946)** — §49's law on a ninth knob. **Read that column NARROWLY (rule 19): ridge 1 is picked by scoring the program it is quoted on, so 13.688x measures the AXIS and is not a controller result; the claimable figure is 5.510x at the default with nothing selected.** §98.2's 2x2 explains the last 3%: standardisation costs ~18% on this routing and the sign taps are inert to 0.6%. **NOTHING IS INTEGRATED, AND THE REASON IS A MEASUREMENT.** The route is real, runs through the artefact that ships, and costs **ZERO teacher laps** — six open-loop trapezoids, one pass, about 35,000 machine steps — but **on EMPS the incumbent reads 424.8x and the portfolio already ships it**, with the distilled object at 32.75x, so a 5.5x route is third of three on the only plant it has been asked (rule 31). **AND THE BARREL IS NOW RUN, AT THE SAME RANGE AS THE TEACHER FOR ZERO TEACHER LAPS (plan §103).** The units objection that parked it is not one: this plant's reference ALREADY goes through the engineer's closed-form nominal inverse (`specs.mjs` hands `TH.powerFor(TH.setpointAt(k))`), so the identity implicit in EMPS' `c - y` is `powerFor` here — fit on `c - powerFor(achieved)`, deploy `c = powerFor(r) + f(...)` — and `DistilPolicy` needs NO change because the fit's input is already in the units of the reference the shipped object reads. Every process plant here has that hook (`WB.inputsFor`, `voltsFor`), so it generalises by construction. **Through `barrelSpec`'s OWN `fresh()`/`step()`: 5.2708e+0 → 1.7391e+0 K rms, 3.031x, in ~230 MAC/decision from 45,000 open-loop steps and no teacher.** **AND THE DISTRIBUTION IS THE FINDING RATHER THAN THAT NUMBER**: four seeds read **3.688x / 6.989x / 3.031x / 10.006x** on the scored program — a **3.3x** spread, median ~5.3x — against a teacher-taught 7.00x that is itself one draw of a ladder whose diet spread §84.8 puts at 1.66x, so **the distributions OVERLAP and the claim is THE SAME RANGE AT ZERO TEACHER LAPS, not a win.** **AND WHAT ACTUALLY TRANSFERS DOES NOT MOVE AT ALL**: the held-out recipe ORDER reads **1.896x-2.013x, a 1.06x spread**, NOT MET on all four with nothing made worse — so the target-1 RATIO's apparent swing (0.201-0.626) is its DENOMINATOR moving, which is §89.1's own objection to the cheap comparator arriving from the other side, and the first place here where both halves of that ratio are measured as distributions at once. The teacher-taught object's own 0.393 sits squarely inside it, so the two do not differ in kind. **And the fit's gate does not rank the machine on a third plant**: the seed with the best held-out R² delivers the worst and vice versa — `distil.js`'s *the gate is a PRE-FILTER* after the tank's -0.057 and the barrel's own 0.94-0.98 over a rung the machine refused. **THE TRANSFERABLE FINDING IS THAT RULE 35 CONFLICTS WITH ITSELF ON A LOW-PASSED PLANT**: the dither it demands enters the target `c - powerFor(y)`, and this plant attenuates a fast dither out of `y` before a thermocouple sees it, so it is unrecoverable from the window by construction — held-out R² falls 0.87/0.90/0.91 → -0.02/0.15/0.05 from DITH 0 to 0.12, and coverage therefore has to come from SLOW excitation (the changeovers themselves). Expect the same wherever actuator bandwidth greatly exceeds output bandwidth. **THREE OF MY OWN NUMBERS WERE WRONG FIRST**: a PRIVATE copy of the plant's routing read **9.783x** against the shared routing's 7.0x (rule 61, the fourth time here), that private loop scored from k = 0 where the ladder drops the first 5% (rule 13 — the whole of §78's "unexplained" 2.5% baseline gap; on the ladder's support the open loop reproduces 5.2708e+0 exactly), this file's own header first quoted a scratch probe's table instead of the numbers it emits (rule 30), and — the one that moved the headline by 2.3x — the window was HARDCODED at ±938, which is `deriveWindow`'s output for `distil-barrel.mjs`'s 7500-step diet laps, while exciting in 5000-step segments where the same rule gives 625: it spanned 37% of the training lap against the aliasing bound's 25%, read **7.051x**, and derived properly reads **3.031x on the same seed with target 1 IMPROVING 0.310 → 0.626** (rule 31, and §41's theorem inside my own instrument — a window that over-spans its lap memorises the diet, scores better and transfers worse). **STILL NOT RUN: the COLUMN**, and nothing is integrated — `dirinv-barrel.mjs` is an INSTRUMENT with one ridge, one window and no ladder, so it is not yet comparable to a ladder figure. One plant, one seed, one diet class, with CLASS and MAGNITUDE confounded in the diet exactly as §93 already stated (scribble 10.7% as hard, 2.658x; own-class 98.0%, 5.508x). `REACH`, `TAPS`, `RIDGE`, `SCRIB`, `SEED`. |
| `test/pilot/nonlinear.mjs` | **THE COMPETITOR THAT CONTESTS US RATHER THAN A RIVAL (plan §54.9).** §52.36's "no basis will move it" ceiling rests on six experiments that were ALL global linear-in-parameters ridge with different features; a different FUNCTION CLASS is not more features. Reads `consist.mjs`'s own row dump (`DUMP=`) so there is one builder and not a second copy (rule 61), standardises on the TRAINING rows only so the held-out program's distribution cannot leak in, and swaps only the learner at identical folds: **ridge 0.8610, kernel ridge 0.8303, locally weighted linear 0.8266, MLP 0.7456, kNN 0.7147.** Nothing beats the shipped linear fit — and the two nearest are the two still linear in disguise while the MLP's worst fold falls to 0.39 against the ridge's 0.68. The ceiling is confirmed by methods that could have broken it. |
| `test/pilot/directopt.mjs` | **THE GA / NEAT QUESTION, POSED PROPERLY AND NOT ESTABLISHED (plan §54.11).** Evolutionary search brings three things and this project already answers two: topology search is refused by §54.9 (a kernel machine and an MLP both lose to the linear ridge) and evolvable recurrence by §52.36 (a resonator bank reads 0.814 against 0.836). The third is live — a GA can optimise the DELIVERED error rather than the converged-prefix SURROGATE that §52.34's conflict (2) says is compromised. **Its numbers are withheld by the file itself**: the ridge arm reads 5.49x where this axis is on record at 32.75x, and a GA compared against a baseline 6x off its own recorded value measures the harness. Two hypotheses refuted by byte-identical controls (a hand-rolled fit, then a double clamp deploying at 5x less authority than fitted — rule 34). **The BILL is established and stands either way: 33 scored runs = 20.6 minutes of plant time at a trivial budget**, against target 4 already missed on three plants — the ground DeePC was disqualified on. |
| `test/pilot/zpetc.mjs` | **TARGET 8's SECOND ADMISSIBLE RIVAL — BUILT, FIXED AND MEASURED (plan §54.10, §56).** Stable inversion is what this file calls the distilled policy a data-regressed version of, admissible on exactly our terms: identified once, deployed as an FIR over the commanded reference, no runtime truth, no lap index. §54.10 withheld its numbers and named the live candidate as a z vs z⁻¹ convention error; **it was exactly that**, in `polyFromRoots` accumulating ASCENDING powers where `roots` consumes DESCENDING, which maps every root r to 1/r. Found by two diagnostics that must agree and did not — zeros reported INSIDE the circle at 0.22-0.93 while the long division ran to **1e+263** — and confirmed by a ROUND TRIP with no plant in it, which reproduces the original to **1e-16 reversed** and misses it by 29-95% as-is; that check now runs on every invocation and prints first, because an ordering error is invisible in everything else the file reports. Fixed: **2.45x on the program and 3.28x on the held-out sine against the distilled policy's 32.75x / 33.15x**, reproducible at 2.18-2.45x over four seeds, and it does NOT run away with its own grid (four decades of extra ridge and 5x the FIR length leave the best cell where it was — the control that disqualified DeePC). **The noise falsifier fires**: at the rig's own 1.6 µm identification fidelity every cell is 0.06-0.27x, worse than nothing, with R²(Gr) collapsing 1.000 → 0.029. Stated limit: `out` is ZERO in every delivering row, so Tomizuka's reflection never engages and this is exact inversion with one step of preview. |
| `test/pilot/zpetc-realarm.mjs` | **THE CLASSICAL RIVAL ON THE ONE PLANT THAT RESISTS BOTH OBJECTS (plan §87.5).** §86.3 refused the deployed object on the real flexible arm eight ways and named the route it had not taken — §56's stable inversion, *"which exists for precisely this inverse response"*. This plant reads **INVERSE 128.3%**, the only non-zero in `invert.mjs`, and §56 ran ZPETC only on EMPS where the identified path is MINIMUM PHASE and the reflection never engaged, so this is the first time the rival's own mechanism can fire. It imports `zpetc.mjs`'s `arx`, `roots`, `zpetc` and `arxFir` rather than a second copy (rule 61 — §56's headline defect was an ordering error inside one of those). Held equal: same machine, same program, same authority, the identification multisine bisected ON THE MACHINE to the same 16.8% of drive the program demands (rule 41b, which this rig has paid for once); the rival's order and ridge are SWEPT and ours ran at defaults. **The best of sixteen cells is 1.135x on the program and 1.005x on a trajectory it has never run**, against the conventional rung's 1.93x — so it does not beat four coefficients of `[a, v, sign v, 1]` either — with **2 zeros REFLECTED** in the winning cell. **The sharp form is §56's own finding on a second plant with the mechanism working**: every model in the sweep predicts the plant at R²(Gu) **0.973-0.997** and they deliver **0.02x to 1.135x**. A model can be exact in prediction and still be a bad thing to invert — which is the whole reason the shipped route regresses a correction instead of inverting a model. |
| `test/pilot/deepc.mjs` | **TARGET 8, RIVAL TWO — AND THE FIRST THING THAT BEATS THIS PROJECT, ON A SIMULATOR (plan §54.8).** DeePC on the EMPS axis: a Hankel matrix of one persistently exciting trajectory REPLACES the model inside a receding-horizon solve, which is the literature's canonical form of the claim the shipped object actually makes. Swept over its own regularisers while ours runs at defaults, it reads **189.68x / 131.82x against the distilled policy's 32.75x / 33.15x** — and the margin grew every time the grid widened, because the best cell kept sitting on its own EDGE. **That is the finding and the artefact at once**: a score climbing without bound as a regulariser goes to zero is an unregularised Hankel solve approaching exact interpolation of its own data, which only a DETERMINISTIC rig allows. `NOISE=` is the falsifier and it fired — at the rig's own stated 1.6 µm fidelity the best of 98 cells reads **1.00x on both columns**, and at the noiseless winner's settings 0.04x and 0.02x. It also prints the two columns a delivered error hides: **145,082 MAC/decision (1451% of a PLC scan, 1,860x the policy's 78)** and the live tracking error it needs for ever. |
| `test/pilot/distil-tank.mjs` | **THE DEPLOYED OBJECT ON A THIRD PLANT — AND THE HOST THAT COULD NOT MEASURE IT (plan §67.3).** It asked the tank whether the shipped object reaches a plant beyond the arm and EMPS, and for two sections its answer was **1.000x, nothing harmed, TRANSFER** — in-sample 14.5x-27.8x against a held-out 1.000x. **That experiment never ran.** The distilled rung deploys through `auto.act`, which `rigs/ladder.mjs` calls every step; this file never called it, applying only the candidate `corr` AutoStack hands it, so the rung was ABSENT from the run that scored it — both scored calls print peak |u| **0.000** and an rms identical to the bare machine to five figures. **Applied, it reads 0.08x, SATURATED at its authority** (peak 1.200 of 1.2), and the ladder refuses it correctly, so "nothing harmed" survives as a property of the GATE and not of the correction. Three standing explanations died by measurement first — a FADED correction (`_coverage(null)` returns 1), a REFUSED fit (`deploy` is true at held-out R² 0.99999), and a BAD DIET (three diets, including a speed-decoupled amplitude ladder whose teacher converges uniformly at ~59,000x where the shipped rate ladder was 3/4 quasi-static — production's own ramp is **1.01x this plant's settle**, so bracketing the RATE cannot excite it and only decoupling |Δlevel| from ramp length can). The coverage guard is now plumbed and correctly does NOTHING, because that diet brackets production's commanded speed: **the map saturates INSIDE its own trained speed span**, which is extrapolation in the window rather than a coverage failure. `closed: true` was also missing from its run descriptors since the file was written (plan §52.14). Its seeds are still not a control: three are byte-identical because no cascade builds, so no seeded excitation runs — one draw three times (rule 61 aimed at a seed). **AND IT IS NOW A WIN, BY RE-DERIVING ONE CARRIED CONSTANT: 2.591x, with a HELD-OUT production recipe at 2.299x (plan §70, §72).** The 0.08x was the ridge — `1e-6`, the ARM's value, carried here and never re-derived, which this file's own comment admitted in so many words and then left in place (rule 31). It is not repaired by writing this plant's number in: `AutoStack`'s ②d rung now refits the SAME converged prefixes at a fixed geometric ladder of candidates and SCORES EACH ON THE MACHINE, which costs k scored runs rather than k commissionings because the teacher's half is already paid. **The fit's own gate cannot do it and is confidently WRONG here**: held-out R² peaks at ridge 1e-3 (0.9941/0.9931) and that cell delivers 0.076x on production and 0.088x held out — worse than doing nothing, by a criterion reading 0.99. `distil.js`'s "the gate is a PRE-FILTER and the decision is a machine-scored verify" with a number on it. **And this plant is what settles the ladder's own tie-break**: it scores every candidate on the held-out recipe, production and held-out rank IDENTICALLY, so a machine-scored pick is not fitting the program it was scored on — which retired an invented 5% band in favour of `beats()`, the instrument's own measured repeatability. Its commissioning is **19.3 days → 2.0 days** (plan §72). **AND IT IS THE ONE PLANT OF FIVE WITH AN APPLIED-GAIN DEFICIT, WHICH IS WHY THE THIRD LADDER AXIS EXISTS: 2.593x → 3.268x AT GAIN 0.85 (plan §79).** The ridge regularises the FIT; the gain the fitted map is APPLIED at is a different quantity with its own optimum and nothing here had ever scored it. It is confirmed on the recipe the gain was NOT chosen on (2.301x → 2.657x), and it is confirmed by a second route that shares no code with the ladder — a harness knob scaling the applied correction reads the same shape. It cost 16% of this plant's commissioning bill (31.7 h → 36.8 h, the verify share 30% → 42%), which is a worse ratio than the ridge axis bought (32x for 1%) and a better one than anything else here. Why this plant and not the other four is NOT established: it is the one whose ridge had to move four decades from the arm's, and the only one whose scored program is a SETPOINT SEQUENCE rather than a trajectory — either would predict an over-confident map, neither is tested. |
| `test/pilot/rigs/realdata/` | **THE RECORDS FROM REAL MACHINES, AND THE INSTRUMENT THAT TURNS ONE INTO A PLANT (plan §55).** Three published identification records — a flexible robot arm, cascaded water tanks, a steam heat exchanger — with `PROVENANCE.md` naming each source, its citation, and the hosts that are blocked. `sysid.mjs` fits a model on an ESTIMATION cut and scores it by **FREE-RUN SIMULATION** on a VALIDATION cut it never saw: a one-step predictor is handed the true `y[k-1]` at every sample, so it scores well on any smooth record and is measuring the sampling rate rather than the model (rule 36 in a second costume). Order is chosen by the held-out free run, never by the in-sample fit (rule 16), ties broken by rule 42. Every rig re-identifies AT MODULE LOAD from the committed record, so the plant cannot drift from the data it claims to come from (rule 30). |
| `test/pilot/rigs/ladder.mjs` — `scoreOn` | **TARGET 1's INSTRUMENT, AND IT IS THE DRIVER'S OWN SCORED RUN (plan §88.1).** A harness hands back an alternate `{refAt, fresh, N}` and gets the loop this driver already runs — the same `auto.act`, the same `look`/`lookRaw` pair, the same 5% start transient dropped — so a second program costs ONE scored run, no refit and no second commissioning. It is not a fourth private copy of the loop, which is the fault `arm-rig.mjs` and this file both exist to prevent (rule 61) and which `distil-tank.mjs` already paid for once by scoring a rung its own loop never applied. `armed: false` applies NOTHING rather than disarming the rungs, so the denominator belongs to that program and the commissioned object is never mutated to read a baseline. **It took target 1 from one plant's number to seven** (plan §88), and on the real flexible arm it is what found the first plant in this project that target 1's *none made worse* clause fails on. |
| `test/pilot/rigs/verifyclock.mjs` — `verifyIndex`, `verifyStretch` | **THE VERIFY'S CLOCK, WRITTEN ONCE — AND ONE PLANT'S WAS WRONG BY TEN (plan §88.2).** `verifyRef(i, n)` hands the caller the verify's own step budget, which invites exactly one idiom — `refAt(round(i · PROG / n))` — and four plants wrote it independently, RE-TIMING the program by `PROG / n` with nothing stating the factor. §87.4 found it at **22x SLOWED** on the cart-pole, where the gate was deciding about a machine fourteen times worse than the one that runs. `pilot.js` reports `verifyRegimes.steps` now, every plant PRINTS its factor, and `VREF=natural|resample|legacy` makes it a knob. **Wood-Berry's was `T_END / DT` where `T_END` is already in STEPS** — ten program lengths crammed into the budget, so its two-step scenario fired its second step at n/30 instead of n/3 and the regime was **29/30 a constant hold**, a steady state on the plant whose whole difficulty is its interaction during a transition. **AND THE DEFAULT DOES NOT MOVE, BECAUSE THE TANK SAYS SO.** On Wood-Berry and the barrel the clock is INERT (same verdict, same delivered number, rule 21's signature). On the TANK the 2.2x-slowed resampling is LOAD-BEARING AND BENEFICIAL: 3 of 8 seeds deploy and ALL THREE HELP, against 6 of 8 deploying and **TWO HARMING** at the program's own rate — the tank's own standing check catches it and goes red. So there is no single right clock: `natural` ships on the cart-pole where the factor was 22x, `resample` stays everywhere else, and the factor is now readable on all four. **AND THE MECHANISM IS NOW NAMED, WHICH NARROWS THE CLAIM (plan §89.4).** `VSCALE=<s>` makes the clock continuous (`s=1` is `resample` byte-identically, `s≈n/prog` is `natural`) and `tankspread.mjs` was routed through it rather than keeping the sixth private copy of the idiom. Swept, the deployed count reads **0 / 1 / 0 / 1 / 3 / 3 / 3 at s = 0.5 / 0.75 / 1 / 1.5 / 2.2 / 3 / 4.4** — **NOT monotone**, so the "a slowed gate regularises the deploy decision" account is refuted, and the alternation is `tanks.test.mjs`'s own §54.2 signature (*9 refuses, 16 refuses, 24 DEPLOYS, 32 refuses*) on a fourth knob. What IS sharp is the boundary: every slowed clock that deploys anything deploys a HELPING candidate at 1.094x, and at the NATURAL rate and above three deploy at a median **0.553x, harmful**; above natural the knob saturates by construction (the index clamps at `prog-1`), which is the control. **So the slowed gate works by REFUSAL and not by ranking** — it refuses seven of eight candidates and the one it passes happens to be good, which costs nothing on a plant whose best draw is 1.094x and would cost most of the headroom on a plant that had some. |
| `test/pilot/distil-pend.mjs` — `T1COMM` | **TARGET 1's STRONG FORM, BUILT ON THE CHEAPEST PLANT — AND ITS OWN CONTROL SAYS THE ANSWER IS NOT AVAILABLE THIS WAY (plan §89.1).** Every target-1 ratio in this project compares the held-out program's factor against the SCORED program's, where the target says *a controller commissioned on each program individually* — and three of the MET rows are ones where the held-out factor EXCEEDS the scored one, which makes the cheap comparator more GENEROUS than the target rather than tighter. `T1COMM=1` commissions a SECOND full ladder with the held-out program in the scored program's place — same diet, same window rule, same authority, same ridge and gain ladders — and scores it through the SAME `score()`, the acting object passed in rather than closed over (rule 61). It read 2.301 of a per-program commission, which is a triumph and is not real: **scoring that object back on the SHIPPED program reads 6.055x where the frozen one reads 12.009x**, so it is worse EVERYWHERE and is a worse COMMISSIONING rather than a per-program one. A commissioning is a DRAW (§87.3 measured this plant at 11.789-12.113x over six, a 1.03x spread) and one landing 2x below that distribution is not a sample from it, so the harness prints **INCONCLUSIVE** and says why. Two causes died first, both byte-identically or decisively: the CHANNEL BOX (`T1BOX=ship` reads identical to four figures, so stating the held program's own limits under rule 41b changed nothing) and the AUTHORITY (`T1UCAP` triples it and the object gets WORSE — 4.956x → 3.990x — because the conventional rung improves to 3.98x and the distilled rung is then REFUSED at 0.83x). **What the strong form actually costs is a DISTRIBUTION per program, not a run.** |
| `test/pilot/rigs/rollmill-rig.mjs` — `makeMill(seed, opts)` | **A REGULATOR'S SECOND OPERATING POINT, WHICH THIS FILE HAD WRITTEN OFF AS NOT APPLICABLE (plan §89.2).** CLAUDE.md read *a regulator whose setpoint never moves does not have a second program*; the premise is true and the conclusion does not follow — it has no second TRAJECTORY and plainly has a second OPERATING POINT. `opts` states `{ href, h0, vLine }` and the transport delay, the roll frequency and the gap setpoint are DERIVED from it rather than carried (rule 31), with `millSpec.step` reading them off the mill it is stepping so a second point is reachable through `scoreOn` at all. Unset is byte-identical — open loop 15.154335422210291 µm, the two classical AGCs 18.08 and 14.00. **BOTH PREDICTIONS WERE WRITTEN DOWN FIRST AND BOTH HELD (rule 59): a GAUGE change is inert to three figures across ±10% of target thickness (2.625x → 2.625x → 2.625x), and a LINE SPEED change is monotone in how far the declared delay has moved — 0.770 of the commissioned factor at a 25% delay error and 0.562 at 23% the other way.** Nothing is made worse at any point. The asymmetry is the mechanism: this plant's win rests on TWO declarations, and the roll phase is read by an ENCODER that is honest at any line speed while the transport delay is a NUMBER TYPED IN at commissioning. A mill that changes gauge needs nothing; one that changes line speed needs its delay updated. |
| `test/pilot/rigs/ladder.mjs` | **AND IT NOW CARRIES `pilotOpts`, WHICH MADE THE MILL A WINNER (plan §60).** A plant may state what IT knows about itself — a transport delay is the gauge's mounting distance over the line speed, geometry the probe provably cannot recover — applied after the shared defaults and before `SOLVER`, so an env override still wins. **THE LADDER DRIVER, EXTRACTED FROM `plants.test.mjs` when the real-data plants needed the same one** — a second copy of a plant's routing has shipped a defect three times here (`arm-rig.mjs` says so in its own header, rule 61). `plants.test.mjs` is **byte-identical across the move**, wall clock excepted, which is what says the extraction changed nothing (rule 21). |
| `test/pilot/realarm.test.mjs` | **A REAL FLEXIBLE ROBOT ARM (DaISy 96-009), AND THE FALSIFIER FOR A CLAIM THIS FILE DREW ON A SIMULATOR.** Every arm number here is quoted on a lattice whose ring `modes.mjs` measures decaying 5.6x per cycle; this arm's identified modes decay about **1.03x per cycle** — fifty times lighter, and the regime §52.36 called hopeless for an FIR window before measuring the simulator and softening the claim. The damping is a BOUND, not a measurement, and the rig says so: the record is 1024 samples so a Q above ~65 is not resolvable from it, the fit reports 92, and the two modes come back with Q equal to 1%, which is a signature of the fit sitting near its own stability edge. **It ships 1.93x on the conventional rung and REFUSES the pilot cascade**, whose correction is wrong rather than merely clipped — opened 3x it clamps 56% of samples at 0.00x, opened 10x it trips the guard, and the shipped result is byte-identical at every cap. **AND THAT REFUSAL NOW HAS A CAUSE (plan §84.11).** Put into `invert.mjs` as a sixth row it reads **INVERSE 128.3% — the only non-zero in the table** — so the largest excursion of OPPOSITE sign to the final value is 1.28 TIMES that final value: hold a correction and the plant first goes further the wrong way than it ever goes the right way. §59 refuted non-minimum phase as the account of "good forecast, harmful correction" on four plants, and §84.9 showed the WINNER reads 0.0% too — **the column discriminated nothing because none of those five had it**, and the sixth does. It explains the record's own wording exactly: the pilot INVERTS A FORECAST, and on a plant whose response is initially of the opposite sign the inversion is wrong in SIGN, which is "wrong rather than clipped" measured rather than inferred. Checked before claimed: `settled: yes` with a well-defined final value, and the `scale(x2)` control reads **2.00**, so halving the correction halves the inverse excursion too and this is a LINEAR property of the plant rather than an amplitude artefact. **AND THE DEPLOYED OBJECT HAS NOW BEEN ASKED, AND IT REFUSES SEVEN WAYS (plan §86.3).** `distil-realarm.mjs` drives the shared spec with a diet of TOURS — one closed lap of 12-16 transitions at different edge widths, each bisected ON THE MACHINE to demand the same 16.8% of the drive the shipped program demands, because the rig's spectral amplitude rule is a worst-case sum whose conservatism grows with the harmonic count and sizes a tour 10-40x too small (rule 41b in its other direction). The rung reads **0.88x to 1.02x across windows ±128 to ±2675, tour laps 3,072 to 24,576, streaming and batch fits, and a RESONATOR BANK** — in sample 0.87-1.24x on its own training runs, held-out R² never above 0.34, while the TEACHER reaches 4.1-7.2x on the same runs. So the map cannot EXPRESS this plant's correction and no diet repairs that, which is `reportDistil`'s own split firing. **THE RESONATOR BANK IS THE RESULT**, because this is the plant §52.34 proposed it for: §52.36 refused it on a lattice arm whose ring decays 5.6x per cycle, these modes decay **1.026x, 1.030x and 1.276x**, and three reference-driven sections at 15 MAC/step fit BETTER (R² 0.280 → 0.342) and deliver WORSE (0.88x) — the capacity signature for the tenth time, on the plant the proposal was designed for. The plant stands as a WINNER at 1.93x by the conventional rung with nothing made worse; what has still never been asked is a different OBJECT — §56's stable inversion, which exists for precisely this inverse response — asked in plan §87.5 and refused too, at 1.135x against the conventional rung's 1.93x. **AND IT IS THE FIRST PLANT HERE THAT FAILS TARGET 1's *NONE MADE WORSE* CLAUSE (plan §88.3).** Asked for a second program of the same family, the CONVENTIONAL rung it ships makes a SHARPER-edged one WORSE — 0.877x — and the failure was BISECTED before it was called anything, because a failure with two variables in it is not a finding: **amplitude alone still HELPS at 1.152x, shape alone HARMS at 0.921x, and a SOFTER edge reads 2.825x, better than the commissioned program itself.** The prediction written down first — that the basis's two AMPLITUDE-INDEPENDENT terms are the cause — was refuted by its own bisection (rule 59 doing its job), and what survives is an ordering monotone in edge width on the one plant here whose modes decay 1.03x per cycle. **Two measurement faults were made and both are recorded because each looked like a plant property.** Sizing the program from the record's own acceleration range was rule 41b exactly — that range is a RESONANT response reached where \|H\| = 36.7, the program lives where \|H\| = 0.108, so the first program demanded eleven times the torque the machine has and a loop swept over 88 gain cells could not beat DOING NOTHING at any of them. And the first loop sweep scored 20 laps on a machine whose ring locks in over ~300: it chose the gain that locks ONTO the resonance, which reads 1.06 at lap 20 and **12.36 settled**, against 0.185 for the gain the settled sweep picks — **sixty-seven times better**, rule 12 for the seventh time in this project. |
| `test/pilot/realtanks.test.mjs` | **THE REAL CASCADED TANKS — and the file that measured what a factor on a linearly-identified plant is actually worth.** The counterpart to our own quadruple tank, where `distil-tank.mjs` read 1.000x held out and `tankspread.mjs` found 4 of 8 seeds deploying harmfully. Its validation is the strongest here and that is the benchmark's doing: it ships **two independent excitations** (r = 0.12 with means removed), so the held-out free run is a different experiment rather than a time split of one. It read **2012x**, which is not a plausible controller result and so is a reason to check the instrument (rule 14). It was: restoring the benchmark's own documented **OVERFLOW** — 84 samples pinned at exactly 10.00 in the record, which the linear fit lost so completely that it extrapolates to 20.9 V where there is no 20 cm of tank — collapses it to **8.00x**, and there the PILOT CASCADE deploys two layers where our own quadruple tank refuses everything. **THAT 8.00x IS ITSELF A REPAIR OF 6.54x (plan §86.4)**: both specs were built from the LINEAR recipe's measured peaks, so the overflow plant — whose recipe reaches 10.6 against 8.2 and ramps harder — was commissioned inside a channel box its own program does not fit, which is rule 41b at the channel limits; on its own peaks its cascade admits a SCHEDULED basis at layer 1 (R² lead0 0.948 against 0.928) and reaches R² 0.498 at layer 2 against 0.210, with the linear plant byte-identical across the repair. **AND THE DEPLOYED OBJECT NOW BEATS THAT CASCADE AT A FIVE-THOUSANDTH OF IT**: `distil-realtanks.mjs` ships 7.081e-1 → 8.145e-2 = **8.69x in 8 MAC/cycle and 0.2 kB**, against the cascade's 8.00x at **43,673 MAC/cycle and 16.5 kB, 437% of a PLC scan** — the barrel's own story on a plant whose dynamics came from real hardware. The distilled rung alone is 2.03x at an INTERIOR gain of 0.314, found by §86.6's edge extension where the fixed grid's bottom at 0.72 reads 1.220e-1 against 8.145e-2. Also measured and negative: the sqrt(y) lift, the obvious reading of Torricelli, validates WORSE than linear (0.738 against 0.649 V) — narrowly, because the lift available applies to the OBSERVED lower level while the physics it approximates is dominated by the UNOBSERVED upper tank. |
| `test/pilot/realexch.test.mjs` | **A REAL STEAM HEAT EXCHANGER (DaISy 97-002), the counterpart to the extruder barrel — and the REPLICATION that makes the tanks' finding a mechanism rather than one plant's story (rule 18).** Same comparison on steam rather than water: **1364x linear against 89.8x** with the counterflow effectiveness relation `exp(-1/u)` in the fit, which also validates 7% better on the held-out half. **Its validation is the weakest in the directory and it is printed first (rule 27)**: 0.66 °C free-run against an 8.6 °C range, and 48% NRMSE even ONE STEP ahead with the true previous temperature in hand — the record is disturbance-dominated. Its NRMSE is also a trap and the absolute error is not (rule 19): fitting the first half reads 69%, fitting the second reads 35%, and the free-run rms is 0.71 and 0.62 °C — essentially the same model both ways, the whole gap being that one half carries an operating-point excursion and the other does not. The unflattering direction is the one that ships. **AND THE DEPLOYED OBJECT HAS BEEN ASKED AND CORRECTLY HAS NOTHING TO ADD (plan §86.5)**: `distil-realexch.mjs` reads 2.9433e-2 against the conventional rung's 1.316e-3 — 0.045x — and refuses. It is the one plant here whose refusal is NOT about what the map can express: in sample it helps every training run **1.33x**, so the map does express this plant's correction and there is simply nothing left once four coefficients of `[a, v, sign v, 1]` have taken 89.8x. By §84.9's screen it should be the easiest plant in the set — a 37-sample settle against a 1,600-sample recipe is **43 response times per program** against 5-8 for the losers — and it is, in the sense that the cheapest rung wins outright. Its window rule gives ±23 samples, which collapsed four of the geometric shape's taps onto their neighbours and made exactly collinear columns; `deriveWindow` dedupes now, inert above a reach of ~100 and therefore byte-identical on the four plants that carried the rule. |
| `test/pilot/shakeweigh.test.mjs` | **A REAL LOAD CELL UNDER VIBRATION, AND THE FIRST PLANT HERE WHOSE GROUND TRUTH IS FREE (plan §57).** Sitorus (2021), CC BY 4.0: grain in a shaken basket, true mass from a 0.01 g scale, 20,885 readings over 115 treatments, **A0 the unshaken control**. Vibration inflates the scatter 17.9x (0.47 g → 8.39 g); the error is AUTOCORRELATED at median lag-1 **+0.404**, which is the precondition for a model to beat a mean and makes an 8-sample average 1.40x worse than independent-noise theory. Held out by LOAD LEVEL — the true weight takes only five values, so a model given the window mean could SNAP to the nearest and read spectacularly while meaning nothing — **a learned window beats a CALIBRATED mean 1.65x**, with the window load-bearing (1.006x at K=4, 1.047x at K=8, 1.63x at K=16: rule 37 on hardware, and the first pass nearly filed it as "no product"). **It does NOT transfer between rigs (median 1.08x against 1.65x at home)**, so it ships self-commissioned or not at all. Says in its own header that a shaking basket is not a batching hopper and claims nothing about reading a settle early. |
| `test/pilot/rigs/batch-rig.mjs`, `test/pilot/batch.mjs` | **A GRAVIMETRIC BATCHING HOPPER, SIMULATED — AND IT DECLINES TO ANSWER (plan §57).** No public dataset of batching transients exists (searching returns patents), so this is a rig, and §55's caution applies at full force. Four calibration faults were found in it and each would have decided the result: it fed on a TIMER where real batching cuts on WEIGHT (8.5% of scatter that was a modelling error in a material property's costume); the controller compared an UNFILTERED ringing signal to setpoint and cut 7.5% light; feeder pulsation at 27% of flow was ungated, so the material-HELD control was noisier than the varying one (rule 9 firing); and the ring was read by zero crossings twice, at 78 then 162 Hz against an analytic 15.4. Repaired, the learned map beats the incumbent 2.8x early but saves **0.02-0.06 s per batch**, because this rig's settle is a fast ring rather than a slow tail — the simulator's own constant deciding the answer. Two FLOORS are printed against the questions they bound, because conflating them flagged a good result as a leak (rule 19). |
| `test/pilot/arrayrank.mjs` | **NOT A TEST — HOW MANY CHANNELS DOES A BINARY ACTUATOR ARRAY ACTUALLY HAVE? The screen that runs BEFORE a distributed-actuator plant is built (plan §58).** §55.12's own lesson transplanted: the KUKA was vendored and measured over four sections before anyone decomposed its torque, and the analogue for a distributed actuator is *decompose the map*. A diffusive plant attenuates high spatial frequency, so modes below what the sensors resolve are channels the array does not have. **TWO ROUTES that share no arithmetic and agree to 4.12e-12** (rule 15): the closed-form Neumann eigenvalues `loss + 4kc(sin2 + sin2)`, and `A` assembled and Cholesky-solved with a Jacobi eigensolver. **A THIRD route checks the solve by a conservation law** — in steady state every watt leaves through the loss term and conduction is internal, so `sum(T) = 1/loss` for EVERY element wherever it sits, which the Cholesky cannot satisfy by accident and does to 3.79e-14. **The answer is the SUBSTRATE, not the array** — 200 live channels on thin steel, glass and composite; 69 and 32 on thick aluminium — and the marginal yield splits the purchasing question (1.00 channel per sensor on steel, **0.08 on 40 mm aluminium, where thermocouples are nearly wasted**). **AND IT REFUTES ITS OWN BEST ROWS**: glass reads condition 2 and 29% cross-talk, so its zones are INDEPENDENT and a per-zone PID is already near-optimal — the substrate where the array is most capable is where the incumbent has no deficit to attack. One row refused for too little coupling, two for too much, three survive both (rule 9 from the data). Three of its own metrics were wrong first and each is recorded: "saturated" where the count was still rising (rule 19), a permutation-string invariance test that could not express a TIE and read 3 orderings where pairwise inversions read **0 of 14 discriminating pairs**, and a summary asserting two flat rows where one is (rule 30). It also corrected a chat claim before it shipped: 200 x 40 = 8,000 MAC **FITS** at 80%; what the budget forbids is 200 x 93 at 186%, so the modal architecture is forced by the WINDOW reaching the plant's memory and not by the channel count. Nothing in it is measured on a machine, and it says so.
| `test/pilot/invert.mjs` | **NOT A TEST — WHAT DOES A CORRECTION ACTUALLY DO TO EACH PLANT? The instrument that names why the method fails, with no pilot in it (plan §59).** Runs each plant twice from the same `fresh()` — once undriven, once with a correction HELD — and subtracts, so what is left is the plant's own response with no fit, no probe and no forecast in the route (rule 15). The seeded rigs make it EXACT: two `fresh()` calls replay the same noise, so the subtraction cancels it to the last bit. **It killed two hypotheses.** Non-minimum phase, the plausible structural account of "good forecast, harmful correction", reads **INVERSE 0.0% on all four plants**. And nonlinearity, which this file's own north star uses to ORDER the plants, is contradicted: halving the correction halves every response, **2.00-2.04 including the barrel at T⁴ and the tank at √h**, so the barrel is as linear as the Wood-Berry column at the amplitudes a correction uses. **It named two failures.** Wood-Berry reads **RGA 2.01 — the PUBLISHED textbook value, from a route with no model in it** — against a pilot that inverts a diagonal; and the mill reads **dead/rise 0.83**, which explains BOTH of its states from ONE measurement, because declaring its transport delay changes the controller and not the plant. **Its RGA reading is now confirmed on the machine**: arming `mimo` on the column is worth **1.74x** (0.39x → 0.68x through the shared ladder) and is the ONLY thing that moves that plant — its declared dead times are inert with and without it (0.3%, 0.2%) and its horizon is inert from N 71 to N 236, so the mill's two-repair shape does not reproduce there and the diagnosis that separates them was taken before either was tried (plan §62.4). **The barrel fires none of the four and is not forced into one**; its window here is too short to test the probe-truncation account and the file says so (rule 25). Two of its own faults are recorded: a running program underneath the measurement, which is only valid on a linear plant and showed as a tail that never settled, and a scaling aggregator that reported 0.00 while its own rows read 2.00. **AND IT NOW HAS A WINNER IN IT, WHICH DISQUALIFIED THREE OF ITS OWN COLUMNS (plan §84.9).** Every diagnosis above was taken on a plant that LOSES, so a reading shared by all four could be a property of the instrument rather than of failure — rule 9's half instruments usually fail. EMPS is the fifth row (one channel, 44 ms to load, 14.7x deployed at a 1.05x spread), a SPEC in `specs.mjs` beside the other four rather than a second drive loop, with `plants.test.mjs` byte-identical across the change (10.53x / 1.00x / 1.74x / 1.05x). **The winner reads 0.0% INVERSE, scale 2.00 and DC 100% — indistinguishable from all four losers**, so those three columns discriminate nothing here: "non-minimum phase is refuted" and "every plant is linear at correction amplitudes" rule out two EXPLANATIONS and say nothing about which plants fail. **And the control added a column that does separate**: `prog/rise`, how many of the plant's own response times its program contains, reads **emps 173.3 · mill 165.3 — then a twentyfold gap with nothing in it — tank 7.9 · column 7.6 · barrel 5.2**. That is the record's own split, with a mechanism already on file: a correction addressed by a WINDOW needs the program to contain many response times, and a plant whose program is five of its own rises has a window that must reach its memory and therefore SPANS the program (§41's aliasing theorem, §49.11 on the arm, §62.5's 5.38x → 0.16x ladder on the barrel). It licenses a SCREEN with a number in it — under about ten response times per program, expect to need a diet and a re-derived window — **and it is now NINE points with four winners rather than five with one (plan §87.6)**. The three plants §86 added were scored after the screen was written: **realexch 80.0 · pend 31.6 · realtanks 20.2**, every one of them winning at the window rule's own derived value with NO re-derived constant, against **tank 7.9 · column 7.6 · barrel 5.2**, every one of which needed a designed diet or a carried constant re-derived four decades. The split at ten holds on nine plants, and the real arm is the row the column cannot read at all — its rise is unmeasurable and its INVERSE 128.3% is what discriminates instead.
| `test/pilot/distil-column.mjs` | **WOOD-BERRY WON BY THE OBJECT THAT SHIPS — TARGET 7's STANDING OPEN CLAUSE, MET (plan §64).** The plant this project has lost on since it was built, where the pilot cascade delivers 0.39x and the conventional rung finds no headroom at all. Through the one press the distilled rung **DEPLOYS at 2.44x** — 92% of the 2.65x `headroom.mjs` measures as available to any correction of its class — at 43 features, 138 MAC/decision and 0.7 kB, with no QP, no forecast bank, no tracker and no lap index. **And in the metric the LITERATURE reports it beats both baselines in BOTH scoring conventions**: IAE 38.52 against doing nothing's 43.90 and the published BLT's 51.95 cold, 25.26 against 29.12 and 49.62 settled. **Its first comparison was wrong in the way rule 20 names** — it warmed the column 3,000 steps (right by rule 13) and set that against `runBLT()`, which starts FRESH, so a warmed candidate met a cold incumbent and doing nothing read 29.12 where the record says 43.90; the gap IS the startup transient at **1.51x, larger than anything claimed**. There is now ONE scoring loop, every controller goes through it, both conventions print, and two controls say it is the loop those numbers came from: the cold do-nothing reproduces 43.90 and the cold BLT reproduces the rig's own `runBLT` to 1e-9. **Stated at the same volume**: three of four training runs were DROPPED below the rung's 1.5x bar so the fit is on ONE program at 2,624 rows; held-out R² is 0.397/0.046 and the machine disagrees with the gate — the opposite direction to the barrel's 0.94-0.98 gate over a rung the machine refuses, which is `distil.js`'s own "it is a PRE-FILTER" demonstrated twice; and it is one seed, one diet, one scenario. **The figures here are BEFORE §65's two harness repairs and §72's cost work** — declaring the lap closed takes this plant to 2.58x, and choosing the ridge ON THE MACHINE rather than carrying the arm's `1e-6` takes it to **3.643x** (plan §72.9, §72.14), at **59.3 days of column against the 251.6 it started at** (plan §72.6-§72.17). |
| `test/pilot/rigs/distilkit.mjs` | **THE WINDOW RULE AND THE VERDICT, WRITTEN ONCE (plan §64).** Every distilled-rung harness derives a window and prints a verdict, and a second copy of either has already drifted here: `distil-tank.mjs` carries the ARM's 0.61·Tset reach as though it were a rule, and §63.7 sized a window from `DIETS[0]`'s lap after the diet's laps had stopped being equal. The DIET is plant-specific and stays in the plant's harness; the derivation and the report are not (rule 61). The rule is `min(0.61·settle, shortest lap/8)` — the reach constraint and §41's aliasing bound, no plant constant in it — and it is EVIDENCE not proof: on the barrel it reads ±938 where §62.5 measured the transfer optimum at ±983 by an offline route with no rung in it, agreement to 5% on a plant sharing no physics with the one the fraction came from. The report leads with the TEACHER's own column (rule 27), because a prequential R² below zero has three cheap explanations `rep.distil.runs` already carries and the score cannot separate. Extraction control: the barrel is byte-identical across it. |
| `test/pilot/distil-barrel.mjs` | **THE DEPLOYED OBJECT ON THE PLANT WE HAVE ALWAYS REFUSED (plan §63).** `distil.js` is imported by exactly TWO plant harnesses; every other plant here scores the TEACHER. §62 measured the barrel's 15.11x oracle correction as 97-99% expressible by a causal map of the commanded reference with **5.38x surviving a program it never saw**, so this asks the LADDER for it. It drives through the shared `ladder()` and the shared `barrelSpec` rather than a fourth private copy of the plant's routing (rule 61) — `plants.test.mjs` across the change is byte-identical at tank 10.53x / column 1.00x / mill 1.74x / barrel 1.05x — adding exactly two fields: the rung's options and a diet of four three-zone changeover recipes, each CYCLED so it has a lap and none of them the scored program. **THE WINDOW IS DERIVED AND THE DERIVATION IS THE EXPERIMENT**: `min(0.61·settle, lap/8)` carries no plant constant and reads **±938 steps** against the **±983** §62.5 measured as the transfer optimum by an offline route with no rung, no teacher and no ladder in it. **The rung reached the plant and was refused BY ITS OWN FIT** — prequential R² -28.6/-49.1/-63.2, which is a solve coming apart and not a map with no information (that reads 0, not -63), with all four in-sample recipes at EXACTLY 1.000x, `distil-tank.mjs`'s recorded signature for a correction never applied. Standardising the row (rule 32 — `_rowFrom` leads with the ABSOLUTE reference, 18-62 percent of full power here against a joint angle on the arm, and follows with DIFFERENCES of order 0.1) is worth 3-5x of that and is NOT the cause; `ONLINE=0` is, and the batch route reads 0.95/0.79/0.89 and vouches where the streaming one reads -20 (plan §63.4-63.6). **AND EVERYTHING THIS FILE THEN CONCLUDED ABOUT THE BARREL'S TRANSFER IS RETRACTED (plan §65).** Two harness defects, both of a class already paid for once: the lap was never declared CLOSED, so the fit skipped the first REACH samples of every recipe (939 of 7,500 — plan §52.14), and the shared ladder passed only a DECIMATED `ctx.look`, so the DEPLOYED window was stretched by the cascade's stride against the one the fit saw (plan §51.5). The second is why the barrel and not the column: the column's cascade REFUSES, so its stride is 1 and the two closures are the same function. It explains the whole signature — in-sample 9-14x read through the raw reference, 0.27-0.48x on the machine through the stretched one — which is a DEPLOY-PATH fault that this file's own split names, and it was read as transfer instead. **AND WITH THOSE REPAIRED AND THE DIET SIZED, THE BARREL IS A WINNER: 10.61x DEPLOYED, REPLACING THE CASCADE (plan §66).** 5.2708e+0 → 4.7196e-1 through the one press — **70% of the 15.11x `headroom.mjs` measures as available to any correction of its class** — and it retires the cascade it was scored against: 21,440 MAC/cycle and 256.7 kB become **0 sliced MAC and 1.6 kB**. What moved it, in order: 0.479x (open lap, window stretched by the cascade's stride) → 0.783x (closed lap, raw look-ahead) → 0.852x (laps past the settle, reach sized to the ramp) → **10.609x** (a diet of THIS MACHINE'S OWN profiles in orders production never runs). **Three harness defects and a diet; nothing in the controller and nothing in the plant.** The band diagnostic INVERTS with the diet — the clamped-window bands that carried ALL the harm (0.365x / 0.706x) now carry the LARGEST gains (1.296x / 16.795x) — so §65.4's window-clamp mismatch is real but SECOND-ORDER, and what is first-order is §52.17 arriving on a plant sharing no physics with the arm: what bounds a program-agnostic feedforward is how far the diet is from the program it will run. **Claimed narrowly**: production is A→B→C→D and the four training cycles contain those transitions and their reverses in other sequences, none of them A→B→C→D, so the program is held out — but a diet sharing production's transitions is a weaker claim than one that knows nothing about it, and `DIET=far` keeps the unrelated profiles at **0.85x** as the control that says so. One seed, one diet, one scenario. Both original faults were silent and were caught by an outside objection rather than by a check, so `distilkit.mjs` now flags a run contributing fewer rows than its lap and `autostack.js` records when a host made the rung fall back to a decimated look-ahead. **AND THE 10.61x IS ITSELF RETRACTED BY A FACTOR OF THREE (plan §72.18): IT SHIPS AT 3.951x.** Every number above was measured with the plant REBUILT before each teacher call, and `ambient(k)` reads the plant's own step counter — so the rebuild reset the unmeasured drift to k = 0 and every call saw the IDENTICAL disturbance trajectory. A lap-periodic teacher can invert a disturbance that repeats exactly and cannot invert one that does not, and 20,000 steps is a whole number of neither 9,300 nor 4,100: the harness was quietly making an aperiodic disturbance periodic. The falsifier settles it — carried with `TH_NOAMB=1` the teacher recovers to 10.9/13.2/10.9/10.4x and the rung reads **14.949x**, against 1.85/1.03/2.17/4.03x and 3.951x with the drift on. A real barrel's room temperature is not phase-locked to a five-hour recipe cycle, so the CARRIED configuration is the one that models a machine and it ships; `CARRY=0` is the control. **It is also §71's mill finding from the other side**: that plant's dominant disturbance is periodic and DECLARED and the win is provably all of it, this one's is aperiodic and undeclared and the teacher cannot touch it — one sentence for two plants sharing no physics. **AND §80.6 SHARPENS THAT SENTENCE AND CORRECTS IT**: what matters is not periodic-against-aperiodic but COMMENSURATE-against-incommensurate WITH THE TEACHER'S LAP, and the mill's harness manufactures the former by starting every run a whole number of roll turns in. The barrel's drift is 0.9% of its open-loop error, so it was never being "rejected" by anyone; averaging the teacher's record over four laps recovers 6.116x → 9.995x with the drift still present (§80.7). |
| `test/pilot/distil-arm.mjs` — `SHOVE` | **AN UNMODELLED EXTERNAL FORCE, AND A CLAIM OF MINE RETRACTED (plan §81).** §80 measured "disturbance rejection" as a DECLARED exogenous signal, which is not what an owner means — an owner means the payload changes unexpectedly, or something pushes the machine. `SHOVE` injects a torque at the MOTORS on top of the servo (`stepresp.mjs`'s own injection point), as an impulse or a sustained load, scored against the CONVENTIONAL machine taking the SAME shove. **What survives**: the deployed object's OUTPUT is a function of the commanded reference alone, so its correction under a shove is BIT-IDENTICAL over 49,234 decisions — asserted, not argued, because the state term, the instrument tap and the feedback layer are all built and all read measured signals, so it is a property of the SHIPPED configuration (rule 30). **What is RETRACTED**: an earlier draft said it therefore "cannot explode", and that is wrong in substance. The disturbance is plainly visible in the actual motor torque and the servo is a PD on the MEASURED encoder, so **bit-identical output is not bit-identical effect** — the policy keeps demanding a correction sized for the NOMINAL plant on top of a loop already fighting the shove, and that demand is ADDITIVE on one drive. **Measured, sustained load as a multiple of tauMax: 6.62x / 6.60x / 6.07x / 3.62x / 0.87x at 0 / 0.1 / 0.25 / 0.5 / 1.0** — worse than not having it before the machine itself fails. **The saturation column is the mechanism and it CROSSES OVER**: undisturbed the policy clips LESS than the bare machine (4.8% against 7.7%) because it tracks better, and under load it clips MORE (14.0% against 8.1%), peaking at 417x tauMax against the conventional machine's 315x. And its RECOVERY from an impulse degrades 503% where the bare machine's degrades 22% — during the event it is better, and the tail is ruinous, which is what a feedforward confidently correcting for a plant that has moved looks like. **Its own first version was a null and the instrument was the fault**: a 5% of tauMax shove moved the machine 0.06%, because this loop's peak demand is 47x its torque limit and it already clips 7.7% of steps, so the disturbance was sized against the wrong quantity (rule 17) and would have read as "robust" when it means "nothing happened". One plant, one cell, one joint; the bench cell is heavily drive-limited, so the crossing point is not a constant to carry (rule 31). **AND §82.1 CORRECTS THIS ROW'S OWN HEADLINE.** At one tauMax the CONVENTIONAL machine is itself 8.2x worse than nominal and the drive is saturated 72-75% of the time on both — the machine has fallen over and the part is scrap whichever controller is fitted, so "worse than not having it" is true arithmetic about a failed machine rather than a controller result. **The sentence that should be quoted is the envelope where the machine still works: 6.62x / 6.60x / 6.07x / 3.62x at 0 / 0.1 / 0.25 / 0.5 of tauMax, with the conventional machine flat across the same span.** |
| `lib/pilot/distil.js` — `loadGuard`, `deploy.js` — `loadGain` | **THE PLANT-SIDE COVERAGE GUARD: BUILT, PROVABLY INERT, AND REFUTED AS A FIX (plan §82).** §75 recorded that the object fades outside the commanded-SPEED span but has NO analogue for the PLANT, and §81 measured the cost. The guard is that analogue and the exact twin of the speed guard: a normalised distress reading — the fraction of recent steps the drive could not deliver what it was asked for — faded between MULTIPLES of `report.loadMax`, the worst reading the COMMISSIONING itself observed, so no constant enters in the plant's units. It is FREE on a real installation (the drive already reports its own limit status, the one instrument a customer need not buy) and its gain is in [0,1], so it can only reduce the correction and cannot add energy. **The inert half is exact**: armed and undisturbed the arm reads 1.6181e-1 against 1.6181e-1 unarmed, 0.00% apart at both bands tried (rule 9's half that guards usually fail), and at half a tauMax the 5x-10x band is bit-identical to unguarded at 3.62x. **And it does NOT rescue the failure case — it makes it worse, monotonically: 0.87x unguarded, 0.84x fading at 2x-5x, 0.80x at 5x-10x.** So §81's apparent mechanism — the policy consuming drive headroom the loop needs — is a SYMPTOM and not the cause, refuted on the machine (rule 16), and it was my own proposal. **Its own first version was armed, inert and would have shipped as a success**: `loadSeen()` maxes distress over EVERY scored run of a commissioning including probes with no correction armed, reading 28.48% where the deployed policy's own run reads 7.0% — and with a 4x-10x band on that the fade began at 1.14 while the reading is a FRACTION capped at 1, so it could never fire at any load and every cell came back identical, which is exactly what "no false refusals" looks like (rules 17, 25). Opt-in and off. |
| `test/pilot/distil-arm.mjs` — `SHOVE=inertia`, `SHOVE=drag` | **A REFERENCE-CORRELATED DISTURBANCE AT LAST, AND THE OBJECT IS ALREADY RIGHT FOR IT (plan §84.7).** §83.2's phase-locked design failed because a lap FRACTION is a memory index across a diet of four different polygons, and §83.3's payload was too benign at 0.8% to separate anything. Both disturbance hooks in `autohost.js` now receive the COMMANDED JOINT REFERENCE, so a closure can difference it and build a load that is a function of what the machine was ASKED to do — identical on every program and formable by a linear map of the reference. Every existing closure ignores the argument, so unset is byte-identical. **`drag` (∝ commanded velocity) FAILED USEFULLY**: the conventional machine degrades 0.9%, because a velocity-proportional torque is a damping term the position loop's own velocity feedback absorbs — so nothing downstream of it can mean anything, and the row is kept because "the loop eats it" is a finding about what a disturbance test must avoid. **`inertia` is the one that discriminates**: the machine carries a mass it was not commissioned with, so the required torque rises with commanded ACCELERATION, peaking and REVERSING at the corners where a PD cannot absorb it — and a linear map forms it from a SECOND DIFFERENCE OF THREE TAPS. At 50% of tauMax it costs the CONVENTIONAL machine 10% and the policy **0.26%**, so the policy's advantage RISES, **6.62x → 7.25x** — and TRAINING with it is inert (7.25x → 7.26x disturbed, 6.63x → 6.63x clean). The mechanism is the object's own features: §52.16 put the rigid-body REFERENCE TORQUES in the regressor, so the correction is already the right SHAPE for a heavier machine and only its scale is off. **Its first version had the SIGN BACKWARDS and the machine said so** — injected positive the conventional arm got 10% BETTER, because a positive term is an inertia feedforward and not a payload (rule 14). **It completes §81 and §83 into one classification**: reference-correlated loads are FREE (advantage rises, training adds nothing), sustained/constant loads are COSTLY (6.62x → 3.62x at the same magnitude, §81), random loads are a HEDGE priced 1:1 (§83) — so DIS work on this object belongs in the one class it cannot express, not in showing it disturbances. |
| `test/pilot/distil-arm.mjs` — `TRAINSHOVE`, `SHOVEGAIN` | **TRAINING WITH THE DISTURBANCE PRESENT — MOSTLY A GAIN, AND NOT WHERE IT LOOKED (plan §83).** Domain randomisation, with the prediction written down first (rules 16, 59): the map's input is a window of the COMMANDED REFERENCE and a disturbance does not change it, so the same row carries different targets, least squares averages over them, and the map can only become HEDGED rather than disturbance-dependent — which should be equivalent to turning §79's applied gain down. **Half right.** Random injection trades **19% of nominal for 19% under load** (6.62x → 5.36x clean, 3.62x → 4.32x at half a tauMax) and asks the drive for less. **But the matched-gain control refutes the strong form**: at the same nominal cost a uniform gain reaches ~4.03x and the gain axis SATURATES near 4.05x however far it is turned down, so a scale cannot buy the last ~7%. **And the reference-correlated case LOST, for a reason worth more than a win**: trained with the load at a fixed LAP FRACTION and tested on exactly that disturbance, it degrades by the SAME RATIO as the clean policy (x0.89 against x0.90) — it learned nothing, because a lap fraction is a MEMORY INDEX and the diet is four different polygons, so "fraction 0.30-0.55" is a different region of reference-space on each. **Phase-locked is not reference-correlated** — the retirement's own lesson arriving inside a disturbance. The scale-free repair (a payload as a fraction of the COMMANDED TORQUE, which the map's rigid-body features already carry) is too benign to discriminate at 0.8%, so it is a null about the test rather than a finding (rule 25). **What it licenses**: the gain ladder costs four scored runs and already ships, disturbance-training costs a whole commissioning, and they buy almost the same thing — so the cheap one wins, and both are the same trade stated once: nominal performance for tolerance, about 1:1 on this plant. |
| `test/pilot/disscreen.mjs` | **IS THIS PLANT A DISTURBANCE TESTBED AT ALL? THE ONE-RUN SCREEN THAT GOES BEFORE ANY DIS WORK (plan §84.3).** §80 spent three sections on a premise §80.6 destroyed, and one run would have said so first. Decompose the OPEN-LOOP error at the RIG — no model, no fit, no controller of ours anywhere — and read three things: REPEATS (the same plant twice from `fresh()`; a bit-exact match is a POSITIVE statement that it has no stochastic component, taken on the machine rather than off the source), SHARE (the component switched off and the error re-measured), and CEILING (what the plant's own incumbent recovers from knowing it exactly — an upper bound on any correction of it). **OF ELEVEN PLANTS, ONE IS A TESTBED AND IT IS 95% EXHAUSTED.** The COLD MILL: eccentricity **87.02%** of the open-loop error ENERGY, entry wander 12.96%, the two accounting for 99.98% with the orthogonality check printed (15.156 against 15.154) — and **a PERFECT eccentricity rejector leaves 2.78x where the shipped object delivers 2.63x, which is 95% of the bound**, so §71's "withhold the phase and it is inert at 1.000x" read from the other end means this plant is nearly used up. The BARREL is screened OUT more decisively than §80.6 did it: the drift's share is **−6.93% of the whole run and +3.24% of the settled part** — **the sign FLIPS with the denominator**, so switching it off makes the plant WORSE open loop and it partly CANCELS the changeover error. Everything else has no exogenous component at all, and §84.1's byte-identical record-averaging is the machine saying so rather than a grep. **Two of its own claims were wrong first and both are printed as arithmetic now**: the share was quoted as a fraction of the rms drop, calling the eccentricity 64% of an error it is 87% of (rule 19), and the mill was written up as "past" a bound it is 95% of. **AND ITS "NEARLY EXHAUSTED" VERDICT IS ITSELF CORRECTED BY plan §85, IN THE SAME WAY (rule 19 again): THE BOUND WAS ON THE WRONG SUPPORT.** It bounds corrections of the DECLARED component, and the object is 95% through that one — but the ENTRY WANDER is a different component against which it has done nothing at all. Held flat (`NOWANDER=1`, each column against its OWN open loop) the mill reads **15.394 → 5.865 µm at 2.625x as it ships, against 14.289 → 2.033 µm at 7.029x**: the wander is 7% of the OPEN-LOOP error and **88% of the error ENERGY the shipped object LEAVES**, worth **2.68x** of delivered factor — and 2.033 µm IS the X-ray gauge's own 2.0 µm noise, so with it gone the object sits at this plant's instrument floor with nothing else left in the plant. So the mill is 95% exhausted of its declared disturbance and **0% of its undeclared one**. |
| `test/pilot/exopred.mjs`, `distil-barrel.mjs` — `EXO` | **DIS: DECLARING A DISTURBANCE IS NECESSARY AND NOT SUFFICIENT, AND THE TEACHER IS THE BLOCKED HALF (plan §80).** The cold mill wins 1.45x and §71 proved the win is ALL of one declaration — withhold the roll phase and the object is inert at exactly 1.000x — while §72.18 priced the BARREL's undeclared ambient drift at 3.951x against 14.949x with it held flat. So "declare what you measure" looked like a product claim. `exopred.mjs` is the falsifier that ran first (rule 1) and did NOT fire: a causal read of the disturbance's own noisy past predicts its TRUE future at R² **0.88 at +60 and 0.82 at +250** at the rig's own 0.35 K instrument — and >0.9995 at zero noise, which is the simulator and is printed to be dismissed (rule 15). So it was built, with no library change: `refDim` widens, and because a thermocouple has no future the channel is a **DELAYED copy** — at decision k the map is handed the reading from `k - REACH`, so the window's most-future tap is ambient NOW and every tap is causal BY CONSTRUCTION rather than by a guard. **It LOST: 6.116x → 5.533x causal, and 5.793x ORACLE — handed the disturbance's true future the map is still worse than not being told.** The oracle rung is what makes it decisive, and the channel is not inert (causal ≠ oracle, rule 25). **The cause is structural**: the teacher gains are BYTE-IDENTICAL across all three rungs, because the teacher converges a LAP-INDEXED correction from the measured error and never reads the declared channel — and this barrel's ambient is not lap-periodic, so the converged target has it averaged away. Held-out R² RISES 0.001 while the machine falls 6%: 21 columns diluting a fit whose target never contained a disturbance correction. **Rejecting a disturbance needs the TEACHER to represent it AND the MAP to express it; the mill has both, the barrel neither, and declaring supplies only the second.** And it is not one teacher's limit — `oracleteach.mjs` indexes `k % L` and `hff` inverts at the lap's harmonics, so **every teacher here is lap-indexed**: the retirement removed lap-indexing from the PRODUCT and left it in the TEACHER, which is the DIS ceiling, named. **AND THAT CEILING IS NOW BOUNDED, WITHOUT A NEW RUN (plan §84.12).** Two things say do not build a differently-addressed teacher yet. The obvious form IS BUILT: `AutoStack._iteratePolicy` is joint PROJECTED iteration — each pass fits one policy in the PRODUCT's own row space, so what iterates is a map of the reference and never a lap table — and §52.16 read it at **5.06x against the lap table's 6.04x**. And §84.1 measured what the lap-specific part is worth to the product: on the MILL, averaging it out of the record drops the TEACHER 2.9x and moves the delivered object 0.3%, so the ceiling costs nothing when you walk into it there. **The size of the prize is `1 − R²`, the share of the teacher's target the deployed object cannot express, and every harness already prints it**: tank ~0.8% · arm 5-16% · mill 14% · barrel 13-24% · **column 31-54%**. The ordering is the finding — smallest where the target is already a function of the reference, largest on the plant this project lost on longest and where the oracle teacher is worth the most (3.64x → 5.49x) — so the column is where such a teacher would be built and the TANK is where it provably cannot help. Stated limit: it is the FIT's R², so it conflates "not a function of the reference" with "this linear map missed it", and the columns are commensurable only as an ordering. `EXO=off` is the control and reproduces 6.116x byte-identically. **AND THE PREMISE UNDERNEATH ALL OF IT IS RETRACTED, WHICH IS WORTH MORE THAN THE EXPERIMENT (plan §80.6).** Before building a second learned layer, the INCUMBENT was priced with the same information (rule 20): computing the engineer's own closed-form feedforward at the MEASURED ambient rather than the nominal one is worth **1.008x, and 1.009x with a PERFECT thermometer**. So the declaration is not being wasted by our architecture — there is almost nothing to declare, and the control says so outright: the drift is **0.9% of the open-loop error** (5.6301 against 5.5802 K rms) — of order 5% of what REMAINS once the rung has removed the changeover transient, which is the honest denominator and is stated because it is the obvious objection. A component at a few percent of the residual cannot cost a factor of 3.8 by going uncorrected, and the 1.009x from a PERFECT thermometer bounds what correcting it is worth however the denominator is chosen, so §72.18's "a real barrel's room temperature costs a factor of three" is **NOT a disturbance-rejection deficit**: it is TEACHER CORRUPTION, because a lap-indexed teacher needs its target commensurate with its lap and 9,300 and 4,100 against a 20,000-step lap land near harmonics 2 and 5 and BEAT against them. It explains the mill with no new idea — that harness starts every run a whole number of TURNS in, which MAKES its disturbance lap-commensurate. |
| `test/pilot/millobs.mjs` | **THE DISTURBANCE OBSERVER, BUILT AND MEASURED: WORTH 1.29x AND DESTROYED BY 2% OF MODEL ERROR (plan §85.2).** The structure the owner asked about — the plant and a SIMULATED plant under the same command, their difference low-passed and driven to zero — which on this plant, with its 100-step transport delay, is a Smith predictor. Scored on the TRUTH through the rig's own `score()`, so every row is comparable to the classical baselines by construction. **Its first version measured the wrong configuration and read a null (1.03x), which is rule 19 for the third time on this plant**: run on the BARE machine the wander is 7% of the open-loop error, so the observer was performing at 93% of a prize that was not there. Against a PROXY for what the object leaves — a perfect rejector of the DECLARED eccentricity, 2.62x, against the shipped object's 2.625x — it is worth **1.29x, 5.775 → 4.470 µm**, with a perfect wander rejector at 7.03x. **Then the falsifier decides it**: move the model's two moduli off the plant's and it reads 1.29x / 1.12x / 0.84x / 0.41x / 0.21x at 0 / 1 / 2 / 5 / 10% — **worse than not having it at 2%, worse than doing nothing at 5%** — while §84.4 deployed the FROZEN weight vector across eleven cells of plant change with nothing made worse. **A feedforward identified once is robust to plant error and blind to disturbance; an observer differenced against a running model sees the disturbance and cannot tell it from plant error.** They fail in orthogonal directions, which is why the composition is worth 1.29x and why neither can be the other — and this mill's own incumbent, the gaugemeter AGC, is a model-based inference reading 0.84x, worse than open loop. Lower gain buys the tolerance back at 1:1 (gain 0.3: 1.17x nominal, 1.09x at 2%), which is §79's applied-gain axis in a third place. |
| `test/pilot/rigs/distilkit.mjs` — `teachAvg`, `TAVG` | **THE CURE IS LAPS, NOT ARCHITECTURE — 6.116x → 9.995x, AND THE CLEAREST ROB EVIDENCE IN THIS PROJECT (plan §80.7).** If §80.6's mechanism is commensurability then an incommensurate component averages DOWN over laps and a lap-periodic one does not. The teacher inverts the LAST lap; `TAVG=n` averages its record over the last n — no new rung, no new channel, no library change, it costs laps and nothing else. Delivered **6.116x (2 laps / no averaging) · 3.643x (3 laps, NO averaging) · 4.535x (3/2) · 9.995x (5/4)**, and the teacher at 5/4 reads 9.8/12.5/9.8/9.0x against the 10.9/13.2/10.9/10.4x §72.18 measured with the drift DELETED — averaging with the disturbance present recovers what removing it recovered. **THE MATCHED CONTROL IS WHAT MAKES IT A MECHANISM (rule 20)**: more laps ALONE reads 3.643x, WORSE than today, so a ladder that only raised the lap count would have concluded the opposite. **AND THE FALSIFIER FIRES THE RIGHT WAY**: with the drift removed there is nothing incommensurate to average, so the knob must be inert — 15.054x against 15.069x, 0.1% apart, rule 21's signature. **COST: 34.9 → 84.9 days of plant time, 2.4x, for 1.63x**, on a plant already 33x over target 4, recovering about half the log gap to the no-drift ceiling — a trade an owner makes, not a free win, and NOT a default (rule 31: one plant, one disturbance, one seed). **AND THAT GENERAL SENTENCE IS RETRACTED BY THE THREE OTHER PLANTS, WHICH IS WHY THE KNOB IS NOW IN THE SHARED KIT (plan §84.1).** It read *a 0.9% NON-REPEATING component costs the commissioned result 1.6 to 2.5x, and every real plant has one*. Moved to `distilkit.mjs` as `teachAvg` and asked of three more plants, it is **INERT ON ALL THREE**: the COLUMN comes back BYTE-IDENTICAL at 3.7440e-2 with an identical 2.109x teacher at every setting to 5/4, the TANK moves 0.006%, and the MILL's product moves 0.3% across a ladder that triples its laps. The two nulls are the correct ones — deterministic rigs carried across the teacher's calls have no non-repeating component for a knob that only removes non-repeating components to find (rule 21). **The MILL is the finding: its TEACHER falls 2.9x, 7.5x → 2.6x, and the delivered object does not notice** — `hff` was inverting the unmeasured entry wander lap by lap and scoring itself for it, where a map of the commanded reference could never express it. So averaging is FREE AND USELESS there, at 12% of the bill. **What replaces the retracted sentence is a SCREEN the ladder already prints**: read the SPREAD of the teacher's per-run scores across the diet — tight (mill 6.78-8.25, 1.22x) means it is converging and averaging will be inert; erratic (barrel 1.03-4.03x, **3.9x**) means it is fighting a target that moves between calls, which is the one case averaging repairs. One plant of four fails the screen and it is the one plant of four where the knob pays. |
| `test/pilot/headroom.mjs` | **NOT A TEST — IS THIS PLANT WINNABLE AT ALL, AND BY THE OBJECT WE ACTUALLY SHIP? (plan §61, §62).** Two questions the ladder cannot answer about its own refusals. **HEADROOM** solves for the best piecewise-constant correction with the MACHINE IN THE LOOP — each pass re-measures the plant's response around the correction found so far — so the number is DELIVERED by construction and needs no model to be valid, which is what a bound used to STRIKE a plant has to be: tank 47.8x→249.6x, column 2.65x→6.15x, barrel 15.11x, mill 1.07x→1.69x (the one plant whose pilot BEATS the bound, so it is a bound on a CLASS and not on the plant). **REACHABLE** then regresses that correction onto a window of the commanded reference — `distil.js`'s own form — and drives the machine with it. **Three of its own metrics were wrong first and each is recorded.** The ridge was `1e-6·sum(row²)/rows`, a mean ROW norm and therefore 3e-8 of the DIAGONAL it was regularising, which read as a transfer failure at R² -13273 (rule 32); it is now relative to the normal matrix's own trace and SELECTED on an inner split of the training half. The held-out R² on the column then still read -13705 because that fold holds **0.007** of the record's own spread — a variance ratio with no variance in it (rule 19) — so the fold's spread and an NRMSE against the whole record are printed beside it. And the time split was never the transfer test at all: `ALT=1` retimes and rescales the plant's own program, and **the column transfers at 2.59x against 2.62x at home while the barrel collapses from 14.70x to 0.16x** — the same instrument separating two plants that its in-sample column cannot tell apart. |
| `test/pilot/rigs/specs.mjs` | **THE FOUR PLANT SPECS, EXTRACTED FROM `plants.test.mjs` so an instrument can drive the same plants without a second copy of their routing (plan §59).** The same move made for `rigs/ladder.mjs` one level up — the DRIVER was shared first, now the SPECS are. A second copy of a plant's routing has shipped a defect three separate times here. The control is byte-identity of `plants.test.mjs`; the STATIC half is verified character-identical per spec body, and the only semantic changes are `G_MP` moving modules at the same literal and construction moving to module load, which cannot matter because every field is a pure expression and the rigs seed inside `fresh()`. States in its own header why the seeded rigs make a paired-run subtraction exact rather than statistical.
| `test/pilot/rigs/specs.mjs` — the mill | **THE COLD MILL IS A WINNER IN THE SHARED TABLE: 1.00x REFUSED → 1.74x, AND IT WAS NEVER THE ALGORITHM (plan §60).** `millSpec.fresh()` handed the pilot a machine with NO warmup — the only one of four specs without one, against the tank's 30,000 settling steps, the barrel's 20,000, and the 4,000 that `rollmill.test.mjs` (the harness that WINS on this rig) runs before its own commissioning. **Neither repair works alone**: `deadTime` alone reads 0.72x, WORSE than doing neither, because a correct-length horizon (N 14 → 42) inverts a startup transient; the warmup alone leaves N 14, inside the dead zone where `hGrid` is structurally zero; together they read **1.74x deploying a two-layer cascade**, past rollmill's own 1.49x. Tested one at a time each looks useless or harmful, which is why it sat undiscovered. Tank and barrel byte-identical across the change (rule 21). Three byte-identical eliminations came first — `verifyRef` (inert under `autoRefuse: false`, so the 0.72x was a MACHINE score and not a gate), `NOCLASSIC=1`, and the wiring — and the FIRST control read the wrong quantity (rule 19): the shipped row is identical whether the mill refuses declared or undeclared, because a refusal delivers the open-loop number by construction, while the internals said the option had landed all along. **A startup-transient probe now exists and caught Wood-Berry at 19x — where the same repair is INERT** (0.40x → 0.39x), which confirms §59's reading that the column's failure is interaction and not its starting condition.
| `test/pilot/rigs/meter.mjs` | **THE PLANT'S OWN CLOCK, COUNTED AT THE PLANT (plan §72).** One counter, ticked inside each rig's own `step`, so no caller can bypass it and the TEACHER and the PRODUCT land on one axis. It is here and not in the harnesses because every harness advances its plant from a different place — the ladder's scored `run`, its `drivePilot`, and each diet closure's own loop — so a counter wired per call site misses the next one added (rule 61). It buckets by a LABEL that `rigs/ladder.mjs` sets in one place, and anything unlabelled lands in `other` rather than being credited to the phase above it (rule 25) — which is how `distil-tank.mjs` read `other 100%` until it labelled its own phases. What it found: **the product's commissioning is 40-65x the teacher's**, and the mill — the ONE plant of four meeting target 4 — misses it by fifty for the object that actually deploys. Then it decomposed: **teacher 84-98%, cascade 2-19%, verify 2-6%**, so the machine-scored verify everything here treats as the expensive part is a rounding error. |
| `lib/pilot/autostack.js` — the ②d gain axis, `distilkit.mjs` — `gainLadder` | **THE APPLIED GAIN, THE THIRD LADDER AXIS AND THE CHEAPEST ONE THIS PROJECT HAS (plan §79).** The ridge axis regularises the FIT; the gain the fitted map is APPLIED at is a different quantity with its own optimum, and nothing here had ever scored it. It was found by an ACCIDENT — §78.5's false refusal zeroed the tank's map on 28% of its steps and read 19% better — and then reproduced without the bug: a uniform 0.90 gives the guard's number to three figures, so there was no structure in it, only a gain. A candidate needs **NO REFIT** (scaling the stored weights by `g` is exactly scaling the output), so it costs ONE SCORED RUN against the ridge axis's refit-plus-run, and the deployed object is unchanged in form — same vector, same MAC, same bytes, because the gain never appears at deploy. **1.0 IS IN THE GRID**, which is what makes it a measurement rather than a tuning: the TANK picks 0.85 (2.593x → 3.268x, and 2.301x → 2.657x on a recipe it was not chosen on). **AND §84.6 RETRACTS THE REST OF THIS ROW'S OWN HEADLINE.** It read *the mill, column, barrel and arm all pick 1.0 and come back byte-identical* — but 1.0 was the TOP OF THE GRID, so three of those four picks were EDGES and not optima, which is the exact fault this row names two sentences later and fixed only for the arm. Widened above 1: **only the MILL's 1.0 survives as an interior optimum; the COLUMN picks 1.15 for 3.643x → 3.959x and the BARREL picks 1.15 for 6.116x → 6.997x** — three plants of four want a gain off 1.0 and two want it ABOVE, which a one-sided grid could never have found. `DEFAULT_GAINS` is now `[0.72, 0.85, 1, 1.15, 1.3]` (0.5 dropped: worst on all four, never picked). **And both of §79's hypotheses for why the tank differs are dead from the same scrape**: the picked ridges are mill 1, barrel 1, tank 0.1, column 1e-3, so the two plants SIX decades from the arm's `1e-6` pick 1.00 and 1.15 while the tank at five decades wants shrinking; and the barrel and column are setpoint sequences too. What the four points do line up with — offered as a hypothesis — is the fit's own held-out R², monotonically: 0.993 → 0.85, 0.857 → 1.00, 0.85 → 1.15, 0.57 → 1.15. A heavily-ridged fit is shrunk by its own regulariser and the machine wants some back; a fit that interpolates its diet wants damping, because confidence about the DIET is not confidence about production. Ridge and gain as two ends of one knob, which is `qpIters` and `lambda` on a second route. The arm's is the one worth the extra wiring — it does not carry the ridge ladder, so it would have been byte-identical BY CONSTRUCTION, and "the block was skipped" and "the block ran and chose 1.0" are different states (rule 25). Asked through `GAINS=` with the grid widened ABOVE 1, because a one-sided grid cannot find an optimum at its own edge, it reads **3.969x at 0.85 and 3.973x at 1.15** against 6.623x at 1.0 — a locally quadratic optimum sitting exactly on 1, on the fitted program and both it has never run. Rule 42's band breaks toward the LARGEST gain: change the shipped object as little as the measurement allows. `GAINS=none` is the control. **AND THE GRID NOW FOLLOWS ITS OWN PICK, BECAUSE §84.6's REPAIR WIDENED ONE SIDE AND LEFT THE OTHER (plan §86.6).** The bottom stayed at 0.72 and the three plants added since — the cart-pole, the real tank, the real arm — every one picked 0.72, which is the same EDGE fault at the other end. A wider fixed grid is the wrong repair (it charges every plant a scored run for a region only some occupy, and the tank's verify is already 44% of its bill), so if the best-scoring candidate is the smallest or largest tried the grid steps once more in that direction at its own geometric ratio, bounded at six steps and at (0.02, 4). It extends on the ARGMIN and not on the band's tie-break winner, or a rung inert at every gain would walk upward for ever. **The control is that mill 2.62x at 1.0, tank 3.268x at 0.85, column 3.96x at 1.15 and barrel 7.00x at 1.15 all come back BYTE-IDENTICAL** — four interior picks, nothing to extend (rule 21) — and where it fires it is worth the cart-pole's 6.30x → 11.93x and the real tank's interior 0.314. |
| `test/pilot/rigs/distilkit.mjs` — `priceFrom`, `ridgeLadder`, `carrier` | **THE THREE THINGS §72 ADDED TO THE SHARED KIT, EACH BECAUSE A SECOND COPY WOULD HAVE DRIFTED.** `priceFrom` opens the meter and prints the product's bill with its per-phase split, closed the moment the ladder returns because `reportDistil`'s in-sample column re-runs every training program and charging that would price the instrument. `ridgeLadder` hands `AutoStack` a fixed geometric grid of candidates to refit and SCORE ON THE MACHINE — a DESIGN in the same sense as the offset `SHAPE`, carrying no plant's number, which is the point since `1e-6` was the arm's. `carrier` keeps ONE plant per training run across the teacher's calls, which `lib/flexisim/autohost.js` has done for the arm since §52.12 and the plant harnesses never did. **It also throws when the rung throws**: `AutoStack` catches what `distilRuns()` raises into `rep.distil.error` — right, one bad diet must not take a commissioning down — and nothing read the field, so a missing import produced a rung that never ran, a 1.000x, a summary reading "it REFUSED" and a GREEN test. "Did not run" and "ran and declined" are different states (rule 25). |
| `test/pilot/progcost.mjs` | **WHAT A SECOND PROGRAM COSTS — target 1's price, and the answer a customer gets is ZERO (plan §84.5).** §72.12 split the product's commissioning into a once-per-PLANT half and a per-PROGRAM half and measured two plants of four; every harness has been PRINTING the split all along (`priceFrom`'s per-training-run line), so this is a SCRAPE like `commtime.mjs` and no plant is re-scored by an invented metric. **Adding one more program to the diet costs 10-17% of the commissioning on all four plants** — mill 29.2 min once + 9.9 min each, tank 26.4 h + 3.9 h, column 20.1 days + 4.0, barrel 21.1 days + 4.7 — a narrow spread across plants whose bills differ by 900x, which is what makes it a property of the method rather than of a plant: run 0 pays probe sizing, the probe set and the trial sweep, and every run after it REUSES the operator and pays refinement alone. **But the marginal column is NOT what a new part costs.** The deployed object is program-agnostic by construction, so a program inside the trained envelope costs no lap, no refit and no download; the 10-17% is what a DIET ENLARGEMENT costs, which is the fallback when transfer is not good enough. Quoting the marginal column as "the cost of a new program" overstates the bill by infinity and quoting zero alone hides the fallback, so the instrument prints both. **The tank's VERIFY share is the outlier at 44% against 16-19%**, because it is the one plant carrying both machine-scored ladders at full width — the cost of the ridge and gain axes, stated where it can be read. |
| `test/pilot/commtime.mjs` | **WHAT COMMISSIONING COSTS THE PLANT, ON EVERY PLANT — target 4's number, which each rig has been PRINTING all along (plan §54.6).** A SCRAPE of the line each plant already prints in its OWN process time, not a re-measurement, so no plant is re-scored by a metric this file invented. **One of the four plants that state a clock meets target 4; the spread is 1643x; and the two that state none read UNKNOWN rather than met (rule 25) — one of them being the arm, which the target claims as MET on a simulator's wall clock.** It prints the STEPS and TIME rankings side by side and says when they disagree, which they do: Wood-Berry is the cheapest here in steps and the most expensive in days. |
| `test/pilot/distil-arm.mjs` — `EXPLAIN=1`, `PLANTSPAN`, `PROBEPTS`, `DIETFEED` | **THE THREE SCORECARD COLUMNS, MEASURED THROUGH ONE HARNESS (plan §74-§76).** `PROBEPTS=K` degrades what the TEACHER may measure to K evenly spaced touches of the lap and nowhere else — record AND monotone gate, because a probe degrades both — and found 64 touches worth a laser tracker. `PLANTSPAN=K:E,...` deploys the FROZEN weight vector on machines built at other stiffnesses, each against the conventional machine at its own stiffness, and found graceful degradation where this file claimed catastrophic. `EXPLAIN=1` regresses the applied correction on the engineer's own four names at a ladder of leads and found 79%/93% of it unnameable — the first scorecard cell measured that went DOWN. `DIETFEED` scales the training feeds with the plant held, and its finding is that it cannot answer what it was built for: both directions are confounded by the diet's own quality. Every one of the four is unset-byte-identical, checked. |
| `docs/scorecard.md` | **WHERE THIS OBJECT STANDS AGAINST THE FIELD, COLUMN BY COLUMN — and it exists because the scorecard did not (plan §74).** The rating that has driven three sessions of work — "disturbance rejection is 2/10, its worst aspect", "the next column by gap after DIS is COM, 3/10 against PID+FF's 8/10" — lived in conversation and nowhere in this repository, which is rule 30 aimed at a priority order: a list nobody can re-derive is a preference. Ten columns, every cell citing a measurement or saying UNKNOWN (rule 25), rating the DEPLOYED object and not the teacher or the simulator. What it changed the moment it was written down: **the largest gap is INS, the instrument the customer must own (3 against 9), and it always was** — CLAUDE.md has said so in prose for longer than the scorecard has existed. It also states what it is not: one rival built on the arm, two on EMPS, one disqualified, and the incumbent column is PID+FF measured on this project's own rigs. |
| `test/pilot/rigs/oracleteach.mjs` | **THE PILOT AS THE TEACHER, FOR THE PLANT HARNESSES (plan §73.9-§73.16).** `hff` spends its laps IDENTIFYING an operator by probing at the lap's harmonics; the oracle port replaces exactly that, so the QP inverts the truth instead of a prediction of it and no probe set is needed. The arm's algorithm EXTRACTED rather than rewritten (rule 61), with the one thing that does not carry — the arm's harmonic-basis `qFilter` — replaced by a BACKTRACKING step, which is `hff`'s own remedy and carries no constant. **It teaches from a REFUSED cascade**, which is what made it reach three plants instead of one: `AutoStack` nulls `this.stack` when a cascade loses its verify, and a rung's verify scores exactly what the teaching port replaces. It also returns SNAPSHOTS of the prefixes it passed through, free because the iteration is monotone, so the pass count becomes the ladder's second machine-scored axis instead of a carried constant. Two plants better, two worse; opt-in. | **AND IT NOW ALSO SUPPLIES THE PLANTS' MISSING `teach`, WHICH IS WHAT MADE THE LAP-FREE TEACHER REACH A PLANT (plan §90.3).** `AutoStack._iteratePolicy` has BEEN the lap-free teacher since §52.16 — what iterates is a `DistilPolicy`, a map of the commanded reference, and the lap index survives only as an addressing scheme for one pass's target vector — and it read **5.06x against the lap table's 6.04x** on the arm. It was arm-only for thirty sections for one reason: it runs when `runs.every((t) => t.teach)`, and exactly ONE module in this repository supplied `teach`. `oracleTeach` builds `run` and `teach` from the SAME `drive` closure `oracleConverge` already takes, so a plant that can be taught by the oracle can be taught parametrically with no new plumbing of its own (rule 61). **Its `run` deliberately OVERRIDES the harness's own and the reason is a SHAPE**: a plant's `run` returns `err` indexed `[channel][k]` — what `hff` inverts — while the oracle port reads `rec` indexed `[k][channel]`, so handing `_iteratePolicy` the first would index a Float64Array by a channel number and read `undefined` at every step without throwing; both shapes come back so no consumer can break. **AND IT THROWS WHEN NO CASCADE EXISTS**, because the first mill run returned an increment of exactly zero and reported *teacher 1.000x, rows 0, DROPPED, engine parametric, passes 0* — every line of which is what a teacher that RAN AND FOUND NOTHING looks like, where what had happened is that the increment generator was never built (rule 25, third time in this project). |
| `lib/pilot/autostack.js` — `_iteratePolicy` | **THE LAP-FREE TEACHER, AND THE THREE THINGS THAT KEPT IT ON ONE PLANT (plan §90.3).** Each is the arm's shape left in a shared path rather than a design decision, and **the arm is byte-identical across all three** (nc is 2 and it supplies `speedAt`), which is what says they were repairs (rule 21): `heldCorr` initialised `let held = [0, 0]` — the CHANNEL COUNT written in — and CALLED `tr.speedAt(k)`, a field no plant harness supplies, where `addProgram` has always tolerated `speedAt: undefined` and that is why the SIGNAL engine runs everywhere; and the target row was built as `[c[0] + uOut[0][k], c[1] + uOut[1][k]]`, two channels always, so a one-channel plant carried a column of `undefined + undefined` and the three-channel barrel lost its third. **AND IT GAINED A LINE SEARCH, DEFAULT 0 SO THE ARM IS BYTE-IDENTICAL (plan §90.3b).** It fits, scores ON THE MACHINE and keeps-or-abandons — a machine-scored guard, which is stronger than a line search and also COARSER, since an overshooting pass is rejected WHOLE rather than scaled. `oracleConverge` has halved failing steps since §73.10 for exactly this reason, measured on the extruder barrel (*without it the barrel overshoots on pass 0 and diverges on pass 1*), and asked parametrically that plant duly reported `teacher 1.000x, rows 0, passes 1` — the fit deployed and the machine scored it worse. A rejected increment is now halved and the policy RE-FITTED to the damped target, which is a different object from scaling a fitted map: the fit sees the target it will actually be asked to reproduce. A fit that REFUSES still ends the iteration, because a map that cannot beat a shuffled null on the full increment will not on a smaller one. `learnLive` — the page's shipped *Learn on this program* — runs through this function at the default, which is why the byte-identity is a requirement and not a courtesy. **AND THE LINE SEARCH DID NOT RESCUE THE PLANT IT WAS BUILT FOR, WHICH IS HOW THE ROUTE GOT ITS BOUND (plan §90.3c).** On the barrel it reads `passes 1` with all four runs dropped at scales 1, 1/2, 1/4 and 1/8 — so the increment is not merely too large, and damping it does not make it right. **The cause bounds the route rather than the plant: the increments come from the CASCADE, so the lap-free teacher can be no better than the cascade it takes them from.** The mill's is 1.74x and DEPLOYING (§60's own winner) and the teacher works there; the barrel's is 1.05x, the standing refusal, and §62.4 measured its pilot correction as harmful at every setting — *every setting that applies a real correction is worse than doing nothing* — so the parametric teacher inherits that failure where `hff`, which never consults the cascade, reaches 1.03-4.03x. **That is the deeper reason it was arm-only and it is not the plumbing §90.3 repaired**: the arm's cascade deploys at 1.33-1.34x. So this is NOT a general replacement — it is available where the cascade is good, which is narrower and more useful, and the screen costs nothing because every ladder already prints the cascade's verify. **AND BOTH PLANTS ARE NOW RUN: THE TANK'S PREDICTION HOLDS AND THE COLUMN'S IS REFUTED BY ITS OWN STATED FALSIFIER (plan §101).** It read *the COLUMN (0.39x) and the QUADRUPLE TANK (refuses every layer) should produce nothing, and **if the column works anyway this account is wrong**.* **IT WAS UNTESTABLE RATHER THAN UNRUN**: neither harness wired `oracleTeach` at all — `PARAM` and `oracleTeach` each appeared ZERO times in both files — though both already had a suitable drive closure passed INLINE to `oracleConverge` where the mill and barrel had NAMED theirs so both teachers could share one loop (rule 61). Hoisted, both controls are byte-identical (column 3.96x at gain 1.15, tank 19.910x), and the tank had to be OFFERED a cascade because §73.16's missing `drivePilot` would have made a throw mean *never built* rather than the predicted *built and refused* (rule 25) — wired, it builds one at **depth 1, 0.17x, refused**, so it was genuinely asked. **THE TANK PRODUCES NOTHING, FOR THE RIGHT REASON**: 0.985 / 1.083 / 1.093 / 1.012x per run, the rung refused at 0.12x, the block shipping the incumbent's 19.910x unchanged. **THE COLUMN WORKS**: 4 of 4 runs KEPT at **3.223 / 3.261 / 2.935 / 2.686x**, 12,000 rows against the hff route's 3,000, delivering **3.40x**. **SO THE MECHANISM FALLS, AND THIS PROJECT ALREADY KNEW BETTER.** Ordered by the cascade's verify as a RUNG the teaching ability is not monotone — **0.17x tank nothing · 0.39x column 2.7-3.3x · 1.05x barrel nothing · 1.33x arm works · 1.74x mill works** — so the worst cascade in the table teaches the second best, and *the cascade's verify does not order its value as a teacher* is §52.33's finding already measured for the OTHER teacher and written in this file: *as a RUNG the cascade is judged on whether its FORECAST inverts the machine well enough to ship, and as a TEACHER it is handed the measured error and asked only for the increment that cancels it.* §90.3c re-made for `_iteratePolicy` the conflation §52.33 had already refuted for `hff`. What survives is weaker and still useful: the teacher needs a cascade that EXISTS, which §90.3's own throw covers, and nothing beyond that about its score. **AND THE FORWARD-LOOKING HALF IS THAT IT TEACHES BETTER PER RUN AND DELIVERS WORSE**: on the column it improves EVERY run 2.7-3.3x where `hff` improves one at 2.109x and DROPS the other three below the 1.5x bar — a diet fully used against a quarter used — and then delivers 3.40x against 3.96x, which is §49's law on a tenth knob, stated as suggestive because these are two teachers and not one knob moved. Where that could matter is NAMED AND NOT RUN: a plant whose diet is the binding constraint (§52.17, §66) rather than one where `hff` already suffices. **AND MY FIRST RUN WAS THE EXACT MISTAKE §90.3 WARNS ABOUT IN WRITING** — the gate is `!!distilOpts.parametric && runs.every((t) => t.teach)`, I wired `teach` and not `parametric`, and the run took the hff route SILENTLY and printed `engine hff` at 3.96x, indistinguishable from the parametric engine running and finding nothing. `PARAM` is opt-in and OFF on both plants. |
| `lib/pilot/distil.js` — `declare`, `deploy.js` — `declGain` | **A DECLARED OPERATING POINT HAS A SPAN, AND A POINT SPAN REFUSES (plan §90.4).** §89.2 measured that this project's one disturbance-rejection win rests on TWO declarations behaving completely differently: the cold mill's roll phase is read by an ENCODER, honest at any line speed, and a gauge change leaves the object EXACTLY inert (2.625x → 2.625x across ±10%); its transport delay is a NUMBER TYPED IN at commissioning and the lead the fit chose against it is baked into the WEIGHTS, so another line speed reads 0.770x then 0.562x. The library could not tell them apart — `refDim` merely widens and `deadTime` is a constant. `addProgram({ declare })` widens a span per declared scalar exactly as the commanded-speed span is widened, `report.declSpan` carries it, and both sides of the deploy boundary fade outside it. **A POINT SPAN REFUSES OUTSIDE ITSELF**: one commissioning observes one value, and widening it with a margin would be a per-plant constant invented to soften a refusal (rule 31) — tolerance comes from declaring the scalar ACROSS a span, which is target 2's own lesson that *feed-invariance comes from TRAINING ACROSS FEEDS, never from INDEXING BY FEED*. `logSpec` names the declared fields, or a faded decision could not be replayed. **ASSERTED BOTH WAYS, because the last two guards here shipped armed and inert** (§82's could never exceed its own threshold; §78.5's was calibrated on a signal that could not trigger it): nothing declared reads **exactly 1 whatever it is handed**, which is what makes the addition byte-identical on every existing plant; at the declared point exactly 1; outside a point span exactly 0; NOT TOLD reads full coverage rather than refusing invisibly on a wiring fault (rule 25); a declared span fades monotonically and reaches exactly 0; and the two separate implementations agree **BIT-EXACTLY over 201 values**. **AND IT IS NOW REACHED, AND DOING EXACTLY WHAT IT WAS BUILT TO DO COSTS THE MACHINE 2x (plan §100).** §90.4 said *no plant declares anything*; it was worse — **`AutoStack` called `actLook` with FOUR arguments**, so `decls` defaulted to null and the guard was inert THROUGH THE ONE PRESS by construction, unreachable however much a host declared. **That is the third guard here shipped armed and unreachable** and the shape is identical every time: §82's could never exceed its own threshold, §78.5's was calibrated on a signal that could not trigger it, and this one was never called — all three passing their own unit tests, because a unit test reaches the function directly and what was broken was the path to it (rules 9, 25). Fixed: `ctx.decls` reaches `actLook` and `tr.declare` reaches all SIX `addProgram` sites including the ridge/pass ladder that builds the shipping candidate; a host that declares nothing is byte-identical. **THE MECHANICAL PREDICTION HELD AND THE GAUGE ROWS ARE THE CONTROL THAT GIVES IT TEETH**: with `vLine` declared the SPEED rows go 2.020x → **1.000x** and 1.474x → **1.000x** while the GAUGE rows and the commissioned point come back UNTOUCHED at 2.625x, so it refuses on the operating point and not on the fact that a knob was turned; `DECL` unset reproduces §89.2's whole table exactly (rule 21). **AND THE PRODUCT PREDICTION, WRITTEN BEFORE THE RUN, CONTRADICTED §90.4's OWN AND ALSO HELD.** §90.4's success criterion was *convert 0.770x and 0.562x into REFUSALS at 1.000x* — and those are FRACTIONS OF THE COMMISSIONED FACTOR, so reading them as a verdict is rule 19. In the machine's own units those rows are **2.020x and 1.474x, both HELPING**, and the guard working perfectly throws that away; it also takes target 1's own column from 0.770 and 0.562 to **0.381**. *Nothing made worse* survives, which is what makes the row worth keeping: that clause is satisfied by a guard that discards half the benefit. **THE CRITERION THIS CORRECTS IS WORTH MORE THAN THE GUARD: a guard must be scored on DELIVERED OUTCOME, not on faithfulness to its declaration.** A stale declaration is a reason to RE-MEASURE, not to stop correcting; only evidence that the correction HARMS licenses a refusal, and no plant here has produced that. §90.4 mistook *degraded* for *harmful* — its own text says tolerance comes from declaring ACROSS a span and never from indexing by it, and a point span does not merely fail to give tolerance, it removes performance the object had. **`DECL` is opt-in and OFF on the measurement rather than on caution.** What would turn it on, stated so it is falsifiable: ONE operating point on ANY plant where a stale declaration makes the frozen object read BELOW 1.000x. `scoreOn` with `decls` is the instrument for looking; the mill's ±10% gauge and 4.0-6.5 m/s speed spans are the first place it was looked and there is none. **AND UNTIL §102 THAT SENTENCE WAS TRUE OF THE HARNESS AND FALSE OF THE LIBRARY, WHICH HAD NO SWITCH AT ALL.** `loadGuard` and `bendGuard` are constructor flags carried on the record; `_declCoverage` and `declGain` armed themselves off the PRESENCE of `report.declSpan`, so DECLARING a scalar and REFUSING outside it were ONE THING. That is not academic: `logSpec` names the declared fields and `artefact.test.mjs` replays a decision from those fields alone, so declaring is part of the FORENSIC contract (§77) and a host that declared `vLine` only so an investigation could reconstruct a decision bought the 2x refusal unasked — **rule 9b's mirror image, reachable and armed without being asked.** The falsifier ran first and carries its own control: one policy fitted TWICE on identical rows and targets, weights BIT-IDENTICAL, differing only in whether `declare` was passed — not declared and asked `vLine: 4` applies 2.910098e-1, declared and asked `vLine: 4` applies **exactly 0**, so the whole effect is the guard and `vLine: 4` is refusable only because the fit was TOLD A NUMBER. `declGuard` now sits beside the other two at default FALSE, flowed through all three of `AutoStack`'s construction sites (none carried it, which would have made the flag unreachable — the §100 defect committed again while fixing it). The span is still recorded, still reported, still named in the log spec; only whether it reaches a DECISION changed. |
| `test/pilot/screen.mjs`, `rigs/emit.mjs` | **WHAT TO EXPECT OF A PLANT, BEFORE ANY CONTROLLER IS BUILT FOR IT (plan §90.1).** §55.12's KUKA is the argument: four sections spent vendoring, identifying and measuring a 222 MB record before anyone decomposed its torque — and the decomposition is what said it could not support a plant. Three instruments already answer the screen's questions and **nobody ever ran them together**, which means the screen was not a gate: `invert.mjs`'s `prog/rise` (the ~10 split that predicts BOTH the window rule and target 1 across nine plants) and its `INVERSE %` (non-zero on exactly one plant, which is the one plant that resists both admissible objects), and `disscreen.mjs`'s exogenous decomposition (one testbed in eleven). Both EMIT their rows where they measure them and `READ=1` reads them back into one verdict per plant, set against what that plant ACTUALLY did — the `objtable.mjs` pattern, so no plant is re-run or re-scored. `rigs/emit.mjs` is the append, dependency-free and eleven lines, because `distilkit.emitRow` takes a ladder's `rep` and `auto` and the screens have neither. **A disagreement is NOT a failure of the screen**: `DIET+WINDOW` predicts WORK, and four plants it fires on were worked on and won. The row worth reading is the opposite — a plant the screen called easy and the object refused, which is a difficulty none of these three columns can see, and is exactly what the real flexible arm was until §84.11 gave INVERSE its first non-zero. |
| `test/pilot/gainspan.mjs` | **NOT A TEST, AND NOT YET RUN — IS THE `k` THE MACHINE WANTS EVEN IN THE FAMILY THE SOLVER PRODUCES? (plan §91).** The owner's reframing is *relate the controller to the prediction rather than inverting it*, and the object that describes is already built: §6's explicit gain collapses the QP to `u0 = k·f0 + bias`, a LINEAR RELATION between prediction and correction at 120 MAC. Only its PROVENANCE is the inversion — `_buildGain` obtains `k[i] = solve(e_i, 0) - bias`, the solver probed with unit vectors. As `qpIters` moves that construction traces a ONE-PARAMETER FAMILY, and the machine already prefers a point far down it (two iterations beat sixty on the arm, one beats sixty-eight on EMPS), so the project has been pulling a derived inverse toward what the machine wants — with `qpIters`, with `lambda`, and with §79's applied gain — without ever asking whether what it wants is ON that curve. This perturbs `k` OFF the family and scores the machine, orthogonalised against `k` itself because a random row has a component along it and adding that back is §79's gain axis wearing noise (rule 20). **ITS FIRST RUN WAS BROKEN AND PRINTED A FINDING, which is why it is recorded here (plan §91.2)**: every scale row and every random row read **0.1091 mm, bit-identical to the unperturbed baseline**, including a perturbation of 20% of `|k|` — `setK` closed over a `_gain[0]` captured before the on-family sweep, and `_buildGain` REPLACES that array, so every perturbation went to a detached object while the machine scored the built gain. The on-family rows varied correctly because they rebuild wholesale, which is what made the table look credible, and the verdict it printed was *the family holds*. **Caught by the digits and not by a check, so the check now exists** (rule 9): `k` is DOUBLED and the score must move, then restored and the baseline must return EXACTLY, before any row is reported. It is left built and UNRUN — whether `k`'s provenance matters is a question INSIDE the current framing, and §52.31 caps that input at R² 0.84 however `k` is obtained. |
| `docs/edm.md` | **A PROSPECTIVE DEPLOYMENT, SCOPED BEFORE ANY MEASUREMENT — a custom wire EDM and hole popper on B&R controls.** Written so the predictions can be read against what was claimed BEFORE the data existed. It splits the machine's two objectives by this project's own evidence: FINISHING is this method's own shape (a repeatable geometric error on a repeated contour, with the cut part as the commissioning truth — which closes the north star's own open case, the touch probe a shop actually owns), while ROUGHING gap regulation against the arcing boundary is stochastic and the gate should REFUSE it — with one preview-shaped sub-problem inside it that is where the wire actually breaks (height steps, corners, entry/exit are all known from the program). Carries the LOGGING SPEC, because no public EDM dataset gives gap dynamics and building a simulator to suit the controller is rule 15 exactly — the machine removes that gate by supplying real records. **AND §6 IS THE OBJECT THAT REACHES THE ROW PREVIEW CANNOT**: a BREAK-RISK SOFT SENSOR trimming feedrate under the existing gap servo — addressed by machine state, no tracker, no lap index, and the one loop here whose instrument is FREE (pulse electronics that already exist, and a break the machine cannot fail to notice) against §52.42's 3.9x tracker premium. Its five hazards are this file's own rules arriving before the build: predict the dense PRECURSOR not the rare break (rule 36), a hazard is per METRE not per second or the loop chases its own denominator (rule 17), regulate an upper confidence bound because the costs are asymmetric, DITHER or the loop drives the sensor off its training set (rule 35), and success removes the evidence (rule 33) — which the precursor design is what survives. The falsifier is LEAD TIME against the gap's own settling, readable off existing logs before anything is built (§52.26 transplanted). Nothing in it is measured. |
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
  fit; **Learn on this program ▶** (plan §52.18), which teaches the deployed model on the program
  in front of it with the tracker attached, by the ladder's own law — the pilot's model inverse
  against the measured error, one increment per pass, the model re-fitted and re-measured —
  together with the commissioning diet the deployed recursion already carries — **6.04x → 7.71x
  on the bench square with the rounded rectangle, circle and polygons unchanged (5.9x / 7.0x /
  4.5-6.2x), 3.98x → 6.47x on the soft cell** (plan §52.19). Fitted to the live program ALONE it
  reads 15.9x there and 0.3-1.0x everywhere else — a memory, which is the check the owner asked
  for and the reason the diet stays in the fit; and **lap learning**, withheld by the
  library on any program but the one it learned. The box that used to sit here — "the tracker
  stays on the machine, keep learning every scan", a unit-gain law fed every decision — was
  measured at **0.54x after twelve laps and is gone**: a law with no plant model in it pairs the
  residual with the wrong rows on a plant that answers hundreds of steps later.
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
**AND THE CEILING IS THE DIET, NOT THE BASIS (plan §52.17).** The same controller, same 93
features, same machine reads **14x taught on the square itself** (8 passes; 9x at 4), **6x taught
on four polygons, and 7.5x taught on both** — the polygons dilute it. A pose-scheduled map (277
features) improves the polygons in-sample and is REFUSED on the square at 0.65x: more capacity
buys less transfer, for the fourth time. Normalised rows are inert on the number; a converged
teacher solve is inert; the applied control is 2-3x the rms of the error it cancels, so it is
not small. What bounds a program-agnostic feedforward here is how far the commissioning diet is
from the program it will run. **TEACHING THE DEPLOYED MODEL ON THE PROGRAM IT RUNS, WITH THE
TRACKER ATTACHED, BY THE LADDER'S OWN LAW (plan §52.18-19): 6.04x → 7.71x on the bench square
and 3.98x → 6.47x on the soft cell WITH every other program unchanged — the model's gain. The
same law fitted to that program alone reads 15.9x there and worse than nothing on the polygons
and the circle: a memory, checked and refused.** The unit-gain "keep learning every scan" law that
was offered for this measured 0.54x and is removed. A single honest linear map of the reference
window sits at 6-8x on this arm; the 14-19x the lap-converged path proves is what a memory of one
lap buys, and every route to it that keeps the object a model has been measured and paid back.
**AND THE INVERTED-PENDULUM TEST IS TAKEN, FAILED, AND ITS DIAGNOSIS HALF-RETRACTED (plan
§52.20, §52.21):** a feedback cascade layer identified ON the distilled machine passes its verify
(1.6x) and harms the square. §52.20 read that as the residual — link ringing and wind-up — being
unobservable from the motor side. `test/pilot/observe.mjs` put the question to the machine twice.
Scored on held-out LAPS of the square, every lift read 0.9-1.0 — including R² 1.000 for 2,747
features, which is rule 36's memory and not observability, and a first draft claiming 0.95 was
withdrawn before it shipped. Scored on PROGRAMS the fit never saw (fitted on the polygon diet, run
on the distilled machine), a LINEAR observer of motor-side lags plus the command reads R² **0.3-0.6**
on the bench and 0.3-0.8 on the soft cell, to leads of a few hundred steps; the quadratic and the
ENERGY lifts (ω², τ², τ·ω, windowed ∑τ·ω — the energy-state idea, explored) transfer WORSE than
linear on the bench at every ridge, and an energy state alone, no command, reads negative on the
bench and 0.2-0.4 on the soft cell. So half the residual is observable from the motor side and half
is not, and the nonlinearity buys memory. Half the layer's deficit was a configuration fault —
identified UNDER the compliance feedforward and deployed BARE (rule 34; fixed, 0.17x → 0.39x on the
bench, 0.38x → 0.84x on the soft cell) — and the rest is a half-blind forecast inverted at full gain.
**Both were then measured (plan §52.22).** A GAIN on the feedback layer's applied correction
helps on the soft cell — 0.35 reads **1.25x on top of the distilled policy, 3.98x → 4.97x** — and
harms the bench at every gain (0.97x at 0.1, monotone to 0.39x at 1.0), so `distil.feedbackGain`
ships opt-in and off. Greedy leave-one-polygon-out selection over a 314-column energy library
finds NO transferable subset (LOPO ≤ 0 for every deployable group on both cells). And with strain
gauges or gearbox wind-up readings in the tap the second channel becomes observable (0.6-0.85
across programs) while a tool accelerometer adds nothing; the first channel stays at 0.5-0.6
because the map from those readings to the tool is pose-dependent geometry, which is a kinematic
computation and not a fit. **And then it was fitted generically (plan §52.23):** every hidden
state — both wind-ups, both tip deflections, link 1's slope — is observable from the motor side
across programs at R² 0.9-0.99 with an external encoder or strain gauge as the commissioning truth;
the tool error is their POSE-SCHEDULED sum, and a 113-column scheduled linear observer with those
instruments at deploy reads **0.99 on every never-fitted program** (LOPO 0.992 bench, 0.946 soft).
Chained through soft sensors so no instrument remains at deploy, it delivers the second channel
(0.85-0.95) and not the first (0.2-0.6), because a tenth of a state is half the residual. **Tested on the machine (plan §52.24): the pilot cannot fit that observer.** With the
instruments in its measured vector and its own scheduled basis forced, the feedback layer's
forecast stays at 0.69/0.24 and it deploys at 0.94x or refuses, while the same observer fitted
offline on the layer's OWN excitation record reads 0.96/0.99 on the programs — the regime is fine
and the pilot's row lacks the trig-scheduled block; that block is the stated next build. The
1.25x plain layer on the soft cell remains the only deployed feedback result. **The block was then
built and measured (plan §52.25):** the GENERIC form — each scheduling channel declared rotary
contributing cos and sin of its own angle, cross products at order 2 — matches the hand-written
geometry to the third figure offline (LOPO 0.991 / 0.945), and is in the pilot behind `schedFn`,
`schedOrder`, `schedLags`, `schedCmd`, default byte-identical. On the machine the feedback layer
still fits 0.49/0.44 where the same rows read 0.96/0.99 offline; a short horizon fits 0.88/0.85
and deploys 0.14x, because the forecast's horizon and the QP's are one constant. **That build was made and it closed the route (plan §52.26).** The pilot's own forecast scored ON
THE SQUARE reads below the mean (−1.19/−0.25 bench; −0.16/−0.70 on the soft cell whose 1.25x it
carries); a separated bank fitted on the layer's own excitation and handed to the QP through the
oracle port reads **0.96/0.97 with the layer acting** — and the machine gets worse at every gain,
sign checked, effort weight and iterations re-swept, dither swept 40-fold. The forecast's reach is
~300 steps (0.40 at 288, negative from 576) and the identified response of the tool error to a
command correction rises over ~3,000 steps on this gearbox (2.3% at 504); a proportional law on
the forecast inside its reach is inert (1.004x-1.007x). Feedback through the command cannot reach
what it predicts on this arm, which is why every route that ever worked here was PREVIEW. The
one lever that remained, torque injection at the motor, is measured by `test/pilot/stepresp.mjs`
and closed: the tool error's 10-90% rise is 951 steps through the command and 948 through a torque
step — the gearbox spring is the low-pass, not the loop — so nothing on the motor side of this
gearbox can reach a residual coherent for 300 steps, and preview is the only correction that can
be in place when the error arrives.
**AND THE ARC WAS THEN TURNED ON ITS OWN INSTRUMENT (plan §52.27).** Asked whether "nothing
moves" is the plant or something wrong in what is measured, four things were put to the machine.
The teacher is not the ceiling — it converges the square's own prefix to 10.27x (bench) and 8.93x
(soft) — but it is stable on the bench cell ONLY because of the gearbox backlash (`ARM_BL=0`:
cascade 2.23x → 0.17x, ladder stops; soft cell byte-identical), a robustness defect on record. The
residual is on the EDGES, not the corners (±100 steps of a corner carries 5.2% of the energy in
7.3% of the steps; mid-edge rms above the lap's). A rectangle diet including the square's own shape
at other sizes reads 6.56x on it, 6.85x with the polygons, and takes the soft cell from 3.98x to
6.01x — 10% on the bench, not a factor. And the STRUCTURAL finding, `test/pilot/stateaug.mjs`: the
converged correction regressed on the shipped reference window reads R² 0.836 leave-one-program-out
and 0.85/0.82 on the square; with ONE newest measured sample beside it, pose-scheduled, 0.968 and
0.996/0.950 — and the split says the whole gain is the measured DEVIATION from the reference (F:
0.962) while the reference's own sample scheduled the same way adds nothing (E: 0.803). The term is
feedback. Built into `DistilPolicy` (`stateDim`, host `distilState`, opt-in, off, byte-identical
control) it fits at 0.992/0.928 and deploys at **1.44x**, harming its own training programs (rule
35: the state was captured under the prefix); fitted with the policy in the loop over aggregated
rounds it stabilises at **3.24x** bench / **3.53x** soft (rounds' R² 0.91/0.86) — below the 6.04x /
3.98x of the map without it, on the square and on both held-out programs. So the residual a
reference-only map leaves is, by measurement, the part that depends on the plant's current
deviation, and this plant cannot be corrected from that deviation in the time it persists (the
951-step rise of §52.26.5) — the same limit reached by a third route sharing no code with the other
two. Bench square today: **1.7528e-1, 6.04x**, unchanged.
**AND THEN THE PLANT ITSELF WAS SCRUTINISED, WHICH INVERTED A SHIPPED CONCLUSION AND FOUND THE
LARGEST SINGLE LEVER IN THE PROJECT (plan §52.28).** §52.26.5's "the gearbox spring is the plant's
low-pass, not the loop" is BACKWARDS: both of its paths ran through the closed loop, so they could
not check each other (rule 15), and sweeping the servo bandwidth shows the rise tracking it —
5156 / 2745 / 943 / 636 / 509 steps at bw 5e-4 → 8e-3. The 951 steps IS `bandwidth 2e-3`. The
gearbox two-mass mode is 2.2x FASTER than the loop and critically damped by construction. Computed
from the machine's own constants, **the bench cell's slowest structural mode is 1.9x its position
loop** (stiff cells reach 4.3x and 5.0x; a real arm has 5-20x; the lattice's elastic CFL caps E
near 0.24, so 5.0x is about the widest this simulator can build). This section's OWN second
hypothesis — the cold mill's fault on the arm, a horizon too short to invert — was killed by the
instrument: the horizon is `N·grid·sample` = **5,040 raw steps** against a 943-step rise, `hGrid`
97-117% delivered by half of it, and Tset honest at 1.64x Ts with its clamp not binding. What
survives is the sweep of the one plant constant nobody had ever moved. `bandwidth: 2e-3` is
hard-coded at every cell across a 256-fold stiffness range; it sits at the BENCH cell's optimum
(6.04x, against 2.19x at 7.7e-4 and 4.08x at 4e-3, in absolute error as well as ratio) and **2x
below the stiff cell's**. And on both cells the machine wants the loop at **0.4-0.5 of its slowest
structural mode**, which is the opposite of `ChainServo`'s own "well below" rule. At the stiff cell
with the loop raised to 0.40 of that mode, **the feedback layer deploys and helps for the first
time on this arm — 1.08x — where the carried 2e-3 refuses it at 0.97x, and the distilled policy's
transfer to programs it never saw goes from 0.82x and 0.46x (worse than nothing) to 1.62x and
1.27x**, same code, same fit, one plant constant. **That paragraph's "saturation is not the
mechanism" is WRONG and §52.29 retracts it**: the sweep behind it ran on the BARE machine while
every number it defended came from the ladder, which runs the conventional machine with its
compliance feedforward (rule 34). Measured in the right configuration the bench drive clips **2.0%
of samples at the shipped bandwidth and 6.9% at the top, demanding 1.6x to 12.7x its own torque
limit** — **though §52.30 then RETRACTS the "saturation is the leading candidate" reading that
went with it**: run at those bandwidths with a drive that cannot clip, the absolute error recovers
5% and 8% of a degradation that is ~50%, so saturation is not the mechanism and the fall-off above
2e-3 has no established cause. So §52.26's limit is REAL AND LOCAL: on the bench cell there is no
bandwidth that both leaves the structure alone and delivers a correction in time, because the loop
is already at the ceiling 1.9x of separation allows — and that verdict does not survive a cell with
5.0x. Which lands on the standing bench rule: "the softest cell cannot flatter" selected a cell
whose loop and first mode are 1.9x apart, and a benchmark is a constant too (rule 31). Nothing
shipped moves; `ARM_BW` is a harness knob and unset is byte-identical.
**AND THREE MORE OF THIS FILE'S OWN CLAIMS WERE RE-MEASURED IN THE CONFIGURATION THEY ARE ABOUT
(plan §52.29). ALL THREE MOVED, AND THE FOURTH RESULT IS A BOUNDARY ON THE WHOLE DESIGN.** The
saturation retraction above is the first. The second: §52.28's hope that the loop could be tuned
from BARE laps instead of a ladder of commissionings is refused — across seven bandwidths and
three programs the bench cell's bare error falls monotonically to the top of the sweep while the
commissioned score peaks at 2e-3 and falls away, so **above 2e-3 the loop that makes the
conventional machine better makes what the learned controller can add worse**; the apparent
agreement was read off the square alone. The third: §52.27's rectangle diet, quoted there as
"worth 10%", was never scored on a program it had not seen, and the rectangles are the square's
OWN CLASS. Scored on the rounded rectangle and the circle the shipped diet WINS on the bench
(geometric 6.73x against 5.24x and 3.64x) while the rectangle diets buy the square by giving up
22-46% of it, and on the soft cell rectangles+polygons still loses the circle (6.86x against
8.04x) at **70% more commissioning time** — so it fails target 1's "none made worse" on both cells
and nothing ships. **AND THE FOURTH IS THE ONE THAT MATTERS: guided commissioning composed with
the distilled policy returns the deployed object BIT-IDENTICAL on both cells while the ladder
reports the teacher improving 4.7557e-1 → 2.7425e-1, KEPT.** A teacher 1.73x better taught a
policy identical to five figures, because the teacher iterates the pilot with the MEASURED ERROR
as its free response (`oracleF0`) and online adaptation updates exactly the forecast that port
replaces. Turn the port off and the identity breaks — adaptation is worth 11% on the policy and
8-9% on programs it never saw, from a base 4.5x lower (1.34x against 6.04x), which is why the
oracle ships. **So every route tried here that improves the plant MODEL was inert BY CONSTRUCTION
rather than by measurement** — §52.16's Q-filter, its converged teacher solve, its rows-at-every-
step, and now guided adaptation. The distilled policy's ceiling cannot be raised by a better
model, because the object it learns from does not consult one; what can still move it is the diet,
the basis, the teacher's cap, the iteration's authority, and the ORACLE's own quality, which is
metrology and is already on record as worth 1.5x (§50.1). Bench square unchanged at 1.7528e-1,
6.04x.
**AND THE ONE POSITIVE RESULT IN THIS ARC IS A MACHINE CHANGE, NOT A CONTROLLER ONE (plan §52.30).**
The iteration lever §52.29 left open turned out to be built and already measured — `_iteratePolicy`
IS joint projected iteration (one policy fitted across all programs at every pass, the next
increment taken against its own residual) and §52.16 read it at 5.06x against 6.04x with in-sample
R² 0.98, which is the transfer law for the fifth time. What was left was the ACTUATOR. `ARM_DRIVE`
makes the torque limit a knob: on the conventional machine, removing the clipping entirely is worth
4% on the square and nothing elsewhere, and with the policy armed the delivered error moves under
1.5% for a drive 2x and 4x larger — so the correction is not being clipped away, and §52.29's
saturation reading is retracted. **§52.28's "both cells want the loop at 0.4-0.5 of the slowest
structural mode" narrows with it: that rule was fitted to the BENCH SQUARE.** Scored on programs
the controller never saw, at bw 8e-3 — ratio 2.07, four times past the rule — the held-out programs
are BETTER in absolute error. A faster loop with a drive that does not clip delivers **1.13x
geometric across three programs on the bench cell, repeatable to 0.6% over two seeds (bandwidth
alone 1.05x, the drive adding 1.08x), and 1.29x on the soft cell with EVERY program improved by
14-36%** — comparable to everything four sections of controller work produced, which was nothing.
It costs 10-12% on the bench square, so under the standing bench rule it is not a default, and it
is a bigger drive plus a retuned position loop that the customer buys. **So the ceiling on this arm
is three things and only one of them is ours**: the map's expressiveness (R² 0.836 against the
teacher's answer, the rest being feedback the plant cannot pass in time), the loop's bandwidth, and
the drive's torque limit — and every number this project has quoted was taken with the last two at
values nobody derived. `ARM_DRIVE` unset is byte-identical; the bench square stands at 1.7528e-1,
6.04x.
**AND THE QUESTION UNDERNEATH ALL OF THEM IS NOW ANSWERED, WITHOUT FITTING ANYTHING (plan §52.31).**
Five sections hit one ceiling from five directions and every one assumed the MAP was the
limitation. `test/pilot/consist.mjs` asks instead whether the converged correction is a FUNCTION of
the reference window: it builds the shipped rows and targets for the diet and the square,
standardises them, and reports target disagreement against row distance. **Cross-program and
same-program disagreement track each other at every distance** (bench 0.33/0.50/0.53/0.62 against
0.44/0.34/0.62 as the rows separate), so rows close in feature space demand the same correction
whether or not they come from the same program — the "programs conflict at the same window"
hypothesis, which would have made 6x a proof, is dead and there is no transfer penalty in the
target. It is not teacher noise either: converged twice, the same prefix reproduces to **2.4e-6 rad
against a target rms of 1.7e-1**, 1.4e-5 of its scale. What the scatter at small distance gives is
an INFORMATION CEILING: R² **0.894 measured / 0.931 extrapolated to zero distance** on the bench and
0.888 / 0.913 on the soft cell, against the shipped fit's 0.856-0.870 and 0.778-0.815. **So between
1.1x and 1.6x of the correction's residual error is all that remains in the reference window** — an
upper bound on any better map of it, linear or not, local or global. The 6.04x is not a failure of
the form or of the diet; it is within about 1.4x of everything that input contains, and every
negative from §52.16 onward is that one fact seen from another side. The routes still open change
the INPUT rather than the map: the measured deviation (R² 0.836 → 0.962, unusable because the plant
answers 950 steps later) or the machine itself (§52.30's 1.13x-1.29x). Caveat stated: the metric is
a plain standardised Euclidean norm over 92 features, so a better one could find closer neighbours
and read a higher ceiling.
**AND A SEVENTH PLANT WAS ADDED, THE ONE CLASS THE SIX DO NOT CONTAIN (plan §52.32).** A survey of
the "universal self-learning controller" literature puts an INVERTED PENDULUM first among the
plants such a claim must answer for, and the six here share one thing no line in this file had
noticed: **every one of them is stable without a controller.** `test/pilot/pend.test.mjs` adds a
nonlinear cart-pole and asserts the instability rather than asserting it in prose (1e-4 rad to 0.5
rad in 1.36 s with no force). The pilot corrects the cart's position REFERENCE into the cascade an
installation would already have, is told four signals, one channel, an authority, a box, a GUARD
on the pole angle and a representative program, and is scored on the TIP — which the stabiliser
does not regulate. **It deploys at 9.770x / 9.396x / 9.630x / 9.766x across four seeds (spread
1.04x, tighter than any of the six), the excitation never reaches the guard, and the correction
SATURATES at 13.7x rather than sitting at its cap**, which is what separates it from the barrel's
refusal. **THEN THE LOOP WAS SWEPT BEFORE THE NUMBER WAS CLAIMED**, because §52.28 and §52.30 cost
three sections on exactly that: over 560 cells of its own four gains the best reads 2.914e-2
against the shipped 1.027e-1, **3.5x better — and re-run there the pilot REFUSES all four times**
(verify 0.99x / 1.02x / 1.02x / 1.10x). So the 9.77x was the LOOP, and the correction layer has
nothing to add to a loop that is already good. Three things that is worth: the weak-denominator
fault was caught PROSPECTIVELY for the first time here; target 3's improve-or-refuse-with-a-reason
is met on a plant class the method had never met, 4 of 4 unharmed; and §52.30 generalises — the
factor this project quotes is a joint property of the controller AND the loop beneath it. Stated
asymmetry: the shipped loop was tuned to HOLD the pole and the swept one ON the program the pilot
is scored against, which is per-program tuning the method itself is not allowed, so the honest
reading is a range rather than a number. **And it narrows the product claim usefully**: the nearest
published work (USLC 2024, UP-OSI RSS 2017) SYNTHESISES a controller for an unknown plant, and this
does not on any of the seven — there is always a loop already closed and this corrects its
reference. That is narrower and more defensible, and §52.32 is why it has to be said that way.
**AND THAT LINE IS THE LEVER: THE LOOP THE LEARNED CONTROLLER WANTS IS NOT THE LOOP THE MACHINE
WANTS, AND TAKING IT PROPERLY IS WORTH 1.65x (plan §52.33).** §52.30's 1.13x was measured through a
window that was moving with the bandwidth. The distilled policy's window is specified in PILOT
SAMPLES and the pilot's stride is derived from the plant's settle, so raising the servo bandwidth
SHRINKS its reach in raw machine steps with nothing in the configuration touched — stride 8 at
bw 2e-3, 4 at 8e-3, 3 at 1.6e-2 — and every bandwidth number this project has quoted moved two
variables at once, the wrong way round (rule 17). Restoring the reach at bw 8e-3 takes the bench
square from 1.9284e-1 to 1.7864e-1, which is the whole of the 10% regression §52.30 booked as the
change's cost; `WINRAW` states the window in raw steps and is byte-identical at the shipped
bandwidth. Swept with the reach held, the optimum is **bw 1.6e-2 at the rig's STANDARD drive** —
the 32x drive §52.30 bought its result with is slightly HARMFUL there, so what the customer buys is
a servo retune and not a bigger motor — and **the conventional machine is 1.2% WORSE at that
bandwidth than it is today**. That is the finding rather than a caveat: the loop that minimises the
machine's own error and the loop that maximises what a learned feedforward delivers are different
loops, eight times apart, and the delivering one sits about **4x ABOVE** the bench cell's slowest
structural mode — the opposite end of §52.28's "0.4-0.5 of the slowest mode", which §52.30 had
already reduced to a rule fitted to the bench square. **What made it shippable is a distinction the
library was missing: a REFUSED cascade still teaches.** At bw 1.6e-2 the cascade's verify goes
marginal — 3 of 5 seeds refuse — and each refusal dropped the distilled rung onto `HarmonicFF` for
1.32-1.67x at **107-117 machine-minutes** where the pilot teacher reaches 6.6x in 10.1. But as a
RUNG the cascade is judged on whether its FORECAST inverts the machine well enough to ship, while
as a TEACHER it is handed the measured error through `oracleF0` and asked only for the increment
that cancels it — its verify measures exactly what the teaching port replaces. The evidence was
already on record twice unread: §52.29's guided phase moved the teacher 1.73x and returned a
BIT-IDENTICAL policy, and three seeds gave cascades of 1.03x/1.13x/1.25x and one policy to five
figures. `distilTeachRefused` (opt-in) publishes the refused cascade as the teacher with
`deployed.stack` left at 0, so it still cannot reach the machine, and **a cascade scoring 0.62x
teaches a policy as good as one scoring 1.34x** — availability 2-of-5 → 4-of-4, refusal cost 107
machine-minutes → 10.1, with both controls exact (the admitted seed and the whole shipped-loop
ladder both byte-identical). Composed with learn-on-program over four seeds, worst cell of each:
**bench square 1.3025e-1, rounded rectangle 9.0436e-3, circle 7.4380e-3 against the shipped
1.3730e-1 / 1.8826e-2 / 1.5195e-2 — 1.65x geometric with nothing made worse**, or 8.13x / 12.37x /
14.30x over the machine as it stands against 7.71x / 5.94x / 7.00x. **The two programs the
commissioning never saw gain 2.08x and 2.04x where the one it learned on gains 1.05x**, which is
the ordering a plant model produces and the opposite of a memory's. It costs NOTHING on the PLC —
the deployed object is the same 93-feature, 274-MAC policy with no cascade armed — and nothing is
made a default: `ARM_BW`, `ARM_DRIVE`, `WINRAW` and `TEACHREFUSED` are harness knobs, all unset
byte-identical, on one plant and one cell (rule 31). Measured and negative on the way, so they are
not tried again: the faster loop does NOT raise the reference window's information ceiling (0.9375
against 0.9315, though the ABSOLUTE irreducible content shrinks 1.72x, which is where the gain
comes from); the state term is still harmful there and the feedback layer still refused, so
§52.26's and §52.27's limits are not artefacts of a slow loop; a SMOOTHED deviation — the one
feedback a 951-step plant could safely take — is worth less the more it is smoothed (0.906 at 256
steps, 0.756 at 1024, 0.664 at 4096, the last two BELOW the window alone), so rule 39's split says
the missing 14% is OSCILLATION and not bias; and `decisionsPerTs`, which lets N triple from 79 to
245 as the bandwidth rises, was the first hypothesis for the marginal verify and is refused.
**AND THE ARC WAS THEN REVIEWED AGAINST ITSELF, WHICH FOUND FOUR CONTRADICTIONS AND ONE EXPERIMENT
THAT COULD NOT HAVE SUCCEEDED (plan §52.34).** It measures nothing; it names what the record cannot
hold simultaneously, and every one of the negatives it questions is load-bearing. **(1)** §52.31's
ceiling — 0.931 against the shipped 0.856-0.870, "within 1.4x of everything the input contains" —
cannot coexist with §52.17's SAME 93 features, SAME window and SAME machine reading **14-15.9x
fitted on the square alone against 6.04x pooled**. The resolution is that within one program the
window nearly keys lap phase, which means **§52.31's same-program CONTROL is measuring that same
aliasing and is therefore not a control**; the two columns tracking each other shows the metric
cannot separate the cases, not that the target has no transfer penalty. **(2)** "A more converged
teacher teaches a worse policy" (0.10 → 0.217, 0.15 → 0.269, 0.20 → 0.363) says convergence moves
the target AWAY from any function of the window — target = generalising part + program-specific
residue, which §50.1 already wrote down as implicit early stopping — and that contradicts §52.31's
"no transfer penalty in the target". **(3)** The 951-step lag was REFUTED BY ITS OWN REMEDY and is
still carried as the explanation: §52.33 halved it and the state term is still harmful and the
feedback layer still refused, so the cause is unestablished and rule 35 is the live candidate.
**(4)** "The residual is on the edges, not the corners" answers LOCATION where the question was
SOURCE — a lightly damped mode excited at a corner deposits its energy along the following edge —
and it steered the work to diet composition instead of transients. **AND THE ROUTE-CLOSING
EXPERIMENT IS VOID:** §52.16 retired rule 37 on a window swept x1/x2/x3 that scales the SAME 23
offsets, so span and SPACING tripled together and a mode ringing at a few hundred steps is
invisible through the wide taps — it traded exactly the resolution it was testing the reach for,
and an FIR window at bounded tap count cannot have both. **The general form is the finding: every
capacity experiment in this arc added more FUNCTIONS OF THE SAME TRUNCATED HISTORY** — the
544-feature map, the quadratic and energy lifts, the 314-column library, the scheduled blocks, the
second distillation, the state term — **and not one added MEMORY** (checked by grep: no recursive,
IIR or resonator feature exists anywhere in `lib/` or `test/`). So the record reads "capacity does
not help" where it establishes only "capacity over a truncated history does not help".
**WHAT IS PROPOSED, AND IT IS THIS FILE'S OWN OBJECT RATHER THAN A CHANGE OF PROBLEM:** a small
bank of SECOND-ORDER RESONATORS driven by the COMMANDED REFERENCE, their states fed to the policy
beside the window. An FIR window is a hopeless basis for a lightly damped resonance — thousands of
taps to span the ring at a spacing that resolves its period — where two state variables per mode
do it exactly, at order 20-40 MAC against the policy's 274, with NO aliasing at any reach, no
tracker, no lap index and no per-plant constant (a geometric ladder, the ridge selecting). It
explains the negatives rather than accommodating them, and above all it is the bridge §52.27 left
open: **the measured deviation that took 0.836 → 0.962 IS the mode state, and a command-driven
resonator is an observer of it that needs no instrument.** The order is stated and the falsifier
comes FIRST — does the mode FREQUENCY move with pose, since a fixed bank is the wrong observer if
it does and the scheduling block cannot repair a frequency error — then `consist.mjs` re-run with
the states in the row, fitting nothing: if the disagreement at small row distance FALLS, the
ceiling that closed five directions was a missing state and not an information floor.
**AND IT WAS TESTED IN THAT ORDER AND REFUTED, WHICH IS WHAT THE ORDER IS FOR (plan §52.36).**
The falsifier did NOT fire: `test/pilot/modes.mjs` measures the plant's impulse ring at nine
poses and reads **period 3166-3868 steps, a 1.22x span**, against an independent analytic
prediction from `Jeff` alone of 1.13x (rule 15), so a fixed bank covers the workspace. Its own
first estimator was wrong in the way §52.34 had just criticised — a moving-mean detrend LONGER
than the period being sought, reporting "no ring, coherence exactly 0.000" everywhere, which is
an instrument that found nothing rather than a plant that has nothing (rule 17). What the repair
gives is the number that matters: the ring decays **5.6x per cycle**, so it is a MODERATELY damped
mode of 2.3 cycles — "an FIR window is hopeless for it" was overstated — and the memory to 2% is
**~7,850 raw steps**, of which the shipped +/-2048 window reaches **52%**. That made §52.34's
sharp test obvious and it is ALSO negative: `WINEXT` extends the reach by APPENDING taps at the
ladder's own outer spacing (23 to 31 taps, 93 to 109 features, ~32 MAC), which is the experiment
§52.16 could not run, and the bench square reads **3.1945e-1 against the shipped 1.7528e-1**, worse
on all three programs. So §52.16's conclusion was right even though its experiment could not have
established it, and the reason is this file's own forced trade with the memory now MEASURED rather
than inherited: memory ~7,850 steps against a program lap of 7,356, so a window that REACHES the
memory SPANS the lap and §41's aliasing theorem bites. **FIR is closed from both ends** — scale it
and the resolution goes, extend it and the lap is spanned — which is the proper case for a
recursive state, and the resonator bank is then refused by the cheapest instrument before any
build: leave-one-program-out **0.814 against the window's own 0.836**, and 0.488 pose-scheduled,
with in-sample RISING (0.897 → 0.915) as transfer falls. **Six independent experiments now agree**
— more taps, longer reach at preserved spacing, longer reach by scaling, nonlinear and energy
lifts, pose scheduling, and a recursive state — **none improves transfer and several improve
in-sample while harming it. The information the COMMANDED REFERENCE carries about the correction
is exhausted at R² ~0.84, so a feedforward from it alone is capped near 6-8x on this arm and no
basis will move it.** **AND THAT SENTENCE HAS NOW BEEN TESTED BY METHODS THAT COULD HAVE BROKEN IT,
WHICH THE SIX COULD NOT (plan §54.9).** All six added FEATURES to one GLOBAL LINEAR-IN-PARAMETERS
RIDGE, and `consist.mjs` names the gap in its own header — a local model is "the lever that every
capacity experiment so far has not actually tested". `test/pilot/nonlinear.mjs` reads that file's
OWN row dump, so one builder and not a second copy, and swaps only the function class at identical
rows, targets and leave-one-program-out folds: **ridge 0.8610 · kernel ridge 0.8303 · locally
weighted linear 0.8266 · MLP 0.7456 · kNN 0.7147.** Nothing beats the linear ridge, and the
ordering is the informative half — the two nearest are the two still linear in disguise, while the
genuinely nonlinear parametric model is second-worst with its worst fold at 0.39 against the
ridge's 0.68, which is more capacity transferring worse for the NINTH time. So the claim sharpens
rather than merely surviving: not "no basis will move it", since a basis is a feature set, but **no
FUNCTION CLASS of the commanded reference window will move it** — measured, not inferred from a
family of experiments that all shared a form. §52.31's ceiling was therefore about the right number for a reason its own
control could not support. **What that leaves is §52.34's conflict (3), and it is now the whole
question**: the measured DEVIATION carries the missing content (0.836 → 0.962) and fails only on
deployment (1.44x, 3.24x), its standing explanation — the 951-step lag — was refuted by its own
remedy, so the cause is unestablished and rule 35 is the live candidate. Every additive-term-at-
full-bandwidth route has been tried; entering the deviation through a SLOWLY ADAPTED PARAMETER of
the feedforward map, at a bandwidth far below the measured 3,400-step ring, has not.
**AND IT NOW HAS BEEN, AND IT IS THE SEVENTH NEGATIVE — WITH THE PREMISE UNDERNEATH IT REFUTED TOO
(plan §52.44).** A slow scalar MULTIPLYING the row is a different object from one ADDED to it: it
changes the map's shape and contributes nothing of its own, so at s = 0 the controller is exactly
what ships, and its bandwidth is the smoother's rather than the loop's. Measured leave-one-program-
out before any build, every modulated row is BELOW the window alone (0.838 / 0.817 / 0.856 at 256 /
1024 / 4096 steps against **0.870**) while in-sample RISES from 0.953/0.854 to 0.971/0.934 — three
times the columns, better in sample, worse where it counts, which is this arc's signature for the
seventh time and rule 36 arriving exactly where the design invited it. **And the premise is the more
useful half**: read the ADDITIVE column as a function of the smoother and 256 steps keeps the content
(0.951) but 256 steps is INSIDE the 3,400-step ring rather than below it — it is not the slow
parameter the route needed, and it is the bandwidth §52.27 already deployed at 1.44x/3.24x — while
1024 and 4096, which genuinely are below the ring, read 0.861 and 0.847, level with the window alone.
**There is no smoothing both slow enough to be safe and informative enough to be worth entering**,
which is a property of the signal rather than of the entry mechanism and therefore closes both. What
remains open is the MACHINE (§52.30's 1.13x-1.29x from the drive and the loop) and the INSTRUMENT
(§52.42's 3.9x between the tracker and the best mounted alternative) — things the customer buys
rather than things the controller computes.
**AND IT IS NOW SHIPPED — THE MEASURED BEST IS THE DEFAULT AND THE APP RUNS IT (plan §52.37).**
Everything §52.33 measured sat behind environment variables. Three changes make it the shipped
configuration, each with the control that licenses it. **One servo constant**: `bandwidth: 2e-3`
was hard-coded in the page's `makePlant` AND the rig's `machine()` with nothing linking them —
rule 61 waiting for one to move — so it becomes `BENCH_SERVO` in `compensator.js` and both read
it, at **1.6e-2**. What it is NOT matters as much: the CONVENTIONAL machine is 1.2% WORSE there,
and the loop sits ~4x ABOVE the cell's slowest structural mode, so this is the loop the LEARNED
controller wants and the customer buys a retune rather than a bigger motor. **The window in RAW
STEPS**, which is a units repair and not a tuning change — specified in pilot samples it shrank
with the bandwidth (stride 8/4/3 → ±2048/±1024/±768 raw) with nothing in the configuration
touched, and the raw ladder is **byte-identical to the old one at stride 8**, so the repair is a
no-op where it was measured and correct everywhere else. **`distilTeachRefused` on by default**,
byte-identical wherever the cascade was admitted and worth 6.6x in 10.1 machine-minutes against
1.3x in 107 where it was not. **The app now delivers, at its own defaults through the one press:
bench square 1.0717e+0 → 1.6159e-1 → 1.3025e-1 with learn (8.23x), the rounded rectangle it never
saw 9.0436e-3 (13.42x) and the circle 6.2215e-3 (17.19x)** — 1.65x geometric over the previous
shipped configuration with nothing made worse, at the SAME deployed object (93 features, 274
MAC/decision, 2.7% of a scan, no cascade armed, no solver, no tracker). **And the change
introduced one real defect into the app, which is the part worth recording**: the page offers a
stored model back only to the machine it was fitted on, keyed on K, E and the program signature —
a key that was COMPLETE while the bandwidth was one literal everywhere and became INCOMPLETE the
moment it became a shipped constant that moved, so a policy fitted under the old loop would have
restored onto the new one as a match, silently, under a gain pill from a machine it no longer runs
on. The loop joins the key and the record goes to `v: 2`, retiring every record written before it
moved rather than trusting a comparison they carry no field for; the panel NAMES the loop, read
from the running machine rather than the constant (rule 30). Not claimed: one plant, one cell,
four seeds, and on a real installation the retune is a CUSTOMER action the one press cannot take.
**AND THREE STANDING DEBTS ARE PAID, ONE OF THEM A DEFECT THIS FILE HAS CARRIED SINCE §52.27 (plan
§52.40).** **The BACKLASH robustness fault is gone and not by a code change**: §52.27 recorded that
removing the gearbox dead-zone took the cascade 2.23x → 0.17x past its own verify and STOPPED the
ladder, so the teacher was stable only because of a nonlinearity nobody designed for. At the
shipped loop `ARM_BL=0` reads cascade 1.33x **deploying** against 1.34x with backlash, and the
distilled object 1.6183e-1 against 1.6159e-1 — 0.15% — so the fault was a property of the LOOP the
cascade was identified under, and it is the fourth thing the carried `bandwidth: 2e-3` was costing
and the first that is a defect rather than a number. **The streaming fit's STANDARDISATION is inert
on both cells in both directions** (bench 1.0% worse, soft cell 0.3% better, both inside a 1.02x
seed spread), which closes §52.16's open weight-scale finding as a collinearity artefact that does
not reach the machine — `distil.js`'s own reason for asserting on the applied correction rather
than the weights, confirmed one level up. **AND TARGET 2 IS MEASURED FOR THE FIRST TIME ON THIS
CONFIGURATION: HALF MET, AND THE MISSING HALF IS THE DIET.** One commissioning at 4.0e-3 scored
across a feed ladder, each feed against the conventional machine at that feed, reads **6.71x /
5.85x / 8.18x at 0.40x / 0.60x / 1.00x feed with nothing made worse**, and at 1.5x and 2.0x the
coverage guard FADES the correction to zero (1.19x, 1.17x) rather than extrapolating. The
asymmetry is arithmetic and not physics: the diet is commanded at 4.0e-3 and commanded speed only
FALLS within a lap, so the fitted span is [8.83e-4, 4.0e-3] and there is no headroom above the
commissioning feed BY CONSTRUCTION. What is covered is 4.5x of span sitting entirely BELOW the
production feed; degradation inside it is not monotone either. The remedy has no constant in it —
commission the diet at a feed ladder that BRACKETS the production feed — and §51 measured exactly
that at the OLD loop (half-feed 0.75x → 2.58x at 2.3x cost), which rule 31 says is a constant to
re-derive rather than to carry.
**AND BACKLASH COMPENSATION WAS PUT TO THE MACHINE, BECAUSE IT IS THE ONE CORRECTION CLASS WITH
ALL THREE PROPERTIES THIS ARC HAS BEEN LOOKING FOR — AND THIS PLANT WANTS THE OPPOSITE (plan
§52.46).** A drive-level lash pitch table is indexed by joint POSITION and DIRECTION OF TRAVEL, so
it is machine state and not lap phase and transfers by construction; it is the ONLY correction here
a CHEAP instrument can calibrate, since lash is measurable from the motor side alone where §52.42
measured those encoders as worthless for teaching the tool error; and the dash across the dead zone
is PREVIEW, the only class that has ever worked on this arm. Swept from no backlash to ten times the
rig's, one commissioning each: **1.6183e-1 / 1.6159e-1 / 1.6135e-1 / 1.6075e-1 — monotone, and MORE
LASH IS BETTER.** At the top the lost motion is 30% of the delivered residual and the machine is
still better than with none, so a compensator has NEGATIVE headroom: it cannot beat deleting what it
compensates, and deleting it is the worst row. Held-out R² is stable to ±0.0006 and the cascade to
1.33-1.34x across the whole sweep, so it is the plant moving and not the fit. **The mechanism is
already on record read from the other side**: §52.27 filed "the cascade is stable ONLY because of the
backlash" as a robustness DEFECT, and it is the same thing — the dead zone decouples the motor
inertia from the link across a reversal, an impulse limiter acting exactly where §52.34's conflict
(4) suspected energy was being deposited into the following edge. **And the policy's own
direction-of-travel block is the EIGHTH capacity negative**: `signOffsets` armed takes 93 features to
133 and the square 1.6159e-1 → 1.9012e-1, 18% worse, with channel 1's held-out R² falling 0.8399 →
0.79. Stated limit: this rig's `deadZone` is a single symmetric half-width, so it cannot express the
position-varying, direction-asymmetric lash a real pitch table exists to map — that plant is one this
simulator does not contain, and the feature is right for it.
**AND THE PAGE NOW STATES THE LIVE CPU LOAD, WHICH PRICED SOMETHING THAT SHIP HAD NOT (plan
§52.38).** The budget panel reported MAC/cycle against the 10% ALLOWANCE — a fraction of the
permission rather than of the task, ten times apart and reading identically — and it reported the
PEAK, which most scans do not pay: every rung's `mac` is what it costs on a scan it DECIDES, and
the cascade decides on its own `sample` while the distilled map decides on its `stride` and HOLDS
between. `cost()` now carries a `cadence` per rung, read from the DEPLOYED OBJECT rather than
declared (rule 30, and `stride` already round-trips through `toJSON` so a restored model reports
its own), and an `avgMac` beside the peak; the panel leads with the unflattering one against the
whole scan — **`CPU now — 0.27% in the peak scan · 0.07% average of a 1 ms task, a 4.0x spread`**
— and the 10% rule keeps the FITS verdict, because "always" is about the worst scan and an average
that hides a 4x spike is the reassuring half of the truth. **It immediately priced a cost §52.37
shipped without noticing**: the retune halves the pilot's stride (8 at 2e-3, 4 at 1.6e-2) since
the stride is derived from the measured settle, so the deployed object and the PEAK are identical
— the number §52.37 quoted and the one the budget tests — while **the average load DOUBLES, 34 MAC
per scan to 68**. Still 0.07% of a scan, so nothing is at risk; the point is that the instrument
found it, and a plant whose stride fell to 1 would pay the full peak every scan with the verdict
line unchanged. Pinned both halves (rule 9): the line renders, the average never exceeds the peak,
and where a rung holds between decisions the average is STRICTLY below it — the half that fails if
`cadence` comes back 1, which is the only way this arithmetic can be silently wrong.
**AND VERIFYING ALL OF IT TURNED THE BROWSER TIER RED ON A CHECK THAT COULD NOT FAIL (plan
§52.35).** `flexisim/learn` asserted the learn button is ENABLED while the check three lines above
it explicitly permits the arm to still be driving home — and `idle = settled && !approach` is the
button's own gate, so it was a race against `home()`: green on a quiet machine, red under load,
and reproduced with the changes STASHED TO HEAD, which is what says it is not the change. Worse,
the body sat inside `if (canLearn)` and so **every suite since §52.19 silently skipped the entire
learn-on-program exercise** — the feature carrying 6.04x → 7.71x — which is rule 25's "not
measured" and "passed" being different states, and the second hole of that exact shape after the
`SUITE=full` skip. Fixed, it ran and appeared to expose a defect — one pass exceeding **63 minutes
of browser** where the IDENTICAL work costs 462k machine samples and ~230 s in Node — which was
written down as undiagnosed and gated behind `FLEX_LEARN_BROWSER=1`.
**AND THAT DEFECT DOES NOT EXIST. THE WAIT READ TWO FIELDS THAT ARE NOT THERE (plan §52.45).** It
tested `(!x.learning && x.learned)` where `__flxDbg` publishes both under `x.auto`, so the
condition is `(!undefined && undefined) || false` — **`undefined`, which can never become true** —
and every run sat there for the whole of its `timeout: 5400000`. The 63 minutes was a TIMEOUT, not
a measurement. `test/_pagerate.mjs` commissions and learns in ONE page and reports samples/s for
each, which is the control §52.35's own load-bearing clause needed and never had: **one learn pass
is 22-29 s at ~4,000 samples/s in every configuration this suite puts the page in** — fresh page,
spf 600 with the run going, demo or full grade, periodic, the continuity instrument on — and in all
four it is FASTER per sample than the commissioning it follows. Two cheaper hypotheses were killed
first (rule 1): the rAF period, which is the hard ceiling at one yield per 150 samples, measures
30-37 ms for a ceiling of 4,400-4,900 samples/s; and the continuity instrument, which `smoke.mjs`
turns on and never off, costs 1.1x per step. Fixed, the timeout drops 90 minutes to 10, a new
assertion checks the click actually STARTED a learn — `startLearn`'s guard returns silently and the
button's enabled predicate is a different one — and the body is un-gated. FlowSim is now also
closed at the end of its own block and the hub page before FlexiSim opens, which is right on its own
terms and is NOT the cause. Rule 17 aimed at a test harness: a timeout is not a measurement, and
this one check has now failed silently three ways — a `SUITE=full` skip, an `if (canLearn)` race,
and a gate added to work around a number that was itself an artefact (rule 25).

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
| `lib/pilot/hff.js` | **HARMONIC FEEDFORWARD, and the module that made the method plant-agnostic (brick 67).** A repeating program has a repeating error, so invert the machine at the lap's own harmonics: probe, solve, and take a damped Newton step against a FROZEN operator. It carries NO per-plant constant. The harmonic COUNT is gone (the arm's 16 is where THAT channel dies; the servo axis is flat to h≈128 and the same 16 costs 33x there); the STEP backtracks (1.0 converges the axis on pass one and diverges the arm); and the PROBE DESIGN AND AMPLITUDE are chosen by commissioning four candidates and SCORING THEM ON THE MACHINE, because the fit ranks them backwards — on the axis the best-fitting candidate is the worst controller, and on the arm a 25%→10% probe is worth 3.1x while its residual moves the wrong way. Each harmonic's step is shrunk by CONFIDENCE (its own fit residual) and REACH (min(1,\|G\|), load-bearing: removed, the arm goes 4.81x → 1.05x; on the axis inert to four figures). **AND ON THE ARM IT NOW SHIPS A BANDED OPERATOR (bricks 72-76).** A correction at harmonic h moves the error at h±1, so the harmonics are identified and inverted TOGETHER rather than one at a time. Measured on probes it had never seen, a banded operator predicts this machine 40% better than a diagonal one (15.6% → 9.4%), and the advantage TRANSFERS to a program it was not fitted on (0.61 there against 0.60 at home) — so the operator is a plant model even though the table it builds is a memory. `exportOperator()` hands it on: a second program of the same lap pays for refinement only, 32 laps → 10. Neither shipped probe design could identify it — both hold the phase RELATIONSHIP between harmonics fixed, so the banded design matrix is collinear at ANY probe count, which is why brick 63's block-tridiagonal solve measured neutral twice over. Banded gets its own random-phase design and 3·mm+4 probes. Default OFF in the library and ON in the arm harness: it triples identification cost and only this arm's operator has been measured as banded. |
| `lib/pilot/distil.js` | **THE DISTILLED ITERATION, SHIPPED (plan §49).** Iteration converges to a correction indexed by LAP PHASE, which is worth less than nothing on a trajectory the machine has not run — measured at 0.53x-0.55x by three independent routes, one a textbook norm-optimal ILC. This regresses that converged correction onto a local window of the COMMANDED reference and deploys the regression: one weight vector per channel, no QP, no forecast bank, no tracker, no lap index, no per-plant constant, 330 MAC/decision at 111 features. The window MUST STRADDLE NOW and it refuses otherwise, because the matched control — same features, same span, same spacing, translated so no tap lies in the future — reads 0.89x against 1.43x. The fit STREAMS (`online`), one shared-covariance update per row at 2n²+nc·n and O(n²) state, validated PREQUENTIALLY. Its capacity gate is a pre-filter and says so: on a pure-noise target it still deploys about one commissioning in twelve, and the decision is a machine-scored verify. |
| `lib/pilot/stack.js` | **A CASCADE OF PILOTS, wired to the page as ⑤/⑥'s Cascade depth slider (brick 59).** Layer k is an ordinary Pilot commissioned with layers 1..k−1 deployed and FROZEN, so each models what the one below it left; a layer that cannot vouch for itself ends the stack, and the summed correction is clamped ONCE at the engineer's cap. Every layer above the first is PINNED to the first's cadence — one host, one look-ahead closure, one meaning for `act(off)` — and chooses its own Ts, horizon, lags, ridge and basis on top of it. |
| `lib/pilot/autostack.js` | **ONE BUTTON, and the answer it comes to is not the one this project would have predicted (brick 68).** Told the channels' maxes, the correction authority, what the instrument can RESOLVE, and optionally that the program repeats. Works out for itself: its timescale, whether each rung pays, how deep to cascade, and which prefix of the ladder to ship — every one by measuring on the machine. Order is conventional → pilot → harmonic and is not symmetric (the reverse measured 0.71×). On the EMPS axis it ships the CONVENTIONAL rung alone at 425× and refuses the other two: the pilot at 0.39× because the rung below already removed the velocity lag that is its whole benefit there, and the harmonic rung — which scored 25× better — because BOTH sides are below the rig's 1.6 µm fidelity and it declines to credit what its instrument cannot see. A first version without that floor reported **4254×**, which was the simulator. **AND ON THE SOFTEST 2R ARM IT SHIPS 22.42x, past the composite's re-measured 20.34x for that program (brick 76).** Getting there was four measurement repairs and two model changes: the rung reads the WHOLE tool error in JOINT space (narrowing it to the contour component cost half the benefit — the projection onto a rotating normal is itself a lap-varying operator); the floor is the MEDIAN of reported spreads, not the max, which was biased 3.9× high and refused improvements the machine could produce; the ceiling is measured on the CASCADE-DEPLOYED machine (3.44e-3 at nh 16) rather than the bare one; and every field the report prints from is asserted to exist, after six diagnostics in one day rendered a missing field as a plausible number. It also detects a PHASE WALK — a pilot cadence that does not divide the lap makes its phase walk, which is a beat at a half-integer harmonic the rung cannot represent; on the arm, cadence 9 against lap 7357 gave autocorrelation −0.764, and indexing from the lap start took it to −0.135 and the ladder from 20.70× to 22.42×. That last is measured on ONE plant: no other of the six deploys both rungs, so it is not yet a general claim. |
| `lib/pilot/classic.js` | **THE CONVENTIONAL LAYER, SELF-TUNED — and the best single rung on a real machine.** `[a, v, sign v, 1]` fitted ON the machine with the same probe → frozen-operator Newton → backtracking → monotone-guard machinery `hff.js` uses; only the BASIS differs, which is why they compose. EMPS: 0.5764 → 0.0014 mm, **425× in 14 laps**, past the inverse-dynamics feedforward at the PUBLISHED M/Fv/Fc/OF (275×). **And the coefficient is checkable:** the dominant one is 0.797 mm against the position loop's own vPeak/kp = 0.778 mm — it found the loop's lag term from data to 2.4%. **It is a MODEL, not a memory:** on a two-tone sine the axis has never run it is worth 169.8× evaluated live, while the IDENTICAL signal replayed as a lap table is 0.53× — worse than nothing, independently reproducing brick 56's 0.55× for a phase-indexed ILC table by another route. |
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
